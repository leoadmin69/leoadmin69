// Connexion aux modèles : plusieurs fournisseurs (API compatibles OpenAI), deux niveaux
// (⚡ rapide / 🧠 puissant) et une chaîne de secours si un fournisseur échoue ou sature.
import { load } from './store.js';

const clean = (u) => (u || '').replace(/\/$/, '');

/** Tous les fournisseurs : ceux de l'admin + celui du fichier .env (s'il existe). */
export function getProviders() {
  const list = [...(load('models').providers || [])];
  if (process.env.LLM_API_KEY || process.env.LLM_BASE_URL) {
    list.unshift({
      id: 'env', name: 'Fichier .env', baseUrl: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
      apiKey: process.env.LLM_API_KEY || '', model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile', fromEnv: true,
    });
  }
  return list;
}

/** Liste ordonnée des fournisseurs à essayer pour un niveau donné. */
export function chainFor(tier = 'smart') {
  const providers = getProviders();
  const roles = load('models').roles || {};
  const byId = (id) => providers.find((p) => p.id === id);
  const first = byId(roles[tier]) || byId(roles.smart) || byId(roles.fast) || providers[0];
  const chain = [first, ...(roles.fallbacks || []).map(byId), ...providers].filter(Boolean);
  return [...new Map(chain.map((p) => [p.id, p])).values()];
}

export const llmInfo = () => {
  const fast = chainFor('fast')[0];
  const smart = chainFor('smart')[0];
  return {
    configured: getProviders().some((p) => p.apiKey),
    model: smart?.model || '(aucun modèle)', base: smart?.baseUrl || '',
    fast: fast?.model || null, smart: smart?.model || null,
  };
};

async function request(p, body, signal) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${clean(p.baseUrl)}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify(body),
    });
    // Les offres gratuites limitent le débit : on attend un peu et on réessaie.
    if (![429, 502, 503].includes(res.status) || attempt >= 2) return res;
    const wait = Math.min(Number(res.headers.get('retry-after')) || 3 * 2 ** attempt, 20);
    await res.text();
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

async function readStream(res, onToken) {
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  const calls = [];
  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      const d = j.choices?.[0]?.delta;
      if (!d) continue;
      if (d.content) { content += d.content; onToken?.(d.content); }
      for (const tc of d.tool_calls || []) {
        const i = tc.index ?? calls.length;
        calls[i] ||= { id: tc.id || `call_${i}`, type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
      }
    }
  }
  return { content, toolCalls: calls.filter(Boolean) };
}

/**
 * Envoie la conversation au modèle en streaming, avec bascule automatique sur les fournisseurs de secours.
 * tier : 'fast' | 'smart'. model : force un nom de modèle (agents) sur le fournisseur principal.
 * onModel(name) est appelé avec le modèle qui répond réellement.
 */
export async function streamChat({ messages, tools, temperature = 0.6, onToken, onModel, model, tier = 'smart', signal }) {
  const chain = chainFor(tier);
  if (!chain.length) throw new Error('Aucun modèle configuré. Ajoute une clé API dans Admin → Modèles (ou dans le fichier .env).');
  let lastError;
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    const useModel = i === 0 && model ? model : p.model;
    const body = { model: useModel, messages, temperature, stream: true };
    if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
    let produced = false;
    try {
      let res = await request(p, body, signal);
      if (!res.ok && tools?.length && res.status === 400) {
        const txt = await res.text();
        // Modèle sans appels d'outils : on réessaie sans.
        if (/tool|function/i.test(txt) && /support/i.test(txt)) res = await request(p, { ...body, tools: undefined, tool_choice: undefined }, signal);
        else throw Object.assign(new Error(`${p.name} (${useModel}) : API 400 : ${txt.slice(0, 300)}`), { fatal: /tool_use_failed|failed to call/i.test(txt) });
      }
      if (!res.ok) throw new Error(`${p.name} (${useModel}) : API ${res.status} : ${(await res.text()).slice(0, 300)}`);
      onModel?.(useModel);
      return await readStream(res, (t) => { produced = true; onToken?.(t); });
    } catch (e) {
      if (signal?.aborted || e.fatal || produced) throw e; // pas de bascule au milieu d'une réponse
      lastError = e;
    }
  }
  throw lastError;
}

/** Petit test de connexion pour l'admin. */
export async function testProvider(p) {
  const t = Date.now();
  try {
    const res = await fetch(`${clean(p.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: 'Réponds uniquement : OK' }], max_tokens: 10 }),
      signal: AbortSignal.timeout(30000),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} : ${txt.slice(0, 300)}` };
    let reply = '';
    try { reply = JSON.parse(txt).choices?.[0]?.message?.content || ''; } catch { /* réponse inattendue */ }
    return { ok: true, ms: Date.now() - t, reply: reply.slice(0, 50) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
