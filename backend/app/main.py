from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from app.config import settings
from app.db.db_init import Base, engine

from app.controllers.public import router as public_router
from app.controllers.admin import router as admin_router

Base.metadata.create_all(bind=engine)

app = FastAPI()

# Gzip compress text/JSON responses (HTML, CSS, JS, API); binary files are skipped automatically.
app.add_middleware(GZipMiddleware, minimum_size=1000)

#CORS setup
origins = [o.strip() for o in settings.allowed_origins.split(",")] if settings.allowed_origins != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_media_cache_headers(request: Request, call_next):
    response = await call_next(request)
    # UUID-named uploads never change, so browsers can cache them indefinitely.
    if request.url.path.startswith("/media/") and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response

app.include_router(public_router)
app.include_router(admin_router)

# servir imagens em /media/...
app.mount("/media", StaticFiles(directory=settings.media_root), name="media")
