import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executeManagedMove, MoveJournalStore, planManagedMove, recoveryAction, validateJournal } from './managed-storage';

const describeWindows = process.platform === 'win32' ? describe : describe.skip;
const roots: string[] = [];
async function fixture() {
  const root = path.join(path.parse(os.homedir()).root, 'dsh-managed-storage-test-' + crypto.randomUUID());
  roots.push(root); await fs.mkdir(root, { recursive: true }); return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describeWindows('managed storage', () => {
  it('keeps Web Coding projects in their original location', async () => {
    const root = await fixture(); const source = path.join(root, 'web-project'); await fs.mkdir(source);
    const plan = await planManagedMove({ target: source, targetType: 'folder', categoryName: 'Web 编程', managedRoot: path.join(root, '启动台') });
    expect(plan.eligible).toBe(false); expect(plan.reason).toContain('保留原位');
  });

  it('keeps sensitive firmware and backup directories in place', async () => {
    const root = await fixture(); const source = path.join(root, 'firmware', 'device'); await fs.mkdir(source, { recursive: true });
    const plan = await planManagedMove({ target: source, targetType: 'folder', categoryName: '项目源码', managedRoot: path.join(root, '启动台') });
    expect(plan.eligible).toBe(false); expect(plan.reason).toContain('敏感数据');
  });

  it('rejects destination collisions before moving', async () => {
    const root = await fixture(); const source = path.join(root, 'tool'); const managed = path.join(root, '启动台');
    await fs.mkdir(source); await fs.mkdir(path.join(managed, '应用本体', 'tool'), { recursive: true });
    const plan = await planManagedMove({ target: source, targetType: 'folder', categoryName: '专业工具', managedRoot: managed });
    expect(plan.eligible).toBe(false); expect(plan.reason).toContain('同名');
  });

  it('moves an eligible folder and can roll it back', async () => {
    const root = await fixture(); const source = path.join(root, 'portable-tool'); const managed = path.join(root, '启动台');
    await fs.mkdir(source); await fs.writeFile(path.join(source, 'readme.txt'), 'verified');
    const plan = await planManagedMove({ target: source, targetType: 'folder', categoryName: '专业工具', managedRoot: managed });
    expect(plan.eligible).toBe(true);
    const operation = await executeManagedMove(plan);
    expect(await fs.readFile(path.join(plan.destination, 'readme.txt'), 'utf8')).toBe('verified');
    await operation.rollback(); expect(await fs.readFile(path.join(source, 'readme.txt'), 'utf8')).toBe('verified');
  });

  it('keeps a named old copy after a cross-volume commit', async () => {
    const root = await fixture(); const source = path.join(root, 'portable-tool'); const destinationRoot = path.join(root, 'managed', '应用本体'); const destination = path.join(destinationRoot, 'portable-tool');
    await fs.mkdir(source, { recursive: true }); await fs.writeFile(path.join(source, 'readme.txt'), 'verified');
    const plan = { eligible: true, reason: 'test', source, sourceRoot: source, destinationRoot, destination, resultingTarget: destination, resultingType: 'folder' as const, workingDirectory: '', bucket: '应用本体', crossVolume: true };
    const operation = await executeManagedMove(plan);
    await operation.commit();
    expect(await fs.readFile(path.join(destination, 'readme.txt'), 'utf8')).toBe('verified');
    expect(await fs.readFile(path.join(source + '.启动台迁移旧副本', 'readme.txt'), 'utf8')).toBe('verified');
    expect(await fs.stat(source).catch(() => null)).toBeNull();
  });

  it('never rolls back after the configuration commit boundary', () => {
    expect(recoveryAction('prepared', true)).toBe('rollback-uncommitted');
    expect(recoveryAction('moved', true)).toBe('rollback-uncommitted');
    expect(recoveryAction('config-commit-intent', true)).toBe('resume-committed');
    expect(recoveryAction('config-saved', true)).toBe('resume-committed');
    expect(recoveryAction('completed', true)).toBe('resume-committed');
    expect(recoveryAction('config-commit-intent', false)).toBe('manual-intervention');
    expect(recoveryAction('config-saved', false)).toBe('manual-intervention');
  });

  it('rejects malformed or out-of-root journal paths', () => {
    expect(() => validateJournal({})).toThrow('迁移日志格式无效');
    expect(() => validateJournal({ id: 'move-1', phase: 'prepared', plan: { bucket: '应用本体', sourceRoot: String.raw`C:\source`, destinationRoot: String.raw`C:\managed\应用本体`, destination: String.raw`D:\outside`, eligible: true }, originalConfig: {}, nextConfig: {}, createdAt: new Date().toISOString() })).toThrow('迁移日志路径无效');
  });

  it('persists and clears a relocation journal', async () => {
    const root = await fixture(); const file = path.join(root, 'journal.json'); const store = new MoveJournalStore(file);
    const value = { id: 'move-1', phase: 'prepared' as const, plan: { eligible: true, reason: 'ok', source: 'C:\\source', sourceRoot: 'C:\\source', destinationRoot: 'C:\\target', destination: 'C:\\target\\source', resultingTarget: 'C:\\target\\source', resultingType: 'folder' as const, workingDirectory: '', bucket: '项目源码', crossVolume: false }, originalConfig: { version: 1 }, nextConfig: { version: 1 }, createdAt: new Date(0).toISOString() };
    await store.save(value); expect(await store.load()).toEqual(value);
    const updated = { ...value, phase: 'moved' as const };
    await store.save(updated); expect(await store.load()).toEqual(updated);
    await store.clear(); expect(await store.load()).toBeNull();
  });
});
