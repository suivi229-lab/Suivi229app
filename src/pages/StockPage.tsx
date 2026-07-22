import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { parseCSV, printElement } from '../lib/utils';
import Modal from '../components/Modal';
import { Plus, Upload, Printer, Search, Trash2, Edit2 } from 'lucide-react';

interface StockItem {
  id: string;
  item_type: string;
  serial_number: string;
  status: string;
  installed_client_name: string | null;
  created_at: string;
}

export default function StockPage() {
  const { role } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showEdit, setShowEdit] = useState<StockItem | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [newItem, setNewItem] = useState({ item_type: 'Traceur GT06', serial_number: '' });
  const [editItem, setEditItem] = useState<Partial<StockItem>>({});
  const [dbError, setDbError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => { loadStock(); }, []);

  async function loadStock() {
    setLoading(true);
    setDbError(null);
    try {
      const { data, error } = await supabase.from('stock').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('[Stock] ❌ loadStock:', error.code, error.message);
        setDbError(`Erreur chargement stock — ${error.message} (code: ${error.code})`);
      }
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  }

  async function addItem() {
    if (!newItem.serial_number.trim()) return;
    setWriteError(null);
    const { error } = await supabase.from('stock').insert({ item_type: newItem.item_type, serial_number: newItem.serial_number.trim(), status: 'En Stock' });
    if (error) { console.error('[Stock] ❌ addItem:', error.message); setWriteError(`Impossible d'ajouter l'article — ${error.message} (${error.code})`); return; }
    setNewItem({ item_type: 'Traceur GT06', serial_number: '' });
    setShowAdd(false);
    loadStock();
  }

  async function updateItem() {
    if (!showEdit) return;
    await supabase.from('stock').update({
      item_type: editItem.item_type,
      serial_number: editItem.serial_number,
      status: editItem.status,
      installed_client_name: editItem.status === 'En Stock' ? null : editItem.installed_client_name,
    }).eq('id', showEdit.id);
    setShowEdit(null);
    loadStock();
  }

  async function deleteItem(id: string) {
    if (!confirm('Supprimer cet élément du stock ?')) return;
    await supabase.from('stock').delete().eq('id', id);
    loadStock();
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return;
    const header = rows[0].map(h => h.toLowerCase());
    const typeIdx = header.findIndex(h => h.includes('type') || h.includes('matériel') || h.includes('materiel'));
    const serialIdx = header.findIndex(h => h.includes('serial') || h.includes('imei') || h.includes('numéro') || h.includes('numero') || h.includes('sim'));

    if (serialIdx === -1) { alert('Colonne "Numéro de série / IMEI" introuvable'); return; }

    const inserts = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const serial = row[serialIdx]?.trim();
      if (!serial) continue;
      const itemType = typeIdx !== -1 ? row[typeIdx]?.trim() || 'Traceur GT06' : 'Traceur GT06';
      inserts.push({ item_type: itemType, serial_number: serial, status: 'En Stock' });
    }
    if (inserts.length > 0) {
      await supabase.from('stock').insert(inserts);
    }
    setShowImport(false);
    loadStock();
  }

  const filtered = items.filter(i => {
    const matchSearch = i.serial_number.toLowerCase().includes(search.toLowerCase()) || i.item_type.toLowerCase().includes(search.toLowerCase()) || (i.installed_client_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusBadge = (status: string) => {
    if (status === 'En Stock') return <span className="badge-success">En Stock</span>;
    if (status === 'Installé') return <span className="badge-info">Installé</span>;
    return <span className="badge-danger">Défectueux</span>;
  };

  const stats = {
    total: items.length,
    enStock: items.filter(i => i.status === 'En Stock').length,
    installe: items.filter(i => i.status === 'Installé').length,
    defectueux: items.filter(i => i.status === 'Défectueux').length,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {(dbError || writeError) && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">⚠ Erreur Supabase — table <code>stocks</code></p>
          {dbError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{dbError}</p>}
          {writeError && <p className="text-xs font-mono text-red-600 dark:text-red-300">{writeError}</p>}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stock & Logistique</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{items.length} éléments enregistrés</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Ajouter</button>
          <button onClick={() => setShowImport(true)} className="btn-secondary"><Upload className="w-4 h-4" /> Importer CSV</button>
          <button onClick={() => printElement('stock-table')} className="btn-outline"><Printer className="w-4 h-4" /> Imprimer</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p></div>
        <div className="card p-4 border-l-4 border-l-accent-500"><p className="text-sm text-gray-500">En Stock</p><p className="text-2xl font-bold text-accent-600">{stats.enStock}</p></div>
        <div className="card p-4 border-l-4 border-l-brand-500"><p className="text-sm text-gray-500">Installé</p><p className="text-2xl font-bold text-brand-600">{stats.installe}</p></div>
        <div className="card p-4 border-l-4 border-l-red-500"><p className="text-sm text-gray-500">Défectueux</p><p className="text-2xl font-bold text-red-600">{stats.defectueux}</p></div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-10" placeholder="Rechercher par IMEI, SIM, type..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Tous les statuts</option>
            <option value="En Stock">En Stock</option>
            <option value="Installé">Installé</option>
            <option value="Défectueux">Défectueux</option>
          </select>
        </div>

        <div id="stock-table" className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Type de Matériel</th>
                <th className="table-header">N° Série / IMEI</th>
                <th className="table-header">Statut</th>
                <th className="table-header">Installé chez</th>
                <th className="table-header no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="table-cell font-medium">{item.item_type}</td>
                  <td className="table-cell"><code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{item.serial_number}</code></td>
                  <td className="table-cell">{statusBadge(item.status)}</td>
                  <td className="table-cell">{item.installed_client_name || '-'}</td>
                  <td className="table-cell no-print">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setShowEdit(item); setEditItem(item); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600"><Edit2 className="w-4 h-4" /></button>
                      {role === 'Admin' && <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Aucun élément trouvé</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Ajouter au stock">
        <div className="space-y-4">
          <div><label className="label">Type de matériel *</label>
            <select className="select" value={newItem.item_type} onChange={e => setNewItem(p => ({ ...p, item_type: e.target.value }))}>
              <option value="Traceur GT06">Traceur GT06</option>
              <option value="Traceur JT808">Traceur JT808</option>
              <option value="Carte SIM">Carte SIM</option>
            </select>
          </div>
          <div><label className="label">N° Série / IMEI *</label><input className="input" value={newItem.serial_number} onChange={e => setNewItem(p => ({ ...p, serial_number: e.target.value }))} placeholder="860123456789000" /></div>
          <button onClick={addItem} className="btn-primary w-full" disabled={!newItem.serial_number.trim()}>Ajouter au stock</button>
        </div>
      </Modal>

      {/* Import CSV Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importer un tableau de stock (CSV)">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Chargez un fichier CSV avec les colonnes : <strong>Type</strong> (optionnel), <strong>Numéro de série / IMEI</strong>.
            Tous les éléments seront ajoutés avec le statut "En Stock".
          </p>
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-3">Glissez votre fichier ou cliquez pour sélectionner</p>
            <input ref={importFileRef} type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden" onChange={handleCSVImport} />
            <button onClick={() => importFileRef.current?.click()} className="btn-primary">Sélectionner un fichier</button>
          </div>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="Modifier l'élément">
        <div className="space-y-4">
          <div><label className="label">Type de matériel</label>
            <select className="select" value={editItem.item_type || ''} onChange={e => setEditItem(p => ({ ...p, item_type: e.target.value }))}>
              <option value="Traceur GT06">Traceur GT06</option>
              <option value="Traceur JT808">Traceur JT808</option>
              <option value="Carte SIM">Carte SIM</option>
            </select>
          </div>
          <div><label className="label">N° Série / IMEI</label><input className="input" value={editItem.serial_number || ''} onChange={e => setEditItem(p => ({ ...p, serial_number: e.target.value }))} /></div>
          <div><label className="label">Statut</label>
            <select className="select" value={editItem.status || 'En Stock'} onChange={e => setEditItem(p => ({ ...p, status: e.target.value }))}>
              <option value="En Stock">En Stock</option>
              <option value="Installé">Installé</option>
              <option value="Défectueux">Défectueux</option>
            </select>
          </div>
          {editItem.status === 'Installé' && (
            <div><label className="label">Installé chez (nom client)</label><input className="input" value={editItem.installed_client_name || ''} onChange={e => setEditItem(p => ({ ...p, installed_client_name: e.target.value }))} /></div>
          )}
          <button onClick={updateItem} className="btn-primary w-full">Enregistrer les modifications</button>
        </div>
      </Modal>
    </div>
  );
}
