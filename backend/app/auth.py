from fastapi import Header, HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests
from .config import settings

#Verificar o token de ID do Google no lado do servidor - https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
def require_admin(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        info = id_token.verify_oauth2_token(token, requests.Request(), settings.google_client_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid ID token")

    email = (info.get("email") or "").lower()
    allowed = {e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()}

    if email not in allowed:
        raise HTTPException(status_code=403, detail="Not allowed")

    return {"email": email}
