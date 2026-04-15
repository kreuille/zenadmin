'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditQuotePage({ params }: { params: { id: string } }) {
  // Placeholder - will load quote from API
  const loading = true;

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/quotes" className="text-sm text-gray-500 hover:text-gray-700">
              &larr; Retour aux devis
            </Link>
            <Skeleton className="h-8 w-48 mt-1" />
          </div>
        </div>
        <Card>
          <CardContent className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/quotes" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Retour aux devis
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Edition devis</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/quotes/${params.id}/preview`}>
            <Button variant="outline">Apercu PDF</Button>
          </Link>
          <Button>Enregistrer</Button>
        </div>
      </div>
    </div>
  );
}
