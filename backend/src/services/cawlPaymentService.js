/**
 * CAWL Payment Service — Vins & Conversations
 *
 * Intégration CAWL (Crédit Agricole Worldline / plateforme Worldline Direct) via le SDK
 * officiel `onlinepayments-sdk-nodejs`. Méthode = Hosted Checkout Page (redirection).
 *
 * Pattern (calqué sur paypalService, cf. patch CAWL) :
 *  - Le client SDK est initialisé PARESSEUSEMENT (dans getClient), jamais au chargement du
 *    module → require de ce service NE plante PAS quand l'env CAWL est absent (test/CI).
 *  - Tous les secrets/config viennent de process.env, lus à l'appel. Garde CAWL_NOT_CONFIGURED.
 *  - Aucun appel HTTP manuel, aucune signature codée à la main (tout via le SDK).
 *
 * Env attendu (dans .env, jamais en code/UI/DB) :
 *   CAWL_HOST, CAWL_API_KEY_ID, CAWL_SECRET_API_KEY, CAWL_MERCHANT_ID
 *   CAWL_INTEGRATOR (libre, défaut 'VinsEtConversations')
 * NB : pas de sélecteur de mode — le host complet (sandbox OU prod) vient de CAWL_HOST ;
 * une CAWL_HOST manquante fait planter (CAWL_NOT_CONFIGURED), jamais de fallback preprod.
 */

const logger = require('../utils/logger');

let cachedClient = null;

/**
 * Initialise (paresseusement) le client SDK CAWL depuis l'env. Mis en cache.
 * @throws CAWL_NOT_CONFIGURED si une variable requise manque.
 */
function getClient() {
  if (cachedClient) return cachedClient;

  const host = process.env.CAWL_HOST;
  const apiKeyId = process.env.CAWL_API_KEY_ID;
  const secretApiKey = process.env.CAWL_SECRET_API_KEY;

  if (!host || !apiKeyId || !secretApiKey) {
    throw new Error('CAWL_NOT_CONFIGURED');
  }

  // require du SDK ici (et non au top-level) : garde le module chargeable sans env CAWL.
  const { init } = require('onlinepayments-sdk-nodejs');
  cachedClient = init({
    host,
    apiKeyId,
    secretApiKey,
    integrator: process.env.CAWL_INTEGRATOR || 'VinsEtConversations',
  });
  return cachedClient;
}

/** Réinitialise le client caché (ex : rotation de clés). */
function resetClientCache() {
  cachedClient = null;
}

function getMerchantId() {
  const merchantId = process.env.CAWL_MERCHANT_ID;
  if (!merchantId) throw new Error('CAWL_NOT_CONFIGURED');
  return merchantId;
}

/**
 * Crée une session Hosted Checkout CAWL.
 * Montant en CENTIMES, fourni par l'appelant (panier calculé côté serveur — jamais le client).
 * authorizationMode='SALE' (blocage + capture en un appel), requiresApproval=false (non-carte).
 *
 * @param {Object} p
 * @param {number} p.amountCents      Montant à encaisser, en centimes (>0).
 * @param {string} p.merchantReference Référence interne de la commande (corrélation).
 * @param {string} p.returnUrl        URL de retour navigateur (page neutre).
 * @param {string} p.webhookUrl       URL de notre endpoint webhook (feedbacks.webhooksUrls).
 * @param {string} [p.currencyCode='EUR']
 * @param {string} [p.locale='fr-FR']
 * @returns {Promise<{ hostedCheckoutId: string, redirectUrl: string|null, returnmac: string|null }>}
 */
async function createHostedCheckout({ amountCents, merchantReference, returnUrl, webhookUrl, currencyCode = 'EUR', locale = 'fr-FR' }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('CAWL_INVALID_AMOUNT');
  }

  const client = getClient();
  const merchantId = getMerchantId();
  const { assertSuccess } = require('onlinepayments-sdk-nodejs');

  const body = {
    order: {
      amountOfMoney: { amount: amountCents, currencyCode },
      references: { merchantReference },
    },
    hostedCheckoutSpecificInput: {
      returnUrl,
      locale,
    },
    cardPaymentMethodSpecificInput: {
      authorizationMode: 'SALE',
    },
    redirectPaymentMethodSpecificInput: {
      requiresApproval: false,
    },
    ...(webhookUrl ? { feedbacks: { webhooksUrls: [webhookUrl] } } : {}),
  };

  const response = assertSuccess(await client.hostedCheckout.createHostedCheckout(merchantId, body));
  const out = response.body || {};
  return {
    hostedCheckoutId: out.hostedCheckoutId,
    redirectUrl: out.redirectUrl || null,
    returnmac: out.RETURNMAC || null,
  };
}

/**
 * Récupère le statut RÉEL d'une session Hosted Checkout (jamais depuis l'URL de retour).
 * Retourne le corps GetHostedCheckoutResponse brut (l'appelant lit statusCode / payment.id / montant).
 * @param {string} hostedCheckoutId
 * @returns {Promise<Object>} corps GetHostedCheckoutResponse
 */
async function getHostedCheckoutStatus(hostedCheckoutId) {
  if (!hostedCheckoutId) throw new Error('CAWL_INVALID_HOSTED_CHECKOUT_ID');

  const client = getClient();
  const merchantId = getMerchantId();
  const { assertSuccess } = require('onlinepayments-sdk-nodejs');

  const response = assertSuccess(await client.hostedCheckout.getHostedCheckout(merchantId, hostedCheckoutId));
  return response.body || {};
}

module.exports = {
  getClient,
  resetClientCache,
  getMerchantId,
  createHostedCheckout,
  getHostedCheckoutStatus,
};
