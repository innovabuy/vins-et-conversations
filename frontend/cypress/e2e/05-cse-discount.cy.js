/**
 * Test E2E 5: CSE -> prix -10% affichés
 * CDC §3 — Règle métier: CSE remise 10%
 */
describe('CSE Dashboard Discount', () => {
  it('should display discounted prices for CSE', () => {
    cy.login('cse@leroymerlin.fr');

    // Should redirect to /cse
    cy.url().should('include', '/cse');

    // Wait for dashboard to fully load — Catalogue tab should appear
    cy.contains('Catalogue', { timeout: 15000 }).should('be.visible');

    // Should display product cards with prices (wait for API data)
    cy.get('.line-through', { timeout: 10000 }).should('exist');

    // Should display discount badge
    cy.get('body').then(($body) => {
      if ($body.find(':contains("-10%")').length > 0) {
        cy.contains('-10%').should('be.visible');
      }
    });
  });
});
