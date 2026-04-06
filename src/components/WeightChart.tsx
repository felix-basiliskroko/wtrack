import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { format } from 'date-fns';
import { buildCombinedTimeline } from '../utils/gaussianProcess';
import { PredictionPoint, WeightEntry } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type WeightChartProps = {
  entries: WeightEntry[];
  predictions: PredictionPoint[];
  goalWeight: number;
};

export const WeightChart = ({ entries, predictions, goalWeight }: WeightChartProps) => {
  const timeline = useMemo(() => buildCombinedTimeline(entries, predictions), [entries, predictions]);

  const chartData = useMemo<ChartData<'line'>>(() => {
    const labels = timeline.map((point) => format(point.label, 'MMM d'));

    const actualData = timeline.map((point) => (point.type === 'actual' ? point.weight : null));
    const predictedData = timeline.map((point) => (point.type === 'prediction' ? point.weight : null));
    const upperData = timeline.map((point) =>
      point.type === 'prediction' ? point.upper ?? null : null,
    );
    const lowerData = timeline.map((point) =>
      point.type === 'prediction' ? point.lower ?? null : null,
    );
    const goalLine = timeline.map(() => goalWeight);

    return {
      labels,
      datasets: [
        {
          label: 'Confidence Floor',
          data: lowerData,
          borderColor: 'rgba(57, 196, 255, 0)',
          backgroundColor: 'rgba(57, 196, 255, 0.04)',
          pointRadius: 0,
          tension: 0.35,
          fill: false,
        },
        {
          label: 'Confidence Ceiling',
          data: upperData,
          borderColor: 'rgba(57, 196, 255, 0)',
          backgroundColor: 'rgba(57, 196, 255, 0.18)',
          pointRadius: 0,
          tension: 0.35,
          fill: '-1',
        },
        {
          label: 'Recorded',
          data: actualData,
          borderColor: '#9d7bff',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#14142b',
          pointBorderColor: '#9d7bff',
          tension: 0.35,
          spanGaps: true,
        },
        {
          label: 'Prediction',
          data: predictedData,
          borderColor: '#38e2ff',
          borderDash: [8, 6],
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.35,
          spanGaps: true,
        },
        {
          label: 'Target',
          data: goalLine,
          borderColor: 'rgba(89, 255, 146, 0.8)',
          borderDash: [4, 6],
          pointRadius: 0,
          tension: 0,
        },
      ],
    };
  }, [goalWeight, timeline]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#cbcee3',
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(10, 12, 24, 0.92)',
        padding: 16,
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleFont: { family: 'Space Grotesk', size: 14, weight: 'bold' },
        bodyFont: { family: 'Space Grotesk', size: 13 },
        callbacks: {
          label: (context: TooltipItem<'line'>) =>
            `${context.dataset.label ?? 'value'}: ${context.parsed.y?.toFixed(1)} kg`,
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255,255,255,0.05)',
        },
        ticks: {
          color: 'rgba(203, 206, 227, 0.8)',
          font: {
            family: 'Space Grotesk',
            size: 12,
          },
        },
      },
      y: {
        grid: {
          color: 'rgba(255,255,255,0.05)',
        },
        ticks: {
          color: 'rgba(203, 206, 227, 0.8)',
          font: {
            family: 'Space Grotesk',
            size: 12,
          },
          callback: (value: string | number) => `${value} kg`,
        },
      },
    },
  };

  return (
    <div className="chart-shell">
      <Line data={chartData} options={options} />
    </div>
  );
};
