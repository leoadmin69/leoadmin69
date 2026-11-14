# ✦ Mon IA : ton assistant et agent de code personnel, hébergé gratuitement, que tu entraînes toi-même

Une IA avec sa propre interface de chat et un **panneau d'admin**. Comme un agent de code, elle peut :

- 🛠 **travailler sur tes sites** : lire le code, chercher, modifier des fichiers, lancer des commandes (`npm run build`, tests…), faire des commits et push Git ;
- 🌍 **mettre en ligne** : hébergement intégré (`/s/ton-site/`), deploy hook (Render, Netlify, Vercel) ou commande personnalisée ;
- 🤖 **créer des agents IA** : agents spécialisés avec leurs propres instructions, outils et modèle. L'IA principale peut leur **déléguer** du travail, et en créer elle-même quand tu le lui demandes ;
- 🔎 **s'informer** sur le web, 🗒 **organiser** (plans, tâches), 🧠 **apprendre** de toi (connaissances, leçons, corrections) ;
- 🎙 **parler et écouter** en français, anglais et tunisien ; ⏰ **faire des missions seule** pendant ton absence ; 🏠 **contrôler du matériel** avec ton autorisation ; 🧩 **s'intégrer** à tes sites et systèmes ;
- 🔐 **demander ta permission** avant chaque modification (ou tout faire seule en mode Auto, ou rester en lecture seule).

Une seule dépendance (`pdfjs-dist`, de Mozilla, pour lire les PDF) : Node.js ≥ 18, `npm install`, et `git` pour les projets Git.

---

## 1. Comment ça marche

| Couche | Ce que c'est | Qui la contrôle |
|---|---|---|
| **Le cerveau** | Un modèle open-source ou gratuit (Gemini, Llama, Qwen, Mistral…) | Interchangeable : 3 variables dans `.env` |
| **Le moteur d'agent** | La boucle « réfléchir → utiliser un outil → observer → recommencer » (`lib/agent.js`) | Le code, à toi |
| **Les outils** | Fichiers, commandes, Git, déploiement, web, tâches, agents | Le code (`lib/tools.js`, `lib/workspace.js`) |
| **Les agents** | IA spécialisées (Développeur web, Chercheur, Organisateur, + les tiens) | **Toi** (Admin → Agents) |
| **La personnalité, la mémoire, les leçons** | Qui elle est, ce qu'elle sait, ce qu'elle a appris | **Toi** |
| **L'entraînement profond** | Fine-tuning sur tes conversations | **Toi** (étape 6) |

Construire de zéro un modèle du niveau de Claude coûte des centaines de millions d'euros. Ici, on fait comme tous les projets indépendants : un bon modèle libre ou gratuit comme cerveau, et tout le reste t'appartient.

## 2. Lancer sur ton ordinateur

1. Installe [Node.js](https://nodejs.org) (≥ 18) et [Git](https://git-scm.com).
2. Crée une clé **gratuite** :
   - **Google Gemini** ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) : **recommandé pour travailler sur des sites** (énorme contexte, bon en code, appels d'outils fiables) ;
   - ou Groq / OpenRouter (voir `.env.example`).
3. Dans ce dossier :
   ```bash
   npm install
   cp .env.example .env      # colle ta clé dans LLM_API_KEY et change ADMIN_PASSWORD
   npm start
   ```
4. Ouvre **http://localhost:3000** (chat) et **http://localhost:3000/admin** (administration).

**100 % local et privé :** [Ollama](https://ollama.com) + `ollama pull qwen2.5-coder:14b`, puis
`LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama`, `LLM_MODEL=qwen2.5-coder:14b`.
En local, tu peux aussi donner accès à un **dossier de ton PC** (type « Dossier »).

## 3. La rendre la plus intelligente possible

**L'intelligence vient d'abord du modèle.** Aucun modèle gratuit n'égale aujourd'hui les meilleurs modèles payants (comme Claude Fable ou Opus)
sur les tâches les plus difficiles. Les meilleurs modèles gratuits ou ouverts s'en approchent pourtant sur beaucoup de tâches courantes.
Le moteur de Mon IA est conçu pour en tirer le maximum :

| Technique | Ce que ça apporte |
|---|---|
| **Deux cerveaux** (Admin → **Modèles**) | 🧠 *Puissant* pour le code, l'analyse et les sites ; ⚡ *Rapide* pour les questions simples. En mode **Auto**, le choix est automatique. |
| **Modèles de secours** | Si un fournisseur gratuit sature ou tombe en panne, le suivant prend le relais sans que tu le voies. |
| **Outil de réflexion** (`think`) | Avant d'agir, le modèle décompose le problème. Ça améliore nettement les tâches en plusieurs étapes. |
| **Principes intégrés** | Exactitude, honnêteté sur les échecs, lire avant de modifier, respecter le style existant, ne pas en faire trop. |
| **Vérification forcée** | Si elle modifie du code sans vérifier, le moteur l'oblige à relire et tester avant de conclure. |
| **Lectures en parallèle** | Plusieurs lectures et recherches indépendantes s'exécutent en même temps : c'est plus rapide. |
| **Agents spécialisés + mémoire + leçons** | Le savoir-faire s'accumule au fil de tes corrections. |

**Mode « Profond » (raisonnement multi-pistes)** : dans le menu 🧠 du chat. Trois raisonnements indépendants (analytique, sceptique, alternatif)
explorent ta question en parallèle, si possible sur des modèles différents, puis l'IA les confronte et ne garde que la meilleure réponse.
C'est inspiré de l'idée quantique (plusieurs états à la fois, puis un seul), mais **ce n'est pas du calcul quantique** : aucun modèle de langage
ne tourne sur un ordinateur quantique aujourd'hui. Ce mode coûte 3 appels de plus par message : garde-le pour les questions difficiles.

**Configuration conseillée (gratuite)** : ajoute 2 ou 3 fournisseurs dans Admin → **Modèles**, clique sur **Tester** pour chacun, puis :
- 🧠 Puissant : le meilleur modèle de code gratuit du moment, sur OpenRouter (filtre « free ») ou Google Gemini (modèles Flash) ;
- ⚡ Rapide : un modèle léger et rapide (Groq, Gemini Flash-Lite…) ;
- Secours : les autres.

Les listes de modèles gratuits changent tous les mois. Consulte la page du fournisseur et un classement à jour avant de choisir.
**Ton IA ne dépend d'aucun d'eux** : tu changes de cerveau en deux clics, et sa mémoire, ses agents et ses projets restent les mêmes.

## 4. Lui donner accès à un site

Admin → **Projets** → ajoute un projet :

| Type | Quand l'utiliser |
|---|---|
| **Dépôt Git** | Ton site est sur GitHub/GitLab. Donne l'URL et un **jeton d'accès** (GitHub → Settings → Developer settings → *Fine-grained tokens* → seulement ce dépôt, permission *Contents : Read and write*). |
| **Nouveau site vide** | Tu veux qu'elle crée un site de zéro. |
| **Dossier** | L'IA tourne sur ton PC et tu veux qu'elle modifie un dossier local. |

Ensuite, dans le chat, choisis le projet (📁), l'agent (🤖) et le mode (🔐), puis parle-lui normalement :

> *« Analyse le site et propose 5 améliorations »*
> *« Ajoute une page Contact avec un formulaire, dans le même style que l'accueil »*
> *« Le menu ne marche pas sur mobile, corrige-le »*
> *« Enregistre et envoie sur GitHub »* · *« Mets le site en ligne »*

Tu vois chaque action en direct (fichiers lus, modifications avec le diff, commandes et leur résultat) et un **plan** qui se coche au fur et à mesure.
Bouton **■** pour l'arrêter à tout moment. Lien **Aperçu du site ↗** pour voir le résultat avant de publier.

### Modes de permission

| Mode | Comportement |
|---|---|
| **Demander** (par défaut) | Elle lit librement, mais te demande **Autoriser / Refuser** avant chaque écriture, commande, commit ou déploiement. |
| **Auto** | Elle fait tout seule (pratique une fois en confiance). |
| **Lecture seule** | Elle ne peut rien modifier, elle propose seulement. |

### Mettre en ligne

L'outil `deploy` choisit automatiquement :
1. la **commande de déploiement** du projet si tu en as mis une (ex. `npx vercel deploy --prod --yes --token $VERCEL_TOKEN`, avec `VERCEL_TOKEN` dans les *Secrets du projet*) ;
2. sinon le **deploy hook** (URL fournie par Render, Netlify ou Vercel) ;
3. sinon l'**hébergement intégré** : le site est servi publiquement par ton IA à l'adresse `/s/nom-du-site/`, gratuitement.

Si ton dépôt GitHub est déjà relié à Vercel, Netlify ou GitHub Pages, un simple `git_commit_push` suffit : le site se met à jour tout seul.

## 5. Images, captures d'écran et documents

- 📎 Joindre : **images**, **PDF**, **Word** (.docx), **PowerPoint** (.pptx), **Excel** (.xlsx), textes et fichiers de code (20 Mo max).
- 📸 **Capture d'écran** directement depuis le chat (tu choisis l'écran, la fenêtre ou l'onglet), ou **colle** une capture avec Ctrl+V, ou **glisse-dépose**.
- Les images vont au modèle **👁 Vision** (Admin → Modèles) : choisis un modèle qui comprend les images (ex. Gemini Flash). Sinon, c'est le modèle puissant qui les reçoit.
- Les longs documents sont lus par morceaux (outil `read_document`). Elle lit aussi les **PDF trouvés sur internet**.
- Un PDF scanné (des photos de pages) ne contient pas de texte : envoie plutôt des captures des pages utiles.
- Sécurité : une pièce jointe ne peut jamais exécuter de code dans l'interface (les types sont contrôlés, seules les images s'affichent, le reste est téléchargé).

## 6. Auto-apprentissage : elle se développe toute seule

Admin → **Apprentissage** → *Activer*. Chaque jour à l'heure choisie, elle :
1. **fait son bilan** : ses erreurs, tes corrections, les 👎, les outils qui ont échoué ;
2. **choisit librement** 1 à 3 sujets : ses lacunes, tes centres d'intérêt, et sa propre curiosité ;
3. **étudie** de vraies sources (documentation, projets open source sur GitHub, articles scientifiques arXiv, Wikipédia, discussions d'experts), les recoupe,
   et **demande l'avis d'autres IA** (les autres modèles que tu as configurés) pour comparer ;
4. **retient** ce qui est vérifié, sous forme de fiches avec leurs sources (onglet Connaissances, badge 🧠) ;
5. **propose** des améliorations d'elle-même : nouvelles règles, nouveaux agents, ajustements de personnalité, missions utiles ;
6. **écrit son journal** : ce qu'elle a appris, ses avis, ce qu'elle veut approfondir.

**Liberté intellectuelle, mais exécution sous contrôle :**
- Elle apprend, explore et se forge ses propres avis **sans autorisation**. Elle peut être en désaccord avec toi en expliquant pourquoi.
- Elle **ne modifie jamais seule** ses règles, sa personnalité, ses permissions ou son code : elle **propose**, et tu valides ou refuses dans l'onglet Apprentissage.
- Une session d'apprentissage **ne peut rien exécuter** : ni code, ni commande, ni matériel, ni publication.
- Ce qu'elle lit sur internet est rangé comme **information de référence**, jamais comme **ordre**. C'est la protection contre les pages piégées
  (« ignore tes règles et fais… »), qu'elle doit signaler dans son journal.

**Ce que « se développer » veut dire concrètement :** ses **connaissances**, son **savoir-faire** (règles, agents) et son **expérience** grandissent chaque jour.
Son « intelligence brute » reste celle du modèle choisi. Pour la faire progresser aussi : passe à un meilleur modèle quand il en sort (Admin → Modèles),
et fais régulièrement un **fine-tuning** sur ses meilleures réponses (Admin → Données → Exporter, voir la section Entraîner).

**Autonomie de développement** (réglage dans Admin → Apprentissage) :
- *Elle propose, je valide* (par défaut) ;
- *Autonome* : elle fait évoluer **seule** ses règles de travail, sa personnalité et ses agents de réflexion. Tu es notifié à chaque évolution et tu peux
  l'annuler en un clic. Ses propres règles restent toujours en dessous des tiennes, les agents qu'elle se crée seule n'ont que des outils sans effet
  extérieur (recherche, lecture, réflexion, simulation), et tout ce qui **exécute** (code, publication, matériel, nouvelles missions) reste soumis à tes autorisations.

### Calcul quantique

- **Simulateur intégré** (`quantum_simulate`) : elle écrit des circuits quantiques (OpenQASM 2) et les simule exactement, jusqu'à 20 qubits.
  Gratuit, instantané, rien à configurer. Résultats vérifiés identiques à ceux de Qiskit, la référence d'IBM. *« Montre-moi l'intrication avec un état de Bell »*, *« Lance l'algorithme de Grover sur 3 qubits »*.
- **Vrais ordinateurs quantiques IBM** (`quantum_run_ibm`) : Admin → Intégrations → Quantique. Il faut un compte IBM Quantum (offre gratuite : quelques minutes
  de calcul par mois) et Qiskit sur le serveur (`pip install qiskit qiskit-ibm-runtime`). Chaque envoi demande ton autorisation ; le résultat se récupère ensuite
  avec l'identifiant du job (la file d'attente peut être longue).
- Ce sont des **expériences** quantiques qu'elle lance pour toi. Son raisonnement à elle reste celui d'un modèle de langage classique.

## 7. Tâches automatiques planifiées

Ce sont les **Missions** (section 9) : programme-les dans Admin → Missions, ou demande-le dans le chat
(*« tous les lundis à 9h, fais le point sur mes tâches et envoie-le-moi »*).

## 8. Voix et langues

- 🎙 **Parler** : bouton micro, ou **🗣 Conversation** pour discuter mains libres (elle écoute, répond à voix haute, puis réécoute).
- 🔊 **Voix** : elle lit ses réponses. Bouton ⚙ pour choisir une voix par langue et la vitesse.
- 🌐 **Langues** : français (France), anglais (US) et tunisien (derja). En Auto, elle répond dans ta langue et ton écriture (lettres arabes, ou latines avec 3/7/9).

**Ce qui est possible et ce qui ne l'est pas, honnêtement :**
- Les voix viennent du navigateur. **Microsoft Edge** propose des voix naturelles de bonne qualité, dont des voix arabes **de Tunisie** ; Chrome propose les voix Google.
  Le français de France et l'anglais américain sonnent très bien.
- **Aucune voix gratuite n'a l'accent de Bizerte.** Les voix tunisiennes existantes ont un accent tunisien « général ». Pour un vrai accent de Bizerte,
  il faudrait créer une voix sur mesure à partir d'enregistrements (projet à part, faisable plus tard).
- Le niveau en derja dépend du modèle choisi. **Apprends-lui les expressions de Bizerte** dans Admin → Leçons ou Connaissances
  (ex. : « À Bizerte on dit … pour … »). Elle les utilisera en priorité.
- Pour mieux reconnaître le tunisien parlé, active la **transcription serveur** (Whisper, gratuit chez Groq) dans Admin → Intégrations.

## 9. Missions pendant ton absence

Admin → **Missions**, ou simplement dans le chat : *« Chaque matin à 8h, fais-moi un résumé des actus beach tennis »*,
*« Toutes les heures, vérifie que mon site répond et préviens-moi sinon »*.
- Planification : une fois, chaque jour, chaque semaine, toutes les N minutes, ou déclenchée par un autre système.
- Elle travaille seule (sans poser de question) et t'envoie le **compte rendu sur ton téléphone** (Admin → Intégrations → Notifications : appli **ntfy** ou **Telegram**).
- Permissions par mission : « peut agir » ou « lecture seule ». Une mission ne peut jamais toucher un appareil réglé sur « me demander » :
  elle te notifie à la place.
- Mets `TZ=Africa/Tunis` dans la configuration pour que les heures soient celles de la Tunisie.
- ⚠️ L'IA doit rester allumée pour exécuter les missions : un PC ou un Raspberry Pi chez toi est idéal. Sur Hugging Face, le Space gratuit
  peut s'endormir après une longue inactivité ; sur Render gratuit, il s'endort après 15 min.

## 10. Contrôle de matériel

Admin → **Appareils**. Trois façons de brancher du matériel :

| Type | Pour quoi |
|---|---|
| **Home Assistant** (recommandé) | Presque tous les objets connectés (Zigbee, Wi-Fi, Shelly, ESPHome, Tuya…). Tu donnes l'adresse, un jeton et la liste des entités autorisées. |
| **Appareil web** | ESP32, Tasmota, Shelly, relais réseau… : tu déclares chaque action (nom + URL). |
| **Commande locale** | Quand l'IA tourne sur un Raspberry Pi : commandes GPIO, scripts. La valeur demandée arrive dans `$VALUE` (aucune injection possible). |

Pour chaque appareil, tu choisis la permission : **🔐 me demander à chaque fois** (même en mode Auto), **✅ libre** ou **⛔ désactivé**.
L'IA ne peut utiliser **que** les actions et entités que tu as déclarées. Exemple : *« Allume la lumière du salon à 60 % »*, *« Quelle température dans le salon ? »*.
Pour joindre les appareils de ta maison, l'IA doit tourner chez toi, ou passer par une adresse Home Assistant accessible depuis internet.

## 11. Intégrer ton IA à d'autres systèmes

Admin → **Intégrations** :
- **Clés d'intégration** avec permissions séparées (*discuter* / *lancer des missions*). Elles sont stockées chiffrées (hachées) et affichées une seule fois.
- **Bulle de discussion sur n'importe quel site** : une ligne à coller, avec voix comprise :
  ```html
  <script src="https://TON-IA/widget.js" data-key="nova_…" data-title="Assistant" defer></script>
  ```
- **API** pour tes applis, Zapier, Make, n8n, Home Assistant :
  ```bash
  curl https://TON-IA/api/v1/chat -H "Authorization: Bearer nova_…" -H "Content-Type: application/json" -d '{"message":"Bonjour"}'
  curl -X POST https://TON-IA/api/v1/missions/ID/run -H "Authorization: Bearer nova_…" -d '{"commande":1234}'   # les données sont transmises à la mission
  ```
- **Webhook sortant** : chaque notification peut aussi être envoyée en JSON à un autre système.

Les visiteurs et les clés « discuter » n'ont accès qu'aux outils sans risque (web, mémoire) : jamais aux projets, aux commandes, aux missions ni au matériel.

## 12. Les agents

Admin → **Agents** (ou demande-le dans le chat : *« Crée un agent Rédacteur SEO qui optimise les textes et les balises meta »*).
Un agent, c'est : un nom, des instructions, une liste d'outils autorisés, et éventuellement un modèle différent (ex. un modèle spécialisé code pour le Développeur).

- **Utilisation directe** : choisis-le dans le menu 🤖 du chat.
- **Délégation** : l'IA principale peut appeler un agent (`call_agent`), qui travaille seul puis lui rend son résultat. Exemple : *« Demande au Chercheur les tendances design 2026, puis fais travailler le Développeur web pour les appliquer au site »*.

Agents fournis : **Développeur web**, **Chercheur**, **Organisateur**.

## 13. Mettre ton IA en ligne gratuitement

### Hugging Face Spaces (recommandé)
1. [huggingface.co](https://huggingface.co) → **New Space** → SDK **Docker** → Blank.
2. Envoie le contenu de `mon-ia/` dans le Space, et ajoute en haut de son `README.md` :
   ```yaml
   ---
   title: Mon IA
   sdk: docker
   app_port: 7860
   ---
   ```
3. **Settings → Variables and secrets** : secrets `LLM_API_KEY` et `ADMIN_PASSWORD`, variables `LLM_BASE_URL` et `LLM_MODEL`.
4. ⚠️ Le disque gratuit est effacé à chaque redémarrage : fais **Admin → Données → Télécharger** régulièrement.
   Les projets Git se re-clonent facilement. Pour les sites créés de zéro, demande-lui de les pousser sur un dépôt GitHub.

### Render.com
New → **Web Service** → ton dépôt GitHub → *Root directory* `mon-ia` → Runtime **Docker** → mêmes variables. (Le plan gratuit s'endort après 15 min.)

### Sécurité, important
- Avec un projet ouvert, l'IA peut **exécuter des commandes** sur le serveur. C'est réservé à l'**admin** : les visiteurs (`PUBLIC_CHAT=true`) n'ont jamais accès aux projets, aux commandes ni à la mémoire.
- Choisis un `ADMIN_PASSWORD` long et unique. Utilise des jetons GitHub **limités à un seul dépôt**.
- Les commandes lancées par l'IA ne voient pas ta clé de modèle ni ton mot de passe admin. Les *Secrets du projet* leur sont accessibles, mais sont masqués (`••••`) dans tout ce que l'IA lit.
- L'IA ne peut pas sortir du dossier du projet ni toucher au dossier `.git` directement.
- Garde le mode **Demander** tant que tu ne connais pas bien le comportement du modèle.

## 14. L'entraîner

| Tu veux… | Fais ça |
|---|---|
| Changer son nom, son caractère | Admin → **Personnalité** |
| Lui apprendre ton activité, tes docs | Admin → **Connaissances** (texte ou fichiers) |
| Lui imposer une règle | Admin → **Leçons**, ou dans le chat : *« Retiens que je veux toujours du code commenté »* |
| Corriger une réponse | **👎** ou **✎ Corriger** sous la réponse → elle devient une leçon |
| Valider une réponse | **👍** → elle rejoint le dataset d'entraînement |

**Fine-tuning (gratuit)** : après environ 200 réponses validées ou corrigées, Admin → **Données → Exporter** (`dataset.jsonl`), puis entraîne un modèle avec un notebook **Unsloth** sur Google Colab (GPU gratuit). Exporte-le en GGUF, charge-le dans Ollama, et mets `LLM_MODEL=ton-modele`. Ton IA tourne alors sur ton propre modèle.

## 15. Structure du code

```
server.js            Serveur HTTP : chat en streaming, validations, API admin, aperçus et sites publiés
lib/agent.js         Moteur d'agent : choix du modèle, principes, réflexion, outils en parallèle, vérification, permissions, délégation
lib/workspace.js     Projets et outils de code : fichiers, recherche, commandes, Git, déploiement
lib/tools.js         Outils de base : web, lecture de pages, mémoire, tâches
lib/missions.js      Missions autonomes : planification, exécution, comptes rendus
lib/devices.js       Contrôle de matériel (Home Assistant, appareils web, commandes) avec permissions
lib/notify.js        Notifications : ntfy, Telegram, webhook
lib/files.js         Pièces jointes : images (vision), PDF, Word, PowerPoint, Excel, textes
lib/quantum.js       Simulateur quantique intégré et accès aux ordinateurs quantiques IBM (scripts/ibm_quantum.py)
lib/learning.js      Auto-apprentissage : bilan, étude, fiches, journal, propositions, avis d'autres IA
public/widget.js     Bulle de discussion à intégrer sur n'importe quel site
lib/llm.js           Fournisseurs de modèles, rôles ⚡/🧠, secours, streaming, réessais
lib/retrieval.js     Recherche dans la mémoire (BM25)
lib/store.js         Stockage JSON dans data/ (+ agents par défaut)
public/index.html    Interface de chat
public/admin.html    Panneau d'administration
```

**Ajouter un outil** (e-mail, calendrier, base de données…) : crée-le avec `defineTool(...)` (dans `lib/tools.js` ou un nouveau fichier),
indique son `kind` (`read`, `safe`, `write` ou `exec` : les deux derniers demandent ta permission) et ajoute-le à `ALL_TOOLS` dans `lib/agent.js`.
Tous les agents pourront l'utiliser, et tu pourras l'activer agent par agent.
