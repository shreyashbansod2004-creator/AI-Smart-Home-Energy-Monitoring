import { useGetAppliances, useToggleAppliance, useTurnAllOff, getGetAppliancesQueryKey } from '@workspace/api-client-react';
import { ApplianceCard } from '@/components/appliances/appliance-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { Power } from 'lucide-react';

export default function Appliances() {
  const queryClient = useQueryClient();
  const { data: appliances, isLoading } = useGetAppliances({
    query: { queryKey: getGetAppliancesQueryKey() },
  });

  const toggleAppliance = useToggleAppliance();
  const turnAllOff = useTurnAllOff();

  const handleToggle = (id: string, isOn: boolean) => {
    toggleAppliance.mutate(
      { id, data: { isOn } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAppliancesQueryKey() });
        },
      }
    );
  };

  const handleTurnAllOff = () => {
    turnAllOff.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAppliancesQueryKey() });
      },
    });
  };

  const activeCount = appliances?.filter((a) => a.isOn).length || 0;

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Appliances</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount} of {appliances?.length || 0} appliances active
          </p>
        </div>
        <Button onClick={handleTurnAllOff} disabled={turnAllOff.isPending || activeCount === 0}>
          <Power className="w-4 h-4 mr-2" />
          Turn Off All
        </Button>
      </div>

      {/* Appliances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {appliances?.map((appliance) => (
          <ApplianceCard
            key={appliance.id}
            appliance={appliance}
            onToggle={handleToggle}
            isPending={toggleAppliance.isPending}
          />
        ))}
      </div>

      {!appliances?.length && (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No appliances found</p>
        </div>
      )}
    </div>
  );
}
