from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Artwork

router = APIRouter(prefix="/api", tags=["public"])

@router.get("/fotos")
def list_fotos(
    category: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Artwork)
    if category is not None:
        q = q.filter(Artwork.category == category)

    items = q.order_by(Artwork.col.asc(), Artwork.col_order.asc()).all()
    
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
        db.query(Artwork)
        .filter(Artwork.type == type)
        .order_by(Artwork.col.asc(), Artwork.col_order.asc())
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