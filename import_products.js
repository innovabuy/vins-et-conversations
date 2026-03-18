#!/usr/bin/env node
/**
 * Import produits depuis export Wix → base PostgreSQL Vins & Conversations
 * Usage : node import_products.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Parser CSV simple (gère les guillemets et virgules dans les valeurs)
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Nettoyer HTML
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Mapper collection Wix → catégorie plateforme
function mapCategory(collection) {
  const col = (collection || '').toLowerCase();
  if (col.includes('blanc')) return 'Blancs Secs';
  if (col.includes('moelleux') || col.includes('doux')) return 'Blancs Moelleux';
  if (col.includes('rouge') || col.includes('bordeaux') || col.includes('bourgogne') || col.includes('monde') || col.includes('sud')) return 'Rouges';
  if (col.includes('pétillant') || col.includes('petillant') || col.includes('champagne') || col.includes('crémant') || col.includes('cremant')) return 'Effervescents';
  if (col.includes('rosé') || col.includes('rose')) return 'Rosés';
  if (col.includes('sans alcool') || col.includes('jus')) return 'Sans Alcool';
  if (col.includes('coffret') || col.includes('panier') || col.includes('pack')) return 'Coffrets';
  if (col.includes('terrine') || col.includes('épicerie') || col.includes('epicerie')) return 'Épicerie Fine';
  if (col.includes('loire')) return 'Vins de Loire';
  return 'Autres';
}

// TVA selon catégorie
function getTVA(category, price) {
  if (category === 'Sans Alcool' || category === 'Épicerie Fine') return 5.5;
  return 20;
}

async function main() {
  // Lire le CSV
  const csvPath = path.join(__dirname, 'catalog_products.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ Fichier catalog_products.csv introuvable dans', __dirname);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf8')
    .replace(/^\uFEFF/, ''); // BOM

  const rows = parseCSV(content).filter(r => r.fieldType === 'Product');
  console.log(`📦 ${rows.length} produits trouvés dans le CSV`);

  // Connexion DB
  const client = new Client({
    connectionString: process.env.DATABASE_URL ||
      'postgresql://vc_admin:vc_dev_2026@localhost:5432/vins_conversations',
    ssl: false
  });

  await client.connect();
  console.log('✅ Connecté à la base de données');

  // Récupérer les catégories existantes
  const { rows: cats } = await client.query('SELECT id, name FROM product_categories');
  const catMap = {};
  cats.forEach(c => { catMap[c.name] = c.id; });
  console.log(`📂 ${cats.length} catégories en base :`, Object.keys(catMap).join(', '));

  // Récupérer les produits existants (pour éviter les doublons)
  const { rows: existing } = await client.query('SELECT name FROM products');
  const existingNames = new Set(existing.map(p => p.name.toLowerCase().trim()));
  console.log(`📋 ${existingNames.size} produits déjà en base`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const name = (row.name || '').trim();
    if (!name) { skipped++; continue; }

    // Éviter les doublons
    if (existingNames.has(name.toLowerCase())) {
      console.log(`  ⏭️  Ignoré (déjà en base) : ${name}`);
      skipped++;
      continue;
    }

    const priceTTC = parseFloat(row.price) || 0;
    if (priceTTC <= 0) { skipped++; continue; }

    const collection = row.collection || '';
    const category = mapCategory(collection);
    const tva = getTVA(category, priceTTC);
    const priceHT = parseFloat((priceTTC / (1 + tva/100)).toFixed(2));
    const purchasePrice = row.cost ? parseFloat(row.cost) : parseFloat((priceHT * 0.45).toFixed(2));
    const description = stripHtml(row.description || '');
    const isVisible = row.visible === 'true';

    // Trouver category_id
    let categoryId = catMap[category] || null;
    // Si catégorie n'existe pas, créer
    if (!categoryId && category !== 'Autres') {
      try {
        const slug = category.toLowerCase()
          .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a')
          .replace(/[ùû]/g, 'u').replace(/[îï]/g, 'i')
          .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        const { rows: newCat } = await client.query(
          `INSERT INTO product_categories (name, slug, type, sort_order)
           VALUES ($1, $2, 'wine', 99)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [category, slug]
        );
        categoryId = newCat[0].id;
        catMap[category] = categoryId;
        console.log(`  📂 Catégorie créée : ${category}`);
      } catch(e) {
        console.log(`  ⚠️  Catégorie non créée : ${category} — ${e.message}`);
      }
    }

    try {
      await client.query(`
        INSERT INTO products (
          name, description, price_ttc, price_ht, purchase_price,
          tva_rate, category, category_id, active, is_visible,
          visible_boutique, sort_order, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
      `, [
        name,
        description || null,
        priceTTC,
        priceHT,
        purchasePrice,
        tva,
        category,
        categoryId,
        true,
        isVisible,
        isVisible,
        999 // sort_order élevé pour mettre après les produits existants
      ]);

      console.log(`  ✅ ${name} (${priceTTC}€ TTC, cat: ${category})`);
      inserted++;
      existingNames.add(name.toLowerCase());
    } catch(e) {
      console.error(`  ❌ Erreur sur "${name}": ${e.message}`);
      errors++;
    }
  }

  await client.end();

  console.log('\n══════════════════════════════════');
  console.log(`✅ Importés  : ${inserted}`);
  console.log(`⏭️  Ignorés   : ${skipped}`);
  console.log(`❌ Erreurs   : ${errors}`);
  console.log('══════════════════════════════════');
}

main().catch(e => { console.error('Erreur fatale:', e); process.exit(1); });
