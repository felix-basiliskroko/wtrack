import { ChangeEvent, useRef, useState } from 'react';
import { DisplayPreferences, MetabolicProfile, WeightEntry } from '../types';

const pretty = (data: unknown) => JSON.stringify(data, null, 2);

type BackupPayload = {
  entries?: WeightEntry[];
  metabolicProfile?: MetabolicProfile;
  goalWeight?: number;
  displayPreferences?: Partial<DisplayPreferences>;
  lastUpdated?: string;
};

type DataVaultProps = {
  entries: WeightEntry[];
  profile: MetabolicProfile;
  goalWeight: number;
  preferences: DisplayPreferences;
  onRestore: (payload: BackupPayload) => void;
};

export const DataVault = ({ entries, profile, goalWeight, preferences, onRestore }: DataVaultProps) => {
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const payload = {
    entries,
    metabolicProfile: profile,
    goalWeight,
    displayPreferences: preferences,
    lastUpdated: new Date().toISOString(),
  };

  const copy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(pretty(payload));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy JSON', error);
    }
  };

  const restore = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as BackupPayload;
      onRestore(parsed);
      setStatus('Backup imported.');
      setImportText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to import JSON', error);
      setStatus('Import failed. Check the JSON and try again.');
    }
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      restore(text);
    } catch (error) {
      console.error('Failed to read backup file', error);
      setStatus('Could not read that file.');
    }
  };

  return (
    <section className="panel-card data-vault">
      <div className="panel-head">
        <p className="eyebrow">Persistent JSON</p>
        <h3>Everything the model knows</h3>
        <p className="muted">Stored in localStorage under wtrack.*, ready to export whenever you need.</p>
        <button type="button" onClick={copy}>
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
      </div>
      <div className="data-vault-import">
        <label>
          Paste backup JSON
          <textarea
            rows={6}
            placeholder="Paste a WTrack backup here"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
          />
        </label>
        <div className="data-vault-actions">
          <button type="button" onClick={() => restore(importText)} disabled={!importText.trim()}>
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileImport}
          />
        </div>
        {status ? <p className="muted tiny">{status}</p> : null}
      </div>
      <pre>{pretty(payload)}</pre>
    </section>
  );
};
