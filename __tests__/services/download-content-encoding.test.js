import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/services/http.js';
import { ThemeApi } from '../../src/services/themeApi.js';
import { createFileSystem } from '../../src/io/fileSystem.js';

const logger = {
  printVerbose() {},
  printError() {},
  printStatus() {},
  printSuccess() {},
  printInfo() {},
};

const TEXT = 'plain theme file '.repeat(50);
let server;
let base;
const requests = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push(req.headers);
    const key = new URL(req.url, 'http://x').searchParams.get('asset[key]');
    const send = (encoding, body) => {
      res.writeHead(200, encoding ? { 'content-encoding': encoding } : {});
      res.end(body);
    };
    switch (key) {
      case 'br.js':
        return send('br', zlib.brotliCompressSync(TEXT));
      case 'gz.js':
        return send('gzip', zlib.gzipSync(TEXT));
      case 'deflate.js':
        return send('deflate', zlib.deflateSync(TEXT));
      case 'identity.js':
        return send('identity', TEXT);
      case 'plain.js':
        return send(null, TEXT);
      case 'corrupt-br.js':
        return send('br', Buffer.from('this is not brotli data at all'));
      case 'zstd.js':
        return send('zstd', Buffer.from('opaque'));
      default:
        res.writeHead(404);
        return res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server.close());

describe('download Content-Encoding', () => {
  const dirs = [];
  afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
  });

  function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finqu-enc-'));
    dirs.push(dir);
    const values = {
      resourceUrl: base,
      store: { id: 12, themeId: 34, versionId: 'rel1' },
    };
    const api = new ThemeApi(
      new HttpClient({ logger }),
      null,
      logger,
      { get: (k, d) => values[k] ?? d },
    );
    const download = (key) =>
      api.downloadAsset(key, path.join(dir, key), createFileSystem(), { quiet: true });
    return { dir, download };
  }

  it.each(['br.js', 'gz.js', 'deflate.js', 'identity.js', 'plain.js'])(
    'saves the decoded content of %s',
    async (key) => {
      const { dir, download } = setup();
      await expect(download(key)).resolves.toBe(true);
      expect(fs.readFileSync(path.join(dir, key), 'utf8')).toBe(TEXT);
      expect(fs.readdirSync(dir)).toEqual([key]);
    },
  );

  it.each(['corrupt-br.js', 'zstd.js'])(
    'fails %s and leaves no file or temporary file',
    async (key) => {
      const { dir, download } = setup();
      await expect(download(key)).rejects.toBeDefined();
      expect(fs.readdirSync(dir)).toEqual([]);
    },
  );

  it('keeps an existing local file when the encoding cannot be decoded', async () => {
    const { dir, download } = setup();
    fs.writeFileSync(path.join(dir, 'zstd.js'), 'keep-me');
    await expect(download('zstd.js')).rejects.toBeDefined();
    expect(fs.readFileSync(path.join(dir, 'zstd.js'), 'utf8')).toBe('keep-me');
  });
});
