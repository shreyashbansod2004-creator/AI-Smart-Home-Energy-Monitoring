import { useState } from 'react';
import { useGetEnergyAnalytics, useGetEnergyConsumption, useGetApplianceBreakdown } from '@workspace/api-client-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Lightbulb, AlertCircle } from 'lucide-react';

export default function Energy() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week');

  const { data: analytics, isLoading: analyticsLoading } = useGetEnergyAnalytics();
  const { data: energyData } = useGetEnergyConsumption({ period });
  const { data: breakdown } = useGetApplianceBreakdown();

  if (analyticsLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  const COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6'];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Energy Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Detailed insights into your energy consumption</p>
      </div>

      {/* Efficiency Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Efficiency Score</h3>
          <div className="flex items-end gap-2">
            <span className="text-5xl font-bold text-primary">{analytics?.efficiencyScore || 0}</span>
            <span className="text-2xl text-muted-foreground mb-1">/100</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Based on usage patterns</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Peak Usage</h3>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            <span className="text-3xl font-bold text-foreground">{analytics?.peakUsageHour || 'N/A'}</span>
          </div>
          <p className="text-xs text-muted-foreground">Highest consumption time</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Lowest Usage</h3>
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-5 h-5 text-primary" />
            <span className="text-3xl font-bold text-foreground">{analytics?.lowestUsageHour || 'N/A'}</span>
          </div>
          <p className="text-xs text-muted-foreground">Most efficient time</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Consumption Chart */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Energy Consumption</h2>
            <div className="flex gap-2">
              {(['day', 'week', 'month', 'year'] as const).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setPeriod(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={energyData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="energyKwh" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Appliance Breakdown */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-6">Appliance Breakdown</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={breakdown || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.percentage}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="percentage"
              >
                {breakdown?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Pattern */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-6">Hourly Usage Pattern</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={analytics?.hourlyPattern || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Line
                type="monotone"
                dataKey="energyKwh"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-2))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Trend */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-6">Weekly Trend</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics?.weeklyTrend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="energyKwh" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">AI Recommendations</h2>
        </div>
        <div className="space-y-3">
          {analytics?.recommendations?.map((rec) => (
            <div key={rec.id} className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <AlertCircle
                className={`w-5 h-5 flex-shrink-0 ${
                  rec.severity === 'critical'
                    ? 'text-destructive'
                    : rec.severity === 'warning'
                    ? 'text-amber-500'
                    : 'text-primary'
                }`}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-foreground">{rec.appliance}</span>
                  <Badge
                    variant={rec.severity === 'critical' ? 'destructive' : 'outline'}
                    className="text-xs"
                  >
                    {rec.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{rec.message}</p>
                <p className="text-xs text-primary font-medium mt-1">Potential saving: ₹{rec.savingInr}/month</p>
              </div>
            </div>
          ))}
          {!analytics?.recommendations?.length && (
            <p className="text-sm text-muted-foreground text-center py-4">No recommendations at this time</p>
          )}
        </div>
      </div>

      {/* Saving Opportunities */}
      {analytics?.savingOpportunities && analytics.savingOpportunities.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-4">Saving Opportunities</h2>
          <ul className="space-y-2">
            {analytics.savingOpportunities.map((opportunity, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-0.5">•</span>
                <span className="text-muted-foreground">{opportunity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
