# Finqu CLI

Finqu CLI is a command-line tool for working with the Finqu unified commerce platform. It provides workflows for theme development (configure, download, deploy, dev) and headless storefront development (create, build, dev) with Puck editor integration.

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

### 3. Install the Local Theme Development Tool

The local theme development server is provided by the separate `finqu-theme-dev` binary.

Install instructions are available here:

https://developers.finqu.com/apis-and-tools/theme-development-kit/install

### 4. Start Local Theme Development

Start the local theme development server:

```bash
finqu theme dev
```

On first run, the CLI checks whether `finqu-theme-dev` has already been authenticated. If not, it automatically runs `finqu-theme-dev auth` and lets that tool guide you through entering your store URL and channel API key.

After authentication, the local server is started with real store data and hot reload.

### 5. Create a Storefront (Optional)

Create a new headless storefront project:

```bash
finqu storefront create my-storefront
```

This will create a new Next.js project with Puck editor integration and sample components.

## Command Reference

### Global Options

These global options can be used with any command:

| Option                | Description                    | Default  |
| --------------------- | ------------------------------ | -------- |
| `-v, --verbose`       | Enable detailed logging output | `false`  |
| `-c, --config <path>` | Path to the configuration file | `./.env` |
| `--help`              | Display help information       |          |
| `--version`           | Display version information    |          |

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

### App Commands

All app-related commands are grouped under `finqu app`:

#### create

Create a new app:

```bash
finqu app create [name]
```

| Option                      | Description        | Default                                      |
| --------------------------- | ------------------ | -------------------------------------------- |
| `--name <name>`             | App display name   |                                              |
| `--base-uri <uri>`          | HTTP base URI      | `http://localhost:3000`                      |
| `--install-endpoint <path>` | Install endpoint   | `/api/install`                               |
| `--redirect-uri <uri>`      | OAuth redirect URI | `http://localhost:3000/api/install/callback` |

Any missing values will be prompted interactively. The command creates a draft app and scaffolds a project directory.

#### link

Link the current project to an existing app:

```bash
finqu app link <appId>
```

Saves the app ID to your configuration so subsequent commands can resolve it automatically.

#### list

List all your apps:

```bash
finqu app list
```

Displays a table with ID, name, handle, status, and version. The currently linked app is marked with `●`.

#### info

Show app details:

```bash
finqu app info
```

| Option          | Description                         |
| --------------- | ----------------------------------- |
| `--app-id <id>` | App ID (uses linked app if omitted) |

Displays name, handle, ID, publish status, version, client ID, redirect URIs, base URI, and version history.

#### update

Update app configuration or listing:

```bash
finqu app update
```

| Option                   | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `--app-id <id>`          | App ID (uses linked app if omitted)                       |
| `--configuration <json>` | Configuration as JSON string                              |
| `--listing <json>`       | Listing data as JSON string                               |
| `--redirect-uri <uri>`   | OAuth redirect URI (use `\|` separator for multiple)      |
| `--locations <codes...>` | ISO country codes to restrict availability (omit for all) |

#### delete

Delete an app:

```bash
finqu app delete
```

| Option          | Description                         |
| --------------- | ----------------------------------- |
| `--app-id <id>` | App ID (uses linked app if omitted) |

Draft apps are deleted immediately. Published apps have their deletion scheduled.

#### release

Release a new app version:

```bash
finqu app release
```

| Option                | Description                             |
| --------------------- | --------------------------------------- |
| `--app-id <id>`       | App ID (uses linked app if omitted)     |
| `--version <version>` | Explicit version in MAJOR.MINOR.PATCH   |
| `--type <type>`       | Bump type: `major`, `minor`, or `patch` |
| `--changelog <text>`  | Release notes                           |

#### publish

Publish the app to the app store:

```bash
finqu app publish
```

| Option          | Description                         |
| --------------- | ----------------------------------- |
| `--app-id <id>` | App ID (uses linked app if omitted) |

#### unpublish

Remove the app from the app store:

```bash
finqu app unpublish
```

| Option          | Description                         |
| --------------- | ----------------------------------- |
| `--app-id <id>` | App ID (uses linked app if omitted) |

#### share

Get or create a share link for the app:

```bash
finqu app share
```

| Option          | Description                         |
| --------------- | ----------------------------------- |
| `--app-id <id>` | App ID (uses linked app if omitted) |

#### rotate-secret

Rotate the OAuth client secret:

```bash
finqu app rotate-secret
```

| Option          | Description                         |
| --------------- | ----------------------------------- |
| `--app-id <id>` | App ID (uses linked app if omitted) |

Displays the new client secret after rotation.

#### listen

Connect to Finqu realtime webhooks and forward events to localhost:

```bash
finqu app listen
```

| Option                 | Description                                             | Default                          |
| ---------------------- | ------------------------------------------------------- | -------------------------------- |
| `--url <url>`          | Local webhook receiver URL                              | `http://localhost:3000/webhooks` |
| `--realtime-url <url>` | Realtime websocket URL override                         |                                  |
| `--topic <topics...>`  | Only forward matching topics (space or comma separated) |                                  |

Requires authentication via `finqu sign-in`. Forwards webhook event envelopes as JSON to the local URL. Handles graceful shutdown on SIGINT/SIGTERM.

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

#### dev

Start local theme development using the `finqu-theme-dev` binary:

```bash
finqu theme dev
```

| Option                | Description          | Default |
| --------------------- | -------------------- | ------- |
| `-p, --port <number>` | Port to listen on    | `3000`  |
| `-d, --dir <path>`    | Theme directory path |         |

This command provides the recommended local theme development workflow:

1. Checks that `finqu-theme-dev` is installed and available on your `PATH`
2. Checks whether `finqu-theme-dev` authentication has already been completed
3. Automatically starts `finqu-theme-dev auth` if credentials are missing
4. Starts the local theme development server with `finqu-theme-dev serve`

The `finqu-theme-dev` tool uses its own credentials file at `~/.finqu-theme-dev/credentials.json` and requires a channel API key. This is separate from the OAuth access token used by `finqu sign-in`.

#### watch

Automatically deploy changes to assets as you work:

```bash
finqu theme watch
```

| Option                   | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `--ignore <patterns...>` | Patterns to ignore (in addition to default ignores) |

This command monitors your local theme directory for changes and automatically uploads modified files to your connected theme.

> **Deprecated:** `finqu theme watch` is deprecated and will be removed in a future release. Use `finqu theme dev` for local theme rendering and a better development workflow.

### Utility Commands

#### migrate

Convert a legacy `finqu.config.json` configuration file to the new `.env` format:

```bash
finqu migrate
```

| Option                 | Description                                    | Default             |
| ---------------------- | ---------------------------------------------- | ------------------- |
| `--json-config <path>` | Path to the legacy JSON configuration file     | `finqu.config.json` |
| `--output <path>`      | Output path for the generated `.env` file      | `.env`              |
| `--force`              | Overwrite the output file if it already exists | `false`             |

The migration process:

1. Reads the legacy `finqu.config.json` file
2. Extracts settings from the `production` environment (warns about other environments)
3. Flattens nested `store` object into individual keys
4. Writes all values as `FINQU_`-prefixed variables to the `.env` file
5. Preserves any existing non-`FINQU_` keys in the output file

### Storefront Commands

All storefront-related commands are grouped under `finqu storefront`:

#### create

Create a new Finqu storefront project with a modern headless architecture:

```bash
finqu storefront create [project-name]
```

| Option                  | Description                                 |
| ----------------------- | ------------------------------------------- |
| `[project-name]`        | Optional name for your project              |
| `-t, --template <url>`  | Git repository URL to use as template       |
| `-b, --branch <branch>` | Branch to clone (default: main)             |
| `--embedded`            | Use embedded templates instead of git clone |

If no project name is provided, you'll be prompted to enter one. The command will create a new directory with all necessary files and configurations based on the template repository.

#### build

Build Puck configuration files from your component files:

```bash
finqu storefront build
```

| Option                    | Description                           | Default       |
| ------------------------- | ------------------------------------- | ------------- |
| `-c, --components <path>` | Path to components directory          | `components`  |
| `-o, --output <path>`     | Output directory for generated config | `.storefront` |

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

| Option                    | Description                           | Default       |
| ------------------------- | ------------------------------------- | ------------- |
| `-c, --components <path>` | Path to components directory          | `components`  |
| `-o, --output <path>`     | Output directory for generated config | `.storefront` |
| `-p, --port <number>`     | Port for Next.js dev server           | `3000`        |

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

All configuration keys listed below can also be set as environment variables with a `FINQU_` prefix in screaming snake case (e.g. `FINQU_THEME_DIR`, `FINQU_RESOURCE_URL`). Environment variables in your `.env` file and process environment are both supported.

## Configuration Structure

Finqu CLI uses a `.env` file (default: `.env` in current directory) to store settings as `FINQU_`-prefixed environment variables.

### Example Configuration

```env
FINQU_THEME_DIR=/path/to/theme/directory
FINQU_RESOURCE_URL=https://<your-env>.api.myfinqu.com
FINQU_API_VERSION=1.2
FINQU_ACCESS_TOKEN=<oauth_access_token>
FINQU_REFRESH_TOKEN=<oauth_refresh_token>
FINQU_EXPIRES_AT=1784447850458
FINQU_STORE_MERCHANT_ID=6
FINQU_STORE_ID=57704
FINQU_STORE_THEME_ID=870
FINQU_STORE_VERSION_ID=152bd77a7749171803307263acec8028
FINQU_STORE_DOMAIN=example.finqustore.com
```

### Configuration Keys

| Key               | Env Variable              | Description                                               |
| ----------------- | ------------------------- | --------------------------------------------------------- |
| `themeDir`        | `FINQU_THEME_DIR`         | Local directory path for theme files                      |
| `resourceUrl`     | `FINQU_RESOURCE_URL`      | Finqu API base URL (set by `finqu sign-in`)               |
| `apiVersion`      | `FINQU_API_VERSION`       | Finqu API version (optional, default: `1.2`)              |
| `accessToken`     | `FINQU_ACCESS_TOKEN`      | OAuth 2.0 access token (automatically managed)            |
| `refreshToken`    | `FINQU_REFRESH_TOKEN`     | OAuth 2.0 refresh token (automatically managed)           |
| `expiresAt`       | `FINQU_EXPIRES_AT`        | Access token expiration timestamp (automatically managed) |
| `appRealtimeUrl`  | `FINQU_APP_REALTIME_URL`  | Realtime websocket URL used by `finqu app listen`         |
| `storeMerchantId` | `FINQU_STORE_MERCHANT_ID` | Store merchant ID (set by `finqu theme configure`)        |
| `storeId`         | `FINQU_STORE_ID`          | Store ID (set by `finqu theme configure`)                 |
| `storeThemeId`    | `FINQU_STORE_THEME_ID`    | Theme ID (set by `finqu theme configure`)                 |
| `storeVersionId`  | `FINQU_STORE_VERSION_ID`  | Theme version ID (set by `finqu theme configure`)         |
| `storeDomain`     | `FINQU_STORE_DOMAIN`      | Store domain (set by `finqu theme configure`)             |
| `verbose`         | `FINQU_VERBOSE`           | Enable or disable verbose logging                         |

> **Note:** The `.env` file is automatically created and updated by the CLI commands. You typically don't need to edit it manually.

### Migrating from finqu.config.json

If you are upgrading from an older version that used `finqu.config.json`, run the migration command:

```bash
finqu migrate
```

This converts your existing JSON configuration to the new `.env` format. See the [migrate](#migrate) command reference for options.

## Common Workflows

### Theme Development Setup

1. Install the Finqu CLI: `npm install -g @finqu/cli`
2. Authenticate: `finqu sign-in`
3. Configure your theme: `finqu theme configure`
4. Download theme assets: `finqu theme download`
5. Install `finqu-theme-dev`: https://developers.finqu.com/apis-and-tools/theme-development-kit/install
6. Start local development: `finqu theme dev`

### App Webhook Forwarding Setup

1. Authenticate: `finqu sign-in`
2. Start a local webhook receiver (default target: `http://localhost:3000/webhooks`)
3. Start realtime forwarding: `finqu app listen`
4. Optionally filter topics: `finqu app listen --topic orders/create orders/activate`

### Theme Development Cycle

1. Make changes to theme files
2. Preview changes locally with `finqu theme dev`
3. Deploy changes when ready with `finqu theme deploy`

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
- **App Webhook 403 Errors**: Run `finqu sign-in` to refresh credentials
- **App Webhook Connection Errors**: Start with `finqu app listen --realtime-url wss://<realtime-domain>/ws/webhooks` to verify endpoint configuration
- **Theme Dev Authentication Errors**: Run `finqu theme dev` again to trigger `finqu-theme-dev auth`, or run `finqu-theme-dev auth` directly
- **Theme Dev Binary Not Found**: Install `finqu-theme-dev` using the instructions at https://developers.finqu.com/apis-and-tools/theme-development-kit/install
- **Permission Errors**: Ensure you have the right access permissions to the theme
- **API Errors**: Use the `-v` flag to get verbose output for debugging

## Support

For additional support:

- Visit [Finqu Developer Documentation](https://developers.finqu.com)
- Contact [Finqu Support](mailto:contact@finqu.com)

## License

Proprietary Software. All rights reserved.
© Finqu. Unauthorized use, distribution, or modification is prohibited.
