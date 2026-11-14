// Connexion aux modèles : plusieurs fournisseurs (API compatibles OpenAI), deux niveaux
// (⚡ rapide / 🧠 puissant) et une chaîne de secours si un fournisseur échoue ou sature.
import { load, save } from './store.js';

const clean = (u) => (u || '').replace(/\/$/, '');

/** Tous les fournisseurs : ceux de l'admin + celui du fichier .env (s'il existe). */
export function getProviders() {
  const list = [...(load('models').providers || [])];
  if (process.env.LLM_API_KEY || process.env.LLM_BASE_URL) {
    list.unshift({
      id: 'env', name: 'Fichier .env', baseUrl: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
      apiKey: process.env.LLM_API_KEY || '', model: process.env.LLM_MODEL || 'openai/gpt-oss-120b', fromEnv: true,
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
  // Pour les images, seuls le modèle vision et les secours sont essayés avant les autres.
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

// ---------- Taille maximale d'une requête ----------
// Les offres gratuites limitent le nombre de tokens par minute (ex. Groq : 8 000). Une requête plus grosse est refusée.
// On apprend la limite de chaque modèle à la première erreur, puis on reste en dessous.
const DEFAULT_BUDGET = 30000;
export function modelBudget(model) {
  const forced = Number(process.env.LLM_MAX_REQUEST_TOKENS);
  if (forced > 0) return forced;
  return load('settings').modelLimits?.[model] || DEFAULT_BUDGET;
}
export function learnLimit(model, message) {
  const st = load('settings');
  st.modelLimits ||= {};
  const current = st.modelLimits[model] || DEFAULT_BUDGET;
  const limit = Number(/limit[^0-9]{0,12}(\d{3,7})/i.exec(message)?.[1]);
  // On vise 65 % de la limite annoncée (marge pour la réponse) ; si ça ne suffit toujours pas, on réduit encore d'un quart.
  let next = limit ? Math.floor(limit * 0.65) : Math.floor(current * 0.5);
  if (next >= current) next = Math.floor(current * 0.75);
  st.modelLimits[model] = Math.max(1500, next);
  save('settings');
  return st.modelLimits[model];
}
const isTooLarge = (status, txt) => status === 413 || /request too large|reduce your message|context length|maximum context|too many tokens|context_length/i.test(txt);

async function request(p, body, signal, onWait) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${clean(p.baseUrl)}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify(body),
    });
    // Les offres gratuites limitent le débit : on attend un peu et on réessaie.
    if (![429, 502, 503].includes(res.status) || attempt >= 3) return res;
    const txt = await res.text();
    if (isTooLarge(res.status, txt)) return new Response(txt, { status: 413 }); // inutile d'attendre : il faut réduire la requête
    // Quota par minute atteint : on attend le délai indiqué (jusqu'à environ une minute).
    const wait = Math.min(Math.ceil(Number(res.headers.get('retry-after'))) || 4 * 2 ** attempt, 65);
    onWait?.(wait);
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
export async function streamChat({ messages, tools, temperature = 0.6, onToken, onModel, onWait, model, tier = 'smart', signal }) {
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
      let res = await request(p, body, signal, onWait);
      if (!res.ok && tools?.length && res.status === 400) {
        const txt = await res.text();
        // Modèle sans appels d'outils : on réessaie sans.
        if (isTooLarge(400, txt)) throw Object.assign(new Error(`${p.name} (${useModel}) : API 400 : ${txt.slice(0, 300)}`), { fatal: true, tooLarge: true, model: useModel });
        if (/tool|function/i.test(txt) && /support/i.test(txt)) res = await request(p, { ...body, tools: undefined, tool_choice: undefined }, signal, onWait);
        else throw Object.assign(new Error(`${p.name} (${useModel}) : API 400 : ${txt.slice(0, 300)}`), { fatal: /tool_use_failed|failed to call/i.test(txt) });
      }
      if (!res.ok) {
        const txt = await res.text();
        const tooLarge = isTooLarge(res.status, txt);
        // Requête trop grosse : on ne bascule pas sur un autre modèle, c'est à l'appelant de la réduire.
        throw Object.assign(new Error(`${p.name} (${useModel}) : API ${res.status} : ${txt.slice(0, 300)}`), { fatal: tooLarge, tooLarge, model: useModel, status: res.status });
      }
      onModel?.(useModel);
      return await readStream(res, (t) => { produced = true; onToken?.(t); });
    } catch (e) {
      if (signal?.aborted || e.fatal || produced) throw e; // pas de bascule au milieu d'une réponse
      lastError = e;
    }
  }
  throw lastError;
}

/** Réponse complète (sans streaming) d'un fournisseur précis : utilisé pour consulter d'autres IA. */
export async function complete(p, messages, { maxTokens = 1500 } = {}) {
  const res = await request(p, { model: p.model, messages, max_tokens: maxTokens, temperature: 0.4 }, AbortSignal.timeout(90000));
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${txt.slice(0, 150)}`);
  return JSON.parse(txt).choices?.[0]?.message?.content || '';
}

/** Petit test de connexion pour l'admin. */
export async function testProvider(p) {
  const t = Date.now();
  try {
    const res = await fetch(`${clean(p.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${String(p.apiKey || '').trim()}` },
      body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: 'Réponds uniquement : OK' }], max_tokens: 10 }),
      signal: AbortSignal.timeout(30000),
    });
    const txt = await res.text();
    // Le message indique l'adresse et le modèle réellement envoyés : on voit tout de suite une faute de saisie.
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} (adresse : ${clean(p.baseUrl)}, modèle : « ${p.model} ») : ${txt.slice(0, 300)}` };
    let reply = '';
    try { reply = JSON.parse(txt).choices?.[0]?.message?.content || ''; } catch { /* réponse inattendue */ }
    return { ok: true, ms: Date.now() - t, reply: reply.slice(0, 50) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
