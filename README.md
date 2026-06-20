# Bizerte Beach Tennis - Tournament Management Platform

Une plateforme Single-Page moderne pour gérer le premier événement de Beach Tennis en Tunisie sur la plage de Bizerte.

## 🎾 Caractéristiques

### Section Publique
- **Présentation de l'Événement**: Concept unique Beach Tennis + Musique
- **Inscription des Équipes**: Formulaire mixte (1H + 1F)
- **Partenaires & Sponsoring**: Formulaires de partenariat professionnel

### Section Organisateurs (Sécurisée)
- **Gestion des Équipes**: Suivi des inscriptions et paiements
- **Tirage au Sort Adaptatif**: Support flexible pour 2-16+ équipes
- **Scoring Live**: Interface d'arbitrage avec système de tableaux (OR, ARGENT, BRONZE, CUIVRE)
- **Résultats**: Classements en temps réel avec progression automatique

## 🛠️ Stack Technologique

- **Framework**: Next.js 15 (React)
- **Styling**: Tailwind CSS
- **3D**: Three.js + React Three Fiber
- **Validation**: Zod + React Hook Form
- **TypeScript**: Pour la sécurité des types

## 📋 Règles du Match

- **Format**: 2 sets de 4 jeux (première à 4)
- **Durée**: Max 30 minutes
- **Tie-break**: À 3-3 (5 points)
- **Super Tie-break**: Si 1-1 en sets (7 points)
- **Règle Mixte**: Homme sert à homme, femme à femme

## 💰 Tarification

| Catégorie | Prix |
|-----------|------|
| Confirmés & Intermédiaires | 80 DT |
| Étudiants / -18 ans / Débutants | 50 DT |

## 🔒 Accès Organisateurs

Mot de passe par défaut (à changer): `admin2024`

Accès via le bouton "Organisateurs" dans la navigation.

## 🚀 Installation & Démarrage

```bash
# Installation des dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Accéder à l'application
# http://localhost:3000
```

## 📁 Structure du Projet

```
├── app/
│   ├── api/              # Routes API
│   ├── globals.css       # Styles globaux
│   ├── layout.tsx        # Layout principal
│   └── page.tsx          # Page d'accueil
├── components/
│   ├── Header.tsx        # Navigation
│   ├── Hero.tsx          # Section héros avec 3D
│   ├── 3D/              # Composants 3D
│   ├── forms/           # Formulaires
│   ├── organizer/       # Section organisateurs
│   └── sections/        # Sections publiques
├── types/               # Définitions TypeScript
└── public/             # Assets statiques
```

## 📊 Système de Tableaux

### Structure Adaptative
- **≤16 équipes**: BYEs au besoin
- **>16 équipes**: Phase qualificative préliminaire

### Progression
1. **Ronde 1**: Vainqueurs → OR, Perdants → BRONZE
2. **Ronde 2**: 
   - OR: V → OR QF, P → ARGENT
   - BRONZE: V → BRONZE QF, P → CUIVRE
3. **Finales**: Classement final 1-4 (OR), 5-8 (ARGENT), 9-12 (BRONZE), 13-16 (CUIVRE)

## 🔐 Sécurité

- Authentification par mot de passe pour l'espace organisateurs
- Sessions sécurisées avec cookies httpOnly
- Validation des données avec Zod
- Support de 10 connexions simultanées

## 📧 Notifications

- Confirmation automatique par email à l'inscription
- Identifiant unique d'équipe généré et envoyé
- Notifications aux organisateurs sur bizertebtf@gmail.com

## 🎨 Design

- **Theme**: Dark Mode haut de gamme
- **Inspiration**: ciaoenergy.com
- **3D Element**: Raquette de beach tennis interactive
- **Colors**: Ocean Blues, Gold Accent, Medal Metals

## 📝 Variables d'Environnement

```env
# .env.local
ORGANIZER_PASSWORD=admin2024
SMTP_USER=bizertebtf@gmail.com
SMTP_PASSWORD=your_password
DATABASE_URL=your_database_url
```

## 🎯 Prochaines Étapes

- [ ] Intégration base de données (Prisma)
- [ ] Service email (EmailJS/Resend)
- [ ] Système de paiement (Stripe/Tap)
- [ ] Export PDF/Excel
- [ ] WebSocket pour live sync
- [ ] Analytics

## 📄 Licence

Propriétaire - Bizerte Beach Tennis 2024

## 👥 Contact

**Email**: bizertebtf@gmail.com

---

Plateforme créée avec ❤️ pour le Beach Tennis en Tunisie
