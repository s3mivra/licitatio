import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Bundle our code and @licitatio/shared; keep npm dependencies external (argon2 is native).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@licitatio/shared');

await build({
  entryPoints: { server: 'src/server.ts', 'db-indexes': '../../scripts/db-indexes.ts', 'seed-requirements': '../../scripts/seed-requirements.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('built dist/server.js and operator scripts');
