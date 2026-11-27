import path from 'path';
import ignore from 'ignore';

/** Name of the ignore file in the theme root */
export const IGNORE_FILE_NAME = '.finquignore';

/** What a theme path is allowed to do */
export const PATH_VERDICT = Object.freeze({
  /** Not excluded by anything */
  ALLOWED: 'allowed',
  /**
   * Built-in safety list (credentials, VCS, dependencies, any dot segment).
   * `.finquignore` cannot override it. This includes `.finquignore` itself.
   */
  EXCLUDED: 'excluded',
  /** Matched by `.finquignore` or by patterns layered on top of it */
  IGNORED: 'ignored',
});

/**
 * Decides which theme paths may be uploaded, deleted remotely or written
 * locally.
 *
 * The built-in safety list (`FileSystem.checkPath`) is consulted first and
 * always wins: a `!` rule in `.finquignore` is only ever matched against
 * paths the safety list already let through, so it cannot re-include a
 * credential file, `.git` or a dotfile. Paths are matched relative to the
 * theme root with forward slashes.
 */
export class ThemeIgnore {
  /**
   * @param {Object} fileSystem FileSystem with `checkPath` and `readFile`
   * @param {Object} [options]
   * @param {string[]} [options.extraPatterns] Patterns in `.gitignore`
   *   syntax applied after the file, such as `watch --ignore`
   */
  constructor(fileSystem, { extraPatterns = [] } = {}) {
    this.fileSystem = fileSystem;
    this.extraPatterns = extraPatterns;
    this.fileContent = '';
    this.matcher = this._buildMatcher();
  }

  _buildMatcher() {
    const matcher = ignore();
    matcher.add(this.fileContent);
    matcher.add(this.extraPatterns);
    return matcher;
  }

  /**
   * Replace the rules read from `.finquignore`
   * @param {string} content File content; empty for no rules
   */
  setRules(content) {
    this.fileContent = String(content ?? '').replace(/^﻿/, '');
    this.matcher = this._buildMatcher();
  }

  /**
   * Read `.finquignore` from the theme root. A missing file means no rules.
   * Any other read failure throws: continuing would upload files the
   * merchant asked to keep out.
   * @param {string} themeDir Theme root
   * @returns {Promise<ThemeIgnore>} This instance
   */
  async load(themeDir) {
    let content = '';
    try {
      content = await this.fileSystem.readFile(
        path.join(themeDir, IGNORE_FILE_NAME),
        'utf8',
      );
    } catch (err) {
      if (err?.code !== 'ENOENT' && err?.code !== 'ENOTDIR') {
        throw new Error(
          `Cannot read ${IGNORE_FILE_NAME}: ${err?.message || err}`,
        );
      }
    }
    this.setRules(content);
    return this;
  }

  /**
   * Classify a path inside the theme
   * @param {string} relativePath Path relative to the theme root, in any
   *   separator style
   * @param {Object} [options]
   * @param {boolean} [options.directory] The path is a directory, so
   *   `dir/` patterns match it
   * @returns {'allowed'|'excluded'|'ignored'} Verdict from PATH_VERDICT
   */
  classify(relativePath, { directory = false } = {}) {
    if (!this.fileSystem.checkPath(relativePath)) {
      return PATH_VERDICT.EXCLUDED;
    }

    const normalized = path.posix
      .normalize(relativePath.replace(/\\/g, '/'))
      .replace(/^(\.\/)+/, '')
      .replace(/\/+$/, '');
    if (
      normalized === '' ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.startsWith('/') ||
      /^[a-zA-Z]:/.test(normalized)
    ) {
      return PATH_VERDICT.EXCLUDED;
    }

    const candidate = directory ? `${normalized}/` : normalized;
    return this.matcher.ignores(candidate)
      ? PATH_VERDICT.IGNORED
      : PATH_VERDICT.ALLOWED;
  }
}

/**
 * Create a ThemeIgnore and read the theme's `.finquignore`
 * @param {Object} fileSystem FileSystem with `checkPath` and `readFile`
 * @param {string} themeDir Theme root
 * @param {string[]} [extraPatterns] Patterns layered on top of the file
 * @returns {Promise<ThemeIgnore>} Loaded instance
 */
export async function loadThemeIgnore(
  fileSystem,
  themeDir,
  extraPatterns = [],
) {
  return new ThemeIgnore(fileSystem, { extraPatterns }).load(themeDir);
}
