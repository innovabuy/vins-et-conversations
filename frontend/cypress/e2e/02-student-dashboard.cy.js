/**
 * Test E2E 2: Login étudiant -> dashboard mobile affiché
 * CDC §9.1 — Vérification parcours étudiant
 */
describe('Student Dashboard', () => {
  it('should login as student and see the mobile dashboard', () => {
    // Set mobile viewport
    cy.viewport(390, 844);

    cy.login('ackavong@eleve.sc.fr');

    // Should redirect to /student
    cy.url().should('include', '/student');

    // Dashboard should display key elements
    cy.contains('Bonjour').should('be.visible');
    cy.contains('Mon CA').should('be.visible');
    cy.contains('Bouteilles').should('be.visible');
    cy.contains('Classement').should('be.visible');
  });
});
