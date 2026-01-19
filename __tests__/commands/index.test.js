import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CommandRegistry,
  createCommandRegistry,
} from '../../src/commands/index.js';

// Mock individual command creation functions
const mockConfigureCmd = {
  name: 'configure',
  syntax: 'configure',
  description: 'Configure settings',
  group: 'theme',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockSignInCmd = {
  name: 'sign-in',
  syntax: 'sign-in',
  description: 'Sign in',
  group: null, // Top-level command
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockDownloadCmd = {
  name: 'download',
  description: 'Download theme',
  group: 'theme',
  options: [{ flags: '-e, --env <env>', description: 'Environment' }],
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockDeployCmd = {
  name: 'deploy',
  description: 'Deploy theme',
  group: 'theme',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockDeleteCmd = {
  name: 'delete',
  description: 'Delete theme',
  group: 'theme',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockWatchCmd = {
  name: 'watch',
  description: 'Watch theme',
  group: 'theme',
  execute: vi.fn(),
  setApp: vi.fn(),
};

vi.mock('../../src/commands/configure.js', () => ({
  createConfigureCommand: vi.fn(() => mockConfigureCmd),
}));
vi.mock('../../src/commands/sign-in.js', () => ({
  createSignInCommand: vi.fn(() => mockSignInCmd),
}));
vi.mock('../../src/commands/download.js', () => ({
  createDownloadCommand: vi.fn(() => mockDownloadCmd),
}));
vi.mock('../../src/commands/deploy.js', () => ({
  createDeployCommand: vi.fn(() => mockDeployCmd),
}));
vi.mock('../../src/commands/delete.js', () => ({
  createDeleteCommand: vi.fn(() => mockDeleteCmd),
}));
vi.mock('../../src/commands/watch.js', () => ({
  createWatchCommand: vi.fn(() => mockWatchCmd),
}));

// Mock Commander's Command class
vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => ({
    description: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
  })),
}));

// Mock command-groups
vi.mock('../../src/core/command-groups.js', () => ({
  COMMAND_GROUPS: {
    theme: {
      description: 'Theme development and deployment commands',
    },
  },
}));

// Mock Commander program
const mockProgram = {
  command: vi.fn().mockReturnThis(),
  description: vi.fn().mockReturnThis(),
  option: vi.fn().mockReturnThis(),
  action: vi.fn().mockReturnThis(),
  addCommand: vi.fn(),
};

describe('CommandRegistry', () => {
  let registry;
  const mockApp = { name: 'TestApp' };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockProgram.command.mockClear().mockReturnThis();
    mockProgram.description.mockClear().mockReturnThis();
    mockProgram.option.mockClear().mockReturnThis();
    mockProgram.action.mockClear().mockReturnThis();
    mockProgram.addCommand.mockClear();
  });

  it('should initialize correctly without an app', () => {
    registry = new CommandRegistry();
    expect(registry.app).toBeNull();
    expect(registry.commands).toEqual([
      'configure',
      'sign-in',
      'download',
      'deploy',
      'delete',
      'watch',
    ]);
    expect(registry.commandInstances.configure).toBe(mockConfigureCmd);
    expect(registry.commandInstances['sign-in']).toBe(mockSignInCmd);
    // ... check other commands similarly
    expect(registry.commandActions).toEqual({});
    expect(registry.groupCommands).toEqual({});
  });

  it('should initialize correctly with an app', () => {
    registry = new CommandRegistry(mockApp);
    expect(registry.app).toBe(mockApp);
    // Initialization logic remains the same regarding commands
    expect(registry.commands.length).toBe(6);
    expect(registry.commandInstances.configure).toBe(mockConfigureCmd);
  });

  describe('registerCommands', () => {
    beforeEach(() => {
      registry = new CommandRegistry(); // Start without app for action test
    });

    it('should register top-level commands directly on program', () => {
      registry.registerCommands(mockProgram);

      // sign-in should be registered directly on the program (top-level)
      expect(mockProgram.command).toHaveBeenCalledWith(mockSignInCmd.syntax);
      expect(mockProgram.description).toHaveBeenCalledWith(
        mockSignInCmd.description,
      );
    });

    it('should create theme group command and add it to program', () => {
      registry.registerCommands(mockProgram);

      // Theme group command should be added to the program
      expect(mockProgram.addCommand).toHaveBeenCalledTimes(1);
      expect(registry.groupCommands.theme).toBeDefined();
    });

    it('should register theme commands as subcommands under theme group', () => {
      registry.registerCommands(mockProgram);

      // Verify theme group was created and commands were registered
      const themeGroupCmd = registry.groupCommands.theme;
      expect(themeGroupCmd).toBeDefined();

      // The action handlers should be set up for all commands
      expect(Object.keys(registry.commandActions).length).toBe(6);
      expect(registry.commandActions.configure).toBeDefined();
      expect(registry.commandActions.download).toBeDefined();
      expect(registry.commandActions['sign-in']).toBeDefined();
    });

    it('should set up action handlers that call execute', () => {
      registry.setApp(mockApp); // Set app before registering for action execution
      registry.registerCommands(mockProgram);

      // Get the action handler for sign-in (top-level command)
      const signInActionCall = mockProgram.action.mock.calls[0];
      const signInActionHandler = signInActionCall[0];

      // Simulate calling the action
      const args = ['arg1', 'arg2'];
      signInActionHandler(...args);

      // Verify execute was called
      expect(mockSignInCmd.execute).toHaveBeenCalledTimes(1);
      expect(mockSignInCmd.execute).toHaveBeenCalledWith(...args);
    });

    it('should throw error in action handler if app is not set', () => {
      registry.registerCommands(mockProgram); // Register without setting app

      // Get the action handler for sign-in (top-level command)
      const signInActionCall = mockProgram.action.mock.calls[0];
      const signInActionHandler = signInActionCall[0];

      // Expect the action handler to throw an error when called
      expect(() => signInActionHandler('arg1')).toThrowError(
        'Command sign-in requires an app instance to be set first',
      );
      expect(mockSignInCmd.execute).not.toHaveBeenCalled();
    });
  });

  describe('setApp', () => {
    beforeEach(() => {
      registry = new CommandRegistry();
    });

    it('should update the app instance', () => {
      registry.setApp(mockApp);
      expect(registry.app).toBe(mockApp);
    });

    it('should call setApp on all command instances that have the method', () => {
      registry.setApp(mockApp);
      expect(mockConfigureCmd.setApp).toHaveBeenCalledWith(mockApp);
      expect(mockSignInCmd.setApp).toHaveBeenCalledWith(mockApp);
      expect(mockDownloadCmd.setApp).toHaveBeenCalledWith(mockApp);
      // ... check other commands
    });

    it('should throw an error if trying to set a null app', () => {
      expect(() => registry.setApp(null)).toThrowError(
        'Cannot set null app instance',
      );
    });
  });
});

describe('createCommandRegistry', () => {
  it('should return an instance of CommandRegistry', () => {
    const registry = createCommandRegistry();
    expect(registry).toBeInstanceOf(CommandRegistry);
    expect(registry.app).toBeNull();
  });

  it('should return an instance of CommandRegistry with app if provided', () => {
    const mockApp = { name: 'TestApp' };
    const registry = createCommandRegistry(mockApp);
    expect(registry).toBeInstanceOf(CommandRegistry);
    expect(registry.app).toBe(mockApp);
  });
});
