/**
 * Add Cap-Numerik footer to all generated PDFs.
 * Call addCapNumerikFooter(doc) before doc.end().
 */
function addCapNumerikFooter(doc) {
  try {
    const range = doc.bufferedPageRange && doc.bufferedPageRange();
    if (range && range.count > 0) {
      // bufferPages mode — add footer to last page only (avoid duplicate with manual footers)
      doc.switchToPage(range.start + range.count - 1);
      _drawFooter(doc);
      return;
    }
  } catch {
    // bufferedPageRange not available — fall through
  }
  // Non-buffered — add footer to current page
  _drawFooter(doc);
}

function _drawFooter(doc) {
  const bottomY = doc.page.height - 30;
  doc.save();
  doc.fontSize(7)
    .fillColor('#999999')
    .text(
      'Solution développée par Cap-Numerik — cap-numerik.fr',
      50,
      bottomY,
      { align: 'center', width: doc.page.width - 100 }
    );
  doc.restore();
}

module.exports = { addCapNumerikFooter };
