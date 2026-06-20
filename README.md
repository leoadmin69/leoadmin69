# Bizerte Beach Tennis - Platform Web Officielle

Plateforme web moderne pour la gestion du premier événement de Beach Tennis en Tunisie sur les plages de Bizerte.

## 🎯 Fonctionnalités

### Section Publique
- **Présentation de l'événement** : Description du concept unique mélangeant Beach Tennis et musique
- **Inscription des équipes** : Formulaire complet pour enregistrer des équipes mixtes (1H + 1F)
- **Gestion des tarifs** : Tarification flexible selon le niveau et l'âge des joueurs
- **Section partenaires** : Formulaire dédié pour les sponsors

### Section Organisateurs (Sécurisée)
- **Gestion du tirage au sort** : Génération automatique des tableaux selon le nombre d'équipes
- **Suivi des scores en direct** : Interface pour arbitres avec mise à jour automatique
- **Système de tableaux multiples** : OR, ARGENT, BRONZE, CUIVRE
- **Sauvegarde en temps réel** : Synchronisation automatique pour jusqu'à 10 connexions

## 🛠️ Stack Technique

- **Framework** : Next.js 14 (React 18 + TypeScript)
- **Styling** : Tailwind CSS + CSS personnalisé
- **3D Graphics** : Three.js + React Three Fiber
- **Base de données** : SQLite (better-sqlite3) avec WAL mode
- **Email** : Nodemailer
- **Auth** : JWT + Bcrypt

## 📋 Règles du Tournoi

### Format des Matchs
- **2 Sets de 4 jeux** (première équipe à 4 gagne le set)
- **À 3-3 → Tie-break en 5 points**
- **Super Tie-break en 7 points** si 1 set partout
- **Point Décisif (No-Ad)** à 40-40

### Structure des Tableaux
1. **Ronde 1 (Qualifications/1/8 finale)**
   - Vainqueurs → Tableau OR
   - Perdants → Tableau BRONZE

2. **Ronde 2 (Quarts)**
   - Tableau OR : Vainqueurs → Demi-finales, Perdants → Tableau ARGENT
   - Tableau BRONZE : Vainqueurs → Demi-finales, Perdants → Tableau CUIVRE

3. **Rondes 3 & 4 (Demi-finales & Finales)**
   - Classements définitifs : Places 1-4 (OR), 5-8 (ARGENT), 9-12 (BRONZE), 13-16 (CUIVRE)

## 🚀 Installation & Démarrage

### Prérequis
- Node.js 18+
- npm ou yarn

### Installation
```bash
# Cloner le repository
git clone <repo-url>
cd bizerte-beach-tennis

# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env

# Configurer les variables d'environnement
# Éditer .env avec vos paramètres SMTP et clés secrètes
```

### Développement
```bash
npm run dev
# Accès à http://localhost:3000
```

### Production
```bash
npm run build
npm start
```

## 📧 Configuration Email

Pour activer les notifications d'inscription:

1. Configurer les variables SMTP dans `.env`
2. Pour Gmail: générer un [mot de passe d'application](https://support.google.com/accounts/answer/185833)
3. Les emails sont envoyés aux deux joueurs et à `bizertebtf@gmail.com`

## 🔒 Sécurité

- Mot de passe organisateur hashé avec salt
- JWT tokens pour les sessions
- Cookies HTTP-only
- Protection CSRF intégrée Next.js
- Validation des entrées avec Zod
- WAL mode SQLite pour concurrence

## 📱 Compatibilité

- Desktop (Chrome, Firefox, Safari, Edge)
- Tablette
- Mobile (responsive design)
- Navigation tactile optimisée

## 🌙 Design

- **Thème** : Dark Mode moderne
- **Palette** : Bleus (#00d4ff), Gris, Noir
- **Accents** : Or (#ffd700)
- **3D** : Raquette de Beach Tennis interactive

## 📞 Support

Pour toute question ou problème technique:
- Email: bizertebtf@gmail.com
- Plage de Bizerte, Méditerranée - Tunisie

---

**Créé avec ❤️ pour la première édition de Bizerte Beach Tennis 2024**
