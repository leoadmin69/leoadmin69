// Chaîne Telegram remplie automatiquement : gratuit, sans limite d'abonné·es.
// Configuration :
//   TELEGRAM_BOT_TOKEN : donné par @BotFather quand on crée le bot
//   TELEGRAM_CHAT_ID   : @nom_de_la_chaine (chaîne publique) ou -100… (chaîne privée) ; le bot doit y être administrateur
//   TELEGRAM_URL       : lien public pour rejoindre la chaîne (https://t.me/…), affiché sur le site
import { SITE_URL } from './mail.js';

const BASE = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
export const telegramEnabled = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
export const telegramUrl = () => {
  if (process.env.TELEGRAM_URL) return process.env.TELEGRAM_URL;
  const id = process.env.TELEGRAM_CHAT_ID || '';
  return id.startsWith('@') ? `https://t.me/${id.slice(1)}` : '';
};
export const tgEsc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// File d'attente : un message à la fois, en respectant les pauses demandées par Telegram (erreur 429).
const queue = [];
let running = false;
async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { html, url, chat, tries } = queue.shift();
    try {
      const res = await fetch(`${BASE()}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text: html,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...(url ? { reply_markup: { inline_keyboard: [[{ text: 'Voir en direct', url }]] } } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 && tries < 3) {
        queue.unshift({ html, url, chat, tries: tries + 1 });
        await new Promise((r) => setTimeout(r, ((data.parameters?.retry_after || 5) + 1) * 1000));
        continue;
      }
      if (!data.ok) console.error('[telegram]', res.status, data.description || '');
    } catch (e) {
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
  queue.push({ html: String(html).slice(0, 4000), url, chat: chatId || process.env.TELEGRAM_CHAT_ID, tries: 0 });
  run();
}
