// Sunucuyu ve arayüzü birlikte başlatır: npm run dev
import { spawn } from 'node:child_process';
const run = (name, args) => {
  const p = spawn('npm', args, { stdio: 'pipe', shell: process.platform === 'win32' });
  const tag = name === 'server' ? '\x1b[36m[sunucu]\x1b[0m' : '\x1b[33m[arayüz]\x1b[0m';
  p.stdout.on('data', d => process.stdout.write(d.toString().split('\n').filter(Boolean).map(l => `${tag} ${l}`).join('\n') + '\n'));
  p.stderr.on('data', d => process.stderr.write(`${tag} ${d}`));
  return p;
};
const ps = [run('server', ['--prefix', 'server', 'run', 'dev']), run('web', ['--prefix', 'web', 'run', 'dev'])];
process.on('SIGINT', () => { ps.forEach(p => p.kill()); process.exit(0); });
