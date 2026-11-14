// Projets (« workspaces ») : les sites/dépôts auxquels l'admin donne accès à l'IA,
// et les outils de code façon Claude Code (lire, chercher, modifier, exécuter, git, déployer).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DATA_DIR, load, save, newId, now } from './store.js';
import { defineTool } from './tools.js';

const WS_DIR = path.join(DATA_DIR, 'workspaces');
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.cache', '.venv', '__pycache__', '.turbo', '.svelte-kit']);
const MAX_OUT = 20000;

export const wsRoot = (ws) => (ws.type === 'folder' ? path.resolve(ws.folderPath) : path.join(WS_DIR, ws.id));
export const getWorkspace = (id) => load('workspaces').find((w) => w.id === id);
const slugify = (s) => (s || 'site').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site';

// Empêche l'IA de sortir du dossier du projet ou de toucher au dossier .git.
function safePath(ws, p = '.') {
  const root = wsRoot(ws);
  const full = path.resolve(root, String(p).replace(/^\/+/, ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Chemin interdit (hors du projet) : ${p}`);
  if (/(^|[\\/])\.git([\\/]|$)/.test(path.relative(root, full))) throw new Error('Le dossier .git est protégé : utilise les outils git.');
  return full;
}
const rel = (ws, full) => path.relative(wsRoot(ws), full) || '.';

function truncate(text, max = MAX_OUT) {
  if (text.length <= max) return text;
  return text.slice(0, max * 0.4) + `\n\n… [${text.length - max} caractères coupés] …\n\n` + text.slice(-max * 0.6);
}

// Les commandes ne voient jamais les secrets du serveur, seulement ceux du projet.
function commandEnv(ws, extra = {}) {
  const env = { ...process.env };
  for (const k of ['LLM_API_KEY', 'ADMIN_PASSWORD']) delete env[k];
  for (const line of (ws.secrets || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return { ...env, CI: '1', GIT_TERMINAL_PROMPT: '0', ...extra };
}

function hideSecrets(ws, text) {
  let out = text;
  const values = [ws.token, ...(ws.secrets || '').split('\n').map((l) => l.split('=').slice(1).join('=').trim())];
  for (const v of values) if (v && v.length > 5) out = out.split(v).join('••••');
  return out;
}

export function sh(ws, command, { timeout = 120000, env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { cwd: cwd || wsRoot(ws), env: commandEnv(ws, env) });
    let out = '';
    const onData = (d) => { out += d; if (out.length > 4 * MAX_OUT) out = out.slice(-2 * MAX_OUT); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => { child.kill('SIGKILL'); out += `\n[Arrêté : délai de ${timeout / 1000}s dépassé]`; }, timeout);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: truncate(hideSecrets(ws, out)) }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, output: e.message }); });
  });
}

function authUrl(ws) {
  if (!ws.repoUrl) throw new Error("Ce projet n'a pas de dépôt Git distant.");
  const u = new URL(ws.repoUrl);
  if (ws.token) { u.username = u.hostname.includes('github') ? 'x-access-token' : 'oauth2'; u.password = ws.token; }
  return u.toString();
}

const STARTER = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nouveau site</title></head>
<body style="font-family:system-ui;max-width:700px;margin:10vh auto;padding:0 16px">
  <h1>Nouveau site</h1>
  <p>Demande à ton IA de construire ce site.</p>
</body>
</html>
`;

// ---------- Gestion des projets (appelée par l'admin) ----------

export async function createWorkspace(data) {
  const list = load('workspaces');
  const ws = {
    id: newId(), name: data.name || 'Projet', type: data.type || 'empty',
    repoUrl: data.repoUrl || '', branch: data.branch || '', token: data.token || '',
    folderPath: data.folderPath || '', previewDir: data.previewDir || '.',
    deployHook: data.deployHook || '', deployCommand: data.deployCommand || '', secrets: data.secrets || '',
    slug: slugify(data.slug || data.name), published: false, createdAt: now(),
  };
  if (list.some((w) => w.slug === ws.slug)) ws.slug += '-' + ws.id.slice(0, 4);
  const root = wsRoot(ws);
  if (ws.type === 'folder') {
    if (!fs.existsSync(root)) throw new Error(`Dossier introuvable : ${root}`);
  } else {
    fs.mkdirSync(WS_DIR, { recursive: true });
    if (ws.type === 'git') {
      const branch = ws.branch ? `-b ${JSON.stringify(ws.branch)}` : '';
      const r = await sh(ws, `git clone --depth 50 ${branch} "$REPO" ${JSON.stringify(root)}`, { cwd: WS_DIR, env: { REPO: authUrl(ws) }, timeout: 300000 });
      if (r.code !== 0) throw new Error('Clonage impossible : ' + r.output);
      await sh(ws, 'git remote set-url origin "$CLEAN"', { env: { CLEAN: ws.repoUrl } });
      if (!ws.branch) ws.branch = (await sh(ws, 'git rev-parse --abbrev-ref HEAD')).output.trim();
    } else {
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'index.html'), STARTER);
      await sh(ws, 'git init -q && git add -A && git -c user.name=IA -c user.email=ia@localhost commit -qm "Projet créé"');
    }
  }
  list.push(ws); save('workspaces');
  return ws;
}

export async function syncWorkspace(ws) {
  if (ws.type !== 'git') return { output: 'Rien à synchroniser (pas de dépôt distant).' };
  const r = await sh(ws, `git pull --rebase "$REPO" ${JSON.stringify(ws.branch || 'HEAD')}`, { env: { REPO: authUrl(ws) } });
  return { ok: r.code === 0, output: r.output };
}

export function deleteWorkspace(id) {
  const ws = getWorkspace(id);
  if (!ws) return;
  if (ws.type !== 'folder') fs.rmSync(wsRoot(ws), { recursive: true, force: true });
  save('workspaces', load('workspaces').filter((w) => w.id !== id));
}

export const publicUrl = (ws) => `/s/${ws.slug}/`;
export const previewUrl = (ws) => `/preview/${ws.id}/`;

/** Pour le serveur web : retrouve le fichier statique d'un projet (aperçu ou site publié). */
export function staticFile(ws, sub) {
  const base = safePath(ws, ws.previewDir || '.');
  let full = path.resolve(base, decodeURIComponent(sub || '').replace(/^\/+/, ''));
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) full = path.join(full, 'index.html');
  if (!fs.existsSync(full) && fs.existsSync(full + '.html')) full += '.html';
  return fs.existsSync(full) ? full : null;
}

// Résumé du projet injecté dans le prompt système.
const top = (root) => { try { return fs.readdirSync(root).filter((n) => n !== '.git').slice(0, 40).join('  '); } catch { return '(indisponible)'; } };

export function describeWorkspace(ws) {
  const root = wsRoot(ws);
  if (ws.isSelf) {
    return [
      "## Ton propre code (projet « Nova (elle-même) »)",
      "Tu peux modifier ton interface et ton programme dans ce dépôt. Ta copie de travail n'est PAS celle qui tourne : pour qu'un changement soit en ligne, il faut commiter (git_commit_push), puis l'hébergeur redéploie.",
      "Règles : lis avant de modifier ; change peu à la fois ; vérifie la syntaxe (node --check) ; après un changement risqué, dis-le à l'admin et propose la solution de retour (git_diff / git revert).",
      "Jamais de secret (clé, jeton, mot de passe) dans le code ni dans les commits. Les modifications demandent toujours l'accord de l'admin, sauf s'il l'a autorisé pour toujours.",
      `Racine du dépôt : ${top(root)}`,
    ].join('\n');
  }
  let top = [];
  try { top = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.name !== '.git').slice(0, 40).map((d) => d.name + (d.isDirectory() ? '/' : '')); } catch { /* vide */ }
  return [
    `## Projet ouvert : « ${ws.name} »`,
    `Tu as accès aux fichiers de ce projet avec les outils de code (chemins relatifs à la racine du projet).`,
    ws.repoUrl ? `Dépôt Git : ${ws.repoUrl} (branche ${ws.branch || 'par défaut'}). Pour enregistrer et envoyer le travail : git_commit_push.` : 'Projet local (pas de dépôt distant).',
    `Mise en ligne : outil deploy (${ws.deployCommand ? 'commande personnalisée' : ws.deployHook ? 'deploy hook' : `publication intégrée → ${publicUrl(ws)}`}).`,
    `Aperçu du site : ${previewUrl(ws)} (dossier servi : ${ws.previewDir || '.'}).`,
    `Racine : ${top.join('  ') || '(vide)'}`,
  ].join('\n');
}

// ---------- Outils de code ----------

function walk(ws, dir, depth, out, max) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= max) return;
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    out.push({ full, dir: e.isDirectory(), depth });
    if (e.isDirectory() && depth > 1) walk(ws, full, depth - 1, out, max);
  }
}

function isText(full) {
  const st = fs.statSync(full);
  if (st.size > 1_000_000) return false;
  const buf = fs.readFileSync(full).subarray(0, 4000);
  return !buf.includes(0);
}

const need = (ctx) => { if (!ctx.workspace) throw new Error("Aucun projet ouvert. Demande à l'admin d'en choisir un."); return ctx.workspace; };

function listFiles({ path: p = '.', depth = 3 }, ctx) {
  const ws = need(ctx);
  const out = [];
  walk(ws, safePath(ws, p), Math.min(depth, 6), out, 400);
  const lines = out.map((e) => `${rel(ws, e.full)}${e.dir ? '/' : ''}`);
  return lines.join('\n') + (out.length >= 400 ? '\n… (liste tronquée, précise un sous-dossier)' : '') || '(dossier vide)';
}

function readFile({ path: p, offset = 1, limit = 400 }, ctx) {
  const ws = need(ctx);
  const full = safePath(ws, p);
  if (!fs.existsSync(full)) throw new Error(`Fichier introuvable : ${p}`);
  if (fs.statSync(full).isDirectory()) return listFiles({ path: p, depth: 1 }, ctx);
  if (!isText(full)) throw new Error('Fichier binaire ou trop gros.');
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  const start = Math.max(1, offset);
  const slice = lines.slice(start - 1, start - 1 + Math.min(limit, 1000));
  const body = slice.map((l, i) => `${String(start + i).padStart(5)}│${l.length > 500 ? l.slice(0, 500) + '…' : l}`).join('\n');
  const more = start - 1 + slice.length < lines.length ? `\n… (${lines.length} lignes au total : utilise offset=${start + slice.length} pour la suite)` : '';
  return body + more;
}

function writeFile({ path: p, content }, ctx) {
  const ws = need(ctx);
  const full = safePath(ws, p);
  const existed = fs.existsSync(full);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content ?? '');
  return `${existed ? 'Remplacé' : 'Créé'} : ${p} (${(content || '').split('\n').length} lignes)`;
}

function editFile({ path: p, old_string, new_string, replace_all = false }, ctx) {
  const ws = need(ctx);
  const full = safePath(ws, p);
  if (!fs.existsSync(full)) throw new Error(`Fichier introuvable : ${p}. Utilise write_file pour le créer.`);
  const text = fs.readFileSync(full, 'utf8');
  const count = old_string ? text.split(old_string).length - 1 : 0;
  if (count === 0) throw new Error("old_string introuvable. Relis le fichier avec read_file et copie le texte exact (espaces et indentation compris, sans les numéros de ligne).");
  if (count > 1 && !replace_all) throw new Error(`old_string apparaît ${count} fois. Ajoute plus de contexte pour le rendre unique, ou mets replace_all=true.`);
  fs.writeFileSync(full, replace_all ? text.split(old_string).join(new_string) : text.replace(old_string, () => new_string));
  return `Modifié : ${p} (${replace_all ? count : 1} remplacement${count > 1 && replace_all ? 's' : ''})`;
}

function deleteFile({ path: p }, ctx) {
  const ws = need(ctx);
  const full = safePath(ws, p);
  if (full === wsRoot(ws)) throw new Error('Impossible de supprimer la racine du projet.');
  fs.rmSync(full, { recursive: true, force: true });
  return `Supprimé : ${p}`;
}

function searchCode({ pattern, path: p = '.', glob }, ctx) {
  const ws = need(ctx);
  let re;
  try { re = new RegExp(pattern, 'i'); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  const globRe = glob ? new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
  const files = [];
  walk(ws, safePath(ws, p), 20, files, 5000);
  const hits = [];
  for (const f of files) {
    if (f.dir || (globRe && !globRe.test(path.basename(f.full)))) continue;
    try { if (!isText(f.full)) continue; } catch { continue; }
    const lines = fs.readFileSync(f.full, 'utf8').split('\n');
    lines.forEach((l, i) => { if (hits.length < 120 && re.test(l)) hits.push(`${rel(ws, f.full)}:${i + 1}: ${l.trim().slice(0, 200)}`); });
    if (hits.length >= 120) break;
  }
  return hits.length ? hits.join('\n') + (hits.length >= 120 ? '\n… (plus de résultats : affine la recherche)' : '') : 'Aucun résultat.';
}

async function runCommand({ command, timeout_s = 120 }, ctx) {
  const ws = need(ctx);
  const r = await sh(ws, command, { timeout: Math.min(timeout_s, 600) * 1000 });
  return `Code de sortie : ${r.code}\n${r.output || '(aucune sortie)'}`;
}

async function gitStatus(_, ctx) {
  const ws = need(ctx);
  const r = await sh(ws, 'git status --short --branch && echo && git diff --stat && echo && git log --oneline -5');
  return r.output;
}

async function gitDiff({ path: p = '' }, ctx) {
  const ws = need(ctx);
  if (p) safePath(ws, p);
  const r = await sh(ws, `git diff -- ${p ? JSON.stringify(p) : ''}`);
  return r.output || 'Aucune modification non enregistrée.';
}

async function gitCommitPush({ message }, ctx) {
  const ws = need(ctx);
  const c = await sh(ws, 'git add -A && (git diff --cached --quiet && echo "Rien à enregistrer" || git -c user.name="$NAME" -c user.email=ia@localhost commit -q -m "$MSG" && echo "Commit créé")',
    { env: { MSG: message || 'Mise à jour par l\'IA', NAME: load('persona').name } });
  if (c.code !== 0) return 'Erreur de commit :\n' + c.output;
  if (!ws.repoUrl) return c.output + '\n(Projet local : pas de push.)';
  const p = await sh(ws, `git push "$REPO" HEAD:${JSON.stringify(ws.branch || 'main')}`, { env: { REPO: authUrl(ws) }, timeout: 180000 });
  return c.output + '\n' + (p.code === 0 ? `Envoyé sur ${ws.branch}.` + (ws.deployHook || ws.deployCommand ? '' : ' Si le site est relié à Vercel/Netlify/GitHub Pages, il se met à jour automatiquement.') : 'Échec du push :\n' + p.output);
}

async function deploy({ build_command }, ctx) {
  const ws = need(ctx);
  const log = [];
  if (build_command) {
    const b = await sh(ws, build_command, { timeout: 600000 });
    log.push(`Build (code ${b.code}) :\n${b.output}`);
    if (b.code !== 0) return log.join('\n') + '\nDéploiement annulé : le build a échoué.';
  }
  if (ws.deployCommand) {
    const d = await sh(ws, ws.deployCommand, { timeout: 600000 });
    log.push(`Déploiement (code ${d.code}) :\n${d.output}`);
  } else if (ws.deployHook) {
    const r = await fetch(ws.deployHook, { method: 'POST' });
    log.push(`Deploy hook appelé : HTTP ${r.status}. Le site sera en ligne dans quelques minutes.`);
  } else {
    ws.published = true; save('workspaces');
    log.push(`Site publié (hébergement intégré) : ${publicUrl(ws)}  (dossier servi : ${ws.previewDir || '.'})`);
  }
  return log.join('\n\n');
}

const S = { type: 'string' };
const code = (name, desc, props, req, run, kind = 'read') => defineTool(name, desc, props, req, run, { kind, adminOnly: true, group: 'code' });

export const CODE_TOOLS = [
  code('list_files', 'Lister les fichiers et dossiers du projet (arborescence).', { path: S, depth: { type: 'integer', description: 'profondeur, 3 par défaut' } }, [], listFiles),
  code('read_file', "Lire un fichier du projet avec numéros de ligne. Pour les gros fichiers, utilise offset/limit.", { path: S, offset: { type: 'integer' }, limit: { type: 'integer' } }, ['path'], readFile),
  code('search_code', 'Chercher un texte ou une regex dans les fichiers du projet (comme grep).', { pattern: S, path: S, glob: { type: 'string', description: 'ex : *.css' } }, ['pattern'], searchCode),
  code('write_file', 'Créer un fichier ou le remplacer entièrement.', { path: S, content: S }, ['path', 'content'], writeFile, 'write'),
  code('edit_file', 'Modifier un fichier en remplaçant un passage exact (old_string) par new_string. old_string doit être unique dans le fichier.',
    { path: S, old_string: S, new_string: S, replace_all: { type: 'boolean' } }, ['path', 'old_string', 'new_string'], editFile, 'write'),
  code('delete_file', 'Supprimer un fichier ou un dossier du projet.', { path: S }, ['path'], deleteFile, 'write'),
  code('run_command', 'Exécuter une commande shell à la racine du projet (npm install, npm run build, tests, python…).', { command: S, timeout_s: { type: 'integer' } }, ['command'], runCommand, 'exec'),
  code('git_status', "Voir l'état Git : fichiers modifiés et derniers commits.", {}, [], gitStatus),
  code('git_diff', 'Voir le détail des modifications non enregistrées.', { path: S }, [], gitDiff),
  code('git_commit_push', 'Enregistrer toutes les modifications (commit) et les envoyer sur le dépôt distant.', { message: S }, ['message'], gitCommitPush, 'exec'),
  code('deploy', 'Mettre le site en ligne (build optionnel puis déploiement configuré par l\'admin).', { build_command: { type: 'string', description: 'ex : npm run build (optionnel)' } }, [], deploy, 'exec'),
];
