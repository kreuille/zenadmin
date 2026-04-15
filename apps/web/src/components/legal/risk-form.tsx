'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// BUSINESS RULE [CDC-2.4]: Formulaire ajout/edition risque

interface RiskFormProps {
  onSubmit: (risk: {
    category: string;
    name: string;
    description: string;
    gravity: number;
    probability: number;
    preventive_actions: string[];
    responsible: string;
  }) => void;
  onCancel: () => void;
  initialData?: {
    category?: string;
    name?: string;
    description?: string;
    gravity?: number;
    probability?: number;
    preventive_actions?: string[];
    responsible?: string;
  };
}

export function RiskForm({ onSubmit, onCancel, initialData }: RiskFormProps) {
  const [category, setCategory] = useState(initialData?.category || '');
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [gravity, setGravity] = useState(initialData?.gravity || 2);
  const [probability, setProbability] = useState(initialData?.probability || 2);
  const [actions, setActions] = useState(initialData?.preventive_actions?.join('\n') || '');
  const [responsible, setResponsible] = useState(initialData?.responsible || '');

  const handleSubmit = () => {
    onSubmit({
      category,
      name,
      description,
      gravity,
      probability,
      preventive_actions: actions.split('\n').filter((a) => a.trim()),
      responsible,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Chimique, Ergonomique..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom du risque</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Chute de hauteur" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          className="w-full border rounded-md p-2 text-sm"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description du risque..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gravite (1-4)</label>
          <select className="w-full border rounded-md p-2 text-sm" value={gravity} onChange={(e) => setGravity(Number(e.target.value))}>
            <option value={1}>1 - Faible</option>
            <option value={2}>2 - Moyen</option>
            <option value={3}>3 - Grave</option>
            <option value={4}>4 - Tres grave</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Probabilite (1-4)</label>
          <select className="w-full border rounded-md p-2 text-sm" value={probability} onChange={(e) => setProbability(Number(e.target.value))}>
            <option value={1}>1 - Rare</option>
            <option value={2}>2 - Peu probable</option>
            <option value={3}>3 - Probable</option>
            <option value={4}>4 - Frequent</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Actions preventives (une par ligne)</label>
        <textarea
          className="w-full border rounded-md p-2 text-sm"
          rows={4}
          value={actions}
          onChange={(e) => setActions(e.target.value)}
          placeholder="Port du harnais&#10;Formation obligatoire&#10;..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
        <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Nom du responsable" />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={handleSubmit} disabled={!category || !name}>Enregistrer</Button>
      </div>
    </div>
  );
}
