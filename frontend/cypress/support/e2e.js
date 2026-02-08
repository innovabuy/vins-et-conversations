// Cypress support file for Vins & Conversations E2E tests

Cypress.Commands.add('login', (email, password = 'VinsConv2026!') => {
  cy.visit('/login');
  cy.get('input[type="email"]').type(email);
  cy.get('input[type="password"]').type(password);
  cy.get('button[type="submit"]').click();
});
