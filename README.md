# 🍷 Vins & Conversations — Plateforme de gestion

Application web centralisée de gestion des ventes de vin.
Multi-profils • Multi-campagnes • Moteur de règles configurable.

## Démarrage rapide

### Prérequis
- Docker & Docker Compose
- Node.js 20+ (pour le dev local sans Docker)

### Avec Docker (recommandé)

```bash
# Cloner et démarrer
cp .env.example .env
docker compose up -d

# Exécuter les migrations et seeds
docker exec vc-api npm run migrate
docker exec vc-api npm run seed

# Frontend : http://localhost:5173
# API :      http://localhost:3001
# Health :   http://localhost:3001/api/health
```

### Sans Docker (dev local)

```bash
# PostgreSQL et Redis doivent tourner localement
cp .env.example .env
# Modifier DATABASE_URL et REDIS_URL dans .env

# Backend
cd backend
npm install
npm run migrate
npm run seed
npm run dev

# Frontend (dans un autre terminal)
cd frontend
npm install
npm run dev
```

### Tests

```bash
cd backend
npm test            # Tests unitaires avec couverture
npm run test:watch  # Mode watch
```

## Comptes de démonstration

| Profil | Email | Mot de passe |
|--------|-------|-------------|
| Admin | nicolas@vins-conversations.fr | VinsConv2026! |
| Commercial | matheo@vins-conversations.fr | VinsConv2026! |
| Enseignant | enseignant@sacrecoeur.fr | VinsConv2026! |
| Étudiant | ackavong@eleve.sc.fr | VinsConv2026! |
| CSE | cse@leroymerlin.fr | VinsConv2026! |
| Ambassadeur | ambassadeur@example.fr | VinsConv2026! |

## Architecture

```
├── backend/
│   └── src/
│       ├── auth/          # Service JWT
│       ├── config/        # DB, Redis, Knex
│       ├── middleware/     # Auth, RBAC, Audit, Validation
│       ├── migrations/    # Schema 20 tables PostgreSQL
│       ├── routes/        # 52+ endpoints REST
│       ├── seeds/         # Données Sacré-Cœur
│       ├── services/      # Logique métier (règles, commandes, dashboards)
│       └── tests/         # Jest
├── frontend/
│   └── src/
│       ├── components/    # Admin, Student, Shared, Layout
│       ├── contexts/      # AuthContext
│       ├── pages/         # Login, etc.
│       └── services/      # API client Axios
├── docker-compose.yml
├── CLAUDE.md              # Instructions pour Claude Code
└── .env.example
```

## Licence

Propriété de Vins & Conversations — Nicolas Froment. Usage interne uniquement.
# vins-et-conversations
