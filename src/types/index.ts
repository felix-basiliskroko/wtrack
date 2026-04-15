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
  note?: string;
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
  goalDateRange: {
    early: Date | null;
    likely: Date | null;
    late: Date | null;
  };
  confidenceScore: number;
  latestWeight: number;
};

export type ThemeMode = 'midnight' | 'paper' | 'sports-lab';
export type DensityMode = 'compact' | 'comfortable' | 'spacious';
export type ChartLineStyle = 'strong' | 'soft';
export type ChartViewMode = 'raw' | 'trend' | 'combined';
export type NavigationStyle = 'compact' | 'large';
export type MotionMode = 'full' | 'reduced' | 'off';
export type WeightUnit = 'kg' | 'lb';
export type DateFormatMode = 'month-day' | 'day-month' | 'iso';

export type DisplayPreferences = {
  theme: ThemeMode;
  density: DensityMode;
  chartLineStyle: ChartLineStyle;
  chartView: ChartViewMode;
  showConfidenceBand: boolean;
  showGoalLine: boolean;
  navigationStyle: NavigationStyle;
  motion: MotionMode;
  weightUnit: WeightUnit;
  dateFormat: DateFormatMode;
};
