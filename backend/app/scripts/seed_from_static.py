import os
import re
import shutil
from pathlib import Path
from typing import Optional, Tuple

from bs4 import BeautifulSoup

from app.config import settings
from app.db.db_init import SessionLocal, Base, engine
from app.db.table_fotos import Fotografia
from app.db.table_pinturas import Pintura


# -------- helpers --------

def norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()

def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def parse_overlay_lines(overlay_div) -> list[str]:
    """
    Recebe <div class="overlay"><p> ... </p></div>
    e devolve lista de linhas (separadas por <br>, </br>, etc)
    """
    if overlay_div is None:
        return []
    p = overlay_div.find("p")
    if p is None:
        return []
    # transforma <br> em '\n'
    for br in p.find_all(["br", "br/"]):
        br.replace_with("\n")
    txt = p.get_text("\n")
    lines = [norm_text(x) for x in txt.split("\n")]
    return [x for x in lines if x]

def is_filler(container) -> bool:
    cls = container.get("class") or []
    if "image-container-filler" in cls:
        return True
    img = container.find("img")
    if not img:
        return True
    style = (img.get("style") or "").lower()
    if "opacity" in style and "0" in style:
        return True
    return False

def copy_image(static_root: Path, src: str, dest_rel: str) -> str:
    """
    src: caminho no html tipo "src/img/foto/estruturas/e1.jpg"
    dest_rel: destino relativo em media, tipo "fotografia/estruturas/e1.jpg"
    devolve file_path BD tipo: "media/fotografia/estruturas/e1.jpg"
    """
    src_path = (static_root / src).resolve()
    if not src_path.exists():
        raise FileNotFoundError(f"Imagem não encontrada: {src_path}")

    dest_abs = Path(settings.media_root) / dest_rel
    ensure_dir(dest_abs.parent)
    shutil.copy2(src_path, dest_abs)

    return f"media/{dest_rel}".replace("\\", "/")


def parse_year(s: str) -> Optional[int]:
    s = norm_text(s)
    if not s:
        return None
    m = re.search(r"(19|20)\d{2}", s)
    return int(m.group(0)) if m else None


# -------- seeders --------

def seed_fotografia(db, static_root: Path, fotografia_html: Path) -> int:
    soup = BeautifulSoup(fotografia_html.read_text(encoding="utf-8"), "html.parser")

    # mapeia secções por ID -> categoria DB
    section_map = {
        "estruturas": "estruturas",
        "praia": "praia",
        "natureza": "natureza",
        "tema_livre": "tema_livre",
    }

    inserted = 0

    for sec_id, category in section_map.items():
        h2 = soup.find(id=sec_id)
        if not h2:
            continue

        # a box é o próximo div com class box depois do h2
        box = h2.find_parent().find_next("div", class_="box")
        if not box:
            continue

        dreams = box.find_all("div", class_="dream", recursive=True)

        for col_idx, dream in enumerate(dreams, start=1):
            order = 1
            containers = dream.find_all("div", class_="image-container", recursive=True) + \
                         dream.find_all("div", class_="image-container-filler", recursive=True)

            for c in containers:
                if is_filler(c):
                    continue
                img = c.find("img")
                if not img:
                    continue
                src = img.get("src")
                if not src:
                    continue

                # destino em media: fotografia/<category>/<filename>
                filename = Path(src).name
                dest_rel = f"fotografia/{category}/{filename}"

                file_path = copy_image(static_root, src, dest_rel)

                db.add(
                    Fotografia(
                        category=category,
                        title=None,
                        year=None,
                        col=col_idx,
                        col_order=order,
                        file_path=file_path,
                    )
                )
                inserted += 1
                order += 1

    return inserted


def seed_pinturas(db, static_root: Path, pinturas_html: Path) -> int:
    soup = BeautifulSoup(pinturas_html.read_text(encoding="utf-8"), "html.parser")
    box = soup.find("div", class_="box")
    if not box:
        return 0

    dreams = box.find_all("div", class_="dream", recursive=True)
    inserted = 0

    for col_idx, dream in enumerate(dreams, start=1):
        order = 1
        for c in dream.find_all("div", class_="image-container", recursive=True):
            if is_filler(c):
                continue
            img = c.find("img")
            if not img:
                continue
            src = img.get("src")
            if not src:
                continue

            lines = parse_overlay_lines(c.find("div", class_="overlay"))
            # pinturas: [title, year, technique, dimensions]
            title = lines[0] if len(lines) >= 1 else None
            year = parse_year(lines[1]) if len(lines) >= 2 else None
            technique = lines[2] if len(lines) >= 3 else "Acrílico sobre tela"
            dimensions = lines[3] if len(lines) >= 4 else ""

            filename = Path(src).name
            dest_rel = f"pinturas/{filename}"
            file_path = copy_image(static_root, src, dest_rel)

            db.add(
                Pintura(
                    type="pinturas",
                    title=title,
                    year=year,
                    technique=technique,
                    dimensions=dimensions,
                    col=col_idx,
                    col_order=order,
                    file_path=file_path,
                )
            )
            inserted += 1
            order += 1

    return inserted


def seed_mista(db, static_root: Path, mista_html: Path) -> int:
    soup = BeautifulSoup(mista_html.read_text(encoding="utf-8"), "html.parser")
    box = soup.find("div", class_="box")
    if not box:
        return 0

    dreams = box.find_all("div", class_="dream", recursive=True)
    inserted = 0

    for col_idx, dream in enumerate(dreams, start=1):
        order = 1
        for c in dream.find_all("div", class_="image-container", recursive=True):
            if is_filler(c):
                continue
            img = c.find("img")
            if not img:
                continue
            src = img.get("src")
            if not src:
                continue

            lines = parse_overlay_lines(c.find("div", class_="overlay"))
            # mista: [title, year, dimensions] -> technique default
            title = lines[0] if len(lines) >= 1 else None
            year = parse_year(lines[1]) if len(lines) >= 2 else None
            dimensions = lines[2] if len(lines) >= 3 else ""
            technique = "Técnica mista"

            filename = Path(src).name
            dest_rel = f"pinturas/mista/{filename}"
            file_path = copy_image(static_root, src, dest_rel)

            db.add(
                Pintura(
                    type="mista",
                    title=title,
                    year=year,
                    technique=technique,
                    dimensions=dimensions,
                    col=col_idx,
                    col_order=order,
                    file_path=file_path,
                )
            )
            inserted += 1
            order += 1

    return inserted


# -------- main --------

def main():
    # caminhos: ajusta aqui para onde tens os ficheiros do "main" estático
    # static_root = pasta onde existe "src/img/..."
    static_root = Path(os.environ.get("STATIC_SITE_ROOT", "")).expanduser().resolve()

    if not static_root.exists():
        raise SystemExit(
            "STATIC_SITE_ROOT não existe. Exemplo:\n"
            "STATIC_SITE_ROOT=/home/ukiya/AliceNasArtes/siteAlice/static_main python -m app.scripts.seed_from_static"
        )

    fotografia_html = static_root / "fotografia.html"
    pinturas_html = static_root / "pinturas.html"
    mista_html = static_root / "mista.html"

    for p in [fotografia_html, pinturas_html, mista_html]:
        if not p.exists():
            raise SystemExit(f"Ficheiro não encontrado: {p}")

    # garante tabelas (se ainda não criaste)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # opcional: limpar (se queres seed do zero)
        # db.query(Fotografia).delete()
        # db.query(Pintura).delete()
        # db.commit()

        n_f = seed_fotografia(db, static_root, fotografia_html)
        n_p = seed_pinturas(db, static_root, pinturas_html)
        n_m = seed_mista(db, static_root, mista_html)

        db.commit()
        print(f"OK: fotografia={n_f}, pinturas={n_p}, mista={n_m}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
