'use client';

import { Input } from '@/components/ui/input';

// BUSINESS RULE [CDC-2.1]: Ligne individuelle d'un devis

export interface QuoteLineData {
  id: string;
  position: number;
  type: 'line' | 'section' | 'subtotal' | 'comment';
  label: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  tva_rate: number;
  discount_type: 'percentage' | 'fixed' | '';
  discount_value: number;
  total_ht_cents: number;
}

interface QuoteLineRowProps {
  line: QuoteLineData;
  onChange: (id: string, field: keyof QuoteLineData, value: string | number) => void;
  onRemove: (id: string) => void;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

const TVA_OPTIONS = [
  { value: 2000, label: '20%' },
  { value: 1000, label: '10%' },
  { value: 550, label: '5,5%' },
  { value: 210, label: '2,1%' },
  { value: 0, label: '0%' },
];

export function QuoteLineRow({ line, onChange, onRemove }: QuoteLineRowProps) {
  if (line.type === 'section') {
    return (
      <tr className="bg-gray-50">
        <td className="px-2 py-2 text-gray-400 text-center text-xs">{line.position}</td>
        <td colSpan={6} className="px-2 py-2">
          <Input
            value={line.label}
            onChange={(e) => onChange(line.id, 'label', e.target.value)}
            className="font-semibold text-gray-700 bg-transparent border-0 shadow-none"
            placeholder="Titre de section"
          />
        </td>
        <td className="px-2 py-2 text-center">
          <button onClick={() => onRemove(line.id)} className="text-red-400 hover:text-red-600 text-xs">
            Suppr.
          </button>
        </td>
      </tr>
    );
  }

  if (line.type === 'comment') {
    return (
      <tr className="bg-yellow-50/50">
        <td className="px-2 py-2 text-gray-400 text-center text-xs">{line.position}</td>
        <td colSpan={6} className="px-2 py-2">
          <Input
            value={line.label}
            onChange={(e) => onChange(line.id, 'label', e.target.value)}
            className="text-gray-500 italic bg-transparent border-0 shadow-none text-sm"
            placeholder="Commentaire..."
          />
        </td>
        <td className="px-2 py-2 text-center">
          <button onClick={() => onRemove(line.id)} className="text-red-400 hover:text-red-600 text-xs">
            Suppr.
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50">
      <td className="px-2 py-2 text-gray-400 text-center text-xs">{line.position}</td>
      <td className="px-2 py-2">
        <Input
          value={line.label}
          onChange={(e) => onChange(line.id, 'label', e.target.value)}
          className="text-sm"
          placeholder="Designation"
        />
      </td>
      <td className="px-2 py-2 w-20">
        <Input
          type="number"
          value={line.quantity}
          onChange={(e) => onChange(line.id, 'quantity', parseFloat(e.target.value) || 0)}
          className="text-sm text-right"
          step="0.001"
          min="0"
        />
      </td>
      <td className="px-2 py-2 w-16">
        <Input
          value={line.unit}
          onChange={(e) => onChange(line.id, 'unit', e.target.value)}
          className="text-sm text-center"
        />
      </td>
      <td className="px-2 py-2 w-28">
        <Input
          type="number"
          value={line.unit_price_cents / 100}
          onChange={(e) => onChange(line.id, 'unit_price_cents', Math.round((parseFloat(e.target.value) || 0) * 100))}
          className="text-sm text-right"
          step="0.01"
          min="0"
        />
      </td>
      <td className="px-2 py-2 w-20">
        <select
          value={line.tva_rate}
          onChange={(e) => onChange(line.id, 'tva_rate', parseInt(e.target.value, 10))}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {TVA_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2 w-28 text-right font-medium text-sm">
        {formatCents(line.total_ht_cents)} EUR
      </td>
      <td className="px-2 py-2 text-center">
        <button onClick={() => onRemove(line.id)} className="text-red-400 hover:text-red-600 text-xs">
          Suppr.
        </button>
      </td>
    </tr>
  );
}
