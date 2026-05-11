import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DISPLAY_PREFERENCES, DEFAULT_GOAL_WEIGHT, DEFAULT_METABOLIC_PROFILE, SEED_ENTRIES, STORAGE_KEYS } from '../constants';
import {
  BackupPayload,
  BackupStatus,
  DisplayPreferences,
  HealthImportOptions,
  HealthSnapshot,
  MetabolicProfile,
  VaultData,
  VaultMeta,
  WeightEntry,
} from '../types';
import { createVaultMeta, rotateVaultMeta, unlockVaultKey } from '../services/vaultCrypto';
import { parseHealthExportInWorker } from '../services/healthImportWorkerClient';
import { vaultApi } from '../services/vaultApi';
import {
  buildInitialVaultData,
  collectRevisions,
  decryptVaultData,
  encryptVaultData,
  normalizeVaultData,
} from '../services/vaultStore';

type VaultStatus = 'checking' | 'unauthenticated' | 'setup' | 'locked' | 'unlocked';

type ImportProgress = {
  phase: string;
  processedBytes?: number;
  totalBytes?: number;
};

const EMPTY_BACKUP_STATUS: BackupStatus = {
  available: false,
  lastBackupAt: null,
  latestHash: null,
  latestFilename: null,
  count: 0,
};

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEntry = (payload: {
  weight: number;
  timestamp: string;
  note?: string;
  workout?: WeightEntry['workout'];
}): WeightEntry => ({
  id: makeId(),
  timestamp: payload.timestamp,
  weight: payload.weight,
  note: payload.note,
  workout: payload.workout,
  source: 'manual',
});

export function useVault() {
  const [status, setStatus] = useState<VaultStatus>('checking');
  const [data, setData] = useState<VaultData | null>(null);
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(EMPTY_BACKUP_STATUS);
  const [backupPending, setBackupPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const vaultKeyRef = useRef<CryptoKey | null>(null);
  const revisionsRef = useRef<Record<string, number>>({});
  const dataRef = useRef<VaultData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refreshMeta = useCallback(async () => {
    setError(null);
    try {
      const response = await vaultApi.getMeta();
      setMeta(response.meta);
      setStatus(response.meta ? 'locked' : 'setup');
    } catch (caught) {
      const statusCode = (caught as Error & { status?: number }).status;
      setStatus(statusCode === 401 ? 'unauthenticated' : 'checking');
      setError(caught instanceof Error ? caught.message : 'Failed to reach vault server.');
    }
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  const refreshBackupStatus = useCallback(async () => {
    try {
      const nextStatus = await vaultApi.getBackupStatus();
      setBackupStatus(nextStatus);
    } catch {
      setBackupStatus(EMPTY_BACKUP_STATUS);
    }
  }, []);

  const login = useCallback(
    async (token: string) => {
      setBusy(true);
      setError(null);
      try {
        await vaultApi.login(token);
        await refreshMeta();
        await refreshBackupStatus();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Login failed.');
      } finally {
        setBusy(false);
      }
    },
    [refreshBackupStatus, refreshMeta],
  );

  const persistData = useCallback(async (nextData: VaultData) => {
    const vaultKey = vaultKeyRef.current;
    if (!vaultKey) throw new Error('vault-locked');
    const normalized = normalizeVaultData(nextData);
    const { encryptedObjects, expectedRevisions } = await encryptVaultData(vaultKey, normalized, revisionsRef.current);
    await vaultApi.putObjects(encryptedObjects, expectedRevisions);
    revisionsRef.current = {
      ...revisionsRef.current,
      ...collectRevisions(encryptedObjects),
    };
    setData(normalized);
    dataRef.current = normalized;
  }, []);

  const setup = useCallback(async (passphrase: string) => {
    if (passphrase.length < 10) {
      setError('Use at least 10 characters for the vault passphrase.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const created = await createVaultMeta(passphrase);
      const initialData = buildInitialVaultData();
      revisionsRef.current = {};
      vaultKeyRef.current = created.vaultKey;
      await vaultApi.putMeta(created.meta);
      const { encryptedObjects, expectedRevisions } = await encryptVaultData(
        created.vaultKey,
        initialData,
        revisionsRef.current,
      );
      await vaultApi.putObjects(encryptedObjects, expectedRevisions);
      revisionsRef.current = collectRevisions(encryptedObjects);
      window.localStorage.setItem(STORAGE_KEYS.vaultMigration, new Date().toISOString());
      setMeta(created.meta);
      setData(normalizeVaultData(initialData));
      setStatus('unlocked');
      await refreshBackupStatus();
    } catch (caught) {
      vaultKeyRef.current = null;
      setError(caught instanceof Error ? caught.message : 'Vault setup failed.');
    } finally {
      setBusy(false);
    }
  }, [refreshBackupStatus]);

  const unlock = useCallback(
    async (passphrase: string) => {
      const currentMeta = meta ?? (await vaultApi.getMeta()).meta;
      if (!currentMeta) {
        setStatus('setup');
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const vaultKey = await unlockVaultKey(passphrase, currentMeta);
        const objectResponse = await vaultApi.getObjects();
        revisionsRef.current = collectRevisions(objectResponse.objects);
        const decrypted = await decryptVaultData(vaultKey, objectResponse.objects);
        vaultKeyRef.current = vaultKey;
        setMeta(currentMeta);
        setData(normalizeVaultData(decrypted));
        setStatus('unlocked');
        await refreshBackupStatus();
      } catch (caught) {
        vaultKeyRef.current = null;
        setError(caught instanceof Error ? caught.message : 'Unlock failed. Check the passphrase.');
      } finally {
        setBusy(false);
      }
    },
    [meta, refreshBackupStatus],
  );

  const lock = useCallback(() => {
    vaultKeyRef.current = null;
    setData(null);
    setStatus(meta ? 'locked' : 'setup');
  }, [meta]);

  const logout = useCallback(async () => {
    await vaultApi.logout().catch(() => undefined);
    vaultKeyRef.current = null;
    revisionsRef.current = {};
    setData(null);
    setMeta(null);
    setBackupStatus(EMPTY_BACKUP_STATUS);
    setStatus('unauthenticated');
  }, []);

  const updateData = useCallback(
    async (updater: (current: VaultData) => VaultData) => {
      const current = dataRef.current;
      if (!current) throw new Error('vault-locked');
      await persistData(updater(current));
    },
    [persistData],
  );

  const addEntry = useCallback(
    async (payload: Parameters<typeof createEntry>[0]) => {
      await updateData((current) => ({
        ...current,
        manualEntries: [...current.manualEntries, createEntry(payload)],
      }));
    },
    [updateData],
  );

  const updateEntry = useCallback(
    async (id: string, payload: Parameters<typeof createEntry>[0]) => {
      await updateData((current) => ({
        ...current,
        manualEntries: current.manualEntries.map((entry) =>
          entry.id === id && entry.source !== 'appleHealth'
            ? {
                ...entry,
                timestamp: payload.timestamp,
                weight: payload.weight,
                workout: payload.workout,
                note: payload.note,
                source: 'manual',
              }
            : entry,
        ),
      }));
    },
    [updateData],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      await updateData((current) => ({
        ...current,
        manualEntries: current.manualEntries.filter((entry) => entry.id !== id || entry.source === 'appleHealth'),
      }));
    },
    [updateData],
  );

  const updateProfile = useCallback(
    async (profile: MetabolicProfile) => {
      await updateData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          metabolicProfile: profile,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [updateData],
  );

  const updateGoal = useCallback(
    async (goalWeight: number) => {
      await updateData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          goalWeight,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [updateData],
  );

  const updateChartSource = useCallback(
    async (chartWeightSource: VaultData['settings']['chartWeightSource']) => {
      await updateData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          chartWeightSource,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [updateData],
  );

  const updatePreferences = useCallback(
    async (displayPreferences: DisplayPreferences) => {
      await updateData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          displayPreferences: {
            ...DEFAULT_DISPLAY_PREFERENCES,
            ...displayPreferences,
          },
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [updateData],
  );

  const restoreBackup = useCallback(
    async (payload: BackupPayload) => {
      const nextEntries = Array.isArray(payload.entries)
        ? payload.entries
            .filter((entry) => typeof entry?.timestamp === 'string' && Number.isFinite(entry?.weight))
            .map((entry) => ({
              ...entry,
              id: entry.id || makeId(),
              source: 'manual' as const,
            }))
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        : SEED_ENTRIES;

      const nextProfile = payload.metabolicProfile
        ? { ...DEFAULT_METABOLIC_PROFILE, ...payload.metabolicProfile }
        : DEFAULT_METABOLIC_PROFILE;
      const nextGoalWeight =
        typeof payload.goalWeight === 'number' && Number.isFinite(payload.goalWeight)
          ? payload.goalWeight
          : DEFAULT_GOAL_WEIGHT;
      const nextPreferences = payload.displayPreferences
        ? { ...DEFAULT_DISPLAY_PREFERENCES, ...payload.displayPreferences }
        : DEFAULT_DISPLAY_PREFERENCES;

      await updateData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          metabolicProfile: nextProfile,
          goalWeight: nextGoalWeight,
          displayPreferences: nextPreferences,
          updatedAt: new Date().toISOString(),
        },
        manualEntries: nextEntries,
      }));
    },
    [updateData],
  );

  const importHealthExport = useCallback(
    async (file: File, options: HealthImportOptions) => {
      setBusy(true);
      setError(null);
      setImportProgress({ phase: 'read' });
      try {
        const snapshot = await parseHealthExportInWorker(file, options, setImportProgress);
        await updateData((current) => ({
          ...current,
          health: mergeImportedSnapshot(current.health, snapshot),
        }));
        setImportProgress(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Import failed.');
      } finally {
        setBusy(false);
      }
    },
    [updateData],
  );

  const rotatePassphrase = useCallback(async (passphrase: string) => {
    const vaultKey = vaultKeyRef.current;
    if (!vaultKey) {
      setError('Unlock the vault before changing the passphrase.');
      return;
    }
    if (passphrase.length < 10) {
      setError('Use at least 10 characters for the new passphrase.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const nextMeta = await rotateVaultMeta(passphrase, vaultKey);
      await vaultApi.putMeta(nextMeta);
      setMeta(nextMeta);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Passphrase rotation failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  const exportEncryptedBackup = useCallback(async () => vaultApi.exportEncryptedBackup(), []);

  const backupEncryptedVault = useCallback(async () => {
    setBackupPending(true);
    setError(null);
    try {
      const backup = await vaultApi.exportEncryptedBackup();
      const nextStatus = await vaultApi.putEncryptedBackup(backup);
      setBackupStatus(nextStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Encrypted backup failed.');
      await refreshBackupStatus();
    } finally {
      setBackupPending(false);
    }
  }, [refreshBackupStatus]);

  return useMemo(
    () => ({
      status,
      data,
      error,
      busy,
      importProgress,
      backupStatus,
      backupPending,
      login,
      setup,
      unlock,
      lock,
      logout,
      addEntry,
      updateEntry,
      deleteEntry,
      updateProfile,
      updateGoal,
      updateChartSource,
      updatePreferences,
      restoreBackup,
      importHealthExport,
      rotatePassphrase,
      exportEncryptedBackup,
      backupEncryptedVault,
      refreshMeta,
      refreshBackupStatus,
    }),
    [
      status,
      data,
      error,
      busy,
      importProgress,
      backupStatus,
      backupPending,
      login,
      setup,
      unlock,
      lock,
      logout,
      addEntry,
      updateEntry,
      deleteEntry,
      updateProfile,
      updateGoal,
      updateChartSource,
      updatePreferences,
      restoreBackup,
      importHealthExport,
      rotatePassphrase,
      exportEncryptedBackup,
      backupEncryptedVault,
      refreshMeta,
      refreshBackupStatus,
    ],
  );
}

function mergeImportedSnapshot(previous: HealthSnapshot, next: HealthSnapshot): HealthSnapshot {
  return {
    ...next,
    importSummaries: [...next.importSummaries, ...previous.importSummaries].slice(0, 20),
  };
}
