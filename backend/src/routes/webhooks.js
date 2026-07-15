const express = require('express');
const paymentService = require('../services/paymentService');
const cawlWebhookService = require('../services/cawlWebhookService');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/v1/webhooks/stripe — Stripe webhook (no auth, raw body)
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const result = await paymentService.handleWebhook(req.body, signature);
    res.json(result);
  } catch (err) {
    if (err.message === 'INVALID_SIGNATURE') {
      return res.status(400).json({ error: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' });
    }
    if (err.message === 'WEBHOOK_NOT_CONFIGURED') {
      // 503 (et non 400) : Stripe réessaie sur 5xx (~3 j) → les événements
      // reçus avant la pose du secret ne sont pas perdus.
      return res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook not configured' });
    }
    logger.error('Webhook error:', err);
    res.status(400).json({ error: 'WEBHOOK_ERROR' });
  }
});

// POST /api/v1/webhooks/cawl — Webhook CAWL (no auth, RAW body pour la signature)
// Ordre STRICT : unmarshal (signature) -> persist -> 200 immédiat -> traitement après réponse.
router.post('/cawl', express.raw({ type: '*/*' }), async (req, res) => {
  // 1. VÉRIF SIGNATURE d'abord. Signature invalide -> 400, JAMAIS persisté (pas de dépotoir).
  let event;
  try {
    event = await cawlWebhookService.unmarshal(req.body, req.headers);
  } catch (err) {
    if (err.message === 'CAWL_NOT_CONFIGURED') {
      logger.error('CAWL webhook reçu mais service non configuré');
      return res.status(503).json({ error: 'CAWL_NOT_CONFIGURED' });
    }
    logger.warn(`CAWL webhook signature invalide -> rejeté sans persistance: ${err.message}`);
    return res.status(400).json({ error: 'INVALID_SIGNATURE' });
  }

  const paymentId = event && event.payment && event.payment.id;
  const type = event && event.type;
  if (!paymentId || !type) {
    // Signature OK mais rien à dédupliquer/traiter (event non-paiement) : accusé de réception.
    logger.info(`CAWL webhook sans payment.id/type exploitable (type=${type}) -> 200`);
    return res.status(200).json({ received: true });
  }

  // 2. PERSISTANCE. Violation de l'index UNIQUE (payment_id, type) = déjà reçu -> 200, aucun traitement.
  let webhookRow;
  try {
    const statusCode = event.payment.statusOutput && event.payment.statusOutput.statusCode;
    [webhookRow] = await db('webhook_events')
      .insert({
        provider: 'cawl',
        payment_id: paymentId,
        type,
        status_code: statusCode != null ? statusCode : null,
        payload: JSON.stringify(event),
      })
      .returning('*');
  } catch (err) {
    if (err.code === '23505') { // unique_violation -> doublon (rejeu CAWL) : dédup garantie base
      logger.info(`CAWL webhook doublon (payment_id=${paymentId}, type=${type}) -> dédup base, 200 sans traitement`);
      return res.status(200).json({ received: true, duplicate: true });
    }
    logger.error(`CAWL webhook persistance échouée (payment_id=${paymentId}): ${err.message}`);
    return res.status(500).json({ error: 'PERSIST_ERROR' }); // non persisté -> CAWL réessaiera
  }

  // 3. RÉPONSE 200 IMMÉDIATE, avant tout traitement métier (l'event est en base = rejouable).
  res.status(200).json({ received: true });

  // 4. TRAITEMENT APRÈS la réponse. Échec -> log BRUYANT + webhook_events.error/processed=false
  //    (sinon personne ne sait qu'il faut rejouer, cf. endpoint de rejeu commit 7).
  try {
    await cawlWebhookService.processEvent(webhookRow);
    await db('webhook_events').where({ id: webhookRow.id }).update({
      processed: true, processed_at: new Date(), attempts: db.raw('attempts + 1'), updated_at: new Date(),
    });
  } catch (procErr) {
    logger.error(`CAWL webhook TRAITEMENT ÉCHOUÉ (payment_id=${paymentId}, type=${type}, event=${webhookRow.id}): ${procErr.message}`);
    await db('webhook_events').where({ id: webhookRow.id }).update({
      processed: false, error: procErr.message, attempts: db.raw('attempts + 1'), updated_at: new Date(),
    }).catch((e) => logger.error(`CAWL webhook: maj statut échec impossible: ${e.message}`));
  }
});

module.exports = router;
