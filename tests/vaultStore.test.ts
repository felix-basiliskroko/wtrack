import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY_PREFERENCES, DEFAULT_METABOLIC_PROFILE } from '../src/constants';
import { VaultData } from '../src/types';
import { normalizeVaultData } from '../src/services/vaultStore';

const emptyHealth = {
  dailyMetrics: [],
  weightMeasurements: [],
  workouts: [],
  sleepNights: [],
  sleepIntervals: [],
  heartRateSamples: [],
  importSummaries: [],
};

describe('vaultStore normalization', () => {
  it('defaults display preferences and preserves manual entry notes and source', () => {
    const data = {
      settings: {
        metabolicProfile: DEFAULT_METABOLIC_PROFILE,
        goalWeight: 80,
        chartWeightSource: 'combined',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      manualEntries: [
        {
          id: 'manual-1',
          timestamp: '2026-05-02T07:00:00.000Z',
          weight: 84.1,
          note: 'Low sleep',
        },
      ],
      health: emptyHealth,
    } as unknown as VaultData;

    const normalized = normalizeVaultData(data);

    expect(normalized.settings.displayPreferences).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(normalized.manualEntries[0].note).toBe('Low sleep');
    expect(normalized.manualEntries[0].source).toBe('manual');
  });
});
