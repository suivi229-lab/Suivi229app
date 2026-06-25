import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, daysUntil, parseCSV, printElement, BUSINESS_INFO } from '../lib/utils';
import Modal from '../components/Modal';
import {
  Plus, Upload, Printer, Search, ChevronDown, ChevronUp,
  AlertTriangle, Trash2, Car, CreditCard, Edit2, Users, CreditCard as SubscriptionIcon, RefreshCw,
} from 'lucide-react';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
  vehicles?: Vehicle[];
}

interface Vehicle {
  id: string;
  client_id: string;
  registration: string;
  make_model: string | null;
  created_at: string;
  subscriptions?: Subscription[];
  clients?: { name: string };
}

interface Subscription {
  id: string;
  vehicle_id: string;
  tracker_type: string;
  start_date: string;
  end_date: string;
  status: string;
  annual_price: number;
  tracker_id: string | null;
  sim_id: string | null;
  vehicles?: Vehicle & { clients?: { name: string; email: string | null } };
}

interface StockItem {
  id: string;
  item_type: string;
  serial_number: string;
  status: string;
}

type SubTab = 'clients' | 'subscriptions';

export default function CRMPage() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('clients');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState<Client | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState<string | null>(null);
  const [showEditVehicle, setShowEditVehicle] = useState<Vehicle | null>(null);
  const [showAddSubscription, setShowAddSubscription] = useState<string | null>(null);
  const [showEditSubscription, setShowEditSubscription] = useState<Subscription | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showClientDetail, setShowClientDetail] = useState<Client | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Subscription management states
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
  const [subFilterStatus, setSubFilterStatus] = useState<string>('all');
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [subClients, setSubClients] = useState<{ id: string; name: string; email: string | null; vehicles: { id: string; registration: string; make_model: string | null; client_id: string }[] }[]>([]);
  const [subStock, setSubStock] = useState<StockItem[]>([]);
  const [subSelectedClientId, setSubSelectedClientId] = useState('');
  const [subSelectedVehicleId, setSubSelectedVehicleId] = useState('');
  const [subTrackerType, setSubTrackerType] = useState('GT06');
  const [subSelectedSimId, setSubSelectedSimId] = useState('');
  const [subStartDate, setSubStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [subPrice, setSubPrice] = useState(75000);
  const [subSubmitting, setSubSubmitting] = useState(false);

  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', city: '' });
  const [editClient, setEditClient] = useState({ name: '', phone: '', email: '', city: '' });
  const [newVehicle, setNewVehicle] = useState({ registration: '', make_model: '' });
  const [editVehicle, setEditVehicle] = useState({ registration: '', make_model: '' });
  const [newSubscription, setNewSubscription] = useState({ tracker_type: 'GT06', start_date: new Date().toISOString().split('T')[0], annual_price: 75000 });
  const [editSubscription, setEditSubscription] = useState({ tracker_type: 'GT06', start_date: '', end_date: '', status: 'Actif', annual_price: 75000 });
  const [showRenewSub, setShowRenewSub] = useState<Subscription | null>(null);
  const [renewForm, setRenewForm] = useState({ annual_price: 75000, create_invoice: false, continuous: true });
  const [renewSubmitting, setRenewSubmitting] = useState(false);

  useEffect(() => { loadClients(); loadAllSubscriptions(); }, []);

  async function loadClients() {
    setLoading(true);
    console.log('[CRM] loadClients() — requête Supabase');
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*, vehicles(*, subscriptions(*))')
        .order('name');
      if (error) {
        console.error('[CRM] ❌ loadClients error:', error.code, error.message, error.hint ?? '');
      } else {
        console.log('[CRM] ✅ clients chargés:', data?.length ?? 0);
      }
      setClients(data || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllSubscriptions() {
    console.log('[CRM] loadAllSubscriptions() — requête Supabase');
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, vehicles(*, clients(name, email))')
      .order('end_date', { ascending: true });
    if (error) {
      console.error('[CRM] ❌ loadAllSubscriptions error:', error.code, error.message, error.hint ?? '');
    } else {
      console.log('[CRM] ✅ abonnements chargés:', data?.length ?? 0);
    }
    setAllSubscriptions(data || []);
  }

  async function loadSubFormData() {
    const [clientRes, stockRes] = await Promise.all([
      supabase.from('clients').select('id, name, email, vehicles(id, registration, make_model, client_id)').order('name'),
      supabase.from('stock').select('*').eq('status', 'En Stock').order('item_type'),
    ]);
    setSubClients(clientRes.data || []);
    setSubStock(stockRes.data || []);
  }

  function openCreateSubModal() {
    setSubSelectedClientId('');
    setSubSelectedVehicleId('');
    setSubTrackerType('GT06');
    setSubSelectedSimId('');
    setSubStartDate(new Date().toISOString().split('T')[0]);
    setSubPrice(75000);
    loadSubFormData();
    setShowCreateSub(true);
  }

  async function createSubscription() {
    if (!subSelectedClientId || !subSelectedVehicleId || !subSelectedSimId || subPrice <= 0) {
      alert('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    setSubSubmitting(true);
    try {
      const endDate = new Date(new Date(subStartDate).setFullYear(new Date(subStartDate).getFullYear() + 1)).toISOString().split('T')[0];
      await supabase.from('subscriptions').insert({
        vehicle_id: subSelectedVehicleId,
        tracker_type: subTrackerType,
        start_date: subStartDate,
        end_date: endDate,
        status: computeStatus(endDate),
        annual_price: Number(subPrice),
        sim_id: subSelectedSimId || null,
      });

      if (subSelectedSimId) {
        const selectedClient = subClients.find(c => c.id === subSelectedClientId);
        await supabase.from('stock').update({
          status: 'Installé',
          installed_client_name: selectedClient?.name || '',
        }).eq('id', subSelectedSimId);
      }

      setShowCreateSub(false);
      loadClients();
      loadAllSubscriptions();
    } catch {
      alert('Erreur lors de la création de l\'abonnement.');
    } finally {
      setSubSubmitting(false);
    }
  }

  async function addClient() {
    if (!newClient.name.trim()) return;
    await supabase.from('clients').insert({ name: newClient.name, phone: newClient.phone || null, email: newClient.email || null, city: newClient.city || null });
    setNewClient({ name: '', phone: '', email: '', city: '' });
    setShowAddClient(false);
    loadClients();
  }

  async function updateClient() {
    if (!showEditClient || !editClient.name.trim()) return;
    await supabase.from('clients').update({
      name: editClient.name,
      phone: editClient.phone || null,
      email: editClient.email || null,
      city: editClient.city || null,
    }).eq('id', showEditClient.id);
    setShowEditClient(null);
    loadClients();
  }

  async function addVehicle(clientId: string) {
    if (!newVehicle.registration.trim()) return;
    await supabase.from('vehicles').insert({ client_id: clientId, registration: newVehicle.registration, make_model: newVehicle.make_model || null });
    setNewVehicle({ registration: '', make_model: '' });
    setShowAddVehicle(null);
    loadClients();
  }

  async function updateVehicle() {
    if (!showEditVehicle || !editVehicle.registration.trim()) return;
    await supabase.from('vehicles').update({
      registration: editVehicle.registration,
      make_model: editVehicle.make_model || null,
    }).eq('id', showEditVehicle.id);
    setShowEditVehicle(null);
    loadClients();
  }

  function computeStatus(endDateStr: string): string {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(endDateStr) < today ? 'Expiré' : 'Actif';
  }

  async function addSubscription(vehicleId: string) {
    const startDate = newSubscription.start_date;
    const endDate = new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1)).toISOString().split('T')[0];
    await supabase.from('subscriptions').insert({
      vehicle_id: vehicleId,
      tracker_type: newSubscription.tracker_type,
      start_date: startDate,
      end_date: endDate,
      status: computeStatus(endDate),
      annual_price: Number(newSubscription.annual_price),
    });
    setShowAddSubscription(null);
    setNewSubscription({ tracker_type: 'GT06', start_date: new Date().toISOString().split('T')[0], annual_price: 75000 });
    loadClients();
    loadAllSubscriptions();
  }

  async function updateSubscription() {
    if (!showEditSubscription) return;
    await supabase.from('subscriptions').update({
      tracker_type: editSubscription.tracker_type,
      start_date: editSubscription.start_date,
      end_date: editSubscription.end_date,
      status: editSubscription.status,
      annual_price: Number(editSubscription.annual_price),
    }).eq('id', showEditSubscription.id);
    setShowEditSubscription(null);
    loadClients();
    loadAllSubscriptions();
  }

  async function renewSubscription() {
    if (!showRenewSub) return;
    setRenewSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      let newStart: string;
      if (renewForm.continuous) {
        const afterOld = new Date(showRenewSub.end_date);
        afterOld.setDate(afterOld.getDate() + 1);
        newStart = afterOld.toISOString().split('T')[0];
      } else {
        newStart = today;
      }
      const newEnd = new Date(new Date(newStart).setFullYear(new Date(newStart).getFullYear() + 1)).toISOString().split('T')[0];

      await supabase.from('subscriptions').update({
        start_date: newStart,
        end_date: newEnd,
        status: 'Actif',
        annual_price: Number(renewForm.annual_price),
      }).eq('id', showRenewSub.id);

      if (renewForm.create_invoice) {
        const clientId = showRenewSub.vehicles?.client_id;
        const vehicleReg = showRenewSub.vehicles?.registration || '';
        const invNumber = `REN-${Date.now()}`;
        const { data: inv } = await supabase.from('invoices').insert({
          invoice_number: invNumber,
          client_id: clientId,
          invoice_date: today,
          total_amount: Number(renewForm.annual_price),
          status: 'En attente',
        }).select().single();
        if (inv) {
          await supabase.from('invoice_lines').insert({
            invoice_id: inv.id,
            description: `Renouvellement abonnement ${showRenewSub.tracker_type} - Véhicule ${vehicleReg}`,
            quantity: 1,
            unit_price: Number(renewForm.annual_price),
            line_total: Number(renewForm.annual_price),
          });
        }
      }
      setShowRenewSub(null);
      loadClients();
      loadAllSubscriptions();
    } catch {
      alert('Erreur lors du renouvellement.');
    } finally {
      setRenewSubmitting(false);
    }
  }

  async function deleteClient(id: string) {
    if (!confirm('Supprimer ce client et tous ses véhicules/abonnements ?')) return;
    await supabase.from('clients').delete().eq('id', id);
    loadClients();
    loadAllSubscriptions();
  }

  async function deleteVehicle(id: string) {
    if (!confirm('Supprimer ce véhicule et ses abonnements ?')) return;
    await supabase.from('vehicles').delete().eq('id', id);
    loadClients();
    loadAllSubscriptions();
  }

  async function deleteSubscription(id: string) {
    if (!confirm('Supprimer cet abonnement ?')) return;
    await supabase.from('subscriptions').delete().eq('id', id);
    loadClients();
    loadAllSubscriptions();
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return;
    const header = rows[0].map(h => h.toLowerCase());
    const nameIdx = header.findIndex(h => h.includes('nom') || h.includes('name') || h.includes('raison'));
    const phoneIdx = header.findIndex(h => h.includes('tel') || h.includes('phone') || h.includes('téléphone'));
    const cityIdx = header.findIndex(h => h.includes('ville') || h.includes('city'));
    const regIdx = header.findIndex(h => h.includes('immat') || h.includes('registration') || h.includes('plaque'));
    const modelIdx = header.findIndex(h => h.includes('modèle') || h.includes('model') || h.includes('marque'));

    if (nameIdx === -1) { alert('Colonne "Nom" introuvable dans le CSV'); return; }

    const emailIdx = header.findIndex(h => h.includes('email') || h.includes('courriel') || h.includes('mail'));
    const clientMap = new Map<string, { phone: string; email: string; city: string; vehicles: { registration: string; make_model: string }[] }>();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[nameIdx]?.trim()) continue;
      const name = row[nameIdx].trim();
      if (!clientMap.has(name)) {
        clientMap.set(name, { phone: row[phoneIdx]?.trim() || '', email: emailIdx !== -1 ? row[emailIdx]?.trim() || '' : '', city: row[cityIdx]?.trim() || '', vehicles: [] });
      }
      if (regIdx !== -1 && row[regIdx]?.trim()) {
        clientMap.get(name)!.vehicles.push({ registration: row[regIdx].trim(), make_model: modelIdx !== -1 ? row[modelIdx]?.trim() || '' : '' });
      }
    }

    for (const [name, data] of clientMap) {
      const { data: client } = await supabase.from('clients').insert({ name, phone: data.phone || null, email: data.email || null, city: data.city || null }).select().single();
      if (client && data.vehicles.length > 0) {
        await supabase.from('vehicles').insert(data.vehicles.map(v => ({ client_id: client.id, registration: v.registration, make_model: v.make_model || null })));
      }
    }
    setShowImport(false);
    loadClients();
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.city || '').toLowerCase().includes(search.toLowerCase())
  );

  function getSubscriptionStatusBadge(status: string, endDate: string) {
    const days = daysUntil(endDate);
    if (status === 'Expiré') return <span className="badge-danger">Expiré</span>;
    if (days <= 30 && days >= 0) return <span className="badge-warning">Relance ({days}j)</span>;
    return <span className="badge-success">{status}</span>;
  }

  // Subscription tab helpers
  const subSelectedClient = subClients.find(c => c.id === subSelectedClientId);
  const subAvailableSims = subStock.filter(s => s.item_type.includes('SIM'));

  const filteredSubscriptions = allSubscriptions.filter(s => {
    if (subFilterStatus === 'all') return true;
    const days = daysUntil(s.end_date);
    if (subFilterStatus === 'Actif') return s.status === 'Actif' && days > 30;
    if (subFilterStatus === 'Relance') return s.status !== 'Expiré' && days <= 30 && days >= 0;
    if (subFilterStatus === 'Expiré') return s.status === 'Expiré' || days < 0;
    return true;
  });

  const subStats = {
    total: allSubscriptions.length,
    actifs: allSubscriptions.filter(s => s.status === 'Actif' && daysUntil(s.end_date) > 30).length,
    relance: allSubscriptions.filter(s => s.status !== 'Expiré' && daysUntil(s.end_date) <= 30 && daysUntil(s.end_date) >= 0).length,
    expires: allSubscriptions.filter(s => s.status === 'Expiré' || daysUntil(s.end_date) < 0).length,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {(dbError || writeError) && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">⚠ Erreur Supabase — tables <code>clients</code> / <code>vehicules</code> / <code>subscriptions</code></p>
          {dbError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{dbError}</p>}
          {writeError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{writeError}</p>}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CRM & Abonnements</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{clients.length} clients, {allSubscriptions.length} abonnements</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeSubTab === 'clients' && (
            <>
              <button onClick={() => setShowAddClient(true)} className="btn-primary"><Plus className="w-4 h-4" /> Client</button>
              <button onClick={() => setShowImport(true)} className="btn-secondary"><Upload className="w-4 h-4" /> Importer CSV</button>
              <button onClick={() => printElement('clients-table')} className="btn-outline"><Printer className="w-4 h-4" /> Imprimer</button>
            </>
          )}
          {activeSubTab === 'subscriptions' && (
            <>
              <button onClick={openCreateSubModal} className="btn-primary"><Plus className="w-4 h-4" /> Créer un abonnement</button>
              <button onClick={() => printElement('subscriptions-table')} className="btn-outline"><Printer className="w-4 h-4" /> Imprimer</button>
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        <button onClick={() => setActiveSubTab('clients')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSubTab === 'clients' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          <Users className="w-4 h-4" /> Clients ({clients.length})
        </button>
        <button onClick={() => setActiveSubTab('subscriptions')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSubTab === 'subscriptions' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          <SubscriptionIcon className="w-4 h-4" /> Gestion des Abonnements ({allSubscriptions.length})
        </button>
      </div>

      {/* =========== CLIENTS SUB-TAB =========== */}
      {activeSubTab === 'clients' && (
        <div className="card p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-10" placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div id="clients-table" className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="table-header">Nom / Raison Sociale</th>
                  <th className="table-header">Téléphone</th>
                  <th className="table-header">Email</th>
                  <th className="table-header">Ville</th>
                  <th className="table-header">Véhicules</th>
                  <th className="table-header">Abonnements</th>
                  <th className="table-header no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(client => {
                  const vehicles = client.vehicles || [];
                  const allSubs = vehicles.flatMap(v => v.subscriptions || []);
                  const hasExpiring = allSubs.some(s => s.status !== 'Expiré' && daysUntil(s.end_date) <= 30 && daysUntil(s.end_date) >= 0);
                  const isExpanded = expandedClient === client.id;

                  return (
                    <React.Fragment key={client.id}>
                      <tr className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasExpiring ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                        <td className="table-cell font-medium">
                          <div className="flex items-center gap-2">
                            {hasExpiring && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                            <button onClick={() => setShowClientDetail(client)} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline cursor-pointer">
                              {client.name}
                            </button>
                          </div>
                        </td>
                        <td className="table-cell">{client.phone || '-'}</td>
                        <td className="table-cell">{client.email || '-'}</td>
                        <td className="table-cell">{client.city || '-'}</td>
                        <td className="table-cell">{vehicles.length}</td>
                        <td className="table-cell">
                          <div className="flex flex-wrap gap-1">
                            {allSubs.length === 0 && <span className="text-gray-400 text-xs">Aucun</span>}
                            {allSubs.map(s => (
                              <span key={s.id}>{getSubscriptionStatusBadge(s.status, s.end_date)}</span>
                            ))}
                          </div>
                        </td>
                        <td className="table-cell no-print">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setShowEditClient(client); setEditClient({ name: client.name || '', phone: client.phone || '', email: client.email || '', city: client.city || '' }); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => setShowAddVehicle(client.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600" title="Ajouter véhicule"><Car className="w-4 h-4" /></button>
                            <button onClick={() => setExpandedClient(isExpanded ? null : client.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button onClick={() => deleteClient(client.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="space-y-3">
                              {vehicles.map(v => (
                                <div key={v.id} className="card p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Car className="w-4 h-4 text-brand-500" />
                                      <span className="font-medium text-gray-900 dark:text-white">{v.registration}</span>
                                      <span className="text-sm text-gray-500 dark:text-gray-400">{v.make_model || ''}</span>
                                    </div>
                                    <div className="flex items-center gap-1 no-print">
                                      <button onClick={() => setShowAddSubscription(v.id)} className="btn-primary text-xs px-2 py-1"><CreditCard className="w-3 h-3" /> Abonnement</button>
                                      <button onClick={() => { setShowEditVehicle(v); setEditVehicle({ registration: v.registration, make_model: v.make_model || '' }); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600" title="Modifier"><Edit2 className="w-3 h-3" /></button>
                                      <button onClick={() => deleteVehicle(v.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                  </div>
                                  {(v.subscriptions || []).length > 0 && (
                                    <div className="space-y-1">
                                      {(v.subscriptions || []).map(s => (
                                        <div key={s.id} className="flex items-center gap-4 text-sm bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-100 dark:border-gray-800">
                                          <span className="text-gray-600 dark:text-gray-400">{s.tracker_type}</span>
                                          <span className="text-gray-500 dark:text-gray-500">{formatDate(s.start_date)} - {formatDate(s.end_date)}</span>
                                          <span>{getSubscriptionStatusBadge(s.status, s.end_date)}</span>
                                          <span className="text-gray-900 dark:text-white font-medium">{formatCurrency(s.annual_price)}</span>
                                          <button onClick={() => { setShowEditSubscription(s); setEditSubscription({ tracker_type: s.tracker_type, start_date: s.start_date, end_date: s.end_date, status: s.status, annual_price: s.annual_price }); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600 no-print" title="Modifier"><Edit2 className="w-3 h-3" /></button>
                                          <button onClick={() => deleteSubscription(s.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 no-print"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {vehicles.length === 0 && <p className="text-sm text-gray-400">Aucun véhicule enregistré</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun client trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========== GESTION DES ABONNEMENTS SUB-TAB =========== */}
      {activeSubTab === 'subscriptions' && (
        <div className="space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{subStats.total}</p></div>
            <div className="card p-4 border-l-4 border-l-accent-500"><p className="text-sm text-gray-500">Actifs</p><p className="text-2xl font-bold text-accent-600">{subStats.actifs}</p></div>
            <div className="card p-4 border-l-4 border-l-amber-500"><p className="text-sm text-gray-500">En Relance</p><p className="text-2xl font-bold text-amber-600">{subStats.relance}</p></div>
            <div className="card p-4 border-l-4 border-l-red-500"><p className="text-sm text-gray-500">Expirés</p><p className="text-2xl font-bold text-red-600">{subStats.expires}</p></div>
          </div>

          {/* Filter bar */}
          <div className="card p-4">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <select className="select w-auto" value={subFilterStatus} onChange={e => setSubFilterStatus(e.target.value)}>
                <option value="all">Tous les statuts</option>
                <option value="Actif">Actif</option>
                <option value="Relance">En Relance (&lt; 30j)</option>
                <option value="Expiré">Expiré</option>
              </select>
            </div>

            <div id="subscriptions-table" className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="table-header">Client</th>
                    <th className="table-header">Email Client</th>
                    <th className="table-header">Véhicule</th>
                    <th className="table-header">Traceur</th>
                    <th className="table-header">Début</th>
                    <th className="table-header">Fin</th>
                    <th className="table-header">Statut</th>
                    <th className="table-header">Prix annuel</th>
                    <th className="table-header no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map(sub => {
                    const clientName = sub.vehicles?.clients?.name || '-';
                    const clientEmail = sub.vehicles?.clients?.email || '-';
                    const vehicleReg = sub.vehicles?.registration || '-';
                    const vehicleModel = sub.vehicles?.make_model || '';
                    return (
                      <tr key={sub.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="table-cell font-medium">{clientName}</td>
                        <td className="table-cell text-sm text-gray-500">{clientEmail}</td>
                        <td className="table-cell">{vehicleReg}{vehicleModel ? ` - ${vehicleModel}` : ''}</td>
                        <td className="table-cell">{sub.tracker_type}</td>
                        <td className="table-cell">{formatDate(sub.start_date)}</td>
                        <td className="table-cell">{formatDate(sub.end_date)}</td>
                        <td className="table-cell">{getSubscriptionStatusBadge(sub.status, sub.end_date)}</td>
                        <td className="table-cell font-semibold">{formatCurrency(sub.annual_price)}</td>
                        <td className="table-cell no-print">
                          <div className="flex items-center gap-1">
                            {(sub.status === 'Expiré' || sub.status === 'Relance') && (
                              <button
                                onClick={() => { setShowRenewSub(sub); setRenewForm({ annual_price: sub.annual_price, create_invoice: false, continuous: true }); }}
                                className="p-1.5 rounded-lg hover:bg-accent-50 dark:hover:bg-accent-900/20 text-gray-500 hover:text-accent-600"
                                title="Renouveler"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => { setShowEditSubscription(sub); setEditSubscription({ tracker_type: sub.tracker_type, start_date: sub.start_date, end_date: sub.end_date, status: sub.status, annual_price: sub.annual_price }); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => deleteSubscription(sub.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSubscriptions.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">Aucun abonnement trouvé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========== MODALS =========== */}

      {/* Add Client Modal */}
      <Modal open={showAddClient} onClose={() => setShowAddClient(false)} title="Nouveau Client">
        <div className="space-y-4">
          <div><label className="label">Nom / Raison Sociale *</label><input className="input" value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} /></div>
          <div><label className="label">Email <span className="text-gray-400 font-normal">(optionnel)</span></label><input type="email" className="input" value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} placeholder="client@email.com" /></div>
          <div><label className="label">Téléphone</label><input className="input" value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} /></div>
          <div><label className="label">Ville</label>
            <select className="select" value={newClient.city} onChange={e => setNewClient(p => ({ ...p, city: e.target.value }))}>
              <option value="">Sélectionner...</option>
              <option value="Cotonou">Cotonou</option>
              <option value="Calavi">Calavi</option>
              <option value="Porto-Novo">Porto-Novo</option>
              <option value="Parakou">Parakou</option>
              <option value="Abomey-Calavi">Abomey-Calavi</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <button onClick={addClient} className="btn-primary w-full" disabled={!newClient.name.trim()}>Ajouter le client</button>
        </div>
      </Modal>

      {/* Edit Client Modal */}
      <Modal open={!!showEditClient} onClose={() => setShowEditClient(null)} title="Modifier le client">
        <div className="space-y-4">
          <div><label className="label">Nom / Raison Sociale *</label><input className="input" value={editClient.name} onChange={e => setEditClient(p => ({ ...p, name: e.target.value }))} /></div>
          <div><label className="label">Email <span className="text-gray-400 font-normal">(optionnel)</span></label><input type="email" className="input" value={editClient.email} onChange={e => setEditClient(p => ({ ...p, email: e.target.value }))} /></div>
          <div><label className="label">Téléphone</label><input className="input" value={editClient.phone} onChange={e => setEditClient(p => ({ ...p, phone: e.target.value }))} /></div>
          <div><label className="label">Ville</label>
            <select className="select" value={editClient.city} onChange={e => setEditClient(p => ({ ...p, city: e.target.value }))}>
              <option value="">Sélectionner...</option>
              <option value="Cotonou">Cotonou</option>
              <option value="Calavi">Calavi</option>
              <option value="Porto-Novo">Porto-Novo</option>
              <option value="Parakou">Parakou</option>
              <option value="Abomey-Calavi">Abomey-Calavi</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <button onClick={updateClient} className="btn-primary w-full" disabled={!editClient.name.trim()}>Enregistrer les modifications</button>
        </div>
      </Modal>

      {/* Add Vehicle Modal */}
      <Modal open={!!showAddVehicle} onClose={() => setShowAddVehicle(null)} title="Nouveau Véhicule">
        <div className="space-y-4">
          <div><label className="label">Immatriculation *</label><input className="input" value={newVehicle.registration} onChange={e => setNewVehicle(p => ({ ...p, registration: e.target.value }))} placeholder="BJ-001-AB" /></div>
          <div><label className="label">Marque / Modèle</label><input className="input" value={newVehicle.make_model} onChange={e => setNewVehicle(p => ({ ...p, make_model: e.target.value }))} placeholder="Toyota Hilux 2020" /></div>
          <button onClick={() => showAddVehicle && addVehicle(showAddVehicle)} className="btn-primary w-full" disabled={!newVehicle.registration.trim()}>Ajouter le véhicule</button>
        </div>
      </Modal>

      {/* Edit Vehicle Modal */}
      <Modal open={!!showEditVehicle} onClose={() => setShowEditVehicle(null)} title="Modifier le véhicule">
        <div className="space-y-4">
          <div><label className="label">Immatriculation *</label><input className="input" value={editVehicle.registration} onChange={e => setEditVehicle(p => ({ ...p, registration: e.target.value }))} /></div>
          <div><label className="label">Marque / Modèle</label><input className="input" value={editVehicle.make_model} onChange={e => setEditVehicle(p => ({ ...p, make_model: e.target.value }))} /></div>
          <button onClick={updateVehicle} className="btn-primary w-full" disabled={!editVehicle.registration.trim()}>Enregistrer les modifications</button>
        </div>
      </Modal>

      {/* Add Subscription Modal (from client expand) */}
      <Modal open={!!showAddSubscription} onClose={() => setShowAddSubscription(null)} title="Créer un abonnement annuel">
        <div className="space-y-4">
          <div><label className="label">Type de traceur *</label>
            <select className="select" value={newSubscription.tracker_type} onChange={e => setNewSubscription(p => ({ ...p, tracker_type: e.target.value }))}>
              <option value="GT06">Traceur GT06</option>
              <option value="JT808">Traceur JT808</option>
            </select>
          </div>
          <div><label className="label">Date de début *</label><input type="date" className="input" value={newSubscription.start_date} onChange={e => setNewSubscription(p => ({ ...p, start_date: e.target.value }))} /></div>
          <div className="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg text-sm text-brand-700 dark:text-brand-300">
            Date de fin (auto) : <strong>{newSubscription.start_date ? formatDate(new Date(new Date(newSubscription.start_date).setFullYear(new Date(newSubscription.start_date).getFullYear() + 1)).toISOString()) : '-'}</strong>
          </div>
          <div><label className="label">Prix annuel (FCFA)</label><input type="number" className="input" value={newSubscription.annual_price} onChange={e => setNewSubscription(p => ({ ...p, annual_price: Number(e.target.value) }))} /></div>
          <button onClick={() => showAddSubscription && addSubscription(showAddSubscription)} className="btn-success w-full">Créer l'abonnement annuel</button>
        </div>
      </Modal>

      {/* Edit Subscription Modal */}
      <Modal open={!!showEditSubscription} onClose={() => setShowEditSubscription(null)} title="Modifier l'abonnement">
        <div className="space-y-4">
          <div><label className="label">Type de traceur *</label>
            <select className="select" value={editSubscription.tracker_type} onChange={e => setEditSubscription(p => ({ ...p, tracker_type: e.target.value }))}>
              <option value="GT06">Traceur GT06</option>
              <option value="JT808">Traceur JT808</option>
            </select>
          </div>
          <div><label className="label">Date de début *</label><input type="date" className="input" value={editSubscription.start_date} onChange={e => setEditSubscription(p => ({ ...p, start_date: e.target.value }))} /></div>
          <div><label className="label">Date de fin *</label><input type="date" className="input" value={editSubscription.end_date} onChange={e => setEditSubscription(p => ({ ...p, end_date: e.target.value }))} /></div>
          <div><label className="label">Statut</label>
            <select className="select" value={editSubscription.status} onChange={e => setEditSubscription(p => ({ ...p, status: e.target.value }))}>
              <option value="Actif">Actif</option>
              <option value="Expiré">Expiré</option>
              <option value="Relance">Relance</option>
            </select>
          </div>
          <div><label className="label">Prix annuel (FCFA)</label><input type="number" className="input" value={editSubscription.annual_price} onChange={e => setEditSubscription(p => ({ ...p, annual_price: Number(e.target.value) }))} /></div>
          <button onClick={updateSubscription} className="btn-primary w-full">Enregistrer les modifications</button>
        </div>
      </Modal>

      {/* Renew Subscription Modal */}
      {showRenewSub && (() => {
        const today = new Date().toISOString().split('T')[0];
        const afterOld = new Date(showRenewSub.end_date);
        afterOld.setDate(afterOld.getDate() + 1);
        const renewedStart = renewForm.continuous ? afterOld.toISOString().split('T')[0] : today;
        const renewedEnd = new Date(new Date(renewedStart).setFullYear(new Date(renewedStart).getFullYear() + 1)).toISOString().split('T')[0];
        const clientName = showRenewSub.vehicles?.clients?.name || '-';
        const vehicleReg = showRenewSub.vehicles?.registration || '-';
        return (
          <Modal open={true} onClose={() => setShowRenewSub(null)} title="Renouveler l'abonnement">
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm space-y-1">
                <p className="font-medium text-gray-900 dark:text-white">{clientName} — {vehicleReg}</p>
                <p className="text-gray-500">Traceur : {showRenewSub.tracker_type}</p>
                <p className="text-gray-500 line-through">Ancien contrat : {formatDate(showRenewSub.start_date)} → {formatDate(showRenewSub.end_date)}</p>
              </div>

              <div>
                <label className="label">Type de renouvellement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRenewForm(p => ({ ...p, continuous: true }))}
                    className={`p-3 rounded-lg border-2 text-sm text-left transition-all ${renewForm.continuous ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                  >
                    <p className="font-medium">Continu</p>
                    <p className="text-xs opacity-75">Reprend au lendemain de l'expiration</p>
                  </button>
                  <button
                    onClick={() => setRenewForm(p => ({ ...p, continuous: false }))}
                    className={`p-3 rounded-lg border-2 text-sm text-left transition-all ${!renewForm.continuous ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                  >
                    <p className="font-medium">Depuis aujourd'hui</p>
                    <p className="text-xs opacity-75">Repart du {new Date().toLocaleDateString('fr-FR')}</p>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-accent-50 dark:bg-accent-900/20 rounded-lg text-sm text-accent-700 dark:text-accent-300 space-y-0.5">
                <p className="font-semibold">Nouveau contrat :</p>
                <p>{formatDate(renewedStart)} → {formatDate(renewedEnd)}</p>
              </div>

              <div>
                <label className="label">Prix annuel (FCFA)</label>
                <input type="number" className="input" value={renewForm.annual_price} onChange={e => setRenewForm(p => ({ ...p, annual_price: Number(e.target.value) }))} />
              </div>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input type="checkbox" className="w-4 h-4 rounded accent-brand-600" checked={renewForm.create_invoice} onChange={e => setRenewForm(p => ({ ...p, create_invoice: e.target.checked }))} />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Générer une facture de renouvellement</p>
                  <p className="text-xs text-gray-500">Crée automatiquement une facture "En attente" dans la Facturation</p>
                </div>
              </label>

              <button onClick={renewSubscription} disabled={renewSubmitting || renewForm.annual_price <= 0} className="btn-success w-full">
                {renewSubmitting ? 'Renouvellement...' : `✓ Confirmer le renouvellement — ${formatCurrency(renewForm.annual_price)}`}
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* Create Subscription Modal (centralized) */}
      <Modal open={showCreateSub} onClose={() => setShowCreateSub(false)} title="Créer un abonnement" wide>
        <div className="space-y-4">
          <div><label className="label">Client *</label>
            <select className="select" value={subSelectedClientId} onChange={e => { setSubSelectedClientId(e.target.value); setSubSelectedVehicleId(''); }}>
              <option value="">Sélectionner un client...</option>
              {subClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div><label className="label">Véhicule du client *</label>
            <select className="select" value={subSelectedVehicleId} onChange={e => setSubSelectedVehicleId(e.target.value)} disabled={!subSelectedClientId}>
              <option value="">{subSelectedClientId ? 'Sélectionner un véhicule...' : 'Choisir d\'abord un client'}</option>
              {subSelectedClient?.vehicles?.map(v => (
                <option key={v.id} value={v.id}>{v.registration} - {v.make_model || 'N/A'}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Modèle de traceur *</label>
              <select className="select" value={subTrackerType} onChange={e => { setSubTrackerType(e.target.value); if (e.target.value === 'JT808') setSubPrice(85000); else setSubPrice(75000); }}>
                <option value="GT06">Traceur GT06</option>
                <option value="JT808">Traceur JT808</option>
              </select>
            </div>
            <div><label className="label">Carte SIM (En Stock)</label>
              <select className="select" value={subSelectedSimId} onChange={e => setSubSelectedSimId(e.target.value)}>
                <option value="">Sélectionner une SIM...</option>
                {subAvailableSims.map(s => (
                  <option key={s.id} value={s.id}>{s.item_type} - N°: {s.serial_number}</option>
                ))}
              </select>
              {subAvailableSims.length === 0 && <p className="text-xs text-gray-400 mt-1">Aucune SIM en stock</p>}
            </div>
          </div>

          <div><label className="label">Date de début *</label><input type="date" className="input" value={subStartDate} onChange={e => setSubStartDate(e.target.value)} /></div>
          <div className="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg text-sm text-brand-700 dark:text-brand-300">
            Date de fin (auto) : <strong>{subStartDate ? formatDate(new Date(new Date(subStartDate).setFullYear(new Date(subStartDate).getFullYear() + 1)).toISOString()) : '-'}</strong>
          </div>

          <div><label className="label">Prix annuel (FCFA)</label><input type="number" className="input" value={subPrice} onChange={e => setSubPrice(Number(e.target.value))} /></div>

          {subSelectedClient && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
              <p className="text-gray-500">Email du client (pour envoi automatique)</p>
              <p className="font-medium text-gray-900 dark:text-white">{subSelectedClient.email || 'Non renseigné'}</p>
            </div>
          )}

          <button onClick={createSubscription} className="btn-success w-full" disabled={subSubmitting || !subSelectedClientId || !subSelectedVehicleId || subPrice <= 0}>
            {subSubmitting ? 'Création en cours...' : 'Créer l\'abonnement'}
          </button>
        </div>
      </Modal>

      {/* Import CSV Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importer des clients (CSV/Excel)">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Chargez un fichier CSV avec les colonnes : <strong>Nom</strong>, Email, Téléphone, Ville, Immatriculation, Modèle.
            Les clients et véhicules seront créés automatiquement.
          </p>
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-3">Glissez votre fichier ou cliquez pour sélectionner</p>
            <input ref={importFileRef} type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden" onChange={handleCSVImport} />
            <button onClick={() => importFileRef.current?.click()} className="btn-primary">Sélectionner un fichier</button>
          </div>
        </div>
      </Modal>

      {/* Client Detail Modal */}
      <Modal open={!!showClientDetail} onClose={() => setShowClientDetail(null)} title="Fiche Client" wide>
        {showClientDetail && (
          <div id="client-detail-print">
            <div className="biz-header" style={{ textAlign: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #111' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{BUSINESS_INFO.name}</h2>
              <div style={{ fontSize: 11, color: '#444', lineHeight: 1.5 }}>
                <strong>N° IFU :</strong> {BUSINESS_INFO.ifu} | <strong>N° RCCM :</strong> {BUSINESS_INFO.rccm}<br />
                <strong>Exploitant :</strong> {BUSINESS_INFO.owner}<br />
                {BUSINESS_INFO.address}<br />
                Tél : {BUSINESS_INFO.phone} | Email : {BUSINESS_INFO.email}
              </div>
            </div>
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{showClientDetail.name}</h2>
              <p className="text-sm text-gray-500">{showClientDetail.email || 'N/A'} | {showClientDetail.phone || 'N/A'} | {showClientDetail.city || 'N/A'}</p>
            </div>
            <div className="space-y-4">
              {(showClientDetail.vehicles || []).map(v => (
                <div key={v.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{v.registration} - {v.make_model || 'N/A'}</h3>
                  {(v.subscriptions || []).map(s => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-1 border-t border-gray-100 dark:border-gray-800">
                      <span>{s.tracker_type}</span>
                      <span>{formatDate(s.start_date)} → {formatDate(s.end_date)}</span>
                      <span>{getSubscriptionStatusBadge(s.status, s.end_date)}</span>
                      <span className="font-medium">{formatCurrency(s.annual_price)}</span>
                    </div>
                  ))}
                  {(v.subscriptions || []).length === 0 && <p className="text-sm text-gray-400">Aucun abonnement</p>}
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end no-print">
              <button onClick={() => printElement('client-detail-print')} className="btn-outline"><Printer className="w-4 h-4" /> Imprimer la fiche</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
