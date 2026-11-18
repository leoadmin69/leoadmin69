// Notifications sur le téléphone (Web Push) : gratuites, illimitées, sans compte ni email.
// Marchent sur Android (Chrome, Firefox, Samsung) et sur iPhone quand le site est ajouté à l'écran d'accueil (iOS 16.4+).
// Les clés VAPID sont créées au premier démarrage et gardées dans la base.
import * as webpush from 'web-push';
import { db, save, newId, now } from './store.js';
import { SITE_URL } from './mail.js';

export const PUSH_KINDS = ['buildings', 'urgent', 'events', 'reports'];

function vapid() {
  db.settings.vapid ||= webpush.generateVAPIDKeys();
  const site = SITE_URL();
  const subject = process.env.VAPID_SUBJECT || (site.startsWith('https://') ? site : 'mailto:alertes@example.org');
  webpush.setVapidDetails(subject, db.settings.vapid.publicKey, db.settings.vapid.privateKey);
  return db.settings.vapid;
}
export const publicKey = () => { const k = vapid(); save(); return k.publicKey; };
export const pushCount = () => (db.pushSubs || []).length;

export function subscribe({ subscription, kinds, sites }) {
  if (!subscription?.endpoint || !/^https:\/\//.test(subscription.endpoint) || !subscription.keys?.p256dh || !subscription.keys?.auth) throw new Error('Abonnement invalide.');
  db.pushSubs ||= [];
  let s = db.pushSubs.find((x) => x.endpoint === subscription.endpoint);
  if (!s) { s = { id: newId(), endpoint: subscription.endpoint, createdAt: now() }; db.pushSubs.push(s); }
  s.keys = { p256dh: String(subscription.keys.p256dh).slice(0, 200), auth: String(subscription.keys.auth).slice(0, 100) };
  s.kinds = (Array.isArray(kinds) ? kinds : PUSH_KINDS).filter((k) => PUSH_KINDS.includes(k));
  s.sites = (Array.isArray(sites) ? sites : []).map((c) => String(c).slice(0, 40)).slice(0, 20);
  delete s.campuses;
  save();
  return s;
}
export function unsubscribe(endpoint) {
  db.pushSubs = (db.pushSubs || []).filter((x) => x.endpoint !== endpoint);
  save();
}

// Envoie à tous les abonné·es concerné·es. filter(sub) permet de cibler (ex. par campus).
export async function sendPush(kind, { title, body, url = '/', tag }, filter = () => true) {
  const subs = (db.pushSubs || []).filter((s) => s.kinds?.includes(kind) && filter(s));
  return deliver(subs, kind, { title, body, url, tag }, 'pushSubs');
}

// ---------- Alertes réservées aux modos (liées à leur compte, pas aux abonnements publics) ----------
export function modSubscribe(modId, subscription) {
  if (!subscription?.endpoint || !/^https:\/\//.test(subscription.endpoint) || !subscription.keys?.p256dh || !subscription.keys?.auth) throw new Error('Abonnement invalide.');
  db.modPushSubs ||= [];
  let s = db.modPushSubs.find((x) => x.endpoint === subscription.endpoint);
  if (!s) { s = { id: newId(), endpoint: subscription.endpoint, createdAt: now() }; db.modPushSubs.push(s); }
  s.modId = modId;
  s.at = now();
  s.keys = { p256dh: String(subscription.keys.p256dh).slice(0, 200), auth: String(subscription.keys.auth).slice(0, 100) };
  // au plus 5 téléphones par modo
  const mine = db.modPushSubs.filter((x) => x.modId === modId);
  if (mine.length > 5) db.modPushSubs = db.modPushSubs.filter((x) => x.modId !== modId || mine.slice(-5).includes(x));
  save();
  return s;
}
export function modUnsubscribe(modId, endpoint) {
  db.modPushSubs = (db.modPushSubs || []).filter((x) => !(x.modId === modId && x.endpoint === endpoint));
  save();
}
export const modPushOn = (modId, endpoint) => (db.modPushSubs || []).some((x) => x.modId === modId && x.endpoint === endpoint);
// modIds : liste des comptes à prévenir
export async function sendModPush(modIds, payload) {
  const ids = new Set(modIds);
  return deliver((db.modPushSubs || []).filter((s) => ids.has(s.modId)), 'mod', payload, 'modPushSubs');
}

async function deliver(subs, kind, { title, body, url = '/', tag }, listName) {
  if (!subs.length) return { sent: 0 };
  vapid();
  const payload = JSON.stringify({ title, body, url, tag: tag || kind });
  const dead = new Set();
  let sent = 0;
  // 20 envois en parallèle maximum
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(subs.slice(i, i + 20).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 6 * 3600, urgency: kind === 'reports' ? 'normal' : 'high', topic: (tag || kind).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
        sent++;
      } catch (e) {
        // 404/410 : le téléphone s'est désabonné ou l'app a été supprimée
        if (e.statusCode === 404 || e.statusCode === 410) dead.add(s.endpoint);
        else console.error('[push]', e.statusCode || '', e.body || e.message);
      }
    }));
  }
  if (dead.size) { db[listName] = (db[listName] || []).filter((s) => !dead.has(s.endpoint)); save(); }
  console.log(`[push] ${kind} : ${sent}/${subs.length} envoyée(s)`);
  return { sent };
}
