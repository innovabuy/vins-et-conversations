export default function MentionsLegalesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mentions Légales</h1>

      <div className="prose prose-sm text-gray-600 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Éditeur du site</h2>
        <p>
          Vins & Conversations<br />
          Nicolas Froment<br />
          Angers, France<br />
          Email : nicolas@vins-conversations.fr
        </p>

        <h2 className="text-lg font-semibold text-gray-900">Hébergement</h2>
        <p>Le site est hébergé par des prestataires professionnels assurant la sécurité et la disponibilité des services.</p>

        <h2 className="text-lg font-semibold text-gray-900">Propriété intellectuelle</h2>
        <p>L'ensemble du contenu du site (textes, images, logos) est la propriété exclusive de Vins & Conversations. Toute reproduction est interdite sans autorisation préalable.</p>

        <h2 className="text-lg font-semibold text-gray-900">Protection des données personnelles</h2>
        <p>Conformément au RGPD, les données personnelles collectées lors de la commande sont traitées uniquement pour la gestion de votre commande et ne sont pas transmises à des tiers.</p>
        <p>Vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Pour exercer ces droits, contactez-nous à nicolas@vins-conversations.fr.</p>

        <h2 className="text-lg font-semibold text-gray-900">Cookies</h2>
        <p>Le site utilise des cookies techniques nécessaires à son fonctionnement (session de panier). Aucun cookie de tracking n'est utilisé.</p>
      </div>
    </div>
  );
}
