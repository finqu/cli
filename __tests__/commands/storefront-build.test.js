import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StorefrontBuildCommand,
  createStorefrontBuildCommand,
  extractCategoryFromContent,
  kebabToPascalCase,
  generateConfigContent,
} from '../../src/commands/storefront-build.js';

describe('StorefrontBuildCommand', () => {
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

    command = new StorefrontBuildCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('build');
    });

    it('should have the correct description', () => {
      expect(command.description).toContain('Build Puck configuration');
    });

    it('should belong to the storefront group', () => {
      expect(command.group).toBe('storefront');
    });

    it('should have the correct options', () => {
      const options = command.options;
      expect(options).toHaveLength(2);

      expect(options).toContainEqual({
        flags: '-c, --components <path>',
        description: 'Path to components directory',
        defaultValue: 'components',
      });

      expect(options).toContainEqual({
        flags: '-o, --output <path>',
        description: 'Output directory for generated config',
        defaultValue: '.storefront',
      });
    });

    it('should create command with factory function', () => {
      const factoryCommand = createStorefrontBuildCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(StorefrontBuildCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });
});

describe('extractCategoryFromContent', () => {
  it('extracts category with double quotes', () => {
    const content = `export const category = "Marketing";`;
    expect(extractCategoryFromContent(content)).toBe('Marketing');
  });

  it('extracts category with single quotes', () => {
    const content = `export const category = 'Marketing';`;
    expect(extractCategoryFromContent(content)).toBe('Marketing');
  });

  it('extracts category with backticks', () => {
    const content = `export const category = \`Marketing\`;`;
    expect(extractCategoryFromContent(content)).toBe('Marketing');
  });

  it('returns null when no category export exists', () => {
    const content = `export const config = { label: "Hero" };`;
    expect(extractCategoryFromContent(content)).toBe(null);
  });

  it('returns null for malformed exports', () => {
    const content = `export const category = Marketing;`; // no quotes
    expect(extractCategoryFromContent(content)).toBe(null);
  });

  it('handles category deep in file', () => {
    const content = `
import { type PuckComponentConfig } from "@finqu/storefront-sdk";

interface HeroProps {
    title: string;
}

export const category = "Marketing";

export const config: PuckComponentConfig<HeroProps> = {
    label: "Hero",
    fields: {},
    render: () => null,
};
`;
    expect(extractCategoryFromContent(content)).toBe('Marketing');
  });

  it('handles extra whitespace', () => {
    const content = `export   const   category   =   "Marketing"  ;`;
    expect(extractCategoryFromContent(content)).toBe('Marketing');
  });

  it('extracts category with spaces in name', () => {
    const content = `export const category = "Marketing Tools";`;
    expect(extractCategoryFromContent(content)).toBe('Marketing Tools');
  });

  it('extracts only first category if multiple exist', () => {
    const content = `
export const category = "First";
export const category2 = "Second";
`;
    expect(extractCategoryFromContent(content)).toBe('First');
  });
});

describe('kebabToPascalCase', () => {
  it('converts simple lowercase to PascalCase', () => {
    expect(kebabToPascalCase('hero')).toBe('Hero');
  });

  it('converts kebab-case to PascalCase', () => {
    expect(kebabToPascalCase('marketing-hero')).toBe('MarketingHero');
  });

  it('handles multi-word kebab-case', () => {
    expect(kebabToPascalCase('my-awesome-component')).toBe('MyAwesomeComponent');
  });

  it('preserves already PascalCase names', () => {
    expect(kebabToPascalCase('Hero')).toBe('Hero');
    expect(kebabToPascalCase('MarketingHero')).toBe('MarketingHero');
  });

  it('preserves camelCase names without hyphens', () => {
    expect(kebabToPascalCase('heroComponent')).toBe('HeroComponent');
  });

  it('handles names with numbers', () => {
    expect(kebabToPascalCase('hero-2-column')).toBe('Hero2Column');
  });

  it('handles consecutive hyphens as single separator', () => {
    expect(kebabToPascalCase('hero--component')).toBe('HeroComponent');
  });

  it('handles leading hyphen', () => {
    expect(kebabToPascalCase('-hero')).toBe('Hero');
  });

  it('handles trailing hyphen', () => {
    expect(kebabToPascalCase('hero-')).toBe('Hero');
  });

  it('handles empty string', () => {
    expect(kebabToPascalCase('')).toBe('');
  });

  it('handles single character', () => {
    expect(kebabToPascalCase('h')).toBe('H');
  });

  it('handles uppercase kebab-case', () => {
    expect(kebabToPascalCase('HERO-COMPONENT')).toBe('HEROCOMPONENT');
  });
});

describe('generateConfigContent', () => {
  it('generates empty config for no components', () => {
    const result = generateConfigContent([], '/project/.storefront', 'edit');
    expect(result).toContain('export const config: Config');
    expect(result).toContain('components: {');
    expect(result).toContain('categories: {');
  });

  it('generates imports for components', () => {
    const components = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: 'Marketing',
      },
    ];
    const result = generateConfigContent(
      components,
      '/project/.storefront',
      'edit',
    );
    expect(result).toContain(
      'import { config as HeroConfig } from "../components/Hero.puck"',
    );
  });

  it('adds components to config object', () => {
    const components = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: 'Marketing',
      },
    ];
    const result = generateConfigContent(
      components,
      '/project/.storefront',
      'edit',
    );
    expect(result).toContain('Hero: HeroConfig,');
  });

  it('groups components by category', () => {
    const components = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: 'Marketing',
      },
      {
        name: 'Banner',
        filePath: '/project/components/Banner.puck.tsx',
        relativePath: './components/Banner.puck.tsx',
        category: 'Marketing',
      },
    ];
    const result = generateConfigContent(
      components,
      '/project/.storefront',
      'edit',
    );
    expect(result).toContain('"Marketing"');
    expect(result).toContain('components: ["Hero", "Banner"]');
  });

  it('handles components without category', () => {
    const components = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: null,
      },
    ];
    const result = generateConfigContent(
      components,
      '/project/.storefront',
      'edit',
    );
    expect(result).toContain('Hero: HeroConfig,');
    expect(result).not.toContain('"null"');
  });

  it('generates valid TypeScript structure', () => {
    const components = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: 'Marketing',
      },
    ];
    const result = generateConfigContent(
      components,
      '/project/.storefront',
      'edit',
    );

    expect(result).toContain('// This file is auto-generated');
    expect(result).toContain('import type { Config } from "@puckeditor/core"');
    expect(result).toContain('export const config: Config = {');
  });

  it('handles multiple categories', () => {
    const components = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: 'Marketing',
      },
      {
        name: 'ProductGrid',
        filePath: '/project/components/ProductGrid.puck.tsx',
        relativePath: './components/ProductGrid.puck.tsx',
        category: 'Products',
      },
    ];
    const result = generateConfigContent(
      components,
      '/project/.storefront',
      'edit',
    );
    expect(result).toContain('"Marketing"');
    expect(result).toContain('"Products"');
  });

  describe('config variants', () => {
    const components = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: 'Marketing',
      },
    ];

    const multipleComponents = [
      {
        name: 'Hero',
        filePath: '/project/components/Hero.puck.tsx',
        relativePath: './components/Hero.puck.tsx',
        category: 'Marketing',
      },
      {
        name: 'Carousel',
        filePath: '/project/components/Carousel.puck.tsx',
        relativePath: './components/Carousel.puck.tsx',
        category: 'Media',
      },
      {
        name: 'TextBlock',
        filePath: '/project/components/TextBlock.puck.tsx',
        relativePath: './components/TextBlock.puck.tsx',
        category: 'Content',
      },
    ];

    describe('edit variant', () => {
      it("includes 'use client' directive at the top", () => {
        const result = generateConfigContent(
          components,
          '/project/.storefront',
          'edit',
        );
        const lines = result.split('\n');

        expect(lines[0]).toBe(
          '// This file is auto-generated by @finqu/cli',
        );
        expect(lines[1]).toBe(
          '// Do not edit manually - changes will be overwritten',
        );
        expect(lines[2]).toBe('"use client";');
      });

      it('generates complete valid structure', () => {
        const result = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'edit',
        );

        expect(result).toMatch(/^\/\/ This file is auto-generated/);
        expect(result).toContain('"use client";');
        expect(result).toContain(
          'import type { Config } from "@puckeditor/core";',
        );
        expect(result).toContain('import { config as HeroConfig }');
        expect(result).toContain('import { config as CarouselConfig }');
        expect(result).toContain('import { config as TextBlockConfig }');
        expect(result).toContain('export const config: Config = {');
        expect(result).toContain('components: {');
        expect(result).toContain('categories: {');
      });

      it('is suitable for client-side Puck editor', () => {
        const result = generateConfigContent(
          components,
          '/project/.storefront',
          'edit',
        );

        expect(result).toContain('"use client";');
        expect(result).toContain('export const config: Config');
      });
    });

    describe('render variant', () => {
      it('does not include any client directive', () => {
        const result = generateConfigContent(
          components,
          '/project/.storefront',
          'render',
        );

        expect(result).not.toContain('"use client"');
        expect(result).not.toContain("'use client'");
        expect(result).not.toContain('`use client`');
        expect(result).not.toContain('use server');
      });

      it('starts with auto-generated comment followed by imports', () => {
        const result = generateConfigContent(
          components,
          '/project/.storefront',
          'render',
        );
        const lines = result.split('\n');

        expect(lines[0]).toBe(
          '// This file is auto-generated by @finqu/cli',
        );
        expect(lines[1]).toBe(
          '// Do not edit manually - changes will be overwritten',
        );
        expect(lines[2]).toBe('');
        expect(lines[3]).toBe(
          'import type { Config } from "@puckeditor/core";',
        );
      });

      it('generates complete valid structure', () => {
        const result = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'render',
        );

        expect(result).toMatch(/^\/\/ This file is auto-generated/);
        expect(result).toContain(
          'import type { Config } from "@puckeditor/core";',
        );
        expect(result).toContain('import { config as HeroConfig }');
        expect(result).toContain('import { config as CarouselConfig }');
        expect(result).toContain('import { config as TextBlockConfig }');
        expect(result).toContain('export const config: Config = {');
        expect(result).toContain('components: {');
        expect(result).toContain('categories: {');
      });

      it('is suitable for React Server Components', () => {
        const result = generateConfigContent(
          components,
          '/project/.storefront',
          'render',
        );

        expect(result).not.toContain('"use client"');
        expect(result).toContain('export const config: Config');
      });
    });

    describe('structural equivalence', () => {
      it('both variants have identical imports', () => {
        const editResult = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'edit',
        );
        const renderResult = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'render',
        );

        const editImports = editResult
          .split('\n')
          .filter((l) => l.startsWith('import'));
        const renderImports = renderResult
          .split('\n')
          .filter((l) => l.startsWith('import'));

        expect(editImports).toEqual(renderImports);
        expect(editImports).toHaveLength(4);
      });

      it('both variants have identical component entries', () => {
        const editResult = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'edit',
        );
        const renderResult = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'render',
        );

        for (const comp of multipleComponents) {
          expect(editResult).toContain(`${comp.name}: ${comp.name}Config,`);
          expect(renderResult).toContain(`${comp.name}: ${comp.name}Config,`);
        }
      });

      it('only difference is the use client directive', () => {
        const editResult = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'edit',
        );
        const renderResult = generateConfigContent(
          multipleComponents,
          '/project/.storefront',
          'render',
        );

        const editWithoutDirective = editResult.replace(
          '"use client";\n\n',
          '',
        );
        expect(editWithoutDirective).toBe(renderResult);
      });
    });

    describe('default behavior', () => {
      it('defaults to edit variant when not specified', () => {
        const result = generateConfigContent(components, '/project/.storefront');
        expect(result).toContain('"use client";');
      });

      it('default matches explicit edit variant', () => {
        const defaultResult = generateConfigContent(
          components,
          '/project/.storefront',
        );
        const editResult = generateConfigContent(
          components,
          '/project/.storefront',
          'edit',
        );
        expect(defaultResult).toBe(editResult);
      });
    });
  });

  describe('folder-based components with edit/render variants', () => {
    describe('component with both edit and render files', () => {
      const folderComponent = {
        name: 'Marketing',
        filePath: '/project/components/Marketing/index.ts',
        editFilePath: '/project/components/Marketing/Marketing.edit.puck.tsx',
        renderFilePath:
          '/project/components/Marketing/Marketing.render.puck.tsx',
        relativePath: './components/Marketing/index.ts',
        category: 'Marketing',
      };

      it('edit config imports from .edit.puck file', () => {
        const result = generateConfigContent(
          [folderComponent],
          '/project/.storefront',
          'edit',
        );
        expect(result).toContain(
          'import { config as MarketingConfig } from "../components/Marketing/Marketing.edit.puck"',
        );
      });

      it('render config imports from .render.puck file', () => {
        const result = generateConfigContent(
          [folderComponent],
          '/project/.storefront',
          'render',
        );
        expect(result).toContain(
          'import { config as MarketingConfig } from "../components/Marketing/Marketing.render.puck"',
        );
      });

      it('edit and render configs import from different files', () => {
        const editResult = generateConfigContent(
          [folderComponent],
          '/project/.storefront',
          'edit',
        );
        const renderResult = generateConfigContent(
          [folderComponent],
          '/project/.storefront',
          'render',
        );

        const editImport = editResult.match(
          /import \{ config as MarketingConfig \} from "([^"]+)"/,
        )?.[1];
        const renderImport = renderResult.match(
          /import \{ config as MarketingConfig \} from "([^"]+)"/,
        )?.[1];

        expect(editImport).toBe(
          '../components/Marketing/Marketing.edit.puck',
        );
        expect(renderImport).toBe(
          '../components/Marketing/Marketing.render.puck',
        );
        expect(editImport).not.toBe(renderImport);
      });
    });

    describe('component with only edit file', () => {
      const editOnlyComponent = {
        name: 'EditOnly',
        filePath: '/project/components/EditOnly/index.ts',
        editFilePath: '/project/components/EditOnly/EditOnly.edit.puck.tsx',
        renderFilePath: undefined,
        relativePath: './components/EditOnly/index.ts',
        category: 'Interactive',
      };

      it('edit config imports from .edit.puck file', () => {
        const result = generateConfigContent(
          [editOnlyComponent],
          '/project/.storefront',
          'edit',
        );
        expect(result).toContain(
          'import { config as EditOnlyConfig } from "../components/EditOnly/EditOnly.edit.puck"',
        );
      });

      it('render config falls back to .edit.puck file when no render file exists', () => {
        const result = generateConfigContent(
          [editOnlyComponent],
          '/project/.storefront',
          'render',
        );
        expect(result).toContain(
          'import { config as EditOnlyConfig } from "../components/EditOnly/EditOnly.edit.puck"',
        );
      });
    });

    describe('component with only render file', () => {
      const renderOnlyComponent = {
        name: 'RenderOnly',
        filePath: '/project/components/RenderOnly/index.ts',
        editFilePath: undefined,
        renderFilePath:
          '/project/components/RenderOnly/RenderOnly.render.puck.tsx',
        relativePath: './components/RenderOnly/index.ts',
        category: 'Static',
      };

      it('render config imports from .render.puck file', () => {
        const result = generateConfigContent(
          [renderOnlyComponent],
          '/project/.storefront',
          'render',
        );
        expect(result).toContain(
          'import { config as RenderOnlyConfig } from "../components/RenderOnly/RenderOnly.render.puck"',
        );
      });

      it('edit config falls back to .render.puck file when no edit file exists', () => {
        const result = generateConfigContent(
          [renderOnlyComponent],
          '/project/.storefront',
          'edit',
        );
        expect(result).toContain(
          'import { config as RenderOnlyConfig } from "../components/RenderOnly/RenderOnly.render.puck"',
        );
      });
    });

    describe('mixed single-file and folder components', () => {
      const mixedComponents = [
        {
          name: 'Hero',
          filePath: '/project/components/Hero.puck.tsx',
          relativePath: './components/Hero.puck.tsx',
          category: 'Marketing',
        },
        {
          name: 'Carousel',
          filePath: '/project/components/Carousel/index.ts',
          editFilePath: '/project/components/Carousel/Carousel.edit.puck.tsx',
          renderFilePath:
            '/project/components/Carousel/Carousel.render.puck.tsx',
          relativePath: './components/Carousel/index.ts',
          category: 'Media',
        },
        {
          name: 'ProductPicker',
          filePath: '/project/components/ProductPicker/index.ts',
          editFilePath:
            '/project/components/ProductPicker/ProductPicker.edit.puck.tsx',
          renderFilePath: undefined,
          relativePath: './components/ProductPicker/index.ts',
          category: 'Products',
        },
      ];

      it('edit config uses correct paths for each component type', () => {
        const result = generateConfigContent(
          mixedComponents,
          '/project/.storefront',
          'edit',
        );

        expect(result).toContain(
          'import { config as HeroConfig } from "../components/Hero.puck"',
        );
        expect(result).toContain(
          'import { config as CarouselConfig } from "../components/Carousel/Carousel.edit.puck"',
        );
        expect(result).toContain(
          'import { config as ProductPickerConfig } from "../components/ProductPicker/ProductPicker.edit.puck"',
        );
      });

      it('render config uses correct paths for each component type', () => {
        const result = generateConfigContent(
          mixedComponents,
          '/project/.storefront',
          'render',
        );

        expect(result).toContain(
          'import { config as HeroConfig } from "../components/Hero.puck"',
        );
        expect(result).toContain(
          'import { config as CarouselConfig } from "../components/Carousel/Carousel.render.puck"',
        );
        expect(result).toContain(
          'import { config as ProductPickerConfig } from "../components/ProductPicker/ProductPicker.edit.puck"',
        );
      });

      it('preserves all component entries in both configs', () => {
        const editResult = generateConfigContent(
          mixedComponents,
          '/project/.storefront',
          'edit',
        );
        const renderResult = generateConfigContent(
          mixedComponents,
          '/project/.storefront',
          'render',
        );

        for (const comp of mixedComponents) {
          expect(editResult).toContain(`${comp.name}: ${comp.name}Config,`);
          expect(renderResult).toContain(`${comp.name}: ${comp.name}Config,`);
        }
      });

      it('preserves all categories in both configs', () => {
        const editResult = generateConfigContent(
          mixedComponents,
          '/project/.storefront',
          'edit',
        );
        const renderResult = generateConfigContent(
          mixedComponents,
          '/project/.storefront',
          'render',
        );

        expect(editResult).toContain('"Marketing"');
        expect(editResult).toContain('"Media"');
        expect(editResult).toContain('"Products"');

        expect(renderResult).toContain('"Marketing"');
        expect(renderResult).toContain('"Media"');
        expect(renderResult).toContain('"Products"');
      });
    });
  });
});
