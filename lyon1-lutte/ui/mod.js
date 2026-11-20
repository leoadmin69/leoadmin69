// =====================================================================
// Espace modo — code chargé UNIQUEMENT après connexion.
// Servi par la route protégée /api/mod/ui.js (voir server.js) : un visiteur
// anonyme ne reçoit JAMAIS ce fichier. C'est ici que va, petit à petit, tout
// ce qui n'a pas besoin d'être dans le code public (outils modo/admin).
//
// Pattern (à suivre par Claude ET Copilot, pour ne rien casser) :
//   1. Couper une fonction mod* depuis public/app.js (définition entière).
//   2. La coller ici, à l'intérieur de la fonction ci-dessous.
//   3. L'ajouter dans Object.assign(MODV, { <onglet>: <fonction> }).
//   4. La retirer de l'objet `localFn` dans viewModo (public/app.js).
//   5. Tester : connexion modo + l'onglet déplacé + une page publique.
// Les fonctions ici partagent le même scope global que app.js : elles peuvent
// appeler esc, api, act, $, $$, state, render, toast, siteList, etc.
// Ne déplacer une fonction que si elle n'est PAS aussi utilisée par une vue
// publique (ex. pollHtml, pollTimeline, mediaHtml restent dans app.js).
// =====================================================================
(function () {
  const MODV = (window.MODV = window.MODV || {});

  async function modJournal(el) {
    const list = await api('/api/mod/audit');
    el.innerHTML = `<div class="terminal"><div class="bar"><i></i><i></i><i></i><span>audit.log</span></div><div class="body" style="max-height:none">${list.map((a) => `<div class="line"><span class="t">[${esc(fmt(a.at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}]</span> ${a.siteName ? `<b>[${esc(a.siteName)}]</b> ` : ''}${esc(a.by)} (${esc(a.org)}) · ${esc(a.action)} · ${esc(a.detail)}</div>`).join('') || '<div class="line">vide</div>'}</div></div>`;
  }

  function modMe(el) {
    el.innerHTML = `
    <div class="card" style="max-width:460px"><form class="form" id="pw">
      <div class="kicker">Changer mon mot de passe</div>
      <div class="field"><input type="password" id="pc" autocomplete="current-password" placeholder="Mot de passe actuel" required></div>
      <div class="field"><input type="password" id="pn" autocomplete="new-password" minlength="10" placeholder="Nouveau (10 caractères min.)" required></div>
      <button class="btn">Changer</button></form></div>
    <button class="btn ghost" id="logout" style="margin-top:14px">Se déconnecter</button>`;
    $('#pw').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/password', { method: 'POST', body: { current: $('#pc').value, next: $('#pn').value } }), 'Mot de passe changé.'); e.target.reset(); };
    $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.me = null; render(true); };
  }


function modDemands(el) {
  const ctx = state.data.context || {};
  el.innerHTML = `
    <details class="card"><summary class="kicker" style="cursor:pointer">✍️ Texte « ${esc(ctx.title || 'Le contexte')} » (en haut de la page)</summary>
      <form class="form" id="ctxf" style="margin-top:10px">
        <div class="field"><label>Titre</label><input type="text" id="cxt" maxlength="80" value="${esc(ctx.title || 'Le contexte')}"></div>
        <div class="field"><label>Texte (une ligne vide entre deux paragraphes)</label><textarea id="cxx" style="min-height:220px">${esc(ctx.text || '')}</textarea></div>
        <div class="field"><label>Appel en gros (bandeau rouge)</label><input type="text" id="cxc" maxlength="300" value="${esc(ctx.call || '')}"></div>
        <div class="field"><label>Texte de fin</label><textarea id="cxe">${esc(ctx.closing || '')}</textarea></div>
        <div class="field"><label>Source / précision</label><input type="text" id="cxs" maxlength="600" value="${esc(ctx.source || '')}"></div>
        <button class="btn small">Enregistrer</button>
      </form></details>
    <div class="card"><form class="form" id="df">
      <div class="kicker">Nouvelle revendication</div>
      <div class="field"><input type="text" id="dt" maxlength="160" required placeholder="Intitulé court"></div>
      <div class="field"><input type="text" id="dc" maxlength="60" list="dcats" placeholder="Catégorie (ex : Bourses, Logement, Examens)"><datalist id="dcats">${[...new Set(state.data.demands.map((d) => d.category))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><textarea id="dx" maxlength="2000" placeholder="Explication (facultatif)"></textarea></div>
      <button class="btn">Ajouter</button></form></div>
    <h2 class="section">Revendications</h2>
    <div class="list">${state.data.demands.map((d) => `<div class="row" data-id="${esc(d.id)}"><div class="grow"><div class="title">${esc(d.title)}</div><div class="sub">${esc(d.category)} · ✊ ${d.support}</div></div>
      <select data-status style="width:auto">${Object.entries(DEMAND_STATUS).map(([k, [l]]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn" data-del>${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucune.</div>'}</div>`;
  $('#ctxf').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/context', { method: 'PUT', body: { title: $('#cxt').value, text: $('#cxx').value, call: $('#cxc').value, closing: $('#cxe').value, source: $('#cxs').value } }), 'Texte enregistré.'); await refresh(); };
  $('#df').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/demands', { method: 'POST', body: { title: $('#dt').value, category: $('#dc').value, text: $('#dx').value } }), 'Ajoutée.'); await refresh(); render(true); };
  el.querySelector('.list').onchange = (e) => { if (e.target.matches('[data-status]')) act(() => api(`/api/mod/demands/${e.target.closest('.row').dataset.id}`, { method: 'PUT', body: { status: e.target.value, version: state.raw.demands.find((x) => x.id === e.target.closest('.row').dataset.id)?.updatedAt } }), 'Statut mis à jour.'); };
  el.querySelector('.list').onclick = async (e) => { if (e.target.closest('[data-del]') && confirm('Supprimer ?')) { await act(() => api(`/api/mod/demands/${e.target.closest('.row').dataset.id}`, { method: 'DELETE' }), 'Supprimée.'); await refresh(); render(true); } };
}

function modContacts(el) {
  el.innerHTML = `
    <div class="card"><form class="form" id="cf">
      <div class="kicker">Ajouter un contact (« Parler à qui ? »)</div>
      <div class="field"><input type="text" id="cn" maxlength="100" required placeholder="Nom du syndicat / collectif"></div>
      <div class="field"><input type="text" id="cr" maxlength="160" placeholder="Rôle (ex : aide juridique, permanence, soutien psy)"></div>
      <div class="field"><input type="text" id="ch" maxlength="300" placeholder="Comment les joindre (ex : permanence lundi 12h, local Thémis)"></div>
      <div class="field"><input type="text" id="cl" maxlength="300" placeholder="Lien : https://…, mailto:… ou tel:…"></div>
      <button class="btn">Ajouter</button></form></div>
    <div class="list" style="margin-top:14px">${state.data.contacts.map((c) => `<div class="row"><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.role)} ${esc(c.how)}</div></div><button class="icon-btn" data-del="${esc(c.id)}">${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucun.</div>'}</div>`;
  $('#cf').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/contacts', { method: 'POST', body: { name: $('#cn').value, role: $('#cr').value, how: $('#ch').value, link: $('#cl').value } }), 'Ajouté.'); await refresh(); render(true); };
  el.querySelector('.list').onclick = async (e) => { const id = e.target.closest('[data-del]')?.dataset.del; if (id && confirm('Supprimer ?')) { await act(() => api(`/api/mod/contacts/${id}`, { method: 'DELETE' }), 'Supprimé.'); await refresh(); render(true); } };
}

  Object.assign(MODV, { journal: modJournal, moi: modMe, revendications: modDemands, contacts: modContacts });
})();
