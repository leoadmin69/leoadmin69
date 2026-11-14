#!/usr/bin/env node
// Agent distant de Nova : à lancer sur l'appareil que tu veux lui confier (PC, Raspberry Pi, serveur…).
// Il se connecte à ton IA (connexion sortante : aucun port à ouvrir), attend ses ordres et exécute
// uniquement ce que tu as autorisé pour cet appareil dans Admin → Appareils.
//
//   node nova-agent.mjs https://adresse-de-ton-ia novadev_xxxxxxxx
//
// Nécessite Node.js 18 ou plus. Arrêt : Ctrl+C.
import { spawn } from 'node:child_process';
import os from 'node:os';

const [url, token] = process.argv.slice(2);
if (!url || !token) { console.error('Usage : node nova-agent.mjs https://adresse-de-ton-ia novadev_xxxxxxxx'); process.exit(1); }
const base = url.replace(/\/$/, '');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

function run(command, value) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, env: { ...process.env, VALUE: value ?? '' } });
    let out = '';
    const add = (d) => { out += d; if (out.length > 40000) out = out.slice(-20000); };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => { child.kill(); out += '\n[Arrêté : délai de 100 s dépassé]'; }, 100000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: out }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, output: e.message }); });
  });
}

console.log(`Agent Nova démarré sur « ${os.hostname()} » → ${base}`);
let wait = 1000;
for (;;) {
  try {
    const r = await fetch(`${base}/api/device/poll?host=${encodeURIComponent(os.hostname())}&os=${encodeURIComponent(os.platform())}`, { headers, signal: AbortSignal.timeout(40000) });
    if (r.status === 401) { console.error('Jeton refusé. Vérifie-le dans Admin → Appareils.'); process.exit(1); }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { job } = await r.json();
    wait = 1000;
    if (!job) continue;
    console.log(`[${new Date().toLocaleTimeString()}] ${job.label}`);
    const result = await run(job.command, job.value);
    await fetch(`${base}/api/device/result`, { method: 'POST', headers, body: JSON.stringify({ id: job.id, ...result }) });
  } catch (e) {
    console.error(`Connexion perdue (${e.message}). Nouvel essai dans ${wait / 1000} s…`);
    await new Promise((res) => setTimeout(res, wait));
    wait = Math.min(wait * 2, 30000);
  }
}
