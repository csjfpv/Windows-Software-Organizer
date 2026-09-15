import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';

afterEach(cleanup);

describe('Windows软件整理工具', () => {
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
});
