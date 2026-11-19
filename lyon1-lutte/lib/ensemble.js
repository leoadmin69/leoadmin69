// « On en parle » : espace NEUTRE et anonyme pour proposer des idées de sortie du blocage.
// Pas de vote : on soutient (« je soutiens » / « je peux vivre avec »), on propose des modifications, et on voit
// d'abord les idées qui rassemblent LES DEUX camps. Chaque proposition doit dire ce qu'elle apporte à chaque camp.
import crypto from 'node:crypto';
import { db, save, newId, now } from './store.js';
import { SECRET, parseCookies } from './auth.js';
import { findBanned } from './moderation.js';

const CAMPS = ['bloc', 'anti', 'entre', 'nsp']; // pour le blocus · pour reprendre les cours · entre les deux · préfère ne pas dire
const KINDS = ['soutien', 'vivre'];

// Ton : on refuse les insultes (liste noire du chat), les MAJUSCULES et les attaques contre des personnes
const ATTACKS = /\b(fachos?|fascistes?|gauchiasses?|gauchistes?|casseurs?|terroristes?|connards?|abrutis?|idiots?|debiles?|nazis?|traitres?|collabos?|bolcheviks?|wokistes?|bourges?|fainéants?|faineants?|parasites?)\b/i;
export function toneIssue(text) {
  const t = String(text || '');
  if (findBanned(t)) return 'Ton message contient un mot interdit : reformule sans insulte.';
  if (ATTACKS.test(t.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return 'Parle de l’idée, pas des personnes : retire les étiquettes (« fachos », « casseurs »…).';
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length > 25 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.5) return 'Évite d’écrire en majuscules : ça se lit comme si tu criais.';
  if (/[!?]{3,}/.test(t)) return 'Un seul point d’exclamation suffit 🙂';
  return null;
}

export function registerEnsemble(app, mod, ctx) {
  const { bad, clip, limited, visitor, audit, broadcast } = ctx;
  db.ensemble ||= { props: [], camps: {} };
  db.ensemble.camps ||= {};
  const dev = (req) => {
    const d = parseCookies(req.headers.cookie).l1_dev;
    return /^[A-Za-z0-9_-]{20,64}$/.test(d || '') ? crypto.createHmac('sha256', SECRET).update(`ensemble|${d}`).digest('base64url').slice(0, 20) : null;
  };
  const age = (req) => Date.now() - (req.devBorn || Date.now());
  // le camp est déclaré une fois par téléphone (on ne peut pas changer pour faire croire à un soutien « de l'autre camp »)
  const campOf = (req, wanted) => {
    const d = dev(req);
    if (!d) return null;
    if (!db.ensemble.camps[d] && CAMPS.includes(wanted)) { db.ensemble.camps[d] = wanted; save(); }
    return db.ensemble.camps[d] || null;
  };
  const tally = (supports) => {
    const out = { soutien: { bloc: 0, anti: 0, entre: 0, nsp: 0 }, vivre: { bloc: 0, anti: 0, entre: 0, nsp: 0 } };
    for (const s of Object.values(supports || {})) if (out[s.kind]?.[s.camp] !== undefined) out[s.kind][s.camp]++;
    return out;
  };
  // « pont » : ce qui est accepté (soutien ou « je peux vivre avec ») à la fois par des pro-blocus et des anti-blocus
  const bridge = (t) => Math.min(t.soutien.bloc + t.vivre.bloc, t.soutien.anti + t.vivre.anti);
  const pub = (x, d, withAmends) => {
    const t = tally(x.supports);
    return {
      id: x.id, at: x.at, num: x.num, title: x.title, text: x.text, gainB: x.gainB, gainA: x.gainA, risk: x.risk, why: x.why, summary: x.summary,
      camp: x.camp, tally: t, bridge: bridge(t), mine: d ? x.supports?.[d]?.kind || null : null, edited: x.edited || null,
      ...(withAmends ? { amends: (x.amends || []).filter((a) => !a.hidden).map((a) => pub(a, d, false)).sort((a, b) => b.bridge - a.bridge || b.at.localeCompare(a.at)) } : {}),
    };
  };
  const visible = () => db.ensemble.props.filter((p) => !p.hidden);

  app.get('/api/ensemble', (req, res) => {
    const d = dev(req);
    res.json({ myCamp: d ? db.ensemble.camps[d] || null : null, props: visible().map((p) => pub(p, d, true)) });
  });

  const fields = (b, keys) => Object.fromEntries(keys.map(([k, n]) => [k, clip(b[k], n)]));
  app.post('/api/ensemble/props', (req, res) => {
    const d = dev(req);
    if (!d) return bad(res, 'Recharge la page et réessaie.', 428);
    const f = fields(req.body, [['title', 140], ['text', 1500], ['gainB', 600], ['gainA', 600], ['risk', 600]]);
    if (f.title.length < 8) return bad(res, 'Écris ton idée en une phrase (au moins 8 caractères).');
    if (f.gainB.length < 10 || f.gainA.length < 10) return bad(res, 'Dis ce que ton idée apporte aux DEUX camps : c’est la règle ici.');
    for (const v of Object.values(f)) { const why = toneIssue(v); if (why) return bad(res, why); }
    if (limited(`ens-p:${d}`, 3, 24 * 3600e3) || limited(`ens-pn:${visitor(req)}`, 40, 3600e3)) return bad(res, 'Tu as déjà proposé plusieurs idées aujourd’hui : laisse la place aux autres 🙂', 429);
    const camp = campOf(req, req.body.camp);
    const p = { id: newId(), num: (db.ensemble.seq = (db.ensemble.seq || 0) + 1), at: now(), ...f, camp, by: d, supports: {}, amends: [], reports: [] };
    db.ensemble.props.unshift(p);
    db.ensemble.props = db.ensemble.props.slice(0, 2000);
    save(); broadcast('ensemble', {});
    res.json(pub(p, d, true));
  });

  app.post('/api/ensemble/props/:id/amend', (req, res) => {
    const d = dev(req);
    if (!d) return bad(res, 'Recharge la page et réessaie.', 428);
    const p = visible().find((x) => x.id === req.params.id);
    if (!p) return bad(res, 'Proposition introuvable.', 404);
    const f = fields(req.body, [['summary', 300], ['text', 1200], ['why', 600]]);
    if (f.summary.length < 15) return bad(res, 'Résume d’abord la proposition en une phrase : ça montre que tu l’as comprise.');
    if (f.text.length < 10) return bad(res, 'Écris ta modification.');
    if (f.why.length < 10) return bad(res, 'Explique en quoi ta modification peut convenir aux deux camps.');
    for (const v of Object.values(f)) { const why = toneIssue(v); if (why) return bad(res, why); }
    if (limited(`ens-a:${d}`, 10, 24 * 3600e3) || limited(`ens-an:${visitor(req)}`, 100, 3600e3)) return bad(res, 'Beaucoup de modifications aujourd’hui : réessaie demain.', 429);
    const camp = campOf(req, req.body.camp);
    const a = { id: newId(), at: now(), ...f, camp, by: d, supports: {}, reports: [] };
    p.amends.unshift(a);
    p.amends = p.amends.slice(0, 200);
    save(); broadcast('ensemble', {});
    res.json(pub(p, d, true));
  });

  const find = (id) => {
    for (const p of visible()) {
      if (p.id === id) return { x: p, prop: p };
      const a = (p.amends || []).find((y) => y.id === id && !y.hidden);
      if (a) return { x: a, prop: p };
    }
    return null;
  };
  app.post('/api/ensemble/:id/react', (req, res) => {
    const d = dev(req);
    if (!d) return bad(res, 'Recharge la page et réessaie.', 428);
    const f = find(req.params.id);
    if (!f) return bad(res, 'Introuvable.', 404);
    const camp = campOf(req, req.body.camp);
    if (!camp) return bad(res, 'Dis d’abord où tu te situes (une seule fois, c’est anonyme).');
    if (limited(`ens-r:${d}`, 120, 3600e3) || limited(`ens-rn:${visitor(req)}`, 2000, 3600e3)) return bad(res, 'Doucement 🙂 réessaie dans quelques minutes.', 429);
    const kind = KINDS.includes(req.body.kind) ? req.body.kind : null;
    f.x.supports ||= {};
    if (!kind || f.x.supports[d]?.kind === kind) delete f.x.supports[d];
    else f.x.supports[d] = { kind, camp, young: age(req) < 30 * 60e3 };
    save(); broadcast('ensemble', {});
    res.json(pub(f.prop, d, true));
  });

  // Signalement : masqué après 3 signalements de téléphones connus depuis au moins 1 h (pas fabriqués à la chaîne)
  app.post('/api/ensemble/:id/report', (req, res) => {
    const d = dev(req);
    if (!d) return bad(res, 'Recharge la page et réessaie.', 428);
    const f = find(req.params.id);
    if (!f) return bad(res, 'Introuvable.', 404);
    if (limited(`ens-rep:${visitor(req)}`, 30, 3600e3)) return bad(res, 'Trop de signalements depuis ce réseau.', 429);
    f.x.reports ||= [];
    if (!f.x.reports.some((r) => r.d === d)) f.x.reports.push({ d, old: age(req) >= 3600e3, at: now() });
    if (f.x.reports.filter((r) => r.old).length >= 3) f.x.hidden = true;
    save(); broadcast('ensemble', {});
    res.json({ ok: true });
  });

  // Côté modos : tout voir, masquer ou rétablir (la modération ne juge pas les idées, seulement le respect de la charte)
  mod.get('/ensemble', (req, res) => res.json(db.ensemble.props.slice(0, 300).map((p) => ({ ...pub(p, null, false), hidden: !!p.hidden, reports: (p.reports || []).length,
    amends: (p.amends || []).map((a) => ({ ...pub(a, null, false), hidden: !!a.hidden, reports: (a.reports || []).length })) }))));
  mod.put('/ensemble/:id', (req, res) => {
    let x = null;
    for (const p of db.ensemble.props) { if (p.id === req.params.id) x = p; else x ||= (p.amends || []).find((a) => a.id === req.params.id) || null; }
    if (!x) return bad(res, 'Introuvable.', 404);
    if (req.body.hidden !== undefined) { x.hidden = !!req.body.hidden; if (!x.hidden) x.reports = []; }
    save(); audit(req.mod, x.hidden ? 'idée masquée (On en parle)' : 'idée rétablie (On en parle)', (x.title || x.text || '').slice(0, 80)); broadcast('ensemble', {});
    res.json({ ok: true });
  });
}
