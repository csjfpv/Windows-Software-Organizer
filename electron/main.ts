import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigStore } from './store';
import { AppEntry, AppConfig, distrustImportedIcons, TargetType, validateConfig } from './model';
import { executeManagedMove, ManagedPlan, MoveJournalStore, planManagedMove, recoveryAction } from './managed-storage';

const execFileAsync = promisify(execFile);
type DiscoveredApp = { name: string; target: string; workingDirectory: string };
type ResolvedPath = { name: string; target: string; targetType: Exclude<TargetType, 'url'>; workingDirectory: string };
import { readConfigFile, writeConfigFile } from './config-file';

let mainWindow: BrowserWindow | null = null;
let store: ConfigStore;
let moveJournal: MoveJournalStore;
let userDataPath = '';
let moveInProgress = false;
let configMutationQueue: Promise<void> = Promise.resolve();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 620,
    backgroundColor: '#f4f6f8',
    title: '软件启动台',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.VITE_DEV_SERVER_URL;
    const isDevPage = Boolean(devServer && url.startsWith(devServer));
    const isPackagedPage = !devServer && url.startsWith('file:') && decodeURIComponent(url).replace(/\\/g, '/').endsWith('/dist/index.html');
    if (!isDevPage && !isPackagedPage) event.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

async function discoverStartMenuApps(): Promise<DiscoveredApp[]> {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$roots = @((Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'), (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')) | Where-Object { Test-Path $_ }",
    '$shell = New-Object -ComObject WScript.Shell',
    "$items = foreach ($link in ($roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -File -Recurse } | Select-Object -First 600)) {",
    '  $shortcut = $shell.CreateShortcut($link.FullName); $target = $shortcut.TargetPath; $leaf = [IO.Path]::GetFileName($target)',
    "  $name = [IO.Path]::GetFileNameWithoutExtension($link.Name); $work = $shortcut.WorkingDirectory; if ($target -and [IO.Path]::GetExtension($target).ToLowerInvariant() -eq '.exe' -and [IO.File]::Exists($target) -and $leaf -notmatch '^(unins|uninstall|update|updater|setup|installer|crash|helper|elevate)' -and $name -notmatch '(?i)(卸载|uninstall|update|updater|setup|installer)') { if ($work -notmatch '^[A-Za-z]:\\') { $work = '' }; [pscustomobject]@{ name = $name; target = $target; workingDirectory = $work } }",
    '}',
    '$items | Sort-Object target -Unique | ConvertTo-Json -Compress'
  ].join("`n");
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 1024 * 1024 });
  if (!stdout.trim()) return [];
  const raw: unknown = JSON.parse(stdout);
  const values = Array.isArray(raw) ? raw : [raw];
  return values.filter((item): item is DiscoveredApp => Boolean(item) && typeof item === 'object' && typeof (item as DiscoveredApp).name === 'string' && typeof (item as DiscoveredApp).target === 'string' && typeof (item as DiscoveredApp).workingDirectory === 'string')
    .map((item) => ({ name: item.name.trim().slice(0, 80), target: item.target.trim(), workingDirectory: item.workingDirectory.trim() }))
    .filter((item) => item.name && /^[a-zA-Z]:\\/.test(item.target) && /\.exe$/i.test(item.target))
    .slice(0, 300);
}

async function resolveLocalPath(value: unknown): Promise<ResolvedPath> {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('路径无效');
  const source = value.trim().replace(/^"|"$/g, '');
  if (!/^[a-zA-Z]:[\\/]/.test(source)) throw new Error('请选择本机磁盘中的路径');
  const target = path.resolve(source);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) throw new Error('路径不存在或无法访问');
  const targetType: Exclude<TargetType, 'url'> = stat.isDirectory() ? 'folder' : path.extname(target).toLocaleLowerCase() === '.exe' ? 'executable' : 'file';
  const base = path.basename(target);
  const name = targetType === 'executable' ? base.replace(/\.exe$/i, '') : base;
  if (!name) throw new Error('无法识别路径名称');
  return { name: name.slice(0, 80), target, targetType, workingDirectory: targetType === 'executable' ? path.dirname(target) : '' };
}

async function managedRoot() {
  const settingsFile = path.join(userDataPath, 'managed-storage.json');
  try {
    const value = JSON.parse(await fs.readFile(settingsFile, 'utf8')) as { root?: unknown };
    if (typeof value.root === 'string' && /^[a-zA-Z]:[\\/]/.test(value.root)) return path.resolve(value.root);
  } catch { /* default below */ }
  return path.join(path.parse(app.getPath('home')).root, '软件启动台');
}

async function saveManagedRoot(root: string) {
  const settingsFile = path.join(userDataPath, 'managed-storage.json');
  const temporary = settingsFile + '.tmp';
  await fs.writeFile(temporary, JSON.stringify({ root }, null, 2), 'utf8');
  await fs.rm(settingsFile, { force: true });
  await fs.rename(temporary, settingsFile);
}

type ProcessPath = { name: string; executablePath: string };
async function processPaths(): Promise<ProcessPath[]> {
  const script = "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | Select-Object @{n='name';e={$_.Name}},@{n='executablePath';e={$_.ExecutablePath}} | ConvertTo-Json -Compress";
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 512 * 1024 });
    if (!stdout.trim()) return [];
    const raw: unknown = JSON.parse(stdout); const values = Array.isArray(raw) ? raw : [raw];
    return values.filter((item): item is ProcessPath => Boolean(item) && typeof item === 'object' && typeof (item as ProcessPath).name === 'string' && typeof (item as ProcessPath).executablePath === 'string');
  } catch { throw new Error('无法确认相关程序是否仍在运行，请稍后重试'); }
}
function processesWithin(sourceRoot: string, processes: ProcessPath[]) {
  const root = path.resolve(sourceRoot).toLocaleLowerCase();
  return [...new Set(processes.filter((item) => { const executable = path.resolve(item.executablePath).toLocaleLowerCase(); return executable === root || executable.startsWith(root + path.sep); }).map((item) => item.name))];
}
async function runningProcesses(sourceRoot: string): Promise<string[]> { return processesWithin(sourceRoot, await processPaths()); }

async function previewMove(target: string, targetType: Exclude<TargetType, 'url'>, categoryName: string) {
  const plan = await planManagedMove({ target, targetType, categoryName, managedRoot: await managedRoot(), preserveWebCoding: /web 编程|vibe coding/i.test(categoryName) });
  return { ...plan, runningProcesses: plan.eligible ? await runningProcesses(plan.sourceRoot) : [] };
}

function relocatedEntry(entry: AppEntry, plan: ManagedPlan): AppEntry {
  const iconRelative = entry.iconPath ? path.relative(plan.sourceRoot, entry.iconPath) : '';
  const iconPath = entry.iconPath && iconRelative && !iconRelative.startsWith('..') && !path.isAbsolute(iconRelative)
    ? path.join(plan.destination, iconRelative) : entry.iconPath;
  return { ...entry, target: plan.resultingTarget, targetType: plan.resultingType, workingDirectory: plan.workingDirectory, iconPath };
}

async function withConfigMutationLock<T>(action: () => Promise<T>): Promise<T> {
  const previous = configMutationQueue;
  let release!: () => void;
  configMutationQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await action(); }
  finally { release(); }
}

async function assertNoActiveMove() {
  if (moveInProgress || await moveJournal.load()) throw new Error('收纳任务处理中，暂时不能修改启动台配置');
}

async function transactMove(originalConfig: AppConfig, nextConfig: AppConfig, plan: ManagedPlan) {
  return withConfigMutationLock(() => transactMoveLocked(originalConfig, nextConfig, plan));
}

async function transactMoveLocked(originalConfig: AppConfig, nextConfig: AppConfig, plan: ManagedPlan) {
  await assertNoActiveMove();
  moveInProgress = true;
  try {
    const active = await runningProcesses(plan.sourceRoot);
    if (active.length) throw new Error('请先正常关闭这些程序后重试：' + active.join('、'));
    const journal = { id: randomUUID(), phase: 'prepared' as const, plan, originalConfig, nextConfig, createdAt: new Date().toISOString() };
    await moveJournal.save(journal);
    let operation;
    try { operation = await executeManagedMove(plan); }
    catch (error) { await moveJournal.clear().catch(() => undefined); throw error; }
    try {
      await moveJournal.save({ ...journal, phase: 'moved' });
      await moveJournal.save({ ...journal, phase: 'config-commit-intent' });
      const saved = await store.save(nextConfig);
      await moveJournal.save({ ...journal, phase: 'config-saved' });
      try {
        await operation.commit();
        await moveJournal.save({ ...journal, phase: 'completed' });
        await moveJournal.clear();
        return saved;
      } catch (error) {
        throw new Error('入口已更新到新位置，旧副本尚未完成处理。请打开启动台恢复该事务：' + (error instanceof Error ? error.message : '未知错误'));
      }
    } catch (error) {
      const phase = await moveJournal.load().then((value) => value?.phase).catch(() => null);
      if (phase === 'config-commit-intent' || phase === 'config-saved' || phase === 'completed') throw error;
      await operation.rollback().catch(() => undefined);
      await store.save(originalConfig).catch(() => undefined);
      await moveJournal.clear().catch(() => undefined);
      throw error;
    }
  } finally { moveInProgress = false; }
}

async function recoverMove() {
  const journal = await moveJournal.load();
  if (!journal) return;
  const root = path.resolve(await managedRoot());
  const destination = path.resolve(journal.plan.destination);
  const allowedBuckets = new Set(['应用本体', '项目源码', '项目产出软件', '资料']);
  const relative = path.relative(root, destination);
  if (!allowedBuckets.has(journal.plan.bucket) || !relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('迁移日志中的目标路径无效，请打开配置目录检查日志');
  const destinationExists = Boolean(await fs.stat(journal.plan.destination).catch(() => null));
  const sourceExists = Boolean(await fs.stat(journal.plan.sourceRoot).catch(() => null));
  const action = recoveryAction(journal.phase, destinationExists);
  if (action === 'manual-intervention') throw new Error('迁移已提交但新位置缺失；为防止覆盖数据，启动台不会自动恢复，请检查事务记录');
  if (action === 'resume-committed') {
    await store.save(journal.nextConfig);
    if (sourceExists && journal.plan.crossVolume) {
      const retired = journal.plan.sourceRoot + '.启动台迁移旧副本';
      if (await fs.stat(retired).catch(() => null)) throw new Error('迁移已提交，但旧副本位置已存在；请打开配置目录检查事务记录');
      await fs.rename(journal.plan.sourceRoot, retired);
    }
    await moveJournal.clear();
    return;
  }
  if (destinationExists && !sourceExists) await fs.rename(journal.plan.destination, journal.plan.sourceRoot);
  else if (destinationExists && sourceExists) throw new Error('未提交事务同时存在源位置和目标位置；为防止删除无关数据，启动台不会自动处理，请检查事务记录');
  await store.save(journal.originalConfig);
  await moveJournal.clear();
}
async function currentEntry(id: unknown): Promise<{ config: AppConfig; entry: AppEntry }> {
  if (typeof id !== 'string' || id.length > 100) throw new Error('应用 ID 无效');
  const config = await store.load();
  const entry = config.apps.find((appItem) => appItem.id === id);
  if (!entry) throw new Error('没有找到这个应用');
  return { config, entry };
}

async function launchEntry(entry: AppEntry) {
  if (entry.targetType === 'url') {
    const url = new URL(entry.target);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('不允许打开这种网址');
    await shell.openExternal(url.toString()); return;
  }
  const target = path.resolve(entry.target);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) throw new Error('目标不存在或无法访问');
  if (entry.targetType === 'folder') {
    if (!stat.isDirectory()) throw new Error('目标不是文件夹');
    const result = await shell.openPath(target); if (result) throw new Error(result); return;
  }
  if (entry.targetType === 'file') {
    if (!stat.isFile()) throw new Error('目标不是文件');
    const result = await shell.openPath(target); if (result) throw new Error(result); return;
  }
  if (!stat.isFile()) throw new Error('程序目标不是文件');
  let cwd = path.dirname(target);
  if (entry.workingDirectory) {
    const workStat = await fs.stat(entry.workingDirectory).catch(() => null);
    if (!workStat?.isDirectory()) throw new Error('工作目录不存在');
    cwd = entry.workingDirectory;
  }
  const child = spawn(target, entry.args, { cwd, detached: true, stdio: 'ignore', shell: false, windowsHide: false });
  child.unref();
}

app.whenReady().then(async () => {
  userDataPath = app.getPath('userData');
  store = new ConfigStore(userDataPath);
  moveJournal = new MoveJournalStore(path.join(userDataPath, 'managed-move-journal.json'));
  await recoverMove();
  ipcMain.handle('config:get', () => store.load());
  ipcMain.handle('config:save', async (_event, config) => withConfigMutationLock(async () => { await assertNoActiveMove(); return store.save(config); }));
  ipcMain.handle('config:path', () => store.configPath());
  ipcMain.handle('apps:discover-start-menu', () => discoverStartMenuApps());
  ipcMain.handle('path:resolve', (_event, value: unknown) => resolveLocalPath(value));
  ipcMain.handle('managed:root:get', () => managedRoot());
  ipcMain.handle('managed:root:choose', async () => withConfigMutationLock(async () => {
    await assertNoActiveMove();
    const result = await dialog.showOpenDialog(mainWindow!, { title: '选择启动台统一收纳目录', defaultPath: await managedRoot(), properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const root = path.resolve(result.filePaths[0]);
    await fs.mkdir(root, { recursive: true }); await saveManagedRoot(root); return root;
  }));
  ipcMain.handle('managed:preview', async (_event, item: unknown, categoryName: unknown) => {
    if (!item || typeof item !== 'object' || typeof categoryName !== 'string') throw new Error('收纳预检参数无效');
    const value = item as Partial<ResolvedPath>;
    if (typeof value.target !== 'string' || !['executable', 'file', 'folder'].includes(value.targetType ?? '')) throw new Error('收纳目标无效');
    return previewMove(value.target, value.targetType as Exclude<TargetType, 'url'>, categoryName.slice(0, 40));
  });
  ipcMain.handle('managed:add', async (_event, rawEntry: unknown, _categoryName: unknown) => {
    return withConfigMutationLock(async () => {
    const original = await store.load();
    const candidate = validateConfig({ ...original, apps: [...original.apps, rawEntry] });
    const entry = candidate.apps.at(-1)!;
    if (original.apps.some((item) => item.id === entry.id || item.target.toLocaleLowerCase() === entry.target.toLocaleLowerCase())) throw new Error('入口 ID 或目标已存在');
    if (entry.targetType === 'url') throw new Error('网页入口不能移动');
    const categoryName = original.categories.find((category) => category.id === entry.categoryId)?.name;
    if (!categoryName) throw new Error('入口分类不存在');
    const plan = await planManagedMove({ target: entry.target, targetType: entry.targetType, categoryName, managedRoot: await managedRoot(), preserveWebCoding: /web 编程|vibe coding/i.test(categoryName) });
    if (!plan.eligible) throw new Error(plan.reason);
    const next = validateConfig({ ...original, apps: [...original.apps, relocatedEntry(entry, plan)] });
    return transactMoveLocked(original, next, plan);
    });
  });
  ipcMain.handle('managed:preview-existing', async () => {
    const config = await store.load(); const processes = await processPaths(); const root = await managedRoot(); const result = [];
    for (const entry of config.apps.filter((item) => item.targetType !== 'url')) {
      const categoryName = config.categories.find((category) => category.id === entry.categoryId)?.name ?? '';
      const plan = await planManagedMove({ target: entry.target, targetType: entry.targetType as Exclude<TargetType, 'url'>, categoryName, managedRoot: root, preserveWebCoding: /web 编程|vibe coding/i.test(categoryName) });
      result.push({ entryId: entry.id, entryName: entry.name, plan: { ...plan, runningProcesses: plan.eligible ? processesWithin(plan.sourceRoot, processes) : [] } });
    }
    return result;
  });
  ipcMain.handle('managed:move-existing', async (_event, id: unknown) => withConfigMutationLock(async () => {
    const { config: original, entry } = await currentEntry(id);
    if (entry.targetType === 'url') throw new Error('网页入口不能移动');
    const categoryName = original.categories.find((category) => category.id === entry.categoryId)?.name ?? '';
    const plan = await planManagedMove({ target: entry.target, targetType: entry.targetType, categoryName, managedRoot: await managedRoot(), preserveWebCoding: /web 编程|vibe coding/i.test(categoryName) });
    if (!plan.eligible) throw new Error(plan.reason);
    const next = validateConfig({ ...original, apps: original.apps.map((item) => item.id === entry.id ? relocatedEntry(item, plan) : item) });
    return transactMoveLocked(original, next, plan);
  }));
  ipcMain.handle('config:import', async () => withConfigMutationLock(async () => {
    await assertNoActiveMove();
    const result = await dialog.showOpenDialog(mainWindow!, { title: '导入配置', properties: ['openFile'], filters: [{ name: 'JSON 配置', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const imported = await readConfigFile(result.filePaths[0]);
    return store.save(distrustImportedIcons(imported));
  }));
  ipcMain.handle('config:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, { title: '导出配置', defaultPath: 'windows-software-organizer.json', filters: [{ name: 'JSON 配置', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    await writeConfigFile(result.filePath, await store.load()); return true;
  });
  ipcMain.handle('config:reveal', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('picker:target', async (_event, type: TargetType) => {
    if (!['executable', 'file', 'folder'].includes(type)) throw new Error('选择类型无效');
    const properties: ('openFile' | 'openDirectory')[] = type === 'folder' ? ['openDirectory'] : ['openFile'];
    const filters = type === 'executable' ? [{ name: 'Windows 程序', extensions: ['exe'] }] : undefined;
    const result = await dialog.showOpenDialog(mainWindow!, { title: type === 'folder' ? '选择文件夹' : '选择目标', properties, filters });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('picker:icon', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: '选择图标', properties: ['openFile'], filters: [{ name: '图标或图片', extensions: ['ico', 'png', 'jpg', 'jpeg', 'exe'] }] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('icon:get', async (_event, id: unknown) => {
    const { entry } = await currentEntry(id);
    if (entry.iconLookupAllowed !== true) return null;
    try {
      if (entry.iconPath) { const image = nativeImage.createFromPath(entry.iconPath); if (!image.isEmpty()) return image.resize({ width: 64, height: 64 }).toDataURL(); }
      if (entry.targetType !== 'url') return (await app.getFileIcon(entry.target, { size: 'large' })).toDataURL();
    } catch { /* renderer uses fallback */ }
    return null;
  });
  ipcMain.handle('launcher:launch', async (_event, id: unknown) => withConfigMutationLock(async () => {
    await assertNoActiveMove();
    const { config, entry } = await currentEntry(id);
    await launchEntry(entry);
    entry.launchCount += 1; entry.lastLaunchedAt = new Date().toISOString();
    await store.save(config); return { launchCount: entry.launchCount, lastLaunchedAt: entry.lastLaunchedAt };
  }));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
