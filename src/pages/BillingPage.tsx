import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, generateInvoiceNumber, exportToCSV, printElement, BUSINESS_INFO, PRODUCTS_AND_SERVICES } from '../lib/utils';
import Modal from '../components/Modal';
import {
  Plus, Printer, Download, Search, Receipt, TrendingUp,
  TrendingDown, FileText, Eye, Trash2, Edit2,
} from 'lucide-react';

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  invoice_date: string;
  total_amount: number;
  status: string;
  clients?: { name: string; email: string | null };
  invoice_lines?: InvoiceLine[];
}

interface InvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Transaction {
  id: string;
  transaction_type: string;
  description: string;
  amount: number;
  invoice_id: string | null;
  transaction_date: string;
  category: string | null;
}

function getLineCategory(description: string): string {
  const serviceKeywords = ['Installation', 'Formation', 'Consultation', 'Conseil'];
  const isService = serviceKeywords.some(k => description.includes(k));
  if (isService) return 'Prestation';
  if (description.toLowerCase().includes('vente') || description.toLowerCase().includes('traceur')) return 'Vente matériel';
  return 'Abonnement';
}

async function sendInvoiceEmail(invoiceId: string, invoiceNumber: string, clientName: string, clientEmail: string, totalAmount: number, lines: { description: string; quantity: number; unit_price: number; line_total: number }[]) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ invoiceId, invoiceNumber, clientName, clientEmail, totalAmount, lines }),
    });
  } catch {
    // Email sending is best-effort; don't block the user flow
  }
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'invoices' | 'transactions'>('invoices');
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [showEditInvoice, setShowEditInvoice] = useState<Invoice | null>(null);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showInvoiceDetail, setShowInvoiceDetail] = useState<Invoice | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string; email: string | null }[]>([]);

  const [newInvoice, setNewInvoice] = useState({
    client_id: '',
    lines: [{ description: '', quantity: 1, unit_price: 0 }],
    status: 'En attente',
  });
  const [editInvoice, setEditInvoice] = useState({
    status: 'En attente',
    lines: [{ description: '', quantity: 1, unit_price: 0 }],
  });
  const [newTransaction, setNewTransaction] = useState({
    transaction_type: 'Sortie' as 'Entrée' | 'Sortie',
    description: '',
    amount: 0,
    category: '',
  });

  const [dbError, setDbError] = useState<string | null>(null);
  const [writeError, _setWriteError] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setDbError(null);
    try {
      const [invRes, txnRes, clientRes] = await Promise.all([
        supabase.from('invoices').select('*, clients(name, email), invoice_lines(*)').order('invoice_date', { ascending: false }),
        supabase.from('transactions').select('*').order('transaction_date', { ascending: false }),
        supabase.from('clients').select('id, name, email').order('name'),
      ]);
      const errors = [invRes.error, txnRes.error, clientRes.error].filter(Boolean);
      if (errors.length > 0) {
        const msgs = errors.map(e => `${e!.message} (${e!.code})`).join(' | ');
        console.error('[Facturation] ❌', msgs);
        setDbError(`Erreur chargement données — ${msgs}`);
      }
      setInvoices(invRes.data || []);
      setTransactions(txnRes.data || []);
      setClients(clientRes.data || []);
    } finally {
      setLoading(false);
    }
  }

  async function addInvoice() {
    if (!newInvoice.client_id) return;
    const lines = newInvoice.lines.filter(l => l.description.trim());
    if (lines.length === 0) return;

    const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
    const invoiceNumber = generateInvoiceNumber();

    const { data: invoice } = await supabase.from('invoices').insert({
      invoice_number: invoiceNumber,
      client_id: newInvoice.client_id,
      invoice_date: new Date().toISOString().split('T')[0],
      total_amount: totalAmount,
      status: newInvoice.status,
    }).select().single();

    if (invoice) {
      await supabase.from('invoice_lines').insert(
        lines.map(l => ({
          invoice_id: invoice.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.quantity * l.unit_price,
        }))
      );

      if (newInvoice.status === 'Payée') {
        const client = clients.find(c => c.id === newInvoice.client_id);
        const clientName = client?.name || '';
        const clientEmail = client?.email || '';
        const primaryCategory = getLineCategory(lines[0].description);
        await supabase.from('transactions').insert({
          transaction_type: 'Entrée',
          description: `Paiement ${invoiceNumber} - ${clientName}`,
          amount: totalAmount,
          invoice_id: invoice.id,
          category: primaryCategory,
        });
        if (clientEmail) {
          sendInvoiceEmail(invoice.id, invoiceNumber, clientName, clientEmail, totalAmount, lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, line_total: l.quantity * l.unit_price })));
        }
      }
    }

    setShowAddInvoice(false);
    setNewInvoice({ client_id: '', lines: [{ description: '', quantity: 1, unit_price: 0 }], status: 'En attente' });
    loadData();
  }

  async function updateInvoice() {
    if (!showEditInvoice) return;
    const lines = editInvoice.lines.filter(l => l.description.trim());
    if (lines.length === 0) return;

    const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);

    await supabase.from('invoices').update({
      status: editInvoice.status,
      total_amount: totalAmount,
    }).eq('id', showEditInvoice.id);

    // Delete old lines and re-insert
    await supabase.from('invoice_lines').delete().eq('invoice_id', showEditInvoice.id);
    await supabase.from('invoice_lines').insert(
      lines.map(l => ({
        invoice_id: showEditInvoice.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.quantity * l.unit_price,
      }))
    );

    // If changing to Payée, check if transaction already exists
    if (editInvoice.status === 'Payée') {
      const { data: existingTxn } = await supabase.from('transactions').select('id').eq('invoice_id', showEditInvoice.id).limit(1);
      if (!existingTxn || existingTxn.length === 0) {
        const clientName = showEditInvoice.clients?.name || '';
        const clientEmail = showEditInvoice.clients?.email || '';
        const primaryCategory = lines.length > 0 ? getLineCategory(lines[0].description) : 'Abonnement';
        await supabase.from('transactions').insert({
          transaction_type: 'Entrée',
          description: `Paiement ${showEditInvoice.invoice_number} - ${clientName}`,
          amount: totalAmount,
          invoice_id: showEditInvoice.id,
          category: primaryCategory,
        });
        if (clientEmail) {
          sendInvoiceEmail(showEditInvoice.id, showEditInvoice.invoice_number, clientName, clientEmail, totalAmount, lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, line_total: l.quantity * l.unit_price })));
        }
      }
    }

    setShowEditInvoice(null);
    loadData();
  }

  async function addTransaction() {
    if (!newTransaction.description.trim() || newTransaction.amount <= 0) return;
    await supabase.from('transactions').insert({
      transaction_type: newTransaction.transaction_type,
      description: newTransaction.description,
      amount: newTransaction.amount,
      category: newTransaction.category || null,
    });
    setShowAddTransaction(false);
    setNewTransaction({ transaction_type: 'Sortie', description: '', amount: 0, category: '' });
    loadData();
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Supprimer cette facture ?')) return;
    await supabase.from('invoices').delete().eq('id', id);
    loadData();
  }

  async function markAsPaid(invoice: Invoice) {
    await supabase.from('invoices').update({ status: 'Payée' }).eq('id', invoice.id);
    const clientName = invoice.clients?.name || '';
    const clientEmail = invoice.clients?.email || '';
    const lines = invoice.invoice_lines || [];
    const primaryCategory = lines.length > 0 ? getLineCategory(lines[0].description) : 'Abonnement';
    await supabase.from('transactions').insert({
      transaction_type: 'Entrée',
      description: `Paiement ${invoice.invoice_number} - ${clientName}`,
      amount: invoice.total_amount,
      invoice_id: invoice.id,
      category: primaryCategory,
    });
    if (clientEmail) {
      sendInvoiceEmail(invoice.id, invoice.invoice_number, clientName, clientEmail, invoice.total_amount, lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total })));
    }
    loadData();
  }

  function handleAddProductLine(productIndex: number) {
    const product = PRODUCTS_AND_SERVICES[productIndex];
    setNewInvoice(p => ({
      ...p,
      lines: [...p.lines, { description: product.label, quantity: 1, unit_price: product.defaultPrice }],
    }));
  }

  function handleEditAddProductLine(productIndex: number) {
    const product = PRODUCTS_AND_SERVICES[productIndex];
    setEditInvoice(p => ({
      ...p,
      lines: [...p.lines, { description: product.label, quantity: 1, unit_price: product.defaultPrice }],
    }));
  }

  function handleExportCSV() {
    const headers = ['Date', 'Type', 'Description', 'Montant (FCFA)', 'Catégorie'];
    const rows = transactions.map(t => [
      formatDate(t.transaction_date),
      t.transaction_type,
      t.description,
      String(t.amount),
      t.category || '',
    ]);
    exportToCSV(headers, rows, `transactions_suivi229_${new Date().toISOString().split('T')[0]}.csv`);
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyEntries = transactions.filter(t => t.transaction_date.startsWith(currentMonth));
  const monthlyRevenue = monthlyEntries.filter(t => t.transaction_type === 'Entrée').reduce((s, t) => s + Number(t.amount), 0);
  const monthlyExpenses = monthlyEntries.filter(t => t.transaction_type === 'Sortie').reduce((s, t) => s + Number(t.amount), 0);
  const monthlyNet = monthlyRevenue - monthlyExpenses;

  const filteredInvoices = invoices.filter(i =>
    i.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    (i.clients?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const invoiceStatusBadge = (status: string) => {
    if (status === 'Payée') return <span className="badge-success">Payée</span>;
    if (status === 'En attente') return <span className="badge-warning">En attente</span>;
    return <span className="badge-danger">Annulée</span>;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {(dbError || writeError) && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">⚠ Erreur Supabase — tables <code>factures</code> / <code>transactions</code></p>
          {dbError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{dbError}</p>}
          {writeError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{writeError}</p>}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Facturation & Comptabilité</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestion financière complète</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAddInvoice(true)} className="btn-primary"><Plus className="w-4 h-4" /> Facture</button>
          <button onClick={() => setShowAddTransaction(true)} className="btn-secondary"><Plus className="w-4 h-4" /> Transaction</button>
          <button onClick={handleExportCSV} className="btn-outline"><Download className="w-4 h-4" /> Export CSV</button>
        </div>
      </div>

      {/* Financial Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 border-l-4 border-l-accent-500">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-accent-600" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Recettes du mois</p>
              <p className="text-xl font-bold text-accent-600">{formatCurrency(monthlyRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 border-l-4 border-l-red-500">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Dépenses du mois</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(monthlyExpenses)}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 border-l-4 border-l-brand-500">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-brand-600" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Bilan net du mois</p>
              <p className={`text-xl font-bold ${monthlyNet >= 0 ? 'text-accent-600' : 'text-red-600'}`}>{formatCurrency(monthlyNet)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2 no-print">
        <button onClick={() => printElement('billing-print')} className="btn-outline text-xs"><Printer className="w-3 h-3" /> Imprimer le bilan mensuel</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        <button onClick={() => setActiveTab('invoices')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'invoices' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          Factures ({invoices.length})
        </button>
        <button onClick={() => setActiveTab('transactions')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'transactions' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          Transactions ({transactions.length})
        </button>
      </div>

      <div id="billing-print" className="card">
        {activeTab === 'invoices' && (
          <div className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="input pl-10" placeholder="Rechercher une facture..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="table-header">N° Facture</th>
                    <th className="table-header">Client</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Montant</th>
                    <th className="table-header">Statut</th>
                    <th className="table-header no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="table-cell font-medium">{inv.invoice_number}</td>
                      <td className="table-cell">{inv.clients?.name || '-'}</td>
                      <td className="table-cell">{formatDate(inv.invoice_date)}</td>
                      <td className="table-cell font-semibold">{formatCurrency(inv.total_amount)}</td>
                      <td className="table-cell">{invoiceStatusBadge(inv.status)}</td>
                      <td className="table-cell no-print">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setShowInvoiceDetail(inv)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600" title="Voir"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => { setShowEditInvoice(inv); setEditInvoice({ status: inv.status, lines: (inv.invoice_lines || []).map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price })) }); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                          {inv.status === 'En attente' && (
                            <button onClick={() => markAsPaid(inv)} className="p-1.5 rounded-lg hover:bg-accent-50 dark:hover:bg-accent-900/20 text-gray-500 hover:text-accent-600" title="Marquer payée"><Receipt className="w-4 h-4" /></button>
                          )}
                          <button onClick={() => deleteInvoice(inv.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredInvoices.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Aucune facture trouvée</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="table-header">Date</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Description</th>
                    <th className="table-header">Montant</th>
                    <th className="table-header">Catégorie</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => (
                    <tr key={txn.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="table-cell">{formatDate(txn.transaction_date)}</td>
                      <td className="table-cell">
                        {txn.transaction_type === 'Entrée'
                          ? <span className="badge-success">Entrée</span>
                          : <span className="badge-danger">Sortie</span>}
                      </td>
                      <td className="table-cell">{txn.description}</td>
                      <td className={`table-cell font-semibold ${txn.transaction_type === 'Entrée' ? 'text-accent-600' : 'text-red-600'}`}>
                        {txn.transaction_type === 'Sortie' ? '-' : '+'}{formatCurrency(txn.amount)}
                      </td>
                      <td className="table-cell text-gray-500">{txn.category || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Invoice Modal */}
      <Modal open={showAddInvoice} onClose={() => setShowAddInvoice(false)} title="Nouvelle facture" wide>
        <div className="space-y-4">
          <div><label className="label">Client *</label>
            <select className="select" value={newInvoice.client_id} onChange={e => setNewInvoice(p => ({ ...p, client_id: e.target.value }))}>
              <option value="">Sélectionner un client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Statut</label>
            <select className="select" value={newInvoice.status} onChange={e => setNewInvoice(p => ({ ...p, status: e.target.value }))}>
              <option value="En attente">En attente</option>
              <option value="Payée">Payée</option>
              <option value="Annulée">Annulée</option>
            </select>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Lignes de facture</label>
              <div className="relative group">
                <button className="btn-outline text-xs">+ Ajouter un produit/service</button>
                <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 hidden group-hover:block">
                  <div className="p-2 space-y-1">
                    {PRODUCTS_AND_SERVICES.map((product, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAddProductLine(idx)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{product.label}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(product.defaultPrice)} - {product.category}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {newInvoice.lines.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <input className="input flex-1" placeholder="Description" value={line.description} onChange={e => {
                  const lines = [...newInvoice.lines];
                  lines[i] = { ...lines[i], description: e.target.value };
                  setNewInvoice(p => ({ ...p, lines }));
                }} />
                <input type="number" className="input w-20" placeholder="Qté" value={line.quantity} onChange={e => {
                  const lines = [...newInvoice.lines];
                  lines[i] = { ...lines[i], quantity: Number(e.target.value) };
                  setNewInvoice(p => ({ ...p, lines }));
                }} />
                <input type="number" className="input w-32" placeholder="Prix unit." value={line.unit_price} onChange={e => {
                  const lines = [...newInvoice.lines];
                  lines[i] = { ...lines[i], unit_price: Number(e.target.value) };
                  setNewInvoice(p => ({ ...p, lines }));
                }} />
                <span className="text-sm text-gray-500 py-2 w-28 text-right">{formatCurrency(line.quantity * line.unit_price)}</span>
                {newInvoice.lines.length > 1 && (
                  <button onClick={() => setNewInvoice(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            <button onClick={() => setNewInvoice(p => ({ ...p, lines: [...p.lines, { description: '', quantity: 1, unit_price: 0 }] }))} className="btn-outline text-xs">+ Ligne personnalisée</button>
          </div>
          <div className="text-right text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
            Total : {formatCurrency(newInvoice.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0))}
          </div>
          <button onClick={addInvoice} className="btn-primary w-full" disabled={!newInvoice.client_id}>Créer la facture</button>
        </div>
      </Modal>

      {/* Edit Invoice Modal */}
      <Modal open={!!showEditInvoice} onClose={() => setShowEditInvoice(null)} title={`Modifier la facture ${showEditInvoice?.invoice_number || ''}`} wide>
        <div className="space-y-4">
          <div><label className="label">Statut</label>
            <select className="select" value={editInvoice.status} onChange={e => setEditInvoice(p => ({ ...p, status: e.target.value }))}>
              <option value="En attente">En attente</option>
              <option value="Payée">Payée</option>
              <option value="Annulée">Annulée</option>
            </select>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Lignes de facture</label>
              <div className="relative group">
                <button className="btn-outline text-xs">+ Ajouter un produit/service</button>
                <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 hidden group-hover:block">
                  <div className="p-2 space-y-1">
                    {PRODUCTS_AND_SERVICES.map((product, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleEditAddProductLine(idx)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{product.label}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(product.defaultPrice)} - {product.category}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {editInvoice.lines.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <input className="input flex-1" placeholder="Description" value={line.description} onChange={e => {
                  const lines = [...editInvoice.lines];
                  lines[i] = { ...lines[i], description: e.target.value };
                  setEditInvoice(p => ({ ...p, lines }));
                }} />
                <input type="number" className="input w-20" placeholder="Qté" value={line.quantity} onChange={e => {
                  const lines = [...editInvoice.lines];
                  lines[i] = { ...lines[i], quantity: Number(e.target.value) };
                  setEditInvoice(p => ({ ...p, lines }));
                }} />
                <input type="number" className="input w-32" placeholder="Prix unit." value={line.unit_price} onChange={e => {
                  const lines = [...editInvoice.lines];
                  lines[i] = { ...lines[i], unit_price: Number(e.target.value) };
                  setEditInvoice(p => ({ ...p, lines }));
                }} />
                <span className="text-sm text-gray-500 py-2 w-28 text-right">{formatCurrency(line.quantity * line.unit_price)}</span>
                {editInvoice.lines.length > 1 && (
                  <button onClick={() => setEditInvoice(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            <button onClick={() => setEditInvoice(p => ({ ...p, lines: [...p.lines, { description: '', quantity: 1, unit_price: 0 }] }))} className="btn-outline text-xs">+ Ligne personnalisée</button>
          </div>
          <div className="text-right text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
            Total : {formatCurrency(editInvoice.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0))}
          </div>
          <button onClick={updateInvoice} className="btn-primary w-full">Enregistrer les modifications</button>
        </div>
      </Modal>

      {/* Add Transaction Modal */}
      <Modal open={showAddTransaction} onClose={() => setShowAddTransaction(false)} title="Nouvelle transaction">
        <div className="space-y-4">
          <div><label className="label">Type *</label>
            <select className="select" value={newTransaction.transaction_type} onChange={e => setNewTransaction(p => ({ ...p, transaction_type: e.target.value as 'Entrée' | 'Sortie' }))}>
              <option value="Sortie">Sortie (dépense)</option>
              <option value="Entrée">Entrée (revenu)</option>
            </select>
          </div>
          <div><label className="label">Description *</label><input className="input" value={newTransaction.description} onChange={e => setNewTransaction(p => ({ ...p, description: e.target.value }))} /></div>
          <div><label className="label">Montant (FCFA) *</label><input type="number" className="input" value={newTransaction.amount} onChange={e => setNewTransaction(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
          <div><label className="label">Catégorie</label>
            <select className="select" value={newTransaction.category} onChange={e => setNewTransaction(p => ({ ...p, category: e.target.value }))}>
              <option value="">Sans catégorie</option>
              <option value="Abonnement">Abonnement</option>
              <option value="Vente matériel">Vente matériel</option>
              <option value="Prestation">Prestation</option>
              <option value="Achat matériel">Achat matériel</option>
              <option value="Transport">Transport</option>
              <option value="Télécoms">Télécoms</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <button onClick={addTransaction} className="btn-primary w-full" disabled={!newTransaction.description.trim() || newTransaction.amount <= 0}>Enregistrer la transaction</button>
        </div>
      </Modal>

      {/* Invoice Detail / Print Modal */}
      <Modal open={!!showInvoiceDetail} onClose={() => setShowInvoiceDetail(null)} title={`Facture ${showInvoiceDetail?.invoice_number || ''}`} wide>
        {showInvoiceDetail && (
          <div id="invoice-print">
            <div className="invoice-box">
              <div className="biz-header">
                <h2>{BUSINESS_INFO.name}</h2>
                <div className="biz-meta">
                  <strong>N° IFU :</strong> {BUSINESS_INFO.ifu} | <strong>N° RCCM :</strong> {BUSINESS_INFO.rccm}<br />
                  <strong>Exploitant :</strong> {BUSINESS_INFO.owner}<br />
                  {BUSINESS_INFO.address}<br />
                  Tél : {BUSINESS_INFO.phone} | Email : {BUSINESS_INFO.email}
                </div>
              </div>
              <div className="invoice-header" style={{ marginTop: 20 }}>
                <div className="invoice-info">
                  <p className="font-semibold">Client : {showInvoiceDetail.clients?.name || '-'}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-bold text-gray-900">{showInvoiceDetail.invoice_number}</h3>
                  <p className="text-sm text-gray-600">Date : {formatDate(showInvoiceDetail.invoice_date)}</p>
                  <p className="text-sm">Statut : <span className={showInvoiceDetail.status === 'Payée' ? 'status-paid' : showInvoiceDetail.status === 'En attente' ? 'status-pending' : 'status-cancelled'}>{showInvoiceDetail.status}</span></p>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 text-sm">Description</th>
                    <th className="text-center py-2 px-3 text-sm">Qté</th>
                    <th className="text-right py-2 px-3 text-sm">Prix unitaire</th>
                    <th className="text-right py-2 px-3 text-sm">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(showInvoiceDetail.invoice_lines || []).map(line => (
                    <tr key={line.id}>
                      <td className="py-2 px-3 text-sm">{line.description}</td>
                      <td className="py-2 px-3 text-sm text-center">{line.quantity}</td>
                      <td className="py-2 px-3 text-sm text-right">{formatCurrency(line.unit_price)}</td>
                      <td className="py-2 px-3 text-sm text-right">{formatCurrency(line.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="invoice-total">
                Total : {formatCurrency(showInvoiceDetail.total_amount)}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 no-print">
              <button onClick={() => printElement('invoice-print')} className="btn-primary"><Printer className="w-4 h-4" /> Télécharger / Imprimer</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
