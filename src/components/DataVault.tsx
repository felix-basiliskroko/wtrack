import { useState } from 'react';
import { MetabolicProfile, WeightEntry } from '../types';

const pretty = (data: unknown) => JSON.stringify(data, null, 2);

type DataVaultProps = {
  entries: WeightEntry[];
  profile: MetabolicProfile;
  goalWeight: number;
};

export const DataVault = ({ entries, profile, goalWeight }: DataVaultProps) => {
  const [copied, setCopied] = useState(false);

  const payload = {
    entries,
    metabolicProfile: profile,
    goalWeight,
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
      <pre>{pretty(payload)}</pre>
    </section>
  );
};
