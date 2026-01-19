#!/usr/bin/env node
/**
 * Release script for Finqu Theme Kit
 * Handles version bumping, tagging, and pushing
 *
 * Usage:
 *   npm run release patch    # 1.0.0 -> 1.0.1
 *   npm run release minor    # 1.0.0 -> 1.1.0
 *   npm run release major    # 1.0.0 -> 2.0.0
 *   npm run release 1.2.3    # Set specific version
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const packageJsonPath = join(rootDir, 'package.json');

/**
 * Execute a command and return stdout
 */
function exec(command, options = {}) {
  console.log(`$ ${command}`);
  return execSync(command, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: options.silent ? 'pipe' : 'inherit',
    ...options,
  });
}

/**
 * Parse semantic version string
 */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Bump version based on type
 */
function bumpVersion(currentVersion, type) {
  const { major, minor, patch } = parseVersion(currentVersion);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      // Assume it's a specific version
      parseVersion(type); // Validate format
      return type;
  }
}

/**
 * Main release function
 */
async function release() {
  const versionArg = process.argv[2];

  if (!versionArg) {
    console.error('Usage: npm run release <patch|minor|major|x.y.z>');
    console.error('');
    console.error('Examples:');
    console.error('  npm run release patch    # 1.0.0 -> 1.0.1');
    console.error('  npm run release minor    # 1.0.0 -> 1.1.0');
    console.error('  npm run release major    # 1.0.0 -> 2.0.0');
    console.error('  npm run release 1.2.3    # Set specific version');
    process.exit(1);
  }

  // Check for uncommitted changes
  try {
    const status = exec('git status --porcelain', { silent: true });
    if (status.trim()) {
      console.error(
        'Error: You have uncommitted changes. Please commit or stash them first.',
      );
      process.exit(1);
    }
  } catch (err) {
    console.error('Error: Failed to check git status');
    process.exit(1);
  }

  // Check we're on the correct branch
  const currentBranch = exec('git branch --show-current', {
    silent: true,
  }).trim();
  if (currentBranch !== 'master' && currentBranch !== 'main') {
    console.warn(
      `Warning: You are on branch '${currentBranch}', not 'master' or 'main'.`,
    );
    console.warn('Press Ctrl+C to cancel, or wait 3 seconds to continue...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Read current package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const currentVersion = packageJson.version;

  // Calculate new version
  let newVersion;
  try {
    newVersion = bumpVersion(currentVersion, versionArg);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log(`\nBumping version: ${currentVersion} -> ${newVersion}\n`);

  // Update package.json
  packageJson.version = newVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('✓ Updated package.json');

  // Run build to ensure it works
  console.log('\nBuilding...');
  exec('npm run build');
  console.log('✓ Build successful');

  // Commit the version bump
  exec(`git add package.json`);
  exec(`git commit -m "chore: release v${newVersion}"`);
  console.log('✓ Committed version bump');

  // Create tag
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  console.log(`✓ Created tag v${newVersion}`);

  // Push changes and tag
  console.log('\nPushing to remote...');
  exec('git push');
  exec('git push --tags');
  console.log('✓ Pushed to remote');

  console.log(`\n🎉 Released v${newVersion} successfully!`);
  console.log('\nNext steps:');
  console.log('  1. Go to GitHub and create a release from the tag');
  console.log('  2. The GitHub Action will automatically publish to npm');
}

release().catch((err) => {
  console.error('Release failed:', err.message);
  process.exit(1);
});
