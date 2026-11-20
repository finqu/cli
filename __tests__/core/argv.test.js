import { describe, it, expect } from 'vitest';
import { commandWordIndex, isCliVersionRequest } from '../../src/core/argv.js';

describe('commandWordIndex', () => {
  it('finds the first word that is not an option', () => {
    expect(commandWordIndex(['--verbose', 'theme', 'deploy'])).toBe(1);
  });

  it('skips the value of --config and -c', () => {
    expect(commandWordIndex(['-c', 'x.env', 'theme'])).toBe(2);
    expect(commandWordIndex(['--config', 'x.env', 'theme'])).toBe(2);
  });

  it('returns -1 when there is no command word', () => {
    expect(commandWordIndex(['--version'])).toBe(-1);
    expect(commandWordIndex([])).toBe(-1);
  });
});

describe('isCliVersionRequest', () => {
  it('is true for --version on its own or among root options', () => {
    expect(isCliVersionRequest(['--version'])).toBe(true);
    expect(isCliVersionRequest(['-v', '--version'])).toBe(true);
    expect(isCliVersionRequest(['-c', 'x.env', '--version'])).toBe(true);
  });

  it('leaves --version to the command that follows a command word', () => {
    expect(
      isCliVersionRequest(['theme', 'configure', '--version', 'release-1']),
    ).toBe(false);
    expect(
      isCliVersionRequest(['--non-interactive', 'theme', 'configure', '--version', 'r']),
    ).toBe(false);
  });

  it('is false when --version is absent', () => {
    expect(isCliVersionRequest(['theme', 'deploy'])).toBe(false);
    expect(isCliVersionRequest([])).toBe(false);
  });
});
