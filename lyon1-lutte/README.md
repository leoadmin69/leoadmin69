# Lyon 1 en lutte

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
| **Alertes email** | Inscription : email rouge quand un bâtiment est bloqué, nouvelles AG/manifs, comptes rendus. Filtre par campus, désinscription en 1 clic. |

## Espace modos (étudiant·es syndiqué·es)

Accès `#/modo`. L'admin crée un compte par personne (mot de passe généré, à transmettre par Signal). Chaque action est signée du nom de l'organisation et inscrite au journal.

- **Situation** : statut du blocus + un tap par bâtiment (publié en direct ; les emails sont regroupés après 1 min).
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

Sans `ANTHROPIC_API_KEY`, l'analyse des PDF utilise une extraction simple (pas de PDF scannés). Sans `RESEND_API_KEY`/SMTP, les inscriptions sont enregistrées mais les emails sont seulement écrits dans la console.

### Déploiement

Le `Dockerfile` marche sur Render, Railway, Fly.io… **Monte un disque persistant sur `/app/data`** (base JSON + fichiers). Mets `TRUST_PROXY=true` derrière l'hébergeur.
