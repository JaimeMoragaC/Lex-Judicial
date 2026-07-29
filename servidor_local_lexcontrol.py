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
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import imaplib
import email
from email.header import decode_header
import glob
import time
import re
import fitz
import unicodedata
import pandas as pd
import urllib.request
import shutil
import gzip
import sqlite3
import datetime
import zipfile
import io

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
    
    # 1. Match exacto
    for loc_k, pth in local_folders.items():
        if c_lower == loc_k:
            target_path = pth
            break
            
    # 2. Match heurístico
    if not target_path:
        stop_words = {'contra','juzgado','tribunal','corte','region','comuna','municipal','corporacion','ministerio','publico','laboral','penal','civil','familia','garantia','letras','otros','parte','causa','propia','reserva','pjud','ingreso','resolución','ordena','vista','presente','cuenta','tramitacion', 's.a.', 'spa', 'ltda'}
        all_text = f"{c_lower} {str(caratula).lower()} {str(rol).lower()}"
        words = [w for w in re.findall(r'[a-záéíóúñü]{5,}', all_text) if w not in stop_words]
        words = list(set(words))
        
        if len(words) >= 2:
            best_match = None
            best_score = 0
            for loc_k, pth in local_folders.items():
                score = sum(1 for w in words if w in loc_k)
                if score >= 2 and score > best_score:
                    best_score = score
                    target_path = pth

    if target_path and os.path.exists(target_path):
        final_filename = filename
        final_dest = os.path.join(target_path, final_filename)
        if os.path.exists(final_dest):
            base, ext = os.path.splitext(filename)
            final_filename = f"{base}_{int(time.time())}{ext}"
            final_dest = os.path.join(target_path, final_filename)
        
        try:
            shutil.move(tmp_path, final_dest)
            return final_dest
        except Exception as e:
            print(f"Error moviendo archivo: {e}")
            return None
    
    return None


PUERTO = int(os.environ.get("LEXCONTROL_PORT", "8888"))
HOST = os.environ.get("LEXCONTROL_HOST", "localhost")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("⚠️  GEMINI_API_KEY no definida (revisa el archivo .env). El análisis con IA quedará desactivado.")

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

def extraer_metadatos_forenses_pdf(filepath_or_bytes, filename=""):
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

    # 4. Si es Excel (.xls, .xlsx) o TXT
    if len(texto_completo.strip()) < 30 and tmp_path and os.path.exists(tmp_path):
        if filename_clean.lower().endswith(('.xls', '.xlsx')):
            try:
                df = pd.read_excel(tmp_path)
                texto_completo = df.to_string()
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

    # 6. CEREBRO IA REAL (Google Gemini 2.5 Flash)
    data_gemini = analizar_con_gemini(texto_completo, filename_clean, total_paginas)
    if data_gemini:
        if tmp_path and os.path.exists(tmp_path):
            ruta_g = archivar_pdf_fisicamente(tmp_path, filename_clean, data_gemini.get("rol", ""), "", data_gemini.get("caratula", ""))
            data_gemini["ruta_guardado"] = ruta_g
        return data_gemini

    # Reglas Procesales Chilenas Multi-Materia (CPC / CPP / Laboral / Familia) [FALLBACK OFFLINE]
    texto_lower = texto_completo.lower()

    # Detección de Tribunal y Materia Principal
    match_trib = re.search(r'((?:ILTMA\.\s*|EXCMA\.\s*)?(?:CORTE DE APELACIONES|CORTE SUPREMA|[0-9]º?\s*JUZGADO\s+(?:DE\s+GARANT[IÍ]A|CIVIL|DE\s+LETRAS|DE\s+FAMILIA|DE\s+COBRANZA|DEL\s+TRABAJO)(?:[ \t]+DE[ \t]+[A-ZÁÉÍÓÚÑ ]+)?|JUZGADO\s+(?:DE\s+GARANT[IÍ]A|CIVIL|DE\s+LETRAS|DE\s+FAMILIA|DE\s+COBRANZA|DEL\s+TRABAJO)(?:[ \t]+DE[ \t]+[A-ZÁÉÍÓÚÑ ]+)?|TRIBUNAL DE JUICIO ORAL EN LO PENAL(?:[ \t]+DE[ \t]+[A-ZÁÉÍÓÚÑ ]+)?)[^\n\.,]*)', texto_completo, re.IGNORECASE)
    tribunal = match_trib.group(1).split('\n')[0].strip() if match_trib else "Tribunal Civil / Corte de Apelaciones"

    es_penal = any(w in texto_lower for w in ["garantía", "garantia", "oral en lo penal", "imputado", "acusado", "querellado", "fiscalía", "fiscalia", "ministerio público", "ministerio publico", "delito", "rit o-", "rit r-", "rit t-"])
    es_laboral = any(w in texto_lower for w in ["juzgado del trabajo", "cobranza laboral", "inspección del trabajo", "código del trabajo"])
    es_familia = any(w in texto_lower for w in ["juzgado de familia", "alimentos", "vif", "violencia intrafamiliar", "cuidado personal"])

    # Extraer ROL / RIT / RUC
    rol = ""
    match_rit = re.search(r'(?:RIT|R\.I\.T\.|ROL|Rol|rol|Causa)\s*(?:N[°º\.]?)?\s*[:\n]?\s*([CVSPEARKOTMR]-\d+-\d{4}|\d+-\d{4})', texto_completo, re.IGNORECASE)
    if match_rit:
        rol = f"RIT {match_rit.group(1).upper()}" if es_penal and not match_rit.group(1).upper().startswith("RIT") else match_rit.group(1).upper()
    else:
        match_rol = re.search(r'\b([CVSPEARKOTMR]-\d+-\d{4})\b', texto_completo, re.IGNORECASE)
        if match_rol:
            rol = match_rol.group(1).upper()
    
    match_ruc = re.search(r'(?:RUC|R\.U\.C\.)\s*(?:N[°º\.]?)?\s*[:\n]?\s*(\d{8,}-\d|[\d\.-]+)', texto_completo, re.IGNORECASE)
    if match_ruc:
        ruc_str = match_ruc.group(1).strip()
        rol = f"{rol} (RUC: {ruc_str})" if rol else f"RUC: {ruc_str}"
        
    if not rol or len(rol) < 3:
        match_fn_rol = re.search(r'\b([CVSPEARKOTMR]-\d+-\d{4}|\d+-\d{4})\b', filename_clean, re.IGNORECASE)
        rol = match_fn_rol.group(1).upper() if match_fn_rol else ("RIT OJV-Penal/2026" if es_penal else "ROL OJV-2026")

    # Extraer Carátula
    caratula = ""
    if es_penal:
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
        ruta_guardado = archivar_pdf_fisicamente(tmp_path, filename_clean, rol, "", caratula)

    return {
        "status": "ok",
        "archivo": filename_clean,
        "ruta_guardado": ruta_guardado,
        "total_paginas": total_paginas,
        "rol": rol,
        "tribunal": tribunal,
        "caratula": caratula,
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
                xl = pd.ExcelFile(file_path, engine='xlrd')
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
                            # 1. Escanear adjuntos recientes y agrupar por fecha del Estado Diario
                            partes_por_fecha = {}
                            
                            for mail_id in reversed(ids_mail[-15:]):
                                res, msg_data = mail.fetch(mail_id, "(RFC822)")
                                for response_part in msg_data:
                                    if isinstance(response_part, tuple):
                                        msg = email.message_from_bytes(response_part[1])
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
                                                    f_date = res_temp.get("fecha_estado_diario") or "HOY"
                                                    if f_date not in partes_por_fecha:
                                                        partes_por_fecha[f_date] = []
                                                    partes_por_fecha[f_date].append((clean_fname, dest_path, res_temp))

                            # 2. Tomar la fecha MÁS RECIENTE que tenga movimientos oficiales del PJUD
                            if partes_por_fecha:
                                fechas_ordenadas = sorted(partes_por_fecha.keys(), reverse=True)
                                ultima_fecha = fechas_ordenadas[0]
                                adjuntos_dia = partes_por_fecha[ultima_fecha]

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
                                origen_sync = f"GMAIL_IMAP ({usuario_gmail}) - Parte Oficial ({len(archivos_procesados)} planillas del {ultima_fecha})"
                                resultado_sync = {
                                    "status": "ok",
                                    "archivo_procesado": archivo_procesar,
                                    "path_completo": adjuntos_dia[0][1],
                                    "fecha_estado_diario": ultima_fecha,
                                    "antiguedad_dias": (datetime.date.today() - datetime.date.fromisoformat(ultima_fecha)).days if ultima_fecha != "HOY" and "-" in str(ultima_fecha) else 0,
                                    "es_de_hoy": True,
                                    "leido_en": time.strftime("%Y-%m-%d %H:%M:%S"),
                                    "total_movimientos": len(movimientos_consolidados),
                                    "desglose_tribunales": desglose_combinado,
                                    "movimientos": movimientos_consolidados,
                                    "origen_sync": origen_sync
                                }
                                print(f"✅ [GMAIL IMAP OFICIAL] {len(movimientos_consolidados)} causas informadas para la fecha oficial {ultima_fecha} desde {len(archivos_procesados)} archivo(s).")
                        mail.close()
                        mail.logout()
                    except Exception as e_imap:
                        print(f"⚠️ [GMAIL IMAP] Aviso al conectar IMAP ({e_imap}). Usando radar local de respaldo...")

                # Si no se usó IMAP o no se halló archivo con movimientos, buscar en /home/jaime/Descargas por principio de continuidad
                if not resultado_sync or resultado_sync.get("total_movimientos", 0) == 0:
                    candidatos = []
                    for patron in ["EstadoDiario*.xls*", "Movimientos*.xls*", "Causas*.xls*", "gmail_pjud_*.xls*"]:
                        candidatos.extend(glob.glob(os.path.join("/home/jaime/Descargas", patron)))
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
            if not ruta:
                # Si no pasa ruta, busca un PDF representativo en /home/jaime/Descargas
                cands = glob.glob("/home/jaime/Descargas/*.pdf")
                if cands:
                    ruta = cands[0]
            
            if ruta and os.path.exists(ruta):
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

        # ENDPOINT 10: /data/<dataset> (Sirve los catálogos pesados fuera del bundle)
        elif parsed_url.path.startswith("/data/"):
            self._servir_dataset(parsed_url.path[len("/data/"):])

        # ENDPOINT 11: /plazos (Registro de plazos vigilados por el Radar)
        elif parsed_url.path == "/plazos":
            self._responder_json({"plazos": catalogos.cargar_plazos()})

        # ENDPOINT 13: /expedientes (Extrajudiciales y administrativos con sus gestiones)
        elif parsed_url.path == "/expedientes":
            self._responder_json({"expedientes": catalogos.cargar_expedientes()})

        # ENDPOINT 12: /buscar_texto?q=... (Busca DENTRO del contenido de los PDF)
        elif parsed_url.path == "/buscar_texto":
            self._buscar_texto(query_params.get("q", [""])[0])

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
                
                print(f"📥 [SUBIDA DE DOCUMENTO] Recibidos {len(post_data)} bytes del archivo '{filename}'")
                res = extraer_metadatos_forenses_pdf(post_data, filename)

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

        # ENDPOINT 9: /bitacora_omnicanal (Analizador Rápido de Gestiones NLP)
        elif parsed_url.path == "/bitacora_omnicanal":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                texto_bitacora = payload.get("texto", "")
                
                print(f"📥 [BITÁCORA OMNICANAL] Procesando texto: '{texto_bitacora}'")

                if not GEMINI_API_KEY:
                    self.send_response(503)
                    self._send_cors_headers()
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "error",
                        "error": "GEMINI_API_KEY no configurada en el archivo .env del servidor."
                    }).encode('utf-8'))
                    return

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

                # Cargar contexto activo de expedientes y causas para que Gemini sepa de qué clientes habla el abogado
                expedientes_activos = catalogos.cargar_expedientes()
                causas_activas = catalogos.cargar_causas_pjud()
                
                resumen_contexto = []
                for e in expedientes_activos[:15]:
                    resumen_contexto.append(f"- Cliente: '{e.get('cliente')}', Asunto: '{e.get('asunto')}', ID: {e.get('id')}")
                for c in causas_activas[:15]:
                    resumen_contexto.append(f"- Cliente/Carátula: '{c.get('caratula')}', Tribunal/Materia: '{c.get('tribunal', '')} {c.get('materia', '')}', ROL: {c.get('rit')}")
                
                texto_contexto = "\n".join(resumen_contexto) if resumen_contexto else "Sin casos registrados aún."

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
                json_ia = None
                
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

                # Fallback heurístico inteligente si Gemini no respondió (ej: Error 503)
                if not json_ia:
                    print("⚠️ Gemini no disponible (503). Aplicando extracción heurística procesal de emergencia...")
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
                self.wfile.write(json.dumps({"status": "ok", "datos": json_ia}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                print(f"⚠️ Error en bitácora omnicanal: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode('utf-8'))
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
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def log_message(self, format, *args):
        # Silenciar logs ruidosos para no saturar terminal
        pass

def iniciar_servidor():
    print("="*75)
    print(f"⚡ SERVIDOR LANZADOR FORENSE LEXCONTROL INICIADO EN http://{HOST}:{PUERTO}")
    print("👉 Listo para abrir tus 17.742 archivos en tu escritorio Linux nativo.")
    print("="*75)
    servidor = HTTPServer((HOST, PUERTO), LexControlFileHandler)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Servidor lanzador detenido por el usuario.")
        servidor.server_close()

if __name__ == "__main__":
    iniciar_servidor()
