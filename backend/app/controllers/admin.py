import os
import uuid
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..db.db_init import get_db
from ..config import settings
from ..auth import require_admin
from ..db.table_fotos import Fotografia
from ..db.table_pinturas import Pintura

from pydantic import BaseModel


router = APIRouter(prefix="/api/admin", tags=["admin"])

ALLOWED_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def sanitize_category(cat: Optional[str]) -> Optional[str]:
    if cat is None:
        return None
    cat = cat.strip()
    return cat if cat else None

def save_upload_to_disk(file: UploadFile, rel_dir: str) -> str:
    """
    Guarda ficheiro em settings.media_root/rel_dir/<uuid>.<ext>
    Retorna file_path relativo (ex: "media/fotografia/praia/<uuid>.jpg")
    """
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    ext = ALLOWED_MIME[file.content_type]
    file_id = uuid.uuid4()

    abs_dir = os.path.join(settings.media_root, rel_dir)
    ensure_dir(abs_dir)

    rel_path = os.path.join(settings.media_root, rel_dir, f"{file_id}{ext}").replace("\\", "/")
    abs_path = os.path.join(abs_dir, f"{file_id}{ext}")

    with open(abs_path, "wb") as out:
        out.write(file.file.read())

    return rel_path

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
    - category: estruturas/praia/natureza/tema_livre (ou None)
    - col: 1..3
    - col_order: max+1 dentro (category, col)
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

    file_path = save_upload_to_disk(file, rel_dir)

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
    Upload para tabela Pinturas:
    - type: pinturas/mista
    - col_order: max+1 dentro (type, col)
    """
    if col not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="col must be 1,2,3")
    type = type.strip().lower()

    if type not in ("pinturas", "mista"):
        raise HTTPException(status_code=400, detail='type must be "pinturas" or "mista"')

    technique = technique.strip()
    dimensions = dimensions.strip()
    if not technique or not dimensions:
        raise HTTPException(status_code=400, detail="technique and dimensions are required")

    q = (
        db.query(func.max(Pintura.col_order))
        .filter(Pintura.type == type, Pintura.col == col)
    )
    max_order = q.scalar() or 0
    next_order = int(max_order) + 1

    # guardar em media/pinturas/ ou media/pinturas/mista/
    rel_dir = "pinturas" if type == "pinturas" else "pinturas/mista"
    file_path = save_upload_to_disk(file, rel_dir)

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
        {"id":"...", "col":1, "col_order":1, "category":"praia"},
        ...
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

        a = db.query(Fotografia).filter(Fotografia.id == art_id).first()
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
        {"id":"...", "col":2, "col_order":5, "type":"pinturas"},
        ...
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
            raise HTTPException(status_code=400, detail='type must be "pinturas" or "mista"')

        a = db.query(Pintura).filter(Pintura.id == art_id).first()
        if not a:
            continue

        a.col = col
        a.col_order = col_order
        a.type = type_

    db.commit()
    return {"ok": True}


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

    if payload.title is not None:
        foto.title = payload.title
    if payload.year is not None:
        foto.year = payload.year
    if payload.category is not None:
        foto.category = payload.category

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

    if payload.title is not None:
        p.title = payload.title
    if payload.year is not None:
        p.year = payload.year
    if payload.technique is not None:
        p.technique = payload.technique
    if payload.dimensions is not None:
        p.dimensions = payload.dimensions
    if payload.type is not None:
        p.type = payload.type

    db.commit()
    return {"ok": True}



@router.delete("/fotos/{foto_id}")
def delete_foto(
    foto_id: UUID,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    foto = db.query(Fotografia).filter(Fotografia.id == foto_id).first()
    if not foto:
        raise HTTPException(status_code=404, detail="Foto not found")

    # guardar path antes de apagar da BD
    file_path = (foto.file_path or "").replace("\\", "/")

    # apagar registo
    db.delete(foto)
    db.commit()

    # apagar ficheiro do disco (se existir)
    # file_path  "media/fotografia/praia/uuid.jpg"
    abs_path = file_path
    if not os.path.isabs(abs_path):
        # garante que resolve a partir da raiz do backend
        abs_path = os.path.join(os.getcwd(), abs_path)

    try:
        if os.path.exists(abs_path):
            os.remove(abs_path)
    except OSError:
        # não falhar o request se o ficheiro não der para apagar
        pass

    return {"ok": True, "deleted_id": str(foto_id)}


@router.delete("/pinturas/{pintura_id}")
def delete_pintura(
    pintura_id: UUID,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Pintura).filter(Pintura.id == pintura_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pintura not found")

    file_path = (p.file_path or "").replace("\\", "/")

    db.delete(p)
    db.commit()

    abs_path = file_path
    if not os.path.isabs(abs_path):
        abs_path = os.path.join(os.getcwd(), abs_path)

    try:
        if os.path.exists(abs_path):
            os.remove(abs_path)
    except OSError:
        pass

    return {"ok": True, "deleted_id": str(pintura_id)}


