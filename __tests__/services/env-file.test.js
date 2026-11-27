import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  envFileHasKey,
  setEnvValue,
  restoreEnvValue,
} from '../../src/services/env-file.js';

describe('env-file', () => {
  let dir;
  let file;
  const read = () => fs.readFile(file, 'utf8');

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'finqu-env-'));
    file = path.join(dir, '.env.local');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('replaces only the matching line and restores it', async () => {
    const original = '# c\nA=1\nexport KEY="old value" # note\nKEY_OTHER=2\n';
    await fs.writeFile(file, original);

    const change = await setEnvValue(file, 'KEY', 'https://x.example');
    expect(await read()).toBe(
      '# c\nA=1\nexport KEY=https://x.example\nKEY_OTHER=2\n',
    );
    expect(change.previousLine).toBe('export KEY="old value" # note');

    await restoreEnvValue(change);
    expect(await read()).toBe(original);
  });

  it('appends the key when missing and removes it on restore', async () => {
    await fs.writeFile(file, 'A=1');

    const change = await setEnvValue(file, 'KEY', 'v');
    expect(await read()).toBe('A=1\nKEY=v\n');

    await restoreEnvValue(change);
    expect(await read()).toBe('A=1\n');
  });

  it('creates the file and deletes it on restore if it is empty', async () => {
    const change = await setEnvValue(file, 'KEY', 'v');
    expect(await read()).toBe('KEY=v\n');

    await restoreEnvValue(change);
    await expect(fs.access(file)).rejects.toThrow();
  });

  it('keeps edits the user made to other lines meanwhile', async () => {
    await fs.writeFile(file, 'KEY=old\n');
    const change = await setEnvValue(file, 'KEY', 'new');
    await fs.appendFile(file, 'ADDED=1\n');

    await restoreEnvValue(change);
    expect(await read()).toBe('KEY=old\nADDED=1\n');
  });

  it('is a no-op when the value is already set', async () => {
    await fs.writeFile(file, 'KEY=v\n');
    const change = await setEnvValue(file, 'KEY', 'v');
    expect(change.changed).toBe(false);
    await restoreEnvValue(change);
    expect(await read()).toBe('KEY=v\n');
  });

  it('detects keys', async () => {
    await fs.writeFile(file, '#KEY=commented\nKEYS=1\n');
    expect(await envFileHasKey(file, 'KEY')).toBe(false);
    await fs.writeFile(file, '  KEY = 1\n');
    expect(await envFileHasKey(file, 'KEY')).toBe(true);
    expect(await envFileHasKey(path.join(dir, 'missing'), 'KEY')).toBe(false);
  });
});
