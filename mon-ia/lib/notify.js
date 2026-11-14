// Notifications vers l'admin (téléphone, Telegram, autre système) : utile quand il est absent.
import { load } from './store.js';
import { defineTool } from './tools.js';

/**
 * Envoie une notification sur tous les canaux configurés (Admin → Intégrations).
 * Retourne la liste des canaux qui ont fonctionné.
 */
export async function notify(title, message, { priority = 'default' } = {}) {
  const cfg = load('settings').notify || {};
  const text = String(message || '').slice(0, 3500);
  const sent = [];
  const errors = [];
  // Nettoie une adresse saisie à la main (espaces, « https:// » oublié).
  const cleanUrl = (u) => { const t = String(u || '').trim().replace(/\/+$/, ''); return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t; };
  // Message d'erreur lisible : quel canal, quelle adresse, quelle cause.
  const why = (e) => {
    const code = e.cause?.code || e.cause?.message || e.name;
    const hint = { ENOTFOUND: "adresse introuvable (vérifie l'orthographe)", ECONNREFUSED: 'connexion refusée', ERR_INVALID_URL: 'adresse invalide',
      TimeoutError: 'pas de réponse (délai dépassé)', UND_ERR_CONNECT_TIMEOUT: 'pas de réponse (délai dépassé)' }[code];
    return hint || `${e.message}${code && code !== e.name ? ` (${code})` : ''}`;
  };
  const channels = [];
  if (cfg.ntfyTopic) {
    const server = cleanUrl(cfg.ntfyServer) || 'https://ntfy.sh';
    channels.push(['ntfy', server, () => fetch(`${server}/${encodeURIComponent(String(cfg.ntfyTopic).trim())}`, {
      method: 'POST', body: text,
      // Les en-têtes HTTP n'acceptent que l'ASCII : le titre est encodé selon RFC 2047.
      headers: { Title: `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`, Priority: priority === 'high' ? 'high' : 'default' },
      signal: AbortSignal.timeout(15000),
    })]);
  }
  if (cfg.telegramToken && cfg.telegramChatId) {
    channels.push(['telegram', 'api.telegram.org', () => fetch(`https://api.telegram.org/bot${String(cfg.telegramToken).trim()}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(cfg.telegramChatId).trim(), text: `${title}\n\n${text}` }),
      signal: AbortSignal.timeout(15000),
    })]);
  }
  if (cfg.webhookUrl) {
    const hook = cleanUrl(cfg.webhookUrl);
    channels.push(['webhook', hook, () => fetch(hook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message: text, priority, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(15000),
    })]);
  }
  await Promise.all(channels.map(async ([name, where, send]) => {
    try {
      const r = await send();
      if (r.ok) sent.push(name);
      else errors.push(`${name} (${where}) : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
    } catch (e) { errors.push(`${name} (${where}) : ${why(e)}`); }
  }));
  return { sent, errors };
}

export const NOTIFY_TOOLS = [
  defineTool('notify_admin', "Envoyer une notification à l'admin sur son téléphone (utile en mission, en cas d'alerte ou quand une décision humaine est nécessaire).", {
    title: { type: 'string' }, message: { type: 'string' }, urgent: { type: 'boolean' },
  }, ['message'], async ({ title, message, urgent }) => {
    const r = await notify(title || 'Message de ton IA', message, { priority: urgent ? 'high' : 'default' });
    if (!r.sent.length) return `Aucune notification envoyée${r.errors.length ? ' : ' + r.errors.join(', ') : " (aucun canal configuré dans Admin → Intégrations)"}.`;
    return `Notification envoyée via ${r.sent.join(', ')}.`;
  }, { kind: 'safe', adminOnly: true, group: 'agents' }),
];
