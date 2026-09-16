import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, OrganizerApi } from './types';
import { demoConfig } from './demo';
import App from './App';

afterEach(() => {
  cleanup();
  delete window.organizer;
});

const organizerMock = (overrides: Partial<OrganizerApi>): OrganizerApi => ({
  getConfig: vi.fn().mockResolvedValue(demoConfig), saveConfig: vi.fn().mockImplementation(async (value) => value), importConfig: vi.fn().mockResolvedValue(null), exportConfig: vi.fn().mockResolvedValue(false),
  pickTarget: vi.fn().mockResolvedValue(null), pickIcon: vi.fn().mockResolvedValue(null), getIcon: vi.fn().mockResolvedValue(null), launch: vi.fn().mockRejectedValue(new Error('not configured')), revealConfig: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

describe('软件启动台', () => {
  beforeEach(() => localStorage.clear());

  it('renders the categorized launcher shell', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: '全部应用' })).toBeInTheDocument();
    expect(screen.getByText('开发工具')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '搜索应用' })).toBeInTheDocument();
  });

  it('filters demo entries by search text', async () => {
    render(<App />);
    await screen.findByText('代码编辑器');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索应用' }), { target: { value: '示例项目' } });
    expect(screen.getByText('示例项目')).toBeInTheDocument();
    expect(screen.queryByText('代码编辑器')).not.toBeInTheDocument();
  });

  it('shows a retryable error when the local config cannot be recovered', async () => {
    window.organizer = organizerMock({ getConfig: vi.fn().mockRejectedValue(new Error('配置文件损坏')) });
    render(<App />);
    expect(await screen.findByRole('heading', { name: '无法读取配置' })).toBeInTheDocument();
    expect(screen.getByText('配置文件损坏')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(window.organizer!.getConfig).toHaveBeenCalledTimes(2));
  });

  it('resets filters without resolving icons when an import reuses an entry ID', async () => {
    const initial: AppConfig = { version: 1, categories: [{ id: 'old', name: '旧分类', order: 0 }], apps: [{ id: 'same', categoryId: 'old', name: '旧项目', description: '', target: String.raw`C:\Old\App.exe`, targetType: 'executable', args: [], workingDirectory: '', iconPath: '', iconLookupAllowed: true, order: 0, launchCount: 0, lastLaunchedAt: null }] };
    const imported: AppConfig = { version: 1, categories: [{ id: 'new', name: '新分类', order: 0 }], apps: [{ ...initial.apps[0], categoryId: 'new', name: '新项目', target: String.raw`D:\New\App.exe`, iconLookupAllowed: false }] };
    const getIcon = vi.fn().mockResolvedValue('data:image/png;base64,AA==');
    window.organizer = organizerMock({ getConfig: vi.fn().mockResolvedValue(initial), importConfig: vi.fn().mockResolvedValue(imported), getIcon });
    render(<App />);
    await screen.findByText('旧项目');
    fireEvent.click(screen.getByRole('button', { name: /旧分类/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索应用' }), { target: { value: '旧项目' } });
    fireEvent.click(screen.getByTitle('导入配置'));
    expect(await screen.findByText('新项目')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '全部应用' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '搜索应用' })).toHaveValue('');
    await waitFor(() => expect(getIcon).toHaveBeenCalledTimes(1));
  });
});
