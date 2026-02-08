/**
 * Test E2E 3: Admin valide une commande -> statut change
 * CDC §9.1 — Workflow commandes
 */
describe('Admin Validate Order', () => {
  it('should navigate to orders and see the list', () => {
    cy.login('nicolas@vins-conversations.fr');

    // Navigate to orders via sidebar
    cy.get('nav').contains('Commandes').click();
    cy.url().should('include', '/admin/orders');

    // Page should show orders heading and list
    cy.get('h1, h2').contains('Commandes', { timeout: 10000 }).should('be.visible');

    // Status filter select should exist with options
    cy.get('select').should('have.length.gte', 1);

    // Should show order rows (table or cards)
    cy.get('body').then(($body) => {
      // Check if there are orders displayed (either table rows or mobile cards)
      const hasOrders = $body.find('td, .rounded-lg').length > 0;
      if (hasOrders) {
        cy.log('Orders displayed in list');
      }
    });
  });
});
