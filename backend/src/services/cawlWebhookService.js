/**
 * CAWL Webhook Service — vérification de signature + traitement d'un événement.
 *
 *  - unmarshal(rawBody, headers) : délègue au SDK (webhooks.init().unmarshal) qui VÉRIFIE la
 *    signature et désérialise. THROW si la signature est invalide -> l'appelant ne persiste PAS.
 *    Init paresseux, secret lu depuis process.env (CAWL_WEBHOOK_KEY_ID / CAWL_WEBHOOK_SECRET),
 *    garde CAWL_NOT_CONFIGURED. Aucun throw au chargement du module.
 *
 *  - processEvent(webhookRow) : traitement métier d'un événement DÉJÀ persisté. Depuis le
 *    commit 6, branche le booking financier : capture réussie (statut + acquiredAmount EUR,
 *    fail-closed) -> confirmCawlOrder, idempotent sous FOR UPDATE, au montant RÉELLEMENT
 *    encaissé, reference=payment.id. Tout autre statut -> aucune écriture financière.
 */

const logger = require('../utils/logger');

/** Helper webhook SDK (paresseux). Le secret vient de l'env ; garde CAWL_NOT_CONFIGURED. */
function getWebhooksHelper() {
  const keyId = process.env.CAWL_WEBHOOK_KEY_ID;
  const secret = process.env.CAWL_WEBHOOK_SECRET;
  if (!keyId || !secret) throw new Error('CAWL_NOT_CONFIGURED');

  const { webhooks } = require('onlinepayments-sdk-nodejs');
  return webhooks.init({
    getSecretKey: async (requestedKeyId) => {
      if (requestedKeyId !== keyId) throw new Error('CAWL_UNKNOWN_WEBHOOK_KEY');
      return secret;
    },
  });
}

/**
 * Vérifie la signature ET désérialise l'événement.
 * @param {string|Buffer} rawBody Corps BRUT (non parsé) tel que reçu — indispensable pour que
 *                                la signature corresponde au corps signé.
 * @param {Object} headers  En-têtes de la requête (X-GCS-Signature / X-GCS-KeyId…).
 * @returns {Promise<Object>} WebhooksEvent (throw si signature invalide).
 */
async function unmarshal(rawBody, headers) {
  const helper = getWebhooksHelper();
  return helper.unmarshal(rawBody, headers);
}

// ── Codes de statut CAWL valant CAPTURE RÉUSSIE ──────────────────────────────
// ⚠️ NON DOCUMENTÉ : onlinepayments-sdk-nodejs@8.4.0 déclare `statusCode?: number | null`
//    sans énumération ni constante exposée ; `authorizationMode` et `WebhooksEvent.type`
//    le sont tout autant (client généré, 34 blocs JSDoc dont aucun sur les statuts).
//    La valeur 9 provient de nos propres écrits du 14/07, sans source externe.
//    À CONFIRMER dans la doc Worldline Direct (Payment statuses) avant go-live.
//
// FAIL-CLOSED : le code de statut NE SUFFIT PAS. Un acquiredAmount EUR > 0 est exigé en
// corroboration — tout statut intermédiaire (en attente, en cours d'autorisation,
// autorisé-non-capturé) échoue la conjonction et ne produit AUCUN sale.
// Si 9 est faux : on ne booke pas (event conservé, processed=false, rejouable) au lieu de
// booker à tort. Panne détectable et réparable, jamais d'écriture financière erronée.
// La 1re transaction réelle révélera le code réel, lisible dans webhook_events.payload.
const CAWL_CAPTURED_STATUS_CODES = [9];

/**
 * Traitement métier d'un événement déjà persisté dans webhook_events.
 *
 * Capture réussie -> confirmCawlOrder (idempotent, FOR UPDATE, montant réellement encaissé).
 * Tout le reste -> log, AUCUNE écriture financière.
 *
 * Un throw ici est voulu quand l'événement est exploitable mais non traitable (référence
 * absente, commande introuvable) : l'appelant marque processed=false + error, donc rejouable.
 * Un non-booking légitime (statut non-capture) retourne normalement, sans erreur.
 *
 * @param {Object} webhookRow ligne webhook_events (payment_id, type, status_code, payload…)
 */
async function processEvent(webhookRow) {
  const event = typeof webhookRow.payload === 'string' ? JSON.parse(webhookRow.payload) : webhookRow.payload;
  const payment = (event && event.payment) || {};
  const out = payment.paymentOutput || {};
  const statusCode = (payment.statusOutput && payment.statusOutput.statusCode) != null
    ? payment.statusOutput.statusCode
    : null;

  // Encaissé RÉEL : acquiredAmount. JAMAIS amountOfMoney (le DEMANDÉ, ≈ le piège Stripe
  // `amount` vs `amount_received`), ni amountPaid (déprécié par le SDK lui-même).
  const acquired = out.acquiredAmount || {};
  const amountOk = Number.isFinite(acquired.amount) && acquired.amount > 0 && acquired.currencyCode === 'EUR';
  const isCapture = CAWL_CAPTURED_STATUS_CODES.includes(statusCode) && amountOk;

  if (!isCapture) {
    logger.info(
      `CAWL webhook non-capture (payment=${payment.id} type=${webhookRow.type} statusCode=${statusCode} `
      + `acquired=${acquired.amount != null ? acquired.amount : 'n/a'} ${acquired.currencyCode || ''}) → aucun booking`
    );
    return;
  }

  // Corrélation : merchantReference posé à la création (cawl.js → order.ref). orders.ref est UNIQUE.
  const merchantReference = out.references && out.references.merchantReference;
  if (!merchantReference) throw new Error('CAWL_MISSING_MERCHANT_REFERENCE');

  const db = require('../config/database');
  const order = await db('orders').where({ ref: merchantReference }).first();
  if (!order) throw new Error(`CAWL_ORDER_NOT_FOUND:${merchantReference}`);

  // Centimes → euros, côté serveur, depuis le payload signé. Jamais une entrée client.
  const capturedEur = acquired.amount / 100;

  const boutiqueOrderService = require('./boutiqueOrderService');
  await boutiqueOrderService.confirmCawlOrder(order.id, payment.id, capturedEur);
}

module.exports = { unmarshal, processEvent, CAWL_CAPTURED_STATUS_CODES };
