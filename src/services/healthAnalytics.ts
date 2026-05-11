import {
  ChartWeightSource,
  DailyHealthMetrics,
  HealthSnapshot,
  MetabolicProfile,
  WeightEntry,
  WeightMeasurement,
} from '../types';

const DAY_MS = 1000 * 60 * 60 * 24;
const KCAL_PER_KG = 7700;

const toWeightEntry = (measurement: WeightMeasurement): WeightEntry => ({
  id: measurement.id,
  timestamp: measurement.timestamp,
  weight: measurement.weightKg,
  source: 'appleHealth',
});

export function buildDisplayEntries(
  manualEntries: WeightEntry[],
  health: HealthSnapshot,
  source: ChartWeightSource,
) {
  const manual = manualEntries.map((entry) => ({ ...entry, source: entry.source ?? 'manual' }));
  const imported = health.weightMeasurements.map(toWeightEntry);
  const selected = source === 'manual' ? manual : source === 'appleHealth' ? imported : [...manual, ...imported];

  return selected.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

const latestMetrics = (metrics: DailyHealthMetrics[], days: number) => metrics.slice(Math.max(metrics.length - days, 0));

const formatNumber = (value: number | undefined, suffix = '') =>
  value === undefined || Number.isNaN(value) ? 'No data' : `${Math.round(value).toLocaleString()}${suffix}`;

function trendKgPerWeek(entries: WeightEntry[]) {
  if (entries.length < 2) return undefined;
  const first = entries[0];
  const last = entries[entries.length - 1];
  const days = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / DAY_MS;
  if (days <= 0) return undefined;
  return ((last.weight - first.weight) / days) * 7;
}

export function buildHealthInsights(
  entries: WeightEntry[],
  health: HealthSnapshot,
  profile: MetabolicProfile,
) {
  const recent = latestMetrics(health.dailyMetrics, 14);
  const recentSleep = health.sleepNights.slice(Math.max(health.sleepNights.length - 14, 0));
  const recentWeights = entries.slice(Math.max(entries.length - 10, 0));
  const weeklyTrend = trendKgPerWeek(recentWeights);
  const avgSteps = average(recent.map((metric) => metric.steps).filter((value): value is number => value !== undefined));
  const avgActive = average(
    recent.map((metric) => metric.activeEnergyKcal).filter((value): value is number => value !== undefined),
  );
  const avgBasal = average(
    recent.map((metric) => metric.basalEnergyKcal).filter((value): value is number => value !== undefined),
  );
  const avgExercise = average(
    recent.map((metric) => metric.exerciseMinutes).filter((value): value is number => value !== undefined),
  );
  const avgSleep = average(recentSleep.map((night) => night.asleepMin / 60));
  const avgRestingHr = average(
    recent.map((metric) => metric.restingHeartRateBpm).filter((value): value is number => value !== undefined),
  );
  const avgHrv = average(recent.map((metric) => metric.hrvSdnnMs).filter((value): value is number => value !== undefined));
  const observedDeficit =
    weeklyTrend !== undefined && weeklyTrend < 0 ? Math.abs(weeklyTrend / 7) * KCAL_PER_KG : undefined;
  const estimatedTdee =
    avgBasal !== undefined || avgActive !== undefined
      ? (avgBasal ?? 0) + (avgActive ?? 0) + profile.dietDeficit
      : undefined;

  return [
    {
      label: 'Weight velocity',
      value:
        weeklyTrend === undefined
          ? 'Need more weigh-ins'
          : `${weeklyTrend > 0 ? '+' : ''}${weeklyTrend.toFixed(2)} kg/wk`,
      copy:
        weeklyTrend === undefined
          ? 'Two or more weight points unlock movement-linked trend analysis.'
          : weeklyTrend < 0
            ? `Loss trend implies roughly ${formatNumber(observedDeficit, ' kcal/day')} observed deficit.`
            : 'Trend is flat or up; compare sleep and movement for likely friction points.',
    },
    {
      label: 'Steps',
      value: formatNumber(avgSteps, ' /day'),
      copy:
        avgSteps === undefined
          ? 'Import step data to connect movement volume with scale trend.'
          : avgSteps >= 9000
            ? 'Movement volume is strong enough to support the target deficit.'
            : 'A higher step floor may improve the deficit without adding intense training.',
    },
    {
      label: 'Energy burn',
      value: formatNumber(avgActive, ' kcal/day'),
      copy:
        estimatedTdee === undefined
          ? 'Active and basal energy are not available yet.'
          : `Estimated TDEE baseline is about ${formatNumber(estimatedTdee, ' kcal/day')} before model uncertainty.`,
    },
    {
      label: 'Exercise',
      value: formatNumber(avgExercise, ' min/day'),
      copy:
        avgExercise === undefined
          ? 'Workout and exercise-minute imports can replace manual cardio assumptions.'
          : 'Imported exercise minutes now feed the forecast instead of relying only on manual workout logs.',
    },
    {
      label: 'Sleep',
      value: avgSleep === undefined ? 'No data' : `${avgSleep.toFixed(1)} h/night`,
      copy:
        avgSleep === undefined
          ? 'Sleep import enables volatility checks around water retention and recovery.'
          : avgSleep >= 7
            ? 'Sleep duration is in a range that usually supports recovery during a deficit.'
            : 'Short sleep can make weigh-ins noisier and training recovery harder.',
    },
    {
      label: 'Recovery',
      value:
        avgRestingHr === undefined && avgHrv === undefined
          ? 'No data'
          : `${avgRestingHr ? `${avgRestingHr.toFixed(0)} bpm` : 'HR --'} / ${avgHrv ? `${avgHrv.toFixed(0)} ms` : 'HRV --'}`,
      copy: 'Resting HR and HRV are context signals; use them to spot stress, not as direct fat-loss proof.',
    },
  ];
}
