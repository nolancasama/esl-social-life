// Runs e2e scripts against a Vite dev server that this runner starts and stops.
//   node scripts/run-e2e.mjs playthrough [scenarios speech ...]
//   npm run e2e:mall — town entrance, shopping, food court and phone outing
// Each name maps to scripts/<name>.mjs and receives BASE. If BASE is already
// set, no server is started (the scripts use that server instead).
// Exit code: 0 when every script passed, otherwise the first failing code;
// 2 for an unknown script name (checked before anything starts).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = process.argv.slice(2);
if (!names.length) {
  console.error('usage: node scripts/run-e2e.mjs <script> [<script> ...]');
  process.exit(2);
}
for (const n of names) {
  if (n === 'run-e2e' || n === 'lib' || !fs.existsSync(path.join(root, 'scripts', `${n}.mjs`))) {
    console.error(`unknown e2e script: ${n}`);
    process.exit(2);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitFor(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function runScript(file, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [file], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    p.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  // Vite starts helper processes (esbuild); end the whole tree.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

let server = null;
let base = process.env.BASE;
if (!base) {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', (d) => process.stderr.write(d));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(server); process.exit(1); });
  if (!(await waitFor(`${base}/`))) {
    console.error('e2e: the dev server did not start');
    stop(server);
    process.exit(1);
  }
}

let code = 0;
try {
  for (const n of names) {
    console.log(`\n=== e2e: ${n} (${base}) ===`);
    const c = await runScript(path.join(root, 'scripts', `${n}.mjs`), { BASE: base });
    if (c !== 0) {
      console.log(`=== e2e: ${n} FAILED (exit ${c}) ===`);
      if (!code) code = c;
    }
  }
} finally {
  stop(server);
}
process.exit(code);
