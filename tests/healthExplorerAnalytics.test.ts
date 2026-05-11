import { describe, expect, it } from 'vitest';
import { HealthSnapshot, MetabolicProfile, WeightEntry } from '../src/types';
import {
  buildActivityExplorerModel,
  buildActivityTrendBuckets,
  buildBodyLinkRows,
  buildSleepExplorerModel,
} from '../src/services/healthExplorerAnalytics';

const profile: MetabolicProfile = {
  biologicalSex: 'male',
  age: 32,
  heightCm: 182,
  activityMultiplier: 1.25,
  dietDeficit: 500,
  horizonDays: 30,
};

const entries: WeightEntry[] = [
  { id: 'w1', timestamp: '2026-05-01T06:00:00.000Z', weight: 84.5, source: 'appleHealth' },
  { id: 'w2', timestamp: '2026-05-02T07:00:00.000Z', weight: 84.1, source: 'appleHealth' },
  { id: 'w3', timestamp: '2026-05-03T07:00:00.000Z', weight: 83.9, source: 'appleHealth' },
];

const health: HealthSnapshot = {
  dailyMetrics: [
    {
      date: '2026-05-01',
      steps: 11000,
      activeEnergyKcal: 720,
      restingHeartRateBpm: 52,
      hrvSdnnMs: 68,
    },
    {
      date: '2026-05-02',
      steps: 8500,
      activeEnergyKcal: 480,
      restingHeartRateBpm: 55,
      hrvSdnnMs: 62,
    },
  ],
  weightMeasurements: [],
  workouts: [
    {
      id: 'run-1',
      activityType: 'Running',
      startDate: '2026-05-01T09:00:00.000Z',
      endDate: '2026-05-01T09:45:00.000Z',
      durationMin: 45,
      averageHeartRateBpm: 150,
      minHeartRateBpm: 130,
      maxHeartRateBpm: 170,
      heartRateSampleCount: 3,
    },
    {
      id: 'walk-1',
      activityType: 'Walking',
      startDate: '2026-05-02T18:00:00.000Z',
      endDate: '2026-05-02T18:30:00.000Z',
      durationMin: 30,
      activeEnergyKcal: 120,
      averageHeartRateBpm: 108,
    },
  ],
  sleepNights: [
    {
      id: 'sleep-1',
      nightDate: '2026-05-01',
      inBedMin: 480,
      asleepMin: 420,
      awakeMin: 30,
      coreMin: 240,
      deepMin: 90,
      remMin: 90,
      intervalCount: 4,
    },
    {
      id: 'sleep-2',
      nightDate: '2026-05-02',
      inBedMin: 450,
      asleepMin: 390,
      awakeMin: 20,
      coreMin: 230,
      deepMin: 70,
      remMin: 90,
      intervalCount: 4,
    },
  ],
  sleepIntervals: [
    {
      id: 'si-bed-1',
      nightDate: '2026-05-01',
      startDate: '2026-05-01T21:00:00.000Z',
      endDate: '2026-05-02T05:00:00.000Z',
      stage: 'inBed',
      durationMin: 480,
    },
    {
      id: 'si-1',
      nightDate: '2026-05-01',
      startDate: '2026-05-01T21:30:00.000Z',
      endDate: '2026-05-02T01:30:00.000Z',
      stage: 'core',
      durationMin: 240,
    },
    {
      id: 'si-2',
      nightDate: '2026-05-01',
      startDate: '2026-05-02T01:30:00.000Z',
      endDate: '2026-05-02T03:00:00.000Z',
      stage: 'deep',
      durationMin: 90,
    },
    {
      id: 'si-3',
      nightDate: '2026-05-01',
      startDate: '2026-05-02T03:00:00.000Z',
      endDate: '2026-05-02T04:30:00.000Z',
      stage: 'rem',
      durationMin: 90,
    },
    {
      id: 'si-4',
      nightDate: '2026-05-02',
      startDate: '2026-05-02T21:30:00.000Z',
      endDate: '2026-05-03T04:00:00.000Z',
      stage: 'core',
      durationMin: 390,
    },
  ],
  heartRateSamples: [],
  importSummaries: [],
};

describe('health explorer analytics', () => {
  it('builds sleep consistency and weight-link metrics from detailed sleep intervals', () => {
    const model = buildSleepExplorerModel(health, entries, 30);

    expect(model.nights).toHaveLength(2);
    expect(model.stats.averageSleepHours).toBeCloseTo(6.75);
    expect(model.stats.averageEfficiencyPercent).toBeCloseTo(87.08, 2);
    expect(model.stats.linkedWeightNights).toBe(2);
    expect(model.stageTotals.find((stage) => stage.stage === 'core')?.minutes).toBe(470);
    expect(model.trends[0].rollingSleepHours).toBeCloseTo(7);
    expect(model.nights[0].inBedSegments).toHaveLength(1);
    expect(model.nights[0].timelineSegments.map((segment) => segment.stage)).toEqual(['core', 'deep', 'rem']);
    expect(model.nights[0].timelineSegments.every((segment) => segment.stage !== 'inBed')).toBe(true);
  });

  it('filters activities by type and heart-rate range while estimating missing calories', () => {
    const model = buildActivityExplorerModel(health, entries, profile, 30, {
      activityType: 'Running',
      minHeartRate: 140,
      maxHeartRate: 160,
    });

    expect(model.workouts).toHaveLength(1);
    expect(model.workouts[0].activityType).toBe('Running');
    expect(model.workouts[0].caloriesEstimated).toBe(true);
    expect(model.workouts[0].caloriesKcal).toBeGreaterThan(0);
    expect(model.heartRateBuckets.find((bucket) => bucket.label === 'Tempo 140-159')?.count).toBe(1);
  });

  it('builds activity trends and type summaries across workouts and daily metrics', () => {
    const model = buildActivityExplorerModel(health, entries, profile, 30, {
      activityType: 'all',
    });

    expect(model.trendRows.find((row) => row.date === '2026-05-01')?.workoutDurationMin).toBe(45);
    expect(model.trendRows.find((row) => row.date === '2026-05-01')?.rollingActiveEnergyKcal).toBe(720);
    expect(model.typeSummaries.map((summary) => summary.activityType)).toEqual(['Running', 'Walking']);
    expect(model.stats.averageSteps).toBe(9750);
    expect(model.stats.measuredCalorieWorkouts).toBe(1);
    expect(model.stats.estimatedCalorieWorkouts).toBe(1);
  });

  it('buckets long activity trend ranges into weekly display points', () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString().slice(0, 10),
      activeEnergyKcal: 400 + index,
      steps: 8000 + index * 10,
      workoutCount: index % 3 === 0 ? 1 : 0,
      workoutDurationMin: index % 3 === 0 ? 45 : 0,
    }));
    const buckets = buildActivityTrendBuckets(rows, 90);

    expect(buckets.length).toBeLessThan(rows.length);
    expect(buckets[0].mode).toBe('weekly');
    expect(buckets[0].workoutDurationMin).toBeGreaterThan(0);
    expect(buckets[0].activeEnergyKcal).toBeGreaterThan(0);
  });

  it('combines body-link rows across daily metrics, sleep, and weigh-ins', () => {
    const rows = buildBodyLinkRows(health, entries, 30);

    expect(rows.find((row) => row.date === '2026-05-01')?.steps).toBe(11000);
    expect(rows.find((row) => row.date === '2026-05-01')?.sleepHours).toBe(7);
    expect(rows.some((row) => row.weightKg === 84.1)).toBe(true);
  });
});
