# Roster Engine

## Dev Setup

### 1. Clone and configure environment

```bash
cp .env.example .env
# Edit .env — set a strong POSTGRES_PASSWORD
```

### 2. Build the images with your user IDs

```bash
docker compose -f docker-compose.dev.yml build \
  --build-arg USER_ID=$(id -u) \
  --build-arg GROUP_ID=$(id -g)
```

### 3. Start all services

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4. Run database migrations

Once all containers are up and healthy.
 
**Step 1 — Generate the migration file**
 
Inspects your SQLAlchemy models and writes a versioned script to `alembic/versions/`. 
Commit this file to Git.
 
```bash
docker compose -f docker-compose.dev.yml exec backend alembic revision --autogenerate -m "initial schema"
```

**Step 2 — Apply the migration**
 
Runs the generated script against PostgreSQL and creates all 15 tables.
 
```bash
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head
```
 
You only run Step 1 again when your models change. 
Step 2 is run whenever you want to apply pending migrations.

### 5. Open API docs

- Swagger UI: http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc
- Health:      http://localhost:8000/api/health

## Services

| Service       | Port  | Description                        |
|---------------|-------|------------------------------------|
| backend       | 8000  | FastAPI + Uvicorn (auto-reload)    |
| celery_worker | —     | Solver background jobs             |
| postgres      | 5432  | PostgreSQL 16                      |
| redis         | 6379  | Celery broker                      |

## Useful commands

```bash
# View livestream logs for all services
docker compose -f docker-compose.dev.yml logs -f

# View livestream logs for a specific service
docker compose -f docker-compose.dev.yml logs -f backend

# Create a new migration after changing models
docker compose -f docker-compose.dev.yml exec backend alembic revision --autogenerate -m "describe your change"

# Check current migration state
docker compose -f docker-compose.dev.yml exec backend alembic current

# Check migration history
docker compose -f docker-compose.dev.yml exec backend alembic history

# Apply pending migrations
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head

# Roll back one migration
docker compose -f docker-compose.dev.yml exec backend alembic downgrade -1

# Open a psql shell
docker compose -f docker-compose.dev.yml exec postgres psql -U roster -d roster_engine

# Stop all containers
docker compose -f docker-compose.dev.yml down

# Stop and wipe the database volume (destructive — all data lost)
docker compose -f docker-compose.dev.yml down -v
```

## API Route Summary

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/skills/types` | List / create skill types |
| PATCH/DELETE | `/api/skills/types/{id}` | Update / delete skill type |
| POST | `/api/skills/types/{id}/values` | Add skill value |
| DELETE | `/api/skills/types/{id}/values/{vid}` | Remove skill value |
| GET/POST | `/api/shifts/groups` | List / create shift groups |
| PATCH/DELETE | `/api/shifts/groups/{id}` | Update / delete shift group |
| GET/POST | `/api/shifts` | List / create shifts |
| GET/PATCH/DELETE | `/api/shifts/{id}` | Get / update / delete shift |
| GET/POST | `/api/staff/groups` | List / create staff groups |
| PATCH/DELETE | `/api/staff/groups/{id}` | Update / delete staff group |
| GET/POST | `/api/staff` | List / create staff |
| GET/PATCH | `/api/staff/{id}` | Get / update staff |
| POST | `/api/staff/{id}/delete` | Soft-delete staff |
| POST | `/api/staff/{id}/restore` | Restore soft-deleted staff |
| POST/DELETE | `/api/staff/{id}/skills` | Add / remove skill from staff |
| POST/DELETE | `/api/staff/{id}/permitted-shifts` | Add / remove permitted shift |
| GET/POST | `/api/staff/leaves` | List / create leaves |
| PATCH/DELETE | `/api/staff/leaves/{id}` | Update / delete leave |
| GET/POST | `/api/profiles` | List / create profiles |
| GET/PATCH/DELETE | `/api/profiles/{id}` | Get / update / delete profile |
| GET/POST | `/api/profiles/{id}/staff` | List / add staff to profile |
| POST | `/api/profiles/{id}/staff/add-group/{gid}` | Bulk-add staff group to profile |
| PATCH | `/api/profiles/{id}/staff/{sid}` | Toggle excluded flag |
| DELETE | `/api/profiles/{id}/staff/{sid}` | Remove staff from profile |
| GET/POST | `/api/profiles/{id}/shifts` | List / add shifts to profile |
| DELETE | `/api/profiles/{id}/shifts/{sid}` | Remove shift from profile |
| GET/POST | `/api/rosters` | List / create+run roster |
| GET | `/api/rosters/{id}` | Get roster (poll for status) |
| GET | `/api/rosters/{id}/leaves` | Preview leaves applied to roster |
| POST | `/api/rosters/{id}/approve` | Approve a draft roster |
| POST | `/api/rosters/{id}/discard` | Discard a draft/failed roster |
| DELETE | `/api/rosters/{id}` | Hard-delete a roster |
