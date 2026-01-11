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
  metafile: true,
  treeShaking: true,
  jsx: 'automatic',
  external: [],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"'
  },
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.css': 'css'
  },
  logLevel: 'info'
};

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      const result = await esbuild.build(buildOptions);
      if (result.metafile && !isDev) {
        const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
        console.log('\nBundle analysis:\n' + analysis);
      }
      console.log('Build complete');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
