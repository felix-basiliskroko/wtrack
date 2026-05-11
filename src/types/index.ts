export type WorkoutEntry = {
  activityType: 'cardio' | 'intervals' | 'strength';
  durationMin: number;
  peakHeartRate: number;
};

export type WeightEntry = {
  id: string;
  timestamp: string; // ISO
  weight: number; // kg
  workout?: WorkoutEntry;
  source?: 'manual' | 'appleHealth';
};

export type MetabolicProfile = {
  biologicalSex: 'female' | 'male';
  age: number;
  heightCm: number;
  activityMultiplier: number; // non-exercise movement
  dietDeficit: number; // kcal removed via nutrition
  horizonDays: number;
};

export type PredictionPoint = {
  date: Date;
  mean: number;
  variance: number;
};

export type ProjectionSummary = {
  totalChange: number;
  pacePerWeek: number;
  projectedGoalDate: Date | null;
  latestWeight: number;
};

export type ChartWeightSource = 'combined' | 'manual' | 'appleHealth';

export type DailyHealthMetrics = {
  date: string; // yyyy-MM-dd
  steps?: number;
  stepSource?: 'appleWatch' | 'iphone' | 'mixed' | 'other';
  activeEnergyKcal?: number;
  basalEnergyKcal?: number;
  exerciseMinutes?: number;
  restingHeartRateBpm?: number;
  walkingHeartRateBpm?: number;
  hrvSdnnMs?: number;
  vo2Max?: number;
  bodyFatPercentage?: number;
  leanBodyMassKg?: number;
  bmi?: number;
  waistCircumferenceCm?: number;
};

export type HealthImportMode = 'aggregate' | 'detailed';

export type HealthImportOptions = {
  includeDetailedRecords: boolean;
};

export type WeightMeasurement = {
  id: string;
  timestamp: string;
  weightKg: number;
  sourceName?: string;
};

export type SleepStage = 'inBed' | 'asleep' | 'awake' | 'core' | 'deep' | 'rem';

export type SleepInterval = {
  id: string;
  nightDate: string; // yyyy-MM-dd
  startDate: string;
  endDate: string;
  stage: SleepStage;
  durationMin: number;
  sourceName?: string;
};

export type HeartRateSample = {
  id: string;
  date: string; // yyyy-MM-dd
  timestamp: string;
  bpm: number;
  sourceName?: string;
  workoutId?: string;
};

export type WorkoutSummary = {
  id: string;
  activityType: string;
  startDate: string;
  endDate: string;
  durationMin: number;
  activeEnergyKcal?: number;
  distanceKm?: number;
  minHeartRateBpm?: number;
  averageHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  heartRateSampleCount?: number;
  sourceName?: string;
};

export type SleepNight = {
  id: string;
  nightDate: string; // yyyy-MM-dd
  inBedMin: number;
  asleepMin: number;
  awakeMin: number;
  coreMin: number;
  deepMin: number;
  remMin: number;
  intervalCount: number;
};

export type HealthImportSummary = {
  id: string;
  mode?: HealthImportMode;
  importedAt: string;
  exportStartedAt?: string;
  exportEndedAt?: string;
  recordCount: number;
  workoutCount: number;
  updatedDays: number;
  weightCount: number;
  sleepNightCount: number;
  sleepIntervalCount?: number;
  heartRateSampleCount?: number;
  warningCount: number;
  warnings: string[];
};

export type HealthSnapshot = {
  dailyMetrics: DailyHealthMetrics[];
  weightMeasurements: WeightMeasurement[];
  workouts: WorkoutSummary[];
  sleepNights: SleepNight[];
  sleepIntervals: SleepInterval[];
  heartRateSamples: HeartRateSample[];
  importSummaries: HealthImportSummary[];
};

export type VaultSettings = {
  metabolicProfile: MetabolicProfile;
  goalWeight: number;
  chartWeightSource: ChartWeightSource;
  createdAt: string;
  updatedAt: string;
};

export type VaultData = {
  settings: VaultSettings;
  manualEntries: WeightEntry[];
  health: HealthSnapshot;
};

export type VaultManifest = {
  schemaVersion: 1;
  updatedAt: string;
  objectKeys: {
    settings: string;
    manualEntries: string;
    healthSnapshot: string;
  };
};

export type EncryptedVaultObject = {
  key: string;
  role: string;
  revision: number;
  nonce: string;
  ciphertext: string;
  aad: string;
  updatedAt?: string;
};

export type VaultMeta = {
  schemaVersion: 1;
  kdf: {
    algorithm: 'argon2id';
    salt: string;
    time: number;
    mem: number;
    parallelism: number;
    hashLen: number;
  };
  wrappedKey: {
    algorithm: 'AES-GCM';
    nonce: string;
    ciphertext: string;
  };
  updatedAt?: string;
};
