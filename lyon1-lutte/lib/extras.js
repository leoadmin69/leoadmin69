// Options : signalements des étudiant·es, « J'y vais » + rappel 1 h avant, frise de la mobilisation,
// page « Tes droits pendant le blocage », tableau d'entraide. Tout fonctionne sans IA.
import crypto from 'node:crypto';
import { db, save, newId, now } from './store.js';
import { SECRET, parseCookies } from './auth.js';
import { DEFAULT_SITE, site, siteName, siteOf, canSite, isAdmin, wantsSite, telegramChats } from './sites.js';
import { renderRich } from './community.js';
import { isSystemNick } from '../public/nicks.js';

const SIGHT_WINDOW = 45 * 60e3;                                   // un signalement compte 45 min
const SIGHT_THRESHOLD = () => Number(process.env.SIGHTING_THRESHOLD || 3); // signalements concordants pour alerter les modos
const ENTRAIDE_DAYS = 14;
const DEVICE = 'l1_dev';
const parisDay = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// Numéros de téléphone et emails refusés dans l'entraide (protection des personnes)
const CONTACT_RE = /(\+?\d[\d .-]{7,}\d)|([^\s@]+@[^\s@]+\.[a-z]{2,})/i;

// Historique de la mobilisation reconstitué à partir de la presse (chaque ligne cite sa source).
// Les modos peuvent corriger, compléter ou supprimer ces lignes depuis la page Frise.
const HISTORY_V1 = [
  { date: '2026-10-06', kind: 'blocage', text: 'Premier blocus à Lyon 1, sur le campus de la Doua.', source: 'Rue89Lyon', url: 'https://www.rue89lyon.fr/2026/10/16/lyon-1-ecoles-ingenieurs-conservatoire-soutiens-inattendus-mouvement-lyceen/' },
  { date: '2026-10-06', kind: 'manif', text: 'Grande journée de mobilisation lycéenne et étudiante à Lyon, début de la « Semaine noire ».', source: 'Révolution Permanente', url: 'https://www.revolutionpermanente.fr/Apres-une-Semaine-Noire-reussie-a-Lyon-organisons-la-jonction-de-la-jeunesse-avec-les-travailleurs' },
  { date: '2026-10-07', kind: 'blocage', text: 'Mobilisation à Lyon 1 (avec Lyon 2 et l’ENS) : tram T1 coupé entre Perrache et IUT Feyssine, T4 interrompu jusqu’à 14 h.', source: 'LyonMag', url: 'https://www.lyonmag.com/article/154296/mobilisation-lyceenne-a-lyon-universites-bloquees-rassemblements-devant-trois-lycees-et-tramway-perturbe' },
  { date: '2026-10-13', kind: 'blocage', text: 'Nouveau blocus à Lyon 1.', source: 'Rue89Lyon', url: 'https://www.rue89lyon.fr/2026/10/16/lyon-1-ecoles-ingenieurs-conservatoire-soutiens-inattendus-mouvement-lyceen/' },
  { date: '2026-10-14', kind: 'ag', text: 'AG devant le bâtiment Astrée : plus de 200 étudiant·es (jusqu’à 400 selon un participant) votent un nouveau blocus. Une première pour la fac de sciences.', source: 'Rue89Lyon', url: 'https://www.rue89lyon.fr/2026/10/16/lyon-1-ecoles-ingenieurs-conservatoire-soutiens-inattendus-mouvement-lyceen/' },
  { date: '2026-10-15', kind: 'blocage', text: 'Lyon 1 parmi les établissements du supérieur bloqués (avec l’IEP et l’INSA) ; T1 et T6 perturbés.', source: 'France 3 Auvergne-Rhône-Alpes', url: 'https://france3-regions.franceinfo.fr/auvergne-rhone-alpes/rhone/lyon/mobilisation-lyceenne-et-etudiante-19-etablissements-impactes-a-lyon-2-rassemblements-ont-ete-interdits-par-la-prefecture-3434286.html' },
  { date: '2026-10-31', kind: 'manif', text: 'Acte 3 de la mobilisation lycéenne et étudiante à Lyon.', source: 'MesInfos', url: 'https://mesinfos.fr/69000-lyon/manifestations-apres-les-vacances-les-etudiants-lyonnais-reprennent-la-lutte-342517.html' },
  { date: '2026-11-03', kind: 'blocage', text: 'Rentrée de la Toussaint : Lyon 1 bloquée, avec Lyon 2, l’ENS et Centrale (selon la préfecture).', source: 'LyonMag', url: 'https://www.lyonmag.com/article/154720/mouvement-lyceen-et-etudiant-a-lyon-23-lycees-concernes-quatre-etablissements-du-superieur-bloques' },
  { date: '2026-11-03', kind: 'manif', text: 'Manif à l’appel de l’Interfac, de la place Jean-Jaurès à la Manufacture des tabacs : 900 personnes selon la préfecture, 1 500 selon les organisateurs.', source: 'MesInfos', url: 'https://mesinfos.fr/69000-lyon/manifestations-apres-les-vacances-les-etudiants-lyonnais-reprennent-la-lutte-342517.html' },
  { date: '2026-11-10', kind: 'manif', text: 'Manif des lycéen·nes, étudiant·es et personnels de l’éducation, de Jean-Macé à la place Guichard.', source: 'Lyon Capitale', url: 'https://www.lyoncapitale.fr/actualite/greve-dans-l-education-une-nouvelle-manifestation-a-lyon-ce-mardi-matin' },
  { date: '2026-11-12', kind: 'blocage', text: 'Un mois de blocus à Lyon 1 : cours annulés, reportés ou passés en distanciel.', source: 'Lyon Capitale', url: 'https://www.lyoncapitale.fr/actualite/on-a-limpression-detre-la-generation-sacrifiee-a-lyon-les-etudiants-redoutent-leurs-premiers-partiels-apres-un-mois-de-blocus' },
];
const HISTORY_ICON = { blocage: '🔴', ag: '🗣️', manif: '📣', win: '✊', alerte: '🚨', autre: '📍' };

const DROITS_V1 = {
  title: 'Tes droits pendant le blocage',
  published: false, // à relire et valider par les syndicats / la legal team avant publication
  body: `Cette page rassemble des informations générales. Elle ne remplace pas un conseil juridique : en cas de doute, contacte un syndicat étudiant ou la legal team (page « Parler à qui ? »).

## Bâtiment bloqué : ce n'est pas « sécher »
Quand un bâtiment est bloqué ou fermé par l'administration, ce n'est pas toi qui choisis de ne pas aller en cours.
- Garde une trace : photo datée de l'entrée bloquée, capture de cette page, email de l'université.
- Si une absence t'est reprochée, réponds par écrit à ta scolarité avec ces preuves.

## Cours et examens
- C'est l'université qui décide d'annuler, de reporter ou de passer à distance un cours ou un examen. Elle doit en informer clairement les étudiant·es.
- Les modalités de rattrapage ou de report sont décidées par les instances de l'université. Demande toujours une réponse écrite (email) en cas de doute.
- Si un examen est maintenu alors que le bâtiment est inaccessible, signale-le immédiatement par écrit et préviens un syndicat.

## Bourses et assiduité
Les boursier·es ont une obligation d'assiduité. Un cours qui n'a pas lieu n'est pas une absence de ta part : garde tes preuves. En cas de courrier du CROUS, contacte un syndicat étudiant avant de répondre.

## Liberté d'expression sur le campus
Le Code de l'éducation (article L811-1) reconnaît aux étudiant·es la liberté d'information et d'expression, y compris sur les questions politiques, dans des conditions qui ne portent pas atteinte aux activités d'enseignement et ne troublent pas l'ordre public.
Le ou la président·e de l'université est responsable de l'ordre dans les locaux et peut fermer des bâtiments ou demander l'intervention des forces de l'ordre (article L712-2).

## Procédure disciplinaire
- Tu dois être informé·e de ce qui t'est reproché et pouvoir consulter ton dossier.
- Tu peux être accompagné·e (syndicat, avocat·e) et présenter ta défense.
- Ne te rends jamais seul·e à une convocation : contacte d'abord un syndicat.

## Si tu es interpellé·e
- Tu as le droit de garder le silence.
- En garde à vue : droit à un·e avocat·e (commis·e d'office et gratuit·e si besoin), à un examen médical, à faire prévenir un proche et à un·e interprète.
- Ne signe pas un document que tu n'as pas compris.
- Fais prévenir la legal team dès que possible.

> Texte d'information générale, à faire relire et valider par vos syndicats ou votre legal team.`,
};

export function registerExtras(app, mod, ctx) {
  const { broadcast, feed, audit, visitor, limited, clip, bad, oneOf, needSite, sendPush, postTelegram, tgEsc, sendModPush } = ctx;
  db.sightings ||= [];
  db.sightIgnored ||= {};
  db.dayLog ||= {};
  db.entraide ||= [];
  db.pages ||= {};
  db.friseHistory ||= [];
  if (!db.settings.friseHistoryV1) {
    db.friseHistory.push(...HISTORY_V1.map((h) => ({ id: newId(), ...h, by: 'presse', at: now() })));
    db.settings.friseHistoryV1 = true; save();
  }
  if (!db.pages.droits) { db.pages.droits = { ...DROITS_V1, updatedAt: now(), by: '' }; save(); }

  // Identifiant d'appareil anonyme (même cookie que les votes), puis empreinte propre à chaque usage
  function device(req, res) {
    let d = parseCookies(req.headers.cookie)[DEVICE];
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(d || '')) {
      d = crypto.randomBytes(24).toString('base64url');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${DEVICE}=${d}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}${secure}`);
    }
    return d;
  }
  const mark = (kind, id, dev) => crypto.createHmac('sha256', SECRET).update(`${kind}|${id}|${dev}`).digest('base64url').slice(0, 20);

  // ================= Frise : journal des journées =================
  // Appelé à chaque changement de bâtiment : on retient, par jour et par site, les bâtiments bloqués.
  function onBuilding(b) {
    if (b.status !== 'bloque' && b.status !== 'partiel') return;
    const day = parisDay();
    const sid = siteOf(b);
    const entry = ((db.dayLog[day] ||= {})[sid] ||= { bloque: [], partiel: [] });
    if (!entry[b.status].includes(b.name)) { entry[b.status].push(b.name); save(); }
    // un bâtiment confirmé par un·e modo : ses signalements sont soldés
    db.sightings = db.sightings.filter((s) => s.b !== b.id);
  }

  function timeline(siteId) {
    const days = {};
    const add = (iso, item) => { const d = parisDay(new Date(iso)); (days[d] ||= []).push(item); };
    const ok = (x) => !siteId || siteId === 'all' || siteOf(x) === siteId;
    for (const [day, bySite] of Object.entries(db.dayLog)) {
      for (const [sid, e] of Object.entries(bySite)) {
        if (siteId && siteId !== 'all' && sid !== siteId) continue;
        if (e.bloque.length) (days[day] ||= []).push({ kind: 'blocage', icon: '🔴', text: `${siteName(sid)} · bloqués : ${e.bloque.join(', ')}`, site: sid });
        if (e.partiel.length) (days[day] ||= []).push({ kind: 'blocage', icon: '🟠', text: `${siteName(sid)} · partiels : ${e.partiel.join(', ')}`, site: sid });
      }
    }
    for (const e of db.events) if (ok(e) && new Date(e.start).getTime() < Date.now()) add(e.start, { kind: 'event', icon: e.type === 'manif' ? '📣' : e.type === 'AG' ? '🗣️' : '📍', text: `${e.type} · ${e.title}${e.place ? ' · ' + e.place : ''}${e.going ? ` · ${Object.keys(e.going).length} « j'y vais »` : ''}`, site: siteOf(e) });
    for (const r of db.reports) if (ok(r) && r.status === 'published') add(r.publishedAt, { kind: 'cr', icon: '📝', text: `Compte rendu : ${r.titre}`, link: `/#/cr/${r.id}`, site: siteOf(r) });
    for (const p of db.polls) {
      if (!ok(p) || p.hidden || !p.resultsAnnounced) continue;
      const counts = p.options.map((_, i) => Object.values(p.ballots).filter((b) => b === i).length);
      const total = counts.reduce((a, b) => a + b, 0);
      if (!total) continue;
      const max = Math.max(...counts);
      add(p.closesAt, { kind: 'vote', icon: '🗳️', text: `${p.ag || 'Vote'} · « ${p.question} » → ${p.options[counts.indexOf(max)]} (${Math.round((max / total) * 100)} %, ${total} votes)`, link: `/#/votes/${p.id}`, site: siteOf(p) });
    }
    for (const d of db.demands) if (ok(d) && d.status === 'obtenu' && d.obtainedAt) add(d.obtainedAt, { kind: 'win', icon: '✊', text: `Obtenu : ${d.title}`, site: siteOf(d) });
    for (const f of db.flashes) if (ok(f) && f.level === 'alerte') add(f.at, { kind: 'alerte', icon: '🚨', text: f.text, site: siteOf(f) });
    for (const h of db.friseHistory) (days[h.date] ||= []).push({ kind: h.kind === 'win' ? 'win' : h.kind === 'ag' ? 'event' : h.kind === 'alerte' ? 'alerte' : h.kind === 'manif' ? 'event' : 'blocage', icon: HISTORY_ICON[h.kind] || '📍', text: h.text, source: h.source, url: h.url, hid: h.id, hist: true });
    const order = { win: 0, vote: 1, blocage: 2, event: 3, cr: 4, alerte: 5 };
    const list = Object.entries(days).map(([day, items]) => ({ day, items: items.sort((a, b) => order[a.kind] - order[b.kind]) })).sort((a, b) => b.day.localeCompare(a.day));
    const start = db.settings.mobilisationStart || list.at(-1)?.day || parisDay(); // par défaut : le plus ancien jour connu
    const dayNum = (d) => Math.round((new Date(d) - new Date(start)) / 864e5) + 1;
    return {
      start,
      today: dayNum(parisDay()),
      stats: {
        days: list.filter((x) => x.items.some((i) => i.kind === 'blocage' || i.kind === 'event')).length,
        votes: list.reduce((n, x) => n + x.items.filter((i) => i.kind === 'vote').length, 0),
        wins: db.demands.filter((d) => ok(d) && d.status === 'obtenu').length,
        ag: db.events.filter((e) => ok(e) && e.type === 'AG' && new Date(e.start).getTime() < Date.now()).length + db.friseHistory.filter((h) => h.kind === 'ag').length,
      },
      days: list.map((x) => ({ ...x, num: dayNum(x.day) })),
    };
  }
  app.get('/api/frise', (req, res) => res.json(timeline(String(req.query.site || ''))));
  // Lignes d'historique (presse, souvenirs des AG…) : tout·e modo ajoute ; on modifie/supprime les siennes, l'admin toutes.
  const readHist = (b, h = {}) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? h.date ?? '')) throw new Error('Date AAAA-MM-JJ.');
    const text = clip(b.text ?? h.text, 300);
    if (text.length < 4) throw new Error('Texte trop court.');
    const url = clip(b.url ?? h.url, 400);
    if (url && !/^https?:\/\//.test(url)) throw new Error('Lien invalide (https://…).');
    return { ...h, date: b.date ?? h.date, kind: oneOf(b.kind ?? h.kind, Object.keys(HISTORY_ICON), 'autre'), text, source: clip(b.source ?? h.source, 80), url };
  };
  mod.post('/frise/history', (req, res) => {
    let h; try { h = readHist(req.body); } catch (e) { return bad(res, e.message); }
    h = { id: newId(), ...h, by: req.mod.org, at: now() };
    db.friseHistory.push(h); save(); audit(req.mod, 'frise : ajout', `${h.date} ${h.text.slice(0, 60)}`);
    res.json(h);
  });
  const ownHist = (req, res) => {
    const h = db.friseHistory.find((x) => x.id === req.params.id);
    if (!h) return bad(res, 'Introuvable', 404), null;
    if (!isAdmin(req.mod) && h.by !== req.mod.org) return bad(res, 'Seul·e l’admin ou l’auteur·e peut modifier cette ligne.', 403), null;
    return h;
  };
  mod.put('/frise/history/:id', (req, res) => {
    const h = ownHist(req, res); if (!h) return;
    try { Object.assign(h, readHist(req.body, h)); } catch (e) { return bad(res, e.message); }
    save(); audit(req.mod, 'frise : modif', `${h.date} ${h.text.slice(0, 60)}`); res.json(h);
  });
  mod.delete('/frise/history/:id', (req, res) => {
    const h = ownHist(req, res); if (!h) return;
    db.friseHistory = db.friseHistory.filter((x) => x !== h); save();
    audit(req.mod, 'frise : suppression', `${h.date} ${h.text.slice(0, 60)}`); res.json({ ok: true });
  });
  mod.put('/frise/start', (req, res) => {
    if (!isAdmin(req.mod)) return bad(res, 'Réservé à l’admin.', 403);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.start || '')) return bad(res, 'Date AAAA-MM-JJ.');
    db.settings.mobilisationStart = req.body.start; save();
    res.json({ ok: true });
  });

  // ================= Signalements des étudiant·es =================
  function summary() {
    const out = {};
    const t = Date.now() - SIGHT_WINDOW;
    for (const s of db.sightings) {
      if (new Date(s.at).getTime() < t) continue;
      const b = db.buildings.find((x) => x.id === s.b);
      if (!b || s.status === b.status) continue;
      if (db.sightIgnored[s.b] && db.sightIgnored[s.b] > s.at) continue;
      const k = `${s.b}|${s.status}`;
      const o = (out[k] ||= { building: s.b, name: b.name, site: siteOf(b), status: s.status, current: b.status, count: 0, last: s.at });
      o.count++;
      if (s.at > o.last) o.last = s.at;
    }
    return Object.values(out).sort((a, b) => b.count - a.count);
  }
  app.post('/api/sightings', (req, res) => {
    const b = db.buildings.find((x) => x.id === req.body.building);
    if (!b) return bad(res, 'Bâtiment inconnu.', 404);
    const status = oneOf(req.body.status, ['bloque', 'partiel', 'ouvert'], null);
    if (!status) return bad(res, 'État invalide.');
    if (limited(`sight:${visitor(req)}`, 30, 3600e3)) return bad(res, 'Trop de signalements depuis ce réseau, réessaie plus tard.', 429);
    const v = mark('sight', b.id, device(req, res));
    // un seul signalement par appareil et par bâtiment toutes les 45 min (le dernier compte)
    db.sightings = db.sightings.filter((s) => !(s.b === b.id && s.v === v) && Date.now() - new Date(s.at).getTime() < 2 * 3600e3);
    db.sightings.push({ id: newId(), b: b.id, status, v, at: now() });
    save();
    const s = summary().find((x) => x.building === b.id && x.status === status);
    broadcast('sighting', { building: b.id });
    // Seuil atteint : notification aux modos de ce site (une fois par bâtiment et par état, puis plus avant 45 min)
    const key = `${b.id}|${status}`;
    db.sightNotified ||= {};
    if (s && s.count >= SIGHT_THRESHOLD() && Date.now() - new Date(db.sightNotified[key] || 0).getTime() > SIGHT_WINDOW) {
      db.sightNotified[key] = now(); save();
      const sid = siteOf(b);
      const ids = db.mods.filter((m) => !m.disabled && canSite(m, sid)).map((m) => m.id);
      const word = status === 'bloque' ? 'BLOQUÉ' : status === 'partiel' ? 'PARTIEL' : 'OUVERT';
      sendModPush?.(ids, { title: `👀 À vérifier · ${b.name} ${word} ?`, body: `${s.count} étudiant·es le signalent (${siteName(sid)}). Vérifie puis confirme en un tap dans l’espace modo.`, url: '/#/modo', tag: `sight-${b.id}` }).catch((e) => console.error('[push modo]', e.message));
    }
    if (s && s.count === SIGHT_THRESHOLD()) feed(`${siteName(siteOf(b))} · 👀 ${s.count} étudiant·es signalent ${b.name} ${status === 'bloque' ? 'bloqué' : status === 'partiel' ? 'partiellement bloqué' : 'ouvert'} (à confirmer par un·e modo)`, 'warn');
    res.json({ ok: true, count: s?.count || 1, message: s && s.count >= SIGHT_THRESHOLD() ? 'Merci ! Plusieurs personnes l’ont signalé : un·e modo va confirmer.' : 'Merci ! Ton signalement est transmis aux modos.' });
  });
  mod.get('/sightings', (req, res) => res.json({ threshold: SIGHT_THRESHOLD(), list: summary().filter((x) => canSite(req.mod, x.site)) }));
  // Envoie maintenant, aux modos concernés, une notification pour chaque signalement en attente (≥ seuil).
  // mods : comptes à prévenir (par défaut tous) ; building : un seul bâtiment.
  async function remindSightings({ mods = null, building = null } = {}) {
    const pending = summary().filter((x) => x.count >= SIGHT_THRESHOLD() && (!building || x.building === building));
    let sent = 0;
    for (const x of pending) {
      const ids = db.mods.filter((m) => !m.disabled && canSite(m, x.site) && (!mods || mods.includes(m.id))).map((m) => m.id);
      if (!ids.length) continue;
      const word = x.status === 'bloque' ? 'BLOQUÉ' : x.status === 'partiel' ? 'PARTIEL' : 'OUVERT';
      const r = await sendModPush?.(ids, { title: `👀 À vérifier · ${x.name} ${word} ?`, body: `${x.count} étudiant·es le signalent (${siteName(x.site)}). Vérifie puis confirme en un tap dans l’espace modo.`, url: '/#/modo', tag: `sight-${x.building}` }).catch(() => null);
      sent += r?.sent || 0;
    }
    return { pending: pending.length, sent };
  }
  // Bouton « Prévenir les modos » : relance la notification d'un signalement (ou de tous)
  mod.post('/sightings/remind', async (req, res) => {
    const b = req.body.building ? db.buildings.find((x) => x.id === req.body.building) : null;
    if (req.body.building && !b) return bad(res, 'Introuvable', 404);
    if (b && !needSite(req, res, siteOf(b))) return;
    if (limited(`remind:${req.mod.id}`, 10, 600e3)) return bad(res, 'Déjà relancé plusieurs fois, attends quelques minutes.', 429);
    const r = await remindSightings({ building: b?.id });
    audit(req.mod, 'signalements : modos relancés', b ? b.name : 'tous', b ? siteOf(b) : '');
    res.json(r);
  });

  mod.post('/sightings/ignore', (req, res) => {
    const b = db.buildings.find((x) => x.id === req.body.building);
    if (!b) return bad(res, 'Introuvable', 404);
    if (!needSite(req, res, siteOf(b))) return;
    db.sightIgnored[b.id] = now(); save();
    audit(req.mod, 'signalements ignorés', b.name, siteOf(b));
    broadcast('sighting', { building: b.id });
    res.json({ ok: true });
  });

  // ================= « J'y vais » + rappel 1 h avant =================
  app.post('/api/events/:id/going', (req, res) => {
    const e = db.events.find((x) => x.id === req.params.id);
    if (!e) return bad(res, 'Introuvable', 404);
    if (limited(`going:${visitor(req)}`, 60, 3600e3)) return bad(res, 'Trop de clics, réessaie plus tard.', 429);
    const k = mark('going', e.id, device(req, res));
    e.going ||= {};
    const going = !e.going[k];
    if (going) e.going[k] = 1; else delete e.going[k];
    save();
    broadcast('going', { id: e.id, count: Object.keys(e.going).length });
    res.json({ going, count: Object.keys(e.going).length });
  });
  function remind() {
    for (const e of db.events) {
      const t = new Date(e.start).getTime() - Date.now();
      if (e.reminded || t > 65 * 60e3 || t < 30 * 60e3) continue;
      e.reminded = true; save();
      const when = new Date(e.start).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
      const going = Object.keys(e.going || {}).length;
      const sid = siteOf(e);
      sendPush('events', { title: `⏰ Dans 1 h · ${e.type} · ${e.title}`, body: `${when}${e.place ? ' · ' + e.place : ''}${going ? ` · ${going} personnes y vont` : ''}`, url: '/#/agenda', tag: `rappel-${e.id}` }, (s) => wantsSite(s, sid)).catch(() => {});
      for (const chat of telegramChats(sid)) postTelegram(`⏰ <b>Dans 1 h · ${tgEsc(e.type)}</b>\n${tgEsc(e.title)}\n${tgEsc(when)}${e.place ? ' · ' + tgEsc(e.place) : ''}${going ? `\n✋ ${going} personnes y vont` : ''}`, '/#/agenda', chat);
      feed(`${siteName(sid)} · ⏰ Dans 1 h : ${e.type} · ${e.title}${e.place ? ' · ' + e.place : ''}`, 'info');
    }
  }
  setInterval(remind, 2 * 60e3).unref();
  setTimeout(remind, 15e3).unref();

  // ================= Page « Tes droits pendant le blocage » =================
  app.get('/api/pages/droits', (req, res) => {
    const p = db.pages.droits;
    if (!p.published) return res.json({ published: false, title: p.title });
    res.json({ published: true, title: p.title, html: renderRich(p.body), updatedAt: p.updatedAt, by: p.by });
  });
  mod.get('/pages/droits', (req, res) => res.json({ ...db.pages.droits, html: renderRich(db.pages.droits.body), canEdit: isAdmin(req.mod) }));
  mod.put('/pages/droits', (req, res) => {
    if (!isAdmin(req.mod)) return bad(res, 'Seul·e l’admin modifie cette page (elle doit être validée par les syndicats / la legal team).', 403);
    const p = db.pages.droits;
    if (req.body.title !== undefined) p.title = clip(req.body.title, 120) || p.title;
    if (req.body.body !== undefined) p.body = clip(req.body.body, 20000);
    if (req.body.published !== undefined) p.published = !!req.body.published;
    p.updatedAt = now(); p.by = req.mod.org;
    save(); audit(req.mod, `page droits ${p.published ? 'publiée' : 'brouillon'}`, '');
    broadcast('pages', {});
    res.json(p);
  });

  // ================= Entraide « je propose / je cherche » =================
  const CATS = { cours: '📚 Cours, notes, rattrapage', logement: '🏠 Hébergement', repas: '🍲 Repas, courses', transport: '🚲 Trajets, covoiturage', materiel: '🧰 Matériel', soutien: '💬 Écoute, soutien', autre: '✨ Autre' };
  const alive = (a) => !a.hidden && new Date(a.expires).getTime() > Date.now();
  const pub = (a, secretOk = false) => ({
    id: a.id, site: siteOf(a), kind: a.kind, cat: a.cat, catLabel: CATS[a.cat], title: a.title, text: a.text, nick: a.nick, at: a.at, expires: a.expires,
    replies: a.replies.filter((r) => !r.hidden).map((r) => ({ id: r.id, nick: r.nick, text: r.text, at: r.at, author: r.author })),
    ...(secretOk ? { secret: a.secret } : {}),
  });
  const noContact = (t) => !CONTACT_RE.test(t);
  app.get('/api/entraide', (req, res) => res.json({ cats: CATS, items: db.entraide.filter(alive).sort((a, b) => b.at.localeCompare(a.at)).map((a) => pub(a)) }));
  app.post('/api/entraide', (req, res) => {
    const dev = device(req, res);
    if (limited(`ent:${visitor(req)}`, 10, 3600e3) || limited(`entd:${dev}`, 3, 3600e3)) return bad(res, 'Trop d’annonces, réessaie plus tard.', 429);
    const title = clip(req.body.title, 90);
    const text = clip(req.body.text, 800);
    const nick = isSystemNick(req.body.nick) ? req.body.nick : 'Anonyme';
    if (title.length < 4) return bad(res, 'Donne un titre (4 caractères minimum).');
    if (!noContact(`${title} ${text}`)) return bad(res, 'Pas de numéro de téléphone ni d’email : échangez dans les réponses (ou donnez un pseudo Signal).');
    const a = { id: newId(), site: site(req.body.site) ? req.body.site : DEFAULT_SITE, kind: oneOf(req.body.kind, ['propose', 'cherche'], 'propose'), cat: oneOf(req.body.cat, Object.keys(CATS), 'autre'), title, text, nick, at: now(), expires: new Date(Date.now() + ENTRAIDE_DAYS * 864e5).toISOString(), secret: crypto.randomBytes(12).toString('base64url'), replies: [], reports: [] };
    db.entraide.unshift(a);
    db.entraide = db.entraide.filter((x) => new Date(x.expires).getTime() > Date.now() - 7 * 864e5).slice(0, 1000);
    save(); broadcast('entraide', {});
    res.json(pub(a, true));
  });
  app.post('/api/entraide/:id/reply', (req, res) => {
    const a = db.entraide.find((x) => x.id === req.params.id && alive(x));
    if (!a) return bad(res, 'Annonce introuvable ou expirée.', 404);
    if (limited(`entr:${visitor(req)}`, 30, 3600e3)) return bad(res, 'Trop de réponses, réessaie plus tard.', 429);
    const text = clip(req.body.text, 500);
    if (!text) return bad(res, 'Message vide.');
    if (!noContact(text)) return bad(res, 'Pas de numéro ni d’email ici : donnez plutôt un pseudo Signal ou un lieu de rendez-vous sur le campus.');
    if (a.replies.length >= 50) return bad(res, 'Trop de réponses sur cette annonce.');
    a.replies.push({ id: newId(), nick: isSystemNick(req.body.nick) ? req.body.nick : 'Anonyme', text, at: now(), author: req.body.secret && req.body.secret === a.secret, reports: [] });
    save(); broadcast('entraide', { id: a.id });
    res.json(pub(a));
  });
  app.post('/api/entraide/:id/report', (req, res) => {
    const a = db.entraide.find((x) => x.id === req.params.id);
    if (!a) return bad(res, 'Introuvable', 404);
    const v = visitor(req);
    const target = req.body.reply ? a.replies.find((r) => r.id === req.body.reply) : a;
    if (!target) return bad(res, 'Introuvable', 404);
    if (!target.reports.includes(v)) target.reports.push(v);
    if (target.reports.length >= 3) target.hidden = true; // masqué automatiquement, un·e modo peut rétablir
    save(); broadcast('entraide', { id: a.id });
    res.json({ ok: true });
  });
  app.delete('/api/entraide/:id', (req, res) => {
    const a = db.entraide.find((x) => x.id === req.params.id);
    if (!a || req.query.secret !== a.secret) return bad(res, 'Seul·e l’auteur·e peut supprimer son annonce.', 403);
    db.entraide = db.entraide.filter((x) => x.id !== a.id); save(); broadcast('entraide', {});
    res.json({ ok: true });
  });
  mod.get('/entraide', (req, res) => res.json(db.entraide.filter((a) => canSite(req.mod, siteOf(a))).map((a) => ({ ...pub(a), hidden: !!a.hidden, reports: a.reports.length, repliesAll: a.replies.map((r) => ({ id: r.id, nick: r.nick, text: r.text, at: r.at, hidden: !!r.hidden, reports: r.reports.length })) }))));
  mod.post('/entraide/:id/moderate', (req, res) => {
    const a = db.entraide.find((x) => x.id === req.params.id);
    if (!a) return bad(res, 'Introuvable', 404);
    if (!needSite(req, res, siteOf(a))) return;
    const target = req.body.reply ? a.replies.find((r) => r.id === req.body.reply) : a;
    if (!target) return bad(res, 'Introuvable', 404);
    if (req.body.action === 'delete' && !req.body.reply) db.entraide = db.entraide.filter((x) => x.id !== a.id);
    else { target.hidden = req.body.action !== 'restore'; if (req.body.action === 'restore') target.reports = []; }
    save(); audit(req.mod, `entraide : ${req.body.action}`, (target.title || target.text || '').slice(0, 60), siteOf(a)); broadcast('entraide', {});
    res.json({ ok: true });
  });

  return { onBuilding, sightingSummary: summary, remindSightings };
}
