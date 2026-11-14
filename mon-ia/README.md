# ✦ Mon IA — ton assistant personnel, hébergé gratuitement, que tu entraînes toi-même

Une IA avec sa propre interface de chat (style Claude/ChatGPT) et un **panneau d'admin** pour lui apprendre des choses.
Elle sait **coder**, **s'informer** (recherche web, lecture de pages) et **organiser** (liste de tâches, plannings).

- Zéro dépendance : juste Node.js ≥ 18.
- Fonctionne avec n'importe quel modèle open-source via une API **compatible OpenAI** (Groq, OpenRouter, Gemini, Ollama…).
- Tu changes de modèle en changeant 3 variables : ton IA (sa mémoire, sa personnalité, ses leçons) reste la même.

---

## 1. Ce qu'il faut savoir (honnêtement)

Créer *de zéro* un modèle du niveau de Claude coûte des centaines de millions d'euros de calcul. Personne ne le fait seul.
Ce que font les vrais projets indépendants, et ce que fait celui-ci :

| Couche | Ce que c'est | Qui la contrôle |
|---|---|---|
| **Le cerveau brut** | Un modèle open-source (Llama 3.3, Qwen 2.5, Mistral, Gemma…) | Libre, gratuit, interchangeable |
| **La personnalité** | Nom, ton, règles | **Toi** (admin → Personnalité) |
| **La mémoire** | Tes documents, tes infos, tes FAQ | **Toi** (admin → Connaissances) |
| **Les leçons** | Règles et corrections apprises au fil du temps | **Toi** (corrections 👎/✎ dans le chat, « retiens que… ») |
| **Les outils** | Web, lecture de pages, tâches, mémoire | Le code (`lib/tools.js`), extensible |
| **L'entraînement profond** | Fine-tuning du modèle sur *tes* conversations | **Toi**, gratuitement sur Google Colab (étape 5) |

Rien n'appartient à Anthropic ni à OpenAI : tout est à toi, et tu peux même tout faire tourner sur ton PC (Ollama).

---

## 2. Lancer sur ton ordinateur (5 minutes)

1. Installe [Node.js](https://nodejs.org) (version 18 ou plus).
2. Crée une clé gratuite sur **[console.groq.com/keys](https://console.groq.com/keys)** (gratuit, très rapide).
3. Dans ce dossier :
   ```bash
   cp .env.example .env      # puis ouvre .env et colle ta clé dans LLM_API_KEY, change ADMIN_PASSWORD
   npm start
   ```
4. Ouvre **http://localhost:3000** (chat) et **http://localhost:3000/admin** (administration).

**100 % hors-ligne et privé ?** Installe [Ollama](https://ollama.com), lance `ollama pull qwen2.5:7b`, puis dans `.env` :
`LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama`, `LLM_MODEL=qwen2.5:7b`.

## 3. Mettre en ligne gratuitement

### Option A — Hugging Face Spaces (recommandé, gratuit, toujours en ligne)
1. Crée un compte sur [huggingface.co](https://huggingface.co) → **New Space** → SDK : **Docker** → Blank.
2. Envoie le contenu de ce dossier `mon-ia/` dans le Space (glisser-déposer dans l'onglet *Files*, ou `git push`).
3. Ajoute en haut du `README.md` du Space :
   ```yaml
   ---
   title: Mon IA
   sdk: docker
   app_port: 7860
   ---
   ```
4. **Settings → Variables and secrets** : ajoute les secrets `LLM_API_KEY`, `ADMIN_PASSWORD`, et les variables `LLM_BASE_URL`, `LLM_MODEL`.
5. ⚠️ Le disque gratuit est effacé à chaque redémarrage : fais **Admin → Données → Télécharger** régulièrement, et **Restaurer** après un redémarrage
   (ou active le *Persistent storage* du Space et mets `DATA_DIR=/data`).

### Option B — Render.com
New → **Web Service** → connecte ton dépôt GitHub → *Root directory* : `mon-ia` → *Runtime* : Docker → ajoute les mêmes variables d'environnement.
(Le plan gratuit s'endort après 15 min d'inactivité ; le premier message prend ~30 s.)

### Sécurité
- Par défaut, le chat est **privé** : il faut le mot de passe admin. Pour l'ouvrir au public, mets `PUBLIC_CHAT=true`
  (les visiteurs pourront discuter mais pas modifier sa mémoire). Attention, ils consommeront ton quota gratuit.
- Choisis un `ADMIN_PASSWORD` long. Ne mets jamais ta clé API dans le code ni sur GitHub (le `.env` est ignoré par git).

## 4. L'entraîner au quotidien (en tant qu'admin)

| Tu veux… | Fais ça |
|---|---|
| Changer son nom, son caractère | Admin → **Personnalité** |
| Lui apprendre ton activité, tes docs, tes cours | Admin → **Connaissances** (colle du texte ou importe des fichiers .txt/.md/.csv) |
| Lui imposer une règle | Admin → **Leçons**, ou dans le chat : *« Retiens que je préfère le code en TypeScript »* |
| Corriger une mauvaise réponse | Sous la réponse : **👎** ou **✎ Corriger** → écris la bonne réponse → elle devient une leçon |
| Valider une bonne réponse | **👍** → elle rejoint le dataset d'entraînement |
| Gérer tes tâches | Dans le chat : *« ajoute … à mes tâches pour vendredi »*, *« qu'est-ce que j'ai à faire ? »*, ou Admin → **Tâches** |

## 5. Aller plus loin : un vrai fine-tuning (gratuit)

Quand tu as accumulé ~200+ réponses notées 👍 ou corrigées :
1. Admin → **Données → Exporter** → tu obtiens `dataset.jsonl` (format standard `messages`).
2. Ouvre un notebook gratuit **Unsloth** sur Google Colab (GPU T4 gratuit) — cherche « Unsloth Llama 3.2 3B conversational notebook ».
3. Remplace leur dataset par le tien, lance l'entraînement (~20-60 min).
4. Exporte le modèle en **GGUF**, charge-le dans **Ollama** (`ollama create mon-ia -f Modelfile`),
   puis mets `LLM_MODEL=mon-ia` dans `.env`. Ton IA tourne alors sur **ton propre modèle**, entraîné par toi.

## 6. Structure du code

```
server.js          Serveur HTTP : chat en streaming, API admin, export
lib/llm.js         Connexion au modèle (API compatible OpenAI, streaming + outils)
lib/tools.js       Outils : web_search, read_page, search_knowledge, tâches, remember
lib/retrieval.js   Recherche dans la mémoire (BM25, gère les accents)
lib/store.js       Stockage JSON dans data/
public/index.html  Interface de chat
public/admin.html  Panneau d'administration
```

**Ajouter un outil** (ex. météo, envoi d'e-mail, calendrier) : ajoute une fonction dans `lib/tools.js`,
déclare-la dans `TOOL_DEFS` et dans `IMPL`. L'IA saura l'utiliser toute seule.
