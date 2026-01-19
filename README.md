# Finqu CLI

Finqu CLI is a command-line tool for working with the Finqu unified commerce platform. Today it focuses on theme development workflows (configure, download, deploy, watch), but it’s designed to expand to other areas over time.

## Installation

### Global installation via npm

```bash
npm install -g @finqu/cli
```

## Getting Started

### 1. Authentication

Before using the Finqu CLI, you need to authenticate with your Finqu account:

```bash
finqu sign-in
```

If you have API credentials, you can provide them directly:

```bash
finqu sign-in --key YOUR_API_KEY --secret YOUR_API_SECRET
```

### 2. Configure Your Theme

Configure your project to work with a theme:

```bash
finqu theme configure
```

You'll be prompted to select a theme to work with.

## Command Reference

### Global Options

These global options can be used with any command:

| Option                    | Description                                  | Default               |
| ------------------------- | -------------------------------------------- | --------------------- |
| `-v, --verbose`           | Enable detailed logging output               | `false`               |
| `-e, --env <environment>` | Specify the configuration environment to use | `production`          |
| `-c, --config <path>`     | Path to the configuration file               | `./finqu.config.json` |
| `--help`                  | Display help information                     |                       |
| `--version`               | Display version information                  |                       |

### Authentication

#### sign-in

Authenticate with your Finqu account and obtain an access token:

```bash
finqu sign-in
```

| Option              | Description |
| ------------------- | ----------- |
| `--key <key>`       | API key     |
| `--secret <secret>` | API secret  |

The authentication process uses OAuth 2.0 and will open a browser window for you to complete the sign-in process if credentials are not provided directly.

### Theme Commands

All theme-related commands are grouped under `finqu theme`:

#### configure

Set up your project to work with a theme:

```bash
finqu theme configure
```

This interactive command walks you through:

1. Selecting a theme to work with
2. Saving the configuration to your configuration file

#### download

Download theme assets from the connected Finqu theme:

```bash
finqu theme download [sources...]
```

| Option         | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `[sources...]` | Optional file paths to download specific files or directories |

When no sources are specified, all theme assets will be downloaded to your local directory.

#### deploy

Upload local theme assets to the connected Finqu theme:

```bash
finqu theme deploy [sources...]
```

| Option         | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `--clean`      | Remove remote theme assets not found locally                 |
| `--force`      | Include restricted paths like config/ and .draft directories |
| `--no-compile` | Skip asset compilation on the server after upload            |
| `[sources...]` | Optional file paths to deploy specific files or directories  |

When no sources are specified, all local theme assets will be uploaded.

> **Note:** By default, the `config/settings_data.json` file and `config/.draft` directory are protected and will not be uploaded to prevent accidental overwrites of theme settings made in the backend theme editor. Use the `--force` option to include it if necessary.

#### delete

Delete specific assets from the theme:

```bash
finqu theme delete [sources...]
```

| Option         | Description                                         |
| -------------- | --------------------------------------------------- |
| `--no-compile` | Skip asset compilation on the server after deletion |
| `[sources...]` | File paths of assets to delete                      |

#### watch

Automatically deploy changes to assets as you work:

```bash
finqu theme watch
```

| Option                   | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `--ignore <patterns...>` | Patterns to ignore (in addition to default ignores) |

This command monitors your local theme directory for changes and automatically uploads modified files to your connected theme.

## Environment Variables

Finqu CLI supports the following environment variables:

| Variable                  | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `FINQU_CONFIG`            | Override the default configuration file path                                |
| `FINQU_API_CLIENT_ID`     | API Client key to use for authentication (alternative to using --key)       |
| `FINQU_API_CLIENT_SECRET` | API Client secret to use for authentication (alternative to using --secret) |

## Configuration Structure

Finqu CLI uses a JSON configuration file (default: `finqu.config.json`) to store settings. The configuration structure supports multiple environments.

### Sample Configurations

#### Example Configuration

```json
{
  "production": {
    "themeDir": "/path/to/theme/directory",
    "resourceUrl": "https://<your-env>.api.myfinqu.com",
    "apiVersion": "1.2",
    "accessToken": "<oauth_access_token>",
    "refreshToken": "<oauth_refresh_token>",
    "expiresAt": 1784447850458,
    "store": {
      "merchantId": 6,
      "id": 57704,
      "themeId": 870,
      "versionId": "152bd77a7749171803307263acec8028",
      "domain": "example.finqustore.com"
    }
  }
}
```

### Configuration Keys

| Key            | Description                                               |
| -------------- | --------------------------------------------------------- |
| `themeDir`     | Local directory path for theme files                      |
| `resourceUrl`  | Finqu API base URL (set by `finqu sign-in`)               |
| `apiVersion`   | Finqu API version (optional, default: `1.2`)              |
| `accessToken`  | OAuth 2.0 access token (automatically managed)            |
| `refreshToken` | OAuth 2.0 refresh token (automatically managed)           |
| `expiresAt`    | Access token expiration timestamp (automatically managed) |
| `store`        | Store/theme selection (set by `finqu theme configure`)    |
| `verbose`      | Enable or disable verbose logging                         |

> **Note:** The configuration file is automatically created and updated by the CLI commands. You typically don't need to edit it manually.

## Common Workflows

### Initial Setup

1. Install the Finqu CLI: `npm install -g @finqu/cli`
2. Authenticate: `finqu sign-in`
3. Configure your theme: `finqu theme configure`
4. Download theme assets: `finqu theme download`

### Development Cycle

1. Make changes to theme files
2. Deploy changes: `finqu theme deploy`
3. Or use the watcher: `finqu theme watch`

## Project Structure

A typical Finqu theme has the following structure:

```
theme-name/
├── assets/          # CSS, JavaScript, images, and fonts
├── config/          # Theme settings and configuration
│   └── settings_data.json   # Theme settings (protected during deploy)
├── layout/          # Layout templates
├── locales/         # Translation files (JSON format)
├── blocks/          # Reusable blocks
├── sections/        # Page sections
├── snippets/        # Code snippets
├── templates/       # Page templates
└── finqu.config.json  # CLI configuration file
```

## Troubleshooting

- **Authentication Errors**: Use `finqu sign-in` to refresh your authentication
- **Permission Errors**: Ensure you have the right access permissions to the theme
- **API Errors**: Use the `-v` flag to get verbose output for debugging
- **File Sync Issues**: Use `finqu theme deploy --clean` to ensure remote files match local files

## Support

For additional support:

- Visit [Finqu Developer Documentation](https://developers.finqu.com)
- Contact [Finqu Support](mailto:contact@finqu.com)

## License

Proprietary Software. All rights reserved.
© Finqu. Unauthorized use, distribution, or modification is prohibited.
