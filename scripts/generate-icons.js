#!/usr/bin/env node
/**
 * Generate PNG icons from SVG source for PWA manifest
 * Usage: node scripts/generate-icons.js
 * Requires: npm install sharp (or run from vc-api container)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_SOURCE = path.join(__dirname, '..', 'frontend', 'public', 'icon-512.svg');
const OUTPUT_DIR = path.join(__dirname, '..', 'frontend', 'public');
const SIZES = [72, 96, 128, 144, 192, 512];

async function main() {
  const svgBuffer = fs.readFileSync(SVG_SOURCE);

  for (const size of SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-${size}.png`);
  }

  console.log('All icons generated successfully!');
}

main().catch((err) => {
  console.error('Error generating icons:', err.message);
  process.exit(1);
});
