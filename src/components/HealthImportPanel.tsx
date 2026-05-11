import { useRef, useState } from 'react';
import { HealthImportOptions, HealthImportSummary } from '../types';

type ImportProgress = {
  phase: string;
  processedBytes?: number;
  totalBytes?: number;
};

type HealthImportPanelProps = {
  busy: boolean;
  progress: ImportProgress | null;
  latestSummary?: HealthImportSummary;
  onImport: (file: File, options: HealthImportOptions) => void;
};

const formatBytes = (value: number | undefined) => {
  if (!value) return '';
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value > 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

export const HealthImportPanel = ({ busy, progress, latestSummary, onImport }: HealthImportPanelProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedName, setSelectedName] = useState('');
  const [includeDetailedRecords, setIncludeDetailedRecords] = useState(true);
  const percent =
    progress?.processedBytes && progress.totalBytes
      ? Math.min(Math.round((progress.processedBytes / progress.totalBytes) * 100), 100)
      : 0;

  return (
    <section className="panel-card import-card" id="import">
      <div className="panel-head">
        <p className="eyebrow">Apple Health import</p>
        <h3>Update from a full Health export</h3>
        <p className="muted">
          Choose the ZIP saved by the iOS Shortcut. The browser parses it locally, then uploads encrypted vault chunks.
        </p>
      </div>
      <div className="import-actions">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={includeDetailedRecords}
            onChange={(event) => setIncludeDetailedRecords(event.target.checked)}
            disabled={busy}
          />
          <span>
            <strong>Keep detailed records</strong>
            <small>Sleep stages, heart-rate samples, and workout context for charts.</small>
          </span>
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.xml,application/zip,text/xml,application/xml"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setSelectedName(file.name);
            onImport(file, { includeDetailedRecords });
            event.currentTarget.value = '';
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Importing...' : 'Choose Health export'}
        </button>
        <p className="muted tiny">{selectedName || 'Shortcut path: On My iPhone / WTrack Imports'}</p>
      </div>
      {progress ? (
        <div className="import-progress">
          <div>
            <span>{progress.phase}</span>
            <span>
              {percent}% {formatBytes(progress.processedBytes)}
            </span>
          </div>
          <progress value={percent} max={100} />
        </div>
      ) : null}
      {latestSummary ? (
        <div className="import-summary">
          <div>
            <span className="label">Last import</span>
            <strong>{new Date(latestSummary.importedAt).toLocaleString()}</strong>
          </div>
          <div>
            <span className="label">Records</span>
            <strong>{latestSummary.recordCount.toLocaleString()}</strong>
          </div>
          <div>
            <span className="label">Days</span>
            <strong>{latestSummary.updatedDays.toLocaleString()}</strong>
          </div>
          <div>
            <span className="label">Warnings</span>
            <strong>{latestSummary.warningCount}</strong>
          </div>
          <div>
            <span className="label">Mode</span>
            <strong>{latestSummary.mode === 'aggregate' ? 'Aggregate' : 'Detailed'}</strong>
          </div>
        </div>
      ) : (
        <p className="muted">No Apple Health import has been decrypted in this vault yet.</p>
      )}
      <div className="shortcut-note">
        <p className="label">Shortcut recipe</p>
        <p className="muted">
          Receive files from Share Sheet, save to WTrack Imports, then open this server at /import?from=shortcut.
        </p>
      </div>
    </section>
  );
};
