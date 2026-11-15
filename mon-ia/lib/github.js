// Accès GitHub pour Nova : lire, chercher, écrire, créer une branche, ouvrir une pull request, fusionner et déployer.
// Le jeton est donné par l'admin (Admin → Intégrations, ou par la conversation). Il ne voit que les dépôts choisis dans GitHub.
// Lecture = libre. Écriture, fusion et déploiement = autorisation de l'admin (une fois, ou « toujours » par action).
import { load, save } from './store.js';
import { defineTool } from './tools.js';

const API = () => (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const token = () => (load('settings').github?.token || process.env.GITHUB_TOKEN || '').trim();
const allowList = () => (load('settings').github?.allowRepos || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

function checkRepo(repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ''))) throw new Error('Dépôt invalide : écris-le sous la forme propriétaire/nom.');
  const list = allowList();
  if (list.length && !list.includes(repo)) throw new Error(`« ${repo} » n'est pas dans la liste des dépôts autorisés (Admin → Intégrations → GitHub).`);
  return repo;
}

async function gh(method, path, body) {
  const t = token();
  if (!t) throw new Error("Aucun jeton GitHub. L'admin doit en donner un (Admin → Intégrations → GitHub).");
  const res = await fetch(`${API()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nova-github', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const txt = await res.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) {
    const hint = { 401: 'jeton refusé', 403: "le jeton n'a pas la permission nécessaire sur ce dépôt (Contents / Pull requests : Read and write)", 404: 'dépôt, fichier ou branche introuvable (ou jeton sans accès)', 409: 'conflit (le fichier a changé entre-temps)', 422: 'GitHub a refusé la demande' }[res.status];
    throw new Error(`GitHub ${res.status}${hint ? ' : ' + hint : ''} ${typeof data === 'object' ? (data?.message || '') : String(data).slice(0, 150)}`);
  }
  return data;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(String(s || '').replace(/\n/g, ''), 'base64').toString('utf8');

// ---------- Outils ----------

const S = { type: 'string' };
const G = (name, desc, props, req, run, kind = 'read') => defineTool(name, desc, props, req, run, { kind, adminOnly: true, group: 'github' });

export const GITHUB_TOOLS = [
  G('gh_list_repos', 'Lister les dépôts GitHub auxquels le jeton donne accès.', {}, [], async () => {
    const list = await gh('GET', '/user/repos?per_page=60&sort=pushed');
    const allowed = allowList();
    return list.filter((r) => !allowed.length || allowed.includes(r.full_name))
      .map((r) => `• ${r.full_name}${r.private ? ' (privé)' : ''} — branche ${r.default_branch}${r.description ? ' — ' + r.description : ''}`).join('\n') || 'Aucun dépôt accessible.';
  }),
  G('gh_read_file', 'Lire un fichier d\'un dépôt GitHub (branche optionnelle).', { repo: S, path: S, ref: S }, ['repo', 'path'], async ({ repo, path, ref }) => {
    checkRepo(repo);
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const f = await gh('GET', `/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${q}`);
    if (Array.isArray(f)) return `Dossier ${path} :\n` + f.map((x) => `${x.type === 'dir' ? '📁' : '📄'} ${x.name}`).join('\n');
    const text = unb64(f.content);
    return `${path} (${text.split('\n').length} lignes, sha ${f.sha.slice(0, 7)}) :\n${text.slice(0, 20000)}`;
  }),
  G('gh_search_code', 'Chercher du code dans un dépôt GitHub.', { repo: S, query: S }, ['repo', 'query'], async ({ repo, query }) => {
    checkRepo(repo);
    const r = await gh('GET', `/search/code?q=${encodeURIComponent(query)}+repo:${repo}&per_page=20`);
    return r.items?.length ? r.items.map((i) => `• ${i.path}`).join('\n') : 'Aucun résultat.';
  }),
  G('gh_write_file', "Créer ou modifier un fichier dans un dépôt GitHub et l'enregistrer (commit) sur une branche. Demande l'accord de l'admin.", {
    repo: S, path: S, content: S, message: S, branch: S,
  }, ['repo', 'path', 'content', 'message'], async ({ repo, path, content, message, branch }) => {
    checkRepo(repo);
    const ref = branch ? `?ref=${encodeURIComponent(branch)}` : '';
    let sha;
    try { sha = (await gh('GET', `/repos/${repo}/contents/${path}${ref}`)).sha; } catch { /* nouveau fichier */ }
    const r = await gh('PUT', `/repos/${repo}/contents/${path}`, { message, content: b64(content), sha, branch: branch || undefined });
    return `Enregistré : ${path} sur ${branch || 'la branche par défaut'} (commit ${r.commit.sha.slice(0, 7)}).`;
  }, 'write'),
  G('gh_create_branch', 'Créer une branche dans un dépôt (à partir de la branche par défaut ou d\'une autre).', { repo: S, branch: S, from: S }, ['repo', 'branch'], async ({ repo, branch, from }) => {
    checkRepo(repo);
    const base = from || (await gh('GET', `/repos/${repo}`)).default_branch;
    const ref = await gh('GET', `/repos/${repo}/git/ref/heads/${base}`);
    await gh('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: ref.object.sha });
    return `Branche « ${branch} » créée à partir de « ${base} ».`;
  }, 'write'),
  G('gh_open_pr', 'Ouvrir une pull request d\'une branche vers une autre.', { repo: S, head: S, base: S, title: S, body: S }, ['repo', 'head', 'title'], async ({ repo, head, base, title, body }) => {
    checkRepo(repo);
    const b = base || (await gh('GET', `/repos/${repo}`)).default_branch;
    const pr = await gh('POST', `/repos/${repo}/pulls`, { head, base: b, title, body: body || '' });
    return `Pull request #${pr.number} ouverte : ${pr.html_url}`;
  }, 'write'),
  G('gh_merge_pr', 'Fusionner une pull request (ce qui déclenche souvent le déploiement). Demande l\'accord de l\'admin.', { repo: S, number: { type: 'integer' } }, ['repo', 'number'], async ({ repo, number }) => {
    checkRepo(repo);
    const r = await gh('PUT', `/repos/${repo}/pulls/${number}/merge`, { merge_method: 'squash' });
    return `Pull request #${number} fusionnée (${r.sha?.slice(0, 7) || 'ok'}).`;
  }, 'exec'),
  G('gh_deploy_project', "Déployer un projet Nova relié à un dépôt : appelle son deploy hook (Render, Netlify, Vercel…). Demande l'accord de l'admin.", { project: S }, ['project'], async ({ project }) => {
    const w = load('workspaces').find((x) => x.name.toLowerCase() === String(project).toLowerCase() || x.id === project);
    if (!w) throw new Error('Projet introuvable.');
    if (!w.deployHook) throw new Error(`Le projet « ${w.name} » n'a pas de deploy hook. L'admin peut en ajouter un dans Admin → Projets.`);
    const r = await fetch(w.deployHook, { method: 'POST', signal: AbortSignal.timeout(20000) });
    return `Déploiement de « ${w.name} » demandé (HTTP ${r.status}). Le site sera à jour dans quelques minutes.`;
  }, 'exec'),
];

export function setGithubToken(value, repos) {
  const st = load('settings');
  st.github = { ...(st.github || {}), token: value ?? st.github?.token ?? '', ...(repos !== undefined ? { allowRepos: repos } : {}) };
  save('settings');
  return st.github;
}
