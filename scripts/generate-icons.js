#!/usr/bin/env node
/**
 * Génère le jeu d'icônes PWA (manifest + favicon + apple-touch) à partir du
 * SYMBOLE SEUL de la marque (le verre avec auréole et bulle, sans le texte).
 *
 * Source attendue (fournie par Nicolas, cf. frontend/public/brand/README.md) :
 *   frontend/public/brand/symbol.svg   (préféré)
 *   frontend/public/brand/symbol.png   (repli, fond transparent obligatoire)
 *
 * Tant que la source n'est pas déposée, le script sort en code 2 sans rien écrire.
 *
 * Usage :
 *   docker run --rm -v /root/vins-conversations:/w -w /w \
 *     -e NODE_PATH=/app/node_modules vins-conversations-api \
 *     node scripts/generate-icons.js [--source=chemin] [--dry-run]
 *
 * (sharp n'est pas installé sur l'hôte ; il l'est dans l'image vins-conversations-api)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'frontend', 'public');
const BRAND_DIR = path.join(PUBLIC_DIR, 'brand');

/** Bordeaux de marque — aligné sur theme_color / background_color du manifeste. */
const BG = { r: 0x7a, g: 0x1c, b: 0x3b, alpha: 1 };

/** Icônes `purpose: "any"` — coins arrondis, motif à 88 % du côté. */
const ANY_SIZES = [72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
/** Icônes `purpose: "maskable"` — pleine page, motif confiné à 80 % du côté. */
const MASKABLE_SIZES = [192, 384, 512];
/** Favicons PNG (le favicon.svg vectoriel reste la source primaire). */
const FAVICON_SIZES = [16, 32, 48];

const ANY_RATIO = 0.88;
const MASKABLE_RATIO = 0.8; // zone de sécurité maskable : 10 % de marge par côté
const CORNER_RATIO = 80 / 512; // rayon repris du favicon.svg actuel

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceArg = (args.find((a) => a.startsWith('--source=')) || '').split('=')[1];

function resolveSource() {
  if (sourceArg) return path.resolve(sourceArg);
  for (const name of ['symbol.svg', 'symbol.png']) {
    const p = path.join(BRAND_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {Buffer} src        source brute (SVG ou PNG)
 * @param {number} size       côté de l'icône générée
 * @param {number} ratio      part du côté occupée par le motif
 * @param {boolean} rounded   true => coins arrondis (icônes `any`)
 * @param {string} outPath
 */
async function render(src, size, ratio, rounded, outPath) {
  const inner = Math.round(size * ratio);
  const offset = Math.round((size - inner) / 2);

  // density élevée : rastérisation nette des sources SVG (ignoré pour un PNG)
  const motif = await sharp(src, { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  let buf = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: motif, top: offset, left: offset }])
    .png()
    .toBuffer();

  if (rounded) {
    const r = Math.round(size * CORNER_RATIO);
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
    );
    buf = await sharp(buf).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }

  if (!dryRun) fs.writeFileSync(outPath, buf);
  console.log(`${dryRun ? '[dry-run] ' : ''}${path.relative(PUBLIC_DIR, outPath)}  ${size}x${size}`);
}

async function main() {
  const source = resolveSource();
  if (!source || !fs.existsSync(source)) {
    console.error(
      [
        'Source introuvable — génération annulée, aucun fichier écrit.',
        '',
        'Déposer le SYMBOLE SEUL (verre + auréole + bulle, SANS le texte, fond transparent) dans :',
        `  ${path.relative(process.cwd(), path.join(BRAND_DIR, 'symbol.svg'))}   (ou symbol.png)`,
        '',
        'Voir frontend/public/brand/README.md pour le cahier des charges du fichier attendu.',
      ].join('\n')
    );
    process.exit(2);
  }

  console.log(`Source : ${source}`);
  const meta = await sharp(source).metadata();
  console.log(`Format : ${meta.format} ${meta.width || '?'}x${meta.height || '?'}`);
  if (meta.format !== 'svg' && (meta.width < 512 || meta.height < 512)) {
    console.warn('⚠️  Source bitmap < 512 px : les grandes icônes seront floues. Préférer un SVG.');
  }
  if (meta.format !== 'svg' && !meta.hasAlpha) {
    console.warn('⚠️  Source sans canal alpha : le fond ne sera pas bordeaux mais celui de l\'image.');
  }

  const outDir = path.join(PUBLIC_DIR, 'icons');
  if (!dryRun) fs.mkdirSync(outDir, { recursive: true });

  for (const size of ANY_SIZES) {
    await render(source, size, ANY_RATIO, true, path.join(outDir, `icon-${size}.png`));
  }
  for (const size of MASKABLE_SIZES) {
    await render(source, size, MASKABLE_RATIO, false, path.join(outDir, `icon-maskable-${size}.png`));
  }
  for (const size of FAVICON_SIZES) {
    await render(source, size, ANY_RATIO, true, path.join(outDir, `favicon-${size}.png`));
  }
  // iOS ne gère pas la transparence : apple-touch-icon = 180 px opaque, coins non arrondis
  // (iOS applique lui-même son masque).
  await render(source, 180, ANY_RATIO, false, path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

  console.log('\nTerminé. Étapes restantes (cf. scripts/ICONS.md) :');
  console.log('  1. remplacer le bloc "icons" de frontend/public/manifest.json');
  console.log('  2. mettre à jour STATIC_ASSETS + bumper CACHE_NAME dans frontend/public/sw.js');
  console.log('  3. mettre à jour les <link icon> / apple-touch-icon de frontend/index.html');
}

main().catch((err) => {
  console.error('Erreur de génération :', err.message);
  process.exit(1);
});
