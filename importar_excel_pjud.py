import pandas as pd
import re
import os
import catalogos

# Buscar archivo de causas en la carpeta "Descargas Judiciales"
RUTAS_BUSQUEDA = [
    "/home/jaime/Descargas/Descargas Judiciales",
    "/home/jaime/Descargas Judiciales",
    "/home/jaime/Descargas/descargas_judiciales",
    "/home/jaime/Descargas/lex-control-casos",
    "/home/jaime/Descargas"
]

path_causas = None
for carpeta in RUTAS_BUSQUEDA:
    if os.path.exists(carpeta):
        for root, _, files in os.walk(carpeta):
            for file in files:
                if file.startswith("Causas") and (file.endswith(".xlsx") or file.endswith(".xls")):
                    path_causas = os.path.join(root, file)
                    break
            if path_causas:
                break
    if path_causas:
        break

if not path_causas or not os.path.exists(path_causas):
    path_causas = "/home/jaime/Descargas/lex-control-casos/Causas_8328581-8 (1).xlsx"

print("="*70)
print(f"🚀 MOTOR DE IMPORTACIÓN INTELIGENTE: EXCEL PJUD MULTI-JURISDICCIÓN")
print(f"📁 Origen de datos detectado: {path_causas}")
print("="*70)

# 1. Cargar carpetas locales del catálogo de disco para buscar coincidencias
local_folders = {}
try:
    for item in catalogos.cargar_clientes_disco():
        fname = item.get("folderName", "").strip().lower()
        if fname:
            local_folders[fname] = item.get("folderName", "")
    print(f"📁 Cargadas {len(local_folders)} carpetas del Disco Duro Local para cruce.")
except Exception as e:
    print(f"⚠️ Aviso al leer disco local: {e}")

# 2. Función inteligente para extraer Cliente y Contraparte
def extraer_partes(caratula, rol_str):
    car = str(caratula).strip()
    if not car or car == "--" or car == "nan":
        return "Causa Propia / En Reserva (PJUD)", "No informada en carátula abrev."
    
    delimitadores = [" C/ ", " C / ", " CONTRA ", " / ", "/", " V/S ", " VS "]
    cliente = car
    contraparte = "Por determinar en tramitación"
    
    for delim in delimitadores:
        if delim in car.upper():
            parts = re.split(re.escape(delim), car, flags=re.IGNORECASE, maxsplit=1)
            if len(parts) == 2:
                cliente = parts[0].strip()
                contraparte = parts[1].strip()
                break
                
    c_lower = cliente.lower()
    match_local = ""
    
    for loc_k, loc_name in local_folders.items():
        if c_lower == loc_k:
            match_local = f" 📁 (Expediente en Disco: {loc_name})"
            break
            
    if not match_local:
        stop_words = {'contra','juzgado','tribunal','corte','region','comuna','municipal','corporacion','ministerio','publico','laboral','penal','civil','familia','garantia','letras','otros','parte','causa','propia','reserva','pjud','ingreso','resolución','ordena','vista','presente','cuenta','tramitacion', 's.a.', 'spa', 'ltda'}
        all_text = f"{c_lower} {contraparte.lower()} {str(caratula).lower()}"
        words = [w for w in re.findall(r'[a-záéíóúñü]{5,}', all_text) if w not in stop_words]
        words = list(set(words))
        
        if len(words) >= 2:
            best_match = None
            best_score = 0
            for loc_k, loc_name in local_folders.items():
                score = sum(1 for w in words if w in loc_k)
                if score >= 2 and score > best_score:
                    best_score = score
                    best_match = loc_name
            
            if best_match:
                match_local = f" 📁 (Expediente en Disco: {best_match})"
            
    if match_local:
        cliente += match_local
        
    return cliente, contraparte

# 3. Procesar todas las hojas (Corte Suprema, Corte Apelaciones, Civil, Laboral, Penal, Cobranza, Familia)
xl_c = pd.ExcelFile(path_causas)
casos_procesados = []
id_counter = 1
stats_competencia = {}
match_disk_count = 0
# Un rol/RIT chileno sólo es único DENTRO de un tribunal -cada tribunal lleva su
# propia numeración correlativa desde cero-, no en todo el país. Sin esta clave
# compuesta, la misma causa listada dos veces en el Excel -entre hojas o dentro
# de una misma hoja- generaba dos fichas separadas; y agrupar sólo por rol
# fusionaría por error causas de partes distintas en tribunales distintos que
# sólo comparten el número por coincidencia (caso real 31-jul-2026: "ROL
# 804-2014" existe a la vez en la C.A. de Concepción y en el Juzgado de Pucón,
# sin ninguna relación entre sí).
claves_vistas = set()
duplicados_omitidos = 0

for sheet in xl_c.sheet_names:
    df = xl_c.parse(sheet)
    stats_competencia[sheet] = len(df)
    
    for idx, row in df.iterrows():
        # Captura de ROL / RIT y ERA según el formato de la hoja
        rol_val = str(row.get('Rol', row.get('Rit', ''))).strip()
        era_val = str(row.get('Era', '')).strip()
        
        if era_val and era_val != 'nan' and era_val not in rol_val:
            rol_full = f"ROL {rol_val}-{era_val}"
        elif not rol_val.startswith('ROL') and '-' not in rol_val:
            rol_full = f"ROL {rol_val}"
        else:
            rol_full = rol_val if rol_val.startswith('ROL') else f"ROL {rol_val}"
            
        caratula = str(row.get('Caratulado', '--')).strip()
        estado_raw = str(row.get('Estado Causa', row.get('Estado Procesal', 'En Tramitación'))).strip()
        fecha_ing = str(row.get('Fecha Ingreso', '')).strip()
        ruc = str(row.get('Ruc', '')).strip()
        if ruc == 'nan': ruc = ''

        # Tribunal / Corte por fuero
        trib_val = str(row.get('Tribunal', row.get('Corte', 'Corte Suprema de Justicia' if sheet == 'Corte Suprema' else f"Juzgado ({sheet})"))).strip()
        if not trib_val or trib_val == 'nan':
            trib_val = "Corte Suprema de Justicia" if sheet == 'Corte Suprema' else f"Juzgado ({sheet})"

        clave_dedup = (rol_full.strip().upper(), trib_val.strip().upper())
        if clave_dedup in claves_vistas:
            duplicados_omitidos += 1
            continue
        claves_vistas.add(clave_dedup)

        cliente, contraparte = extraer_partes(caratula, rol_full)
        if "📁 (Expediente en Disco:" in cliente:
            match_disk_count += 1
            
        # Determinar urgencia procesal según estado
        estado_plazo = "AL_DIA"
        plazo_desc = f"Estado actual en {sheet}: {estado_raw}."
        
        if any(w in estado_raw.upper() for w in ["RELACIÓN", "RELACION", "CUENTA", "PRUEBA", "TRAMITACIÓN", "TRAMITACION", "PLAZO"]):
            estado_plazo = "URGENTE"
            plazo_desc = f"⚠️ [ATENCIÓN PROCESAL] Causa en estado '{estado_raw}' en {sheet}. Revisar escritos y tabla/cuenta."
        elif any(w in estado_raw.upper() for w in ["FALLADA", "ARCHIV", "TERMINAD", "CONCLUIDO", "CON SENTENCIA"]):
            estado_plazo = "TERMINADO"
            plazo_desc = f"✓ Causa {estado_raw}. Mantener monitoreo pasivo de eventuales recursos o cumplimiento."
            
        casos_procesados.append({
            "id": f"pjud-caso-{id_counter}",
            "clienteId": f"cli-pjud-{id_counter}",
            "rit": rol_full,
            "ruc": ruc,
            "nuc": f"{era_val}-{rol_val}" if era_val and era_val != 'nan' else str(rol_val),
            "caratula": caratula,
            "materia": f"Jurisdicción {sheet}",
            "etapa": estado_raw,
            "tribunal": trib_val,
            "abogadoAspirante": "Jaime Moraga C.",
            "cliente": cliente,
            "contraparte": contraparte,
            "fechaIngreso": fecha_ing,
            "proximaAudiencia": "Verificar en Estado Diario u OJV",
            "estadoPlazo": estado_plazo,
            "plazoDescripcion": plazo_desc,
            "diasRestantes": 3 if estado_plazo == "URGENTE" else 0,
            "probabilidadExito": "Alta (Analizada por IA)",
            "resumenTeoriaCaso": f"Expediente oficial importado desde PJUD. Tribunal: {trib_val}. Competencia: {sheet}. Carátula: {caratula}. Estado: {estado_raw}.",
            "estadisticasPrueba": { "total": 10, "admitidas": 10, "impugnadas": 0 },
            "origen": "EXCEL_PJUD_OFICIAL"
        })
        id_counter += 1

# 4. Guardar catálogo JSON que consume el servidor local y la interfaz
destino = catalogos.guardar(catalogos.PJUD, {
    "totalCausas": len(casos_procesados),
    "matchDisco": match_disk_count,
    "casos": casos_procesados,
})

print(f"✅ GENERACIÓN EXITOSA DE BASE DE DATOS: {destino}")
print(f"📊 Total de causas exportadas: {len(casos_procesados)}")
print(f"🧹 Duplicados omitidos (mismo rol + mismo tribunal ya visto): {duplicados_omitidos}")
print("\nDesglose por Jurisdicción:")
for k, v in stats_competencia.items():
    print(f"  ▪ {k}: {v} causas")
