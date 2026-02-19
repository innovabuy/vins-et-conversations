const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getAppBranding } = require('../utils/appBranding');

const BASE_URL = process.env.BASE_URL || process.env.FRONTEND_URL || '';

// ─── Dynamic SMTP configuration ──────────────────────

let cachedTransporter = null;
let cachedSmtpMode = null;

async function getSmtpConfig() {
  // In test env, skip DB lookup
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    return {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      from_name: process.env.SMTP_FROM_NAME || 'Vins & Conversations',
      from_email: process.env.SMTP_FROM_EMAIL || 'noreply@vins-conversations.fr',
      mode: process.env.SMTP_MODE || 'test',
    };
  }

  try {
    const db = require('../config/database');
    const rows = await db('app_settings')
      .whereIn('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_name', 'smtp_from_email', 'smtp_mode'])
      .select('key', 'value');

    const cfg = {};
    for (const r of rows) cfg[r.key] = r.value;

    // Use DB values if smtp_host is configured, otherwise fall back to env
    if (cfg.smtp_host) {
      return {
        host: cfg.smtp_host,
        port: parseInt(cfg.smtp_port || '587', 10),
        user: cfg.smtp_user || undefined,
        password: cfg.smtp_password || undefined,
        from_name: cfg.smtp_from_name || 'Vins & Conversations',
        from_email: cfg.smtp_from_email || 'noreply@vins-conversations.fr',
        mode: cfg.smtp_mode || 'test',
      };
    }
  } catch (e) {
    logger.warn(`Failed to load SMTP config from DB: ${e.message}`);
  }

  // Fallback to env vars
  return {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASS || undefined,
    from_name: process.env.SMTP_FROM_NAME || 'Vins & Conversations',
    from_email: process.env.SMTP_FROM_EMAIL || 'noreply@vins-conversations.fr',
    mode: process.env.SMTP_MODE || 'test',
  };
}

async function getTransporter() {
  const cfg = await getSmtpConfig();
  cachedSmtpMode = cfg.mode;

  if (cachedTransporter) return { transporter: cachedTransporter, config: cfg };

  const transportOpts = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
  };
  if (cfg.user) {
    transportOpts.auth = { user: cfg.user, pass: cfg.password };
  }

  cachedTransporter = nodemailer.createTransport(transportOpts);
  return { transporter: cachedTransporter, config: cfg };
}

function resetSmtpCache() {
  cachedTransporter = null;
  cachedSmtpMode = null;
}

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
    .replace(/\{\{SUBJECT\}\}/g, vars.SUBJECT || vars.APP_NAME || 'Vins & Conversations')
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
    const { transporter, config } = await getTransporter();

    // Test mode: log instead of sending
    if (config.mode === 'test') {
      logger.info(`[EMAIL TEST MODE] To: ${to} | Subject: ${subject}`);
      return { success: true, testMode: true, messageId: `test-${Date.now()}` };
    }

    const from = `"${config.from_name}" <${config.from_email}>`;
    const info = await transporter.sendMail({
      from,
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
  const branding = await getAppBranding();
  const html = renderTemplate('welcome', {
    SUBJECT: `Bienvenue sur ${branding.app_name}`,
    NAME: name,
    EMAIL: email,
    ROLE: ROLE_LABELS[role] || role,
    LOGIN_URL: `${BASE_URL}/login`,
  });
  return sendEmail({ to: email, subject: `Bienvenue sur ${branding.app_name}`, html });
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
    REGISTER_URL: `${BASE_URL}/invite/${encodeURIComponent(code)}`,
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
  const brandingBoutique = await getAppBranding();
  return sendEmail({ to: email, subject: `Commande ${orderRef} confirmée — ${brandingBoutique.app_name}`, html });
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

async function sendPaymentFailed({ email, name, orderRef, amount, errorMessage }) {
  const html = renderTemplate('payment-failed', {
    SUBJECT: `Problème avec votre paiement — Commande ${orderRef}`,
    NAME: name,
    ORDER_REF: orderRef,
    AMOUNT: formatEur(amount),
    ERROR_MESSAGE: errorMessage || '',
    DASHBOARD_URL: `${BASE_URL}`,
  });
  return sendEmail({ to: email, subject: `Problème avec votre paiement — Commande ${orderRef}`, html });
}

async function sendContactReceived({ email, name, type, company }) {
  const TYPE_LABELS = { question: 'Question', devis: 'Demande de devis', partenariat: 'Partenariat', autre: 'Autre' };
  const html = renderTemplate('contact-received', {
    SUBJECT: 'Nous avons bien recu votre message',
    NAME: name,
    TYPE_LABEL: TYPE_LABELS[type] || type,
    COMPANY: company || '',
  });
  return sendEmail({ to: email, subject: 'Nous avons bien recu votre message', html });
}

async function sendContactNotification({ name, email, phone, company, type, message }) {
  const TYPE_LABELS = { question: 'Question', devis: 'Demande de devis', partenariat: 'Partenariat', autre: 'Autre' };
  const html = renderTemplate('contact-notification', {
    SUBJECT: `[Contact] ${TYPE_LABELS[type] || type} — ${name}`,
    NAME: name,
    EMAIL: email,
    PHONE: phone || '—',
    COMPANY: company || '—',
    TYPE_LABEL: TYPE_LABELS[type] || type,
    MESSAGE: message.replace(/\n/g, '<br>'),
  });
  return sendEmail({
    to: process.env.ADMIN_EMAIL || 'nicolas@vins-conversations.fr',
    subject: `[Contact] ${TYPE_LABELS[type] || type} — ${name}`,
    html,
  });
}

module.exports = {
  sendEmail,
  renderTemplate,
  resetSmtpCache,
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
  sendPaymentFailed,
  sendContactReceived,
  sendContactNotification,
};
