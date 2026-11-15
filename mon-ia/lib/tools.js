// Outils que l'IA peut utiliser toute seule : s'informer, organiser, se souvenir.
import { load, save, newId, now } from './store.js';
import { search } from './retrieval.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MonIA/1.0)' };

async function webSearch({ query }) {
  const results = [];
  // 1) DuckDuckGo (version HTML légère, sans clé)
  try {
    const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), { headers: UA, signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && results.length < 5) {
      let url = m[1];
      const u = url.match(/uddg=([^&]+)/);
      if (u) url = decodeURIComponent(u[1]);
      const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      results.push({ title: clean(m[2]), url, snippet: clean(m[3]) });
    }
  } catch { /* on tente Wikipédia */ }
  // 2) Wikipédia en secours / en complément
  if (results.length < 2) {
    try {
      const r = await fetch('https://fr.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=' + encodeURIComponent(query), { headers: UA, signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      for (const s of j.query?.search || []) {
        results.push({ title: s.title, url: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(s.title.replace(/ /g, '_')), snippet: s.snippet.replace(/<[^>]+>/g, '') });
      }
    } catch { /* rien */ }
  }
  return results.length ? results : { error: 'Aucun résultat (réseau indisponible ?)' };
}

async function readPage({ url }) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (r.status === 401 || r.status === 403) {
      return { url, status: r.status, error: "Page privée : elle demande une connexion. Je n'essaie pas de la contourner. Solutions : l'admin exporte le contenu et le joint dans la conversation (📎), ou fournit un jeton d'accès que je pourrai utiliser pour ce site."};
    }
    if (/pdf/i.test(r.headers.get('content-type') || '') || /\.pdf($|\?)/i.test(url)) {
      const { pdfText } = await import('./files.js');
      return { url, text: (await pdfText(Buffer.from(await r.arrayBuffer()))).slice(0, 30000) };
    }
    const html = await r.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (/enable javascript|requires javascript|sign in to continue|log in to continue|connexion requise/i.test(text) || text.length < 200) {
      return { url, text: text.slice(0, 2000), hint: "Cette page ressemble à une page dynamique ou protégée (JavaScript ou connexion). Essaie une autre source sur le même sujet, ou demande à l'admin de joindre le contenu (📎) ou un export." };
    }
    return { url, text: text.slice(0, 6000) };
  } catch (e) {
    return { error: 'Lecture impossible : ' + e.message };
  }
}

function addTask({ title, due = null, priority = 'normale' }) {
  const tasks = load('tasks');
  const t = { id: newId(), title, due, priority, done: false, createdAt: now() };
  tasks.push(t); save('tasks');
  return t;
}
function listTasks({ include_done = false } = {}) {
  return load('tasks').filter((t) => include_done || !t.done);
}
function completeTask({ id }) {
  const t = load('tasks').find((x) => x.id === id);
  if (!t) return { error: 'Tâche introuvable' };
  t.done = true; save('tasks');
  return t;
}
function searchKnowledge({ query }) {
  const hits = search(load('knowledge'), query, 5);
  return hits.length ? hits.map((h) => ({ title: h.title, content: h.content })) : { info: 'Rien dans ma base de connaissances.' };
}
function remember({ text }, ctx) {
  if (!ctx.isAdmin) return { error: "Seul l'admin peut m'apprendre des choses durablement." };
  const lessons = load('lessons');
  const l = { id: newId(), text, source: 'chat (admin)', createdAt: now() };
  lessons.push(l); save('lessons');
  return { ok: true, saved: text };
}

/**
 * Déclare un outil.
 * kind : 'read'  = lecture seule, toujours autorisé
 *        'safe'  = modifie seulement des données internes (tâches, plan) : autorisé sans confirmation
 *        'write' = modifie des fichiers / la configuration : confirmation en mode « Demander »
 *        'exec'  = exécute une commande ou publie : confirmation en mode « Demander »
 * group : 'basic' | 'code' (nécessite un projet ouvert) | 'agents'
 */
export function defineTool(name, description, properties, required, run, { kind = 'read', adminOnly = false, group = 'basic' } = {}) {
  return {
    name, kind, adminOnly, group, run,
    def: { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } },
  };
}

const S = { type: 'string' };
export const BASIC_TOOLS = [
  defineTool('web_search', 'Chercher sur internet des informations récentes ou que tu ne connais pas.', { query: S }, ['query'], webSearch),
  defineTool('read_page', "Lire le texte d'une page web (après une recherche).", { url: S }, ['url'], readPage),
  defineTool('search_knowledge', "Chercher dans la base de connaissances apprise par l'admin.", { query: S }, ['query'], searchKnowledge),
  defineTool('add_task', "Ajouter une tâche à la liste de l'admin.", {
    title: S, due: { type: 'string', description: 'Date limite AAAA-MM-JJ (optionnel)' },
    priority: { type: 'string', enum: ['basse', 'normale', 'haute'] },
  }, ['title'], addTask, { kind: 'safe', adminOnly: true }),
  defineTool('list_tasks', 'Lister les tâches.', { include_done: { type: 'boolean' } }, [], listTasks, { adminOnly: true }),
  defineTool('complete_task', 'Marquer une tâche comme terminée (id obtenu avec list_tasks).', { id: S }, ['id'], completeTask, { kind: 'safe', adminOnly: true }),
  defineTool('remember', "Mémoriser durablement une règle ou un fait quand l'admin te demande de retenir quelque chose.", { text: S }, ['text'], remember, { kind: 'safe', adminOnly: true }),
];
