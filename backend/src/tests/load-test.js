#!/usr/bin/env node
/**
 * Load & Performance Test Suite — Vins & Conversations
 *
 * Usage: LOAD_TEST=1 node src/tests/load-test.js
 *
 * Scenarios:
 *  1. Public pages (no auth)
 *  2. Student dashboard (auth)
 *  3. Admin cockpit (auth, heavy queries)
 *  4. Order creation under load (race condition check)
 *  5. Mixed stress test (all routes, max connections)
 */

const autocannon = require('autocannon');
const http = require('http');

// ─── CONFIG ──────────────────────────────────────────────
const BASE_URL = 'http://localhost:3001';
const API = `${BASE_URL}/api/v1`;
const DURATION_SHORT = 15; // seconds per sub-scenario
const DURATION_STRESS = 30; // seconds for stress test

const CREDS = {
  admin: { email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' },
  student: { email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' },
  cse: { email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' },
};

let TOKENS = {};
let SEED_DATA = {};

// ─── HELPERS ─────────────────────────────────────────────

function httpRequest(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login(creds) {
  const res = await httpRequest('POST', `${API}/auth/login`, creds);
  if (res.status !== 200) throw new Error(`Login failed for ${creds.email}: ${res.status}`);
  // Token field is "accessToken"
  return res.body.accessToken || res.body.token;
}

async function fetchSeedData(token) {
  const camps = await httpRequest('GET', `${API}/admin/campaigns`, null, { Authorization: `Bearer ${token}` });
  const campList = camps.body?.data || camps.body || [];
  const sacreCoeur = campList.find(c => c.name?.includes('Sacré') || c.name?.includes('Sacre'));
  const cseLeroy = campList.find(c => c.name?.includes('Leroy'));

  const prods = await httpRequest('GET', `${API}/products`, null, { Authorization: `Bearer ${token}` });
  const products = prods.body?.data || prods.body || [];

  return {
    campaignId: sacreCoeur?.id,
    cseCampaignId: cseLeroy?.id,
    products: products.slice(0, 3).map(p => ({ id: p.id, name: p.name, price: p.price_ttc })),
  };
}

function runAutocannon(opts) {
  return new Promise((resolve) => {
    autocannon({
      ...opts,
      bailout: 1000,
    }, (err, result) => {
      resolve(result);
    });
  });
}

function fmt(result) {
  return {
    url: result.url,
    connections: result.connections,
    duration: `${result.duration}s`,
    requests: result.requests.total,
    rps: Math.round(result.requests.average),
    throughput: `${(result.throughput.average / 1024 / 1024).toFixed(1)} MB/s`,
    p50: result.latency.p50,
    p95: result.latency.p97_5,  // autocannon uses p97.5 as closest to p95
    p99: result.latency.p99,
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
  };
}

// ─── SCENARIOS ───────────────────────────────────────────

async function scenario1_public() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCÉNARIO 1 : Pages publiques (sans auth)');
  console.log('══════════════════════════════════════════════\n');

  const routes = [
    { path: '/products', label: 'GET /products' },
    { path: '/categories', label: 'GET /categories' },
    { path: '/settings/public', label: 'GET /settings/public' },
  ];

  const results = [];
  for (const route of routes) {
    console.log(`  → ${route.label} (100 conn, ${DURATION_SHORT}s)`);
    const r = await runAutocannon({
      url: `${API}${route.path}`,
      connections: 100,
      duration: DURATION_SHORT,
    });
    results.push({ label: route.label, ...fmt(r) });
  }

  console.log(`  → POST /shipping/calculate (100 conn, ${DURATION_SHORT}s)`);
  const r = await runAutocannon({
    url: `${API}/shipping/calculate`,
    connections: 100,
    duration: DURATION_SHORT,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dept_code: '75', qty: 6 }),
  });
  results.push({ label: 'POST /shipping/calculate', ...fmt(r) });

  return results;
}

async function scenario2_studentDashboard() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCÉNARIO 2 : Dashboard étudiant (auth)');
  console.log('══════════════════════════════════════════════\n');

  console.log(`  → GET /dashboard/student (100 conn, ${DURATION_SHORT}s)`);
  const r = await runAutocannon({
    url: `${API}/dashboard/student`,
    connections: 100,
    duration: DURATION_SHORT,
    headers: { Authorization: `Bearer ${TOKENS.student}` },
  });

  return [{ label: 'GET /dashboard/student', ...fmt(r) }];
}

async function scenario3_adminCockpit() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCÉNARIO 3 : Dashboard admin (requêtes lourdes)');
  console.log('══════════════════════════════════════════════\n');

  const routes = [
    { path: '/dashboard/admin/cockpit', label: 'GET /cockpit' },
    { path: '/orders/admin/list', label: 'GET /admin/orders' },
    { path: '/admin/analytics', label: 'GET /admin/analytics' },
  ];

  const results = [];
  for (const route of routes) {
    console.log(`  → ${route.label} (50 conn, ${DURATION_SHORT}s)`);
    const r = await runAutocannon({
      url: `${API}${route.path}`,
      connections: 50,
      duration: DURATION_SHORT,
      headers: { Authorization: `Bearer ${TOKENS.admin}` },
    });
    results.push({ label: route.label, ...fmt(r) });
  }

  return results;
}

async function scenario4_orderRaceCondition() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCÉNARIO 4 : Commandes simultanées (race condition stock)');
  console.log('══════════════════════════════════════════════\n');

  const campaignId = SEED_DATA.campaignId;
  const productId = SEED_DATA.products[0]?.id;

  if (!campaignId || !productId) {
    console.log('  ⚠ Données seed insuffisantes, scénario ignoré');
    return [{ label: 'POST /orders (race)', rps: 'N/A', p50: 'N/A', p95: 'N/A', p99: 'N/A', errors: 'SKIP', non2xx: 'N/A' }];
  }

  console.log(`  → Produit: ${SEED_DATA.products[0].name} (ID: ${productId})`);
  console.log(`  → Campagne: ${campaignId}`);

  // Get stock before
  const stockBefore = await httpRequest('GET', `${API}/admin/stock?product_id=${productId}`, null, { Authorization: `Bearer ${TOKENS.admin}` });
  const stockData = stockBefore.body?.data || stockBefore.body || [];
  const productStock = Array.isArray(stockData) ? stockData.find(s => s.product_id === productId) : null;
  console.log(`  → Stock avant: ${productStock ? JSON.stringify(productStock) : 'non trouvé (OK, stock virtuel)'}`);

  // Fire 50 simultaneous orders
  const body = JSON.stringify({
    campaign_id: campaignId,
    items: [{ productId, qty: 1 }],
    customer_name: 'LoadTest Client',
    payment_method: 'cash',
  });

  console.log(`  → 50 commandes simultanées (POST /orders)`);
  const r = await runAutocannon({
    url: `${API}/orders`,
    connections: 50,
    amount: 50,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKENS.student}`,
    },
    body,
  });

  const result = fmt(r);

  // Check stock after
  const stockAfter = await httpRequest('GET', `${API}/admin/stock?product_id=${productId}`, null, { Authorization: `Bearer ${TOKENS.admin}` });
  console.log(`  → Stock après: ${JSON.stringify(stockAfter.body?.data?.[0] || stockAfter.body || 'N/A').slice(0, 200)}`);

  // Count results
  const succeeded = r.requests.total - (r.non2xx || 0) - (r.errors || 0);
  const failed = (r.non2xx || 0) + (r.errors || 0);
  console.log(`  → Résultat: ${succeeded} OK, ${failed} rejetées, ${r.errors || 0} erreurs réseau`);

  // Cleanup: delete load test orders
  console.log('  → Nettoyage des commandes de test...');
  const ordersRes = await httpRequest('GET', `${API}/admin/orders?limit=200`, null, { Authorization: `Bearer ${TOKENS.admin}` });
  const allOrders = ordersRes.body?.data || [];
  let cleaned = 0;
  for (const o of allOrders) {
    if (o.customer_name === 'LoadTest Client') {
      await httpRequest('DELETE', `${API}/admin/orders/${o.id}`, null, { Authorization: `Bearer ${TOKENS.admin}` });
      cleaned++;
    }
  }
  console.log(`  → ${cleaned} commandes nettoyées`);

  return [{ label: 'POST /orders (50 sim.)', ...result, ordersCreated: succeeded }];
}

async function scenario5_stressTest() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCÉNARIO 5 : Stress test maximal');
  console.log('══════════════════════════════════════════════\n');

  const requests = [
    // 40% public reads
    { method: 'GET', path: '/api/v1/products' },
    { method: 'GET', path: '/api/v1/products' },
    { method: 'GET', path: '/api/v1/categories' },
    { method: 'GET', path: '/api/v1/settings/public' },
    // 30% authenticated reads
    { method: 'GET', path: '/api/v1/dashboard/student', headers: { Authorization: `Bearer ${TOKENS.student}` } },
    { method: 'GET', path: '/api/v1/admin/orders', headers: { Authorization: `Bearer ${TOKENS.admin}` } },
    { method: 'GET', path: '/api/v1/admin/analytics', headers: { Authorization: `Bearer ${TOKENS.admin}` } },
    // 20% admin dashboards
    { method: 'GET', path: '/api/v1/dashboard/admin/cockpit', headers: { Authorization: `Bearer ${TOKENS.admin}` } },
    { method: 'GET', path: '/api/v1/admin/products', headers: { Authorization: `Bearer ${TOKENS.admin}` } },
    // 10% shipping
    { method: 'POST', path: '/api/v1/shipping/calculate', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dept_code: '44', qty: 12 }) },
  ];

  console.log(`  → 200 connexions, ${DURATION_STRESS}s, 10 routes mélangées`);

  const r = await runAutocannon({
    url: BASE_URL,
    connections: 200,
    duration: DURATION_STRESS,
    requests: requests.map(req => ({
      method: req.method,
      path: req.path,
      headers: { ...req.headers },
      ...(req.body ? { body: req.body } : {}),
    })),
  });

  return [{ label: 'Stress mixte (200c, 30s)', ...fmt(r) }];
}

// ─── MAIN ────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  TESTS DE CHARGE — Vins & Conversations          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Auth
  console.log('▸ Authentification...');
  try {
    TOKENS.admin = await login(CREDS.admin);
    TOKENS.student = await login(CREDS.student);
    TOKENS.cse = await login(CREDS.cse);
    console.log(`  ✓ 3 tokens obtenus (admin: ${TOKENS.admin?.slice(0,20)}...)\n`);
  } catch (err) {
    console.error('  ✗ Erreur auth:', err.message);
    process.exit(1);
  }

  // Seed data
  console.log('▸ Récupération données seed...');
  try {
    SEED_DATA = await fetchSeedData(TOKENS.admin);
    console.log(`  ✓ Campaign: ${SEED_DATA.campaignId}`);
    console.log(`  ✓ Produits: ${SEED_DATA.products.map(p => p.name).join(', ')}\n`);
  } catch (err) {
    console.error('  ✗ Erreur seed data:', err.message);
  }

  // Run all scenarios
  const allResults = [];

  const s1 = await scenario1_public();
  allResults.push(...s1.map(r => ({ scenario: 'Catalogue public', ...r })));

  const s2 = await scenario2_studentDashboard();
  allResults.push(...s2.map(r => ({ scenario: 'Dashboard étudiant', ...r })));

  const s3 = await scenario3_adminCockpit();
  allResults.push(...s3.map(r => ({ scenario: 'Cockpit admin', ...r })));

  const s4 = await scenario4_orderRaceCondition();
  allResults.push(...s4.map(r => ({ scenario: 'Commande sous charge', ...r })));

  const s5 = await scenario5_stressTest();
  allResults.push(...s5.map(r => ({ scenario: 'Stress max', ...r })));

  // ─── SUMMARY TABLE ─────────────────────────────────────
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                    RÉSULTATS FINAUX                                                      ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\n');

  const hdr =
    'Scénario'.padEnd(22) +
    'Route'.padEnd(28) +
    'Conn'.padEnd(6) +
    'Req/s'.padEnd(8) +
    'p50'.padEnd(9) +
    'p95'.padEnd(9) +
    'p99'.padEnd(9) +
    'Err+Non2xx'.padEnd(12) +
    'Statut';
  console.log(hdr);
  console.log('─'.repeat(hdr.length));

  for (const r of allResults) {
    const p95 = typeof r.p95 === 'number' ? r.p95 : parseInt(r.p95) || 0;
    const errCount = ((r.errors || 0) + (r.non2xx || 0));
    let status;

    if (r.scenario === 'Catalogue public') {
      status = p95 < 200 ? '✅' : p95 < 500 ? '⚠️' : '❌';
    } else if (r.scenario === 'Dashboard étudiant') {
      status = p95 < 300 ? '✅' : p95 < 500 ? '⚠️' : '❌';
    } else if (r.scenario === 'Cockpit admin') {
      status = p95 < 500 ? '✅' : p95 < 1000 ? '⚠️' : '❌';
    } else if (r.scenario === 'Commande sous charge') {
      if (r.errors === 'SKIP') { status = '⏭️'; }
      else { status = errCount === 0 ? '✅' : '⚠️'; }
    } else {
      const errRate = r.requests ? (errCount / r.requests * 100) : 0;
      status = errRate < 1 ? '✅' : errRate < 5 ? '⚠️' : '❌';
    }

    const p50s = typeof r.p50 === 'number' ? `${r.p50}ms` : String(r.p50);
    const p95s = typeof r.p95 === 'number' ? `${r.p95}ms` : String(r.p95);
    const p99s = typeof r.p99 === 'number' ? `${r.p99}ms` : String(r.p99);

    console.log(
      r.scenario.padEnd(22) +
      (r.label || '').substring(0, 26).padEnd(28) +
      String(r.connections || '').padEnd(6) +
      String(r.rps || '').padEnd(8) +
      p50s.padEnd(9) +
      p95s.padEnd(9) +
      p99s.padEnd(9) +
      String(errCount).padEnd(12) +
      status
    );
  }
  console.log('─'.repeat(hdr.length));

  // Verdict
  const criticalFail = allResults.some(r => {
    const p95 = typeof r.p95 === 'number' ? r.p95 : 0;
    if (r.scenario === 'Catalogue public' && p95 >= 500) return true;
    if (r.scenario === 'Dashboard étudiant' && p95 >= 500) return true;
    if (r.scenario === 'Cockpit admin' && p95 >= 1000) return true;
    return false;
  });

  const hasNon2xx = allResults.some(r => (r.non2xx || 0) > 0 && r.scenario !== 'Commande sous charge');
  if (hasNon2xx) {
    console.log('\n⚠️  Réponses non-2xx détectées — vérifier auth/routes');
  }
  if (criticalFail) {
    console.log('\n❌  Objectifs de latence dépassés — optimisation nécessaire');
  } else if (!hasNon2xx) {
    console.log('\n✅  Tous les objectifs atteints !');
  }

  console.log('\n╚════════════════════════════════════════════════════════════════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
