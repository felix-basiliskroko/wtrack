# Docker Deployment

WTrack runs as one production container containing the React build, Fastify server, and production Node dependencies. Runtime state should stay outside the repository.

## Host Directories

Create the bind-mounted directories before starting the container:

```sh
mkdir -p "$HOME/.local/share/wtrack/data"
mkdir -p "$HOME/.local/share/wtrack/backups"
mkdir -p "$HOME/.config/wtrack"
```

On Linux hosts, make sure the container user can write to the data and backup directories. The official Node image runs the app as UID `1000`:

```sh
chown -R 1000:1000 "$HOME/.local/share/wtrack/data" "$HOME/.local/share/wtrack/backups"
```

## Config

Create `$HOME/.config/wtrack/wtrack.env` outside the repo:

```sh
WTRACK_SERVER_TOKEN=replace-with-a-long-random-token
```

The config file is mounted read-only at `/config/wtrack.env`. Environment variables passed directly to Docker or Compose take precedence over values in the config file.

Supported runtime paths:

- `WTRACK_DATA_DIR=/data` stores encrypted SQLite data.
- `WTRACK_BACKUP_DIR=/backups` stores encrypted backup JSON files.
- `WTRACK_CONFIG_FILE=/config/wtrack.env` points to the optional dotenv config file.
- `WTRACK_DB_PATH` can override the SQLite file path if needed.

The vault passphrase is not stored in the config file. Losing the vault passphrase means losing access to encrypted health data.

## Start

Build and start with Compose:

```sh
docker compose up -d --build
```

The container listens on `127.0.0.1:8787` by default:

```sh
curl http://127.0.0.1:8787/api/healthz
```

To use another host port:

```sh
WTRACK_HOST_PORT=8790 docker compose up -d
```

## Reverse Proxy

Run production deployments behind HTTPS and forward requests to:

```text
http://127.0.0.1:8787
```

The app sets secure cookies in production, so browser access should happen through the HTTPS origin served by the reverse proxy.

## Migrating Existing Local Data

If `.wtrack-data` already exists in the repo, stop the app and copy the encrypted SQLite files and backups to the mounted host directories:

```sh
mkdir -p "$HOME/.local/share/wtrack/backups"
find .wtrack-data -maxdepth 1 -name 'wtrack.sqlite*' -exec cp {} "$HOME/.local/share/wtrack/data/" \;
if [ -d .wtrack-data/backups ]; then
  find .wtrack-data/backups -maxdepth 1 -name '*.json' -exec cp {} "$HOME/.local/share/wtrack/backups/" \;
fi
```

After confirming the container reads the migrated data, keep repo-local `.wtrack-data` out of version control and out of future backups.

## Direct Docker Run

Compose is preferred, but the same layout can be run directly:

```sh
docker build -t wtrack:local .
docker run --rm \
  --name wtrack \
  --read-only \
  --tmpfs /tmp \
  --security-opt no-new-privileges:true \
  -p 127.0.0.1:8787:8787 \
  -v "$HOME/.local/share/wtrack/data:/data" \
  -v "$HOME/.local/share/wtrack/backups:/backups" \
  -v "$HOME/.config/wtrack:/config:ro" \
  wtrack:local
```
