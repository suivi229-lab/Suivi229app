import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Sparkles, Send, FileText, Mail, TrendingUp, Loader2,
  Copy, Check, RefreshCw, Bot, AlertCircle, Calculator, Printer,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type Tab = 'assistant' | 'rapport' | 'email' | 'analyse' | 'comptable';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface ExpiringSubscription {
  clientName: string;
  registration: string;
  endDate: string;
  phone: string | null;
  daysLeft: number;
}

interface AppData {
  clientsCount: number;
  vehiclesCount: number;
  activeCount: number;
  expiredCount: number;
  expiringIn30: ExpiringSubscription[];
  monthRevenue: number;
  yearRevenue: number;
  loaded: boolean;
  error: string | null;
}

/* ─── Types comptables ───────────────────────────────────────────────────────── */
interface TxLine {
  description: string;
  amount: number;
  category: string;
  transaction_date: string;
  transaction_type: 'Entrée' | 'Sortie';
}

interface ComptableData {
  entrees: TxLine[];
  sorties: TxLine[];
  totalEntrees: number;
  totalSorties: number;
  resultatBrut: number;
  tvaCollectee: number;   // 18 % sur recettes HT
  ibicEstime: number;     // 30 % sur bénéfice
  loaded: boolean;
  error: string | null;
}

async function fetchComptableData(year: number, month: number): Promise<ComptableData> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const { data, error } = await supabase
    .from('transactions')
    .select('description, amount, category, transaction_date, transaction_type')
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .order('transaction_date');

  if (error) throw new Error(error.message);

  const rows: TxLine[] = (data ?? []).map((r: any) => ({
    description:      r.description ?? '',
    amount:           Number(r.amount ?? 0),
    category:         r.category ?? 'Non catégorisé',
    transaction_date: r.transaction_date ?? '',
    transaction_type: r.transaction_type,
  }));

  const entrees = rows.filter(r => r.transaction_type === 'Entrée');
  const sorties = rows.filter(r => r.transaction_type === 'Sortie');
  const totalEntrees = entrees.reduce((s, r) => s + r.amount, 0);
  const totalSorties = sorties.reduce((s, r) => s + r.amount, 0);
  const resultatBrut = totalEntrees - totalSorties;
  const tvaCollectee  = Math.round(totalEntrees * 0.18);
  const ibicEstime    = resultatBrut > 0 ? Math.round(resultatBrut * 0.30) : 0;

  return { entrees, sorties, totalEntrees, totalSorties, resultatBrut, tvaCollectee, ibicEstime, loaded: true, error: null };
}

/* ─── Utilitaire PDF (impression dans nouvelle fenêtre) ──────────────────────── */
function printBilan(htmlContent: string, title: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"/>
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Arial', sans-serif; font-size: 11px; color: #111; padding: 30px 40px; }
      h1 { font-size: 16px; text-align: center; margin-bottom: 4px; }
      h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1.5px solid #333; padding-bottom: 3px; }
      .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #f0f0f0; text-align: left; padding: 4px 8px; font-size: 10px; border: 1px solid #ccc; }
      td { padding: 4px 8px; border: 1px solid #ddd; }
      .right { text-align: right; }
      .total-row td { font-weight: bold; background: #f9f9f9; border-top: 2px solid #999; }
      .fiscal-box { border: 2px solid #333; padding: 12px 16px; margin-top: 16px; border-radius: 4px; }
      .fiscal-box h2 { border: none; margin-top: 0; }
      .fiscal-line { display: flex; justify-content: space-between; margin: 4px 0; }
      .fiscal-line.highlight { font-weight: bold; font-size: 12px; border-top: 1px solid #999; padding-top: 4px; margin-top: 8px; }
      .ai-section { margin-top: 20px; padding: 12px; background: #fafafa; border: 1px solid #ddd; border-radius: 4px; white-space: pre-wrap; line-height: 1.6; }
      .footer { margin-top: 24px; font-size: 9px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
      @media print { @page { margin: 15mm; } }
    </style>
  </head><body>${htmlContent}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

/* ─── Data fetcher ───────────────────────────────────────────────────────────── */
async function fetchAppData(): Promise<AppData> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const yearStart  = new Date(today.getFullYear(), 0, 1).toISOString();
  const todayStr   = today.toISOString().split('T')[0];
  const in30Str    = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [
    { count: clientsCount },
    { count: vehiclesCount },
    { data: subs },
    { data: monthTx },
    { data: yearTx },
    { data: expiring },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('vehicles').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('status'),
    supabase.from('transactions').select('amount').eq('transaction_type', 'Entrée').gte('transaction_date', monthStart),
    supabase.from('transactions').select('amount').eq('transaction_type', 'Entrée').gte('transaction_date', yearStart),
    supabase.from('subscriptions')
      .select('end_date, vehicles(registration, clients(name, phone))')
      .eq('status', 'Actif')
      .gte('end_date', todayStr)
      .lte('end_date', in30Str)
      .order('end_date'),
  ]);

  const expiringIn30: ExpiringSubscription[] = (expiring ?? []).map((s: any) => ({
    clientName: s.vehicles?.clients?.name ?? 'Inconnu',
    registration: s.vehicles?.registration ?? '',
    endDate: s.end_date,
    phone: s.vehicles?.clients?.phone ?? null,
    daysLeft: Math.ceil((new Date(s.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  return {
    clientsCount: clientsCount ?? 0,
    vehiclesCount: vehiclesCount ?? 0,
    activeCount: subs?.filter(s => s.status === 'Actif').length ?? 0,
    expiredCount: subs?.filter(s => s.status === 'Expiré').length ?? 0,
    expiringIn30,
    monthRevenue: monthTx?.reduce((s, t) => s + (t.amount ?? 0), 0) ?? 0,
    yearRevenue:  yearTx?.reduce((s, t)  => s + (t.amount ?? 0), 0) ?? 0,
    loaded: true,
    error: null,
  };
}

function buildSystemContext(data: AppData): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const lines = [
    `DONNÉES SUIVI 229+ au ${today}`,
    `- Clients: ${data.clientsCount}`,
    `- Véhicules: ${data.vehiclesCount}`,
    `- Abonnements actifs: ${data.activeCount}`,
    `- Abonnements expirés: ${data.expiredCount}`,
    `- Abonnements expirant dans ≤30 jours: ${data.expiringIn30.length}`,
    `- CA du mois en cours: ${data.monthRevenue.toLocaleString('fr-FR')} FCFA`,
    `- CA de l'année: ${data.yearRevenue.toLocaleString('fr-FR')} FCFA`,
  ];
  if (data.expiringIn30.length) {
    lines.push('\nABONNEMENTS EXPIRANT PROCHAINEMENT:');
    data.expiringIn30.forEach(s =>
      lines.push(`- ${s.clientName} | ${s.registration} | expire le ${s.endDate} (J-${s.daysLeft})${s.phone ? ` | tél: ${s.phone}` : ''}`)
    );
  }
  return lines.join('\n');
}

/* ─── API call ───────────────────────────────────────────────────────────────── */
async function callGemini(payload: { prompt?: string; context?: string; contents?: object[] }): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Erreur IA');
  return json.text as string;
}

/* ─── Simple markdown renderer ───────────────────────────────────────────────── */
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const els: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];

  function flushList() {
    if (listBuffer.length) {
      els.push(<ul key={`ul-${els.length}`} className="list-disc list-inside space-y-0.5 my-1">{listBuffer}</ul>);
      listBuffer = [];
    }
  }

  function inline(t: string) {
    return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i} className="font-semibold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={i} className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      return part;
    });
  }

  lines.forEach((line, i) => {
    if (line.startsWith('### ')) { flushList(); els.push(<h4 key={i} className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-3 mb-0.5">{inline(line.slice(4))}</h4>); }
    else if (line.startsWith('## ')) { flushList(); els.push(<h3 key={i} className="text-base font-bold text-gray-900 dark:text-white mt-4 mb-1">{inline(line.slice(3))}</h3>); }
    else if (line.startsWith('# '))  { flushList(); els.push(<h2 key={i} className="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-1">{inline(line.slice(2))}</h2>); }
    else if (line.match(/^[-*] /))   { listBuffer.push(<li key={i} className="text-sm text-gray-700 dark:text-gray-300">{inline(line.slice(2))}</li>); }
    else if (line.trim() === '')     { flushList(); els.push(<div key={i} className="h-2" />); }
    else                             { flushList(); els.push(<p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{inline(line)}</p>); }
  });
  flushList();
  return <div className="space-y-0.5">{els}</div>;
}

/* ─── Copy button helper ─────────────────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
    >
      {copied ? <><Check className="w-3.5 h-3.5 text-green-500" />Copié</> : <><Copy className="w-3.5 h-3.5" />Copier</>}
    </button>
  );
}

/* ─── Result box ─────────────────────────────────────────────────────────────── */
function ResultBox({ text, onRegenerate }: { text: string; onRegenerate: () => void }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400 font-medium">
          <Sparkles className="w-3.5 h-3.5" />Généré par Gemini
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onRegenerate} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />Regénérer
          </button>
          <CopyBtn text={text} />
        </div>
      </div>
      <div className="p-4">
        <Markdown text={text} />
      </div>
    </div>
  );
}

/* ─── Tab: Assistant IA ──────────────────────────────────────────────────────── */
function AssistantTab({ data }: { data: AppData }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    const newMessages: Message[] = [...messages, { role: 'user', text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const sysCtx = buildSystemContext(data);
      const contents = [
        { role: 'user', parts: [{ text: sysCtx + '\n\nTu es l\'assistant IA de Suivi 229+. Utilise ces données pour répondre aux questions.' }] },
        { role: 'model', parts: [{ text: 'Compris. Je suis prêt à répondre à vos questions concernant Suivi 229+.' }] },
        ...newMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      ];
      const reply = await callGemini({ contents });
      setMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    'Combien d\'abonnements expirent ce mois ?',
    'Quel est le taux d\'abonnements actifs ?',
    'Résume la situation commerciale actuelle.',
  ];

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Assistant IA Suivi 229+</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Posez n'importe quelle question sur vos données</p>
          </div>
          <div className="grid gap-2 w-full max-w-md">
            {suggestions.map(s => (
              <button key={s} onClick={() => setInput(s)}
                className="text-left text-sm px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 dark:hover:border-brand-600 transition-colors text-gray-700 dark:text-gray-300">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {m.role === 'model' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white rounded-tr-sm'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-tl-sm'
              }`}>
                {m.role === 'user' ? m.text : <Markdown text={m.text} />}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <form onSubmit={sendMessage} className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Posez une question sur vos données…"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
            disabled={loading}
          />
          <button type="submit" disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0">
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Tab: Rapport mensuel ───────────────────────────────────────────────────── */
function RapportTab({ data }: { data: AppData }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const ctx = buildSystemContext(data);
      const prompt = `Sur la base des données ci-dessus, rédige un rapport mensuel professionnel pour Suivi 229+. 
Inclus :
1. Un résumé exécutif (2-3 phrases)
2. Performances commerciales (CA, abonnements)
3. Points d'attention (abonnements expirant, taux d'attrition)
4. Recommandations actionables (3 max)
5. Conclusion

Utilise un ton professionnel et concis. Sois précis avec les chiffres fournis.`;
      setResult(await callGemini({ prompt, context: ctx }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Rapport mensuel</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Gemini analyse vos KPIs et rédige un rapport structuré prêt à partager.
          </p>
        </div>
        <button onClick={generate} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex-shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Générer
        </button>
      </div>

      {/* Aperçu des données utilisées */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Clients', value: data.clientsCount },
          { label: 'Abonnements actifs', value: data.activeCount },
          { label: 'Expirent ≤30j', value: data.expiringIn30.length },
          { label: 'CA du mois', value: `${data.monthRevenue.toLocaleString('fr-FR')} F` },
          { label: 'CA annuel', value: `${data.yearRevenue.toLocaleString('fr-FR')} F` },
          { label: 'Expirés', value: data.expiredCount },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {result && <ResultBox text={result} onRegenerate={generate} />}
    </div>
  );
}

/* ─── Tab: Emails de rappel ──────────────────────────────────────────────────── */
function EmailTab({ data }: { data: AppData }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const ctx = buildSystemContext(data);
      const expList = data.expiringIn30.length > 0
        ? data.expiringIn30.map(s => `- ${s.clientName} (${s.registration}) — expire le ${s.endDate} (J-${s.daysLeft})${s.phone ? `, tél: ${s.phone}` : ''}`).join('\n')
        : 'Aucun abonnement n\'expire dans les 30 prochains jours.';
      const prompt = `Voici les abonnements expirant dans les 30 prochains jours :\n${expList}\n\n
Pour chaque client, rédige un email de rappel professionnel et chaleureux en français.
Format pour chaque email :
---
**Client : [Nom]**
Objet : [objet de l'email]
[Corps de l'email]
---

L'email doit :
- Rappeler la date d'expiration
- Inviter le client à renouveler
- Mentionner le numéro de véhicule
- Être bref (max 5 lignes)
- Avoir un ton professionnel mais cordial`;
      setResult(await callGemini({ prompt, context: ctx }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Emails de rappel</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Génère un email de rappel personnalisé pour chaque abonnement qui expire bientôt.
          </p>
        </div>
        <button onClick={generate} disabled={loading || data.expiringIn30.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex-shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Générer les emails
        </button>
      </div>

      {data.expiringIn30.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">
          ✅ Aucun abonnement n'expire dans les 30 prochains jours.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{data.expiringIn30.length} abonnement(s) concerné(s)</p>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {data.expiringIn30.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{s.clientName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.registration} · {s.phone ?? 'pas de tél'}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  s.daysLeft <= 7 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : s.daysLeft <= 15 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}>J-{s.daysLeft}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {result && <ResultBox text={result} onRegenerate={generate} />}
    </div>
  );
}

/* ─── Tab: Analyse des tendances ─────────────────────────────────────────────── */
function AnalyseTab({ data }: { data: AppData }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const ctx = buildSystemContext(data);
      const prompt = `Sur la base des données disponibles, effectue une analyse stratégique des tendances pour Suivi 229+.

Analyse les points suivants :
1. **Santé du portefeuille** : ratio actifs/expirés, taux de rétention estimé
2. **Risques immédiats** : abonnements critiques (≤7 jours), impact financier potentiel si non renouvelés
3. **Opportunités** : clients à fort potentiel, moments propices pour upsell
4. **Anomalies détectées** : patterns inhabituels dans les données (si identifiés)
5. **Priorités actions** : top 3 des actions à mener cette semaine

Sois concis, factuel et orienté action. Évite les généralités.`;
      setResult(await callGemini({ prompt, context: ctx }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Analyse des tendances</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Gemini détecte les anomalies, évalue les risques et propose des priorités d'action.
          </p>
        </div>
        <button onClick={generate} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex-shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
          Analyser
        </button>
      </div>

      {/* KPIs visuels */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
          <p className="text-xs text-green-700 dark:text-green-400 font-medium">Taux actifs</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
            {data.activeCount + data.expiredCount > 0
              ? Math.round((data.activeCount / (data.activeCount + data.expiredCount)) * 100)
              : 0}%
          </p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">{data.activeCount} / {data.activeCount + data.expiredCount} abonnements</p>
        </div>
        <div className={`rounded-xl border p-4 ${data.expiringIn30.length > 5 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
          <p className={`text-xs font-medium ${data.expiringIn30.length > 5 ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>Alertes expirations</p>
          <p className={`text-2xl font-bold mt-1 ${data.expiringIn30.length > 5 ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>{data.expiringIn30.length}</p>
          <p className={`text-xs mt-0.5 ${data.expiringIn30.length > 5 ? 'text-red-600 dark:text-red-500' : 'text-amber-600 dark:text-amber-500'}`}>dans les 30 prochains jours</p>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {result && <ResultBox text={result} onRegenerate={generate} />}
    </div>
  );
}

/* ─── Tab: Expert Comptable ──────────────────────────────────────────────────── */
const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function groupByCategory(lines: TxLine[]): { cat: string; total: number; items: TxLine[] }[] {
  const map = new Map<string, TxLine[]>();
  lines.forEach(l => {
    if (!map.has(l.category)) map.set(l.category, []);
    map.get(l.category)!.push(l);
  });
  return Array.from(map.entries()).map(([cat, items]) => ({
    cat,
    total: items.reduce((s, i) => s + i.amount, 0),
    items,
  })).sort((a, b) => b.total - a.total);
}

function fmt(n: number) { return n.toLocaleString('fr-FR') + ' FCFA'; }

function ComptableTab() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [cdata, setCdata] = useState<ComptableData | null>(null);
  const [loadingData,  setLoadingData]  = useState(false);
  const [loadingAI,    setLoadingAI]    = useState(false);
  const [aiResult,     setAiResult]     = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  async function charger() {
    setLoadingData(true); setError(null); setAiResult(null); setCdata(null);
    try {
      setCdata(await fetchComptableData(year, month));
    } catch (e: any) { setError(e.message); }
    finally { setLoadingData(false); }
  }

  async function genererAnalyse() {
    if (!cdata) return;
    setLoadingAI(true); setError(null);
    try {
      const entreesList = groupByCategory(cdata.entrees).map(g =>
        `  ${g.cat} : ${fmt(g.total)} (${g.items.length} op.)`).join('\n') || '  Aucune';
      const sortiesList = groupByCategory(cdata.sorties).map(g =>
        `  ${g.cat} : ${fmt(g.total)} (${g.items.length} op.)`).join('\n') || '  Aucune';

      const prompt = `Tu es un expert-comptable agréé spécialisé dans la fiscalité béninoise (régime OHADA, DGI Bénin).

Voici le bilan financier de l'entreprise **Suivi 229+** (société de tracking GPS de véhicules, Bénin) pour le mois de **${MOIS_FR[month-1]} ${year}** :

## RECETTES (${fmt(cdata.totalEntrees)})
${entreesList}

## CHARGES (${fmt(cdata.totalSorties)})
${sortiesList}

## INDICATEURS CALCULÉS
- Résultat brut : ${fmt(cdata.resultatBrut)}
- TVA collectée estimée (18%) : ${fmt(cdata.tvaCollectee)}
- IBIC estimé (30% du bénéfice) : ${fmt(cdata.ibicEstime)}

Sur la base de ces données, fournis un rapport d'audit comptable mensuel structuré avec :
1. **Synthèse générale** : situation financière du mois en 3 phrases
2. **Analyse des recettes** : commentaire sur la composition et la régularité des entrées
3. **Analyse des charges** : commentaire sur les postes de dépenses, adéquation avec l'activité
4. **Situation fiscale** : TVA à reverser à la DGI, acompte IBIC, autres obligations mensuelles au Bénin
5. **Points d'attention** : anomalies, risques, irrégularités comptables à corriger
6. **Recommandations** : 3 actions concrètes pour optimiser la situation fiscale et comptable
7. **Conclusion** : bilan en une phrase et statut de conformité fiscale estimé

Utilise un ton professionnel d'expert-comptable. Sois précis avec les montants en FCFA.`;

      setAiResult(await callGemini({ prompt }));
    } catch (e: any) { setError(e.message); }
    finally { setLoadingAI(false); }
  }

  function exporterPDF() {
    if (!cdata) return;
    const titre = `Bilan Comptable — ${MOIS_FR[month-1]} ${year} — Suivi 229+`;
    const entreesGroupes = groupByCategory(cdata.entrees);
    const sortiesGroupes = groupByCategory(cdata.sorties);

    const lignesEntrees = entreesGroupes.map(g =>
      `<tr><td>${g.cat}</td><td class="right">${g.items.length}</td><td class="right">${fmt(g.total)}</td></tr>`
    ).join('');
    const lignesSorties = sortiesGroupes.map(g =>
      `<tr><td>${g.cat}</td><td class="right">${g.items.length}</td><td class="right">${fmt(g.total)}</td></tr>`
    ).join('');

    const html = `
      <h1>BILAN COMPTABLE MENSUEL</h1>
      <p class="subtitle">Suivi 229+ — Tracking GPS Véhicules, Bénin<br/>Période : ${MOIS_FR[month-1]} ${year} | Généré le : ${new Date().toLocaleDateString('fr-FR')}</p>

      <h2>1. RECETTES (PRODUITS)</h2>
      <table><thead><tr><th>Catégorie</th><th class="right">Nb op.</th><th class="right">Montant</th></tr></thead><tbody>
        ${lignesEntrees || '<tr><td colspan="3">Aucune recette</td></tr>'}
        <tr class="total-row"><td>TOTAL RECETTES</td><td></td><td class="right">${fmt(cdata.totalEntrees)}</td></tr>
      </tbody></table>

      <h2>2. CHARGES (DÉPENSES)</h2>
      <table><thead><tr><th>Catégorie</th><th class="right">Nb op.</th><th class="right">Montant</th></tr></thead><tbody>
        ${lignesSorties || '<tr><td colspan="3">Aucune charge</td></tr>'}
        <tr class="total-row"><td>TOTAL CHARGES</td><td></td><td class="right">${fmt(cdata.totalSorties)}</td></tr>
      </tbody></table>

      <div class="fiscal-box">
        <h2>3. RÉSULTAT ET OBLIGATIONS FISCALES (estimations)</h2>
        <div class="fiscal-line"><span>Résultat brut (Recettes − Charges)</span><span>${fmt(cdata.resultatBrut)}</span></div>
        <div class="fiscal-line"><span>TVA collectée à reverser (18 % des recettes)</span><span>${fmt(cdata.tvaCollectee)}</span></div>
        <div class="fiscal-line"><span>Acompte IBIC estimé (30 % du bénéfice)</span><span>${fmt(cdata.ibicEstime)}</span></div>
        <div class="fiscal-line highlight"><span>TOTAL OBLIGATIONS FISCALES ESTIMÉES</span><span>${fmt(cdata.tvaCollectee + cdata.ibicEstime)}</span></div>
        <div class="fiscal-line highlight"><span>RÉSULTAT NET APRÈS IMPÔT ESTIMÉ</span><span>${fmt(cdata.resultatBrut - cdata.ibicEstime)}</span></div>
      </div>

      ${aiResult ? `<div class="ai-section"><strong>ANALYSE DE L'EXPERT COMPTABLE IA</strong>\n\n${aiResult}</div>` : ''}

      <div class="footer">
        Document généré automatiquement par Suivi 229+ — À valider par un expert-comptable agréé avant dépôt officiel à la DGI Bénin.<br/>
        Régime fiscal de référence : OHADA / DGI Bénin — TVA 18 % — IBIC 30 %
      </div>`;

    printBilan(html, titre);
  }

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Expert Comptable — Bilan fiscal mensuel</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Bilan OHADA structuré + analyse IA + export PDF prêt à déposer à la DGI.
          </p>
        </div>
      </div>

      {/* Sélecteur mois/année */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Mois</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            {MOIS_FR.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Année</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={charger} disabled={loadingData}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
          {loadingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Charger le bilan
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Résultats comptables */}
      {cdata && (
        <div className="space-y-4">
          {/* Résumé chiffres clés */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total recettes', value: fmt(cdata.totalEntrees), color: 'text-green-700 dark:text-green-400' },
              { label: 'Total charges',  value: fmt(cdata.totalSorties),  color: 'text-red-600 dark:text-red-400' },
              { label: 'Résultat brut',  value: fmt(cdata.resultatBrut),  color: cdata.resultatBrut >= 0 ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400' },
              { label: 'TVA à reverser (18%)', value: fmt(cdata.tvaCollectee), color: 'text-amber-700 dark:text-amber-400' },
              { label: 'IBIC estimé (30%)',     value: fmt(cdata.ibicEstime),    color: 'text-amber-700 dark:text-amber-400' },
              { label: 'Résultat net estimé',  value: fmt(cdata.resultatBrut - cdata.ibicEstime), color: (cdata.resultatBrut - cdata.ibicEstime) >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Tableau recettes par catégorie */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border-b border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Recettes — {cdata.entrees.length} opération(s)</p>
            </div>
            {groupByCategory(cdata.entrees).length === 0
              ? <p className="text-sm text-gray-400 p-4">Aucune recette ce mois.</p>
              : <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr><th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Catégorie</th><th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Nb</th><th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Montant</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {groupByCategory(cdata.entrees).map(g => (
                      <tr key={g.cat} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{g.cat}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{g.items.length}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-green-700 dark:text-green-400">{fmt(g.total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-green-50 dark:bg-green-900/20 font-bold">
                      <td className="px-4 py-2.5 text-green-800 dark:text-green-300">TOTAL RECETTES</td>
                      <td></td>
                      <td className="px-4 py-2.5 text-right text-green-700 dark:text-green-400">{fmt(cdata.totalEntrees)}</td>
                    </tr>
                  </tbody>
                </table>
            }
          </div>

          {/* Tableau charges par catégorie */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border-b border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">Charges — {cdata.sorties.length} opération(s)</p>
            </div>
            {groupByCategory(cdata.sorties).length === 0
              ? <p className="text-sm text-gray-400 p-4">Aucune charge ce mois.</p>
              : <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr><th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Catégorie</th><th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Nb</th><th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Montant</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {groupByCategory(cdata.sorties).map(g => (
                      <tr key={g.cat} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{g.cat}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{g.items.length}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">{fmt(g.total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-red-50 dark:bg-red-900/20 font-bold">
                      <td className="px-4 py-2.5 text-red-700 dark:text-red-300">TOTAL CHARGES</td>
                      <td></td>
                      <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400">{fmt(cdata.totalSorties)}</td>
                    </tr>
                  </tbody>
                </table>
            }
          </div>

          {/* Boutons actions */}
          <div className="flex flex-wrap gap-3">
            <button onClick={genererAnalyse} disabled={loadingAI}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiResult ? 'Regénérer l\'analyse' : 'Analyse Expert Comptable IA'}
            </button>
            <button onClick={exporterPDF}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white text-sm font-medium transition-colors">
              <Printer className="w-4 h-4" />
              Télécharger PDF
            </button>
          </div>

          {/* Résultat IA */}
          {aiResult && (
            <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/10 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">Analyse Expert Comptable IA</span>
              </div>
              <div className="text-sm text-gray-800 dark:text-gray-200">
                <Markdown text={aiResult} />
              </div>
              <p className="mt-4 text-xs text-gray-400 italic">
                ⚠️ Ces estimations fiscales sont indicatives. Faites valider ce bilan par un expert-comptable agréé avant dépôt officiel à la DGI Bénin.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Page principale ────────────────────────────────────────────────────────── */
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'assistant', label: 'Assistant',  icon: Bot },
  { id: 'rapport',   label: 'Rapport',    icon: FileText },
  { id: 'email',     label: 'Emails',     icon: Mail },
  { id: 'analyse',   label: 'Analyse',    icon: TrendingUp },
  { id: 'comptable', label: 'Comptable',  icon: Calculator },
];

export default function AIPage() {
  const [activeTab, setActiveTab] = useState<Tab>('assistant');
  const [data, setData] = useState<AppData>({
    clientsCount: 0, vehiclesCount: 0, activeCount: 0, expiredCount: 0,
    expiringIn30: [], monthRevenue: 0, yearRevenue: 0, loaded: false, error: null,
  });

  useEffect(() => {
    fetchAppData()
      .then(setData)
      .catch(err => setData(d => ({ ...d, loaded: true, error: err.message })));
  }, []);

  if (!data.loaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Chargement des données…</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-5 h-5" />{data.error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-sm">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Intelligence Artificielle</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Propulsé par Groq · Llama 3.3 70B</p>
        </div>
      </div>

      {/* Card principale */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '70vh' }}>
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === id
                  ? 'border-brand-600 text-brand-700 dark:text-brand-400 bg-white dark:bg-gray-900'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'assistant' && <AssistantTab data={data} />}
          {activeTab === 'rapport'   && <RapportTab   data={data} />}
          {activeTab === 'email'     && <EmailTab     data={data} />}
          {activeTab === 'analyse'   && <AnalyseTab   data={data} />}
          {activeTab === 'comptable' && <ComptableTab />}
        </div>
      </div>
    </div>
  );
}
