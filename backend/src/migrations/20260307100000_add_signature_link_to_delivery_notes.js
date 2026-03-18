exports.up = async function (knex) {
  await knex.schema.alterTable('delivery_notes', (t) => {
    t.uuid('signature_token').unique();
    t.timestamp('signature_token_expires_at');
    t.timestamp('signed_at');
    t.string('signed_by', 100);
    t.text('signature_image_url');
    t.string('signer_type', 20);
  });

  // Add 'bl_signed' to notifications type check constraint
  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type = ANY (ARRAY['order','payment','ranking','stock','unpaid','delivery','milestone','contact','bl_signed']::text[]));
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('delivery_notes', (t) => {
    t.dropColumn('signature_token');
    t.dropColumn('signature_token_expires_at');
    t.dropColumn('signed_at');
    t.dropColumn('signed_by');
    t.dropColumn('signature_image_url');
    t.dropColumn('signer_type');
  });

  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type = ANY (ARRAY['order','payment','ranking','stock','unpaid','delivery','milestone','contact']::text[]));
  `);
};
