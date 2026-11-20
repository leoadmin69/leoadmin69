# Cerveau commun du projet (Claude Code + GitHub Copilot)

Ce fichier est LA mémoire partagée. Claude Code le lit via `CLAUDE.md`, Copilot via
`.github/copilot-instructions.md`. Quand une règle change, on la change ICI (et nulle part ailleurs),
dans le même commit que le code.

## Règles de travail (les deux assistants)
1. **Une seule branche de travail** : `claude/lyon1-student-info-platform-ohzn3d`. C'est elle qui est déployée.
   Toujours partir de la dernière version (`git pull`) avant de modifier, et pousser dès que c'est fini.
   Pas de branche parallèle, pas de force-push, pas de PR sans demande.
2. **Vérifier avant de pousser** : `node --check server.js public/app.js lib/*.js`, puis démarrer le serveur
   (`ADMIN_PASSWORD=x DATA_DIR=/tmp/d node server.js`) et ouvrir la page touchée. Un écran qui plante = pas de push.
3. **Après chaque modif de `public/`** : augmenter `VERSION` dans `public/sw.js` (sinon les téléphones gardent l'ancienne version).
4. Messages de commit en français, courts, qui disent ce que ça change pour les gens.
5. Ajouter une ligne dans « Journal des décisions » en bas quand on prend une décision produit.
6. **Passation obligatoire** : à la fin de chaque session (Claude ou Copilot), mettre à jour la section
   « Passation » ci-dessous (fait / en cours / à faire / bloqué) et la pousser. La session suivante, quel que soit
   l'assistant, commence par lire cette section et `git log -15`. Personne ne doit avoir besoin de l'historique d'un chat.
7. Copilot (agent cloud) travaille dans une PR dont la **base est la branche de travail** ; la PR est fusionnée
   dans cette branche (jamais dans la branche par défaut du dépôt, qui est celle d'un autre projet).

## Passation (2026-11-20, mise à jour par Claude)
**Dernier commit de Claude : voir `git log -15`.** Tout est poussé, rien en cours de modification.

### Fait le 20/11 (Claude)
- **Skill instagram-agent-skill installé** (écrit des reels/légendes, ne lit pas Instagram). Ne règle pas la lecture
  auto des stories : Instagram bloque la lecture depuis l'hébergeur (réponses vides / « une erreur s'est produite »).
  Solution fiable en place : onglet 📷 Instagram → « Envoyer une capture » / « Coller un message » (l'IA lit).
- **Audit « Gemini 4 Neon » (PDF 16 p. diffusé dans le chat)** vérifié ligne par ligne. Sa « faille d'admin » (compte
  piquet → modo, image injectée, liens dangereux) est **fausse** : le serveur bloque déjà tout ça. Vrais points corrigés :
  (1) une vidéo de témoignage dont les métadonnées n'ont pas pu être retirées n'est **jamais publiée** (`m.cleaned`) ;
  (2) la liste noire ajoutée par les modos n'est plus envoyée aux téléphones (route `/api/chat-rules` = mots de base seuls) ;
  (3) texte d'anonymat plus exact ; (4) `/pow-worker.js` remis dans le cache hors-ligne.
- **IA Instagram ne publie plus rien toute seule** : tout passe par « À valider » (`IG_AUTO_PUBLISH=1` pour réactiver).
- **Séparation code modo / code public** (voir chantier ci-dessous) : 17 onglets sortis du code public, dont toute la
  détection anti-bot des votes. Restent dans le public : story, instagram (demande admin : ne pas déplacer) et situation.

### CHANTIER EN COURS À FINIR (relais Claude → Copilot) : séparer le code modo du code public
**But (demande admin) :** ne plus envoyer aux visiteurs anonymes tout le code de l'espace modo/admin.
Seul l'essentiel public reste dans `public/app.js` ; les onglets modo migrent vers `ui/mod.js`, servi **uniquement
après connexion** par la route protégée `mod.get('/ui.js')` (server.js, juste après `app.use('/api/mod', mod)`).
Les visiteurs anonymes reçoivent 401 et ne voient jamais ce code. **Ce n'est PAS du chiffrement** (impossible côté
navigateur) ; la vraie sécurité reste côté serveur. C'est juste : ne pas donner la carte de nos radars anti-bot.

**Mécanisme déjà en place et testé (ne pas le refaire) :**
- `ui/mod.js` : fichier classique (IIFE) chargé par `ensureModUI()` dans app.js, qui enregistre les vues dans
  `window.MODV` (ex. `MODV.journal`, `MODV.moi`).
- `viewModo()` (app.js) : garde le login, le shell (onglets, sites), `showPresence`, `modPushCard`. Avant de rendre
  un onglet, il fait `await ensureModUI()` puis `const fn = window.MODV[tab] || localFn[tab] || modSituation`.
  `localFn` = les onglets **pas encore déplacés** (encore dans app.js).
- app.js est un **module** : ses fonctions sont privées. Un `Object.assign(window, {...})` à la fin d'app.js expose
  les outils partagés (`$`, `api`, `esc`, `act`, `state`, `render`, `sheet`, `allSitesBox`, `pollHtml`…) pour qu'une
  fonction déplacée marche **sans être réécrite**.
- **Déjà migrés par Claude (17 onglets)** : journal, moi, contacts, revendications, sites, audience, flash
  (+ `drawFlashList`), chat, entraide, droits, agenda, cr, ensemble, blog, temoignages, comptes
  (+ `modPushSummary`, `qrImg`), **votes (`modPolls` + `pollOrder` + `pollTimeline` = toute la détection anti-bot)**.
  Le gros gain sécurité (la « carte des radars » anti-bourrage) est donc déjà hors du code public.
- **Volontairement LAISSÉS dans le code public** (`localFn` d'app.js) : `story` (📸 Story Insta) et `instagram`
  (📷 Instagram / lecture IA) — **demande admin : ne pas les déplacer**. Plus `situation` (🚧 Bâtiments), entremêlé
  avec l'écran piquet. Rappel : la lecture des stories et l'IA tournent sur le SERVEUR (`lib/instagram.js`, `lib/ai.js`),
  jamais dans le code public ; l'onglet n'est que l'affichage.
- **Il reste 2 onglets dans `localFn` (app.js), volontairement non déplacés car ENTREMÊLÉS avec des fonctions publiques :**
  - `modStory` : le moteur canvas (`openStory`, `storyCampus`, `storyFrame`, `story*`, `promo*`, `tuto*`, `SF`, `MONO`,
    `drawQR`…) est **aussi utilisé par des boutons publics** (partage/aperçu de story dans Live/Bâtiments : app.js
    appelle `openStory('campus')`, `storyCampus(...)`, `voteUrl(...)`). Ne PAS déplacer ce moteur. Au besoin, déplace
    **seulement** la fonction `modStory` (l'onglet « kit promo ») en laissant tout le moteur canvas dans app.js et
    exposé sur window (`openStory`, `voteUrl` et les générateurs qu'elle appelle). Faible intérêt, à faire en dernier.
  - `modSituation` : partage `editBuilding`, `applyChanges`, `parseQuick`, `buildingIndex`, `showUndo` avec l'écran
    piquet (`terrainQuick`/`terrainChoose`, publics). Ces helpers RESTENT dans app.js + exposés. Seul `modSituation`
    pourrait bouger. À vérifier au cas par cas.
  👉 Ces deux-là peuvent très bien **rester dans app.js** : ce sont des fonctions dont une partie sert aussi au public.
  L'objectif « ne pas livrer les radars anti-bot » est atteint. Ne te force pas à les déplacer.

**LEÇON (erreur de Claude à ne pas refaire) :** avant de déplacer une fonction/un helper, vérifie qu'AUCUNE fonction
publique (viewLive, viewBuildings, viewPolls, pollHtml, terrainQuick/Choose…) ne l'appelle. Un helper appelé par du
public (ex. `voteUrl`, `openStory`, `storyCampus`, `shrinkPhoto`, `pollHtml`, `remaining`) **reste dans app.js** et est
exposé sur window. Si tu le déplaces par erreur, app.js casse (ReferenceError dans `Object.assign(window,…)`) et TOUT
l'espace modo devient vide. En cas de doute : `grep -n "\bnomFonction\b" public/app.js` et regarde qui l'appelle.

**Pour Copilot — recette pour déplacer un onglet restant (si tu y tiens), sans rien casser :**
1. Prends la fonction `mod*` dans `localFn` (viewModo, app.js).
2. **Couper** la définition entière depuis `public/app.js`, la **coller** dans l'IIFE de `ui/mod.js`.
3. Ajouter la fonction dans `Object.assign(MODV, { <onglet>: <fn> })` (en bas de mod.js).
4. **Retirer** son entrée de l'objet `localFn` dans `viewModo` (app.js).
5. Si la fonction déplacée appelle un outil d'app.js pas encore exposé → ajouter son nom dans le `Object.assign(window, {…})`
   à la fin d'app.js. NE PAS y laisser le nom d'une fonction qui ne vit PLUS dans app.js (sinon ReferenceError au
   chargement). Attention aux helpers **partagés public+modo** (voir la LEÇON) : ils RESTENT dans app.js + exposés.
6. Monter `VERSION` dans `public/sw.js`. Vérifier (règle 2) + test navigateur : connexion modo, l'onglet déplacé rend
   quelque chose, ET une page publique marche. Zéro `pageerror` (headless chromium via `/opt/node-tools/node_modules/playwright`).
7. Vérifier qu'un visiteur **anonyme** reçoit 401 sur `/api/mod/ui.js` (déjà le cas) et que les fonctions déplacées
   ne sont plus dans le code public : `curl .../app.js | grep -c "function modXXX"` doit donner 0.
Par petits lots, un commit par lot. Ne touche pas au serveur sauf la route déjà posée.

### En ligne
- Production : **https://leoadmin69.onrender.com** (Render « Lyon1-ladoua-en-lutte », `srv-dbu3je68bjmc73a7vt1g`,
  runtime Node, `rootDir` = `lyon1-lutte`, build `npm ci`, start `npm start`, déploiement auto à chaque push).
  C'est l'adresse définitive (décision admin) : ne pas changer d'adresse, ne pas créer d'autre service.
- Base : Supabase Storage (bucket privé, fichier `db.json` + médias), branchée sur Render via `SUPABASE_URL` /
  `SUPABASE_SERVICE_KEY`. Telegram (bot + chaîne @ladoualyon1) et IA (Gemini, Groq) branchés.

### Fait le 19/11
- Votes : bourrage constaté (~10 000 faux votes sur « maintien des blocus » entre 12 h et 14 h) puis corrigé :
  cookies d'appareil signés (lib/device.js), calcul anti-bourrage (pow-worker.js), limites par réseau, votes suspects,
  minute de chaque vote + graphique, outil « 🤖 Chercher des votes de robot », suppression automatique annulable
  (rafale, bloc d'affilée, robot lent), réglage des résultats (live / après avoir voté / à la clôture), « avis indicatif ».
- Compte piquet : liens partagés publics (limites par téléphone, blocage), caméra « un geste » + notes prêtes,
  téléphone neuf (< 1 h) ne peut pas défaire une info confirmée du jour.
- Audit anti-spam et sécurité complet (voir Journal des décisions), stories Instagram de Copilot corrigées.

### En attente / à surveiller
- L'admin doit vérifier dans 🗳️ Votes le cadre « 🤖 votes retirés automatiquement » du vote « maintien des blocus »
  (Annuler si erreur) ; les votes d'avant le suivi horaire ne sont pas datés.
- Détecteurs de robot réglés prudemment pour des votes d'avis ouverts à tout le campus : ne pas les durcir sans
  l'accord de l'admin (risque de retirer de vrais votes).

### Bloqué / en attente de l'admin
- **Accès Copilot à la production** : l'admin doit ajouter dans GitHub → Settings → Environments → `copilot` les
  secrets `RENDER_API_KEY`, `RENDER_SERVICE_ID` (= `srv-dbu3je68bjmc73a7vt1g`), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  puis autoriser `api.render.com`, `*.supabase.co`, `leoadmin69.onrender.com` dans le pare-feu de Copilot
  (Settings → Copilot → Coding agent). Sans ça, `tools/ops.mjs` répond « variable manquante » : le dire à l'admin, ne pas contourner.
- **Supabase pour Claude** : en attente d'une clé dédiée (nouvelle clé `sb_secret_…`, pas celle du site) et de
  l'adresse du projet. Ne jamais lire les clés du site depuis Render pour s'en servir ailleurs.
- **Blueprint Render « Lyon1 »** (auto-sync sur `render.yaml`) : c'est lui qui a créé le doublon. Ne pas modifier
  `render.yaml` ; conseiller à l'admin de le déconnecter (Render → Blueprints → Lyon1, en gardant le service).
- **Clé Render** : nouvelle clé enregistrée le 19/11 (secret réseau Claude, environnement « Par défaut ») : `node tools/ops.mjs status` marche côté Claude.

### Idées proposées, pas encore demandées
- Bouton « Pause Telegram » dans l'admin.
- Vérifier régulièrement l'espace Supabase utilisé (plan gratuit) une fois l'accès en place.

### Décidé
- Affichage « selon les personnes sur place » à partir de 3 signalements non validés en 5 min.
- On garde l'adresse leoadmin69.onrender.com.

### Pour bien démarrer (Copilot)
1. Lire ce fichier en entier, puis `git log -15`.
2. Base de la PR = `claude/lyon1-student-info-platform-ohzn3d` (jamais la branche par défaut du dépôt).
3. Vérifier avant de pousser (règle 2), monter `VERSION` de `public/sw.js` si `public/` change.
4. En fin de tâche : mettre à jour cette section « Passation ».

### Passation Copilot (2026-11-19)
**Dernier état**
- Audit ciblé terrain/signalements/SSE/mobile réalisé sur la branche `copilot/fix-bugs-in-lyon1-lutte`.
- Corrigé : comptes piquet empêchés de relancer ou ignorer les signalements publics côté serveur et liste blanche.
- Corrigé : écrans publics/SSE ne se re-rendent plus pendant une feuille ou une caméra ouverte.
- Corrigé : cadre caméra limité à au moins 120 px afin d’éviter une vue écrasée en paysage/courte hauteur.
- Vérifié : syntaxe Node OK, serveur local démarré sur `/api/state`, page Bâtiments ouverte à 375 px.

**À faire**
- Vérifier en vrai sur iPhone les dimensions caméra en paysage et le comportement des feuilles après SSE.
- Aucun accès production utilisé dans cette session.

## Accès production (serveur, base, hébergeur)
Tout se pilote avec `node tools/ops.mjs` (dans `lyon1-lutte/`) : `health`, `status`, `deploy`, `env`, `setenv NOM=valeur`,
`backup`, `restore fichier --oui`. **Les secrets ne sont jamais dans le dépôt** ; chaque assistant les reçoit ainsi :
- **Copilot** : GitHub → Settings → Environments → `copilot` → secrets `RENDER_API_KEY`, `RENDER_SERVICE_ID`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, variable `SITE_URL`. Puis Settings → Copilot → Coding agent → pare-feu :
  autoriser `api.render.com`, `*.supabase.co`, `leoadmin69.onrender.com`. L'environnement est préparé par
  `.github/workflows/copilot-setup-steps.yml`.
- **Claude Code (cloud)** : clé Render déjà enregistrée en « secret réseau » de l'environnement « Par défaut » (le proxy
  l'injecte). Lancer l'outil avec `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt RENDER_API_KEY=proxy-injected`.
  Autres clés : demandées avec le formulaire sécurisé, jamais collées dans le chat.
- **Une clé collée dans un chat (Claude, Copilot, n'importe où) est grillée** : la révoquer et en créer une nouvelle.
- **Données privées** : une sauvegarde (`backup`) contient des données personnelles : jamais dans le dépôt
  (`backups/` est ignoré par git), jamais envoyée ailleurs. Toujours faire `backup` avant `restore` ou une migration.
- **Déploiement** : Render redéploie tout seul à chaque push sur la branche de travail (dossier `lyon1-lutte/`).
  `deploy` sert à forcer un redéploiement (ex. après `setenv`). Après un déploiement : `health`, puis vérifier le site.

## Le projet
PWA gratuite « Lyon 1 · La Doua au courant » (anciennement « La Doua en lutte ») (dossier `lyon1-lutte/`) : infos de la mobilisation étudiante
(bâtiments bloqués, flash infos, agenda, votes, chat, témoignages, entraide…). Public : étudiant·es et personnels, sur téléphone (iPhone surtout).
- Hébergement : Render gratuit (`render.yaml` à la racine, service `ladoua-en-lutte`), données dans Supabase.
- Node 22 ESM + Express 4, stockage JSON unique `lib/store.js` (miroir Supabase), temps réel SSE `/api/live` + `broadcast()`.
- Front : SPA vanilla `public/app.js` (routes `#/…`), `public/style.css`, service worker `public/sw.js`.
- Rôles : `admin` (tout, tous les sites) · `mod` (ses sites) · `terrain` = compte piquet (bâtiments seulement,
  liste blanche `TERRAIN_OK` dans `server.js`, photo obligatoire).
- Sites : `lib/sites.js` (`canSite`, `needSite`, `ALL_SITES = 'all'` réservé à l'admin).
- Modules : `lib/extras.js` (signalements photo, entraide, frise, droits), `lib/snaps.js` (photos éphémères),
  `lib/push.js` (notifs Web Push), `lib/telegram.js`, `lib/moderation.js` (liste noire du chat),
  `lib/audience.js`, `lib/instagram.js` (lecture du canal Insta, désactivée par défaut), `public/nicks.js` (pseudos).

## Règles produit (demandées par l'admin, ne pas casser)
- **Notifications téléphone d'abord**, Telegram ensuite. Lien Telegram officiel : https://t.me/ladoualyon1 — jamais le bot.
- **Aucun lien vers l'Instagram lyon1_ladoua.enlutte** (chaque modo a son propre Insta).
- Pages communes à tous les sites (pas de sélecteur) : droits, frise, témoignages, revendications, « Parler à qui ».
- **Signalement d'un bâtiment par le public : photo obligatoire** (caméra, pas d'import). Sans validation modo en 5 min,
  le bâtiment s'affiche « bloqué selon les personnes sur place » (sans notif publique). Notif aux modos du site dès le 1er signalement (photo obligatoire), puis de nouveau au seuil public de 3.
- **Compte piquet : photo obligatoire** avant tout changement de statut.
- **Remise à zéro des bâtiments à 22 h** (heure de Paris), jamais en journée. Affiché « Dernière info : … · à reconfirmer ».
- Flash info : durée 1 h / 6 h / 24 h (défaut) / 3 jours / illimité. L'admin peut viser « tous les sites » et
  envoyer une annonce officielle signée « Administration du site » (notif à tous + Telegram).
- Chat : charte à accepter, liste noire (message bloqué avant envoi), pseudos donnés par le système uniquement
  (jamais tapés), réponses par glissement à droite, réactions = stickers animés maison (pas d'emoji standard),
  aucune sélection de texte sur la page chat, photos caméra seulement, vue unique 10 s, effacées après 24 h.
- iPhone : respecter les safe areas (barre flash rouge visible sous l'encoche), champs en 16 px (pas de zoom).
- Données personnelles : rien d'identifiant en public, cookies anonymes, pas de secrets dans le dépôt (variables Render).

## Journal des décisions
- 2026-11-20 : chat, photos éphémères « 1 vue » : faille corrigée. Sans cookie d'appareil établi, chaque requête
  recevait une identité neuve → la photo pouvait être revue à l'infini. Désormais `GET /api/chat/photo/:id` refuse (428)
  un appareil fabriqué à l'instant (`req.deviceMinted`, posé dans le middleware quand aucun cookie n'est reçu) ; l'app
  réessaie une fois avec le cookie fraîchement posé (openSnapInner). Destinataire normal : 1 vue (200 puis 410).
  Les modos gardent l'accès (modération). L'aperçu dans la bulle reste un petit flou (teaser), pas la photo.
- 2026-11 : remise à zéro déplacée de 5 h à 22 h (elle effaçait les statuts de la journée).
- 2026-11 : comptes piquet avec photo obligatoire, recherche et ajout de bâtiments (Copilot), écran corrigé (Claude).
- 2026-11 : compte piquet = écran calqué sur la page publique Bâtiments (pas d'onglets ni d'en-tête modo) ; toucher un bâtiment ouvre la caméra, puis on choisit l'état sur la photo. Aucun import possible.
- 2026-11 : comptes piquet PARTAGÉS (l'admin a diffusé 5 liens à tout le monde) : limites et traçage par téléphone (pas par compte), un·e modo peut bloquer le téléphone d'une photo fausse, l'admin débloque tout dans 👥 Comptes.
- 2026-11 : compte piquet « un geste » : la caméra affiche 🔴 🟠 🟢 (photo + envoi d'un coup) et des notes toutes prêtes (liste TERRAIN_NOTES dans server.js, pas de texte libre ni d'info tactique) ; une maj piquet sans note efface l'ancienne note.
- 2026-11-19 : stories Instagram (Copilot) : mêmes règles que le canal (nom de bâtiment exact, flashs au format modo, journal via audit()). Le contenu lu par l'IA est publié sur le site SANS notification à tous ni Telegram (une erreur de lecture ne doit pas partir sur 150 téléphones) : les modos relaient. Ne pas modifier render.yaml (Blueprint auto-sync).
- 2026-11-19 : alerte modo dès le 1er signalement avec photo (SIGHT_MOD_ALERT, défaut 1) ; l'affichage public « selon les personnes sur place » reste à 3 non validés en 5 min. Remise à 22 h : la note de la veille est mise de côté (yesterdayNote). Le compte piquet qui touche l'onglet Bâtiments reste sur son écran.
- 2026-11-19 : votes en AG : la limite par réseau passe de 40 à 3000/h (tout le monde est sur le même wifi) ; le contrôle reste 1 vote par appareil. Un bulletin ne recharge plus tout le site chez tout le monde : direct regroupé toutes les 5 s, seule la page Votes se redessine (max toutes les 10 s, jamais pendant un vote).
- 2026-11-19 : votes d'avis ouverts à tout le campus (pas des votes d'AG) : anti-bourrage sans compte = calcul invisible avant chaque vote (public/pow-worker.js, jeton à usage unique lié au vote et au téléphone, VOTE_POW_BITS=17), max 100 votes/min par réseau, votes « suspects » (téléphone neuf < 2 min ET ≥ 10 votes du même réseau en 5 min) signalés aux modos qui peuvent les retirer d'un clic.
- 2026-11-19 : cookie d'appareil SIGNÉ (lib/device.js) : seul le serveur crée des appareils (max 1000/h par réseau, DEVICE_NEW_PER_HOUR), chacun a un âge (req.devBorn). Anciens cookies convertis sans perte (même identité). Usage de l'âge : vote suspect si < 30 min + rafale ; piquet : téléphone < 1 h ne peut pas changer un bâtiment confirmé aujourd'hui ; chat : seuls les appareils de plus d'1 h comptent pour masquer un message. Autres : signalement public affiché « selon les personnes sur place » seulement sur un bâtiment non renseigné ; résultats « à la clôture » cachés à tous ; verrou de connexion par identifiant + réseau ; chat 60 msg/min/réseau ; vidéos publiques 25 Mo, 300 Mo/jour d'envois publics, fichiers d'un témoignage rejeté effacés ; 30 maj/10 min par compte piquet.
- 2026-11-19 : votes : 3 réglages de résultats choisis par l'admin/modo à la création et modifiables ensuite : visibles par tous pendant le vote (live), visibles après avoir voté (voted), cachés jusqu'à la clôture (after). Plus de titre « AG … » ajouté d'office.
- 2026-11-19 : bourrage constaté sur le vote « maintien des blocus » (~10 000 faux votes entre 12 h et 14 h, pendant la fenêtre où la limite réseau était à 3000 sans cookies signés). Depuis : chaque bulletin garde la minute du vote (p.times, rien sur la personne) ; côté modo, graphique des votes par tranche de 10 min, pic anormal en orange, retrait des votes d'une tranche en 2 taps. Les votes d'avant ce suivi ne sont pas datés.
- 2026-11-19 : outil « 🤖 Chercher des votes de robot » (votes ≥ 500) : analyse de l'ordre d'arrivée des bulletins par paquets de 100 ; un bloc d'au moins 5 paquets d'affilée à 95 % sur le même choix est présélectionné ; l'admin/modo vérifie puis supprime (journalisé). Sert pour les votes d'avant le suivi horaire.
- 2026-11-19 : suppression AUTOMATIQUE des votes de robot (demande admin), annulable : (1) en direct, ≥ 60 votes de téléphones neufs (< 30 min) depuis un même réseau en 10 min dont ≥ 95 % sur le même choix ; (2) toutes les 5 min (et 30 s après démarrage), bloc d'au moins 1000 votes arrivés d'affilée à ≥ 95 % sur le même choix (votes ≥ 1000). Les votes retirés vont dans p.bot (ces téléphones ne peuvent pas revoter), les modos du site reçoivent une notif, bouton « Annuler » qui remet tout. Désactivable avec VOTE_AUTO_BOT=0.
- 2026-11-19 : (3) robot lent (votes au compte-gouttes) : toutes les 5 min, sur 3 h, si les votes de téléphones neufs (p.fresh) vont à ≥ 90 % vers un choix que les téléphones connus choisissent ≥ 30 points de moins (≥ 50 neufs, ≥ 20 connus), les votes neufs de ce choix sont retirés (annulable). Notifs « votes de robot retirés » aux modos limitées à 1 toutes les 30 min par vote.
- 2026-11-19 : page « On en parle » (#/ensemble dans le site, même look que La Doua en lutte — décision admin : le site est pour les deux camps ; serveur lib/ensemble.js, /ensemble redirige) : idées anonymes ouvertes à tous, PAS de vote ; chaque idée doit dire ce qu'elle apporte aux deux camps ; soutiens « je soutiens » / « je peux vivre avec » comptés par camp déclaré une fois par téléphone (bloc / anti / entre / nsp) ; tri « qui rassemblent » = min des soutiens des deux camps ; modifications avec résumé obligatoire de l'idée ; mode calme (une question à la fois, avertissements de ton en direct, refus serveur des insultes/étiquettes/majuscules) ; modération seulement sur la charte (onglet modo 🕊️). Dans le menu, commune à tous les sites.
- 2026-11-19 : le site s'appelle désormais « Lyon 1 · La Doua au courant » (site d'information indépendant des AG et des mouvements, pour les deux camps). Icônes refaites avec « AU COURANT ». Sur iPhone, les apps déjà installées gardent l'ancien nom et l'ancienne icône (iOS les fige) : ne pas demander de réinstaller (perte des abonnements aux notifications). Le statut de revendication « En lutte » n'est pas le nom du site et reste tel quel. Adresse inchangée.
- 2026-11-19 : l'IA Instagram (canal + stories) DÉDUIT à partir des indices (photos : chaînes, barricades, piquets, affiches ; légendes ; dates relatives ; noms de bâtiments approximatifs ramenés à la liste connue, envoyée dans le prompt avec la date de Paris) et donne confidence + evidence. Confiance ≥ 0,85 (IG_AUTO_MIN) et nom exact = publié (sans notification, mention « déduit par l'IA ») ; 0,5–0,85 ou nom approché = file « À valider » dans l'onglet modo 📷 Instagram (Publier / Écarter) ; < 0,5 = ignoré.
- 2026-11-19 : constat en production : la page web d'un canal Instagram ne contient QUE du code (le contenu se charge dans l'appli) → les « 24 messages lus » étaient du code ; filtre ajouté (plus aucun faux message). Stories : « Profil Instagram HTTP 404 » avec le compte configuré. Gemini en quota dépassé (429), Groq prend le relais. Solution fiable ajoutée : onglet 📷 Instagram → coller le texte d'un message ou envoyer une capture de story (routes /api/mod/instagram/paste et /capture), même tri sûr/probable.
- 2026-11-19 : OpenRouter ajouté (OPENROUTER_API_KEY + OPENROUTER_MODEL sur Render) : passe EN PREMIER pour les comptes rendus d'AG (texte du PDF), le texte Instagram et les images (captures, stories, si le modèle lit les images) ; Gemini puis Groq restent en secours.
- 2026-11-19 : lecture AUTOMATIQUE et PRIORITAIRE des stories (demande admin) : à chaque tour, stories d'abord (cookie INSTAGRAM_STORIES_COOKIES ou INSTAGRAM_CHANNEL_COOKIES), le canal ensuite seulement si ce n'est pas un canal de diffusion (/channel/ = illisible hors appli, ignoré sans erreur). Compte trouvé via l'ID numérique (champ admin, ou INSTAGRAM_ACCOUNT_ID), sinon recherche web puis « appli », ID gardé ensuite ; erreurs détaillées (404, cookie expiré).
- 2026-11 : lecture du canal Instagram (Copilot) : désactivée par défaut, clé IA obligatoire, noms de bâtiments exacts
  seulement, rien n'est publié si Instagram demande une connexion.
