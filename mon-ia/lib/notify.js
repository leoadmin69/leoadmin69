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
  const tasks = [];
  if (cfg.ntfyTopic) {
    tasks.push(fetch(`${(cfg.ntfyServer || 'https://ntfy.sh').replace(/\/$/, '')}/${encodeURIComponent(cfg.ntfyTopic)}`, {
      method: 'POST', body: text,
      // Les en-têtes HTTP n'acceptent que l'ASCII : le titre est encodé selon RFC 2047.
      headers: { Title: `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`, Priority: priority === 'high' ? 'high' : 'default' },
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? sent.push('ntfy') : errors.push(`ntfy HTTP ${r.status}`))));
  }
  if (cfg.telegramToken && cfg.telegramChatId) {
    tasks.push(fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.telegramChatId, text: `${title}\n\n${text}` }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? sent.push('telegram') : errors.push(`Telegram HTTP ${r.status}`))));
  }
  if (cfg.webhookUrl) {
    tasks.push(fetch(cfg.webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message: text, priority, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? sent.push('webhook') : errors.push(`webhook HTTP ${r.status}`))));
  }
  await Promise.all(tasks.map((t) => t.catch((e) => errors.push(e.message))));
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
