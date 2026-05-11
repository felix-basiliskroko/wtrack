import { useState } from 'react';
import { HealthSnapshot } from '../types';

type VaultStatusPanelProps = {
  health: HealthSnapshot;
  onLock: () => void;
  onLogout: () => void;
  onRotatePassphrase: (passphrase: string) => void;
  onExportEncryptedBackup: () => Promise<unknown>;
};

export const VaultStatusPanel = ({
  health,
  onLock,
  onLogout,
  onRotatePassphrase,
  onExportEncryptedBackup,
}: VaultStatusPanelProps) => {
  const [newPassphrase, setNewPassphrase] = useState('');
  const [backupReady, setBackupReady] = useState(false);

  const exportBackup = async () => {
    const backup = await onExportEncryptedBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wtrack-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupReady(true);
    setTimeout(() => setBackupReady(false), 2000);
  };

  return (
    <section className="panel-card vault-status">
      <div className="panel-head">
        <p className="eyebrow">Encrypted vault</p>
        <h3>Private data boundary</h3>
        <p className="muted">Unlocked in this browser. The server stores encrypted objects and session metadata only.</p>
      </div>
      <div className="vault-stats">
        <div>
          <span className="label">Daily metrics</span>
          <strong>{health.dailyMetrics.length}</strong>
        </div>
        <div>
          <span className="label">Weights</span>
          <strong>{health.weightMeasurements.length}</strong>
        </div>
        <div>
          <span className="label">Sleep nights</span>
          <strong>{health.sleepNights.length}</strong>
        </div>
      </div>
      <div className="vault-actions">
        <button type="button" onClick={onLock}>
          Lock
        </button>
        <button type="button" onClick={exportBackup}>
          {backupReady ? 'Exported' : 'Encrypted backup'}
        </button>
        <button type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
      <form
        className="passphrase-form"
        onSubmit={(event) => {
          event.preventDefault();
          onRotatePassphrase(newPassphrase);
          setNewPassphrase('');
        }}
      >
        <label>
          Change passphrase
          <input
            type="password"
            value={newPassphrase}
            onChange={(event) => setNewPassphrase(event.target.value)}
            placeholder="New passphrase"
          />
        </label>
        <button type="submit" disabled={newPassphrase.length < 10}>
          Rotate key wrap
        </button>
      </form>
    </section>
  );
};
