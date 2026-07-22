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
 * Imprime un élément DOM — fonctionne sur desktop ET mobile Android/iOS.
 * Injecte le contenu dans la page courante et appelle window.print() directement
 * (les Blob/popup URLs sont inaccessibles au service d'impression Android).
 */
export function printElement(elementId: string, _docTitle = 'Suivi 229+') {
  const content = document.getElementById(elementId);
  if (!content) return;

  // Clone propre : supprime icônes SVG, boutons et colonnes action
  const clone = content.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, svg, button').forEach(el => el.remove());

  printHTML(clone.innerHTML);
}

/**
 * Imprime du contenu HTML arbitraire (chaîne) — même technique que printElement.
 * À utiliser depuis AIPage et tout autre endroit qui génère du HTML manuellement.
 */
export function printHTML(htmlContent: string) {
  // ── 1. Injecter le CSS d'impression ───────────────────────────────────────
  let styleEl = document.getElementById('__print_style__') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = '__print_style__';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @media print {
      /* Masquer toute l'app sauf le contenu à imprimer */
      body > *:not(#__print_root__) { display: none !important; }
      #__print_root__ { display: block !important; }
      ${PRINT_CSS}
    }
    @media screen {
      #__print_root__ { display: none !important; }
    }
  `;

  // ── 2. Injecter le contenu ─────────────────────────────────────────────────
  let printRoot = document.getElementById('__print_root__');
  if (!printRoot) {
    printRoot = document.createElement('div');
    printRoot.id = '__print_root__';
    document.body.appendChild(printRoot);
  }
  printRoot.innerHTML = htmlContent;

  // ── 3. Imprimer (sur la page courante → compatible Android/iOS) ───────────
  window.print();

  // ── 4. Nettoyer après fermeture du dialogue ────────────────────────────────
  setTimeout(() => {
    if (printRoot) printRoot.innerHTML = '';
    if (styleEl)  styleEl.textContent = '';
  }, 3000);
}
