// Audience anonyme, pour l'admin : visites (navigateur / app installée), appareils, installations, notifications.
// Rien de personnel : chaque appareil est représenté par une empreinte courte (HMAC du cookie aléatoire l1_dev),
// impossible à relier à une personne. On ne peut pas savoir si c'est un·e étudiant·e ou un personnel (pas de compte).
// Les journées de plus de 120 jours sont effacées.
import { db, save } from './store.js';

const KEEP_DAYS = 120;
const parisDay = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

let lastPrune = '';
function day(d = parisDay()) {
  db.audience ||= { days: {} };
  if (lastPrune !== d) { lastPrune = d; pruneAudience(); }
  return (db.audience.days[d] ||= { visits: { browser: 0, app: 0 }, devices: { browser: [], app: [] }, installs: 0 });
}
let saveTimer = null;
const later = () => { if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; save(); }, 5000); };

// Une visite = une ouverture du site (une fois par session d'onglet ou d'app)
export function recordVisit(dev, mode) {
  const d = day();
  const m = mode === 'app' ? 'app' : 'browser';
  d.visits[m]++;
  if (!d.devices[m].includes(dev)) d.devices[m].push(dev);
  later();
}
export function recordInstall() { day().installs++; later(); }

export function pruneAudience() {
  const days = db.audience?.days || {};
  const limit = parisDay(new Date(Date.now() - KEEP_DAYS * 864e5));
  for (const k of Object.keys(days)) if (k < limit) delete days[k];
}

// Résumé pour l'admin
export function audienceSummary({ pushSubs = [], subscribers = [], sites = [] } = {}) {
  pruneAudience();
  const days = db.audience?.days || {};
  const keys = Object.keys(days).sort();
  const since = (n) => parisDay(new Date(Date.now() - (n - 1) * 864e5));
  const range = (n) => {
    const from = since(n);
    const sel = keys.filter((k) => k >= from).map((k) => days[k]);
    const b = new Set(), a = new Set();
    let vb = 0, va = 0, inst = 0;
    for (const d of sel) { d.devices.browser.forEach((x) => b.add(x)); d.devices.app.forEach((x) => a.add(x)); vb += d.visits.browser; va += d.visits.app; inst += d.installs; }
    const all = new Set([...b, ...a]);
    return { visits: vb + va, visitsBrowser: vb, visitsApp: va, devices: all.size, devicesBrowser: b.size, devicesApp: a.size, installs: inst };
  };
  const everApp = new Set();
  const everAll = new Set();
  for (const k of keys) { days[k].devices.app.forEach((x) => { everApp.add(x); everAll.add(x); }); days[k].devices.browser.forEach((x) => everAll.add(x)); }
  // 30 derniers jours, jour par jour (y compris les jours sans visite)
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const k = parisDay(new Date(Date.now() - i * 864e5));
    const d = days[k];
    series.push({ day: k, browser: d ? d.devices.browser.length : 0, app: d ? d.devices.app.length : 0, visits: d ? d.visits.browser + d.visits.app : 0 });
  }
  const kinds = {};
  for (const s of pushSubs) for (const k of s.kinds || []) kinds[k] = (kinds[k] || 0) + 1;
  const bySite = sites.map((x) => ({ id: x.id, short: x.short, push: pushSubs.filter((s) => !s.sites?.length || s.sites.includes(x.id)).length }));
  return {
    today: range(1), week: range(7), month: range(30),
    since: keys[0] || null,
    everDevices: everAll.size, everApp: everApp.size,
    push: { total: pushSubs.length, allSites: pushSubs.filter((s) => !s.sites?.length).length, kinds, bySite },
    emails: { confirmed: subscribers.filter((s) => s.confirmed).length },
    series,
  };
}
