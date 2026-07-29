import { useState } from 'react';
import { Zap, Activity, Calendar, IndianRupee } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/metric-card';
import { PowerGauge } from '@/components/dashboard/power-gauge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  useGetDashboardSummary,
  useGetLiveMetrics,
  useGetEnergyConsumption,
  useGetAppliances,
  getGetDashboardSummaryQueryKey,
  getGetLiveMetricsQueryKey,
  useTurnAllOff,
  useToggleAppliance,
} from '@workspace/api-client-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ApplianceCard } from '@/components/appliances/appliance-card';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week');

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const { data: liveMetrics } = useGetLiveMetrics({
    query: {
      queryKey: getGetLiveMetricsQueryKey(),
      refetchInterval: 3000,
    },
  });

  const { data: energyData } = useGetEnergyConsumption({ period }, { query: { enabled: true } });

  const { data: appliances } = useGetAppliances();

  const turnAllOff = useTurnAllOff();
  const toggleAppliance = useToggleAppliance();

  const handleToggle = (id: string, isOn: boolean) => {
    toggleAppliance.mutate(
      { id, data: { isOn } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      }
    );
  };

  const handleTurnAllOff = () => {
    turnAllOff.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
    });
  };

  const activeAppliances = appliances?.filter((a) => a.isOn).slice(0, 3) || [];

  if (summaryLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back, monitor your energy usage</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon={Zap}
          label="Current Power"
          value={`${summary?.currentPowerW || 0} W`}
          subtitle={`Voltage: ${summary?.voltageV || 0}V  •  Current: ${summary?.currentA || 0}A`}
          badge="Live"
        />
        <MetricCard
          icon={Activity}
          label="Today's Energy"
          value={`${summary?.todayEnergyKwh.toFixed(2) || 0} kWh`}
          trend={{
            value: summary?.todayChangePercent || 0,
            isPositive: (summary?.todayChangePercent || 0) >= 0,
          }}
        />
        <MetricCard
          icon={Calendar}
          label="This Month (So Far)"
          value={`${summary?.monthEnergyKwh.toFixed(1) || 0} kWh`}
          trend={{
            value: summary?.monthChangePercent || 0,
            isPositive: (summary?.monthChangePercent || 0) >= 0,
          }}
        />
        <MetricCard
          icon={IndianRupee}
          label="Est. Monthly Bill"
          value={`₹${summary?.estimatedBillInr.toLocaleString() || 0}`}
          trend={{
            value: summary?.billChangePercent || 0,
            isPositive: (summary?.billChangePercent || 0) <= 0,
          }}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Power Gauge */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Current Usage Overview</h2>
            <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
              Live
            </Badge>
          </div>
          <div className="h-64">
            <PowerGauge currentPowerW={liveMetrics?.powerW || summary?.currentPowerW || 0} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-card-border">
            <div>
              <p className="text-xs text-muted-foreground">Voltage</p>
              <p className="text-lg font-semibold text-foreground">{summary?.voltageV || 0} V</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-lg font-semibold text-foreground">{summary?.currentA.toFixed(2) || 0} A</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Power Factor</p>
              <p className="text-lg font-semibold text-foreground">{summary?.powerFactorKw.toFixed(2) || 0} kW</p>
            </div>
          </div>
        </div>

        {/* Energy Chart */}
        <div className="lg:col-span-2 bg-card border border-card-border rounded-xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Energy Consumption (kWh)</h2>
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
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={energyData || []}>
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
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Appliances Status */}
      <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Appliances Status</h2>
          <Link href="/appliances" className="text-sm text-primary hover:underline">
            View All
          </Link>
        </div>
        <div className="space-y-3">
          {activeAppliances.map((appliance) => (
            <div key={appliance.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium text-foreground">{appliance.name}</p>
                <p className="text-xs text-muted-foreground">{appliance.location}</p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
                  ON
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">{appliance.powerW} W</p>
              </div>
            </div>
          ))}
          {activeAppliances.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No active appliances</p>
          )}
        </div>
        <Button onClick={handleTurnAllOff} variant="outline" className="w-full mt-4" disabled={turnAllOff.isPending}>
          Turn Off All
        </Button>
      </div>
    </div>
  );
}
