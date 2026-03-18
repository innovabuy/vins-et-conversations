const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const publicRouter = express.Router();

// ─── Admin: Generate signature link ────────────────
router.post('/:id/signature-link', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const bl = await db('delivery_notes').where({ id: req.params.id }).first();
    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });

    if (bl.status === 'signed') {
      return res.status(409).json({ error: 'ALREADY_SIGNED', message: 'Ce BL est deja signe' });
    }

    const { signer_type = 'client', expires_in_hours = 48 } = req.body;
    if (!['client', 'student'].includes(signer_type)) {
      return res.status(400).json({ error: 'INVALID_SIGNER_TYPE' });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expires_in_hours * 3600 * 1000);

    await db('delivery_notes').where({ id: req.params.id }).update({
      signature_token: token,
      signature_token_expires_at: expiresAt,
      signer_type,
      updated_at: new Date(),
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const signatureUrl = `${frontendUrl}/sign/${token}`;

    res.json({ signature_url: signatureUrl, token, expires_at: expiresAt });
  } catch (err) {
    logger.error(`Signature link error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: View signature ─────────────────────────
router.get('/:id/signature', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const bl = await db('delivery_notes')
      .where({ id: req.params.id })
      .select('id', 'ref', 'status', 'signed_at', 'signed_by', 'signature_image_url', 'signer_type')
      .first();

    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });
    if (bl.status !== 'signed' || !bl.signature_image_url) {
      return res.status(404).json({ error: 'NO_SIGNATURE', message: 'Aucune signature pour ce BL' });
    }

    res.json({
      ref: bl.ref,
      signed_at: bl.signed_at,
      signed_by: bl.signed_by,
      signer_type: bl.signer_type,
      signature_image_url: bl.signature_image_url,
    });
  } catch (err) {
    logger.error(`View signature error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: Get BL info via token ─────────────────
publicRouter.get('/sign/:token', async (req, res) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.token)) {
      return res.status(404).json({ error: 'INVALID_TOKEN', message: 'Lien invalide' });
    }
    const bl = await db('delivery_notes')
      .where({ signature_token: req.params.token })
      .first();

    if (!bl) return res.status(404).json({ error: 'INVALID_TOKEN', message: 'Lien invalide' });

    if (bl.status === 'signed') {
      return res.status(409).json({
        error: 'ALREADY_SIGNED',
        message: `Ce bon de livraison a deja ete signe le ${new Date(bl.signed_at).toLocaleDateString('fr-FR')}`,
        signed_at: bl.signed_at,
      });
    }

    if (bl.signature_token_expires_at && new Date(bl.signature_token_expires_at) < new Date()) {
      return res.status(410).json({ error: 'TOKEN_EXPIRED', message: 'Ce lien a expire, contactez votre commercial' });
    }

    // Get order items for recap
    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', bl.order_id)
      .select('products.name as product_name', 'order_items.qty', 'order_items.unit_price_ttc');

    const order = await db('orders').where({ id: bl.order_id }).select('total_ttc', 'ref').first();

    res.json({
      delivery_note: {
        reference: bl.ref,
        recipient_name: bl.recipient_name,
        items: items.map(i => ({
          product_name: i.product_name,
          qty: i.qty,
          unit_price_ttc: parseFloat(i.unit_price_ttc),
        })),
        total_ttc: order ? parseFloat(order.total_ttc) : 0,
        order_ref: order ? order.ref : null,
      },
    });
  } catch (err) {
    logger.error(`Public sign GET error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: Submit signature ──────────────────────
publicRouter.post('/sign/:token', async (req, res) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.token)) {
      return res.status(404).json({ error: 'INVALID_TOKEN', message: 'Lien invalide' });
    }
    const bl = await db('delivery_notes')
      .where({ signature_token: req.params.token })
      .first();

    if (!bl) return res.status(404).json({ error: 'INVALID_TOKEN', message: 'Lien invalide' });

    if (bl.status === 'signed') {
      return res.status(409).json({ error: 'ALREADY_SIGNED', message: 'Ce bon de livraison a deja ete signe' });
    }

    if (bl.signature_token_expires_at && new Date(bl.signature_token_expires_at) < new Date()) {
      return res.status(410).json({ error: 'TOKEN_EXPIRED', message: 'Ce lien a expire' });
    }

    const { signature_data, signer_name } = req.body;
    if (!signature_data || !signer_name) {
      return res.status(400).json({ error: 'MISSING_DATA', message: 'signature_data et signer_name requis' });
    }

    // Save PNG to /uploads/signatures/
    const uploadsDir = path.join(__dirname, '../../uploads/signatures');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${bl.id}.png`;
    const filepath = path.join(uploadsDir, filename);
    const base64Data = signature_data.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

    const signatureImageUrl = `/uploads/signatures/${filename}`;

    // Update delivery note
    await db('delivery_notes').where({ id: bl.id }).update({
      status: 'signed',
      signed_at: new Date(),
      signed_by: signer_name,
      signature_image_url: signatureImageUrl,
      signature_token: null,
      signature_token_expires_at: null,
      delivered_at: bl.delivered_at || new Date(),
      updated_at: new Date(),
    });

    // Update order status
    await db('orders').where({ id: bl.order_id }).update({ status: 'delivered', updated_at: new Date() });

    // Notify admins
    try {
      const admins = await db('users').whereIn('role', ['super_admin', 'commercial']).select('id');
      if (admins.length > 0) {
        await db('notifications').insert(
          admins.map(a => ({
            user_id: a.id,
            type: 'bl_signed',
            title: 'BL signe',
            message: `Le BL ${bl.ref} a ete signe par ${signer_name}`,
            read: false,
            link: '/admin/delivery',
          }))
        );
      }
    } catch (notifErr) {
      logger.error(`Signature notification error: ${notifErr.message}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(`Public sign POST error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
