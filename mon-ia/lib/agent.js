// Le moteur d'agent : la boucle « réfléchir → utiliser un outil → observer → recommencer »,
// partagée par l'IA principale et tous les agents spécialisés.
import { load, save, newId, now } from './store.js';
import { search } from './retrieval.js';
import { streamChat } from './llm.js';
import { BASIC_TOOLS, defineTool } from './tools.js';
import { CODE_TOOLS, describeWorkspace } from './workspace.js';

const MAX_ROUNDS = 40;
const MAX_DEPTH = 2;
const S = { type: 'string' };

export const findAgent = (ref) => {
  if (!ref) return null;
  const r = String(ref).toLowerCase();
  return load('agents').find((a) => a.id === ref || a.name.toLowerCase() === r);
};

// ---------- Outils « agents » ----------

function updatePlan({ steps }, ctx) {
  ctx.emit({ type: 'plan', steps: (steps || []).map((s) => ({ text: String(s.text || s), status: s.status || 'todo' })) });
  return 'Plan mis à jour.';
}

async function callAgent({ agent, task }, ctx) {
  const a = findAgent(agent);
  if (!a) return `Agent inconnu : ${agent}. Agents disponibles : ${load('agents').map((x) => x.name).join(', ')}`;
  const { content } = await runAgent({
    agent: a,
    history: [{ role: 'user', content: task }],
    ctx: { ...ctx, depth: (ctx.depth || 0) + 1, agentName: a.name },
  });
  return content || '(aucune réponse)';
}

function createAgent({ name, description, instructions, tools = [], model = '' }) {
  const agents = load('agents');
  if (agents.some((a) => a.name.toLowerCase() === name.toLowerCase())) return `Un agent « ${name} » existe déjà.`;
  const known = new Set(ALL_TOOLS.map((t) => t.name));
  const a = { id: newId(), name, description: description || '', instructions, tools: tools.filter((t) => known.has(t)), model, createdAt: now() };
  agents.push(a); save('agents');
  return `Agent « ${name} » créé avec ${a.tools.length || 'tous les'} outils. Il est disponible dans le chat et via call_agent.`;
}

export const AGENT_TOOLS = [
  defineTool('update_plan', 'Afficher/mettre à jour ton plan de travail (liste d\'étapes) pour les tâches longues.', {
    steps: { type: 'array', items: { type: 'object', properties: { text: S, status: { type: 'string', enum: ['todo', 'doing', 'done'] } }, required: ['text', 'status'] } },
  }, ['steps'], updatePlan, { kind: 'safe', group: 'agents' }),
  defineTool('call_agent', 'Confier une sous-tâche à un agent spécialisé (il travaille seul puis te rend son résultat).', {
    agent: { type: 'string', description: "Nom de l'agent" }, task: { type: 'string', description: 'Consigne complète et autonome' },
  }, ['agent', 'task'], callAgent, { group: 'agents', adminOnly: true }),
  defineTool('create_agent', "Créer un nouvel agent spécialisé (quand l'admin le demande).", {
    name: S, description: S, instructions: { type: 'string', description: 'Prompt système détaillé de l\'agent' },
    tools: { type: 'array', items: S, description: 'Noms des outils autorisés (vide = tous)' }, model: { type: 'string', description: 'Modèle (vide = par défaut)' },
  }, ['name', 'instructions'], createAgent, { kind: 'write', group: 'agents', adminOnly: true }),
];

export const ALL_TOOLS = [...BASIC_TOOLS, ...CODE_TOOLS, ...AGENT_TOOLS];

// ---------- Sélection des outils et prompt ----------

export function availableTools({ agent, ctx }) {
  return ALL_TOOLS.filter((t) => {
    if (t.adminOnly && !ctx.admin) return false;
    if (t.group === 'code' && !ctx.workspace) return false;
    if (ctx.perm.mode === 'read' && ['write', 'exec'].includes(t.kind)) return false;
    if (t.name === 'call_agent' && (ctx.depth || 0) >= MAX_DEPTH) return false;
    if (t.name === 'remember' && ctx.depth) return false;
    if (agent?.tools?.length && !agent.tools.includes(t.name)) return false;
    return true;
  });
}

function systemPrompt({ agent, query, ctx, tools }) {
  const persona = load('persona');
  const parts = [];
  if (agent) parts.push(`Tu es « ${agent.name} », un agent spécialisé de ${persona.name}.\n${agent.instructions}`);
  else parts.push(persona.instructions);
  parts.push(`Date du jour : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`);

  const lessons = load('lessons');
  if (lessons.length) parts.push("## Ce que ton admin t'a appris (à respecter en priorité)\n" + lessons.slice(-60).map((l) => `- ${l.text}`).join('\n'));
  const knowledge = search(load('knowledge'), query, 4);
  if (knowledge.length) parts.push('## Connaissances pertinentes de ta base\n' + knowledge.map((k) => `### ${k.title}\n${k.content}`).join('\n\n'));
  if (ctx.workspace) parts.push(describeWorkspace(ctx.workspace));

  const names = new Set(tools.map((t) => t.name));
  const rules = ['## Façon de travailler',
    "- Tu es autonome : enchaîne les outils jusqu'à ce que la tâche soit vraiment terminée, puis fais un résumé.",
    '- Cite tes sources (liens) quand tu utilises le web.'];
  if (names.has('edit_file')) rules.push('- Code : explore et lis avant de modifier ; préfère edit_file pour des changements ciblés ; vérifie ensuite (relecture, build, tests).');
  if (names.has('update_plan')) rules.push('- Pour une tâche en plusieurs étapes, affiche un plan avec update_plan et mets-le à jour au fil de l\'eau.');
  if (names.has('call_agent')) {
    const others = load('agents').filter((a) => a.id !== agent?.id);
    if (others.length) rules.push('- Agents que tu peux appeler avec call_agent :\n' + others.map((a) => `  • ${a.name} : ${a.description}`).join('\n'));
  }
  if (ctx.perm.mode === 'read') rules.push('- Mode LECTURE SEULE : tu ne peux rien modifier. Propose les changements sans les appliquer.');
  if (names.has('remember')) rules.push("- L'utilisateur est ton ADMIN. S'il te demande de retenir quelque chose, utilise remember.");
  if (!ctx.admin) rules.push("- L'utilisateur n'est pas l'admin : tu ne peux pas modifier ta mémoire ni ses projets.");
  parts.push(rules.join('\n'));
  return parts.join('\n\n');
}

// Garde la conversation dans la limite de contexte des modèles gratuits.
function compact(messages, budget = 90000) {
  let size = JSON.stringify(messages).length;
  for (let i = 1; i < messages.length - 6 && size > budget; i++) {
    const m = messages[i];
    if (m.role === 'tool' && m.content.length > 600) {
      size -= m.content.length - 300;
      m.content = m.content.slice(0, 300) + '\n…[ancien résultat raccourci]';
    }
  }
}

const brief = (args) => {
  const v = args.path || args.query || args.command || args.title || args.agent || args.name || args.url || args.message || '';
  return String(v).slice(0, 80);
};

/**
 * Lance un agent.
 * ctx : { admin, workspace, perm: { mode: 'ask'|'auto'|'read' } (partagé, modifiable en cours de route), emit(event), approve(call) => Promise<boolean>, signal, depth, agentName }
 * Retourne { content, steps }.
 */
export async function runAgent({ agent, history, ctx }) {
  const tools = availableTools({ agent, ctx });
  const query = history.filter((m) => m.role === 'user').slice(-1)[0]?.content || '';
  const messages = [{ role: 'system', content: systemPrompt({ agent, query, ctx, tools }) }, ...history];
  const temperature = agent ? 0.3 : load('persona').temperature;
  const sub = (ctx.depth || 0) > 0;
  const steps = [];
  let content = '';
  let nudged = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (ctx.signal?.aborted) break;
    compact(messages);
    let out;
    try {
      out = await streamChat({
        messages, temperature, model: agent?.model || undefined, signal: ctx.signal,
        tools: round < MAX_ROUNDS - 1 ? tools.map((t) => t.def) : null,
        onToken: sub ? null : (t) => ctx.emit({ type: 'token', text: t }),
      });
    } catch (e) {
      // Le modèle a mal formé un appel d'outil : on le prévient et on réessaie une fois.
      if (!nudged && /tool_use_failed|failed to call a function/i.test(e.message)) {
        nudged = true;
        messages.push({ role: 'user', content: "(Système) Ton dernier appel d'outil était mal formé. Réessaie avec des arguments JSON valides." });
        continue;
      }
      throw e;
    }
    content += out.content;
    if (!out.toolCalls.length) break;
    if (!sub && out.content) ctx.emit({ type: 'token', text: '\n\n' });
    messages.push({ role: 'assistant', content: out.content || null, tool_calls: out.toolCalls });

    for (const call of out.toolCalls) {
      const id = newId();
      const tool = tools.find((t) => t.name === call.function.name);
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* arguments invalides */ }
      ctx.emit({ type: 'tool', id, name: call.function.name, args, agent: ctx.agentName });
      let result;
      let ok = true;
      try {
        if (!tool) throw new Error(`Outil non disponible : ${call.function.name}`);
        if (ctx.perm.mode !== 'auto' && ['write', 'exec'].includes(tool.kind)) {
          const allowed = await ctx.approve({ name: tool.name, args, agent: ctx.agentName });
          if (!allowed) throw new Error("L'admin a refusé cette action. Ne la refais pas ; demande-lui comment il veut procéder.");
        }
        result = await tool.run(args, { ...ctx, isAdmin: ctx.admin });
      } catch (e) {
        ok = false;
        result = `Erreur : ${e.message}`;
      }
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 1);
      ctx.emit({ type: 'tool_result', id, ok, output: text.slice(0, 3000) });
      steps.push(`${call.function.name}(${brief(args)})${ok ? '' : ' ✗'}`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: text.slice(0, 15000) });
    }
  }
  return { content, steps };
}
