# Finqu CLI

Finqu CLI is a command-line tool for working with the Finqu unified commerce platform. It provides workflows for theme development (configure, download, deploy, watch) and headless storefront development (create, build, dev) with Puck editor integration.

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

### 3. Create a Storefront (Optional)

Create a new headless storefront project:

```bash
finqu storefront create my-storefront
```

This will create a new Next.js project with Puck editor integration and sample components.

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

### Storefront Commands

All storefront-related commands are grouped under `finqu storefront`:

#### create

Create a new Finqu storefront project with a modern headless architecture:

```bash
finqu storefront create [project-name]
```

| Option                  | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `[project-name]`        | Optional name for your project                  |
| `-t, --template <url>`  | Git repository URL to use as template           |
| `-b, --branch <branch>` | Branch to clone (default: main)                 |
| `--embedded`            | Use embedded templates instead of git clone     |

If no project name is provided, you'll be prompted to enter one. The command will create a new directory with all necessary files and configurations based on the template repository.

#### build

Build Puck configuration files from your component files:

```bash
finqu storefront build
```

| Option                  | Description                                       | Default       |
| ----------------------- | ------------------------------------------------- | ------------- |
| `-c, --components <path>` | Path to components directory                    | `components`  |
| `-o, --output <path>`     | Output directory for generated config           | `.storefront` |

This command scans your components directory for `*.puck.tsx` files and generates two Puck configuration files:

- `puck.edit.config.tsx` - Configuration for the Puck editor (with client-side interactivity)
- `puck.render.config.tsx` - Configuration for rendering components (supports React Server Components)

The build process:

1. Scans for component files with `.puck.tsx` extension
2. Extracts component metadata (categories, configuration)
3. Generates TypeScript configuration files
4. Automatically organizes components by category

Supported component patterns:

- **Single file**: `components/Hero.puck.tsx`
- **Folder with variants**: `components/Hero/Hero.edit.puck.tsx` and `Hero.render.puck.tsx`

#### dev

Start the development server with automatic rebuilding:

```bash
finqu storefront dev
```

| Option                    | Description                                     | Default       |
| ------------------------- | ----------------------------------------------- | ------------- |
| `-c, --components <path>` | Path to components directory                    | `components`  |
| `-o, --output <path>`     | Output directory for generated config           | `.storefront` |
| `-p, --port <number>`     | Port for Next.js dev server                     | `3000`        |

This command provides a complete development experience:

1. Runs an initial build of Puck configuration
2. Starts the Next.js development server
3. Watches for changes to component files
4. Automatically rebuilds configuration when components change
5. Hot reloads the browser on changes

If the specified port is already in use, the command will automatically find and use the next available port.

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

### Theme Development Setup

1. Install the Finqu CLI: `npm install -g @finqu/cli`
2. Authenticate: `finqu sign-in`
3. Configure your theme: `finqu theme configure`
4. Download theme assets: `finqu theme download`

### Theme Development Cycle

1. Make changes to theme files
2. Deploy changes: `finqu theme deploy`
3. Or use the watcher: `finqu theme watch`

### Storefront Development Setup

1. Install the Finqu CLI: `npm install -g @finqu/cli`
2. Create a new storefront project: `finqu storefront create my-storefront`
3. Navigate to the project: `cd my-storefront`
4. Install dependencies: `npm install`
5. Start development server: `finqu storefront dev`

### Storefront Development Cycle

1. Create or modify components in the `components/` directory with `.puck.tsx` extension
2. The dev server automatically rebuilds the configuration
3. View changes at `http://localhost:3000`
4. Build for production: `finqu storefront build && next build`

## Troubleshooting

- **Authentication Errors**: Use `finqu sign-in` to refresh your authentication
- **Permission Errors**: Ensure you have the right access permissions to the theme
- **API Errors**: Use the `-v` flag to get verbose output for debugging

## Support

For additional support:

- Visit [Finqu Developer Documentation](https://developers.finqu.com)
- Contact [Finqu Support](mailto:contact@finqu.com)

## License

Proprietary Software. All rights reserved.
© Finqu. Unauthorized use, distribution, or modification is prohibited.
