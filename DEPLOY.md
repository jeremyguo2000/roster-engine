# Deploying roster-engine with Helm (Kubernetes / HPE PCAI)

The dev setup (`docker-compose.dev.yml`) is unchanged and still works as before.
This document is about producing a **Helm deployment package** — what HPE PCAI
requires — and installing it on a Kubernetes cluster.

What you hand to the PCAI operators is two things:

1. **The chart**: `charts/roster-engine-0.2.0.tgz` (produced by `helm package`)
2. **Two container images** (`roster-backend`, `roster-frontend`), pushed to a
   registry their cluster can pull from

Everything else (Postgres, Redis) is pulled automatically from Docker Hub.

---

## 1. Build the images

From the repo root:

```bash
docker build -f backend/Dockerfile -t roster-backend:0.2.0 .     # note: repo root context
docker build -t roster-frontend:0.2.0 ./frontend
```

The backend image is shared by three containers (API, celery worker, MCP
server) — the chart starts each with a different command, same as compose.

## 2. Push the images to a registry

Ask the PCAI operators which registry to use (PCAI sites typically run Harbor,
or give you credentials for an internal registry). Then:

```bash
REG=harbor.example.com/roster        # whatever they give you

docker tag roster-backend:0.2.0  $REG/roster-backend:0.2.0
docker tag roster-frontend:0.2.0 $REG/roster-frontend:0.2.0
docker push $REG/roster-backend:0.2.0
docker push $REG/roster-frontend:0.2.0
```

## 3. Package the chart

```bash
# helm via docker if helm isn't installed locally:
docker run --rm -v "$PWD/charts:/charts" -w /charts alpine/helm:3.16.2 package roster-engine
```

This produces `charts/roster-engine-0.2.0.tgz` — the "Helm deployment package".

## 4. Install

Three values are **required** (the install aborts with a clear message if any
is missing), plus one optional feature below. Put them in a values file:

```yaml
# my-values.yaml
image:
  registry: harbor.example.com/roster   # where you pushed in step 2
  tag: "0.2.0"

auth:
  secretKey: "<openssl rand -hex 32>"   # JWT signing key — generate once, keep stable across upgrades

postgres:
  password: "<pick a db password>"

mcp:
  servicePassword: "<pick a password for the MCP service account>"
  accessToken: "<openssl rand -hex 32>"   # what MCP clients send as `Authorization: Bearer ...`
```

**Optional — the in-app chat assistant.** Off by default, and it runs against
either of two model providers. Left disabled, `/api/chat` returns 503 and the web
UI hides the widget; nothing else is affected and the app needs no outbound
internet access at all.

**Option A — on-prem model (no data leaves the cluster).** Point it at any
endpoint serving OpenAI's `/v1/chat/completions` with tool calling. On PCAI that's
a model deployed through MLIS/NIM or `vllm/vllm-openai`; the endpoint URL is the
one under *GenAI → Model Endpoints* with `/v1` appended.

```yaml
chat:
  enabled: true
  provider: openai
  baseUrl: "http://<model-endpoint>.<namespace>.svc.cluster.local:8080/v1"
  model: "llama-3.3-70b-instruct"   # must be one validated for tool calling
  apiKey: ""                         # only if the endpoint requires a token
```

Despite the name, `provider: openai` sends nothing to OpenAI — "OpenAI-compatible"
is a wire format that most self-hosted servers implement. Requests go only to
`baseUrl`.

> ⚠️ **Tool calling is required, and it's the weak point.** The assistant is
> driven entirely by tool calls. vLLM needs `--enable-auto-tool-choice` and a
> `--tool-call-parser` matching the model. Smaller models are unreliable at
> `create_roster`, which takes a nested array of demand rows; a 70B-class instruct
> model is a sensible floor. Read-only questions are far less demanding.

**Option B — Claude API (best quality, needs egress).**

```yaml
chat:
  enabled: true
  provider: anthropic
  anthropicApiKey: "<key from console.anthropic.com/settings/keys>"
```

> ⚠️ **Requires egress to `api.anthropic.com`** from the backend pod. This is the
> only part of the app that talks to the internet.
>
> ⚠️ **Data leaves the cluster.** Answering questions about a solved roster sends
> that roster's contents — including staff names — to the Anthropic API. Confirm
> that's acceptable under the deployment's data-governance rules before enabling
> it anywhere holding real staff data. If it isn't, use Option A.

```bash
helm install roster charts/roster-engine-0.2.0.tgz -n roster --create-namespace -f my-values.yaml
kubectl -n roster get pods -w     # wait until everything is Running/Ready
```

Notes on first startup:
- The backend pod runs `alembic upgrade head` (DB migrations) before serving.
  It may restart a couple of times while Postgres initializes — that's normal
  and self-heals.
- Database data lives in a PersistentVolumeClaim (`5Gi` by default,
  `postgres.persistence.size`). It survives upgrades and uninstall; delete the
  PVC explicitly to wipe data.

## 5. First-install bootstrap (create the users)

The API rejects everything without a login, so the first users are created via
CLI inside the backend pod:

```bash
# your admin login for the web UI
kubectl -n roster exec deploy/roster-roster-engine-backend -- \
  python -m app.scripts.create_user admin '<admin password>'

# service account for the MCP server — username/password MUST match
# mcp.serviceUsername / mcp.servicePassword from your values file
kubectl -n roster exec deploy/roster-roster-engine-backend -- \
  python -m app.scripts.create_user svc-mcp '<the mcp.servicePassword value>'
```

(If your release name differs, `kubectl -n roster get deploy` shows the exact
names. `helm install` also prints these commands with the right names filled in.)

## 6. Access the app

The frontend pod is the single entry point: its nginx serves the UI and
proxies `/api`, `/documentation` and `/mcp` to the right internal services. So
only ONE thing ever needs to be exposed.

**Quick test / no ingress:**
```bash
kubectl -n roster port-forward svc/roster-roster-engine-frontend 8080:80
# browse http://localhost:8080  — log in with the admin user from step 5
```

**Standard cluster with an ingress controller:** set in your values file:
```yaml
ingress:
  enabled: true
  host: roster.your-domain.com
```

**HPE PCAI:** see next section.

MCP clients connect to `<same base url>/mcp` (Streamable HTTP) and must send
the header `Authorization: Bearer <mcp.accessToken>`; see MCP-guide.md for the
per-client registration syntax.

## 7. HPE PCAI import

PCAI's **Import Framework** flow (AI Essentials → Tools & Frameworks → Import)
takes the chart `.tgz`, a name/logo, and a namespace. Two PCAI specifics are
already built into the chart:

```yaml
ezua:
  enabled: true            # publishes the app through PCAI's Istio gateway
  virtualService:
    endpoint: "roster.${DOMAIN_NAME}"          # ${DOMAIN_NAME} is filled in by PCAI
    istioGateway: "istio-system/ezaf-gateway"
```

Enable that (plus the required values from step 4) in the values screen of the
import wizard. The app then appears at `https://roster.<their-domain>/`.

If their registry needs credentials, create the pull secret in the target
namespace and set `image.pullSecrets: [{ name: <secret-name> }]`.

## 8. Upgrades and uninstall

```bash
# after building/pushing new images with a new tag:
helm upgrade roster charts/roster-engine-<new>.tgz -n roster -f my-values.yaml --set image.tag=<new>

helm uninstall roster -n roster          # keeps the database PVC
kubectl -n roster delete pvc -l app.kubernetes.io/instance=roster   # wipes data
```

Keep `auth.secretKey` and `postgres.password` the same across upgrades —
changing the first logs everyone out, changing the second locks the app out of
its own database.

## 9. Rehearsing locally with kind (recommended before doing it for real)

[kind](https://kind.sigs.k8s.io) runs a throwaway Kubernetes cluster inside
Docker on this machine — the whole flow below was verified working on
2026-07-07. It needs `kind`, `kubectl` and `helm` (single-file binaries in
`~/.local/bin`; already installed on the dev VM).

```bash
# 1. cluster + images (no registry needed locally — images are copied in)
kind create cluster --name roster
kind load docker-image roster-backend:0.2.0 roster-frontend:0.2.0 --name roster

# 2. install (steps 4–5 of this doc, condensed)
helm install roster charts/roster-engine -n roster --create-namespace \
  --set auth.secretKey=$(openssl rand -hex 32) \
  --set postgres.password=localtest \
  --set mcp.servicePassword=mcptest \
  --set mcp.accessToken=mcptest-token
kubectl -n roster get pods -w        # wait for 6/6 Running & Ready (backend restarts a few times — normal)

kubectl -n roster exec deploy/roster-roster-engine-backend -- python -m app.scripts.create_user admin admin123
kubectl -n roster exec deploy/roster-roster-engine-backend -- python -m app.scripts.create_user svc-mcp mcptest

# 3. use it — NOTE: the dev compose stack occupies ports 8000/5173, so use 18xxx
kubectl -n roster port-forward svc/roster-roster-engine-frontend 18080:80
# browse http://localhost:18080 and log in as admin/admin123

# 4. throw it away (leaves no trace; dev compose is unaffected throughout)
kind delete cluster --name roster
```

Optional full test with demo data: port-forward the backend
(`kubectl -n roster port-forward svc/roster-roster-engine-backend 18000:8000`),
point `scripts/seed_demo_ward.py`'s `API` URL at port 18000, run it, then
create a roster in the UI. Two things to know when test-driving a solve:

- A roster with **no demands selected always fails as infeasible** — staff are
  only rostered on days with demands, and target hours are exact ("Gotcha 1"
  in the operator manual). Create demands for each day first.
- While the solver runs it saturates the CPU and `kubectl port-forward`
  tunnels tend to drop — just reconnect, or watch progress in the worker logs:
  `kubectl -n roster logs -f deploy/roster-roster-engine-worker`.

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Pod `ImagePullBackOff` | Registry/tag wrong in values, or missing `image.pullSecrets` |
| `postgres` pod `Pending` forever | No default StorageClass — set `postgres.persistence.storageClassName` |
| Backend restarts a few times then settles | Normal: waiting for Postgres on first boot |
| Backend `CrashLoopBackOff` persistently | `kubectl logs` it — usually a bad `DATABASE_URL`/password |
| MCP client gets 401 from `/mcp` itself | Client isn't sending `Authorization: Bearer <mcp.accessToken>` |
| Login fails with 401 for MCP tools | `svc-mcp` user not created, or password ≠ `mcp.servicePassword` |
| Solves stuck in `running` | Worker pod down or can't reach Redis — check `kubectl logs deploy/...-worker` |
| UI loads but API calls fail | Backend not Ready — check `/api/health` via `kubectl port-forward svc/...-backend 8000:8000` |
| Chat widget never appears | `chat.enabled` is false, or no key — the UI hides it when `GET /api/chat/status` reports `enabled: false` |
| Chat replies "assistant failed to respond" | `kubectl logs deploy/...-backend` shows the cause. `provider: anthropic` — blocked egress to `api.anthropic.com`, or a bad key. `provider: openai` — wrong `baseUrl`, or the endpoint returned non-200 (the log quotes its body) |
| Chat answers but never uses live data | The model isn't emitting tool calls. Check the endpoint runs with tool calling enabled (`--enable-auto-tool-choice` + a matching `--tool-call-parser` on vLLM) and that the model supports it |
| Which provider is live? | `GET /api/chat/status` returns `{"enabled": ..., "provider": ...}` |
