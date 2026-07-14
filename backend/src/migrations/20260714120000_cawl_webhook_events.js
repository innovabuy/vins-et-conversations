/**
 * Table webhook_events — persistance des événements webhook CAWL (Worldline Direct).
 *
 * Rôle (cf. intégration CAWL, feature/cawl-integration) :
 *  - PERSISTER l'événement AVANT de répondre 2xx à la plateforme (la réponse doit être
 *    immédiate ; le traitement métier se fait après, à partir de cette ligne).
 *  - DÉDUPLICATION garantie PAR LA BASE : index UNIQUE sur (payment_id, type). La doc CAWL
 *    précise que les webhooks rejoués portent des valeurs identiques de payment.id et type
 *    -> un rejeu tente un INSERT en conflit sur cet index = neutralisé au niveau base, sans
 *    dépendre d'une vérification applicative.
 *  - REJEU MANUEL des événements en échec : colonnes processed / error / attempts pour
 *    identifier et relancer un événement dont le traitement a échoué.
 *
 * Provider gardé générique (défaut 'cawl') ; l'index unique reste sur (payment_id, type)
 * comme spécifié.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('webhook_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('provider', 20).notNullable().defaultTo('cawl');
    t.string('payment_id', 100).notNullable();          // CAWL payment.id
    t.string('type', 100).notNullable();                // type d'événement CAWL
    t.integer('status_code');                           // statusOutput.statusCode (9=CAPTURED, 1=abandon…)
    t.jsonb('payload').notNullable();                   // événement complet (unmarshalled)
    t.boolean('processed').notNullable().defaultTo(false);
    t.timestamp('processed_at');
    t.text('error');                                    // dernier message d'échec (pour rejeu manuel)
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('received_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Dédup garantie base : un (payment_id, type) rejoué viole cet index -> pas de double effet.
    t.unique(['payment_id', 'type'], { indexName: 'webhook_events_payment_id_type_unique' });
    t.index(['processed'], 'webhook_events_processed_index');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('webhook_events');
};
