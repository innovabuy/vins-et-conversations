/**
 * Add 'contact' to notifications type CHECK constraint
 */
exports.up = async function(knex) {
  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type = ANY (ARRAY['order','payment','ranking','stock','unpaid','delivery','milestone','contact']));
  `);
};

exports.down = async function(knex) {
  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type = ANY (ARRAY['order','payment','ranking','stock','unpaid','delivery','milestone']));
  `);
};
