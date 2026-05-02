from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.db_init import get_db
from app.db.table_fotos import Fotografia
from app.db.table_pinturas import Pintura
from app.db.table_videos import Video

router = APIRouter(prefix="/api", tags=["public"])

@router.get("/fotos")
def list_fotos(
    category: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Fotografia)
    if category is not None:
        q = q.filter(Fotografia.category == category)

    items = q.order_by(Fotografia.col.asc(), Fotografia.col_order.asc()).all()
    
    return [
        {
            "id": str(a.id),
            "category": a.category,
            "title": a.title,
            "year": a.year,
            "col": int(a.col),
            "col_order": int(a.col_order),
            "url": "/" + a.file_path.replace("\\", "/"),
        }
        for a in items
    ]

@router.get("/pinturas")
def list_pinturas(
    type: str = Query(...),
    db: Session = Depends(get_db),
):
    items = (
        db.query(Pintura)
        .filter(Pintura.type == type)
        .order_by(Pintura.col.asc(), Pintura.col_order.asc())
        .all()
    )
    return [
        {
            "id": str(a.id),
            "type": a.type,
            "title": a.title,
            "year": a.year,
            "technique": a.technique,
            "dimensions": a.dimensions,
            "col": int(a.col),
            "col_order": int(a.col_order),
            "url": "/" + a.file_path.replace("\\", "/"),
        }
        for a in items
    ]

@router.get("/videos")
def list_videos(
    db: Session = Depends(get_db),
):
    items = (
        db.query(Video)
        .order_by(Video.col.asc(), Video.col_order.asc())
        .all()
    )

    return [
    {
        "id": str(v.id),
        "media_type": "video",
        "title": v.title,
        "year": v.year,
        "published_date": str(v.published_date) if getattr(v, "published_date", None) else None,
        "col": int(v.col),
        "col_order": int(v.col_order),
        "url": "/" + v.file_path.replace("\\", "/"),
        "thumbnail_url": "/" + v.thumbnail_path.replace("\\", "/") if v.thumbnail_path else None,
        "thumbnail_time": v.thumbnail_time,
    }
    for v in items
]
