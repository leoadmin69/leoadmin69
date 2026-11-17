# Lyon 1 · La Doua en lutte

Plateforme d'information des étudiant·es de l'Université Lyon 1 pendant la mobilisation : un seul endroit pour savoir **s'il y a blocus**, **quels bâtiments sont bloqués**, **où et quand sont les AG et les manifs**, ce qui a été **voté**, et pour **se parler**.

Style iOS, sombre, « terminal live » ; marche sur téléphone (barre d'onglets en bas, installable sur l'écran d'accueil) et sur ordinateur (barre latérale).

## Ce que voient les étudiant·es (sans compte)

| Page | Contenu |
|---|---|
| **Live** | Statut du blocus en grand, compteurs bâtiments, votes en cours, flash infos, fil d'actu en direct façon terminal, prochains RDV, dernière AG. Bandeau **rouge** défilant dès qu'un bâtiment est bloqué. |
| **Bâtiments** | Chaque bâtiment par campus : 🔴 bloqué, 🟠 partiel, 🟢 ouvert, avec note (« entrée côté tram »). |
| **AG & manifs** | Agenda par jour, itinéraire, ajout au calendrier (.ics), partage. |
| **Chat anonyme** | Salons (Général, Doua, Santé, Débrief AG, Entraide). Pseudo tiré au hasard, style familier français-anglais avec mèmes TikTok et un nombre (ex. « Lil Croissant 69 », « Captain Quoicoubeh 404 ») : on peut en tirer un autre (🎲) mais jamais l'écrire soi-même (le serveur refuse tout pseudo qui ne vient pas du système), pas de compte. **Charte en 5 points à accepter** avant d'écrire. **Liste noire** (gros mots, insultes, propos haineux, menaces ; variantes s4l0pe / connnnard / s.a.l.o.p.e reconnues) : message supprimé avant l'envoi et refusé par le serveur ; les modos ajoutent des mots dans l'onglet 🛡️ Chat. **Répondre** à n'importe quel message en le **glissant vers la droite** comme sur Insta (citation cliquable, surlignage quand on te répond), **appui long** pour poser un sticker en réaction sous le message et **stickers maison animés** façon Twitch/Discord (31 dessins originaux qui bougent, `:poing:`, `:mdr:`, `:cheh:`…, générés par `tools/make-emotes.py`). Signalement → masqué après 3 signalements. |
| **Comptes rendus** | AG résumées en flash infos : décisions, votes (barres pour/contre), RDV, bâtiments, revendications. |
| **Votes anonymes** | Sondages à durée limitée, **1 vote par appareil**, résultats en direct ou à la clôture. |
| **Revendications** | Liste avec statut (en lutte / obtenu) et bouton « Je soutiens » anonyme. |
| **Blog & tribunes** | Articles des syndicats + tribunes proposées anonymement par les étudiant·es (relues avant publication). |
| **Témoignages** | Dépôt anonyme de témoignages de violences avec photos/vidéos, publiés seulement après validation. |
| **Bâtiments · 👀 Signaler** | Sur place, un·e étudiant·e signale ce qu'il ou elle voit. 3 signalements concordants (appareils différents, 45 min) → encadré chez les modos du site, qui confirment en un tap. Jamais publié automatiquement. |
| **✋ J'y vais** | Compteur anonyme sur chaque AG/manif ; rappel automatique 1 h avant (notification, Telegram, fil). |
| **Frise de la lutte** | Jour N de la mobilisation, remplie toute seule : blocages du jour, AG, votes, CR, alertes, revendications obtenues. |
| **Tes droits** | Absences, examens, bourses, interpellation. Brouillon fourni, publié seulement par l'admin après relecture syndicale. |
| **Entraide** | « Je propose / Je cherche » (cours, hébergement, repas, trajets…), réponses anonymes, numéros et emails refusés, masqué après 3 signalements, expire en 14 jours. |
| **Parler à qui ?** | Contacts des syndicats/collectifs + numéros d'urgence et d'écoute. |
| **Alertes** | **Notifications sur le téléphone** (gratuites, sans compte) et/ou email : bâtiment bloqué, alerte urgente, nouvelles AG/manifs, comptes rendus. Filtre par campus. |
| **App** | S'installe sur l'écran d'accueil (Android et iPhone), s'ouvre même sans réseau avec les dernières infos. |

## Espace modos (étudiant·es syndiqué·es)

Accès `#/modo`. L'admin crée un compte par personne (mot de passe généré, à transmettre par Signal). Chaque action est signée du nom de l'organisation et inscrite au journal.

- **Bâtiments**, pensé pour aller vite sur le terrain :
  - **Saisie éclair** : écrire ou **dicter au micro** une phrase comme « Thémis, Nautibus bloqués. Darwin partiel. Le reste ouvert » ou « toute la Doua bloquée ». L'aperçu en couleur montre ce qui va changer avant d'appliquer ; les fautes de frappe et les surnoms (« Déambu ») sont reconnus.
  - **Sélection multiple** : toucher plusieurs tuiles (ou « Tout » pour un campus), puis un seul bouton 🔴 / 🟠 / 🟢. Appui long sur une tuile = note / renommer / supprimer.
  - **Reprendre l'AG** : un bouton remplit la saisie avec les bâtiments bloqués votés dans le dernier compte rendu.
  - **Annuler** pendant 10 s : l'email d'alerte en attente est retiré, aucun faux email ne part.
  - Blocus général : un tap = publié.
- **Story Insta** : images 1080 × 1920 prêtes à publier (statut du campus, prochain RDV, dernier compte rendu, résultat de vote), avec les infos à jour. « Partager » ouvre directement Instagram sur téléphone, sinon téléchargement.
- **CR + IA** : glisser le PDF du compte rendu → l'IA le lit **en direct à l'écran**, retire les noms des personnes, produit les flash infos ; le modo relit, corrige, publie, et peut importer les RDV dans l'agenda et les revendications.
- **Votes, Blog, Témoignages, Flash, Agenda, Revendications, Contacts, Modération du chat, Comptes, Journal.**

## Plusieurs sites, chaque modo chez soi

- **Sites** : Campus de la Doua (affiché par défaut), IUT Doua, IUT Gratte-Ciel, Rockefeller, Lyon Sud, Gerland. L'admin en ajoute ou renomme dans l'onglet **📍 Sites** (une chaîne Telegram par site est possible).
- **Étudiant·es** : une barre en haut permet de choisir son site (ou « Tous les sites ») ; l'accueil, les bâtiments, l'agenda, les votes, le blog, l'entraide et les comptes rendus suivent ce choix. Revendications, témoignages, frise, « Tes droits » et « Parler à qui ? » sont communs à tous les sites (pas de choix). Les notifications et emails se règlent par site.
- **Modos** : chaque compte est rattaché à un ou plusieurs sites (par ex. la présidence de l'AG de Gratte-Ciel). Un modo ne voit et ne modifie **que ses sites** : bâtiments, titre de l'accueil, AG/manifs, votes (au nom de son AG), flash, revendications, blog, témoignages, contacts, comptes rendus. Seul l'**admin** a accès à tout, aux comptes et aux sites.
- **Pas d'écrasement entre modos** : si deux modos changent le même bâtiment ou la même fiche en même temps, le second est prévenu (« déjà bloqué par AG Doua ») au lieu d'écraser. L'espace modo affiche qui d'autre est connecté sur les mêmes sites. Le journal indique le site de chaque action.

## Guide des modos et kit de communication

- **Guide PDF** (23 pages, captures d'écran, à faire / à ne jamais faire, sécurité, check-lists) : lien « 📘 Guide des modos » dans l'espace modo, réservé aux modos connecté·es. Source : `docs/guide/guide-modos.html` ; pour le régénérer après une modification : `node docs/guide/build-pdf.cjs`.
- **Images à publier** (onglet 📸 Story Insta), dessinées par le navigateur, sans IA ni service extérieur : story et publication de promo, carrousel « installer l'app + activer les notifications », statut du site, rendez-vous, compte rendu, story d'un vote (QR code + zone pour le sticker lien) et story des résultats. Le QR code et l'adresse sont ceux du site en ligne.
- **Votes** : chaque vote a un lien direct (`/#/votes/<id>`) à partager ; à la clôture, les résultats sont publiés automatiquement dans le fil en direct et sur Telegram.

## Protection des personnes

- Aucune IP stockée : les limites anti-spam utilisent une empreinte qui change chaque jour.
- **Votes** : cookie aléatoire par appareil ; le serveur ne garde qu'une empreinte propre à *chaque* scrutin → impossible de relier les votes d'une même personne. C'est un vote **indicatif** (vider ses cookies permet de revoter ; un plafond par réseau limite le bourrage).
- **Témoignages** : jamais publiés sans validation ; photos ré-encodées dans le navigateur + nettoyage serveur (EXIF/GPS retirés) ; vidéos nettoyées par ffmpeg (inclus dans le Dockerfile) ; médias floutés par défaut ; le modo choisit média par média ; le contact facultatif n'est visible que des modos et peut être effacé.
- Les fichiers non validés ne sont **jamais** accessibles publiquement.

## Lancer

```bash
cd lyon1-lutte
npm install
cp .env.example .env   # puis remplir ADMIN_PASSWORD, SITE_URL…
node --env-file=.env server.js
```

Sans `RESEND_API_KEY`/SMTP, les inscriptions sont enregistrées mais les emails sont seulement écrits dans la console.

### IA gratuite pour les comptes rendus

| Ordre | Service | Prix | Lit les scans | Clé |
|---|---|---|---|---|
| 1 | Google Gemini (modèle rapide le plus récent, choisi automatiquement : `gemini-4-hydrogen` en novembre 2026) | gratuit | oui | `GEMINI_API_KEY` sur aistudio.google.com |
| 2 | Groq (meilleur modèle ouvert dispo, choisi automatiquement) | gratuit | non (texte) | `GROQ_API_KEY` sur console.groq.com |
| 3 | Claude | payant, facultatif | oui | `ANTHROPIC_API_KEY` |
| 4 | Extraction locale | gratuit | non | aucune |

Le site lit la liste des modèles de Google et prend le plus récent de la gamme rapide (« flash » jusqu'à Gemini 3.8, « hydrogen » depuis Gemini 4), en évitant les versions « preview » et les gros modèles payants (carbon, argon). Si Google renomme ou retire un modèle, le site relit la liste et prend le nouveau nom tout seul. Pour forcer un modèle : `GEMINI_MODEL=gemini-4-hydrogen`.

Si une IA a épuisé son quota gratuit ou est en panne, la suivante prend le relais automatiquement, et le modo le voit dans le terminal en direct.

⚠️ **Confidentialité** : avec la version **gratuite** de Gemini, Google peut utiliser les documents envoyés pour améliorer ses produits (et des personnes peuvent les relire). Un compte rendu qui contient des noms passe donc par Google *avant* que l'IA les retire. Pour éviter ça : retirer les noms du PDF avant de l'importer, ou mettre `AI_PROVIDERS=groq,gemini` pour passer d'abord par Groq (selon ses conditions, Groq ne se sert pas des requêtes de ses clients pour entraîner ses modèles).

### Nom et Instagram

Pas de logo : le site, les emails et les stories affichent seulement « Lyon 1 · La Doua en lutte ». Le compte Instagram (`INSTAGRAM_URL`, par défaut `@lyon1_ladoua.enlutte`) apparaît dans la barre latérale, sur l'accueil, la page contacts, le menu Plus, en pied de chaque email et sur chaque story.

### Mise en ligne 100 % gratuite, sans nom de domaine

| Quoi | Service gratuit | Rôle |
|---|---|---|
| Site | **Render** (formule Free) | Adresse `https://ladoua-en-lutte.onrender.com`, en HTTPS, sans nom de domaine |
| Données et fichiers | **Supabase** (formule Free, 1 Go) | Render gratuit n'a pas de disque : la base et les photos/vidéos validées y sont gardées dans un espace privé |
| IA des comptes rendus | **Gemini** puis **Groq** | Voir plus haut |
| Alertes | **Notifications du téléphone** | Gratuites et illimitées, sans compte ni email |
| Relais | **Chaîne Telegram** | Postée automatiquement, sans limite d'abonné·es |
| Emails (facultatif) | **Brevo** (300/jour) | Sans nom de domaine : il suffit de vérifier une adresse d'envoi |

**1. Supabase (stockage permanent)**
1. Crée un compte sur **supabase.com**, puis **New project** : nom `ladoua-en-lutte`, région **Europe (Paris ou Frankfurt)**, choisis un mot de passe de base (tu n'en auras pas besoin ici).
2. Une fois le projet prêt : **Project Settings → Data API** : copie l'**URL du projet** (`https://xxxx.supabase.co`) → `SUPABASE_URL`.
3. **Project Settings → API Keys** : copie la clé **secrète** (`service_role` ou `sb_secret_…`) → `SUPABASE_SERVICE_KEY`. ⚠️ Ne la donne à personne : elle ouvre tout le stockage.
4. Rien d'autre à faire : le site crée lui-même son espace de stockage privé au premier démarrage.

**2. Render (le site)**
1. Crée un compte sur **render.com** (connexion avec GitHub).
2. **New → Blueprint**, choisis le dépôt et la branche qui contient `lyon1-lutte/` ; Render lit `render.yaml`.
3. Remplis : `ADMIN_PASSWORD` (long), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`. Laisse `BREVO_API_KEY` et `MAIL_FROM_EMAIL` vides pour l'instant.
4. **Apply**, attends la fin de la construction (~5 min), puis ouvre l'adresse donnée par Render.
5. `…/#/modo` → connexion `admin` → change le mot de passe dans « Mon compte » → crée les comptes des modos.

L'adresse du site est détectée automatiquement (pas besoin de `SITE_URL`). Le site se rend visite toutes les 10 minutes pour ne pas s'endormir. Les 750 heures gratuites par mois de Render suffisent pour **un seul** service allumé en permanence : si un autre service gratuit tourne déjà sur le même compte Render, crée un compte Render à part pour ce site (par exemple au nom du collectif).

**3. App sur le téléphone**
- **Android** : ouvrir le site dans Chrome → bouton « Installer l'app » sur l'accueil (ou menu ⋮ → « Installer l'application »).
- **iPhone** : ouvrir dans Safari → Partager → « Sur l'écran d'accueil » → ouvrir l'app depuis l'icône → Alertes → « Activer les notifications » (iOS 16.4 minimum).
- L'app s'ouvre même sans réseau, avec les dernières infos connues.

**4. Chaîne Telegram automatique (recommandé, gratuit, sans limite)**
1. Dans Telegram : crée une **chaîne** (ex. « La Doua en lutte »), publique avec un lien `t.me/…`.
2. Ouvre **@BotFather** → `/newbot` → choisis un nom → il te donne un **jeton** (`123456:ABC…`) → `TELEGRAM_BOT_TOKEN`.
3. Dans la chaîne : Administrateurs → Ajouter → ton bot (droit « Publier des messages »).
4. `TELEGRAM_CHAT_ID` = `@nom_de_la_chaine` ; `TELEGRAM_URL` = `https://t.me/nom_de_la_chaine`.
5. Chaque changement de bâtiment, alerte urgente, AG/manif annoncée, compte rendu publié ou vote lancé est posté automatiquement, avec un bouton « Voir en direct ».

**5. Emails (facultatif) avec Brevo**
1. Compte gratuit sur **brevo.com**.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender** : ajoute l'adresse qui enverra les alertes (ex. une adresse Gmail créée pour le collectif) et valide le lien reçu.
3. **SMTP & API → API Keys → Generate** → `BREVO_API_KEY` ; l'adresse validée → `MAIL_FROM_EMAIL`.
4. Limite gratuite : 300 emails par jour **pour tout le compte Brevo** (ajouter des adresses d'envoi ne l'augmente pas). Le site envoie donc **un seul récapitulatif chaque matin à 7 h** (`EMAIL_DIGEST_HOUR`) : bâtiments bloqués, AG/manifs du jour, alertes de la veille, nouveaux comptes rendus. La liste est plafonnée à environ 275 inscrit·es ; une fois pleine, le site renvoie vers les notifications de l'app et Telegram. Les inscriptions non confirmées sont supprimées après 48 h.
5. Ne pas multiplier les comptes Gmail ou Brevo pour envoyer plus : c'est interdit par leurs conditions, les comptes sont bloqués et les emails finissent en spam, souvent au pire moment. Pour 4 000 personnes, ce sont les notifications et Telegram qui marchent.

**Limites de la version gratuite, à connaître**
- Supabase gratuit : 1 Go au total et 50 Mo par fichier (les vidéos de témoignage sont limitées à 45 Mo). Un projet inactif 7 jours est mis en pause : le site y écrit toutes les 12 h pour l'éviter ; si ça arrive quand même, un clic sur « Restore » dans Supabase le relance, sans perte.
- Render gratuit : redémarrage parfois plus lent après une mise à jour du site (environ 1 min). Les changements faits dans les 2 dernières secondes avant un arrêt brutal pourraient être perdus.

### En cas d'erreur au déploiement

- **`Couldn't find any versions for "three"`** (ou une erreur qui parle de Next.js / Bizerte) : Render construit **un autre projet du dépôt**. La branche par défaut du dépôt n'est pas celle du site. Dans Render → Settings :
  - **Branch** : `claude/lyon1-student-info-platform-ohzn3d` ;
  - **Root Directory** : `lyon1-lutte` ;
  - en mode Node : **Build Command** `npm ci`, **Start Command** `npm start` ;
  - puis **Manual Deploy → Deploy latest commit**.
- Le site marche en mode **Docker** comme en mode **Node** : en mode Node, ffmpeg (nettoyage des vidéos) est installé automatiquement par npm.
- Au démarrage, les journaux Render (onglet **Logs**) affichent une ligne `Stockage : Supabase · IA : … · Telegram : …` qui résume ce qui est bien configuré.

### Ailleurs

Le `Dockerfile` marche aussi sur un VPS, Railway, Fly.io… Avec un disque permanent monté sur `/app/data`, Supabase n'est pas nécessaire. Mets `TRUST_PROXY=true` derrière un hébergeur.
