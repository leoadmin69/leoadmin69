// « On en parle » : propositions anonymes, soutiens par camp, modifications, et un « mode calme » qui guide par des questions.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAMP = {
  bloc: { label: 'Pour continuer le blocus', short: 'continuer le blocus' },
  anti: { label: 'Pour reprendre les cours', short: 'reprendre les cours' },
  entre: { label: 'Entre les deux', short: 'entre les deux' },
  nsp: { label: 'Je préfère ne pas dire', short: 'sans avis déclaré' },
};
const state = { props: [], myCamp: null, sort: 'bridge', open: new Set() };

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200); }
async function api(path, body) {
  const opt = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined };
  let r = await fetch(path, opt);
  if (r.status === 428) r = await fetch(path, opt); // le site pose d'abord un cookie anonyme
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erreur, réessaie.');
  return j;
}
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'à l’instant'; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`; if (s < 86400) return `il y a ${Math.round(s / 3600)} h`; return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };

// ---- Ton : mêmes règles que le serveur, mais en direct et avec douceur
const ATTACKS = /\b(fachos?|fascistes?|gauchiasses?|gauchistes?|casseurs?|terroristes?|connards?|abrutis?|idiots?|debiles?|nazis?|traitres?|collabos?|bolcheviks?|wokistes?|bourges?|faineants?|parasites?)\b/i;
function toneHint(t) {
  if (!t) return '';
  const plain = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (ATTACKS.test(plain)) return '🕊️ Parle de l’idée, pas des personnes : essaie sans étiquette.';
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length > 25 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.5) return '🕊️ En majuscules, ça se lit comme un cri : écris normalement.';
  if (/[!?]{3,}/.test(t)) return '🕊️ Un seul point d’exclamation suffit.';
  if (/\b(vous|ils|elles)\s+(êtes|etes|sont)\s+(des|tous|toutes)\b/i.test(t)) return '🕊️ « Vous êtes tous… » braque l’autre camp. Essaie « je crains que… » ou « je propose que… ».';
  return '';
}
function watchTone(root) {
  $$('textarea, input[type=text]', root).forEach((el) => {
    const box = el.parentElement.querySelector('.tone');
    if (!box) return;
    el.addEventListener('input', () => { const h = toneHint(el.value); box.textContent = h; box.classList.toggle('on', !!h); });
  });
}

// ---- Fenêtre
function sheet(html, setup) {
  const root = $('#sheet');
  root.innerHTML = `<div class="back"><div class="panel" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  const opened = Date.now();
  $('.back', root).onclick = (e) => { if (e.target.classList.contains('back') && Date.now() - opened > 500) close(); };
  setup?.($('.panel', root), close);
}

// ---- Camp (une seule fois)
function renderCamp() {
  const box = $('#camp');
  if (state.myCamp) { box.innerHTML = `<p class="small muted">Tu t’es situé·e : <span class="tag ${state.myCamp}">${esc(CAMP[state.myCamp].label)}</span> · c’est anonyme, et ça sert juste à montrer les idées qui rassemblent.</p>`; return; }
  box.innerHTML = `<div class="card"><b>Où te situes-tu aujourd’hui ?</b>
    <div class="small muted">Une seule fois, anonyme. Ça permet de voir les idées soutenues <b>des deux côtés</b>. Tout le monde peut proposer et soutenir, quel que soit son choix.</div>
    <div class="camps">${Object.entries(CAMP).map(([k, c]) => `<button data-camp="${k}"><span class="tag ${k}">${esc(c.label)}</span></button>`).join('')}</div></div>`;
  box.onclick = (e) => {
    const k = e.target.closest('[data-camp]')?.dataset.camp;
    if (!k) return;
    if (!confirm(`Tu te situes « ${CAMP[k].label} » ? Ce choix ne pourra plus être changé (pour éviter les faux soutiens).`)) return;
    state.myCamp = k; try { localStorage.setItem('ens-camp', k); } catch {}
    renderCamp(); toast('Merci 🙏 Tu peux proposer et soutenir des idées.');
  };
}

// ---- Liste
function meter(t) {
  const row = (k) => {
    const s = t.soutien[k], v = t.vivre[k], n = s + v;
    const max = Math.max(1, ...['bloc', 'anti'].map((c) => t.soutien[c] + t.vivre[c]));
    return `<div class="row"><span class="tag ${k}">${esc(CAMP[k].short)}</span><span class="bar"><i class="s" style="width:${(s / max) * 100}%"></i><i class="v" style="width:${(v / max) * 100}%"></i></span><span class="muted">${n}</span></div>`;
  };
  return `<div class="meter">${row('bloc')}${row('anti')}<div class="small muted">Plein : « je soutiens » · clair : « je peux vivre avec »${t.soutien.entre + t.vivre.entre + t.soutien.nsp + t.vivre.nsp ? ` · + ${t.soutien.entre + t.vivre.entre + t.soutien.nsp + t.vivre.nsp} sans camp` : ''}</div></div>`;
}
function reactBtns(x) {
  return `<div class="react">
    <button class="btn small ${x.mine === 'soutien' ? 'on' : ''}" data-react="${x.id}" data-kind="soutien">👍 Je soutiens</button>
    <button class="btn small ${x.mine === 'vivre' ? 'on' : ''}" data-react="${x.id}" data-kind="vivre">🤝 Je peux vivre avec</button>
    <button class="btn small" data-report="${x.id}" aria-label="Signaler">⚑</button></div>`;
}
function propHtml(p) {
  const pont = p.bridge >= 3;
  return `<article class="card prop" id="p-${p.id}">
    <div class="small muted">Idée n°${p.num} · ${esc(ago(p.at))}${p.camp ? ` · proposée par quelqu’un <span class="tag ${p.camp}">${esc(CAMP[p.camp]?.short || '')}</span>` : ''} ${pont ? '<span class="tag pont">🌉 rassemble les deux camps</span>' : ''}</div>
    <h3>${esc(p.title)}</h3>
    ${p.text ? `<p>${esc(p.text)}</p>` : ''}
    <div class="gains"><div class="gain bloc"><b>Ce que ça apporte à celles et ceux qui veulent continuer le blocus</b>${esc(p.gainB)}</div><div class="gain anti"><b>Ce que ça apporte à celles et ceux qui veulent reprendre les cours</b>${esc(p.gainA)}</div></div>
    ${p.risk ? `<p class="risk">⚖️ Ce que ça demande ou risque : ${esc(p.risk)}</p>` : ''}
    ${meter(p.tally)}
    ${reactBtns(p)}
    <div class="amends"><details ${state.open.has(p.id) ? 'open' : ''} data-amends="${p.id}"><summary>✏️ ${p.amends.length ? `${p.amends.length} modification(s) proposée(s)` : 'Proposer une modification'}</summary>
      ${p.amends.map((a) => `<div class="amend"><div class="sum">Résumé de l’idée par cette personne : « ${esc(a.summary)} »</div><p><b>Modification :</b> ${esc(a.text)}</p><p class="small"><b>Pourquoi ça peut convenir aux deux :</b> ${esc(a.why)}</p>${a.bridge >= 3 ? '<span class="tag pont">🌉 rassemble</span>' : ''}${meter(a.tally)}${reactBtns(a)}</div>`).join('')}
      <button class="btn small" data-amend="${p.id}" style="margin-top:6px">✏️ Proposer une modification</button></details></div>
  </article>`;
}
function renderList() {
  const sorted = [...state.props].sort((a, b) => {
    if (state.sort === 'recent') return b.at.localeCompare(a.at);
    const tot = (x) => Object.values(x.tally.soutien).reduce((s, n) => s + n, 0) + Object.values(x.tally.vivre).reduce((s, n) => s + n, 0);
    if (state.sort === 'top') return tot(b) - tot(a) || b.at.localeCompare(a.at);
    return b.bridge - a.bridge || tot(b) - tot(a) || b.at.localeCompare(a.at);
  });
  $('#list').innerHTML = sorted.map(propHtml).join('') || '<div class="card empty">Pas encore d’idée. Lance la première 🙂<br><span class="small">Exemple : « Lever le blocus seulement si la présidence signe qu’il n’y aura pas d’examens pendant les vacances. »</span></div>';
}
async function load() {
  try {
    const r = await api('/api/ensemble');
    state.props = r.props;
    if (r.myCamp) { state.myCamp = r.myCamp; try { localStorage.setItem('ens-camp', r.myCamp); } catch {} }
    else try { state.myCamp = localStorage.getItem('ens-camp'); } catch {}
    renderCamp(); renderList();
  } catch (e) { $('#list').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
const needCamp = () => { if (state.myCamp) return true; toast('Dis d’abord où tu te situes (en haut, une seule fois).'); $('#camp').scrollIntoView({ behavior: 'smooth' }); return false; };

// ---- Proposer une idée (mode calme : une question à la fois)
const STEPS = [
  { k: 'title', q: 'Ton idée en une phrase', hint: 'Commence par « Je propose que… ». Simple et concret.', ph: 'Je propose que…', input: true, min: 8 },
  { k: 'text', q: 'Explique-la en quelques lignes', hint: 'Comment ça marcherait concrètement ? (facultatif)', ph: 'Concrètement…', min: 0 },
  { k: 'gainB', q: 'Qu’est-ce que ça apporte à celles et ceux qui veulent continuer le blocus ?', hint: 'Mets-toi à leur place : qu’est-ce qui les rassurerait ?', ph: 'Pour eux, ça permet de…', min: 10 },
  { k: 'gainA', q: 'Qu’est-ce que ça apporte à celles et ceux qui veulent reprendre les cours ?', hint: 'Pense aussi aux étudiant·es étrangers, aux boursiers, aux stages…', ph: 'Pour eux, ça permet de…', min: 10 },
  { k: 'risk', q: 'Qu’est-ce que ça demande, ou qu’est-ce qui pourrait coincer ?', hint: 'Être honnête sur les limites rend l’idée plus crédible. (facultatif)', ph: 'Il faudrait que…', min: 0 },
];
function openPropose() {
  if (!needCamp()) return;
  const data = {};
  let i = 0;
  const step = () => {
    const s = STEPS[i];
    $('#sheet .panel').innerHTML = `
      <div class="steps">${STEPS.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="calm">🕊️ <b>Mode calme</b> : une question à la fois. Écris comme si la personne en face était de l’autre camp, et que tu voulais la convaincre.</div>
      <div class="field"><label for="f">${esc(s.q)}</label><div class="hint">${esc(s.hint)}</div>
        ${s.input ? `<input type="text" id="f" maxlength="140" placeholder="${esc(s.ph)}" value="${esc(data[s.k] || '')}">` : `<textarea id="f" maxlength="1500" placeholder="${esc(s.ph)}">${esc(data[s.k] || '')}</textarea>`}
        <div class="tone"></div></div>
      ${i === STEPS.length - 1 ? '<label class="small" style="display:flex;gap:8px;margin:0 0 14px"><input type="checkbox" id="ok"> Je me suis relu·e : quelqu’un de l’autre camp peut lire ça sans se sentir attaqué.</label>' : ''}
      <div class="row-btns"><button class="btn" id="back">${i ? '← Retour' : 'Annuler'}</button><button class="btn primary" id="next" style="width:auto">${i === STEPS.length - 1 ? 'Publier' : 'Suivant →'}</button></div>`;
    const panel = $('#sheet .panel');
    watchTone(panel);
    const f = $('#f', panel); f.focus();
    $('#back', panel).onclick = () => { data[s.k] = f.value; if (!i) return ($('#sheet').innerHTML = ''); i--; step(); };
    $('#next', panel).onclick = async () => {
      data[s.k] = f.value.trim();
      if (data[s.k].length < s.min) return toast(s.min >= 10 ? 'Une ou deux phrases suffisent, mais c’est important 🙂' : 'Écris ton idée en une phrase.');
      if (toneHint(data[s.k])) return toast('Reformule un peu avant de continuer 🕊️');
      if (i < STEPS.length - 1) { i++; return step(); }
      if (!$('#ok', panel).checked) return toast('Coche la case après t’être relu·e 🙂');
      try { await api('/api/ensemble/props', { ...data, camp: state.myCamp }); $('#sheet').innerHTML = ''; toast('Merci 🙏 Ton idée est en ligne.'); state.sort = 'recent'; $$('#sort button').forEach((b) => b.classList.toggle('on', b.dataset.s === 'recent')); load(); }
      catch (e) { toast(e.message); }
    };
  };
  sheet('', () => step());
}

// ---- Proposer une modification (on résume d'abord l'idée de l'autre)
function openAmend(id) {
  if (!needCamp()) return;
  const p = state.props.find((x) => x.id === id);
  if (!p) return;
  sheet(`<div class="calm">🕊️ <b>Avant de modifier, on écoute.</b> Résume l’idée n°${p.num} avec tes mots : c’est la règle ici, et ça évite les malentendus.</div>
    <p class="small muted">« ${esc(p.title)} »</p>
    <div class="field"><label for="sum">1. Si je comprends bien, cette idée propose…</label><textarea id="sum" maxlength="300" placeholder="Si je comprends bien, l’idée est de…"></textarea><div class="tone"></div></div>
    <div class="field"><label for="txt">2. Ma modification</label><div class="hint">Qu’est-ce que tu changerais ou ajouterais pour que ce soit plus acceptable ?</div><textarea id="txt" maxlength="1200" placeholder="Je propose d’ajouter / de changer…"></textarea><div class="tone"></div></div>
    <div class="field"><label for="why">3. Pourquoi ça peut convenir aux deux camps ?</label><textarea id="why" maxlength="600" placeholder="Pour ceux qui veulent continuer le blocus… et pour ceux qui veulent reprendre…"></textarea><div class="tone"></div></div>
    <div class="row-btns"><button class="btn" id="cancel">Annuler</button><button class="btn primary" id="send" style="width:auto">Publier</button></div>`, (root, close) => {
    watchTone(root);
    $('#cancel', root).onclick = close;
    $('#send', root).onclick = async () => {
      const body = { summary: $('#sum', root).value.trim(), text: $('#txt', root).value.trim(), why: $('#why', root).value.trim(), camp: state.myCamp };
      if ([body.summary, body.text, body.why].some(toneHint)) return toast('Reformule un peu avant de publier 🕊️');
      try { await api(`/api/ensemble/props/${encodeURIComponent(id)}/amend`, body); close(); state.open.add(id); toast('Merci 🙏 Ta modification est en ligne.'); load(); }
      catch (e) { toast(e.message); }
    };
  });
}

// ---- Clics
$('#new').onclick = openPropose;
$('#sort').onclick = (e) => { const s = e.target.closest('[data-s]')?.dataset.s; if (!s) return; state.sort = s; $$('#sort button').forEach((b) => b.classList.toggle('on', b.dataset.s === s)); renderList(); };
$('#list').addEventListener('toggle', (e) => { const id = e.target.dataset?.amends; if (id) (e.target.open ? state.open.add(id) : state.open.delete(id)); }, true);
$('#list').onclick = async (e) => {
  const r = e.target.closest('[data-react]');
  if (r) {
    if (!needCamp()) return;
    const on = r.classList.contains('on');
    try { await api(`/api/ensemble/${encodeURIComponent(r.dataset.react)}/react`, { kind: on ? null : r.dataset.kind, camp: state.myCamp }); load(); }
    catch (err) { toast(err.message); }
    return;
  }
  const a = e.target.closest('[data-amend]');
  if (a) return openAmend(a.dataset.amend);
  const rep = e.target.closest('[data-report]');
  if (rep && confirm('Signaler ce texte aux modos (insulte, attaque, info personnelle) ?')) {
    try { await api(`/api/ensemble/${encodeURIComponent(rep.dataset.report)}/report`, {}); toast('Merci, les modos vont regarder.'); } catch (err) { toast(err.message); }
  }
};

// ---- Direct : les nouvelles idées et soutiens arrivent tout seuls (sauf pendant qu'on écrit)
let pending = null;
try {
  const es = new EventSource('/api/live');
  es.addEventListener('ensemble', () => { clearTimeout(pending); pending = setTimeout(() => { if (!$('#sheet').innerHTML) load(); }, 1500); });
} catch {}
fetch('/api/hit', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'browser' }) }).catch(() => {}).finally(load);
