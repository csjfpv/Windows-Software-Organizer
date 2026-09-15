import type { AppConfig } from './types';
export const demoConfig: AppConfig = {
  version: 1,
  categories: [
    { id: 'favorites', name: '常用软件', order: 0 },
    { id: 'development', name: '开发工具', order: 1 },
    { id: 'utilities', name: '实用工具', order: 2 },
    { id: 'projects', name: '项目入口', order: 3 }
  ],
  apps: [
    { id: 'demo-code', categoryId: 'development', name: '代码编辑器', description: '添加你常用的编辑器', target: String.raw`C:\Path\To\Editor.exe`, targetType: 'executable', args: [], workingDirectory: '', iconPath: '', order: 0, launchCount: 8, lastLaunchedAt: null },
    { id: 'demo-docs', categoryId: 'projects', name: '示例项目', description: '打开本地项目目录', target: String.raw`C:\Path\To\Project`, targetType: 'folder', args: [], workingDirectory: '', iconPath: '', order: 0, launchCount: 3, lastLaunchedAt: null },
    { id: 'demo-web', categoryId: 'utilities', name: '项目主页', description: '打开公开项目页面', target: 'https://github.com/csjfpv/Windows-Software-Organizer', targetType: 'url', args: [], workingDirectory: '', iconPath: '', order: 0, launchCount: 1, lastLaunchedAt: null }
  ]
};
