/**
 * Notifications Contact Tests — V4.4
 * Verify that contact form submissions create admin notifications
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, adminId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = res.body.accessToken;
  adminId = res.body.user?.id;
  if (!adminId) {
    const u = await db('users').where({ email: 'nicolas@vins-conversations.fr' }).first();
    adminId = u?.id;
  }
});

describe('Contact form → notification', () => {
  let createdContactId;

  test('POST /public/contact with type "contact" succeeds and creates notification', async () => {
    // Clear existing contact notifications for admin before test
    await db('notifications')
      .where({ user_id: adminId, type: 'contact' })
      .del();

    const res = await request(app)
      .post('/api/v1/public/contact')
      .send({
        name: 'TestNotifUser',
        email: 'testnotif@example.com',
        message: 'Ceci est un message de test pour les notifications contact',
        type: 'question',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdContactId = res.body.id;

    // Give async notification a moment to be created
    await new Promise((r) => setTimeout(r, 200));

    // Verify notification was created for admin
    const notif = await db('notifications')
      .where({ user_id: adminId, type: 'contact' })
      .orderBy('created_at', 'desc')
      .first();

    expect(notif).toBeDefined();
    expect(notif.message).toContain('TestNotifUser');
    expect(notif.link).toBe('/admin/crm');
  });

  test('GET /notifications returns contact notification with correct fields', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();

    const contactNotif = res.body.data.find(
      (n) => n.type === 'contact' && n.message.includes('TestNotifUser')
    );
    expect(contactNotif).toBeDefined();
    expect(contactNotif.link).toBe('/admin/crm');
    expect(contactNotif.read).toBe(false);
  });

  test('PUT /notifications/:id/read marks contact notification as read', async () => {
    const notif = await db('notifications')
      .where({ user_id: adminId, type: 'contact' })
      .orderBy('created_at', 'desc')
      .first();

    const res = await request(app)
      .put(`/api/v1/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
  });

  afterAll(async () => {
    // Cleanup: remove test notifications and contact
    await db('notifications')
      .where({ user_id: adminId, type: 'contact' })
      .where('message', 'like', '%TestNotifUser%')
      .del();
    if (createdContactId) {
      await db('contacts').where({ id: createdContactId }).del();
    }
  });
});
