/**
 * Framework detection and dev-server host allow-listing.
 *
 * Modern dev servers reject requests from unknown hosts (Next.js
 * `allowedDevOrigins`, Vite `server.allowedHosts`). When an app is served
 * through a tunnel, the tunnel's hostname has to be allowed. For Cloudflare
 * Quick Tunnels we allow the whole `trycloudflare.com` domain with a wildcard
 * so the entry keeps working when the URL changes on the next run.
 *
 * Config files are JavaScript, so edits are done with conservative text
 * insertion. When the file has a shape we don't recognise we return null and
 * the caller prints manual instructions instead.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const QUICK_TUNNEL_DOMAIN = 'trycloudflare.com';

/**
 * Supported frameworks, in detection priority order. Next.js comes first
 * because Next projects often also depend on vite (via vitest).
 */
export const FRAMEWORKS = [
  {
    id: 'nextjs',
    name: 'Next.js',
    packages: ['next'],
    defaultPort: 3000,
    configFiles: [
      'next.config.ts',
      'next.config.mts',
      'next.config.mjs',
      'next.config.js',
      'next.config.cjs',
    ],
    setting: 'allowedDevOrigins',
    pattern: (host) =>
      isQuickTunnelHost(host) ? `*.${QUICK_TUNNEL_DOMAIN}` : host,
    insert: insertNextAllowedOrigin,
    snippet: (q) => `allowedDevOrigins: [${q}],`,
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    packages: ['nuxt'],
    defaultPort: 3000,
    configFiles: ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs'],
    setting: 'vite.server.allowedHosts',
    pattern: vitePattern,
    insert: null,
    snippet: (q) => `vite: { server: { allowedHosts: [${q}] } },`,
  },
  {
    id: 'astro',
    name: 'Astro',
    packages: ['astro'],
    defaultPort: 4321,
    configFiles: ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'],
    setting: 'vite.server.allowedHosts',
    pattern: vitePattern,
    insert: null,
    snippet: (q) => `vite: { server: { allowedHosts: [${q}] } },`,
  },
  {
    id: 'vite',
    name: 'Vite',
    // SvelteKit, Remix and React Router run on Vite and use vite.config.*.
    packages: ['vite', '@sveltejs/kit', '@remix-run/dev', '@react-router/dev'],
    defaultPort: 5173,
    configFiles: [
      'vite.config.ts',
      'vite.config.mts',
      'vite.config.js',
      'vite.config.mjs',
      'vite.config.cjs',
      'vite.config.cts',
    ],
    setting: 'server.allowedHosts',
    pattern: vitePattern,
    insert: insertViteAllowedHost,
    snippet: (q) => `server: { allowedHosts: [${q}] },`,
  },
];

export function isQuickTunnelHost(host) {
  return host === QUICK_TUNNEL_DOMAIN || host.endsWith(`.${QUICK_TUNNEL_DOMAIN}`);
}

function vitePattern(host) {
  // Vite treats a leading dot as "this domain and all subdomains".
  return isQuickTunnelHost(host) ? `.${QUICK_TUNNEL_DOMAIN}` : host;
}

/**
 * Pick the quote character the file mostly uses.
 * @param {string} content Source
 * @returns {string} `'` or `"`
 */
function quoteFor(content) {
  const single = (content.match(/'/g) || []).length;
  const double = (content.match(/"/g) || []).length;
  return double > single ? '"' : "'";
}

/**
 * Insert `entry` as the first property of the object literal whose `{` is at
 * braceIndex, matching the surrounding indentation.
 */
function insertAfterBrace(content, braceIndex, entry) {
  const after = content.slice(braceIndex + 1);
  const multiLine = after.match(/^[ \t]*\r?\n(?:[ \t]*\r?\n)*([ \t]*)(\S)/);
  let insertion;
  if (multiLine) {
    const [, indent, firstChar] = multiLine;
    insertion =
      firstChar === '}' ? `\n${indent}  ${entry},` : `\n${indent}${entry},`;
  } else {
    insertion = /^\s*\}/.test(after) ? ` ${entry} ` : ` ${entry},`;
  }
  return (
    content.slice(0, braceIndex + 1) + insertion + content.slice(braceIndex + 1)
  );
}

/**
 * Add a value to an existing array literal whose `[` is at bracketIndex.
 */
function insertIntoArray(content, bracketIndex, value) {
  const after = content.slice(bracketIndex + 1);
  const insertion = /^\s*\]/.test(after) ? value : `${value}, `;
  return (
    content.slice(0, bracketIndex + 1) +
    insertion +
    content.slice(bracketIndex + 1)
  );
}

function findEnd(content, regex) {
  const m = regex.exec(content);
  return m ? m.index + m[0].length - 1 : -1;
}

/**
 * Add an origin to `allowedDevOrigins` in a Next.js config.
 * @param {string} content Config source
 * @param {string} pattern Host pattern
 * @returns {string|null} Updated source, or null if the shape is unknown
 */
export function insertNextAllowedOrigin(content, pattern) {
  const q = quoteFor(content);
  const value = `${q}${pattern}${q}`;

  const arrayIdx = findEnd(content, /allowedDevOrigins\s*:\s*\[/);
  if (arrayIdx !== -1) return insertIntoArray(content, arrayIdx, value);

  const objectPatterns = [
    /(?:const|let|var)\s+(?:nextConfig|config)\s*(?::\s*[\w.]+\s*)?=\s*\{/,
    /module\.exports\s*=\s*\{/,
    /export\s+default\s+\{/,
    /export\s+default\s+defineConfig\(\s*\{/,
  ];
  for (const re of objectPatterns) {
    const idx = findEnd(content, re);
    if (idx !== -1) {
      return insertAfterBrace(content, idx, `allowedDevOrigins: [${value}]`);
    }
  }
  return null;
}

/**
 * Add a host to `server.allowedHosts` in a Vite config.
 * @param {string} content Config source
 * @param {string} pattern Host pattern
 * @returns {string|null} Updated source, or null if the shape is unknown
 */
export function insertViteAllowedHost(content, pattern) {
  const q = quoteFor(content);
  const value = `${q}${pattern}${q}`;

  const arrayIdx = findEnd(content, /allowedHosts\s*:\s*\[/);
  if (arrayIdx !== -1) return insertIntoArray(content, arrayIdx, value);

  const serverIdx = findEnd(content, /\bserver\s*:\s*\{/);
  if (serverIdx !== -1) {
    return insertAfterBrace(content, serverIdx, `allowedHosts: [${value}]`);
  }

  const objectPatterns = [
    /defineConfig\(\s*\{/,
    /defineConfig\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*\(\s*\{/,
    /export\s+default\s+\{/,
  ];
  for (const re of objectPatterns) {
    const idx = findEnd(content, re);
    if (idx !== -1) {
      return insertAfterBrace(
        content,
        idx,
        `server: { allowedHosts: [${value}] }`,
      );
    }
  }
  return null;
}

/**
 * Whether a config already allows the host.
 * @param {string} content Config source
 * @param {string} host Tunnel hostname
 * @returns {boolean}
 */
export function isHostAllowed(content, host) {
  if (/allowedHosts\s*:\s*true/.test(content)) return true;
  return content.includes(isQuickTunnelHost(host) ? QUICK_TUNNEL_DOMAIN : host);
}

/**
 * Read package.json in a directory.
 * @param {string} dir Directory
 * @returns {Promise<Object|null>}
 */
async function readPackageJson(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Find an explicit port in the package.json dev script, e.g.
 * "next dev -p 4000", "vite --port 8080", "PORT=4000 node server.js".
 * @param {Object|null} pkg package.json
 * @returns {number|null}
 */
export function portFromScripts(pkg) {
  const script = pkg?.scripts?.dev || pkg?.scripts?.start || '';
  const m =
    script.match(/(?:^|\s)(?:-p|--port)(?:\s+|=)(\d{2,5})\b/) ||
    script.match(/\bPORT=(\d{2,5})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Detect the framework used in a directory.
 * @param {string} dir Project directory
 * @returns {Promise<{dir: string, framework: Object|null, configPath: string|null, scriptPort: number|null}>}
 */
export async function detectProject(dir) {
  const pkg = await readPackageJson(dir);
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  let framework = null;
  for (const fw of FRAMEWORKS) {
    if (fw.packages.some((p) => p in deps)) {
      framework = fw;
      break;
    }
  }

  let configPath = null;
  if (framework) {
    for (const file of framework.configFiles) {
      const candidate = path.join(dir, file);
      try {
        await fs.access(candidate);
        configPath = candidate;
        break;
      } catch {
        // try next
      }
    }
  }

  return { dir, framework, configPath, scriptPort: portFromScripts(pkg) };
}

/**
 * Work out what (if anything) must change for the dev server to accept
 * requests on the tunnel host.
 * @param {Object} project Result of detectProject()
 * @param {string} host Tunnel hostname
 * @returns {Promise<{status: 'none'|'allowed'|'update'|'manual', pattern?: string, updated?: string, snippet?: string}>}
 */
export async function planHostAllowance(project, host) {
  const { framework, configPath } = project;
  if (!framework) return { status: 'none' };

  const pattern = framework.pattern(host);
  let content = '';
  if (configPath) {
    content = await fs.readFile(configPath, 'utf8');
    if (isHostAllowed(content, host)) return { status: 'allowed', pattern };
  }

  const q = content ? quoteFor(content) : "'";
  const snippet = framework.snippet(`${q}${pattern}${q}`);

  if (configPath && framework.insert) {
    const updated = framework.insert(content, pattern);
    if (updated) return { status: 'update', pattern, updated, snippet };
  }
  return { status: 'manual', pattern, snippet };
}
