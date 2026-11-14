// Mon IA — serveur principal (Node.js >= 18, zéro dépendance).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { load, save, newId, now } from './lib/store.js';
import { search, chunk } from './lib/retrieval.js';
import { TOOL_DEFS, runTool } from './lib/tools.js';
import { streamChat, llmInfo } from './lib/llm.js';

// --- Lecture du fichier .env (sans dépendance) ---
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* pas de .env : variables du serveur d'hébergement */ }

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_CHAT = process.env.PUBLIC_CHAT === 'true';
const MAX_TOOL_ROUNDS = 5;
if (!ADMIN_PASSWORD) console.warn('⚠️  ADMIN_PASSWORD non défini : l\'administration est désactivée.');

const adminToken = () => crypto.createHash('sha256').update('mon-ia:' + ADMIN_PASSWORD).digest('hex');
const isAdmin = (req) => !!ADMIN_PASSWORD && req.headers['x-admin-token'] === adminToken();

// --- Utilitaires HTTP ---
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 5e6) throw new Error('Trop volumineux'); }
  return raw ? JSON.parse(raw) : {};
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveStatic(res, file) {
  const p = path.join(path.resolve('public'), path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!p.startsWith(path.resolve('public')) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return json(res, 404, { error: 'Introuvable' });
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}

// --- Construction du « cerveau » : personnalité + leçons + connaissances pertinentes ---
function systemPrompt(userMessage, admin) {
  const persona = load('persona');
  const lessons = load('lessons');
  const knowledge = search(load('knowledge'), userMessage, 4);
  const parts = [persona.instructions];
  parts.push(`Date du jour : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`);
  if (lessons.length) {
    parts.push("## Ce que ton admin t'a appris (à respecter en priorité)\n" + lessons.slice(-60).map((l) => `- ${l.text}`).join('\n'));
  }
  if (knowledge.length) {
    parts.push('## Connaissances pertinentes de ta base (utilise-les si elles répondent à la question)\n' +
      knowledge.map((k) => `### ${k.title}\n${k.content}`).join('\n\n'));
  }
  parts.push("## Outils\nTu peux chercher sur le web, lire une page, chercher dans ta base, et gérer une liste de tâches. " +
    'Utilise-les seulement quand c\'est utile. Cite tes sources (liens) quand tu utilises le web.');
  parts.push(admin ? "L'utilisateur actuel est ton ADMIN. S'il te demande de retenir quelque chose, utilise l'outil remember."
    : "L'utilisateur actuel n'est pas l'admin : ne modifie pas ta mémoire durable.");
  return parts.join('\n\n');
}

// --- Chat en streaming (Server-Sent Events) ---
async function handleChat(req, res) {
  const admin = isAdmin(req);
  if (!PUBLIC_CHAT && !admin) return json(res, 401, { error: 'Connexion requise' });
  const { conversationId, message } = await body(req);
  if (!message?.trim()) return json(res, 400, { error: 'Message vide' });

  const convs = load('conversations');
  let conv = convs.find((c) => c.id === conversationId);
  if (!conv) {
    conv = { id: newId(), title: message.slice(0, 60), messages: [], updatedAt: now() };
    convs.unshift(conv);
  }
  conv.messages.push({ role: 'user', content: message });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ type: 'start', conversationId: conv.id });

  const history = conv.messages.slice(-20).map(({ role, content }) => ({ role, content }));
  const messages = [{ role: 'system', content: systemPrompt(message, admin) }, ...history];
  const tools = TOOL_DEFS.filter((t) => admin || t.function.name !== 'remember');
  let answer = '';
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const out = await streamChat({
        messages, tools: round < MAX_TOOL_ROUNDS ? tools : null,
        temperature: load('persona').temperature, onToken: (t) => send({ type: 'token', text: t }),
      });
      answer += out.content;
      if (!out.toolCalls.length) break;
      messages.push({ role: 'assistant', content: out.content || null, tool_calls: out.toolCalls });
      for (const call of out.toolCalls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* arguments invalides */ }
        send({ type: 'tool', name: call.function.name, args });
        const result = await runTool(call.function.name, args, { isAdmin: admin });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
      }
    }
  } catch (e) {
    send({ type: 'error', message: e.message });
  }
  conv.messages.push({ role: 'assistant', content: answer });
  conv.updatedAt = now();
  save('conversations');
  send({ type: 'done', conversationId: conv.id, index: conv.messages.length - 1 });
  res.end();
}

// --- Petites routes CRUD pour l'admin ---
function crud(name, method, id, data) {
  const list = load(name);
  if (method === 'GET') return list;
  if (method === 'DELETE') { save(name, list.filter((x) => x.id !== id)); return { ok: true }; }
  if (method === 'PUT') { const it = list.find((x) => x.id === id); if (it) { Object.assign(it, data, { id }); save(name); } return it || { error: 'Introuvable' }; }
}

// Export au format « fine-tuning » (JSONL OpenAI/Unsloth) : la vraie voie pour entraîner un modèle.
function exportDataset() {
  const persona = load('persona');
  const lines = [];
  for (const c of load('conversations')) {
    for (let i = 1; i < c.messages.length; i++) {
      const m = c.messages[i];
      if (m.role !== 'assistant') continue;
      const good = m.feedback?.rating === 'up' || m.feedback?.correction;
      if (!good) continue;
      const answer = m.feedback?.correction || m.content;
      const prev = c.messages.slice(Math.max(0, i - 6), i).map(({ role, content }) => ({ role, content }));
      lines.push(JSON.stringify({ messages: [{ role: 'system', content: persona.instructions }, ...prev, { role: 'assistant', content: answer }] }));
    }
  }
  return lines.join('\n');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;
  try {
    // Pages
    if (m === 'GET' && p === '/') return serveStatic(res, 'index.html');
    if (m === 'GET' && p === '/admin') return serveStatic(res, 'admin.html');
    if (m === 'GET' && !p.startsWith('/api/')) return serveStatic(res, p.slice(1));

    // API publique
    if (p === '/api/status') return json(res, 200, { name: load('persona').name, llm: llmInfo(), publicChat: PUBLIC_CHAT, admin: isAdmin(req) });
    if (p === '/api/login' && m === 'POST') {
      const { password } = await body(req);
      if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) return json(res, 200, { token: adminToken() });
      return json(res, 401, { error: 'Mot de passe incorrect' });
    }
    if (p === '/api/chat' && m === 'POST') return handleChat(req, res);

    const convMatch = p.match(/^\/api\/conversations\/([\w-]+)$/);
    if (convMatch && m === 'GET') {
      if (!PUBLIC_CHAT && !isAdmin(req)) return json(res, 401, { error: 'Connexion requise' });
      const c = load('conversations').find((x) => x.id === convMatch[1]);
      return c ? json(res, 200, c) : json(res, 404, { error: 'Introuvable' });
    }
    if (p === '/api/feedback' && m === 'POST') {
      const { conversationId, index, rating, correction } = await body(req);
      const c = load('conversations').find((x) => x.id === conversationId);
      const msg = c?.messages[index];
      if (!msg || msg.role !== 'assistant') return json(res, 404, { error: 'Message introuvable' });
      msg.feedback = { rating, correction: isAdmin(req) ? correction || undefined : undefined, at: now() };
      // Une correction de l'admin devient une leçon permanente.
      if (isAdmin(req) && correction?.trim()) {
        const question = c.messages[index - 1]?.content?.slice(0, 200) || '';
        load('lessons').push({ id: newId(), text: `Quand on te demande « ${question} », la bonne réponse est : ${correction.trim()}`, source: 'correction', createdAt: now() });
        save('lessons');
      }
      save('conversations');
      return json(res, 200, { ok: true });
    }

    // API admin
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return json(res, 401, { error: 'Admin uniquement' });
      const [, , , resource, id] = p.split('/');
      const data = ['POST', 'PUT'].includes(m) ? await body(req) : {};

      if (resource === 'persona') {
        if (m === 'PUT') { save('persona', { ...load('persona'), ...data }); }
        return json(res, 200, load('persona'));
      }
      if (resource === 'knowledge' && m === 'POST') {
        // Un long document est découpé en plusieurs fiches pour une meilleure recherche.
        const pieces = chunk(data.content || '');
        const list = load('knowledge');
        pieces.forEach((content, i) => list.push({ id: newId(), title: pieces.length > 1 ? `${data.title} (${i + 1}/${pieces.length})` : data.title, content, tags: data.tags || '', createdAt: now() }));
        save('knowledge');
        return json(res, 200, { added: pieces.length });
      }
      if (resource === 'lessons' && m === 'POST') {
        load('lessons').push({ id: newId(), text: data.text, source: 'admin', createdAt: now() }); save('lessons');
        return json(res, 200, { ok: true });
      }
      if (resource === 'tasks' && m === 'POST') {
        load('tasks').push({ id: newId(), title: data.title, due: data.due || null, priority: data.priority || 'normale', done: false, createdAt: now() }); save('tasks');
        return json(res, 200, { ok: true });
      }
      if (['knowledge', 'lessons', 'tasks', 'conversations'].includes(resource)) {
        if (resource === 'conversations' && m === 'GET') {
          return json(res, 200, load('conversations').map(({ id, title, updatedAt, messages }) => ({ id, title, updatedAt, count: messages.length,
            feedback: messages.filter((x) => x.feedback).length })));
        }
        return json(res, 200, crud(resource, m, id, data));
      }
      if (resource === 'export') {
        res.writeHead(200, { 'Content-Type': 'application/jsonl', 'Content-Disposition': 'attachment; filename="dataset.jsonl"' });
        return res.end(exportDataset());
      }
      if (resource === 'backup') {
        return json(res, 200, Object.fromEntries(['persona', 'knowledge', 'lessons', 'tasks', 'conversations'].map((n) => [n, load(n)])));
      }
      if (resource === 'restore' && m === 'POST') {
        for (const n of ['persona', 'knowledge', 'lessons', 'tasks', 'conversations']) if (data[n]) save(n, data[n]);
        return json(res, 200, { ok: true });
      }
    }
    json(res, 404, { error: 'Route inconnue' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  const info = llmInfo();
  console.log(`🤖 ${load('persona').name} est en ligne sur http://localhost:${PORT}  (admin : /admin)`);
  console.log(`   Modèle : ${info.model} via ${info.base}${info.configured ? '' : '  ⚠️ LLM_API_KEY manquante'}`);
});
