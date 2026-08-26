/**
 * Sonde d'exposition des moyens de paiement historiques (Stripe, PayPal).
 *
 * Enjeu : CAWL est le moyen unique proposé au client ; Stripe et PayPal restent en place,
 * fonctionnels et testables côté serveur, mais ne sont plus rendus dans le tunnel. Ce
 * drapeau est le seul point de vérité de ce masquage — s'il s'ouvrait par accident (faute
 * de frappe, valeur approchante, oubli de la variable), deux moyens de paiement non voulus
 * réapparaîtraient en production sans qu'aucun déploiement ne le signale.
 *
 * On vérifie donc le contrat FAIL-CLOSED exactement comme pour CAWL_ENABLED
 * (cawl-routes.test.js) : seul 'true' — à la casse et aux espaces de bord près — expose.
 */

const request = require('supertest');
const app = require('../index');

describe('GET /api/v1/settings/payments-visibility', () => {
  // Le drapeau est lu à CHAQUE requête (pas au chargement du module) : on peut donc le
  // manipuler par test. Sauvegarde/restauration intégrales, y compris l'absence.
  let saved;

  beforeEach(() => { saved = process.env.LEGACY_PAYMENTS_VISIBLE; });

  afterEach(() => {
    if (saved === undefined) delete process.env.LEGACY_PAYMENTS_VISIBLE;
    else process.env.LEGACY_PAYMENTS_VISIBLE = saved;
  });

  it('renvoie un booléen seul — aucune clé ni secret de paiement n\'est exposé', async () => {
    const res = await request(app).get('/api/v1/settings/payments-visibility');
    expect(res.status).toBe(200);
    expect(typeof res.body.legacy_visible).toBe('boolean');
    expect(Object.keys(res.body)).toEqual(['legacy_visible']);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/stripe|paypal|key|secret|sk_|pk_/i);
  });

  it('route PUBLIQUE : accessible sans authentification (le tunnel sonde avant login)', async () => {
    const res = await request(app).get('/api/v1/settings/payments-visibility');
    expect(res.status).toBe(200);
  });

  it('variable absente → false (l\'oubli ne réaffiche jamais Stripe ni PayPal)', async () => {
    delete process.env.LEGACY_PAYMENTS_VISIBLE;
    const res = await request(app).get('/api/v1/settings/payments-visibility');
    expect(res.body.legacy_visible).toBe(false);
  });

  it('LEGACY_PAYMENTS_VISIBLE=true → true (seul cas réaffichant les tuiles)', async () => {
    process.env.LEGACY_PAYMENTS_VISIBLE = 'true';
    const res = await request(app).get('/api/v1/settings/payments-visibility');
    expect(res.body.legacy_visible).toBe(true);
  });

  it('FAIL-CLOSED : valeurs approchantes et typos → false', async () => {
    for (const v of ['1', 'yes', 'oui', 'on', '', ' ', 'false', 'FALSE', 'trué', 'ture', 'tru', 'truthy', 'null', 'undefined']) {
      process.env.LEGACY_PAYMENTS_VISIBLE = v;
      const res = await request(app).get('/api/v1/settings/payments-visibility');
      expect({ v, legacy_visible: res.body.legacy_visible }).toEqual({ v, legacy_visible: false });
    }
  });

  it('tolérance volontaire, identique à CAWL_ENABLED : casse et espaces de bord', async () => {
    for (const v of ['true', 'TRUE', 'True', ' true ', '\ttrue\n']) {
      process.env.LEGACY_PAYMENTS_VISIBLE = v;
      const res = await request(app).get('/api/v1/settings/payments-visibility');
      expect({ v, legacy_visible: res.body.legacy_visible }).toEqual({ v, legacy_visible: true });
    }
  });

  it('symétrie avec CAWL : les deux sondes sont indépendantes (aucun couplage)', async () => {
    const savedCawl = process.env.CAWL_ENABLED;
    try {
      process.env.CAWL_ENABLED = 'true';
      process.env.LEGACY_PAYMENTS_VISIBLE = 'false';
      const res = await request(app).get('/api/v1/settings/payments-visibility');
      expect(res.body.legacy_visible).toBe(false);
    } finally {
      if (savedCawl === undefined) delete process.env.CAWL_ENABLED;
      else process.env.CAWL_ENABLED = savedCawl;
    }
  });
});
