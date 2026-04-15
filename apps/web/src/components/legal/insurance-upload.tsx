'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// BUSINESS RULE [CDC-2.4]: Upload attestation assurance

interface InsuranceUploadProps {
  insuranceId: string;
  onUpload: (id: string, file: File) => void;
  onCancel: () => void;
}

export function InsuranceUpload({ insuranceId, onUpload, onCancel }: InsuranceUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = () => {
    if (file) {
      onUpload(insuranceId, file);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Joindre une attestation</h3>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          {file ? (
            <div>
              <p className="text-sm font-medium text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {(file.size / 1024).toFixed(0)} Ko
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600">
                Glissez-deposez votre attestation PDF ici
              </p>
              <p className="text-xs text-gray-400 mt-1">ou</p>
              <label className="inline-block mt-2 cursor-pointer">
                <span className="text-sm text-blue-600 hover:underline">
                  Parcourir les fichiers
                </span>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onCancel}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={!file}>
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
