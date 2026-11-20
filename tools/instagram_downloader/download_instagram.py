#!/usr/bin/env python3
"""
Instagram video downloader for the Poesia page.

Reads a .txt file with one Instagram post/reel URL per line, downloads each
video, and names it after the post date and the author taken from the LAST
"#poesia<author>" hashtag in the caption:

    2025-03-14 - Sophia De Mello Breyner.mp4

It also writes manifest.csv (filename, author, date, hashtag, url, status) in the
output folder, which is what gets used to upload the videos to the site.

Usage (from this folder):
    pip install -r requirements.txt
    python download_instagram.py links.txt
    python download_instagram.py links.txt --out ..\\..\\poesia_import
    python download_instagram.py links.txt --cookies-from-browser firefox

Lines that are empty or start with "#" in the links file are ignored.
Re-running is safe: posts already marked "ok" in the manifest are skipped.
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    sys.exit("yt-dlp is not installed. Run:  pip install -r requirements.txt")

try:
    from zoneinfo import ZoneInfo

    LISBON = ZoneInfo("Europe/Lisbon")
except Exception:  # Windows without the tzdata package
    LISBON = None

MANIFEST_NAME = "manifest.csv"
MANIFEST_FIELDS = ["filename", "author", "date", "hashtag", "url", "status"]

# "#poesia" followed by the author part (letters incl. accents, digits, _ . -)
POESIA_TAG = re.compile(r"#poesia([\w.\-]+)", re.IGNORECASE | re.UNICODE)
WINDOWS_BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


# ----------------------------------------------------------------- parsing --

def author_from_caption(caption: str) -> tuple[str, str]:
    """
    Returns (author, raw_hashtag) from the last non-empty #poesia<author> tag.
    "#poesiaSophiaDeMelloBreyner" -> "Sophia De Mello Breyner"
    "#poesia_fernando_pessoa"    -> "Fernando Pessoa"
    "#poesiafernandopessoa"      -> "Fernandopessoa"  (no way to split; fix by hand)
    """
    matches = [m for m in POESIA_TAG.finditer(caption or "") if m.group(1).strip("_.-")]
    if not matches:
        return "", ""

    raw = matches[-1].group(1).strip("_.-")
    hashtag = "#poesia" + raw

    name = re.sub(r"[_.\-]+", " ", raw)
    # Split CamelCase: "SophiaDeMello" -> "Sophia De Mello"
    name = re.sub(r"(?<=[a-zà-ÿ])(?=[A-ZÀ-Þ])", " ", name)
    name = " ".join(w[:1].upper() + w[1:] for w in name.split())
    return name, hashtag


def post_date(info: dict) -> str:
    """Post date as YYYY-MM-DD in Lisbon time (falls back to yt-dlp's UTC date)."""
    ts = info.get("timestamp")
    if ts:
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        if LISBON:
            dt = dt.astimezone(LISBON)
        return dt.strftime("%Y-%m-%d")

    d = info.get("upload_date")  # "YYYYMMDD"
    if d and len(d) == 8:
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return ""


def safe_filename(text: str) -> str:
    text = WINDOWS_BAD_CHARS.sub("", text).strip().rstrip(".")
    return text or "sem nome"


def read_links(path: Path) -> list[str]:
    links, seen = [], set()
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        url = line.strip()
        if not url or url.startswith("#"):
            continue
        url = url.split("?")[0].rstrip("/") + "/"  # drop ?igsh=... tracking params
        if url not in seen:
            seen.add(url)
            links.append(url)
    return links


# ---------------------------------------------------------------- manifest --

def load_manifest(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def save_manifest(path: Path, rows: list[dict]) -> None:
    # utf-8-sig so accents show correctly when opened in Excel
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in MANIFEST_FIELDS})


# ---------------------------------------------------------------- download --

def unique_path(folder: Path, stem: str, ext: str) -> Path:
    p = folder / f"{stem}.{ext}"
    n = 2
    while p.exists():
        p = folder / f"{stem} ({n}).{ext}"
        n += 1
    return p


def video_entries(info: dict) -> list[dict]:
    """A carousel post comes back as a playlist; keep only the video items."""
    if info.get("_type") == "playlist":
        entries = [e for e in (info.get("entries") or []) if e]
    else:
        entries = [info]
    return [e for e in entries if e.get("vcodec") not in (None, "none") or e.get("ext") == "mp4"]


def download_post(url: str, out_dir: Path, base_opts: dict) -> list[dict]:
    rows: list[dict] = []

    with yt_dlp.YoutubeDL({**base_opts, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)

    caption = info.get("description") or ""
    entries = video_entries(info)
    if not entries:
        return [{"url": url, "status": "erro: o post não tem vídeo"}]

    author, hashtag = author_from_caption(caption)
    date = post_date(info) or post_date(entries[0])

    for i, entry in enumerate(entries, start=1):
        stem = safe_filename(f"{date or 'sem data'} - {author or 'SEM AUTOR'}")
        if len(entries) > 1:
            stem += f" - parte {i}"

        target = unique_path(out_dir, stem, "mp4")
        opts = {**base_opts, "outtmpl": str(target.with_suffix("")) + ".%(ext)s"}
        if len(entries) > 1:
            opts["playlist_items"] = str(i)

        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        # yt-dlp may have picked another extension; find what was written
        written = next(iter(sorted(out_dir.glob(target.stem + ".*"))), target)

        status = "ok"
        if not author:
            status = "ok - autor não encontrado, preencher à mão"
        elif " " not in author:
            status = "ok - confirmar nome do autor"

        rows.append({
            "filename": written.name,
            "author": author,
            "date": date,
            "hashtag": hashtag,
            "url": url,
            "status": status,
        })

    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="Download Instagram videos for the Poesia page.")
    ap.add_argument("links", type=Path, help="txt file with one Instagram link per line")
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "downloads",
                    help="output folder (default: ./downloads)")
    ap.add_argument("--cookies-from-browser", metavar="BROWSER",
                    help="use your Instagram login from a browser: firefox, chrome, edge, ... "
                         "(needed when Instagram asks for login)")
    ap.add_argument("--cookies", type=Path, metavar="FILE",
                    help="cookies.txt file (Netscape format) as an alternative to --cookies-from-browser")
    args = ap.parse_args()

    if not args.links.exists():
        sys.exit(f"Links file not found: {args.links}")

    out_dir = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / MANIFEST_NAME

    links = read_links(args.links)
    if not links:
        sys.exit("No links found in the file.")

    rows = load_manifest(manifest_path)
    done = {r["url"] for r in rows if r.get("status", "").startswith("ok")}
    rows = [r for r in rows if r["url"] in done]  # drop old failures so they retry

    has_ffmpeg = shutil.which("ffmpeg") is not None
    base_opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        # with ffmpeg: best video+audio merged into mp4; without: best single mp4 file
        "format": "bv*+ba/b" if has_ffmpeg else "b[ext=mp4]/b",
        "merge_output_format": "mp4",
        "retries": 3,
    }
    if args.cookies_from_browser:
        base_opts["cookiesfrombrowser"] = (args.cookies_from_browser,)
    if args.cookies:
        base_opts["cookiefile"] = str(args.cookies)

    print(f"{len(links)} link(s) -> {out_dir}")
    if not has_ffmpeg:
        print("(ffmpeg not found: using single-file formats, quality may be slightly lower)")

    failed = 0
    for n, url in enumerate(links, start=1):
        prefix = f"[{n}/{len(links)}]"
        if url in done:
            print(f"{prefix} já descarregado, a saltar: {url}")
            continue
        try:
            new_rows = download_post(url, out_dir, base_opts)
        except Exception as e:  # keep going with the other links
            msg = str(e).splitlines()[0][:200]
            new_rows = [{"url": url, "status": f"erro: {msg}"}]

        for r in new_rows:
            if r["status"].startswith("ok"):
                print(f"{prefix} {r['filename']}" + ("" if r["status"] == "ok" else f"  ({r['status'][5:]})"))
            else:
                failed += 1
                print(f"{prefix} FALHOU {url}\n        {r['status']}")
        rows.extend(new_rows)
        save_manifest(manifest_path, rows)  # save after each post so progress isn't lost

    print(f"\nDone. Manifest: {manifest_path}")
    if failed:
        print(f"{failed} link(s) failed. If Instagram asked for login, re-run with "
              f"--cookies-from-browser firefox (or chrome/edge, with that browser closed).")


if __name__ == "__main__":
    main()
