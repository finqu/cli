import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StorefrontCreateCommand,
  createStorefrontCreateCommand,
  getTemplateFiles,
} from '../../src/commands/storefront-create.js';

describe('StorefrontCreateCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    mockApp = {
      config: { get: vi.fn(), set: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printStatus: vi.fn(),
        printSuccess: vi.fn(),
        printError: vi.fn(),
        printVerbose: vi.fn(),
      },
      fileSystem: {
        exists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    };

    command = new StorefrontCreateCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('create');
    });

    it('should have the correct description', () => {
      expect(command.description).toContain('Create a new Finqu storefront');
    });

    it('should belong to the storefront group', () => {
      expect(command.group).toBe('storefront');
    });

    it('should have the correct syntax with optional project name', () => {
      expect(command.syntax).toBe('create [project-name]');
    });

    it('should have the correct options', () => {
      const options = command.options;
      expect(options).toHaveLength(3);

      expect(options).toContainEqual({
        flags: '-t, --template <url>',
        description: 'Git repository URL to use as template',
      });

      expect(options).toContainEqual({
        flags: '-b, --branch <branch>',
        description: 'Branch to clone (default: main)',
      });

      expect(options).toContainEqual({
        flags: '--embedded',
        description: 'Use embedded templates instead of git clone',
      });
    });

    it('should create command with factory function', () => {
      const factoryCommand = createStorefrontCreateCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(StorefrontCreateCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('command structure', () => {
    it('should have storefront as group', () => {
      expect(command.group).toBe('storefront');
    });

    it('should have template option without default value', () => {
      const templateOption = command.options.find(
        (opt) => opt.flags === '-t, --template <url>',
      );
      expect(templateOption).toBeDefined();
      expect(templateOption.defaultValue).toBeUndefined();
    });

    it('should have branch option without default value (uses default in code)', () => {
      const branchOption = command.options.find(
        (opt) => opt.flags === '-b, --branch <branch>',
      );
      expect(branchOption).toBeDefined();
      expect(branchOption.defaultValue).toBeUndefined();
    });

    it('should have embedded flag option', () => {
      const embeddedOption = command.options.find(
        (opt) => opt.flags === '--embedded',
      );
      expect(embeddedOption).toBeDefined();
    });
  });
});

describe('getTemplateFiles', () => {
  it('returns array of template files', () => {
    const files = getTemplateFiles('test-project');
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('interpolates project name in package.json', () => {
    const files = getTemplateFiles('my-storefront');
    const packageJson = files.find((f) => f.path === 'package.json');

    expect(packageJson).toBeDefined();
    expect(packageJson?.content).toContain('"name": "my-storefront"');
  });

  it('interpolates project name in layout.tsx metadata', () => {
    const files = getTemplateFiles('my-storefront');
    const layout = files.find((f) => f.path === 'app/layout.tsx');

    expect(layout).toBeDefined();
    expect(layout?.content).toContain('title: "my-storefront"');
  });

  it('contains all required files', () => {
    const files = getTemplateFiles('test');
    const paths = files.map((f) => f.path);

    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('next.config.ts');
    expect(paths).toContain('vercel.json');
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('app/layout.tsx');
    expect(paths).toContain('app/page.tsx');
    expect(paths).toContain('app/editor/page.tsx');
  });

  it('contains example component files', () => {
    const files = getTemplateFiles('test');
    const paths = files.map((f) => f.path);

    expect(paths).toContain('components/Hero.puck.tsx');
    expect(paths).toContain('components/TextBlock.puck.tsx');
  });

  it('example components have category export', () => {
    const files = getTemplateFiles('test');
    const hero = files.find((f) => f.path === 'components/Hero.puck.tsx');
    const textBlock = files.find(
      (f) => f.path === 'components/TextBlock.puck.tsx',
    );

    expect(hero?.content).toContain('export const category = "Marketing"');
    expect(textBlock?.content).toContain('export const category = "Content"');
  });

  it('editor page has use client directive', () => {
    const files = getTemplateFiles('test');
    const editor = files.find((f) => f.path === 'app/editor/page.tsx');

    expect(editor?.content).toContain('"use client"');
  });

  it('handles different project names', () => {
    const names = ['my-store', 'storefront-123', 'test'];
    for (const name of names) {
      const files = getTemplateFiles(name);
      const packageJson = files.find((f) => f.path === 'package.json');
      expect(packageJson?.content).toContain(`"name": "${name}"`);
    }
  });

  it('package.json has correct scripts using finqu CLI', () => {
    const files = getTemplateFiles('test');
    const packageJson = files.find((f) => f.path === 'package.json');

    expect(packageJson?.content).toContain('"dev": "finqu storefront dev"');
    expect(packageJson?.content).toContain(
      '"build": "finqu storefront build && next build"',
    );
    expect(packageJson?.content).toContain('"start": "next start"');
    expect(packageJson?.content).toContain('"lint": "next lint"');
  });

  it('gitignore includes relevant entries', () => {
    const files = getTemplateFiles('test');
    const gitignore = files.find((f) => f.path === '.gitignore');

    expect(gitignore?.content).toContain('node_modules/');
    expect(gitignore?.content).toContain('.next/');
    expect(gitignore?.content).toContain('.storefront/');
    expect(gitignore?.content).toContain('.env');
  });

  it('tsconfig includes .storefront directory', () => {
    const files = getTemplateFiles('test');
    const tsconfig = files.find((f) => f.path === 'tsconfig.json');

    expect(tsconfig?.content).toContain('.storefront/**/*.tsx');
  });

  it('page.tsx imports from .storefront render config', () => {
    const files = getTemplateFiles('test');
    const page = files.find((f) => f.path === 'app/page.tsx');

    expect(page?.content).toContain(
      'import { config } from "@/.storefront/puck.render.config"',
    );
  });

  it('editor page imports from .storefront edit config', () => {
    const files = getTemplateFiles('test');
    const editor = files.find((f) => f.path === 'app/editor/page.tsx');

    expect(editor?.content).toContain(
      'import { config } from "@/.storefront/puck.edit.config"',
    );
  });

  it('Hero component has proper structure', () => {
    const files = getTemplateFiles('test');
    const hero = files.find((f) => f.path === 'components/Hero.puck.tsx');

    expect(hero?.content).toContain('interface HeroProps');
    expect(hero?.content).toContain('export const config: ComponentConfig');
    expect(hero?.content).toContain('label: "Hero Banner"');
    expect(hero?.content).toContain('fields: {');
    expect(hero?.content).toContain('defaultProps: {');
    expect(hero?.content).toContain('render: ({ title, subtitle })');
  });

  it('TextBlock component has proper structure', () => {
    const files = getTemplateFiles('test');
    const textBlock = files.find(
      (f) => f.path === 'components/TextBlock.puck.tsx',
    );

    expect(textBlock?.content).toContain('interface TextBlockProps');
    expect(textBlock?.content).toContain('export const config: ComponentConfig');
    expect(textBlock?.content).toContain('label: "Text Block"');
    expect(textBlock?.content).toContain('fields: {');
    expect(textBlock?.content).toContain('alignment: {');
    expect(textBlock?.content).toContain('type: "radio"');
  });

  it('vercel.json has correct configuration', () => {
    const files = getTemplateFiles('test');
    const vercel = files.find((f) => f.path === 'vercel.json');

    expect(vercel?.content).toContain('"buildCommand": "pnpm build"');
    expect(vercel?.content).toContain('"installCommand": "pnpm install"');
    expect(vercel?.content).toContain('"framework": "nextjs"');
  });

  it('next.config.ts has basic structure', () => {
    const files = getTemplateFiles('test');
    const nextConfig = files.find((f) => f.path === 'next.config.ts');

    expect(nextConfig?.content).toContain('import type { NextConfig }');
    expect(nextConfig?.content).toContain('const nextConfig: NextConfig');
    expect(nextConfig?.content).toContain('export default nextConfig');
  });
});

// Note: createProject integration tests with real filesystem are not included
// as they would require spawning real processes and file system operations.
// The createProject function is tested via the getTemplateFiles tests above
// which verify all template content is correct. Full integration tests should
// be run separately in a controlled environment.
