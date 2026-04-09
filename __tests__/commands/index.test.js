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
const mockThemeDevCmd = {
  name: 'dev',
  description: 'Start local theme development server',
  group: 'theme',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppListenCmd = {
  name: 'listen',
  syntax: 'listen',
  description: 'Listen app webhooks',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppLinkCmd = {
  name: 'link',
  syntax: 'link <appId>',
  description: 'Link this project to an existing app',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppListCmd = {
  name: 'list',
  syntax: 'list',
  description: 'List all your apps',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppInfoCmd = {
  name: 'info',
  syntax: 'info',
  description: 'Show app details',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppCreateCmd = {
  name: 'create',
  syntax: 'create <name>',
  description: 'Create a new app',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppUpdateCmd = {
  name: 'update',
  syntax: 'update',
  description: 'Update app configuration or listing',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppDeleteCmd = {
  name: 'delete',
  syntax: 'delete',
  description: 'Delete an app',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppShareCmd = {
  name: 'share',
  syntax: 'share',
  description: 'Get or create a share link for the app',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppPublishCmd = {
  name: 'publish',
  syntax: 'publish',
  description: 'Publish the app',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppUnpublishCmd = {
  name: 'unpublish',
  syntax: 'unpublish',
  description: 'Unpublish the app',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppReleaseCmd = {
  name: 'release',
  syntax: 'release',
  description: 'Release a new app version',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockAppRotateSecretCmd = {
  name: 'rotate-secret',
  syntax: 'rotate-secret',
  description: 'Rotate the OAuth client secret',
  group: 'app',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockStorefrontBuildCmd = {
  name: 'build',
  description: 'Build Puck configuration',
  group: 'storefront',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockStorefrontDevCmd = {
  name: 'dev',
  description: 'Start development server',
  group: 'storefront',
  execute: vi.fn(),
  setApp: vi.fn(),
};
const mockStorefrontCreateCmd = {
  name: 'create',
  syntax: 'create [project-name]',
  description: 'Create a new storefront project',
  group: 'storefront',
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
vi.mock('../../src/commands/theme-dev.js', () => ({
  createThemeDevCommand: vi.fn(() => mockThemeDevCmd),
}));
vi.mock('../../src/commands/app-listen.js', () => ({
  createAppListenCommand: vi.fn(() => mockAppListenCmd),
}));
vi.mock('../../src/commands/app-link.js', () => ({
  createAppLinkCommand: vi.fn(() => mockAppLinkCmd),
}));
vi.mock('../../src/commands/app-list.js', () => ({
  createAppListCommand: vi.fn(() => mockAppListCmd),
}));
vi.mock('../../src/commands/app-info.js', () => ({
  createAppInfoCommand: vi.fn(() => mockAppInfoCmd),
}));
vi.mock('../../src/commands/app-create.js', () => ({
  createAppCreateCommand: vi.fn(() => mockAppCreateCmd),
}));
vi.mock('../../src/commands/app-update.js', () => ({
  createAppUpdateCommand: vi.fn(() => mockAppUpdateCmd),
}));
vi.mock('../../src/commands/app-delete.js', () => ({
  createAppDeleteCommand: vi.fn(() => mockAppDeleteCmd),
}));
vi.mock('../../src/commands/app-share.js', () => ({
  createAppShareCommand: vi.fn(() => mockAppShareCmd),
}));
vi.mock('../../src/commands/app-publish.js', () => ({
  createAppPublishCommand: vi.fn(() => mockAppPublishCmd),
}));
vi.mock('../../src/commands/app-unpublish.js', () => ({
  createAppUnpublishCommand: vi.fn(() => mockAppUnpublishCmd),
}));
vi.mock('../../src/commands/app-release.js', () => ({
  createAppReleaseCommand: vi.fn(() => mockAppReleaseCmd),
}));
vi.mock('../../src/commands/app-rotate-secret.js', () => ({
  createAppRotateSecretCommand: vi.fn(() => mockAppRotateSecretCmd),
}));
vi.mock('../../src/commands/storefront-build.js', () => ({
  createStorefrontBuildCommand: vi.fn(() => mockStorefrontBuildCmd),
}));
vi.mock('../../src/commands/storefront-dev.js', () => ({
  createStorefrontDevCommand: vi.fn(() => mockStorefrontDevCmd),
}));
vi.mock('../../src/commands/storefront-create.js', () => ({
  createStorefrontCreateCommand: vi.fn(() => mockStorefrontCreateCmd),
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
    app: {
      description: 'App authentication and realtime webhook commands',
    },
    theme: {
      description: 'Theme development and deployment commands',
    },
    storefront: {
      description: 'Storefront development commands',
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
      'theme-dev',
      'app-listen',
      'app-link',
      'app-list',
      'app-info',
      'app-create',
      'app-update',
      'app-delete',
      'app-share',
      'app-publish',
      'app-unpublish',
      'app-release',
      'app-rotate-secret',
      'migrate',
      'storefront-build',
      'storefront-dev',
      'storefront-create',
    ]);
    expect(registry.commandInstances.configure).toBe(mockConfigureCmd);
    expect(registry.commandInstances['sign-in']).toBe(mockSignInCmd);
    expect(registry.commandInstances['app-listen']).toBe(mockAppListenCmd);
    expect(registry.commandInstances['storefront-build']).toBe(
      mockStorefrontBuildCmd,
    );
    expect(registry.commandInstances['storefront-dev']).toBe(
      mockStorefrontDevCmd,
    );
    expect(registry.commandInstances['storefront-create']).toBe(
      mockStorefrontCreateCmd,
    );
    expect(registry.commandActions).toEqual({});
    expect(registry.groupCommands).toEqual({});
  });

  it('should initialize correctly with an app', () => {
    registry = new CommandRegistry(mockApp);
    expect(registry.app).toBe(mockApp);
    // Initialization logic remains the same regarding commands
    expect(registry.commands.length).toBe(23);
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

    it('should create app, theme and storefront group commands and add them to program', () => {
      registry.registerCommands(mockProgram);

      // App, theme and storefront group commands should be added to the program
      expect(mockProgram.addCommand).toHaveBeenCalledTimes(3);
      expect(registry.groupCommands.app).toBeDefined();
      expect(registry.groupCommands.theme).toBeDefined();
      expect(registry.groupCommands.storefront).toBeDefined();
    });

    it('should register theme commands as subcommands under theme group', () => {
      registry.registerCommands(mockProgram);

      // Verify theme group was created and commands were registered
      const appGroupCmd = registry.groupCommands.app;
      expect(appGroupCmd).toBeDefined();

      const themeGroupCmd = registry.groupCommands.theme;
      expect(themeGroupCmd).toBeDefined();

      // Verify storefront group was created
      const storefrontGroupCmd = registry.groupCommands.storefront;
      expect(storefrontGroupCmd).toBeDefined();

      // The action handlers should be set up for all commands
      expect(Object.keys(registry.commandActions).length).toBe(23);
      expect(registry.commandActions.configure).toBeDefined();
      expect(registry.commandActions.download).toBeDefined();
      expect(registry.commandActions['sign-in']).toBeDefined();
      expect(registry.commandActions['app-listen']).toBeDefined();
      expect(registry.commandActions['storefront-build']).toBeDefined();
      expect(registry.commandActions['storefront-dev']).toBeDefined();
      expect(registry.commandActions['storefront-create']).toBeDefined();
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
      expect(mockAppListenCmd.setApp).toHaveBeenCalledWith(mockApp);
      expect(mockStorefrontBuildCmd.setApp).toHaveBeenCalledWith(mockApp);
      expect(mockStorefrontDevCmd.setApp).toHaveBeenCalledWith(mockApp);
      expect(mockStorefrontCreateCmd.setApp).toHaveBeenCalledWith(mockApp);
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
