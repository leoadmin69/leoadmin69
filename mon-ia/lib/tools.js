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
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
    const html = await r.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
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

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const TOOL_DEFS = [
  fn('web_search', "Chercher sur internet des informations récentes ou que tu ne connais pas.", { query: { type: 'string' } }, ['query']),
  fn('read_page', "Lire le texte d'une page web (après une recherche).", { url: { type: 'string' } }, ['url']),
  fn('search_knowledge', "Chercher dans la base de connaissances apprise par l'admin.", { query: { type: 'string' } }, ['query']),
  fn('add_task', "Ajouter une tâche à la liste de l'utilisateur.", {
    title: { type: 'string' }, due: { type: 'string', description: 'Date limite AAAA-MM-JJ (optionnel)' },
    priority: { type: 'string', enum: ['basse', 'normale', 'haute'] },
  }, ['title']),
  fn('list_tasks', 'Lister les tâches.', { include_done: { type: 'boolean' } }),
  fn('complete_task', 'Marquer une tâche comme terminée.', { id: { type: 'string' } }, ['id']),
  fn('remember', "Mémoriser durablement une règle ou un fait quand l'admin te demande de retenir quelque chose.", { text: { type: 'string' } }, ['text']),
];

const IMPL = { web_search: webSearch, read_page: readPage, search_knowledge: searchKnowledge, add_task: addTask, list_tasks: listTasks, complete_task: completeTask, remember };

export async function runTool(name, args, ctx) {
  const f = IMPL[name];
  if (!f) return { error: `Outil inconnu : ${name}` };
  try { return await f(args || {}, ctx); } catch (e) { return { error: e.message }; }
}
