// Nova peut travailler sur son propre code (interface, programme), sans toucher à la version en ligne :
// elle modifie une copie du dépôt, commite, pousse ; l'hébergeur redéploie. Configuration (variables d'environnement) :
//   NOVA_SELF_REPO    = https://github.com/pseudo/depot.git   (le dépôt qui contient mon-ia/)
//   NOVA_SELF_BRANCH  = la branche que l'hébergeur déploie (ex. claude/admiring-franklin-apcnw4)
//   NOVA_SELF_TOKEN   = jeton GitHub avec « Contents : Read and write » sur ce dépôt
import { load, save } from './store.js';
import { createWorkspace } from './workspace.js';

export async function ensureSelfProject() {
  const repo = (process.env.NOVA_SELF_REPO || '').trim();
  if (!repo) return null;
  const found = load('workspaces').find((w) => w.isSelf);
  if (found) {
    // Si la configuration a changé (nouveau jeton ou branche), on met à jour sans recloner.
    let changed = false;
    if (process.env.NOVA_SELF_TOKEN && found.token !== process.env.NOVA_SELF_TOKEN) { found.token = process.env.NOVA_SELF_TOKEN; changed = true; }
    if (process.env.NOVA_SELF_BRANCH && found.branch !== process.env.NOVA_SELF_BRANCH) { found.branch = process.env.NOVA_SELF_BRANCH; changed = true; }
    if (changed) save('workspaces');
    return found;
  }
  const w = await createWorkspace({
    name: 'Nova (elle-même)', type: 'git', repoUrl: repo,
    branch: (process.env.NOVA_SELF_BRANCH || '').trim(), token: (process.env.NOVA_SELF_TOKEN || '').trim(),
    previewDir: 'mon-ia/public',
  });
  w.isSelf = true;
  save('workspaces');
  return w;
}
