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
const { llmInfo, getProviders, testProvider, chainFor, complete } = await import('./lib/llm.js');
const { runAgent, findAgent, ALL_TOOLS } = await import('./lib/agent.js');
const ws = await import('./lib/workspace.js');
const missions = await import('./lib/missions.js');
const { notify } = await import('./lib/notify.js');
const files = await import('./lib/files.js');
const learning = await import('./lib/learning.js');
const { seedLearningSessions } = await import('./lib/seed.js');
seedLearningSessions();
const backup = await import('./lib/backup.js');
const selfadmin = await import('./lib/selfadmin.js');
selfadmin.captureLogs(); // garde les dernières lignes du journal pour que l'IA puisse se diagnostiquer
// Disque vide (hébergeur qui efface tout) : on recharge la dernière sauvegarde avant de démarrer.
if (await backup.restoreIfEmpty()) console.log(`♻️  Mémoire restaurée depuis la sauvegarde du ${backup.backupStatus().lastBackupAt}`);
backup.startAutoBackup();

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_CHAT = process.env.PUBLIC_CHAT === 'true';
if (!ADMIN_PASSWORD) console.warn("⚠️  ADMIN_PASSWORD non défini : l'administration est désactivée.");

const adminToken = () => crypto.createHash('sha256').update('mon-ia:' + ADMIN_PASSWORD).digest('hex');
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
const isAdmin = (req) => !!ADMIN_PASSWORD && (req.headers['x-admin-token'] === adminToken() || cookie(req, 'ia_admin') === adminToken());

// --- Utilitaires HTTP ---
const json = (res, code, data, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)); };
async function rawBody(req, max = 25e6) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw new Error('Fichier trop volumineux'); chunks.push(c); }
  return Buffer.concat(chunks);
}
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

// --- Clés d'intégration (autres systèmes, widget) ---
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
function apiKey(req) {
  const url = new URL(req.url, 'http://x');
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-api-key'] || url.searchParams.get('key') || '';
  if (!raw.startsWith('nova_')) return null;
  const k = load('apikeys').find((x) => x.hash === sha(raw));
  if (k) { k.lastUsed = now(); save('apikeys'); }
  return k || null;
}
const canChat = (req) => PUBLIC_CHAT || isAdmin(req) || !!apiKey(req)?.scopes?.includes('chat');
const devicesLib = await import('./lib/devices.js');
const maskDevice = ({ tokenHash, ...d }) => ({ ...d, haToken: d.haToken ? MASK : '', online: d.type === 'remote' ? devicesLib.deviceOnline(d.id) : undefined, info: devicesLib.deviceInfo(d.id) });
const keepMasked = (oldObj, data, fields) => { for (const f of fields) if (data[f] === MASK) data[f] = oldObj?.[f] || ''; return data; };

// Les missions utilisent le même moteur d'agent que le chat, en mode autonome.
missions.setMissionRunner(({ mission, prompt, signal }) => runAgent({
  agent: findAgent(mission.agentId),
  history: [{ role: 'user', content: prompt }],
  ctx: {
    admin: true, workspace: mission.workspaceId ? ws.getWorkspace(mission.workspaceId) : null, perm: { mode: mission.mode },
    emit: () => {}, approve: async () => false, tier: 'auto', signal, depth: 0, mission,
  },
}));
const maskWs = (w) => ({ ...w, token: w.token ? MASK : '', secrets: (w.secrets || '').replace(/=(.+)/g, '=' + MASK), previewUrl: ws.previewUrl(w), publicUrl: w.published ? ws.publicUrl(w) : null });

// --- Validations en attente (mode « Demander ») ---
const pending = new Map(); // id -> { resolve, perm }

// --- Conversation unique et mémoire au long cours ---
const MAIN = 'main';
const KEEP_RECENT = 24;      // messages récents envoyés tels quels au modèle
const SUMMARIZE_EVERY = 30;  // au-delà, les plus anciens sont condensés dans un résumé

/** Condense les anciens messages d'une longue conversation, pour que l'IA s'en souvienne sans tout relire. */
async function updateMemory(conv) {
  const done = conv.summarized || 0;
  const upTo = conv.messages.length - KEEP_RECENT;
  if (conv.summarizing || upTo - done < SUMMARIZE_EVERY) return;
  const provider = chainFor('fast')[0];
  if (!provider) return;
  conv.summarizing = true;
  try {
    const lines = conv.messages.slice(done, upTo).map((m) => `${m.role === 'user' ? 'Admin' : load('persona').name} : ${String(m.content).slice(0, 700)}`).join('\n').slice(-28000);
    const text = await complete(provider, [
      { role: 'system', content: "Tu tiens la mémoire au long cours d'une conversation entre un assistant et son admin. Écris un résumé fidèle et dense (450 mots max), en français, sans rien inventer. Garde en priorité : qui est l'admin (prénom, ville, métier, goûts), ses projets et leur avancement, ses préférences et consignes, les décisions prises, les choses promises ou à faire, les sujets importants abordés. Laisse tomber les bavardages et les détails techniques passagers." },
      { role: 'user', content: `${conv.summary ? `Résumé précédent :\n${conv.summary}\n\n` : ''}Suite de la conversation à intégrer :\n${lines}\n\nÉcris le nouveau résumé complet.` },
    ], { maxTokens: 900 });
    if (text.trim()) { conv.summary = text.trim(); conv.summarized = upTo; save('conversations'); }
  } catch (e) { console.error('Mémoire de conversation :', e.message); }
  conv.summarizing = false;
}

// --- Chat en streaming (Server-Sent Events) ---
async function handleChat(req, res) {
  const admin = isAdmin(req);
  if (!canChat(req)) return json(res, 401, { error: 'Connexion requise' });
  const { conversationId, message = '', agentId, workspaceId, mode, tier, lang, voice, files: fileIds = [] } = await body(req);
  const attached = (Array.isArray(fileIds) ? fileIds : []).slice(0, 10).map(files.getUpload).filter(Boolean);
  if (!message?.trim() && !attached.length) return json(res, 400, { error: 'Message vide' });

  const convs = load('conversations');
  // « main » est LA conversation continue de l'admin (la même sur tous ses appareils). Elle lui est réservée.
  const wantMain = admin && conversationId === MAIN;
  let conv = conversationId === MAIN && !admin ? null : convs.find((c) => c.id === conversationId);
  if (!conv) {
    conv = wantMain ? { id: MAIN, title: "Conversation avec l'admin", messages: [], updatedAt: now() }
      : { id: newId(), title: (message || attached.map((f) => f.name).join(', ')).slice(0, 60), messages: [], updatedAt: now() };
    convs.unshift(conv);
  }
  conv.messages.push({ role: 'user', content: message, ...(attached.length ? { files: attached.map(({ id, name, kind }) => ({ id, name, kind })) } : {}) });
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
    pending.set(id, { resolve: (v) => { myApprovals.delete(id); resolve(v); }, perm, name: call.name });
    emit({ type: 'approval', id, ...call });
    setTimeout(() => { if (pending.has(id)) { pending.get(id).resolve(false); pending.delete(id); } }, 30 * 60e3);
  });

  // Historique : on rappelle au modèle les actions faites aux tours précédents.
  // Les pièces jointes sont intégrées au message (texte des documents, images en vision pour les messages récents).
  const recent = conv.messages.slice(-KEEP_RECENT);
  const history = recent.map(({ role, content, steps, files: f }, i) => ({
    role,
    content: f?.length ? files.toModelContent(content, f.map((x) => x.id), { withImages: i >= recent.length - 4 })
      : steps?.length ? `${content}\n\n[Actions effectuées : ${steps.join(', ')}]` : content,
  }));
  let result = { content: '', steps: [] };
  try {
    result = await runAgent({ agent, history, ctx: { admin, workspace, perm, emit, approve, memory: conv.summary, tier: ['fast', 'smart'].includes(tier) ? tier : tier === 'deep' ? 'smart' : 'auto', deep: admin && tier === 'deep', lang, voice: !!voice, signal: abort.signal, depth: 0 } });
  } catch (e) {
    if (!abort.signal.aborted) { emit({ type: 'error', message: e.message }); console.error('Erreur pendant une réponse :', e.message); }
  }
  clearInterval(ping);
  const stopped = abort.signal.aborted ? '\n\n_(interrompu)_' : '';
  conv.messages.push({ role: 'assistant', content: (result.content || '') + stopped, steps: result.steps, model: result.model });
  // Les clés et jetons donnés dans la conversation sont enregistrés par les outils : on les efface de l'historique.
  for (const msg of conv.messages.slice(-6)) if (typeof msg.content === 'string') msg.content = selfadmin.redactSecrets(msg.content);
  conv.updatedAt = now();
  save('conversations');
  emit({ type: 'done', conversationId: conv.id, index: conv.messages.length - 1 });
  res.end();
  updateMemory(conv);
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
      cfg.roles = { fast: data.fast || '', smart: data.smart || '', vision: data.vision || '', fallbacks: Array.isArray(data.fallbacks) ? data.fallbacks : [] };
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
  if (resource === 'settings') {
    const st = load('settings');
    st.notify ||= {}; st.voice ||= {};
    if (m === 'PUT') {
      if (data.notify) st.notify = keepMasked(st.notify, { ...data.notify }, ['telegramToken']);
      if (data.voice) st.voice = { ...data.voice };
      if (data.quantum) st.quantum = keepMasked(st.quantum, { ...data.quantum }, ['ibmToken']);
      if (data.learning) { st.learning = { ...st.learning, ...data.learning }; save('settings'); learning.syncLearningMission(); }
      save('settings');
    }
    // Trouve l'identifiant Telegram de l'admin : il suffit qu'il ait envoyé un message à son bot.
    if (id === 'telegram-detect' && m === 'POST') {
      const token = String(st.notify.telegramToken || '').trim();
      if (!token) return json(res, 200, { error: "Enregistre d'abord le jeton du bot." });
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(15000) });
        const j = await r.json();
        if (!j.ok) return json(res, 200, { error: `Telegram : ${j.description || 'jeton refusé'}` });
        const chats = j.result.map((u) => (u.message || u.edited_message)?.chat).filter((c) => c?.type === 'private');
        const chat = chats[chats.length - 1];
        if (!chat) return json(res, 200, { error: "Aucun message reçu. Ouvre ton bot dans Telegram, appuie sur « Démarrer », envoie-lui « bonjour », puis réessaie." });
        st.notify.telegramChatId = String(chat.id); save('settings');
        return json(res, 200, { chatId: String(chat.id), name: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '' });
      } catch (e) { return json(res, 200, { error: `Connexion à Telegram impossible : ${e.message}` }); }
    }
    if (id === 'test-notify' && m === 'POST') return json(res, 200, await notify('🔔 Test', `Les notifications de ${load('persona').name} fonctionnent !`));
    return json(res, 200, { notify: { ...st.notify, telegramToken: st.notify.telegramToken ? MASK : '' }, voice: st.voice, learning: st.learning || {}, quantum: { ...(st.quantum || {}), ibmToken: st.quantum?.ibmToken ? MASK : '' } });
  }
  if (resource === 'apikeys') {
    const keys = load('apikeys');
    if (m === 'POST') {
      const raw = 'nova_' + crypto.randomBytes(24).toString('base64url');
      const scopes = (data.scopes || ['chat']).filter((x) => ['chat', 'missions'].includes(x));
      keys.push({ id: newId(), name: data.name || 'Intégration', hash: sha(raw), prefix: raw.slice(0, 10), scopes, createdAt: now(), lastUsed: null });
      save('apikeys');
      return json(res, 200, { key: raw }); // affichée une seule fois
    }
    if (m === 'DELETE') { save('apikeys', keys.filter((k) => k.id !== id)); return json(res, 200, { ok: true }); }
    return json(res, 200, keys.map(({ hash, ...k }) => k));
  }
  if (resource === 'devices') {
    const list = load('devices');
    if (m === 'GET') return json(res, 200, list.map(maskDevice));
    if (m === 'DELETE') { save('devices', list.filter((d) => d.id !== id)); return json(res, 200, { ok: true }); }
    if (m === 'POST' && action === 'test') {
      const { DEVICE_TOOLS } = await import('./lib/devices.js');
      const d = list.find((x) => x.id === id);
      try {
        const out = await DEVICE_TOOLS.find((t) => t.name === 'read_device').run({ device: d.id }, {});
        return json(res, 200, { ok: true, output: typeof out === 'string' ? out : JSON.stringify(out, null, 1) });
      } catch (e) { return json(res, 200, { ok: false, output: e.message }); }
    }
    if (m === 'POST' || m === 'PUT') {
      if (!data.name) return json(res, 400, { error: 'Nom requis' });
      const old = list.find((x) => x.id === id);
      const clean = keepMasked(old, {
        name: data.name, description: data.description || '', type: ['homeassistant', 'http', 'command', 'remote'].includes(data.type) ? data.type : 'http', allowShell: !!data.allowShell,
        permission: ['off', 'ask', 'auto'].includes(data.permission) ? data.permission : 'ask',
        haUrl: data.haUrl || '', haToken: data.haToken || '', entities: data.entities || '',
        actions: Array.isArray(data.actions) ? data.actions.filter((a) => a.name) : [],
      }, ['haToken']);
      const saved = crud('devices', m, id, clean);
      // Appareil distant : un jeton est créé (affiché une seule fois) pour l'agent à installer dessus.
      let token;
      if (saved.type === 'remote' && (!saved.tokenHash || action === 'token')) {
        token = 'novadev_' + crypto.randomBytes(24).toString('base64url');
        saved.tokenHash = sha(token); save('devices');
      }
      return json(res, 200, { ...maskDevice(saved), token });
    }
  }
  if (resource === 'missions') {
    if (m === 'GET') return json(res, 200, load('missions').map((x) => ({ ...x, scheduleText: missions.describeSchedule(x.schedule) })));
    if (m === 'POST' && action === 'run') { missions.runMission(id, { trigger: 'manuel' }).catch(() => {}); return json(res, 200, { ok: true }); }
    if (m === 'DELETE') { save('missions', load('missions').filter((x) => x.id !== id)); return json(res, 200, { ok: true }); }
    if (m === 'POST' || m === 'PUT') {
      if (!data.title || !data.instructions) return json(res, 400, { error: 'Titre et instructions requis' });
      try { return json(res, 200, missions.saveMission(data, m === 'PUT' ? id : undefined)); } catch (e) { return json(res, 400, { error: e.message }); }
    }
  }
  if (resource === 'autobackup') {
    if (m === 'POST') {
      try { return json(res, 200, await backup.backupNow({ force: !!data.force })); } catch (e) { return json(res, 200, { ...backup.backupStatus(), error: e.message }); }
    }
    return json(res, 200, backup.backupStatus());
  }
  if (resource === 'journal') return json(res, 200, load('journal').slice(0, 60));
  if (resource === 'proposals') {
    if (m === 'POST' && ['approve', 'reject', 'revert'].includes(action)) {
      try { return json(res, 200, learning.applyProposal(id, action)); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    return json(res, 200, load('proposals').slice(0, 100));
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
  const NAMES = ['persona', 'knowledge', 'lessons', 'tasks', 'conversations', 'agents', 'models', 'missions', 'devices', 'settings', 'journal', 'proposals'];
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
  // Les autres systèmes (sites, applis) peuvent appeler l'API d'intégration depuis un navigateur.
  if (p.startsWith('/api/v1/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Api-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (m === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
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
    if (p === '/api/ping') return json(res, 200, { ok: true });
    if (p === '/api/status') {
      const admin = isAdmin(req);
      // Le cookie permet d'ouvrir les aperçus de sites dans un nouvel onglet.
      const setCookie = admin && !cookie(req, 'ia_admin') ? { 'Set-Cookie': `ia_admin=${adminToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` } : {};
      return json(res, 200, {
        name: load('persona').name, llm: llmInfo(), publicChat: canChat(req), admin,
        serverStt: !!load('settings').voice?.sttProvider,
        keepAwake: admin ? { active: !!keepAwake.url, lastOk: keepAwake.lastOk, lastError: keepAwake.lastError } : undefined,
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

    // Agents distants installés sur les appareils de l'admin
    if (p === '/api/device/poll' || p === '/api/device/result') {
      const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const dev = raw.startsWith('novadev_') && load('devices').find((d) => d.type === 'remote' && d.tokenHash === sha(raw));
      if (!dev || dev.permission === 'off') return json(res, 401, { error: 'Jeton invalide ou appareil désactivé' });
      if (p.endsWith('/poll')) return json(res, 200, { job: await devicesLib.remotePoll(dev.id, { host: url.searchParams.get('host'), os: url.searchParams.get('os') }) });
      const r = await body(req);
      devicesLib.remoteResult(r.id, r);
      return json(res, 200, { ok: true });
    }

    // Envoi de fichiers (images, captures, PDF, documents)
    if (p === '/api/upload' && m === 'POST') {
      if (!canChat(req)) return json(res, 401, { error: 'Connexion requise' });
      const name = decodeURIComponent(req.headers['x-file-name'] || 'fichier');
      try {
        const meta = await files.saveUpload(await rawBody(req, files.MAX_UPLOAD), name, req.headers['content-type']);
        const { file, ...pub } = meta;
        return json(res, 200, pub);
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    const upMatch = p.match(/^\/api\/uploads\/([\w-]+)$/);
    if (upMatch && m === 'GET') {
      if (!canChat(req)) return json(res, 401, { error: 'Connexion requise' });
      const meta = files.getUpload(upMatch[1]);
      if (!meta) return json(res, 404, { error: 'Introuvable' });
      // Sécurité : seules les images matricielles s'affichent dans la page (type déduit de l'extension, pas de l'envoi) ;
      // tout le reste est téléchargé, et rien ne peut exécuter de script.
      const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
      const imgType = meta.kind === 'image' ? IMG[path.extname(meta.file).toLowerCase()] : null;
      res.writeHead(200, {
        'Content-Type': imgType || (meta.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        'Content-Disposition': `${imgType ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
      });
      return fs.createReadStream(files.uploadPath(meta)).pipe(res);
    }

    // Transcription vocale côté serveur (Whisper ou autre modèle /audio/transcriptions)
    if (p === '/api/transcribe' && m === 'POST') {
      if (!canChat(req)) return json(res, 401, { error: 'Connexion requise' });
      const v = load('settings').voice || {};
      const prov = getProviders().find((x) => x.id === v.sttProvider);
      if (!prov) return json(res, 400, { error: 'Transcription serveur non configurée (Admin → Intégrations → Voix).' });
      const audio = await rawBody(req);
      const form = new FormData();
      form.append('file', new Blob([audio], { type: req.headers['content-type'] || 'audio/webm' }), 'audio.webm');
      form.append('model', v.sttModel || 'whisper-large-v3');
      const lang = { fr: 'fr', en: 'en', tn: 'ar' }[url.searchParams.get('lang')];
      if (lang) form.append('language', lang);
      const r = await fetch(`${prov.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${prov.apiKey}` }, body: form });
      const txt = await r.text();
      if (!r.ok) return json(res, 502, { error: `Transcription : HTTP ${r.status} ${txt.slice(0, 200)}` });
      return json(res, 200, { text: JSON.parse(txt).text || '' });
    }

    // ---------- API d'intégration pour les autres systèmes ----------
    if (p.startsWith('/api/v1/')) {
      const k = apiKey(req);
      const need = (scope) => { if (!k?.scopes.includes(scope)) { json(res, 401, { error: `Clé API avec la permission « ${scope} » requise` }); return false; } return true; };
      if (p === '/api/v1/chat' && m === 'POST') {
        if (!need('chat')) return;
        const { message, conversationId, agent, lang } = await body(req);
        if (!message) return json(res, 400, { error: 'message requis' });
        const convs = load('conversations');
        let conv = convs.find((c) => c.id === conversationId);
        if (!conv) { conv = { id: newId(), title: `[${k.name}] ${message.slice(0, 50)}`, messages: [], updatedAt: now() }; convs.unshift(conv); }
        conv.messages.push({ role: 'user', content: message });
        const r = await runAgent({
          agent: findAgent(agent), history: conv.messages.slice(-20).map(({ role, content }) => ({ role, content })),
          ctx: { admin: false, workspace: null, perm: { mode: 'read' }, emit: () => {}, approve: async () => false, tier: 'auto', lang, depth: 0 },
        });
        conv.messages.push({ role: 'assistant', content: r.content, model: r.model });
        conv.updatedAt = now(); save('conversations');
        return json(res, 200, { answer: r.content, conversationId: conv.id, model: r.model });
      }
      const mm = p.match(/^\/api\/v1\/missions\/([\w-]+)(\/run)?$/);
      if (mm) {
        if (!need('missions')) return;
        const mission = load('missions').find((x) => x.id === mm[1]);
        if (!mission) return json(res, 404, { error: 'Mission introuvable' });
        if (mm[2] && m === 'POST') {
          // Les données envoyées (JSON ou texte) sont transmises à la mission.
          const raw = (await rawBody(req, 1e6)).toString('utf8');
          const run = missions.runMission(mission.id, { trigger: `api (${k.name})`, input: raw });
          if (url.searchParams.get('wait') === '1') return json(res, 200, await run);
          run.catch(() => {});
          return json(res, 202, { ok: true, message: 'Mission lancée' });
        }
        return json(res, 200, { id: mission.id, title: mission.title, running: !!mission.running, lastRun: mission.runs?.[0] || null });
      }
      return json(res, 404, { error: 'Route inconnue' });
    }
    if (p === '/api/approve' && m === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Admin uniquement' });
      const { id, allow, always, forever } = await body(req);
      const it = pending.get(id);
      if (!it) return json(res, 404, { error: 'Demande expirée' });
      if (always) it.perm.mode = 'auto';
      // « Toujours autoriser cette action » : mémorisé, sauf pour le matériel qui garde sa permission appareil par appareil.
      if (allow && forever && it.name && it.name !== 'control_device') {
        const st = load('settings');
        st.permissions ||= { always: [] };
        if (!st.permissions.always.includes(it.name)) { st.permissions.always.push(it.name); save('settings'); }
      }
      pending.delete(id);
      it.resolve(!!allow);
      return json(res, 200, { ok: true });
    }

    const convMatch = p.match(/^\/api\/conversations\/([\w-]+)$/);
    if (convMatch && m === 'GET') {
      if (!canChat(req)) return json(res, 401, { error: 'Connexion requise' });
      const c = convMatch[1] === MAIN && !isAdmin(req) ? null : load('conversations').find((x) => x.id === convMatch[1]);
      if (!c) return json(res, 404, { error: 'Introuvable' });
      // Seuls les derniers messages sont envoyés par défaut (« ?all=1 » pour tout l'historique). « offset » = position réelle du premier.
      const from = url.searchParams.get('all') ? 0 : Math.max(0, c.messages.length - 60);
      const { summarizing, ...pub } = c;
      return json(res, 200, { ...pub, messages: c.messages.slice(from), offset: from, total: c.messages.length });
    }
    if (p === '/api/feedback' && m === 'POST') {
      const { conversationId, index, rating, correction } = await body(req);
      const c = conversationId === MAIN && !isAdmin(req) ? null : load('conversations').find((x) => x.id === conversationId);
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

if (load('settings').learning?.enabled || load('missions').some((x) => x.id === learning.LEARNING_MISSION_ID)) learning.syncLearningMission();
missions.startScheduler();

// --- Maintien en éveil : les hébergeurs gratuits endorment un service sans visite (Render : 15 min). ---
// Nova se rend visite à elle-même par son adresse publique, ce qui compte comme une visite.
// Render fournit cette adresse tout seul (RENDER_EXTERNAL_URL) ; ailleurs, mets KEEP_AWAKE_URL. KEEP_AWAKE=false pour désactiver.
const keepAwake = { url: (process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''), lastOk: null, lastError: null };
selfadmin.runtime.keepAwake = keepAwake;
selfadmin.runtime.publicUrl = keepAwake.url;
if (process.env.KEEP_AWAKE === 'false') keepAwake.url = '';
if (keepAwake.url) {
  const ping = async () => {
    try {
      const r = await fetch(`${keepAwake.url}/api/ping`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.text();
      keepAwake.lastOk = now(); keepAwake.lastError = null;
    } catch (e) { keepAwake.lastError = e.message; }
  };
  setInterval(ping, (Number(process.env.KEEP_AWAKE_SECONDS) || 300) * 1000).unref();
  setTimeout(ping, 10000).unref();
}
server.listen(PORT, () => {
  const info = llmInfo();
  console.log(`🤖 ${load('persona').name} est en ligne sur http://localhost:${PORT}  (admin : /admin)`);
  console.log(`   Modèle : ${info.model} via ${info.base}${info.configured ? '' : '  ⚠️ LLM_API_KEY manquante'}`);
});
