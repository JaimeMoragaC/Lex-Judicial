#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LexControl - Índice de texto completo de los expedientes
========================================================
Extrae el texto de los PDF del disco forense y lo deja en un índice SQLite FTS5,
para poder buscar una cláusula, un RUT o un argumento y saber en qué expediente
está. Hasta ahora el buscador sólo miraba nombres de archivo y carátulas.

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

# Los PDF del PJUD traen anotaciones que MuPDF no sabe dibujar y llena la salida
# de avisos. No afectan la extracción de texto, así que se silencian.
fitz.TOOLS.mupdf_display_errors(False)

BASE_DIR = Path(__file__).resolve().parent
INDICE = BASE_DIR / "data" / "indice_texto.sqlite"

RAICES = [
    Path("/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023"),
    Path("/home/jaime/Descargas/Casos2023-Consolidados"),
]

# Un escrito judicial rara vez pasa de unas decenas de páginas; más allá suelen
# ser anexos escaneados que aportan poco y cuestan mucho tiempo de extracción.
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


def extraer_texto(ruta):
    """Devuelve (texto, n_paginas). Un PDF ilegible no detiene el proceso."""
    try:
        with fitz.open(ruta) as doc:
            total = doc.page_count
            partes = []
            for i, pagina in enumerate(doc):
                if i >= MAX_PAGINAS:
                    break
                partes.append(pagina.get_text())
                if sum(len(p) for p in partes) > MAX_CARACTERES:
                    break
            return "\n".join(partes)[:MAX_CARACTERES], total
    except Exception as e:
        print(f"   ⚠️  ilegible: {Path(ruta).name} ({str(e)[:60]})")
        return None, 0


def recolectar_pdfs():
    raiz = next((r for r in RAICES if r.exists()), None)
    if raiz is None:
        print("❌ No se encuentra el disco de casos. Conéctalo y vuelve a intentar.")
        print("   Rutas probadas:")
        for r in RAICES:
            print(f"     {r}")
        sys.exit(1)
    print(f"📂 Recorriendo {raiz}")
    return raiz, sorted(str(p) for p in raiz.rglob("*") if p.suffix.lower() == ".pdf" and p.is_file())


def main():
    ap = argparse.ArgumentParser(description="Indexa el texto de los expedientes PDF")
    ap.add_argument("--rehacer", action="store_true", help="borra el índice y lo reconstruye")
    ap.add_argument("--limite", type=int, default=0, help="procesa a lo más N archivos")
    args = ap.parse_args()

    if args.rehacer and INDICE.exists():
        INDICE.unlink()
        for extra in (".wal", ".shm"):
            p = Path(str(INDICE) + extra)
            if p.exists():
                p.unlink()
        print("🗑️  Índice anterior eliminado.")

    con = abrir_indice()
    raiz, pdfs = recolectar_pdfs()
    print(f"📄 {len(pdfs)} PDF encontrados en disco.")

    ya = {
        ruta: (tam, mod)
        for ruta, tam, mod in con.execute("SELECT ruta, tamano, modificado FROM archivos")
    }

    pendientes = []
    for ruta in pdfs:
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

    print(f"🔎 {len(pendientes)} por indexar ({len(pdfs) - len(pendientes)} ya estaban al día).")
    if not pendientes:
        print("✅ El índice ya está al día.")
        return

    inicio = time.time()
    hechos = fallidos = 0
    try:
        for n, (ruta, st) in enumerate(pendientes, 1):
            texto, paginas = extraer_texto(ruta)
            if texto is None:
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
                print(f"   {n}/{len(pendientes)}  ({ritmo:.1f} arch/s, faltan ~{faltan/60:.1f} min)")
    except KeyboardInterrupt:
        print("\n⏸️  Interrumpido. Lo indexado queda guardado; vuelve a correrlo para continuar.")
    finally:
        con.commit()
        con.execute("INSERT INTO textos(textos) VALUES('optimize')")
        con.commit()
        con.close()

    total = time.time() - inicio
    print(f"\n✅ {hechos} documentos indexados en {total/60:.1f} min. {fallidos} ilegibles.")
    print(f"   Índice: {INDICE}  ({INDICE.stat().st_size/1048576:.1f} MB)")


if __name__ == "__main__":
    main()
