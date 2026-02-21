# API CONTRACTS — Vins & Conversations
**Endpoints critiques pour recette fonctionnelle**
**Date** : 21/02/2026

---

## POST /api/v1/orders — Créer une commande

**Body (Joi)** :
```json
{
  "campaign_id": "uuid (required)",
  "items": [
    { "productId": "uuid (required)", "qty": "integer >= 1 (required)" }
  ],
  "customer_name": "string (required si role=etudiant)",
  "payment_method": "cash | check | card | transfer | pending | null",
  "customer_id": "uuid (optional)",
  "customer_phone": "string (optional)",
  "customer_email": "email (optional)",
  "customer_notes": "string (optional)",
  "notes": "string (optional)"
}
```

**Attention** : `productId` (camelCase) et `qty` (pas `quantity`).
`payment_method` : `cash` (pas `especes`), `transfer` (pas `virement`).

**Réponse 201** :
```json
{
  "id": "uuid",
  "ref": "VC-2026-XXXX",
  "totalHT": 30.42,
  "totalTTC": 36.50,
  "totalItems": 5,
  "status": "submitted",
  "paymentMethod": "cash",
  "customerName": "string"
}
```

Note : la réponse utilise `totalTTC` (camelCase), la DB stocke `total_ttc` (snake_case).

---

## POST /api/v1/auth/register — Inscription étudiant

**Body (Joi)** :
```json
{
  "code": "string (required — code invitation)",
  "name": "string 2-100 (required)",
  "email": "email (required)",
  "password": "string min 8 (required)",
  "parental_consent": "boolean (requis si étudiant mineur)"
}
```

---

## GET /api/v1/orders/admin/list — Commandes admin

**Query** : `campaign_id`, `status`, `user_id`, `source`, `page`, `limit`

**Réponse** :
```json
{
  "data": [{ "id", "ref", "status", "total_ht", "total_ttc", "total_items", "user_name", ... }],
  "pagination": { "page", "limit", "total", "pages" }
}
```

---

## PUT /api/v1/orders/admin/:id — Modifier/valider commande

**Body** : `{ "status": "validated" }` (+ optionnel: `notes`, `items`)

---

## GET /api/v1/dashboard/student

**Champs réels** :
| Champ | Type | Note |
|-------|------|------|
| `ca` | number | CA direct |
| `ca_referred` | number | CA parrainé |
| `ca_total` | number | Total |
| `position` | number | Rang (pas "rank") |
| `freeBottles` | object | `{ earned, used, available, totalSold, threshold }` |
| `referral_code` | string | Code parrainage |
| `fund_collective` | object | `{ amount, rate, base_amount, label }` |
| `fund_individual` | object | `{ amount, rate, base_amount, label }` |
| `streak` | number | Jours consécutifs |
| `badges` | array | Badges gagnés |
| `campaign.brand_name` | string | Nom de marque (imbriqué) |
| `recent_orders` | array | Avec `products[].name`, `products[].image_url` |

---

## GET /api/v1/dashboard/ambassador

**Champs réels** :
| Champ | Type |
|-------|------|
| `tier.current` | object `{ label, threshold, reward, color }` |
| `tier.next` | object |
| `sales.caTTC` | number |
| `sales.caHT` | number |
| `sales.bottles` | number |
| `sales.orderCount` | number |
| `referralCode` | string (camelCase) |
| `referralClicks` | number |
| `referralStats` | object `{ orders, revenue, bottles }` |
| `gains` | object `{ currentReward, currentTierLabel, nextReward, amountToNext }` |

---

## GET /api/v1/dashboard/cse

**Champs réels** :
- `products[]` — avec `original_price_ttc`, `cse_price_ttc`, `cse_price_ht`
- `orders[]` — historique commandes CSE
- `minOrder` — minimum de commande (200€)
- `discountPct` — remise appliquée (10%)
- `paymentTerms` — délai paiement

---

## GET /api/v1/dashboard/admin/cockpit

**Champs réels** :
- `kpis.caTTC`, `kpis.caHT`, `kpis.marge`, `kpis.totalOrders`
- `actions.pendingOrders`, `actions.readyBL`, `actions.lowStock`
- `topStudents[]`, `topProducts[]`, `caByCampaign[]`

---

## Exports — Endpoints réels

| Route | Format | Params |
|-------|--------|--------|
| `/admin/exports/activity-report` | PDF | `campaign_id` (opt) |
| `/admin/exports/campaign-pivot` | XLSX | `campaign_id` (req) |
| `/admin/exports/pennylane` | XLSX | `campaign_id` (opt) |
| `/admin/exports/sales-journal` | XLSX | `campaign_id` (opt) |
| `/admin/exports/commissions` | XLSX | `campaign_id` (opt) |
| `/admin/exports/stock` | XLSX | `campaign_id` (opt) |
| `/admin/exports/delivery-notes` | XLSX | `campaign_id` (opt) |
| `/admin/exports/participant-history` | XLSX | `campaign_id` (req) |
| `/admin/exports/seller-detail` | XLSX | `campaign_id` (opt) |
| `/admin/exports/sales-by-contact` | XLSX | `campaign_id` (opt) |
| `/admin/exports/campaign-sales` | XLSX | `campaign_id` (opt) |

---

## GET /api/v1/ambassador/public — Ambassadeurs page publique

**Réponse** :
```json
{
  "ambassadors": [{ "id", "name", "photo_url", "bio", "region", "tier" }],
  "filters": { "regions", "tiers" }
}
```

---

## GET /api/v1/products — Liste produits

**Réponse** : `{ "data": [{ "id", "name", "price_ht", "price_ttc", ... }] }`

Note : pas `/admin/products` pour le listing.
