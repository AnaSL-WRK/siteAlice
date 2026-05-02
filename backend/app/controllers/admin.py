import os
import uuid
from uuid import UUID
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.db_init import get_db
from app.config import settings
from app.auth import require_admin
from app.db.table_fotos import Fotografia
from app.db.table_pinturas import Pintura
from app.db.table_videos import Video

from pydantic import BaseModel


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/me")
def admin_me(user: dict = Depends(require_admin)):
    return user


ALLOWED_IMAGE_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

ALLOWED_VIDEO_MIME = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
    "video/m4v": ".m4v",
}


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def sanitize_category(cat: Optional[str]) -> Optional[str]:
    if cat is None:
        return None

    cat = cat.strip()
    return cat if cat else None


def was_provided(payload: BaseModel, field_name: str) -> bool:
    """
    Works with Pydantic v2 and v1.
    Allows PATCH fields to be explicitly cleared with null.
    """
    if hasattr(payload, "model_fields_set"):
        return field_name in payload.model_fields_set

    return field_name in getattr(payload, "__fields_set__", set())


def save_upload_to_disk(file: UploadFile, rel_dir: str, media_root: str, allowed: dict[str, str]) -> str:
    """
    Guarda em: <media_root>/<rel_dir>/<uuid>.<ext>
    Retorna file_path para BD: "media/<rel_dir>/<uuid>.<ext>"
    """

    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    ext = allowed[file.content_type]
    file_id = uuid.uuid4()

    abs_dir = os.path.join(media_root, rel_dir)
    ensure_dir(abs_dir)

    filename = f"{file_id}{ext}"
    abs_path = os.path.join(abs_dir, filename)

    with open(abs_path, "wb") as out:
        out.write(file.file.read())

    return f"media/{rel_dir}/{filename}".replace("\\", "/")



def delete_file_if_exists(file_path: str) -> None:
    file_path = (file_path or "").replace("\\", "/")
    if not file_path:
        return

    abs_path = file_path

    if not os.path.isabs(abs_path):
        abs_path = os.path.join(os.getcwd(), abs_path)

    try:
        if os.path.exists(abs_path):
            os.remove(abs_path)
    except OSError:
        pass


# ------------------------------------------------------------
# Uploads
# ------------------------------------------------------------

@router.post("/upload/foto")
def upload_foto(
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),

    category: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    col: int = Form(1),

    file: UploadFile = File(...),
):
    """
    Upload para tabela fotografia:
    - category: estruturas/praia/natureza/tema_livre ou None
    - col: 1..3
    - col_order: max+1 dentro de category + col
    """
    if col not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="col must be 1,2,3")

    category = sanitize_category(category)

    q = db.query(func.max(Fotografia.col_order)).filter(Fotografia.col == col)

    if category is None:
        q = q.filter(Fotografia.category.is_(None))
        rel_dir = "fotografia/_"
    else:
        q = q.filter(Fotografia.category == category)
        rel_dir = f"fotografia/{category}"

    max_order = q.scalar() or 0
    next_order = int(max_order) + 1

    file_path = save_upload_to_disk(
        file=file,
        rel_dir=rel_dir,
        media_root=settings.media_root,
        allowed_mime=ALLOWED_IMAGE_MIME,
    )

    foto = Fotografia(
        category=category,
        title=title.strip() if title else None,
        year=year,
        col=col,
        col_order=next_order,
        file_path=file_path,
    )

    db.add(foto)
    db.commit()
    db.refresh(foto)

    return {
        "id": str(foto.id),
        "category": foto.category,
        "title": foto.title,
        "year": foto.year,
        "col": int(foto.col),
        "col_order": int(foto.col_order),
        "url": "/" + foto.file_path,
    }


@router.post("/upload/pintura")
def upload_pintura(
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),

    type: str = Form(...),  # "pinturas" ou "mista"
    title: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    technique: str = Form(...),
    dimensions: str = Form(...),
    col: int = Form(1),

    file: UploadFile = File(...),
):
    """
    Upload para tabela pinturas:
    - type: pinturas/mista
    - col_order: max+1 dentro de type + col
    """
    if col not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="col must be 1,2,3")

    type = type.strip().lower()

    if type not in ("pinturas", "mista"):
        raise HTTPException(
            status_code=400,
            detail='type must be "pinturas" or "mista"',
        )

    technique = technique.strip()
    dimensions = dimensions.strip()

    if not technique or not dimensions:
        raise HTTPException(
            status_code=400,
            detail="technique and dimensions are required",
        )

    q = (
        db.query(func.max(Pintura.col_order))
        .filter(Pintura.type == type, Pintura.col == col)
    )

    max_order = q.scalar() or 0
    next_order = int(max_order) + 1

    rel_dir = "pinturas" if type == "pinturas" else "pinturas/mista"

    file_path = save_upload_to_disk(
        file=file,
        rel_dir=rel_dir,
        media_root=settings.media_root,
        allowed_mime=ALLOWED_IMAGE_MIME,
    )

    p = Pintura(
        type=type,
        title=title.strip() if title else None,
        year=year,
        technique=technique,
        dimensions=dimensions,
        col=col,
        col_order=next_order,
        file_path=file_path,
    )

    db.add(p)
    db.commit()
    db.refresh(p)

    return {
        "id": str(p.id),
        "type": p.type,
        "title": p.title,
        "year": p.year,
        "technique": p.technique,
        "dimensions": p.dimensions,
        "col": int(p.col),
        "col_order": int(p.col_order),
        "url": "/" + p.file_path,
    }

@router.post("/upload/video")
def upload_video(
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),

    title: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    col: int = Form(1),
    thumbnail_time: Optional[float] = Form(None),

    file: UploadFile = File(...),
    thumbnail: UploadFile = File(...),
):
    if col not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="col must be 1,2,3")

    q = db.query(func.max(Video.col_order)).filter(Video.col == col)
    max_order = q.scalar() or 0
    next_order = int(max_order) + 1

    video_path = save_upload_to_disk(
        file,
        "videos",
        settings.media_root,
        ALLOWED_VIDEO_MIME,
    )

    thumbnail_path = save_upload_to_disk(
        thumbnail,
        "videos/thumbnails",
        settings.media_root,
        ALLOWED_IMAGE_MIME,
    )

    video = Video(
        title=title.strip() if title else None,
        year=year,
        col=col,
        col_order=next_order,
        file_path=video_path,
        thumbnail_path=thumbnail_path,
        thumbnail_time=thumbnail_time,
    )

    db.add(video)
    db.commit()
    db.refresh(video)

    return {
        "id": str(video.id),
        "title": video.title,
        "year": video.year,
        "col": int(video.col),
        "col_order": int(video.col_order),
        "url": "/" + video.file_path,
        "thumbnail_url": "/" + video.thumbnail_path,
        "thumbnail_time": video.thumbnail_time,
    }

# ------------------------------------------------------------
# Reorder
# ------------------------------------------------------------

@router.post("/reorder/fotos")
def reorder_fotos(
    payload: dict,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    payload:
    {
      "items": [
        {"id":"...", "col":1, "col_order":1, "category":"praia"}
      ]
    }
    """
    items = payload.get("items")

    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")

    for it in items:
        art_id = it.get("id")
        col = it.get("col")
        col_order = it.get("col_order")
        category = sanitize_category(it.get("category"))

        if not art_id or col not in (1, 2, 3) or not isinstance(col_order, int):
            raise HTTPException(status_code=400, detail="bad item")

        try:
            art_uuid = UUID(str(art_id))
        except Exception:
            continue

        a = db.query(Fotografia).filter(Fotografia.id == art_uuid).first()
        if not a:
            continue

        a.col = col
        a.col_order = col_order
        a.category = category

    db.commit()
    return {"ok": True}


@router.post("/reorder/pinturas")
def reorder_pinturas(
    payload: dict,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    payload:
    {
      "items": [
        {"id":"...", "col":2, "col_order":5, "type":"pinturas"}
      ]
    }
    """
    items = payload.get("items")

    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")

    for it in items:
        art_id = it.get("id")
        col = it.get("col")
        col_order = it.get("col_order")
        type_ = (it.get("type") or "").strip().lower()

        if not art_id or col not in (1, 2, 3) or not isinstance(col_order, int):
            raise HTTPException(status_code=400, detail="bad item")

        if type_ not in ("pinturas", "mista"):
            raise HTTPException(
                status_code=400,
                detail='type must be "pinturas" or "mista"',
            )

        try:
            art_uuid = UUID(str(art_id))
        except Exception:
            continue

        a = db.query(Pintura).filter(Pintura.id == art_uuid).first()
        if not a:
            continue

        a.col = col
        a.col_order = col_order
        a.type = type_

    db.commit()
    return {"ok": True}


@router.post("/reorder/videos")
def reorder_videos(
    payload: dict,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    payload:
    {
      "items": [
        {"id":"...", "col":1, "col_order":1}
      ]
    }
    """
    items = payload.get("items")

    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")

    for it in items:
        video_id = it.get("id")
        col = it.get("col")
        col_order = it.get("col_order")

        if not video_id or col not in (1, 2, 3) or not isinstance(col_order, int):
            raise HTTPException(status_code=400, detail="bad item")

        try:
            video_uuid = UUID(str(video_id))
        except Exception:
            continue

        v = db.query(Video).filter(Video.id == video_uuid).first()
        if not v:
            continue

        v.col = col
        v.col_order = col_order

    db.commit()
    return {"ok": True}


# ------------------------------------------------------------
# Updates
# ------------------------------------------------------------

class FotoUpdate(BaseModel):
    title: Optional[str] = None
    year: Optional[int] = None
    category: Optional[str] = None


@router.patch("/fotos/{foto_id}")
def update_foto(
    foto_id: UUID,
    payload: FotoUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    foto = db.query(Fotografia).filter(Fotografia.id == foto_id).first()

    if not foto:
        raise HTTPException(status_code=404, detail="Foto not found")

    if was_provided(payload, "title"):
        foto.title = payload.title.strip() if payload.title else None

    if was_provided(payload, "year"):
        foto.year = payload.year

    if was_provided(payload, "category"):
        foto.category = sanitize_category(payload.category)

    db.commit()
    return {"ok": True}


class PinturaUpdate(BaseModel):
    title: Optional[str] = None
    year: Optional[int] = None
    technique: Optional[str] = None
    dimensions: Optional[str] = None
    type: Optional[str] = None  # "pinturas" | "mista"


@router.patch("/pinturas/{pintura_id}")
def update_pintura(
    pintura_id: UUID,
    payload: PinturaUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Pintura).filter(Pintura.id == pintura_id).first()

    if not p:
        raise HTTPException(status_code=404, detail="Pintura not found")

    if was_provided(payload, "title"):
        p.title = payload.title.strip() if payload.title else None

    if was_provided(payload, "year"):
        p.year = payload.year

    if was_provided(payload, "technique"):
        p.technique = payload.technique.strip() if payload.technique else ""

    if was_provided(payload, "dimensions"):
        p.dimensions = payload.dimensions.strip() if payload.dimensions else ""

    if was_provided(payload, "type"):
        type_ = (payload.type or "").strip().lower()

        if type_ and type_ not in ("pinturas", "mista"):
            raise HTTPException(
                status_code=400,
                detail='type must be "pinturas" or "mista"',
            )

        p.type = type_ or None

    db.commit()
    return {"ok": True}


class VideoUpdate(BaseModel):
    title: Optional[str] = None
    published_date: Optional[date] = None


@router.patch("/videos/{video_id}")
def update_video(
    video_id: UUID,
    payload: VideoUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    v = db.query(Video).filter(Video.id == video_id).first()

    if not v:
        raise HTTPException(status_code=404, detail="Video not found")

    if was_provided(payload, "title"):
        v.title = payload.title.strip() if payload.title else None

    if was_provided(payload, "published_date"):
        v.published_date = payload.published_date

    db.commit()
    return {"ok": True}


@router.post("/videos/{video_id}/thumbnail")
def update_video_thumbnail(
    video_id: UUID,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
    thumbnail_time: Optional[float] = Form(None),
    thumbnail: UploadFile = File(...),
):
    v = db.query(Video).filter(Video.id == video_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")

    old_thumbnail_path = v.thumbnail_path

    new_thumbnail_path = save_upload_to_disk(
        thumbnail,
        "videos/thumbnails",
        settings.media_root,
        ALLOWED_IMAGE_MIME,
    )

    v.thumbnail_path = new_thumbnail_path
    v.thumbnail_time = thumbnail_time

    db.commit()

    if old_thumbnail_path:
        delete_file_if_exists(old_thumbnail_path)

    return {
        "ok": True,
        "id": str(v.id),
        "thumbnail_url": "/" + v.thumbnail_path,
        "thumbnail_time": v.thumbnail_time,
    }

# ------------------------------------------------------------
# Deletes
# ------------------------------------------------------------

@router.delete("/fotos/{foto_id}")
def delete_foto(
    foto_id: UUID,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    foto = db.query(Fotografia).filter(Fotografia.id == foto_id).first()

    if not foto:
        raise HTTPException(status_code=404, detail="Foto not found")

    file_path = foto.file_path

    db.delete(foto)
    db.commit()

    delete_file_if_exists(file_path)

    return {
        "ok": True,
        "deleted_id": str(foto_id),
    }


@router.delete("/pinturas/{pintura_id}")
def delete_pintura(
    pintura_id: UUID,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Pintura).filter(Pintura.id == pintura_id).first()

    if not p:
        raise HTTPException(status_code=404, detail="Pintura not found")

    file_path = p.file_path

    db.delete(p)
    db.commit()

    delete_file_if_exists(file_path)

    return {
        "ok": True,
        "deleted_id": str(pintura_id),
    }


@router.delete("/videos/{video_id}")
def delete_video(
    video_id: UUID,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    v = db.query(Video).filter(Video.id == video_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")

    file_path = v.file_path
    thumbnail_path = getattr(v, "thumbnail_path", None)

    db.delete(v)
    db.commit()

    delete_file_if_exists(file_path)
    delete_file_if_exists(thumbnail_path)

    return {
        "ok": True,
        "deleted_id": str(video_id),
    }