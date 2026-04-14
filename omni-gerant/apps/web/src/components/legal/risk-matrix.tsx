'use client';

// BUSINESS RULE [CDC-2.4]: Matrice des risques Gravite x Probabilite

interface Risk {
  gravity: number;
  probability: number;
  name: string;
}

interface RiskMatrixProps {
  risks: Risk[];
}

function levelColor(g: number, p: number): string {
  const score = g * p;
  if (score <= 3) return 'bg-green-100 text-green-800';
  if (score <= 6) return 'bg-yellow-100 text-yellow-800';
  if (score <= 9) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

export function RiskMatrix({ risks }: RiskMatrixProps) {
  // Count risks per cell
  const grid = new Map<string, Risk[]>();
  for (const risk of risks) {
    const key = `${risk.gravity}-${risk.probability}`;
    const existing = grid.get(key) || [];
    existing.push(risk);
    grid.set(key, existing);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 border border-gray-200 bg-gray-50 w-24"></th>
            <th className="p-2 border border-gray-200 bg-gray-50 text-center">Prob. 1<br/><span className="text-xs text-gray-400">Rare</span></th>
            <th className="p-2 border border-gray-200 bg-gray-50 text-center">Prob. 2<br/><span className="text-xs text-gray-400">Peu probable</span></th>
            <th className="p-2 border border-gray-200 bg-gray-50 text-center">Prob. 3<br/><span className="text-xs text-gray-400">Probable</span></th>
            <th className="p-2 border border-gray-200 bg-gray-50 text-center">Prob. 4<br/><span className="text-xs text-gray-400">Frequent</span></th>
          </tr>
        </thead>
        <tbody>
          {[4, 3, 2, 1].map((g) => (
            <tr key={g}>
              <th className="p-2 border border-gray-200 bg-gray-50 text-left">
                Grav. {g}<br/>
                <span className="text-xs text-gray-400">
                  {g === 4 ? 'Tres grave' : g === 3 ? 'Grave' : g === 2 ? 'Moyen' : 'Faible'}
                </span>
              </th>
              {[1, 2, 3, 4].map((p) => {
                const cellRisks = grid.get(`${g}-${p}`) || [];
                return (
                  <td
                    key={p}
                    className={`p-2 border border-gray-200 text-center ${levelColor(g, p)}`}
                  >
                    {cellRisks.length > 0 ? (
                      <div>
                        <span className="font-bold">{cellRisks.length}</span>
                        <div className="text-xs mt-1">
                          {cellRisks.slice(0, 2).map((r, i) => (
                            <div key={i} className="truncate">{r.name}</div>
                          ))}
                          {cellRisks.length > 2 && <div>+{cellRisks.length - 2}</div>}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
