import { describe, expect, it } from 'vitest';
import { emptyConfig, validateConfig } from './model';

const validApp = {
  id: 'app-1', categoryId: 'favorites', name: '示例', description: '',
  target: String.raw`C:\Path\To\App.exe`, targetType: 'executable' as const,
  args: [], workingDirectory: '', iconPath: '', order: 0,
  launchCount: 0, lastLaunchedAt: null
};

describe('configuration validation', () => {
  it('accepts a normalized local application config', () => {
    const config = emptyConfig();
    const result = validateConfig({ ...config, apps: [validApp] });
    expect(result.apps[0].targetType).toBe('executable');
  });

  it('rejects executable URL schemes', () => {
    const config = emptyConfig();
    expect(() => validateConfig({ ...config, apps: [{ ...validApp, targetType: 'url', target: 'javascript:alert(1)' }] })).toThrow('只允许 HTTP 或 HTTPS');
  });

  it('rejects duplicate category names case-insensitively', () => {
    const config = emptyConfig();
    expect(() => validateConfig({ ...config, categories: [{ id: 'a', name: 'Tools', order: 0 }, { id: 'b', name: 'tools', order: 1 }] })).toThrow('分类 ID 或名称重复');
  });

  it('rejects NUL bytes in launch arguments', () => {
    const config = emptyConfig();
    expect(() => validateConfig({ ...config, apps: [{ ...validApp, args: ['ok', 'bad\0value'] }] })).toThrow('启动参数无效');
  });

  it('rejects relative local targets', () => {
    const config = emptyConfig();
    expect(() => validateConfig({ ...config, apps: [{ ...validApp, target: '.\\App.exe' }] })).toThrow('本地目标必须使用绝对路径');
  });

  it('rejects non-EXE executable targets', () => {
    const config = emptyConfig();
    expect(() => validateConfig({ ...config, apps: [{ ...validApp, target: String.raw`C:\Path\run.cmd` }] })).toThrow('程序目标必须是 EXE 文件');
  });
});
