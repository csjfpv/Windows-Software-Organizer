import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConfigStore } from './store';
import { AppEntry, AppConfig, distrustImportedIcons, TargetType } from './model';

const execFileAsync = promisify(execFile);
type DiscoveredApp = { name: string; target: string; workingDirectory: string };
type ResolvedPath = { name: string; target: string; targetType: Exclude<TargetType, 'url'>; workingDirectory: string };
import { readConfigFile, writeConfigFile } from './config-file';

let mainWindow: BrowserWindow | null = null;
let store: ConfigStore;

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

app.whenReady().then(() => {
  store = new ConfigStore(app.getPath('userData'));
  ipcMain.handle('config:get', () => store.load());
  ipcMain.handle('config:save', (_event, config) => store.save(config));
  ipcMain.handle('config:path', () => store.configPath());
  ipcMain.handle('apps:discover-start-menu', () => discoverStartMenuApps());
  ipcMain.handle('path:resolve', (_event, value: unknown) => resolveLocalPath(value));
  ipcMain.handle('config:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: '导入配置', properties: ['openFile'], filters: [{ name: 'JSON 配置', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const imported = await readConfigFile(result.filePaths[0]);
    return store.save(distrustImportedIcons(imported));
  });
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
  ipcMain.handle('launcher:launch', async (_event, id: unknown) => {
    const { config, entry } = await currentEntry(id);
    await launchEntry(entry);
    entry.launchCount += 1; entry.lastLaunchedAt = new Date().toISOString();
    await store.save(config); return { launchCount: entry.launchCount, lastLaunchedAt: entry.lastLaunchedAt };
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
