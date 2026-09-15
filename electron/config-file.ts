import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { AppConfig, MAX_CONFIG_BYTES, parseConfigJson, validateConfig } from './model';

export async function readConfigFile(filePath: string): Promise<AppConfig> {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (stat.size > MAX_CONFIG_BYTES) throw new Error('配置文件超过 2 MB 限制');
    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_CONFIG_BYTES) throw new Error('配置文件超过 2 MB 限制');
    return parseConfigJson(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}

export async function writeConfigFile(filePath: string, value: unknown): Promise<void> {
  const config = validateConfig(value);
  const suffix = randomUUID();
  const temp = `${filePath}.${suffix}.tmp`;
  const backup = `${filePath}.${suffix}.previous`;
  let movedCurrent = false;
  try {
    await fs.writeFile(temp, JSON.stringify(config, null, 2), { encoding: 'utf8', flag: 'wx' });
    try {
      await fs.rename(filePath, backup);
      movedCurrent = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await fs.rename(temp, filePath);
    } catch (error) {
      if (movedCurrent) await fs.rename(backup, filePath).catch(() => undefined);
      throw error;
    }
    if (movedCurrent) await fs.rm(backup, { force: true });
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
}
