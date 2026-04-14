'use client';

import { Card, CardContent } from '@/components/ui/card';

// BUSINESS RULE [CDC-4]: Widget KPI dashboard

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'gray';
}

const COLOR_MAP = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  red: 'text-red-600',
  orange: 'text-orange-600',
  gray: 'text-gray-700',
};

export function KpiCard({ title, value, subtitle, trend, color = 'gray' }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${COLOR_MAP[color]}`}>{value}</p>
        {(subtitle || trend !== undefined) && (
          <div className="flex items-center gap-2 mt-1">
            {trend !== undefined && (
              <span className={`text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trend >= 0 ? '+' : ''}{trend}%
              </span>
            )}
            {subtitle && (
              <span className="text-xs text-gray-400">{subtitle}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
