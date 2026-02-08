/**
 * Test E2E 4: Enseignant -> aucun montant EUR visible
 * CDC §3 — Règle métier: enseignant ne voit JAMAIS de montant en euros
 */
describe('Teacher Dashboard No Amounts', () => {
  it('should display no EUR amounts for teacher', () => {
    cy.login('enseignant@sacrecoeur.fr');

    // Should redirect to /teacher
    cy.url().should('include', '/teacher');

    // Dashboard should display
    cy.contains('Progression').should('be.visible');
    cy.contains('Classement').should('be.visible');

    // No EUR symbol or amounts should appear
    cy.get('body').invoke('text').then((text) => {
      // EUR should not appear in the main content (excluding hidden elements)
      const filtered = text.replace(/Espace Enseignant|V&C/g, '');
      expect(filtered).not.to.match(/\d+[.,]\d{2}\s*€/);
      expect(filtered).not.to.match(/\d+[.,]\d{2}\s*EUR/);
    });
  });
});
