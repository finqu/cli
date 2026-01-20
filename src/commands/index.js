/**
 * Command registry for Finqu CLI
 * Central management of all available commands
 */
import { Command } from 'commander';
import { createConfigureCommand } from './configure.js';
import { createSignInCommand } from './sign-in.js';
import { createDownloadCommand } from './download.js';
import { createDeployCommand } from './deploy.js';
import { createDeleteCommand } from './delete.js';
import { createWatchCommand } from './watch.js';
import { createStorefrontBuildCommand } from './storefront-build.js';
import { createStorefrontDevCommand } from './storefront-dev.js';
import { createStorefrontCreateCommand } from './storefront-create.js';
import { COMMAND_GROUPS } from '../core/command-groups.js';

/**
 * Command Registry class for managing commands
 */
export class CommandRegistry {
  /**
   * Create a new command registry
   * @param {Object} app Application instance (optional)
   */
  constructor(app = null) {
    this.app = app;
    this.commands = [];
    this.commandInstances = {};
    this.commandActions = {};
    this.groupCommands = {}; // Store group command instances

    // Initialize command instances without the app
    this.initializeCommands();
  }

  /**
   * Initialize all commands
   */
  initializeCommands() {
    this.commandInstances = {
      configure: createConfigureCommand(this.app),
      'sign-in': createSignInCommand(this.app),
      download: createDownloadCommand(this.app),
      deploy: createDeployCommand(this.app),
      delete: createDeleteCommand(this.app),
      watch: createWatchCommand(this.app),
      'storefront-build': createStorefrontBuildCommand(this.app),
      'storefront-dev': createStorefrontDevCommand(this.app),
      'storefront-create': createStorefrontCreateCommand(this.app),
    };

    this.commands = Object.keys(this.commandInstances);
  }

  /**
   * Group commands by their group property
   * @returns {Object} Object with group names as keys and arrays of command names as values
   * @private
   */
  _groupCommandsByGroup() {
    const grouped = {
      _topLevel: [], // Commands with no group (null)
    };

    for (const name of this.commands) {
      const cmd = this.commandInstances[name];
      const group = cmd.group;

      if (group === null) {
        grouped._topLevel.push(name);
      } else {
        if (!grouped[group]) {
          grouped[group] = [];
        }
        grouped[group].push(name);
      }
    }

    return grouped;
  }

  /**
   * Register a single command with Commander
   * @param {Object} parentCommand Commander command instance to register on
   * @param {string} name Command name
   * @private
   */
  _registerSingleCommand(parentCommand, name) {
    const cmd = this.commandInstances[name];
    const command = parentCommand
      .command(cmd.syntax || name)
      .description(cmd.description);

    // Add options if available
    if (cmd.options) {
      for (const option of cmd.options) {
        command.option(option.flags, option.description, option.defaultValue);
      }
    }

    // Store the command action for later updating
    this.commandActions[name] = command;

    // Set the action handler
    command.action((...args) => {
      if (!this.app) {
        throw new Error(
          `Command ${name} requires an app instance to be set first`,
        );
      }
      return cmd.execute(...args);
    });
  }

  /**
   * Register all commands with Commander
   * Groups commands into subcommands based on their group property
   * @param {Object} program Commander program instance
   */
  registerCommands(program) {
    const grouped = this._groupCommandsByGroup();

    // Register top-level commands (no group)
    for (const name of grouped._topLevel) {
      this._registerSingleCommand(program, name);
    }

    // Register grouped commands as subcommands
    for (const [groupName, commandNames] of Object.entries(grouped)) {
      if (groupName === '_topLevel') continue;

      const groupConfig = COMMAND_GROUPS[groupName];
      if (!groupConfig) {
        console.warn(`Unknown command group: ${groupName}`);
        continue;
      }

      // Create group command
      const groupCommand = new Command(groupName).description(
        groupConfig.description,
      );

      // Register subcommands under the group
      for (const name of commandNames) {
        this._registerSingleCommand(groupCommand, name);
      }

      // Add the group command to the main program
      program.addCommand(groupCommand);

      // Store reference to group command
      this.groupCommands[groupName] = groupCommand;
    }
  }

  /**
   * Set the app instance for all commands
   * @param {Object} app Application instance
   */
  setApp(app) {
    if (!app) {
      throw new Error('Cannot set null app instance');
    }

    this.app = app;

    // Update all command instances with the app
    for (const name of this.commands) {
      const cmd = this.commandInstances[name];
      if (cmd && typeof cmd.setApp === 'function') {
        cmd.setApp(app);
      }
    }
  }
}

/**
 * Factory function to create a command registry
 * @param {Object} app Application instance (optional)
 * @returns {CommandRegistry} New command registry instance
 */
export function createCommandRegistry(app = null) {
  return new CommandRegistry(app);
}
