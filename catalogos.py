#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Acceso único a los catálogos de datos de LexControl.

Los catálogos pesados (disco duro forense y causas del PJUD) viven en data/*.json
y los sirve servidor_local_lexcontrol.py por /data/<nombre>. Antes eran archivos
.js de decenas de miles de líneas que cada script parseaba a mano recortando entre
el primer '[' y el último ']'; este módulo reemplaza esa maniobra.
"""
import json
from pathlib import Path

DATOS_DIR = Path(__file__).resolve().parent / "data"

DISCO = "realDiskData"
PJUD = "pjudCausesData"


def ruta(nombre):
    return DATOS_DIR / f"{nombre}.json"


def cargar(nombre, por_defecto=None):
    """Devuelve el catálogo completo, o `por_defecto` si aún no se ha generado."""
    destino = ruta(nombre)
    if not destino.is_file():
        return por_defecto if por_defecto is not None else {}
    with open(destino, "r", encoding="utf-8") as f:
        return json.load(f)


def guardar(nombre, contenido):
    """Escribe el catálogo de forma atómica, para no dejarlo a medias si algo falla."""
    DATOS_DIR.mkdir(parents=True, exist_ok=True)
    destino = ruta(nombre)
    temporal = destino.with_suffix(".json.tmp")
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(contenido, f, ensure_ascii=False, separators=(",", ":"))
    temporal.replace(destino)
    return destino


def cargar_clientes_disco():
    """Lista de mandantes con sus carpetas físicas. Vacía si falta el catálogo."""
    return cargar(DISCO, {}).get("clientes", [])


def cargar_causas_pjud():
    """Lista de causas importadas del Excel oficial del PJUD."""
    return cargar(PJUD, {}).get("casos", [])


# --- Registro de plazos vigilados -------------------------------------------
# A diferencia de los catálogos, esto NO se regenera: son plazos que el abogado
# registró y que se pierden si se borran. Por eso viven en el servidor y no en
# el localStorage del navegador.

PLAZOS = "plazos"


def cargar_plazos():
    return cargar(PLAZOS, {"plazos": []}).get("plazos", [])


def guardar_plazos(plazos):
    return guardar(PLAZOS, {"plazos": plazos})


# Expedientes extrajudiciales y administrativos abiertos desde la Bitácora.
# Antes vivían en el localStorage del navegador: limpiar datos del sitio borraba
# la relación entre cada cliente y su correlativo, y las gestiones quedaban
# huérfanas. Un registro de expedientes no puede depender del navegador.

EXPEDIENTES = "expedientes"


def cargar_expedientes():
    return cargar(EXPEDIENTES, {"expedientes": []}).get("expedientes", [])


def guardar_expedientes(expedientes):
    return guardar(EXPEDIENTES, {"expedientes": expedientes})
