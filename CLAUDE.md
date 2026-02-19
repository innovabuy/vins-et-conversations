# Vins & Conversations — CLAUDE.md
# Document de référence pour Claude Code
# Version 4.2 — 18/02/2026

---

## 1. CONTEXTE PROJET

**Vins & Conversations** est une plateforme de vente de vin multi-canaux fondée par Nicolas Froment (Loire Valley, 12 ans d'expérience). Elle remplace intégralement une gestion Excel par une application web centralisée.

**Canaux de vente** : établissements scolaires (BTS, lycées), CSE d'entreprises, réseau d'ambassadeurs, événements privés.

**Interlocuteurs** : Nicolas Froment (propriétaire, décisions métier), Mathéo (liaison client / stagiaire Sacré-Coeur).

**CDC de référence** : V4.0 (07/02/2026) + Avenant V4.1 (13/02/2026) + Avenant V4.2 (18/02/2026)

---

## 2. STACK TECHNIQUE

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18 + Tailwind CSS (SPA, mobile-first) |
| Backend | Node.js + Express (API REST JSON) |
| Base de données | PostgreSQL 16 (JSONB pour règles métier) |
| Auth | JWT — access token 15min + refresh token 7j (httpOnly cookie) |
| Cache | Redis (invalider après TOUTE modification admin) |
| Paiement | Stripe (webhooks) — seul Nicolas encaisse, jamais les étudiants |
| Export comptable | Format Pennylane + CSV |
| Hébergement | Docker (docker-compose.yml), CI/CD GitHub Actions |
| ORM | Knex.js — migrations format `YYYYMMDDHHMMSS_description.js` |

---

## 3. STRUCTURE DU MONOREPO

```
/
├── backend/
│   └── src/
│       ├── config/       # database.js, knexfile.js, redis.js, tastingCriteria.js
│       ├── routes/       # 34 fichiers de routes
│       ├── services/     # Logique métier (10 services)
│       ├── middleware/   # auth.js, audit.js, cache.js, validate.js
│       ├── migrations/   # 27 fichiers Knex
│       └── tests/        # 22 fichiers de tests (251+ tests)
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── admin/       # 20 composants (Cockpit, Campaigns, Orders, Catalog, Users...)
│       │   ├── student/     # Dashboard étudiant
│       │   ├── teacher/     # Dashboard enseignant (JAMAIS de montants)
│       │   ├── bts/         # Dashboard BTS NDRC
│       │   ├── cse/         # Dashboard CSE (e-commerce)
│       │   ├── ambassador/  # Dashboard ambassadeur
│       │   ├── boutique/    # BoutiqueHome, CartPage, CheckoutPage, ProductDetail
│       │   └── shared/      # Composants partagés tous profils
│       └── layouts/         # Admin, Teacher, BTS, CSE, Ambassador, Public
├── docker-compose.yml
├── .github/workflows/ci.yml
└── manifest.json + sw.js    # PWA
```

---

## 4. ROUTES BACKEND (34)

auth, campaigns, orders, products, users, analytics, exports, margins, payments,
stock, suppliers, contacts, deliveryNotes, deliveryRoutes, formation, invitations,
notifications, categories, ambassador, auditLog, catalogPdf, boutiqueAPI,
paymentIntents, publicCatalog, webhooks, pricingConditions, dashboard,
appSettings, campaignResources, campaignTypes, clientTypes, organizationTypes,
referral, shipping, siteImages

---

## 5. SERVICES BACKEND (10)

- **orderService** — création/validation commandes
- **dashboardService** — données agrégées par profil
- **rulesEngine** — évaluation dynamique règles JSONB (tarification, commissions, gratuités, paliers)
- **stripeService** — paiement Stripe
- **emailService** — envoi emails
- **badgeService** — gamification (badges, streaks)
- **notificationService** — notifications temps réel
- **boutiqueOrderService** — commandes boutique publique
- **cartService** — gestion panier
- **marginFilters** — calcul et filtrage marges

---

## 6. BASE DE DONNÉES POSTGRESQL

### 6.1 Tables existantes

**Utilisateurs** : `users`, `participations`, `invitations`, `refresh_tokens`
**Organisations** : `organizations`, `campaigns`, `client_types`, `organization_types`, `campaign_types`, `organization_type_campaign_types`
**Catalogue** : `products`, `product_categories`, `campaign_products`, `stock_movements`
**Commandes/Finance** : `orders`, `order_items`, `financial_events`, `payments`, `delivery_notes`, `returns`, `contacts`
**Admin** : `audit_log`, `notifications`, `delivery_routes`, `pricing_conditions`, `app_settings`, `site_images`
**Transport** : `shipping_zones`, `shipping_rates`
**Campagne** : `campaign_resources`
**Référentiel** : `regions`

### 6.2 Tables V4.2

```sql
-- Régions géographiques (référentiel)
regions (
  id SERIAL, name VARCHAR(100), code VARCHAR(10), sort_order INTEGER
)
```

### 6.3 Colonnes clés

```sql
-- product_categories (enrichies V4.2)
product_type ENUM('wine','sparkling','food','beverage','gift_set','other')
is_alcohol BOOLEAN DEFAULT true
icon_emoji VARCHAR(10)   -- Fallback si pas d'icon_url

-- products
category_id FK → product_categories, is_featured, is_visible, allow_backorder, visible_boutique

-- campaigns
logo_url VARCHAR(500)    -- Fallback sur app_settings.logo_url si null

-- users (ambassadeurs)
ambassador_photo_url, region_id FK → regions, ambassador_bio, show_on_public_page

-- orders
source, referral_code, referred_by FK → users

-- order_items
type VARCHAR(20) DEFAULT 'product'  -- 'product' | 'shipping'

-- participations
referral_code VARCHAR(20) UNIQUE
```

---

## 7. MOTEUR DE RÈGLES (rulesEngine)

**Principe absolu : ZÉRO règle métier hardcodée dans le code. Tout vient de la DB.**

### 7.1 Règles de tarification (`pricing_rules`)
```json
{ "type": "percentage_discount", "value": 10, "applies_to": "all", "min_order": 200 }
```

### 7.2 Règles de commissions (`commission_rules`)
```json
{
  "association_rate": 0.05,
  "fund_collective": true,
  "fund_individual": true,
  "base": "gross_revenue_ht"
}
```

### 7.3 Règles de bouteilles gratuites (`free_bottle_rules`)

**Règle critique — gratuité toujours sur la bouteille la moins chère**

```json
{
  "trigger": "every_n_sold",
  "n": 12,
  "reward": "free_bottle",
  "choice": "student_picks",
  "from_catalog": true,
  "cost_method": "cheapest_in_order",
  "applies_to_alcohol_only": true
}
```

**Formule de marge corrigée (V4.2)** :
```
coût_gratuite       = prix_achat de la bouteille au plus bas prix_achat dans la commande
marge_brute_ligne   = Σ(prix_vente_HT - prix_achat) pour chaque order_item
marge_nette         = marge_brute_ligne - coût_gratuite
commission_asso     = CA_HT_brut × 0.05
```

### 7.4 Règles de paliers ambassadeurs (`tier_rules`)
```json
{
  "tiers": [
    { "label": "Bronze", "threshold": 500,  "reward": "Carte cadeau 25€",      "color": "#CD7F32" },
    { "label": "Argent", "threshold": 1500, "reward": "Carte cadeau 75€",      "color": "#C0C0C0" },
    { "label": "Or",     "threshold": 3000, "reward": "Carte cadeau 200€",     "color": "#C4A35A" },
    { "label": "Platine","threshold": 5000, "reward": "Week-end oenologique",  "color": "#E5E4E2" }
  ],
  "period": "cumulative",
  "reset": "never"
}
```

---

## 8. AUTHENTIFICATION & RBAC

- JWT payload : `{ userId, roles[], permissions[], campaign_ids[] }`
- 8 rôles : Super Admin, Commercial, Comptable, Enseignant, Étudiant, CSE, Ambassadeur, Lecture seule
- Permissions vérifiées à 2 niveaux : accès module + scope campagne
- **Permission `share_link`** : activée pour Étudiant et Ambassadeur (V4.2)

---

## 9. PRINCIPES DE DÉVELOPPEMENT

### Architecture
- **Immutabilité financière** : `financial_events` est append-only. JAMAIS de UPDATE/DELETE.
- **Scope campagne** : toutes les données segmentées par campagne.
- **Configurabilité** : toute règle métier vient de la DB (JSONB), jamais du code.
- **Audit total** : chaque action admin loggée dans `audit_log`.

### Code
- **Backward compatibility** : quand on modifie une structure, l'API retourne les DEUX formats.
- **Invalidation cache Redis** : après TOUTE modification admin.
- **Enseignant** : `/dashboard/teacher` ne retourne JAMAIS de montants en euros.
- **Tests obligatoires** : chaque nouvel endpoint doit avoir des tests.

### Conventions
- API prefix : `/api/v1`
- Routes : camelCase pour les fichiers, kebab-case pour les URLs
- Migrations Knex : `YYYYMMDDHHMMSS_description.js`
- Composants React : PascalCase, un composant par fichier
- Styles : Tailwind CSS, mobile-first
- Erreurs API : `{ error: true, message: "...", code: "ERROR_CODE" }`

---

## 10. PLAN D'IMPLÉMENTATION V4.2

### Ordre d'exécution

```
BLOC 0 (BDD) → BLOC 1 (bugs urgents) → BLOC 2 (catégories adaptatives) → BLOC 3 (calcul marge)
→ BLOC 4 (exports) → BLOC 5 (referral) → BLOC 6 (photos extranets) → BLOC 7 (branding)
→ BLOC 8 (catalogue) → BLOC 9 (transport) → BLOC 10 (modale produit) → BLOC 11 (ambassadeurs dynamiques)
→ BLOC 12 (export ventes par contact)
```

### Gate de qualité avant chaque merge
```bash
docker exec vc-api npm test        # 251+ tests doivent passer
docker exec vc-frontend npx vite build  # Build frontend sans erreur
```

---

## 11. COMMANDES UTILES

```bash
# Tests
docker exec vc-api npm test
docker exec vc-frontend npx vite build

# Base de données
docker exec vc-api npx knex migrate:latest
docker exec vc-api npx knex migrate:rollback
docker exec vc-api npx knex seed:run

# Docker
docker-compose up -d
docker-compose down
docker-compose logs -f vc-api
```

---

## 12. DONNÉES DE TEST / SEEDS

### Produits catalogue
| Produit | Prix TTC | Prix HT | Prix achat | Catégorie | Label |
|---------|----------|---------|------------|-----------|-------|
| Oriolus Blanc | 6,50 | 5,42 | 3,20 | Blancs Secs | HVE |
| Cuvée Clémence | 8,50 | 7,08 | 4,10 | Blancs Moelleux | Bio |
| Carillon | 12,50 | 10,42 | 5,80 | Rouges | Cru Bourgeois |
| Apertus | 13,50 | 11,25 | 6,50 | Rouges | HVE |
| Crémant de Loire | 12,90 | 10,75 | 5,90 | Effervescents | - |
| Coffret Découverte 3bt | 32,00 | 26,67 | 14,00 | Coffrets | - |
| Coteaux du Layon | 11,00 | 9,17 | 5,30 | Blancs Moelleux | HVE |
| Jus de Pomme | 3,50 | 3,32 | 1,80 | Sans Alcool | Bio |

### Catégories (V4.2)
| name | product_type | is_alcohol | icon_emoji |
|------|-------------|------------|------------|
| Blancs Secs | wine | true | - |
| Blancs Moelleux | wine | true | - |
| Rouges | wine | true | - |
| Rosés | wine | true | - |
| Effervescents | sparkling | true | - |
| Sans Alcool | beverage | false | - |
| Coffrets | gift_set | true | - |
| Terrines | food | false | - |

---

## 13. POINTS D'ATTENTION CRITIQUES

1. **L'enseignant ne voit JAMAIS de montants en euros** — vérifier systématiquement
2. **Les étudiants ne manipulent PAS Stripe** — Nicolas encaisse
3. **Les espèces doivent être tracées** — dépôt obligatoire
4. **Cache Redis** — invalider après TOUTE modification admin
5. **Facturation électronique** — obligatoire septembre 2026
6. **RGPD mineurs** — consentement parental obligatoire
7. **Append-only financial_events** — JAMAIS de UPDATE ou DELETE
8. **Règle 12+1 alcool uniquement** — ne s'applique PAS aux produits is_alcohol=false
9. **Gratuite = la moins chère** — coût = prix_achat le plus bas du panier
10. **API publique ambassadeurs** — ne jamais exposer données financières
11. **Referral doublon** — rattacher sans recréer si email existe
12. **ProductModal navigation** — rester dans le contexte du filtre actif
