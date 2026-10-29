import { Lightbulb, Fan, Tv, Snowflake, Droplet, Flame, Zap, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Appliance } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, any> = {
  light: Lightbulb,
  fan: Fan,
  tv: Tv,
  refrigerator: Snowflake,
  pump: Droplet,
  heater: Flame,
  default: Zap,
};

interface ApplianceCardProps {
  appliance: Appliance;
  onToggle: (id: string, isOn: boolean) => void;
  isPending?: boolean;
  commandError?: string;
}

export function ApplianceCard({ appliance, onToggle, isPending, commandError }: ApplianceCardProps) {
  const Icon = iconMap[appliance.iconType] || iconMap.default;
  const pendingCommand = appliance.pendingCommand;

  return (
    <div
      className={cn(
        'bg-card border border-card-border rounded-xl p-5 shadow-md transition-all',
        appliance.isOn && 'ring-2 ring-primary/30'
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className={cn(
            'w-12 h-12 rounded-lg flex items-center justify-center',
            appliance.isOn ? 'bg-primary/20' : 'bg-muted'
          )}
        >
          <Icon className={cn('w-6 h-6', appliance.isOn ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <Switch
          checked={appliance.isOn}
          onCheckedChange={(checked) => onToggle(appliance.id, checked)}
          disabled={isPending || pendingCommand?.status === 'awaiting_ack'}
        />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{appliance.name}</h3>
      <p className="text-sm text-muted-foreground mb-3">{appliance.location}</p>
      {(isPending || pendingCommand || commandError) && (
        <div
          className={cn(
            'flex items-start gap-2 text-xs mb-3',
            commandError || pendingCommand?.status === 'timed_out'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
          )}
          role={commandError ? 'alert' : 'status'}
          aria-live="polite"
        >
          {isPending ? (
            <>
              <LoaderCircle className="w-4 h-4 shrink-0 animate-spin" />
              <span>Sending command…</span>
            </>
          ) : commandError ? (
            <>
              <TriangleAlert className="w-4 h-4 shrink-0" />
              <span>{commandError}</span>
            </>
          ) : pendingCommand?.status === 'timed_out' ? (
            <>
              <TriangleAlert className="w-4 h-4 shrink-0" />
              <span>
                No acknowledgement in 30 seconds. Check the device; the switch shows the last confirmed state.
              </span>
            </>
          ) : pendingCommand ? (
            <span>
              Command queued for {pendingCommand.state}; pending device acknowledgement.
            </span>
          ) : null}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-card-border">
        <div>
          <p className="text-xs text-muted-foreground">Power</p>
          <p className="text-sm font-semibold text-foreground">{appliance.powerW} W</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="text-sm font-semibold text-foreground">{appliance.todayUsageKwh.toFixed(2)} kWh</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Monthly</p>
          <p className="text-sm font-semibold text-foreground">₹{appliance.monthlyCostInr}</p>
        </div>
      </div>
    </div>
  );
}
