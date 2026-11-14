// Sauvegarde automatique de la mémoire de l'IA dans un dépôt GitHub privé, et restauration au démarrage.
// Indispensable sur les hébergements gratuits dont le disque s'efface (Render, etc.).
//
// Réglages (variables d'environnement, car les réglages internes s'effacent eux aussi) :
//   BACKUP_GITHUB_REPO   = pseudo/nom-du-depot   (dépôt PRIVÉ dédié, ex : leo/nova-memoire)
//   BACKUP_GITHUB_TOKEN  = jeton GitHub avec le droit « Contents : Read and write » sur ce dépôt
//   BACKUP_MINUTES       = délai minimum entre deux sauvegardes (10 par défaut)
//
// Le fichier envoyé est compressé puis chiffré (AES-256-GCM) avec ADMIN_PASSWORD : même si le dépôt fuitait,
// les clés API et les conversations qu'il contient resteraient illisibles sans ce mot de passe.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { DATA_DIR, load, save, onSave } from './store.js';

export const BACKUP_NAMES = ['persona', 'knowledge', 'lessons', 'tasks', 'conversations', 'agents', 'models', 'missions', 'devices', 'settings', 'journal', 'proposals', 'apikeys', 'workspaces'];
const MAGIC = Buffer.from('NOVA1');

const cfg = () => ({
  repo: (process.env.BACKUP_GITHUB_REPO || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''),
  token: (process.env.BACKUP_GITHUB_TOKEN || '').trim(),
  file: process.env.BACKUP_PATH || 'nova-backup.enc',
  api: (process.env.BACKUP_API_URL || 'https://api.github.com').replace(/\/$/, ''),
  minutes: Math.max(1, Number(process.env.BACKUP_MINUTES) || 10),
  password: process.env.ADMIN_PASSWORD || '',
});
export const backupConfigured = () => { const c = cfg(); return !!(c.repo && c.token && c.password); };

const state = { dirty: false, lastBackupAt: null, lastRestoreAt: null, lastError: null, restored: 0, running: false };
export const backupStatus = () => ({ configured: backupConfigured(), repo: cfg().repo || null, minutes: cfg().minutes, ...state });

function encrypt(buf, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(password, salt, 32), iv);
  const data = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}
function decrypt(buf, password) {
  if (!buf.subarray(0, 5).equals(MAGIC)) throw new Error('Fichier de sauvegarde non reconnu');
  const salt = buf.subarray(5, 21); const iv = buf.subarray(21, 33); const tag = buf.subarray(33, 49);
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(password, salt, 32), iv);
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(buf.subarray(49)), decipher.final()]); } catch { throw new Error('Déchiffrement impossible : ADMIN_PASSWORD est différent de celui utilisé lors de la sauvegarde'); }
}

async function gh(method, accept, body) {
  const c = cfg();
  const res = await fetch(`${c.api}/repos/${c.repo}/contents/${encodeURIComponent(c.file)}`, {
    method, signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${c.token}`, Accept: accept, 'User-Agent': 'nova-backup', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}
const explain = async (res) => {
  const hint = { 401: 'jeton GitHub refusé', 403: "le jeton n'a pas le droit d'écrire dans ce dépôt (permission « Contents : Read and write »)", 404: 'dépôt introuvable ou inaccessible avec ce jeton' }[res.status];
  return `GitHub HTTP ${res.status}${hint ? ' : ' + hint : ''} ${(await res.text()).slice(0, 120)}`;
};

/** Envoie une sauvegarde chiffrée maintenant. */
export async function backupNow({ force = false } = {}) {
  if (!backupConfigured()) throw new Error('Sauvegarde automatique non configurée');
  // Sécurité : si la restauration a échoué au démarrage, on n'écrase pas la bonne sauvegarde avec une mémoire vide.
  if (state.restoreFailed && !force) throw new Error(`Sauvegardes suspendues : la restauration a échoué au démarrage (${state.lastError}). Corrige la cause et redémarre, ou force la sauvegarde.`);
  state.restoreFailed = false;
  if (state.running) return backupStatus();
  state.running = true;
  state.dirty = false;
  try {
    const snapshot = { version: 1, savedAt: new Date().toISOString(), data: Object.fromEntries(BACKUP_NAMES.map((n) => [n, load(n)])) };
    const blob = encrypt(zlib.gzipSync(JSON.stringify(snapshot)), cfg().password);
    const head = await gh('GET', 'application/vnd.github+json');
    if (!head.ok && head.status !== 404) throw new Error(await explain(head));
    const sha = head.ok ? (await head.json()).sha : (await head.text(), undefined);
    const put = await gh('PUT', 'application/vnd.github+json', { message: `Sauvegarde ${snapshot.savedAt}`, content: blob.toString('base64'), sha });
    if (!put.ok) throw new Error(await explain(put));
    await put.text();
    state.lastBackupAt = snapshot.savedAt;
    state.lastError = null;
    state.size = blob.length;
  } catch (e) {
    state.dirty = true;
    state.lastError = e.message;
    throw e;
  } finally {
    state.running = false;
  }
  return backupStatus();
}

/** Au démarrage : si le disque est vide (hébergeur qui efface tout), recharge la dernière sauvegarde. */
export async function restoreIfEmpty() {
  if (!backupConfigured()) return false;
  const hasData = BACKUP_NAMES.some((n) => fs.existsSync(path.join(DATA_DIR, `${n}.json`)));
  if (hasData) return false;
  try {
    const res = await gh('GET', 'application/vnd.github.raw+json');
    if (res.status === 404) { await res.text(); return false; } // première installation : rien à restaurer
    if (!res.ok) throw new Error(await explain(res));
    const snapshot = JSON.parse(zlib.gunzipSync(decrypt(Buffer.from(await res.arrayBuffer()), cfg().password)).toString('utf8'));
    let count = 0;
    for (const n of BACKUP_NAMES) if (snapshot.data?.[n] !== undefined) { save(n, snapshot.data[n]); count++; }
    Object.assign(state, { dirty: false, lastRestoreAt: new Date().toISOString(), lastBackupAt: snapshot.savedAt, restored: count, lastError: null });
    return true;
  } catch (e) {
    state.restoreFailed = true;
    state.lastError = `Restauration : ${e.message}`;
    console.error('⚠️  ' + state.lastError);
    return false;
  }
}

/** Sauvegarde dès que la mémoire a changé (au plus toutes les N minutes) et juste avant l'arrêt du serveur. */
export function startAutoBackup() {
  if (!backupConfigured()) return;
  onSave(() => { state.dirty = true; });
  let last = Date.now();
  setInterval(() => {
    if (!state.dirty || state.running || state.restoreFailed || Date.now() - last < cfg().minutes * 60000) return;
    last = Date.now();
    backupNow().catch((e) => console.error('Sauvegarde automatique :', e.message));
  }, 30000).unref();
  const stop = async (signal) => {
    if (state.dirty && !state.restoreFailed) {
      console.log(`${signal} reçu : sauvegarde avant l'arrêt…`);
      await Promise.race([backupNow().catch((e) => console.error(e.message)), new Promise((r) => setTimeout(r, 15000))]);
    }
    process.exit(0);
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}
