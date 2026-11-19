// Comptes rendus d'AG : le PDF est transformé en flash infos courts par une IA.
// Priorité aux IA GRATUITES, essayées dans l'ordre ; si l'une échoue (quota, panne), la suivante prend le relais :
//   1. Google Gemini (gratuit, clé sur aistudio.google.com) : lit le PDF entier, y compris les scans et l'écriture manuscrite.
//   2. Groq (gratuit, clé sur console.groq.com) : très rapide, lit le texte extrait du PDF (pas les scans).
//   3. Claude (payant, facultatif).
//   4. Extraction locale sans IA (toujours disponible).
// Ordre modifiable avec AI_PROVIDERS=gemini,groq,anthropic
import Anthropic from '@anthropic-ai/sdk';

const has = {
  openrouter: () => !!process.env.OPENROUTER_API_KEY,
  gemini: () => !!process.env.GEMINI_API_KEY,
  groq: () => !!process.env.GROQ_API_KEY,
  anthropic: () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
};
// OpenRouter (si sa clé est là) passe en premier ; les autres restent en secours, dans l'ordre d'AI_PROVIDERS
const order = () => {
  const list = (process.env.AI_PROVIDERS || 'openrouter,gemini,groq,anthropic').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.includes('openrouter')) list.unshift('openrouter');
  return [...new Set(list)].filter((p) => has[p]?.());
};
export const aiEnabled = () => order().length > 0;
export const aiProviders = () => order().map((p) => ({ openrouter: `OpenRouter (${OPENROUTER_MODEL()})`, gemini: 'Gemini (gratuit)', groq: 'Groq (gratuit)', anthropic: 'Claude' }[p]));
// OpenRouter : une seule clé pour de nombreux modèles (OPENROUTER_MODEL, ex. google/gemini-2.5-flash ou un modèle « :free »)
const OPENROUTER_BASE = () => (process.env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const OPENROUTER_MODEL = () => (process.env.OPENROUTER_MODEL || 'openrouter/auto').trim();
// Modèle pour les images (stories, captures) : celui choisi peut ne lire que du texte
const OPENROUTER_VISION_MODEL = () => (process.env.OPENROUTER_VISION_MODEL || 'google/gemma-4-31b-it:free').trim();
async function openRouterChat(messages, { maxTokens = 6000, json = true, model = OPENROUTER_MODEL() } = {}) {
  const res = await fetch(`${OPENROUTER_BASE()}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'X-Title': 'Lyon 1 · La Doua au courant' },
    body: JSON.stringify({ model, temperature: 0.1, max_tokens: maxTokens, messages, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!res.ok) throw await httpError(res, 'OpenRouter');
  const j = await res.json();
  if (j.error) { const e = new Error(`OpenRouter : ${j.error.message || 'erreur'}`); e.status = j.error.code; throw e; }
  return j.choices?.[0]?.message?.content || '';
}
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const str = { type: 'string' };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titre', 'date', 'lieu', 'participants', 'resume', 'flashs', 'votes', 'rdv', 'batiments_bloques', 'revendications'],
  properties: {
    titre: str,
    date: { type: 'string', description: 'AAAA-MM-JJ, ou vide si inconnue' },
    lieu: str,
    participants: { type: 'string', description: 'Nombre ou estimation, vide si inconnu' },
    resume: { type: 'string', description: '2 phrases maximum' },
    flashs: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'titre', 'texte'],
        properties: { type: { type: 'string', enum: ['decision', 'vote', 'info', 'action', 'alerte'] }, titre: str, texte: str },
      },
    },
    votes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['question', 'pour', 'contre', 'abstention', 'resultat'],
        properties: { question: str, pour: str, contre: str, abstention: str, resultat: { type: 'string', enum: ['adopte', 'rejete', 'inconnu'] } },
      },
    },
    rdv: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'titre', 'date', 'heure', 'lieu'],
        properties: { type: { type: 'string', enum: ['AG', 'manif', 'rassemblement', 'action', 'autre'] }, titre: str, date: { type: 'string', description: 'AAAA-MM-JJ ou vide' }, heure: { type: 'string', description: 'HH:MM ou vide' }, lieu: str },
      },
    },
    batiments_bloques: { type: 'array', items: str },
    revendications: { type: 'array', items: str },
  },
};

const SYSTEM = `Tu es l'outil de mise en forme d'une plateforme d'information étudiante de l'Université Lyon 1, utilisée pendant une mobilisation (blocus, AG, manifestations).
On te donne le compte rendu d'une assemblée générale (PDF, parfois scanné ou manuscrit).
Ton travail : le transformer en « flash infos » très courts, lisibles en quelques secondes sur un téléphone.

Règles :
- Fidélité absolue : n'invente rien, ne complète rien. Si une information manque, mets une chaîne vide ou une liste vide.
- Neutralité : rapporte ce qui a été dit et voté, sans commentaire ni jugement.
- Protection des personnes : n'écris AUCUN nom de famille ni nom complet d'étudiant·e ou de personnel. Remplace par le rôle (« un·e étudiant·e de L2 », « la tribune », « un·e représentant·e syndical·e »). Seuls les noms d'organisations (syndicats, collectifs, université) restent.
- Flashs : 3 à 10 éléments, titre de 6 mots maximum, texte d'une ou deux phrases courtes. Commence par les décisions et votes, puis les actions à venir, puis le reste.
- Mets type "alerte" pour ce qui concerne la sécurité, la répression, une fermeture administrative ou un changement urgent.
- rdv : uniquement les prochains rendez-vous explicitement annoncés (AG, manifs, rassemblements, actions), avec date AAAA-MM-JJ si elle est déductible du document.
- batiments_bloques : uniquement les bâtiments explicitement dits bloqués ou à bloquer.
- revendications : formulées en une phrase courte chacune.
- Tout en français.`;

// ---------- Lecture d'un flux SSE (Gemini et Groq) ----------
async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch {}
    }
  }
}
async function httpError(res, who) {
  const body = await res.text().catch(() => '');
  const e = new Error(`${who} HTTP ${res.status} : ${body.slice(0, 200)}`);
  e.status = res.status;
  return e;
}
function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error('Réponse de l’IA illisible.');
}

// ---------- Choix automatique du meilleur modèle gratuit disponible ----------
const modelCache = {};
async function pickModel(key, fetchList, choose, fallback) {
  const c = modelCache[key];
  if (c && Date.now() - c.at < 6 * 3600e3) return c.model;
  let model = fallback;
  try { model = choose(await fetchList()) || fallback; } catch (e) { console.warn(`[ia] liste des modèles ${key} indisponible : ${e.message}`); }
  modelCache[key] = { model, at: Date.now() };
  return model;
}
const version = (s) => (s.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1] * 1;

// Gemini : le modèle RAPIDE le plus récent et stable (gratuit, lit les PDF).
// Google renomme ses gammes : « flash » jusqu'à Gemini 3.8, « hydrogen » depuis Gemini 4 (nov. 2026).
// Les gros modèles (« pro », « carbon », « argon ») sont exclus : plus lents et sans quota gratuit généreux.
const FAST = /^gemini-[\d.]+-(flash|hydrogen)(-[\w.-]+)?$/;
const EXCLUDE = /lite|image|tts|audio|live|thinking|embedding|8b|native|robotics|computer/;
const GEMINI_BASE = () => (process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
async function geminiModel(refresh = false) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (refresh) delete modelCache.gemini;
  return pickModel('gemini', async () => {
    const r = await fetch(`${GEMINI_BASE()}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw await httpError(r, 'Gemini');
    return (await r.json()).models || [];
  }, (models) => {
    const ok = models.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => FAST.test(n) && !EXCLUDE.test(n));
    ok.sort((a, b) => (/preview|exp/.test(a) - /preview|exp/.test(b)) || version(b) - version(a) || a.length - b.length);
    return ok[0];
  }, 'gemini-4-hydrogen');
}
// Le format de schéma de Gemini : types en majuscules, pas d'additionalProperties.
function geminiSchema(s) {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties') continue;
    out[k] = k === 'type' ? String(v).toUpperCase() : (k === 'properties' ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)])) : geminiSchema(v));
  }
  return out;
}
async function analyzeWithGemini(pdf, onEvent, retried = false) {
  const model = await geminiModel(retried);
  onEvent({ t: 'log', m: `IA : Google ${model} (gratuit) lit le PDF…` });
  const res = await fetch(`${GEMINI_BASE()}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } }, { text: 'Voici le compte rendu. Produis le JSON des flash infos.' }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(SCHEMA), temperature: 0.2, maxOutputTokens: 32768 },
    }),
  });
  // Modèle retiré ou renommé par Google : on relit la liste des modèles et on réessaie une fois.
  if (res.status === 404 && !retried && !process.env.GEMINI_MODEL) {
    await res.text().catch(() => {});
    onEvent({ t: 'log', m: `Le modèle ${model} n'existe plus, recherche du nouveau nom…` });
    return analyzeWithGemini(pdf, onEvent, true);
  }
  if (!res.ok) throw await httpError(res, 'Gemini');
  let text = '';
  let finish = '';
  for await (const chunk of sse(res)) {
    const cand = chunk.candidates?.[0];
    const d = (cand?.content?.parts || []).map((p) => p.text || '').join('');
    if (d) { text += d; onEvent({ t: 'delta', d }); }
    if (cand?.finishReason) finish = cand.finishReason;
    if (chunk.promptFeedback?.blockReason) throw new Error(`Gemini a bloqué le document (${chunk.promptFeedback.blockReason}).`);
  }
  if (finish && !['STOP', 'MAX_TOKENS'].includes(finish)) throw new Error(`Gemini s'est arrêté (${finish}).`);
  return parseJson(text);
}

// Groq : modèle ouvert le plus capable disponible (gratuit, très rapide). Lit le texte du PDF.
const GROQ_BASE = () => (process.env.GROQ_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
async function groqModel() {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  return pickModel('groq', async () => {
    const r = await fetch(`${GROQ_BASE()}/models`, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw await httpError(r, 'Groq');
    return ((await r.json()).data || []).filter((m) => m.active !== false).map((m) => m.id);
  }, (ids) => {
    const prefs = [/gpt-oss-120b/, /llama-4-maverick/, /llama-3\.3-70b-versatile/, /qwen.*32b/, /llama-4-scout/, /gpt-oss-20b/, /llama-3\.1-8b/];
    for (const re of prefs) { const hit = ids.find((id) => re.test(id)); if (hit) return hit; }
    return null;
  }, 'llama-3.3-70b-versatile');
}
async function analyzeWithGroq(pdf, onEvent) {
  const lines = await extractPdfText(pdf);
  if (lines.join('').length < 80) throw new Error('PDF sans texte (scan) : Groq ne peut pas le lire.');
  let text = lines.join('\n');
  // Le palier gratuit limite le nombre de mots par minute : on garde l'essentiel d'un long compte rendu.
  const max = Number(process.env.GROQ_MAX_CHARS || 24000);
  if (text.length > max) { text = text.slice(0, max); onEvent({ t: 'log', m: `Compte rendu long : seuls les ${max} premiers caractères sont lus.` }); }
  const model = await groqModel();
  onEvent({ t: 'log', m: `IA : ${model} via Groq (gratuit), ${lines.length} lignes…` });
  const res = await fetch(`${GROQ_BASE()}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.2,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nRéponds UNIQUEMENT avec un objet JSON qui respecte exactement ce schéma JSON :\n${JSON.stringify(SCHEMA)}` },
        { role: 'user', content: `Compte rendu :\n"""\n${text}\n"""` },
      ],
    }),
  });
  if (!res.ok) throw await httpError(res, 'Groq');
  let out = '';
  for await (const chunk of sse(res)) {
    const d = chunk.choices?.[0]?.delta?.content || '';
    if (d) { out += d; onEvent({ t: 'delta', d }); }
  }
  return parseJson(out);
}

const INSTAGRAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['buildings', 'events', 'flashes'],
  properties: {
    buildings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'status', 'note', 'confidence', 'evidence'],
        properties: {
          name: str,
          status: { type: 'string', enum: ['bloque', 'partiel', 'ouvert', 'inconnu'] },
          note: str,
          confidence: { type: 'number' },
          evidence: str,
        },
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'title', 'date', 'place', 'description', 'confidence', 'evidence'],
        properties: {
          type: { type: 'string', enum: ['AG', 'manif', 'rassemblement', 'action', 'autre'] },
          title: str,
          date: str,
          place: str,
          description: str,
          confidence: { type: 'number' },
          evidence: str,
        },
      },
    },
    flashes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text', 'tone', 'confidence', 'evidence'],
        properties: {
          title: str,
          text: str,
          tone: { type: 'string', enum: ['info', 'warn', 'alert', 'ok'] },
          confidence: { type: 'number' },
          evidence: str,
        },
      },
    },
  },
};

const INSTAGRAM_SYSTEM = `Tu aides un site d'information étudiante (Lyon 1) à suivre la situation sur le campus à partir
de messages et de stories Instagram publics d'un compte de la mobilisation.
DÉDUIS ce que tu vois, lis ou détectes, même si ce n'est pas écrit mot pour mot :
- texte, légendes, affiches, banderoles, captures d'écran, horaires écrits sur une photo ;
- indices visuels : chaînes, barricades, tables ou poubelles devant une porte, piquet de personnes devant une entrée,
  portes fermées avec affiche « bloqué », foule en AG dans un amphi, cortège dans la rue ;
- dates relatives (« aujourd'hui », « demain », « lundi », « ce midi ») à convertir avec la date courante donnée ;
- noms de bâtiments écrits autrement (abréviation, faute, surnom) : rends le nom EXACT de la liste des bâtiments connus,
  ou laisse vide si tu ne peux pas le relier sans hésiter.
Pour CHAQUE élément, donne :
- confidence : de 0 à 1. 0,9 ou plus = écrit clairement ou visible sans doute possible ; 0,6 à 0,8 = déduit d'indices
  solides ; moins de 0,5 = simple supposition (dans ce cas, ne le mets pas).
- evidence : en une phrase courte, ce qui te fait dire ça (« photo de chaînes sur la porte de Thémis, légende "on tient" »).
Interdit : nom ou visage identifiable d'une personne, donnée personnelle, rumeur sans indice, appel à la violence.
Dates au format ISO AAAA-MM-JJTHH:mm:ss.000Z si l'heure est connue, sinon AAAA-MM-JJ.
Tout en français. Réponds uniquement avec le JSON demandé.`;

async function instagramWithGemini(text, context = '') {
  const model = await geminiModel();
  const res = await fetch(`${GEMINI_BASE()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTAGRAM_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `${context || `Date courante : ${new Date().toISOString()}.`}\nMessages récents du canal :\n"""\n${text.slice(0, 30000)}\n"""` }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(INSTAGRAM_SCHEMA), temperature: 0.1, maxOutputTokens: 12000 },
    }),
  });
  if (!res.ok) throw await httpError(res, 'Gemini Instagram');
  const j = await res.json();
  return parseJson((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
}

async function instagramWithGroq(text, context = '') {
  const model = await groqModel();
  const res = await fetch(`${GROQ_BASE()}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${INSTAGRAM_SYSTEM}\n\nSchéma JSON exact :\n${JSON.stringify(INSTAGRAM_SCHEMA)}` },
        { role: 'user', content: `${context || `Date courante : ${new Date().toISOString()}.`}\n${text.slice(0, 30000)}` },
      ],
    }),
  });
  if (!res.ok) throw await httpError(res, 'Groq Instagram');
  const j = await res.json();
  return parseJson(j.choices?.[0]?.message?.content || '');
}

async function instagramLocally(text) {
  const data = { buildings: [], events: [], flashes: [] };
  const reBuildings = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{1,60})\s+(bloqué|bloquée|bloqués|bloquées|partiel|partielle|rouvert|réouvert|ouverts|ouvertes)/gi;
  for (const m of text.matchAll(reBuildings)) {
    const name = m[1].trim().replace(/^(le |la |les |bâtiment |batiment )/i, '').slice(0, 80);
    const word = m[2].toLowerCase();
    const status = /bloqu/.test(word) ? 'bloque' : /partiel/.test(word) ? 'partiel' : 'ouvert';
    if (!data.buildings.some((b) => b.name.toLowerCase() === name.toLowerCase())) data.buildings.push({ name, status, note: '' });
  }
  if (/AG|assemblée générale|rassemblement|manif/.test(text)) {
    data.flashes.push({ title: 'Mobilisation à venir', text: text.slice(0, 220).trim(), tone: 'info' });
  }
  return data;
}

async function instagramWithOpenRouter(text, context = '') {
  const out = await openRouterChat([
    { role: 'system', content: `${INSTAGRAM_SYSTEM}\n\nSchéma JSON exact :\n${JSON.stringify(INSTAGRAM_SCHEMA)}` },
    { role: 'user', content: `${context || `Date courante : ${new Date().toISOString()}.`}\n${text.slice(0, 30000)}` },
  ]);
  return parseJson(out);
}

export async function analyzeInstagramText(text, context = '') {
  for (const p of order()) {
    try {
      const data = p === 'openrouter' ? await instagramWithOpenRouter(text, context) : p === 'gemini' ? await instagramWithGemini(text, context) : p === 'groq' ? await instagramWithGroq(text, context) : null;
      if (data) return { data, source: p };
    } catch (e) {
      console.error(`[ia] Instagram ${p}:`, e.message);
    }
  }
  return { data: await instagramLocally(text), source: 'local' };
}

export async function analyzeInstagramStoryImage(imageUrl, context = '') {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) throw new Error('Une clé IA qui lit les images (OpenRouter ou Gemini) est nécessaire.');
  const ir = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
      ...(process.env.INSTAGRAM_STORIES_COOKIES ? { Cookie: process.env.INSTAGRAM_STORIES_COOKIES } : {}),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!ir.ok) throw new Error(`Image Instagram HTTP ${ir.status}`);
  const mime = ir.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error(`Format de story non pris en charge : ${mime}`);
  const bytes = Buffer.from(await ir.arrayBuffer());
  return analyzeInstagramImageBytes(bytes, mime, context);
}

// Image déjà en main (capture d'écran envoyée par un·e admin, ou story téléchargée)
export async function analyzeInstagramImageBytes(bytes, mime, context = '') {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const out = await openRouterChat([
        { role: 'system', content: `${INSTAGRAM_SYSTEM}\n\nSchéma JSON exact :\n${JSON.stringify(INSTAGRAM_SCHEMA)}` },
        { role: 'user', content: [
          { type: 'text', text: `${context}\nRegarde cette image (story ou capture Instagram) : déduis l'état des bâtiments (chaînes, barricades, piquets, affiches…), les AG, manifs, rassemblements, actions, horaires, lieux et infos urgentes. Pour chaque élément, donne confidence et evidence. Réponds en JSON.` },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } },
        ] },
      ], { model: OPENROUTER_VISION_MODEL() });
      return parseJson(out);
    } catch (e) {
      console.error('[ia] OpenRouter image :', e.message);
      if (!process.env.GEMINI_API_KEY) throw new Error(`OpenRouter n’a pas pu lire l’image (${e.message.slice(0, 120)}). Choisis un modèle qui lit les images dans OPENROUTER_MODEL.`);
    }
  }
  if (!process.env.GEMINI_API_KEY) throw new Error('Une clé IA qui lit les images (OpenRouter ou Gemini) est nécessaire.');
  if (bytes.length > 12e6) throw new Error('Story trop volumineuse.');
  const model = await geminiModel();
  const res = await fetch(`${GEMINI_BASE()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTAGRAM_SYSTEM }] },
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: mime, data: bytes.toString('base64') } },
        { text: `${context}\nRegarde cette story : déduis l'état des bâtiments (chaînes, barricades, piquets, affiches…), les AG, manifs, rassemblements, actions, horaires, lieux et infos urgentes. Pour chaque élément, donne confidence et evidence. Réponds en JSON.` },
      ] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(INSTAGRAM_SCHEMA), temperature: 0.1, maxOutputTokens: 12000 },
    }),
  });
  if (!res.ok) throw await httpError(res, 'Gemini Story');
  const j = await res.json();
  return parseJson((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
}

// Essaie chaque IA disponible dans l'ordre ; renvoie { data, source }.
async function analyzeWithOpenRouter(pdf, onEvent) {
  const lines = await extractPdfText(pdf);
  if (lines.join('').length < 80) throw new Error('PDF sans texte (scan) : OpenRouter lit le texte du PDF, pas les scans.');
  const text = lines.join('\n').slice(0, Number(process.env.OPENROUTER_MAX_CHARS || 60000));
  onEvent({ t: 'log', m: `IA : ${OPENROUTER_MODEL()} via OpenRouter, ${lines.length} lignes…` });
  const out = await openRouterChat([
    { role: 'system', content: `${SYSTEM}\n\nRéponds UNIQUEMENT avec un objet JSON qui respecte exactement ce schéma JSON :\n${JSON.stringify(SCHEMA)}` },
    { role: 'user', content: `Compte rendu :\n\"\"\"\n${text}\n\"\"\"` },
  ], { maxTokens: 8000 });
  onEvent({ t: 'delta', d: out });
  return parseJson(out);
}

export async function analyzePdf(pdf, onEvent) {
  const run = { openrouter: analyzeWithOpenRouter, gemini: analyzeWithGemini, groq: analyzeWithGroq, anthropic: analyzeWithClaude };
  for (const p of order()) {
    try {
      const data = await run[p](pdf, onEvent);
      return { data, source: p };
    } catch (e) {
      console.error(`[ia] ${p} :`, e.message);
      const why = e.status === 429 ? 'quota gratuit atteint pour le moment' : e.status === 401 || e.status === 403 ? 'clé refusée' : e.message.slice(0, 120);
      onEvent({ t: 'log', m: `⚠ ${p} indisponible (${why}). On passe au suivant…` });
    }
  }
  onEvent({ t: 'log', m: 'Extraction locale sans IA…' });
  const lines = await extractPdfText(pdf);
  if (!lines.length) throw new Error('Aucun texte trouvé (PDF scanné ?). Ajoute une clé Gemini gratuite pour lire les scans.');
  onEvent({ t: 'log', m: `${lines.length} lignes extraites. Repérage des votes, décisions, rendez-vous…` });
  return { data: analyzeLocally(lines), source: 'local' };
}

export async function analyzeWithClaude(pdf, onEvent) {
  onEvent({ t: 'log', m: 'IA : Claude lit le PDF…' });
  const client = new Anthropic();
  const params = {
    model: MODEL(),
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
        { type: 'text', text: 'Voici le compte rendu. Produis le JSON des flash infos.' },
      ],
    }],
  };
  const run = async (extra) => {
    const stream = client.beta.messages.stream({ ...params, ...extra });
    stream.on('text', (d) => onEvent({ t: 'delta', d }));
    return stream.finalMessage();
  };
  let msg;
  try {
    // Si le modèle principal décline, l'API relance la même requête sur un modèle de secours.
    msg = await run({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) {
      onEvent({ t: 'log', m: 'Nouvel essai sans modèle de secours…' });
      msg = await run({});
    } else throw e;
  }
  if (msg.stop_reason === 'refusal') throw new Error("L'IA a refusé de traiter ce document.");
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse trop longue, document à découper.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

// ---------- Mode sans IA : extraction de texte + règles simples ----------
export async function extractPdfText(pdf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: true }).promise;
  const lines = [];
  for (let p = 1; p <= Math.min(doc.numPages, 80); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let current = '';
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { if (current.trim()) lines.push(current.trim()); current = ''; }
      current += item.str + (item.hasEOL ? '\n' : '');
      lastY = y;
    }
    if (current.trim()) lines.push(current.trim());
  }
  return lines.flatMap((l) => l.split('\n')).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
export function analyzeLocally(lines) {
  const text = lines.join('\n');
  const used = new Set();
  const pick = (re, n = 6) => { const out = lines.filter((l) => re.test(l) && !used.has(l)).slice(0, n); out.forEach((l) => used.add(l)); return out; };
  const flashs = [];
  for (const l of pick(/(vot|adopt|rejet|majorit|unanim)/i, 5)) flashs.push({ type: 'vote', titre: 'Vote', texte: cut(l, 220) });
  for (const l of pick(/(décid|decid|acté|mandat|on reconduit|reconduction)/i, 4)) flashs.push({ type: 'decision', titre: 'Décision', texte: cut(l, 220) });
  for (const l of pick(/(manif|rassemblement|rdv|rendez-vous|prochaine ag|départ)/i, 4)) flashs.push({ type: 'action', titre: 'À venir', texte: cut(l, 220) });
  for (const l of pick(/(police|crs|répression|repression|fermeture|interdit|urgence|sécurité)/i, 3)) flashs.push({ type: 'alerte', titre: 'Attention', texte: cut(l, 220) });
  if (!flashs.length) for (const l of lines.filter((x) => x.length > 40).slice(0, 5)) flashs.push({ type: 'info', titre: 'Info', texte: cut(l, 220) });
  const dateMatch = text.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/);
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : '';
  return {
    titre: cut(lines[0] || "Compte rendu d'AG", 90),
    date,
    lieu: '',
    participants: (text.match(/(\d{2,5})\s*(personnes|participant|étudiant)/i) || [])[1] || '',
    resume: 'Résumé automatique sans IA : vérifie et corrige avant de publier.',
    flashs: flashs.slice(0, 10),
    votes: [],
    rdv: [],
    batiments_bloques: [],
    revendications: pick(/(revendi|exige|demand|retrait|abrogation)/i, 8).map((l) => cut(l, 160)),
  };
}
