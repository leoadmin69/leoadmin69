// Sites (campus, IUT…) : chaque contenu appartient à un site, chaque modo n'agit que sur ses sites.
// L'admin a tous les droits et gère la liste des sites et les accès des modos.
import { db, save } from './store.js';

export const DEFAULT_SITE = 'doua';
// Flash infos et rendez-vous envoyés par l'admin à tout le monde, tous sites confondus
export const ALL_SITES = 'all';
const DEFAULT_SITES = [
  { id: 'doua', name: 'Campus de la Doua', short: 'La Doua', campuses: ['La Doua'] },
  { id: 'iut-doua', name: 'IUT Lyon 1 · La Doua', short: 'IUT Doua', campuses: ['IUT Lyon 1'] },
  { id: 'iut-gratte-ciel', name: 'IUT Lyon 1 · Gratte-Ciel', short: 'IUT Gratte-Ciel', campuses: [] },
  { id: 'sante', name: 'Rockefeller · Santé', short: 'Rockefeller', campuses: ['Rockefeller (Santé)'] },
  { id: 'lyon-sud', name: 'Lyon Sud', short: 'Lyon Sud', campuses: ['Lyon Sud'] },
  { id: 'gerland', name: 'Gerland', short: 'Gerland', campuses: ['Gerland'] },
];

export const site = (id) => (db.sites || []).find((s) => s.id === id);
export const siteName = (id) => (id === ALL_SITES ? 'Tous les sites' : site(id)?.short || id);
export const isAdmin = (m) => m?.role === 'admin';
// Sites sur lesquels un modo peut agir (l'admin : tous)
export const modSites = (m) => (isAdmin(m) ? db.sites.map((s) => s.id) : (m?.sites || []).filter((id) => site(id)));
export const canSite = (m, id) => isAdmin(m) || (id !== ALL_SITES && modSites(m).includes(id));
export const siteOf = (item) => item?.site || DEFAULT_SITE;

// Une seule fois : répartit les données existantes dans les sites (tout ce qui n'a pas de site va à la Doua).
export function migrateSites() {
  let changed = false;
  if (!Array.isArray(db.sites) || !db.sites.length) {
    db.sites = DEFAULT_SITES.map(({ campuses, ...s }) => ({ ...s }));
    changed = true;
  }
  const byCampus = {};
  for (const s of DEFAULT_SITES) for (const c of s.campuses) byCampus[c] = s.id;
  for (const b of db.buildings) {
    if (!b.site) { b.site = byCampus[b.campus] || DEFAULT_SITE; changed = true; }
    const short = siteName(b.site);
    if (b.campus !== short) { b.campus = short; changed = true; }
  }
  for (const key of ['events', 'flashes', 'demands', 'contacts', 'reports', 'polls', 'posts', 'testimonies']) {
    for (const x of db[key] || []) if (!x.site) { x.site = DEFAULT_SITE; changed = true; }
  }
  // Titre de l'accueil : un réglage par site
  db.siteStatus ||= {};
  if (db.settings.blocus && !db.siteStatus[DEFAULT_SITE]) { db.siteStatus[DEFAULT_SITE] = { ...db.settings.blocus }; changed = true; }
  for (const s of db.sites) if (!db.siteStatus[s.id]) { db.siteStatus[s.id] = { state: 'auto', message: '', updatedAt: null, by: '' }; changed = true; }
  // Texte « Le contexte » des revendications : un par site
  db.contexts ||= {};
  if (db.settings.context && !db.contexts[DEFAULT_SITE]) { db.contexts[DEFAULT_SITE] = db.settings.context; changed = true; }
  // Modos existants : rattachés à la Doua (l'admin pourra changer)
  for (const m of db.mods) if (!isAdmin(m) && !Array.isArray(m.sites)) { m.sites = [DEFAULT_SITE]; changed = true; }
  // Abonnements : les anciens choix « campus » deviennent des sites
  const toSite = (c) => (site(c) ? c : byCampus[c] || db.sites.find((s) => s.short === c)?.id);
  for (const s of [...(db.subscribers || []), ...(db.pushSubs || [])]) {
    if (!s.sites) { s.sites = (s.campuses || []).map(toSite).filter(Boolean); changed = true; }
  }
  if (changed) save();
}

// Statut affiché en haut de l'accueil d'un site : choisi par un modo, ou déduit de ses bâtiments (« auto »).
export function effectiveBlocus(id) {
  const st = db.siteStatus?.[id] || { state: 'auto' };
  if (st.state !== 'auto' && st.state !== 'inconnu') return st.state;
  const blds = db.buildings.filter((b) => siteOf(b) === id);
  if (blds.some((x) => x.status === 'bloque')) return 'actif';
  if (blds.some((x) => x.status === 'partiel')) return 'partiel';
  if (blds.some((x) => x.status === 'ouvert')) return 'leve';
  return 'inconnu';
}

// Abonné·e concerné·e par un site (aucun site choisi = tous)
export const wantsSite = (sub, id) => id === ALL_SITES || !sub.sites?.length || sub.sites.includes(id);
// Chaînes Telegram à prévenir : celle du site, ou toutes (principale + chaque site) pour « tous les sites »
export const telegramChats = (id) => (id === ALL_SITES ? [...new Set([null, ...(db.sites || []).map((s) => s.telegramChatId || null)])] : [site(id)?.telegramChatId || null]);
