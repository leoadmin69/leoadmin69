// Stockage simple : un fichier JSON écrit de façon atomique (pas de base de données à installer).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const empty = () => ({
  settings: { blocus: { state: 'inconnu', message: '', updatedAt: null, by: '' } },
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
  mods: [],
  audit: [],
  supports: {},      // demandId -> [hash visiteur]
});

function load() {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

export const db = load();

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
export function flush() {
  clearTimeout(timer);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

export const newId = () => crypto.randomBytes(8).toString('hex');
export const now = () => new Date().toISOString();
