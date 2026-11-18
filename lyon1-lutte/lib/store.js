// Stockage : un fichier JSON écrit de façon atomique (pas de base de données à installer).
// Si Supabase est configuré (hébergement gratuit sans disque), chaque modification y est aussi recopiée,
// et la base est relue depuis Supabase au démarrage.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { remoteEnabled, ensureBucket, getJson, putBuffer } from './remote.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const REMOTE_FILE = 'db.json';
fs.mkdirSync(DATA_DIR, { recursive: true });

const empty = () => ({
  settings: { blocus: { state: 'auto', message: '', updatedAt: null, by: '' } },
  feed: [],          // fil « live » public (actions des modos, sans données perso)
  buildings: [],
  events: [],
  reports: [],
  demands: [],
  contacts: [],
  flashes: [],
  channels: [],
  messages: [],
  subscribers: [],
  pushSubs: [],      // abonnements aux notifications du téléphone
  mods: [],
  audit: [],
  supports: {},      // demandId -> [hash visiteur]
});

function loadLocal() {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

export const db = loadLocal();

// À appeler AVANT de démarrer le serveur : récupère la base sauvegardée dans Supabase.
export async function initStore() {
  if (!remoteEnabled()) return 'local';
  await ensureBucket();
  const remote = await getJson(REMOTE_FILE);
  if (remote) {
    Object.assign(db, empty(), remote);
    writeLocal();
    return 'remote';
  }
  // Première mise en ligne : on envoie la base locale (vide ou existante).
  await pushRemote();
  return 'remote-new';
}

function writeLocal() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

// Envoi vers Supabase : regroupé (au plus un envoi toutes les 2 s) et jamais deux en même temps.
let remoteTimer = null;
let remoteBusy = null;
let remoteDirty = false;
async function pushRemote() {
  if (remoteBusy) { remoteDirty = true; return remoteBusy; }
  remoteBusy = (async () => {
    try {
      do {
        remoteDirty = false;
        await putBuffer(REMOTE_FILE, Buffer.from(JSON.stringify(db)), 'application/json');
      } while (remoteDirty);
    } catch (e) {
      console.error('[sauvegarde] Supabase :', e.message);
      remoteDirty = false;
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(pushRemote, 15000); // nouvel essai
    } finally {
      remoteBusy = null;
    }
  })();
  return remoteBusy;
}

let timer = null;
let firstPending = 0;
export function save() {
  // anti-rafale : on regroupe, mais on écrit au plus tard 2 s après la première modification (même sous fort trafic)
  if (!firstPending) firstPending = Date.now();
  clearTimeout(timer);
  timer = setTimeout(flush, Date.now() - firstPending > 2000 ? 0 : 250);
}
export function flush() {
  clearTimeout(timer);
  firstPending = 0;
  writeLocal();
  if (remoteEnabled()) {
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(pushRemote, 2000);
  }
}
// Arrêt du serveur (redéploiement, mise en veille) : on termine la sauvegarde avant de quitter.
async function shutdown() {
  try {
    clearTimeout(timer);
    writeLocal();
    if (remoteEnabled()) { clearTimeout(remoteTimer); await pushRemote(); if (remoteBusy) await remoteBusy; }
  } catch (e) { console.error('[arrêt]', e.message); }
  process.exit(0);
}
// Supabase gratuit met en pause un projet inactif pendant 7 jours : une sauvegarde toutes les 12 h l'en empêche.
setInterval(() => { if (remoteEnabled()) pushRemote(); }, 12 * 3600e3).unref();
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export const newId = () => crypto.randomBytes(8).toString('hex');
export const now = () => new Date().toISOString();
