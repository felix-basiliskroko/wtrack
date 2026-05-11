import { DEFAULT_GOAL_WEIGHT, DEFAULT_METABOLIC_PROFILE, STORAGE_KEYS } from '../constants';
import {
  EncryptedVaultObject,
  HealthSnapshot,
  MetabolicProfile,
  VaultData,
  VaultManifest,
  VaultSettings,
  WeightEntry,
} from '../types';
import { decryptVaultObject, encryptVaultObject } from './vaultCrypto';

export const VAULT_OBJECT_KEYS = {
  manifest: 'manifest',
  settings: 'settings',
  manualEntries: 'manual-entries',
  healthSnapshot: 'health-snapshot',
} as const;

const emptyHealthSnapshot = (): HealthSnapshot => ({
  dailyMetrics: [],
  weightMeasurements: [],
  workouts: [],
  sleepNights: [],
  sleepIntervals: [],
  heartRateSamples: [],
  importSummaries: [],
});

const safeJson = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function buildInitialVaultData(): VaultData {
  const now = new Date().toISOString();
  const migratedEntries = safeJson<WeightEntry[]>(STORAGE_KEYS.entries, []);
  const migratedProfile = safeJson<MetabolicProfile>(STORAGE_KEYS.profile, DEFAULT_METABOLIC_PROFILE);
  const migratedGoal = safeJson<number>(STORAGE_KEYS.goal, DEFAULT_GOAL_WEIGHT);

  return {
    settings: {
      metabolicProfile: migratedProfile,
      goalWeight: migratedGoal,
      chartWeightSource: 'combined',
      createdAt: now,
      updatedAt: now,
    },
    manualEntries: migratedEntries.map((entry) => ({
      ...entry,
      source: entry.source ?? 'manual',
    })),
    health: emptyHealthSnapshot(),
  };
}

export function createManifest(): VaultManifest {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    objectKeys: {
      settings: VAULT_OBJECT_KEYS.settings,
      manualEntries: VAULT_OBJECT_KEYS.manualEntries,
      healthSnapshot: VAULT_OBJECT_KEYS.healthSnapshot,
    },
  };
}

export async function decryptVaultData(vaultKey: CryptoKey, objects: EncryptedVaultObject[]): Promise<VaultData> {
  const objectMap = new Map(objects.map((object) => [object.key, object]));
  const manifestObject = objectMap.get(VAULT_OBJECT_KEYS.manifest);
  if (!manifestObject) throw new Error('missing-vault-manifest');

  const manifest = await decryptVaultObject<VaultManifest>(vaultKey, manifestObject);
  const settingsObject = objectMap.get(manifest.objectKeys.settings);
  const manualEntriesObject = objectMap.get(manifest.objectKeys.manualEntries);
  const healthObject = objectMap.get(manifest.objectKeys.healthSnapshot);

  if (!settingsObject || !manualEntriesObject || !healthObject) {
    throw new Error('incomplete-vault');
  }

  const [settings, manualEntries, health] = await Promise.all([
    decryptVaultObject<VaultSettings>(vaultKey, settingsObject),
    decryptVaultObject<WeightEntry[]>(vaultKey, manualEntriesObject),
    decryptVaultObject<HealthSnapshot>(vaultKey, healthObject),
  ]);

  return {
    settings,
    manualEntries,
    health: {
      ...emptyHealthSnapshot(),
      ...health,
      sleepIntervals: health.sleepIntervals ?? [],
      heartRateSamples: health.heartRateSamples ?? [],
      importSummaries: health.importSummaries ?? [],
    },
  };
}

export function collectRevisions(objects: EncryptedVaultObject[]) {
  return objects.reduce<Record<string, number>>((revisions, object) => {
    revisions[object.key] = object.revision;
    return revisions;
  }, {});
}

export async function encryptVaultData(
  vaultKey: CryptoKey,
  data: VaultData,
  currentRevisions: Record<string, number>,
) {
  const manifest = createManifest();
  const payloads: Array<{ key: string; role: string; payload: unknown }> = [
    { key: VAULT_OBJECT_KEYS.manifest, role: 'manifest', payload: manifest },
    { key: VAULT_OBJECT_KEYS.settings, role: 'settings', payload: data.settings },
    { key: VAULT_OBJECT_KEYS.manualEntries, role: 'manual-entries', payload: data.manualEntries },
    { key: VAULT_OBJECT_KEYS.healthSnapshot, role: 'health-snapshot', payload: data.health },
  ];

  const expectedRevisions: Record<string, number> = {};
  const encryptedObjects = await Promise.all(
    payloads.map(({ key, role, payload }) => {
      const revision = currentRevisions[key] ?? 0;
      expectedRevisions[key] = revision;
      return encryptVaultObject(vaultKey, key, role, revision + 1, payload);
    }),
  );

  return { encryptedObjects, expectedRevisions };
}

export function normalizeVaultData(data: VaultData): VaultData {
  return {
    settings: {
      ...data.settings,
      updatedAt: new Date().toISOString(),
    },
    manualEntries: [...data.manualEntries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    ),
    health: {
      dailyMetrics: [...data.health.dailyMetrics].sort((a, b) => a.date.localeCompare(b.date)),
      weightMeasurements: [...data.health.weightMeasurements].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
      workouts: [...data.health.workouts].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      ),
      sleepNights: [...data.health.sleepNights].sort((a, b) => a.nightDate.localeCompare(b.nightDate)),
      sleepIntervals: [...(data.health.sleepIntervals ?? [])].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      ),
      heartRateSamples: [...(data.health.heartRateSamples ?? [])].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
      importSummaries: [...data.health.importSummaries].sort(
        (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
      ),
    },
  };
}
