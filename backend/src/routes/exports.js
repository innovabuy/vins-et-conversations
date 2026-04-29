const express = require('express');
const { stringify } = require('csv-stringify/sync');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAppBranding } = require('../utils/appBranding');
const { addCapNumerikFooter } = require('../utils/pdfFooter');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS — Pivot export
// ═══════════════════════════════════════════════════════════════════

/**
 * Construit la structure de données pivot à partir des rows SQL
 */
function buildPivotData(rows, includeGratuite = false) {
  const studentsMap = new Map();
  const productsMap = new Map();
  const cells = new Map();

  for (const row of rows) {
    if (!studentsMap.has(row.user_id)) {
      studentsMap.set(row.user_id, { id: row.user_id, name: row.etudiant, email: row.email });
    }
    if (!productsMap.has(row.product_id)) {
      productsMap.set(row.product_id, { id: row.product_id, name: row.produit, price_ttc: parseFloat(row.price_ttc), price_ht: parseFloat(row.price_ht) });
    }

    const cellKey = `${row.user_id}__${row.product_id}`;
    const qty = parseInt(row.qty_vendue) || 0;
    const qtyGratuite = parseInt(row.qty_gratuite) || 0;
    const effectiveQty = includeGratuite ? qty + qtyGratuite : qty;

    cells.set(cellKey, {
      qty: effectiveQty,
      qty_commerciale: qty,
      qty_gratuite: qtyGratuite,
      montant_ttc: parseFloat(row.montant_ttc) || 0,
      montant_ht: parseFloat(row.montant_ht) || 0,
    });
  }

  const students = Array.from(studentsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const products = Array.from(productsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const totalsByStudent = new Map();
  for (const s of students) {
    let totalQty = 0, totalTtc = 0, totalHt = 0;
    for (const p of products) {
      const cell = cells.get(`${s.id}__${p.id}`);
      if (cell) { totalQty += cell.qty; totalTtc += cell.montant_ttc; totalHt += cell.montant_ht; }
    }
    totalsByStudent.set(s.id, { total_qty: totalQty, total_ttc: totalTtc, total_ht: totalHt });
  }

  const totalsByProduct = new Map();
  for (const p of products) {
    let totalQty = 0, totalTtc = 0, totalHt = 0;
    for (const s of students) {
      const cell = cells.get(`${s.id}__${p.id}`);
      if (cell) { totalQty += cell.qty; totalTtc += cell.montant_ttc; totalHt += cell.montant_ht; }
    }
    totalsByProduct.set(p.id, { total_qty: totalQty, total_ttc: totalTtc, total_ht: totalHt });
  }

  const grandTotal = { qty: 0, ttc: 0, ht: 0 };
  for (const [, t] of totalsByStudent) {
    grandTotal.qty += t.total_qty; grandTotal.ttc += t.total_ttc; grandTotal.ht += t.total_ht;
  }

  return { students, products, cells, totalsByStudent, totalsByProduct, grandTotal };
}

/** Onglet Quantités vendues */
function buildQuantiteSheet(workbook, pivotData, campaign) {
  const { students, products, cells, totalsByStudent, totalsByProduct, grandTotal } = pivotData;
  const sheet = workbook.addWorksheet('Quantités vendues');

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };
  const gratuiteFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5E3C' } };
  const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4B5' } };
  const grandTotalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };
  const boldWhite = { bold: true, color: { argb: 'FFFFFFFF' } };
  const bold = { bold: true };
  const border = { style: 'thin', color: { argb: 'FFD0D0D0' } };
  const allBorders = { top: border, left: border, bottom: border, right: border };

  // Each product occupies 2 columns: Qty + Offertes, then 2 total columns at the end
  const totalCols = 1 + products.length * 2 + 2;

  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Récapitulatif des ventes — ${campaign.name} — Quantités vendues`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF722F37' } };
  titleCell.alignment = { horizontal: 'center' };

  sheet.mergeCells(2, 1, 2, totalCols);
  sheet.getCell(2, 1).value = `Export généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  sheet.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };
  sheet.getCell(2, 1).alignment = { horizontal: 'center' };
  sheet.addRow([]);

  const headerRow = sheet.getRow(4);
  headerRow.getCell(1).value = 'Étudiant';
  headerRow.getCell(1).fill = headerFill;
  headerRow.getCell(1).font = boldWhite;
  headerRow.getCell(1).border = allBorders;

  for (let i = 0; i < products.length; i++) {
    const colQty = 2 + i * 2;
    const colGrat = colQty + 1;

    const cellQty = headerRow.getCell(colQty);
    cellQty.value = products[i].name;
    cellQty.fill = headerFill;
    cellQty.font = boldWhite;
    cellQty.alignment = { horizontal: 'center', wrapText: true };
    cellQty.border = allBorders;

    const cellGrat = headerRow.getCell(colGrat);
    cellGrat.value = 'Offertes (12+1)';
    cellGrat.fill = gratuiteFill;
    cellGrat.font = boldWhite;
    cellGrat.alignment = { horizontal: 'center', wrapText: true };
    cellGrat.border = allBorders;
  }

  const totalQtyCol = 2 + products.length * 2;
  const totalGratCol = totalQtyCol + 1;

  const totalHeaderCell = headerRow.getCell(totalQtyCol);
  totalHeaderCell.value = 'TOTAL Btl';
  totalHeaderCell.fill = totalFill;
  totalHeaderCell.font = bold;
  totalHeaderCell.alignment = { horizontal: 'center' };
  totalHeaderCell.border = allBorders;

  const totalGratHeaderCell = headerRow.getCell(totalGratCol);
  totalGratHeaderCell.value = 'Total Offertes';
  totalGratHeaderCell.fill = totalFill;
  totalGratHeaderCell.font = bold;
  totalGratHeaderCell.alignment = { horizontal: 'center' };
  totalGratHeaderCell.border = allBorders;

  headerRow.height = 45;
  headerRow.commit();

  let dataRowIndex = 5;
  for (const student of students) {
    const row = sheet.getRow(dataRowIndex);
    row.getCell(1).value = student.name;
    row.getCell(1).border = allBorders;

    let totalGratuite = 0;
    for (let i = 0; i < products.length; i++) {
      const cell = cells.get(`${student.id}__${products[i].id}`);
      const colQty = 2 + i * 2;
      const colGrat = colQty + 1;

      const qtyCell = row.getCell(colQty);
      qtyCell.value = cell ? cell.qty : 0;
      qtyCell.alignment = { horizontal: 'center' };
      qtyCell.border = allBorders;
      if (cell && cell.qty > 0) {
        qtyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        qtyCell.font = { bold: true, color: { argb: 'FF2E7D32' } };
      }

      const gratCell = row.getCell(colGrat);
      const qg = cell ? cell.qty_gratuite : 0;
      gratCell.value = qg;
      gratCell.alignment = { horizontal: 'center' };
      gratCell.border = allBorders;
      if (qg > 0) {
        gratCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
        gratCell.font = { bold: true, color: { argb: 'FFE65100' } };
      }
      totalGratuite += qg;
    }

    const studentTotal = totalsByStudent.get(student.id);
    const totalCell = row.getCell(totalQtyCol);
    totalCell.value = studentTotal ? studentTotal.total_qty : 0;
    totalCell.fill = totalFill;
    totalCell.font = bold;
    totalCell.alignment = { horizontal: 'center' };
    totalCell.border = allBorders;

    const totalGratCell = row.getCell(totalGratCol);
    totalGratCell.value = totalGratuite;
    totalGratCell.fill = totalFill;
    totalGratCell.font = bold;
    totalGratCell.alignment = { horizontal: 'center' };
    totalGratCell.border = allBorders;

    row.commit();
    dataRowIndex++;
  }

  const totalRow = sheet.getRow(dataRowIndex);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).fill = grandTotalFill;
  totalRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  totalRow.getCell(1).border = allBorders;

  let grandTotalGratuite = 0;
  for (let i = 0; i < products.length; i++) {
    const productTotal = totalsByProduct.get(products[i].id);
    const colQty = 2 + i * 2;
    const colGrat = colQty + 1;

    const cell = totalRow.getCell(colQty);
    cell.value = productTotal ? productTotal.total_qty : 0;
    cell.fill = grandTotalFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = allBorders;

    // Sum gratuite for this product across all students
    let prodGratuite = 0;
    for (const s of students) {
      const c = cells.get(`${s.id}__${products[i].id}`);
      if (c) prodGratuite += c.qty_gratuite;
    }
    const gratCell = totalRow.getCell(colGrat);
    gratCell.value = prodGratuite;
    gratCell.fill = grandTotalFill;
    gratCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    gratCell.alignment = { horizontal: 'center' };
    gratCell.border = allBorders;
    grandTotalGratuite += prodGratuite;
  }

  const grandTotalCell = totalRow.getCell(totalQtyCol);
  grandTotalCell.value = grandTotal.qty;
  grandTotalCell.fill = grandTotalFill;
  grandTotalCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  grandTotalCell.alignment = { horizontal: 'center' };
  grandTotalCell.border = allBorders;

  const grandTotalGratCell = totalRow.getCell(totalGratCol);
  grandTotalGratCell.value = grandTotalGratuite;
  grandTotalGratCell.fill = grandTotalFill;
  grandTotalGratCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  grandTotalGratCell.alignment = { horizontal: 'center' };
  grandTotalGratCell.border = allBorders;

  totalRow.commit();

  sheet.getColumn(1).width = 25;
  for (let i = 0; i < products.length; i++) {
    sheet.getColumn(2 + i * 2).width = Math.max(12, (products[i]?.name?.length || 10) * 0.8);
    sheet.getColumn(3 + i * 2).width = 14;
  }
  sheet.getColumn(totalQtyCol).width = 14;
  sheet.getColumn(totalGratCol).width = 14;
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
}

/** Onglet Montants (TTC ou HT) */
function buildMontantSheet(workbook, pivotData, campaign, type) {
  const { students, products, cells, totalsByStudent, totalsByProduct, grandTotal } = pivotData;
  const isTtc = type === 'ttc';
  const sheet = workbook.addWorksheet(isTtc ? 'Montants TTC' : 'Montants HT');

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
  const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4B5' } };
  const grandTotalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };
  const boldWhite = { bold: true, color: { argb: 'FFFFFFFF' } };
  const bold = { bold: true };
  const border = { style: 'thin', color: { argb: 'FFD0D0D0' } };
  const allBorders = { top: border, left: border, bottom: border, right: border };
  const euroFmt = '#,##0.00 "€"';

  sheet.mergeCells(1, 1, 1, products.length + 2);
  sheet.getCell(1, 1).value = `Récapitulatif des ventes — ${campaign.name} — Montants ${isTtc ? 'TTC' : 'HT'}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(1, 1).alignment = { horizontal: 'center' };

  sheet.mergeCells(2, 1, 2, products.length + 2);
  sheet.getCell(2, 1).value = `Export généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  sheet.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };
  sheet.getCell(2, 1).alignment = { horizontal: 'center' };
  sheet.addRow([]);

  const headerRow = sheet.getRow(4);
  headerRow.getCell(1).value = 'Étudiant';
  headerRow.getCell(1).fill = headerFill;
  headerRow.getCell(1).font = boldWhite;
  headerRow.getCell(1).border = allBorders;

  for (let i = 0; i < products.length; i++) {
    const cell = headerRow.getCell(i + 2);
    cell.value = products[i].name;
    cell.fill = headerFill;
    cell.font = boldWhite;
    cell.alignment = { horizontal: 'center', wrapText: true };
    cell.border = allBorders;
  }

  const totalHeaderCell = headerRow.getCell(products.length + 2);
  totalHeaderCell.value = `TOTAL ${isTtc ? 'TTC' : 'HT'}`;
  totalHeaderCell.fill = totalFill;
  totalHeaderCell.font = bold;
  totalHeaderCell.alignment = { horizontal: 'center' };
  totalHeaderCell.border = allBorders;
  headerRow.height = 45;
  headerRow.commit();

  let dataRowIndex = 5;
  for (const student of students) {
    const row = sheet.getRow(dataRowIndex);
    row.getCell(1).value = student.name;
    row.getCell(1).border = allBorders;

    for (let i = 0; i < products.length; i++) {
      const cellData = cells.get(`${student.id}__${products[i].id}`);
      const excelCell = row.getCell(i + 2);
      const val = cellData ? (isTtc ? cellData.montant_ttc : cellData.montant_ht) : 0;
      excelCell.value = val;
      excelCell.numFmt = euroFmt;
      excelCell.alignment = { horizontal: 'right' };
      excelCell.border = allBorders;
      if (val > 0) {
        excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E5F5' } };
        excelCell.font = { bold: true, color: { argb: 'FF6A1B9A' } };
      }
    }

    const studentTotal = totalsByStudent.get(student.id);
    const totalExcelCell = row.getCell(products.length + 2);
    totalExcelCell.value = studentTotal ? (isTtc ? studentTotal.total_ttc : studentTotal.total_ht) : 0;
    totalExcelCell.numFmt = euroFmt;
    totalExcelCell.fill = totalFill;
    totalExcelCell.font = bold;
    totalExcelCell.alignment = { horizontal: 'right' };
    totalExcelCell.border = allBorders;
    row.commit();
    dataRowIndex++;
  }

  const totalRow = sheet.getRow(dataRowIndex);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).fill = grandTotalFill;
  totalRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  totalRow.getCell(1).border = allBorders;

  for (let i = 0; i < products.length; i++) {
    const productTotal = totalsByProduct.get(products[i].id);
    const cell = totalRow.getCell(i + 2);
    cell.value = productTotal ? (isTtc ? productTotal.total_ttc : productTotal.total_ht) : 0;
    cell.numFmt = euroFmt;
    cell.fill = grandTotalFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'right' };
    cell.border = allBorders;
  }

  const gtCell = totalRow.getCell(products.length + 2);
  gtCell.value = isTtc ? grandTotal.ttc : grandTotal.ht;
  gtCell.numFmt = euroFmt;
  gtCell.fill = grandTotalFill;
  gtCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  gtCell.alignment = { horizontal: 'right' };
  gtCell.border = allBorders;
  totalRow.commit();

  sheet.getColumn(1).width = 25;
  for (let i = 2; i <= products.length + 1; i++) {
    sheet.getColumn(i).width = Math.max(14, (products[i - 2]?.name?.length || 10) * 0.9);
  }
  sheet.getColumn(products.length + 2).width = 16;
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
}

/** Onglet Récap par étudiant */
function buildRecapEtudiantSheet(workbook, pivotData, campaign) {
  const { students, totalsByStudent } = pivotData;
  const sheet = workbook.addWorksheet('Récap par étudiant');

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };
  const boldWhite = { bold: true, color: { argb: 'FFFFFFFF' } };
  const border = { style: 'thin', color: { argb: 'FFD0D0D0' } };
  const allBorders = { top: border, left: border, bottom: border, right: border };
  const euroFmt = '#,##0.00 "€"';

  sheet.mergeCells(1, 1, 1, 5);
  sheet.getCell(1, 1).value = `Récap par étudiant — ${campaign.name}`;
  sheet.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF722F37' } };
  sheet.getCell(1, 1).alignment = { horizontal: 'center' };
  sheet.addRow([]);

  const headers = ['Rang', 'Étudiant', 'Bouteilles vendues', 'CA TTC', 'CA HT'];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = boldWhite;
    cell.border = allBorders;
    cell.alignment = { horizontal: 'center' };
  });

  const sorted = [...students].sort((a, b) => {
    const ta = totalsByStudent.get(a.id)?.total_ttc || 0;
    const tb = totalsByStudent.get(b.id)?.total_ttc || 0;
    return tb - ta;
  });

  sorted.forEach((student, index) => {
    const total = totalsByStudent.get(student.id) || { total_qty: 0, total_ttc: 0, total_ht: 0 };
    const row = sheet.addRow([index + 1, student.name, total.total_qty, total.total_ttc, total.total_ht]);

    row.getCell(3).numFmt = '0';
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).numFmt = euroFmt;
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).numFmt = euroFmt;
    row.getCell(5).alignment = { horizontal: 'right' };

    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F3EE' } };
      });
    }
    row.eachCell((cell) => { cell.border = allBorders; });
  });

  const grandTotals = { qty: 0, ttc: 0, ht: 0 };
  for (const [, t] of totalsByStudent) {
    grandTotals.qty += t.total_qty; grandTotals.ttc += t.total_ttc; grandTotals.ht += t.total_ht;
  }
  const totalRow = sheet.addRow(['', 'TOTAL CAMPAGNE', grandTotals.qty, grandTotals.ttc, grandTotals.ht]);
  totalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = allBorders;
  });
  totalRow.getCell(3).numFmt = '0';
  totalRow.getCell(3).alignment = { horizontal: 'center' };
  totalRow.getCell(4).numFmt = euroFmt;
  totalRow.getCell(4).alignment = { horizontal: 'right' };
  totalRow.getCell(5).numFmt = euroFmt;
  totalRow.getCell(5).alignment = { horizontal: 'right' };

  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 16;
}

/** Onglet Récap par produit */
function buildRecapProduitSheet(workbook, pivotData, campaign) {
  const { products, totalsByProduct, grandTotal } = pivotData;
  const sheet = workbook.addWorksheet('Récap par produit');

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
  const boldWhite = { bold: true, color: { argb: 'FFFFFFFF' } };
  const border = { style: 'thin', color: { argb: 'FFD0D0D0' } };
  const allBorders = { top: border, left: border, bottom: border, right: border };
  const euroFmt = '#,##0.00 "€"';

  sheet.mergeCells(1, 1, 1, 6);
  sheet.getCell(1, 1).value = `Récap par produit — ${campaign.name}`;
  sheet.getCell(1, 1).font = { bold: true, size: 13 };
  sheet.getCell(1, 1).alignment = { horizontal: 'center' };
  sheet.addRow([]);

  const headerRow = sheet.addRow(['Produit', 'Prix TTC', 'Prix HT', 'Bouteilles vendues', 'CA TTC', 'CA HT']);
  headerRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = boldWhite;
    cell.border = allBorders;
    cell.alignment = { horizontal: 'center' };
  });

  const sorted = [...products].sort((a, b) => {
    const ta = totalsByProduct.get(a.id)?.total_ttc || 0;
    const tb = totalsByProduct.get(b.id)?.total_ttc || 0;
    return tb - ta;
  });

  sorted.forEach((product, index) => {
    const total = totalsByProduct.get(product.id) || { total_qty: 0, total_ttc: 0, total_ht: 0 };
    const row = sheet.addRow([product.name, product.price_ttc, product.price_ht, total.total_qty, total.total_ttc, total.total_ht]);

    row.getCell(2).numFmt = euroFmt;
    row.getCell(3).numFmt = euroFmt;
    row.getCell(4).numFmt = '0';
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).numFmt = euroFmt;
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).numFmt = euroFmt;
    row.getCell(6).alignment = { horizontal: 'right' };

    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
      });
    }
    row.eachCell((cell) => { cell.border = allBorders; });
  });

  const totalRow = sheet.addRow(['TOTAL', '', '', grandTotal.qty, grandTotal.ttc, grandTotal.ht]);
  totalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = allBorders;
  });
  totalRow.getCell(4).numFmt = '0';
  totalRow.getCell(4).alignment = { horizontal: 'center' };
  totalRow.getCell(5).numFmt = euroFmt;
  totalRow.getCell(5).alignment = { horizontal: 'right' };
  totalRow.getCell(6).numFmt = euroFmt;
  totalRow.getCell(6).alignment = { horizontal: 'right' };

  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 16;
}

/** Export CSV détail (une ligne par étudiant × produit) */
function buildCsvPivot(pivotData) {
  const { students, products, cells, totalsByStudent } = pivotData;
  const lines = [];

  lines.push(['Étudiant', 'Produit', 'Quantité commandée', 'Bouteilles offertes (12+1)', 'Total TTC', 'Total HT'].join(';'));

  for (const student of students) {
    for (const product of products) {
      const cell = cells.get(`${student.id}__${product.id}`);
      if (!cell || cell.qty_commerciale === 0) continue;
      lines.push([
        student.name,
        product.name,
        cell.qty_commerciale,
        cell.qty_gratuite,
        cell.montant_ttc.toFixed(2),
        cell.montant_ht.toFixed(2),
      ].join(';'));
    }
    // Sous-total étudiant
    const total = totalsByStudent.get(student.id);
    if (total) {
      const totalGratuite = products.reduce((sum, p) => {
        const c = cells.get(`${student.id}__${p.id}`);
        return sum + (c ? c.qty_gratuite : 0);
      }, 0);
      lines.push([
        `${student.name} — TOTAL`,
        '',
        total.total_qty,
        totalGratuite,
        total.total_ttc.toFixed(2),
        total.total_ht.toFixed(2),
      ].join(';'));
    }
  }

  return lines.join('\r\n');
}

// ═══════════════════════════════════════════════════════════════════
// CAMPAIGN PIVOT — broader role access (before global middleware)
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/exports/campaign-pivot
 * Export tableau croisé étudiants × produits pour une campagne
 * Query params: campaign_id (requis), format: xlsx|csv, include_free: true|false
 */
router.get('/campaign-pivot', authenticate, requireRole('super_admin', 'admin', 'comptable', 'commercial'), async (req, res) => {
  try {
    const { campaign_id, format = 'xlsx', include_free = 'false' } = req.query;

    if (!campaign_id) {
      return res.status(400).json({ error: true, code: 'MISSING_CAMPAIGN_ID', message: 'campaign_id requis' });
    }

    const campaign = await db('campaigns').where('id', campaign_id).first();
    if (!campaign) {
      return res.status(404).json({ error: true, code: 'CAMPAIGN_NOT_FOUND', message: 'Campagne introuvable' });
    }

    // A2 (LEFT JOIN): commandes user_id NULL référées attribuées au parrain (referred_by).
    // effective_student_id = COALESCE(user_id, referred_by). Pattern aligné sur commit ee9458b.
    const rows = await db('order_items as oi')
      .join('orders as o', 'o.id', 'oi.order_id')
      .join('products as p', 'p.id', 'oi.product_id')
      .leftJoin('users as u', 'u.id', 'o.user_id')
      .leftJoin('users as ru', 'ru.id', 'o.referred_by')
      .where('o.campaign_id', campaign_id)
      .whereNotIn('o.status', ['cancelled', 'draft'])
      .where('oi.type', 'product')
      .whereRaw('COALESCE(o.user_id, o.referred_by) IS NOT NULL')
      .select(
        db.raw('COALESCE(o.user_id, o.referred_by) as user_id'),
        db.raw('COALESCE(u.name, ru.name) as etudiant'),
        db.raw('COALESCE(u.email, ru.email) as email'),
        'p.id as product_id',
        'p.name as produit',
        'p.price_ttc',
        'p.price_ht',
        db.raw('SUM(oi.qty) as qty_vendue'),
        db.raw('SUM(oi.qty * oi.unit_price_ttc) as montant_ttc'),
        db.raw('SUM(oi.qty * oi.unit_price_ht) as montant_ht')
      )
      .groupByRaw("COALESCE(o.user_id, o.referred_by), COALESCE(u.name, ru.name), COALESCE(u.email, ru.email), p.id, p.name, p.price_ttc, p.price_ht")
      .orderBy(['etudiant', 'produit']);

    if (rows.length === 0) {
      return res.status(404).json({ error: true, code: 'NO_DATA', message: 'Aucune commande pour cette campagne' });
    }

    // Build free bottle map from financial_events (source of truth, append-only)
    const freeBottleRows = await db('financial_events')
      .where({ campaign_id, type: 'free_bottle' })
      .select(
        db.raw("metadata->>'user_id' as user_id"),
        db.raw("metadata->>'product_id' as product_id"),
        db.raw('COUNT(*) as qty_gratuite')
      )
      .groupByRaw("metadata->>'user_id', metadata->>'product_id'");
    const freeBottleMap = new Map();
    for (const fb of freeBottleRows) {
      freeBottleMap.set(`${fb.user_id}__${fb.product_id}`, parseInt(fb.qty_gratuite, 10));
    }

    // Inject qty_gratuite from financial_events into rows
    for (const row of rows) {
      row.qty_gratuite = freeBottleMap.get(`${row.user_id}__${row.product_id}`) || 0;
    }

    const pivotData = buildPivotData(rows, include_free === 'true');

    if (format === 'csv') {
      const csv = buildCsvPivot(pivotData);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="recap-campagne-${campaign_id}-${Date.now()}.csv"`);
      return res.send('\uFEFF' + csv);
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vins & Conversations';
    workbook.created = new Date();

    buildQuantiteSheet(workbook, pivotData, campaign);
    buildMontantSheet(workbook, pivotData, campaign, 'ttc');
    buildMontantSheet(workbook, pivotData, campaign, 'ht');
    buildRecapEtudiantSheet(workbook, pivotData, campaign);
    buildRecapProduitSheet(workbook, pivotData, campaign);

    const safeName = campaign.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="recap-${safeName}-${Date.now()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exports/campaign-pivot]', err);
    res.status(500).json({ error: true, code: 'EXPORT_FAILED', message: err.message });
  }
});

// Expose buildPivotData for unit testing
router.buildPivotData = buildPivotData;

// ═══════════════════════════════════════════════════════════════════
// PARTICIPANT HISTORY — broader role access (before global middleware)
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/exports/participant-history
 * Export historique des commandes par participant pour une campagne
 * Query params: campaign_id (requis), user_id (optionnel)
 */
router.get('/participant-history', authenticate, requireRole('super_admin', 'admin', 'comptable', 'commercial'), async (req, res) => {
  try {
    const { campaign_id, user_id } = req.query;

    if (!campaign_id) {
      return res.status(400).json({ error: true, code: 'MISSING_CAMPAIGN_ID', message: 'campaign_id requis' });
    }

    const campaign = await db('campaigns').where('id', campaign_id).first();
    if (!campaign) {
      return res.status(404).json({ error: true, code: 'CAMPAIGN_NOT_FOUND', message: 'Campagne introuvable' });
    }

    // --- Fetch order lines with joins ---
    let query = db('order_items as oi')
      .join('orders as o', 'o.id', 'oi.order_id')
      .join('products as p', 'p.id', 'oi.product_id')
      .leftJoin('users as u', 'u.id', 'o.user_id')
      .leftJoin('contacts as c', 'c.id', 'o.customer_id')
      .where('o.campaign_id', campaign_id)
      .whereNotIn('o.status', ['cancelled', 'draft'])
      .where('oi.type', 'product')
      .select(
        'o.created_at',
        'o.ref',
        'o.status',
        'o.user_id',
        db.raw("COALESCE(u.name, 'Boutique Web') as vendeur"),
        'u.email as vendeur_email',
        db.raw("COALESCE(c.name, '') as client"),
        'p.name as produit',
        'oi.qty',
        'oi.unit_price_ttc',
        'oi.unit_price_ht'
      )
      .orderBy([{ column: 'vendeur' }, { column: 'o.created_at' }]);

    if (user_id) {
      query = query.where('o.user_id', user_id);
    }

    const rows = await query;

    if (rows.length === 0) {
      return res.status(404).json({ error: true, code: 'NO_DATA', message: 'Aucune commande pour cette campagne' });
    }

    // --- Build workbook ---
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vins & Conversations';
    workbook.created = new Date();

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };
    const boldWhite = { bold: true, color: { argb: 'FFFFFFFF' } };
    const border = { style: 'thin', color: { argb: 'FFD0D0D0' } };
    const allBorders = { top: border, left: border, bottom: border, right: border };
    const euroFmt = '#,##0.00 "€"';

    // ──────────────────────────────────────────────────
    // Sheet 1 — Historique
    // ──────────────────────────────────────────────────
    const sheetHist = workbook.addWorksheet('Historique');

    // Title rows
    sheetHist.mergeCells(1, 1, 1, 9);
    const titleCell = sheetHist.getCell(1, 1);
    titleCell.value = `Historique des commandes — ${campaign.name}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF722F37' } };
    titleCell.alignment = { horizontal: 'center' };

    sheetHist.mergeCells(2, 1, 2, 9);
    sheetHist.getCell(2, 1).value = `Export généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    sheetHist.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };
    sheetHist.getCell(2, 1).alignment = { horizontal: 'center' };
    sheetHist.addRow([]);

    // Header row (row 4)
    const histHeaders = ['Date', 'Réf commande', 'Vendeur', 'Client', 'Produit', 'Qté', 'PU TTC', 'Total TTC', 'Statut'];
    const histHeaderRow = sheetHist.getRow(4);
    histHeaders.forEach((h, i) => {
      const cell = histHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = boldWhite;
      cell.border = allBorders;
      cell.alignment = { horizontal: 'center', wrapText: true };
    });
    histHeaderRow.height = 30;
    histHeaderRow.commit();

    // Status labels in French
    const statusLabels = {
      pending: 'En attente',
      validated: 'Validée',
      preparing: 'En préparation',
      shipped: 'Expédiée',
      delivered: 'Livrée',
    };

    // Data rows
    let histRowIdx = 5;
    for (const row of rows) {
      const dataRow = sheetHist.getRow(histRowIdx);
      dataRow.getCell(1).value = new Date(row.created_at).toLocaleDateString('fr-FR');
      dataRow.getCell(2).value = row.ref;
      dataRow.getCell(3).value = row.vendeur;
      dataRow.getCell(4).value = row.client;
      dataRow.getCell(5).value = row.produit;
      dataRow.getCell(6).value = row.qty;
      dataRow.getCell(6).alignment = { horizontal: 'center' };
      dataRow.getCell(7).value = parseFloat(row.unit_price_ttc);
      dataRow.getCell(7).numFmt = euroFmt;
      dataRow.getCell(7).alignment = { horizontal: 'right' };
      dataRow.getCell(8).value = parseFloat((row.qty * parseFloat(row.unit_price_ttc)).toFixed(2));
      dataRow.getCell(8).numFmt = euroFmt;
      dataRow.getCell(8).alignment = { horizontal: 'right' };
      dataRow.getCell(9).value = statusLabels[row.status] || row.status;

      // Zebra striping
      if ((histRowIdx - 5) % 2 === 0) {
        for (let c = 1; c <= 9; c++) {
          dataRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F3EE' } };
        }
      }
      for (let c = 1; c <= 9; c++) {
        dataRow.getCell(c).border = allBorders;
      }
      dataRow.commit();
      histRowIdx++;
    }

    // Footer credit
    histRowIdx++;
    sheetHist.mergeCells(histRowIdx, 1, histRowIdx, 9);
    const footerCell1 = sheetHist.getCell(histRowIdx, 1);
    footerCell1.value = 'Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr';
    footerCell1.font = { italic: true, size: 8, color: { argb: 'FFC0C0C0' } };
    footerCell1.alignment = { horizontal: 'center' };

    // Column widths
    sheetHist.getColumn(1).width = 14;
    sheetHist.getColumn(2).width = 18;
    sheetHist.getColumn(3).width = 24;
    sheetHist.getColumn(4).width = 24;
    sheetHist.getColumn(5).width = 28;
    sheetHist.getColumn(6).width = 8;
    sheetHist.getColumn(7).width = 14;
    sheetHist.getColumn(8).width = 14;
    sheetHist.getColumn(9).width = 16;
    sheetHist.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

    // ──────────────────────────────────────────────────
    // Sheet 2 — Récap par participant
    // ──────────────────────────────────────────────────
    const sheetRecap = workbook.addWorksheet('Récap par participant');

    // Title rows
    sheetRecap.mergeCells(1, 1, 1, 6);
    const recapTitle = sheetRecap.getCell(1, 1);
    recapTitle.value = `Récap par participant — ${campaign.name}`;
    recapTitle.font = { bold: true, size: 14, color: { argb: 'FF722F37' } };
    recapTitle.alignment = { horizontal: 'center' };

    sheetRecap.mergeCells(2, 1, 2, 6);
    sheetRecap.getCell(2, 1).value = `Export généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    sheetRecap.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };
    sheetRecap.getCell(2, 1).alignment = { horizontal: 'center' };
    sheetRecap.addRow([]);

    // Header row (row 4)
    const recapHeaders = ['Participant', 'Email', 'Nb commandes', 'Bouteilles vendues', 'CA TTC', 'CA HT'];
    const recapHeaderRow = sheetRecap.getRow(4);
    recapHeaders.forEach((h, i) => {
      const cell = recapHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = boldWhite;
      cell.border = allBorders;
      cell.alignment = { horizontal: 'center', wrapText: true };
    });
    recapHeaderRow.height = 30;
    recapHeaderRow.commit();

    // Aggregate per participant
    const participantMap = new Map();
    for (const row of rows) {
      const key = row.user_id || '__boutique__';
      if (!participantMap.has(key)) {
        participantMap.set(key, {
          name: row.vendeur,
          email: row.vendeur_email || '',
          orderRefs: new Set(),
          totalQty: 0,
          totalTTC: 0,
          totalHT: 0,
        });
      }
      const p = participantMap.get(key);
      p.orderRefs.add(row.ref);
      p.totalQty += row.qty;
      p.totalTTC += row.qty * parseFloat(row.unit_price_ttc);
      p.totalHT += row.qty * parseFloat(row.unit_price_ht);
    }

    // Sort by CA TTC descending
    const participants = Array.from(participantMap.values()).sort((a, b) => b.totalTTC - a.totalTTC);

    let recapRowIdx = 5;
    let grandQty = 0, grandTTC = 0, grandHT = 0, grandOrders = 0;

    for (const p of participants) {
      const dataRow = sheetRecap.getRow(recapRowIdx);
      const nbOrders = p.orderRefs.size;

      dataRow.getCell(1).value = p.name;
      dataRow.getCell(2).value = p.email;
      dataRow.getCell(3).value = nbOrders;
      dataRow.getCell(3).alignment = { horizontal: 'center' };
      dataRow.getCell(4).value = p.totalQty;
      dataRow.getCell(4).alignment = { horizontal: 'center' };
      dataRow.getCell(5).value = parseFloat(p.totalTTC.toFixed(2));
      dataRow.getCell(5).numFmt = euroFmt;
      dataRow.getCell(5).alignment = { horizontal: 'right' };
      dataRow.getCell(6).value = parseFloat(p.totalHT.toFixed(2));
      dataRow.getCell(6).numFmt = euroFmt;
      dataRow.getCell(6).alignment = { horizontal: 'right' };

      // Zebra striping
      if ((recapRowIdx - 5) % 2 === 0) {
        for (let c = 1; c <= 6; c++) {
          dataRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F3EE' } };
        }
      }
      for (let c = 1; c <= 6; c++) {
        dataRow.getCell(c).border = allBorders;
      }
      dataRow.commit();

      grandOrders += nbOrders;
      grandQty += p.totalQty;
      grandTTC += p.totalTTC;
      grandHT += p.totalHT;
      recapRowIdx++;
    }

    // Grand total row
    const grandTotalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };
    const grandRow = sheetRecap.getRow(recapRowIdx);
    grandRow.getCell(1).value = 'TOTAL';
    grandRow.getCell(2).value = '';
    grandRow.getCell(3).value = grandOrders;
    grandRow.getCell(3).alignment = { horizontal: 'center' };
    grandRow.getCell(4).value = grandQty;
    grandRow.getCell(4).alignment = { horizontal: 'center' };
    grandRow.getCell(5).value = parseFloat(grandTTC.toFixed(2));
    grandRow.getCell(5).numFmt = euroFmt;
    grandRow.getCell(5).alignment = { horizontal: 'right' };
    grandRow.getCell(6).value = parseFloat(grandHT.toFixed(2));
    grandRow.getCell(6).numFmt = euroFmt;
    grandRow.getCell(6).alignment = { horizontal: 'right' };
    for (let c = 1; c <= 6; c++) {
      grandRow.getCell(c).fill = grandTotalFill;
      grandRow.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      grandRow.getCell(c).border = allBorders;
    }
    grandRow.commit();

    // Footer credit
    recapRowIdx += 2;
    sheetRecap.mergeCells(recapRowIdx, 1, recapRowIdx, 6);
    const footerCell2 = sheetRecap.getCell(recapRowIdx, 1);
    footerCell2.value = 'Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr';
    footerCell2.font = { italic: true, size: 8, color: { argb: 'FFC0C0C0' } };
    footerCell2.alignment = { horizontal: 'center' };

    // Column widths
    sheetRecap.getColumn(1).width = 28;
    sheetRecap.getColumn(2).width = 30;
    sheetRecap.getColumn(3).width = 16;
    sheetRecap.getColumn(4).width = 20;
    sheetRecap.getColumn(5).width = 16;
    sheetRecap.getColumn(6).width = 16;
    sheetRecap.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

    // --- Send response ---
    const safeName = campaign.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="historique-participants-${safeName}-${Date.now()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exports/participant-history]', err);
    res.status(500).json({ error: true, code: 'EXPORT_FAILED', message: err.message });
  }
});

// All other exports require auth + super_admin/comptable
router.use(authenticate, requireRole('super_admin', 'comptable'));

// 1. GET /api/v1/admin/exports/pennylane?start&end — Pennylane CSV
router.get('/pennylane', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .select('orders.ref', 'orders.created_at', 'orders.total_ht', 'orders.total_ttc',
        db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as client"));

    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const orders = await query.orderBy('orders.created_at');

    const rows = [];
    for (const order of orders) {
      const date = new Date(order.created_at).toLocaleDateString('fr-FR');
      const ht = parseFloat(order.total_ht).toFixed(2);
      const ttc = parseFloat(order.total_ttc).toFixed(2);
      const tva = (parseFloat(order.total_ttc) - parseFloat(order.total_ht)).toFixed(2);

      // Debit: 411 Client
      rows.push({ journal: 'VE', date, piece: order.ref, compte: '411000', libelle: order.client, debit: ttc, credit: '' });
      // Credit: 707 Ventes
      rows.push({ journal: 'VE', date, piece: order.ref, compte: '707000', libelle: `Vente ${order.ref}`, debit: '', credit: ht });
      // Credit: 44571 TVA collectée
      rows.push({ journal: 'VE', date, piece: order.ref, compte: '445710', libelle: `TVA ${order.ref}`, debit: '', credit: tva });
    }

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['journal', 'date', 'piece', 'compte', 'libelle', 'debit', 'credit'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=pennylane-export.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 2. GET /api/v1/admin/exports/sales-journal?start&end — Sales journal CSV
router.get('/sales-journal', async (req, res) => {
  try {
    const { start, end } = req.query;
    // Use component lines for coffret TVA ventilation, product lines for non-coffrets
    // Exclude product lines that have component children (to avoid double counting)
    let query = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .whereIn('order_items.type', ['product', 'component'])
      .where(function () {
        // Include: component lines OR product lines without children
        this.where('order_items.type', 'component')
          .orWhere(function () {
            this.where('order_items.type', 'product')
              .whereNotExists(function () {
                this.select(db.raw('1')).from('order_items as child')
                  .whereRaw('child.parent_item_id = order_items.id')
                  .where('child.type', 'component');
              });
          });
      })
      .select(
        'orders.ref', 'orders.created_at',
        db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as client"),
        'order_items.qty', 'order_items.unit_price_ht', 'order_items.unit_price_ttc',
        'order_items.vat_rate'
      );

    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const items = await query.orderBy('orders.created_at');

    // Aggregate by order
    const orderMap = {};
    for (const item of items) {
      const key = item.ref;
      if (!orderMap[key]) {
        orderMap[key] = {
          date: new Date(item.created_at).toLocaleDateString('fr-FR'),
          ref: item.ref,
          client: item.client,
          ht: 0, tva20: 0, tva55: 0, ttc: 0,
        };
      }
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      const rate = parseFloat(item.vat_rate);
      const lineTVA = parseFloat((lineHT * rate / 100).toFixed(2));
      orderMap[key].ht += lineHT;
      if (rate === 5.5) {
        orderMap[key].tva55 += lineTVA;
      } else {
        orderMap[key].tva20 += lineTVA;
      }
      orderMap[key].ttc += lineHT + lineTVA;
    }

    const rows = Object.values(orderMap).map((o) => ({
      date: o.date,
      ref: o.ref,
      client: o.client,
      total_ht: o.ht.toFixed(2),
      tva_20: o.tva20.toFixed(2),
      tva_55: o.tva55.toFixed(2),
      total_ttc: o.ttc.toFixed(2),
    }));

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['date', 'ref', 'client', 'total_ht', 'tva_20', 'tva_55', 'total_ttc'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=journal-ventes.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 3. GET /api/v1/admin/exports/commissions?campaign_id&format — Commissions PDF (default) or CSV
router.get('/commissions', async (req, res) => {
  try {
    const { campaign_id, format } = req.query;

    let query = db('orders')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .groupBy('campaigns.id', 'campaigns.name', 'client_types.commission_rules', 'campaigns.config')
      .select(
        'campaigns.id',
        'campaigns.name',
        'client_types.commission_rules',
        'campaigns.config as campaign_config',
        db.raw('SUM(orders.total_ht) as ca_ht')
      );

    if (campaign_id) query = query.where('campaigns.id', campaign_id);

    const campaigns = await query;

    const rows = campaigns.map((c) => {
      const caHT = parseFloat(c.ca_ht);
      const rules = typeof c.commission_rules === 'string' ? JSON.parse(c.commission_rules) : (c.commission_rules || {});
      const campConfig = typeof c.campaign_config === 'string' ? JSON.parse(c.campaign_config) : (c.campaign_config || {});

      // Resolve collective rate: campaign override > fund_collective > association > 0
      const collectivePct = campConfig.fund_collective_pct ?? rules.fund_collective?.value ?? rules.association?.value ?? 0;
      const individualPct = campConfig.fund_individual_pct ?? rules.fund_individual?.value ?? 0;

      return {
        campaign: c.name,
        ca_ht: caHT.toFixed(2),
        taux_collectif: collectivePct,
        commission_collective: (caHT * collectivePct / 100).toFixed(2),
        taux_individuel: individualPct,
        commission_individuelle: (caHT * individualPct / 100).toFixed(2),
      };
    });

    // ── CSV format ──
    if (format === 'csv') {
      const csvRows = rows.map((r) => ({
        ...r,
        taux_collectif: `${r.taux_collectif}%`,
        taux_individuel: `${r.taux_individuel}%`,
      }));

      const csv = '\uFEFF' + stringify(csvRows, {
        header: true,
        columns: ['campaign', 'ca_ht', 'taux_collectif', 'commission_collective', 'taux_individuel', 'commission_individuelle'],
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=commissions.csv');
      return res.send(csv);
    }

    // ── PDF format (default) ──
    const branding = await getAppBranding();
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=commissions.pdf');
    doc.pipe(res);

    // Title
    doc.fontSize(20).text('Rapport des Commissions', { align: 'center' });
    doc.fontSize(10).text(`${branding.app_name} — Export du ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    doc.moveDown(2);

    // Table header
    const tableLeft = 50;
    const colWidths = [140, 65, 55, 75, 55, 75];  // campaign, ca_ht, taux_c, comm_c, taux_i, comm_i
    const colHeaders = ['Campagne', 'CA HT', 'Taux coll.', 'Comm. coll.', 'Taux ind.', 'Comm. ind.'];

    let cursorY = doc.y;
    doc.font('Helvetica-Bold').fontSize(8);

    // Draw header background
    doc.rect(tableLeft, cursorY, colWidths.reduce((a, b) => a + b, 0), 18).fill('#722F37');
    doc.fillColor('#FFFFFF');
    let xPos = tableLeft;
    for (let i = 0; i < colHeaders.length; i++) {
      doc.text(colHeaders[i], xPos + 4, cursorY + 4, { width: colWidths[i] - 8, align: i === 0 ? 'left' : 'right' });
      xPos += colWidths[i];
    }
    cursorY += 18;

    // Table rows
    doc.font('Helvetica').fontSize(8).fillColor('#000000');
    let grandTotalCaHT = 0;
    let grandTotalCommColl = 0;
    let grandTotalCommInd = 0;

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      grandTotalCaHT += parseFloat(r.ca_ht);
      grandTotalCommColl += parseFloat(r.commission_collective);
      grandTotalCommInd += parseFloat(r.commission_individuelle);

      // Alternate row background
      if (idx % 2 === 0) {
        doc.rect(tableLeft, cursorY, colWidths.reduce((a, b) => a + b, 0), 16).fill('#F9F3EE');
        doc.fillColor('#000000');
      }

      xPos = tableLeft;
      const values = [
        r.campaign,
        `${r.ca_ht} EUR`,
        `${r.taux_collectif}%`,
        `${r.commission_collective} EUR`,
        `${r.taux_individuel}%`,
        `${r.commission_individuelle} EUR`,
      ];
      for (let i = 0; i < values.length; i++) {
        doc.text(values[i], xPos + 4, cursorY + 3, { width: colWidths[i] - 8, align: i === 0 ? 'left' : 'right' });
        xPos += colWidths[i];
      }
      cursorY += 16;

      // Page break if near bottom
      if (cursorY > 720) {
        doc.addPage();
        cursorY = 50;
      }
    }

    // Grand totals row
    doc.rect(tableLeft, cursorY, colWidths.reduce((a, b) => a + b, 0), 18).fill('#CD7F32');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    xPos = tableLeft;
    const totals = [
      'TOTAL',
      `${grandTotalCaHT.toFixed(2)} EUR`,
      '',
      `${grandTotalCommColl.toFixed(2)} EUR`,
      '',
      `${grandTotalCommInd.toFixed(2)} EUR`,
    ];
    for (let i = 0; i < totals.length; i++) {
      doc.text(totals[i], xPos + 4, cursorY + 4, { width: colWidths[i] - 8, align: i === 0 ? 'left' : 'right' });
      xPos += colWidths[i];
    }

    // Footer credit
    doc.fillColor('#c0c0c0').fontSize(6).text('Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr', 50, 780, { align: 'center', width: 495 });
    addCapNumerikFooter(doc);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 4. GET /api/v1/admin/exports/stock — Stock CSV
router.get('/stock', async (req, res) => {
  try {
    const stockData = await db.raw(`
      SELECT p.name as product, p.purchase_price,
        COALESCE(pc.name, 'Sans catégorie') as category,
        COALESCE(pc.product_type, 'other') as product_type,
        COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as qty
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.active = true
      GROUP BY p.id, p.name, p.purchase_price, pc.name, pc.product_type
      ORDER BY pc.name, p.name
    `);

    const rows = stockData.rows.map((r) => ({
      category: r.category,
      product: r.product,
      type: r.product_type,
      qty: r.qty,
      purchase_price: parseFloat(r.purchase_price).toFixed(2),
      valorization: (r.qty * parseFloat(r.purchase_price)).toFixed(2),
    }));

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['category', 'product', 'type', 'qty', 'purchase_price', 'valorization'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=stock.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 5. GET /api/v1/admin/exports/delivery-notes?start&end — Delivery notes PDF
router.get('/delivery-notes', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = db('delivery_notes')
      .join('orders', 'delivery_notes.order_id', 'orders.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .select(
        'delivery_notes.*', 'orders.ref as order_ref',
        'orders.total_ttc',
        db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as user_name")
      );

    if (start) query = query.where('delivery_notes.created_at', '>=', start);
    if (end) query = query.where('delivery_notes.created_at', '<=', end);

    const notes = await query.orderBy('delivery_notes.created_at', 'desc');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=bons-livraison.pdf');
    doc.pipe(res);

    const brandingBL = await getAppBranding();
    doc.fontSize(18).text('Bons de Livraison', { align: 'center' });
    doc.fontSize(10).text(`${brandingBL.app_name} — Export du ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    doc.moveDown();

    for (const note of notes) {
      doc.fontSize(11).font('Helvetica-Bold').text(`${note.ref} — Commande ${note.order_ref}`);
      doc.font('Helvetica').fontSize(9);
      doc.text(`Client: ${note.user_name}`);
      doc.text(`Destinataire: ${note.recipient_name || '-'}`);
      doc.text(`Adresse: ${note.delivery_address || '-'}`);
      doc.text(`Statut: ${note.status}`);
      doc.text(`Date prévue: ${note.planned_date ? new Date(note.planned_date).toLocaleDateString('fr-FR') : '-'}`);
      doc.text(`Montant: ${parseFloat(note.total_ttc).toFixed(2)} EUR`);
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      if (doc.y > 700) doc.addPage();
    }

    if (notes.length === 0) {
      doc.fontSize(12).text('Aucun bon de livraison pour la période sélectionnée.', { align: 'center' });
    }

    doc.fillColor('#c0c0c0').fontSize(6).text('Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr', 50, 780, { align: 'center', width: 495 });
    addCapNumerikFooter(doc);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 6. GET /api/v1/admin/exports/activity-report?start&end — Activity report PDF
router.get('/activity-report', async (req, res) => {
  try {
    const { start, end } = req.query;
    let orderQuery = db('orders')
      .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered']);

    if (start) orderQuery = orderQuery.where('created_at', '>=', start);
    if (end) orderQuery = orderQuery.where('created_at', '<=', end);

    const stats = await orderQuery.clone()
      .sum('total_ht as ca_ht')
      .sum('total_ttc as ca_ttc')
      .count('id as total_orders')
      .first();

    const caHT = parseFloat(stats?.ca_ht || 0);
    const caTTC = parseFloat(stats?.ca_ttc || 0);
    const totalOrders = parseInt(stats?.total_orders || 0, 10);

    // Margin (parameterized query — no SQL injection)
    let marginQuery = db('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .join('orders as o', 'oi.order_id', 'o.id')
      .whereIn('o.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('oi.type', 'product');
    if (start) marginQuery = marginQuery.where('o.created_at', '>=', start);
    if (end) marginQuery = marginQuery.where('o.created_at', '<=', end);

    const marginResult = await marginQuery
      .select(db.raw('COALESCE(SUM(oi.qty * (oi.unit_price_ht - p.purchase_price)), 0) as marge_brute'));
    const margeBrute = parseFloat(marginResult[0]?.marge_brute || 0);

    // Free bottle cost deduction — source of truth: financial_events
    let freeBottleQuery = db('financial_events')
      .where('type', 'free_bottle');
    if (start) freeBottleQuery = freeBottleQuery.where('created_at', '>=', start);
    if (end) freeBottleQuery = freeBottleQuery.where('created_at', '<=', end);

    const freeBottleResult = await freeBottleQuery.select(
      db.raw('COALESCE(SUM(amount), 0) as free_bottle_cost')
    );
    const freeBottleCost = parseFloat(freeBottleResult[0]?.free_bottle_cost || 0);

    // Commission totale
    let commQuery = db('orders')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered']);
    if (start) commQuery = commQuery.where('orders.created_at', '>=', start);
    if (end) commQuery = commQuery.where('orders.created_at', '<=', end);

    const commResult = await commQuery.select(
      db.raw(`COALESCE(SUM(
        orders.total_ht * COALESCE(
          (campaigns.config->>'fund_collective_pct')::numeric,
          (client_types.commission_rules->'fund_collective'->>'value')::numeric,
          (client_types.commission_rules->'association'->>'value')::numeric,
          0
        ) / 100
      ), 0) as commission`)
    );
    const commission = parseFloat(commResult[0]?.commission || 0);
    const margeNette = margeBrute - freeBottleCost - commission;

    // Top products
    let topQuery = db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .join('orders', 'order_items.order_id', 'orders.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered']);
    if (start) topQuery = topQuery.where('orders.created_at', '>=', start);
    if (end) topQuery = topQuery.where('orders.created_at', '<=', end);

    const topProducts = await topQuery
      .groupBy('products.id', 'products.name')
      .select('products.name', db.raw('SUM(order_items.qty) as qty'), db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as revenue'))
      .orderBy('qty', 'desc')
      .limit(5);

    // Top sellers (includes referral CA via UNION ALL)
    const { studentOrdersCombinedSQL } = require('../services/dashboardService');
    const { sql: sellerSQL, params: sellerParams } = studentOrdersCombinedSQL(null);
    let dateFilter = '';
    const dateParams = [];
    if (start) { dateFilter += ' AND so.created_at >= ?'; dateParams.push(start); }
    if (end) { dateFilter += ' AND so.created_at <= ?'; dateParams.push(end); }
    const topSellersResult = await db.raw(`
      SELECT u.name, SUM(so.total_ttc) as ca, COUNT(so.id) as orders_count
      FROM ${sellerSQL} so
      JOIN users u ON so.effective_user_id = u.id
      WHERE 1=1${dateFilter}
      GROUP BY u.id, u.name ORDER BY ca DESC LIMIT 5
    `, [...sellerParams, ...dateParams]);
    const topSellers = topSellersResult.rows || topSellersResult;

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=rapport-activite.pdf');
    doc.pipe(res);

    const brandingAR = await getAppBranding();
    doc.fontSize(20).text('Rapport d\'Activité', { align: 'center' });
    doc.fontSize(10).text(`${brandingAR.app_name} — ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    if (start || end) {
      doc.text(`Période: ${start || '...'} — ${end || '...'}`, { align: 'center' });
    }
    doc.moveDown(2);

    // KPIs
    doc.fontSize(14).font('Helvetica-Bold').text('Indicateurs clés');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`CA TTC: ${caTTC.toFixed(2)} EUR`);
    doc.text(`CA HT: ${caHT.toFixed(2)} EUR`);
    doc.text(`Marge brute: ${margeBrute.toFixed(2)} EUR (${caHT > 0 ? ((margeBrute / caHT) * 100).toFixed(1) : 0}%)`);
    doc.text(`Coût gratuités: -${freeBottleCost.toFixed(2)} EUR`);
    doc.text(`Commission: -${commission.toFixed(2)} EUR`);
    doc.text(`Marge nette: ${margeNette.toFixed(2)} EUR (${caHT > 0 ? ((margeNette / caHT) * 100).toFixed(1) : 0}%)`);
    doc.text(`Commandes: ${totalOrders}`);
    doc.moveDown();

    // Top products
    doc.fontSize(14).font('Helvetica-Bold').text('Top Produits');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    for (const p of topProducts) {
      doc.text(`${p.name} — ${parseInt(p.qty, 10)} bouteilles — ${parseFloat(p.revenue).toFixed(2)} EUR`);
    }
    doc.moveDown();

    // Top sellers
    doc.fontSize(14).font('Helvetica-Bold').text('Top Vendeurs');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    for (const s of topSellers) {
      doc.text(`${s.name} — ${parseFloat(s.ca).toFixed(2)} EUR — ${parseInt(s.orders_count, 10)} commandes`);
    }

    doc.fillColor('#c0c0c0').fontSize(6).text('Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr', 50, 780, { align: 'center', width: 495 });
    addCapNumerikFooter(doc);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 7. GET /api/v1/admin/exports/campaign-sales?campaign_id — Ventes par campagne CSV
router.get('/campaign-sales', async (req, res) => {
  try {
    const { campaign_id, start, end } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'MISSING_CAMPAIGN_ID' });

    let query = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .leftJoin('product_categories as pc', 'products.category_id', 'pc.id')
      .where('orders.campaign_id', campaign_id)
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('order_items.type', 'product');
    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const items = await query.select(
      db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as vendeur"),
      'products.name as produit',
      'pc.name as categorie',
      'order_items.qty',
      'order_items.unit_price_ht',
      'order_items.unit_price_ttc',
      'products.purchase_price',
      'orders.ref',
      'orders.created_at'
    ).orderBy('orders.created_at');

    const rows = items.map((i) => ({
      date: new Date(i.created_at).toLocaleDateString('fr-FR'),
      ref: i.ref,
      vendeur: i.vendeur,
      categorie: i.categorie || '',
      produit: i.produit,
      qty: i.qty,
      prix_ht: parseFloat(i.unit_price_ht).toFixed(2),
      prix_ttc: parseFloat(i.unit_price_ttc).toFixed(2),
      ca_ht: (parseFloat(i.unit_price_ht) * i.qty).toFixed(2),
      ca_ttc: (parseFloat(i.unit_price_ttc) * i.qty).toFixed(2),
      cout: (parseFloat(i.purchase_price) * i.qty).toFixed(2),
      marge: ((parseFloat(i.unit_price_ht) - parseFloat(i.purchase_price)) * i.qty).toFixed(2),
    }));

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['date', 'ref', 'vendeur', 'categorie', 'produit', 'qty', 'prix_ht', 'prix_ttc', 'ca_ht', 'ca_ttc', 'cout', 'marge'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ventes-campagne.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 8. GET /api/v1/admin/exports/seller-detail?campaign_id — Excel par vendeur avec détail références
router.get('/seller-detail', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { campaign_id, start, end } = req.query;

    let query = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('order_items.type', 'product');
    if (campaign_id) query = query.where('orders.campaign_id', campaign_id);
    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const items = await query.select(
      db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as vendeur"),
      'users.email as vendeur_email',
      'products.name as produit',
      'products.id as product_id',
      'order_items.qty',
      'order_items.unit_price_ht',
      'order_items.unit_price_ttc',
      'products.purchase_price',
      'orders.ref',
      'orders.created_at'
    ).orderBy([{ column: 'vendeur' }, { column: 'orders.created_at' }]);

    // Group by seller
    const sellers = {};
    for (const item of items) {
      const key = item.vendeur;
      if (!sellers[key]) sellers[key] = { email: item.vendeur_email || '', items: [] };
      sellers[key].items.push(item);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vins & Conversations';

    // Summary sheet
    const summary = workbook.addWorksheet('Récapitulatif');
    summary.columns = [
      { header: 'Vendeur', key: 'vendeur', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Commandes', key: 'orders', width: 12 },
      { header: 'Bouteilles', key: 'qty', width: 12 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'CA TTC', key: 'ca_ttc', width: 14 },
      { header: 'Marge', key: 'marge', width: 14 },
    ];
    summary.getRow(1).font = { bold: true };

    for (const [name, data] of Object.entries(sellers)) {
      const uniqueOrders = new Set(data.items.map(i => i.ref)).size;
      const totalQty = data.items.reduce((s, i) => s + i.qty, 0);
      const totalHT = data.items.reduce((s, i) => s + parseFloat(i.unit_price_ht) * i.qty, 0);
      const totalTTC = data.items.reduce((s, i) => s + parseFloat(i.unit_price_ttc) * i.qty, 0);
      const totalMarge = data.items.reduce((s, i) => s + (parseFloat(i.unit_price_ht) - parseFloat(i.purchase_price)) * i.qty, 0);
      summary.addRow({
        vendeur: name, email: data.email, orders: uniqueOrders,
        qty: totalQty, ca_ht: parseFloat(totalHT.toFixed(2)),
        ca_ttc: parseFloat(totalTTC.toFixed(2)), marge: parseFloat(totalMarge.toFixed(2)),
      });
    }

    // Detail sheet
    const detail = workbook.addWorksheet('Détail');
    detail.columns = [
      { header: 'Vendeur', key: 'vendeur', width: 25 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Ref', key: 'ref', width: 15 },
      { header: 'Produit', key: 'produit', width: 30 },
      { header: 'Qté', key: 'qty', width: 8 },
      { header: 'PU HT', key: 'pu_ht', width: 12 },
      { header: 'PU TTC', key: 'pu_ttc', width: 12 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'Marge', key: 'marge', width: 14 },
    ];
    detail.getRow(1).font = { bold: true };

    for (const item of items) {
      detail.addRow({
        vendeur: item.vendeur,
        date: new Date(item.created_at).toLocaleDateString('fr-FR'),
        ref: item.ref,
        produit: item.produit,
        qty: item.qty,
        pu_ht: parseFloat(parseFloat(item.unit_price_ht).toFixed(2)),
        pu_ttc: parseFloat(parseFloat(item.unit_price_ttc).toFixed(2)),
        ca_ht: parseFloat((parseFloat(item.unit_price_ht) * item.qty).toFixed(2)),
        marge: parseFloat(((parseFloat(item.unit_price_ht) - parseFloat(item.purchase_price)) * item.qty).toFixed(2)),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=detail-vendeurs.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 9. GET /api/v1/admin/exports/sales-by-contact?start&end&type — Ventes par contact Excel
router.get('/sales-by-contact', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { start, end, type } = req.query;

    let query = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('contacts', 'orders.customer_id', 'contacts.id')
      .leftJoin('product_categories as pc', 'products.category_id', 'pc.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('order_items.type', 'product');

    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);
    if (type) query = query.where('contacts.type', type);

    const items = await query.select(
      'contacts.name as contact_name',
      'contacts.email as contact_email',
      'contacts.type as contact_type',
      'contacts.phone as contact_phone',
      'contacts.address as contact_address',
      'products.name as produit',
      'pc.name as categorie',
      'order_items.qty',
      'order_items.unit_price_ht',
      'order_items.unit_price_ttc',
      'products.purchase_price',
      'orders.ref',
      'orders.created_at'
    ).orderBy([{ column: 'contacts.name' }, { column: 'orders.created_at' }]);

    // Group by contact
    const contacts = {};
    for (const item of items) {
      const key = item.contact_name + '||' + (item.contact_email || '');
      if (!contacts[key]) {
        contacts[key] = {
          name: item.contact_name,
          email: item.contact_email || '',
          type: item.contact_type || 'particulier',
          phone: item.contact_phone || '',
          address: item.contact_address || '',
          items: [],
        };
      }
      contacts[key].items.push(item);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vins & Conversations';

    // Summary sheet
    const summary = workbook.addWorksheet('Récapitulatif');
    summary.columns = [
      { header: 'Contact', key: 'contact', width: 25 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Téléphone', key: 'phone', width: 16 },
      { header: 'Adresse', key: 'address', width: 30 },
      { header: 'Commandes', key: 'orders', width: 12 },
      { header: 'Bouteilles', key: 'qty', width: 12 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'CA TTC', key: 'ca_ttc', width: 14 },
      { header: 'Marge', key: 'marge', width: 14 },
    ];
    summary.getRow(1).font = { bold: true };
    summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };
    summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    let grandTotalQty = 0, grandTotalHT = 0, grandTotalTTC = 0, grandTotalMarge = 0;

    for (const data of Object.values(contacts)) {
      const uniqueOrders = new Set(data.items.map(i => i.ref)).size;
      const totalQty = data.items.reduce((s, i) => s + i.qty, 0);
      const totalHT = data.items.reduce((s, i) => s + parseFloat(i.unit_price_ht) * i.qty, 0);
      const totalTTC = data.items.reduce((s, i) => s + parseFloat(i.unit_price_ttc) * i.qty, 0);
      const totalMarge = data.items.reduce((s, i) => s + (parseFloat(i.unit_price_ht) - parseFloat(i.purchase_price)) * i.qty, 0);

      summary.addRow({
        contact: data.name, email: data.email, type: data.type,
        phone: data.phone, address: data.address,
        orders: uniqueOrders, qty: totalQty,
        ca_ht: parseFloat(totalHT.toFixed(2)),
        ca_ttc: parseFloat(totalTTC.toFixed(2)),
        marge: parseFloat(totalMarge.toFixed(2)),
      });

      grandTotalQty += totalQty;
      grandTotalHT += totalHT;
      grandTotalTTC += totalTTC;
      grandTotalMarge += totalMarge;
    }

    // Total row
    const totalRow = summary.addRow({
      contact: 'TOTAL', orders: Object.values(contacts).reduce((s, c) => s + new Set(c.items.map(i => i.ref)).size, 0),
      qty: grandTotalQty, ca_ht: parseFloat(grandTotalHT.toFixed(2)),
      ca_ttc: parseFloat(grandTotalTTC.toFixed(2)), marge: parseFloat(grandTotalMarge.toFixed(2)),
    });
    totalRow.font = { bold: true };

    // Detail sheet
    const detail = workbook.addWorksheet('Détail');
    detail.columns = [
      { header: 'Contact', key: 'contact', width: 25 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Réf commande', key: 'ref', width: 15 },
      { header: 'Catégorie', key: 'categorie', width: 18 },
      { header: 'Produit', key: 'produit', width: 30 },
      { header: 'Qté', key: 'qty', width: 8 },
      { header: 'PU HT', key: 'pu_ht', width: 12 },
      { header: 'PU TTC', key: 'pu_ttc', width: 12 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'CA TTC', key: 'ca_ttc', width: 14 },
      { header: 'Marge', key: 'marge', width: 14 },
    ];
    detail.getRow(1).font = { bold: true };
    detail.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };
    detail.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const item of items) {
      detail.addRow({
        contact: item.contact_name,
        type: item.contact_type || 'particulier',
        date: new Date(item.created_at).toLocaleDateString('fr-FR'),
        ref: item.ref,
        categorie: item.categorie || '',
        produit: item.produit,
        qty: item.qty,
        pu_ht: parseFloat(parseFloat(item.unit_price_ht).toFixed(2)),
        pu_ttc: parseFloat(parseFloat(item.unit_price_ttc).toFixed(2)),
        ca_ht: parseFloat((parseFloat(item.unit_price_ht) * item.qty).toFixed(2)),
        ca_ttc: parseFloat((parseFloat(item.unit_price_ttc) * item.qty).toFixed(2)),
        marge: parseFloat(((parseFloat(item.unit_price_ht) - parseFloat(item.purchase_price)) * item.qty).toFixed(2)),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ventes-par-contact.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 10. GET /api/v1/admin/exports/ambassadors?start&end — Export ambassadeurs Excel
router.get('/ambassadors', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { start, end } = req.query;

    // 1. All ambassador users + region
    const ambassadors = await db('users')
      .leftJoin('regions', 'users.region_id', 'regions.id')
      .where('users.role', 'ambassadeur')
      .select(
        'users.id', 'users.name', 'users.email',
        'regions.name as region',
        'users.ambassador_bio as bio',
        'users.show_on_public_page'
      )
      .orderBy('users.name');

    if (!ambassadors.length) {
      return res.status(404).json({ error: 'NO_DATA', message: 'Aucun ambassadeur trouvé' });
    }

    const ambIds = ambassadors.map(a => a.id);

    // 2. Referral codes from participations
    const participations = await db('participations')
      .whereIn('user_id', ambIds)
      .whereNotNull('referral_code')
      .select('user_id', 'referral_code');
    const refCodeMap = {};
    for (const p of participations) {
      refCodeMap[p.user_id] = p.referral_code;
    }

    // 3. Referral clicks from audit_log
    const clicks = await db('audit_log')
      .where('entity', 'referral')
      .where('action', 'REFERRAL_CLICK')
      .whereIn('entity_id', ambIds)
      .select('entity_id')
      .count('* as cnt')
      .groupBy('entity_id');
    const clickMap = {};
    for (const c of clicks) {
      clickMap[c.entity_id] = parseInt(c.cnt);
    }

    // 4. Orders (own + referred) with items
    let ordersQuery = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('order_items.type', 'product')
      .where(function () {
        this.whereIn('orders.user_id', ambIds).orWhereIn('orders.referred_by', ambIds);
      });
    if (start) ordersQuery = ordersQuery.where('orders.created_at', '>=', start);
    if (end) ordersQuery = ordersQuery.where('orders.created_at', '<=', end);

    const items = await ordersQuery.select(
      'orders.user_id',
      'orders.referred_by',
      'orders.ref',
      'orders.created_at',
      'products.name as produit',
      'order_items.qty',
      'order_items.unit_price_ht',
      'order_items.unit_price_ttc',
      'products.purchase_price'
    ).orderBy([{ column: 'orders.created_at' }]);

    // 5. Aggregate per ambassador
    const ambStats = {};
    for (const a of ambassadors) {
      ambStats[a.id] = { orders: new Set(), qty: 0, ca_ht: 0, ca_ttc: 0, items: [] };
    }
    for (const item of items) {
      // Determine which ambassador gets credit
      const ownerId = ambIds.includes(item.user_id) ? item.user_id : null;
      const referrerId = item.referred_by && ambIds.includes(item.referred_by) ? item.referred_by : null;
      const targets = [];
      if (ownerId) targets.push({ id: ownerId, source: 'directe' });
      if (referrerId && referrerId !== ownerId) targets.push({ id: referrerId, source: 'référé' });

      const qty = item.qty;
      const caHt = parseFloat(item.unit_price_ht) * qty;
      const caTtc = parseFloat(item.unit_price_ttc) * qty;
      const marge = (parseFloat(item.unit_price_ht) - parseFloat(item.purchase_price)) * qty;

      for (const t of targets) {
        if (!ambStats[t.id]) continue;
        ambStats[t.id].orders.add(item.ref);
        ambStats[t.id].qty += qty;
        ambStats[t.id].ca_ht += caHt;
        ambStats[t.id].ca_ttc += caTtc;
        ambStats[t.id].items.push({
          ambassadeur: ambassadors.find(a => a.id === t.id)?.name || '',
          date: new Date(item.created_at).toLocaleDateString('fr-FR'),
          ref: item.ref,
          source: t.source,
          produit: item.produit,
          qty,
          pu_ht: parseFloat(parseFloat(item.unit_price_ht).toFixed(2)),
          pu_ttc: parseFloat(parseFloat(item.unit_price_ttc).toFixed(2)),
          ca_ht: parseFloat(caHt.toFixed(2)),
          marge: parseFloat(marge.toFixed(2)),
        });
      }
    }

    // 6. Tier calculation
    const rulesEngine = require('../services/rulesEngine');
    // Find ambassador campaign to get tier_rules
    const ambCampaign = await db('campaigns')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .where('client_types.name', 'like', '%ambassadeur%')
      .whereNull('campaigns.deleted_at')
      .select('campaigns.id', 'client_types.tier_rules')
      .first();

    let tierRules = null;
    if (ambCampaign?.tier_rules) {
      tierRules = typeof ambCampaign.tier_rules === 'string'
        ? JSON.parse(ambCampaign.tier_rules) : ambCampaign.tier_rules;
    }

    const tierMap = {};
    if (tierRules?.tiers?.length) {
      for (const a of ambassadors) {
        const tierResult = await rulesEngine.calculateTier(a.id, tierRules);
        tierMap[a.id] = tierResult;
      }
    }

    // 7. Build Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vins & Conversations';

    // Sheet 1: Récapitulatif
    const summary = workbook.addWorksheet('Récapitulatif');
    summary.columns = [
      { header: 'Nom', key: 'nom', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Région', key: 'region', width: 20 },
      { header: 'Bio', key: 'bio', width: 35 },
      { header: 'Visible page publique', key: 'visible', width: 18 },
      { header: 'Code referral', key: 'referral_code', width: 18 },
      { header: 'Clics referral', key: 'clics', width: 14 },
      { header: 'Nb commandes', key: 'nb_orders', width: 14 },
      { header: 'Nb bouteilles', key: 'nb_qty', width: 14 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'CA TTC', key: 'ca_ttc', width: 14 },
      { header: 'Palier actuel', key: 'tier', width: 15 },
      { header: 'Récompense', key: 'reward', width: 25 },
    ];
    summary.getRow(1).font = { bold: true };

    for (const a of ambassadors) {
      const stats = ambStats[a.id];
      const tier = tierMap[a.id];
      summary.addRow({
        nom: a.name,
        email: a.email,
        region: a.region || '',
        bio: a.bio || '',
        visible: a.show_on_public_page ? 'Oui' : 'Non',
        referral_code: refCodeMap[a.id] || '',
        clics: clickMap[a.id] || 0,
        nb_orders: stats.orders.size,
        nb_qty: stats.qty,
        ca_ht: parseFloat(stats.ca_ht.toFixed(2)),
        ca_ttc: parseFloat(stats.ca_ttc.toFixed(2)),
        tier: tier?.current?.label || 'Débutant',
        reward: tier?.current?.reward || '—',
      });
    }

    // Sheet 2: Détail ventes
    const detail = workbook.addWorksheet('Détail ventes');
    detail.columns = [
      { header: 'Ambassadeur', key: 'ambassadeur', width: 25 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Ref commande', key: 'ref', width: 18 },
      { header: 'Source', key: 'source', width: 12 },
      { header: 'Produit', key: 'produit', width: 30 },
      { header: 'Qté', key: 'qty', width: 8 },
      { header: 'PU HT', key: 'pu_ht', width: 12 },
      { header: 'PU TTC', key: 'pu_ttc', width: 12 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'Marge', key: 'marge', width: 14 },
    ];
    detail.getRow(1).font = { bold: true };

    for (const a of ambassadors) {
      for (const row of ambStats[a.id].items) {
        detail.addRow(row);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=export-ambassadeurs.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
