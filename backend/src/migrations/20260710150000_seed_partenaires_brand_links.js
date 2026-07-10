/**
 * Ajoute une section discrète « Nos autres marques » à site_pages slug='partenaires'.
 * Rendu (PartenairesPage.jsx, case type='brand_links') = une ligne texte centrée SOUS la grille
 * de logos : « Nos autres marques : Cap Performances · VendMieux ». Liens JSX construits depuis
 * {name,url} → cliquables, crawlables, rel="noopener" (sans noreferrer/nofollow), SANS UTM.
 * Pas de HTML interprété → aucun risque page blanche/XSS.
 *
 * Remplace l'approche abandonnée (items sans logo dans la grille, migration 20260710120000
 * rollback + supprimée) : ici la donnée est une SECTION à part, pas un item de la grille.
 *
 * Pattern read-modify-write IDEMPOTENT : lit content_json, insère la section brand_links
 * JUSTE APRÈS la section 'partners' (pour un rendu sous la grille) seulement si absente
 * (dédup par type), réécrit. Jamais de remplacement en bloc. down() retire la section brand_links.
 *
 * Ceinture + bretelles : la même section existe aussi dans DEFAULT_CONTENT du composant → le lien
 * SEO survit à un échec API ou à un content_json vide/réinitialisé (fallback codé en dur).
 */

const SLUG = 'partenaires';

const BRAND_LINKS_SECTION = {
  type: 'brand_links',
  label: 'Nos autres marques',
  items: [
    { name: 'Cap Performances', url: 'https://www.cap-performances.fr/' },
    { name: 'VendMieux', url: 'https://vendmieux.fr/' },
  ],
};

function readContent(row) {
  return typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json;
}

exports.up = async function (knex) {
  const row = await knex('site_pages').where({ slug: SLUG }).first();
  if (!row) return; // row absente (ne devrait pas arriver, cf. 20260610000001) → no-op idempotent
  const content = readContent(row);
  if (!content || !Array.isArray(content.sections)) return; // structure inattendue → on ne casse rien
  if (content.sections.some((s) => s && s.type === 'brand_links')) return; // déjà présente → rerun sans effet
  const partnersIdx = content.sections.findIndex((s) => s && s.type === 'partners');
  const insertAt = partnersIdx >= 0 ? partnersIdx + 1 : content.sections.length; // sous la grille
  content.sections.splice(insertAt, 0, BRAND_LINKS_SECTION);
  await knex('site_pages')
    .where({ slug: SLUG })
    .update({ content_json: JSON.stringify(content), updated_at: knex.fn.now() });
};

exports.down = async function (knex) {
  const row = await knex('site_pages').where({ slug: SLUG }).first();
  if (!row) return;
  const content = readContent(row);
  if (!content || !Array.isArray(content.sections)) return;
  content.sections = content.sections.filter((s) => !(s && s.type === 'brand_links'));
  await knex('site_pages')
    .where({ slug: SLUG })
    .update({ content_json: JSON.stringify(content), updated_at: knex.fn.now() });
};
