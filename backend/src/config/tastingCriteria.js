/**
 * Tasting criteria per wine type — shared config (backend).
 * Used for Joi validation and PDF radar chart rendering.
 */

const TASTING_CRITERIA = {
  rouge: [
    { key: 'fruite', label: 'Fruité' },
    { key: 'mineralite', label: 'Minéral' },
    { key: 'rondeur', label: 'Rondeur' },
    { key: 'acidite', label: 'Acidité' },
    { key: 'tanins', label: 'Tanins' },
    { key: 'boise', label: 'Boisé' },
    { key: 'longueur', label: 'Longueur' },
    { key: 'puissance', label: 'Puissance' },
  ],
  blanc_sec: [
    { key: 'fruite', label: 'Fruité' },
    { key: 'mineralite', label: 'Minéral' },
    { key: 'rondeur', label: 'Rondeur' },
    { key: 'acidite', label: 'Acidité' },
    { key: 'boise', label: 'Boisé' },
    { key: 'longueur', label: 'Longueur' },
    { key: 'puissance', label: 'Puissance' },
  ],
  blanc_moelleux: [
    { key: 'fruite', label: 'Fruité' },
    { key: 'douceur', label: 'Douceur' },
    { key: 'rondeur', label: 'Rondeur' },
    { key: 'acidite', label: 'Acidité' },
    { key: 'boise', label: 'Boisé' },
    { key: 'longueur', label: 'Longueur' },
    { key: 'puissance', label: 'Puissance' },
  ],
  rose: [
    { key: 'fruite', label: 'Fruité' },
    { key: 'mineralite', label: 'Minéral' },
    { key: 'rondeur', label: 'Rondeur' },
    { key: 'acidite', label: 'Acidité' },
    { key: 'longueur', label: 'Longueur' },
    { key: 'puissance', label: 'Puissance' },
  ],
  effervescent: [
    { key: 'fruite', label: 'Fruité' },
    { key: 'finesse_bulles', label: 'Bulles' },
    { key: 'fraicheur', label: 'Fraîcheur' },
    { key: 'rondeur', label: 'Rondeur' },
    { key: 'longueur', label: 'Longueur' },
    { key: 'puissance', label: 'Puissance' },
  ],
  sans_alcool: [
    { key: 'fruite', label: 'Fruité' },
    { key: 'acidite', label: 'Acidité' },
    { key: 'douceur', label: 'Douceur' },
    { key: 'longueur', label: 'Longueur' },
  ],
  coffret: null,
};

/** All possible tasting note keys (union of all types) */
const ALL_TASTING_KEYS = [
  'fruite', 'mineralite', 'rondeur', 'acidite', 'tanins',
  'boise', 'longueur', 'puissance', 'douceur', 'finesse_bulles', 'fraicheur',
];

function resolveWineType(color, category) {
  if (!color && (!category || (category || '').toLowerCase().includes('coffret'))) return 'coffret';
  if (color === 'blanc') {
    const cat = (category || '').toLowerCase();
    if (cat.includes('moelleux') || cat.includes('liquoreux') || cat.includes('layon')) return 'blanc_moelleux';
    return 'blanc_sec';
  }
  if (color === 'rosé') return 'rose';
  if (['rouge', 'effervescent', 'sans_alcool'].includes(color)) return color;
  return 'rouge';
}

function getCriteriaForProduct(color, category) {
  const type = resolveWineType(color, category);
  return TASTING_CRITERIA[type] || null;
}

module.exports = { TASTING_CRITERIA, ALL_TASTING_KEYS, resolveWineType, getCriteriaForProduct };
