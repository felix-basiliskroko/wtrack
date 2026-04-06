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
