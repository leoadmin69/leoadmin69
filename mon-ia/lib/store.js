// Stockage simple en fichiers JSON (aucune base de données à installer).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  persona: {
    name: 'Nova',
    instructions: [
      "Tu es Nova, une assistante IA personnelle, utile, honnête et précise.",
      "Tu réponds dans la langue de l'utilisateur (français par défaut).",
      "Tu sais coder (explique, écris et corrige du code, toujours dans des blocs ```langage).",
      "Tu sais informer (si tu n'es pas sûre d'un fait récent, utilise l'outil de recherche).",
      "Tu sais organiser (listes de tâches, plannings, plans étape par étape).",
      "Si tu ne sais pas, dis-le au lieu d'inventer.",
    ].join('\n'),
    temperature: 0.6,
  },
  knowledge: [], // { id, title, content, tags, createdAt }
  lessons: [],   // { id, text, source, createdAt }  -> règles toujours appliquées
  tasks: [],     // { id, title, due, priority, done, createdAt }
  conversations: [], // { id, title, messages:[{role,content,feedback?}], updatedAt }
};

const cache = {};

function file(name) { return path.join(DATA_DIR, `${name}.json`); }

export function load(name) {
  if (cache[name]) return cache[name];
  try {
    cache[name] = JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    cache[name] = structuredClone(DEFAULTS[name]);
  }
  return cache[name];
}

export function save(name, value) {
  if (value !== undefined) cache[name] = value;
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache[name], null, 2));
  fs.renameSync(tmp, file(name));
}

export const newId = () => crypto.randomUUID().slice(0, 8);
export const now = () => new Date().toISOString();
