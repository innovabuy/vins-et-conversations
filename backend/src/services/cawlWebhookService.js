/**
 * CAWL Webhook Service — vérification de signature + traitement d'un événement.
 *
 *  - unmarshal(rawBody, headers) : délègue au SDK (webhooks.init().unmarshal) qui VÉRIFIE la
 *    signature et désérialise. THROW si la signature est invalide -> l'appelant ne persiste PAS.
 *    Init paresseux, secret lu depuis process.env (CAWL_WEBHOOK_KEY_ID / CAWL_WEBHOOK_SECRET),
 *    garde CAWL_NOT_CONFIGURED. Aucun throw au chargement du module.
 *
 *  - processEvent(webhookRow) : traitement métier d'un événement DÉJÀ persisté. Ici (commit 5)
 *    minimal (log). Le booking financier (statusCode===9 -> confirmBoutiqueOrder, idempotent,
 *    montant réel, reference=payment.id) est branché au commit 6.
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

/**
 * Traitement métier d'un événement déjà persisté dans webhook_events.
 * (Commit 6 : statusCode===9 (CAPTURED) -> confirmBoutiqueOrder idempotent ; 1 -> abandon ;
 * autres -> log sans écriture financière.)
 * @param {Object} webhookRow ligne webhook_events (payment_id, type, status_code, payload…)
 */
async function processEvent(webhookRow) {
  const statusCode = webhookRow.status_code;
  logger.info(`CAWL webhook à traiter: payment_id=${webhookRow.payment_id} type=${webhookRow.type} statusCode=${statusCode}`);
  // Commit 6 branchera ici le booking financier idempotent.
}

module.exports = { unmarshal, processEvent };
