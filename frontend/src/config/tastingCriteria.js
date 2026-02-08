/**
 * Critères de dégustation par type de vin.
 * Chaque type définit les axes du radar chart et les sliders du formulaire.
 * null = pas de critères (coffret).
 */

export const TASTING_CRITERIA = {
  rouge: [
    { key: 'fruite', label: 'Fruité', description: 'Fruits rouges et noirs' },
    { key: 'mineralite', label: 'Minéralité', description: 'Pierre, silex' },
    { key: 'rondeur', label: 'Rondeur', description: 'Souplesse en bouche' },
    { key: 'acidite', label: 'Acidité', description: 'Fraîcheur, vivacité' },
    { key: 'tanins', label: 'Tanins', description: 'Structure tannique' },
    { key: 'boise', label: 'Boisé', description: 'Élevage fût de chêne' },
    { key: 'longueur', label: 'Longueur', description: 'Persistance aromatique' },
    { key: 'puissance', label: 'Puissance', description: 'Intensité globale' },
  ],
  blanc_sec: [
    { key: 'fruite', label: 'Fruité', description: 'Agrumes, fruits blancs' },
    { key: 'mineralite', label: 'Minéralité', description: 'Silex, pierre à fusil' },
    { key: 'rondeur', label: 'Rondeur', description: 'Gras en bouche' },
    { key: 'acidite', label: 'Acidité', description: 'Vivacité' },
    { key: 'boise', label: 'Boisé', description: 'Si élevé en fût' },
    { key: 'longueur', label: 'Longueur', description: 'Persistance' },
    { key: 'puissance', label: 'Puissance', description: 'Intensité' },
  ],
  blanc_moelleux: [
    { key: 'fruite', label: 'Fruité', description: 'Fruits confits, exotiques' },
    { key: 'douceur', label: 'Douceur', description: 'Sucrosité' },
    { key: 'rondeur', label: 'Rondeur', description: 'Onctuosité' },
    { key: 'acidite', label: 'Acidité', description: 'Équilibre' },
    { key: 'boise', label: 'Boisé', description: 'Notes boisées' },
    { key: 'longueur', label: 'Longueur', description: 'Persistance' },
    { key: 'puissance', label: 'Puissance', description: 'Intensité' },
  ],
  rose: [
    { key: 'fruite', label: 'Fruité', description: 'Fruits rouges frais' },
    { key: 'mineralite', label: 'Minéralité', description: 'Minéral' },
    { key: 'rondeur', label: 'Rondeur', description: 'Souplesse' },
    { key: 'acidite', label: 'Acidité', description: 'Fraîcheur' },
    { key: 'longueur', label: 'Longueur', description: 'Persistance' },
    { key: 'puissance', label: 'Puissance', description: 'Intensité' },
  ],
  effervescent: [
    { key: 'fruite', label: 'Fruité', description: 'Pomme, poire, brioche' },
    { key: 'finesse_bulles', label: 'Finesse bulles', description: 'Perlant, crémeux' },
    { key: 'fraicheur', label: 'Fraîcheur', description: 'Vivacité' },
    { key: 'rondeur', label: 'Rondeur', description: 'Crémeux vs vif' },
    { key: 'longueur', label: 'Longueur', description: 'Persistance' },
    { key: 'puissance', label: 'Puissance', description: 'Intensité' },
  ],
  sans_alcool: [
    { key: 'fruite', label: 'Fruité', description: 'Intensité fruitée' },
    { key: 'acidite', label: 'Acidité', description: 'Fraîcheur' },
    { key: 'douceur', label: 'Douceur', description: 'Sucrosité' },
    { key: 'longueur', label: 'Longueur', description: 'Persistance' },
  ],
  coffret: null,
};

/**
 * Map color DB values to tasting criteria keys.
 * Also supports category-based heuristics for blanc sec vs moelleux.
 */
export const WINE_TYPE_OPTIONS = [
  { value: 'rouge', label: 'Rouge' },
  { value: 'blanc_sec', label: 'Blanc Sec' },
  { value: 'blanc_moelleux', label: 'Blanc Moelleux / Liquoreux' },
  { value: 'rose', label: 'Rosé' },
  { value: 'effervescent', label: 'Effervescent' },
  { value: 'sans_alcool', label: 'Sans Alcool' },
  { value: 'coffret', label: 'Coffret / Assortiment' },
];

/**
 * Resolve the tasting criteria type from a product's color + category.
 * Returns a key into TASTING_CRITERIA.
 */
export function resolveWineType(color, category) {
  if (!color && (!category || category.toLowerCase().includes('coffret'))) return 'coffret';
  if (color === 'blanc') {
    const cat = (category || '').toLowerCase();
    if (cat.includes('moelleux') || cat.includes('liquoreux') || cat.includes('layon')) return 'blanc_moelleux';
    return 'blanc_sec';
  }
  if (color === 'rosé') return 'rose';
  if (color === 'rouge' || color === 'effervescent' || color === 'sans_alcool') return color;
  return 'rouge'; // default
}

/**
 * Get criteria list for a product (by color + category).
 * Returns array of {key, label, description} or null for coffret.
 */
export function getCriteriaForProduct(color, category) {
  const type = resolveWineType(color, category);
  return TASTING_CRITERIA[type] || null;
}

/**
 * Build radar data array from tasting_notes object + product type.
 * Only includes axes relevant to the wine type.
 */
export function buildRadarData(tastingNotes, color, category) {
  if (!tastingNotes) return null;
  const notes = typeof tastingNotes === 'string' ? JSON.parse(tastingNotes) : tastingNotes;
  const criteria = getCriteriaForProduct(color, category);
  if (!criteria) return null;
  const data = criteria.map(c => ({ axis: c.label, value: notes[c.key] || 0 }));
  return data.some(d => d.value > 0) ? data : null;
}
