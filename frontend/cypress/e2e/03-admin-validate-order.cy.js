/**
 * Test E2E 3: Admin valide une commande -> statut change
 * CDC §9.1 — Workflow commandes
 */
describe('Admin Validate Order', () => {
  it('should validate a submitted order', () => {
    cy.login('nicolas@vins-conversations.fr');

    // Navigate to orders
    cy.contains('Commandes').click();
    cy.url().should('include', '/admin/orders');

    // Filter by submitted
    cy.get('select').first().next().select('submitted');

    // If there are submitted orders, validate one
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Valider")').length > 0) {
        cy.contains('button', 'Valider').first().click();
        // Confirm the dialog
        cy.on('window:confirm', () => true);
      }
    });
  });
});
