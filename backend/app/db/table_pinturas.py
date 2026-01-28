import uuid
from sqlalchemy import Column, String, Integer, DateTime, Text, SmallInteger, func
from sqlalchemy.dialects.postgresql import UUID
from .db_init import Base

class Pintura(Base):
    __tablename__ = "pinturas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    type = Column(String, nullable=True)       # pinturas / mista

    title = Column(Text, nullable=True)
    year = Column(Integer, nullable=True)

    technique = Column(String, nullable=False)
    dimensions = Column(String, nullable=False)

    col = Column(SmallInteger, nullable=False, default=1)   # 1..3
    col_order = Column(Integer, nullable=False)             # ordem dentro da coluna

    file_path = Column(Text, nullable=False)       # ex: "media/pinturas/uuid.jpg"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
