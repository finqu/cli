/**
 * Storefront Build command for Finqu CLI
 * Builds Puck configuration from component files
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import pc from 'picocolors';
import { BaseCommand } from './base.js';

/**
 * Extract category export from a component file
 * Uses simple regex parsing to avoid needing to compile TypeScript
 * @param {string} filePath - Path to the component file
 * @returns {Promise<string|null>} Category name or null
 */
export async function extractCategory(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return extractCategoryFromContent(content);
}

/**
 * Extract category from file content string (for testing without fs)
 * @param {string} content - File content
 * @returns {string|null} Category name or null
 */
export function extractCategoryFromContent(content) {
  const match = content.match(
    /export\s+const\s+category\s*=\s*["'`]([^"'`]+)["'`]/,
  );
  return match ? match[1] : null;
}

/**
 * Convert kebab-case to PascalCase for component names
 * Only converts if hyphens are present, otherwise returns unchanged
 * @param {string} str - String to convert
 * @returns {string} PascalCase string
 */
export function kebabToPascalCase(str) {
  if (!str.includes('-')) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} Whether the file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan components directory and gather component info
 * Supports two patterns:
 * 1. Single file: components/Hero.puck.tsx
 * 2. Folder with variants: components/Hero/Hero.edit.puck.tsx, Hero.render.puck.tsx, index.ts
 * @param {string} componentsDir - Path to components directory
 * @returns {Promise<Array>} Array of component info objects
 */
async function scanComponents(componentsDir) {
  const components = [];

  // Pattern 1: Single file components (*.puck.tsx in root)
  const singleFilePattern = path.join(componentsDir, '*.puck.tsx');
  const singleFiles = await fg(singleFilePattern, { absolute: true });

  for (const filePath of singleFiles) {
    const fileName = path.basename(filePath);
    const name = kebabToPascalCase(fileName.replace('.puck.tsx', ''));
    const category = await extractCategory(filePath);
    const relativePath = path.relative(path.dirname(componentsDir), filePath);

    components.push({
      name,
      filePath,
      relativePath: './' + relativePath.replace(/\\/g, '/'),
      category,
    });
  }

  // Pattern 2: Folder-based components with edit/render variants
  const entries = await fs.readdir(componentsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderName = entry.name;
    const componentName = kebabToPascalCase(folderName);
    const folderPath = path.join(componentsDir, folderName);

    // Check for edit/render variant files
    const editPath = path.join(folderPath, `${folderName}.edit.puck.tsx`);
    const renderPath = path.join(folderPath, `${folderName}.render.puck.tsx`);
    const indexPath = path.join(folderPath, 'index.ts');
    const indexTsxPath = path.join(folderPath, 'index.tsx');

    const hasEditFile = await fileExists(editPath);
    const hasRenderFile = await fileExists(renderPath);
    const hasIndex =
      (await fileExists(indexPath)) || (await fileExists(indexTsxPath));

    // Only treat as folder component if it has at least one variant file
    if (hasEditFile || hasRenderFile) {
      // Get category from index file or from edit/render file
      let category = null;
      const actualIndexPath = (await fileExists(indexPath))
        ? indexPath
        : indexTsxPath;

      if (hasIndex) {
        category = await extractCategory(actualIndexPath);
      }
      if (!category && hasEditFile) {
        category = await extractCategory(editPath);
      }
      if (!category && hasRenderFile) {
        category = await extractCategory(renderPath);
      }

      // Determine primary file path (prefer index, then edit, then render)
      const primaryPath = hasIndex
        ? actualIndexPath
        : hasEditFile
          ? editPath
          : renderPath;
      const relativePath = path.relative(
        path.dirname(componentsDir),
        primaryPath,
      );

      components.push({
        name: componentName,
        filePath: primaryPath,
        editFilePath: hasEditFile ? editPath : undefined,
        renderFilePath: hasRenderFile ? renderPath : undefined,
        relativePath: './' + relativePath.replace(/\\/g, '/'),
        category,
      });
    }
  }

  return components.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get the appropriate file path for a component based on variant
 * @param {Object} comp - Component info object
 * @param {string} variant - 'edit' or 'render'
 * @returns {string} File path for the variant
 */
function getComponentFilePath(comp, variant) {
  if (variant === 'edit' && comp.editFilePath) {
    return comp.editFilePath;
  }
  if (variant === 'render' && comp.renderFilePath) {
    return comp.renderFilePath;
  }
  // Fall back to edit file for render if no render-specific file exists
  if (variant === 'render' && comp.editFilePath && !comp.renderFilePath) {
    return comp.editFilePath;
  }
  // Fall back to render file for edit if no edit-specific file exists
  if (variant === 'edit' && comp.renderFilePath && !comp.editFilePath) {
    return comp.renderFilePath;
  }
  return comp.filePath;
}

/**
 * Generate import path from a file path, removing .tsx/.ts extension
 * @param {string} filePath - Absolute file path
 * @param {string} outputDir - Output directory path
 * @returns {string} Relative import path
 */
function generateImportPath(filePath, outputDir) {
  const relativePath = path.relative(outputDir, filePath).replace(/\\/g, '/');
  const withPrefix = relativePath.startsWith('.')
    ? relativePath
    : './' + relativePath;
  // Remove various extensions
  return withPrefix
    .replace('.edit.puck.tsx', '.edit.puck')
    .replace('.render.puck.tsx', '.render.puck')
    .replace('.puck.tsx', '.puck')
    .replace('.tsx', '')
    .replace('.ts', '');
}

/**
 * Generate the Puck config file content
 * @param {Array} components - Array of component info objects
 * @param {string} outputDir - Output directory path
 * @param {string} variant - 'edit' or 'render'
 * @returns {string} Generated config file content
 */
export function generateConfigContent(
  components,
  outputDir,
  variant = 'edit',
) {
  const imports = [];
  const componentEntries = [];
  const categoryMap = new Map();

  for (const comp of components) {
    // Get the appropriate file path for this variant
    const variantFilePath = getComponentFilePath(comp, variant);
    const importPath = generateImportPath(variantFilePath, outputDir);

    imports.push(`import { config as ${comp.name}Config } from "${importPath}";`);
    componentEntries.push(`  ${comp.name}: ${comp.name}Config,`);

    if (comp.category) {
      const existing = categoryMap.get(comp.category) || [];
      existing.push(comp.name);
      categoryMap.set(comp.category, existing);
    }
  }

  // Build categories object
  const categoryEntries = [];
  for (const [category, componentNames] of categoryMap) {
    categoryEntries.push(`  "${category}": {
    components: [${componentNames.map((n) => `"${n}"`).join(', ')}],
  },`);
  }

  // Edit config needs "use client" for Puck editor interactivity
  // Render config omits it to allow React Server Components
  const clientDirective = variant === 'edit' ? '"use client";\n\n' : '';

  return `// This file is auto-generated by @finqu/cli
// Do not edit manually - changes will be overwritten
${clientDirective}
import type { Config } from "@puckeditor/core";

${imports.join('\n')}

export const config: Config = {
  components: {
${componentEntries.join('\n')}
  },
  categories: {
${categoryEntries.join('\n')}
  },
};
`;
}

/**
 * Run build programmatically
 * @param {Object} options - Build options
 * @param {string} options.components - Path to components directory
 * @param {string} options.output - Output directory for generated config
 * @returns {Promise<void>}
 */
export async function runBuild(options) {
  const cwd = process.cwd();
  const componentsDir = path.resolve(cwd, options.components);
  const outputDir = path.resolve(cwd, options.output);
  const editConfigFile = path.join(outputDir, 'puck.edit.config.tsx');
  const renderConfigFile = path.join(outputDir, 'puck.render.config.tsx');

  console.log(pc.cyan('→'), 'Scanning components in', pc.dim(options.components));

  // Check if components directory exists
  try {
    await fs.access(componentsDir);
  } catch {
    console.error(pc.red('✗'), `Components directory not found: ${componentsDir}`);
    process.exit(1);
  }

  // Scan for component files
  const components = await scanComponents(componentsDir);

  if (components.length === 0) {
    console.warn(pc.yellow('⚠'), 'No *.puck.tsx files found in components directory');
  } else {
    console.log(pc.green('✓'), `Found ${components.length} component(s)`);
    for (const comp of components) {
      const categoryLabel = comp.category ? pc.dim(` [${comp.category}]`) : '';
      console.log(pc.dim('  •'), comp.name + categoryLabel);
    }
  }

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Generate and write both configs
  const editConfigContent = generateConfigContent(components, outputDir, 'edit');
  const renderConfigContent = generateConfigContent(components, outputDir, 'render');

  await fs.writeFile(editConfigFile, editConfigContent, 'utf-8');
  await fs.writeFile(renderConfigFile, renderConfigContent, 'utf-8');

  console.log(pc.green('✓'), 'Generated', pc.dim(path.relative(cwd, editConfigFile)), pc.dim('(editor)'));
  console.log(pc.green('✓'), 'Generated', pc.dim(path.relative(cwd, renderConfigFile)), pc.dim('(render)'));
}

/**
 * StorefrontBuildCommand class for building Puck config
 */
export class StorefrontBuildCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'build';
  }

  /**
   * Get command group
   * @returns {string} Command group
   */
  get group() {
    return 'storefront';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  get description() {
    return 'Build Puck configuration from component files';
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [
      {
        flags: '-c, --components <path>',
        description: 'Path to components directory',
        defaultValue: 'components',
      },
      {
        flags: '-o, --output <path>',
        description: 'Output directory for generated config',
        defaultValue: '.storefront',
      },
    ];
  }

  /**
   * Execute the build command
   * @param {Object} options Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(options) {
    try {
      await runBuild({
        components: options.components,
        output: options.output,
      });
      return { success: true };
    } catch (err) {
      console.error(pc.red('✗'), 'Build failed:', err.message);
      return { success: false, error: err };
    }
  }
}

/**
 * Factory function to create a StorefrontBuildCommand
 * @param {Object} app Application instance
 * @returns {StorefrontBuildCommand} A new command instance
 */
export function createStorefrontBuildCommand(app) {
  return new StorefrontBuildCommand(app);
}
