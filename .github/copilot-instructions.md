# Finqu CLI - AI Coding Guidelines

## Project Overview

Finqu CLI is a Node.js command-line tool for Finqu e-commerce theme development. Built with ES modules, Commander.js for CLI parsing, and a modular dependency injection architecture.

## Architecture

### Layered Structure

```
src/
├── cli.js           # Entry point - parses args, initializes app, registers commands
├── index.js         # Public exports and createFullApp() factory
├── core/            # Core infrastructure (app, config, logger, errors)
├── commands/        # Command implementations extending BaseCommand
├── services/        # External integrations (HTTP, OAuth, Theme API)
└── io/              # File system abstraction
```

### Dependency Injection Pattern

The app uses constructor injection. Services are created in [src/core/app.js](src/core/app.js) and passed to commands:

```javascript
// Commands receive the full app context
const app = await createFullApp(options, logger, configManager);
// Commands access services via: this.app.services.themeApi, this.logger, etc.
```

### Command Structure

All commands extend `BaseCommand` from [src/commands/base.js](src/commands/base.js):

```javascript
export class MyCommand extends BaseCommand {
  get name() {
    return 'my-command';
  }
  get description() {
    return 'Does something';
  }
  get group() {
    return 'theme';
  } // null for top-level commands
  get syntax() {
    return 'my-command [args...]';
  }
  get options() {
    return [{ flags: '--flag', description: '...' }];
  }

  async execute(args, options) {
    // Use this.logger, this.config, this.fileSystem, this.app.services.*
  }
}

export function createMyCommand(app) {
  return new MyCommand(app);
}
```

Commands are registered in [src/commands/index.js](src/commands/index.js) - add new commands there.

## Development Workflow

```bash
npm run dev          # Vite dev mode
npm run build        # Build to dist/
npm test             # Run Vitest tests
npm run test:watch   # Watch mode
npm run test:coverage
```

## Testing Patterns

Tests use Vitest with mocks from [**tests**/helpers/](/__tests__/helpers/):

```javascript
import { createMockApp } from '../helpers/testSetup.js';
import {
  createMockLogger,
  createMockThemeApi,
} from '../helpers/mockServices.js';

// Create mock app with all services
const mockApp = createMockApp({
  config: { themeDir: '/test/path' }, // Config values
  themeApi: createMockThemeApi(), // Custom mocks
});

// Test command
const command = new DeployCommand(mockApp);
await command.execute(['file.js'], { clean: true });
expect(mockApp.services.themeApi.uploadAsset).toHaveBeenCalled();
```

Key test utilities:

- `createMockApp()` - Full app mock with logger, config, fileSystem, services
- `createMockLogger/Config/ThemeApi/FileSystem()` - Individual service mocks
- `setupFileSystemMocks()` - Configure file existence/content for tests

## Error Handling

Use `AppError` from [src/core/error.js](src/core/error.js) with factory methods:

```javascript
throw AppError.validationError('Invalid input', details);
throw AppError.configError('Missing configuration');
throw AppError.authError('Token expired');
throw AppError.fromApiError(apiResponse);
```

## Configuration

`ConfigManager` in [src/core/config.js](src/core/config.js) handles multi-environment config:

```javascript
this.config.get('themeDir'); // Get value
this.config.set('key', value, true); // Set persistent value
this.config.env('staging').get('key'); // Switch environment
```

Config is stored in `finqu.config.json` with environment keys (production, staging, etc.).

## Key Conventions

- **ES Modules only** - Use `import`/`export`, file extensions required in imports
- **Factory functions** - Export both class and `createXxx()` factory for each module
- **Async/await** - All I/O operations are async
- **Batch processing** - Use `BATCH_SIZE = 10` for parallel API operations (see deploy.js)
- **Verbose logging** - Use `this.logger.printVerbose()` for debug output, enabled with `-v`
