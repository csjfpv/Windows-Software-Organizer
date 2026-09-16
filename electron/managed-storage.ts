import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TargetType } from './model';

export type ManagedPlan = {
  eligible: boolean;
  reason: string;
  source: string;
  sourceRoot: string;
  destinationRoot: string;
  destination: string;
  resultingTarget: string;
  resultingType: Exclude<TargetType, 'url'>;
  workingDirectory: string;
  bucket: string;
  crossVolume: boolean;
};

const blockedNames = /^(unins|uninstall|update|updater|setup|installer|crash|helper|elevate)/i;
const sensitiveDirectory = /(^|[\\/])(firmware|固件|backup|backups|备份|logs?|日志|calibration|校准|dumps?|读回|credentials?|密钥|secrets?)([\\/]|$)/i;
const normalized = (value: string) => path.resolve(value).replace(/[\/]+$/, '').toLocaleLowerCase();
const within = (candidate: string, root: string) => {
  const value = normalized(candidate); const base = normalized(root);
  return value === base || value.startsWith(base + path.sep.toLocaleLowerCase());
};

function protectedRoots() {
  return [process.env.WINDIR, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData, process.env.APPDATA, process.env.LOCALAPPDATA]
    .filter((value): value is string => Boolean(value));
}

function broadRoots() {
  return [path.parse(os.homedir()).root, os.homedir(), path.join(os.homedir(), 'Desktop'), path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'Downloads')];
}

function bucketFor(categoryName: string, targetType: Exclude<TargetType, 'url'>) {
  if (/项目产出/.test(categoryName)) return '项目产出软件';
  if (/项目|源码/.test(categoryName)) return '项目源码';
  if (/SDK|说明|资料|文档/.test(categoryName) || targetType === 'file') return '资料';
  return '应用本体';
}

async function primaryExecutable(sourceRoot: string) {
  const children = await fs.readdir(sourceRoot, { withFileTypes: true });
  const executables = children.filter((item) => item.isFile() && /\.exe$/i.test(item.name) && !blockedNames.test(item.name));
  return executables.length === 1 ? executables[0].name : null;
}

export async function planManagedMove(input: { target: string; targetType: Exclude<TargetType, 'url'>; categoryName: string; managedRoot: string; preserveWebCoding?: boolean }): Promise<ManagedPlan> {
  const target = path.resolve(input.target);
  const managedRoot = path.resolve(input.managedRoot);
  const sourceStat = await fs.stat(target).catch(() => null);
  const sourceLinkStat = await fs.lstat(target).catch(() => null);
  const sourceRoot = input.targetType === 'executable' ? path.dirname(target) : target;
  const sourceRootLinkStat = await fs.lstat(sourceRoot).catch(() => null);
  const bucket = bucketFor(input.categoryName, input.targetType);
  const destinationRoot = path.join(managedRoot, bucket);
  const destination = path.join(destinationRoot, path.basename(sourceRoot));
  const base = { source: target, sourceRoot, destinationRoot, destination, resultingTarget: destination, resultingType: input.targetType, workingDirectory: '', bucket, crossVolume: path.parse(sourceRoot).root.toLocaleLowerCase() !== path.parse(destination).root.toLocaleLowerCase() };
  const deny = (reason: string): ManagedPlan => ({ ...base, eligible: false, reason });
  if (!sourceStat || !sourceLinkStat || !sourceRootLinkStat) return deny('源路径不存在或无法访问');
  if (sourceLinkStat.isSymbolicLink() || sourceRootLinkStat.isSymbolicLink()) return deny('第一版不移动符号链接或目录联接点，请选择真实目录');
  if (!/^[a-zA-Z]:[\\/]/.test(target)) return deny('第一版只支持普通本机盘符路径');
  if (input.preserveWebCoding || /web 编程|vibe coding|ai 编程/i.test(input.categoryName)) return deny('Web Coding / AI 编程内容按规则保留原位');
  if (sensitiveDirectory.test(sourceRoot)) return deny('固件、读回、备份、日志、校准或密钥目录属于敏感数据，不能由启动台移动');
  if (protectedRoots().some((root) => within(sourceRoot, root))) return deny('这是安装器或系统管理的位置，直接移动可能破坏更新、卸载、服务或驱动');
  if (broadRoots().some((root) => normalized(sourceRoot) === normalized(root))) return deny('所选范围过大，请选择具体的软件或项目文件夹');
  if (within(managedRoot, sourceRoot)) return deny('收纳目录不能放在源目录内部');
  if (within(sourceRoot, managedRoot)) return deny('该内容已经位于启动台收纳目录');
  if (await fs.stat(destination).catch(() => null)) return deny('目标位置已有同名内容，请先处理名称冲突');
  if (await fs.stat(sourceRoot + '.启动台迁移旧副本').catch(() => null)) return deny('源位置存在上次迁移留下的旧副本，请先确认并处理');
  if (input.targetType === 'executable') {
    const entries = await fs.readdir(sourceRoot).catch(() => []);
    const markers = new Set(entries.map((item) => item.toLocaleLowerCase()));
    const projectMarkers = ['.git', 'src', 'node_modules', 'package.json', 'pyproject.toml', 'platformio.ini', 'firmware', 'backups', 'logs'];
    if (entries.length > 80 || projectMarkers.some((marker) => markers.has(marker))) return deny('程序位于项目或混合资料目录，不能把整个父目录当作便携软件移动；请选择真正的软件文件夹');
    base.resultingTarget = path.join(destination, path.basename(target));
    base.workingDirectory = destination;
  } else if (input.targetType === 'folder') {
    const primary = await primaryExecutable(sourceRoot).catch(() => null);
    if (primary && !/项目|源码|资料|文档/.test(input.categoryName)) {
      base.resultingTarget = path.join(destination, primary);
      base.resultingType = 'executable';
      base.workingDirectory = destination;
    } else base.resultingTarget = destination;
  } else base.resultingTarget = destination;
  return { ...base, eligible: true, reason: base.crossVolume ? '将复制并校验后删除原位置' : '将在同一磁盘内安全移动' };
}

async function rejectLinks(root: string): Promise<void> {
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) throw new Error('内容包含符号链接或目录联接点，第一版拒绝移动');
  if (!stat.isDirectory()) return;
  for (const item of await fs.readdir(root)) await rejectLinks(path.join(root, item));
}

async function measure(root: string): Promise<{ files: number; bytes: number }> {
  const linkStat = await fs.lstat(root);
  if (linkStat.isSymbolicLink()) throw new Error('内容包含符号链接或目录联接点，第一版拒绝移动');
  const stat = await fs.stat(root);
  if (stat.isFile()) return { files: 1, bytes: stat.size };
  let files = 0; let bytes = 0;
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    const child = await measure(path.join(root, item.name)); files += child.files; bytes += child.bytes;
  }
  return { files, bytes };
}

export async function executeManagedMove(plan: ManagedPlan): Promise<{ rollback(): Promise<void>; commit(): Promise<void> }> {
  if (!plan.eligible) throw new Error(plan.reason);
  await rejectLinks(plan.sourceRoot);
  await fs.mkdir(plan.destinationRoot, { recursive: true });
  if (!plan.crossVolume) {
    await fs.rename(plan.sourceRoot, plan.destination);
    return { rollback: () => fs.rename(plan.destination, plan.sourceRoot), commit: async () => undefined };
  }
  const staging = plan.destination + '.启动台迁移中';
  await fs.rm(staging, { recursive: true, force: true });
  await fs.cp(plan.sourceRoot, staging, { recursive: true, errorOnExist: true, force: false });
  const [before, after] = await Promise.all([measure(plan.sourceRoot), measure(staging)]);
  if (before.files !== after.files || before.bytes !== after.bytes) { await fs.rm(staging, { recursive: true, force: true }); throw new Error('复制校验失败，原文件保持不变'); }
  await fs.rename(staging, plan.destination);
  return {
    rollback: async () => { await fs.rm(plan.destination, { recursive: true, force: true }); },
    commit: async () => {
      const retired = plan.sourceRoot + '.启动台迁移旧副本';
      await fs.rename(plan.sourceRoot, retired);
      await fs.rm(retired, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}

export type MoveJournal = {
  id: string;
  phase: 'prepared' | 'moved' | 'config-saved' | 'completed';
  plan: ManagedPlan;
  originalConfig: unknown;
  nextConfig: unknown;
  createdAt: string;
};

export class MoveJournalStore {
  private readonly backup: string;
  constructor(private readonly file: string) { this.backup = file + '.previous'; }
  async load(): Promise<MoveJournal | null> {
    try { return JSON.parse(await fs.readFile(this.file, 'utf8')) as MoveJournal; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { return JSON.parse(await fs.readFile(this.backup, 'utf8')) as MoveJournal; }
      catch (backupError) { if ((backupError as NodeJS.ErrnoException).code === 'ENOENT') return null; throw backupError; }
    }
  }
  async save(value: MoveJournal) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
    await fs.rm(this.backup, { force: true });
    try { await fs.rename(this.file, this.backup); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await fs.rename(temporary, this.file);
  }
  async clear() { await fs.rm(this.backup, { force: true }); await fs.rm(this.file, { force: true }); }
}
