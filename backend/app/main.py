from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.db_init import Base, engine

from app.controllers.public import router as public_router
from app.controllers.admin import router as admin_router

Base.metadata.create_all(bind=engine)

app = FastAPI()

#CORS setup
origins = [o.strip() for o in settings.allowed_origins.split(",")] if settings.allowed_origins != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(public_router)
app.include_router(admin_router)

# servir imagens em /media/...
app.mount("/media", StaticFiles(directory=settings.media_root), name="media")
