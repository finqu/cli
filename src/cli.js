#!/usr/bin/env node
/**
 * Finqu CLI
 * Command-line interface using the new modular code structure
 */
import path from 'path';
import { Command } from 'commander';
import { createFullApp } from './index.js'; // Assuming this now accepts logger and config
import { createLogger } from './core/logger.js';
import { createConfigManager } from './core/config.js';
import { createFileSystem } from './io/fileSystem.js';

// Configuration constants
const DEFAULT_CONFIG_FILE =
  process.env.FINQU_CONFIG || path.join(process.cwd(), 'finqu.config.json');

/**
 * Main CLI entry point function
 */
async function main() {
  // 1. Initialize Logger (starts with verbose off)
  const logger = createLogger();

  try {
    // Create the Commander program
    const program = new Command();

    // Configure basic CLI options
    program
      .name('finqu')
      .description('Finqu CLI')
      .version(__APP_VERSION__)
      .option('-v, --verbose', 'Enable verbose logging', false) // Default to false
      .option('-e, --env <environment>', 'Environment to use', 'production') // Default to 'production'
      .option(
        '-c, --config <path>',
        'Path to config file',
        DEFAULT_CONFIG_FILE,
      );

    // 2. Parse arguments to get options like --verbose and --config
    // We parse *before* full app initialization to get these values
    program.parseOptions(process.argv);
    const options = program.opts(); // Get parsed options

    // 3. Initialize ConfigManager
    const fileSystem = createFileSystem(); // Needed for config manager
    const initialConfigData = {
      // Pass CLI options as initial data
      // ConfigManager will merge this with file data, prioritizing initial data
      [options.env]: {
        // Assuming 'production' is the default env, adjust if needed
        verbose: options.verbose,
      },
    };
    const configManager = await createConfigManager(
      fileSystem,
      options.config, // Use config path from options
      initialConfigData,
    );

    if (!configManager.get('themeDir')) {
      configManager.set('themeDir', process.cwd());
    }

    // 4. Update logger verbosity based on final config
    // This ensures config file settings are also considered
    logger.setVerbose(configManager.get('verbose', false)); // Use getter with default

    // Validate the theme directory from config before initializing the app
    const themeDir = configManager.get('themeDir');
    const validationResult = await fileSystem.validateDirectory(themeDir);
    if (!validationResult.valid) {
      logger.error(validationResult.error);
      throw new Error(`Invalid theme directory: ${themeDir}`);
    }

    // 5. Initialize the full application with pre-configured logger and config
    const app = await createFullApp(
      {
        // Pass other app-specific options if needed, e.g., fileSystem
        fileSystem: fileSystem,
      },
      logger,
      configManager,
    );

    // 6. Register all commands with Commander
    // The command registry now gets the fully initialized app instance
    app.commands.registerCommands(program); // Access commands via app

    // 7. Parse the full command line arguments and execute the command
    await program.parseAsync(process.argv);
  } catch (err) {
    // Use the initialized logger to handle errors
    logger.handleError(err);
    // process.exit(1) is handled within logger.handleError
  }
}

// Run the CLI
main();
