/**
 * Build script for FlexLayout workspace
 *
 * Uses esbuild to compile JSX and bundle React dependencies.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev') || isWatch;

function getVersionInfo() {
  try {
    const gitTag = execSync('git describe --tags --exact-match 2>/dev/null', { encoding: 'utf8' }).trim();
    return { version: gitTag, isTag: true };
  } catch {
    try {
      const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
      return { version: commitHash, isTag: false };
    } catch {
      return { version: 'unknown', isTag: false };
    }
  }
}

const versionInfo = getVersionInfo();
console.log(`Version: ${versionInfo.isTag ? versionInfo.version : 'commit ' + versionInfo.version}`);

const versionFile = path.join(__dirname, '..', 'src', 'version.json');
fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2));

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const buildVersion = versionInfo.isTag 
  ? versionInfo.version.replace(/^v/, '')
  : `0.0.0-dev.${versionInfo.version}`;
if (packageJson.version !== buildVersion) {
  packageJson.version = buildVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated package.json version to: ${buildVersion}`);
}

// Ensure output directory exists
const outdir = path.join(__dirname, '..', 'src', 'renderer', 'workspace', 'dist');
if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true });
}

const buildOptions = {
  entryPoints: [
    path.join(__dirname, '..', 'src', 'renderer', 'workspace', 'flexlayout', 'index.jsx')
  ],
  bundle: true,
  outfile: path.join(outdir, 'workspace-bundle.js'),
  format: 'esm',
  platform: 'browser',
  target: ['chrome110'],
  sourcemap: isDev,
  minify: !isDev,
  jsx: 'automatic',
  // External modules that should not be bundled (loaded separately)
  external: [],
  // Define globals
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"'
  },
  // Loader for different file types
  loader: {
    '.js': 'jsx',  // Allow JSX in .js files too
    '.jsx': 'jsx',
    '.css': 'css'
  },
  // Log level
  logLevel: 'info'
};

async function build() {
  try {
    if (isWatch) {
      // Watch mode
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      // One-time build
      const result = await esbuild.build(buildOptions);
      console.log('Build complete:', result);
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
