import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, generateInvoiceNumber, printElement, BUSINESS_INFO } from '../lib/utils';
import { Zap, Printer, CheckCircle, Loader2 } from 'lucide-react';

interface Client { id: string; name: string; email: string | null; vehicles: Vehicle[] }
interface Vehicle { id: string; registration: string; make_model: string | null; client_id: string }
interface StockItem { id: string; item_type: string; serial_number: string; status: string }

export default function InstallationPage() {
  const { profile, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dbError, _setDbError] = useState<string | null>(null);
  const [writeError, _setWriteError] = useState<string | null>(null);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedTrackerId, setSelectedTrackerId] = useState('');
  const [selectedSimId, setSelectedSimId] = useState('');
  const [price, setPrice] = useState(75000);

  const [result, setResult] = useState<{
    clientName: string;
    registration: string;
    trackerSerial: string;
    simSerial: string;
    invoiceNumber: string;
    amount: number;
    endDate: string;
    trackerType: string;
  } | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [clientRes, stockRes] = await Promise.all([
        supabase.from('clients').select('id, name, email, vehicles(id, registration, make_model, client_id)').order('name'),
        supabase.from('stock').select('*').eq('status', 'En Stock').order('item_type'),
      ]);
      setClients(clientRes.data || []);
      setStock(stockRes.data || []);
    } finally {
      setLoading(false);
    }
  }

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const availableTrackers = stock.filter(s => s.item_type.includes('Traceur'));
  const availableSims = stock.filter(s => s.item_type.includes('SIM'));
  const selectedTracker = stock.find(s => s.id === selectedTrackerId);

  async function validateInstallation() {
    if (!selectedClientId || !selectedVehicleId || !selectedTrackerId || !selectedSimId || price <= 0) {
      alert('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    setSubmitting(true);
    setSuccess(false);
    setResult(null);

    try {
      const clientName = selectedClient?.name || '';
      const vehicle = selectedClient?.vehicles?.find(v => v.id === selectedVehicleId);
      const registration = vehicle?.registration || '';
      const trackerType = selectedTracker?.item_type?.replace('Traceur ', '') || 'GT06';
      const trackerSerial = selectedTracker?.serial_number || '';
      const simSerial = stock.find(s => s.id === selectedSimId)?.serial_number || '';
      const startDate = new Date().toISOString().split('T')[0];
      const endDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
      const invoiceNumber = generateInvoiceNumber();

      // 1. Create subscription (activates annual subscription +1 year)
      await supabase.from('subscriptions').insert({
        vehicle_id: selectedVehicleId,
        tracker_type: trackerType,
        start_date: startDate,
        end_date: endDate,
        status: 'Actif',
        annual_price: price,
        tracker_id: selectedTrackerId,
        sim_id: selectedSimId,
        installed_by: profile?.full_name ?? user?.email ?? null,
      }).select().single();

      // 2. Update tracker status to "Installé"
      await supabase.from('stock').update({
        status: 'Installé',
        installed_client_name: clientName,
      }).eq('id', selectedTrackerId);

      // 3. Update SIM status to "Installé"
      await supabase.from('stock').update({
        status: 'Installé',
        installed_client_name: clientName,
      }).eq('id', selectedSimId);

      // 4. Generate invoice (Payée)
      const { data: invoice } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        client_id: selectedClientId,
        invoice_date: startDate,
        total_amount: price,
        status: 'Payée',
      }).select().single();

      if (invoice) {
        await supabase.from('invoice_lines').insert({
          invoice_id: invoice.id,
          description: `Installation traceur ${trackerType} - ${registration}`,
          quantity: 1,
          unit_price: price,
          line_total: price,
        });
      }

      // 5. Record transaction in accounting
      await supabase.from('transactions').insert({
        transaction_type: 'Entrée',
        description: `Installation ${trackerType} - ${clientName} (${registration})`,
        amount: price,
        invoice_id: invoice?.id || null,
        category: 'Abonnement',
      });

      // 6. Send invoice email
      const clientEmail = selectedClient?.email || '';
      if (clientEmail && invoice) {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
            body: JSON.stringify({
              invoiceId: invoice.id,
              invoiceNumber,
              clientName,
              clientEmail,
              totalAmount: price,
              lines: [{ description: `Installation traceur ${trackerType} - ${registration}`, quantity: 1, unit_price: price, line_total: price }],
            }),
          });
        } catch {
          // Email sending is best-effort
        }
      }

      setResult({
        clientName,
        registration,
        trackerSerial,
        simSerial,
        invoiceNumber,
        amount: price,
        endDate,
        trackerType,
      });
      setSuccess(true);
    } catch (err) {
      alert('Erreur lors de la validation. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSelectedClientId('');
    setSelectedVehicleId('');
    setSelectedTrackerId('');
    setSelectedSimId('');
    setPrice(75000);
    setSuccess(false);
    setResult(null);
    loadData();
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {(dbError || writeError) && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">⚠ Erreur Supabase — tables <code>clients</code> / <code>stocks</code> / <code>factures</code></p>
          {dbError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{dbError}</p>}
          {writeError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{writeError}</p>}
        </div>
      )}
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent-50 dark:bg-accent-900/20 flex items-center justify-center mx-auto mb-4 ring-1 ring-accent-100 dark:ring-accent-800">
          <Zap className="w-8 h-8 text-accent-600 dark:text-accent-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nouvelle Installation Terminée</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Validez une installation en un clic : abonnement, stock, facture et comptabilité sont traités automatiquement.
        </p>
      </div>

      {!success ? (
        <div className="card p-6 space-y-5">
          <div>
            <label className="label">Client *</label>
            <select className="select" value={selectedClientId} onChange={e => { setSelectedClientId(e.target.value); setSelectedVehicleId(''); }}>
              <option value="">Sélectionner un client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Véhicule *</label>
            <select className="select" value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} disabled={!selectedClientId}>
              <option value="">{selectedClientId ? 'Sélectionner un véhicule...' : 'Choisir d\'abord un client'}</option>
              {selectedClient?.vehicles?.map(v => (
                <option key={v.id} value={v.id}>{v.registration} - {v.make_model || 'N/A'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Traceur disponible *</label>
            <select className="select" value={selectedTrackerId} onChange={e => { setSelectedTrackerId(e.target.value); const t = stock.find(s => s.id === e.target.value); if (t?.item_type.includes('JT808')) setPrice(85000); else setPrice(75000); }}>
              <option value="">Sélectionner un traceur...</option>
              {availableTrackers.map(t => (
                <option key={t.id} value={t.id}>{t.item_type} - IMEI: {t.serial_number}</option>
              ))}
            </select>
            {availableTrackers.length === 0 && <p className="text-xs text-red-500 mt-1">Aucun traceur en stock</p>}
          </div>

          <div>
            <label className="label">Carte SIM disponible *</label>
            <select className="select" value={selectedSimId} onChange={e => setSelectedSimId(e.target.value)}>
              <option value="">Sélectionner une SIM...</option>
              {availableSims.map(s => (
                <option key={s.id} value={s.id}>{s.item_type} - N°: {s.serial_number}</option>
              ))}
            </select>
            {availableSims.length === 0 && <p className="text-xs text-red-500 mt-1">Aucune SIM en stock</p>}
          </div>

          <div>
            <label className="label">Prix payé (FCFA) *</label>
            <input type="number" className="input" value={price} onChange={e => setPrice(Number(e.target.value))} />
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-1 text-sm">
            <p className="font-semibold text-gray-900 dark:text-white mb-2">Résumé des actions automatiques :</p>
            <p className="text-gray-600 dark:text-gray-400">1. Abonnement annuel créé (du {formatDate(new Date().toISOString())} au {formatDate(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString())})</p>
            <p className="text-gray-600 dark:text-gray-400">2. Traceur et SIM passent en "Installé"</p>
            <p className="text-gray-600 dark:text-gray-400">3. Facture générée au statut "Payée"</p>
            <p className="text-gray-600 dark:text-gray-400">4. Montant enregistré en comptabilité (Entrée)</p>
            <p className="text-gray-600 dark:text-gray-400">5. Facture envoyée par email au client</p>
            <p className="text-gray-600 dark:text-gray-400">6. Reçu disponible pour impression</p>
          </div>

          <button
            onClick={validateInstallation}
            disabled={submitting || !selectedClientId || !selectedVehicleId || !selectedTrackerId || !selectedSimId || price <= 0}
            className="btn-success w-full py-3 text-base"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Traitement en cours...</>
            ) : (
              <><Zap className="w-5 h-5" /> Valider l'installation</>
            )}
          </button>
        </div>
      ) : (
        result && (
          <div className="space-y-6">
            <div className="card p-6 border-l-4 border-l-accent-500">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-8 h-8 text-accent-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Installation validée avec succès !</h2>
                  <p className="text-sm text-gray-500">Les 6 actions ont été exécutées automatiquement.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-500">Client</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{result.clientName}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-500">Véhicule</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{result.registration}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-500">Traceur</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{result.trackerType} (IMEI: {result.trackerSerial})</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-500">SIM</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{result.simSerial}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-500">Facture</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{result.invoiceNumber} (Payée)</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-500">Abonnement jusqu'au</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatDate(result.endDate)}</p>
                </div>
                <div className="p-3 bg-accent-50 dark:bg-accent-900/20 rounded-lg sm:col-span-2">
                  <p className="text-accent-600 dark:text-accent-400">Montant payé</p>
                  <p className="text-2xl font-bold text-accent-700 dark:text-accent-300">{formatCurrency(result.amount)}</p>
                </div>
              </div>
            </div>

            {/* Print receipt */}
            <div id="receipt-print" className="hidden">
              <div className="receipt-box">
                <div className="biz-header">
                  <h2>{BUSINESS_INFO.name}</h2>
                  <div className="biz-meta">
                    <strong>N° IFU :</strong> {BUSINESS_INFO.ifu} | <strong>N° RCCM :</strong> {BUSINESS_INFO.rccm}<br />
                    <strong>Exploitant :</strong> {BUSINESS_INFO.owner}<br />
                    {BUSINESS_INFO.address}<br />
                    Tél : {BUSINESS_INFO.phone} | Email : {BUSINESS_INFO.email}
                  </div>
                </div>
                <hr style={{ margin: '12px 0', border: 'none', borderTop: '2px solid #111' }} />
                <h3 style={{ margin: '12px 0', fontSize: '14px' }}>REÇU D'INSTALLATION</h3>
                <div className="line"><span>Client</span><span>{result.clientName}</span></div>
                <div className="line"><span>Véhicule</span><span>{result.registration}</span></div>
                <div className="line"><span>Traceur</span><span>{result.trackerType}</span></div>
                <div className="line"><span>IMEI</span><span>{result.trackerSerial}</span></div>
                <div className="line"><span>SIM</span><span>{result.simSerial}</span></div>
                <div className="line"><span>Date</span><span>{formatDate(new Date().toISOString())}</span></div>
                <div className="line"><span>Abonnement</span><span>Jusqu'au {formatDate(result.endDate)}</span></div>
                <div className="line"><span>Facture</span><span>{result.invoiceNumber}</span></div>
                <div className="line total-line"><span>Total payé</span><span>{formatCurrency(result.amount)}</span></div>
                <p style={{ marginTop: '20px', fontSize: '11px', color: '#999' }}>Merci pour votre confiance - {BUSINESS_INFO.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => printElement('receipt-print')} className="btn-success flex-1 py-3 text-base">
                <Printer className="w-5 h-5" /> Imprimer le reçu de l'installation
              </button>
              <button onClick={resetForm} className="btn-secondary flex-1 py-3 text-base">
                Nouvelle installation
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
