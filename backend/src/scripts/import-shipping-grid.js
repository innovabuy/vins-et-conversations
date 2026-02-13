/**
 * Import grille tarifaire transport depuis CSV (V4.1 Tâche 5)
 *
 * Reads shipping zones and rates from data/grille-transport.csv.
 * The grid uses two pricing types:
 * - forfait: fixed price HT for the range
 * - par_colis: price HT per unit
 *
 * Usage: node src/scripts/import-shipping-grid.js
 * Or called from seed file.
 */

const fs = require('fs');
const path = require('path');

// Seasonal eligible departments (May 1 – Aug 31: +25%)
const SEASONAL_DEPTS = ['06', '11', '13', '17', '20', '22', '29', '30', '33', '34', '35', '40', '44', '56', '64', '65', '66', '83', '84', '85', '98'];

function padDeptCode(code) {
  return String(code).padStart(2, '0');
}

function parseCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',');

  return lines.slice(1).filter(l => l.trim()).map((line) => {
    // Handle dept_name that may contain commas (not the case here but safe)
    const values = line.split(',');
    return {
      dept_code: padDeptCode(values[0].trim()),
      dept_name: values[1].trim(),
      difficulty: values[2].trim(),
      min_qty: parseInt(values[3].trim(), 10),
      max_qty: parseInt(values[4].trim(), 10),
      price_ht: parseFloat(values[5].trim()),
      pricing_type: values[6].trim(),
      valid_from: values[7].trim(),
      valid_to: values[8].trim(),
    };
  });
}

async function importShippingGrid(db) {
  const csvPath = path.join(__dirname, '..', 'data', 'grille-transport.csv');
  const rows = parseCsv(csvPath);

  // Clear existing data
  await db('shipping_rates').del();
  await db('shipping_zones').del();

  // Group rows by zone (dept_code + difficulty)
  const zoneMap = new Map();
  for (const row of rows) {
    const key = `${row.dept_code}|${row.difficulty}`;
    if (!zoneMap.has(key)) {
      zoneMap.set(key, {
        dept_code: row.dept_code,
        dept_name: row.dept_name,
        difficulty: row.difficulty,
        rates: [],
      });
    }
    zoneMap.get(key).rates.push(row);
  }

  // Insert zones in batches
  const zoneEntries = Array.from(zoneMap.values());
  const insertedZones = [];

  for (let i = 0; i < zoneEntries.length; i += 50) {
    const batch = zoneEntries.slice(i, i + 50).map((z) => ({
      dept_code: z.dept_code,
      dept_name: z.dept_name,
      difficulty: z.difficulty,
      surcharge_corse: z.dept_code === '20' ? 15 : 0,
      surcharge_seasonal_pct: SEASONAL_DEPTS.includes(z.dept_code) ? 25 : 0,
      seasonal_eligible: SEASONAL_DEPTS.includes(z.dept_code),
      active: true,
    }));
    const result = await db('shipping_zones').insert(batch).returning('*');
    insertedZones.push(...result);
  }

  // Build zone lookup: "dept_code|difficulty" → zone.id
  const zoneLookup = {};
  for (const zone of insertedZones) {
    zoneLookup[`${zone.dept_code}|${zone.difficulty}`] = zone.id;
  }

  // Build all rates
  const allRates = [];
  for (const [key, zoneData] of zoneMap) {
    const zoneId = zoneLookup[key];
    for (const rate of zoneData.rates) {
      allRates.push({
        zone_id: zoneId,
        min_qty: rate.min_qty,
        max_qty: rate.max_qty,
        price_ht: rate.price_ht,
        pricing_type: rate.pricing_type,
        valid_from: rate.valid_from,
        valid_to: rate.valid_to,
      });
    }
  }

  // Insert rates in batches
  for (let i = 0; i < allRates.length; i += 100) {
    const batch = allRates.slice(i, i + 100);
    await db('shipping_rates').insert(batch);
  }

  return { zones: insertedZones.length, rates: allRates.length };
}

module.exports = { importShippingGrid };

// Run standalone
if (require.main === module) {
  const db = require('../config/database');
  importShippingGrid(db)
    .then((result) => {
      console.log(`Import complete: ${result.zones} zones, ${result.rates} rates`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Import failed:', err);
      process.exit(1);
    });
}
