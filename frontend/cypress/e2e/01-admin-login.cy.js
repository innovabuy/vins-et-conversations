/**
 * Test E2E 1: Login admin -> cockpit affiché
 * CDC §9.1 — Vérification parcours admin
 */
describe('Admin Login', () => {
  it('should login as admin and see the cockpit', () => {
    cy.login('nicolas@vins-conversations.fr');

    // Should redirect to /admin
    cy.url().should('include', '/admin');

    // Cockpit should display key elements
    cy.contains('Cockpit').should('be.visible');
    cy.contains('CA TTC').should('be.visible');
  });
});
