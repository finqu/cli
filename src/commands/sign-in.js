/**
 * Sign-in command for Finqu Theme Kit
 * Handles authentication using OAuth
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

/**
 * SignInCommand class for handling OAuth authentication
 */
export class SignInCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'sign-in';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  get description() {
    return 'Sign in to the Finqu API';
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [
      {
        flags: '--key <key>',
        description: 'API key',
      },
      {
        flags: '--secret <secret>',
        description: 'API secret',
      },
    ];
  }

  /**
   * Execute the sign-in command
   * @param {Object} options Command options
   * @param {string} options.configPath Path to the configuration file (optional)
   * @param {string} options.key Optional API key override
   * @param {string} options.secret Optional API secret override
   * @returns {Promise<Object>} Command result
   */
  async execute(options) {
    // Don't require configPath as it's provided by default in cli.js
    this.logger.printStatus('Signing in to Finqu API...');

    try {
      // Pass correct parameters to getAccessToken (key, secret, profileService)
      await this.app.services.tokenManager.getAccessToken(
        options.key,
        options.secret,
        this.app.services.profile,
      );

      this.logger.printSuccess('Sign in successful.');

      return { success: true };
    } catch (err) {
      if (err instanceof AppError) {
        this.logger.printError(err.message);
        return { success: false, error: err };
      }

      this.logger.handleError(err);
      return { success: false, error: err };
    }
  }
}

/**
 * Factory function to create a SignInCommand
 * @param {Object} app Application instance
 * @returns {SignInCommand} A new command instance
 */
export function createSignInCommand(app) {
  return new SignInCommand(app);
}
