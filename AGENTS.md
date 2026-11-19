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

## Passation (2026-11-18, fin de session Claude → relais à Copilot)
**Dernier commit de Claude : voir `git log -15`.** Tout est poussé, rien en cours de modification.

### En ligne
- Production : **https://leoadmin69.onrender.com** (Render « Lyon1-ladoua-en-lutte », `srv-dbu3je68bjmc73a7vt1g`,
  runtime Node, `rootDir` = `lyon1-lutte`, build `npm ci`, start `npm start`, déploiement auto à chaque push).
  C'est l'adresse définitive (décision admin) : ne pas changer d'adresse, ne pas créer d'autre service.
- Base : Supabase Storage (bucket privé, fichier `db.json` + médias), branchée sur Render via `SUPABASE_URL` /
  `SUPABASE_SERVICE_KEY`. Au 18/11 : 44 bâtiments, 144 téléphones abonnés, 11 comptes modo, 7 sites.
- Telegram (bot + chaîne @ladoualyon1) et IA (Gemini, Groq) branchés.

### Fait pendant cette session
- Audit complet par 3 agents + PR #2 Copilot (fusionnée) : failles corrigées (médias inter-sites, droits du compte
  piquet dans le chat), liste noire, annulation sans écrasement, signalements en caméra seule, limite wifi campus,
  photo du piquet visible par les modos (fiche bâtiment → « 📷 Voir la photo du piquet »), chat plein écran iPhone,
  barre latérale bureau, fautes et textes (« compte piquet », « selon les personnes sur place »), guide PDF, rouge foncé
  sous texte blanc.
- Compte piquet : écran calqué sur la page publique Bâtiments, caméra directe, aucun import.
- Doublon Render « ladoua-en-lutte » supprimé. `redirect.js` prêt mais NON utilisé (seulement si changement d'adresse un jour).
- `tools/ops.mjs` (health, status, deploy, env, setenv, backup, restore) + `.github/workflows/copilot-setup-steps.yml`.

### Bloqué / en attente de l'admin
- **Accès Copilot à la production** : l'admin doit ajouter dans GitHub → Settings → Environments → `copilot` les
  secrets `RENDER_API_KEY`, `RENDER_SERVICE_ID` (= `srv-dbu3je68bjmc73a7vt1g`), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  puis autoriser `api.render.com`, `*.supabase.co`, `leoadmin69.onrender.com` dans le pare-feu de Copilot
  (Settings → Copilot → Coding agent). Sans ça, `tools/ops.mjs` répond « variable manquante » : le dire à l'admin, ne pas contourner.
- **Supabase pour Claude** : en attente d'une clé dédiée (nouvelle clé `sb_secret_…`, pas celle du site) et de
  l'adresse du projet. Ne jamais lire les clés du site depuis Render pour s'en servir ailleurs.
- **Blueprint Render « Lyon1 »** (auto-sync sur `render.yaml`) : c'est lui qui a créé le doublon. Ne pas modifier
  `render.yaml` ; conseiller à l'admin de le déconnecter (Render → Blueprints → Lyon1, en gardant le service).
- **Clé Render** : si l'admin a réutilisé une clé déjà collée dans un chat, elle doit être révoquée et recréée.

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
PWA gratuite « Lyon 1 · La Doua en lutte » (dossier `lyon1-lutte/`) : infos de la mobilisation étudiante
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
- 2026-11 : remise à zéro déplacée de 5 h à 22 h (elle effaçait les statuts de la journée).
- 2026-11 : comptes piquet avec photo obligatoire, recherche et ajout de bâtiments (Copilot), écran corrigé (Claude).
- 2026-11 : compte piquet = écran calqué sur la page publique Bâtiments (pas d'onglets ni d'en-tête modo) ; toucher un bâtiment ouvre la caméra, puis on choisit l'état sur la photo. Aucun import possible.
- 2026-11 : comptes piquet PARTAGÉS (l'admin a diffusé 5 liens à tout le monde) : limites et traçage par téléphone (pas par compte), un·e modo peut bloquer le téléphone d'une photo fausse, l'admin débloque tout dans 👥 Comptes.
- 2026-11 : compte piquet « un geste » : la caméra affiche 🔴 🟠 🟢 (photo + envoi d'un coup) et des notes toutes prêtes (liste TERRAIN_NOTES dans server.js, pas de texte libre ni d'info tactique) ; une maj piquet sans note efface l'ancienne note.
- 2026-11-19 : stories Instagram (Copilot) : mêmes règles que le canal (nom de bâtiment exact, flashs au format modo, journal via audit()). Le contenu lu par l'IA est publié sur le site SANS notification à tous ni Telegram (une erreur de lecture ne doit pas partir sur 150 téléphones) : les modos relaient. Ne pas modifier render.yaml (Blueprint auto-sync).
- 2026-11-19 : alerte modo dès le 1er signalement avec photo (SIGHT_MOD_ALERT, défaut 1) ; l'affichage public « selon les personnes sur place » reste à 3 non validés en 5 min. Remise à 22 h : la note de la veille est mise de côté (yesterdayNote). Le compte piquet qui touche l'onglet Bâtiments reste sur son écran.
- 2026-11 : lecture du canal Instagram (Copilot) : désactivée par défaut, clé IA obligatoire, noms de bâtiments exacts
  seulement, rien n'est publié si Instagram demande une connexion.
