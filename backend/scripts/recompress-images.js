#!/usr/bin/env node
/**
 * One-shot script: recompress product images > 200 Ko → JPEG 800×800 q82
 * Updates products.image_url in DB when extension changes (png → jpg).
 *
 * Usage: node scripts/recompress-images.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const knex = require('knex');

const knexConfig = require('../src/config/knexfile');
const env = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[env]);

const PRODUCTS_DIR = path.join(__dirname, '../uploads/products');
const SIZE_THRESHOLD = 200 * 1024; // 200 Ko

async function main() {
  const files = fs.readdirSync(PRODUCTS_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  let compressed = 0;
  let skipped = 0;
  let dbUpdated = 0;

  for (const file of files) {
    const filePath = path.join(PRODUCTS_DIR, file);
    const stat = fs.statSync(filePath);

    if (stat.size <= SIZE_THRESHOLD) {
      skipped++;
      continue;
    }

    const ext = path.extname(file).toLowerCase();
    const baseName = file.slice(0, -ext.length);
    const newFileName = baseName + '.jpg';
    const tmpPath = filePath + '.tmp.jpg';

    try {
      await sharp(filePath)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(tmpPath);

      const newSize = fs.statSync(tmpPath).size;

      // Replace original with compressed version
      fs.unlinkSync(filePath);
      const newFilePath = path.join(PRODUCTS_DIR, newFileName);
      fs.renameSync(tmpPath, newFilePath);

      const sizeBefore = (stat.size / 1024).toFixed(0);
      const sizeAfter = (newSize / 1024).toFixed(0);
      console.log(`  ✓ ${file} → ${newFileName}  (${sizeBefore} Ko → ${sizeAfter} Ko)`);
      compressed++;

      // Update DB if extension changed
      if (ext !== '.jpg') {
        const oldUrl = `/uploads/products/${file}`;
        const newUrl = `/uploads/products/${newFileName}`;
        const result = await db('products')
          .where({ image_url: oldUrl })
          .update({ image_url: newUrl, updated_at: new Date() });
        if (result > 0) {
          console.log(`    DB updated: ${oldUrl} → ${newUrl}`);
          dbUpdated++;
        }
      }
    } catch (err) {
      // Clean up tmp file on error
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${compressed} compressed, ${skipped} skipped (< 200 Ko), ${dbUpdated} DB rows updated`);
  await db.destroy();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
