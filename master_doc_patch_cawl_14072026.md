# Master Doc — Patch CAWL (branche `feature/cawl-integration`) — 14/07/2026

Intégration paiement **CAWL (Crédit Agricole Worldline / Worldline Direct)** — méthode **Hosted Checkout Page** (redirection), `authorizationMode=SALE`, `requiresApproval=false`. Branche **isolée**, **aucun déploiement**, validation e2e sandbox prévue en septembre.

## SDK
- **`onlinepayments-sdk-nodejs` v8.4.0** (repo `wl-online-payments-direct/sdk-nodejs` = Worldline Direct, plateforme CAWL). SDK officiel.
- API : `init(config) → client`; `client.hostedCheckout.createHostedCheckout(merchantId, body)` / `.getHostedCheckout(merchantId, id)`; `webhooks.init({secretKeyStore}).unmarshal(rawBody, headers)` (vérifie la signature).
- **Pattern imposé (modèle paypalService)** : SDK initialisé PARESSEUSEMENT dans les fonctions, secrets lus depuis `process.env` à l'appel, garde `CAWL_NOT_CONFIGURED`, **aucun throw au chargement du module** → l'app boote et la suite reste verte quand l'env CAWL est absent (test/CI).

## Méthodologie de gate « tests verts » (reproductible)
Environnement de test = conteneur **`vc-api-cawltest`** (image bakée pour les deps + **source de la branche montée** + SDK installé). Le conteneur `vc-api` figé ne peut PAS tester la branche (source bakée ≠ branche).

**Recette de gate (à répéter avant chaque commit)** :
1. Reseed FRAIS obligatoire : `DROP … WITH (FORCE)` + `CREATE` + `npm run migrate` + `npm run seed` (la suite mute `_test` → verte seulement sur seed frais lancé UNE fois).
2. Env **exactement CI** : `JWT_SECRET=test_secret_ci`, `JWT_REFRESH_SECRET=test_refresh_ci`, **PAS de `REDIS_URL`** (jest met `NODE_ENV=test` → redis skippé). ⚠️ Injecter le REDIS_URL de prod pollue le cache entre suites (69 faux échecs constatés).
3. `npx jest --runInBand --forceExit` (~150 s). `--forceExit` imprime le résumé PUIS évite le hang sur handles ouverts ; les totaux affichés (« 87 total ») prouvent le run complet.

**Baseline verte de référence** : **87 suites / 1167 tests** (branche = main ; léger surplus vs baseline chore 85/1156, tout vert).

## ⚠️ CONSTAT — flake préexistant `campaignCrud › 9. PUT modification → 200 + audit_log`
- **Défaut du middleware d'audit** (`src/middleware/audit.js`) : l'insert `audit_log` est **fire-and-forget** — commentaire explicite « Log async — n'attend pas ». La réponse HTTP part AVANT que l'audit soit committé.
- Le test `campaignCrud.test.js:227-232` lit `audit_log` **en synchrone immédiatement** après la réponse 200 → **race condition** → `auditEntry` parfois `undefined`.
- **Prouvé flaky** : même base/même code, run A = 1 failed, run B = 19 passed. Sans lien avec les migrations CAWL (elles ne touchent ni `audit_log` ni `campaigns`).
- **Décision (14/07)** : ne PAS modifier le test, ne PAS corriger le middleware (hors périmètre CAWL). Le gate est accepté comme **vert modulo ce flake connu**. À traiter séparément (dette : soit awaiter l'audit dans le middleware, soit faire poller le test).

## Commits (branche `feature/cawl-integration`, non mergée)
1. `35105e3` `chore(cawl)` — dépendance `onlinepayments-sdk-nodejs`.
2. `ad48a5a` `feat(cawl)` — migrations `webhook_events` (index UNIQUE `(payment_id, type)` = dédup base des rejeux) + CHECK `payments.method` étendu à `cawl` (idempotent/rejouable, prouvé). Assertions schéma + idempotence vertes ; gate 86/87 (rouge = flake ci-dessus).

## Décisions actées (rappel, ne pas rouvrir)
Hosted Checkout (pas server-to-server ni tokenization) · `authorizationMode=SALE` (capture immédiate, pas de capture différée) · `requiresApproval=false` (non-carte) · SDK officiel (pas d'HTTP manuel ni HMAC codé main) · secrets en `.env` (jamais UI/code/DB) · payment.id CAWL dans `payments.reference` (pas `stripe_id`) · returnUrl neutre → `GetHostedCheckoutStatus` (statut réel, jamais depuis l'URL) · webhook : persist `webhook_events` → 2xx immédiat → traitement après · `statusCode=9` (CAPTURED) seul déclenche `sale` · montant = encaissé réel CAWL (WARNING si divergence) · idempotence réutilise `FOR UPDATE` + garde statut de `confirmBoutiqueOrder`.
