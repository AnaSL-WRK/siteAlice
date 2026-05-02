from app.db.db_init import engine, Base
from app.db.table_fotos import Fotografia
from app.db.table_pinturas import Pintura
from app.db.table_videos import Video

# garante que os models são importados antes do create_all
Base.metadata.create_all(bind=engine)
print("Tables created/verified.")
