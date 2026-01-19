/**
 * Command group definitions for Finqu CLI
 * Centralized configuration for command grouping and extensibility
 */

/**
 * Command group definitions
 * Each group becomes a subcommand with its own set of commands
 * @type {Object.<string, {description: string}>}
 */
export const COMMAND_GROUPS = {
  theme: {
    description: 'Theme development and deployment commands',
  },
  // Future groups can be added here:
  // apps: {
  //   description: 'Application management commands',
  // },
  // storefront: {
  //   description: 'Storefront management commands',
  // },
};
