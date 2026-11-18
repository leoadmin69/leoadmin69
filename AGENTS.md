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

## Passation (état au 2026-11-18, mis à jour par Claude)
- **Fait** : audit complet (failles médias inter-sites et droits du compte piquet dans le chat corrigées, liste noire,
  annulation sans écrasement, limite signalements wifi campus, photo du piquet visible par les modos, chat plein écran
  iPhone, barre latérale bureau, fautes et textes, guide PDF). PR #2 de Copilot fusionnée. Rouge foncé sous texte blanc.
- **Bloqué** : le site n'est PAS en ligne : `ladoua-en-lutte.onrender.com` répond « no-server » (aucun service Render).
  L'admin doit créer le service (Render → New → Blueprint → ce dépôt, branche de travail) ou donner l'adresse réelle.
  Vérifier avec `node tools/ops.mjs health`.
- **À faire** : quand le service existe, mettre `RENDER_API_KEY` / `RENDER_SERVICE_ID` dans les accès (ci-dessous),
  puis `node tools/ops.mjs status`. Bouton « Pause Telegram » dans l'admin proposé, pas encore demandé.
- **Décidé** : affichage « selon les personnes sur place » à partir de 3 signalements non validés en 5 min (confirmé par l'admin).

## Accès production (serveur, base, hébergeur)
Tout se pilote avec `node tools/ops.mjs` (dans `lyon1-lutte/`) : `health`, `status`, `deploy`, `env`, `setenv NOM=valeur`,
`backup`, `restore fichier --oui`. **Les secrets ne sont jamais dans le dépôt** ; chaque assistant les reçoit ainsi :
- **Copilot** : GitHub → Settings → Environments → `copilot` → secrets `RENDER_API_KEY`, `RENDER_SERVICE_ID`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, variable `SITE_URL`. Puis Settings → Copilot → Coding agent → pare-feu :
  autoriser `api.render.com`, `*.supabase.co`, `ladoua-en-lutte.onrender.com`. L'environnement est préparé par
  `.github/workflows/copilot-setup-steps.yml`.
- **Claude Code (cloud)** : les mêmes clés en « secrets réseau » de l'environnement de la session (demandées par Claude
  avec un formulaire sécurisé, jamais collées dans le chat).
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
  le bâtiment s'affiche « bloqué selon les personnes sur place » (sans notif publique). 3 signalements → notif aux modos du site.
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
- 2026-11 : lecture du canal Instagram (Copilot) : désactivée par défaut, clé IA obligatoire, noms de bâtiments exacts
  seulement, rien n'est publié si Instagram demande une connexion.
