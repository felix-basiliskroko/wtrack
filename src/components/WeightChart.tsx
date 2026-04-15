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
import { DisplayPreferences, PredictionPoint, WeightEntry } from '../types';
import { convertWeight, formatShortDate } from '../utils/formatting';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type WeightChartProps = {
  entries: WeightEntry[];
  predictions: PredictionPoint[];
  goalWeight: number;
  preferences: DisplayPreferences;
};

export const WeightChart = ({ entries, predictions, goalWeight, preferences }: WeightChartProps) => {
  const timeline = useMemo(() => buildCombinedTimeline(entries, predictions), [entries, predictions]);

  const chartData = useMemo<ChartData<'line'>>(() => {
    const labels = timeline.map((point) => formatShortDate(point.label, preferences.dateFormat));

    const actualData = timeline.map((point) =>
      point.type === 'actual' ? convertWeight(point.weight, preferences.weightUnit) : null,
    );
    const predictedData = timeline.map((point) =>
      point.type === 'prediction' ? convertWeight(point.weight, preferences.weightUnit) : null,
    );
    const upperData = timeline.map((point) =>
      point.type === 'prediction' ? convertWeight(point.upper ?? point.weight, preferences.weightUnit) : null,
    );
    const lowerData = timeline.map((point) =>
      point.type === 'prediction' ? convertWeight(point.lower ?? point.weight, preferences.weightUnit) : null,
    );
    const goalLine = timeline.map(() => convertWeight(goalWeight, preferences.weightUnit));
    const actualLineWidth = preferences.chartLineStyle === 'strong' ? 3.5 : 2.25;
    const actualPointRadius = preferences.chartLineStyle === 'strong' ? 5 : 3;
    const predictionLineWidth = preferences.chartLineStyle === 'strong' ? 2.75 : 2;
    const predictionDash = preferences.chartLineStyle === 'strong' ? [8, 6] : [4, 4];

    const datasets: ChartData<'line'>['datasets'] = [];

    if (preferences.showConfidenceBand) {
      datasets.push(
        {
          label: 'Confidence Floor',
          data: lowerData,
          borderColor: 'rgba(57, 196, 255, 0)',
          backgroundColor: 'rgba(57, 196, 255, 0.04)',
          pointRadius: 0,
          tension: preferences.chartLineStyle === 'strong' ? 0.35 : 0.2,
          fill: false,
        },
        {
          label: 'Confidence Ceiling',
          data: upperData,
          borderColor: 'rgba(57, 196, 255, 0)',
          backgroundColor: 'rgba(57, 196, 255, 0.18)',
          pointRadius: 0,
          tension: preferences.chartLineStyle === 'strong' ? 0.35 : 0.2,
          fill: '-1',
        },
      );
    }

    datasets.push(
      {
          label: 'Recorded',
          data: actualData,
          borderColor: '#9d7bff',
          borderWidth: actualLineWidth,
          pointRadius: actualPointRadius,
          pointHoverRadius: actualPointRadius + 2,
          pointBackgroundColor: '#14142b',
          pointBorderColor: '#9d7bff',
          tension: preferences.chartLineStyle === 'strong' ? 0.35 : 0.18,
          spanGaps: true,
        },
        {
          label: 'Prediction',
          data: predictedData,
          borderColor: '#38e2ff',
          borderDash: predictionDash,
          borderWidth: predictionLineWidth,
          pointRadius: 0,
          tension: preferences.chartLineStyle === 'strong' ? 0.35 : 0.18,
          spanGaps: true,
        },
      );

    if (preferences.showGoalLine) {
      datasets.push({
          label: 'Target',
          data: goalLine,
          borderColor: 'rgba(89, 255, 146, 0.8)',
          borderDash: [4, 6],
          pointRadius: 0,
          tension: 0,
        });
    }

    return { labels, datasets };
  }, [goalWeight, preferences, timeline]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation:
      preferences.motion === 'off'
        ? false
        : {
            duration: preferences.motion === 'reduced' ? 200 : 700,
          },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#cbcee3',
          usePointStyle: true,
          pointStyle: 'circle',
          filter: (item) =>
            preferences.showConfidenceBand ||
            (item.text !== 'Confidence Floor' && item.text !== 'Confidence Ceiling'),
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
            `${context.dataset.label ?? 'value'}: ${context.parsed.y?.toFixed(1)} ${preferences.weightUnit}`,
          title: (items) => {
            if (!items.length) return '';
            return format(timeline[items[0].dataIndex].label, 'PPP');
          },
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
          callback: (value: string | number) => `${value} ${preferences.weightUnit}`,
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
