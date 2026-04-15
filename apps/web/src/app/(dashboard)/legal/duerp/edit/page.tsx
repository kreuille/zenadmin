'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RiskForm } from '@/components/legal/risk-form';
import { DuerpPreview } from '@/components/legal/duerp-preview';

// BUSINESS RULE [CDC-2.4]: Edition DUERP

interface Risk {
  id: string;
  category: string;
  name: string;
  description: string | null;
  gravity: number;
  probability: number;
  risk_level: number;
  risk_label: string;
  preventive_actions: string[];
  responsible: string | null;
}

function calculateLevel(g: number, p: number): { level: number; label: string } {
  const score = g * p;
  if (score <= 3) return { level: score, label: 'faible' };
  if (score <= 6) return { level: score, label: 'modere' };
  if (score <= 9) return { level: score, label: 'eleve' };
  return { level: score, label: 'critique' };
}

export default function EditDuerpPage() {
  const [companyName, setCompanyName] = useState('Mon Entreprise');
  const [nafCode, setNafCode] = useState('43.21A');
  const [evaluator, setEvaluator] = useState('');
  const [risks, setRisks] = useState<Risk[]>([]);
  const [showForm, setShowForm] = useState(false);

  const handleAddRisk = (data: {
    category: string;
    name: string;
    description: string;
    gravity: number;
    probability: number;
    preventive_actions: string[];
    responsible: string;
  }) => {
    const { level, label } = calculateLevel(data.gravity, data.probability);
    const risk: Risk = {
      id: crypto.randomUUID(),
      category: data.category,
      name: data.name,
      description: data.description || null,
      gravity: data.gravity,
      probability: data.probability,
      risk_level: level,
      risk_label: label,
      preventive_actions: data.preventive_actions,
      responsible: data.responsible || null,
    };
    setRisks((prev) => [...prev, risk]);
    setShowForm(false);
  };

  const handleDeleteRisk = (riskId: string) => {
    setRisks((prev) => prev.filter((r) => r.id !== riskId));
  };

  const handleLoadDefaults = () => {
    // TODO: Call API GET /api/legal/duerp/risks/:nafCode
    alert(`Charger les risques par defaut pour le code NAF ${nafCode}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editer le DUERP</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configurez votre Document Unique d'Evaluation des Risques.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/legal/duerp">
            <Button variant="outline">Annuler</Button>
          </a>
          <Button>Enregistrer</Button>
        </div>
      </div>

      {/* Informations generales */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations generales</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise</label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code NAF</label>
              <div className="flex gap-2">
                <Input value={nafCode} onChange={(e) => setNafCode(e.target.value)} />
                <Button variant="outline" onClick={handleLoadDefaults}>
                  Charger risques
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Evaluateur</label>
              <Input value={evaluator} onChange={(e) => setEvaluator(e.target.value)} placeholder="Nom de l'evaluateur" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risques */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Risques identifies ({risks.length})
            </h2>
            <Button onClick={() => setShowForm(true)}>Ajouter un risque</Button>
          </div>

          {showForm && (
            <div className="mb-4 border rounded-lg p-4 bg-gray-50">
              <RiskForm onSubmit={handleAddRisk} onCancel={() => setShowForm(false)} />
            </div>
          )}

          {risks.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              Aucun risque identifie. Chargez les risques par defaut via le code NAF ou ajoutez-les manuellement.
            </p>
          ) : (
            <DuerpPreview risks={risks} onDelete={handleDeleteRisk} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
