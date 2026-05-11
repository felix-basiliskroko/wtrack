import {
  DailyHealthMetrics,
  HealthSnapshot,
  MetabolicProfile,
  SleepInterval,
  SleepNight,
  SleepStage,
  WeightEntry,
  WorkoutSummary,
} from '../types';

export type ExplorerRange = 7 | 30 | 90 | 'all';

export type ActivityFilters = {
  activityType: string;
  minHeartRate?: number;
  maxHeartRate?: number;
  minDurationMin?: number;
};

export type SleepStageTotal = {
  stage: SleepStage;
  minutes: number;
  percent: number;
};

export type MetricDelta = {
  current?: number;
  previous?: number;
  delta?: number;
  percentDelta?: number;
};

export type SleepTimelineSegment = {
  id: string;
  nightDate: string;
  stage: SleepStage;
  startDate: string;
  endDate: string;
  durationMin: number;
  startPercent: number;
  widthPercent: number;
};

export type SleepTrendPoint = {
  nightDate: string;
  sleepHours: number;
  rollingSleepHours?: number;
  efficiencyPercent?: number;
  rollingEfficiencyPercent?: number;
  remMin: number;
  deepMin: number;
  awakeMin: number;
};

export type SleepExplorerNight = {
  nightDate: string;
  sleepHours: number;
  efficiencyPercent?: number;
  stageMinutes: Record<SleepStage, number>;
  intervals: SleepInterval[];
  timelineSegments: SleepTimelineSegment[];
  inBedSegments: SleepTimelineSegment[];
  firstInterval?: string;
  lastInterval?: string;
  weightKg?: number;
  weightDeltaKg?: number;
};

export type SleepExplorerModel = {
  nights: SleepExplorerNight[];
  stageTotals: SleepStageTotal[];
  trends: SleepTrendPoint[];
  comparisons: {
    sleepHours: MetricDelta;
    efficiencyPercent: MetricDelta;
    deepMin: MetricDelta;
    remMin: MetricDelta;
    bedtimeVarianceMin: MetricDelta;
    wakeVarianceMin: MetricDelta;
  };
  stats: {
    averageSleepHours?: number;
    averageEfficiencyPercent?: number;
    bedtimeVarianceMin?: number;
    wakeVarianceMin?: number;
    linkedWeightNights: number;
  };
};

export type ActivityWorkoutPoint = WorkoutSummary & {
  displayDate: string;
  caloriesKcal?: number;
  caloriesEstimated: boolean;
};

export type ActivityTrendPoint = {
  date: string;
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  workoutCount: number;
  workoutDurationMin: number;
  workoutCaloriesKcal?: number;
  averageHeartRateBpm?: number;
  rollingActiveEnergyKcal?: number;
  rollingSteps?: number;
};

export type ActivityTrendBucket = {
  label: string;
  startDate: string;
  mode: 'daily' | 'weekly';
  activeEnergyKcal?: number;
  steps?: number;
  workoutDurationMin: number;
  workoutCount: number;
};

export type ActivityTypeSummary = {
  activityType: string;
  workoutCount: number;
  totalDurationMin: number;
  totalCaloriesKcal?: number;
  totalDistanceKm?: number;
  averageHeartRateBpm?: number;
  sharePercent: number;
};

export type HeartRateBucket = {
  label: string;
  count: number;
};

export type ActivityWeek = {
  weekStart: string;
  days: number[];
};

export type ActivityExplorerModel = {
  activityTypes: string[];
  workouts: ActivityWorkoutPoint[];
  trendRows: ActivityTrendPoint[];
  typeSummaries: ActivityTypeSummary[];
  heartRateBuckets: HeartRateBucket[];
  weeks: ActivityWeek[];
  comparisons: {
    workoutCount: MetricDelta;
    totalDurationMin: MetricDelta;
    totalCaloriesKcal: MetricDelta;
    averageSteps: MetricDelta;
    averageActiveEnergyKcal: MetricDelta;
  };
  stats: {
    workoutCount: number;
    totalDurationMin: number;
    totalCaloriesKcal?: number;
    averageHeartRateBpm?: number;
    averageCaloriesPerWorkout?: number;
    averageSteps?: number;
    averageActiveEnergyKcal?: number;
    measuredCalorieWorkouts: number;
    estimatedCalorieWorkouts: number;
  };
};

export type BodyLinkRow = {
  date: string;
  weightKg?: number;
  sleepHours?: number;
  activeEnergyKcal?: number;
  steps?: number;
  restingHeartRateBpm?: number;
  hrvSdnnMs?: number;
};

const DAY_MS = 1000 * 60 * 60 * 24;
const stageOrder: SleepStage[] = ['awake', 'rem', 'core', 'deep', 'asleep', 'inBed'];
const timelineStagePrecedence: SleepStage[] = ['awake', 'rem', 'deep', 'core', 'asleep'];

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const metricDelta = (current?: number, previous?: number): MetricDelta => ({
  current,
  previous,
  delta: current !== undefined && previous !== undefined ? current - previous : undefined,
  percentDelta:
    current !== undefined && previous !== undefined && previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100
      : undefined,
});

const rollingAverage = (values: Array<number | undefined>, windowSize: number) =>
  values.map((_, index) => {
    const windowValues = values
      .slice(Math.max(0, index - windowSize + 1), index + 1)
      .filter((value): value is number => value !== undefined && Number.isFinite(value));
    return average(windowValues);
  });

const dateKeyFromTimestamp = (timestamp: string) => timestamp.slice(0, 10);

const dateKeyTime = (dateKey: string) => new Date(`${dateKey}T12:00:00`).getTime();

const nextDateKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

const rangeEndTime = (health: HealthSnapshot, entries: WeightEntry[]) => {
  const times = [
    ...health.dailyMetrics.map((metric) => dateKeyTime(metric.date)),
    ...health.sleepNights.map((night) => dateKeyTime(night.nightDate)),
    ...health.workouts.map((workout) => new Date(workout.startDate).getTime()),
    ...entries.map((entry) => new Date(entry.timestamp).getTime()),
  ].filter((value) => Number.isFinite(value));

  return times.length ? Math.max(...times) : Date.now();
};

const isDateKeyInRange = (dateKey: string, startMs: number, endMs: number) => {
  const time = dateKeyTime(dateKey);
  return time >= startMs && time <= endMs;
};

const isTimestampInRange = (timestamp: string, startMs: number, endMs: number) => {
  const time = new Date(timestamp).getTime();
  return time >= startMs && time <= endMs;
};

export function getExplorerRangeWindow(health: HealthSnapshot, entries: WeightEntry[], range: ExplorerRange) {
  if (range === 'all') {
    return { startMs: 0, endMs: Number.MAX_SAFE_INTEGER };
  }

  const endMs = rangeEndTime(health, entries);
  return {
    startMs: endMs - (range - 1) * DAY_MS,
    endMs,
  };
}

function getPreviousRangeWindow(current: { startMs: number; endMs: number }, range: ExplorerRange) {
  if (range === 'all') return undefined;
  const spanMs = range * DAY_MS;
  return {
    startMs: current.startMs - spanMs,
    endMs: current.startMs - 1,
  };
}

const sleepMinutesByStage = (night: SleepNight): Record<SleepStage, number> => ({
  awake: night.awakeMin,
  rem: night.remMin,
  core: night.coreMin,
  deep: night.deepMin,
  asleep: night.asleepMin - night.coreMin - night.deepMin - night.remMin,
  inBed: Math.max(night.inBedMin - night.asleepMin - night.awakeMin, 0),
});

const timelineWindow = (nightDate: string) => {
  const start = new Date(`${nightDate}T18:00:00`);
  const end = new Date(`${nextDateKey(nightDate)}T12:00:00`);
  return {
    start,
    end,
    spanMs: end.getTime() - start.getTime(),
  };
};

const toSegment = (
  nightDate: string,
  stage: SleepStage,
  startMs: number,
  endMs: number,
  index: number,
): SleepTimelineSegment => {
  const window = timelineWindow(nightDate);
  const clampedStart = Math.max(startMs, window.start.getTime());
  const clampedEnd = Math.min(endMs, window.end.getTime());
  const durationMin = Math.max((clampedEnd - clampedStart) / 60000, 0);

  return {
    id: `${nightDate}:${stage}:${clampedStart}:${clampedEnd}:${index}`,
    nightDate,
    stage,
    startDate: new Date(clampedStart).toISOString(),
    endDate: new Date(clampedEnd).toISOString(),
    durationMin,
    startPercent: ((clampedStart - window.start.getTime()) / window.spanMs) * 100,
    widthPercent: Math.max((durationMin * 60000 * 100) / window.spanMs, 0),
  };
};

const mergeSegments = (segments: SleepTimelineSegment[]) => {
  const ordered = [...segments]
    .filter((segment) => segment.durationMin > 0 && segment.widthPercent > 0)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return ordered.reduce<SleepTimelineSegment[]>((merged, segment) => {
    const previous = merged[merged.length - 1];
    if (!previous || previous.stage !== segment.stage || previous.endDate !== segment.startDate) {
      merged.push(segment);
      return merged;
    }

    const endMs = new Date(segment.endDate).getTime();
    const startMs = new Date(previous.startDate).getTime();
    const updated = toSegment(
      previous.nightDate,
      previous.stage,
      startMs,
      endMs,
      merged.length,
    );
    merged[merged.length - 1] = {
      ...updated,
      id: previous.id,
    };
    return merged;
  }, []);
};

const buildForegroundTimelineSegments = (nightDate: string, intervals: SleepInterval[]) => {
  const window = timelineWindow(nightDate);
  const foreground = intervals
    .filter((interval) => interval.stage !== 'inBed')
    .map((interval) => ({
      ...interval,
      startMs: Math.max(new Date(interval.startDate).getTime(), window.start.getTime()),
      endMs: Math.min(new Date(interval.endDate).getTime(), window.end.getTime()),
    }))
    .filter((interval) => interval.endMs > interval.startMs);

  const boundaries = Array.from(new Set(foreground.flatMap((interval) => [interval.startMs, interval.endMs]))).sort(
    (a, b) => a - b,
  );

  const segments: SleepTimelineSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index];
    const endMs = boundaries[index + 1];
    const midpoint = startMs + (endMs - startMs) / 2;
    const active = foreground.filter((interval) => interval.startMs <= midpoint && interval.endMs >= midpoint);
    const stage = timelineStagePrecedence.find((candidate) =>
      active.some((interval) => interval.stage === candidate),
    );
    if (stage) segments.push(toSegment(nightDate, stage, startMs, endMs, index));
  }

  return mergeSegments(segments);
};

const buildInBedTimelineSegments = (nightDate: string, intervals: SleepInterval[]) =>
  mergeSegments(
    intervals
      .filter((interval) => interval.stage === 'inBed')
      .map((interval, index) =>
        toSegment(
          nightDate,
          'inBed',
          new Date(interval.startDate).getTime(),
          new Date(interval.endDate).getTime(),
          index,
        ),
      ),
  );

const intervalStartForNight = (intervals: SleepInterval[]) =>
  intervals.length ? intervals[0].startDate : undefined;

const intervalEndForNight = (intervals: SleepInterval[]) =>
  intervals.length ? intervals[intervals.length - 1].endDate : undefined;

const bedtimeMinute = (timestamp: string) => {
  const date = new Date(timestamp);
  const minute = date.getHours() * 60 + date.getMinutes();
  return minute < 12 * 60 ? minute + 24 * 60 : minute;
};

const wakeMinute = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
};

const standardDeviation = (values: number[]) => {
  const mean = average(values);
  if (mean === undefined) return undefined;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const linkWeightToNight = (nightEnd: string | undefined, entries: WeightEntry[]) => {
  if (!nightEnd || entries.length < 1) return {};
  const endTime = new Date(nightEnd).getTime();
  const ordered = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const next = ordered.find((entry) => {
    const time = new Date(entry.timestamp).getTime();
    return time >= endTime && time <= endTime + 36 * 60 * 60 * 1000;
  });
  const previous = [...ordered].reverse().find((entry) => new Date(entry.timestamp).getTime() < endTime);

  return {
    weightKg: next?.weight,
    weightDeltaKg: next && previous ? next.weight - previous.weight : undefined,
  };
};

const buildSleepNights = (
  health: HealthSnapshot,
  entries: WeightEntry[],
  startMs: number,
  endMs: number,
) => {
  const intervalsByNight = new Map<string, SleepInterval[]>();

  health.sleepIntervals
    .filter((interval) => isDateKeyInRange(interval.nightDate, startMs, endMs))
    .forEach((interval) => {
      const list = intervalsByNight.get(interval.nightDate) ?? [];
      list.push(interval);
      intervalsByNight.set(interval.nightDate, list);
    });

  intervalsByNight.forEach((intervals) => {
    intervals.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  });

  return health.sleepNights
    .filter((night) => isDateKeyInRange(night.nightDate, startMs, endMs))
    .map<SleepExplorerNight>((night) => {
      const intervals = intervalsByNight.get(night.nightDate) ?? [];
      const firstInterval = intervalStartForNight(intervals);
      const lastInterval = intervalEndForNight(intervals);
      const efficiencyPercent = night.inBedMin ? (night.asleepMin / night.inBedMin) * 100 : undefined;
      return {
        nightDate: night.nightDate,
        sleepHours: night.asleepMin / 60,
        efficiencyPercent,
        stageMinutes: sleepMinutesByStage(night),
        intervals,
        timelineSegments: buildForegroundTimelineSegments(night.nightDate, intervals),
        inBedSegments: buildInBedTimelineSegments(night.nightDate, intervals),
        firstInterval,
        lastInterval,
        ...linkWeightToNight(lastInterval, entries),
      };
    });
};

const summarizeSleepNights = (nights: SleepExplorerNight[]) => {
  const efficiencyValues = nights
    .map((night) => night.efficiencyPercent)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const bedtimeValues = nights.map((night) => night.firstInterval).filter((value): value is string => Boolean(value));
  const wakeValues = nights.map((night) => night.lastInterval).filter((value): value is string => Boolean(value));

  return {
    sleepHours: average(nights.map((night) => night.sleepHours)),
    efficiencyPercent: average(efficiencyValues),
    deepMin: average(nights.map((night) => Math.max(night.stageMinutes.deep, 0))),
    remMin: average(nights.map((night) => Math.max(night.stageMinutes.rem, 0))),
    bedtimeVarianceMin: standardDeviation(bedtimeValues.map(bedtimeMinute)),
    wakeVarianceMin: standardDeviation(wakeValues.map(wakeMinute)),
  };
};

const buildSleepTrends = (nights: SleepExplorerNight[]): SleepTrendPoint[] => {
  const ordered = [...nights].sort((a, b) => a.nightDate.localeCompare(b.nightDate));
  const rollingSleep = rollingAverage(
    ordered.map((night) => night.sleepHours),
    7,
  );
  const rollingEfficiency = rollingAverage(
    ordered.map((night) => night.efficiencyPercent),
    7,
  );

  return ordered.map((night, index) => ({
    nightDate: night.nightDate,
    sleepHours: night.sleepHours,
    rollingSleepHours: rollingSleep[index],
    efficiencyPercent: night.efficiencyPercent,
    rollingEfficiencyPercent: rollingEfficiency[index],
    remMin: Math.max(night.stageMinutes.rem, 0),
    deepMin: Math.max(night.stageMinutes.deep, 0),
    awakeMin: Math.max(night.stageMinutes.awake, 0),
  }));
};

export function buildSleepExplorerModel(
  health: HealthSnapshot,
  entries: WeightEntry[],
  range: ExplorerRange,
): SleepExplorerModel {
  const currentWindow = getExplorerRangeWindow(health, entries, range);
  const previousWindow = getPreviousRangeWindow(currentWindow, range);
  const nights = buildSleepNights(health, entries, currentWindow.startMs, currentWindow.endMs);
  const previousNights = previousWindow
    ? buildSleepNights(health, entries, previousWindow.startMs, previousWindow.endMs)
    : [];

  const stageMinutes = stageOrder.reduce<Record<SleepStage, number>>(
    (totals, stage) => ({ ...totals, [stage]: 0 }),
    {} as Record<SleepStage, number>,
  );

  nights.forEach((night) => {
    stageOrder.forEach((stage) => {
      stageMinutes[stage] += Math.max(night.stageMinutes[stage], 0);
    });
  });

  const totalStageMinutes = sum(Object.values(stageMinutes));
  const currentSummary = summarizeSleepNights(nights);
  const previousSummary = summarizeSleepNights(previousNights);

  return {
    nights,
    stageTotals: stageOrder
      .filter((stage) => stageMinutes[stage] > 0)
      .map((stage) => ({
        stage,
        minutes: stageMinutes[stage],
        percent: totalStageMinutes ? (stageMinutes[stage] / totalStageMinutes) * 100 : 0,
      })),
    trends: buildSleepTrends(nights),
    comparisons: {
      sleepHours: metricDelta(currentSummary.sleepHours, previousSummary.sleepHours),
      efficiencyPercent: metricDelta(currentSummary.efficiencyPercent, previousSummary.efficiencyPercent),
      deepMin: metricDelta(currentSummary.deepMin, previousSummary.deepMin),
      remMin: metricDelta(currentSummary.remMin, previousSummary.remMin),
      bedtimeVarianceMin: metricDelta(currentSummary.bedtimeVarianceMin, previousSummary.bedtimeVarianceMin),
      wakeVarianceMin: metricDelta(currentSummary.wakeVarianceMin, previousSummary.wakeVarianceMin),
    },
    stats: {
      averageSleepHours: currentSummary.sleepHours,
      averageEfficiencyPercent: currentSummary.efficiencyPercent,
      bedtimeVarianceMin: currentSummary.bedtimeVarianceMin,
      wakeVarianceMin: currentSummary.wakeVarianceMin,
      linkedWeightNights: nights.filter((night) => night.weightKg !== undefined).length,
    },
  };
}

const nearestWeightBefore = (entries: WeightEntry[], timestamp: string) => {
  const time = new Date(timestamp).getTime();
  const ordered = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return [...ordered].reverse().find((entry) => new Date(entry.timestamp).getTime() <= time)?.weight;
};

const estimateWorkoutEnergy = (
  workout: WorkoutSummary,
  profile: MetabolicProfile,
  entries: WeightEntry[],
) => {
  if (!workout.averageHeartRateBpm) return undefined;
  const weightKg = nearestWeightBefore(entries, workout.startDate) ?? entries[entries.length - 1]?.weight ?? 80;
  let caloriesPerMinute = 0;

  if (profile.biologicalSex === 'male') {
    caloriesPerMinute =
      (-55.0969 + 0.6309 * workout.averageHeartRateBpm + 0.1988 * weightKg + 0.2017 * profile.age) / 4.184;
  } else {
    caloriesPerMinute =
      (-20.4022 + 0.4472 * workout.averageHeartRateBpm - 0.1263 * weightKg + 0.074 * profile.age) / 4.184;
  }

  return Math.max(caloriesPerMinute * workout.durationMin, 0);
};

const matchesHeartRateFilter = (workout: WorkoutSummary, filters: ActivityFilters) => {
  const averageHeartRate = workout.averageHeartRateBpm;
  if (!filters.minHeartRate && !filters.maxHeartRate) return true;
  if (averageHeartRate === undefined) return false;
  if (filters.minHeartRate !== undefined && averageHeartRate < filters.minHeartRate) return false;
  if (filters.maxHeartRate !== undefined && averageHeartRate > filters.maxHeartRate) return false;
  return true;
};

const heartRateBucketFor = (heartRate: number) => {
  if (heartRate < 120) return 'Easy <120';
  if (heartRate < 140) return 'Aerobic 120-139';
  if (heartRate < 160) return 'Tempo 140-159';
  return 'High 160+';
};

const startOfWeekKey = (timestamp: string) => {
  const date = new Date(timestamp);
  const dayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayIndex);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

export function buildActivityTrendBuckets(
  rows: ActivityTrendPoint[],
  range: ExplorerRange,
): ActivityTrendBucket[] {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const useWeeklyBuckets = range === 'all' || ordered.length > 45;

  if (!useWeeklyBuckets) {
    return ordered.map((row) => ({
      label: row.date,
      startDate: row.date,
      mode: 'daily',
      activeEnergyKcal: row.rollingActiveEnergyKcal ?? row.activeEnergyKcal,
      steps: row.rollingSteps ?? row.steps,
      workoutDurationMin: row.workoutDurationMin,
      workoutCount: row.workoutCount,
    }));
  }

  const grouped = new Map<string, ActivityTrendPoint[]>();
  ordered.forEach((row) => {
    const weekStart = startOfWeekKey(`${row.date}T12:00:00`);
    const list = grouped.get(weekStart) ?? [];
    list.push(row);
    grouped.set(weekStart, list);
  });

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, group]) => {
      const activeValues = group
        .map((row) => row.activeEnergyKcal)
        .filter((value): value is number => value !== undefined);
      const stepValues = group.map((row) => row.steps).filter((value): value is number => value !== undefined);

      return {
        label: weekStart,
        startDate: weekStart,
        mode: 'weekly',
        activeEnergyKcal: average(activeValues),
        steps: average(stepValues),
        workoutDurationMin: Math.round(sum(group.map((row) => row.workoutDurationMin))),
        workoutCount: Math.round(sum(group.map((row) => row.workoutCount))),
      };
    });
}

const selectActivityWorkouts = (
  health: HealthSnapshot,
  entries: WeightEntry[],
  profile: MetabolicProfile,
  startMs: number,
  endMs: number,
  filters: ActivityFilters,
) =>
  health.workouts
    .filter((workout) => isTimestampInRange(workout.startDate, startMs, endMs))
    .filter((workout) => filters.activityType === 'all' || workout.activityType === filters.activityType)
    .filter((workout) => filters.minDurationMin === undefined || workout.durationMin >= filters.minDurationMin)
    .filter((workout) => matchesHeartRateFilter(workout, filters))
    .map<ActivityWorkoutPoint>((workout) => {
      const estimated = workout.activeEnergyKcal === undefined;
      const calories = workout.activeEnergyKcal ?? estimateWorkoutEnergy(workout, profile, entries);
      return {
        ...workout,
        displayDate: new Date(workout.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        caloriesKcal: calories === undefined ? undefined : Math.round(calories),
        caloriesEstimated: estimated && calories !== undefined,
      };
    });

const metricsInRange = (health: HealthSnapshot, startMs: number, endMs: number) =>
  health.dailyMetrics.filter((metric) => isDateKeyInRange(metric.date, startMs, endMs));

const summarizeActivity = (workouts: ActivityWorkoutPoint[], metrics: DailyHealthMetrics[]) => {
  const calorieValues = workouts
    .map((workout) => workout.caloriesKcal)
    .filter((value): value is number => value !== undefined);
  const heartRateValues = workouts
    .map((workout) => workout.averageHeartRateBpm)
    .filter((value): value is number => value !== undefined);
  const stepValues = metrics.map((metric) => metric.steps).filter((value): value is number => value !== undefined);
  const activeEnergyValues = metrics
    .map((metric) => metric.activeEnergyKcal)
    .filter((value): value is number => value !== undefined);

  return {
    workoutCount: workouts.length,
    totalDurationMin: Math.round(sum(workouts.map((workout) => workout.durationMin))),
    totalCaloriesKcal: calorieValues.length ? Math.round(sum(calorieValues)) : undefined,
    averageHeartRateBpm: average(heartRateValues),
    averageCaloriesPerWorkout: average(calorieValues),
    averageSteps: average(stepValues),
    averageActiveEnergyKcal: average(activeEnergyValues),
    measuredCalorieWorkouts: workouts.filter((workout) => workout.caloriesKcal !== undefined && !workout.caloriesEstimated)
      .length,
    estimatedCalorieWorkouts: workouts.filter((workout) => workout.caloriesEstimated).length,
  };
};

const buildHeartRateBuckets = (workouts: ActivityWorkoutPoint[]) => {
  const bucketCounts = new Map<string, number>();
  workouts.forEach((workout) => {
    if (!workout.averageHeartRateBpm) return;
    const bucket = heartRateBucketFor(workout.averageHeartRateBpm);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  });

  return ['Easy <120', 'Aerobic 120-139', 'Tempo 140-159', 'High 160+'].map((label) => ({
    label,
    count: bucketCounts.get(label) ?? 0,
  }));
};

const buildWeeklyLoad = (workouts: ActivityWorkoutPoint[]) => {
  const weekly = new Map<string, number[]>();
  workouts.forEach((workout) => {
    const weekStart = startOfWeekKey(workout.startDate);
    const days = weekly.get(weekStart) ?? [0, 0, 0, 0, 0, 0, 0];
    const dayIndex = (new Date(workout.startDate).getDay() + 6) % 7;
    days[dayIndex] += workout.durationMin;
    weekly.set(weekStart, days);
  });

  return Array.from(weekly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, days]) => ({ weekStart, days }));
};

const buildActivityTypeSummaries = (workouts: ActivityWorkoutPoint[]) => {
  const totalDuration = sum(workouts.map((workout) => workout.durationMin));
  const grouped = new Map<string, ActivityWorkoutPoint[]>();
  workouts.forEach((workout) => {
    const list = grouped.get(workout.activityType) ?? [];
    list.push(workout);
    grouped.set(workout.activityType, list);
  });

  return Array.from(grouped.entries())
    .map<ActivityTypeSummary>(([activityType, group]) => {
      const calories = group.map((workout) => workout.caloriesKcal).filter((value): value is number => value !== undefined);
      const distances = group.map((workout) => workout.distanceKm).filter((value): value is number => value !== undefined);
      const heartRates = group
        .map((workout) => workout.averageHeartRateBpm)
        .filter((value): value is number => value !== undefined);
      const duration = sum(group.map((workout) => workout.durationMin));

      return {
        activityType,
        workoutCount: group.length,
        totalDurationMin: Math.round(duration),
        totalCaloriesKcal: calories.length ? Math.round(sum(calories)) : undefined,
        totalDistanceKm: distances.length ? sum(distances) : undefined,
        averageHeartRateBpm: average(heartRates),
        sharePercent: totalDuration ? (duration / totalDuration) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalDurationMin - a.totalDurationMin);
};

const buildActivityTrendRows = (
  metrics: DailyHealthMetrics[],
  workouts: ActivityWorkoutPoint[],
): ActivityTrendPoint[] => {
  const byDate = new Map<string, ActivityTrendPoint>();
  const heartRatesByDate = new Map<string, number[]>();
  const ensure = (date: string) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created: ActivityTrendPoint = {
      date,
      workoutCount: 0,
      workoutDurationMin: 0,
    };
    byDate.set(date, created);
    return created;
  };

  metrics.forEach((metric) => {
    const row = ensure(metric.date);
    row.steps = metric.steps;
    row.activeEnergyKcal = metric.activeEnergyKcal;
    row.exerciseMinutes = metric.exerciseMinutes;
  });

  workouts.forEach((workout) => {
    const date = dateKeyFromTimestamp(workout.startDate);
    const row = ensure(date);
    row.workoutCount += 1;
    row.workoutDurationMin += workout.durationMin;
    row.workoutCaloriesKcal =
      workout.caloriesKcal === undefined ? row.workoutCaloriesKcal : (row.workoutCaloriesKcal ?? 0) + workout.caloriesKcal;
    if (workout.averageHeartRateBpm !== undefined) {
      const values = heartRatesByDate.get(date) ?? [];
      values.push(workout.averageHeartRateBpm);
      heartRatesByDate.set(date, values);
      row.averageHeartRateBpm = average(values);
    }
  });

  const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const rollingActive = rollingAverage(
    rows.map((row) => row.activeEnergyKcal),
    7,
  );
  const rollingSteps = rollingAverage(
    rows.map((row) => row.steps),
    7,
  );

  return rows.map((row, index) => ({
    ...row,
    workoutDurationMin: Math.round(row.workoutDurationMin),
    workoutCaloriesKcal: row.workoutCaloriesKcal === undefined ? undefined : Math.round(row.workoutCaloriesKcal),
    rollingActiveEnergyKcal: rollingActive[index],
    rollingSteps: rollingSteps[index],
  }));
};

export function buildActivityExplorerModel(
  health: HealthSnapshot,
  entries: WeightEntry[],
  profile: MetabolicProfile,
  range: ExplorerRange,
  filters: ActivityFilters,
): ActivityExplorerModel {
  const currentWindow = getExplorerRangeWindow(health, entries, range);
  const previousWindow = getPreviousRangeWindow(currentWindow, range);
  const inRangeWorkouts = health.workouts.filter((workout) =>
    isTimestampInRange(workout.startDate, currentWindow.startMs, currentWindow.endMs),
  );
  const activityTypes = Array.from(new Set(inRangeWorkouts.map((workout) => workout.activityType))).sort();
  const workouts = selectActivityWorkouts(
    health,
    entries,
    profile,
    currentWindow.startMs,
    currentWindow.endMs,
    filters,
  );
  const metrics = metricsInRange(health, currentWindow.startMs, currentWindow.endMs);
  const previousWorkouts = previousWindow
    ? selectActivityWorkouts(health, entries, profile, previousWindow.startMs, previousWindow.endMs, filters)
    : [];
  const previousMetrics = previousWindow ? metricsInRange(health, previousWindow.startMs, previousWindow.endMs) : [];
  const stats = summarizeActivity(workouts, metrics);
  const previousStats = summarizeActivity(previousWorkouts, previousMetrics);

  return {
    activityTypes,
    workouts,
    trendRows: buildActivityTrendRows(metrics, workouts),
    typeSummaries: buildActivityTypeSummaries(workouts),
    heartRateBuckets: buildHeartRateBuckets(workouts),
    weeks: buildWeeklyLoad(workouts),
    comparisons: {
      workoutCount: metricDelta(stats.workoutCount, previousStats.workoutCount),
      totalDurationMin: metricDelta(stats.totalDurationMin, previousStats.totalDurationMin),
      totalCaloriesKcal: metricDelta(stats.totalCaloriesKcal, previousStats.totalCaloriesKcal),
      averageSteps: metricDelta(stats.averageSteps, previousStats.averageSteps),
      averageActiveEnergyKcal: metricDelta(stats.averageActiveEnergyKcal, previousStats.averageActiveEnergyKcal),
    },
    stats,
  };
}

export function buildBodyLinkRows(
  health: HealthSnapshot,
  entries: WeightEntry[],
  range: ExplorerRange,
): BodyLinkRow[] {
  const { startMs, endMs } = getExplorerRangeWindow(health, entries, range);
  const byDate = new Map<string, BodyLinkRow>();

  const ensureRow = (date: string) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created: BodyLinkRow = { date };
    byDate.set(date, created);
    return created;
  };

  health.dailyMetrics
    .filter((metric) => isDateKeyInRange(metric.date, startMs, endMs))
    .forEach((metric: DailyHealthMetrics) => {
      const row = ensureRow(metric.date);
      row.activeEnergyKcal = metric.activeEnergyKcal;
      row.steps = metric.steps;
      row.restingHeartRateBpm = metric.restingHeartRateBpm;
      row.hrvSdnnMs = metric.hrvSdnnMs;
    });

  health.sleepNights
    .filter((night) => isDateKeyInRange(night.nightDate, startMs, endMs))
    .forEach((night) => {
      ensureRow(night.nightDate).sleepHours = night.asleepMin / 60;
    });

  entries
    .filter((entry) => isTimestampInRange(entry.timestamp, startMs, endMs))
    .forEach((entry) => {
      ensureRow(dateKeyFromTimestamp(entry.timestamp)).weightKg = entry.weight;
    });

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
