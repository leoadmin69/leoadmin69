// Missions : tâches que l'IA exécute seule, à heure fixe, à intervalle, ou déclenchées par un autre système,
// pendant l'absence de l'admin. Le résultat lui est envoyé en notification.
import { load, save, newId, now } from './store.js';
import { defineTool } from './tools.js';
import { notify } from './notify.js';

let runner = null; // fourni par le serveur (évite une dépendance circulaire avec agent.js)
export const setMissionRunner = (fn) => { runner = fn; };

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const atTime = (base, hhmm) => { const d = new Date(base); const [h, m] = String(hhmm || '08:00').split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d; };

/** Prochaine exécution (heure locale du serveur : variable TZ, ex. Africa/Tunis). */
export function nextRun(schedule, from = new Date()) {
  const s = schedule || { type: 'manual' };
  if (s.type === 'once') { const d = new Date(s.at); return d > from ? d.toISOString() : null; }
  if (s.type === 'interval') return new Date(from.getTime() + Math.max(5, Number(s.minutes) || 60) * 60000).toISOString();
  if (s.type === 'daily') { let d = atTime(from, s.time); if (d <= from) d = atTime(new Date(from.getTime() + 864e5), s.time); return d.toISOString(); }
  if (s.type === 'weekly') {
    for (let i = 0; i <= 7; i++) {
      const d = atTime(new Date(from.getTime() + i * 864e5), s.time);
      if (d.getDay() === Number(s.day) && d > from) return d.toISOString();
    }
  }
  return null; // manuel
}

export function describeSchedule(s = {}) {
  if (s.type === 'once') return `une fois, le ${new Date(s.at).toLocaleString('fr-FR')}`;
  if (s.type === 'interval') return `toutes les ${s.minutes} min`;
  if (s.type === 'daily') return `chaque jour à ${s.time}`;
  if (s.type === 'weekly') return `chaque ${DAYS[s.day]} à ${s.time}`;
  return 'manuellement / sur déclenchement';
}

export function saveMission(data, id) {
  const list = load('missions');
  let m = id && list.find((x) => x.id === id);
  if (id && !m) throw new Error('Mission introuvable');
  if (!m) { m = { id: newId(), runs: [], createdAt: now() }; list.push(m); }
  for (const k of ['title', 'instructions', 'agentId', 'workspaceId', 'mode', 'notifyOn', 'schedule', 'enabled']) if (k in data) m[k] = data[k];
  m.mode = m.mode === 'read' ? 'read' : 'auto';
  m.notifyOn ||= 'always';
  m.enabled = m.enabled !== false;
  m.nextRun = m.enabled ? nextRun(m.schedule) : null;
  save('missions');
  return m;
}

/** Exécute une mission maintenant. trigger : 'planning' | 'manuel' | 'api' ; input : données reçues d'un autre système. */
export async function runMission(id, { trigger = 'manuel', input = '' } = {}) {
  const m = load('missions').find((x) => x.id === id);
  if (!m) throw new Error('Mission introuvable');
  if (m.running) return { skipped: 'déjà en cours' };
  if (!runner) throw new Error('Moteur non prêt');
  m.running = true;
  const run = { id: newId(), trigger, startedAt: now(), status: 'running', output: '', steps: [] };
  m.runs = [run, ...(m.runs || [])].slice(0, 15);
  save('missions');

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15 * 60000);
  try {
    const prompt = `(Mission automatique « ${m.title} », déclenchement : ${trigger}. L'admin est ABSENT : travaille de façon autonome et ne pose pas de question. ` +
      `Si une décision humaine est vraiment indispensable, préviens-le avec notify_admin et arrête-toi là. Termine par un compte rendu court et clair.)\n\n${m.instructions}` +
      (input ? `\n\n--- Données reçues ---\n${String(input).slice(0, 20000)}` : '');
    const r = await runner({ mission: m, prompt, signal: abort.signal });
    run.output = r.content || '(aucune réponse)';
    run.steps = r.steps || [];
    run.model = r.model;
    run.status = abort.signal.aborted ? 'error' : 'ok';
    if (abort.signal.aborted) run.output += '\n\n(Arrêtée : durée maximale de 15 min dépassée)';
  } catch (e) {
    run.status = 'error';
    run.output = `Erreur : ${e.message}`;
  } finally {
    clearTimeout(timer);
    run.endedAt = now();
    m.running = false;
    save('missions');
  }
  if (m.notifyOn === 'always' || (m.notifyOn === 'errors' && run.status === 'error')) {
    await notify(`${run.status === 'ok' ? '✅' : '⚠️'} Mission : ${m.title}`, run.output, { priority: run.status === 'error' ? 'high' : 'default' }).catch(() => {});
  }
  return run;
}

// Planificateur : vérifie toutes les 30 secondes les missions à lancer.
export function startScheduler() {
  for (const m of load('missions')) {
    if (m.running) { m.running = false; const r = m.runs?.[0]; if (r?.status === 'running') { r.status = 'error'; r.output = 'Interrompue (redémarrage du serveur)'; } }
    if (m.enabled && !m.nextRun) m.nextRun = nextRun(m.schedule);
  }
  save('missions');
  const tick = () => {
    const t = new Date();
    for (const m of load('missions')) {
      if (!m.enabled || m.running || !m.nextRun || new Date(m.nextRun) > t) continue;
      m.nextRun = m.schedule?.type === 'once' ? null : nextRun(m.schedule, t);
      if (m.schedule?.type === 'once') m.enabled = false;
      save('missions');
      runMission(m.id, { trigger: 'planning' }).catch((e) => console.error('Mission', m.title, e.message));
    }
  };
  setInterval(tick, 30000);
  setTimeout(tick, 3000);
}

// ---------- Outils pour l'IA ----------

export const MISSION_TOOLS = [
  defineTool('schedule_mission', "Programmer une mission que tu exécuteras seule plus tard ou régulièrement (rappel, veille, rapport, surveillance, entretien d'un site…).", {
    title: { type: 'string' },
    instructions: { type: 'string', description: 'Consigne complète et autonome (tu ne te souviendras pas de cette conversation)' },
    schedule: {
      type: 'object', description: 'Quand la lancer',
      properties: {
        type: { type: 'string', enum: ['once', 'interval', 'daily', 'weekly', 'manual'] },
        at: { type: 'string', description: 'once : date et heure locales AAAA-MM-JJTHH:MM' },
        minutes: { type: 'integer', description: 'interval : toutes les N minutes (min 5)' },
        time: { type: 'string', description: 'daily/weekly : HH:MM' },
        day: { type: 'integer', description: 'weekly : 0=dimanche … 6=samedi' },
      }, required: ['type'],
    },
    agent: { type: 'string', description: "Nom d'un agent spécialisé (optionnel)" },
    read_only: { type: 'boolean', description: 'true = la mission ne peut rien modifier' },
  }, ['title', 'instructions', 'schedule'], ({ title, instructions, schedule, agent, read_only }, ctx) => {
    const a = agent ? load('agents').find((x) => x.name.toLowerCase() === agent.toLowerCase() || x.id === agent) : null;
    const m = saveMission({ title, instructions, schedule, agentId: a?.id || '', workspaceId: ctx.workspace?.id || '', mode: read_only ? 'read' : 'auto' });
    return `Mission « ${m.title} » programmée (${describeSchedule(m.schedule)})${m.nextRun ? `, prochaine exécution : ${new Date(m.nextRun).toLocaleString('fr-FR')}` : ''}. L'admin peut la gérer dans Admin → Missions.`;
  }, { kind: 'write', adminOnly: true, group: 'missions' }),
  defineTool('list_missions', 'Lister les missions programmées et leur dernier résultat.', {}, [], () => {
    const list = load('missions');
    if (!list.length) return 'Aucune mission.';
    return list.map((m) => `• ${m.title} — ${describeSchedule(m.schedule)} — ${m.enabled ? 'active' : 'en pause'}${m.runs?.[0] ? ` — dernier résultat (${m.runs[0].status}) : ${m.runs[0].output.slice(0, 150)}` : ''}`).join('\n');
  }, { adminOnly: true, group: 'missions' }),
];
