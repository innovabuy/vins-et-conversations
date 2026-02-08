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

    // Dashboard should display greeting
    cy.contains('Bonjour', { timeout: 10000 }).should('be.visible');

    // Bottom nav tabs should be visible
    cy.contains('Accueil', { timeout: 10000 }).should('be.visible');
    cy.contains('Commander').should('be.visible');
    cy.contains('Classement').should('be.visible');
  });
});
