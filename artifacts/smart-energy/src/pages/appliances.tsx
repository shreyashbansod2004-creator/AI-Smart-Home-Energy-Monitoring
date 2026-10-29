import { useEffect, useRef, useState } from 'react';
import {
  getGetAppliancesQueryKey,
  toggleAppliance as submitApplianceCommand,
  useGetAppliances,
  useTurnAllOff,
} from '@workspace/api-client-react';
import type { Appliance } from '@workspace/api-client-react';
import { ApplianceCard } from '@/components/appliances/appliance-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { Power } from 'lucide-react';

const COMMAND_REQUEST_TIMEOUT_MS = 15_000;

export default function Appliances() {
  const queryClient = useQueryClient();
  const { data: appliances, isLoading } = useGetAppliances({
    query: { queryKey: getGetAppliancesQueryKey(), refetchInterval: 2000 },
  });

  const turnAllOff = useTurnAllOff();
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());
  const [commandErrors, setCommandErrors] = useState<
    Record<string, { message: string; requestedState: boolean }>
  >({});
  const inFlightIds = useRef(new Set<string>());

  useEffect(() => {
    if (!appliances) return;
    setCommandErrors((current) => {
      let next = current;
      for (const appliance of appliances) {
        const error = current[appliance.id];
        if (!error) continue;
        const matchingPendingCommand =
          appliance.pendingCommand?.state === (error.requestedState ? 'ON' : 'OFF') &&
          appliance.pendingCommand.status === 'awaiting_ack';
        const confirmedAfterLateAck =
          !appliance.pendingCommand && appliance.isOn === error.requestedState;
        if (matchingPendingCommand || confirmedAfterLateAck) {
          if (next === current) next = { ...current };
          delete next[appliance.id];
        }
      }
      return next;
    });
  }, [appliances]);

  const handleToggle = async (id: string, isOn: boolean) => {
    const appliance = appliances?.find((item) => item.id === id);
    if (
      !appliance ||
      inFlightIds.current.has(id) ||
      appliance.pendingCommand?.status === 'awaiting_ack'
    ) {
      return;
    }

    inFlightIds.current.add(id);
    setSubmittingIds((current) => new Set(current).add(id));
    setCommandErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      COMMAND_REQUEST_TIMEOUT_MS,
    );
    const queryKey = getGetAppliancesQueryKey();

    try {
      const updatedAppliance = await submitApplianceCommand(
        id,
        { isOn },
        { signal: controller.signal },
      );
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<Appliance[]>(queryKey, (current) =>
        current?.map((item) => (item.id === id ? updatedAppliance : item)),
      );
      void queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      setCommandErrors((current) => ({
        ...current,
        [id]: {
          requestedState: isOn,
          message: controller.signal.aborted
            ? 'No response within 15 seconds. The request may have reached the server; checking command status.'
            : error instanceof Error && error.message
              ? `Command failed: ${error.message}. Check the connection and retry.`
              : 'Command failed to send. Check the connection and retry.',
        },
      }));
      void queryClient.invalidateQueries({ queryKey });
    } finally {
      window.clearTimeout(timeoutId);
      inFlightIds.current.delete(id);
      setSubmittingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
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
            isPending={submittingIds.has(appliance.id)}
            commandError={commandErrors[appliance.id]?.message}
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
