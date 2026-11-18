#!/usr/bin/env node
// Pilotage du site en production, utilisable par Claude Code, Copilot ou un humain.
// Usage (depuis lyon1-lutte/) :
//   node tools/ops.mjs health            → le site en ligne répond-il ? (SITE_URL)
//   node tools/ops.mjs status            → service Render + 5 derniers déploiements
//   node tools/ops.mjs deploy            → lance un déploiement Render de la branche de travail
//   node tools/ops.mjs env               → noms des variables du service Render (jamais les valeurs)
//   node tools/ops.mjs setenv NOM=valeur → modifie une variable Render (puis redéploie)
//   node tools/ops.mjs backup [dossier]  → télécharge la base (db.json) depuis Supabase
//   node tools/ops.mjs restore fichier   → remet une sauvegarde dans Supabase (DANGEREUX : demande --oui)
// Secrets lus dans les variables d'environnement (jamais dans le dépôt) :
//   RENDER_API_KEY, RENDER_SERVICE_ID (ou RENDER_DEPLOY_HOOK_URL), SUPABASE_URL, SUPABASE_SERVICE_KEY, SITE_URL
import fs from 'node:fs';
import path from 'node:path';

const [cmd, arg, ...rest] = process.argv.slice(2);
const env = (k) => (process.env[k] || '').trim();
const SITE = () => (env('SITE_URL') || 'https://leoadmin69.onrender.com').replace(/\/$/, '');
const die = (msg) => { console.error('✗', msg); process.exit(1); };
const need = (...keys) => { const miss = keys.filter((k) => !env(k)); if (miss.length) die(`Variable(s) manquante(s) : ${miss.join(', ')} (voir AGENTS.md → « Accès production »).`); };

async function render(p, opts = {}) {
  need('RENDER_API_KEY');
  const r = await fetch(`https://api.render.com/v1${p}`, { ...opts, headers: { Authorization: `Bearer ${env('RENDER_API_KEY')}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  if (!r.ok) die(`Render ${p} : HTTP ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
async function serviceId() {
  // service de production (avec Supabase, Telegram, IA) : « Lyon1-ladoua-en-lutte » → https://leoadmin69.onrender.com
  return env('RENDER_SERVICE_ID') || 'srv-dbu3je68bjmc73a7vt1g';
}
const supa = (p) => `${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/${env('SUPABASE_BUCKET') || 'ladoua-en-lutte'}/${p}`;
const supaHeaders = () => { const k = env('SUPABASE_SERVICE_KEY'); return { apikey: k, ...(k.startsWith('sb_') ? {} : { Authorization: `Bearer ${k}` }) }; };

const cmds = {
  async health() {
    const t = Date.now();
    try {
      const r = await fetch(`${SITE()}/api/health`, { signal: AbortSignal.timeout(60000) });
      const via = r.headers.get('x-render-routing');
      console.log(`${r.ok ? '✓' : '✗'} ${SITE()} → HTTP ${r.status} en ${Date.now() - t} ms${via === 'no-server' ? ' · Render : aucun service à cette adresse' : ''}`);
      if (!r.ok) process.exit(1);
    } catch (e) { die(`${SITE()} injoignable : ${e.message}`); }
  },
  async status() {
    const id = await serviceId();
    const s = await render(`/services/${id}`);
    console.log(`Service : ${s.name} · ${s.serviceDetails?.url || ''} · branche ${s.branch} · ${s.suspended === 'suspended' ? 'SUSPENDU' : 'actif'}`);
    const deploys = await render(`/services/${id}/deploys?limit=5`);
    for (const d of deploys.map((x) => x.deploy || x)) console.log(`  ${d.createdAt} · ${d.status} · ${d.commit?.id?.slice(0, 7) || ''} ${d.commit?.message?.split('\n')[0] || ''}`);
  },
  async deploy() {
    if (env('RENDER_DEPLOY_HOOK_URL') && !env('RENDER_API_KEY')) {
      const r = await fetch(env('RENDER_DEPLOY_HOOK_URL'), { method: 'POST', signal: AbortSignal.timeout(30000) });
      return console.log(r.ok ? '✓ Déploiement demandé (deploy hook).' : `✗ Deploy hook : HTTP ${r.status}`);
    }
    const id = await serviceId();
    const d = await render(`/services/${id}/deploys`, { method: 'POST', body: JSON.stringify({ clearCache: 'do_not_clear' }) });
    console.log(`✓ Déploiement lancé : ${d.id} (${d.status}). Suivi : node tools/ops.mjs status`);
  },
  async env() {
    const id = await serviceId();
    const vars = await render(`/services/${id}/env-vars?limit=100`);
    console.log(vars.map((x) => (x.envVar || x).key).sort().join('\n'));
  },
  async setenv() {
    const m = /^([A-Z0-9_]+)=(.*)$/s.exec(arg || '');
    if (!m) die('Usage : node tools/ops.mjs setenv NOM=valeur');
    const id = await serviceId();
    await render(`/services/${id}/env-vars/${m[1]}`, { method: 'PUT', body: JSON.stringify({ value: m[2] }) });
    console.log(`✓ ${m[1]} modifiée. Lance « node tools/ops.mjs deploy » pour l'appliquer.`);
  },
  async backup() {
    need('SUPABASE_URL', 'SUPABASE_SERVICE_KEY');
    const r = await fetch(supa('db.json'), { headers: supaHeaders(), signal: AbortSignal.timeout(60000) });
    if (!r.ok) die(`Supabase : HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    JSON.parse(buf.toString('utf8'));
    const dir = arg || 'backups';
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, buf);
    console.log(`✓ Base sauvegardée : ${file} (${Math.round(buf.length / 1024)} Ko). Ne la mets JAMAIS dans le dépôt (données privées).`);
  },
  async restore() {
    need('SUPABASE_URL', 'SUPABASE_SERVICE_KEY');
    if (!arg || !fs.existsSync(arg)) die('Usage : node tools/ops.mjs restore fichier.json --oui');
    if (!rest.includes('--oui')) die('Ça remplace la base en ligne. Fais d’abord « backup », puis relance avec --oui. Redéploie ensuite pour que le site relise la base.');
    const buf = fs.readFileSync(arg);
    JSON.parse(buf.toString('utf8'));
    const r = await fetch(supa('db.json'), { method: 'PUT', headers: { ...supaHeaders(), 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: buf, signal: AbortSignal.timeout(60000) });
    if (!r.ok) die(`Supabase : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    console.log('✓ Base remise en ligne. Lance « node tools/ops.mjs deploy » pour que le site la relise.');
  },
};

if (!cmds[cmd]) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).slice(0, 12).join('\n')); process.exit(cmd ? 1 : 0); }
await cmds[cmd]();
