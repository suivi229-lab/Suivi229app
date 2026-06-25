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

const businessHeaderCSS = `
  .biz-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; }
  .biz-header h2 { font-size: 18px; font-weight: 700; margin-bottom: 2px; letter-spacing: 1px; }
  .biz-header .biz-meta { font-size: 11px; color: #444; line-height: 1.5; }
  .biz-header .biz-meta strong { color: #222; }
`;

export function printElement(elementId: string) {
  const content = document.getElementById(elementId);
  if (!content) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Suivi 229+</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; margin: 20px; color: #111; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
        th { background: #f3f4f6; font-weight: 600; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { font-size: 20px; margin-bottom: 4px; }
        .header p { font-size: 13px; color: #666; }
        .invoice-box { max-width: 800px; margin: 0 auto; padding: 30px; border: 1px solid #eee; }
        .invoice-header { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .invoice-info { font-size: 13px; line-height: 1.8; }
        .invoice-total { text-align: right; font-size: 16px; font-weight: 700; margin-top: 16px; padding-top: 12px; border-top: 2px solid #111; }
        .status-paid { color: #059669; font-weight: 600; }
        .status-pending { color: #d97706; font-weight: 600; }
        .status-cancelled { color: #dc2626; font-weight: 600; }
        .receipt-box { max-width: 500px; margin: 0 auto; padding: 24px; border: 2px solid #111; text-align: center; }
        .receipt-box h2 { font-size: 18px; margin-bottom: 4px; letter-spacing: 1px; }
        .receipt-box .line { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #ccc; }
        .receipt-box .total-line { font-weight: 700; font-size: 15px; border-bottom: 2px solid #111; }
        ${businessHeaderCSS}
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>${content.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}
