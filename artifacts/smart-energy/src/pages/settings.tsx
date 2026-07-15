import { useState, useEffect } from 'react';
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const updateSettings = useUpdateSettings();

  const [formData, setFormData] = useState({
    userName: '',
    homeDescription: '',
    electricityProvider: '',
    tariffRatePerKwh: '',
    monthlyBudgetInr: '',
    highPowerThresholdW: '',
    notificationsEnabled: true,
    emailNotifications: true,
    smsNotifications: false,
    timezone: '',
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        userName: settings.userName,
        homeDescription: settings.homeDescription,
        electricityProvider: settings.electricityProvider,
        tariffRatePerKwh: settings.tariffRatePerKwh.toString(),
        monthlyBudgetInr: settings.monthlyBudgetInr.toString(),
        highPowerThresholdW: settings.highPowerThresholdW.toString(),
        notificationsEnabled: settings.notificationsEnabled,
        emailNotifications: settings.emailNotifications,
        smsNotifications: settings.smsNotifications,
        timezone: settings.timezone,
      });
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(
      {
        data: {
          userName: formData.userName,
          homeDescription: formData.homeDescription,
          electricityProvider: formData.electricityProvider,
          tariffRatePerKwh: Number(formData.tariffRatePerKwh),
          monthlyBudgetInr: Number(formData.monthlyBudgetInr),
          highPowerThresholdW: Number(formData.highPowerThresholdW),
          notificationsEnabled: formData.notificationsEnabled,
          emailNotifications: formData.emailNotifications,
          smsNotifications: formData.smsNotifications,
          timezone: formData.timezone,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({
            title: 'Settings saved',
            description: 'Your settings have been updated successfully.',
          });
        },
        onError: () => {
          toast({
            title: 'Error',
            description: 'Failed to save settings. Please try again.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="space-y-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and system preferences</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Personal Information */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-4">Personal Information</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="userName">Name</Label>
              <Input
                id="userName"
                value={formData.userName}
                onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                placeholder="Your name"
              />
            </div>
            <div>
              <Label htmlFor="homeDescription">Home Description</Label>
              <Input
                id="homeDescription"
                value={formData.homeDescription}
                onChange={(e) => setFormData({ ...formData, homeDescription: e.target.value })}
                placeholder="e.g., 3 BHK Apartment"
              />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                placeholder="e.g., Asia/Kolkata"
              />
            </div>
          </div>
        </div>

        {/* Electricity Settings */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-4">Electricity Settings</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="electricityProvider">Electricity Provider</Label>
              <Input
                id="electricityProvider"
                value={formData.electricityProvider}
                onChange={(e) => setFormData({ ...formData, electricityProvider: e.target.value })}
                placeholder="e.g., MSEDCL, BEST"
              />
            </div>
            <div>
              <Label htmlFor="tariffRatePerKwh">Tariff Rate per kWh (₹)</Label>
              <Input
                id="tariffRatePerKwh"
                type="number"
                step="0.01"
                value={formData.tariffRatePerKwh}
                onChange={(e) => setFormData({ ...formData, tariffRatePerKwh: e.target.value })}
                placeholder="e.g., 7.50"
              />
            </div>
            <div>
              <Label htmlFor="monthlyBudgetInr">Monthly Budget (₹)</Label>
              <Input
                id="monthlyBudgetInr"
                type="number"
                value={formData.monthlyBudgetInr}
                onChange={(e) => setFormData({ ...formData, monthlyBudgetInr: e.target.value })}
                placeholder="e.g., 1500"
              />
            </div>
            <div>
              <Label htmlFor="highPowerThresholdW">High Power Threshold (W)</Label>
              <Input
                id="highPowerThresholdW"
                type="number"
                value={formData.highPowerThresholdW}
                onChange={(e) => setFormData({ ...formData, highPowerThresholdW: e.target.value })}
                placeholder="e.g., 2000"
              />
              <p className="text-xs text-muted-foreground mt-1">
                You'll receive alerts when power usage exceeds this threshold
              </p>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-4">Notification Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notificationsEnabled">Enable Notifications</Label>
                <p className="text-xs text-muted-foreground">Receive alerts and updates</p>
              </div>
              <Switch
                id="notificationsEnabled"
                checked={formData.notificationsEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, notificationsEnabled: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="emailNotifications">Email Notifications</Label>
                <p className="text-xs text-muted-foreground">Receive alerts via email</p>
              </div>
              <Switch
                id="emailNotifications"
                checked={formData.emailNotifications}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, emailNotifications: checked })
                }
                disabled={!formData.notificationsEnabled}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="smsNotifications">SMS Notifications</Label>
                <p className="text-xs text-muted-foreground">Receive alerts via SMS</p>
              </div>
              <Switch
                id="smsNotifications"
                checked={formData.smsNotifications}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, smsNotifications: checked })
                }
                disabled={!formData.notificationsEnabled}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <Button type="submit" className="w-full" disabled={updateSettings.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </form>
    </div>
  );
}
