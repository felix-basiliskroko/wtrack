import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import {
  DailyHealthMetrics,
  HealthImportOptions,
  HealthImportSummary,
  HealthSnapshot,
  HeartRateSample,
  SleepInterval,
  SleepNight,
  SleepStage,
  WeightMeasurement,
  WorkoutSummary,
} from '../types';

type ParseProgress = (event: { phase: string; processedBytes?: number; totalBytes?: number }) => void;

type PartialDaily = DailyHealthMetrics & {
  stepSourceTotals?: Record<string, number>;
  sleep?: {
    inBedMin: number;
    asleepMin: number;
    awakeMin: number;
    coreMin: number;
    deepMin: number;
    remMin: number;
    intervalCount: number;
  };
  heartSamples?: Record<string, number[]>;
};

type ParserState = {
  daily: Map<string, PartialDaily>;
  weights: WeightMeasurement[];
  workouts: WorkoutSummary[];
  sleepIntervals: SleepInterval[];
  heartRateSamples: HeartRateSample[];
  options: HealthImportOptions;
  recordCount: number;
  workoutCount: number;
  warnings: string[];
  exportStartedAt?: string;
  exportEndedAt?: string;
};

const defaultImportOptions: HealthImportOptions = {
  includeDetailedRecords: true,
};

const quantityTypes = new Set([
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierWalkingHeartRateAverage',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierBodyMassIndex',
  'HKQuantityTypeIdentifierWaistCircumference',
]);

const supportedSleepValues = new Set([
  'HKCategoryValueSleepAnalysisInBed',
  'HKCategoryValueSleepAnalysisAsleep',
  'HKCategoryValueSleepAnalysisAsleepCore',
  'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM',
  'HKCategoryValueSleepAnalysisAwake',
]);

const sleepValueStage: Record<string, SleepStage> = {
  HKCategoryValueSleepAnalysisInBed: 'inBed',
  HKCategoryValueSleepAnalysisAsleep: 'asleep',
  HKCategoryValueSleepAnalysisAsleepCore: 'core',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAwake: 'awake',
};

const makeId = (prefix: string, parts: Array<string | number | undefined>) => {
  let hash = 0;
  const input = `${prefix}:${parts.filter(Boolean).join(':')}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index);
  }
  return `${prefix}:${Math.abs(hash).toString(36)}`;
};

const normalizeAppleDate = (value: string | undefined) => {
  if (!value) return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (match) return `${match[1]}T${match[2]}${match[3]}:${match[4]}`;
  return value;
};

const parseDate = (value: string | undefined) => {
  const normalized = normalizeAppleDate(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const localDateKey = (value: string | undefined) => {
  if (!value) return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = parseDate(value);
  return date?.toISOString().slice(0, 10);
};

const nightDateKey = (value: string | undefined) => {
  const dateKey = localDateKey(value);
  if (!dateKey) return undefined;
  const hour = Number(value?.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2})/)?.[1] ?? 0);
  if (hour >= 12) return dateKey;
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

const minutesBetween = (startDate: string | undefined, endDate: string | undefined) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return 0;
  return Math.max((end.getTime() - start.getTime()) / 60000, 0);
};

const readNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const asAttrs = (attributes: Record<string, unknown>) => attributes as Record<string, string | undefined>;

const dailyFor = (state: ParserState, date: string) => {
  const existing = state.daily.get(date);
  if (existing) return existing;
  const created: PartialDaily = { date };
  state.daily.set(date, created);
  return created;
};

const sourceKind = (sourceName = ''): NonNullable<DailyHealthMetrics['stepSource']> => {
  const lower = sourceName.toLowerCase();
  if (lower.includes('watch')) return 'appleWatch';
  if (lower.includes('iphone') || lower.includes('phone')) return 'iphone';
  return 'other';
};

const convertMassToKg = (value: number, unit = 'kg') => {
  if (unit === 'lb' || unit === 'lbs') return value * 0.45359237;
  if (unit === 'g') return value / 1000;
  return value;
};

const convertEnergyToKcal = (value: number, unit = 'Cal') => {
  const normalized = unit.toLowerCase();
  if (normalized === 'kj') return value * 0.239006;
  if (normalized === 'j') return value * 0.000239006;
  return value;
};

const convertDistanceToKm = (value: number, unit = 'km') => {
  const normalized = unit.toLowerCase();
  if (normalized === 'mi') return value * 1.609344;
  if (normalized === 'm') return value / 1000;
  return value;
};

function pushAverageSample(daily: PartialDaily, field: string, value: number) {
  daily.heartSamples ??= {};
  daily.heartSamples[field] ??= [];
  daily.heartSamples[field].push(value);
}

function handleRecord(state: ParserState, attrs: Record<string, string | undefined>) {
  const type = attrs.type;
  if (!type) return;

  if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
    handleSleepRecord(state, attrs);
    return;
  }

  if (!quantityTypes.has(type)) return;
  state.recordCount += 1;

  const value = readNumber(attrs.value);
  const date = localDateKey(attrs.startDate);
  if (value === undefined || !date) return;

  const daily = dailyFor(state, date);
  const unit = attrs.unit ?? '';

  switch (type) {
    case 'HKQuantityTypeIdentifierBodyMass': {
      const weightKg = convertMassToKg(value, unit);
      state.weights.push({
        id: makeId('weight', [attrs.startDate, weightKg.toFixed(3), attrs.sourceName]),
        timestamp: parseDate(attrs.startDate)?.toISOString() ?? normalizeAppleDate(attrs.startDate) ?? new Date().toISOString(),
        weightKg,
        sourceName: attrs.sourceName,
      });
      break;
    }
    case 'HKQuantityTypeIdentifierStepCount': {
      daily.stepSourceTotals ??= {};
      const source = sourceKind(attrs.sourceName);
      daily.stepSourceTotals[source] = (daily.stepSourceTotals[source] ?? 0) + value;
      break;
    }
    case 'HKQuantityTypeIdentifierActiveEnergyBurned':
      daily.activeEnergyKcal = (daily.activeEnergyKcal ?? 0) + convertEnergyToKcal(value, unit);
      break;
    case 'HKQuantityTypeIdentifierBasalEnergyBurned':
      daily.basalEnergyKcal = (daily.basalEnergyKcal ?? 0) + convertEnergyToKcal(value, unit);
      break;
    case 'HKQuantityTypeIdentifierAppleExerciseTime':
      daily.exerciseMinutes = (daily.exerciseMinutes ?? 0) + value;
      break;
    case 'HKQuantityTypeIdentifierHeartRate': {
      if (state.options.includeDetailedRecords) {
        const timestamp = parseDate(attrs.startDate)?.toISOString() ?? normalizeAppleDate(attrs.startDate);
        if (timestamp) {
          state.heartRateSamples.push({
            id: makeId('heart', [attrs.startDate, value.toFixed(1), attrs.sourceName]),
            date,
            timestamp,
            bpm: Math.round(value * 10) / 10,
            sourceName: attrs.sourceName,
          });
        }
      }
      break;
    }
    case 'HKQuantityTypeIdentifierRestingHeartRate':
      pushAverageSample(daily, 'restingHeartRateBpm', value);
      break;
    case 'HKQuantityTypeIdentifierWalkingHeartRateAverage':
      pushAverageSample(daily, 'walkingHeartRateBpm', value);
      break;
    case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN':
      pushAverageSample(daily, 'hrvSdnnMs', value);
      break;
    case 'HKQuantityTypeIdentifierVO2Max':
      pushAverageSample(daily, 'vo2Max', value);
      break;
    case 'HKQuantityTypeIdentifierBodyFatPercentage':
      daily.bodyFatPercentage = unit === '%' ? value : value * 100;
      break;
    case 'HKQuantityTypeIdentifierLeanBodyMass':
      daily.leanBodyMassKg = convertMassToKg(value, unit);
      break;
    case 'HKQuantityTypeIdentifierBodyMassIndex':
      daily.bmi = value;
      break;
    case 'HKQuantityTypeIdentifierWaistCircumference':
      daily.waistCircumferenceCm = unit === 'm' ? value * 100 : value;
      break;
    default:
      break;
  }
}

function handleSleepRecord(state: ParserState, attrs: Record<string, string | undefined>) {
  const value = attrs.value;
  if (!value || !supportedSleepValues.has(value)) return;
  state.recordCount += 1;

  const nightDate = nightDateKey(attrs.startDate);
  if (!nightDate) return;
  const durationMin = minutesBetween(attrs.startDate, attrs.endDate);
  if (!durationMin) return;
  const startDate = parseDate(attrs.startDate)?.toISOString() ?? normalizeAppleDate(attrs.startDate);
  const endDate = parseDate(attrs.endDate)?.toISOString() ?? normalizeAppleDate(attrs.endDate);
  const stage = sleepValueStage[value];

  const daily = dailyFor(state, nightDate);
  daily.sleep ??= {
    inBedMin: 0,
    asleepMin: 0,
    awakeMin: 0,
    coreMin: 0,
    deepMin: 0,
    remMin: 0,
    intervalCount: 0,
  };
  daily.sleep.intervalCount += 1;

  if (value === 'HKCategoryValueSleepAnalysisInBed') daily.sleep.inBedMin += durationMin;
  if (value === 'HKCategoryValueSleepAnalysisAwake') daily.sleep.awakeMin += durationMin;
  if (value === 'HKCategoryValueSleepAnalysisAsleep') daily.sleep.asleepMin += durationMin;
  if (value === 'HKCategoryValueSleepAnalysisAsleepCore') daily.sleep.coreMin += durationMin;
  if (value === 'HKCategoryValueSleepAnalysisAsleepDeep') daily.sleep.deepMin += durationMin;
  if (value === 'HKCategoryValueSleepAnalysisAsleepREM') daily.sleep.remMin += durationMin;

  if (state.options.includeDetailedRecords && startDate && endDate && stage) {
    state.sleepIntervals.push({
      id: makeId('sleep-interval', [attrs.startDate, attrs.endDate, value, attrs.sourceName]),
      nightDate,
      startDate,
      endDate,
      stage,
      durationMin: Math.round(durationMin),
      sourceName: attrs.sourceName,
    });
  }
}

function handleWorkout(state: ParserState, attrs: Record<string, string | undefined>) {
  const startDate = normalizeAppleDate(attrs.startDate);
  const endDate = normalizeAppleDate(attrs.endDate);
  if (!startDate || !endDate) return;

  const duration = readNumber(attrs.duration) ?? minutesBetween(attrs.startDate, attrs.endDate);
  const energy = readNumber(attrs.totalEnergyBurned);
  const distance = readNumber(attrs.totalDistance);
  const activityType = attrs.workoutActivityType?.replace('HKWorkoutActivityType', '') ?? 'Workout';

  state.workoutCount += 1;
  state.workouts.push({
    id: makeId('workout', [attrs.startDate, attrs.endDate, activityType, attrs.sourceName]),
    activityType,
    startDate: parseDate(attrs.startDate)?.toISOString() ?? startDate,
    endDate: parseDate(attrs.endDate)?.toISOString() ?? endDate,
    durationMin: duration,
    activeEnergyKcal: energy === undefined ? undefined : convertEnergyToKcal(energy, attrs.totalEnergyBurnedUnit),
    distanceKm: distance === undefined ? undefined : convertDistanceToKm(distance, attrs.totalDistanceUnit),
    sourceName: attrs.sourceName,
  });

  const date = localDateKey(attrs.startDate);
  if (date) {
    const daily = dailyFor(state, date);
    daily.exerciseMinutes = Math.max(daily.exerciseMinutes ?? 0, duration);
    if (energy !== undefined && daily.activeEnergyKcal === undefined) {
      daily.activeEnergyKcal = convertEnergyToKcal(energy, attrs.totalEnergyBurnedUnit);
    }
  }
}

function finalizeDaily(state: ParserState): { dailyMetrics: DailyHealthMetrics[]; sleepNights: SleepNight[] } {
  const dailyMetrics: DailyHealthMetrics[] = [];
  const sleepNights: SleepNight[] = [];

  state.daily.forEach((daily) => {
    if (daily.stepSourceTotals) {
      const totals = daily.stepSourceTotals;
      const sources = Object.keys(totals);
      if (sources.length > 1) {
        state.warnings.push(`Multiple step sources on ${daily.date}; using the largest source total to avoid double-counting.`);
      }
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      daily.steps = Math.round(entries[0]?.[1] ?? 0);
      daily.stepSource = sources.length > 1 ? 'mixed' : (entries[0]?.[0] as DailyHealthMetrics['stepSource']) ?? 'other';
    }

    if (daily.heartSamples) {
      Object.entries(daily.heartSamples).forEach(([field, values]) => {
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        (daily as unknown as Record<string, number>)[field] = Math.round(average * 10) / 10;
      });
    }

    if (daily.sleep) {
      const asleepMin = daily.sleep.asleepMin + daily.sleep.coreMin + daily.sleep.deepMin + daily.sleep.remMin;
      sleepNights.push({
        id: makeId('sleep', [daily.date, asleepMin, daily.sleep.inBedMin]),
        nightDate: daily.date,
        inBedMin: Math.round(daily.sleep.inBedMin),
        asleepMin: Math.round(asleepMin),
        awakeMin: Math.round(daily.sleep.awakeMin),
        coreMin: Math.round(daily.sleep.coreMin),
        deepMin: Math.round(daily.sleep.deepMin),
        remMin: Math.round(daily.sleep.remMin),
        intervalCount: daily.sleep.intervalCount,
      });
    }

    const { stepSourceTotals: _stepSourceTotals, sleep: _sleep, heartSamples: _heartSamples, ...metric } = daily;
    dailyMetrics.push({
      ...metric,
      steps: metric.steps === undefined ? undefined : Math.round(metric.steps),
      activeEnergyKcal:
        metric.activeEnergyKcal === undefined ? undefined : Math.round(metric.activeEnergyKcal),
      basalEnergyKcal:
        metric.basalEnergyKcal === undefined ? undefined : Math.round(metric.basalEnergyKcal),
      exerciseMinutes:
        metric.exerciseMinutes === undefined ? undefined : Math.round(metric.exerciseMinutes),
    });
  });

  return {
    dailyMetrics: dailyMetrics.sort((a, b) => a.date.localeCompare(b.date)),
    sleepNights: sleepNights.sort((a, b) => a.nightDate.localeCompare(b.nightDate)),
  };
}

function linkHeartRateSamplesToWorkouts(workouts: WorkoutSummary[], samples: HeartRateSample[]) {
  if (!workouts.length || !samples.length) return;

  const orderedWorkouts = [...workouts].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const orderedSamples = [...samples].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const buckets = new Map<string, number[]>();
  let firstPossibleWorkout = 0;

  orderedSamples.forEach((sample) => {
    const sampleTime = new Date(sample.timestamp).getTime();
    while (
      firstPossibleWorkout < orderedWorkouts.length &&
      new Date(orderedWorkouts[firstPossibleWorkout].endDate).getTime() < sampleTime
    ) {
      firstPossibleWorkout += 1;
    }

    for (let index = firstPossibleWorkout; index < orderedWorkouts.length; index += 1) {
      const workout = orderedWorkouts[index];
      const start = new Date(workout.startDate).getTime();
      if (start > sampleTime) break;

      const end = new Date(workout.endDate).getTime();
      if (sampleTime <= end) {
        sample.workoutId = workout.id;
        const bucket = buckets.get(workout.id) ?? [];
        bucket.push(sample.bpm);
        buckets.set(workout.id, bucket);
        break;
      }
    }
  });

  workouts.forEach((workout) => {
    const values = buckets.get(workout.id);
    if (!values?.length) return;
    const total = values.reduce((sum, value) => sum + value, 0);
    const minimum = values.reduce((min, value) => Math.min(min, value), values[0]);
    const maximum = values.reduce((max, value) => Math.max(max, value), values[0]);
    workout.minHeartRateBpm = Math.round(minimum);
    workout.averageHeartRateBpm = Math.round((total / values.length) * 10) / 10;
    workout.maxHeartRateBpm = Math.round(maximum);
    workout.heartRateSampleCount = values.length;
  });
}

function parseXml(
  xmlBytes: Uint8Array,
  options: HealthImportOptions = defaultImportOptions,
  onProgress?: ParseProgress,
): HealthSnapshot {
  const state: ParserState = {
    daily: new Map(),
    weights: [],
    workouts: [],
    sleepIntervals: [],
    heartRateSamples: [],
    options,
    recordCount: 0,
    workoutCount: 0,
    warnings: [],
  };

  const parser = new SaxesParser({ xmlns: false });
  parser.on('opentag', (tag) => {
    const attrs = asAttrs(tag.attributes);
    if (tag.name === 'Record') handleRecord(state, attrs);
    if (tag.name === 'Workout') handleWorkout(state, attrs);
    if (tag.name === 'HealthData') {
      state.exportStartedAt = normalizeAppleDate(attrs.startDate);
      state.exportEndedAt = normalizeAppleDate(attrs.endDate);
    }
  });
  parser.on('error', (error) => {
    state.warnings.push(`XML parser recovered from: ${error.message}`);
    (parser as unknown as { resume?: () => void }).resume?.();
  });

  const decoder = new TextDecoder();
  const chunkSize = 512 * 1024;
  for (let offset = 0; offset < xmlBytes.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, xmlBytes.length);
    parser.write(decoder.decode(xmlBytes.slice(offset, end), { stream: end < xmlBytes.length }));
    onProgress?.({ phase: 'parse', processedBytes: end, totalBytes: xmlBytes.length });
  }
  parser.close();

  const { dailyMetrics, sleepNights } = finalizeDaily(state);
  const weights = state.weights.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const workouts = state.workouts.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const sleepIntervals = state.sleepIntervals.sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
  const heartRateSamples = state.heartRateSamples.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  linkHeartRateSamplesToWorkouts(workouts, heartRateSamples);
  const dates = dailyMetrics.map((metric) => metric.date);
  const summary: HealthImportSummary = {
    id: makeId('import', [Date.now(), state.recordCount, weights.length, workouts.length]),
    mode: options.includeDetailedRecords ? 'detailed' : 'aggregate',
    importedAt: new Date().toISOString(),
    exportStartedAt: state.exportStartedAt,
    exportEndedAt: state.exportEndedAt,
    recordCount: state.recordCount,
    workoutCount: state.workoutCount,
    updatedDays: dailyMetrics.length,
    weightCount: weights.length,
    sleepNightCount: sleepNights.length,
    sleepIntervalCount: sleepIntervals.length,
    heartRateSampleCount: heartRateSamples.length,
    warningCount: state.warnings.length,
    warnings: state.warnings.slice(0, 20),
  };

  if (!summary.exportStartedAt && dates[0]) summary.exportStartedAt = dates[0];
  if (!summary.exportEndedAt && dates[dates.length - 1]) summary.exportEndedAt = dates[dates.length - 1];

  return {
    dailyMetrics,
    weightMeasurements: weights,
    workouts,
    sleepNights,
    sleepIntervals,
    heartRateSamples,
    importSummaries: [summary],
  };
}

function findExportXml(unzipped: Record<string, Uint8Array>) {
  const entry = Object.entries(unzipped).find(([name]) => name.endsWith('/export.xml') || name === 'export.xml');
  return entry?.[1];
}

export async function parseAppleHealthExport(
  file: File | Blob,
  optionsOrProgress: HealthImportOptions | ParseProgress = defaultImportOptions,
  progress?: ParseProgress,
): Promise<HealthSnapshot> {
  const options = typeof optionsOrProgress === 'function' ? defaultImportOptions : optionsOrProgress;
  const onProgress = typeof optionsOrProgress === 'function' ? optionsOrProgress : progress;
  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress?.({ phase: 'read', processedBytes: bytes.length, totalBytes: bytes.length });

  const looksLikeXml = strFromU8(bytes.slice(0, Math.min(bytes.length, 128))).includes('<');
  if (looksLikeXml) {
    return parseXml(bytes, options, onProgress);
  }

  onProgress?.({ phase: 'unzip', processedBytes: 0, totalBytes: bytes.length });
  const unzipped = unzipSync(bytes);
  const exportXml = findExportXml(unzipped);
  if (!exportXml) {
    throw new Error('Could not find export.xml inside the Apple Health export.');
  }
  onProgress?.({ phase: 'unzip', processedBytes: bytes.length, totalBytes: bytes.length });
  return parseXml(exportXml, options, onProgress);
}
