# CLAUDE.md — Vins & Conversations

## Contexte projet
Application web de gestion des ventes de vin pour **Vins & Conversations** (Nicolas Froment).
Multi-profils (Admin, Étudiant, Enseignant, CSE, Ambassadeur, BTS NDRC), multi-campagnes, moteur de règles configurable.

**Document de référence :** `cdc-dev-vins-conversations-v4.docx` — CDC verrouillé v4

## Architecture
- **Backend:** Node.js + Express + PostgreSQL 16 + Knex (migrations)
- **Frontend:** React 18 + Tailwind CSS + Vite + React Router + Recharts
- **Auth:** JWT (access 15min + refresh 7j httpOnly cookie) + RBAC par module et par campagne
- **Infra:** Docker Compose (postgres + redis + api + frontend)

## État actuel (Phase 0 + Phase 1 partiel)

### ✅ Terminé
- [x] Structure projet complète
- [x] Docker Compose (PostgreSQL 16, Redis 7, API, Frontend)
- [x] Migration des 20 tables PostgreSQL (CDC §2.3)
- [x] Seeds complets avec données Sacré-Cœur (CDC §7)
- [x] Auth JWT complète (login, register, refresh, logout)
- [x] Middleware RBAC (rôle + scope campagne)
- [x] Middleware audit (append-only logging)
- [x] Moteur de règles JSONB (CDC §3 — tarification, commissions, gratuités, paliers)
- [x] Service Dashboard (étudiant, admin cockpit, enseignant)
- [x] Service Commandes (création, validation, listing)
- [x] Routes API : auth, products, orders, dashboard, campaigns, stock
- [x] Frontend : Login, Admin Layout (sidebar 16 modules), Admin Cockpit, Student Dashboard mobile
- [x] Tests unitaires moteur de règles + sécurité enseignant

### 🔲 À faire — Phase 1 (prioritaire)
- [ ] Module admin Commandes (liste filtrable, détail, actions)
- [ ] Module admin Catalogue (CRUD produits avec images)
- [ ] Module admin Campagnes (liste KPIs, wizard création)
- [ ] Classement détaillé étudiant (endpoint /ranking)
- [ ] Historique commandes étudiant
- [ ] Tests d'intégration API (supertest)
- [ ] Tests Cypress E2E (login → commande → validation)

### 🔲 Phase 2 — Back-office
- [ ] Stock : module admin complet (mouvements, alertes, retours/avoirs)
- [ ] BL : génération auto, suivi, signature numérique mobile
- [ ] CRM : contacts, source tracking, historique
- [ ] Fournisseurs : liste, suggestions réappro
- [ ] Tournées : planification, regroupement zone
- [ ] Paiements : rapprochement Stripe webhook, virement, espèces (dépôt traçable)
- [ ] Notifications : centre + paramétrage alertes auto

### 🔲 Phase 3 — Paiement + CSE + Exports
- [ ] Intégration Stripe complète (webhooks, rapprochement auto)
- [ ] Dashboard CSE (e-commerce pur, prix -10%, commande min 200€, virement 30j)
- [ ] 6 types d'export (Pennylane CSV, journal ventes, commissions, stock, BL, rapport)
- [ ] Conditions commerciales admin (grille tarifaire)

### 🔲 Phase 4 — Ambassadeurs + BTS + Enseignant
- [ ] Dashboard Ambassadeur (tiers, progression, lien parrainage, QR, stats)
- [ ] Dashboard BTS NDRC (modules formation, vidéos, quiz)
- [ ] Dashboard Enseignant frontend (vue classe sans €)
- [ ] Gestion utilisateurs & droits (rôles, permissions, invitations, QR, import CSV)

### 🔲 Phase 5 — Consolidation
- [ ] Audit trail complet
- [ ] Tests de charge
- [ ] Documentation API (Swagger/OpenAPI)
- [ ] Duplication campagne 2026-2027
- [ ] Monitoring et alertes ops

## Commandes clés

```bash
# Démarrer tout
docker compose up -d

# Migrations
cd backend && npm run migrate

# Seeds (données Sacré-Cœur)
cd backend && npm run seed

# Reset complet
cd backend && npm run seed:fresh

# Tests
cd backend && npm test

# Dev sans Docker
cd backend && npm run dev    # API port 3001
cd frontend && npm run dev   # Frontend port 5173
```

## Règles métier critiques (CDC §3)

1. **Tarification** : évaluée depuis `client_types.pricing_rules` JSONB. Zéro hardcoding.
2. **Commission association** : 5% du CA HT **global** de la campagne (pas par produit)
3. **Bouteilles gratuites** : 1 gratuite pour 12 vendues, choix étudiant dans le catalogue
4. **Paliers ambassadeurs** : Bronze 500€, Argent 1500€, Or 3000€, Platine 5000€
5. **Enseignant** : ne voit JAMAIS de montant en euros — vérifier API + frontend
6. **Immutabilité financière** : financial_events est append-only, jamais de UPDATE/DELETE
7. **Espèces** : tracer les dépôts avec date, montant, déposant (risque fiscal)
8. **CSE** : remise 10%, commande min 200€, paiement virement 30j

## Convention de code

- ESM pour le frontend (import/export), CommonJS pour le backend (require)
- Noms de fichiers : camelCase pour les services, PascalCase pour les composants React
- Routes API : préfixe `/api/v1/`, admin derrière `/admin/`
- Toujours valider les inputs avec Joi
- Toujours auditer les actions admin (middleware audit)
- Toujours vérifier le scope campagne (middleware requireCampaignAccess)

## Comptes de test (seed)
| Email | Rôle | MDP |
|---|---|---|
| nicolas@vins-conversations.fr | super_admin | VinsConv2026! |
| matheo@vins-conversations.fr | commercial | VinsConv2026! |
| enseignant@sacrecoeur.fr | enseignant | VinsConv2026! |
| ackavong@eleve.sc.fr | etudiant | VinsConv2026! |
| cse@leroymerlin.fr | cse | VinsConv2026! |
| ambassadeur@example.fr | ambassadeur | VinsConv2026! |
