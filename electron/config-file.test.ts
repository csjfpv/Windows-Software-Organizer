import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfigFile, writeConfigFile } from './config-file';
import { emptyConfig, MAX_CONFIG_BYTES } from './model';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('config file import', () => {
  it('reads a valid config through the bounded reader', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organizer-import-'));
    roots.push(root);
    const file = path.join(root, 'config.json');
    await fs.writeFile(file, JSON.stringify(emptyConfig()), 'utf8');
    await expect(readConfigFile(file)).resolves.toEqual(emptyConfig());
  });

  it('rejects files larger than the import limit before parsing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organizer-import-'));
    roots.push(root);
    const file = path.join(root, 'config.json');
    await fs.writeFile(file, Buffer.alloc(MAX_CONFIG_BYTES + 1, 0x20));
    await expect(readConfigFile(file)).rejects.toThrow('配置文件超过 2 MB 限制');
  });

  it('atomically replaces an existing exported config without residue', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organizer-export-'));
    const file = path.join(root, 'config.json');
    roots.push(root);
    await fs.writeFile(file, 'old contents', 'utf8');
    const config = emptyConfig();
    await writeConfigFile(file, config);
    await expect(readConfigFile(file)).resolves.toEqual(config);
    await expect(fs.readdir(root)).resolves.toEqual(['config.json']);
  });
});
