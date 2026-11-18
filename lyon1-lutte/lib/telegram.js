// Chaîne Telegram remplie automatiquement : gratuit, sans limite d'abonné·es.
// Configuration :
//   TELEGRAM_BOT_TOKEN : donné par @BotFather quand on crée le bot
//   TELEGRAM_CHAT_ID   : @nom_de_la_chaine (chaîne publique) ou -100… (chaîne privée) ; le bot doit y être administrateur
//                        (un lien https://t.me/nom_de_la_chaine ou « nom_de_la_chaine » sont aussi acceptés)
//   TELEGRAM_URL       : lien public pour rejoindre la chaîne (https://t.me/…), affiché sur le site
// L'admin voit l'état de la chaîne et peut envoyer un test depuis l'espace modo (onglet 📍 Sites).
import { SITE_URL } from './mail.js';

const BASE = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const TOKEN = () => (process.env.TELEGRAM_BOT_TOKEN || '').trim();

// Accepte « @chaine », « chaine », « https://t.me/chaine », « t.me/chaine » ou un identifiant numérique (-100…)
export function normalizeChat(v) {
  let id = String(v || '').trim();
  if (!id) return '';
  const m = id.match(/^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/(?:s\/)?([A-Za-z0-9_]{4,})\/?$/);
  if (m) return `@${m[1]}`;
  if (/^-?\d+$/.test(id)) return id;
  if (!id.startsWith('@') && /^[A-Za-z][A-Za-z0-9_]{3,}$/.test(id)) return `@${id}`;
  return id;
}
const MAIN_CHAT = () => normalizeChat(process.env.TELEGRAM_CHAT_ID);

export const telegramEnabled = () => !!(TOKEN() && MAIN_CHAT());
export const telegramUrl = () => {
  if (process.env.TELEGRAM_URL) return process.env.TELEGRAM_URL;
  const id = MAIN_CHAT();
  return id.startsWith('@') ? `https://t.me/${id.slice(1)}` : '';
};
export const tgEsc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Dernier envoi réussi / dernière erreur, visibles par l'admin
const status = { sent: 0, lastOkAt: null, lastError: null, lastErrorAt: null, lastErrorChat: null };
export const telegramStatus = () => ({ ...status, queued: queue.length });

async function call(method, body) {
  const res = await fetch(`${BASE()}/bot${TOKEN()}/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

// Explications en clair des erreurs les plus fréquentes
export function explain(desc = '', code = 0) {
  const d = String(desc).toLowerCase();
  if (code === 401 || d.includes('unauthorized')) return 'Jeton du bot invalide : recopie TELEGRAM_BOT_TOKEN depuis @BotFather (commande /token).';
  if (d.includes('chat not found')) return 'Chaîne introuvable : vérifie TELEGRAM_CHAT_ID (@nom_de_la_chaine ou -100…) et que le bot a bien été ajouté à la chaîne.';
  if (d.includes('not a member') || d.includes('bot was kicked')) return 'Le bot n’est pas dans la chaîne : ajoute-le comme administrateur de la chaîne.';
  if (d.includes('not enough rights') || d.includes('need administrator rights') || d.includes('have no rights')) return 'Le bot n’a pas le droit de publier : dans la chaîne, rends-le administrateur avec « Publier des messages ».';
  if (d.includes("can't parse entities")) return 'Message mal formé (balise) : signale-le, ce message précis n’a pas pu partir.';
  if (d.includes('fetch failed') || d.includes('timeout') || d.includes('network')) return 'Serveur Telegram injoignable depuis l’hébergeur (réessaie plus tard).';
  return desc || 'Erreur inconnue';
}

// File d'attente : un message à la fois, en respectant les pauses demandées par Telegram (erreur 429).
const queue = [];
let running = false;
async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { html, url, chat, tries } = queue.shift();
    try {
      const body = { chat_id: chat, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(url ? { reply_markup: { inline_keyboard: [[{ text: 'Voir en direct', url }]] } } : {}) };
      let data = await call('sendMessage', body);
      if (data.status === 429 && tries < 3) {
        queue.unshift({ html, url, chat, tries: tries + 1 });
        await new Promise((r) => setTimeout(r, ((data.parameters?.retry_after || 5) + 1) * 1000));
        continue;
      }
      // Bouton refusé (adresse du site invalide) : on renvoie sans bouton plutôt que de perdre le message
      if (!data.ok && url && /button|url/i.test(data.description || '')) data = await call('sendMessage', { ...body, reply_markup: undefined });
      if (data.ok) { status.sent++; status.lastOkAt = new Date().toISOString(); }
      else {
        status.lastError = explain(data.description, data.status); status.lastErrorAt = new Date().toISOString(); status.lastErrorChat = chat;
        console.error('[telegram]', data.status, data.description || '', '→', chat);
      }
    } catch (e) {
      status.lastError = explain(e.message); status.lastErrorAt = new Date().toISOString(); status.lastErrorChat = chat;
      console.error('[telegram]', e.message);
    }
    await new Promise((r) => setTimeout(r, 1100)); // Telegram : environ 1 message par seconde dans une chaîne
  }
  running = false;
}

// html : texte déjà mis en forme (balises <b>, <i>) ; path : page du site à ouvrir (ex. '/#/batiments')
// chatId : chaîne propre à un site (sinon la chaîne principale TELEGRAM_CHAT_ID)
export function postTelegram(html, path = '/', chatId = null) {
  if (!telegramEnabled()) return;
  const site = SITE_URL();
  // Telegram refuse les boutons vers des adresses locales (http://localhost) : on n'en met que si le site est en https.
  const url = site.startsWith('https://') ? `${site}${path}` : null;
  queue.push({ html: String(html).slice(0, 4000), url, chat: normalizeChat(chatId) || MAIN_CHAT(), tries: 0 });
  run();
}

// Diagnostic complet pour l'admin : jeton, chaîne, droits du bot.
export async function telegramCheck(chats = []) {
  const out = { configured: { token: !!TOKEN(), chat: !!MAIN_CHAT() }, mainChat: MAIN_CHAT(), url: telegramUrl(), status: telegramStatus(), bot: null, chats: [] };
  if (!TOKEN()) { out.problem = 'TELEGRAM_BOT_TOKEN n’est pas renseigné dans les variables d’environnement de l’hébergeur (Render → Environment).'; return out; }
  let me;
  try { me = await call('getMe'); } catch (e) { out.problem = explain(e.message); return out; }
  if (!me.ok) { out.problem = explain(me.description, me.status); return out; }
  out.bot = { username: me.result.username, name: me.result.first_name };
  if (!MAIN_CHAT()) out.problem = 'TELEGRAM_CHAT_ID n’est pas renseigné (Render → Environment) : mets @nom_de_ta_chaine.';
  const list = [...new Set([MAIN_CHAT(), ...chats.map(normalizeChat)].filter(Boolean))];
  for (const chat of list) {
    const c = { chat, ok: false };
    try {
      const info = await call('getChat', { chat_id: chat });
      if (!info.ok) { c.problem = explain(info.description, info.status); out.chats.push(c); continue; }
      c.title = info.result.title || info.result.username || chat;
      c.type = info.result.type;
      const mem = await call('getChatMember', { chat_id: chat, user_id: me.result.id });
      const st = mem.result?.status;
      c.botStatus = st;
      if (st === 'creator' || (st === 'administrator' && (info.result.type !== 'channel' || mem.result.can_post_messages))) c.ok = true;
      else if (st === 'administrator') c.problem = 'Le bot est administrateur mais sans le droit « Publier des messages » : active-le dans les réglages de la chaîne.';
      else if (info.result.type === 'channel') c.problem = 'Le bot n’est pas administrateur de la chaîne : Chaîne → Administrateurs → Ajouter → @' + me.result.username + ' avec « Publier des messages ».';
      else if (st === 'member') c.ok = true; // groupe : un membre peut écrire
      else c.problem = 'Le bot n’est pas dans ce groupe / cette chaîne.';
    } catch (e) { c.problem = explain(e.message); }
    out.chats.push(c);
  }
  return out;
}

// Message de test immédiat (hors file d'attente) pour vérifier une chaîne
export async function telegramTest(chatId) {
  if (!TOKEN()) return { ok: false, error: 'TELEGRAM_BOT_TOKEN manquant.' };
  const chat = normalizeChat(chatId) || MAIN_CHAT();
  if (!chat) return { ok: false, error: 'TELEGRAM_CHAT_ID manquant.' };
  try {
    const r = await call('sendMessage', { chat_id: chat, text: '✅ <b>Test · Lyon 1 · La Doua en lutte</b>\nLa chaîne est bien reliée au site : les infos arriveront ici automatiquement.', parse_mode: 'HTML' });
    if (r.ok) { status.sent++; status.lastOkAt = new Date().toISOString(); return { ok: true, chat }; }
    const error = explain(r.description, r.status);
    status.lastError = error; status.lastErrorAt = new Date().toISOString(); status.lastErrorChat = chat;
    return { ok: false, chat, error };
  } catch (e) { return { ok: false, chat, error: explain(e.message) }; }
}
