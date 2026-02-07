# CLAUDE.md — Vins & Conversations

## Contexte projet
Application web de gestion des ventes de vin pour **Vins & Conversations** (Nicolas Froment).
Multi-profils (Admin, Etudiant, Enseignant, CSE, Ambassadeur, BTS NDRC), multi-campagnes, moteur de regles configurable.

**Document de reference :** `cdc-dev-vins-conversations-v4.docx` — CDC verrouille v4

## Architecture
- **Backend:** Node.js + Express + PostgreSQL 16 + Knex (migrations)
- **Frontend:** React 18 + Tailwind CSS + Vite + React Router + Recharts
- **Auth:** JWT (access 15min + refresh 7j httpOnly cookie) + RBAC par module et par campagne
- **Infra:** Docker Compose (postgres + redis + api + frontend)
- **Docs API:** Swagger UI sur `/api/docs`
- **Cache:** Redis (TTL 60s) pour dashboards admin, degradation gracieuse si Redis indisponible
- **Performance:** Compression gzip, indexes DB sur colonnes frequentes

## Etat actuel — Toutes phases terminees (76/76 tests)

### Phase 1 — Auth, Commandes, Dashboard
- [x] Auth JWT complète (login, register, refresh, logout)
- [x] RBAC middleware (role + scope campagne)
- [x] Audit middleware (append-only logging)
- [x] Moteur de regles JSONB (tarification, commissions, gratuites, paliers)
- [x] Dashboard etudiant, admin cockpit, enseignant
- [x] Commandes (creation, validation, listing)
- [x] Frontend: Login, Admin Layout (17 modules sidebar), Student Dashboard

### Phase 2 — Back-office complet
- [x] Stock (mouvements, alertes, retours/avoirs)
- [x] BL (generation auto, suivi, signature numerique)
- [x] CRM (contacts, source tracking, historique)
- [x] Fournisseurs, Tournees, Paiements
- [x] Notifications (centre + parametrage)
- [x] Frontend: 8 composants admin

### Phase 3 — Stripe, CSE, Exports, Pricing, Finance
- [x] Integration Stripe (webhooks, rapprochement auto)
- [x] Dashboard CSE (e-commerce, prix -10%, min 200 EUR, virement 30j)
- [x] 6 exports (Pennylane CSV, journal ventes, commissions, stock, BL PDF, rapport)
- [x] Conditions commerciales CRUD
- [x] Finance & marges (global, par produit, par segment)

### Phase 4 — Ambassadeurs, BTS, Enseignant, Utilisateurs
- [x] Dashboard Ambassadeur (tiers Bronze/Argent/Or/Platine, parrainage, QR)
- [x] Dashboard BTS NDRC (6 modules formation, progression, quiz)
- [x] Dashboard Enseignant (vue classe sans EUR, jauge SVG, alertes inactivite)
- [x] Gestion utilisateurs (CRUD, toggle, import CSV, invitations)

### Phase 5 — Consolidation & mise en production
- [x] Analytics complet (taux conversion, CA/periode, top vendeurs/produits, comparaison campagnes)
- [x] Audit trail complet (journal avec diff before/after, filtres, pagination)
- [x] Documentation Swagger/OpenAPI (tous endpoints documentes sur /api/docs)
- [x] Performance (Redis cache, 15 indexes DB, compression gzip)
- [x] Securite (toutes routes admin protegees, Joi validation, Helmet, CORS, rate limiting)
- [x] Duplication campagne verifiee (copie produits, PAS orders/participations)
- [x] Cleanup (plus de PlaceholderModule, tous redirects corrects)

## Commandes cles

```bash
# Demarrer tout
docker compose up -d

# Migrations
cd backend && npm run migrate

# Seeds (donnees Sacre-Coeur)
cd backend && npm run seed

# Reset complet
cd backend && npm run seed:fresh

# Tests (76 tests)
cd backend && npm test

# Dev sans Docker
cd backend && npm run dev    # API port 3001
cd frontend && npm run dev   # Frontend port 5173

# Documentation API
# Ouvrir http://localhost:3001/api/docs
```

## Regles metier critiques (CDC §3)

1. **Tarification** : evaluee depuis `client_types.pricing_rules` JSONB. Zero hardcoding.
2. **Commission association** : 5% du CA HT **global** de la campagne (pas par produit)
3. **Bouteilles gratuites** : 1 gratuite pour 12 vendues, choix etudiant dans le catalogue
4. **Paliers ambassadeurs** : Bronze 500 EUR, Argent 1500 EUR, Or 3000 EUR, Platine 5000 EUR
5. **Enseignant** : ne voit JAMAIS de montant en euros — verifier API + frontend
6. **Immutabilite financiere** : financial_events est append-only, jamais de UPDATE/DELETE
7. **Especes** : tracer les depots avec date, montant, deposant (risque fiscal)
8. **CSE** : remise 10%, commande min 200 EUR, paiement virement 30j

## Convention de code

- ESM pour le frontend (import/export), CommonJS pour le backend (require)
- Noms de fichiers : camelCase pour les services, PascalCase pour les composants React
- Routes API : prefixe `/api/v1/`, admin derriere `/admin/`
- Toujours valider les inputs avec Joi
- Toujours auditer les actions admin (middleware audit)
- Toujours verifier le scope campagne (middleware requireCampaignAccess)

## Comptes de test (seed)
| Email | Role | MDP |
|---|---|---|
| nicolas@vins-conversations.fr | super_admin | VinsConv2026! |
| matheo@vins-conversations.fr | commercial | VinsConv2026! |
| enseignant@sacrecoeur.fr | enseignant | VinsConv2026! |
| ackavong@eleve.sc.fr | etudiant | VinsConv2026! |
| cse@leroymerlin.fr | cse | VinsConv2026! |
| ambassadeur@example.fr | ambassadeur | VinsConv2026! |
| bts@espl.fr | etudiant (BTS) | VinsConv2026! |

## Routes API (24 groupes)
| Prefixe | Module |
|---|---|
| /api/v1/auth | Authentification |
| /api/v1/products | Catalogue |
| /api/v1/orders | Commandes |
| /api/v1/dashboard/* | 6 dashboards (student, admin, teacher, cse, ambassador, bts) |
| /api/v1/admin/campaigns | Campagnes + duplication |
| /api/v1/admin/stock | Stock + mouvements + retours |
| /api/v1/admin/delivery-notes | Bons de livraison |
| /api/v1/admin/contacts | CRM |
| /api/v1/admin/suppliers | Fournisseurs |
| /api/v1/admin/payments | Paiements + depot especes |
| /api/v1/admin/delivery-routes | Tournees |
| /api/v1/admin/pricing-conditions | Conditions commerciales |
| /api/v1/admin/exports | 6 exports CSV/PDF |
| /api/v1/admin/margins | Finance & marges |
| /api/v1/admin/analytics | Analytics |
| /api/v1/admin/audit-log | Journal d'audit |
| /api/v1/admin/users | Gestion utilisateurs |
| /api/v1/admin/invitations | Invitations |
| /api/v1/payments | Stripe PaymentIntents |
| /api/v1/webhooks | Stripe webhooks |
| /api/v1/notifications | Centre notifications |
| /api/v1/ambassador | Parrainage |
| /api/v1/formation | Modules formation BTS |
| /api/docs | Documentation Swagger |
