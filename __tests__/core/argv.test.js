import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  commandWordIndex,
  exitOverrideAll,
  isCliVersionRequest,
  isCommanderExit,
  machineFlagsIn,
  usageMessage,
} from '../../src/core/argv.js';

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

describe('machineFlagsIn', () => {
  it('finds --json and --non-interactive anywhere before --', () => {
    expect(machineFlagsIn(['theme', 'deploy', '--json'])).toEqual({
      json: true,
      nonInteractive: false,
    });
    expect(machineFlagsIn(['--non-interactive', 'theme', 'deploy'])).toEqual({
      json: false,
      nonInteractive: true,
    });
  });

  it('ignores tokens after -- because they are file names', () => {
    expect(
      machineFlagsIn(['theme', 'deploy', '--', '--json', '--non-interactive']),
    ).toEqual({ json: false, nonInteractive: false });
  });
});

describe('exitOverrideAll', () => {
  function build() {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    const group = new Command('theme');
    group.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    group.command('deploy [sources...]').option('--clean').action(() => {});
    program.addCommand(group);
    exitOverrideAll(program);
    return program;
  }

  it('turns an unknown option of a grouped subcommand into a thrown error', async () => {
    const err = await build()
      .parseAsync(['theme', 'deploy', '--bogus'], { from: 'user' })
      .catch((e) => e);

    expect(isCommanderExit(err)).toBe(true);
    expect(err.exitCode).toBe(1);
    expect(usageMessage(err)).toBe("unknown option '--bogus'");
  });

  it('turns an unknown command into a thrown error', async () => {
    const err = await build()
      .parseAsync(['theme', 'bogus'], { from: 'user' })
      .catch((e) => e);

    expect(isCommanderExit(err)).toBe(true);
    expect(err.code).toBe('commander.unknownCommand');
  });

  it('reports --help as exit code 0', async () => {
    const err = await build()
      .parseAsync(['theme', 'deploy', '--help'], { from: 'user' })
      .catch((e) => e);

    expect(isCommanderExit(err)).toBe(true);
    expect(err.exitCode).toBe(0);
  });
});

describe('isCommanderExit', () => {
  it('is false for other errors', () => {
    expect(isCommanderExit(new Error('boom'))).toBe(false);
    expect(isCommanderExit({ code: 'AUTH_ERROR' })).toBe(false);
    expect(isCommanderExit(undefined)).toBe(false);
  });
});
