/**
 * Minimal PDF receipt generator (no external deps).
 * Produces a simple single-page PDF documenting a cleared rent payment.
 */
const fs = require('fs');
const path = require('path');

const RECEIPTS_DIR = process.env.RECEIPTS_DIR
  || path.join(__dirname, '../../storage/receipts');

function ensureDir() {
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
}

function pdfEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Build a tiny PDF with Helvetica text lines.
 * @param {string[]} lines
 * @returns {Buffer}
 */
function buildPdf(lines) {
  const contentLines = ['BT', '/F1 11 Tf', '50 780 Td', '14 TL'];
  lines.forEach((line, i) => {
    if (i === 0) contentLines.push(`(${pdfEscape(line)}) Tj`);
    else contentLines.push(`T* (${pdfEscape(line)}) Tj`);
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');

  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
    '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n'
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj\n`
  );
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

/**
 * Write a PDF receipt for a cleared financial record.
 * @returns {{ absolutePath: string, relativePath: string }}
 */
function generateRentReceipt({
  receiptNo,
  tenantName,
  propertyName,
  amountUGX,
  provider,
  landlordCode,
  paidAt,
}) {
  ensureDir();
  const safeName = String(receiptNo || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeName}.pdf`;
  const absolutePath = path.join(RECEIPTS_DIR, filename);

  const lines = [
    'NYUMBA SMART — RENT RECEIPT',
    '--------------------------------',
    `Receipt No: ${receiptNo}`,
    `Date: ${paidAt || new Date().toISOString()}`,
    `Tenant: ${tenantName || 'Tenant'}`,
    `Property: ${propertyName || 'Unit'}`,
    `Landlord Code: ${landlordCode || '—'}`,
    `Amount Paid: UGX ${Number(amountUGX || 0).toLocaleString()}`,
    `Channel: ${provider || 'Paystack'}`,
    '--------------------------------',
    'Funds settled directly to the landlord Paystack account.',
    'Nyumba Smart did not hold or route this money.',
    'Thank you for paying on time.',
  ];

  fs.writeFileSync(absolutePath, buildPdf(lines));
  return {
    absolutePath,
    relativePath: path.join('storage/receipts', filename),
  };
}

module.exports = { generateRentReceipt, RECEIPTS_DIR };
