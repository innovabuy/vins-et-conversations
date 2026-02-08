export default function CGVPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Conditions Générales de Vente</h1>

      <div className="prose prose-sm text-gray-600 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Article 1 — Objet</h2>
        <p>Les présentes conditions générales de vente régissent les ventes de vins effectuées par Vins & Conversations (Nicolas Froment) via le site internet.</p>

        <h2 className="text-lg font-semibold text-gray-900">Article 2 — Prix</h2>
        <p>Les prix sont indiqués en euros TTC. Ils sont susceptibles d'être modifiés à tout moment, les produits étant facturés au prix en vigueur au moment de la commande.</p>

        <h2 className="text-lg font-semibold text-gray-900">Article 3 — Commande</h2>
        <p>La commande est validée après confirmation du paiement. Un email de confirmation est envoyé à l'adresse fournie.</p>

        <h2 className="text-lg font-semibold text-gray-900">Article 4 — Paiement</h2>
        <p>Le paiement s'effectue par carte bancaire via Stripe, plateforme sécurisée de paiement en ligne.</p>

        <h2 className="text-lg font-semibold text-gray-900">Article 5 — Livraison</h2>
        <p>La livraison est effectuée à l'adresse indiquée lors de la commande. Les délais de livraison sont communiqués à titre indicatif.</p>

        <h2 className="text-lg font-semibold text-gray-900">Article 6 — Droit de rétractation</h2>
        <p>Conformément au Code de la consommation, le client dispose d'un délai de 14 jours à compter de la réception des produits pour exercer son droit de rétractation.</p>

        <h2 className="text-lg font-semibold text-gray-900">Article 7 — Alcool</h2>
        <p>La vente d'alcool est interdite aux mineurs. En passant commande, le client certifie être majeur. L'abus d'alcool est dangereux pour la santé, à consommer avec modération.</p>
      </div>
    </div>
  );
}
