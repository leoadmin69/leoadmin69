# Lyon 1 · La Doua en lutte

Plateforme d'information des étudiant·es de l'Université Lyon 1 pendant la mobilisation : un seul endroit pour savoir **s'il y a blocus**, **quels bâtiments sont bloqués**, **où et quand sont les AG et les manifs**, ce qui a été **voté**, et pour **se parler**.

Style iOS, sombre, « terminal live » ; marche sur téléphone (barre d'onglets en bas, installable sur l'écran d'accueil) et sur ordinateur (barre latérale).

## Ce que voient les étudiant·es (sans compte)

| Page | Contenu |
|---|---|
| **Live** | Statut du blocus en grand, compteurs bâtiments, votes en cours, flash infos, fil d'actu en direct façon terminal, prochains RDV, dernière AG. Bandeau **rouge** défilant dès qu'un bâtiment est bloqué. |
| **Bâtiments** | Chaque bâtiment par campus : 🔴 bloqué, 🟠 partiel, 🟢 ouvert, avec note (« entrée côté tram »). |
| **AG & manifs** | Agenda par jour, itinéraire, ajout au calendrier (.ics), partage. |
| **Chat anonyme** | Salons (Général, Doua, Santé, Débrief AG, Entraide). Pseudo aléatoire, pas de compte, signalement → masqué après 3 signalements. |
| **Comptes rendus** | AG résumées en flash infos : décisions, votes (barres pour/contre), RDV, bâtiments, revendications. |
| **Votes anonymes** | Sondages à durée limitée, **1 vote par appareil**, résultats en direct ou à la clôture. |
| **Revendications** | Liste avec statut (en lutte / obtenu) et bouton « Je soutiens » anonyme. |
| **Blog & tribunes** | Articles des syndicats + tribunes proposées anonymement par les étudiant·es (relues avant publication). |
| **Témoignages** | Dépôt anonyme de témoignages de violences avec photos/vidéos, publiés seulement après validation. |
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
| 1 | Google Gemini (modèle « flash » le plus récent, choisi automatiquement) | gratuit | oui | `GEMINI_API_KEY` sur aistudio.google.com |
| 2 | Groq (meilleur modèle ouvert dispo, choisi automatiquement) | gratuit | non (texte) | `GROQ_API_KEY` sur console.groq.com |
| 3 | Claude | payant, facultatif | oui | `ANTHROPIC_API_KEY` |
| 4 | Extraction locale | gratuit | non | aucune |

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

**4. Emails (facultatif) avec Brevo**
1. Compte gratuit sur **brevo.com**.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender** : ajoute l'adresse qui enverra les alertes (ex. une adresse Gmail créée pour le collectif) et valide le lien reçu.
3. **SMTP & API → API Keys → Generate** → `BREVO_API_KEY` ; l'adresse validée → `MAIL_FROM_EMAIL`.
4. Limite gratuite : 300 emails par jour. Au-delà, le site s'arrête d'envoyer pour la journée (les notifications, elles, partent toujours). Sans nom de domaine à vous, certains emails peuvent arriver en spam : les notifications du téléphone restent le canal principal.

**Limites de la version gratuite, à connaître**
- Supabase gratuit : 1 Go au total et 50 Mo par fichier (les vidéos de témoignage sont limitées à 45 Mo). Un projet inactif 7 jours est mis en pause : le site y écrit toutes les 12 h pour l'éviter ; si ça arrive quand même, un clic sur « Restore » dans Supabase le relance, sans perte.
- Render gratuit : redémarrage parfois plus lent après une mise à jour du site (environ 1 min). Les changements faits dans les 2 dernières secondes avant un arrêt brutal pourraient être perdus.

### Ailleurs

Le `Dockerfile` marche aussi sur un VPS, Railway, Fly.io… Avec un disque permanent monté sur `/app/data`, Supabase n'est pas nécessaire. Mets `TRUST_PROXY=true` derrière un hébergeur.
