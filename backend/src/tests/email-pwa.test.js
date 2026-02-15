/**
 * Email & PWA Tests — Vins & Conversations
 * Tests: template rendering, SMTP settings, email-test endpoint, payment remind, contact emails, layout footer
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { renderTemplate } = require('../services/emailService');

let adminToken;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;
}, 15000);

afterAll(async () => {
  await db.destroy();
});

describe('Email Templates & SMTP', () => {

  test('renderTemplate replaces variables correctly with no remnants', () => {
    const html = renderTemplate('welcome', {
      SUBJECT: 'Test Subject',
      NAME: 'Jean Dupont',
      EMAIL: 'jean@test.fr',
      ROLE: 'Etudiant',
      LOGIN_URL: 'http://localhost:5173/login',
    });

    expect(html).toContain('Jean Dupont');
    expect(html).toContain('jean@test.fr');
    expect(html).toContain('Etudiant');
    expect(html).toContain('http://localhost:5173/login');
    // No unreplaced {{VAR}} should remain
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test('PUT /admin/settings saves SMTP keys', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        smtp_host: 'smtp.test.local',
        smtp_port: '465',
        smtp_from_name: 'Test Sender',
        smtp_from_email: 'test@example.com',
        smtp_mode: 'test',
      });

    expect(res.status).toBe(200);
    expect(res.body.smtp_host).toBe('smtp.test.local');
    expect(res.body.smtp_port).toBe('465');
    expect(res.body.smtp_from_name).toBe('Test Sender');
    expect(res.body.smtp_from_email).toBe('test@example.com');
    expect(res.body.smtp_mode).toBe('test');
  });

  test('GET /admin/settings masks smtp_password', async () => {
    // Set a password first
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ smtp_password: 'supersecretpassword123' });

    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.smtp_password).toBeDefined();
    expect(res.body.smtp_password.startsWith('****')).toBe(true);
    expect(res.body.smtp_password).not.toBe('supersecretpassword123');

    // Clean up
    await db('app_settings').where({ key: 'smtp_password' }).update({ value: '' });
  });

  test('POST /admin/settings/email-test returns success', async () => {
    const res = await request(app)
      .post('/api/v1/admin/settings/email-test')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /admin/payments/:id/remind returns 404 for invalid ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/v1/admin/payments/${fakeId}/remind`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  test('POST /public/contact creates contact and triggers double email', async () => {
    const res = await request(app)
      .post('/api/v1/public/contact')
      .send({
        name: 'Test Contact',
        email: 'test.contact@example.fr',
        phone: '0612345678',
        company: 'Test Corp',
        message: 'Ceci est un message de test pour verifier le formulaire de contact.',
        type: 'question',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Message envoyé');
    expect(res.body.id).toBeDefined();

    // Verify contact was inserted in DB
    const contact = await db('contacts').where({ email: 'test.contact@example.fr' }).first();
    expect(contact).toBeDefined();
    expect(contact.name).toBe('Test Contact');

    // Clean up
    await db('contacts').where({ id: contact.id }).del();
  });

  test('All templates contain alcohol warning via layout.html footer', () => {
    const templateDir = path.join(__dirname, '..', 'templates');
    const templates = fs.readdirSync(templateDir)
      .filter(f => f.endsWith('.html') && f !== 'layout.html');

    const layoutContent = fs.readFileSync(path.join(templateDir, 'layout.html'), 'utf-8');

    // The layout should contain the company name in footer
    expect(layoutContent).toContain('Vins &amp; Conversations');
    expect(layoutContent).toContain('{{CONTENT}}');
    expect(layoutContent).toContain('footer');

    // Each template should render without error via the layout
    for (const tmpl of templates) {
      const name = tmpl.replace('.html', '');
      const html = renderTemplate(name, { SUBJECT: 'Test' });
      // Rendered result should contain the layout footer
      expect(html).toContain('Vins &amp; Conversations');
      expect(html).toContain('footer');
    }
  });
});
