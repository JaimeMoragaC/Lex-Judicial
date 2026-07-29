#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LexControl - Índice de texto completo de los expedientes (PDF, DOCX, OCR)
========================================================================
Extrae el texto de todos los PDF y documentos Word (DOCX) del disco forense y lo deja en un índice SQLite FTS5.
Soporta OCR automático con Tesseract para PDFs escaneados (imágenes).

Es incremental: guarda el tamaño y la fecha de cada archivo ya procesado, así que
volver a correrlo sólo indexa lo nuevo o lo que cambió. Se puede interrumpir con
Ctrl-C y retomar donde iba.

    python3 indexar_pdfs.py              # indexa lo que falte
    python3 indexar_pdfs.py --rehacer    # rehace el índice desde cero
    python3 indexar_pdfs.py --limite 200 # sólo los primeros 200 (para probar)
"""
import argparse
import os
import sqlite3
import sys
import time
from pathlib import Path

import fitz  # PyMuPDF
try:
    import docx  # python-docx
except ImportError:
    docx = None

try:
    import pytesseract
    from PIL import Image
    import io
except ImportError:
    pytesseract = None

fitz.TOOLS.mupdf_display_errors(False)

BASE_DIR = Path(__file__).resolve().parent
INDICE = BASE_DIR / "data" / "indice_texto.sqlite"

RAICES = [
    Path("/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023"),
    Path("/home/jaime/Descargas/Casos2023-Consolidados"),
]

MAX_PAGINAS = 60
MAX_CARACTERES = 400_000


def abrir_indice():
    INDICE.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(INDICE)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""
        CREATE TABLE IF NOT EXISTS archivos (
            ruta      TEXT PRIMARY KEY,
            nombre    TEXT,
            carpeta   TEXT,
            tamano    INTEGER,
            modificado REAL,
            paginas   INTEGER,
            indexado  REAL
        )
    """)
    con.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS textos USING fts5(
            ruta UNINDEXED,
            nombre,
            carpeta,
            contenido,
            tokenize = "unicode61 remove_diacritics 2"
        )
    """)
    return con


def extraer_texto_docx(ruta):
    if not docx:
        return None, 0
    try:
        doc = docx.Document(ruta)
        parrafos = [p.text for p in doc.paragraphs if p.text.strip()]
        for t in doc.tables:
            for row in t.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    parrafos.append(row_text)
        texto = "\n".join(parrafos)[:MAX_CARACTERES]
        return texto, 1
    except Exception as e:
        return None, 0


def extraer_texto_pdf(ruta):
    try:
        with fitz.open(ruta) as doc:
            total = doc.page_count
            partes = []
            ocr_necesario = False
            
            for i, pagina in enumerate(doc):
                if i >= MAX_PAGINAS:
                    break
                txt = pagina.get_text()
                if txt and len(txt.strip()) > 30:
                    partes.append(txt)
                else:
                    # Si no hay texto directo y tenemos pytesseract, intentamos OCR en la página
                    if pytesseract:
                        try:
                            pix = pagina.get_pixmap(dpi=150)
                            img = Image.open(io.BytesIO(pix.tobytes("png")))
                            txt_ocr = pytesseract.image_to_string(img, lang="spa")
                            if txt_ocr and len(txt_ocr.strip()) > 20:
                                partes.append(f"[OCR] {txt_ocr}")
                        except Exception:
                            pass
                if sum(len(p) for p in partes) > MAX_CARACTERES:
                    break
            return "\n".join(partes)[:MAX_CARACTERES], total
    except Exception as e:
        return None, 0


def extraer_texto(ruta):
    p = Path(ruta)
    ext = p.suffix.lower()
    if ext == ".docx":
        return extraer_texto_docx(ruta)
    elif ext == ".pdf":
        return extraer_texto_pdf(ruta)
    elif ext in [".txt", ".md"]:
        try:
            with open(ruta, "r", encoding="utf-8", errors="ignore") as f:
                return f.read(MAX_CARACTERES), 1
        except Exception:
            return None, 0
    return None, 0


def recolectar_archivos():
    raiz = next((r for r in RAICES if r.exists()), None)
    if raiz is None:
        print("❌ No se encuentra el disco de casos. Conéctalo y vuelve a intentar.")
        for r in RAICES:
            print(f"     {r}")
        sys.exit(1)
    print(f"📂 Recorriendo {raiz}")
    extensiones = {".pdf", ".docx", ".txt"}
    archivos = sorted(str(p) for p in raiz.rglob("*") if p.suffix.lower() in extensiones and p.is_file())
    return raiz, archivos


def main():
    parser = argparse.ArgumentParser(description="Índice FTS5 de expedientes (PDF, DOCX, OCR)")
    parser.add_argument("--rehacer", action="store_true", help="Borra el índice actual y lo recrea")
    parser.add_argument("--limite", type=int, default=0, help="Límite de archivos a procesar")
    args = parser.parse_args()

    if args.rehacer and INDICE.exists():
        print(f"⚠️  Borrando índice anterior: {INDICE}")
        INDICE.unlink()

    con = abrir_indice()
    raiz, lista_archivos = recolectar_archivos()

    ya = {
        ruta: (tam, mod)
        for ruta, tam, mod in con.execute("SELECT ruta, tamano, modificado FROM archivos")
    }

    pendientes = []
    for ruta in lista_archivos:
        try:
            st = os.stat(ruta)
        except OSError:
            continue
        previo = ya.get(ruta)
        if previo and previo[0] == st.st_size and abs(previo[1] - st.st_mtime) < 1:
            continue
        pendientes.append((ruta, st))

    if args.limite:
        pendientes = pendientes[: args.limite]

    print(f"🔎 {len(pendientes)} documentos por indexar ({len(lista_archivos) - len(pendientes)} ya al día).")
    if not pendientes:
        print("✅ El índice de contenido está 100% al día.")
        return

    inicio = time.time()
    hechos = fallidos = 0
    try:
        for n, (ruta, st) in enumerate(pendientes, 1):
            texto, paginas = extraer_texto(ruta)
            if not texto:
                fallidos += 1
                continue

            p = Path(ruta)
            carpeta = p.parent.name
            con.execute("DELETE FROM textos WHERE ruta = ?", (ruta,))
            con.execute(
                "INSERT INTO textos (ruta, nombre, carpeta, contenido) VALUES (?, ?, ?, ?)",
                (ruta, p.name, carpeta, texto),
            )
            con.execute(
                "INSERT OR REPLACE INTO archivos (ruta, nombre, carpeta, tamano, modificado, paginas, indexado)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (ruta, p.name, carpeta, st.st_size, st.st_mtime, paginas, time.time()),
            )
            hechos += 1

            if n % 100 == 0:
                con.commit()
                transcurrido = time.time() - inicio
                ritmo = n / transcurrido if transcurrido else 0
                faltan = (len(pendientes) - n) / ritmo if ritmo else 0
                print(f"   {n}/{len(pendientes)}  ({ritmo:.1f} doc/s, faltan ~{faltan/60:.1f} min)")
    except KeyboardInterrupt:
        print("\n⏸️  Interrumpido. Lo indexado queda guardado; vuelve a correrlo para continuar.")
    finally:
        con.commit()
        con.execute("INSERT INTO textos(textos) VALUES('optimize')")
        con.commit()
        con.close()

    total = time.time() - inicio
    print(f"\n✅ {hechos} documentos indexados con éxito en {total/60:.1f} min. {fallidos} sin texto extraíble.")
    print(f"   Índice local: {INDICE}  ({INDICE.stat().st_size/1048576:.1f} MB)")


if __name__ == "__main__":
    main()
