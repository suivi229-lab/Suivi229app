export const BUSINESS_INFO = {
  name: 'SUIVI 229 PLUS',
  ifu: '0202243681345',
  rccm: 'RB/COT/26 A 118065',
  owner: 'BOUKOUMI AKOFE SYLVAIN GBEFFAN',
  address: 'Littoral, Cotonou, 12ème Arrondissement, Gbodjetin, Bénin',
  phone: '+229 0155222939',
  email: 'suivi229@gmail.com',
};

export const PRODUCTS_AND_SERVICES = [
  { label: 'Vente Traceur GT06', defaultPrice: 75000, category: 'Vente matériel' },
  { label: 'Vente Traceur JT808', defaultPrice: 85000, category: 'Vente matériel' },
  { label: 'Installation de traceur', defaultPrice: 15000, category: 'Prestation' },
  { label: 'Formation (Prise en main de la plateforme)', defaultPrice: 10000, category: 'Prestation' },
  { label: 'Consultation / Conseil technique', defaultPrice: 5000, category: 'Prestation' },
];

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' FCFA';
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function daysUntil(date: string | Date): number {
  const target = new Date(date);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `FAC-${year}-${random}`;
}

export function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    return row;
  });
}

export function exportToCSV(headers: string[], rows: string[][], filename: string) {
  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(c => `"${c}"`).join(','))
  ].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ─── Impression / PDF ─────────────────────────────────────────────────────── */

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .table-header, thead th, th {
    background: #1a3a6b !important; color: #fff !important;
    padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700;
    border: 1px solid #1a3a6b;
  }
  .table-cell, tbody td, td {
    padding: 6px 10px; border: 1px solid #c8d6e8;
    font-size: 10px; vertical-align: top; line-height: 1.4;
  }
  tbody tr:nth-child(even) td { background: #f4f7fb; }

  /* ── Badges ── */
  .badge-success { color: #059669; font-weight: 700; }
  .badge-warning  { color: #b45309; font-weight: 700; }
  .badge-danger   { color: #dc2626; font-weight: 700; }
  .badge-info     { color: #2563eb; font-weight: 700; }

  /* ── Typo ── */
  h1 { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
  h2, h3 { font-size: 13px; font-weight: 700; margin: 14px 0 6px; }
  p { font-size: 10px; color: #555; line-height: 1.5; }
  strong { font-weight: 700; }

  /* ── En-tête entreprise ── */
  .biz-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #1a3a6b; }
  .biz-header h2 { font-size: 17px; font-weight: 700; color: #1a3a6b; letter-spacing: 1px; margin: 0 0 4px; }
  .biz-meta { font-size: 10px; color: #555; line-height: 1.7; }
  .biz-meta strong { color: #222; }

  /* ── Facture ── */
  .invoice-box { max-width: 100%; }
  .invoice-header { display: flex; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .invoice-info { font-size: 11px; line-height: 1.8; }
  .invoice-total { text-align: right; font-size: 14px; font-weight: 700; margin-top: 14px; padding-top: 10px; border-top: 2px solid #1a3a6b; }
  .status-paid      { color: #059669; font-weight: 700; }
  .status-pending   { color: #b45309; font-weight: 700; }
  .status-cancelled { color: #dc2626; font-weight: 700; }

  /* ── Ticket ── */
  .receipt-box { max-width: 420px; margin: 0 auto; padding: 20px; border: 2px solid #1a3a6b; }
  .receipt-box h2 { font-size: 16px; letter-spacing: 1px; }
  .receipt-box .line { display: flex; justify-content: space-between; padding: 5px 0; font-size: 11px; border-bottom: 1px dashed #ccc; }
  .receipt-box .total-line { font-weight: 700; font-size: 13px; border-bottom: 2px solid #1a3a6b; }

  /* ── Masquer éléments interactifs ── */
  button, input, select, textarea, svg,
  .no-print, [class*="no-print"] { display: none !important; }

  /* ── Espacement Tailwind minimal ── */
  .space-y-6 > * + * { margin-top: 14px; }
  .flex { display: flex; } .gap-2 { gap: 8px; } .gap-4 { gap: 14px; }
  .justify-between { justify-content: space-between; }
  .text-right { text-align: right; }
  .font-bold, .font-semibold { font-weight: 700; }
  .text-sm { font-size: 10px; } .text-xs { font-size: 9px; }

  @media print {
    body { padding: 0; }
    @page { margin: 12mm 15mm; size: A4 portrait; }
  }
`;

/**
 * Ouvre une nouvelle fenêtre/onglet propre et déclenche l'impression PDF.
 * Utilise un Blob URL (compatible mobile/popup-blocker).
 * Supprime automatiquement les icônes SVG, boutons et colonnes .no-print du clone.
 */
export function printElement(elementId: string, docTitle = 'Suivi 229+') {
  const content = document.getElementById(elementId);
  if (!content) return;

  // Clone sans affecter la page en cours
  const clone = content.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print').forEach(el => el.remove());
  clone.querySelectorAll('svg').forEach(el => el.remove());
  clone.querySelectorAll('button').forEach(el => el.remove());

  const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${docTitle}</title>
  <style>${PRINT_CSS}</style>
</head>
<body style="padding:20mm;">${clone.innerHTML}</body>
</html>`;

  _openPrint(fullHtml);
}

/** Ouvre le HTML dans un onglet et déclenche l'impression (Blob URL, compatible mobile). */
export function _openPrint(html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 400);
    });
  } else {
    // Popup bloqué (mobile) → forcer l'ouverture via <a>
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
}
