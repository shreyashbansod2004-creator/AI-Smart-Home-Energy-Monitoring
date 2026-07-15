import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  badge?: string;
}

export function MetricCard({ icon: Icon, label, value, subtitle, trend, badge }: MetricCardProps) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        {badge && (
          <span className="px-2 py-1 text-xs font-semibold text-primary bg-primary/20 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-muted-foreground mb-1">{label}</div>
      <div className="text-3xl font-bold text-foreground mb-1">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      {trend && (
        <div className="flex items-center gap-1 mt-2">
          {trend.isPositive ? (
            <TrendingUp className="w-4 h-4 text-primary" />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive" />
          )}
          <span
            className={cn(
              'text-xs font-medium',
              trend.isPositive ? 'text-primary' : 'text-destructive'
            )}
          >
            {Math.abs(trend.value)}% vs yesterday
          </span>
        </div>
      )}
    </div>
  );
}
