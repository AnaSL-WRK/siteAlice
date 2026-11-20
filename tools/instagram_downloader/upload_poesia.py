#!/usr/bin/env python3
"""
Upload the downloaded Instagram videos to the Poesia page of alicenasartes.net.

Reads downloads/upload.csv (filename, thumbnail, title, date, col, instagram, status)
and sends each row to POST /api/admin/upload/video, exactly like the admin page does.
Rows already marked "uploaded" are skipped, so it is safe to re-run.

It needs your admin login token (valid ~1 hour). To get it:
  1. Open https://alicenasartes.net/videos.html?admin=1 and sign in.
  2. Press F12 -> Console, and run:
         localStorage.getItem("alicenasartes_admin_id_token")
  3. Copy the long text (without the quotes) and paste it when the script asks.

Usage (from this folder):
    python upload_poesia.py                 # asks for the token
    python upload_poesia.py --dry-run       # only shows what would be uploaded
    python upload_poesia.py --api http://localhost:8000   # local backend instead
"""

from __future__ import annotations

import argparse
import csv
import getpass
import os
import re
import sys
from datetime import date
from pathlib import Path

try:
    import requests  # installed together with yt-dlp
except ImportError:
    sys.exit("requests is not installed. Run:  pip install requests")

HERE = Path(__file__).parent
FIELDS = ["filename", "thumbnail", "title", "date", "col", "instagram", "status"]
VIDEO_MIME = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/x-m4v"}


def load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def save(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


def normalize_date(value: str, filename: str) -> str:
    """
    Returns YYYY-MM-DD. Excel rewrites dates when the CSV is saved there
    (e.g. 11/15/2026 or 15/11/2026), so accept those too; when day/month order
    is ambiguous, the YYYY-MM-DD at the start of the filename decides.
    """
    value = (value or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value

    from_name = filename[:10] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", filename[:10]) else None
    m = re.fullmatch(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})", value)
    if not m:
        if from_name and not value:
            return from_name
        raise ValueError(f"invalid date {value!r}")

    a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    candidates = []
    for month, day in ((a, b), (b, a)):  # M/D/Y and D/M/Y
        try:
            candidates.append(date(y, month, day).isoformat())
        except ValueError:
            pass
    candidates = list(dict.fromkeys(candidates))
    if from_name in candidates:
        return from_name
    if len(candidates) == 1:
        return candidates[0]
    raise ValueError(f"ambiguous date {value!r} - write it as YYYY-MM-DD")


def error_text(res: requests.Response) -> str:
    try:
        return str(res.json().get("detail", res.text))[:300]
    except ValueError:
        return res.text[:300]


def main() -> None:
    ap = argparse.ArgumentParser(description="Upload Poesia videos listed in upload.csv.")
    ap.add_argument("--csv", type=Path, default=HERE / "downloads" / "upload.csv")
    ap.add_argument("--api", default="https://live.alicenasartes.net", help="backend base URL")
    ap.add_argument("--token", help="admin ID token (otherwise read from ALICE_TOKEN or asked)")
    ap.add_argument("--thumbnail-time", type=float, default=1.0, help="second the thumbnail was taken at")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"Not found: {args.csv}")

    base_dir = args.csv.parent
    rows = load(args.csv)
    todo = [r for r in rows if r.get("status") != "uploaded"]

    # Check every file exists before uploading anything
    missing = [p for r in todo for p in (r["filename"], r["thumbnail"]) if not (base_dir / p).exists()]
    if missing:
        sys.exit("Missing files:\n  " + "\n  ".join(missing))

    bad = []
    for r in todo:
        try:
            r["date"] = normalize_date(r["date"], r["filename"])
        except ValueError as e:
            bad.append(f"{r['filename']}: {e}")
    if bad:
        sys.exit("Fix these dates in the CSV first:\n  " + "\n  ".join(bad))

    print(f"{len(todo)} video(s) to upload ({len(rows) - len(todo)} already done) -> {args.api}")
    for r in todo:
        print(f"  {r['date']}  col {r['col']}  {r['title']}")
    if args.dry_run or not todo:
        return

    token = (args.token or os.environ.get("ALICE_TOKEN")
             or getpass.getpass("\nPaste the admin token (input is hidden) and press Enter: ")).strip().strip('"')
    headers = {"Authorization": f"Bearer {token}"}

    me = requests.get(f"{args.api}/api/admin/me", headers=headers, timeout=20)
    if me.status_code != 200:
        sys.exit(f"Login check failed ({me.status_code}): {error_text(me)}\n"
                 f"The token may have expired - sign in again on the admin page and copy a new one.")
    print(f"Signed in as {me.json().get('email')}\n")

    failed = 0
    for n, r in enumerate(todo, start=1):
        video = base_dir / r["filename"]
        thumb = base_dir / r["thumbnail"]
        label = f"[{n}/{len(todo)}] {r['date']} {r['title']}"

        try:
            with video.open("rb") as vf, thumb.open("rb") as tf:
                res = requests.post(
                    f"{args.api}/api/admin/upload/video",
                    headers=headers,
                    data={
                        "title": r["title"],
                        "col": r["col"],
                        "published_date": r["date"],
                        "thumbnail_time": str(args.thumbnail_time),
                    },
                    files={
                        "file": (video.name, vf, VIDEO_MIME.get(video.suffix.lower(), "video/mp4")),
                        "thumbnail": ("thumbnail.jpg", tf, "image/jpeg"),
                    },
                    timeout=600,
                )
        except requests.RequestException as e:
            res, err = None, str(e)

        if res is not None and res.ok:
            r["status"] = "uploaded"
            print(f"{label}  OK")
        else:
            failed += 1
            msg = error_text(res) if res is not None else err
            code = res.status_code if res is not None else "-"
            r["status"] = f"erro {code}: {msg}"
            print(f"{label}  FALHOU ({code}) {msg}")
            if res is not None and res.status_code in (401, 403):
                save(args.csv, rows)
                sys.exit("\nToken expired or not allowed - get a new token and re-run (done ones are skipped).")

        save(args.csv, rows)  # keep progress after every video

    print(f"\nDone: {len(todo) - failed} uploaded, {failed} failed.")


if __name__ == "__main__":
    main()
