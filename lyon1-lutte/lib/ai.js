// Comptes rendus d'AG : le PDF est lu par Claude, qui le transforme en flash infos courts.
// Sans clé API, une extraction locale (pdf.js + règles simples) prend le relais.
import Anthropic from '@anthropic-ai/sdk';

export const aiEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
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

export async function analyzeWithClaude(pdf, onEvent) {
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
