# Vins & Conversations — Plateforme de gestion des ventes de vin

## Contexte projet

Application web centralisée de gestion des ventes de vin multi-canaux (écoles, CSE, ambassadeurs).
Fondée par Nicolas Froment. Remplace une gestion Excel par une plateforme complète.

- **CDC de référence** : CDC V4.0 + Avenant V4.1 (13/02/2026)
- **Stack** : Node.js/Express + React 18 + Tailwind CSS + PostgreSQL 16 + Redis
- **Architecture** : Monorepo, API REST JSON, JWT auth, RBAC par module et campagne
- **Hébergement** : Docker (docker-compose.yml), CI/CD GitHub Actions

---

## Structure du monorepo

```
/
├── backend/
│   └── src/
│       ├── config/          # database.js, knexfile.js, redis.js, tastingCriteria.js
│       ├── routes/          # 24 fichiers de routes (voir liste ci-dessous)
│       ├── services/        # Logique métier (orderService, rulesEngine, stripeService, etc.)
│       ├── middleware/       # auth.js, audit.js, cache.js, validate.js
│       ├── migrations/      # 12 fichiers de migration Knex
│       └── tests/           # api.integration.test.js, rulesEngine.test.js
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── admin/       # 20 composants (Cockpit, Campaigns, Orders, Catalog, Users, etc.)
│       │   ├── student/     # Dashboard étudiant
│       │   ├── teacher/     # Dashboard enseignant
│       │   ├── bts/         # Dashboard BTS NDRC
│       │   ├── cse/         # Dashboard CSE
│       │   ├── ambassador/  # Dashboard ambassadeur
│       │   ├── boutique/    # BoutiqueHome, CartPage, CheckoutPage, ProductDetail, etc.
│       │   └── shared/      # InstallGuide, PaymentModal, NotificationBell, Toast, SignaturePad
│       └── layouts/         # Admin, Teacher, BTS, CSE, Ambassador, Public
├── docker-compose.yml
├── .github/workflows/ci.yml
└── manifest.json + sw.js    # PWA
```

---

## Routes backend existantes (24)

auth, campaigns, orders, products, users, analytics, exports, margins, payments,
stock, suppliers, contacts, deliveryNotes, deliveryRoutes, formation, invitations,
notifications, categories, ambassador, auditLog, catalogPdf, boutiqueAPI,
paymentIntents, publicCatalog, webhooks, pricingConditions, dashboard

---

## Services backend existants

- **orderService** : création/validation commandes
- **dashboardService** : données agrégées par profil
- **rulesEngine** : évaluation dynamique des règles métier JSONB (tarification, commissions, gratuités, paliers)
- **stripeService** : intégration paiement Stripe
- **emailService** : envoi emails
- **badgeService** : gamification (badges, streaks)
- **notificationService** : notifications temps réel
- **boutiqueOrderService** : commandes boutique publique
- **cartService** : gestion panier
- **marginFilters** : calcul et filtrage marges

---

## Middleware existant

- **auth.js** : vérification JWT, extraction contexte utilisateur (userId, roles, permissions, campaign_ids)
- **audit.js** : logging automatique des actions admin dans audit_log
- **cache.js** : cache Redis pour les requêtes fréquentes
- **validate.js** : validation des payloads API

---

## Base de données PostgreSQL

### Tables existantes (20 tables CDC V4.0)

**Utilisateurs** : users, participations, invitations
**Organisations** : organizations, campaigns, client_types
**Catalogue** : products, campaign_products, stock_movements
**Commandes/Finance** : orders, order_items, financial_events, payments, delivery_notes, returns, contacts
**Admin** : audit_log, notifications, delivery_routes, pricing_conditions

### Nouvelles tables (Avenant V4.1 — À CRÉER)

- **product_categories** : catégories dynamiques (remplace le champ string `category` dans products)
- **shipping_zones** : zones de livraison par département
- **shipping_rates** : grille tarifaire transport historisée
- **campaign_resources** : pièces jointes et liens par campagne
- **app_settings** : paramètres globaux (logo, nom, couleurs)

### Colonnes à ajouter sur tables existantes (Avenant V4.1)

- `products` : ajouter `category_id` (FK → product_categories), `is_featured` (BOOLEAN)
- `organizations` : ajouter `logo_url` (VARCHAR 500)
- `participations` : ajouter `referral_code` (VARCHAR 20 UNIQUE)
- `orders` : ajouter `referred_by` (FK → users.id), `referral_code_used` (VARCHAR 20)
- `order_items` : ajouter `type` ENUM('product', 'shipping')

### ORM / Query builder

Knex.js (migrations + queries). Fichier de config : `backend/src/config/knexfile.js`.

---

## Moteur de règles (rulesEngine)

Cœur de la plateforme. Les règles sont stockées en JSONB dans `client_types` et évaluées dynamiquement.

- **pricing_rules** : tarification par type de client (remises, min_order)
- **commission_rules** : commissions association + étudiant (double cagnotte V4.1)
- **free_bottle_rules** : bouteilles gratuites (every_n_sold)
- **tier_rules** : paliers ambassadeurs (Bronze/Argent/Or/Platine)

**Principe fondamental** : ZÉRO règle métier hardcodée dans le code. Tout est configurable via l'admin.

---

## Authentification & RBAC

- JWT : access token 15min + refresh token 7j (httpOnly cookie)
- Payload JWT : `{ userId, roles[], permissions[], campaign_ids[] }`
- 8 rôles : Super Admin, Commercial, Comptable, Enseignant, Étudiant, CSE, Ambassadeur, Lecture seule
- Permissions vérifiées à 2 niveaux : accès module + scope campagne
- Middleware auth vérifie signature + extrait contexte utilisateur

---

## Principes de développement

### Architecture

- **Immutabilité financière** : les financial_events sont append-only. Jamais de modification, que des ajouts (corrections = nouvel événement type "correction")
- **Scope campagne** : TOUTES les données sont segmentées par campagne. Un utilisateur ne voit QUE ses campagnes
- **Configurabilité** : toute règle métier vient de la DB (client_types JSONB), jamais du code
- **Audit total** : chaque action admin est loggée (audit_log) avec avant/après et justification

### Code

- **Backward compatibility** : quand on modifie une structure (ex: category string → category_id FK), l'API retourne les DEUX formats pendant la transition
- **Invalidation cache** : quand l'admin modifie des règles (client_types, pricing_conditions), invalider le cache Redis immédiatement
- **Pas de données financières pour les enseignants** : le dashboard/teacher ne retourne JAMAIS de montants en €
- **Tests obligatoires** : chaque nouveau endpoint doit avoir des tests dans api.integration.test.js ou un fichier dédié

### Conventions

- API prefix : `/api/v1`
- Nommage routes : camelCase pour les fichiers, kebab-case pour les URLs
- Migrations Knex : format `YYYYMMDDHHMMSS_description.js`
- Composants React : PascalCase, un composant par fichier
- Styles : Tailwind CSS, mobile-first
- Gestion erreurs API : `{ error: true, message: "...", code: "ERROR_CODE" }`

---

## Modifications en cours (Avenant V4.1)

### Priorité URGENTE
1. **Bug min_order CSE** : le min_order=0 paramétré dans l'admin ne se répercute pas côté boutique (problème cache ou route)

### Priorité HAUTE
2. **Catégories produits dynamiques** : nouvelle table product_categories, migration category string → category_id FK, CRUD admin, adaptation wizard boutique
3. **Logos paramétrables** : logo V&C dans app_settings, logo partenaire dans organizations.logo_url, propagation dans tous les templates (header, PDF, BL)
4. **Double cagnotte étudiante** : commission_rules enrichies (fund_collective + fund_individual), composant React WinePiggyBank (cochon tirelire SVG animé avec vin qui ondule)

### Priorité MOYENNE
5. **Lien partage étudiant (referral)** : referral_code dans participations, referred_by dans orders, boutique partageable, CA attribué à l'étudiant
6. **Grille tarifaire transport** : tables shipping_zones + shipping_rates, calcul auto à la commande par département × quantité bouteilles

### Priorité BASSE
7. **Toggle sélection du moment** : is_featured sur products, 1 featured par catégorie, section boutique
8. **Espace ressources campagne** : table campaign_resources, onglet dans dashboard étudiant/BTS

---

## Commandes utiles

```bash
# Dev
npm run dev              # Lance front + back en dev
npm run dev:backend      # Backend seul
npm run dev:frontend     # Frontend seul

# Base de données
npx knex migrate:latest  # Appliquer les migrations
npx knex migrate:rollback # Rollback dernière migration
npx knex seed:run        # Charger les données de test

# Tests
npm test                 # Tous les tests
npm run test:backend     # Tests backend uniquement

# Docker
docker-compose up -d     # Lance tout (DB + Redis + App)
docker-compose down      # Arrête tout

# Build
npm run build            # Build production
```

---

## Données de test / Seeds

### Produits catalogue
Oriolus Blanc (6.50€), Cuvée Clémence (8.50€), Carillon (12.50€), Apertus (13.50€),
Crémant de Loire (12.90€), Coffret Découverte 3bt (32.00€), Coteaux du Layon (11.00€),
Jus de Pomme (3.50€)

### Catégories
Blancs Secs, Blancs Moelleux, Rouges, Effervescents, Sans Alcool, Coffrets

### Campagnes actives
- Sacré-Cœur 2025-2026 (Financement Projet, 18 063€ / 25 000€)
- CSE Leroy Merlin (Offre CSE, 4 520€ / 8 000€)
- Ambassadeurs Loire (Réseau Ambassadeur, 6 780€ / 15 000€)
- ESPL Angers (Financement Projet, 8 920€ / 12 000€)

### Étudiants test (Sacré-Cœur)
ACKAVONG Mathéo (2 383.70€, GA), BOURCIER Lilian (2 231.90€, GB),
LEBRETON Paul (1 802.60€, GA), FLIPEAU Lilian (1 677.90€, GA)

---

## Points d'attention critiques

1. **L'enseignant ne voit JAMAIS de montants en €** — vérifier systématiquement l'API /dashboard/teacher
2. **Les étudiants ne manipulent PAS Stripe** — c'est V&C (Nicolas) qui encaisse
3. **Les espèces doivent être tracées** — dépôt obligatoire avec date, montant, déposant
4. **Cache Redis** — invalider après TOUTE modification admin (client_types, pricing_conditions, products)
5. **Facturation électronique** — obligatoire septembre 2026, exports Pennylane doivent anticiper
6. **RGPD mineurs** — consentement parental obligatoire à l'onboarding
7. **Append-only pour les financial_events** — JAMAIS de UPDATE ou DELETE sur cette table
