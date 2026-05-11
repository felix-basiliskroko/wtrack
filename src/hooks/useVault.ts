import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../constants';
import { HealthImportOptions, HealthSnapshot, MetabolicProfile, VaultData, VaultMeta, WeightEntry } from '../types';
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

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEntry = (payload: {
  weight: number;
  timestamp: string;
  workout?: WeightEntry['workout'];
}): WeightEntry => ({
  id: makeId(),
  timestamp: payload.timestamp,
  weight: payload.weight,
  workout: payload.workout,
  source: 'manual',
});

export function useVault() {
  const [status, setStatus] = useState<VaultStatus>('checking');
  const [data, setData] = useState<VaultData | null>(null);
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
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

  const login = useCallback(
    async (token: string) => {
      setBusy(true);
      setError(null);
      try {
        await vaultApi.login(token);
        await refreshMeta();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Login failed.');
      } finally {
        setBusy(false);
      }
    },
    [refreshMeta],
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
    } catch (caught) {
      vaultKeyRef.current = null;
      setError(caught instanceof Error ? caught.message : 'Vault setup failed.');
    } finally {
      setBusy(false);
    }
  }, []);

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
      } catch (caught) {
        vaultKeyRef.current = null;
        setError(caught instanceof Error ? caught.message : 'Unlock failed. Check the passphrase.');
      } finally {
        setBusy(false);
      }
    },
    [meta],
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

  return useMemo(
    () => ({
      status,
      data,
      error,
      busy,
      importProgress,
      login,
      setup,
      unlock,
      lock,
      logout,
      addEntry,
      updateProfile,
      updateGoal,
      updateChartSource,
      importHealthExport,
      rotatePassphrase,
      exportEncryptedBackup,
      refreshMeta,
    }),
    [
      status,
      data,
      error,
      busy,
      importProgress,
      login,
      setup,
      unlock,
      lock,
      logout,
      addEntry,
      updateProfile,
      updateGoal,
      updateChartSource,
      importHealthExport,
      rotatePassphrase,
      exportEncryptedBackup,
      refreshMeta,
    ],
  );
}

function mergeImportedSnapshot(previous: HealthSnapshot, next: HealthSnapshot): HealthSnapshot {
  return {
    ...next,
    importSummaries: [...next.importSummaries, ...previous.importSummaries].slice(0, 20),
  };
}
