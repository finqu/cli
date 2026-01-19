/**
 * Logger module for Finqu Theme Kit
 * Handles all console output with color formatting and verbosity control
 */
import chalk from 'chalk';

/**
 * Logger class with configurable verbosity
 */
export class Logger {
    /**
     * Creates a new logger
     */
    constructor() {
        // Initialize verbose mode to false by default
        this.verbose = false;
        this.seenErrors = new Set(); // Track errors to avoid duplicates
    }

    /**
     * Set the verbosity mode
     * @param {boolean} isVerbose True to enable verbose mode, false to disable
     */
    setVerbose(isVerbose) {
        this.verbose = !!isVerbose; // Ensure boolean value
    }

    /**
     * Check if verbose logging is enabled
     * @returns {boolean} True if verbose mode is enabled
     */
    isVerbose() {
        return this.verbose;
    }

    /**
     * Safely stringify objects for logging, hiding sensitive information
     * @param {*} data Data to stringify
     * @returns {string} Safe string representation
     * @private
     */
    _safeStringify(data) {
        if (!data || typeof data !== 'object') {
            return String(data);
        }

        // Create a copy of the data to sanitize
        const sanitized = JSON.parse(JSON.stringify(data));

        // Hide sensitive information
        const sensitiveKeys = ['authorization', 'authorization:', 'bearer', 'token', 'password', 'secret', 'key', 'accesstoken', 'refreshtoken'];

        const sanitizeObj = (obj) => {
            if (!obj || typeof obj !== 'object') return;

            Object.keys(obj).forEach((key) => {
                // Check if key contains sensitive information
                const lowercaseKey = key.toLowerCase();
                if (sensitiveKeys.some((k) => lowercaseKey.includes(k))) {
                    if (typeof obj[key] === 'string' && obj[key].length > 8) {
                        obj[key] = `${obj[key].substring(0, 4)}...${obj[key].substring(obj[key].length - 4)}`;
                    }
                }

                // Recursively sanitize nested objects
                if (obj[key] && typeof obj[key] === 'object') {
                    sanitizeObj(obj[key]);
                }
            });
        };

        sanitizeObj(sanitized);

        try {
            return JSON.stringify(sanitized, null, 2);
        } catch (e) {
            return '[Complex Object]';
        }
    }

    /**
     * Print verbose message
     * @param {string} message Message
     * @param {*} data Additional data
     */
    printVerbose(message, data = null) {
        if (this.isVerbose()) {
            // Print the message first
            console.log(chalk.dim(`  ${message}`));

            // Log data only if it's meaningful and present
            if (data) {
                // For HTTP requests, show a simplified version
                if (message.includes('request to')) {
                    // Just show URL for requests
                    if (typeof data === 'object' && data.url) {
                        // Don't output request details
                    }
                }
                // For response data, simplify the output
                else if (message.includes('successful') || message.includes('failed')) {
                    // For errors, show minimal info
                    if (typeof data === 'object' && (data.error || data.status)) {
                        const status = data.status ? `Status: ${data.status}` : '';
                        const error = data.error ? `Error: ${data.error}` : '';
                        if (status || error) {
                            console.log(chalk.dim(`  ${status} ${error}`.trim()));
                        }
                    }
                }
                // For anything else, just print the data
                else if (typeof data === 'object') {
                    // Avoid printing large objects in verbose mode
                }
            }
        }
    }

    /**
     * Print success message
     * @param {string} message Success message
     * @param {*} data Additional data
     */
    printSuccess(message, data = null) {
        console.log(chalk.green('✓ ') + message);

        // Optional data is rarely needed in success messages for end users
        if (data && this.isVerbose()) {
            console.log(chalk.dim(`  ${typeof data === 'object' ? this._safeStringify(data) : data}`));
        }
    }

    /**
     * Print info message with formatting
     * @param {string} message Info message
     * @param {*} data Additional data
     */
    printInfo(message, data = null) {
        console.log(chalk.blue('i ') + message);

        if (data && this.isVerbose()) {
            console.log(chalk.dim(`  ${typeof data === 'object' ? this._safeStringify(data) : data}`));
        }
    }

    /**
     * Print status message with action in progress
     * @param {string} message Status message
     */
    printStatus(message) {
        console.log(chalk.cyan('→ ') + chalk.bold(message));
    }

    /**
     * Print error message
     * @param {string} message Error message
     * @param {*} err Error object
     */
    printError(message, err = null) {
        // Create an error signature to avoid duplicates
        const signature = `${message}:${err ? err.message || JSON.stringify(err) : ''}`;

        if (this.seenErrors.has(signature)) {
            return; // Skip duplicate errors
        }

        this.seenErrors.add(signature);

        console.error(chalk.red('✖ ') + message);

        // Show error details only if meaningful and not redundant
        if (err) {
            if (typeof err === 'object') {
                // For API errors with a specific structure
                if (err.error && typeof err.error === 'string') {
                    // Don't repeat the error message if it's already part of the main message
                    if (!message.includes(err.error)) {
                        console.error(chalk.dim(`  ${err.error}`));
                    }
                }
                // For standard Error objects
                else if (err.message && typeof err.message === 'string') {
                    // Don't repeat the error message if it's already part of the main message
                    if (!message.includes(err.message)) {
                        console.error(chalk.dim(`  ${err.message}`));
                    }
                }
                // For other object errors
                else if (this.isVerbose()) {
                    // In verbose mode, show a simplified version of the error object
                    const simplifiedErr = this._safeStringify(err).split('\n').slice(0, 3).join('\n');
                    if (simplifiedErr.length > 0 && simplifiedErr !== '{}') {
                        console.error(chalk.dim(`  ${simplifiedErr}${simplifiedErr.length > 120 ? '...' : ''}`));
                    }
                }
            }
            // For string errors
            else if (typeof err === 'string' && !message.includes(err)) {
                console.error(chalk.dim(`  ${err}`));
            }
        }
    }

    /**
     * Print message
     * @param {string} message Message
     */
    print(message) {
        console.log(`  ${message}`);
    }

    /**
     * Handle API errors
     * @param {*} err Error object
     */
    handleError(err) {
        // Reset seen errors to ensure this critical error is shown
        this.seenErrors.clear();

        if (err && err.error) {
            // For structured API errors
            this.printError(err.error_description || err.error);
        } else if (err && err.message) {
            // For standard errors
            this.printError(err.message);

            // Show stack trace only in verbose mode
            if (this.isVerbose() && err.stack) {
                console.error(chalk.dim('  Stack trace:'));
                console.error(chalk.dim(`  ${err.stack.split('\n').slice(1, 4).join('\n')}`));
            }

            // Always show help info
            console.error(chalk.yellow('\nIf this problem persists, please report it at:'));
            console.error(chalk.yellow('https://github.com/finqu/cli/issues'));
        } else {
            // For unknown errors
            this.printError('An unknown error occurred', this.isVerbose() ? err : null);

            // Always show help info
            console.error(chalk.yellow('\nIf this problem persists, please report it at:'));
            console.error(chalk.yellow('https://github.com/finqu/cli/issues'));
        }

        process.exit(1);
    }
}

/**
 * Factory function to create a Logger instance
 * @returns {Logger} A new Logger instance
 */
export function createLogger() {
    return new Logger();
}
