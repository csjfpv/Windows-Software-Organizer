import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConfigStore } from './store';
import { AppEntry, AppConfig, TargetType, parseConfigJson } from './model';

let mainWindow: BrowserWindow | null = null;
let store: ConfigStore;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 620,
    backgroundColor: '#f4f6f8',
    title: 'Windows软件整理工具',
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
  ipcMain.handle('config:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: '导入配置', properties: ['openFile'], filters: [{ name: 'JSON 配置', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const imported = parseConfigJson(await fs.readFile(result.filePaths[0], 'utf8'));
    return store.save(imported);
  });
  ipcMain.handle('config:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, { title: '导出配置', defaultPath: 'windows-software-organizer.json', filters: [{ name: 'JSON 配置', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, JSON.stringify(await store.load(), null, 2), 'utf8'); return true;
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
