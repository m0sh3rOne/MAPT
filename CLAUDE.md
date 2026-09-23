# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MAPT is a fleet management / software deployment platform for Windows endpoints, built on a **pull model**: the Go agent polls the FastAPI backend over HTTP(S); the server never initiates a connection to a client (the one exception is Wake-on-LAN magic packets, sent as UDP broadcasts).

Three deployable components: `backend/` (FastAPI + PostgreSQL + Redis + MinIO), `frontend/` (React 18 / Vite / Tailwind), `agent/` (Go, Windows service). All user-facing strings, log messages and code comments are in **French** — keep it that way.

## Commands

### Backend + infra (dev, runs under WSL2 Ubuntu)

```bash
./scripts/start-all.sh
```

Starts PostgreSQL, Redis, MinIO, uvicorn on **port 8088**, and the worker. Logs go to `/tmp/mapt_backend.log` and `/tmp/mapt_worker.log`. First-time setup is `./scripts/setup-wsl-environment.sh`.

From PowerShell: `wsl -d Ubuntu -u UBUNTU bash -c "/mnt/c/Users/Admin/Documents/Github/MAPT/scripts/start-all.sh"`

Run backend pieces manually (from `backend/`, with `venv` activated):

```bash
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8088
python3 -m app.workers.deployment_worker
```

### Frontend

```bash
cd frontend && npm run dev
```

Vite on port 5173, proxies `/api` to `http://localhost:8088`. `npm run build` runs `tsc && vite build` — TypeScript errors fail the build. There is no lint step.

### Agent (cross-compiled from WSL, run on Windows)

```bash
cd agent && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o mapt-agent.exe ./cmd/agent
```

Run it: `scripts\run-agent-windows.bat` (self-elevates, rebuilds if needed) or `.\mapt-agent.exe -server "http://localhost:8088/api/v1"`. Service mode: `-service install|uninstall|start|stop|restart|status`.

### Tests

There is no unit test suite. The only automated check is an end-to-end script that hits a running backend on 8088 (auth, fleet, inventory, script, deployment, completion):

```bash
wsl -d Ubuntu -u UBUNTU bash -c "python3 /mnt/c/Users/Admin/Documents/Github/MAPT/scripts/test_flow.py"
```

### Production / Docker

`sudo ./scripts/install-server-production.sh` (interactive: prompts for admin credentials and enrollment token, generates the JWT secret, writes `infrastructure/.env` at 0600, cross-compiles the agent, then brings up the 6 containers). Manual: `docker compose -f infrastructure/docker-compose.yml up -d --build`.

### Ports

| Context | Backend | Web UI |
|---|---|---|
| WSL dev | 8088 | 5173 (Vite) |
| Docker | 8000 | 80 (nginx, proxies `/api/` to `backend:8000`) |

Swagger: `<backend>/api/v1/docs`. MinIO console: `:9001` (`minioadmin`/`minioadmin`). Default login: `admin` / `Admin123!`.

## Architecture

### Backend layering

`api/` (routers, auth dependency, HTTP errors) → `services/` (business logic, state machine, audit writes, Pydantic mapping) → `repositories/` (all SQLAlchemy queries) → `models/`. Routers hold no business logic; services never build raw queries.

Routes are mounted in `app/api/router.py` under `/api/v1` in three families:

- `/auth/*` — JWT login, `/auth/me`, enrollment-token lookup.
- `/admin/*` — devices, groups, packages, scripts, deployments, audit. Guarded by `get_current_user` / `require_roles` (`app/api/deps.py`); roles are `super_admin`, `administrator`, `operator`, `viewer` with `WRITE_ROLES` / `ADMIN_ROLES` groupings in `app/core/security.py`.
- `/agent/*` — enroll, heartbeat, jobs, inventory, package download. Guarded by `get_current_agent`, a **completely separate** Bearer scheme: the token is an opaque `mapt_ag_<random>` string stored on `devices.agent_token`, not a JWT. Never mix the two dependencies.

### Deployment state machine

A `Deployment` (the intent, with schedule and target config) fans out into one `DeploymentTarget` per device. Target statuses live in `app/models/deployment.py`: `PENDING → OFFERED → ACKED → RUNNING → SUCCEEDED | FAILED | TIMED_OUT | CANCELLED`.

Ownership of transitions is split:

- **Admin API** creates targets at `PENDING` (`DeploymentService.create_deployment` / `trigger_scheduled_run`), and handles cancel/retry (retry resets a terminal target back to `PENDING`).
- **Agent polling** drives the middle: `GET /agent/jobs` flips `PENDING`/`OFFERED` to `OFFERED` and returns the payload; then the agent calls `ack` (→ `ACKED`), `progress` (→ `RUNNING`), `complete`/`fail` (→ terminal). See `AgentService` and `executeSingleJob` in [runner.go](agent/internal/service/runner.go).
- **Worker** ([deployment_worker.py](backend/app/workers/deployment_worker.py), a plain 10s `asyncio` loop — arq is in requirements but unused) forces stuck `RUNNING` targets to `TIMED_OUT` after 10 min and fires due scheduled/recurring deployments.

Deployment-level `status` is partly derived: `_map_to_response` reports `COMPLETED` when all targets are terminal, without persisting it.

### Job dispatch contract

`deployment_type` on the backend becomes `type` in the agent's `JobPayload`, switched on in [executor.go](agent/internal/jobs/executor.go). Accepted values must stay in sync across three places: the validation list in `DeploymentService.create_deployment`, the payload builder in `AgentService.get_jobs_for_agent`, and the Go switch (`powershell`/`script`/`ps1`, `vbscript`/`vbs`, `python`/`py`, `cmd`/`batch`/`bat`, `command`, `package`). Adding a type means editing all three.

### Package flow

Upload → SHA-256 computed server-side → object stored in MinIO (`mapt-packages` bucket) with metadata in `package_versions`. The agent receives `storage_key` + `sha256`, downloads via `/agent/packages/download/{storage_key}` with its agent token, verifies the hash, reuses an already-correct local file, and executes. Package versions are immutable; so are script versions (each edit creates a new row).

`expandWindowsEnv` in [package.go](agent/internal/jobs/package.go) forcibly rewrites any `%APPDATA%`-based destination to `%ProgramData%\MAPT\packages` — under the SYSTEM service account `%APPDATA%` resolves into `systemprofile` and locks. It also `taskkill`s a same-named `.exe` before downloading, to release file locks.

### Interactive (on-desktop) execution

`is_interactive` on a package version makes the agent run the installer in the logged-in user's desktop session instead of Session 0: [interactive_windows.go](agent/internal/jobs/interactive_windows.go) uses `WTSGetActiveConsoleSessionId` / `WTSQueryUserToken` / `CreateProcessAsUserW` via `golang.org/x/sys/windows`. That file is `//go:build windows`; `interactive_other.go` is the stub. Keep any new Win32 work behind the same build-tag pair so the package still compiles on Linux.

Interactive mode is deliberately **fire-and-forget**: the job is reported `SUCCEEDED` as soon as the process is created, because the end user drives the wizard manually afterwards. Never add a `WaitForSingleObject` there — waiting blocks the agent's single-threaded job poll loop and pins the deployment at `RUNNING` for the whole manual install. Two paths exist: when the agent already runs inside the target interactive session (elevated console, dev mode) it launches directly, since duplicating a session token requires `SE_TCB_NAME` which only SYSTEM holds; when it runs as a service in Session 0 it goes through the token path. A session with no logged-in user is rejected up front rather than launching onto an invisible desktop.

### Agent internals

[runner.go](agent/internal/service/runner.go) is the whole lifecycle: enroll (retry loop every 5s — never exit the service on enrollment failure), then **three independent goroutines/tickers** — heartbeat (30s), inventory (1h), job polling (30s). Heartbeat must never be blocked by a long install; keep it off the job path. Config persists to `mapt-agent-config.json` next to the executable (0600), holding server URL, enrollment token, device UUID and the received agent token.

Inventory is collected by shelling out to PowerShell `Get-CimInstance` and parsing JSON ([collector.go](agent/internal/inventory/collector.go)). Windows returns OEM-encoded French text, so the backend runs everything through [sanitizer.py](backend/app/core/sanitizer.py) (`sanitize_data` / `sanitize_string`) before persisting — new inventory fields need to go through it too.

### Agent distribution

The backend serves `mapt-agent.exe` from `GET /api/v1/agent/download/windows`, probing a hardcoded path list in [enroll.py](backend/app/api/agent/enroll.py) (in Docker the repo's `agent/` directory is bind-mounted read-only at `/agent`). The same module generates the `install.ps1` / `install.bat` bootstrap scripts, exposed both under `/api/v1/agent/` and at root `/scripts/*` (see [main.py](backend/app/main.py) and [nginx.conf](frontend/nginx.conf)). Those scripts are Python f-strings — literal braces must be doubled.

### Frontend

Single axios instance in [api.ts](frontend/src/services/api.ts) with all endpoints as named methods; a request interceptor injects the JWT from `localStorage['mapt_token']` and a response interceptor redirects to `/login` on 401. Auth state lives in [AuthContext.tsx](frontend/src/context/AuthContext.tsx). Pages are feature folders under `src/pages/`; shared types in `src/types/index.ts` mirror the backend Pydantic schemas.

## Conventions and known traps

- **No migrations.** Tables are created by `Base.metadata.create_all` at startup (lifespan in `app/main.py`), which never alters existing tables. Adding a column to a model requires manual DDL (or dropping the table) on any database that already exists. The lifespan also seeds the initial super-admin when the `users` table is empty.
- **Async SQLAlchemy / MissingGreenlet.** Any relation read during Pydantic mapping must be eager-loaded with `.options(selectinload(...))` in the repository. In `_map_to_response` helpers, guard reads that might lazy-load: `if "members" in group.__dict__ and group.members is not None:`.
- **Immediate one-shot deployments must have `next_run_at = None`**, otherwise the worker re-fires the same targets. Only recurring deployments carry a future `next_run_at`.
- **Never hardcode silent-install switches for `.exe` packages** (`/S`, `/silent`, `/quiet`, `/qn`, `/VERYSILENT`). Third-party installers all differ; the arguments field stays admin-controlled end to end. MSI is the exception — `msiexec` flags are well-defined.
- **Script interpreters** are invoked non-interactively and with a timeout + context cancellation, capturing stdout and stderr together: PowerShell `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File`, VBScript `cscript.exe //NoLogo`, batch `cmd.exe /c`, Python `python`.
- The enrollment token is a shared secret; `AgentService.enroll_agent` accepts the configured `DEFAULT_ENROLLMENT_TOKEN` plus two legacy literals. Re-enrolling an existing `device_uuid` rotates its agent token and un-archives the device.
- Mutating admin actions write an `AuditLog` row via `AuditRepository` — follow that pattern for new ones.
- The repo root accumulates stray built agent binaries (`*_agent.exe`); `.gitignore` covers `*.exe`, don't commit them.

## Further docs

[README.md](README.md) (setup paths), [GUIDE_DEPLOIEMENT_AGENT.md](GUIDE_DEPLOIEMENT_AGENT.md) (agent rollout via GPO/FOG/PowerShell), [GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md](GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md) (production VM), [GUIDE_UTILISATION_PACKAGES_SNAPINS.md](GUIDE_UTILISATION_PACKAGES_SNAPINS.md) (package/snapin authoring), [documentation_architecture_plateforme_deploiement.md](documentation_architecture_plateforme_deploiement.md) (full spec), [.agents/rules/mapt_development_rules.md](.agents/rules/mapt_development_rules.md) (the always-on rules summarized above).
