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

  Object.assign(MODV, { journal: modJournal, moi: modMe });
})();
