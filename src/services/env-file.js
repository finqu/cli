/**
 * Minimal, format-preserving edits of single keys in dotenv files.
 * Only the line for the given key is touched; comments, ordering and other
 * values stay as they are.
 */
import fs from 'node:fs/promises';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keyLinePattern(key) {
  return new RegExp(
    `^([ \\t]*(?:export[ \\t]+)?)${escapeRegExp(key)}[ \\t]*=.*$`,
    'm',
  );
}

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Whether a dotenv file defines a key.
 * @param {string} filePath File path
 * @param {string} key Variable name
 * @returns {Promise<boolean>}
 */
export async function envFileHasKey(filePath, key) {
  const content = await readOptional(filePath);
  return content !== null && keyLinePattern(key).test(content);
}

/**
 * Set a key in a dotenv file, creating the file if needed.
 * @param {string} filePath File path
 * @param {string} key Variable name
 * @param {string} value New value
 * @returns {Promise<{path: string, key: string, existed: boolean, previousLine: string|null, changed: boolean}>}
 *   Change record for restoreEnvValue()
 */
export async function setEnvValue(filePath, key, value) {
  const content = await readOptional(filePath);
  const existed = content !== null;
  const text = content ?? '';
  const pattern = keyLinePattern(key);
  const match = text.match(pattern);

  let updated;
  if (match) {
    updated = text.replace(pattern, `${match[1]}${key}=${value}`);
  } else {
    const sep = text === '' || text.endsWith('\n') ? '' : '\n';
    updated = `${text}${sep}${key}=${value}\n`;
  }

  const change = {
    path: filePath,
    key,
    existed,
    previousLine: match ? match[0] : null,
    changed: updated !== text,
  };
  if (change.changed) await fs.writeFile(filePath, updated);
  return change;
}

/**
 * Undo a change made by setEnvValue(). Restores the original line, or
 * removes the line (and the file, if we created it and it is now empty).
 * @param {Object} change Record returned by setEnvValue()
 */
export async function restoreEnvValue(change) {
  if (!change?.changed) return;
  const content = await readOptional(change.path);
  if (content === null) return;

  const pattern = keyLinePattern(change.key);
  let updated;
  if (change.previousLine !== null) {
    updated = pattern.test(content)
      ? content.replace(pattern, () => change.previousLine)
      : content;
  } else {
    const removeLine = new RegExp(`${pattern.source}\\r?\\n?`, 'm');
    updated = content.replace(removeLine, '');
  }

  if (!change.existed && updated.trim() === '') {
    await fs.unlink(change.path);
  } else if (updated !== content) {
    await fs.writeFile(change.path, updated);
  }
}
