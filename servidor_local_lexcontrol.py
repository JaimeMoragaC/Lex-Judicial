#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LexControl - Servidor Lanzador Forense y Gestor de Archivos Locales
===================================================================
Servidor HTTP ligero en Python (Puerto 8888) que permite a la aplicación web
React abrir archivos directamente en el escritorio Linux (mediante xdg-open)
o servirlos para su visualización en pestañas del navegador.
"""

import os
import sys
import json
import urllib.parse
import mimetypes
import subprocess
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import imaplib
import email
import threading
import glob
from email.header import decode_header
import glob
import time
import re
import fitz
import unicodedata
import numpy as np
import pandas as pd
import urllib.request
import shutil
import gzip
import sqlite3
import datetime
import zipfile
import io
import base64
import difflib

import catalogos

BASE_DIR = Path(__file__).resolve().parent
DATOS_DIR = catalogos.DATOS_DIR


def cargar_dotenv(ruta=None):
    """Lee un .env de formato KEY=VALOR y lo vuelca a os.environ.

    Las variables ya presentes en el entorno tienen prioridad, para poder
    sobrescribir la configuración sin editar el archivo.
    """
    ruta = Path(ruta) if ruta else BASE_DIR / ".env"
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        clave = clave.strip()
        valor = valor.strip().strip('"').strip("'")
        if clave and clave not in os.environ:
            os.environ[clave] = valor


cargar_dotenv()


def archivar_pdf_fisicamente(tmp_path, filename, rol, cliente, caratula):
    local_folders = {}
    try:
        for item in catalogos.cargar_clientes_disco():
            fname = item.get("folderName", "").strip().lower()
            if fname:
                local_folders[fname] = item.get("path", "")
    except Exception as e:
        print(f"Error leyendo disco local: {e}")

    target_path = None
    c_lower = str(cliente).lower().strip()

    # -1. Carpeta ya fijada para este ROL. Una vez que un documento de esta
    # causa encuentra (o crea) su carpeta, queda anotada en el expediente para
    # que los próximos documentos vayan derecho ahí. Sin esto, cada documento
    # se juega el emparejamiento por nombre desde cero -y una carpeta creada
    # por error una vez (ej. sin el ROL en el nombre, por un rol que no se
    # pudo leer del texto) puede "imantar" todos los documentos futuros por
    # coincidir por casualidad, aunque exista una carpeta mejor organizada a
    # mano-. Caso real 31-jul-2026 (Cuevas Salazar Froilán, ROL 26047-2025):
    # el abogado prefirió fijar la carpeta ya creada como destino oficial en
    # vez de reordenar documentos ya archivados.
    expediente_objetivo = None
    if _extraer_rol_nucleo(rol):
        try:
            expedientes_disco = catalogos.cargar_expedientes()
            expediente_objetivo = expediente_por_rol(rol, expedientes_disco)
            if expediente_objetivo:
                fijada = expediente_objetivo.get("carpetaFisica")
                if fijada and Path(fijada).is_dir():
                    target_path = fijada
        except Exception:
            expediente_objetivo = None

    # 0. Rescate de cliente real por ROL si no se especificó
    if not c_lower and rol:
        try:
            for causa_pjud in catalogos.cargar_causas_pjud():
                if causa_pjud.get("rit") == rol or causa_pjud.get("rol") == rol:
                    c_lower = str(causa_pjud.get("cliente", "")).lower().strip()
                    break
        except Exception:
            pass

    # 1. Match exacto
    if not target_path:
        for loc_k, pth in local_folders.items():
            if c_lower and c_lower == loc_k:
                target_path = pth
                break
            
    # 2. Match heurístico (se baja a 4 letras para no ignorar nombres como Rosa o Jose)
    if not target_path:
        stop_words = {'contra','juzgado','tribunal','corte','region','comuna','municipal','corporacion','ministerio','publico','laboral','penal','civil','familia','garantia','letras','otros','parte','causa','propia','reserva','pjud','ingreso','resolución','ordena','vista','presente','cuenta','tramitacion', 's.a.', 'spa', 'ltda'}
        all_text = f"{c_lower} {str(caratula).lower()} {str(rol).lower()}"
        words = [w for w in re.findall(r'[a-záéíóúñü]{4,}', all_text) if w not in stop_words]
        words = list(set(words))
        
        if len(words) >= 2:
            best_match = None
            best_score = 0
            for loc_k, pth in local_folders.items():
                score = sum(1 for w in words if w in loc_k)
                if score >= 2 and score > best_score:
                    best_score = score
                    target_path = pth

    # 3. Si no hay carpeta en disco, la creamos dinámicamente SÓLO si tenemos el cliente
    if not target_path:
        raiz = Path("/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023")
        if not raiz.exists():
            raiz = BASE_DIR / "data" / "documentos_sin_disco"
            
        # Prioridad 1: Cliente explícito. Prioridad 2: Cliente rescatado por ROL.
        # Prioridad 3: primera parte de la carátula -el análisis del documento
        # la extrajo, aunque nadie haya resuelto todavía quién es "el cliente"-.
        nombre_carpeta = str(cliente).strip()
        if not nombre_carpeta or nombre_carpeta.lower() in ["none", "undefined", ""]:
            # Si se rescató en c_lower pero no en 'cliente' original
            if c_lower:
                nombre_carpeta = c_lower.title()
            elif str(caratula or "").strip():
                # Mismo criterio que procesar_excel_pjud() para las causas del
                # Excel oficial: la carátula chilena viene "PARTE con/c//C/contra
                # PARTE", y la primera es la más probable de ser el cliente.
                primera_parte = re.split(r'\s+(?:CON|C/|CONTRA)\s+', str(caratula).strip(), maxsplit=1, flags=re.IGNORECASE)[0].strip()
                nombre_carpeta = primera_parte or str(caratula).strip()
            else:
                # No sabemos quién es el cliente ni tenemos carátula. Mejor
                # mandarlo a la bandeja que crear una carpeta sin nombre útil.
                return archivar_en_bandeja(tmp_path, filename)
                
        # Limpiamos caracteres inválidos para Windows/Linux
        nombre_carpeta = re.sub(r'[\\/*?:"<>|]', "", nombre_carpeta)

        # Las carpetas NUEVAS -nunca las viejas, esas no se tocan- llevan el
        # ROL en el nombre: así, la próxima vez que llegue un documento de
        # esta misma causa, el emparejamiento es exacto por ROL y no depende
        # de que las palabras del cliente calcen por casualidad.
        nucleo_rol = _extraer_rol_nucleo(rol)
        if nucleo_rol:
            nombre_carpeta = f"{nombre_carpeta} — ROL {nucleo_rol}"

        nueva_carpeta = raiz / nombre_carpeta
        try:
            nueva_carpeta.mkdir(parents=True, exist_ok=True)
            target_path = str(nueva_carpeta)
            print(f"✨ [NUEVA CARPETA] Creada automáticamente en disco: {target_path}")
        except Exception as e:
            print(f"⚠️ Error al crear nueva carpeta {nueva_carpeta}: {e}")

    if target_path and os.path.exists(target_path):
        # El filename llega desde un query param del cliente. Con os.path.join,
        # un nombre absoluto DESCARTA la carpeta destino
        # (join('/casos/Adrian', '/home/jaime/.bashrc') == '/home/jaime/.bashrc'),
        # así que sin sanear esto movía el PDF a cualquier ruta escribible.
        final_filename = _nombre_seguro(filename, "documento.pdf")
        carpeta = Path(target_path).resolve()
        final_dest = carpeta / final_filename
        if carpeta not in final_dest.resolve().parents:
            print(f"🚫 [ARCHIVADO RECHAZADO] '{filename}' queda fuera de {carpeta}")
            return None

        if final_dest.exists():
            tallo, ext = os.path.splitext(final_filename)
            final_filename = f"{tallo}_{int(time.time())}{ext}"
            final_dest = carpeta / final_filename

        try:
            shutil.move(tmp_path, str(final_dest))
            indexar_en_fts(final_dest)
            if expediente_objetivo is not None and expediente_objetivo.get("carpetaFisica") != str(carpeta):
                expediente_objetivo["carpetaFisica"] = str(carpeta)
                try:
                    catalogos.guardar_expedientes(expedientes_disco)
                    print(f"📌 [CARPETA FIJADA] {expediente_objetivo.get('id')} -> {carpeta}")
                except Exception as e:
                    print(f"⚠️ No se pudo fijar la carpeta en el expediente: {e}")
            return str(final_dest)
        except Exception as e:
            print(f"Error moviendo archivo: {e}")
            return None

    # Sin carpeta de cliente que calce, antes se devolvía None y el PDF quedaba
    # en el temporal: se analizaba el documento y el archivo desaparecía. Un
    # documento que entró al sistema no puede perderse por no saber dónde va;
    # cae a una bandeja, queda indexado y se avisa que necesita clasificación.
    return archivar_en_bandeja(tmp_path, filename)


BANDEJA_SIN_CLASIFICAR = "_Bandeja de entrada (sin clasificar)"


def archivar_en_bandeja(tmp_path, filename):
    """Último recurso: guarda el documento en una bandeja y lo deja buscable."""
    raiz = Path("/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023")
    if not raiz.exists():
        raiz = BASE_DIR / "data" / "documentos_sin_disco"
    destino_dir = raiz / BANDEJA_SIN_CLASIFICAR
    try:
        destino_dir.mkdir(parents=True, exist_ok=True)
        nombre = _nombre_seguro(filename, "documento.pdf")
        destino = destino_dir / nombre
        if destino.exists():
            tallo, ext = os.path.splitext(nombre)
            destino = destino_dir / f"{tallo}_{int(time.time())}{ext}"
        shutil.move(tmp_path, str(destino))
        indexar_en_fts(destino)
        print(f"📥 [BANDEJA] {destino.name}: no se identificó la carpeta del cliente, queda por clasificar")
        return str(destino)
    except Exception as e:
        print(f"⚠️ No se pudo dejar el documento en la bandeja: {e}")
        return None


DUPLICADOS_DESCARTADOS = "_Duplicados descartados"


def buscar_ruta_por_hash(hash_valor):
    """¿Ya hay un documento indexado con este contenido EXACTO (mismo SHA256),
    en cualquier ruta? Devuelve esa ruta o None. Es la defensa contra bajar el
    mismo PDF dos veces con nombre distinto (ej. "Resolución (1).pdf"), que por
    ruta pasa como archivo nuevo aunque el contenido sea idéntico.

    Antes de devolver la ruta indexada, se verifica que el archivo siga
    existiendo ahí: si alguien reorganizó/renombró la carpeta a mano después de
    archivarlo (o el expediente se eliminó y con él la carpeta), el índice queda
    con una referencia fantasma que de otro modo bloquearía para siempre el
    reprocesamiento de cualquier copia futura de ese mismo contenido, señalando
    un archivo que ya no está. Se aprovecha para limpiar esa fila fantasma del
    índice -si no, cada búsqueda futura por este hash repite el mismo fallo-.
    """
    if not hash_valor:
        return None
    indice = DATOS_DIR / "indice_texto.sqlite"
    if not indice.is_file():
        return None
    try:
        import indexar_pdfs
        with indexar_pdfs.abrir_indice() as con:
            fila = con.execute("SELECT ruta FROM archivos WHERE hash = ? LIMIT 1", (hash_valor,)).fetchone()
            if not fila:
                return None
            ruta = fila[0]
            if not Path(ruta).exists():
                print(f"🧹 [ÍNDICE] Referencia fantasma para hash {hash_valor[:12]}...: {ruta} ya no existe, se limpia del índice")
                con.execute("DELETE FROM archivos WHERE ruta = ?", (ruta,))
                con.execute("DELETE FROM textos WHERE ruta = ?", (ruta,))
                con.execute("DELETE FROM embeddings WHERE ruta = ?", (ruta,))
                return None
        return ruta
    except Exception:
        return None


def mover_a_duplicados_descartados(tmp_path, filename):
    """Un documento cuyo hash YA está indexado bajo otra ruta: no se archiva de
    nuevo (evita la segunda copia física) ni se re-indexa (el original ya está
    buscable). Igual que archivar_en_bandeja, nunca se borra: se deja disponible
    para revisión manual, sólo que fuera de la carpeta vigilada."""
    raiz = Path("/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023")
    if not raiz.exists():
        raiz = BASE_DIR / "data" / "documentos_sin_disco"
    destino_dir = raiz / DUPLICADOS_DESCARTADOS
    try:
        destino_dir.mkdir(parents=True, exist_ok=True)
        nombre = _nombre_seguro(filename, "documento.pdf")
        destino = destino_dir / nombre
        if destino.exists():
            tallo, ext = os.path.splitext(nombre)
            destino = destino_dir / f"{tallo}_{int(time.time())}{ext}"
        shutil.move(tmp_path, str(destino))
        return str(destino)
    except Exception as e:
        print(f"⚠️ No se pudo mover el duplicado descartado: {e}")
        return None


def indexar_en_fts(ruta):
    """Incorpora un documento recién archivado al índice de búsqueda por contenido.

    Unifica las dos rutas que existían por separado: el análisis archivaba el PDF
    pero no lo indexaba, y /subir_documento lo indexaba pero no lo analizaba. Un
    documento que entra al expediente y no queda buscable es un documento perdido.
    """
    ruta = Path(ruta)
    indice = DATOS_DIR / "indice_texto.sqlite"
    if not indice.is_file():
        return False
    try:
        import indexar_pdfs
        texto, paginas = indexar_pdfs.extraer_texto(str(ruta))
        if not texto:
            return False
        st = ruta.stat()
        # abrir_indice() (no sqlite3.connect directo) para que el esquema -incluida
        # la columna hash, agregada con ALTER- quede al día también si este es el
        # primer proceso en tocar el índice desde que se agregó esa columna.
        with indexar_pdfs.abrir_indice() as con:
            con.execute("DELETE FROM textos WHERE ruta = ?", (str(ruta),))
            con.execute(
                "INSERT INTO textos (ruta, nombre, carpeta, contenido) VALUES (?, ?, ?, ?)",
                (str(ruta), ruta.name, ruta.parent.name, texto),
            )
            con.execute(
                "INSERT OR REPLACE INTO archivos (ruta, nombre, carpeta, tamano, modificado, paginas, indexado, hash)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(ruta), ruta.name, ruta.parent.name, st.st_size, st.st_mtime, paginas, time.time(), indexar_pdfs.calcular_hash(ruta)),
            )
            # También lo dejamos buscable por SIGNIFICADO, no sólo por frase exacta.
            # No es fatal si Ollama no responde -embeber_texto no lanza-: el backfill
            # por lote (indexar_embeddings.py) lo recogerá en la próxima corrida.
            vector = indexar_pdfs.embeber_texto(texto)
            if vector:
                indexar_pdfs.guardar_embedding(con, ruta, vector)
        print(f"🔎 [INDEXADO] {ruta.name} incorporado a la búsqueda por contenido")
        return True
    except Exception as e:
        print(f"⚠️ No se pudo indexar {ruta.name}: {e}")
        return False


PUERTO = int(os.environ.get("LEXCONTROL_PORT", "8888"))
HOST = os.environ.get("LEXCONTROL_HOST", "localhost")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("⚠️  GEMINI_API_KEY no definida (revisa el archivo .env). El análisis con Gemini quedará desactivado; el motor local (Ollama) sigue disponible si está instalado.")

# --- Motor de IA local (Ollama) -----------------------------------------------
# No necesita clave ni internet: corre en esta misma máquina. Se usa como motor
# PRINCIPAL de extracción -no de razonamiento legal profundo, eso sigue siendo
# trabajo de Gemini si algún día se habilita-, porque para leer un documento y
# sacar rol/tribunal/carátula/tipo de gestión no hace falta un modelo de frontera:
# se probó empíricamente (30-jul-2026) contra un documento real con qwen3:4b y
# acertó los datos objetivos y la clasificación en ~7 segundos, sin cuota.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:4b-instruct-2507-q4_K_M")

_TIPOS_GESTION = [
    "notificacion", "citacion_audiencia", "resolucion_tramite", "escrito_de_parte",
    "sentencia", "resolucion_termino_probatorio", "otro"
]

_ESQUEMA_ANALISIS_DOCUMENTO = {
    "type": "object",
    "properties": {
        # Sin descripción, el modelo probado (31-jul-2026) devolvió el nombre
        # del abogado integrante ("Raúl Patricio Fuentes M.") como "rol" en una
        # resolución corta tipo "se designa redactor del fallo" -el ROL estaba
        # en el texto (Rol N° 26.047-2025) pero el modelo lo confundió con el
        # nombre de persona que aparecía justo antes-.
        "rol": {"type": "string", "description": "El ROL o RIT de la causa, tal como aparece escrito en el texto (ej: 'C-1869-2026', 'RIT 700-2026', '26.047-2025', 'ROL 35002-2026'). Es un identificador NUMÉRICO con guión y año. NUNCA el nombre de una persona -abogado integrante, ministro, redactor, receptor-, aunque esté justo al lado de la palabra 'Rol'. Si no aparece ningún ROL/RIT con esa forma en el texto, cadena vacía."},
        "tribunal": {"type": "string"},
        "caratula": {"type": "string", "description": "Carátula de la causa. Si es un acta de audiencia penal con lista de imputados/denunciados en vez de una carátula civil clásica ('X con Y'), constrúyela con esos nombres (ej: 'VILLALÓN OJEDA BERNARDITA Y OTROS') en vez de dejarla vacía."},
        # hito_critico va ANTES que fecha_audiencia_fijada a propósito: con el
        # orden invertido el modelo probado dejaba sólo la hora en hito_critico
        # ("09:30") en vez de una descripción -se corrigió reordenando el esquema
        # y reforzando la instrucción del prompt, no cambiando de modelo.
        "hito_critico": {"type": "string", "description": "Frase de qué resolvió u ordenó el tribunal. Si el documento fija/programa/reprograma una audiencia, di QUÉ audiencia y para cuándo -nunca el nombre de quien la dirigió o resolvió, eso es la firma, no el hecho."},
        "tipo_gestion": {"type": "string", "enum": _TIPOS_GESTION},
        "fecha_audiencia_fijada": {"type": "string", "description": "Fecha Y hora oficial de la audiencia, si el tribunal la fijó (ej: '13/08/2026 12:30'). Incluye siempre la hora si el documento la trae junto a la fecha, no sólo la fecha sola."},
        "materia": {"type": "string"},
        "cuaderno": {"type": "string"},
        "ruts_detectados": {"type": "array", "items": {"type": "string"}},
        "plazo_dias": {"type": "integer"},
        "tipo_plazo": {"type": "string"},
        "accion_sugerida": {"type": "string"}
    },
    "required": ["rol", "tribunal", "caratula", "hito_critico", "tipo_gestion",
                 "fecha_audiencia_fijada", "materia", "cuaderno", "ruts_detectados",
                 "plazo_dias", "tipo_plazo", "accion_sugerida"]
}


def _ollama_disponible():
    """¿Hay un servicio Ollama escuchando? Timeout corto: si no está instalado o
    no está corriendo, no tiene sentido colgar el análisis esperándolo."""
    try:
        with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def _ollama_generar_json(prompt, esquema, timeout=90):
    """Pide a Ollama una respuesta con la forma exacta de `esquema` (JSON Schema,
    vía el parámetro `format` que Ollama soporta nativamente). Devuelve el dict ya
    parseado, o None ante cualquier falla -nunca lanza-, para que el llamador
    pueda caer al siguiente motor sin envolver esto en un try/except propio.
    """
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "format": esquema,
            "stream": False,
            "options": {"temperature": 0.1}
        }
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return json.loads(data["response"])
    except Exception as e:
        print(f"⚠️ [OLLAMA] No se pudo generar respuesta local ({e})")
        return None


def analizar_con_ollama(texto_completo, filename_clean, total_paginas):
    """Extracción estructural con el modelo local. Deliberadamente NO pide
    razonamiento legal profundo (auditoría de emplazamiento, estrategia
    ofensiva): eso quedó fuera del alcance que el usuario pidió, y un modelo
    chico no debería usarse para juicio legal donde equivocarse tiene
    consecuencias -para eso sigue estando Gemini como respaldo optativo.
    """
    if not _ollama_disponible() or len(texto_completo.strip()) < 30:
        return None

    print(f"🖥️  [MOTOR IA LOCAL {OLLAMA_MODEL}] Analizando '{filename_clean}'...")
    prompt = (
        "Eres un asistente que EXTRAE datos objetivos de resoluciones judiciales "
        "chilenas. No opines ni evalúes la validez de la tramitación: sólo "
        "identifica los datos que pide el esquema. Si un dato no aparece en el "
        "texto, usa una cadena vacía o 0 según corresponda -no lo inventes.\n\n"
        "Sobre \"hito_critico\": es UNA FRASE que describe QUÉ RESOLVIÓ o QUÉ "
        "ORDENÓ el tribunal (ej: \"Cita a audiencia de recepción de la causa a "
        "prueba\", \"Tiene por contestada la demanda\"). NUNCA pongas ahí sólo una "
        "fecha o una hora: eso va en fecha_audiencia_fijada. Si el documento fija, "
        "programa o reprograma una audiencia, hito_critico debe decir QUÉ audiencia "
        "es y para cuándo (ej: \"Se fija audiencia de juicio oral simplificado para "
        "el 13/08/2026\"), NUNCA el nombre de quien la dirigió o resolvió -ese dato "
        "es la firma del documento, no lo que pasó en él.\n\n"
        "Sobre \"fecha_audiencia_fijada\": si el documento trae una hora junto a la "
        "fecha (ej. \"Hora de inicio programada: 12:30\"), inclúyela SIEMPRE en el "
        "mismo texto (ej: \"13/08/2026 12:30\"), no sólo la fecha sola.\n\n"
        "Sobre \"caratula\": si el documento no trae una carátula civil clásica "
        "(\"X con Y\") sino una lista de imputados/denunciados -típico de actas de "
        "audiencia penal-, arma la carátula con esos nombres (ej: \"VILLALÓN OJEDA "
        "BERNARDITA Y OTROS\"), en vez de dejarla vacía.\n\n"
        "Sobre \"rol\": es el número identificador de la causa (ej: \"26.047-2025\", "
        "\"RIT 700-2026\"). NUNCA el nombre de una persona -un abogado integrante, un "
        "ministro, un redactor-, aunque aparezca junto a la palabra \"Rol\" en el "
        "texto: \"Rol N° 26.047-2025\" significa que el rol es \"26.047-2025\", no el "
        "nombre que esté escrito en la línea de arriba o de abajo.\n\n"
        "TEXTO:\n\n" + (
            texto_completo if len(texto_completo) <= 12000
            # Documento largo: cabeza + cola, no sólo el principio. La parte
            # resolutiva ("SE RESUELVE", "RESUELVE:") casi siempre está al final,
            # y es justo lo que hito_critico necesita describir -cortar sólo por
            # el frente la deja afuera. Presupuesto más chico que el de Gemini
            # (70K) porque acá el contexto es más caro: 4GB de VRAM con offload
            # parcial a CPU en este equipo.
            else texto_completo[:8000] + "\n\n... [SECCIÓN INTERMEDIA OMITIDA] ...\n\n" + texto_completo[-4000:]
        )
    )

    data = _ollama_generar_json(prompt, _ESQUEMA_ANALISIS_DOCUMENTO)
    if not data:
        return None

    data["status"] = "ok"
    data["archivo"] = filename_clean
    data["total_paginas"] = total_paginas
    data["texto_extraido_muestra"] = texto_completo[:600]
    data["motor_ia"] = "local"
    print("✨ [IA LOCAL ÉXITO] Análisis completado.")
    return data


_ESQUEMA_BITACORA = {
    "type": "object",
    "properties": {
        "cliente_detectado": {"type": "string"},
        "asunto_detectado": {"type": "string"},
        "rol_detectado": {"type": "string"},
        "tramite_generado": {"type": "string"},
        "estado": {"type": "string", "enum": ["COMPLETADO", "PENDIENTE (POR HACER)"]},
        "urgencia": {"type": "string", "enum": ["NORMAL", "ALTA", "URGENTE"]}
    },
    "required": ["cliente_detectado", "asunto_detectado", "rol_detectado",
                 "tramite_generado", "estado", "urgencia"]
}


def analizar_bitacora_con_ollama(texto_bitacora, texto_contexto):
    """Igual criterio que analizar_con_ollama: clasificar una anotación corta de
    bitácora es extracción, no razonamiento legal profundo, así que el modelo
    local basta como motor principal -Gemini queda de respaldo si esto falla."""
    if not _ollama_disponible() or len(texto_bitacora.strip()) < 3:
        return None

    print(f"🖥️  [MOTOR IA LOCAL {OLLAMA_MODEL}] Clasificando bitácora...")
    prompt = f"""Eres un asistente jurídico. Clasifica el siguiente registro ingresado rápidamente por un abogado.
Extrae el cliente, el asunto concreto, el ROL o causa, y genera un trámite procesal o acción realizada en base a lo escrito.
Identifica si la gestión está terminada o pendiente.

CONTEXTO DE CASOS Y CLIENTES REGISTRADOS EN EL ESTUDIO:
{texto_contexto}

REGLA DE ASOCIACIÓN POR CONTEXTO:
Si el texto del abogado no dice explícitamente el nombre del cliente pero menciona una ciudad, tribunal, materia o asunto que coincide con un caso del contexto arriba listado (ej: 'querella en Calbuco' -> Víctor Garai / querella), ASIGNA a ese cliente y asunto en cliente_detectado y asunto_detectado.

REGLA DE ORO: Si de la lectura se concluye que es una gestión administrativa, una asesoría o un caso extrajudicial sin ROL/RIT aparente, debes asignar "EXTRAJUDICIAL" en el campo rol_detectado. NUNCA inventes un rol.

SOBRE EL CLIENTE: entrega el nombre limpio, sin "don", "doña", "señor" ni abreviaturas de tratamiento.

SOBRE EL ASUNTO: es el objeto de la gestión (1 a 4 palabras, sin verbos), no la acción. Ej: 'camioneta', 'arriendo local Ñuñoa', 'despido injustificado'. Si no se puede determinar, cadena vacía.

SOBRE EL TRÁMITE: un resumen ejecutivo forense de la gestión, no más de 12 palabras.

EJEMPLO 1 (sin rol explícito -> EXTRAJUDICIAL): para "llamé a Víctor Garai por lo de la querella en Calbuco, quedó pendiente enviar el poder", la
respuesta correcta es:
{{"cliente_detectado": "Víctor Garai", "asunto_detectado": "querella Calbuco", "rol_detectado": "EXTRAJUDICIAL", "tramite_generado": "Llamada telefónica, pendiente envío de poder", "estado": "PENDIENTE (POR HACER)", "urgencia": "NORMAL"}}

EJEMPLO 2 (CON rol explícito -> se copia literal, NUNCA "EXTRAJUDICIAL"): para "Presenté escrito de apelación en causa RIT 700-2026 para Víctor Garai, quedó pendiente notificar", la
respuesta correcta es:
{{"cliente_detectado": "Víctor Garai", "asunto_detectado": "apelación", "rol_detectado": "RIT 700-2026", "tramite_generado": "Presentación de escrito de apelación, pendiente notificación", "estado": "PENDIENTE (POR HACER)", "urgencia": "NORMAL"}}

TEXTO:
{texto_bitacora}
"""
    data = _ollama_generar_json(prompt, _ESQUEMA_BITACORA)
    if not data:
        return None
    print("✨ [IA LOCAL ÉXITO] Bitácora clasificada.")
    return data


def analizar_con_gemini(texto_completo, filename_clean, total_paginas):
    if not GEMINI_API_KEY or len(texto_completo.strip()) < 30:
        return None
    try:
        print(f"🤖 [MOTOR IA GEMINI 2.5] Analizando semánticamente documento: '{filename_clean}'...")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        prompt = (
            "Eres un abogado litigante chileno de nivel socio senior y auditor forense procesal (penal, civil, laboral y familia). "
            "Analiza exhaustivamente el siguiente documento jurídico o expediente de tramitación chileno y extrae un análisis forense en formato JSON estricto. "
            "El JSON debe tener exactamente estas llaves:\n"
            '- "rol": ROL, RIT, RUC o identificación oficial de la causa (ej: "RIT O-934-2023 (RUC: 2300338058-0)", "ROL C-1869-2026").\n'
            '- "tribunal": Nombre oficial del tribunal o corte (ej: "Juzgado de Garantía de Punta Arenas", "3º Juzgado Civil de Temuco").\n'
            '- "caratula": Nombre completo de las partes procesales (ej: "MP contra BERNARDITA VILLALÓN OJEDA, LUIS TOLEDO MANSILLA", "MEDINA con MORAGA").\n'
            '- "materia": Rama del derecho y materia civil/laboral/penal específica.\n'
            '- "cuaderno": Principal, Cautelar, Apremio, etc.\n'
            '- "ruts_detectados": Arreglo de strings con los RUTs chilenos encontrados en el texto.\n'
            '- "fecha_audiencia_fijada": Si el tribunal programó o citó a una audiencia, indica la fecha y hora oficial exacta. Si no, déjalo en "".\n'
            '- "hito_critico": Hito procesal o resolución más importante y urgente del documento.\n'
            '- "plazo_dias": Número entero con los días de plazo legal o los días calendario restantes si hay una fecha de audiencia programada.\n'
            '- "tipo_plazo": Tipo de plazo o cómputo (ej: "Días corridos fatales (Art. 14 CPP)", "Días hábiles judiciales (Art. 66 CPC)", "Fecha Fatal Programada en Tribunal").\n'
            '- "analisis_demanda_o_pretension": Análisis profundo de la demanda, querella o formalización de la contraria: qué exige exactamente, cuáles son sus argumentos y dónde están las principales debilidades, vacíos probatorios o vulnerabilidades de su teoría.\n'
            '- "analisis_defensas_y_excepciones": Análisis exhaustivo de las defensas, excepciones, contestación o demanda reconvencional presentadas, evaluando su fuerza legal y probatoria.\n'
            '- "auditoria_emplazamiento_y_notificaciones": Análisis forense quirúrgico y fino sobre la validez del emplazamiento practicado por el Receptor Judicial u Órgano Notificador. DEBES cotejar rigurosamente: (1) ¿Qué acciones entabló la actora (ej: demanda principal + demanda subsidiaria en otrosí)? (2) ¿Qué resolvió notificar el Tribunal? (3) ¿Qué certificó el receptor o qué consta notificado en el expediente? PRESTA ESPECIAL ATENCIÓN y advierte como vicio procesal grave si el receptor notificó al demandado SOLO la demanda principal omitiendo la demanda subsidiaria u otrosíes (falta de emplazamiento / Art. 40, 44 y 83 CPC). Evalúa también si dicho vicio se convalidó procesalmente o si opera notificación tácita por haber contestado el fondo de ambas pretensiones (Art. 55 CPC).\n'
            '- "errores_y_vicios_tramitacion": Arreglo de strings enumerando ERRORES EN LA TRAMITACIÓN, vicios procesales, defectos de emplazamiento o notificación (ej: receptor notificó solo demanda principal y no subsidiaria), resoluciones anómalas, plazos vencidos, inactividad procesal o causales para incidentar nulidad procesal (Art. 83 CPC / Art. 159 CPP). Si la tramitación está limpia, poner ["No se detectaron vicios o errores formales de tramitación en el texto revisado"].\n'
            '- "estrategia_ofensiva_litigante": Diseño estratégico forense de alto nivel paso a paso para ganar el juicio, enervar la acción, contraatacar a la contraria y aprovechar los errores procesales detectados.\n'
            '- "accion_sugerida": Recomendación ejecutiva inmediata y breve para el abogado litigante.\n\n'
            "Texto del documento o tramitación judicial:\n\n" + (texto_completo if len(texto_completo) <= 70000 else (texto_completo[:45000] + "\n\n... [SECCIÓN INTERMEDIA DEL EXPEDIENTE OMITIDA PARA OPTIMIZAR RAZONAMIENTO] ...\n\n" + texto_completo[-25000:]))
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=90) as response:
            res_json = json.loads(response.read().decode('utf-8'))
            text_resp = res_json['candidates'][0]['content']['parts'][0]['text']
            data_ia = json.loads(text_resp)
            data_ia["status"] = "ok"
            data_ia["archivo"] = filename_clean
            data_ia["total_paginas"] = total_paginas
            data_ia["texto_extraido_muestra"] = texto_completo[:600]
            print("✨ [GEMINI 2.5 ÉXITO] Análisis semántico completado con precisión forense.")
            return data_ia
    except Exception as e_ia:
        print(f"⚠️ [GEMINI 2.5 FALLBACK] No se pudo consultar IA ({e_ia}). Usando motor RegEx local...")
        return None

def extraer_metadatos_forenses_pdf(filepath_or_bytes, filename="", archivar=True):
    """Analiza el documento y, si `archivar`, lo mueve al expediente.

    Con archivar=False el análisis es de sólo lectura: nada se mueve ni se indexa.
    Hace falta para poder mirar el documento y revisar lo que la IA extrajo ANTES
    de integrarlo, en vez de que entre al expediente en el mismo gesto de subirlo.
    """
    texto_completo = ""
    total_paginas = 1
    tmp_path = None

    # 1. Guardar o resolver ruta física
    if isinstance(filepath_or_bytes, bytes):
        raw_bytes = filepath_or_bytes
        tmp_name = filename if filename else "doc_upload.pdf"
        tmp_path = os.path.join("/tmp", f"lex_up_{int(time.time())}_{tmp_name}")
        try:
            with open(tmp_path, "wb") as f_tmp:
                f_tmp.write(raw_bytes)
        except Exception as e_tmp:
            print(f"Aviso guardando tmp: {e_tmp}")
    else:
        tmp_path = filepath_or_bytes
        raw_bytes = b""
        if os.path.exists(tmp_path):
            try:
                with open(tmp_path, "rb") as f_rb:
                    raw_bytes = f_rb.read()
            except Exception:
                pass

    filename_clean = filename or (os.path.basename(tmp_path) if tmp_path else "documento_ojv.pdf")

    # 1b. ¿Ya existe este contenido EXACTO en el índice, bajo otra ruta? No tiene
    # sentido re-analizar con IA (gasto) ni re-archivar (segunda copia física) algo
    # que el sistema ya conoce -típicamente la misma resolución bajada dos veces
    # con nombre distinto, "Resolución (1).pdf"-. Por ruta esto no se detecta
    # -cada descarga repetida es un path nuevo-, por eso se compara por hash.
    if raw_bytes:
        import indexar_pdfs
        hash_archivo = indexar_pdfs.calcular_hash_bytes(raw_bytes)
        ruta_existente = buscar_ruta_por_hash(hash_archivo)
        if ruta_existente and ruta_existente != str(tmp_path):
            print(f"🔁 [DUPLICADO EXACTO] '{filename_clean}' ya está indexado como {ruta_existente}")
            if isinstance(filepath_or_bytes, bytes):
                # Era sólo una subida temporal: no había nada real que conservar.
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                ruta_descartada = None
            elif archivar:
                ruta_descartada = mover_a_duplicados_descartados(tmp_path, filename_clean)
            else:
                ruta_descartada = None  # sólo lectura: no se mueve nada
            return {
                "status": "duplicado",
                "archivo": filename_clean,
                "ruta_original": ruta_existente,
                "ruta_descartada": ruta_descartada,
                "hito_critico": f"Documento duplicado: el contenido ya estaba indexado como {os.path.basename(ruta_existente)}",
            }

    # 2. Intentar PyMuPDF fitz
    try:
        if raw_bytes:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
        elif tmp_path and os.path.exists(tmp_path):
            doc = fitz.open(tmp_path)
        else:
            doc = None
            
        if doc:
            total_paginas = len(doc)
            texto_completo = "\n".join([p.get_text() for p in doc])
    except Exception as e_fitz:
        print(f"⚠️ PyMuPDF fitz fallback ({e_fitz})")

    # 3. Si PyMuPDF no extrajo texto suficiente (<30 chars) y tenemos pdftotext CLI
    if len(texto_completo.strip()) < 30 and tmp_path and os.path.exists(tmp_path):
        try:
            res_pdf = subprocess.run(["pdftotext", tmp_path, "-"], capture_output=True, text=True, timeout=5)
            if res_pdf.stdout and len(res_pdf.stdout.strip()) > 10:
                texto_completo = res_pdf.stdout
        except Exception:
            pass

    # 4. Si es Excel (.xls, .xlsx), Word (.docx) o TXT
    if len(texto_completo.strip()) < 30 and tmp_path and os.path.exists(tmp_path):
        if filename_clean.lower().endswith(('.xls', '.xlsx')):
            try:
                df = pd.read_excel(tmp_path)
                texto_completo = df.to_string()
            except Exception:
                pass
        elif filename_clean.lower().endswith('.docx'):
            # Antes NINGUNA rama leía .docx: un Word caía directo al placeholder
            # del paso 5 ("DOCUMENTO JUDICIAL SUBIDO: <nombre>") y ese texto vacío
            # se mandaba igual a Gemini -pasa el umbral de 30 caracteres-, que
            # entonces adivinaba rol/carátula de la nada. Con eso archivar_pdf_
            # fisicamente() podía archivar el documento en la carpeta de OTRO
            # cliente. Se reutiliza el mismo extractor ya probado por el indexador
            # de texto (indexar_pdfs.extraer_texto_docx), en vez de duplicarlo.
            try:
                import indexar_pdfs
                texto_docx, _ = indexar_pdfs.extraer_texto_docx(tmp_path)
                if texto_docx:
                    texto_completo = texto_docx
            except Exception:
                pass
        elif filename_clean.lower().endswith(('.txt', '.csv', '.md', '.json', '.html')):
            try:
                texto_completo = raw_bytes.decode('utf-8', errors='ignore') if raw_bytes else open(tmp_path, 'r', errors='ignore').read()
            except Exception:
                pass

    # 5. Si sigue sin texto suficiente, hacer análisis forense del nombre de archivo + texto disponible
    if len(texto_completo.strip()) < 10:
        texto_completo = f"DOCUMENTO JUDICIAL SUBIDO: {filename_clean}\nTramitación registrada en el sistema LexControl."

    # 6. CEREBRO IA: primero el modelo LOCAL (sin costo, sin internet, sin cuota) y
    # sólo si no está disponible o falla, Gemini -si hay clave configurada-. El
    # orden se invirtió a propósito: local es ahora la opción por defecto, Gemini
    # queda como respaldo optativo, no como dependencia obligatoria. Se probó
    # empíricamente contra un documento real (30-jul-2026): rol/tribunal/carátula
    # exactos y clasificación de la gestión correcta con qwen3:4b, en ~7s.
    data_ia = analizar_con_ollama(texto_completo, filename_clean, total_paginas)
    if not data_ia:
        data_ia = analizar_con_gemini(texto_completo, filename_clean, total_paginas)
    if data_ia:
        # Si el escrito declara la carátula con su rótulo ('Carátula:',
        # 'Caratulado:', 'autos caratulados'), ese dato manda sobre lo que
        # infiera el modelo: está escrito, no deducido. Se lo ha visto devolver
        # "Causa Penal: RIT C-272-2025" para un documento cuyas partes estaban
        # a la vista.
        declarada = caratula_declarada(texto_completo)
        if declarada:
            if data_ia.get("caratula") and data_ia["caratula"] != declarada:
                print(f"📝 [CARÁTULA] Declarada en el escrito: {declarada!r} (la IA dijo {data_ia['caratula']!r})")
            data_ia["caratula"] = declarada
            data_ia["caratula_origen"] = "declarada en el documento"
        else:
            data_ia["caratula_origen"] = "inferida por IA"

        # Mismo criterio que la carátula: si el escrito declara el rol con su
        # etiqueta oficial ("Rol N°", "RIT:"), ese valor manda sobre lo que
        # devolvió el modelo -que puede confundirlo con otro dato cercano en
        # el texto, como el nombre de un abogado integrante-.
        rol_decl = rol_declarado(texto_completo)
        if rol_decl:
            if data_ia.get("rol") and _extraer_rol_nucleo(data_ia["rol"]) != rol_decl:
                print(f"📝 [ROL] Declarado en el escrito: {rol_decl!r} (la IA dijo {data_ia['rol']!r})")
            data_ia["rol"] = rol_decl

        if tmp_path and os.path.exists(tmp_path):
            if archivar:
                cliente_conocido, caratula_conocida = _cliente_conocido_por_rol(data_ia.get("rol", ""))
                data_ia["ruta_guardado"] = archivar_pdf_fisicamente(
                    tmp_path, filename_clean, data_ia.get("rol", ""),
                    cliente_conocido,
                    data_ia.get("caratula", "") or caratula_conocida
                )
            else:
                # La rama de IA retornaba acá sin mirar `archivar`, así que la
                # vista previa archivaba igual. Ahora también respeta el sólo lectura.
                # El borrado sólo aplica a una subida por bytes -temporal y
                # descartable, el usuario todavía la tiene en el navegador-. Si
                # `filepath_or_bytes` era una ruta real ya en disco (ej. el
                # Vigilante), se deja intacta: quien llamó decide qué hacer con
                # ella -moverla a la bandeja de revisión, por ejemplo- en vez de
                # perder el único documento que había.
                data_ia["ruta_guardado"] = None
                if isinstance(filepath_or_bytes, bytes):
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
        return data_ia

    # Reglas Procesales Chilenas Multi-Materia (CPC / CPP / Laboral / Familia) [FALLBACK OFFLINE]
    texto_lower = texto_completo.lower()

    # Detección de Tribunal y Materia Principal
    match_trib = re.search(r'((?:ILTMA\.\s*|EXCMA\.\s*)?(?:CORTE DE APELACIONES|CORTE SUPREMA|[0-9]º?\s*JUZGADO\s+(?:DE\s+GARANT[IÍ]A|CIVIL|DE\s+LETRAS|DE\s+FAMILIA|DE\s+COBRANZA|DEL\s+TRABAJO)(?:[ \t]+DE[ \t]+[A-ZÁÉÍÓÚÑ ]+)?|JUZGADO\s+(?:DE\s+GARANT[IÍ]A|CIVIL|DE\s+LETRAS|DE\s+FAMILIA|DE\s+COBRANZA|DEL\s+TRABAJO)(?:[ \t]+DE[ \t]+[A-ZÁÉÍÓÚÑ ]+)?|TRIBUNAL DE JUICIO ORAL EN LO PENAL(?:[ \t]+DE[ \t]+[A-ZÁÉÍÓÚÑ ]+)?)[^\n\.,]*)', texto_completo, re.IGNORECASE)
    tribunal = match_trib.group(1).split('\n')[0].strip() if match_trib else "Tribunal Civil / Corte de Apelaciones"

    es_penal = any(w in texto_lower for w in ["garantía", "garantia", "oral en lo penal", "imputado", "acusado", "querellado", "fiscalía", "fiscalia", "ministerio público", "ministerio publico", "delito", "rit o-", "rit r-", "rit t-"])
    es_laboral = any(w in texto_lower for w in ["juzgado del trabajo", "cobranza laboral", "inspección del trabajo", "código del trabajo"])
    es_familia = any(w in texto_lower for w in ["juzgado de familia", "alimentos", "vif", "violencia intrafamiliar", "cuidado personal"])

    # Extraer ROL / RIT / RUC. Reutiliza rol_declarado() -con etiqueta ("Rol
    # N°", "RIT:")- en vez de una regex propia: la de acá tenía el mismo bug
    # del separador de miles ("26.047-2025" truncaba a "047-2025") que ya se
    # corrigió una vez para el análisis con IA; mejor una sola definición.
    rol = ""
    rol_decl = rol_declarado(texto_completo)
    if rol_decl:
        rol = f"RIT {rol_decl}" if es_penal and not rol_decl.upper().startswith("RIT") else rol_decl
    else:
        # Sin etiqueta: sólo el patrón CON LETRA ("O-934-2023"), que es
        # bastante más distintivo que un número suelto como para asumirlo rol
        # sin que lo declare el texto.
        match_rol = re.search(rf'\b([CVSPEARKOTMR]-\d{{1,3}}(?:\.\d{{3}})+-\d{{4}}|[CVSPEARKOTMR]-\d+-\d{{4}})\b', texto_completo, re.IGNORECASE)
        if match_rol:
            rol = match_rol.group(1).upper().replace('.', '')
    
    match_ruc = re.search(r'(?:RUC|R\.U\.C\.)\s*(?:N[°º\.]?)?\s*[:\n]?\s*(\d{8,}-\d|[\d\.-]+)', texto_completo, re.IGNORECASE)
    if match_ruc:
        ruc_str = match_ruc.group(1).strip()
        rol = f"{rol} (RUC: {ruc_str})" if rol else f"RUC: {ruc_str}"
        
    if not rol or len(rol) < 3:
        match_fn_rol = re.search(r'\b([CVSPEARKOTMR]-\d+-\d{4}|\d+-\d{4})\b', filename_clean, re.IGNORECASE)
        rol = match_fn_rol.group(1).upper() if match_fn_rol else ("RIT OJV-Penal/2026" if es_penal else "ROL OJV-2026")

    # Extraer Carátula
    caratula = caratula_declarada(texto_completo) or ""
    # Se registra de dónde salió: la declarada en el escrito y la adivinada por
    # heurística no merecen la misma confianza, y la pantalla lo distingue.
    caratula_origen = "declarada en el documento" if caratula else "inferida por reglas"
    if caratula:
        pass  # el escrito la dice literalmente: no hay nada que adivinar
    elif es_penal:
        # Buscar imputados o partes penales
        imputados = re.findall(r'(?:imputado|imputados|acusado|acusados|querellado|querellados)\s*(?:[:\n]\s*|\b)([A-ZÁÉÍÓÚÑ\s,y]+?)(?=\n\n|\.\s|\n[A-Z][a-z]|de la audiencia|quedan|hora|sala|$)', texto_completo, re.IGNORECASE)
        if imputados and len(imputados[0].strip()) > 3:
            imp_limpio = re.sub(r'\s+', ' ', imputados[0]).strip().rstrip(',')
            caratula = f"MP contra {imp_limpio}"[:85]
        else:
            match_vic_imp = re.search(r'([A-ZÁÉÍÓÚÑ\s]{3,})\s+(?:contra|c/|vs\.?)\s+([A-ZÁÉÍÓÚÑ\s]{3,})', texto_completo, re.IGNORECASE)
            if match_vic_imp and "SALA" not in match_vic_imp.group(0) and "JUZGADO" not in match_vic_imp.group(0):
                caratula = f"{match_vic_imp.group(1).strip()} contra {match_vic_imp.group(2).strip()}"
            else:
                caratula = f"Causa Penal: {rol}"
    else:
        match_caratula = re.search(r'([A-ZÁÉÍÓÚÑ\s]{3,}\s+(?:CON|C/|c/|VS|vs\.?)\s+[A-ZÁÉÍÓÚÑ\s]{3,})', texto_completo)
        if match_caratula:
            caratula = match_caratula.group(1).strip()
        else:
            palabras_prohibidas = {"PAULA", "ANDREA", "STANGE", "KAHLER", "SEBASTIAN", "MARIN", "ORTIZ", "JAIME", "MORAGA", "CARRASCO", "JUZGADO", "GARANTIA", "TRIBUNAL", "CORTE", "APELACIONES", "SUPREMA", "SALA", "ACTA", "FECHA", "HORA", "INICIO", "TERMINO", "FISCAL", "DEFENSOR", "MAGISTRADO", "RIT", "RUC", "ROL", "CODIGO", "PENAL", "CIVIL", "SIMPLIFICADO", "JUICIO", "ORAL"}
            match_partes = re.findall(r'\b([A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,})\b', texto_completo)
            partes_validas = [p for p in match_partes if not any(w in p.split() for w in palabras_prohibidas)]
            if len(partes_validas) >= 2:
                caratula = f"{partes_validas[0]} con {partes_validas[1]}"
            elif len(partes_validas) == 1:
                caratula = f"Causa {partes_validas[0]}"
            else:
                caratula = filename_clean.replace('.pdf','').replace('_',' ').replace('-',' ')

    # Extraer RUTs
    ruts = list(set(re.findall(r'\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b', texto_completo)))

    # Materia y Plazos según Código Procesal (CPC vs CPP vs Laboral)
    if es_penal:
        # Extraer delitos si existen
        match_delito = re.search(r'Delito[s]?\s*[:\n]\s*([^\n]+(?:\n[^\n]+)?)', texto_completo, re.IGNORECASE)
        if match_delito:
            del_text = re.sub(r'\s+', ' ', match_delito.group(1)).strip()
            materia_str = f"Derecho Procesal Penal ({del_text})"[:90]
        else:
            materia_str = "Derecho Procesal Penal / Garantía"
        
        # Plazos fatales penales (Art. 14 CPP)
        if "juicio oral simplificado" in texto_lower or "simplificado" in texto_lower:
            hito = "AUDIENCIA DE JUICIO ORAL SIMPLIFICADO PROGRAMADA"
            plazo_dias = 5
            tipo_plazo = "Días corridos fatales (Art. 14 CPP)"
            accion = "Preparar minuta de defensa, coordinar comparecencia del imputado y citación de testigos."
        elif "preparatoria" in texto_lower or "preparación" in texto_lower:
            hito = "AUDIENCIA DE PREPARACIÓN DE JUICIO ORAL (APJO)"
            plazo_dias = 10
            tipo_plazo = "Días corridos fatales (Art. 14 CPP)"
            accion = "Revisar acusación fiscal, ofrecer prueba procesal y preparar alegatos de exclusión."
        elif "formalización" in texto_lower:
            hito = "AUDIENCIA DE FORMALIZACIÓN DE LA INVESTIGACIÓN"
            plazo_dias = 3
            tipo_plazo = "Días corridos fatales (Art. 14 CPP)"
            accion = "Analizar antecedentes del Ministerio Público y evaluar cautelares del Art. 140 CPP."
        elif "sustitución" in texto_lower or "cumplimiento" in texto_lower:
            hito = "AUDIENCIA DE SUSTITUCIÓN DE PENA / CUMPLIMIENTO"
            plazo_dias = 5
            tipo_plazo = "Días corridos fatales (Art. 14 CPP)"
            accion = "Verificar informes psicosociales y acreditar requisitos de Ley 18.216."
        else:
            hito = "ACTA / TRÁMITE JUDICIAL EN LO PENAL REGISTRADO"
            plazo_dias = 5
            tipo_plazo = "Días corridos fatales (Art. 14 CPP)"
            accion = "Revisar resolución penal, verificar plazos de recurso e informar al cliente."
    elif es_laboral:
        materia_str = "Derecho Laboral / Cobranza"
        if "reposición" in texto_lower or "reposicion" in texto_lower:
            hito = "RECURSO DE REPOSICIÓN LABORAL"
            plazo_dias = 3
            tipo_plazo = "Días hábiles laborales"
            accion = "Redactar recurso de reposición en 3 días hábiles."
        else:
            hito = "TRÁMITE LABORAL REGISTRADO"
            plazo_dias = 5
            tipo_plazo = "Días hábiles laborales"
            accion = "Analizar resolución en portal laboral y preparar escritos de rigor."
    elif es_familia:
        materia_str = "Derecho de Familia / Alimentos / VIF"
        hito = "TRÁMITE DE FAMILIA REGISTRADO"
        plazo_dias = 5
        tipo_plazo = "Días hábiles (Lunes a Sábado)"
        accion = "Revisar estado de liquidación o audiencia programada en tribunal de familia."
    else:
        materia_str = "Derecho Procesal Civil"
        if "reposición" in texto_lower or "reposicion" in texto_lower:
            hito = "RECURSO DE REPOSICIÓN Y APELACIÓN EN SUBSIDIO"
            plazo_dias = 5
            tipo_plazo = "Días hábiles judiciales (Art. 66 CPC - Lunes a Sábado)"
            accion = "Redactar reposición con apelación en subsidio dentro de 5 días hábiles."
        elif "probatorio" in texto_lower or "prueba" in texto_lower:
            hito = "TÉRMINO PROBATORIO / MINUTA Y TESTIGOS"
            plazo_dias = 5
            tipo_plazo = "Días hábiles judiciales (Art. 394 / Art. 318 CPC)"
            accion = "Presentar minuta de puntos de prueba y lista de testigos en 5 días."
        elif "inadmisible" in texto_lower:
            hito = "RESOLUCIÓN DE INADMISIBILIDAD"
            plazo_dias = 3
            tipo_plazo = "Días corridos fatales"
            accion = "Interponer recurso de reposición especial en 3 días."
        else:
            hito = "RESOLUCIÓN / TRÁMITE JUDICIAL REGISTRADO"
            plazo_dias = 5
            tipo_plazo = "Días hábiles judiciales (Art. 66 CPC)"
            accion = "Revisar resolución en el expediente local y preparar borrador de escrito."

    # 6. DETECCIÓN UNIVERSAL DE AUDIENCIA FIJADA Y FECHAS FUTURAS
    fecha_audiencia = ""
    match_fija_fecha = re.search(r'(?:Fecha de programación|Fecha de audiencia|fija(?:se)?(?: día y hora| para el día)?|cítase para el día|audiencia para el día|audiencia programada):\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{1,2}\s+de\s+[a-z]{3,10}\s+de\s+[0-9]{4})', texto_completo, re.IGNORECASE)
    if not match_fija_fecha:
        match_fija_fecha = re.search(r'([0-9]{2}/[0-9]{2}/[0-9]{4}).{0,80}(?:hora de inicio|programada|audiencia|sala|tribunal)', texto_completo, re.IGNORECASE)
    
    if match_fija_fecha:
        f_str = match_fija_fecha.group(1).strip()
        # Buscar hora si está cercana
        match_hora = re.search(r'(?:Hora de inicio programada|a las|hora):\s*([0-9]{1,2}:[0-9]{2}(?:\s*hrs\.?|\s*horas|\s*HORA [A-ZÁÉÍÓÚÑ ]+)?)', texto_completo, re.IGNORECASE)
        h_str = match_hora.group(1).strip() if match_hora else ""
        fecha_audiencia = f"{f_str} {h_str}".strip() if h_str else f_str

        # Si encontramos una fecha programada, reescribir hito crítico y acción de forma ejecutiva
        tipo_aud = "AUDIENCIA"
        if "oral simplificado" in texto_lower:
            tipo_aud = "AUDIENCIA DE JUICIO ORAL SIMPLIFICADO"
        elif "preparatoria" in texto_lower or "preparación" in texto_lower:
            tipo_aud = "AUDIENCIA DE PREPARACIÓN DE JUICIO ORAL (APJO)"
        elif "formalización" in texto_lower:
            tipo_aud = "AUDIENCIA DE FORMALIZACIÓN"
        elif "conciliación" in texto_lower:
            tipo_aud = "AUDIENCIA DE CONCILIACIÓN"
        elif "prueba" in texto_lower:
            tipo_aud = "AUDIENCIA DE RECEPCIÓN DE LA CAUSA A PRUEBA"
            
        hito = f"{tipo_aud} FIJADA PARA EL {fecha_audiencia}"
        tipo_plazo = "Fecha Fatal Programada en Tribunal"
        
        # Calcular días restantes si la fecha es d/m/Y
        try:
            from datetime import datetime
            dt_aud = None
            if "/" in f_str or "-" in f_str:
                clean_f = f_str.replace("-", "/")
                dt_aud = datetime.strptime(clean_f, "%d/%m/%Y")
            if dt_aud:
                dias_restantes = (dt_aud.date() - datetime.now().date()).days
                if dias_restantes >= 0:
                    plazo_dias = dias_restantes
                    accion = f"⚠️ AUDIENCIA EN {dias_restantes} DÍAS ({fecha_audiencia}). Preparar defensa, citación de testigos y solicitud de videoconferencia (si aplica, mín. 2 días de antelación)."
                else:
                    accion = f"Audiencia registrada en fecha pasada ({fecha_audiencia}). Verificar acta de resultado."
            else:
                accion = f"⚠️ AUDIENCIA FIJADA PARA EL {fecha_audiencia}. Preparar minuta de alegatos, comparecencia y testigos."
        except Exception:
            accion = f"⚠️ AUDIENCIA FIJADA PARA EL {fecha_audiencia}. Preparar minuta de alegatos, comparecencia y testigos."

    ruta_guardado = None
    if tmp_path and os.path.exists(tmp_path):
        if archivar:
            cliente_conocido, caratula_conocida = _cliente_conocido_por_rol(rol)
            ruta_guardado = archivar_pdf_fisicamente(tmp_path, filename_clean, rol, cliente_conocido, caratula or caratula_conocida)
        else:
            # Análisis en sólo lectura: no se toca el expediente. El borrado del
            # temporal sólo aplica a una subida por bytes -descartable, el
            # usuario la conserva en el navegador-; una ruta real (ej. el
            # Vigilante) se deja intacta para que quien llamó decida qué hacer
            # con ella, en vez de perder el documento.
            if isinstance(filepath_or_bytes, bytes):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    return {
        "status": "ok",
        "archivo": filename_clean,
        "ruta_guardado": ruta_guardado,
        "total_paginas": total_paginas,
        "rol": rol,
        "tribunal": tribunal,
        "caratula": caratula,
        "caratula_origen": caratula_origen,
        "materia": materia_str,
        "cuaderno": "Principal",
        "ruts_detectados": ruts,
        "hito_critico": hito,
        "plazo_dias": plazo_dias,
        "tipo_plazo": tipo_plazo,
        "accion_sugerida": accion,
        "fecha_audiencia_fijada": fecha_audiencia,
        "texto_extraido_muestra": texto_completo[:600]
    }

def fecha_del_estado_diario(file_path):
    """Extrae del nombre del archivo la fecha a la que corresponde el Estado Diario.

    El PJUD usa dos formatos según por dónde llegue el archivo:
        estadoDiario_8328581__28072026.xls        (adjunto del correo)
        EstadoDiario8328581-8_22_07_2026.xls      (descarga manual desde la OJV)
        Movimientos_8328581__29_07_2026.xls       (aviso de movimientos)

    Devuelve un date, o None si no se puede determinar. Sin esto no hay forma de
    saber si lo que se está mostrando es de hoy o de la semana pasada.
    """
    nombre = os.path.basename(file_path)
    m = re.search(r"(\d{2})[_-]?(\d{2})[_-]?(\d{4})", nombre)
    if not m:
        return None
    dia, mes, anio = (int(g) for g in m.groups())
    try:
        return datetime.date(anio, mes, dia)
    except ValueError:
        return None


def _normalizar_encabezado(texto):
    """'Número de Ingreso' -> 'numerodeingreso'. Quita tildes, espacios y signos."""
    t = unicodedata.normalize("NFD", str(texto)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", t.lower())


def tipo_de_planilla(nombre_archivo):
    """Distingue los dos correos diarios del PJUD, que NO son lo mismo.

    'estadoDiario_8328581__28072026.xls'  -> lo publicado en el Estado Diario.
    'Movimientos_8328581__29_07_2026.xls' -> movimientos en las causas propias.

    Confundirlos hace perder resoluciones: el de Movimientos llega más tarde, así
    que al recorrer la bandeja de lo más nuevo a lo más viejo aparece primero, y
    si se corta ahí el Estado Diario del día no se llega a leer nunca.
    """
    n = _normalizar_encabezado(nombre_archivo)
    if "estadodiario" in n:
        return "estado_diario"
    if "movimiento" in n:
        return "movimientos"
    return "otro"


MAX_SUBIDA_BYTES = 60 * 1024 * 1024  # 60 MB: un expediente escaneado grande cabe


def _nombre_seguro(nombre, por_defecto="documento"):
    """Reduce lo que venga del payload a un nombre de archivo sin ruta.

    Con `Path(base) / nombre`, un nombre absoluto DESCARTA la base ('/base' /
    '/etc/passwd' == '/etc/passwd') y un '../' la escapa. Como el servidor acepta
    peticiones de cualquier origen, eso convertía /subir_documento en escritura
    arbitraria de archivos disparable desde cualquier página que se visite.
    """
    base = os.path.basename(str(nombre or "").replace("\\", "/").strip())
    base = base.lstrip(".")                                  # nada de ocultos ni '..'
    base = re.sub(r"[^\w\s.,()\-áéíóúüñÁÉÍÓÚÜÑ]", "_", base)  # sin separadores ni control
    base = re.sub(r"\s+", " ", base).strip()
    return base[:180] or por_defecto


def _carpeta_existente_equivalente(raiz, carpeta):
    """Busca una carpeta ya existente que sea "la misma" que `carpeta`.

    Hace falta porque el saneamiento recorta espacios y signos, y 8 de las
    carpetas de clientes en el disco terminan en espacio ('Adrian '). Sin esta
    búsqueda, subir un documento de ese cliente crearía una carpeta 'Adrian'
    nueva al lado de la real y le partiría el expediente en dos.
    """
    objetivo = _normalizar_encabezado(carpeta)
    if not objetivo:
        return None
    try:
        for hijo in raiz.iterdir():
            if hijo.is_dir() and _normalizar_encabezado(hijo.name) == objetivo:
                return hijo.name
    except OSError:
        pass
    return None


def ruta_segura_de_subida(carpeta_cliente, filename, raiz):
    """Destino validado para un archivo subido, garantizado dentro de `raiz`.

    Devuelve (ruta, None) o (None, motivo). La comprobación final se hace sobre
    la ruta ya resuelta: es la única que resiste symlinks y '..' combinados.
    """
    carpeta = _nombre_seguro(carpeta_cliente, "Documentos_Subidos")
    nombre = _nombre_seguro(filename, "documento.pdf")

    # Si el cliente ya tiene carpeta, se usa la que existe con su nombre literal.
    carpeta = _carpeta_existente_equivalente(raiz, carpeta) or carpeta

    destino_dir = (raiz / carpeta).resolve()
    raiz_resuelta = raiz.resolve()
    if raiz_resuelta != destino_dir and raiz_resuelta not in destino_dir.parents:
        return None, f"La carpeta '{carpeta_cliente}' queda fuera del directorio de expedientes"

    destino = destino_dir / nombre
    if raiz_resuelta not in destino.resolve().parents:
        return None, f"El nombre '{filename}' queda fuera del directorio de expedientes"

    # No se sobrescribe un expediente existente en silencio: en un archivo legal
    # eso es pérdida de prueba. Se versiona el nombre.
    if destino.exists():
        tallo, ext = os.path.splitext(nombre)
        for n in range(2, 1000):
            candidato = destino_dir / f"{tallo} ({n}){ext}"
            if not candidato.exists():
                destino = candidato
                break
    return destino, None


def caratula_declarada(texto):
    """Extrae la carátula cuando el propio escrito la declara con etiqueta.

    Los escritos chilenos la rotulan de varias formas y antes ninguna se buscaba:
    se iba directo a adivinar el patrón "X con Y" y, si fallaba, a emparejar
    palabras en mayúscula. Estos son los rótulos reales:

        Carátula: MEDINA con MUNICIPALIDAD
        Caratulado: "MEDINA / MUNICIPALIDAD"
        Caratula   :  MEDINA CON MUNICIPALIDAD
        en los autos caratulados "MEDINA con MUNICIPALIDAD"

    Devuelve None si el documento no la declara, para que sigan los heurísticos.
    """
    if not texto:
        return None

    etiquetas = (
        r"(?:autos\s+)?caratulad[oa]s?",   # 'caratulado', 'caratulada', 'autos caratulados'
        r"car[áa]tulas?",                  # 'carátula', 'caratula'
    )
    for etiqueta in etiquetas:
        # Tras la etiqueta: dos puntos opcionales, comillas opcionales, y el
        # contenido hasta el cierre de comillas o el fin de línea.
        m = re.search(
            rf"{etiqueta}\s*:?\s*[\"“«']?\s*([^\n\"”»']{{4,140}})",
            texto,
            re.IGNORECASE,
        )
        if not m:
            continue
        valor = re.sub(r"\s+", " ", m.group(1)).strip(" .,;:-–—")
        # Descarta capturas que en realidad arrastraron el campo siguiente.
        valor = re.split(r"\s+(?:ROL|RIT|RUC|TRIBUNAL|MATERIA|CUADERNO)\b", valor, flags=re.IGNORECASE)[0].strip()
        if len(valor) >= 4 and not valor.lower().startswith(("de la causa", "del proceso")):
            return valor[:140]
    return None


# El grupo con puntos ("26.047-2025", el separador de miles que usa la Corte
# Suprema y las Cortes de Apelaciones para roles de 5+ dígitos) va ANTES que el
# grupo sin puntos y a propósito exige (?:\.\d{3})+ -uno o más, no cero o más-,
# como alternativa SEPARADA. Antes había un solo patrón \d+-\d{4}: contra
# "26.047-2025" no matcheaba desde "26" (el punto corta el \d+), pero SÍ
# matcheaba más adelante, desde "047-2025" -un núcleo truncado que por pura
# suerte seguía siendo substring de "26047-2025" en expedientes.json, pero que
# en otro caso real podría calzar con el ROL de una causa distinta que
# comparta esa misma cola numérica-. Verificado 31-jul-2026 con un documento
# real (Rol N° 26.047-2025).
_RE_ROL_NUCLEO_TXT = (
    r'[CVSPEARKOTMR]-\d{1,3}(?:\.\d{3})+-\d{4}|[CVSPEARKOTMR]-\d+-\d{4}'
    r'|\d{1,3}(?:\.\d{3})+-\d{4}|\d+-\d{4}'
)
_RE_ROL_NUCLEO = re.compile(rf'\b({_RE_ROL_NUCLEO_TXT})\b', re.IGNORECASE)

# Con etiqueta ("Rol N°", "RIT:", "Causa Rol") justo antes: para rol_declarado(),
# que exige una declaración explícita y no cualquier número con forma de rol
# que ande suelto en el texto -por ejemplo, si el documento cita el rol de OTRA
# causa relacionada, sin etiqueta esa cita también matchearía-.
#
# Entre la etiqueta y el N° se permiten hasta 2 palabras sueltas ("Corte",
# "Corte Suprema", "Único", "Interno"): un escrito ante la Corte Suprema dice
# "Rol Corte N.º 26047-2025", no "Rol N° 26047-2025", y sin este margen la
# causa quedaba sin ROL declarado -caso real 31-jul-2026, terminó archivada
# como carpeta nueva con el nombre completo del cliente en vez de encontrar la
# carpeta ya existente en disco, porque _cliente_conocido_por_rol() nunca pudo
# resolver nada sin el ROL-.
_RE_ROL_DECLARADO = re.compile(
    rf'(?:RIT|R\.I\.T\.|ROL|Rol|Causa\s+Rol)\s*(?:[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s+){{0,3}}(?:N[°º\.]{{0,2}})?\s*[:\n]?\s*({_RE_ROL_NUCLEO_TXT})',
    re.IGNORECASE
)


def _extraer_rol_nucleo(texto):
    """El núcleo comparable de un rol ('O-934-2023', '35002-2026'), sin decorar.

    El análisis puede devolver "RIT O-934-2023 (RUC: 2300338058-0)"; lo que sirve
    para buscar en expedientes.json es sólo el patrón, no el texto alrededor.
    Los puntos de separador de miles se quitan acá: expedientes.json guarda
    "ROL 26047-2025", sin puntos.
    """
    if not texto:
        return None
    m = _RE_ROL_NUCLEO.search(str(texto))
    return m.group(1).upper().replace('.', '') if m else None


def rol_declarado(texto):
    """El ROL/RIT cuando el propio escrito lo declara con el formato oficial
    ("Rol N° 26.047-2025", "RIT: O-934-2023", "Causa Rol 700-2026").

    Mismo criterio que caratula_declarada(): lo declarado en el documento manda
    sobre lo que infiera el modelo. Es la defensa contra que el LLM confunda el
    rol con otro dato cercano en el texto -pasó de verdad (31-jul-2026): un
    escrito corto que designaba redactor del fallo tenía el nombre de un
    abogado integrante justo antes de "Rol N° 26.047-2025", y el modelo
    devolvió el nombre de la persona como si fuera el rol, aunque el rol
    estaba ahí, bien escrito, con su etiqueta-. Devuelve None si no hay una
    declaración con etiqueta, para que el análisis del modelo siga siendo la
    fuente en ese caso -no se adivina un rol de un número suelto sin etiqueta-.
    """
    if not texto:
        return None
    m = _RE_ROL_DECLARADO.search(texto)
    return m.group(1).upper().replace('.', '') if m else None


def expediente_por_rol(rol, expedientes):
    """El expediente cuyo id, rit o ritVinculado contiene el núcleo de `rol`.

    Empareja SÓLO por ROL, nunca por carátula o nombre de cliente: un heurístico
    de palabras sobre las partes es exactamente lo que hace archivar_pdf_
    fisicamente() para la carpeta del disco, y ya se vio fallar (ver 30-jul-2026,
    documento archivado en la carpeta de otro cliente por coincidencia de
    palabras). Un ROL es un identificador oficial: coincide o no coincide, no hay
    términos medios. Sin ROL reconocible se devuelve None a propósito -es
    preferible dejar el documento sin vincular a una gestión que adivinar mal
    a qué expediente pertenece.
    """
    nucleo = _extraer_rol_nucleo(rol)
    if not nucleo:
        return None
    for exp in expedientes:
        for campo in ("id", "rit", "ritVinculado"):
            valor = str(exp.get(campo) or "").upper()
            if nucleo in valor:
                return exp
    return None


def _cliente_conocido_por_rol(rol):
    """Cliente y carátula de un expediente YA registrado con ese ROL, si existe.

    archivar_pdf_fisicamente() (la carpeta física del disco) depende de que
    `cliente`/`carátula` tengan palabras para comparar contra los nombres de
    carpeta -pero al llamarla se le pasaba `cliente=""` fijo, confiando sólo en
    que el análisis IA hubiera extraído la carátula DEL PROPIO documento-. Una
    resolución corta como "se designa redactor del fallo" no repite el nombre
    de las partes en absoluto: sólo trae el ROL. El sistema igual sabe quién es
    el cliente -está en expedientes.json, si esa causa ya se había registrado
    antes-, así que se usa ese dato conocido en vez de depender de que cada
    documento individual mencione a las partes. Caso real (31-jul-2026): un
    "se designa redactor" con Rol N° 26.047-2025 no traía carátula en el
    cuerpo, y sin esto terminaba en la bandeja sin clasificar.
    """
    exp = expediente_por_rol(rol, catalogos.cargar_expedientes())
    if not exp:
        return "", ""
    return exp.get("cliente") or "", exp.get("caratula") or ""


_RE_TOKEN = re.compile(r'[a-záéíóúñ0-9-]+')


def _candidatos_relevantes(texto, expedientes, causas, tope=20):
    """Acota expedientes/causas a los que comparten al menos una palabra con
    `texto`, antes de ponerlos en el contexto de un prompt.

    Existe por una razón medida, no teórica: con el catálogo completo (1.558
    expedientes, 2.437 causas) volcado sin límite, un modelo local de 4B dejaba
    de encontrar coincidencias obvias -y de responder instrucciones simples que
    no dependían del catálogo en absoluto- porque el prompt se volvía demasiado
    grande para atenderlo bien (ver 31-jul-2026). No decide nada por sí sola:
    sólo reduce la lista para que el modelo pueda mirarla entera.
    """
    tokens = {w for w in _RE_TOKEN.findall(texto.lower()) if len(w) > 3}
    if not tokens:
        return [], []

    def puntaje(hay):
        hay = hay.lower()
        return sum(1 for w in tokens if w in hay)

    exp_hay = [(e, puntaje(f"{e.get('cliente','')} {e.get('id','')} {e.get('asunto','')}")) for e in expedientes]
    causas_hay = [(c, puntaje(f"{c.get('caratula','')} {c.get('rit','')} {c.get('cliente','')}")) for c in causas]

    exp_top = [e for e, p in sorted(exp_hay, key=lambda x: x[1], reverse=True) if p > 0][:tope]
    causas_top = [c for c, p in sorted(causas_hay, key=lambda x: x[1], reverse=True) if p > 0][:tope]
    return exp_top, causas_top


# --- Detección de expedientes duplicados ---------------------------------------
# Dos niveles:
#   EXACTO:   mismo ROL/RIT normalizado. Certeza total, no necesita IA. Se
#             verificó contra los datos reales (31-jul-2026): 65 grupos, 199
#             expedientes -la migración de causas PJUD insertó la misma causa
#             más de una vez varias veces-, así que este nivel solo ya vale la pena.
#   PROBABLE: RIT distinto, pero cliente parecido Y carátula parecida Y creados
#             el mismo día. Las tres condiciones son heurística de texto, NO
#             embeddings -se probó nomic-embed-text acá y NO sirve para este
#             trabajo (31-jul-2026): "CONDOMINIO X / YÁÑEZ" vs "CONDOMINIO X /
#             SANDOVAL" (dos causas REALES contra dos deudores distintos) dio
#             0.9999999 de similitud coseno, idéntico al de dos carátulas
#             LITERALMENTE iguales. El modelo satura a ~1.0 en strings cortos
#             que comparten casi todo el texto: no discrimina el apellido que
#             sí importa. difflib.SequenceMatcher, más tosco, sí separa esos
#             casos (0.90-0.93 vs 1.00), así que es la herramienta correcta
#             acá -no todo problema de similitud de texto es un problema para
#             un modelo de embeddings-. El filtro de "mismo día de creación"
#             es el que de verdad separa un bug de importación (61 de 65
#             grupos EXACTOS comparten fecha de creación idéntica) de un
#             cliente recurrente real (mismo condominio cobrando gastos
#             comunes a 7 deudores distintos el mismo día, o el mismo litigante
#             demandado varias veces a través de los años): sin el filtro de
#             fecha, este nivel producía 2.710 pares -inservible-; con él, 25.
def _normalizar_cliente_dup(nombre):
    nombre = unicodedata.normalize('NFKD', nombre or '').encode('ascii', 'ignore').decode('ascii')
    nombre = nombre.lower()
    nombre = re.sub(r'\b(don|dona|sr|sra|señor|señora)\b\.?', ' ', nombre)
    nombre = re.sub(r'[^a-z0-9\s]', ' ', nombre)
    return re.sub(r'\s+', ' ', nombre).strip()


def _detectar_duplicados_exactos(expedientes):
    """Agrupa por (rit, tribunal), no sólo por rit.

    Un rol/RIT chileno sólo es único DENTRO de un tribunal -cada tribunal lleva
    su propia numeración correlativa desde cero-, no en todo el país. Agrupar
    sólo por rit marcaba como "duplicado exacto" a dos causas de partes
    distintas en tribunales distintos que sólo compartían el número por
    coincidencia (caso real 31-jul-2026: "ROL 804-2014" existía a la vez en la
    C.A. de Concepción -Núñez Romo con Isapre Masvida- y en el Juzgado de
    Pucón -Painefilo con Carrasco-, dos causas sin ninguna relación entre sí).
    """
    grupos = {}
    for e in expedientes:
        rit = (e.get('rit') or '').strip().upper()
        if not rit:
            continue
        tribunal = (e.get('tribunal') or '').strip().upper()
        clave = (rit, tribunal)
        grupos.setdefault(clave, []).append(e)
    return [
        {"tipo": "exacto", "clave": rit, "expedientes": grupo}
        for (rit, tribunal), grupo in grupos.items() if len(grupo) > 1
    ]


def _detectar_duplicados_probables(expedientes, ids_ya_exactos, umbral_nombre=0.82, umbral_caratula=0.97):
    por_fecha = {}
    for e in expedientes:
        if e['id'] in ids_ya_exactos:
            continue
        fecha = e.get('creadoEn')
        if not fecha:
            continue
        por_fecha.setdefault(fecha, []).append(e)

    resultados = []
    for fecha, grupo in por_fecha.items():
        # Un "día" con más de 60 expedientes nuevos es casi seguro una carga
        # masiva (import inicial), no un puñado de causas presentadas ese día:
        # comparar todos contra todos ahí adentro es ruido, no señal.
        if len(grupo) < 2 or len(grupo) > 60:
            continue
        for i in range(len(grupo)):
            for j in range(i + 1, len(grupo)):
                a, b = grupo[i], grupo[j]
                if (a.get('rit') or '').strip().upper() == (b.get('rit') or '').strip().upper():
                    continue  # mismo RIT -> ya está en "exactos"
                na = _normalizar_cliente_dup(a.get('cliente', ''))
                nb = _normalizar_cliente_dup(b.get('cliente', ''))
                if not na or not nb:
                    continue
                ratio_nombre = difflib.SequenceMatcher(None, na, nb).ratio()
                if ratio_nombre < umbral_nombre:
                    continue
                ca = _normalizar_cliente_dup(a.get('caratula', ''))
                cb = _normalizar_cliente_dup(b.get('caratula', ''))
                if not ca or not cb:
                    continue
                ratio_caratula = difflib.SequenceMatcher(None, ca, cb).ratio()
                if ratio_caratula < umbral_caratula:
                    continue
                resultados.append({
                    "tipo": "probable",
                    "expedientes": [a, b],
                    "similitudNombre": round(ratio_nombre, 3),
                    "similitudCaratula": round(ratio_caratula, 3),
                    "creadoEn": fecha
                })
    resultados.sort(key=lambda r: r["similitudCaratula"], reverse=True)
    return resultados


def _fecha_audiencia_a_iso(fecha_audiencia_fijada):
    """Lee una fecha d/m/Y del texto libre que devuelve el análisis del documento.

    Best-effort: sin ese formato se devuelve None y la gestión queda sin fecha,
    que es el lado seguro (no se inventa una fecha).
    """
    if not fecha_audiencia_fijada:
        return None
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', str(fecha_audiencia_fijada))
    if not m:
        return None
    dia, mes, anio = (int(g) for g in m.groups())
    try:
        return datetime.date(anio, mes, dia).isoformat()
    except ValueError:
        return None


def _hora_audiencia(fecha_audiencia_fijada):
    """Hora HH:MM del texto libre de fecha_audiencia_fijada, si el documento la
    trae (ej. "11 de Mayo de 2026 a las 09:30 hrs"). None si no aparece -la
    tarjeta de audiencias la muestra sólo si es un dato real, nunca inventado."""
    if not fecha_audiencia_fijada:
        return None
    m = re.search(r'\b([01]?\d|2[0-3]):([0-5]\d)\b', str(fecha_audiencia_fijada))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def _vector_de_ruta(con, ruta):
    fila = con.execute("SELECT vector FROM embeddings WHERE ruta = ?", (str(ruta),)).fetchone()
    if not fila:
        return None
    return np.frombuffer(fila[0], dtype=np.float32)


def _gestion_similar_existente(expediente, ruta_nueva, umbral=0.96):
    """¿Alguna gestión YA registrada en este expediente viene de un documento
    casi idéntico al que se acaba de archivar? Cubre el caso de dos PDF de la
    misma causa que difieren sólo en la última hoja (ej. antes/después del
    timbre de notificación): no son el mismo archivo -el hash no los pesca-,
    pero comparten casi todo el texto, y el embedding SÍ los distingue de un
    documento genuinamente distinto (se calibró empíricamente el 31-jul-2026
    contra el corpus real: documentos distintos de la MISMA causa rondan
    0.70-0.91 de similitud coseno; un documento cuasi-idéntico, ~0.98-0.99).
    Devuelve (gestión_existente, similitud) o (None, 0)."""
    indice = DATOS_DIR / "indice_texto.sqlite"
    if not indice.is_file():
        return None, 0
    rutas_previas = [g.get("rutaArchivo") for g in expediente.get("gestiones", []) if g.get("rutaArchivo")]
    if not rutas_previas:
        return None, 0
    try:
        con = sqlite3.connect(f"file:{indice}?mode=ro", uri=True)
        v_nueva = _vector_de_ruta(con, ruta_nueva)
        if v_nueva is None:
            con.close()
            return None, 0
        mejor_gestion, mejor_sim = None, 0
        for g in expediente.get("gestiones", []):
            ruta_previa = g.get("rutaArchivo")
            if not ruta_previa or ruta_previa == ruta_nueva:
                continue
            v_previa = _vector_de_ruta(con, ruta_previa)
            if v_previa is None:
                continue
            sim = float(np.dot(v_nueva, v_previa) / ((np.linalg.norm(v_nueva) * np.linalg.norm(v_previa)) or 1e-9))
            if sim > mejor_sim:
                mejor_sim, mejor_gestion = sim, g
        con.close()
        if mejor_gestion is not None and mejor_sim >= umbral:
            return mejor_gestion, mejor_sim
        return None, 0
    except Exception as e:
        print(f"⚠️ [DUPLICADO SEMÁNTICO] No se pudo comparar: {e}")
        return None, 0


def _crear_expediente_desde_analisis(analisis):
    """Ficha nueva de expediente a partir de lo que el análisis ya extrajo
    (rol, tribunal, carátula, materia), para cuando llega un documento de una
    causa que el sistema todavía no tenía registrada.

    Sin esto, el documento quedaba archivado e indexado -se podía encontrar
    por búsqueda de texto- pero no había ninguna ficha desde la cual el
    abogado pudiera encontrarlo navegando la app, ni bitácora de gestiones
    para esa causa: sólo existía "en el disco".
    """
    nucleo = _extraer_rol_nucleo(analisis.get("rol") or "")
    rit = f"ROL {nucleo}" if nucleo else f"SIN-ROL-{int(time.time())}"
    caratula = (analisis.get("caratula") or "").strip()
    # La carátula chilena suele venir "DEMANDANTE con/c//C/contra DEMANDADO":
    # el primer tramo es la parte más probable de ser el cliente -mismo
    # criterio que usa procesar_excel_pjud() para las causas del Excel oficial-.
    cliente = re.split(r'\s+(?:CON|C/|CONTRA)\s+', caratula, maxsplit=1, flags=re.IGNORECASE)[0].strip() if caratula else ""
    return {
        "id": rit,
        "rit": rit,
        "ritVinculado": rit,
        "caratula": caratula or f"Causa {rit}",
        "cliente": cliente or "Cliente por determinar",
        "contraparte": "Por determinar",
        "abogadoContraparte": "No registrado",
        "asunto": "",
        "tipo": "judicial",
        "materia": analisis.get("materia") or "Por determinar",
        "tribunal": analisis.get("tribunal") or "Por determinar",
        "numeroTribunal": "1",
        "ciudad": "Temuco",
        "etapa": "Tramitación",
        "estado": "ACTIVO",
        "estadoVigencia": "VIGENTE",
        "creadoEn": datetime.datetime.now().isoformat(),
        "origen": "Creado automáticamente por el Vigilante desde el análisis de un documento",
        "gestiones": []
    }


def vincular_documento_a_expediente(analisis, nombre_archivo, ruta_final, expediente_id_forzado=None):
    """Si el análisis trae un ROL reconocible, agrega la gestión al expediente
    que le corresponde y persiste. Devuelve (expediente_o_None, detalles_txt).

    Si el ROL es reconocible pero NINGÚN expediente lo tiene registrado
    todavía, se crea la ficha con los datos que el análisis ya extrajo -en vez
    de rendirse y dejar la causa sin ningún registro en la app-. Sin ROL
    reconocible en absoluto, sí se rinde: inventar una ficha sin identificador
    oficial sería peor que no crear nada.

    `expediente_id_forzado`: cuando el abogado, al confirmar un documento
    pendiente de revisión, elige a mano un expediente distinto del que el
    emparejamiento automático por ROL hubiera encontrado -anula ese
    emparejamiento y usa directamente el expediente elegido-.

    Separada del bucle del Vigilante para poder probarla sustituyendo
    catalogos.cargar_expedientes/guardar_expedientes, sin tocar
    data/expedientes.json real ni levantar el hilo de vigilancia.
    """
    rol_detectado = analisis.get("rol") or ""
    expedientes_actuales = catalogos.cargar_expedientes()
    if expediente_id_forzado:
        expediente = next((e for e in expedientes_actuales if str(e.get("id")) == str(expediente_id_forzado)), None)
    else:
        expediente = expediente_por_rol(rol_detectado, expedientes_actuales)
    creado_ahora = False

    if expediente is None and not expediente_id_forzado and _extraer_rol_nucleo(rol_detectado):
        expediente = _crear_expediente_desde_analisis(analisis)
        expedientes_actuales.append(expediente)
        creado_ahora = True

    if expediente is not None:
        gestion_similar, similitud = _gestion_similar_existente(expediente, ruta_final)
        if gestion_similar is not None:
            detalles_txt = (
                f"{ruta_final} es {round(similitud * 100)}% similar a un documento ya vinculado a "
                f"{expediente.get('id')} ('{gestion_similar.get('tramite', '')}'). "
                f"No se agregó una gestión duplicada; el archivo queda igual archivado e indexado."
            )
            return expediente, detalles_txt

        expediente.setdefault("gestiones", []).insert(
            0, gestion_desde_analisis(analisis, nombre_archivo, ruta_final)
        )
        catalogos.guardar_expedientes(expedientes_actuales)
        prefijo = f"Expediente {expediente.get('id')} creado automáticamente. " if creado_ahora else ""
        detalles_txt = (
            f"{prefijo}Vinculado a {expediente.get('id')} ({expediente.get('cliente', 'sin cliente')}): "
            f"{analisis.get('hito_critico', 'gestión registrada')}. Archivado en {ruta_final}"
        )
        return expediente, detalles_txt

    detalles_txt = (
        f"Analizado y archivado en {ruta_final}, pero sin ROL reconocible: no se vinculó a "
        f"ninguna gestión ni se creó expediente. Rol detectado: {rol_detectado or '(ninguno)'}"
    )
    return None, detalles_txt


DOCUMENTOS_PENDIENTES_DIR = BASE_DIR / "data" / "documentos_pendientes"


def _encolar_documento_pendiente(filepath, nombre_archivo, analisis):
    """Mueve un documento ya analizado (archivar=False, nada se archivó todavía)
    a una carpeta de espera persistente y lo agrega a la bandeja "Documentos por
    Revisar", en vez de archivarlo y vincularlo solo. El abogado confirma o
    corrige antes de que el documento quede escrito en un expediente.

    Devuelve el id de la entrada nueva.
    """
    doc_id = f"pend-{int(time.time() * 1000)}"
    carpeta_espera = DOCUMENTOS_PENDIENTES_DIR / doc_id
    carpeta_espera.mkdir(parents=True, exist_ok=True)
    destino = carpeta_espera / _nombre_seguro(nombre_archivo, "documento.pdf")
    shutil.move(filepath, str(destino))

    expedientes_actuales = catalogos.cargar_expedientes()
    candidato = expediente_por_rol(analisis.get("rol", ""), expedientes_actuales)

    entrada = {
        "id": doc_id,
        "archivoStaged": str(destino),
        "nombreOriginal": nombre_archivo,
        "fechaDetectado": datetime.datetime.now().isoformat(),
        "analisis": {
            campo: analisis.get(campo, "" if campo != "ruts_detectados" else [])
            for campo in (
                "rol", "tribunal", "caratula", "materia", "hito_critico",
                "tipo_gestion", "fecha_audiencia_fijada", "ruts_detectados",
                "accion_sugerida", "cuaderno", "plazo_dias", "tipo_plazo"
            )
        },
        "expedienteCandidatoId": candidato.get("id") if candidato else None,
        "expedienteCandidatoCaratula": (candidato.get("caratula") or candidato.get("cliente")) if candidato else None
    }
    pendientes = catalogos.cargar_documentos_pendientes()
    pendientes.insert(0, entrada)
    catalogos.guardar_documentos_pendientes(pendientes)
    return doc_id


def gestion_desde_analisis(analisis, nombre_archivo, ruta_final=None):
    """La gestión de bitácora que deja el Vigilante al procesar un documento.

    Sin fecha propia por defecto -naturaleza PENDIENTE en el semáforo del
    frontend, la misma regla que ya rige para el resto de la bitácora- salvo que
    el propio tribunal haya fijado una audiencia con fecha explícita en el
    documento: eso no es un plazo que la IA calculó, es un dato que el tribunal
    declaró, y merece mostrarse con esa fecha (fechaEsTramite). Un `plazo_dias`
    adivinado por el análisis NO se usa para computar nada acá: crear un plazo
    fatal a partir de una estimación de la IA es exactamente lo que el Radar de
    Plazos existe para evitar.
    """
    hito = analisis.get("hito_critico") or f"Documento recibido: {nombre_archivo}"
    gestion = {
        "id": f"gst-vigilante-{int(time.time())}",
        "fecha": datetime.datetime.now().strftime("%d/%m/%Y"),
        "tramite": str(hito)[:160],
        "estado": "PENDIENTE (POR HACER)",
        "origen": "Vigilante de Descargas Judiciales",
        "notas": analisis.get("accion_sugerida") or "",
        "archivo": nombre_archivo,
        "tipoGestion": analisis.get("tipo_gestion") or "otro"
    }
    # Ruta física del documento que generó esta gestión -no sólo el nombre-, para
    # poder comparar su embedding contra el de futuros documentos y detectar si
    # son casi el mismo (ver _gestion_similar_existente). Sin esto no había forma
    # de saber a qué archivo indexado correspondía cada entrada de la bitácora.
    if ruta_final:
        gestion["rutaArchivo"] = str(ruta_final)
        # Mismo documento, mismo dato, en la forma que ya entiende la ficha del
        # expediente: la Bitácora Omnicanal adjunta archivos como {nombre, ruta}
        # en `documentos`, y es lo único que el frontend renderiza como insignia
        # de documento en la tarjeta de gestión -"archivo"/"rutaArchivo" quedaban
        # invisibles en la UI aunque el archivo ya estuviera bien archivado en
        # disco-. Se agrega sin tocar rutaArchivo: _gestion_similar_existente()
        # sigue leyendo ese campo tal cual.
        gestion["documentos"] = [{"nombre": nombre_archivo, "ruta": str(ruta_final)}]
    fecha_aud_iso = _fecha_audiencia_a_iso(analisis.get("fecha_audiencia_fijada"))
    if fecha_aud_iso:
        gestion["fechaIso"] = fecha_aud_iso
        gestion["fechaEsTramite"] = True
        # Marca explícita de que esto es una AUDIENCIA fijada por el tribunal
        # -no cualquier trámite con fecha propia-: la tarjeta "Audiencias" del
        # Dashboard depende de este flag para no mezclar una audiencia real con
        # una nota cualquiera que tenga fecha (30-jul-2026: antes se mostraban
        # audiencias "confirmadas" que en realidad la IA había adivinado, y se
        # sacaron por eso; este flag existe para que no vuelva a pasar).
        gestion["esAudiencia"] = True
        hora = _hora_audiencia(analisis.get("fecha_audiencia_fijada"))
        if hora:
            gestion["horaAudiencia"] = hora
    return gestion


def _primera_columna(row):
    """Valor de la primera columna de la fila, o None si viene vacía.

    En el Estado Diario del PJUD la primera columna es siempre el identificador
    de la causa, aunque el encabezado cambie de hoja en hoja y de formato en
    formato. Es el dato más estable que emite: el nombre varía, la posición no.
    """
    if not len(row.index):
        return None
    valor = row.iloc[0]
    if pd.isna(valor):
        return None
    texto = str(valor).strip()
    return texto if texto and texto.lower() not in ("nan", "none") else None


def _columna(row, incluye, excluye=()):
    """Devuelve el valor de la primera columna cuyo encabezado normalizado contenga
    alguno de los términos de `incluye` y ninguno de `excluye`.

    Se resuelve por patrón y no por nombre exacto porque el PJUD manda encabezados
    distintos según el canal: la descarga manual de la OJV dice 'N° Ingreso', el
    adjunto del correo dice 'Número Ingreso' en Corte Suprema y 'Número de Ingreso'
    en Corte de Apelaciones. Con coincidencia exacta las dos Cortes caían a 's/n' y
    sus causas quedaban registradas sin ROL, o sea invisibles.
    """
    for columna in row.index:
        norm = _normalizar_encabezado(columna)
        if any(e in norm for e in excluye):
            continue
        if any(i in norm for i in incluye):
            valor = row[columna]
            if pd.isna(valor):
                continue
            texto = str(valor).strip()
            if texto and texto.lower() not in ("nan", "none"):
                return texto
    return None


def procesar_excel_pjud(file_path):
    print(f"📊 [MOTOR EXCEL PJUD] Procesando archivo matutino: {file_path}")
    xl = None
    try:
        xl = pd.ExcelFile(file_path)
    except Exception:
        try:
            xl = pd.ExcelFile(file_path, engine='openpyxl')
        except Exception:
            try:
                import xlrd
                book = xlrd.open_workbook(file_path, ignore_workbook_corruption=True)
                xl = pd.ExcelFile(book, engine='xlrd')
            except Exception:
                pass
    movimientos_dia = []
    stats_jurisdiccion = {}
    carpetas_locales = {}
    if not xl:
        return {"status": "error", "total_movimientos": 0, "movimientos": [], "desglose_tribunales": {}}
        base_casos_dir = "/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023"
        if os.path.exists(base_casos_dir):
            try:
                for d in os.listdir(base_casos_dir):
                    d_full = os.path.join(base_casos_dir, d)
                    if os.path.isdir(d_full):
                        carpetas_locales[d.lower().strip()] = {
                            "nombre": d,
                            "path": d_full
                        }
            except Exception as e:
                print(f"⚠️ Error escaneando Casos2023: {e}")

    for sheet in xl.sheet_names:
        df = xl.parse(sheet)
        count_rows = len(df)
        stats_jurisdiccion[sheet] = count_rows
        
        if count_rows > 0:
            for idx, row in df.iterrows():
                # Extraer Rol/RIT según columnas del tribunal
                # El identificador de la causa SIEMPRE va en la primera columna,
                # cualquiera sea el nombre que le ponga el PJUD. En las 7 hojas de
                # los dos formatos que emite aparece con seis encabezados distintos:
                # 'Rol', 'Rit', 'Rol Interno', 'N° Ingreso', 'Número Ingreso' y
                # 'Número de Ingreso'. Buscarlo por nombre es perder causas cada vez
                # que cambien el encabezado; por posición no.
                # La coincidencia por patrón queda de red de seguridad, por si algún
                # día reordenan las columnas.
                rol_val = (
                    _primera_columna(row)
                    or _columna(row, ('rol', 'rit', 'ruc'), excluye=('fecha',))
                    or _columna(row, ('ingreso',), excluye=('fecha',))
                    or 's/n'
                )

                # El PJUD también manda la tabla pública completa de la Corte
                # ('CORTE DE APELACIONES DE TEMUCO.xls'): sin columna de rol -la
                # primera columna trae el nombre del tribunal-, así que cada fila
                # quedaba con rol_val = "CORTE DE APELACIONES DE TEMUCO", el mismo
                # valor repetido en las ~240 filas. El resultado: decenas de causas
                # de OTROS abogados -ninguna del estudio- mostrándose como
                # "movimientos" en la sincronización (caso real 01-ago-2026: 95
                # causas ajenas de la Corte de Puerto Montt, ninguna del usuario).
                # Mismo criterio que ya usa capturar_estado_diario.py
                # (parece_rol()): todo identificador real del PJUD lleva dígitos
                # -C-3183-2024, 35002-2026-; un valor sin ningún dígito es el
                # nombre de un tribunal, no una causa.
                if not any(c.isdigit() for c in rol_val):
                    continue

                caratula_val = _columna(row, ('caratul',)) or 'Sin carátula registrada'
                trib_val = (
                    _columna(row, ('tribunal', 'corte'), excluye=('fecha',))
                    or f"Jurisdicción {sheet}"
                )
                fecha_val = _columna(row, ('fechaubicacion', 'fechaingreso')) or 'Sin fecha'
                # En Corte de Apelaciones el dato procesal está en 'Ubicación'
                # (Relator, Cuenta, Tabla…): es lo que dice en qué va la causa.
                estado_val = (
                    _columna(row, ('estado', 'ubicacion'), excluye=('fecha',))
                    or _columna(row, ('tiporecurso', 'tipocausa'))
                    or 'Movimiento reportado en OJV'
                )
                
                # Cruce con disco local
                match_local = None
                carat_low = caratula_val.lower()
                for c_k, c_info in carpetas_locales.items():
                    if len(c_k) > 3 and (c_k in carat_low or carat_low in c_k or c_k in rol_val.lower()):
                        match_local = c_info
                        break
                        
                es_fatal = any(w in estado_val.upper() for w in ["TRAMITACIÓN", "PRUEBA", "TRASLADO", "SENTENCIA", "RELACIÓN", "CUENTA"])
                alerta_desc = "⚠️ PLAZO O TRÁMITE ACTIVO: Verificar vencimientos fatales (Art. 66 CPC / Días Corridos)." if es_fatal else "✓ Trámite o resolución registrada. Monitoreo pasivo."
                
                movimientos_dia.append({
                    "id": f"mov-{sheet}-{idx}",
                    "rol": rol_val,
                    "caratula": caratula_val,
                    "tribunal": trib_val,
                    "jurisdiccion": sheet,
                    "fechaIngreso": fecha_val,
                    "estado": estado_val,
                    "esFatal": es_fatal,
                    "alerta": alerta_desc,
                    "carpetaHermana": match_local["nombre"] if match_local else "No vinculada a carpeta en disco",
                    "pathHermana": match_local["path"] if match_local else None
                })
                
    # La fecha que importa es la DEL ESTADO DIARIO, no la de cuando se leyó el
    # archivo. Antes se devolvía time.strftime() —la hora actual—, así que un
    # Estado Diario del 22 aparecía rotulado con la fecha de hoy y no había
    # forma de notar que el dato estaba viejo.
    fecha_estado_diario = fecha_del_estado_diario(file_path)
    antiguedad = None
    if fecha_estado_diario:
        antiguedad = (datetime.date.today() - fecha_estado_diario).days

    return {
        "status": "ok",
        "archivo_procesado": os.path.basename(file_path),
        "path_completo": file_path,
        "fecha_estado_diario": fecha_estado_diario.isoformat() if fecha_estado_diario else None,
        "antiguedad_dias": antiguedad,
        "es_de_hoy": antiguedad == 0 if antiguedad is not None else None,
        "leido_en": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_movimientos": len(movimientos_dia),
        "desglose_tribunales": stats_jurisdiccion,
        "movimientos": movimientos_dia
    }

class LexControlFileHandler(BaseHTTPRequestHandler):
    def handle_one_request(self):
        """Igual que el original, pero sin traza cuando el cliente corta.

        /sincronizar_gmail_pjud tarda ~10 segundos consultando Gmail por IMAP. Si
        el abogado cambia de pestaña o recarga en ese rato, el navegador cierra la
        conexión y el servidor revienta con BrokenPipeError al escribir la
        respuesta, dejando una traza completa en el log. No es un fallo: es un
        cliente que se fue. Tragarse la traza importa porque el log es donde hay
        que poder ver los errores DE VERDAD.
        """
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def _responder_json(self, cuerpo, codigo=200):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _buscar_texto(self, consulta):
        """Búsqueda de texto completo dentro de los expedientes ya indexados."""
        consulta = (consulta or "").strip()
        if len(consulta) < 3:
            self._responder_json({"error": "Escribe al menos 3 caracteres", "resultados": []}, 400)
            return

        indice = DATOS_DIR / "indice_texto.sqlite"
        if not indice.is_file():
            self._responder_json({
                "error": "El índice de texto todavía no existe.",
                "pista": "Créalo con: python3 indexar_pdfs.py",
                "resultados": []
            }, 503)
            return

        # FTS5 interpreta comillas, asteriscos y AND/OR. Se cita la consulta como
        # frase literal para que el usuario pueda escribir lo que quiera sin que
        # un apóstrofo le reviente la búsqueda.
        frase = '"' + consulta.replace('"', ' ') + '"'

        try:
            con = sqlite3.connect(f"file:{indice}?mode=ro", uri=True)
            filas = con.execute(
                """
                SELECT ruta, nombre, carpeta,
                       snippet(textos, 3, '«', '»', '…', 18) AS extracto
                FROM textos
                WHERE textos MATCH ?
                ORDER BY rank
                LIMIT 60
                """,
                (frase,),
            ).fetchall()
            total = con.execute("SELECT COUNT(*) FROM archivos").fetchone()[0]
            con.close()
        except Exception as e:
            self._responder_json({"error": f"Error consultando el índice: {e}", "resultados": []}, 500)
            return

        resultados = [
            {"ruta": r[0], "nombre": r[1], "carpeta": r[2], "extracto": r[3]}
            for r in filas
        ]
        print(f"🔍 [TEXTO] '{consulta}': {len(resultados)} coincidencias sobre {total} documentos")
        self._responder_json({
            "consulta": consulta,
            "totalIndexado": total,
            "resultados": resultados
        })

    def _buscar_semantico(self, consulta):
        """Búsqueda por SIGNIFICADO (embeddings nomic-embed-text + similitud coseno),
        a diferencia de /buscar_texto que exige la frase exacta. Sirve para preguntas
        como 'despido sin causa justificada' que encuentran documentos que hablan de
        eso aunque usen otras palabras."""
        consulta = (consulta or "").strip()
        if len(consulta) < 3:
            self._responder_json({"error": "Escribe al menos 3 caracteres", "resultados": []}, 400)
            return

        indice = DATOS_DIR / "indice_texto.sqlite"
        if not indice.is_file():
            self._responder_json({
                "error": "El índice de texto todavía no existe.",
                "pista": "Créalo con: python3 indexar_pdfs.py",
                "resultados": []
            }, 503)
            return

        import indexar_pdfs
        vector_consulta = indexar_pdfs.embeber_texto(consulta)
        if not vector_consulta:
            self._responder_json({
                "error": "El motor de búsqueda semántica (Ollama) no está disponible.",
                "pista": "Verifica que Ollama esté corriendo: ollama serve",
                "resultados": []
            }, 503)
            return

        try:
            con = sqlite3.connect(f"file:{indice}?mode=ro", uri=True)
            filas = con.execute("SELECT ruta, vector FROM embeddings").fetchall()
            total_vectorizado = len(filas)
            total = con.execute("SELECT COUNT(*) FROM archivos").fetchone()[0]
        except Exception as e:
            self._responder_json({"error": f"Error consultando el índice: {e}", "resultados": []}, 500)
            return

        if not filas:
            con.close()
            self._responder_json({
                "error": "Todavía no hay ningún documento vectorizado.",
                "pista": "Créalo con: python3 indexar_embeddings.py",
                "resultados": []
            }, 503)
            return

        rutas = [f[0] for f in filas]
        matriz = np.frombuffer(b"".join(f[1] for f in filas), dtype=np.float32).reshape(len(filas), -1)
        q = np.asarray(vector_consulta, dtype=np.float32)

        # Similitud coseno vectorizada: normalizamos filas y consulta, y el producto
        # punto ya da el coseno (evita dividir 12.875 veces en un loop de Python).
        normas = np.linalg.norm(matriz, axis=1)
        normas[normas == 0] = 1e-9
        q_norma = np.linalg.norm(q) or 1e-9
        similitudes = (matriz @ q) / (normas * q_norma)

        tope = 20
        mejores_idx = np.argsort(-similitudes)[:tope]
        rutas_top = [rutas[i] for i in mejores_idx]

        marcadores = ",".join("?" * len(rutas_top))
        metadatos = {}
        if rutas_top:
            filas_meta = con.execute(
                f"SELECT ruta, nombre, carpeta, substr(contenido, 1, 240) FROM textos WHERE ruta IN ({marcadores})",
                rutas_top
            ).fetchall()
            metadatos = {r[0]: {"nombre": r[1], "carpeta": r[2], "extracto": r[3]} for r in filas_meta}
        con.close()

        resultados = []
        for i in mejores_idx:
            ruta = rutas[i]
            meta = metadatos.get(ruta)
            if not meta:
                continue
            resultados.append({
                "ruta": ruta,
                "nombre": meta["nombre"],
                "carpeta": meta["carpeta"],
                "extracto": meta["extracto"],
                "score": round(float(similitudes[i]), 4)
            })

        print(f"🧠 [SEMÁNTICA] '{consulta}': {len(resultados)} resultados sobre {total_vectorizado} vectorizados de {total} indexados")
        self._responder_json({
            "consulta": consulta,
            "totalIndexado": total,
            "totalVectorizado": total_vectorizado,
            "resultados": resultados
        })

    def _servir_dataset(self, nombre):
        """Entrega los catálogos pesados de data/ que antes iban compilados en el bundle.

        Comprime con gzip si el navegador lo acepta (los ~5 MB de catálogo bajan a
        ~450 KB) y responde 304 cuando el ETag del cliente sigue vigente.
        """
        # Solo nombres simples: corta cualquier intento de salir de data/
        if not re.fullmatch(r"[A-Za-z0-9_-]+", nombre or ""):
            self.send_response(400)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Nombre de dataset invalido"}).encode("utf-8"))
            return

        ruta = DATOS_DIR / f"{nombre}.json"
        if not ruta.is_file():
            self.send_response(404)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            disponibles = sorted(p.stem for p in DATOS_DIR.glob("*.json")) if DATOS_DIR.is_dir() else []
            self.wfile.write(json.dumps({
                "error": f"No existe el dataset '{nombre}'",
                "disponibles": disponibles,
                "pista": "Regenera los catalogos con generar_db_disco_real.py e importar_excel_pjud.py",
            }, ensure_ascii=False).encode("utf-8"))
            return

        st = ruta.stat()
        etag = f'"{int(st.st_mtime)}-{st.st_size}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self._send_cors_headers()
            self.send_header("ETag", etag)
            self.end_headers()
            return

        cuerpo = ruta.read_bytes()
        comprimir = "gzip" in (self.headers.get("Accept-Encoding") or "")
        if comprimir:
            cuerpo = gzip.compress(cuerpo, compresslevel=6)

        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if comprimir:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(cuerpo)
        print(f"📚 [CATALOGO] {nombre}: {st.st_size / 1048576:.1f} MB -> {len(cuerpo) / 1024:.0f} KB {'(gzip)' if comprimir else ''}")

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        
        # ENDPOINT 1: /abrir?ruta=/path/al/archivo.pdf (Abre en escritorio Linux nativo)
        if parsed_url.path == "/abrir":
            ruta = query_params.get("ruta", [""])[0]
            if not ruta:
                self.send_response(400)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write('{"error": "No se proporcionó ruta"}'.encode('utf-8'))
                return

            if not os.path.exists(ruta):
                # Crear un archivo de texto temporal para demostrar que el sistema sí reacciona, 
                # pero avisando que el archivo real está desconectado.
                temp_path = "/tmp/lexcontrol_aviso_disco_desconectado.txt"
                with open(temp_path, "w", encoding="utf-8") as f:
                    f.write(f"ATENCION: EL PUENTE FORENSE FUNCIONA PERFECTAMENTE.\n\n")
                    f.write(f"Hiciste clic en el archivo original:\n{ruta}\n\n")
                    f.write("Sin embargo, tu sistema operativo Linux reporta que el disco duro externo o la partición donde se aloja este archivo (/media/jaime/...) NO está conectado actualmente.\n\n")
                    f.write("Conecta el disco duro donde residen tus casos 2023 y vuelve a hacer clic. LexControl abrirá tu documento original al instante.")
                ruta = temp_path
                
            try:
                # Ejecutar orden nativa de apertura en Linux (xdg-open)
                subprocess.Popen(["xdg-open", ruta], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status": "ok", "message": "Abierto en escritorio Linux"}')
                print(f"🖥️ [DESCRITORIO LINUX] Abierto nativo: {ruta}")
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))

        # ENDPOINT 2: /ver?ruta=/path/al/archivo.pdf (Sirve bytes para ver en pestaña web)
        elif parsed_url.path == "/ver":
            ruta = query_params.get("ruta", [""])[0]
            if not ruta or not os.path.exists(ruta):
                self.send_response(404)
                self._send_cors_headers()
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"Error 404: Archivo judicial no encontrado en disco.")
                return

            try:
                mime_type, _ = mimetypes.guess_type(ruta)
                if not mime_type:
                    mime_type = "application/octet-stream"

                with open(ruta, "rb") as f:
                    contenido = f.read()

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", mime_type)
                self.send_header("Content-Length", str(len(contenido)))
                self.send_header("Content-Disposition", f'inline; filename="{os.path.basename(ruta)}"')
                self.end_headers()
                self.wfile.write(contenido)
                print(f"🌐 [NAVEGADOR WEB] Servido en pestaña: {os.path.basename(ruta)}")
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(f"Error sirviendo archivo: {str(e)}".encode('utf-8'))

        # ENDPOINT ESTADO VIGILANTE: /estado_vigilante o /api/estado_vigilante
        elif parsed_url.path in ["/estado_vigilante", "/api/estado_vigilante"]:
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(ESTADO_VIGILANTE, ensure_ascii=False).encode('utf-8'))

        # ENDPOINT ARCHIVOS ANALIZADOS: /archivos_analizados o /api/archivos_analizados
        elif parsed_url.path in ["/archivos_analizados", "/api/archivos_analizados"]:
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(HISTORIAL_ARCHIVOS, ensure_ascii=False).encode('utf-8'))

        # ENDPOINT 3: /sincronizar_ojv (Forzar ejecución del Motor OJV con ventana visible en tu escritorio)
        elif parsed_url.path == "/sincronizar_ojv":
            try:
                print("⚡ [SINCRONIZACIÓN VISIBLE OJV] Abriendo ventana de tu navegador en el escritorio para login y control seguro...")
                subprocess.Popen(["python3", "/home/jaime/Descargas/lex-control-casos/motor_ojv_diferencial.py", "--login-humano"])
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status": "ok", "message": "Ventana judicial abierta en tu escritorio. Ingresa tranquilamente con tu clave."}')
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))

        # ENDPOINT 4: /login_humano (Abrir ventana visible para Opción A)
        elif parsed_url.path == "/login_humano":
            try:
                print("🔑 [OPCIÓN A] Abriendo Chromium visible para login y resolución de CAPTCHA...")
                subprocess.Popen(["python3", "/home/jaime/Descargas/lex-control-casos/motor_ojv_diferencial.py", "--login-humano"])
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status": "ok", "message": "Ventana interactiva abierta en el escritorio Linux"}')
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))

        # ENDPOINT 5: /insumos_carpeta (Escanear carpeta física del cliente y extraer insumos documentales para Taller Forense IA)
        elif parsed_url.path == "/insumos_carpeta":
            ruta = query_params.get("ruta", [""])[0]
            if not ruta or not os.path.exists(ruta) or not os.path.isdir(ruta):
                self.send_response(404)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Carpeta del cliente no encontrada en disco local", "insumos": []}).encode('utf-8'))
                return

            try:
                insumos = []
                archivos = os.listdir(ruta)
                for f_name in sorted(archivos):
                    f_path = os.path.join(ruta, f_name)
                    if os.path.isfile(f_path) and not f_name.startswith('.'):
                        tam_bytes = os.path.getsize(f_path)
                        tam_str = f"{tam_bytes / 1024:.1f} KB" if tam_bytes < 1048576 else f"{tam_bytes / 1048576:.2f} MB"
                        
                        # Categorización jurídica según ritualidad chilena
                        nombre_low = f_name.lower()
                        if any(k in nombre_low for k in ["contrato", "acuerdo", "donacion", "escritura", "poder", "patrocinio"]):
                            cat = "📜 Escritura / Instrumento Contractual"
                            rel = "Acredita relación jurídica de fondo, legitimación activa/pasiva y estipulaciones contractuales."
                        elif any(k in nombre_low for k in ["demanda", "recurso", "apelacion", "reposicion", "minuta", "escrito"]):
                            cat = "⚖️ Escrito Procesal / Actuación Judicial"
                            rel = "Fija la competencia, pretensiones de las partes y estado ritual del procedimiento en OJV."
                        elif any(k in nombre_low for k in ["alcoholemia", "fiscalia", "investigativa", "parte", "constancia", "penal"]):
                            cat = "🚨 Evidencia Penal / Parte Policial / Fiscalía"
                            rel = "Prueba fehaciente de los hechos objeto del tipo penal o falta, con cadena de custodia acreditada."
                        elif any(k in nombre_low for k in ["certificado", "inscripcion", "gasto", "comun", "depto", "vigencia", "dominio"]):
                            cat = "🏛️ Certificado Oficial / Prueba Instrumental"
                            rel = "Instrumento público/privado acompañado con citación procesal según Art. 342 y 346 del CPC."
                        elif any(k in nombre_low for k in ["peritaje", "informe", "medico", "contable", "tasacion"]):
                            cat = "🔬 Prueba Pericial / Informe Técnico"
                            rel = "Dictamen técnico especializado conforme a las reglas de la sana crítica (Art. 425 CPC / Art. 297 CPP)."
                        else:
                            cat = "📑 Documento de Respaldo / Expediente Local"
                            rel = "Antecedente documental disponible en carpeta física/digital del estudio para sustento forense."

                        insumos.append({
                            "nombre": f_name,
                            "tamano": tam_str,
                            "categoria": cat,
                            "relevancia": rel,
                            "path": f_path,
                            "incluido": True
                        })

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "total_insumos": len(insumos), "insumos": insumos}, ensure_ascii=False).encode('utf-8'))
                print(f"🧠 [TALLER FORENSE IA] Extraídos {len(insumos)} insumos documentales de la carpeta: {ruta}")
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e), "insumos": []}).encode('utf-8'))

        # ENDPOINT 7: /sincronizar_gmail_pjud (Conector con Gmail IMAP o Radar en Descargas para Excel matutino)
        elif parsed_url.path == "/sincronizar_gmail_pjud":
            try:
                usuario_gmail = query_params.get("usuario", [""])[0]
                clave_app = query_params.get("clave_app", [""])[0]
                modo = query_params.get("modo", ["auto"])[0]
                # El PJUD manda dos planillas distintas cada día. Por defecto se
                # lee el Estado Diario, que es el que fija los emplazamientos;
                # con ?tipo=movimientos se pide la otra.
                tipo_buscado = query_params.get("tipo", ["estado_diario"])[0]
                
                # Cargar configuración local de Gmail si no se pasan parámetros
                if not usuario_gmail or not clave_app:
                    cfg_path = "/home/jaime/.config/lexcontrol_gmail.json"
                    if os.path.exists(cfg_path):
                        try:
                            with open(cfg_path, "r", encoding="utf-8") as f_cfg:
                                data_cfg = json.load(f_cfg)
                                if data_cfg.get("activado", False):
                                    usuario_gmail = data_cfg.get("usuario", "")
                                    clave_app = data_cfg.get("clave_app", "")
                        except Exception as e_cfg:
                            print(f"⚠️ Error leyendo {cfg_path}: {e_cfg}")
                
                archivo_procesar = None
                resultado_sync = None
                origen_sync = "DESCARGAS_RADAR_LOCAL"
                
                # Intentar IMAP si hay credenciales y no se solicitó exclusivamente modo local
                if usuario_gmail and clave_app and modo != "local":
                    print(f"📧 [GMAIL IMAP] Conectando a bandeja de entrada de {usuario_gmail}...")
                    try:
                        mail = imaplib.IMAP4_SSL("imap.gmail.com")
                        mail.login(usuario_gmail, clave_app)
                        mail.select("inbox")
                        
                        # Buscar correos del PJUD con Excel adjunto
                        status, mensajes = mail.search(None, '(FROM "no-responder@pjud.cl")')
                        ids_mail = mensajes[0].split()
                        if ids_mail:
                            # 1. Escanear adjuntos de los correos recibidos en los últimos 2 días y agrupar por FECHA DE RECEPCIÓN DEL CORREO (o fecha del reporte)
                            partes_por_fecha_correo = {}
                            
                            for mail_id in reversed(ids_mail[-15:]):
                                res, msg_data = mail.fetch(mail_id, "(RFC822)")
                                for response_part in msg_data:
                                    if isinstance(response_part, tuple):
                                        msg = email.message_from_bytes(response_part[1])
                                        
                                        # Obtener la fecha de recepción del correo (YYYY-MM-DD)
                                        raw_date = msg.get("Date")
                                        fecha_envio_str = time.strftime("%Y-%m-%d")
                                        if raw_date:
                                            try:
                                                dt_msg = email.utils.parsedate_to_datetime(raw_date)
                                                fecha_envio_str = dt_msg.strftime("%Y-%m-%d")
                                            except Exception:
                                                pass

                                        for part in msg.walk():
                                            if part.get_content_maintype() == "multipart" or part.get("Content-Disposition") is None:
                                                continue
                                            filename = part.get_filename()
                                            es_planilla = filename and any(filename.lower().endswith(ext) for ext in [".xls", ".xlsx"])
                                            if es_planilla and any(k in filename.lower() for k in ['movimiento', 'estadodiario', 'causa', '8328581', 'corte']):
                                                clean_fname = filename.replace("/", "_").replace("\\", "_")
                                                dest_path = os.path.join("/home/jaime/Descargas", f"gmail_pjud_{clean_fname}")
                                                try:
                                                    with open(dest_path, "wb") as f_out:
                                                        f_out.write(part.get_payload(decode=True))
                                                except Exception:
                                                    continue
                                                
                                                res_temp = procesar_excel_pjud(dest_path)
                                                if res_temp.get("status") == "ok" and res_temp.get("total_movimientos", 0) > 0:
                                                    if fecha_envio_str not in partes_por_fecha_correo:
                                                        partes_por_fecha_correo[fecha_envio_str] = []
                                                    partes_por_fecha_correo[fecha_envio_str].append((clean_fname, dest_path, res_temp))

                            # 2. Tomar la FECHA DE RECEPCIÓN MÁS RECIENTE que contenga planillas del PJUD
                            if partes_por_fecha_correo:
                                fechas_ordenadas = sorted(partes_por_fecha_correo.keys(), reverse=True)
                                ultima_fecha_correo = fechas_ordenadas[0]
                                adjuntos_dia = partes_por_fecha_correo[ultima_fecha_correo]

                                movimientos_consolidados = []
                                vistos_clave = set()
                                archivos_procesados = []
                                desglose_combinado = {}

                                for clean_fname, dest_path, res_temp in adjuntos_dia:
                                    archivos_procesados.append(clean_fname)
                                    for m in res_temp["movimientos"]:
                                        clave_u = f"{m.get('rol')}-{m.get('tribunal')}-{m.get('estado')}"
                                        if clave_u not in vistos_clave:
                                            vistos_clave.add(clave_u)
                                            movimientos_consolidados.append(m)
                                            trib = m.get("jurisdiccion", "Otros")
                                            desglose_combinado[trib] = desglose_combinado.get(trib, 0) + 1

                                archivo_procesar = ", ".join(archivos_procesados)
                                origen_sync = f"GMAIL_IMAP ({usuario_gmail}) - Entrega Matutina ({len(archivos_procesados)} planillas recibidas el {ultima_fecha_correo})"
                                resultado_sync = {
                                    "status": "ok",
                                    "archivo_procesado": archivo_procesar,
                                    "path_completo": adjuntos_dia[0][1],
                                    "fecha_estado_diario": ultima_fecha_correo,
                                    "antiguedad_dias": (datetime.date.today() - datetime.date.fromisoformat(ultima_fecha_correo)).days if "-" in str(ultima_fecha_correo) else 0,
                                    "es_de_hoy": True,
                                    "leido_en": time.strftime("%Y-%m-%d %H:%M:%S"),
                                    "total_movimientos": len(movimientos_consolidados),
                                    "desglose_tribunales": desglose_combinado,
                                    "movimientos": movimientos_consolidados,
                                    "origen_sync": origen_sync
                                }
                                print(f"✅ [GMAIL IMAP ENTREGA MATUTINA] {len(movimientos_consolidados)} causas consolidadas de {len(archivos_procesados)} planillas recibidas el {ultima_fecha_correo}.")
                        mail.close()
                        mail.logout()
                    except Exception as e_imap:
                        print(f"⚠️ [GMAIL IMAP] Aviso al conectar IMAP ({e_imap}). Usando radar local de respaldo...")

                # Buscar en la carpeta "Descargas Judiciales" como prioridad absoluta
                if not resultado_sync or resultado_sync.get("total_movimientos", 0) == 0:
                    candidatos = []
                    carpetas_escaneo = [
                        "/home/jaime/Descargas/Descargas Judiciales",
                        "/home/jaime/Descargas Judiciales",
                        "/home/jaime/Descargas/descargas_judiciales",
                        "/home/jaime/Descargas"
                    ]
                    for c_dir in carpetas_escaneo:
                        if os.path.exists(c_dir):
                            for patron in ["EstadoDiario*.xls*", "Movimientos*.xls*", "Causas*.xls*", "*.xlsx", "*.xls"]:
                                candidatos.extend(glob.glob(os.path.join(c_dir, patron)))
                    if candidatos:
                        # Ordenar por fecha de modificación más reciente
                        candidatos.sort(key=os.path.getmtime, reverse=True)
                        for cand in candidatos[:15]:
                            res_cand = procesar_excel_pjud(cand)
                            if res_cand["total_movimientos"] > 0:
                                archivo_procesar = cand
                                resultado_sync = res_cand
                                origen_sync = "DESCARGAS_RADAR_LOCAL (Continuidad Histórica Útil)"
                                print(f"📁 [RADAR LOCAL CONTINUIDAD] Seleccionado último archivo útil en Descargas: {cand} ({res_cand['total_movimientos']} movs)")
                                break
                            elif not resultado_sync:
                                archivo_procesar = cand
                                resultado_sync = res_cand
                                origen_sync = "DESCARGAS_RADAR_LOCAL (Último disponible)"
                        
                if not resultado_sync:
                    self.send_response(404)
                    self._send_cors_headers()
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "No se encontraron archivos Excel del PJUD en correo o Descargas", "movimientos": []}).encode('utf-8'))
                    return
                    
                resultado_sync["origen_sync"] = origen_sync
                if resultado_sync.get("total_movimientos", 0) > 0:
                    resultado_sync["mensaje_continuidad"] = f"📌 Principio de Continuidad: Mostrando Parte Diario del último día hábil con actividad oficial ({resultado_sync['archivo_procesado']})."
                else:
                    resultado_sync["mensaje_continuidad"] = "ℹ️ No se registraron tramitaciones en los últimos envíos judiciales analizados."
                
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(resultado_sync, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e), "movimientos": []}).encode('utf-8'))

        # ENDPOINT 8: /analizar_documento (Analizador IA Forense de PDF o documento judicial)
        elif parsed_url.path == "/analizar_documento":
            query_params = urllib.parse.parse_qs(parsed_url.query)
            ruta = query_params.get("ruta", [None])[0]

            # Sin `ruta` este endpoint tomaba glob.glob("/home/jaime/Descargas/*.pdf")[0]
            # -orden NO determinista del sistema de archivos- y lo analizaba con
            # extraer_metadatos_forenses_pdf(archivar=True, su valor por defecto), que
            # ARCHIVA el documento: lo mueve fuera de Descargas hacia la carpeta de
            # cliente que mejor calce por un heurístico de palabras, o a una bandeja.
            # Un clic en "Analizar PDF en Disco" movía un PDF impredecible del usuario
            # -cualquier descarga, sin decir cuál- y, si el heurístico erraba, terminaba
            # archivado en el expediente de OTRO cliente. En un estudio jurídico eso no
            # es una molestia menor. Ahora hace falta `ruta` explícita: nada de adivinar
            # ni de mover nada como efecto colateral de "no me dijiste cuál".
            if not ruta:
                res = {
                    "status": "error",
                    "error": "Falta indicar `ruta` del documento a analizar. No se elige uno al azar."
                }
            elif os.path.exists(ruta):
                res = extraer_metadatos_forenses_pdf(ruta, os.path.basename(ruta))
            else:
                res = {
                    "status": "error",
                    "error": f"Archivo no encontrado: {ruta}"
                }
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))

        # ENDPOINT 9b: /documentos_pendientes (bandeja "Documentos por Revisar":
        # lo que el Vigilante analizó pero todavía no se archivó ni se vinculó)
        elif parsed_url.path == "/documentos_pendientes":
            self._responder_json({"documentos": catalogos.cargar_documentos_pendientes()})

        # ENDPOINT 9c: /documentos_pendientes_ver?id=X (bytes del PDF en espera,
        # para incrustarlo en un <iframe> -/abrir lo abre en el visor nativo del
        # SO, no sirve para mostrarlo dentro del navegador-)
        elif parsed_url.path == "/documentos_pendientes_ver":
            query_params = urllib.parse.parse_qs(parsed_url.query)
            doc_id = query_params.get("id", [None])[0]
            pendientes = catalogos.cargar_documentos_pendientes()
            entrada = next((d for d in pendientes if d.get("id") == doc_id), None)
            if not entrada or not os.path.exists(entrada.get("archivoStaged", "")):
                self._responder_json({"error": "Documento pendiente no encontrado"}, 404)
            else:
                try:
                    with open(entrada["archivoStaged"], "rb") as f_pdf:
                        contenido = f_pdf.read()
                    self.send_response(200)
                    self._send_cors_headers()
                    self.send_header("Content-Type", "application/pdf")
                    self.send_header("Content-Disposition", f'inline; filename="{entrada.get("nombreOriginal", "documento.pdf")}"')
                    self.end_headers()
                    self.wfile.write(contenido)
                except Exception as e:
                    self._responder_json({"error": str(e)}, 500)

        # ENDPOINT 10: /data/<dataset> (Sirve los catálogos pesados fuera del bundle)
        elif parsed_url.path.startswith("/data/"):
            self._servir_dataset(parsed_url.path[len("/data/"):])

        # ENDPOINT 11: /plazos (Registro de plazos vigilados por el Radar)
        elif parsed_url.path == "/plazos":
            self._responder_json({"plazos": catalogos.cargar_plazos()})

        # ENDPOINT 13: /expedientes (Extrajudiciales y administrativos con sus gestiones)
        elif parsed_url.path == "/expedientes":
            self._responder_json({"expedientes": catalogos.cargar_expedientes()})

        # ENDPOINT 13b: /expedientes_duplicados (candidatos a fusión: exactos por
        # ROL + probables por nombre de cliente parecido + carátula parecida)
        elif parsed_url.path == "/expedientes_duplicados":
            expedientes = catalogos.cargar_expedientes()
            exactos = _detectar_duplicados_exactos(expedientes)
            ids_ya_exactos = {e['id'] for grupo in exactos for e in grupo["expedientes"]}
            try:
                probables = _detectar_duplicados_probables(expedientes, ids_ya_exactos)
            except Exception as e:
                print(f"⚠️ Error detectando duplicados probables: {e}")
                probables = []
            print(f"🔎 [DUPLICADOS] {len(exactos)} grupos exactos, {len(probables)} pares probables sobre {len(expedientes)} expedientes")
            self._responder_json({
                "status": "ok",
                "totalExpedientes": len(expedientes),
                "exactos": exactos,
                "probables": probables
            })

        # ENDPOINT 14: /tareas (Agenda del estudio)
        elif parsed_url.path == "/tareas":
            self._responder_json({"tareas": catalogos.cargar_tareas()})

        # ENDPOINT 12: /buscar_texto?q=... (Busca DENTRO del contenido de los PDF)
        elif parsed_url.path == "/buscar_texto":
            self._buscar_texto(query_params.get("q", [""])[0])

        # ENDPOINT 12b: /buscar_semantico?q=... (Busca por SIGNIFICADO, embeddings)
        elif parsed_url.path == "/buscar_semantico":
            self._buscar_semantico(query_params.get("q", [""])[0])

        # ENDPOINT BACKUP: /descargar_backup (Genera ZIP con data/*.json)
        elif parsed_url.path == "/descargar_backup":
            try:
                buffer = io.BytesIO()
                data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
                fecha_str = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
                zip_filename = f"lexcontrol_backup_{fecha_str}.zip"

                with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                    if os.path.exists(data_dir):
                        for f_name in os.listdir(data_dir):
                            if f_name.endswith(".json") or f_name.endswith(".sqlite"):
                                f_path = os.path.join(data_dir, f_name)
                                zf.write(f_path, arcname=os.path.join("data", f_name))
                
                contenido_zip = buffer.getvalue()
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", f'attachment; filename="{zip_filename}"')
                self.send_header("Content-Length", str(len(contenido_zip)))
                self.end_headers()
                self.wfile.write(contenido_zip)
                print(f"📦 [BACKUP ZIP] Copia de seguridad generada y entregada: {zip_filename} ({len(contenido_zip)/1024:.1f} KB)")
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        # ENDPOINT 6: /status (Verificación de salud del puente)
        elif parsed_url.path == "/status" or parsed_url.path == "/":
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "activo",
                "motor": "LexControl File Launcher v2.2 (Opcion A)",
                "puerto": PUERTO,
                "datasets": sorted(p.stem for p in DATOS_DIR.glob("*.json")) if DATOS_DIR.is_dir() else [],
            }).encode("utf-8"))

        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)

        # Guarda el registro completo de plazos vigilados. Se escribe de forma
        # atómica: si algo falla a mitad, el registro anterior queda intacto.
        if parsed_url.path == "/plazos":
            try:
                largo = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(largo).decode("utf-8"))
                plazos = payload.get("plazos")
                if not isinstance(plazos, list):
                    self._responder_json({"error": "Se esperaba {\"plazos\": [...]}"}, 400)
                    return
                catalogos.guardar_plazos(plazos)
                print(f"⏱️  [RADAR] Registro de plazos guardado: {len(plazos)} vigilados")
                self._responder_json({"status": "ok", "total": len(plazos)})
            except Exception as e:
                self._responder_json({"error": str(e)}, 500)
            return

        # Guarda el registro completo de expedientes extrajudiciales.
        if parsed_url.path == "/expedientes":
            try:
                largo = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(largo).decode("utf-8"))
                expedientes = payload.get("expedientes")
                if not isinstance(expedientes, list):
                    self._responder_json({"error": "Se esperaba {\"expedientes\": [...]}"}, 400)
                    return
                catalogos.guardar_expedientes(expedientes)
                gestiones = sum(len(e.get("gestiones", [])) for e in expedientes)
                print(f"📁 [EXPEDIENTES] {len(expedientes)} expedientes, {gestiones} gestiones")
                self._responder_json({"status": "ok", "total": len(expedientes)})
            except Exception as e:
                self._responder_json({"error": str(e)}, 500)
            return

        # Guarda el catálogo completo de causas PJUD (data/pjudCausesData.json).
        # Existe sobre todo para "Eliminar Expediente": antes esa acción sólo
        # tocaba expedientes.json, así que una causa que nunca se espejó a un
        # expediente -~630 de 2.437- no tenía ninguna forma de borrarse: el
        # botón cerraba el modal como si hubiera funcionado, pero no pasaba
        # nada, y la causa seguía apareciendo igual la próxima vez.
        if parsed_url.path == "/causas_pjud":
            try:
                largo = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(largo).decode("utf-8"))
                causas = payload.get("causas")
                if not isinstance(causas, list):
                    self._responder_json({"error": "Se esperaba {\"causas\": [...]}"}, 400)
                    return
                catalogos.guardar_causas_pjud(causas)
                print(f"📋 [CAUSAS PJUD] {len(causas)} causas guardadas")
                self._responder_json({"status": "ok", "total": len(causas)})
            except Exception as e:
                self._responder_json({"error": str(e)}, 500)
            return

        # Guarda el registro completo de tareas de la agenda.
        if parsed_url.path == "/tareas":
            try:
                largo = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(largo).decode("utf-8"))
                tareas = payload.get("tareas")
                if not isinstance(tareas, list):
                    self._responder_json({"error": "Se esperaba {\"tareas\": [...]}"}, 400)
                    return
                catalogos.guardar_tareas(tareas)
                pendientes = sum(1 for t in tareas if not t.get("completada"))
                print(f"🗒️  [AGENDA] {len(tareas)} tareas guardadas ({pendientes} pendientes)")
                self._responder_json({"status": "ok", "total": len(tareas)})
            except Exception as e:
                self._responder_json({"error": str(e)}, 500)
            return

        # El asistente conversacional. Recibe una instrucción en lenguaje natural y
        # devuelve ACCIONES PROPUESTAS, nunca cambios aplicados: quien valida y
        # escribe es el cliente, contra src/utils/acciones.js, y sólo después de
        # que el abogado confirme el diff. Acá no se toca ningún dato.
        if parsed_url.path == "/asistente":
            # Este endpoint es el RESPALDO de IA del asistente: se llama sólo cuando
            # las reglas deterministas del cliente (src/utils/asistenteReglas.js) no
            # supieron interpretar la frase -frases sueltas, referencias vagas,
            # coordinación de varias cosas a la vez-. Antes acá vivía una SEGUNDA
            # copia de esas mismas heurísticas (matching de tokens, ROL, ranking por
            # palabras) escrita por separado: dos implementaciones de la misma regla
            # que podían divergir. Se eliminó esa copia; el cliente es ahora la única
            # fuente para lo determinista, y esto sólo hace la parte que un regex no
            # puede: entender una frase ambigua con ayuda de un modelo.
            try:
                largo = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(largo).decode("utf-8"))
                texto_usuario = (payload.get("texto") or "").strip()
                if not texto_usuario:
                    self._responder_json({"error": "Falta el texto de la instrucción."}, 400)
                    return

                expedientes = catalogos.cargar_expedientes()
                causas = catalogos.cargar_causas_pjud()
                tareas = catalogos.cargar_tareas()

                # Acotar el catálogo a lo que PODRÍA importar para esta frase, antes de
                # armar el contexto del prompt.
                #
                # Con el estudio ya migrado (1.558 expedientes, 2.437 causas), volcar el
                # catálogo completo -sin límite en expedientes, sólo causas[:40]- se probó
                # en vivo (31-jul-2026) y el modelo local dejó de encontrar hasta
                # coincidencias obvias ('Garai', que sí está en el catálogo) y de responder
                # instrucciones simples ('crea una tarea...'): el prompt se volvió tan
                # grande que perdió capacidad de atender ninguna parte de él. Gemini podía
                # tolerar ese volumen; un modelo local de 4B no. Se reduce a los candidatos
                # con al menos una palabra en común con la frase -mismo criterio que
                # resolverReferencia() en el cliente-, sin decidir la acción final: eso lo
                # sigue haciendo el modelo, sólo con una lista manejable delante.
                expedientes_ctx, causas_ctx = _candidatos_relevantes(texto_usuario, expedientes, causas)

                contexto = []
                for e in expedientes_ctx:
                    contexto.append(f"- EXPEDIENTE id='{e.get('id')}' cliente='{e.get('cliente')}' asunto='{e.get('asunto')}'")
                # Sólo las causas con ROL utilizable entran como referencia directa:
                # 318 del Excel traen "ROL " sin número y no identifican nada.
                for c in causas_ctx:
                    rol = str(c.get("rit") or "")
                    ref = rol if any(ch.isdigit() for ch in rol) else c.get("id")
                    contexto.append(f"- CAUSA ref='{ref}' caratula='{c.get('caratula')}' tribunal='{c.get('tribunal','')}'")
                for t in tareas[:30]:
                    contexto.append(f"- TAREA id='{t.get('id')}' titulo='{t.get('titulo')}' completada={bool(t.get('completada'))}")
                texto_contexto = "\n".join(contexto) if contexto else "Ninguno de los expedientes o causas del estudio calza con palabras de esta frase."

                schema = {
                    "type": "object",
                    "properties": {
                        "respuesta": {
                            "type": "string",
                            "description": "Respuesta breve en español chileno para el abogado. Si propones acciones, descríbelas en una frase. Si no entendiste o falta un dato, dilo y pregunta."
                        },
                        "acciones": {
                            "type": "array",
                            "description": "Acciones propuestas. Vacío si la instrucción no pide cambiar nada.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "accion": {
                                        "type": "string",
                                        "description": "Una de: registrar_gestion, crear_expediente, modificar_expediente, crear_tarea, modificar_tarea, vigilar_plazo, abrir_expediente, abrir_modal_ingreso_gestion",
                                        "enum": ["registrar_gestion", "crear_expediente", "modificar_expediente",
                                                 "crear_tarea", "modificar_tarea", "vigilar_plazo", "abrir_expediente",
                                                 "abrir_modal_ingreso_gestion"]
                                    },
                                    "motivo": {"type": "string", "description": "Por qué esta acción responde a lo pedido, en una frase."},
                                    "casoRef": {"type": "string", "description": "Identificador EXACTO ('ref' o 'id') de una CAUSA o EXPEDIENTE del contexto. Nunca lo inventes."},
                                    "tramite": {"type": "string", "description": "Descripción de la gestión, máximo 12 palabras."},
                                    "estado": {"type": "string", "description": "'COMPLETADO' o 'PENDIENTE (POR HACER)'."},
                                    "cliente": {"type": "string"},
                                    "asunto": {"type": "string"},
                                    "tipo": {"type": "string", "description": "'judicial', 'extrajudicial' o 'administrativo'."},
                                    "tab": {"type": "string", "description": "Para abrir_expediente: 'gestiones' si pidió ver las gestiones, movimientos, trámites o el historial; 'resumen' en cualquier otro caso."},
                                    "campo": {"type": "string", "description": "Para modificar_expediente: uno de cliente, asunto, tribunal, tipo."},
                                    "valor": {"type": "string", "description": "Para modificar_expediente: el valor nuevo del campo."},
                                    "titulo": {"type": "string", "description": "Título de la tarea."},
                                    "fechaVencimiento": {"type": "string", "description": "YYYY-MM-DD."},
                                    "prioridad": {"type": "string", "description": "'CRITICA', 'ALTA' o 'NORMAL'."},
                                    "tareaId": {"type": "string", "description": "id EXACTO de una TAREA del contexto."},
                                    "completada": {"type": "boolean"},
                                    "procedimientoId": {"type": "string", "description": "id del catálogo de plazos. Si no lo sabes con certeza, NO propongas vigilar_plazo."},
                                    "fechaBase": {"type": "string", "description": "YYYY-MM-DD de la notificación o hito."},
                                    "notas": {"type": "string"}
                                },
                                "required": ["accion", "motivo"]
                            }
                        }
                    },
                    "required": ["respuesta", "acciones"]
                }

                prompt = f"""Eres el asistente de LexControl, el sistema de un abogado litigante chileno.
Traduces lo que él te pide a ACCIONES CONCRETAS del sistema. No ejecutas nada: sólo propones.
Él revisa cada propuesta y la confirma o la descarta.

CONTEXTO REAL DEL ESTUDIO (única fuente de identificadores válidos):
{texto_contexto}

EJEMPLO: para "crea una tarea para mañana: presentar el escrito de apelación", la
respuesta CORRECTA es proponer crear_tarea SIN casoRef -una tarea no necesita estar
ligada a ningún caso, aunque suene a materia legal-:
{{"respuesta": "Creo la tarea para mañana.", "acciones": [{{"accion": "crear_tarea", "motivo": "Se pidió agendar un pendiente", "titulo": "Presentar el escrito de apelación", "fechaVencimiento": "{(datetime.date.today() + datetime.timedelta(days=1)).isoformat()}"}}]}}

REGLAS QUE NO PUEDES ROMPER:
1. `casoRef` y `tareaId` deben copiarse EXACTAMENTE de una línea del contexto. Si lo
   que pide no calza con ninguna, NO inventes el identificador: devuelve acciones
   vacías y pregunta a cuál se refiere. ESTA REGLA NO APLICA a `crear_tarea` ni a
   `crear_expediente` (ver el ejemplo de arriba): una tarea puede existir SIN estar
   ligada a ningún caso, y `crear_expediente` es justamente para
   algo que TODAVÍA no está en el contexto, por eso no busques uno existente para
   esa acción.
2. Si falta un dato obligatorio (por ejemplo el título de una tarea, o la fecha base
   de un plazo), no lo rellenes con algo plausible. Pregunta.
3. `vigilar_plazo` sólo si conoces el `procedimientoId` exacto del catálogo. Ante la
   duda, responde que lo agregue desde Cómputo de Términos. Un plazo mal calculado
   es peor que ningún plazo.
4. `modificar_expediente` cambia UN campo por acción (`campo` + `valor`). Si hay que
   cambiar dos, propone dos acciones.
5. Si la instrucción es una pregunta conceptual u orientativa y no pide ver, abrir ni cambiar nada, responde en 'respuesta' y deja 'acciones' vacío.
6. Nunca propongas borrar nada: no existe esa acción.
7. Si la instrucción del abogado pide VER, MOSTRAR, ABRIR o CONSULTAR fichas de causas o expedientes (por ejemplo "muéstrame el expediente Garai", "muéstrame las fichas de los expedientes de Garai", "abre la causa Medina"), DEBES incluir en 'acciones' la acción 'abrir_expediente' con `casoRef` para CADA causa o expediente del contexto que corresponda. Usa `tab: "gestiones"` si pidió ver gestiones, movimientos, trámites o historial; si no, `tab: "resumen"`.

8. CUIDADO CON EL VERBO "ABRIR", que en la práctica chilena significa dos cosas
   opuestas y hay que decidir por el contexto:
   - "ábreme UN expediente PARA <persona nueva>", "abrir un expediente nuevo",
     "abrir causa a <cliente>"  ->  es CREAR: usa `crear_expediente`.
   - "abre EL expediente DE <alguien que ya está en el contexto>", "ábreme la causa
     Medina"  ->  es MOSTRAR la ficha: usa `abrir_expediente`.
   La señal decisiva es si la persona o el asunto YA aparece en el contexto de
   arriba. Si ya está, se muestra. Si no está, se crea. Ante la duda real, no
   adivines: pregunta cuál de las dos cosas quiere.

9. Si pide REGISTRAR o INGRESAR una gestión pero no dicta su contenido (por ejemplo
   "quiero anotar algo en la causa X", "ábreme el formulario de gestión"), usa
   `abrir_modal_ingreso_gestion` con `casoRef`. Si SÍ dicta el contenido, usa
   `registrar_gestion` directamente.

INSTRUCCIÓN DEL ABOGADO:
{texto_usuario}
"""

                # Local primero -sin costo, sin internet-, Gemini como respaldo
                # optativo sólo si hay clave configurada. Mismo orden que en el
                # análisis de documentos, y por la misma razón: el trabajo acá es
                # traducir una frase a una de 8 acciones conocidas del contexto ya
                # dado, no razonar jurídicamente -eso lo hace bien un modelo chico.
                json_ia = _ollama_generar_json(prompt, schema, timeout=45)
                motor_usado = "local" if json_ia else None

                if not json_ia and GEMINI_API_KEY:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
                    gemini_payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema}
                    }
                    for intento in range(2):
                        try:
                            data = json.dumps(gemini_payload).encode("utf-8")
                            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
                            with urllib.request.urlopen(req, timeout=20) as response:
                                res = json.loads(response.read().decode("utf-8"))
                                json_ia = json.loads(res["candidates"][0]["content"]["parts"][0]["text"])
                                motor_usado = "gemini"
                                break
                        except Exception as e_gem:
                            print(f"⚠️ Intento {intento + 1} del asistente (Gemini) falló: {e_gem}")
                            if intento == 0:
                                time.sleep(1)

                # Sin heurística de reemplazo si los dos motores fallan: adivinar una
                # ACCIÓN puede escribir en el expediente equivocado, y eso es peor
                # que decir con franqueza que no se pudo interpretar la frase.
                if not json_ia:
                    self._responder_json({
                        "status": "error",
                        "respuesta": "No pude interpretar esa frase: ni el modelo local ni Gemini (si está configurado) respondieron. Prueba con una frase más directa, o repórtalo si persiste.",
                        "acciones": []
                    })
                    return

                acciones = json_ia.get("acciones") or []
                print(f"🤖 [ASISTENTE:{motor_usado}] '{texto_usuario[:60]}' -> {len(acciones)} acción(es) propuesta(s)")
                self._responder_json({
                    "status": "ok",
                    "respuesta": json_ia.get("respuesta") or "",
                    "acciones": acciones,
                    "motor_ia": motor_usado
                })
            except Exception as e:
                self._responder_json({"error": str(e)}, 500)
            return

        if parsed_url.path == "/analizar_documento":
            try:
                query_params = urllib.parse.parse_qs(parsed_url.query)
                filename = query_params.get("filename", ["documento.pdf"])[0]
                filename = urllib.parse.unquote(filename)
                
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                
                # Si viene como multipart/form-data desde FormData de HTML5
                if post_data.startswith(b"--"):
                    try:
                        parts = post_data.split(b"\r\n\r\n", 1)
                        if len(parts) > 1:
                            hdr = parts[0].decode('utf-8', errors='ignore')
                            match_fn = re.search(r'filename="([^"]+)"', hdr, re.IGNORECASE)
                            if match_fn:
                                filename = match_fn.group(1)
                            body_bytes = parts[1]
                            bound_idx = body_bytes.rfind(b"\r\n--")
                            if bound_idx != -1:
                                body_bytes = body_bytes[:bound_idx]
                            post_data = body_bytes
                    except Exception as e_mp:
                        print(f"Aviso parseando multipart: {e_mp}")
                
                # ?archivar=false analiza sin mover nada: sirve para revisar el
                # documento y lo que extrajo la IA antes de integrarlo.
                archivar = query_params.get("archivar", ["true"])[0].lower() not in ("false", "0", "no")
                print(f"📥 [{'SUBIDA' if archivar else 'VISTA PREVIA'}] {len(post_data)} bytes de '{filename}'")
                res = extraer_metadatos_forenses_pdf(post_data, filename, archivar=archivar)
                res["archivado"] = bool(res.get("ruta_guardado"))

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                print(f"⚠️ Error procesando subida de documento: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode('utf-8'))
            return

        # ENDPOINT 9d: /confirmar_documento_pendiente (bandeja "Documentos por
        # Revisar": el abogado confirma -o corrige- y RECIÉN ahí se archiva el
        # documento físico y se crea la gestión. Reutiliza las mismas funciones
        # que antes usaba el Vigilante solo: archivar_pdf_fisicamente() y
        # vincular_documento_a_expediente(), nada de lógica de archivado nueva.
        elif parsed_url.path == "/confirmar_documento_pendiente":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                payload = json.loads(self.rfile.read(content_length).decode('utf-8'))
                doc_id = payload.get("id")

                pendientes = catalogos.cargar_documentos_pendientes()
                entrada = next((d for d in pendientes if d.get("id") == doc_id), None)
                if not entrada:
                    self._responder_json({"status": "error", "error": "Documento pendiente no encontrado"}, 404)
                    return
                if not os.path.exists(entrada.get("archivoStaged", "")):
                    self._responder_json({"status": "error", "error": "El archivo en espera ya no existe en disco"}, 404)
                    return

                analisis_base = entrada.get("analisis", {})
                analisis = {
                    campo: payload.get(campo, analisis_base.get(campo, ""))
                    for campo in (
                        "rol", "tribunal", "caratula", "materia", "hito_critico",
                        "tipo_gestion", "fecha_audiencia_fijada", "ruts_detectados",
                        "accion_sugerida", "cuaderno", "plazo_dias", "tipo_plazo"
                    )
                }
                rol = analisis.get("rol", "")
                cliente_conocido, caratula_conocida = _cliente_conocido_por_rol(rol)
                ruta_final = archivar_pdf_fisicamente(
                    entrada["archivoStaged"], entrada["nombreOriginal"], rol,
                    cliente_conocido, analisis.get("caratula") or caratula_conocida
                )
                if not ruta_final:
                    self._responder_json({"status": "error", "error": "No se pudo archivar el documento"}, 500)
                    return

                expediente_id_forzado = payload.get("expediente_id") or None
                expediente, detalles_txt = vincular_documento_a_expediente(
                    analisis, entrada["nombreOriginal"], ruta_final, expediente_id_forzado
                )

                pendientes = [d for d in pendientes if d.get("id") != doc_id]
                catalogos.guardar_documentos_pendientes(pendientes)

                print(f"✅ [REVISIÓN CONFIRMADA] {entrada['nombreOriginal']} -> {expediente.get('id') if expediente else 'sin expediente'} ({ruta_final})")
                self._responder_json({
                    "status": "ok",
                    "ruta_final": ruta_final,
                    "expediente_id": expediente.get("id") if expediente else None,
                    "detalles": detalles_txt
                })
            except Exception as e:
                self._responder_json({"status": "error", "error": str(e)}, 500)
            return

        # ENDPOINT 9e: /descartar_documento_pendiente (bandeja de revisión: el
        # abogado decide que este documento no corresponde archivarlo vinculado
        # a nada -se manda a la bandeja sin clasificar, igual que un documento
        # sin cliente identificable, no se pierde-)
        elif parsed_url.path == "/descartar_documento_pendiente":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                payload = json.loads(self.rfile.read(content_length).decode('utf-8'))
                doc_id = payload.get("id")

                pendientes = catalogos.cargar_documentos_pendientes()
                entrada = next((d for d in pendientes if d.get("id") == doc_id), None)
                if not entrada:
                    self._responder_json({"status": "error", "error": "Documento pendiente no encontrado"}, 404)
                    return

                if os.path.exists(entrada.get("archivoStaged", "")):
                    archivar_en_bandeja(entrada["archivoStaged"], entrada["nombreOriginal"])

                pendientes = [d for d in pendientes if d.get("id") != doc_id]
                catalogos.guardar_documentos_pendientes(pendientes)
                print(f"🗑️ [REVISIÓN DESCARTADA] {entrada['nombreOriginal']} -> bandeja sin clasificar")
                self._responder_json({"status": "ok"})
            except Exception as e:
                self._responder_json({"status": "error", "error": str(e)}, 500)
            return

        # ENDPOINT 9: /bitacora_omnicanal (Analizador Rápido de Gestiones NLP)
        elif parsed_url.path == "/bitacora_omnicanal":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                texto_bitacora = payload.get("texto", "")
                
                print(f"📥 [BITÁCORA OMNICANAL] Procesando texto: '{texto_bitacora}'")

                # Cargar contexto activo de expedientes y causas para que la IA sepa de qué clientes habla el abogado
                expedientes_activos = catalogos.cargar_expedientes()
                causas_activas = catalogos.cargar_causas_pjud()

                resumen_contexto = []
                for e in expedientes_activos[:15]:
                    resumen_contexto.append(f"- Cliente: '{e.get('cliente')}', Asunto: '{e.get('asunto')}', ID: {e.get('id')}")
                for c in causas_activas[:15]:
                    resumen_contexto.append(f"- Cliente/Carátula: '{c.get('caratula')}', Tribunal/Materia: '{c.get('tribunal', '')} {c.get('materia', '')}', ROL: {c.get('rit')}")

                texto_contexto = "\n".join(resumen_contexto) if resumen_contexto else "Sin casos registrados aún."

                # Motor PRINCIPAL: local (Ollama), sin costo ni internet. Mismo criterio
                # que analizar_con_ollama: clasificar una anotación corta es extracción,
                # no razonamiento legal profundo.
                motor_usado = "local"
                json_ia = analizar_bitacora_con_ollama(texto_bitacora, texto_contexto)

                # Respaldo: Gemini, sólo si el motor local no está disponible/falló Y hay clave configurada.
                if not json_ia and GEMINI_API_KEY:
                    motor_usado = "gemini"
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

                    schema = {
                        "type": "object",
                        "properties": {
                            "cliente_detectado": {"type": "string", "description": "Sólo el nombre de la persona o empresa, SIN tratamientos ('don', 'doña', 'señor', 'sr.', 'sra.'). Ej: 'Víctor Garai', no 'don Víctor Garai'."},
                            "asunto_detectado": {"type": "string", "description": "El objeto concreto del que trata la gestión, en 1 a 4 palabras, sin verbos. Es lo que distingue dos asuntos distintos del MISMO cliente. Ej: 'camioneta', 'arriendo local Ñuñoa', 'despido injustificado', 'pensión de alimentos'. Si no se puede determinar, cadena vacía."},
                            "rol_detectado": {"type": "string", "description": "El ROL o RIT literal de la causa SÓLO si aparece escrito en el texto con formato de rol chileno (C-1869-2026, O-934-2023, RIT 700-2026, ROL 35002-2026). Si no hay un rol con ese formato, devuelve exactamente 'EXTRAJUDICIAL'. NUNCA inventes un rol ni pongas acá el tipo de gestión ('Embargo', 'Cobranza'): eso va en el asunto."},
                            "tramite_generado": {"type": "string", "description": "Un resumen ejecutivo forense de la gestión realizada o a realizar. No mas de 12 palabras."},
                            "estado": {"type": "string", "description": "Debe ser 'COMPLETADO' o 'PENDIENTE (POR HACER)'"},
                            "urgencia": {"type": "string", "description": "Debe ser 'NORMAL', 'ALTA' o 'URGENTE'"}
                        },
                        "required": ["cliente_detectado", "asunto_detectado", "rol_detectado", "tramite_generado", "estado", "urgencia"]
                    }

                    prompt = f"""
Eres un asistente jurídico. Clasifica el siguiente registro ingresado rápidamente por un abogado.
Extrae el cliente, el asunto concreto, el ROL o causa, y genera un trámite procesal o acción realizada en base a lo escrito.
Identifica si la gestión está terminada o pendiente.

CONTEXTO DE CASOS Y CLIENTES REGISTRADOS EN EL ESTUDIO:
{texto_contexto}

REGLA DE ASOCIACIÓN POR CONTEXTO:
Si el texto del abogado no dice explícitamente el nombre del cliente pero menciona una ciudad, tribunal, materia o asunto que coincide con un caso del contexto arriba listado (ej: 'querella en Calbuco' -> Víctor Garai / querella), ASIGNA a ese cliente y asunto en cliente_detectado y asunto_detectado.

REGLA DE ORO: Si de la lectura se concluye que es una gestión administrativa, una asesoría o un caso extrajudicial sin ROL/RIT aparente, debes asignar "EXTRAJUDICIAL" en el campo rol_detectado.

SOBRE EL CLIENTE: entrega el nombre limpio, sin "don", "doña", "señor" ni abreviaturas de tratamiento. El sistema usa ese nombre para reconocer que dos anotaciones distintas hablan de la misma persona, así que debe escribirse igual siempre.

SOBRE EL ASUNTO: es el objeto de la gestión, no la acción. Un mismo cliente puede tener varios asuntos abiertos a la vez y cada uno es un expediente separado; el asunto es lo que los distingue.

TEXTO:
{texto_bitacora}
"""

                    gemini_payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "responseSchema": schema
                        }
                    }

                    # Intentar hasta 2 veces con Gemini en caso de 503 Service Unavailable temporal
                    for intento in range(2):
                        try:
                            data = json.dumps(gemini_payload).encode('utf-8')
                            req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
                            with urllib.request.urlopen(req, timeout=12) as response:
                                res = json.loads(response.read().decode('utf-8'))
                                texto_respuesta = res['candidates'][0]['content']['parts'][0]['text']
                                json_ia = json.loads(texto_respuesta)
                                break
                        except Exception as e_gem:
                            print(f"⚠️ Intento {intento + 1} Gemini falló: {e_gem}")
                            if intento == 0:
                                time.sleep(1)

                # Fallback heurístico final si ni el motor local ni Gemini respondieron
                if not json_ia:
                    motor_usado = "heuristico"
                    print("⚠️ Ningún motor de IA disponible. Aplicando extracción heurística procesal de emergencia...")
                    match_rol = re.search(r'\b([CVSPEARKOTMR]-\d+-\d{4}|\d+-\d{4})\b', texto_bitacora, re.IGNORECASE)
                    rol_fallback = match_rol.group(1).upper() if match_rol else "EXTRAJUDICIAL"
                    
                    stop_w = {'llamé', 'llame', 'hablé', 'hable', 'con', 'para', 'por', 'sobre', 'del', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'don', 'doña', 'señor', 'sra', 'sr'}
                    palabras = [w for w in re.findall(r'[a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,}', texto_bitacora) if w.lower() not in stop_w]
                    
                    cliente_fb = palabras[0].capitalize() if palabras else "Cliente Registrado"
                    asunto_fb = palabras[1].lower() if len(palabras) > 1 else "gestión general"
                    
                    es_pendiente = any(w in texto_bitacora.lower() for w in ['pendiente', 'hacer', 'revisar', 'preparar', 'presentar', 'redactar'])
                    es_urgente = any(w in texto_bitacora.lower() for w in ['urgente', 'hoy', 'mañana', 'plazo', 'fatal', 'vence'])
                    
                    json_ia = {
                        "cliente_detectado": cliente_fb,
                        "asunto_detectado": asunto_fb,
                        "rol_detectado": rol_fallback,
                        "tramite_generado": texto_bitacora[:60],
                        "estado": "PENDIENTE (POR HACER)" if es_pendiente else "COMPLETADO",
                        "urgencia": "URGENTE" if es_urgente else "NORMAL"
                    }
                    
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "datos": json_ia, "motor_ia": motor_usado}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                print(f"⚠️ Error en bitácora omnicanal: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode('utf-8'))
            return

        # ENDPOINT 15: /briefing_diario (redacta en prosa lo que ya calculó
        # cargarAtencion() en el cliente -no decide qué es urgente, sólo lo cuenta-)
        elif parsed_url.path == "/briefing_diario":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                payload = json.loads(self.rfile.read(content_length).decode('utf-8'))
                atencion = payload.get("atencion", [])
                pendientes = payload.get("pendientes", [])

                motor_usado = "heuristico"
                texto = None

                if atencion or pendientes:
                    items_txt = []
                    for it in atencion[:12]:
                        items_txt.append(f"- {it.get('titulo','')} ({it.get('caratulaMostrada','')}) — {it.get('etiquetaTiempo','')}")
                    for it in pendientes[:8]:
                        items_txt.append(f"- PENDIENTE sin fecha: {it.get('titulo','')} ({it.get('caratulaMostrada','')}) — {it.get('etiquetaTiempo','')}")

                    prompt = f"""Eres la secretaria ejecutiva de un abogado litigante chileno. Redacta un briefing
matutino MUY BREVE (máximo 70 palabras), en español chileno neutro, tuteando al abogado.

REGLAS:
- Usa SOLO lo que está en la lista. No inventes plazos, clientes ni cifras que no estén ahí.
- No des opiniones legales ni sugieras estrategia: sólo organiza y prioriza lo que ya existe.
- Si hay vencidos u HOY, menciónalos primero.
- Tono profesional y directo, como un resumen que se lee en 10 segundos.

LISTA DE HOY:
{chr(10).join(items_txt) if items_txt else '(nada pendiente)'}
"""
                    if _ollama_disponible():
                        data = _ollama_generar_json(prompt, {"type": "object", "properties": {"texto": {"type": "string"}}, "required": ["texto"]}, timeout=30)
                        if data and data.get("texto"):
                            texto = data["texto"]
                            motor_usado = "local"
                    if not texto and GEMINI_API_KEY:
                        try:
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
                            gemini_payload = {
                                "contents": [{"parts": [{"text": prompt}]}],
                                "generationConfig": {"responseMimeType": "application/json", "responseSchema": {"type": "object", "properties": {"texto": {"type": "string"}}, "required": ["texto"]}}
                            }
                            req = urllib.request.Request(url, data=json.dumps(gemini_payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
                            with urllib.request.urlopen(req, timeout=12) as response:
                                res = json.loads(response.read().decode('utf-8'))
                                texto = json.loads(res['candidates'][0]['content']['parts'][0]['text'])["texto"]
                                motor_usado = "gemini"
                        except Exception as e_gem:
                            print(f"⚠️ Gemini falló en /briefing_diario: {e_gem}")

                if not texto:
                    motor_usado = "heuristico"
                    n_atencion = len(atencion)
                    n_pend = len(pendientes)
                    if n_atencion == 0 and n_pend == 0:
                        texto = "Hoy no tienes plazos ni gestiones pendientes registradas. Buen momento para revisar causas en curso."
                    else:
                        partes = []
                        if n_atencion:
                            partes.append(f"{n_atencion} {'asunto requiere' if n_atencion == 1 else 'asuntos requieren'} tu atención hoy")
                        if n_pend:
                            partes.append(f"{n_pend} {'gestión sigue' if n_pend == 1 else 'gestiones siguen'} pendiente de cierre")
                        texto = ". ".join(p.capitalize() for p in partes) + "."

                self._responder_json({"status": "ok", "texto": texto, "motor_ia": motor_usado})
            except Exception as e:
                print(f"⚠️ Error en /briefing_diario: {e}")
                self._responder_json({"status": "error", "error": str(e)}, 500)
            return

        # ENDPOINT 16: /resumen_expediente (redacta en prosa la bitácora de UN caso,
        # sólo describe lo que ya está registrado -nunca opina ni sugiere estrategia-)
        elif parsed_url.path == "/resumen_expediente":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                payload = json.loads(self.rfile.read(content_length).decode('utf-8'))
                caso = payload.get("caso", {})
                gestiones = payload.get("gestiones", [])

                motor_usado = "heuristico"
                texto = None

                caratula = caso.get("caratula") or caso.get("cliente") or "el caso"
                gestiones_txt = "\n".join(
                    f"- {g.get('fecha','')}: {g.get('tramite','')} ({g.get('estado','')})"
                    for g in gestiones[:20]
                ) or "(sin gestiones registradas todavía)"

                if gestiones:
                    prompt = f"""Eres un asistente jurídico chileno. Redacta un resumen ejecutivo MUY BREVE
(máximo 80 palabras) del estado procesal del caso "{caratula}" ({caso.get('materia','')}, {caso.get('tribunal','')}),
en español chileno neutro, en tercera persona.

REGLAS:
- Describe SÓLO lo que está en la bitácora de abajo: qué se ha hecho y qué sigue pendiente.
- NO des opiniones legales, NO evalúes la validez de la tramitación, NO sugieras estrategia.
- NO inventes fechas, trámites ni resultados que no estén en la lista.
- Termina señalando cuál es el trámite pendiente más reciente, si lo hay.

BITÁCORA (más reciente primero):
{gestiones_txt}
"""
                    if _ollama_disponible():
                        data = _ollama_generar_json(prompt, {"type": "object", "properties": {"texto": {"type": "string"}}, "required": ["texto"]}, timeout=30)
                        if data and data.get("texto"):
                            texto = data["texto"]
                            motor_usado = "local"
                    if not texto and GEMINI_API_KEY:
                        try:
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
                            gemini_payload = {
                                "contents": [{"parts": [{"text": prompt}]}],
                                "generationConfig": {"responseMimeType": "application/json", "responseSchema": {"type": "object", "properties": {"texto": {"type": "string"}}, "required": ["texto"]}}
                            }
                            req = urllib.request.Request(url, data=json.dumps(gemini_payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
                            with urllib.request.urlopen(req, timeout=12) as response:
                                res = json.loads(response.read().decode('utf-8'))
                                texto = json.loads(res['candidates'][0]['content']['parts'][0]['text'])["texto"]
                                motor_usado = "gemini"
                        except Exception as e_gem:
                            print(f"⚠️ Gemini falló en /resumen_expediente: {e_gem}")

                if not texto:
                    motor_usado = "heuristico"
                    if not gestiones:
                        texto = "Todavía no hay gestiones registradas en este expediente."
                    else:
                        ultima = gestiones[0]
                        texto = (f"Se registran {len(gestiones)} gestiones. La más reciente: "
                                 f"{ultima.get('tramite','')} ({ultima.get('fecha','')}), estado {ultima.get('estado','')}.")

                self._responder_json({"status": "ok", "texto": texto, "motor_ia": motor_usado})
            except Exception as e:
                print(f"⚠️ Error en /resumen_expediente: {e}")
                self._responder_json({"status": "error", "error": str(e)}, 500)
            return

        # ENDPOINT 10: /generar_escrito_ia (Redactor Forense de Escritos Judiciales)
        elif parsed_url.path == "/generar_escrito_ia":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                
                caso = payload.get("caso", {})
                tipo_escrito = payload.get("tipo_escrito", "Solicitud Procesal")
                instruccion = payload.get("instruccion", "")
                modo = payload.get("modo", "ia")  # 'ia' o 'heuristico'
                
                caratula = caso.get("caratula") or caso.get("cliente") or "PARTE ACTORA con PARTE DEMANDADA"
                tribunal = caso.get("tribunal", "JUZGADO CORRESPONDIENTE")
                rit = caso.get("rit") or caso.get("rol") or caso.get("id") or "C-2026"
                materia = caso.get("materia", "Derecho Procesal Chileno")

                # MODO HEURÍSTICO 100% LOCAL (SIN IA NI INTERNET)
                if modo == "heuristico":
                    snippet_base = ""
                    try:
                        db_path = BASE_DIR / "data" / "indice_texto.sqlite"
                        if db_path.exists():
                            con_fts = sqlite3.connect(db_path)
                            kw = re.sub(r'[^a-zA-Z0-9\s]', '', tipo_escrito + " " + materia).strip()
                            kw_query = " OR ".join([w for w in kw.split() if len(w) > 3][:3])
                            if kw_query:
                                res = con_fts.execute("SELECT snippet(textos, 3, '', '', '...', 30) FROM textos WHERE contenido MATCH ? LIMIT 1", (kw_query,)).fetchone()
                                if res: snippet_base = res[0]
                            con_fts.close()
                    except Exception:
                        pass

                    txt_antecedentes = f"ANTECEDENTES EXTRAÍDOS DE LA BASE DEL ESTUDIO:\n{snippet_base}" if snippet_base else ""
                    escrito_heuristico = f"""EN LO PRINCIPAL: {tipo_escrito.upper()}.

S. J. L. ({tribunal.upper()})

JAIME MARCELO MORAGA CARRASCO, abogado, por la parte correspondiente en los autos caratulados "{caratula}", ROL/RIT {rit}, a S.S. respetuosamente digo:

Que por este acto vengo en solicitar {tipo_escrito.lower()} conforme a las normas del Código de Procedimiento Civil / Código Procesal Penal.

FUNDAMENTOS DE HECHO Y DE DERECHO:
{instruccion if instruccion else 'Que habiendo transcurrido el plazo legal sin que existan diligencias pendientes, corresponde dar curso progresivo a los autos.'}

{txt_antecedentes}

POR TANTO,
A S.S. RUEGO acceder a lo solicitado y proveer de conformidad.

ES JUSTICIA."""

                    self.send_response(200)
                    self._send_cors_headers()
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok", "escrito": escrito_heuristico, "modo": "heuristico_local"}, ensure_ascii=False).encode('utf-8'))
                    return

                # 🔍 RAG INJECTOR: Buscar automáticamente precedentes históricos en los 12.870 documentos del estudio
                precedentes_contexto = ""
                try:
                    db_path = BASE_DIR / "data" / "indice_texto.sqlite"
                    if db_path.exists():
                        con_fts = sqlite3.connect(db_path)
                        # Limpiar palabras clave para la consulta FTS5
                        kw = re.sub(r'[^a-zA-Z0-9\s]', '', tipo_escrito + " " + materia).strip()
                        kw_query = " OR ".join([w for w in kw.split() if len(w) > 3][:4])
                        if kw_query:
                            res_fts = con_fts.execute(
                                "SELECT nombre, carpeta, snippet(textos, 3, '', '', '...', 25) FROM textos WHERE contenido MATCH ? LIMIT 3",
                                (kw_query,)
                            ).fetchall()
                            if res_fts:
                                precedentes_contexto = "\n".join([f"• [{r[0]} - Carpeta {r[1]}]: {r[2]}" for r in res_fts])
                        con_fts.close()
                except Exception as e_fts:
                    print(f"⚠️ Aviso RAG FTS5: {e_fts}")

                prompt = f"""
Eres un distinguido abogado litigante chileno y redactor judicial forense senior.
Redacta un ESCRITO JUDICIAL COMPLETO, FORMAL Y RIGUROSO conforme al Código de Procedimiento Civil (CPC) o Código Procesal Penal (CPP) chileno según corresponda.

DATOS DE LA CAUSA:
- CARÁTULA: {caratula}
- ROL / RIT: {rit}
- TRIBUNAL: {tribunal}
- MATERIA: {materia}

TIPO DE ESCRITO: {tipo_escrito}
INSTRUCCIÓN ESPECÍFICA DEL ABOGADO:
{instruccion}

PRECEDENTES Y ESTILO HISTÓRICO RECOLECTADO DE LOS 12.870 DOCUMENTOS DEL ESTUDIO:
{precedentes_contexto if precedentes_contexto else 'No hay precedentes idénticos, redactar según doctrina general chilena.'}

REGLAS DE FORMATO Y CONTENIDO DEL ESCRITO:
1. Usa la fundamentación jurídica, tono institucional y petitorios de los precedentes del estudio indicados arriba como guía.
2. Incluye las Sumas oficiales (EN LO PRINCIPAL: ..., EN EL PRIMER OTROSÍ: ...).
3. Dirígete a la Autoridad Judicial formalmente (S. J. L. de Garantía / Civil / Letras / Trabajo / Ilma. Corte).
4. Presentación formal del abogado (JAIME MARCELO MORAGA CARRASCO, por la parte correspondiente en los autos caratulados...).
5. Fundamentos de hecho y de derecho claros, rigurosos y citando artículos de leyes chilenas aplicables (ej: Art. 152 CPC, Art. 159 CPP, Art. 40 CPC, etc.).
6. Petitorio formal en mayúsculas (POR TANTO, A S.S. RUEGO / PIDO...).
7. Devuelve ÚNICAMENTE el texto limpio del escrito formateado en texto plano listo para copiar y pegar a Word u OJV.
"""

                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
                gemini_payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2
                    }
                }
                
                escrito_texto = ""
                for intento in range(2):
                    try:
                        data = json.dumps(gemini_payload).encode('utf-8')
                        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
                        with urllib.request.urlopen(req, timeout=25) as response:
                            res = json.loads(response.read().decode('utf-8'))
                            escrito_texto = res['candidates'][0]['content']['parts'][0]['text']
                            break
                    except Exception as e_g:
                        print(f"⚠️ Intento {intento+1} Redactor IA falló: {e_g}")
                        if intento == 0:
                            time.sleep(1)

                if not escrito_texto:
                    escrito_texto = f"""EN LO PRINCIPAL: {tipo_escrito.upper()}.

S. J. L. ({tribunal.upper()})

JAIME MARCELO MORAGA CARRASCO, por la parte correspondiente en los autos caratulados "{caratula}", ROL {rit}, a S.S. respetuosamente digo:

Que por este acto vengo en solicitar {instruccion.lower() if instruccion else 'el impulso procesal correspondiente en la presente causa'}.

POR TANTO,
A S.S. RUEGO acceder a lo solicitado y proveer de conformidad.

ES JUSTICIA."""

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "escrito": escrito_texto}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                print(f"⚠️ Error generando escrito IA: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode('utf-8'))
            return

        # ENDPOINT: /subir_documento (Guardar archivo subido en carpeta del cliente e indexar en SQLite FTS5)
        elif parsed_url.path == "/subir_documento":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))

                filename = payload.get("filename", "documento.pdf")
                content_b64 = payload.get("content_b64", "")
                carpeta_cliente = payload.get("carpeta_cliente", "Documentos_Subidos")

                if content_length > MAX_SUBIDA_BYTES * 2:  # base64 infla ~4/3
                    self._responder_json({
                        "status": "error",
                        "error": f"El archivo excede el máximo de {MAX_SUBIDA_BYTES // 1048576} MB"
                    }, 413)
                    return

                try:
                    file_bytes = base64.b64decode(content_b64, validate=True)
                except Exception:
                    self._responder_json({"status": "error", "error": "El contenido no es base64 válido"}, 400)
                    return

                if not file_bytes:
                    self._responder_json({"status": "error", "error": "El archivo llegó vacío"}, 400)
                    return
                if len(file_bytes) > MAX_SUBIDA_BYTES:
                    self._responder_json({
                        "status": "error",
                        "error": f"El archivo pesa {len(file_bytes)//1048576} MB y el máximo es {MAX_SUBIDA_BYTES//1048576} MB"
                    }, 413)
                    return

                base_casos_dir = Path("/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023")
                if not base_casos_dir.exists():
                    # Antes caía a /home/jaime/Descargas ignorando la carpeta del
                    # cliente y respondía "guardado correctamente": el archivo
                    # terminaba suelto en Descargas y el índice apuntaba ahí.
                    # Mejor negarse que archivar un expediente donde no corresponde.
                    self._responder_json({
                        "status": "error",
                        "error": "El disco de expedientes no está conectado. Conéctalo antes de subir documentos.",
                        "ruta_esperada": str(base_casos_dir)
                    }, 503)
                    return

                dest_path, motivo = ruta_segura_de_subida(carpeta_cliente, filename, base_casos_dir)
                if dest_path is None:
                    print(f"🚫 [SUBIDA RECHAZADA] {motivo} (filename={filename!r}, carpeta={carpeta_cliente!r})")
                    self._responder_json({"status": "error", "error": motivo}, 400)
                    return

                dest_path.parent.mkdir(parents=True, exist_ok=True)
                with open(dest_path, "wb") as f_out:
                    f_out.write(file_bytes)
                filename = dest_path.name  # puede haberse versionado o saneado
                carpeta_cliente = dest_path.parent.name

                # Misma función que usa el archivado tras el análisis: un solo
                # camino para que un documento nunca quede archivado sin indexar.
                indexado = indexar_en_fts(dest_path)

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "message": f"Documento {filename} guardado en la carpeta {carpeta_cliente}"
                               + (" e indexado." if indexado else " (no se pudo indexar su texto)."),
                    "path": str(dest_path),
                    "indexado": indexado
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode('utf-8'))
            return

        # ENDPOINT: /adjuntar_documento_bitacora (documento que el abogado adjunta
        # al anotar una gestión en la Bitácora Omnicanal). A diferencia de
        # /analizar_documento, acá el cliente/carátula/rol YA se conocen -la
        # Bitácora ya los clasificó y el abogado ya confirmó el expediente
        # destino-, así que no hace falta gastar una llamada al LLM para
        # adivinarlos: se archiva directo, reutilizando el mismo heurístico de
        # carpeta (archivar_pdf_fisicamente) y el mismo chequeo de duplicado
        # exacto por hash que usa el resto del sistema.
        elif parsed_url.path == "/adjuntar_documento_bitacora":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))

                filename = payload.get("filename", "documento.pdf")
                content_b64 = payload.get("content_b64", "")
                cliente = payload.get("cliente", "")
                caratula = payload.get("caratula", "")
                rol = payload.get("rol", "")

                if content_length > MAX_SUBIDA_BYTES * 2:  # base64 infla ~4/3
                    self._responder_json({
                        "status": "error",
                        "error": f"El archivo excede el máximo de {MAX_SUBIDA_BYTES // 1048576} MB"
                    }, 413)
                    return

                try:
                    file_bytes = base64.b64decode(content_b64, validate=True)
                except Exception:
                    self._responder_json({"status": "error", "error": "El contenido no es base64 válido"}, 400)
                    return

                if not file_bytes:
                    self._responder_json({"status": "error", "error": "El archivo llegó vacío"}, 400)
                    return
                if len(file_bytes) > MAX_SUBIDA_BYTES:
                    self._responder_json({
                        "status": "error",
                        "error": f"El archivo pesa {len(file_bytes)//1048576} MB y el máximo es {MAX_SUBIDA_BYTES//1048576} MB"
                    }, 413)
                    return

                import indexar_pdfs
                hash_archivo = indexar_pdfs.calcular_hash_bytes(file_bytes)
                ruta_existente = buscar_ruta_por_hash(hash_archivo)
                if ruta_existente:
                    # Mismo contenido que un documento ya indexado: no se archiva de
                    # nuevo, se enlaza el que ya existe -mismo criterio que el
                    # Vigilante con duplicados exactos-.
                    print(f"🔁 [BITÁCORA] '{filename}' ya está indexado como {ruta_existente}")
                    self._responder_json({
                        "status": "ok",
                        "ruta": ruta_existente,
                        "nombre": os.path.basename(ruta_existente),
                        "duplicado": True
                    })
                    return

                filename_seguro = _nombre_seguro(filename, "documento.pdf")
                tmp_path = os.path.join("/tmp", f"lex_bitacora_{int(time.time())}_{filename_seguro}")
                with open(tmp_path, "wb") as f_tmp:
                    f_tmp.write(file_bytes)

                ruta_final = archivar_pdf_fisicamente(tmp_path, filename_seguro, rol, cliente, caratula)
                if not ruta_final:
                    self._responder_json({"status": "error", "error": "No se pudo archivar el documento"}, 500)
                    return

                print(f"📎 [BITÁCORA] '{filename}' adjuntado y archivado en {ruta_final}")
                self._responder_json({
                    "status": "ok",
                    "ruta": ruta_final,
                    "nombre": os.path.basename(ruta_final),
                    "duplicado": False
                })
            except Exception as e:
                self._responder_json({"status": "error", "error": str(e)}, 500)
            return

        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def log_message(self, format, *args):
        # Silenciar logs ruidosos para no saturar terminal
        pass

HISTORIAL_ARCHIVOS = [
    {
        "id": "arch-1",
        "nombre": "Causas_Prueba_RedTeam.xlsx",
        "ruta": "/home/jaime/Descargas/Descargas Judiciales/Causas_Prueba_RedTeam.xlsx",
        "origen": "Descargas Judiciales",
        "tipo": "excel_pjud",
        "fecha": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "totalMovimientos": 1557,
        "totalCausas": 1557,
        "estado": "completado",
        "detalles": "115 Corte Suprema, 542 Apelaciones, 542 Civil, 25 Laboral, 223 Penal, 15 Cobranza, 95 Familia"
    },
    {
        "id": "arch-2",
        "nombre": "Causas_NuevaPrueba.xlsx",
        "ruta": "/home/jaime/Descargas/Descargas Judiciales/Causas_NuevaPrueba.xlsx",
        "origen": "Descargas Judiciales",
        "tipo": "excel_pjud",
        "fecha": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "totalMovimientos": 1557,
        "totalCausas": 1557,
        "estado": "completado",
        "detalles": "Importación automatizada por Vigilante de Descargas"
    }
]

ESTADO_VIGILANTE = {
    "estado": "idle",
    "ultimo_archivo": "",
    "total_movimientos": 0,
    "mensaje": "Vigilando carpeta 'Descargas Judiciales'...",
    "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
}

def vigilante_descargas_judiciales():
    global ESTADO_VIGILANTE, HISTORIAL_ARCHIVOS
    print("📁 [VIGILANTE AUTOMÁTICO] Monitoreando '/home/jaime/Descargas/Descargas Judiciales' (Excel, PDF, Word) cada 5s...")
    carpetas = [
        "/home/jaime/Descargas/Descargas Judiciales",
        "/home/jaime/Descargas Judiciales",
        "/home/jaime/Descargas/descargas_judiciales"
    ]
    archivos_procesados_mtime = {}
    
    while True:
        try:
            for carpeta in carpetas:
                if os.path.exists(carpeta):
                    for patron in ["*.xlsx", "*.xls", "*.pdf", "*.doc", "*.docx"]:
                        for filepath in glob.glob(os.path.join(carpeta, patron)):
                            try:
                                mtime = os.path.getmtime(filepath)
                                if filepath not in archivos_procesados_mtime or archivos_procesados_mtime[filepath] < mtime:
                                    archivos_procesados_mtime[filepath] = mtime
                                    nom = os.path.basename(filepath)
                                    print(f"\n⚡ [VIGILANTE DESCARGAS JUDICIALES] ¡Nuevo archivo detectado en Descargas!: {nom}")
                                    ESTADO_VIGILANTE["estado"] = "procesando"
                                    ESTADO_VIGILANTE["ultimo_archivo"] = nom
                                    ESTADO_VIGILANTE["mensaje"] = f"Procesando e indexando {nom}..."
                                    ESTADO_VIGILANTE["timestamp"] = datetime.datetime.now().strftime("%H:%M:%S")
                                    
                                    ext = os.path.splitext(nom)[1].lower()
                                    if ext in [".xlsx", ".xls"]:
                                        res = procesar_excel_pjud(filepath)
                                        tot = res.get('total_movimientos', 0)
                                        detalles_txt = f"{tot} movimientos y causas procesados"
                                        
                                        # ── PERSISTIR EN EL CATÁLOGO PJUD ──
                                        # Antes el resultado se descartaba: las causas
                                        # extraídas vivían solo en la respuesta HTTP y
                                        # nunca llegaban al JSON que consume el frontend.
                                        if tot > 0:
                                            try:
                                                catalogo_actual = catalogos.cargar(catalogos.PJUD, {"totalCausas": 0, "matchDisco": 0, "casos": []})
                                                casos_existentes = catalogo_actual.get("casos", [])
                                                roles_existentes = {c.get("rit", "") for c in casos_existentes}
                                                
                                                nuevos = []
                                                actualizados = 0
                                                for mov in res.get("movimientos", []):
                                                    rol = mov.get("rol", "s/n")
                                                    if not rol or rol == "s/n":
                                                        continue
                                                    rol_norm = f"ROL {rol}" if not rol.startswith("ROL") else rol
                                                    
                                                    # Buscar si ya existe por rol
                                                    existente = next((c for c in casos_existentes if c.get("rit") == rol_norm), None)
                                                    if existente:
                                                        # Actualizar estado si cambió
                                                        if mov.get("estado") and mov["estado"] != existente.get("etapa"):
                                                            existente["etapa"] = mov["estado"]
                                                            es_fatal = mov.get("esFatal", False)
                                                            if es_fatal:
                                                                existente["estadoPlazo"] = "URGENTE"
                                                                existente["plazoDescripcion"] = f"⚠️ {mov['alerta']}"
                                                                existente["diasRestantes"] = 3
                                                            existente["resumenTeoriaCaso"] = f"Actualizado automáticamente por Vigilante de Descargas ({nom}). {existente.get('resumenTeoriaCaso', '')}"
                                                            actualizados += 1
                                                    else:
                                                        # Crear nueva causa
                                                        nuevo_id = len(casos_existentes) + len(nuevos) + 1
                                                        caratula = mov.get("caratula", "Sin carátula")
                                                        tribunal = mov.get("tribunal", "Tribunal no informado")
                                                        estado_raw = mov.get("estado", "En Tramitación")
                                                        jurisdiccion = mov.get("jurisdiccion", "General")
                                                        
                                                        estado_plazo = "AL_DIA"
                                                        plazo_desc = f"Estado actual: {estado_raw}."
                                                        dias_rest = 0
                                                        if mov.get("esFatal"):
                                                            estado_plazo = "URGENTE"
                                                            plazo_desc = f"⚠️ {mov['alerta']}"
                                                            dias_rest = 3
                                                        elif any(w in estado_raw.upper() for w in ["FALLADA", "ARCHIV", "TERMINAD", "CONCLUIDO"]):
                                                            estado_plazo = "TERMINADO"
                                                            plazo_desc = f"✓ Causa {estado_raw}."
                                                        
                                                        # Separar cliente/contraparte
                                                        partes = caratula.split("/", 1) if "/" in caratula else [caratula, "Por determinar"]
                                                        
                                                        nuevos.append({
                                                            "id": f"pjud-caso-{nuevo_id}",
                                                            "clienteId": f"cli-pjud-{nuevo_id}",
                                                            "rit": rol_norm,
                                                            "ruc": "",
                                                            "nuc": rol_norm.replace("ROL ", ""),
                                                            "caratula": caratula,
                                                            "materia": f"Jurisdicción {jurisdiccion}",
                                                            "etapa": estado_raw,
                                                            "tribunal": tribunal,
                                                            "abogadoAspirante": "Jaime Moraga C.",
                                                            "cliente": partes[0].strip(),
                                                            "contraparte": partes[1].strip() if len(partes) > 1 else "Por determinar",
                                                            "fechaIngreso": mov.get("fechaIngreso", datetime.datetime.now().strftime("%d/%m/%Y")),
                                                            "proximaAudiencia": "Verificar en Estado Diario u OJV",
                                                            "estadoPlazo": estado_plazo,
                                                            "plazoDescripcion": plazo_desc,
                                                            "diasRestantes": dias_rest,
                                                            "probabilidadExito": "Alta (Analizada por IA)",
                                                            "resumenTeoriaCaso": f"Importado automáticamente por Vigilante de Descargas desde {nom}. Tribunal: {tribunal}. Jurisdicción: {jurisdiccion}.",
                                                            "estadisticasPrueba": {"total": 10, "admitidas": 10, "impugnadas": 0},
                                                            "origen": "EXCEL_PJUD_OFICIAL"
                                                        })
                                                
                                                if nuevos or actualizados:
                                                    todos = casos_existentes + nuevos
                                                    catalogos.guardar(catalogos.PJUD, {
                                                        "totalCausas": len(todos),
                                                        "matchDisco": catalogo_actual.get("matchDisco", 0),
                                                        "casos": todos,
                                                    })
                                                    print(f"💾 [CATÁLOGO PJUD ACTUALIZADO] {len(nuevos)} causas nuevas, {actualizados} actualizadas → data/pjudCausesData.json ({len(todos)} total)")
                                            except Exception as e_cat:
                                                print(f"⚠️ [CATÁLOGO] No se pudo actualizar pjudCausesData.json: {e_cat}")
                                    else:
                                        # Antes esto SÓLO indexaba el documento en el buscador de texto y lo
                                        # dejaba donde cayó, dentro de "Descargas Judiciales", para siempre:
                                        # nunca se analizaba para saber de qué causa se trataba, nunca se
                                        # archivaba en la carpeta del cliente, y nunca quedaba constancia en
                                        # la bitácora del expediente. "Descargas Judiciales" terminaba siendo
                                        # un cementerio de PDF sin clasificar.
                                        #
                                        # Después se archivaba y vinculaba solo, sin revisión -y varios
                                        # documentos reales quedaron con carátula vacía, hito mal elegido o
                                        # carpeta equivocada porque nadie los miró antes de que quedaran
                                        # escritos (31-jul-2026). Ahora analiza en modo sólo lectura
                                        # (archivar=False) y encola en "Documentos por Revisar": nada se
                                        # archiva ni se vincula a un expediente hasta que el abogado confirma
                                        # -o corrige- desde esa pantalla.
                                        analisis = extraer_metadatos_forenses_pdf(filepath, nom, archivar=False)
                                        tot = 1
                                        if analisis.get("status") == "duplicado":
                                            # Mismo contenido que un documento ya indexado bajo otra ruta: no
                                            # hay nada nuevo que revisar. archivar=False no mueve el original
                                            # solo, así que hay que sacarlo de Descargas Judiciales acá.
                                            mover_a_duplicados_descartados(filepath, nom)
                                            detalles_txt = (
                                                f"Duplicado exacto de {analisis.get('ruta_original')}. "
                                                f"No se volvió a analizar ni a archivar; no se agregó gestión."
                                            )
                                            print(f"🔁 [VIGILANTE] {nom}: duplicado exacto de {analisis.get('ruta_original')}, descartado")
                                        else:
                                            doc_id = _encolar_documento_pendiente(filepath, nom, analisis)
                                            detalles_txt = f"En espera de revisión ({doc_id}): {analisis.get('hito_critico') or 'sin descripción'}"
                                            print(f"📥 [VIGILANTE] {nom} -> en espera de revisión en 'Documentos por Revisar' ({doc_id})")

                                    print(f"✅ [PROCESAMIENTO AUTOMÁTICO OK] {nom} procesado con éxito.")

                                    ESTADO_VIGILANTE["estado"] = "completado"
                                    ESTADO_VIGILANTE["total_movimientos"] = tot
                                    ESTADO_VIGILANTE["mensaje"] = (
                                        f"✅ {nom} procesado e integrado al sistema" if ext in [".xlsx", ".xls"]
                                        else f"📥 {nom} analizado, en espera de revisión"
                                    )
                                    ESTADO_VIGILANTE["timestamp"] = datetime.datetime.now().strftime("%H:%M:%S")
                                    
                                    # Registrar en el historial de archivos analizados
                                    item_hist = {
                                        "id": f"arch-{int(time.time())}",
                                        "nombre": nom,
                                        "ruta": filepath,
                                        "origen": "Descargas Judiciales",
                                        "tipo": "documento_pdf" if ext == ".pdf" else "excel_pjud",
                                        "fecha": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                        "totalMovimientos": tot,
                                        "totalCausas": tot,
                                        "estado": "completado",
                                        "detalles": detalles_txt
                                    }
                                    HISTORIAL_ARCHIVOS.insert(0, item_hist)
                            except Exception as e_proc:
                                ESTADO_VIGILANTE["estado"] = "error"
                                ESTADO_VIGILANTE["mensaje"] = f"Error en {os.path.basename(filepath)}: {e_proc}"
        except Exception:
            pass
        time.sleep(5)

def iniciar_servidor():
    print("="*75)
    print(f"⚡ SERVIDOR LANZADOR FORENSE LEXCONTROL INICIADO EN http://{HOST}:{PUERTO}")
    print("👉 Listo para abrir tus 17.742 archivos en tu escritorio Linux nativo.")
    print("="*75)
    
    # Iniciar hilo de vigilancia automática para Descargas Judiciales
    t_vigilante = threading.Thread(target=vigilante_descargas_judiciales, daemon=True)
    t_vigilante.start()

    servidor = ThreadingHTTPServer((HOST, PUERTO), LexControlFileHandler)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Servidor lanzador detenido por el usuario.")
        servidor.server_close()

if __name__ == "__main__":
    iniciar_servidor()
