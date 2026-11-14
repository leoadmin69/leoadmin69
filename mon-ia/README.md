# ✦ Mon IA : ton assistant et agent de code personnel, hébergé gratuitement, que tu entraînes toi-même

Une IA avec sa propre interface de chat et un **panneau d'admin**. Comme un agent de code, elle peut :

- 🛠 **travailler sur tes sites** : lire le code, chercher, modifier des fichiers, lancer des commandes (`npm run build`, tests…), faire des commits et push Git ;
- 🌍 **mettre en ligne** : hébergement intégré (`/s/ton-site/`), deploy hook (Render, Netlify, Vercel) ou commande personnalisée ;
- 🤖 **créer des agents IA** : agents spécialisés avec leurs propres instructions, outils et modèle. L'IA principale peut leur **déléguer** du travail, et en créer elle-même quand tu le lui demandes ;
- 🔎 **s'informer** sur le web, 🗒 **organiser** (plans, tâches), 🧠 **apprendre** de toi (connaissances, leçons, corrections) ;
- 🔐 **demander ta permission** avant chaque modification (ou tout faire seule en mode Auto, ou rester en lecture seule).

Zéro dépendance : juste Node.js ≥ 18 (+ `git` pour les projets Git).

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

## 5. Les agents

Admin → **Agents** (ou demande-le dans le chat : *« Crée un agent Rédacteur SEO qui optimise les textes et les balises meta »*).
Un agent, c'est : un nom, des instructions, une liste d'outils autorisés, et éventuellement un modèle différent (ex. un modèle spécialisé code pour le Développeur).

- **Utilisation directe** : choisis-le dans le menu 🤖 du chat.
- **Délégation** : l'IA principale peut appeler un agent (`call_agent`), qui travaille seul puis lui rend son résultat. Exemple : *« Demande au Chercheur les tendances design 2026, puis fais travailler le Développeur web pour les appliquer au site »*.

Agents fournis : **Développeur web**, **Chercheur**, **Organisateur**.

## 6. Mettre ton IA en ligne gratuitement

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

## 7. L'entraîner

| Tu veux… | Fais ça |
|---|---|
| Changer son nom, son caractère | Admin → **Personnalité** |
| Lui apprendre ton activité, tes docs | Admin → **Connaissances** (texte ou fichiers) |
| Lui imposer une règle | Admin → **Leçons**, ou dans le chat : *« Retiens que je veux toujours du code commenté »* |
| Corriger une réponse | **👎** ou **✎ Corriger** sous la réponse → elle devient une leçon |
| Valider une réponse | **👍** → elle rejoint le dataset d'entraînement |

**Fine-tuning (gratuit)** : après environ 200 réponses validées ou corrigées, Admin → **Données → Exporter** (`dataset.jsonl`), puis entraîne un modèle avec un notebook **Unsloth** sur Google Colab (GPU gratuit). Exporte-le en GGUF, charge-le dans Ollama, et mets `LLM_MODEL=ton-modele`. Ton IA tourne alors sur ton propre modèle.

## 8. Structure du code

```
server.js            Serveur HTTP : chat en streaming, validations, API admin, aperçus et sites publiés
lib/agent.js         Moteur d'agent : choix du modèle, principes, réflexion, outils en parallèle, vérification, permissions, délégation
lib/workspace.js     Projets et outils de code : fichiers, recherche, commandes, Git, déploiement
lib/tools.js         Outils de base : web, lecture de pages, mémoire, tâches
lib/llm.js           Fournisseurs de modèles, rôles ⚡/🧠, secours, streaming, réessais
lib/retrieval.js     Recherche dans la mémoire (BM25)
lib/store.js         Stockage JSON dans data/ (+ agents par défaut)
public/index.html    Interface de chat
public/admin.html    Panneau d'administration
```

**Ajouter un outil** (e-mail, calendrier, base de données…) : crée-le avec `defineTool(...)` (dans `lib/tools.js` ou un nouveau fichier),
indique son `kind` (`read`, `safe`, `write` ou `exec` : les deux derniers demandent ta permission) et ajoute-le à `ALL_TOOLS` dans `lib/agent.js`.
Tous les agents pourront l'utiliser, et tu pourras l'activer agent par agent.
