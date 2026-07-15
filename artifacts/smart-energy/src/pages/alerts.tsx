import { useGetAlerts, useDismissAlert, getGetAlertsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, AlertCircle, Info, Zap, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

const alertIcons = {
  high_power: AlertTriangle,
  unusual_usage: AlertCircle,
  bill_alert: Zap,
  appliance_alert: AlertCircle,
  info: Info,
};

const severityColors = {
  low: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  medium: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  critical: 'bg-destructive/20 text-destructive border-destructive/30',
};

export default function Alerts() {
  const queryClient = useQueryClient();
  const { data: alerts, isLoading } = useGetAlerts({
    query: { queryKey: getGetAlertsQueryKey() },
  });

  const dismissAlert = useDismissAlert();

  const handleDismiss = (id: string) => {
    dismissAlert.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        },
      }
    );
  };

  const activeAlerts = alerts?.filter((a) => !a.isDismissed) || [];
  const dismissedAlerts = alerts?.filter((a) => a.isDismissed) || [];

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeAlerts.length} active alert{activeAlerts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Active Alerts */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Active Alerts</h2>
        {activeAlerts.length > 0 ? (
          activeAlerts.map((alert) => {
            const Icon = alertIcons[alert.type] || Info;
            return (
              <div
                key={alert.id}
                className={`bg-card border rounded-xl p-6 shadow-md ${severityColors[alert.severity]}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{alert.title}</h3>
                        {alert.applianceName && (
                          <p className="text-sm text-muted-foreground">Appliance: {alert.applianceName}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground/90 mb-3">{alert.message}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(alert.timestamp), 'MMM dd, yyyy • hh:mm a')}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDismiss(alert.id)}
                        disabled={dismissAlert.isPending}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-card border border-card-border rounded-xl p-12 shadow-md text-center">
            <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No active alerts</p>
          </div>
        )}
      </div>

      {/* Dismissed Alerts */}
      {dismissedAlerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Dismissed Alerts</h2>
          {dismissedAlerts.map((alert) => {
            const Icon = alertIcons[alert.type] || Info;
            return (
              <div
                key={alert.id}
                className="bg-card border border-card-border rounded-xl p-6 shadow-md opacity-60"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <Icon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{alert.title}</h3>
                        {alert.applianceName && (
                          <p className="text-sm text-muted-foreground">Appliance: {alert.applianceName}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Dismissed
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(alert.timestamp), 'MMM dd, yyyy • hh:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
