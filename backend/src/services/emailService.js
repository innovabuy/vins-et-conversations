const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// SMTP configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

// ─── Template engine ──────────────────────────────────

const templateCache = {};

function loadTemplate(name) {
  if (templateCache[name]) return templateCache[name];
  const filePath = path.join(__dirname, '..', 'templates', `${name}.html`);
  const content = fs.readFileSync(filePath, 'utf-8');
  templateCache[name] = content;
  return content;
}

function renderTemplate(name, vars = {}) {
  const layout = loadTemplate('layout');
  let content = loadTemplate(name);

  // Simple conditional sections: {{#VAR}}...{{/VAR}}
  content = content.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, block) => {
    return vars[key] ? block : '';
  });

  // Replace vars in content
  for (const [key, value] of Object.entries(vars)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }

  // Inject content into layout
  let html = layout
    .replace('{{CONTENT}}', content)
    .replace(/\{\{SUBJECT\}\}/g, vars.SUBJECT || 'Vins & Conversations')
    .replace(/\{\{YEAR\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{BASE_URL\}\}/g, BASE_URL);

  // Replace any remaining vars in layout
  for (const [key, value] of Object.entries(vars)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }

  return html;
}

// ─── Core send ────────────────────────────────────────

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
    logger.error(`Email send failed to ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Formatting helpers ───────────────────────────────

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  commercial: 'Commercial',
  comptable: 'Comptable',
  enseignant: 'Enseignant',
  etudiant: 'Étudiant',
  cse: 'CSE',
  ambassadeur: 'Ambassadeur',
  lecture_seule: 'Lecture seule',
};

// ─── 8 specialized send functions ─────────────────────

async function sendWelcome({ email, name, role }) {
  const html = renderTemplate('welcome', {
    SUBJECT: 'Bienvenue sur Vins & Conversations',
    NAME: name,
    EMAIL: email,
    ROLE: ROLE_LABELS[role] || role,
    LOGIN_URL: `${BASE_URL}/login`,
  });
  return sendEmail({ to: email, subject: 'Bienvenue sur Vins & Conversations', html });
}

async function sendOrderConfirmation({ email, name, orderRef, campaignName, totalItems, totalTTC, items }) {
  const itemsRows = (items || []).map((i) =>
    `<tr><td>${i.name}</td><td>${i.qty}</td><td>${formatEur(i.unit_price_ttc)}</td><td>${formatEur(i.qty * i.unit_price_ttc)}</td></tr>`
  ).join('');

  const html = renderTemplate('order-confirmation', {
    SUBJECT: `Commande ${orderRef} confirmée`,
    NAME: name,
    ORDER_REF: orderRef,
    CAMPAIGN_NAME: campaignName || '—',
    TOTAL_ITEMS: String(totalItems),
    TOTAL_TTC: formatEur(totalTTC),
    ITEMS_ROWS: itemsRows,
  });
  return sendEmail({ to: email, subject: `Commande ${orderRef} confirmée`, html });
}

async function sendOrderValidated({ email, name, orderRef, totalTTC }) {
  const html = renderTemplate('order-validated', {
    SUBJECT: `Commande ${orderRef} validée`,
    NAME: name,
    ORDER_REF: orderRef,
    TOTAL_TTC: formatEur(totalTTC),
    DASHBOARD_URL: `${BASE_URL}`,
  });
  return sendEmail({ to: email, subject: `Commande ${orderRef} validée`, html });
}

async function sendDeliveryNotification({ email, name, orderRef, blRef, recipient, plannedDate, address }) {
  const html = renderTemplate('delivery-notification', {
    SUBJECT: `Livraison en cours — ${orderRef}`,
    NAME: name,
    ORDER_REF: orderRef,
    BL_REF: blRef,
    RECIPIENT: recipient || name,
    PLANNED_DATE: plannedDate ? formatDate(plannedDate) : '',
    ADDRESS: address || '',
  });
  return sendEmail({ to: email, subject: `Livraison en cours — ${orderRef}`, html });
}

async function sendCampaignReport({ email, name, campaignName, orgName, period, progress, reportContent }) {
  const html = renderTemplate('campaign-report', {
    SUBJECT: `Rapport campagne — ${campaignName}`,
    NAME: name,
    CAMPAIGN_NAME: campaignName,
    ORG_NAME: orgName || '—',
    PERIOD: period || '—',
    PROGRESS: String(progress || 0),
    REPORT_CONTENT: reportContent || '',
  });
  return sendEmail({ to: email, subject: `Rapport campagne — ${campaignName}`, html });
}

async function sendInvitation({ email, campaignName, orgName, role, code, expiresAt }) {
  const html = renderTemplate('invitation', {
    SUBJECT: `Invitation — ${campaignName}`,
    CAMPAIGN_NAME: campaignName,
    ORG_NAME: orgName || '—',
    ROLE: ROLE_LABELS[role] || role,
    CODE: code,
    REGISTER_URL: `${BASE_URL}/login?register=1&code=${encodeURIComponent(code)}`,
    EXPIRES_AT: formatDate(expiresAt),
  });
  return sendEmail({ to: email, subject: `Invitation à rejoindre ${campaignName}`, html });
}

async function sendPaymentReminder({ email, name, orderRef, amount, method, dueDate }) {
  const html = renderTemplate('payment-reminder', {
    SUBJECT: `Rappel de paiement — ${orderRef}`,
    NAME: name,
    ORDER_REF: orderRef,
    AMOUNT: formatEur(amount),
    METHOD: method || 'Virement',
    DUE_DATE: formatDate(dueDate),
    DASHBOARD_URL: `${BASE_URL}`,
  });
  return sendEmail({ to: email, subject: `Rappel de paiement — ${orderRef}`, html });
}

async function sendPasswordReset({ email, name, resetUrl }) {
  const html = renderTemplate('password-reset', {
    SUBJECT: 'Réinitialisation de mot de passe',
    NAME: name,
    RESET_URL: resetUrl,
  });
  return sendEmail({ to: email, subject: 'Réinitialisation de votre mot de passe', html });
}

async function sendBoutiqueOrderConfirmation({ email, name, orderRef, totalTTC, items }) {
  const itemsRows = (items || []).map((i) =>
    `<tr><td>${i.name}</td><td>${i.qty}</td><td>${formatEur(i.unit_price_ttc)}</td><td>${formatEur(i.qty * i.unit_price_ttc)}</td></tr>`
  ).join('');

  const html = renderTemplate('boutique-order-confirmation', {
    SUBJECT: `Commande ${orderRef} confirmée`,
    NAME: name,
    ORDER_REF: orderRef,
    TOTAL_TTC: formatEur(totalTTC),
    ITEMS_ROWS: itemsRows,
    TRACKING_URL: `${BASE_URL}/boutique/suivi`,
  });
  return sendEmail({ to: email, subject: `Commande ${orderRef} confirmée — Vins & Conversations`, html });
}

async function sendBoutiquePaymentConfirmed({ email, name, orderRef, totalTTC }) {
  const html = renderTemplate('boutique-payment-confirmed', {
    SUBJECT: `Paiement ${orderRef} confirmé`,
    NAME: name,
    ORDER_REF: orderRef,
    TOTAL_TTC: formatEur(totalTTC),
    TRACKING_URL: `${BASE_URL}/boutique/suivi`,
  });
  return sendEmail({ to: email, subject: `Paiement confirmé — ${orderRef}`, html });
}

module.exports = {
  sendEmail,
  renderTemplate,
  sendWelcome,
  sendOrderConfirmation,
  sendOrderValidated,
  sendDeliveryNotification,
  sendCampaignReport,
  sendInvitation,
  sendPaymentReminder,
  sendPasswordReset,
  sendBoutiqueOrderConfirmation,
  sendBoutiquePaymentConfirmed,
};
