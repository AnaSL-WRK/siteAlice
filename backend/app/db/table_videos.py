import uuid
from sqlalchemy import Column, Integer, DateTime, Text, SmallInteger, Date, func
from sqlalchemy.dialects.postgresql import UUID
from app.db.db_init import Base


class Video(Base):
    __tablename__ = "videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title = Column(Text, nullable=True)
    published_date = Column(Date, nullable=True)

    col = Column(SmallInteger, nullable=False, default=1)
    col_order = Column(Integer, nullable=False)

    file_path = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)