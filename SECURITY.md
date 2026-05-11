# WTrack Health Data Security Boundary

WTrack is designed as a personal encrypted health vault.

## What the Server Can See

- Session metadata.
- Vault object keys, object roles, object revisions, ciphertext sizes, and update times.
- The encrypted vault metadata needed by the browser to derive and unwrap the vault key.

The server must not receive Apple Health ZIP/XML exports in the end-to-end mode. Raw import uploads are rejected by `/api/import/raw`.

## What the Server Cannot See

- Apple Health records.
- Weight values.
- Sleep stages or sleep durations.
- Step counts, energy burn, workouts, heart rate, HRV, VO2 max, or body composition values.
- The vault passphrase or unwrapped vault key.

## Browser Privacy Boundary

The browser can see decrypted data while the vault is unlocked. The Apple Health export is parsed locally in a Web Worker, normalized into aggregate metrics, encrypted with AES-GCM, and only then sent to the server as ciphertext.

## Operational Requirements

- Run production deployments behind HTTPS.
- Set `WTRACK_SERVER_TOKEN` or `WTRACK_PASSWORD` in production.
- Back up `.wtrack-data/wtrack.sqlite`; it contains ciphertext only, but the vault passphrase is still required to recover data.
- Losing the vault passphrase means losing access to encrypted health data.
