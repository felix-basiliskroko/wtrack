import {
  MetabolicProfile,
  PredictionPoint,
  ProjectionSummary,
  WeightEntry,
  WorkoutEntry,
} from '../types';

const DAY_MS = 1000 * 60 * 60 * 24;
const KCAL_PER_KG = 7700;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const activityIntensity: Record<WorkoutEntry['activityType'], number> = {
  cardio: 1,
  intervals: 1.15,
  strength: 0.75,
};

const sortedEntries = (entries: WeightEntry[]) =>
  [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

const estimateBMR = (profile: MetabolicProfile, weightKg: number) => {
  const base =
    10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age + (profile.biologicalSex === 'male' ? 5 : -161);
  return base;
};

const calculateWorkoutCalories = (
  workout: WorkoutEntry | undefined,
  profile: MetabolicProfile,
  weightKg: number,
) => {
  if (!workout) return 0;
  if (!workout.durationMin || !workout.peakHeartRate) return 0;
  const heartRate = workout.peakHeartRate;
  const duration = workout.durationMin;
  const factor = activityIntensity[workout.activityType] ?? 1;

  let caloriesPerMinute = 0;
  if (profile.biologicalSex === 'male') {
    caloriesPerMinute = (-55.0969 + 0.6309 * heartRate + 0.1988 * weightKg + 0.2017 * profile.age) / 4.184;
  } else {
    caloriesPerMinute = (-20.4022 + 0.4472 * heartRate - 0.1263 * weightKg + 0.074 * profile.age) / 4.184;
  }

  return Math.max(caloriesPerMinute * duration * factor, 0);
};

const averageWorkoutCalories = (entries: WeightEntry[], profile: MetabolicProfile) => {
  const withWorkout = entries.filter((entry) => entry.workout);
  if (!withWorkout.length) return 220;

  const total = withWorkout.reduce(
    (sum, entry) => sum + calculateWorkoutCalories(entry.workout, profile, entry.weight),
    0,
  );
  return total / withWorkout.length;
};

export const generatePredictions = (
  entries: WeightEntry[],
  profile: MetabolicProfile,
): PredictionPoint[] => {
  if (!entries.length) return [];

  const ordered = sortedEntries(entries);
  const last = ordered[ordered.length - 1];
  const startDate = new Date(last.timestamp).getTime();
  const avgWorkoutCalories = averageWorkoutCalories(ordered.slice(-6), profile);
  const horizonDays = Math.max(profile.horizonDays, 7);

  let weight = last.weight;
  const results: PredictionPoint[] = [];

  for (let day = 1; day <= horizonDays; day++) {
    const bmr = estimateBMR(profile, weight);
    const baseTdee = bmr * profile.activityMultiplier;
    const totalDeficit = profile.dietDeficit + avgWorkoutCalories;
    const deficitKg = totalDeficit / KCAL_PER_KG;
    weight = Math.max(weight - deficitKg, 35);

    results.push({
      date: new Date(startDate + day * DAY_MS),
      mean: weight,
      variance: 0.09 + day * 0.02,
    });
  }

  return results;
};

export const buildCombinedTimeline = (
  entries: WeightEntry[],
  predictions: PredictionPoint[],
) => {
  const actualPoints = sortedEntries(entries).map((entry) => ({
    label: new Date(entry.timestamp),
    weight: entry.weight,
    type: 'actual' as const,
  }));

  const predictionPoints = predictions.map((point) => ({
    label: point.date,
    weight: point.mean,
    upper: point.mean + Math.sqrt(point.variance),
    lower: point.mean - Math.sqrt(point.variance),
    type: 'prediction' as const,
  }));

  return [...actualPoints, ...predictionPoints];
};

export const summarizeProjection = (
  entries: WeightEntry[],
  predictions: PredictionPoint[],
  goalWeight: number,
): ProjectionSummary | null => {
  if (!entries.length) return null;

  const ordered = sortedEntries(entries);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const change = last.weight - first.weight;
  const days = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / DAY_MS;
  const pacePerWeek = days > 0 ? (change / days) * 7 : 0;

  const projectedGoal = predictions.find((point) => point.mean <= goalWeight);
  const projectedEarlyGoal = predictions.find((point) => point.mean - Math.sqrt(point.variance) <= goalWeight);
  const projectedLateGoal = predictions.find((point) => point.mean + Math.sqrt(point.variance) <= goalWeight);
  const historySpanDays = Math.max(days, 0);
  const consistencyScore = clamp(entries.length / 14, 0, 1);
  const spanScore = clamp(historySpanDays / 28, 0, 1);
  const variancePenalty = projectedGoal ? clamp(Math.sqrt(projectedGoal.variance) / 2.5, 0, 1) : 1;
  const confidenceScore = Math.round((consistencyScore * 0.4 + spanScore * 0.35 + (1 - variancePenalty) * 0.25) * 100);

  return {
    totalChange: change,
    pacePerWeek,
    projectedGoalDate: projectedGoal?.date ?? null,
    goalDateRange: {
      early: projectedEarlyGoal?.date ?? null,
      likely: projectedGoal?.date ?? null,
      late: projectedLateGoal?.date ?? null,
    },
    confidenceScore,
    latestWeight: last.weight,
  };
};

export const describeWorkout = (entry: WeightEntry) => {
  if (!entry.workout) return 'No workout logged';
  const { activityType, durationMin, peakHeartRate } = entry.workout;
  return `${activityType} · ${durationMin}min · ${peakHeartRate}bpm`;
};

export const summarizeWeek = (entries: WeightEntry[]) => {
  const ordered = sortedEntries(entries);
  if (!ordered.length) return null;

  const now = new Date();
  const weekStart = new Date(now.getTime() - 6 * DAY_MS);
  const weekly = ordered.filter((entry) => new Date(entry.timestamp).getTime() >= weekStart.getTime());
  if (!weekly.length) return null;

  const first = weekly[0];
  const last = weekly[weekly.length - 1];
  const uniqueDays = new Set(weekly.map((entry) => entry.timestamp.slice(0, 10))).size;
  const averageWeight = weekly.reduce((sum, entry) => sum + entry.weight, 0) / weekly.length;
  const workoutsLogged = weekly.filter((entry) => entry.workout).length;

  return {
    entryCount: weekly.length,
    daysLogged: uniqueDays,
    averageWeight,
    netChange: last.weight - first.weight,
    workoutsLogged,
    noteCount: weekly.filter((entry) => entry.note?.trim()).length,
    latestTimestamp: last.timestamp,
    bestDrop: Math.min(...weekly.map((entry, index) => (index === 0 ? 0 : entry.weight - weekly[index - 1].weight))),
  };
};

export const summarizeMilestones = (entries: WeightEntry[], goalWeight: number) => {
  const ordered = sortedEntries(entries);
  if (!ordered.length) return [];

  const first = ordered[0];
  const lowest = ordered.reduce((best, entry) => (entry.weight < best.weight ? entry : best), ordered[0]);
  const milestones: Array<{ id: string; title: string; detail: string }> = [];

  if (ordered.length >= 5) {
    milestones.push({
      id: 'five-logs',
      title: 'Five logs banked',
      detail: `${ordered.length} total entries recorded so far.`,
    });
  }

  const lossFromStart = first.weight - lowest.weight;
  if (lossFromStart >= 2) {
    milestones.push({
      id: 'two-kg-down',
      title: 'First 2 kg down',
      detail: `${lossFromStart.toFixed(1)} kg down from your starting point.`,
    });
  }

  const last30Cutoff = Date.now() - 30 * DAY_MS;
  const last30 = ordered.filter((entry) => new Date(entry.timestamp).getTime() >= last30Cutoff);
  if (last30.length && lowest.id === last30.reduce((best, entry) => (entry.weight < best.weight ? entry : best), last30[0]).id) {
    milestones.push({
      id: 'thirty-day-low',
      title: '30-day low',
      detail: `${lowest.weight.toFixed(1)} kg is your lowest reading in the last month.`,
    });
  }

  const reachedGoal = ordered.find((entry) => entry.weight <= goalWeight);
  if (reachedGoal) {
    milestones.push({
      id: 'goal-hit',
      title: 'Goal reached',
      detail: `First hit at ${reachedGoal.weight.toFixed(1)} kg.`,
    });
  }

  return milestones;
};
