/**
 * Routes CAWL (Worldline Direct) — Hosted Checkout Page.
 *
 *  GET  /api/v1/cawl/config          — sonde de capacité (booléen seul, aucun secret).
 *  POST /api/v1/cawl/create-session  — crée une session Hosted Checkout depuis une commande.
 *  POST /api/v1/cawl/return-status   — appelé par la page de retour NEUTRE ; renvoie le statut
 *                                      RÉEL via GetHostedCheckoutStatus (jamais depuis l'URL),
 *                                      après vérification du RETURNMAC (anti-forge), ainsi que
 *                                      l'état interne de la commande (lecture seule).
 *
 * Le montant est TOUJOURS relu en base SOUS VERROU (SELECT … FOR UPDATE) et calculé
 * Math.round(order.total_ttc * 100) — jamais depuis req.body ni un objet en mémoire.
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const cawlPaymentService = require('../services/cawlPaymentService');

const router = express.Router();

/** Comparaison à temps constant (évite un oracle de timing sur le RETURNMAC). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── GET /config ──────────────────────────────────────
// Sonde de capacité pour la vitrine : dit UNIQUEMENT si CAWL est configuré côté serveur.
// Ne renvoie AUCUN secret (ni host, ni merchantId, ni clé) — juste un booléen, afin que
// le tunnel boutique n'affiche pas un bouton mort tant que l'env CAWL est absent.
// Symétrique de GET /api/v1/settings/stripe-public-key (gating du bouton Stripe).
router.get('/config', (req, res) => {
  const enabled = Boolean(
    process.env.CAWL_HOST
    && process.env.CAWL_API_KEY_ID
    && process.env.CAWL_SECRET_API_KEY
    && process.env.CAWL_MERCHANT_ID
  );
  res.json({ enabled });
});

// ── POST /create-session ─────────────────────────────
router.post('/create-session', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'order_id requis' });

    // Montant RELU EN BASE SOUS VERROU — la valeur d'autorité, jamais req.body ni un objet mémoire.
    let amountCents;
    let ref;
    try {
      const locked = await db.transaction(async (trx) => {
        const order = await trx('orders').where({ id: order_id }).forUpdate().first();
        if (!order) { const e = new Error('NOT_FOUND'); e.httpStatus = 404; throw e; }
        if (order.status !== 'pending_payment') { const e = new Error('ORDER_NOT_PENDING_PAYMENT'); e.httpStatus = 409; throw e; }
        return { amountCents: Math.round(parseFloat(order.total_ttc) * 100), ref: order.ref };
      });
      amountCents = locked.amountCents;
      ref = locked.ref;
    } catch (e) {
      if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
      throw e;
    }

    const siteUrl = process.env.SITE_PUBLIC_URL || 'http://localhost:8082';
    // returnUrl NEUTRE : aucune information de statut, aucun success=…; juste la corrélation order_id.
    // CAWL y ajoute hostedCheckoutId + RETURNMAC au retour ; le statut vient de GetHostedCheckoutStatus.
    const returnUrl = `${siteUrl}/boutique/retour-cawl?order_id=${encodeURIComponent(order_id)}`;
    const webhookUrl = `${siteUrl}/api/v1/webhooks/cawl`;

    const session = await cawlPaymentService.createHostedCheckout({
      amountCents,
      merchantReference: ref,
      returnUrl,
      webhookUrl,
    });

    // Persiste hostedCheckoutId + RETURNMAC pour vérifier le retour (anti-redirection forgée).
    const meta = { hosted_checkout_id: session.hostedCheckoutId, returnmac: session.returnmac };
    const existing = await db('payments').where({ order_id, method: 'cawl' }).first();
    if (existing) {
      await db('payments').where({ id: existing.id }).update({
        status: 'pending', amount: amountCents / 100, metadata: JSON.stringify(meta), updated_at: new Date(),
      });
    } else {
      await db('payments').insert({
        order_id, method: 'cawl', amount: amountCents / 100, status: 'pending', metadata: JSON.stringify(meta),
      });
    }

    res.json({ redirectUrl: session.redirectUrl });
  } catch (err) {
    if (err.message === 'CAWL_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'CAWL_NOT_CONFIGURED', message: 'CAWL non configuré' });
    }
    logger.error(`CAWL create-session error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ── POST /return-status ──────────────────────────────
// La page de retour est neutre ; c'est CET appel (GetHostedCheckoutStatus) qui donne le statut réel.
router.post('/return-status', async (req, res) => {
  try {
    const { order_id, hostedCheckoutId, returnmac } = req.body;
    if (!order_id || !returnmac) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'order_id et returnmac requis' });

    const payment = await db('payments').where({ order_id, method: 'cawl' }).first();
    if (!payment || !payment.metadata) return res.status(404).json({ error: 'NOT_FOUND' });
    const meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata;

    // VÉRIF RETURNMAC (temps constant) — empêche une redirection forgée vers la confirmation.
    const macOk = safeEqual(returnmac, meta.returnmac || '');
    const hcOk = !hostedCheckoutId || hostedCheckoutId === meta.hosted_checkout_id;
    if (!macOk || !hcOk) {
      logger.warn(`CAWL return-status RETURNMAC/hostedCheckoutId mismatch pour order ${order_id}`);
      return res.status(403).json({ error: 'RETURNMAC_MISMATCH' });
    }

    // Statut RÉEL depuis CAWL, jamais déduit de l'URL.
    const statusBody = await cawlPaymentService.getHostedCheckoutStatus(meta.hosted_checkout_id);
    const payment_out = (statusBody.createdPaymentOutput && statusBody.createdPaymentOutput.payment) || {};
    const statusCode = (payment_out.statusOutput && payment_out.statusOutput.statusCode) != null
      ? payment_out.statusOutput.statusCode
      : null;

    // État INTERNE de la commande — LECTURE SEULE, derrière la vérif RETURNMAC.
    // La page de retour en a besoin pour savoir si le webhook est déjà passé (submitted)
    // ou non (pending_payment) : le statut CAWL seul ne le dit pas. Aucune écriture ici —
    // le booking reste la responsabilité EXCLUSIVE du webhook (confirmCawlOrder).
    const order = await db('orders').where({ id: order_id }).first();

    // NB (commit 6) : le booking est déclenché par le webhook, jamais par cette route.
    // Ici on ne fait que restituer le statut réel + l'état observé de la commande.
    res.json({
      status: statusBody.status || null,
      statusCode,
      order_status: order ? order.status : null,
      order_ref: order ? order.ref : null,
    });
  } catch (err) {
    if (err.message === 'CAWL_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'CAWL_NOT_CONFIGURED', message: 'CAWL non configuré' });
    }
    logger.error(`CAWL return-status error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
