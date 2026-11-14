// Stockage simple en fichiers JSON (aucune base de données à installer).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
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
  conversations: [], // { id, title, messages:[{role,content,feedback?,steps?}], updatedAt }
  // Fournisseurs de modèles ajoutés par l'admin et rôles : fast (⚡), smart (🧠), fallbacks (secours).
  models: { providers: [], roles: { fast: '', smart: '', fallbacks: [] } },
  settings: { notify: {}, voice: {} }, // notifications (ntfy, Telegram, webhook) et voix
  devices: [],   // matériel contrôlable : voir lib/devices.js
  missions: [],  // tâches autonomes : voir lib/missions.js
  apikeys: [],   // clés d'intégration pour les autres systèmes (stockées hachées)
  workspaces: [], // projets (sites) auxquels l'IA a accès : voir lib/workspace.js
  // Agents spécialisés. tools = [] signifie « tous les outils ».
  agents: [
    {
      id: 'dev', name: 'Développeur web', description: 'Modifie, corrige et améliore le code d\'un projet.',
      model: '', createdAt: '',
      tools: ['list_files', 'read_file', 'search_code', 'write_file', 'edit_file', 'delete_file', 'run_command', 'git_status', 'git_diff', 'update_plan', 'web_search', 'read_page'],
      instructions: [
        'Tu es un développeur web senior, rigoureux et autonome.',
        '1. Explore avant de modifier : list_files, search_code, read_file.',
        '2. Pour une tâche de plus de 2 étapes, fais un plan avec update_plan et tiens-le à jour.',
        '3. Fais des modifications minimales et ciblées avec edit_file (write_file seulement pour les nouveaux fichiers).',
        '4. Vérifie ton travail : relis le fichier, lance le build ou les tests avec run_command quand le projet en a.',
        '5. Ne mets jamais de mot de passe ou de clé API dans le code.',
        '6. Termine par un résumé clair : fichiers modifiés et ce qui a changé.',
      ].join('\n'),
    },
    {
      id: 'research', name: 'Chercheur', description: 'Fait des recherches web approfondies et synthétise avec sources.',
      model: '', createdAt: '', tools: ['web_search', 'read_page', 'search_knowledge', 'update_plan'],
      instructions: 'Tu es un chercheur méthodique. Fais plusieurs recherches, lis les meilleures pages, recoupe les informations, puis rédige une synthèse structurée en citant chaque source (lien).',
    },
    {
      id: 'organizer', name: 'Organisateur', description: 'Planifie, découpe les projets en étapes et gère les tâches.',
      model: '', createdAt: '', tools: ['add_task', 'list_tasks', 'complete_task', 'update_plan', 'search_knowledge'],
      instructions: 'Tu es un assistant d\'organisation. Découpe les objectifs en étapes concrètes, estime les durées, crée les tâches avec dates et priorités, et propose des plannings réalistes.',
    },
  ],
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
