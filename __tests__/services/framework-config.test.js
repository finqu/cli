import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  insertNextAllowedOrigin,
  insertViteAllowedHost,
  isHostAllowed,
  portFromScripts,
  detectProject,
  planHostAllowance,
} from '../../src/services/framework-config.js';

describe('insertNextAllowedOrigin', () => {
  it('adds allowedDevOrigins to a typed nextConfig object', () => {
    const src = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
};

export default nextConfig;
`;
    expect(insertNextAllowedOrigin(src, '*.trycloudflare.com')).toBe(
      `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com"],
  /* config options here */
  reactStrictMode: true,
};

export default nextConfig;
`,
    );
  });

  it('handles module.exports and an empty object', () => {
    expect(
      insertNextAllowedOrigin(`module.exports = {}\n`, '*.trycloudflare.com'),
    ).toBe(`module.exports = { allowedDevOrigins: ['*.trycloudflare.com'] }\n`);

    expect(
      insertNextAllowedOrigin(
        `const nextConfig = {\n};\nmodule.exports = nextConfig;\n`,
        '*.trycloudflare.com',
      ),
    ).toBe(
      `const nextConfig = {\n  allowedDevOrigins: ['*.trycloudflare.com'],\n};\nmodule.exports = nextConfig;\n`,
    );
  });

  it('appends to an existing allowedDevOrigins array', () => {
    expect(
      insertNextAllowedOrigin(
        `export default { allowedDevOrigins: ['local.dev'] }`,
        '*.trycloudflare.com',
      ),
    ).toBe(
      `export default { allowedDevOrigins: ['*.trycloudflare.com', 'local.dev'] }`,
    );
    expect(
      insertNextAllowedOrigin(
        `export default { allowedDevOrigins: [] }`,
        '*.trycloudflare.com',
      ),
    ).toBe(`export default { allowedDevOrigins: ['*.trycloudflare.com'] }`);
  });

  it('returns null for shapes it does not recognise', () => {
    expect(
      insertNextAllowedOrigin(
        `module.exports = withBundleAnalyzer({ reactStrictMode: true })`,
        '*.trycloudflare.com',
      ),
    ).toBeNull();
  });
});

describe('insertViteAllowedHost', () => {
  it('adds server.allowedHosts to defineConfig', () => {
    const src = `import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
});
`;
    expect(insertViteAllowedHost(src, '.trycloudflare.com')).toBe(
      `import { defineConfig } from 'vite';

export default defineConfig({
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [],
});
`,
    );
  });

  it('adds allowedHosts into an existing server block', () => {
    const src = `export default defineConfig({
  server: {
    port: 4000,
  },
});`;
    expect(insertViteAllowedHost(src, '.trycloudflare.com')).toBe(
      `export default defineConfig({
  server: {
    allowedHosts: ['.trycloudflare.com'],
    port: 4000,
  },
});`,
    );
  });

  it('handles the function form of defineConfig', () => {
    const src = `export default defineConfig(({ mode }) => ({\n  plugins: [],\n}));`;
    expect(insertViteAllowedHost(src, '.trycloudflare.com')).toContain(
      `=> ({\n  server: { allowedHosts: ['.trycloudflare.com'] },\n  plugins: [],`,
    );
  });

  it('returns null for shapes it does not recognise', () => {
    expect(
      insertViteAllowedHost(`export default makeConfig()`, '.trycloudflare.com'),
    ).toBeNull();
  });
});

describe('isHostAllowed', () => {
  it('recognises existing quick tunnel entries and allowedHosts: true', () => {
    expect(
      isHostAllowed(`allowedDevOrigins: ['*.trycloudflare.com']`, 'a.trycloudflare.com'),
    ).toBe(true);
    expect(isHostAllowed(`server: { allowedHosts: true }`, 'x.ngrok.app')).toBe(
      true,
    );
    expect(isHostAllowed(`allowedHosts: ['x.ngrok.app']`, 'x.ngrok.app')).toBe(
      true,
    );
    expect(isHostAllowed(`{}`, 'a.trycloudflare.com')).toBe(false);
  });
});

describe('portFromScripts', () => {
  it('finds explicit ports in dev scripts', () => {
    expect(portFromScripts({ scripts: { dev: 'next dev -p 4000' } })).toBe(4000);
    expect(portFromScripts({ scripts: { dev: 'next dev --turbopack --port 4100' } })).toBe(4100);
    expect(portFromScripts({ scripts: { dev: 'vite --port=8080' } })).toBe(8080);
    expect(portFromScripts({ scripts: { dev: 'PORT=5000 node server.js' } })).toBe(5000);
    expect(portFromScripts({ scripts: { dev: 'next dev' } })).toBeNull();
    expect(portFromScripts(null)).toBeNull();
  });
});

describe('detectProject / planHostAllowance', () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'finqu-fw-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('prefers Next.js over vite (vitest) and finds the config', async () => {
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'next dev -p 3001' },
        dependencies: { next: '15.0.0' },
        devDependencies: { vite: '6.0.0', vitest: '3.0.0' },
      }),
    );
    await fs.writeFile(path.join(dir, 'next.config.mjs'), 'export default {};\n');

    const project = await detectProject(dir);
    expect(project.framework.id).toBe('nextjs');
    expect(project.configPath).toBe(path.join(dir, 'next.config.mjs'));
    expect(project.scriptPort).toBe(3001);

    const plan = await planHostAllowance(project, 'abc.trycloudflare.com');
    expect(plan.status).toBe('update');
    expect(plan.updated).toBe(
      `export default { allowedDevOrigins: ['*.trycloudflare.com'] };\n`,
    );

    await fs.writeFile(project.configPath, plan.updated);
    expect(
      (await planHostAllowance(project, 'other.trycloudflare.com')).status,
    ).toBe('allowed');
  });

  it('gives manual instructions for frameworks without auto-edit', async () => {
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { nuxt: '3.0.0' } }),
    );
    const project = await detectProject(dir);
    expect(project.framework.id).toBe('nuxt');
    const plan = await planHostAllowance(project, 'abc.trycloudflare.com');
    expect(plan.status).toBe('manual');
    expect(plan.snippet).toBe(
      `vite: { server: { allowedHosts: ['.trycloudflare.com'] } },`,
    );
  });

  it('does nothing for plain Node apps', async () => {
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { express: '5.0.0' } }),
    );
    const project = await detectProject(dir);
    expect(project.framework).toBeNull();
    expect((await planHostAllowance(project, 'a.trycloudflare.com')).status).toBe(
      'none',
    );
  });
});
