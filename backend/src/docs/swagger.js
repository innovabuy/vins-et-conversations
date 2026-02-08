const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Vins & Conversations API',
      version: '1.0.0',
      description: 'API REST pour la plateforme de gestion des ventes de vin — Multi-profils (Admin, Etudiant, Enseignant, CSE, Ambassadeur, BTS NDRC)',
      contact: { name: 'Nicolas Froment', email: 'nicolas@vins-conversations.fr' },
    },
    servers: [
      { url: '/api/v1', description: 'API v1' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'SERVER_ERROR' },
            message: { type: 'string', example: 'Description de l\'erreur' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentification (login, register, refresh, logout)' },
      { name: 'Dashboard', description: 'Tableaux de bord (etudiant, admin, enseignant, CSE, ambassadeur, BTS)' },
      { name: 'Orders', description: 'Gestion des commandes' },
      { name: 'Products', description: 'Catalogue produits' },
      { name: 'Campaigns', description: 'Gestion des campagnes' },
      { name: 'Stock', description: 'Gestion des stocks, mouvements, retours' },
      { name: 'Delivery Notes', description: 'Bons de livraison' },
      { name: 'CRM', description: 'Contacts et historique' },
      { name: 'Suppliers', description: 'Fournisseurs' },
      { name: 'Payments', description: 'Paiements et rapprochement' },
      { name: 'Delivery Routes', description: 'Tournees de livraison' },
      { name: 'Notifications', description: 'Centre de notifications' },
      { name: 'Pricing', description: 'Conditions commerciales' },
      { name: 'Exports', description: 'Exports CSV et PDF' },
      { name: 'Finance', description: 'Marges et analyse financiere' },
      { name: 'Users', description: 'Gestion utilisateurs et droits' },
      { name: 'Invitations', description: 'Gestion des invitations' },
      { name: 'Analytics', description: 'Analyses et statistiques' },
      { name: 'Audit', description: 'Journal d\'audit' },
      { name: 'Ambassador', description: 'Parrainage ambassadeur' },
      { name: 'Formation', description: 'Modules de formation BTS' },
      { name: 'Stripe', description: 'Paiement Stripe et webhooks' },
      { name: 'Public', description: 'API publique catalogue (sans authentification, rate limit 30/min)' },
    ],
    paths: {
      // ─── Auth ─────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Connexion utilisateur',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } },
          },
          responses: {
            200: { description: 'Token + user info' },
            401: { description: 'Identifiants invalides' },
          },
        },
      },
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Inscription utilisateur',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'name'], properties: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' }, invitation_code: { type: 'string' } } } } },
          },
          responses: { 201: { description: 'Utilisateur cree' }, 409: { description: 'Email existe deja' } },
        },
      },
      '/auth/refresh': {
        post: { tags: ['Auth'], summary: 'Rafraichir le token', security: [], responses: { 200: { description: 'Nouveau accessToken' }, 401: { description: 'Refresh token invalide' } } },
      },
      '/auth/logout': {
        post: { tags: ['Auth'], summary: 'Deconnexion', responses: { 200: { description: 'Cookie supprime' } } },
      },

      // ─── Dashboard ────────────────────────────────
      '/dashboard/student': {
        get: {
          tags: ['Dashboard'],
          summary: 'Dashboard etudiant',
          parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'KPIs etudiant (CA, bouteilles, position, streak, gratuits)' } },
        },
      },
      '/dashboard/student/ranking': {
        get: { tags: ['Dashboard'], summary: 'Classement etudiant', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Classement complet' } } },
      },
      '/dashboard/student/orders': {
        get: { tags: ['Dashboard'], summary: 'Historique commandes etudiant', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Liste commandes' } } },
      },
      '/dashboard/admin/cockpit': {
        get: { tags: ['Dashboard'], summary: 'Cockpit admin', parameters: [{ name: 'campaign_ids', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'KPIs, actions, classement, top produits' } } },
      },
      '/dashboard/teacher': {
        get: { tags: ['Dashboard'], summary: 'Dashboard enseignant (sans montants EUR)', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Progression classe, eleves, classGroups' } } },
      },
      '/dashboard/cse': {
        get: { tags: ['Dashboard'], summary: 'Dashboard CSE', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Produits CSE, commandes, minOrder, discountPct' } } },
      },
      '/dashboard/ambassador': {
        get: { tags: ['Dashboard'], summary: 'Dashboard ambassadeur', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Tier, ventes, gains, parrainages' } } },
      },
      '/dashboard/bts': {
        get: { tags: ['Dashboard'], summary: 'Dashboard BTS NDRC', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Ventes + modules formation' } } },
      },

      // ─── Orders ───────────────────────────────────
      '/orders': {
        post: {
          tags: ['Orders'],
          summary: 'Creer une commande',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['campaign_id', 'items'], properties: { campaign_id: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, qty: { type: 'integer' } } } } } } } },
          },
          responses: { 201: { description: 'Commande creee' }, 400: { description: 'Produits invalides ou min_order non atteint' } },
        },
      },
      '/orders/{id}': {
        get: { tags: ['Orders'], summary: 'Detail commande', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Commande + items' } } },
      },
      '/orders/{id}/invoice': {
        get: { tags: ['Orders'], summary: 'Telecharger facture PDF', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'PDF facture', content: { 'application/pdf': {} } } } },
      },
      '/orders/admin/list': {
        get: { tags: ['Orders'], summary: 'Liste commandes admin', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'Liste paginee' } } },
      },
      '/orders/admin/{id}/validate': {
        post: { tags: ['Orders'], summary: 'Valider une commande', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Commande validee' } } },
      },

      // ─── Products ─────────────────────────────────
      '/products': {
        get: { tags: ['Products'], summary: 'Liste tous les produits', responses: { 200: { description: 'Liste produits' } } },
      },
      '/campaigns/{campaignId}/products': {
        get: { tags: ['Products'], summary: 'Produits d\'une campagne', parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Produits campagne' } } },
      },
      '/admin/products': {
        post: { tags: ['Products'], summary: 'Creer un produit', responses: { 201: { description: 'Produit cree' } } },
      },
      '/admin/products/{id}': {
        put: { tags: ['Products'], summary: 'Modifier un produit', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Produit modifie' } } },
        delete: { tags: ['Products'], summary: 'Supprimer un produit', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Produit supprime' } } },
      },

      // ─── Campaigns ────────────────────────────────
      '/admin/campaigns': {
        get: { tags: ['Campaigns'], summary: 'Liste campagnes avec KPIs', responses: { 200: { description: 'Liste campagnes enrichie' } } },
      },
      '/admin/campaigns/{id}/duplicate': {
        post: { tags: ['Campaigns'], summary: 'Dupliquer une campagne', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 201: { description: 'Campagne dupliquee (produits copies, pas orders/participations)' } } },
      },

      // ─── Stock ────────────────────────────────────
      '/admin/stock': {
        get: { tags: ['Stock'], summary: 'Liste stock produits', responses: { 200: { description: 'Stock actuel' } } },
      },
      '/admin/stock/alerts': {
        get: { tags: ['Stock'], summary: 'Alertes stock bas', responses: { 200: { description: 'Produits sous seuil' } } },
      },
      '/admin/stock/history': {
        get: { tags: ['Stock'], summary: 'Historique mouvements', parameters: [{ name: 'product_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Mouvements stock' } } },
      },
      '/admin/stock/movements': {
        post: { tags: ['Stock'], summary: 'Ajouter mouvement stock', responses: { 201: { description: 'Mouvement cree' } } },
      },
      '/admin/stock/returns': {
        get: { tags: ['Stock'], summary: 'Liste retours', responses: { 200: { description: 'Retours' } } },
        post: { tags: ['Stock'], summary: 'Creer retour/avoir', responses: { 201: { description: 'Retour cree + mouvement stock + event financier' } } },
      },

      // ─── Delivery Notes ───────────────────────────
      '/admin/delivery-notes': {
        get: { tags: ['Delivery Notes'], summary: 'Liste BL', responses: { 200: { description: 'Bons de livraison' } } },
        post: { tags: ['Delivery Notes'], summary: 'Generer BL', responses: { 201: { description: 'BL cree' } } },
      },
      '/admin/delivery-notes/{id}': {
        get: { tags: ['Delivery Notes'], summary: 'Detail BL', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'BL detail' } } },
        put: { tags: ['Delivery Notes'], summary: 'Modifier BL', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'BL modifie' } } },
      },
      '/admin/delivery-notes/{id}/sign': {
        post: { tags: ['Delivery Notes'], summary: 'Signature numerique BL', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'BL signe' } } },
      },

      // ─── CRM ──────────────────────────────────────
      '/admin/contacts': {
        get: { tags: ['CRM'], summary: 'Liste contacts', responses: { 200: { description: 'Contacts' } } },
        post: { tags: ['CRM'], summary: 'Creer contact', responses: { 201: { description: 'Contact cree' } } },
      },
      '/admin/contacts/search': {
        get: { tags: ['CRM'], summary: 'Rechercher contacts', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Resultats recherche' } } },
      },
      '/admin/contacts/{id}': {
        put: { tags: ['CRM'], summary: 'Modifier contact', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Contact modifie' } } },
      },
      '/admin/contacts/{id}/history': {
        get: { tags: ['CRM'], summary: 'Historique contact', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Historique interactions' } } },
      },

      // ─── Suppliers ────────────────────────────────
      '/admin/suppliers': {
        get: { tags: ['Suppliers'], summary: 'Liste fournisseurs', responses: { 200: { description: 'Fournisseurs' } } },
      },

      // ─── Payments ─────────────────────────────────
      '/admin/payments': {
        get: { tags: ['Payments'], summary: 'Liste paiements', parameters: [{ name: 'method', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Paiements' } } },
      },
      '/admin/payments/{id}/reconcile': {
        put: { tags: ['Payments'], summary: 'Rapprochement manuel', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Paiement rapproche' } } },
      },
      '/admin/payments/cash-deposit': {
        post: { tags: ['Payments'], summary: 'Depot especes (tracabilite obligatoire)', responses: { 201: { description: 'Depot enregistre avec audit' } } },
      },

      // ─── Delivery Routes ──────────────────────────
      '/admin/delivery-routes': {
        get: { tags: ['Delivery Routes'], summary: 'Liste tournees', responses: { 200: { description: 'Tournees' } } },
        post: { tags: ['Delivery Routes'], summary: 'Creer tournee', responses: { 201: { description: 'Tournee creee' } } },
      },
      '/admin/delivery-routes/{id}': {
        put: { tags: ['Delivery Routes'], summary: 'Modifier tournee', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Tournee modifiee' } } },
      },

      // ─── Notifications ────────────────────────────
      '/notifications': {
        get: { tags: ['Notifications'], summary: 'Liste notifications', responses: { 200: { description: 'Notifications + unread count' } } },
      },
      '/notifications/{id}/read': {
        put: { tags: ['Notifications'], summary: 'Marquer comme lue', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/notifications/read-all': {
        put: { tags: ['Notifications'], summary: 'Marquer toutes comme lues', responses: { 200: { description: 'OK' } } },
      },
      '/notifications/settings': {
        get: { tags: ['Notifications'], summary: 'Parametres notifications', responses: { 200: { description: 'Settings' } } },
        put: { tags: ['Notifications'], summary: 'Modifier parametres', responses: { 200: { description: 'OK' } } },
      },

      // ─── Pricing ──────────────────────────────────
      '/admin/pricing-conditions': {
        get: { tags: ['Pricing'], summary: 'Liste conditions commerciales', responses: { 200: { description: 'Conditions' } } },
        post: { tags: ['Pricing'], summary: 'Creer condition', responses: { 201: { description: 'Condition creee' } } },
      },
      '/admin/pricing-conditions/{id}': {
        put: { tags: ['Pricing'], summary: 'Modifier condition', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Condition modifiee' } } },
      },

      // ─── Exports ──────────────────────────────────
      '/admin/exports/pennylane': {
        get: { tags: ['Exports'], summary: 'Export Pennylane CSV (journal VE)', parameters: [{ name: 'start', in: 'query', schema: { type: 'string' } }, { name: 'end', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'CSV UTF-8 BOM', content: { 'text/csv': {} } } } },
      },
      '/admin/exports/sales-journal': {
        get: { tags: ['Exports'], summary: 'Journal des ventes CSV', parameters: [{ name: 'start', in: 'query', schema: { type: 'string' } }, { name: 'end', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'CSV', content: { 'text/csv': {} } } } },
      },
      '/admin/exports/commissions': {
        get: { tags: ['Exports'], summary: 'Commissions CSV', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'CSV', content: { 'text/csv': {} } } } },
      },
      '/admin/exports/stock': {
        get: { tags: ['Exports'], summary: 'Stock CSV', responses: { 200: { description: 'CSV', content: { 'text/csv': {} } } } },
      },
      '/admin/exports/delivery-notes': {
        get: { tags: ['Exports'], summary: 'BL PDF', parameters: [{ name: 'start', in: 'query', schema: { type: 'string' } }, { name: 'end', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'PDF', content: { 'application/pdf': {} } } } },
      },
      '/admin/exports/activity-report': {
        get: { tags: ['Exports'], summary: 'Rapport activite PDF', parameters: [{ name: 'start', in: 'query', schema: { type: 'string' } }, { name: 'end', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'PDF', content: { 'application/pdf': {} } } } },
      },

      // ─── Finance ──────────────────────────────────
      '/admin/margins': {
        get: { tags: ['Finance'], summary: 'Analyse marges globale', responses: { 200: { description: 'global, byProduct, bySegment' } } },
      },
      '/admin/margins/by-campaign': {
        get: { tags: ['Finance'], summary: 'Marges par campagne', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Marges campagne' } } },
      },

      // ─── Users ────────────────────────────────────
      '/admin/users': {
        get: { tags: ['Users'], summary: 'Liste utilisateurs', parameters: [{ name: 'role', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'search', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Users pagines' } } },
        post: { tags: ['Users'], summary: 'Creer utilisateur', responses: { 201: { description: 'User cree' }, 409: { description: 'Email existe' } } },
      },
      '/admin/users/{id}': {
        put: { tags: ['Users'], summary: 'Modifier utilisateur', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'User modifie' } } },
      },
      '/admin/users/{id}/toggle-status': {
        post: { tags: ['Users'], summary: 'Activer/desactiver utilisateur', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Status bascule' } } },
      },
      '/admin/users/import-csv': {
        post: { tags: ['Users'], summary: 'Import CSV utilisateurs', responses: { 201: { description: 'Resultats import (created, skipped, errors)' } } },
      },

      // ─── Invitations ──────────────────────────────
      '/admin/invitations': {
        get: { tags: ['Invitations'], summary: 'Liste invitations', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }, { name: 'used', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Invitations' } } },
        post: { tags: ['Invitations'], summary: 'Creer invitation(s)', responses: { 201: { description: 'Invitations creees avec codes' } } },
      },

      // ─── Analytics ────────────────────────────────
      '/admin/analytics': {
        get: { tags: ['Analytics'], summary: 'Analytics complet', parameters: [{ name: 'campaign_id', in: 'query', schema: { type: 'string' } }, { name: 'start', in: 'query', schema: { type: 'string' } }, { name: 'end', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'tauxConversion, caParPeriode, topVendeurs, topProduits, comparaisonCampagnes' } } },
      },

      // ─── Audit ────────────────────────────────────
      '/admin/audit-log': {
        get: { tags: ['Audit'], summary: 'Journal d\'audit', parameters: [{ name: 'entity', in: 'query', schema: { type: 'string' } }, { name: 'action', in: 'query', schema: { type: 'string' } }, { name: 'user_id', in: 'query', schema: { type: 'string' } }, { name: 'start', in: 'query', schema: { type: 'string' } }, { name: 'end', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Entries paginées avec before/after diff' } } },
      },
      '/admin/audit-log/entities': {
        get: { tags: ['Audit'], summary: 'Liste entites auditees', responses: { 200: { description: 'Liste distinct entities' } } },
      },

      // ─── Ambassador ───────────────────────────────
      '/ambassador/referral-click': {
        post: { tags: ['Ambassador'], summary: 'Tracker clic parrainage', security: [], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { user_id: { type: 'string' }, source: { type: 'string' } } } } } }, responses: { 200: { description: 'Tracked' } } },
      },
      '/ambassador/referral-stats': {
        get: { tags: ['Ambassador'], summary: 'Stats parrainages', responses: { 200: { description: 'Stats par source' } } },
      },

      // ─── Formation ────────────────────────────────
      '/formation/modules': {
        get: { tags: ['Formation'], summary: 'Liste modules formation BTS', responses: { 200: { description: 'Modules avec progression' } } },
      },
      '/formation/modules/{id}/progress': {
        put: { tags: ['Formation'], summary: 'Mettre a jour progression module', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Progression mise a jour' } } },
      },

      // ─── Stripe ───────────────────────────────────
      '/payments/create-intent': {
        post: { tags: ['Stripe'], summary: 'Creer PaymentIntent Stripe', responses: { 200: { description: 'clientSecret' } } },
      },
      '/webhooks/stripe': {
        post: { tags: ['Stripe'], summary: 'Webhook Stripe (raw body)', security: [], responses: { 200: { description: 'received: true' } } },
      },

      // ─── Public API ──────────────────────────────
      '/public/catalog': {
        get: {
          tags: ['Public'],
          summary: 'Catalogue produits public (filtrable, pagine)',
          security: [],
          parameters: [
            { name: 'color', in: 'query', schema: { type: 'string', enum: ['rouge', 'blanc', 'rosé', 'effervescent', 'sans_alcool'] } },
            { name: 'region', in: 'query', schema: { type: 'string' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'label', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Recherche par nom (ILIKE)' },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } },
          ],
          responses: { 200: { description: 'Produits + pagination (data, pagination: {page, limit, total, pages})' } },
        },
      },
      '/public/catalog/{id}': {
        get: {
          tags: ['Public'],
          summary: 'Fiche produit publique complete',
          security: [],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Produit complet avec tasting_notes, awards, etc.' }, 404: { description: 'Produit non trouve ou inactif' } },
        },
      },
      '/public/filters': {
        get: {
          tags: ['Public'],
          summary: 'Filtres disponibles (couleurs, regions, categories, labels)',
          security: [],
          responses: { 200: { description: '{colors, regions, categories, labels}' } },
        },
      },
      '/public/campaigns': {
        get: {
          tags: ['Public'],
          summary: 'Campagnes actives publiques',
          security: [],
          responses: { 200: { description: 'Liste campagnes actives avec org_name' } },
        },
      },
      '/public/campaigns/{id}/products': {
        get: {
          tags: ['Public'],
          summary: 'Produits d\'une campagne active',
          security: [],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Produits de la campagne' }, 404: { description: 'Campagne non trouvee ou inactive' } },
        },
      },

      // ─── Health ───────────────────────────────────
      '/health': {
        get: { tags: ['Health'], summary: 'Health check', security: [], responses: { 200: { description: 'status: ok' } } },
      },
    },
  },
  apis: [], // We define paths inline above
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
