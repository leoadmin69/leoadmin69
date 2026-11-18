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
- 2026-11 : lecture du canal Instagram (Copilot) : désactivée par défaut, clé IA obligatoire, noms de bâtiments exacts
  seulement, rien n'est publié si Instagram demande une connexion.
