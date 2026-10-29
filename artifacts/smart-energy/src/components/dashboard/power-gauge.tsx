import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

interface PowerGaugeProps {
  currentPowerW: number | null;
  maxPowerW?: number;
}

export function PowerGauge({ currentPowerW, maxPowerW = 5000 }: PowerGaugeProps) {
  const percentage =
    currentPowerW === null
      ? 0
      : Math.min((Math.max(currentPowerW, 0) / maxPowerW) * 100, 100);
  
  // Color logic: green -> yellow -> orange -> red
  let color = '#22c55e'; // green
  if (percentage > 75) color = '#ef4444'; // red
  else if (percentage > 50) color = '#f97316'; // orange
  else if (percentage > 25) color = '#eab308'; // yellow

  const data = [
    {
      name: 'power',
      value: percentage,
      fill: color,
    },
  ];

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          barSize={16}
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar
            background={{ fill: 'hsl(var(--muted))' }}
            dataKey="value"
            cornerRadius={8}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-bold text-foreground">
          {currentPowerW === null ? '—' : currentPowerW}
        </div>
        <div className="text-sm text-muted-foreground">W</div>
        <div className="text-xs text-muted-foreground mt-1">Estimated Power</div>
      </div>
    </div>
  );
}
