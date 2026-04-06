import { MetabolicProfile, WeightEntry } from './types';

export const STORAGE_KEYS = {
  entries: 'wtrack.entries.v2',
  profile: 'wtrack.metabolicProfile.v1',
  goal: 'wtrack.goalWeight.v1',
} as const;

export const SEED_ENTRIES: WeightEntry[] = [];

export const DEFAULT_METABOLIC_PROFILE: MetabolicProfile = {
  biologicalSex: 'male',
  age: 24,
  heightCm: 184,
  activityMultiplier: 1.20,
  dietDeficit: 300,
  horizonDays: 31,
};

export const DEFAULT_GOAL_WEIGHT = 80;
