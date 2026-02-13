/**
 * Import grille tarifaire transport Kuehne+Nagel (V4.1 Tâche 5)
 *
 * Generates shipping zones and rates for all French departments.
 * The grid uses two pricing types:
 * - forfait: fixed price HT for the range
 * - par_colis: price HT per unit beyond 59
 *
 * Usage: node src/scripts/import-shipping-grid.js
 * Or called from seed file.
 */

const VALID_FROM = '2026-02-01';
const VALID_TO = '2026-11-30';

// Surcharge: Corse +15€, Sûreté +2€, Transition énergétique +0.15€ (applied at calculation time, not in rates)

// Seasonal eligible departments (May 1 – Aug 31: +25%)
const SEASONAL_DEPTS = ['06', '11', '13', '17', '20', '22', '29', '30', '33', '34', '35', '40', '44', '56', '64', '65', '66', '83', '84', '85', '98'];

// Haute montagne departments
const HAUTE_MONTAGNE = ['04', '05', '09', '38', '64', '65', '66', '73', '74'];

// Ile departments
const ILE_DEPTS = ['17', '22', '29', '50', '56', '85'];

// All French departments
const DEPARTMENTS = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube',
  '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal',
  '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '20': 'Corse',
  '21': 'Côte-d\'Or', '22': 'Côtes-d\'Armor', '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs',
  '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère', '30': 'Gard',
  '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde', '34': 'Hérault', '35': 'Ille-et-Vilaine',
  '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura', '40': 'Landes',
  '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique', '45': 'Loiret',
  '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire', '50': 'Manche',
  '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle', '55': 'Meuse',
  '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord', '60': 'Oise',
  '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques', '65': 'Hautes-Pyrénées',
  '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône', '70': 'Haute-Saône',
  '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie', '75': 'Paris',
  '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres', '80': 'Somme',
  '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse', '85': 'Vendée',
  '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort',
  '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': 'Val-d\'Oise',
  '98': 'Monaco',
};

// Standard rate grid (qty ranges → price HT)
const STANDARD_RATES = [
  { min: 1, max: 12, price: 21.51, type: 'forfait' },
  { min: 13, max: 23, price: 24.40, type: 'forfait' },
  { min: 24, max: 35, price: 28.20, type: 'forfait' },
  { min: 36, max: 47, price: 32.80, type: 'forfait' },
  { min: 48, max: 59, price: 36.50, type: 'forfait' },
  { min: 60, max: 119, price: 0.336, type: 'par_colis' },
  { min: 120, max: 239, price: 0.310, type: 'par_colis' },
  { min: 240, max: 479, price: 0.285, type: 'par_colis' },
  { min: 480, max: 999, price: 0.260, type: 'par_colis' },
  { min: 1000, max: 9999, price: 0.240, type: 'par_colis' },
];

// Haute montagne: +15% on forfait, +10% on par_colis
const HM_MULTIPLIER_FORFAIT = 1.15;
const HM_MULTIPLIER_PARCOLIS = 1.10;

// Ile: +20% on forfait, +15% on par_colis
const ILE_MULTIPLIER_FORFAIT = 1.20;
const ILE_MULTIPLIER_PARCOLIS = 1.15;

// Ile-de-France (reduced rates): 75, 77, 78, 91, 92, 93, 94, 95
const IDF_DEPTS = ['75', '77', '78', '91', '92', '93', '94', '95'];
const IDF_RATES = [
  { min: 1, max: 12, price: 18.50, type: 'forfait' },
  { min: 13, max: 23, price: 21.20, type: 'forfait' },
  { min: 24, max: 35, price: 24.50, type: 'forfait' },
  { min: 36, max: 47, price: 28.40, type: 'forfait' },
  { min: 48, max: 59, price: 31.80, type: 'forfait' },
  { min: 60, max: 119, price: 0.300, type: 'par_colis' },
  { min: 120, max: 239, price: 0.280, type: 'par_colis' },
  { min: 240, max: 479, price: 0.260, type: 'par_colis' },
  { min: 480, max: 999, price: 0.240, type: 'par_colis' },
  { min: 1000, max: 9999, price: 0.220, type: 'par_colis' },
];

// Loire Valley (local, cheapest): 37, 41, 44, 49, 53, 72, 85
const LOIRE_DEPTS = ['37', '41', '44', '49', '53', '72', '85'];
const LOIRE_RATES = [
  { min: 1, max: 12, price: 15.80, type: 'forfait' },
  { min: 13, max: 23, price: 18.50, type: 'forfait' },
  { min: 24, max: 35, price: 21.80, type: 'forfait' },
  { min: 36, max: 47, price: 25.40, type: 'forfait' },
  { min: 48, max: 59, price: 28.90, type: 'forfait' },
  { min: 60, max: 119, price: 0.280, type: 'par_colis' },
  { min: 120, max: 239, price: 0.260, type: 'par_colis' },
  { min: 240, max: 479, price: 0.240, type: 'par_colis' },
  { min: 480, max: 999, price: 0.220, type: 'par_colis' },
  { min: 1000, max: 9999, price: 0.200, type: 'par_colis' },
];

function getRatesForDept(deptCode, difficulty) {
  let baseRates;
  if (LOIRE_DEPTS.includes(deptCode) && difficulty === 'standard') {
    baseRates = LOIRE_RATES;
  } else if (IDF_DEPTS.includes(deptCode) && difficulty === 'standard') {
    baseRates = IDF_RATES;
  } else {
    baseRates = STANDARD_RATES;
  }

  if (difficulty === 'Haute montagne') {
    return baseRates.map((r) => ({
      ...r,
      price: parseFloat((r.price * (r.type === 'forfait' ? HM_MULTIPLIER_FORFAIT : HM_MULTIPLIER_PARCOLIS)).toFixed(4)),
    }));
  }
  if (difficulty === 'Ile') {
    return baseRates.map((r) => ({
      ...r,
      price: parseFloat((r.price * (r.type === 'forfait' ? ILE_MULTIPLIER_FORFAIT : ILE_MULTIPLIER_PARCOLIS)).toFixed(4)),
    }));
  }
  return baseRates;
}

async function importShippingGrid(db) {
  // Clear existing data
  await db('shipping_rates').del();
  await db('shipping_zones').del();

  const zones = [];
  const allRates = [];

  for (const [code, name] of Object.entries(DEPARTMENTS)) {
    // Standard zone for every department
    zones.push({
      dept_code: code,
      dept_name: name,
      difficulty: 'standard',
      surcharge_corse: code === '20' ? 15 : 0,
      surcharge_seasonal_pct: SEASONAL_DEPTS.includes(code) ? 25 : 0,
      seasonal_eligible: SEASONAL_DEPTS.includes(code),
      active: true,
    });

    // Haute montagne variant
    if (HAUTE_MONTAGNE.includes(code)) {
      zones.push({
        dept_code: code,
        dept_name: name,
        difficulty: 'Haute montagne',
        surcharge_corse: 0,
        surcharge_seasonal_pct: SEASONAL_DEPTS.includes(code) ? 25 : 0,
        seasonal_eligible: SEASONAL_DEPTS.includes(code),
        active: true,
      });
    }

    // Ile variant
    if (ILE_DEPTS.includes(code)) {
      zones.push({
        dept_code: code,
        dept_name: name,
        difficulty: 'Ile',
        surcharge_corse: 0,
        surcharge_seasonal_pct: SEASONAL_DEPTS.includes(code) ? 25 : 0,
        seasonal_eligible: SEASONAL_DEPTS.includes(code),
        active: true,
      });
    }
  }

  // Insert zones in batches
  const insertedZones = [];
  for (let i = 0; i < zones.length; i += 50) {
    const batch = zones.slice(i, i + 50);
    const result = await db('shipping_zones').insert(batch).returning('*');
    insertedZones.push(...result);
  }

  // Build rates for each zone
  for (const zone of insertedZones) {
    const rates = getRatesForDept(zone.dept_code, zone.difficulty);
    for (const rate of rates) {
      allRates.push({
        zone_id: zone.id,
        min_qty: rate.min,
        max_qty: rate.max,
        price_ht: rate.price,
        pricing_type: rate.type,
        valid_from: VALID_FROM,
        valid_to: VALID_TO,
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
