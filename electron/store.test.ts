import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from './store';
import { emptyConfig } from './model';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('ConfigStore', () => {
  it('serializes concurrent saves and keeps the last complete config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organizer-store-'));
    roots.push(root);
    const store = new ConfigStore(root);
    const first = { ...emptyConfig(), categories: [{ id: 'first', name: 'First', order: 0 }] };
    const second = { ...emptyConfig(), categories: [{ id: 'second', name: 'Second', order: 0 }] };
    await Promise.all([store.save(first), store.save(second)]);
    await expect(store.load()).resolves.toEqual(second);
    await expect(fs.readFile(path.join(root, 'organizer-config.previous.json'), 'utf8')).resolves.toContain('First');
  });

  it('recovers from a corrupt current file using the previous backup', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organizer-store-'));
    roots.push(root);
    const backup = { ...emptyConfig(), categories: [{ id: 'backup', name: 'Backup', order: 0 }] };
    await fs.writeFile(path.join(root, 'organizer-config.json'), '{broken', 'utf8');
    await fs.writeFile(path.join(root, 'organizer-config.previous.json'), JSON.stringify(backup), 'utf8');
    await expect(new ConfigStore(root).load()).resolves.toEqual(backup);
  });

  it('reports corruption instead of silently resetting both damaged copies', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organizer-store-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'organizer-config.json'), '{broken', 'utf8');
    await fs.writeFile(path.join(root, 'organizer-config.previous.json'), '{also-broken', 'utf8');
    await expect(new ConfigStore(root).load()).rejects.toThrow('配置文件损坏');
  });
});
