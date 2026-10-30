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
  getGetEnergyConsumptionQueryKey,
  getGetAppliancesQueryKey,
  useTurnAllOff,
  useToggleAppliance,
} from '@workspace/api-client-react';
import { estimatePowerFromConfirmedStates } from '@workspace/api-zod';
import { isFreshSensorTimestamp, isValidCurrentA, isValidVoltageV } from '@/lib/sensor-readings';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ApplianceCard } from '@/components/appliances/appliance-card';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week');

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 10000 },
  });

  const { data: liveMetrics, isError: liveMetricsError } = useGetLiveMetrics({
    query: {
      queryKey: getGetLiveMetricsQueryKey(),
      refetchInterval: 3000,
    },
  });

  const { data: energyData } = useGetEnergyConsumption({ period }, { query: { enabled: true, queryKey: getGetEnergyConsumptionQueryKey({ period }) } });

  const { data: appliances, isError: appliancesError } = useGetAppliances({
    query: {
      queryKey: getGetAppliancesQueryKey(),
      refetchInterval: 3000,
    },
  });

  const turnAllOff = useTurnAllOff();
  const toggleAppliance = useToggleAppliance();

  const handleToggle = (id: string, isOn: boolean) => {
    toggleAppliance.mutate(
      { id, data: { isOn } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAppliancesQueryKey() });
        },
      }
    );
  };

  const handleTurnAllOff = () => {
    turnAllOff.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAppliancesQueryKey() });
      },
    });
  };

  const activeAppliances = appliances?.filter((a) => a.isOn).slice(0, 3) || [];
  const estimatedPowerW = appliancesError
    ? null
    : estimatePowerFromConfirmedStates(appliances ?? []);
  const sensorReadingFresh = !liveMetricsError && isFreshSensorTimestamp(liveMetrics?.timestamp);
  const voltageText =
    sensorReadingFresh && isValidVoltageV(liveMetrics?.voltageV)
      ? liveMetrics.voltageV.toFixed(1)
      : '—';
  const currentText =
    sensorReadingFresh &&
    isValidVoltageV(liveMetrics?.voltageV) &&
    isValidCurrentA(liveMetrics?.currentA)
      ? liveMetrics.currentA.toFixed(2)
      : '—';
  const powerFactorText =
    sensorReadingFresh && typeof liveMetrics?.powerFactor === 'number'
      ? liveMetrics.powerFactor.toFixed(2)
      : '—';

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
        {summary?.demoMode && (
          <Badge variant="outline" className="mt-2">DEMO MODE – SIMULATED READINGS</Badge>
        )}
        {(summaryError || liveMetricsError || appliancesError) && (
          <p role="alert" className="text-sm text-destructive mt-2">
            {appliancesError
              ? 'Appliance data is unavailable. Check the API connection and database appliance records.'
              : summaryError
                ? 'Dashboard summary is unavailable. Check the API and database connection.'
                : 'Live electrical readings are unavailable. Check sensor data or the five confirmed appliance states required by Demo Mode.'}
          </p>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon={Zap}
          label="Estimated Power"
          value={estimatedPowerW === null ? '—' : `${estimatedPowerW} W`}
          subtitle="Estimated from acknowledged relay states"
          badge={estimatedPowerW === null ? 'Unavailable' : 'Estimate'}
        />
        <MetricCard
          icon={Activity}
          label={summary?.demoMode ? 'Demo Session Energy' : "Today's Energy"}
          value={summary ? `${summary.todayEnergyKwh.toFixed(2)} kWh` : '—'}
          trend={{
            value: summary?.todayChangePercent || 0,
            isPositive: (summary?.todayChangePercent || 0) >= 0,
          }}
        />
        <MetricCard
          icon={Calendar}
          label="This Month (So Far)"
          value={summary ? `${summary.monthEnergyKwh.toFixed(1)} kWh` : '—'}
          trend={{
            value: summary?.monthChangePercent || 0,
            isPositive: (summary?.monthChangePercent || 0) >= 0,
          }}
        />
        <MetricCard
          icon={IndianRupee}
          label="Est. Monthly Bill"
          value={summary ? `₹${summary.estimatedBillInr.toLocaleString()}` : '—'}
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
              Estimate
            </Badge>
          </div>
          <div className="h-64">
            <PowerGauge currentPowerW={estimatedPowerW} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-card-border">
            <div>
              <p className="text-xs text-muted-foreground">Voltage</p>
              <p className="text-lg font-semibold text-foreground">{voltageText} V</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-lg font-semibold text-foreground">{currentText} A</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Power Factor</p>
              <p className="text-lg font-semibold text-foreground">{powerFactorText}</p>
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
