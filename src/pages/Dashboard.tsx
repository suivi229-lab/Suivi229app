import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { formatCurrency, daysUntil } from '../lib/utils';
import { Users, Package, Receipt, AlertTriangle, TrendingUp, Car } from 'lucide-react';

interface Stats {
  totalClients: number;
  totalVehicles: number;
  activeSubscriptions: number;
  expiringSubscriptions: number;
  expiredCount: number;
  stockAvailable: number;
  monthlyRevenue: number;
  annualRevenue: number;
  pendingInvoices: number;
}

export default function Dashboard() {
  const { setCurrentPage } = useApp();
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalVehicles: 0,
    activeSubscriptions: 0,
    expiringSubscriptions: 0,
    expiredCount: 0,
    stockAvailable: 0,
    monthlyRevenue: 0,
    annualRevenue: 0,
    pendingInvoices: 0,
  });
  const [expiringList, setExpiringList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbErrors, setDbErrors] = useState<string[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    console.log('[Dashboard] loadStats() — début des requêtes Supabase');
    try {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

      const [clients, vehicles, subs, stock, invoices, transactions, annualTransactions] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('vehicles').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('*, vehicles(registration, clients(name))'),
        supabase.from('stock').select('status').eq('status', 'En Stock'),
        supabase.from('invoices').select('status').eq('status', 'En attente'),
        supabase.from('transactions').select('amount').eq('transaction_type', 'Entrée').gte('transaction_date', monthStart),
        supabase.from('transactions').select('amount').eq('transaction_type', 'Entrée').gte('transaction_date', yearStart),
      ]);

      const errList: string[] = [];
      if (clients.error)      { console.error('[Dashboard] ❌ clients:', clients.error.message); errList.push(`clients: ${clients.error.message} (${clients.error.code})`); }
      if (vehicles.error)     { console.error('[Dashboard] ❌ vehicles:', vehicles.error.message); errList.push(`vehicules: ${vehicles.error.message} (${vehicles.error.code})`); }
      if (subs.error)         { console.error('[Dashboard] ❌ subscriptions:', subs.error.message); errList.push(`subscriptions: ${subs.error.message} (${subs.error.code})`); }
      if (stock.error)        { console.error('[Dashboard] ❌ stock:', stock.error.message); errList.push(`stocks: ${stock.error.message} (${stock.error.code})`); }
      if (invoices.error)     { console.error('[Dashboard] ❌ invoices:', invoices.error.message); errList.push(`factures: ${invoices.error.message} (${invoices.error.code})`); }
      if (transactions.error)       { console.error('[Dashboard] ❌ transactions:', transactions.error.message); errList.push(`transactions: ${transactions.error.message} (${transactions.error.code})`); }
      if (annualTransactions.error) { console.error('[Dashboard] ❌ annualTransactions:', annualTransactions.error.message); }
      setDbErrors(errList);

      console.log('[Dashboard] ✅ clients count:', clients.count, '| vehicles count:', vehicles.count, '| subs:', subs.data?.length ?? 0);

      const subData = subs.data || [];
      const activeSubs = subData.filter((s: any) => s.status === 'Actif');
      const expiring = subData.filter((s: any) => {
        const days = daysUntil(s.end_date);
        return s.status !== 'Expiré' && days >= 0 && days <= 30;
      });
      const expired = subData.filter((s: any) => s.status === 'Expiré' || daysUntil(s.end_date) < 0);

      const monthlyRev = (transactions.data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const annualRev  = (annualTransactions.data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      setStats({
        totalClients: clients.count || 0,
        totalVehicles: vehicles.count || 0,
        activeSubscriptions: activeSubs.length,
        expiringSubscriptions: expiring.length,
        expiredCount: expired.length,
        stockAvailable: (stock.data || []).length,
        monthlyRevenue: monthlyRev,
        annualRevenue: annualRev,
        pendingInvoices: (invoices.data || []).length,
      });

      const combined = [
        ...expired.map((s: any) => ({ ...s, clientName: s.vehicles?.clients?.name || 'N/A', registration: s.vehicles?.registration || 'N/A', daysLeft: daysUntil(s.end_date) })),
        ...expiring.map((s: any) => ({ ...s, clientName: s.vehicles?.clients?.name || 'N/A', registration: s.vehicles?.registration || 'N/A', daysLeft: daysUntil(s.end_date) })),
      ].sort((a, b) => a.daysLeft - b.daysLeft);
      setExpiringList(combined);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { label: 'Clients', value: stats.totalClients, icon: Users, color: 'brand' as const, page: 'crm' as const },
    { label: 'Véhicules', value: stats.totalVehicles, icon: Car, color: 'brand' as const, page: 'crm' as const },
    { label: 'Abonnements Actifs', value: stats.activeSubscriptions, icon: Package, color: 'accent' as const, page: 'crm' as const },
    { label: 'À Renouveler', value: stats.expiredCount + stats.expiringSubscriptions, icon: AlertTriangle, color: 'danger' as const, page: 'crm' as const },
    { label: 'Stock Disponible', value: stats.stockAvailable, icon: Package, color: 'accent' as const, page: 'stock' as const },
    { label: `CA ${new Date().getFullYear()}`, value: formatCurrency(stats.annualRevenue), icon: TrendingUp, color: 'accent' as const, page: 'billing' as const },
    { label: "CA du mois", value: formatCurrency(stats.monthlyRevenue), icon: TrendingUp, color: 'brand' as const, page: 'billing' as const },
    { label: 'Factures en attente', value: stats.pendingInvoices, icon: Receipt, color: 'danger' as const, page: 'billing' as const },
  ];

  const colorMap = {
    brand: { bg: 'bg-brand-50 dark:bg-brand-900/20', icon: 'text-brand-600 dark:text-brand-400', ring: 'ring-brand-100 dark:ring-brand-800' },
    accent: { bg: 'bg-accent-50 dark:bg-accent-900/20', icon: 'text-accent-600 dark:text-accent-400', ring: 'ring-accent-100 dark:ring-accent-800' },
    danger: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400', ring: 'ring-red-100 dark:ring-red-800' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tableau de bord</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Vue d'ensemble de Suivi 229+</p>
      </div>

      {dbErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">⚠ Erreurs Supabase — vérifiez les politiques RLS ou les noms de tables :</p>
          {dbErrors.map((e, i) => (
            <p key={i} className="text-xs font-mono text-red-600 dark:text-red-300">{e}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map(card => {
          const Icon = card.icon;
          const c = colorMap[card.color];
          return (
            <button
              key={card.label}
              onClick={() => setCurrentPage(card.page)}
              className="card p-5 text-left hover:shadow-md hover:scale-[1.02] transition-all duration-150 cursor-pointer w-full"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center ring-1 ${c.ring}`}>
                  <Icon className={`w-6 h-6 ${c.icon}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{card.value}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {expiringList.length > 0 && (
        <div className="card border-l-4 border-l-amber-500">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Abonnements à renouveler</h2>
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">{expiringList.length}</span>
              </div>
              <button
                onClick={() => setCurrentPage('crm')}
                className="btn-outline text-sm"
              >
                Renouveler dans CRM →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="table-header">Client</th>
                    <th className="table-header">Véhicule</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Expire le</th>
                    <th className="table-header">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringList.map((s: any) => (
                    <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="table-cell font-medium">{s.clientName}</td>
                      <td className="table-cell">{s.registration}</td>
                      <td className="table-cell">{s.tracker_type}</td>
                      <td className="table-cell">{new Date(s.end_date).toLocaleDateString('fr-FR')}</td>
                      <td className="table-cell">
                        {s.daysLeft < 0 ? (
                          <span className="badge badge-danger">Expiré {Math.abs(s.daysLeft)} j</span>
                        ) : s.daysLeft <= 7 ? (
                          <span className="badge badge-danger">{s.daysLeft} j restants</span>
                        ) : (
                          <span className="badge badge-warning">{s.daysLeft} j restants</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
