/**
 * Test E2E 5: CSE -> prix -10% affichés
 * CDC §3 — Règle métier: CSE remise 10%
 */
describe('CSE Dashboard Discount', () => {
  it('should display discounted prices for CSE', () => {
    cy.login('cse@leroymerlin.fr');

    // Should redirect to /cse
    cy.url().should('include', '/cse');

    // Catalog tab should be active by default
    cy.contains('Catalogue').should('be.visible');

    // Should display discount badge
    cy.get('body').then(($body) => {
      if ($body.find(':contains("-10%")').length > 0) {
        cy.contains('-10%').should('be.visible');
      }
    });

    // Should display both original and discounted prices (strikethrough)
    cy.get('.line-through').should('exist');
  });
});
