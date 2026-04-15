import { BackupPayload, DisplayPreferences, MetabolicProfile, WeightEntry } from '../types';

export const buildBackupPayload = (
  entries: WeightEntry[],
  profile: MetabolicProfile,
  goalWeight: number,
  preferences: DisplayPreferences,
  lastUpdated = '',
): BackupPayload => ({
  entries,
  metabolicProfile: profile,
  goalWeight,
  displayPreferences: preferences,
  lastUpdated,
});

export const serializeBackupPayload = (payload: BackupPayload) => JSON.stringify(payload);

export const prettyBackupPayload = (payload: BackupPayload) => JSON.stringify(payload, null, 2);

export const hashBackupPayload = async (payload: BackupPayload) => {
  const serialized = serializeBackupPayload(payload);
  if (typeof crypto === 'undefined' || !crypto.subtle) return serialized;

  const encoded = new TextEncoder().encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};
