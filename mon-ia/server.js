// Mon IA — serveur principal (Node.js >= 18, zéro dépendance).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// --- Lecture du fichier .env (avant de charger le reste) ---
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* pas de .env : variables du serveur d'hébergement */ }

const { load, save, newId, now } = await import('./lib/store.js');
const { chunk } = await import('./lib/retrieval.js');
const { llmInfo, getProviders, testProvider } = await import('./lib/llm.js');
const { runAgent, findAgent, ALL_TOOLS } = await import('./lib/agent.js');
const ws = await import('./lib/workspace.js');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_CHAT = process.env.PUBLIC_CHAT === 'true';
if (!ADMIN_PASSWORD) console.warn("⚠️  ADMIN_PASSWORD non défini : l'administration est désactivée.");

const adminToken = () => crypto.createHash('sha256').update('mon-ia:' + ADMIN_PASSWORD).digest('hex');
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
const isAdmin = (req) => !!ADMIN_PASSWORD && (req.headers['x-admin-token'] === adminToken() || cookie(req, 'ia_admin') === adminToken());

// --- Utilitaires HTTP ---
const json = (res, code, data, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)); };
async function body(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 10e6) throw new Error('Trop volumineux'); }
  return raw ? JSON.parse(raw) : {};
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.mp4': 'video/mp4' };
function sendFile(res, full) {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}
function serveStatic(res, file) {
  const base = path.resolve('public');
  const p = path.resolve(base, file.replace(/^\/+/, ''));
  if (!p.startsWith(base + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return json(res, 404, { error: 'Introuvable' });
  sendFile(res, p);
}

// Les tokens et secrets des projets ne sont jamais renvoyés au navigateur.
const MASK = '••••••';
const maskWs = (w) => ({ ...w, token: w.token ? MASK : '', secrets: (w.secrets || '').replace(/=(.+)/g, '=' + MASK), previewUrl: ws.previewUrl(w), publicUrl: w.published ? ws.publicUrl(w) : null });

// --- Validations en attente (mode « Demander ») ---
const pending = new Map(); // id -> { resolve, perm }

// --- Chat en streaming (Server-Sent Events) ---
async function handleChat(req, res) {
  const admin = isAdmin(req);
  if (!PUBLIC_CHAT && !admin) return json(res, 401, { error: 'Connexion requise' });
  const { conversationId, message, agentId, workspaceId, mode, tier } = await body(req);
  if (!message?.trim()) return json(res, 400, { error: 'Message vide' });

  const convs = load('conversations');
  let conv = convs.find((c) => c.id === conversationId);
  if (!conv) {
    conv = { id: newId(), title: message.slice(0, 60), messages: [], updatedAt: now() };
    convs.unshift(conv);
  }
  conv.messages.push({ role: 'user', content: message });
  const agent = findAgent(agentId);
  const workspace = admin && workspaceId ? ws.getWorkspace(workspaceId) : null;
  Object.assign(conv, { agentId: agent?.id || null, workspaceId: workspace?.id || null });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const abort = new AbortController();
  const myApprovals = new Set();
  res.on('close', () => {
    abort.abort();
    for (const id of myApprovals) { pending.get(id)?.resolve(false); pending.delete(id); }
  });
  const emit = (o) => { if (!res.writableEnded && !abort.signal.aborted) res.write(`data: ${JSON.stringify(o)}\n\n`); };
  const ping = setInterval(() => emit({ type: 'ping' }), 15000);
  emit({ type: 'start', conversationId: conv.id });

  const perm = { mode: admin ? (['ask', 'auto', 'read'].includes(mode) ? mode : 'ask') : 'read' };
  const approve = (call) => new Promise((resolve) => {
    const id = newId();
    myApprovals.add(id);
    pending.set(id, { resolve: (v) => { myApprovals.delete(id); resolve(v); }, perm });
    emit({ type: 'approval', id, ...call });
    setTimeout(() => { if (pending.has(id)) { pending.get(id).resolve(false); pending.delete(id); } }, 30 * 60e3);
  });

  // Historique : on rappelle au modèle les actions faites aux tours précédents.
  const history = conv.messages.slice(-24).map(({ role, content, steps }) => ({
    role, content: steps?.length ? `${content}\n\n[Actions effectuées : ${steps.join(', ')}]` : content,
  }));
  let result = { content: '', steps: [] };
  try {
    result = await runAgent({ agent, history, ctx: { admin, workspace, perm, emit, approve, tier: ['fast', 'smart'].includes(tier) ? tier : 'auto', signal: abort.signal, depth: 0 } });
  } catch (e) {
    if (!abort.signal.aborted) emit({ type: 'error', message: e.message });
  }
  clearInterval(ping);
  const stopped = abort.signal.aborted ? '\n\n_(interrompu)_' : '';
  conv.messages.push({ role: 'assistant', content: (result.content || '') + stopped, steps: result.steps, model: result.model });
  conv.updatedAt = now();
  save('conversations');
  emit({ type: 'done', conversationId: conv.id, index: conv.messages.length - 1 });
  res.end();
}

// --- Petites routes CRUD pour l'admin ---
function crud(name, method, id, data) {
  const list = load(name);
  if (method === 'GET') return list;
  if (method === 'DELETE') { save(name, list.filter((x) => x.id !== id)); return { ok: true }; }
  if (method === 'PUT') { const it = list.find((x) => x.id === id); if (it) { Object.assign(it, data, { id }); save(name); } return it || { error: 'Introuvable' }; }
  if (method === 'POST') { const it = { ...data, id: newId(), createdAt: now() }; list.push(it); save(name); return it; }
}

// Export au format « fine-tuning » (JSONL OpenAI/Unsloth) : la vraie voie pour entraîner un modèle.
function exportDataset() {
  const persona = load('persona');
  const lines = [];
  for (const c of load('conversations')) {
    for (let i = 1; i < c.messages.length; i++) {
      const m = c.messages[i];
      if (m.role !== 'assistant' || !(m.feedback?.rating === 'up' || m.feedback?.correction)) continue;
      const prev = c.messages.slice(Math.max(0, i - 6), i).map(({ role, content }) => ({ role, content }));
      lines.push(JSON.stringify({ messages: [{ role: 'system', content: persona.instructions }, ...prev, { role: 'assistant', content: m.feedback?.correction || m.content }] }));
    }
  }
  return lines.join('\n');
}

async function adminApi(req, res, p, m) {
  const [, , , resource, id, action] = p.split('/');
  const data = ['POST', 'PUT'].includes(m) ? await body(req) : {};

  if (resource === 'persona') {
    if (m === 'PUT') save('persona', { ...load('persona'), ...data });
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
  if (resource === 'lessons' && m === 'POST') return json(res, 200, crud('lessons', 'POST', null, { text: data.text, source: 'admin' }));
  if (resource === 'tasks' && m === 'POST') return json(res, 200, crud('tasks', 'POST', null, { title: data.title, due: data.due || null, priority: data.priority || 'normale', done: false }));
  if (resource === 'models') {
    // Fournisseurs de modèles : les clés ne sont jamais renvoyées au navigateur.
    const cfg = load('models');
    const view = () => ({
      providers: getProviders().map((x) => ({ ...x, apiKey: x.apiKey ? MASK : '' })),
      roles: cfg.roles, info: llmInfo(),
    });
    if (m === 'GET') return json(res, 200, view());
    if (id === 'test' && m === 'POST') {
      const prov = data.id ? getProviders().find((x) => x.id === data.id) : null;
      const target = { ...(prov || {}), ...data, apiKey: data.apiKey && data.apiKey !== MASK ? data.apiKey : prov?.apiKey || '' };
      return json(res, 200, await testProvider(target));
    }
    if (id === 'roles' && m === 'PUT') {
      cfg.roles = { fast: data.fast || '', smart: data.smart || '', fallbacks: Array.isArray(data.fallbacks) ? data.fallbacks : [] };
      save('models');
      return json(res, 200, view());
    }
    if (m === 'POST' || m === 'PUT') {
      if (id === 'env') return json(res, 400, { error: 'Ce fournisseur vient du fichier .env : modifie-le là-bas.' });
      if (!data.baseUrl || !data.model) return json(res, 400, { error: 'URL et modèle requis' });
      const fields = { name: data.name || data.model, baseUrl: data.baseUrl.trim(), model: data.model.trim() };
      if (m === 'POST') cfg.providers.push({ id: newId(), ...fields, apiKey: data.apiKey || '' });
      else {
        const prov = cfg.providers.find((x) => x.id === id);
        if (!prov) return json(res, 404, { error: 'Introuvable' });
        Object.assign(prov, fields);
        if (data.apiKey && data.apiKey !== MASK) prov.apiKey = data.apiKey;
      }
      save('models');
      return json(res, 200, view());
    }
    if (m === 'DELETE') {
      cfg.providers = cfg.providers.filter((x) => x.id !== id);
      for (const k of ['fast', 'smart']) if (cfg.roles[k] === id) cfg.roles[k] = '';
      cfg.roles.fallbacks = (cfg.roles.fallbacks || []).filter((x) => x !== id);
      save('models');
      return json(res, 200, view());
    }
  }
  if (resource === 'tools') return json(res, 200, ALL_TOOLS.map((t) => ({ name: t.name, kind: t.kind, group: t.group, description: t.def.function.description })));

  if (resource === 'agents') {
    if (m === 'POST' || m === 'PUT') {
      if (!data.name || !data.instructions) return json(res, 400, { error: 'Nom et instructions requis' });
      const clean = { name: data.name, description: data.description || '', instructions: data.instructions, tools: Array.isArray(data.tools) ? data.tools : [], model: data.model || '' };
      return json(res, 200, crud('agents', m, id, clean));
    }
    return json(res, 200, crud('agents', m, id));
  }

  if (resource === 'workspaces') {
    if (m === 'GET') return json(res, 200, load('workspaces').map(maskWs));
    if (m === 'POST' && !id) return json(res, 200, maskWs(await ws.createWorkspace(data)));
    const w = ws.getWorkspace(id);
    if (!w) return json(res, 404, { error: 'Projet introuvable' });
    if (m === 'POST' && action === 'sync') return json(res, 200, await ws.syncWorkspace(w));
    if (m === 'DELETE') { ws.deleteWorkspace(id); return json(res, 200, { ok: true }); }
    if (m === 'PUT') {
      for (const k of ['name', 'repoUrl', 'branch', 'previewDir', 'deployHook', 'deployCommand', 'published']) if (k in data) w[k] = data[k];
      if (data.token && data.token !== MASK) w.token = data.token;
      if ('secrets' in data) {
        // Les valeurs masquées gardent leur ancienne valeur.
        const old = Object.fromEntries((w.secrets || '').split('\n').map((l) => [l.split('=')[0].trim(), l]));
        w.secrets = data.secrets.split('\n').map((l) => (l.includes(MASK) ? old[l.split('=')[0].trim()] || '' : l)).filter(Boolean).join('\n');
      }
      save('workspaces');
      return json(res, 200, maskWs(w));
    }
  }

  if (['knowledge', 'lessons', 'tasks', 'conversations'].includes(resource)) {
    if (resource === 'conversations' && m === 'GET') {
      return json(res, 200, load('conversations').map(({ id: cid, title, updatedAt, messages }) => ({ id: cid, title, updatedAt, count: messages.length, feedback: messages.filter((x) => x.feedback).length })));
    }
    return json(res, 200, crud(resource, m, id, data));
  }
  if (resource === 'export') {
    res.writeHead(200, { 'Content-Type': 'application/jsonl', 'Content-Disposition': 'attachment; filename="dataset.jsonl"' });
    return res.end(exportDataset());
  }
  const NAMES = ['persona', 'knowledge', 'lessons', 'tasks', 'conversations', 'agents'];
  if (resource === 'backup') return json(res, 200, Object.fromEntries(NAMES.map((n) => [n, load(n)])));
  if (resource === 'restore' && m === 'POST') {
    for (const n of NAMES) if (data[n]) save(n, data[n]);
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'Route inconnue' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;
  try {
    // Sites publiés (publics) et aperçus (admin) des projets
    const site = p.match(/^\/(s|preview)\/([\w-]+)(\/.*)?$/);
    if (site && m === 'GET') {
      const [, kind, key, rest] = site;
      if (!rest) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      const w = kind === 's' ? load('workspaces').find((x) => x.slug === key && x.published) : isAdmin(req) && ws.getWorkspace(key);
      if (!w) return json(res, kind === 's' ? 404 : 401, { error: kind === 's' ? 'Site introuvable' : 'Connexion admin requise' });
      const f = ws.staticFile(w, rest);
      if (!f) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<h1>404</h1><p>Page introuvable.</p>'); }
      return sendFile(res, f);
    }

    // Pages de l'application
    if (m === 'GET' && p === '/') return serveStatic(res, 'index.html');
    if (m === 'GET' && p === '/admin') return serveStatic(res, 'admin.html');
    if (m === 'GET' && !p.startsWith('/api/')) return serveStatic(res, p);

    // API publique
    if (p === '/api/status') {
      const admin = isAdmin(req);
      // Le cookie permet d'ouvrir les aperçus de sites dans un nouvel onglet.
      const setCookie = admin && !cookie(req, 'ia_admin') ? { 'Set-Cookie': `ia_admin=${adminToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` } : {};
      return json(res, 200, {
        name: load('persona').name, llm: llmInfo(), publicChat: PUBLIC_CHAT, admin,
        agents: load('agents').map(({ id, name, description }) => ({ id, name, description })),
        workspaces: admin ? load('workspaces').map((w) => ({ id: w.id, name: w.name, previewUrl: ws.previewUrl(w), publicUrl: w.published ? ws.publicUrl(w) : null })) : [],
      }, setCookie);
    }
    if (p === '/api/login' && m === 'POST') {
      const { password } = await body(req);
      if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
        return json(res, 200, { token: adminToken() }, { 'Set-Cookie': `ia_admin=${adminToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` });
      }
      return json(res, 401, { error: 'Mot de passe incorrect' });
    }
    if (p === '/api/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': 'ia_admin=; Path=/; Max-Age=0' });
    if (p === '/api/chat' && m === 'POST') return handleChat(req, res);
    if (p === '/api/approve' && m === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Admin uniquement' });
      const { id, allow, always } = await body(req);
      const it = pending.get(id);
      if (!it) return json(res, 404, { error: 'Demande expirée' });
      if (always) it.perm.mode = 'auto';
      pending.delete(id);
      it.resolve(!!allow);
      return json(res, 200, { ok: true });
    }

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
      const admin = isAdmin(req);
      msg.feedback = { rating, correction: admin ? correction || undefined : undefined, at: now() };
      // Une correction de l'admin devient une leçon permanente.
      if (admin && correction?.trim()) {
        const question = c.messages[index - 1]?.content?.slice(0, 200) || '';
        crud('lessons', 'POST', null, { text: `Quand on te demande « ${question} », la bonne réponse est : ${correction.trim()}`, source: 'correction' });
      }
      save('conversations');
      return json(res, 200, { ok: true });
    }

    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return json(res, 401, { error: 'Admin uniquement' });
      return await adminApi(req, res, p, m);
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
