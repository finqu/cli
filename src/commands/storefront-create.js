/**
 * Storefront Create command for Finqu CLI
 * Creates a new storefront project
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import prompts from 'prompts';
import pc from 'picocolors';
import { BaseCommand } from './base.js';

const DEFAULT_TEMPLATE = 'https://github.com/finqu/theme-headless-horizon.git';
const DEFAULT_BRANCH = 'main';

/**
 * Get embedded template files for a new project
 * @param {string} projectName - Name of the project
 * @returns {Array<{path: string, content: string}>} Array of template files
 */
export function getTemplateFiles(projectName) {
  return [
    {
      path: 'package.json',
      content: `{
  "name": "${projectName}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "finqu storefront dev",
    "build": "finqu storefront build && next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@finqu/storefront-lib": "*",
    "@finqu/storefront-sdk": "*",
    "@puckeditor/core": "^0.21.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
`,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".storefront/**/*.tsx"],
  "exclude": ["node_modules"]
}
`,
    },
    {
      path: 'next.config.ts',
      content: `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable server components
  experimental: {},
};

export default nextConfig;
`,
    },
    {
      path: 'vercel.json',
      content: `{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install",
  "framework": "nextjs"
}
`,
    },
    {
      path: '.gitignore',
      content: `# Dependencies
node_modules/

# Next.js
.next/
out/

# Generated
.storefront/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store

# Debug
npm-debug.log*
pnpm-debug.log*
`,
    },
    {
      path: 'app/layout.tsx',
      content: `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "${projectName}",
  description: "Finqu Storefront",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: 'app/page.tsx',
      content: `import { Render } from "@puckeditor/core";
import { config } from "@/.storefront/puck.render.config";

// Example: In a real app, this would come from your CMS/database
const exampleData = {
  root: {},
  content: [
    {
      type: "Hero",
      props: {
        id: "hero-1",
        title: "Welcome to your storefront",
        subtitle: "Built with Finqu SDK, Puck, and Next.js",
      },
    },
  ],
};

export default function HomePage() {
  return <Render config={config} data={exampleData} />;
}
`,
    },
    {
      path: 'app/editor/page.tsx',
      content: `"use client";

import { Puck, type Data } from "@puckeditor/core";
import { config } from "@/.storefront/puck.edit.config";
import "@puckeditor/core/puck.css";

const initialData: Data = {
  root: {},
  content: [],
};

export default function EditorPage() {
  const handlePublish = async (data: Data) => {
    // TODO: Save to your backend/CMS
    console.log("Publishing:", data);
  };

  return (
    <Puck
      config={config}
      data={initialData}
      onPublish={handlePublish}
    />
  );
}
`,
    },
    {
      path: 'components/Hero.puck.tsx',
      content: `import { type ComponentConfig } from "@finqu/storefront-sdk";

interface HeroProps {
  title: string;
  subtitle: string;
}

export const category = "Marketing";

export const config: ComponentConfig<HeroProps> = {
  label: "Hero Banner",
  fields: {
    title: {
      type: "text",
      label: "Title",
    },
    subtitle: {
      type: "textarea",
      label: "Subtitle",
    },
  },
  defaultProps: {
    title: "Welcome",
    subtitle: "Add your subtitle here",
  },
  render: ({ title, subtitle }) => (
    <section style={{
      padding: "4rem 2rem",
      textAlign: "center",
      backgroundColor: "#f5f5f5",
    }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>{title}</h1>
      <p style={{ fontSize: "1.25rem", color: "#666" }}>{subtitle}</p>
    </section>
  ),
};
`,
    },
    {
      path: 'components/TextBlock.puck.tsx',
      content: `import { type ComponentConfig } from "@finqu/storefront-sdk";

interface TextBlockProps {
  content: string;
  alignment: "left" | "center" | "right";
}

export const category = "Content";

export const config: ComponentConfig<TextBlockProps> = {
  label: "Text Block",
  fields: {
    content: {
      type: "textarea",
      label: "Content",
    },
    alignment: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
  },
  defaultProps: {
    content: "Add your text here...",
    alignment: "left",
  },
  render: ({ content, alignment }) => (
    <div style={{
      padding: "2rem",
      textAlign: alignment,
    }}>
      <p>{content}</p>
    </div>
  ),
};
`,
    },
  ];
}

/**
 * Check if git is available
 * @returns {boolean} Whether git is available
 */
function isGitAvailable() {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone a git repository as template
 * @param {string} template - Git repository URL
 * @param {string} branch - Branch to clone
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
async function cloneTemplate(template, branch, targetDir) {
  console.log(pc.cyan('→'), 'Cloning template from', pc.dim(template));

  try {
    execSync(
      `git clone --depth 1 --branch ${branch} "${template}" "${targetDir}"`,
      { stdio: 'pipe' },
    );
  } catch (error) {
    throw new Error(`Failed to clone template: ${error.message}`);
  }

  // Remove .git directory to detach from template repo
  const gitDir = path.join(targetDir, '.git');
  await fs.rm(gitDir, { recursive: true, force: true });

  console.log(pc.green('  ✓'), pc.dim('Template cloned'));
}

/**
 * Update package.json with project name
 * @param {string} targetDir - Target directory
 * @param {string} projectName - Project name
 * @returns {Promise<void>}
 */
async function updatePackageName(targetDir, projectName) {
  const packageJsonPath = path.join(targetDir, 'package.json');

  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    packageJson.name = projectName;
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + '\n',
      'utf-8',
    );
    console.log(pc.green('  ✓'), pc.dim('Updated package.json'));
  } catch {
    // package.json might not exist in template, that's ok
  }
}

/**
 * Write embedded template files
 * @param {string} projectName - Project name
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
async function writeEmbeddedTemplate(projectName, targetDir) {
  console.log(pc.cyan('→'), 'Creating project from embedded template');

  // Create target directory
  await fs.mkdir(targetDir, { recursive: true });

  // Get template files
  const files = getTemplateFiles(projectName);

  // Write all template files
  for (const file of files) {
    const filePath = path.join(targetDir, file.path);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, file.content, 'utf-8');
    console.log(pc.green('  +'), pc.dim(file.path));
  }
}

/**
 * Initialize a new git repository
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
async function initGitRepo(targetDir) {
  try {
    execSync('git init', { cwd: targetDir, stdio: 'pipe' });
    console.log(pc.green('  ✓'), pc.dim('Initialized git repository'));
  } catch {
    // Git might not be available, that's ok
  }
}

/**
 * Create a new storefront project
 * @param {string} projectName - Project name
 * @param {string} targetDir - Target directory
 * @param {Object} options - Create options
 * @param {string} [options.template] - Git repository URL to clone as template
 * @param {string} [options.branch] - Branch to clone
 * @param {boolean} [options.useEmbedded] - Use embedded templates instead of git clone
 * @returns {Promise<void>}
 */
export async function createProject(projectName, targetDir, options = {}) {
  const { template, branch = DEFAULT_BRANCH, useEmbedded = false } = options;

  // Check if directory already exists
  try {
    await fs.access(targetDir);
    throw new Error(`Directory ${targetDir} already exists`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Decide whether to use git clone or embedded templates
  const shouldUseGit = !useEmbedded && (template || isGitAvailable());

  if (shouldUseGit) {
    const templateUrl = template || DEFAULT_TEMPLATE;
    try {
      await cloneTemplate(templateUrl, branch, targetDir);
      await updatePackageName(targetDir, projectName);
    } catch (error) {
      if (template) {
        // User explicitly specified a template, don't fall back
        throw error;
      }
      // Fall back to embedded templates
      console.log(pc.yellow('  ⚠'), pc.dim('Git clone failed, using embedded template'));
      await writeEmbeddedTemplate(projectName, targetDir);
    }
  } else {
    await writeEmbeddedTemplate(projectName, targetDir);
  }

  // Initialize fresh git repo
  await initGitRepo(targetDir);
}

/**
 * StorefrontCreateCommand class for creating new storefront projects
 */
export class StorefrontCreateCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'create';
  }

  /**
   * Get command group
   * @returns {string} Command group
   */
  get group() {
    return 'storefront';
  }

  /**
   * Get command syntax
   * @returns {string} Command syntax with arguments
   */
  get syntax() {
    return `${this.name} [project-name]`;
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  get description() {
    return 'Create a new Finqu storefront project';
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [
      {
        flags: '-t, --template <url>',
        description: 'Git repository URL to use as template',
      },
      {
        flags: '-b, --branch <branch>',
        description: 'Branch to clone (default: main)',
      },
      {
        flags: '--embedded',
        description: 'Use embedded templates instead of git clone',
      },
    ];
  }

  /**
   * Execute the create command
   * @param {string} projectName - Optional project name argument
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(projectName, options) {
    console.log();
    console.log(pc.bold('Create Finqu Storefront'));
    console.log();

    try {
      // Prompt for project name if not provided
      if (!projectName) {
        const response = await prompts({
          type: 'text',
          name: 'projectName',
          message: 'Project name:',
          initial: 'my-storefront',
          validate: (value) => {
            if (!value) return 'Project name is required';
            if (!/^[a-z0-9-]+$/.test(value)) {
              return 'Project name can only contain lowercase letters, numbers, and hyphens';
            }
            return true;
          },
        });

        if (!response.projectName) {
          console.log(pc.red('✗'), 'Cancelled');
          return { success: false, cancelled: true };
        }

        projectName = response.projectName;
      }

      const targetDir = path.resolve(process.cwd(), projectName);

      console.log(pc.cyan('→'), `Creating project in ${pc.dim(targetDir)}`);
      console.log();

      await createProject(projectName, targetDir, {
        template: options.template,
        branch: options.branch,
        useEmbedded: options.embedded,
      });

      console.log();
      console.log(pc.green('✓'), 'Project created successfully!');
      console.log();
      console.log('Next steps:');
      console.log();
      console.log(pc.dim('  cd'), projectName);
      console.log(pc.dim('  pnpm install'));
      console.log(pc.dim('  pnpm dev'));
      console.log();

      return { success: true, projectName, targetDir };
    } catch (err) {
      console.error(pc.red('✗'), 'Failed to create project:', err.message);
      return { success: false, error: err };
    }
  }
}

/**
 * Factory function to create a StorefrontCreateCommand
 * @param {Object} app Application instance
 * @returns {StorefrontCreateCommand} A new command instance
 */
export function createStorefrontCreateCommand(app) {
  return new StorefrontCreateCommand(app);
}
