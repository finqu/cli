import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileSystem } from '../../src/io/fileSystem.js';
import {
  IGNORE_FILE_NAME,
  PATH_VERDICT,
  ThemeIgnore,
  loadThemeIgnore,
} from '../../src/io/themeIgnore.js';

const { ALLOWED, EXCLUDED, IGNORED } = PATH_VERDICT;

function rules(content, extraPatterns = []) {
  const themeIgnore = new ThemeIgnore(createFileSystem(), { extraPatterns });
  themeIgnore.setRules(content);
  return themeIgnore;
}

describe('checkPath excludes every dot segment, root included', () => {
  const fileSystem = createFileSystem();

  it.each([
    '.envrc',
    '.pypirc',
    '.DS_Store',
    '.editorconfig',
    '.finquignore',
    '.vercel/project.json',
    '.vercel',
    'assets/.hidden',
    'assets/.cache/x.js',
    '.\\.envrc',
    './.envrc',
    'a/./b.liquid',
    '../outside.liquid',
  ])('refuses %s', (p) => {
    expect(fileSystem.checkPath(p)).toBe(false);
  });

  it.each([
    'layout/theme.liquid',
    './layout/theme.liquid',
    'assets/app.min.js',
    'assets/a.b.c.css',
    'config/settings_schema.json',
    '.',
    '',
  ])('still allows %s', (p) => {
    expect(fileSystem.checkPath(p)).toBe(true);
  });
});

describe('ThemeIgnore pattern semantics', () => {
  it('matches a glob at any depth', () => {
    const ig = rules('*.map\n');
    expect(ig.classify('app.js.map')).toBe(IGNORED);
    expect(ig.classify('assets/app.js.map')).toBe(IGNORED);
    expect(ig.classify('assets/app.js')).toBe(ALLOWED);
  });

  it('matches ** across directories', () => {
    const ig = rules('assets/**/*.psd\n');
    expect(ig.classify('assets/a.psd')).toBe(IGNORED);
    expect(ig.classify('assets/img/raw/a.psd')).toBe(IGNORED);
    expect(ig.classify('snippets/a.psd')).toBe(ALLOWED);
  });

  it('matches a directory pattern for everything below it, at any depth', () => {
    const ig = rules('vendor/\n');
    expect(ig.classify('vendor/lib.js')).toBe(IGNORED);
    expect(ig.classify('vendor/deep/lib.js')).toBe(IGNORED);
    expect(ig.classify('assets/vendor/lib.js')).toBe(IGNORED);
  });

  it('applies a trailing-slash pattern to directories only', () => {
    const ig = rules('vendor/\n');
    expect(ig.classify('vendor')).toBe(ALLOWED);
    expect(ig.classify('vendor', { directory: true })).toBe(IGNORED);
    expect(ig.classify('assets/vendor.js')).toBe(ALLOWED);
  });

  it('anchors a pattern with a leading slash to the theme root', () => {
    const ig = rules('/dist\n/*.txt\n');
    expect(ig.classify('dist/a.js')).toBe(IGNORED);
    expect(ig.classify('assets/dist/a.js')).toBe(ALLOWED);
    expect(ig.classify('notes.txt')).toBe(IGNORED);
    expect(ig.classify('assets/notes.txt')).toBe(ALLOWED);
  });

  it('treats a pattern with a middle slash as relative to the root', () => {
    const ig = rules('assets/raw\n');
    expect(ig.classify('assets/raw/a.png')).toBe(IGNORED);
    expect(ig.classify('other/assets/raw/a.png')).toBe(ALLOWED);
  });

  it('lets ! re-include a file an earlier rule ignored', () => {
    const ig = rules('*.js\n!assets/keep.js\n');
    expect(ig.classify('assets/a.js')).toBe(IGNORED);
    expect(ig.classify('assets/keep.js')).toBe(ALLOWED);
    expect(ig.classify('keep.js')).toBe(IGNORED);
  });

  it('applies the last matching rule', () => {
    const ig = rules('!a.liquid\na.liquid\n');
    expect(ig.classify('a.liquid')).toBe(IGNORED);
  });

  it('cannot re-include a file below an ignored directory, as in git', () => {
    const ig = rules('vendor/\n!vendor/keep.js\n');
    expect(ig.classify('vendor/keep.js')).toBe(IGNORED);
  });

  it('re-includes when the directory itself is not ignored', () => {
    const ig = rules('vendor/*\n!vendor/keep.js\n');
    expect(ig.classify('vendor/keep.js')).toBe(ALLOWED);
    expect(ig.classify('vendor/other.js')).toBe(IGNORED);
  });

  it('skips comments and blank lines, and honours an escaped #', () => {
    const ig = rules('# *.js\n\n   \n\\#literal.liquid\n');
    expect(ig.classify('assets/app.js')).toBe(ALLOWED);
    expect(ig.classify('#literal.liquid')).toBe(IGNORED);
  });

  it('reads CRLF line endings and a byte order mark', () => {
    const ig = rules('\uFEFF*.map\r\nvendor/\r\n');
    expect(ig.classify('a.map')).toBe(IGNORED);
    expect(ig.classify('vendor/x.js')).toBe(IGNORED);
  });

  it('matches backslash and ./ spellings against the same rule', () => {
    const ig = rules('vendor/\n');
    expect(ig.classify('vendor\\x.js')).toBe(IGNORED);
    expect(ig.classify('./vendor/x.js')).toBe(IGNORED);
  });

  it('is empty without rules', () => {
    const ig = rules('');
    expect(ig.classify('assets/app.js')).toBe(ALLOWED);
  });

  it('layers extra patterns after the file', () => {
    const ig = rules('*.map\n', ['*.tmp', 'scratch/']);
    expect(ig.classify('a.map')).toBe(IGNORED);
    expect(ig.classify('a.tmp')).toBe(IGNORED);
    expect(ig.classify('scratch/a.liquid')).toBe(IGNORED);
    expect(ig.classify('a.liquid')).toBe(ALLOWED);
  });

  it('keeps extra patterns when the file rules are replaced', () => {
    const ig = rules('*.map\n', ['*.tmp']);
    ig.setRules('');
    expect(ig.classify('a.map')).toBe(ALLOWED);
    expect(ig.classify('a.tmp')).toBe(IGNORED);
  });
});

describe('the built-in safety list cannot be overridden', () => {
  it.each([
    '.env',
    '.env.production',
    '.git/config',
    '.git',
    'node_modules/pkg/index.js',
    '.envrc',
    '.pypirc',
    '.vercel/project.json',
    '.npmrc',
    '.aws/credentials',
    'certs/server.pem',
    'tls.key',
    '.finqu-webhooks.json',
    '.finquignore',
    'assets/.cache/x.js',
    '../outside.liquid',
    '/etc/passwd',
    'C:/Windows/win.ini',
  ])('keeps %s excluded whatever .finquignore says', (p) => {
    const ig = rules(
      [
        `!${p}`,
        '!.env',
        '!.env*',
        '!.git',
        '!.git/',
        '!node_modules',
        '!.*',
        '!**/.*',
        '!*',
        '!**',
        '!*.pem',
        '!*.key',
      ].join('\n'),
    );
    expect(ig.classify(p)).toBe(EXCLUDED);
  });

  it('keeps other files allowed when a negation targets a protected one', () => {
    const ig = rules('!.env\n');
    expect(ig.classify('layout/theme.liquid')).toBe(ALLOWED);
  });

  it('reports a safety-list path as excluded even when .finquignore also matches it', () => {
    const ig = rules('.env\n.envrc\n');
    expect(ig.classify('.env')).toBe(EXCLUDED);
    expect(ig.classify('.envrc')).toBe(EXCLUDED);
  });
});

describe('loading .finquignore', () => {
  let themeDir;

  beforeEach(() => {
    themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finqu-ignore-'));
  });

  afterEach(() => {
    fs.rmSync(themeDir, { recursive: true, force: true });
  });

  it('reads the file from the theme root', async () => {
    fs.writeFileSync(path.join(themeDir, IGNORE_FILE_NAME), '*.map\n');
    const ig = await loadThemeIgnore(createFileSystem(), themeDir);
    expect(ig.classify('a.map')).toBe(IGNORED);
  });

  it('does not read a .finquignore from a subdirectory', async () => {
    fs.mkdirSync(path.join(themeDir, 'assets'));
    fs.writeFileSync(path.join(themeDir, 'assets', IGNORE_FILE_NAME), '*.map\n');
    const ig = await loadThemeIgnore(createFileSystem(), themeDir);
    expect(ig.classify('assets/a.map')).toBe(ALLOWED);
  });

  it('means no extra rules when the file is missing', async () => {
    const ig = await loadThemeIgnore(createFileSystem(), themeDir);
    expect(ig.classify('assets/a.map')).toBe(ALLOWED);
    expect(ig.classify('.env')).toBe(EXCLUDED);
  });

  it('means no extra rules when the theme directory itself is missing', async () => {
    const ig = await loadThemeIgnore(
      createFileSystem(),
      path.join(themeDir, 'missing'),
    );
    expect(ig.classify('a.liquid')).toBe(ALLOWED);
  });

  it('fails instead of uploading everything when the file cannot be read', async () => {
    fs.mkdirSync(path.join(themeDir, IGNORE_FILE_NAME));
    await expect(loadThemeIgnore(createFileSystem(), themeDir)).rejects.toThrow(
      /Cannot read \.finquignore/,
    );
  });

  it('replaces the rules when loaded again', async () => {
    const file = path.join(themeDir, IGNORE_FILE_NAME);
    fs.writeFileSync(file, '*.map\n');
    const ig = await loadThemeIgnore(createFileSystem(), themeDir);
    expect(ig.classify('a.map')).toBe(IGNORED);

    fs.writeFileSync(file, '*.log\n');
    await ig.load(themeDir);
    expect(ig.classify('a.map')).toBe(ALLOWED);
    expect(ig.classify('a.log')).toBe(IGNORED);

    fs.rmSync(file);
    await ig.load(themeDir);
    expect(ig.classify('a.log')).toBe(ALLOWED);
  });

  it('keeps layered patterns across a load', async () => {
    const ig = await loadThemeIgnore(createFileSystem(), themeDir, ['*.tmp']);
    expect(ig.classify('a.tmp')).toBe(IGNORED);
  });
});
