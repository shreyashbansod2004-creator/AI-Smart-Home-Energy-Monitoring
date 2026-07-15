import { useState } from 'react';
import { useGetCurrentPrediction, usePredictBill } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Calendar, IndianRupee, Target, Lightbulb } from 'lucide-react';

export default function Prediction() {
  const { data: prediction, isLoading } = useGetCurrentPrediction();
  const predictBill = usePredictBill();

  const [formData, setFormData] = useState({
    prevMonthKwh: '',
    currentMonthKwh: '',
    avgDailyKwh: '',
    applianceCount: '',
    targetBudgetInr: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    predictBill.mutate({
      data: {
        prevMonthKwh: Number(formData.prevMonthKwh),
        currentMonthKwh: Number(formData.currentMonthKwh),
        avgDailyKwh: Number(formData.avgDailyKwh),
        applianceCount: Number(formData.applianceCount),
        targetBudgetInr: formData.targetBudgetInr ? Number(formData.targetBudgetInr) : undefined,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  const currentPrediction = predictBill.data || prediction;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">AI Bill Prediction</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Get AI-powered predictions for your electricity bill
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-semibold text-foreground mb-6">Enter Usage Data</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="prevMonthKwh">Previous Month (kWh)</Label>
              <Input
                id="prevMonthKwh"
                type="number"
                step="0.1"
                value={formData.prevMonthKwh}
                onChange={(e) => setFormData({ ...formData, prevMonthKwh: e.target.value })}
                placeholder="e.g., 245.5"
                required
              />
            </div>

            <div>
              <Label htmlFor="currentMonthKwh">Current Month So Far (kWh)</Label>
              <Input
                id="currentMonthKwh"
                type="number"
                step="0.1"
                value={formData.currentMonthKwh}
                onChange={(e) => setFormData({ ...formData, currentMonthKwh: e.target.value })}
                placeholder="e.g., 126.7"
                required
              />
            </div>

            <div>
              <Label htmlFor="avgDailyKwh">Average Daily Usage (kWh)</Label>
              <Input
                id="avgDailyKwh"
                type="number"
                step="0.1"
                value={formData.avgDailyKwh}
                onChange={(e) => setFormData({ ...formData, avgDailyKwh: e.target.value })}
                placeholder="e.g., 8.2"
                required
              />
            </div>

            <div>
              <Label htmlFor="applianceCount">Number of Appliances</Label>
              <Input
                id="applianceCount"
                type="number"
                value={formData.applianceCount}
                onChange={(e) => setFormData({ ...formData, applianceCount: e.target.value })}
                placeholder="e.g., 8"
                required
              />
            </div>

            <div>
              <Label htmlFor="targetBudgetInr">Target Budget (₹) - Optional</Label>
              <Input
                id="targetBudgetInr"
                type="number"
                value={formData.targetBudgetInr}
                onChange={(e) => setFormData({ ...formData, targetBudgetInr: e.target.value })}
                placeholder="e.g., 1500"
              />
            </div>

            <Button type="submit" className="w-full" disabled={predictBill.isPending}>
              {predictBill.isPending ? 'Predicting...' : 'Predict Bill'}
            </Button>
          </form>
        </div>

        {/* Prediction Results */}
        <div className="space-y-6">
          {currentPrediction && (
            <>
              {/* Predicted Bill */}
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
                <div className="flex items-center gap-2 mb-4">
                  <IndianRupee className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Predicted Bill</h2>
                </div>
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-2">Predicted Range</p>
                  <p className="text-4xl font-bold text-primary">
                    ₹{currentPrediction.predictedBillMinInr.toLocaleString()} - ₹
                    {currentPrediction.predictedBillMaxInr.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Most likely: ₹{currentPrediction.predictedBillInr.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    {currentPrediction.confidencePercent}% confidence
                  </span>
                </div>
              </div>

              {/* Budget Status */}
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Budget Status</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Target Budget</span>
                    <span className="font-medium text-foreground">
                      ₹{currentPrediction.targetBudgetInr.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Budget Used</span>
                      <span className="font-medium text-foreground">
                        {currentPrediction.budgetUsedPercent.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={currentPrediction.budgetUsedPercent} className="h-3" />
                  </div>
                  {currentPrediction.willExceedBudget && (
                    <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                      <p className="text-sm text-destructive font-medium">
                        Warning: You are likely to exceed your budget this month
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-card-border rounded-xl p-4 shadow-md">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Days Remaining</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{currentPrediction.daysRemainingInMonth}</p>
                </div>

                <div className="bg-card border border-card-border rounded-xl p-4 shadow-md">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Expected kWh</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {currentPrediction.expectedKwh.toFixed(1)}
                  </p>
                </div>
              </div>

              {/* AI Tip */}
              {currentPrediction.tip && (
                <div className="bg-card border border-card-border rounded-xl p-6 shadow-md">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">AI Tip</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{currentPrediction.tip}</p>
                </div>
              )}
            </>
          )}

          {!currentPrediction && (
            <div className="bg-card border border-card-border rounded-xl p-12 shadow-md text-center">
              <p className="text-muted-foreground">Enter your usage data to get a prediction</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
