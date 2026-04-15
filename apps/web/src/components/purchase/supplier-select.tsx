'use client';

// BUSINESS RULE [CDC-2.2]: Selection fournisseur pour facture d'achat

interface SupplierSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

export function SupplierSelect({ value, onChange }: SupplierSelectProps) {
  // Placeholder - sera connecte a l'API /api/suppliers
  const suppliers: Array<{ id: string; name: string }> = [];

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
    >
      <option value="">Selectionner un fournisseur...</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
