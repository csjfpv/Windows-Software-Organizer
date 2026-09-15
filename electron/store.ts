import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AppConfig, emptyConfig, parseConfigJson, validateConfig } from './model';

export class ConfigStore {
  private readonly file: string;
  private readonly backup: string;
  private writeQueue: Promise<unknown> = Promise.resolve();
  constructor(userDataPath: string) {
    this.file = path.join(userDataPath, 'organizer-config.json');
    this.backup = path.join(userDataPath, 'organizer-config.previous.json');
  }
  async load(): Promise<AppConfig> {
    try { return parseConfigJson(await fs.readFile(this.file, 'utf8')); }
    catch (currentError) {
      try { return parseConfigJson(await fs.readFile(this.backup, 'utf8')); }
      catch (backupError) {
        const currentMissing = (currentError as NodeJS.ErrnoException).code === 'ENOENT';
        const backupMissing = (backupError as NodeJS.ErrnoException).code === 'ENOENT';
        if (currentMissing && backupMissing) return emptyConfig();
        throw new Error('配置文件损坏，且无法从上一版备份恢复');
      }
    }
  }
  save(value: unknown): Promise<AppConfig> {
    const config = validateConfig(value);
    const operation = this.writeQueue.then(() => this.write(config));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
  private async write(config: AppConfig): Promise<AppConfig> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    await fs.writeFile(temp, JSON.stringify(config, null, 2), 'utf8');
    await fs.rm(this.backup, { force: true });
    let hadCurrent = false;
    try { await fs.rename(this.file, this.backup); hadCurrent = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try {
      await fs.rename(temp, this.file);
    } catch (error) {
      if (hadCurrent) await fs.rename(this.backup, this.file).catch(() => undefined);
      throw error;
    }
    return config;
  }
}
