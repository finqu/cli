import { describe, it, expect } from 'vitest';
import {
  EXIT_CODES,
  MACHINE_COMMANDS,
  UsageError,
  buildEnvelope,
  commandKey,
  exitCodeFor,
  isFailedResult,
  isNonInteractiveEnv,
  keyFromOperands,
  refusalMessage,
} from '../../src/core/non-interactive.js';
import { AppError } from '../../src/core/error.js';

describe('isNonInteractiveEnv', () => {
  it('accepts 1 and true', () => {
    expect(isNonInteractiveEnv({ FINQU_NON_INTERACTIVE: '1' })).toBe(true);
    expect(isNonInteractiveEnv({ FINQU_NON_INTERACTIVE: 'true' })).toBe(true);
    expect(isNonInteractiveEnv({ FINQU_NON_INTERACTIVE: ' TRUE ' })).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isNonInteractiveEnv({})).toBe(false);
    expect(isNonInteractiveEnv({ FINQU_NON_INTERACTIVE: '0' })).toBe(false);
    expect(isNonInteractiveEnv({ FINQU_NON_INTERACTIVE: '' })).toBe(false);
    expect(isNonInteractiveEnv({ FINQU_NON_INTERACTIVE: 'yes' })).toBe(false);
  });
});

describe('command keys', () => {
  it('joins group and name', () => {
    expect(commandKey('theme', 'deploy')).toBe('theme deploy');
    expect(commandKey(null, 'sign-in')).toBe('sign-in');
  });

  it('uses the first two operands', () => {
    expect(keyFromOperands(['theme', 'deploy', 'a.liquid'])).toBe('theme deploy');
    expect(keyFromOperands(['sign-in'])).toBe('sign-in');
  });
});

describe('refusalMessage', () => {
  it('lists exactly the four theme commands as allowed', () => {
    expect(MACHINE_COMMANDS).toEqual([
      'theme download',
      'theme deploy',
      'theme delete',
      'theme configure',
    ]);
  });

  it.each(MACHINE_COMMANDS)('allows %s in both modes', (key) => {
    expect(refusalMessage(key, { nonInteractive: true, json: false })).toBeNull();
    expect(refusalMessage(key, { nonInteractive: true, json: true })).toBeNull();
    expect(refusalMessage(key, { nonInteractive: false, json: true })).toBeNull();
  });

  it.each([
    'app dev',
    'app list',
    'app create',
    'theme dev',
    'theme list',
    'theme watch',
    'storefront dev',
    'storefront build',
    'storefront create',
    'sign-in',
    'migrate',
  ])('refuses %s in non-interactive mode', (key) => {
    expect(refusalMessage(key, { nonInteractive: true, json: false })).toContain(
      `"${key}" is not available in non-interactive mode`,
    );
  });

  it('refuses --json on commands without a JSON result', () => {
    expect(refusalMessage('app list', { nonInteractive: false, json: true })).toContain(
      '--json is not supported',
    );
  });

  it('does not touch plain interactive runs', () => {
    expect(refusalMessage('app dev', { nonInteractive: false, json: false })).toBeNull();
  });
});

describe('isFailedResult and exitCodeFor', () => {
  it('is ok for a clean result', () => {
    const result = { success: true, errors: [], skipped: [] };
    expect(isFailedResult(result)).toBe(false);
    expect(exitCodeFor(result)).toBe(EXIT_CODES.OK);
  });

  it('fails on a skipped file even when success is true', () => {
    const result = { success: true, errors: [], skipped: [{ path: 'a', reason: 'too_large' }] };
    expect(isFailedResult(result)).toBe(true);
    expect(exitCodeFor(result)).toBe(EXIT_CODES.FAILED);
  });

  it('fails on a failed compile', () => {
    const result = {
      success: true,
      errors: [],
      compile: { attempted: true, ok: false, error: new Error('x') },
    };
    expect(exitCodeFor(result)).toBe(EXIT_CODES.FAILED);
  });

  it('does not fail when compile was not attempted', () => {
    const result = { success: true, errors: [], compile: { attempted: false, ok: false } };
    expect(exitCodeFor(result)).toBe(EXIT_CODES.OK);
  });

  it('fails on a missing result and on a thrown error', () => {
    expect(exitCodeFor(undefined)).toBe(EXIT_CODES.FAILED);
    expect(exitCodeFor({ success: true }, new Error('x'))).toBe(EXIT_CODES.FAILED);
  });

  it('uses the refusal code for usage errors, returned or thrown', () => {
    expect(exitCodeFor({ success: false, error: new UsageError('x') })).toBe(EXIT_CODES.REFUSED);
    expect(exitCodeFor(undefined, new UsageError('x'))).toBe(EXIT_CODES.REFUSED);
  });
});

describe('buildEnvelope', () => {
  it('has a fixed top-level shape', () => {
    const envelope = buildEnvelope('theme deploy', {
      success: true,
      deployedCount: 1,
      removedCount: 0,
      errors: [],
      skipped: [],
      uploaded: ['a.liquid'],
      compile: { attempted: true, ok: true, error: null },
    });
    expect(Object.keys(envelope)).toEqual(['ok', 'command', 'exitCode', 'error', 'result']);
    expect(envelope).toEqual({
      ok: true,
      command: 'theme deploy',
      exitCode: 0,
      error: null,
      result: {
        deployedCount: 1,
        removedCount: 0,
        uploaded: ['a.liquid'],
        failed: [],
        skipped: [],
        compile: { attempted: true, ok: true, error: null },
      },
    });
  });

  it('turns failures, skips and a failed compile into readable strings', () => {
    const envelope = buildEnvelope('theme deploy', {
      success: false,
      deployedCount: 1,
      removedCount: 0,
      errors: [{ path: 'b.liquid', action: 'upload', error: { status: 500, error: 'Server error' } }],
      skipped: [{ path: 'big.bin', reason: 'too_large' }],
      uploaded: ['a.liquid'],
      compile: { attempted: true, ok: false, error: new Error('compile down') },
    });
    expect(envelope.ok).toBe(false);
    expect(envelope.exitCode).toBe(1);
    expect(envelope.error).toEqual({
      code: 'INCOMPLETE',
      message: '1 failed, 1 skipped, compile failed',
    });
    expect(envelope.result.failed).toEqual([
      { path: 'b.liquid', action: 'upload', error: 'HTTP 500: Server error' },
    ]);
    expect(envelope.result.skipped).toEqual([{ path: 'big.bin', reason: 'too_large' }]);
    expect(envelope.result.compile).toEqual({ attempted: true, ok: false, error: 'compile down' });
  });

  it('reports a thrown error with its code', () => {
    const envelope = buildEnvelope('theme delete', undefined, new AppError('No sources', 'validation_error'));
    expect(envelope).toEqual({
      ok: false,
      command: 'theme delete',
      exitCode: 1,
      error: { code: 'validation_error', message: 'No sources' },
      result: null,
    });
  });

  it('adds the cause of a wrapped error to the message', () => {
    const envelope = buildEnvelope('theme configure', {
      success: false,
      error: AppError.configError('Could not list versions', { status: 404, error: 'Not found' }),
    });
    expect(envelope.error).toEqual({
      code: 'CONFIG_ERROR',
      message: 'Could not list versions: HTTP 404: Not found',
    });
  });

  it('describes configure, delete and download results', () => {
    expect(
      buildEnvelope('theme configure', {
        success: true,
        store: { channelId: '1', themeId: '2', version: 'v3', resourceUrl: 'https://api.example.test' },
      }).result,
    ).toEqual({ channelId: '1', themeId: '2', version: 'v3', resourceUrl: 'https://api.example.test' });

    expect(
      buildEnvelope('theme delete', {
        success: true,
        deletedCount: 1,
        deleted: ['a'],
        errors: [],
        compile: { attempted: false, ok: false, error: null },
      }).result,
    ).toEqual({
      deletedCount: 1,
      deleted: ['a'],
      failed: [],
      compile: { attempted: false, ok: null, error: null },
    });

    expect(
      buildEnvelope('theme download', {
        success: true,
        downloadedCount: 1,
        downloaded: ['a'],
        errors: [],
        skipped: [],
      }).result,
    ).toEqual({ downloadedCount: 1, downloaded: ['a'], failed: [], skipped: [] });
  });
});
