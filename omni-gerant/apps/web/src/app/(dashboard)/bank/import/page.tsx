'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

interface Account { id: string; bank_name: string; account_name: string | null; iban: string | null; balance_cents: number }

interface ImportResult { parsed: number; inserted: number; duplicates: number; errors: string[]; format: string }

function euro(c: number) { return (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'; }

export default function BankImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [newBankName, setNewBankName] = useState('Qonto');
  const [newAccountName, setNewAccountName] = useState('Compte principal');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const r = await api.get<{ items: Account[] }>('/api/bank/accounts');
    if (r.ok) setAccounts(r.value.items);
  }
  useEffect(() => { load(); }, []);

  async function createAccount() {
    const r = await api.post<{ id: string }>('/api/bank/accounts', {
      bank_name: newBankName,
      account_name: newAccountName,
      currency: 'EUR',
    });
    if (r.ok) {
      setMessage(`Compte ${newBankName} créé`);
      setSelectedId(r.value.id);
      await load();
    } else {
      setMessage('Erreur : ' + r.error.message);
    }
  }

  async function doImport() {
    if (!selectedId || !file) { setMessage('Sélectionnez un compte + fichier'); return; }
    setLoading(true); setMessage(null);
    const content = await file.text();
    const r = await api.post<ImportResult>(`/api/bank/accounts/${selectedId}/import`, {
      content,
      filename: file.name,
    });
    if (r.ok) {
      setResult(r.value);
      setMessage(`Import terminé : ${r.value.inserted} nouvelles transactions, ${r.value.duplicates} doublons ignorés`);
      await load();
    } else setMessage('Erreur : ' + r.error.message);
    setLoading(false);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Import bancaire CSV / OFX</h1>
      <p className="text-sm text-gray-600 mb-6">
        Importez vos transactions depuis un export Qonto, BNP, Société Générale, Crédit Agricole, LCL, Revolut, etc.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm">
        <strong>📥 Comment obtenir un export CSV/OFX</strong>
        <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
          <li><strong>Qonto</strong> : App → Transactions → Exporter → CSV</li>
          <li><strong>BNP Paribas</strong> : Comptes → Relevés → Export CSV ou QIF</li>
          <li><strong>Crédit Agricole</strong> : Mes comptes → Téléchargement mouvements → CSV/OFX</li>
          <li><strong>Société Générale</strong> : Consultation → Exporter → CSV/OFX</li>
          <li><strong>Revolut</strong> : Paramètres → Déclarations → Exporter CSV</li>
        </ul>
      </div>

      {message && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">{message}</div>}

      {/* Création compte */}
      {accounts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="font-semibold mb-3">1️⃣ Créer un compte bancaire</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={newBankName} onChange={(e) => setNewBankName(e.target.value)} placeholder="Nom banque (Qonto, BNP...)" className="border border-gray-300 rounded px-3 py-2 text-sm" />
            <input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Libellé compte" className="border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
          <button onClick={createAccount} className="bg-primary-600 text-white px-4 py-2 rounded text-sm font-medium">Créer le compte</button>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="font-semibold mb-3">1️⃣ Sélectionnez le compte</h2>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3">
            <option value="">— Choisir —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.bank_name} — {a.account_name ?? 'compte'} ({euro(a.balance_cents)})</option>
            ))}
          </select>
          <div className="text-xs text-gray-500">Ou <button onClick={createAccount} className="text-primary-600 hover:underline">créer un nouveau compte {newBankName}</button></div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-semibold mb-3">2️⃣ Uploader le fichier</h2>
        <input type="file" accept=".csv,.ofx,.qif,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm mb-3" />
        {file && <p className="text-xs text-gray-600 mb-2">📎 {file.name} ({(file.size / 1024).toFixed(1)} Ko)</p>}
        <button onClick={doImport} disabled={loading || !selectedId || !file} className="bg-primary-600 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50">
          {loading ? 'Import en cours…' : 'Importer'}
        </button>
      </div>

      {result && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Résultat</h2>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-xs text-gray-500 uppercase">Format</dt><dd className="font-semibold">{result.format.toUpperCase()}</dd></div>
            <div><dt className="text-xs text-gray-500 uppercase">Lignes lues</dt><dd className="font-semibold">{result.parsed}</dd></div>
            <div><dt className="text-xs text-gray-500 uppercase">Insérées</dt><dd className="font-semibold text-green-700">+{result.inserted}</dd></div>
            <div><dt className="text-xs text-gray-500 uppercase">Doublons</dt><dd className="font-semibold text-gray-600">{result.duplicates}</dd></div>
          </dl>
          {result.errors.length > 0 && (
            <ul className="mt-4 text-xs text-red-600 space-y-1">
              {result.errors.map((e, i) => <li key={i}>⚠️ {e}</li>)}
            </ul>
          )}
          <p className="mt-4 text-xs text-gray-500">
            Prochaine étape : lancer le rapprochement automatique avec vos factures et achats depuis la page Rapprochement.
          </p>
        </div>
      )}
    </div>
  );
}
