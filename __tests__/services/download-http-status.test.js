import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/services/http.js';
import { ThemeApi } from '../../src/services/themeApi.js';
import { createFileSystem } from '../../src/io/fileSystem.js';
import { DownloadCommand } from '../../src/commands/download.js';
import { buildEnvelope } from '../../src/core/non-interactive.js';

let server;
let base;

const logger = {
  printVerbose() {},
  printError() {},
  printStatus() {},
  printSuccess() {},
  printInfo() {},
  printVerboseList() {},
  suspendVerbose() {},
  resumeVerbose() {},
};

const BINARY = Buffer.from([0, 255, 1, 254, 2, 253, 0, 0, 7]);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const key = new URL(req.url, 'http://x').searchParams.get('asset[key]');
    if (key === 'ok.liquid') {
      res.writeHead(200);
      res.end('good');
      return;
    }
    if (key === 'binary.bin') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(BINARY);
      return;
    }
    if (key === 'truncated.liquid') {
      res.writeHead(200, { 'Content-Length': '1000' });
      res.write('partial');
      setTimeout(() => res.destroy(), 20);
      return;
    }
    const code = Number(key.split('.')[0]);
    res.writeHead(code);
    res.end(`ERROR BODY ${code}`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server.close());

function api() {
  const values = {
    resourceUrl: base,
    store: { id: 12, themeId: 34, versionId: 'rel1' },
  };
  const config = { get: (k, d) => values[k] ?? d };
  return new ThemeApi(new HttpClient({ logger }), null, logger, config);
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'finqu-dl-'));
}

describe('theme download HTTP status', () => {
  const dirs = [];
  const dir = () => {
    const d = tempDir();
    dirs.push(d);
    return d;
  };

  afterEach(() => {
    while (dirs.length) {
      fs.rmSync(dirs.pop(), { recursive: true, force: true });
    }
  });

  it('downloads a 200 asset and leaves no temporary file', async () => {
    const d = dir();
    await expect(
      api().downloadAsset('ok.liquid', path.join(d, 'ok.liquid'), createFileSystem(), { quiet: true }),
    ).resolves.toBe(true);
    expect(fs.readFileSync(path.join(d, 'ok.liquid'), 'utf8')).toBe('good');
    expect(fs.readdirSync(d)).toEqual(['ok.liquid']);
  });

  it('writes binary content byte for byte', async () => {
    const d = dir();
    await api().downloadAsset('binary.bin', path.join(d, 'binary.bin'), createFileSystem(), { quiet: true });
    expect(fs.readFileSync(path.join(d, 'binary.bin')).equals(BINARY)).toBe(true);
  });

  it('replaces an existing file on success', async () => {
    const d = dir();
    const file = path.join(d, 'ok.liquid');
    fs.writeFileSync(file, 'old content that is longer than the new one');
    await api().downloadAsset('ok.liquid', file, createFileSystem(), { quiet: true });
    expect(fs.readFileSync(file, 'utf8')).toBe('good');
  });

  it.each([403, 404, 500])(
    'treats a %i asset response as a failure and keeps the local file',
    async (code) => {
      const d = dir();
      const file = path.join(d, `${code}.liquid`);
      fs.writeFileSync(file, 'original');
      await expect(
        api().downloadAsset(`${code}.liquid`, file, createFileSystem(), { quiet: true }),
      ).rejects.toMatchObject({ status: code });
      expect(fs.readFileSync(file, 'utf8')).toBe('original');
      expect(fs.readdirSync(d)).toEqual([`${code}.liquid`]);
    },
  );

  it.each([403, 404, 500])(
    'does not create a file when a %i response arrives for a new file',
    async (code) => {
      const d = dir();
      await expect(
        api().downloadAsset(`${code}.liquid`, path.join(d, `${code}.liquid`), createFileSystem(), { quiet: true }),
      ).rejects.toBeTruthy();
      expect(fs.readdirSync(d)).toEqual([]);
    },
  );

  it('keeps the local file when the connection drops mid-body', async () => {
    const d = dir();
    const file = path.join(d, 'truncated.liquid');
    fs.writeFileSync(file, 'original');
    await expect(
      api().downloadAsset('truncated.liquid', file, createFileSystem(), { quiet: true }),
    ).rejects.toBeTruthy();
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(fs.readdirSync(d)).toEqual(['truncated.liquid']);
  });

  it('keeps the local file and removes the temporary file when the rename fails', async () => {
    const d = dir();
    const file = path.join(d, 'ok.liquid');
    fs.writeFileSync(file, 'original');
    const fileSystem = createFileSystem();
    fileSystem.rename = vi.fn().mockRejectedValue(new Error('EXDEV'));
    await expect(
      api().downloadAsset('ok.liquid', file, fileSystem, { quiet: true }),
    ).rejects.toThrow('EXDEV');
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(fs.readdirSync(d)).toEqual(['ok.liquid']);
  });
});

describe('theme download command with the real HTTP client', () => {
  let themeDir;
  let command;

  beforeEach(() => {
    themeDir = tempDir();
    const config = { get: (k) => (k === 'themeDir' ? themeDir : undefined) };
    command = new DownloadCommand({
      services: { themeApi: api() },
      logger,
      fileSystem: createFileSystem(),
      config,
    });
  });

  afterEach(() => {
    fs.rmSync(themeDir, { recursive: true, force: true });
  });

  it('lists a refused file as failed, keeps the good ones and exits 1 in the JSON envelope', async () => {
    const result = await command.execute([
      'ok.liquid',
      '500.liquid',
      '404.liquid',
      '403.liquid',
    ]);

    expect(result.success).toBe(false);
    expect(result.downloaded).toEqual(['ok.liquid']);
    expect(result.errors.map((e) => e.path).sort()).toEqual([
      '403.liquid',
      '404.liquid',
      '500.liquid',
    ]);
    expect(fs.existsSync(path.join(themeDir, '500.liquid'))).toBe(false);
    expect(fs.existsSync(path.join(themeDir, '404.liquid'))).toBe(false);
    expect(fs.existsSync(path.join(themeDir, '403.liquid'))).toBe(false);
    expect(fs.readFileSync(path.join(themeDir, 'ok.liquid'), 'utf8')).toBe('good');

    const envelope = buildEnvelope('theme download', result);
    expect(envelope.ok).toBe(false);
    expect(envelope.exitCode).toBe(1);
    expect(envelope.result.failed.map((f) => f.path).sort()).toEqual(
      result.errors.map((e) => e.path).sort(),
    );
    expect(envelope.result.downloaded).toEqual(['ok.liquid']);
  });

  it('keeps an existing local file when its download is refused', async () => {
    const file = path.join(themeDir, '500.liquid');
    fs.writeFileSync(file, 'local copy');

    const result = await command.execute(['500.liquid']);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).toBe('local copy');
  });
});
