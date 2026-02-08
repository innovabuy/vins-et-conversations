const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// SMTP configuration (to be set in .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

/**
 * Send an email with optional PDF attachment
 * @param {Object} options - { to, subject, html, attachments }
 */
async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Vins & Conversations" <noreply@vins-conversations.fr>',
      to,
      subject,
      html,
      attachments,
    });
    logger.info(`Email sent: ${info.messageId} to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Email send failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
