import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseCommand } from '../../src/commands/base.js';
import { AppError } from '../../src/core/error.js';

// Create a concrete implementation of BaseCommand for testing
class TestCommand extends BaseCommand {
  get name() {
    return 'test';
  }

  get description() {
    return 'Test command for unit tests';
  }

  async execute(options) {
    return { success: true, options };
  }
}

describe('BaseCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    // Create a mock app with required services
    mockApp = {
      config: { get: vi.fn(), set: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printStatus: vi.fn(),
        printSuccess: vi.fn(),
        printError: vi.fn(),
        printVerbose: vi.fn(),
      },
      fileSystem: {
        exists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    };
  });

  describe('constructor', () => {
    it('should initialize without app', () => {
      command = new BaseCommand();
      expect(command.app).toBe(null);
      expect(command.config).toBeUndefined();
      expect(command.logger).toBeUndefined();
      expect(command.fileSystem).toBeUndefined();
    });

    it('should initialize with app', () => {
      command = new BaseCommand(mockApp);
      expect(command.app).toBe(mockApp);
      expect(command.config).toBe(mockApp.config);
      expect(command.logger).toBe(mockApp.logger);
      expect(command.fileSystem).toBe(mockApp.fileSystem);
    });
  });

  describe('setApp', () => {
    it('should set app and load dependencies', () => {
      command = new BaseCommand();
      command.setApp(mockApp);
      expect(command.app).toBe(mockApp);
      expect(command.config).toBe(mockApp.config);
      expect(command.logger).toBe(mockApp.logger);
      expect(command.fileSystem).toBe(mockApp.fileSystem);
    });

    it('should throw error if app is null or undefined', () => {
      command = new BaseCommand();
      expect(() => command.setApp(null)).toThrow(
        'Command requires valid app instance',
      );
      expect(() => command.setApp(undefined)).toThrow(
        'Command requires valid app instance',
      );
    });
  });

  describe('abstract methods', () => {
    it('should throw error when name is not implemented', () => {
      command = new BaseCommand(mockApp);
      expect(() => command.name).toThrow('Command name not implemented');
    });

    it('should throw error when description is not implemented', () => {
      command = new BaseCommand(mockApp);
      expect(() => command.description).toThrow(
        'Command description not implemented',
      );
    });

    it('should throw error when execute is not implemented', async () => {
      command = new BaseCommand(mockApp);
      await expect(command.execute({})).rejects.toThrow(
        'Command execute method not implemented',
      );
    });

    it('should throw error when executing with no app instance', async () => {
      command = new BaseCommand();
      await expect(command.execute({})).rejects.toThrow(
        'Command requires app instance before execution',
      );
    });
  });

  describe('default implementations', () => {
    it('should return command name as syntax by default', () => {
      command = new TestCommand(mockApp);
      expect(command.syntax).toBe('test');
    });

    it('should return empty array for options by default', () => {
      command = new BaseCommand(mockApp);
      expect(command.options).toEqual([]);
    });

    it('should return null for group by default (top-level command)', () => {
      command = new BaseCommand(mockApp);
      expect(command.group).toBeNull();
    });
  });

  describe('validateOptions', () => {
    it('should not throw with valid options', () => {
      command = new BaseCommand(mockApp);
      const options = { required1: 'value1', required2: 'value2' };
      expect(() =>
        command.validateOptions(options, ['required1', 'required2']),
      ).not.toThrow();
    });

    it('should throw AppError when options object is missing', () => {
      command = new BaseCommand(mockApp);
      expect(() => command.validateOptions(null, ['required1'])).toThrow(
        AppError,
      );
      expect(() => command.validateOptions(null, ['required1'])).toThrow(
        'Command options are required',
      );
    });

    it('should throw AppError when required option is missing', () => {
      command = new BaseCommand(mockApp);
      const options = { present: 'value' };
      expect(() => command.validateOptions(options, ['missing'])).toThrow(
        AppError,
      );
      expect(() => command.validateOptions(options, ['missing'])).toThrow(
        "Required option 'missing' is missing",
      );
    });

    it('should throw AppError when required option is null', () => {
      command = new BaseCommand(mockApp);
      const options = { nullValue: null };
      expect(() => command.validateOptions(options, ['nullValue'])).toThrow(
        AppError,
      );
      expect(() => command.validateOptions(options, ['nullValue'])).toThrow(
        "Required option 'nullValue' is missing",
      );
    });

    it('should accept valid falsy values', () => {
      command = new BaseCommand(mockApp);
      const options = {
        zero: 0,
        empty: '',
        falseValue: false,
      };
      expect(() =>
        command.validateOptions(options, ['zero', 'empty', 'falseValue']),
      ).not.toThrow();
    });
  });

  describe('concrete implementation', () => {
    it('should return custom values from overridden methods', () => {
      const testCommand = new TestCommand(mockApp);
      expect(testCommand.name).toBe('test');
      expect(testCommand.description).toBe('Test command for unit tests');
      expect(testCommand.syntax).toBe('test');
      expect(testCommand.options).toEqual([]);
    });

    it('should execute successfully with app instance', async () => {
      const testCommand = new TestCommand(mockApp);
      const options = { arg: 'value' };
      const result = await testCommand.execute(options);
      expect(result).toEqual({ success: true, options });
    });
  });
});
