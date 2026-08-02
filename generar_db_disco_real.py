#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconstruye data/realDiskData.json recorriendo el disco duro forense.

Cada subcarpeta directa de RAIZ_DISCO es un "cliente" -en la práctica, una
carpeta de caso o de mandante-. Se listan TODOS los archivos dentro de esa
carpeta, a cualquier profundidad -algunas carpetas de caso tienen subcarpetas
numeradas, ej. "04_Escritos_y_Mero_Tramite"-, para que la ficha del expediente
(findDiscoFolder() en el frontend) muestre lo que realmente hay en disco, no
una foto vieja del último escaneo.

Este catálogo no se actualiza solo: hay que re-correr este script cada vez que
se archivan documentos nuevos a mano fuera del Vigilante, o periódicamente,
para que la ficha no se desincronice del disco real.

Uso: python3 generar_db_disco_real.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalogos

RAIZ_DISCO = Path("/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023")


def tamano_legible(bytes_):
    valor = float(bytes_)
    for unidad in ("B", "KB", "MB", "GB"):
        if valor < 1024 or unidad == "GB":
            return f"{valor:.1f} {unidad}" if unidad != "B" else f"{int(valor)} B"
        valor /= 1024
    return f"{valor:.1f} TB"


def escanear():
    if not RAIZ_DISCO.exists():
        print(f"No existe {RAIZ_DISCO} -¿está montado el disco externo?")
        sys.exit(1)

    subcarpetas = sorted(p for p in RAIZ_DISCO.iterdir() if p.is_dir())
    print(f"Escaneando {len(subcarpetas)} carpetas bajo {RAIZ_DISCO}...")

    clientes = []
    total_archivos = 0
    inicio = time.time()

    for i, carpeta in enumerate(subcarpetas, 1):
        documentos = []
        try:
            for archivo in carpeta.rglob("*"):
                if archivo.is_file():
                    try:
                        tam = archivo.stat().st_size
                    except OSError:
                        tam = 0
                    documentos.append({
                        "name": archivo.name,
                        "path": str(archivo),
                        "size": tamano_legible(tam)
                    })
        except (OSError, PermissionError) as e:
            print(f"  aviso: no se pudo leer {carpeta}: {e}")

        clientes.append({
            "folderName": carpeta.name,
            "path": str(carpeta),
            "documentosGenerales": documentos,
            "causas": []
        })
        total_archivos += len(documentos)

        if i % 100 == 0:
            transcurrido = time.time() - inicio
            print(f"  {i}/{len(subcarpetas)} carpetas, {total_archivos} archivos ({transcurrido:.0f}s)...")

    catalogo = {
        "totalArchivos": total_archivos,
        "raizDisco": str(RAIZ_DISCO),
        "clientes": clientes
    }
    catalogos.guardar(catalogos.DISCO, catalogo)

    duracion = time.time() - inicio
    print(f"\nListo: {len(clientes)} carpetas, {total_archivos} archivos, {duracion:.1f}s -> data/realDiskData.json")


if __name__ == "__main__":
    escanear()
