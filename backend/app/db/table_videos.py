# backend/app/db/table_videos.py

import uuid
from sqlalchemy import Column, String, Integer, DateTime, Text, SmallInteger, func, Float
from sqlalchemy.dialects.postgresql import UUID
from app.db.db_init import Base

class Video(Base):
    __tablename__ = "videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title = Column(Text, nullable=True)

    col = Column(SmallInteger, nullable=False, default=1)
    col_order = Column(Integer, nullable=False)

    file_path = Column(Text, nullable=False)          # media/videos/uuid.mp4
    thumbnail_path = Column(Text, nullable=False)     # media/videos/thumbnails/uuid.jpg
    thumbnail_time = Column(Float, nullable=True)     # selected second

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)