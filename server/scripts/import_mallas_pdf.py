import argparse
import os
import re
import unicodedata
from pathlib import Path

import pdfplumber
import pymysql


ROOT = Path(__file__).resolve().parents[2]
MALLAS_DIR = ROOT / "mallas"
ENV_PATH = ROOT / ".env"

COLUMNS = [
    ("ciclo", 0, 36),
    ("n", 36, 51),
    ("curso", 51, 218),
    ("cond", 218, 242),
    ("cred", 242, 263),
    ("teoria", 263, 287),
    ("prac", 287, 309),
    ("lab", 309, 329),
    ("prereq", 329, 456),
    ("clas", 456, 504),
    ("mencion", 504, 548),
    ("crmin", 548, 590),
]

CODE_RE = re.compile(r"\b([A-ZÑ]{2,5}\d{2,5}|INTER\s+[A-Z]{3,5}\s+[A-Z0-9]{3,5})\b")


def load_env(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize(value):
    text = unicodedata.normalize("NFKD", clean(value).upper())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def merge(left, right):
    left = clean(left)
    right = clean(right)
    return clean(f"{left} {right}") if left else right


def to_int(value):
    value = clean(value)
    if not value:
        return None
    match = re.search(r"\d+", value)
    return int(match.group(0)) if match else None


def line_cells(page):
    words = page.extract_words(x_tolerance=1, y_tolerance=2, use_text_flow=False)
    lines = []
    for word in words:
        if word["top"] < 105 or word["top"] > 810:
            continue
        for line in lines:
            if abs(line["top"] - word["top"]) < 2:
                line["words"].append(word)
                break
        else:
            lines.append({"top": word["top"], "words": [word]})

    rows = []
    for line in sorted(lines, key=lambda item: item["top"]):
        row = {key: [] for key, _, _ in COLUMNS}
        row["_top"] = line["top"]
        for word in sorted(line["words"], key=lambda item: item["x0"]):
            x_mid = (word["x0"] + word["x1"]) / 2
            for key, left, right in COLUMNS:
                if left <= x_mid < right:
                    row[key].append(word["text"])
                    break
        for key, _, _ in COLUMNS:
            row[key] = clean(" ".join(row[key]))
        if any(row[key] for key, _, _ in COLUMNS):
            rows.append(row)
    return rows


def is_start(row):
    return bool(
        re.fullmatch(r"\d+", row.get("n") or "")
        and (row.get("curso") or re.search(r"^(Oblig|Elect)\.?", row.get("cond") or ""))
    )


def is_pre_line_for_next(lines, index):
    if index + 1 >= len(lines) or not is_start(lines[index + 1]):
        return False
    if lines[index + 1]["_top"] - lines[index]["_top"] > 4:
        return False
    return bool(lines[index].get("curso") or lines[index].get("prereq"))


def append_fields(target, source, prepend=False):
    for key in ["curso", "cond", "cred", "teoria", "prac", "lab", "prereq", "clas", "mencion", "crmin"]:
        if source.get(key):
            target[key] = merge(source[key], target.get(key, "")) if prepend else merge(target.get(key, ""), source[key])


def split_course(raw_course):
    raw_course = clean(raw_course)
    matches = list(CODE_RE.finditer(raw_course))
    if not matches:
        return raw_course, None
    match = matches[-1]
    code = clean(match.group(1))
    name = clean((raw_course[: match.start()] + " " + raw_course[match.end() :]).strip())
    return name, code


def parse_pdf(path):
    parsed = []
    current = None
    current_cycle = 1
    previous_n = None
    pending = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            lines = line_cells(page)
            index = 0
            while index < len(lines):
                line = lines[index]
                if not is_start(line) and is_pre_line_for_next(lines, index):
                    pending.append(line)
                    index += 1
                    continue

                if is_start(line):
                    number = int(line["n"])
                    if previous_n is not None and number == 1:
                        current_cycle += 1
                    if current:
                        parsed.append(current)
                    current = {"ciclo": current_cycle, "n": number}
                    for pending_line in pending:
                        append_fields(current, pending_line)
                    pending = []
                    append_fields(current, line)
                    previous_n = number
                elif current:
                    append_fields(current, line)
                index += 1

    if current:
        parsed.append(current)

    courses = []
    for item in parsed:
        name, code = split_course(item.get("curso", ""))
        courses.append(
            {
                "numero_ciclo": item["ciclo"],
                "nro_orden": item["n"],
                "nombre_curso": name,
                "codigo_curso": code,
                "creditos": to_int(item.get("cred")),
                "tipo_curso": "Electivo" if clean(item.get("cond")).lower().startswith("elect") else "Obligatorio",
                "horas_teoria": to_int(item.get("teoria")),
                "horas_practica": to_int(item.get("prac")),
                "horas_lab": to_int(item.get("lab")),
                "prerequisito": clean(item.get("prereq")) or None,
                "clas_sunedu": clean(item.get("clas")) or None,
                "mencion": clean(item.get("mencion")) or None,
                "creditos_minimos": to_int(item.get("crmin")),
            }
        )
    return courses


def connect():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database="mallas_usil",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def column_exists(cursor, table, column):
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
        """,
        (table, column),
    )
    return cursor.fetchone()["total"] > 0


def index_exists(cursor, table, index):
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = %s
        """,
        (table, index),
    )
    return cursor.fetchone()["total"] > 0


def ensure_schema(cursor):
    additions = [
        ("nro_orden", "SMALLINT UNSIGNED NULL AFTER numero_ciclo"),
        ("codigo_curso", "VARCHAR(40) NULL AFTER nombre_curso"),
        ("horas_teoria", "SMALLINT UNSIGNED NULL AFTER tipo_curso"),
        ("horas_practica", "SMALLINT UNSIGNED NULL AFTER horas_teoria"),
        ("horas_lab", "SMALLINT UNSIGNED NULL AFTER horas_practica"),
        ("prerequisito", "TEXT NULL AFTER horas_lab"),
        ("clas_sunedu", "VARCHAR(120) NULL AFTER prerequisito"),
        ("mencion", "VARCHAR(160) NULL AFTER clas_sunedu"),
        ("creditos_minimos", "SMALLINT UNSIGNED NULL AFTER mencion"),
    ]
    for column, definition in additions:
        if not column_exists(cursor, "curso", column):
            cursor.execute(f"ALTER TABLE curso ADD COLUMN {column} {definition}")

    if not index_exists(cursor, "curso", "idx_curso_malla"):
        cursor.execute("ALTER TABLE curso ADD KEY idx_curso_malla (id_malla)")
    if index_exists(cursor, "curso", "uq_curso_malla"):
        cursor.execute("ALTER TABLE curso DROP INDEX uq_curso_malla")
    if not index_exists(cursor, "curso", "uq_curso_malla_orden"):
        cursor.execute("ALTER TABLE curso ADD UNIQUE KEY uq_curso_malla_orden (id_malla, numero_ciclo, nro_orden)")
    if not index_exists(cursor, "curso", "idx_curso_nombre_ciclo"):
        cursor.execute("ALTER TABLE curso ADD KEY idx_curso_nombre_ciclo (id_malla, nombre_curso, numero_ciclo)")


def fetch_careers(cursor):
    cursor.execute(
        """
        SELECT ca.id_carrera, ca.nombre_carrera, ca.total_ciclos, f.nombre_facultad
        FROM carrera ca
        JOIN facultad f ON f.id_facultad = ca.id_facultad
        """
    )
    return {normalize(row["nombre_carrera"]): row for row in cursor.fetchall()}


def ensure_malla(cursor, id_carrera, pdf_name):
    cursor.execute(
        "SELECT id_malla FROM malla_version WHERE id_carrera=%s AND es_vigente=1 ORDER BY anio_inicio DESC LIMIT 1",
        (id_carrera,),
    )
    row = cursor.fetchone()
    if row:
        cursor.execute(
            "UPDATE malla_version SET nombre_version=%s, anio_inicio=%s, es_vigente=1, url_fuente=%s, fuente_carga=%s WHERE id_malla=%s",
            ("2026-01", 2026, f"mallas/{pdf_name}", "PDF", row["id_malla"]),
        )
        return row["id_malla"]

    cursor.execute(
        """
        INSERT INTO malla_version (id_carrera, nombre_version, anio_inicio, es_vigente, url_fuente, fuente_carga)
        VALUES (%s, %s, %s, 1, %s, %s)
        """,
        (id_carrera, "2026-01", 2026, f"mallas/{pdf_name}", "PDF"),
    )
    return cursor.lastrowid


def reset_courses(cursor, malla_ids):
    if not malla_ids:
        return
    placeholders = ",".join(["%s"] * len(malla_ids))
    cursor.execute(f"SELECT id_curso FROM curso WHERE id_malla IN ({placeholders})", malla_ids)
    course_ids = [row["id_curso"] for row in cursor.fetchall()]
    if course_ids:
        course_placeholders = ",".join(["%s"] * len(course_ids))
        cursor.execute(f"DELETE FROM curso_tendencia WHERE id_curso IN ({course_placeholders})", course_ids)
        cursor.execute(f"DELETE FROM analisis_curso WHERE id_curso IN ({course_placeholders})", course_ids)
        cursor.execute(f"DELETE FROM curso WHERE id_curso IN ({course_placeholders})", course_ids)


def insert_courses(cursor, id_malla, courses):
    sql = """
        INSERT INTO curso (
            id_malla, nombre_curso, codigo_curso, numero_ciclo, nro_orden,
            creditos, tipo_curso, horas_teoria, horas_practica, horas_lab,
            prerequisito, clas_sunedu, mencion, creditos_minimos
        )
        VALUES (
            %(id_malla)s, %(nombre_curso)s, %(codigo_curso)s, %(numero_ciclo)s, %(nro_orden)s,
            %(creditos)s, %(tipo_curso)s, %(horas_teoria)s, %(horas_practica)s, %(horas_lab)s,
            %(prerequisito)s, %(clas_sunedu)s, %(mencion)s, %(creditos_minimos)s
        )
    """
    for course in courses:
        row = dict(course)
        row["id_malla"] = id_malla
        cursor.execute(sql, row)


def main():
    parser = argparse.ArgumentParser(description="Importa mallas curriculares USIL desde PDFs.")
    parser.add_argument("--apply", action="store_true", help="Escribe los cambios en MySQL.")
    args = parser.parse_args()

    load_env(ENV_PATH)
    pdfs = sorted(MALLAS_DIR.glob("*.pdf"))
    extracted = {pdf: parse_pdf(pdf) for pdf in pdfs}

    print("PDFs leidos:")
    for pdf, courses in extracted.items():
        electivos = sum(1 for item in courses if item["tipo_curso"] == "Electivo")
        print(f"- {pdf.name}: {len(courses)} cursos ({electivos} electivos)")

    if not args.apply:
        print("Dry run completado. Ejecuta con --apply para cargar en la BD.")
        return

    conn = connect()
    try:
        with conn.cursor() as cursor:
            ensure_schema(cursor)
            careers = fetch_careers(cursor)
            planned = []
            for pdf, courses in extracted.items():
                key = normalize(pdf.stem)
                career = careers.get(key)
                if not career:
                    raise RuntimeError(f"No se encontro carrera para PDF: {pdf.name}")
                id_malla = ensure_malla(cursor, career["id_carrera"], pdf.name)
                planned.append((pdf, id_malla, courses, career))

            reset_courses(cursor, [item[1] for item in planned])
            for pdf, id_malla, courses, career in planned:
                insert_courses(cursor, id_malla, courses)
                max_cycle = max(course["numero_ciclo"] for course in courses)
                cursor.execute(
                    "UPDATE carrera SET total_ciclos=%s WHERE id_carrera=%s",
                    (max_cycle, career["id_carrera"]),
                )
                print(f"Importado {pdf.name}: {len(courses)} cursos en malla {id_malla}")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
