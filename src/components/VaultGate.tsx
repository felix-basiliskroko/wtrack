import { useState } from 'react';

type VaultGateProps = {
  mode: 'checking' | 'unauthenticated' | 'setup' | 'locked';
  busy: boolean;
  error: string | null;
  onLogin: (token: string) => void;
  onSetup: (passphrase: string) => void;
  onUnlock: (passphrase: string) => void;
};

export const VaultGate = ({ mode, busy, error, onLogin, onSetup, onUnlock }: VaultGateProps) => {
  const [token, setToken] = useState('');
  const [passphrase, setPassphrase] = useState('');

  if (mode === 'checking') {
    return (
      <main className="gate-shell">
        <section className="panel-card vault-gate">
          <p className="eyebrow">Encrypted vault</p>
          <h2>Checking the server</h2>
          <p className="muted">WTrack is looking for the personal vault API before loading health data.</p>
        </section>
      </main>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'unauthenticated') onLogin(token);
    if (mode === 'setup') onSetup(passphrase);
    if (mode === 'locked') onUnlock(passphrase);
  };

  const copy =
    mode === 'unauthenticated'
      ? {
          eyebrow: 'Server access',
          title: 'Authenticate this browser',
          body: 'Enter the personal WTrack server token. In local development without an env token, use wtrack-local-dev.',
          label: 'Server token',
          type: 'password',
          value: token,
          setValue: setToken,
          button: 'Open vault server',
        }
      : mode === 'setup'
        ? {
            eyebrow: 'First encrypted setup',
            title: 'Create your vault passphrase',
            body: 'This passphrase wraps the browser-only vault key. Losing it means losing access to encrypted health data.',
            label: 'New vault passphrase',
            type: 'password',
            value: passphrase,
            setValue: setPassphrase,
            button: 'Create encrypted vault',
          }
        : {
            eyebrow: 'Vault locked',
            title: 'Unlock health data locally',
            body: 'The server stores ciphertext only. Decryption happens in this browser session.',
            label: 'Vault passphrase',
            type: 'password',
            value: passphrase,
            setValue: setPassphrase,
            button: 'Unlock vault',
          };

  return (
    <main className="gate-shell">
      <section className="panel-card vault-gate">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <p className="muted">{copy.body}</p>
        <form className="entry-form" onSubmit={submit}>
          <label>
            {copy.label}
            <input
              type={copy.type}
              value={copy.value}
              onChange={(event) => copy.setValue(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={busy || !copy.value.trim()}>
            {busy ? 'Working...' : copy.button}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
};
