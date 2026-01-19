/**
 * Base command class for Finqu Theme Kit
 * Provides common functionality for all commands
 */
import { AppError } from '../core/error.js';

/**
 * BaseCommand class that all commands should extend from
 */
export class BaseCommand {
  /**
   * Create a new command
   * @param {Object} app Application instance with all services (optional)
   */
  constructor(app = null) {
    this.app = app;

    if (app) {
      this.setApp(app);
    }
  }

  /**
   * Set the application instance for this command
   * @param {Object} app Application instance with all services
   */
  setApp(app) {
    if (!app) {
      throw new Error('Command requires valid app instance');
    }

    this.app = app;
    this.config = app.config;
    this.logger = app.logger;
    this.fileSystem = app.fileSystem;
  }

  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    throw new Error('Command name not implemented');
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  get description() {
    throw new Error('Command description not implemented');
  }

  /**
   * Get command group
   * Commands with a group are registered as subcommands under that group
   * @returns {string|null} Group name (e.g., 'theme') or null for top-level commands
   */
  get group() {
    return null; // Default is top-level command
  }

  /**
   * Get command syntax
   * Defines how the command is used, including any arguments
   * @returns {string} Command syntax (e.g., "command [arg]" or "command <required> [optional]")
   */
  get syntax() {
    return this.name; // Default is just the command name with no arguments
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [];
  }

  /**
   * Execute the command
   * Abstract method that should be implemented by subclasses
   * @param {Object} options Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(options) {
    if (!this.app) {
      throw new Error('Command requires app instance before execution');
    }
    throw new Error('Command execute method not implemented');
  }

  /**
   * Validate command options
   * @param {Object} options Options to validate
   * @param {Array<string>} required Required option keys
   * @throws {AppError} If validation fails
   */
  validateOptions(options, required = []) {
    if (!options) {
      throw AppError.validationError('Command options are required');
    }

    for (const key of required) {
      if (options[key] === undefined || options[key] === null) {
        throw AppError.validationError(`Required option '${key}' is missing`);
      }
    }
  }
}
