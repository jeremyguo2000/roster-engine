from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import skills, shifts, staff, profiles, rosters

app = FastAPI(
    title="Roster Engine API",
    version="1.0.0",
    description="Generic roster scheduling engine backed by CP-SAT solver.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(skills.router,   prefix="/api")
app.include_router(shifts.router,   prefix="/api")
app.include_router(staff.router,    prefix="/api")
app.include_router(profiles.router, prefix="/api")
app.include_router(rosters.router,  prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
