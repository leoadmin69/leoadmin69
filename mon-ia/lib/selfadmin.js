// Auto-administration : l'IA consulte et modifie ses propres réglages depuis la conversation, et se dépanne elle-même.
// Toute modification passe par une autorisation de l'admin dans le chat (une fois, ou « toujours » pour cette action).
// Ces outils ne sont jamais disponibles pendant une mission autonome ni pour un sous-agent : une page web piégée
// lue pendant l'apprentissage ne peut donc pas reconfigurer l'IA.
import crypto from 'node:crypto';
import { load, save, newId, now } from './store.js';
import { defineTool } from './tools.js';
import { getProviders, chainFor, testProvider, llmInfo } from './llm.js';
import { notify } from './notify.js';
import { backupStatus, backupNow } from './backup.js';
import { syncLearningMission, LEARNING_MISSION_ID } from './learning.js';
import { saveMission, runMission, describeSchedule } from './missions.js';
import { deviceOnline } from './devices.js';
import { createWorkspace, deleteWorkspace } from './workspace.js';

// ---------- État du serveur partagé avec server.js (journal, maintien en éveil, adresse publique) ----------
export const runtime = { logs: [], keepAwake: null, publicUrl: '', startedAt: new Date().toISOString() };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** Garde en mémoire les dernières lignes du journal du serveur, pour que l'IA puisse se diagnostiquer. */
export function captureLogs() {
  for (const level of ['log', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      const line = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      runtime.logs.push({ at: new Date().toISOString(), level, line: redactSecrets(line).slice(0, 1500) });
      if (runtime.logs.length > 300) runtime.logs.splice(0, 100);
    };
  }
}

/** Liste des secrets connus, pour ne jamais les laisser traîner dans l'historique ni dans les journaux. */
function secretValues() {
  const st = load('settings');
  const list = [
    ...load('models').providers.map((p) => p.apiKey), process.env.LLM_API_KEY, process.env.ADMIN_PASSWORD, process.env.BACKUP_GITHUB_TOKEN,
    st.notify?.telegramToken, st.quantum?.ibmToken, ...load('devices').map((d) => d.haToken), ...load('workspaces').map((w) => w.token),
  ];
  return list.filter((v) => v && String(v).length >= 8);
}
export function redactSecrets(text) {
  let out = String(text ?? '');
  for (const v of secretValues()) out = out.split(v).join('••••••');
  return out;
}
const mask = (v) => (v ? '(enregistré)' : '(vide)');
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

// ---------- Lecture ----------

function getSettings() {
  const st = load('settings');
  const models = load('models');
  const persona = load('persona');
  return {
    personnalite: { name: persona.name, temperature: persona.temperature, instructions: persona.instructions },
    modeles: {
      fournisseurs: getProviders().map((p) => ({ id: p.id, name: p.name, base_url: p.baseUrl, model: p.model, cle: mask(p.apiKey), depuis_env: !!p.fromEnv })),
      roles: models.roles, utilises: llmInfo(),
    },
    notifications: { ntfyTopic: st.notify?.ntfyTopic || '', ntfyServer: st.notify?.ntfyServer || '', telegramToken: mask(st.notify?.telegramToken), telegramChatId: st.notify?.telegramChatId || '', webhookUrl: st.notify?.webhookUrl || '' },
    apprentissage: { ...(st.learning || {}), derniere_session: load('missions').find((m) => m.id === LEARNING_MISSION_ID)?.runs?.[0]?.startedAt || null },
    voix: st.voice || {},
    quantique: { ibmToken: mask(st.quantum?.ibmToken), ibmInstance: st.quantum?.ibmInstance || '' },
    github: { token: mask(st.github?.token), depots_autorises: st.github?.allowRepos || '(tous ceux du jeton)' },
    sauvegarde: pick(backupStatus(), ['configured', 'repo', 'lastBackupAt', 'lastRestoreAt', 'lastError', 'restoreFailed']),
    eveil: runtime.keepAwake ? { actif: !!runtime.keepAwake.url, dernier_signal: runtime.keepAwake.lastOk, erreur: runtime.keepAwake.lastError } : { actif: false },
    adresse_publique: runtime.publicUrl || '(inconnue)',
    appareils: load('devices').map((d) => ({ id: d.id, name: d.name, type: d.type, permission: d.permission, en_ligne: d.type === 'remote' ? deviceOnline(d.id) : undefined })),
    missions: load('missions').map((m) => ({ id: m.id, title: m.title, quand: describeSchedule(m.schedule), active: m.enabled, dernier_resultat: m.runs?.[0]?.status || null })),
    projets: load('workspaces').map((w) => ({ id: w.id, name: w.name, type: w.type, depot: w.repoUrl || '' })),
    cles_integration: load('apikeys').map((k) => ({ id: k.id, name: k.name, scopes: k.scopes, debut: k.prefix })),
    autorisations_permanentes: st.permissions?.always || [],
    reglages_hebergeur: "Ces réglages ne se changent PAS d'ici mais chez l'hébergeur (variables d'environnement) : ADMIN_PASSWORD, LLM_* du fichier .env, BACKUP_GITHUB_*, TZ.",
  };
}

async function selfCheck() {
  const out = [];
  const providers = getProviders();
  if (!providers.length) out.push('❌ Aucun modèle configuré.');
  const tests = await Promise.all(providers.map(async (p) => [p, await testProvider(p)]));
  for (const [p, r] of tests) out.push(r.ok ? `✅ Modèle « ${p.name} » (${p.model}) répond en ${r.ms} ms.` : `❌ Modèle « ${p.name} » (${p.model}) : ${redactSecrets(r.error)}`);
  const roles = load('models').roles || {};
  out.push(`ℹ️ Cerveau puissant : ${chainFor('smart')[0]?.model || '—'} ; rapide : ${chainFor('fast')[0]?.model || '—'} ; vision : ${roles.vision ? chainFor('vision')[0]?.model : '(non réglé : les images vont au modèle puissant)'}.`);
  const n = load('settings').notify || {};
  out.push(n.ntfyTopic || (n.telegramToken && n.telegramChatId) || n.webhookUrl ? '✅ Notifications : au moins un canal est réglé (envoie un test avec notify_admin pour vérifier).' : '⚠️ Notifications : aucun canal réglé.');
  const b = backupStatus();
  out.push(!b.configured ? "⚠️ Sauvegarde automatique non configurée : la mémoire peut être perdue au redémarrage (variables BACKUP_GITHUB_REPO et BACKUP_GITHUB_TOKEN chez l'hébergeur)."
    : b.restoreFailed ? `❌ Sauvegarde suspendue : ${b.lastError}` : b.lastError ? `⚠️ Sauvegarde : ${b.lastError}` : `✅ Sauvegarde active (dernière : ${b.lastBackupAt || 'pas encore'}).`);
  const k = runtime.keepAwake;
  out.push(!k?.url ? '⚠️ Maintien en éveil inactif : je peux être endormie par l\'hébergeur.' : k.lastError ? `❌ Maintien en éveil en échec : ${k.lastError}` : `✅ Maintien en éveil actif (dernier signal : ${k.lastOk || 'en attente'}).`);
  const l = load('settings').learning || {};
  const lm = load('missions').find((m) => m.id === LEARNING_MISSION_ID);
  out.push(!l.enabled ? 'ℹ️ Auto-apprentissage désactivé.' : `✅ Auto-apprentissage actif (${describeSchedule(lm?.schedule)}). Dernière session : ${lm?.runs?.[0] ? `${lm.runs[0].status} le ${lm.runs[0].startedAt}` : 'aucune'}.`);
  for (const m of load('missions')) if (m.runs?.[0]?.status === 'error') out.push(`❌ Mission « ${m.title} » en erreur : ${m.runs[0].output.slice(0, 200)}`);
  for (const d of load('devices')) if (d.type === 'remote' && d.permission !== 'off' && !deviceOnline(d.id)) out.push(`⚠️ Appareil distant « ${d.name} » hors ligne.`);
  const errs = runtime.logs.filter((x) => x.level === 'error').slice(-5);
  out.push(errs.length ? `Dernières erreurs du journal :\n${errs.map((e) => `  [${e.at}] ${e.line.slice(0, 300)}`).join('\n')}` : '✅ Aucune erreur récente dans le journal.');
  out.push(`ℹ️ Démarrée le ${runtime.startedAt}. Heure du serveur : ${new Date().toLocaleString('fr-FR')}.`);
  return out.join('\n');
}

function readLogs({ lines = 40, errors_only = false }) {
  const list = runtime.logs.filter((x) => !errors_only || x.level !== 'log').slice(-Math.min(lines, 150));
  return list.length ? list.map((x) => `[${x.at}] ${x.level.toUpperCase()} ${x.line}`).join('\n') : 'Journal vide.';
}

// ---------- Modifications (autorisation requise) ----------

const SECTIONS = {
  persona: ['name', 'instructions', 'temperature'],
  learning: ['enabled', 'every', 'time', 'interests', 'notify', 'autonomy'],
  notifications: ['ntfyTopic', 'ntfyServer', 'telegramToken', 'telegramChatId', 'webhookUrl'],
  voice: ['sttProvider', 'sttModel'],
  quantum: ['ibmToken', 'ibmInstance', 'python'],
  github: ['token', 'allowRepos'],
};
function updateSettings({ section, values }) {
  const allowed = SECTIONS[section];
  if (!allowed) throw new Error(`Section inconnue. Sections : ${Object.keys(SECTIONS).join(', ')}`);
  const clean = pick(typeof values === 'string' ? JSON.parse(values) : values || {}, allowed);
  if (!Object.keys(clean).length) throw new Error(`Aucune valeur reconnue. Champs de « ${section} » : ${allowed.join(', ')}`);
  if (section === 'persona') {
    if (clean.temperature !== undefined) clean.temperature = Math.min(1.5, Math.max(0, Number(clean.temperature)));
    save('persona', { ...load('persona'), ...clean });
  } else {
    const st = load('settings');
    const key = { learning: 'learning', notifications: 'notify', voice: 'voice', quantum: 'quantum', github: 'github' }[section];
    st[key] = { ...(st[key] || {}), ...clean };
    save('settings');
    if (section === 'learning') syncLearningMission();
  }
  return `Réglages « ${section} » mis à jour : ${Object.keys(clean).join(', ')}.`;
}

async function manageModel({ action, id, name, base_url, api_key, model, smart, fast, vision, fallbacks }) {
  const cfg = load('models');
  const find = (ref) => cfg.providers.find((p) => p.id === ref || p.name.toLowerCase() === String(ref || '').toLowerCase());
  if (action === 'add') {
    if (!base_url || !model) throw new Error('base_url et model sont requis.');
    const p = { id: newId(), name: name || model, baseUrl: base_url.trim(), apiKey: (api_key || '').trim(), model: model.trim() };
    const test = await testProvider(p);
    cfg.providers.push(p); save('models');
    return `Modèle « ${p.name} » ajouté (id ${p.id}). Test : ${test.ok ? `il répond en ${test.ms} ms` : `ÉCHEC — ${redactSecrets(test.error)}`}. Utilise set_roles pour lui donner un rôle.`;
  }
  if (action === 'set_roles') {
    const resolve = (ref) => (ref === undefined ? undefined : ref === '' ? '' : (getProviders().find((p) => p.id === ref || p.name.toLowerCase() === String(ref).toLowerCase())?.id ?? null));
    const next = { smart: resolve(smart), fast: resolve(fast), vision: resolve(vision) };
    for (const [k, v] of Object.entries(next)) { if (v === null) throw new Error(`Modèle inconnu pour le rôle ${k}.`); if (v !== undefined) cfg.roles[k] = v; }
    if (Array.isArray(fallbacks)) cfg.roles.fallbacks = fallbacks.map(resolve).filter(Boolean);
    save('models');
    return `Rôles mis à jour : puissant = ${chainFor('smart')[0]?.model}, rapide = ${chainFor('fast')[0]?.model}.`;
  }
  const p = find(id || name);
  if (!p) throw new Error("Modèle introuvable (ceux du fichier .env se modifient chez l'hébergeur).");
  if (action === 'update') {
    if (base_url) p.baseUrl = base_url.trim();
    if (api_key) p.apiKey = api_key.trim();
    if (model) p.model = model.trim();
    if (name && id) p.name = name;
    save('models');
    const test = await testProvider(p);
    return `Modèle « ${p.name} » mis à jour. Test : ${test.ok ? `il répond en ${test.ms} ms` : `ÉCHEC — ${redactSecrets(test.error)}`}.`;
  }
  if (action === 'remove') {
    if (getProviders().length <= 1) throw new Error('Impossible de retirer mon seul modèle : je ne pourrais plus répondre.');
    cfg.providers = cfg.providers.filter((x) => x.id !== p.id);
    for (const k of ['smart', 'fast', 'vision']) if (cfg.roles[k] === p.id) cfg.roles[k] = '';
    cfg.roles.fallbacks = (cfg.roles.fallbacks || []).filter((x) => x !== p.id);
    save('models');
    return `Modèle « ${p.name} » retiré.`;
  }
  throw new Error('action : add, update, remove ou set_roles');
}

function createIntegrationKey({ name, scopes = ['chat'] }) {
  const raw = 'nova_' + crypto.randomBytes(24).toString('base64url');
  const ok = scopes.filter((s) => ['chat', 'missions'].includes(s));
  load('apikeys').push({ id: newId(), name: name || 'Intégration', hash: sha(raw), prefix: raw.slice(0, 10), scopes: ok.length ? ok : ['chat'], createdAt: now(), lastUsed: null });
  save('apikeys');
  return `Clé créée (${ok.join(' + ') || 'chat'}). Donne-la à l'admin MAINTENANT, elle ne sera plus jamais affichée : ${raw}`;
}

function manageDevice({ action, id, name, description, type, permission, ha_url, ha_token, entities, actions, allow_shell }) {
  const list = load('devices');
  const d = list.find((x) => x.id === id || x.name.toLowerCase() === String(name || '').toLowerCase());
  if (action === 'remove') { if (!d) throw new Error('Appareil introuvable'); save('devices', list.filter((x) => x.id !== d.id)); return `Appareil « ${d.name} » supprimé.`; }
  if (action === 'add' && d) throw new Error(`Un appareil « ${d.name} » existe déjà : utilise update.`);
  if (action === 'update' && !d) throw new Error('Appareil introuvable');
  const dev = d || { id: newId(), createdAt: now(), actions: [], permission: 'ask', type: 'http' };
  if (name) dev.name = name;
  if (description !== undefined) dev.description = description;
  if (['homeassistant', 'http', 'command', 'remote'].includes(type)) dev.type = type;
  if (['off', 'ask', 'auto'].includes(permission)) dev.permission = permission;
  if (ha_url) dev.haUrl = ha_url; if (ha_token) dev.haToken = ha_token; if (entities) dev.entities = entities;
  if (Array.isArray(actions)) dev.actions = actions.filter((a) => a?.name);
  if (allow_shell !== undefined) dev.allowShell = !!allow_shell;
  if (!dev.name) throw new Error('name requis');
  if (!d) list.push(dev);
  let extra = '';
  if (dev.type === 'remote' && !dev.tokenHash) {
    const token = 'novadev_' + crypto.randomBytes(24).toString('base64url');
    dev.tokenHash = sha(token);
    const url = runtime.publicUrl || 'https://ADRESSE-DE-NOVA';
    extra = `\nÀ lancer sur l'appareil (Node.js requis). Donne ces deux commandes à l'admin MAINTENANT, le jeton ne sera plus affiché :\ncurl -O ${url}/nova-agent.mjs\nnode nova-agent.mjs ${url} ${token}`;
  }
  save('devices');
  return `Appareil « ${dev.name} » ${d ? 'mis à jour' : 'ajouté'} (type ${dev.type}, permission ${dev.permission}).${extra}`;
}

async function manageMission({ action, mission }) {
  const m = load('missions').find((x) => x.id === mission || x.title.toLowerCase().includes(String(mission || '').toLowerCase()));
  if (!m) throw new Error('Mission introuvable');
  if (action === 'pause' || action === 'resume') { saveMission({ enabled: action === 'resume' }, m.id); return `Mission « ${m.title} » ${action === 'resume' ? 'réactivée' : 'mise en pause'}.`; }
  if (action === 'delete') { if (m.id === LEARNING_MISSION_ID) throw new Error("Pour arrêter l'apprentissage, utilise update_settings (learning.enabled = false)."); save('missions', load('missions').filter((x) => x.id !== m.id)); return `Mission « ${m.title} » supprimée.`; }
  if (action === 'run') { runMission(m.id, { trigger: 'demande dans le chat' }).catch(() => {}); return `Mission « ${m.title} » lancée. Le compte rendu arrivera en notification.`; }
  throw new Error('action : pause, resume, delete ou run');
}

async function manageProject({ action, name, repo_url, branch, token, preview_dir, id }) {
  if (action === 'remove') {
    const w = load('workspaces').find((x) => x.id === id || x.name.toLowerCase() === String(name || '').toLowerCase());
    if (!w) throw new Error('Projet introuvable');
    deleteWorkspace(w.id);
    return `Projet « ${w.name} » retiré.`;
  }
  const w = await createWorkspace({ name, type: repo_url ? 'git' : 'empty', repoUrl: repo_url, branch, token, previewDir: preview_dir });
  return `Projet « ${w.name} » ajouté (id ${w.id}${w.branch ? `, branche ${w.branch}` : ''}). L'admin peut le choisir dans le menu 📁 du chat pour que j'y travaille.`;
}

async function manageBackup() {
  const b = await backupNow();
  return `Sauvegarde envoyée (${b.lastBackupAt}).`;
}

function managePermissions({ action, tool }) {
  const st = load('settings');
  st.permissions ||= { always: [] };
  if (action === 'revoke') {
    st.permissions.always = tool ? st.permissions.always.filter((t) => t !== tool) : [];
    save('settings');
  }
  // Remarque : accorder une autorisation permanente ne se fait QUE par le bouton de l'admin dans le chat, jamais par cet outil.
  return `Actions autorisées en permanence : ${st.permissions.always.join(', ') || 'aucune'}.`;
}

const S = { type: 'string' };
const A = (name, desc, props, req, run, kind = 'write') => defineTool(name, desc, props, req, run, { kind, adminOnly: true, group: 'admin' });

export const ADMIN_TOOLS = [
  A('get_settings', 'Consulter tous tes réglages actuels (modèles, notifications, apprentissage, sauvegarde, appareils, missions, projets, clés…). Les secrets sont masqués.', {}, [], getSettings, 'read'),
  A('self_check', "Te diagnostiquer : teste chaque modèle, vérifie notifications, sauvegarde, maintien en éveil, apprentissage, missions, appareils et journal d'erreurs.", {}, [], selfCheck, 'read'),
  A('read_logs', 'Lire les dernières lignes du journal du serveur (pour trouver la cause d\'un bug).', { lines: { type: 'integer' }, errors_only: { type: 'boolean' } }, [], readLogs, 'read'),
  A('update_settings', `Modifier tes réglages. Sections et champs : ${Object.entries(SECTIONS).map(([k, v]) => `${k} (${v.join(', ')})`).join(' ; ')}. learning.every = "daily" ou un nombre de minutes ; learning.autonomy = "propose" ou "autonome".`,
    { section: { type: 'string', enum: Object.keys(SECTIONS) }, values: { type: 'object', description: 'Champs à modifier' } }, ['section', 'values'], updateSettings),
  A('manage_model', 'Ajouter, modifier ou retirer un modèle (fournisseur compatible OpenAI), ou choisir les rôles (puissant, rapide, vision, secours). Le modèle est testé automatiquement.', {
    action: { type: 'string', enum: ['add', 'update', 'remove', 'set_roles'] }, id: S, name: S, base_url: S, api_key: S, model: S,
    smart: { type: 'string', description: 'id ou nom du modèle puissant' }, fast: S, vision: S, fallbacks: { type: 'array', items: S },
  }, ['action'], manageModel),
  A('create_integration_key', "Créer une clé d'intégration pour un autre système (bulle sur un site, API). scopes : chat, missions.", { name: S, scopes: { type: 'array', items: S } }, ['name'], createIntegrationKey),
  A('manage_device', "Ajouter, modifier ou supprimer un appareil. type : homeassistant, http, command, remote (crée le jeton et les commandes d'installation). actions : [{name, command ou url+method+body, description, read}].", {
    action: { type: 'string', enum: ['add', 'update', 'remove'] }, id: S, name: S, description: S, type: S, permission: { type: 'string', enum: ['off', 'ask', 'auto'] },
    ha_url: S, ha_token: S, entities: S, actions: { type: 'array', items: { type: 'object' } }, allow_shell: { type: 'boolean' },
  }, ['action'], manageDevice),
  A('manage_mission', 'Mettre en pause, réactiver, supprimer ou lancer une mission (par son titre ou son id).', { action: { type: 'string', enum: ['pause', 'resume', 'delete', 'run'] }, mission: S }, ['action', 'mission'], manageMission),
  A('manage_project', "Ajouter un projet (dépôt Git à cloner, ou site vide si pas de repo_url) ou le retirer. Pour te donner accès à ton propre code, ajoute ton dépôt avec un jeton.", {
    action: { type: 'string', enum: ['add', 'remove'] }, id: S, name: S, repo_url: S, branch: S, token: S, preview_dir: S,
  }, ['action', 'name'], manageProject),
  A('backup_now', 'Lancer une sauvegarde de ta mémoire tout de suite.', {}, [], manageBackup, 'safe'),
  A('manage_permissions', "Lister les actions que l'admin a autorisées en permanence, ou en révoquer (action revoke, tool optionnel = toutes).", { action: { type: 'string', enum: ['list', 'revoke'] }, tool: S }, ['action'], managePermissions, 'safe'),
];
