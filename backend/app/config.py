from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    media_root: str = "media"
    google_client_id: str
    admin_emails: str  # CSV: "mae@gmail.com,outra@gmail.com"
    allowed_origins: str = "https://alicenasartes.net" 
    class Config:
        env_file = ".env"

settings = Settings()
