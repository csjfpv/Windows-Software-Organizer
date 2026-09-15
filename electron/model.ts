import path from 'node:path';

export type TargetType = 'executable' | 'file' | 'folder' | 'url';

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface AppEntry {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  target: string;
  targetType: TargetType;
  args: string[];
  workingDirectory: string;
  iconPath: string;
  order: number;
  launchCount: number;
  lastLaunchedAt: string | null;
}

export interface AppConfig {
  version: 1;
  categories: Category[];
  apps: AppEntry[];
}

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_CATEGORIES = 100;
const MAX_APPS = 2000;
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0');
const optionalText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && !value.includes('\0');

export function emptyConfig(): AppConfig {
  return {
    version: 1,
    categories: [
      { id: 'favorites', name: '常用软件', order: 0 },
      { id: 'development', name: '开发工具', order: 1 },
      { id: 'utilities', name: '实用工具', order: 2 }
    ],
    apps: []
  };
}

export function validateConfig(value: unknown): AppConfig {
  if (!value || typeof value !== 'object') throw new Error('配置内容不是有效对象');
  const candidate = value as Partial<AppConfig>;
  if (candidate.version !== 1 || !Array.isArray(candidate.categories) || !Array.isArray(candidate.apps)) throw new Error('配置格式或版本不受支持');
  if (candidate.categories.length > MAX_CATEGORIES || candidate.apps.length > MAX_APPS) throw new Error('配置项目数量超过限制');
  const categoryIds = new Set<string>();
  const categoryNames = new Set<string>();
  const categories = candidate.categories.map((item, index) => {
    if (!item || !text(item.id, 100) || !text(item.name, 40)) throw new Error('分类信息不完整');
    const id = item.id.trim();
    const folded = item.name.trim().toLocaleLowerCase();
    if (categoryIds.has(id) || categoryNames.has(folded)) throw new Error('分类 ID 或名称重复');
    categoryIds.add(id); categoryNames.add(folded);
    return { id, name: item.name.trim(), order: index };
  });
  const appIds = new Set<string>();
  const allowedTypes = new Set<TargetType>(['executable', 'file', 'folder', 'url']);
  const apps = candidate.apps.map((item, index) => {
    if (!item || !text(item.id, 100) || !categoryIds.has(item.categoryId) || !text(item.name, 80) || !text(item.target, 2048) || !allowedTypes.has(item.targetType)) throw new Error('应用信息不完整');
    if (appIds.has(item.id)) throw new Error('应用 ID 重复');
    appIds.add(item.id);
    if (item.targetType === 'url') {
      let url: URL;
      try { url = new URL(item.target); } catch { throw new Error('网址格式无效'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只允许 HTTP 或 HTTPS 网址');
    } else {
      if (!path.win32.isAbsolute(item.target)) throw new Error('本地目标必须使用绝对路径');
      if (item.targetType === 'executable' && path.win32.extname(item.target).toLocaleLowerCase() !== '.exe') throw new Error('程序目标必须是 EXE 文件');
    }
    if (item.workingDirectory && !path.win32.isAbsolute(item.workingDirectory)) throw new Error('工作目录必须使用绝对路径');
    if (item.iconPath && !path.win32.isAbsolute(item.iconPath)) throw new Error('图标路径必须使用绝对路径');
    const args = Array.isArray(item.args) ? item.args : [];
    if (args.length > 50 || args.some((arg) => !optionalText(arg, 1000))) throw new Error('启动参数无效');
    return {
      id: item.id.trim(), categoryId: item.categoryId, name: item.name.trim(),
      description: optionalText(item.description, 160) ? item.description.trim() : '',
      target: item.target.trim(), targetType: item.targetType, args,
      workingDirectory: optionalText(item.workingDirectory, 2048) ? item.workingDirectory.trim() : '',
      iconPath: optionalText(item.iconPath, 2048) ? item.iconPath.trim() : '',
      order: Number.isFinite(item.order) ? item.order : index,
      launchCount: Number.isSafeInteger(item.launchCount) && item.launchCount >= 0 ? item.launchCount : 0,
      lastLaunchedAt: typeof item.lastLaunchedAt === 'string' ? item.lastLaunchedAt : null
    };
  });
  return { version: 1, categories, apps };
}

export function parseConfigJson(raw: string): AppConfig {
  if (Buffer.byteLength(raw, 'utf8') > MAX_CONFIG_BYTES) throw new Error('配置文件超过 2 MB 限制');
  return validateConfig(JSON.parse(raw));
}
