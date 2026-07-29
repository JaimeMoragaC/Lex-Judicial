#!/usr/bin/env python3
"""Captura y persiste el Estado Diario del PJUD, un registro por día.

POR QUÉ EXISTE
--------------
El endpoint `/sincronizar_gmail_pjud` del servidor aplica el "principio de
continuidad": de toda la bandeja se queda con la fecha más reciente que traiga
movimientos, para que el Dashboard nunca aparezca vacío. Eso está bien para
mostrar algo en pantalla, pero destruye la serie histórica: lo de ayer se
sobrescribe con lo de hoy y nunca se guarda.

Este script hace lo contrario: recorre la bandeja y guarda TODOS los días, cada
uno en su propio archivo, sin descartar ninguno. Con eso se construye el dato que
hoy no existe — cuándo se movió por última vez cada causa — que es la base del
reloj de inactividad (Art. 152 CPC, abandono del procedimiento).

QUÉ NO ES
---------
`dias_sin_aparecer` NO es "días sin gestión útil" en el sentido del Art. 152.
Aparecer en el Estado Diario significa que en la causa pasó algo, no que la parte
haya hecho una gestión útil, y lo inverso tampoco se sigue. Es un INDICADOR para
saber qué expedientes mirar, no una conclusión jurídica. El campo se llama
`dias_sin_aparecer` y no `dias_sin_gestion` justamente para no invitar a esa
lectura.

LA DISTINCIÓN QUE EL SCRAPER OJV NO HACÍA
-----------------------------------------
`motor_ojv_diferencial.py` informaba "293 causas sin cambio" cuando en realidad
lo habían bloqueado: confundía "no hubo movimientos" con "no pude leer". Acá esos
dos casos se registran distinto y por separado en la bitácora de capturas, y el
índice derivado publica su propia cobertura (desde/hasta y los días faltantes)
para que nadie lea "200 días sin aparecer" cuando lo que hubo fue un mes sin
capturar.

USO
---
    python3 capturar_estado_diario.py                 # últimos 30 días
    python3 capturar_estado_diario.py --dias 120      # ventana más ancha
    python3 capturar_estado_diario.py --forzar        # re-escribe días ya guardados
    python3 capturar_estado_diario.py --solo-indice   # reconstruye el índice y sale

Salida en data/estado_diario/:
    planillas/                    los .xls tal como los mandó el PJUD (evidencia)
    dia/YYYY-MM-DD__tipo.json     un snapshot por día y tipo de planilla
    bitacora_capturas.jsonl       una línea por corrida: qué pasó y qué falló
    ultimo_movimiento.json        índice derivado: rol -> última vez que apareció

Código de salida: 0 todo bien · 1 error de conexión o de credenciales (systemd lo
marca como fallo) · 0 con aviso si la bandeja no traía nada nuevo, que es normal.
"""

import argparse
import datetime
import email
import email.utils
import imaplib
import json
import re
import socket
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Se reutiliza el parseo de planillas del servidor en lugar de duplicarlo: ahí
# está resuelto que el ROL va en la primera columna (el PJUD le pone seis
# encabezados distintos) y que la fecha sale del nombre del archivo y no del
# reloj. Importar es seguro: el servidor sólo arranca bajo __main__.
sys.path.insert(0, str(BASE_DIR))
from servidor_local_lexcontrol import (  # noqa: E402
    procesar_excel_pjud,
    fecha_del_estado_diario,
    tipo_de_planilla,
)

CONFIG_GMAIL = Path.home() / ".config" / "lexcontrol_gmail.json"
DATOS_DIR = BASE_DIR / "data"
RAIZ = DATOS_DIR / "estado_diario"
DIR_PLANILLAS = RAIZ / "planillas"
DIR_DIAS = RAIZ / "dia"
BITACORA = RAIZ / "bitacora_capturas.jsonl"
INDICE = RAIZ / "ultimo_movimiento.json"
CACHE_UIDS = RAIZ / "correos_procesados.json"
CAUSAS_JSON = DATOS_DIR / "pjudCausesData.json"

REMITENTE_POR_DEFECTO = "no-responder@pjud.cl"
# Mismo filtro de adjuntos que usa el endpoint, para no divergir en qué se
# considera planilla del PJUD.
CLAVES_ADJUNTO = ("movimiento", "estadodiario", "causa", "8328581", "corte")
EXT_PLANILLA = (".xls", ".xlsx")

# Sólo estas planillas alimentan el reloj de inactividad.
#
# El PJUD manda también la tabla completa de la Corte de Apelaciones
# ('CORTE DE APELACIONES DE TEMUCO.xls', que cae en el tipo 'otro'): 240 filas
# fijas, en su mayoría causas ajenas, y sin columna de rol —la primera columna
# trae el nombre del tribunal—. Al parsearla, las 240 filas quedaban como una
# única "causa" llamada CORTE DE APELACIONES DE TEMUCO con 2.880 apariciones, y
# el reloj se contaminaba. Se sigue capturando como evidencia, pero no cuenta
# como actividad: una tabla pública no es la nómina del estudio.
TIPOS_PARA_INDICE = ("estado_diario", "movimientos")

TIEMPO_LIMITE_IMAP = 90  # sin esto una bandeja que no responde cuelga el timer


def log(msg):
    """A stdout, que en systemd es el journal. Con hora porque las corridas son
    desatendidas y después hay que reconstruir qué pasó."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def cargar_credenciales():
    """Lee las credenciales IMAP del mismo archivo que usa el servidor.

    Devuelve (usuario, clave, remitente) o None si no se puede operar.
    """
    if not CONFIG_GMAIL.exists():
        log(f"✖ No existe {CONFIG_GMAIL}")
        return None
    try:
        cfg = json.loads(CONFIG_GMAIL.read_text(encoding="utf-8"))
    except Exception as e:
        log(f"✖ {CONFIG_GMAIL} no es JSON válido: {e}")
        return None
    if not cfg.get("activado", False):
        log("✖ La configuración de Gmail está con activado=false")
        return None
    usuario = cfg.get("usuario", "").strip()
    clave = cfg.get("clave_app", "").strip()
    if not usuario or not clave:
        log("✖ Falta usuario o clave_app en la configuración")
        return None
    return usuario, clave, cfg.get("remitente_pjud", REMITENTE_POR_DEFECTO).strip()


def normalizar_rol(rol):
    """'ROL 35002-2026', 'Rol 35002-2026' y '35002-2026' son la misma causa.

    Las planillas del Estado Diario y el catálogo de causas
    (pjudCausesData.json, campo `rit`) escriben el identificador distinto. Sin
    normalizar, el índice no se puede cruzar con las 1.557 causas y el reloj
    quedaría sin conectar a nada.
    """
    if not rol:
        return ""
    t = str(rol).upper().strip()
    t = re.sub(r"^\s*(ROL|RIT|RUC|R\.I\.T\.|N[°º]?\s*INGRESO|INGRESO)\s*[:\-]?\s*", "", t)
    return re.sub(r"\s+", "", t)


def parece_rol(clave):
    """Red de seguridad contra filas que no son causas.

    Todo identificador del PJUD lleva dígitos: C-3183-2024, Z-8-2011, 35002-2026.
    Un valor sin ningún dígito ('CORTE DE APELACIONES DE TEMUCO', 'S/N', un
    encabezado suelto) no es un rol. El filtro por tipo de planilla ya ataja el
    caso conocido; esto cubre los que aparezcan cuando el PJUD cambie un formato.
    """
    return bool(clave) and clave != "S/N" and any(c.isdigit() for c in clave)


def cargar_cache_uids(uidvalidity):
    """Correos ya bajados, para no volver a descargarlos en cada corrida.

    Sin esto, un timer que corre dos veces al día se baja de nuevo los 30 días de
    adjuntos cada vez: minutos de parseo y megas de tráfico para reescribir lo
    mismo. Los UID son estables dentro de una bandeja mientras no cambie su
    UIDVALIDITY; si cambia, el mapa de UID anterior ya no significa nada y la
    caché se descarta entera.
    """
    if not CACHE_UIDS.exists():
        return set()
    try:
        cache = json.loads(CACHE_UIDS.read_text(encoding="utf-8"))
    except Exception:
        return set()
    if str(cache.get("uidvalidity")) != str(uidvalidity):
        log("· la bandeja cambió de UIDVALIDITY: se descarta la caché de correos")
        return set()
    return set(cache.get("uids_procesados", []))


def guardar_cache_uids(uidvalidity, uids):
    CACHE_UIDS.write_text(
        json.dumps(
            {
                "uidvalidity": str(uidvalidity),
                "actualizado_en": datetime.datetime.now().isoformat(timespec="seconds"),
                "nota": (
                    "Correos del PJUD ya descargados. Borrar este archivo obliga a "
                    "releer la bandeja completa de la ventana."
                ),
                "uids_procesados": sorted(uids, key=lambda u: int(u) if str(u).isdigit() else 0),
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )


def _fecha_correo(msg):
    """Fecha de recepción del correo, como respaldo si el nombre del adjunto no
    trae fecha. Se marca en el registro para no confundir una con otra."""
    crudo = msg.get("Date")
    if not crudo:
        return None
    try:
        return email.utils.parsedate_to_datetime(crudo).date()
    except Exception:
        return None


def descargar_planillas(usuario, clave, remitente, dias_atras, usar_cache=True):
    """Baja del correo las planillas del PJUD de la ventana pedida.

    Devuelve (lista_de_rutas, error, uids_nuevos, uidvalidity). `error` no vacío
    significa que no se pudo leer la bandeja — distinto de haber leído y no
    encontrar nada.
    """
    desde = (datetime.date.today() - datetime.timedelta(days=dias_atras)).strftime("%d-%b-%Y")
    rutas = []
    uids_ok = set()
    uidvalidity = None
    mail = None
    try:
        socket.setdefaulttimeout(TIEMPO_LIMITE_IMAP)
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(usuario, clave)
        mail.select("inbox")
        estado_uv, resp_uv = mail.status("inbox", "(UIDVALIDITY)")
        if estado_uv == "OK" and resp_uv and resp_uv[0]:
            m = re.search(rb"UIDVALIDITY\s+(\d+)", resp_uv[0])
            if m:
                uidvalidity = m.group(1).decode()

        criterio = f'(FROM "{remitente}" SINCE "{desde}")'
        estado, respuesta = mail.uid("search", None, criterio)
        if estado != "OK":
            return [], f"la búsqueda IMAP respondió {estado}", set(), uidvalidity
        ids = respuesta[0].split()
        ya_vistos = cargar_cache_uids(uidvalidity) if usar_cache else set()
        pendientes = [u for u in ids if u.decode() not in ya_vistos]
        log(f"✉ {len(ids)} correos de {remitente} desde {desde} · "
            f"{len(pendientes)} sin procesar")

        for mid in pendientes:
            estado, datos = mail.uid("fetch", mid, "(RFC822)")
            if estado != "OK":
                continue
            uid_actual = mid.decode()
            # Se marca como leído aunque no traiga planillas: hay correos del PJUD
            # sin adjunto útil y volver a bajarlos cada corrida no aporta nada.
            # Si alguna de sus planillas sale ilegible, main lo saca de la caché
            # para que la próxima corrida lo reintente.
            uids_ok.add(uid_actual)
            for parte in datos:
                if not isinstance(parte, tuple):
                    continue
                msg = email.message_from_bytes(parte[1])
                fecha_msg = _fecha_correo(msg)
                for sub in msg.walk():
                    if sub.get_content_maintype() == "multipart":
                        continue
                    if sub.get("Content-Disposition") is None:
                        continue
                    nombre = sub.get_filename()
                    if not nombre:
                        continue
                    bajo = nombre.lower()
                    if not bajo.endswith(EXT_PLANILLA):
                        continue
                    if not any(k in bajo for k in CLAVES_ADJUNTO):
                        continue
                    limpio = nombre.replace("/", "_").replace("\\", "_")
                    # Cuando el nombre trae la fecha ('estadoDiario_..._28072026.xls')
                    # se conserva tal cual: dos correos con ese nombre son la misma
                    # planilla y sobrescribir es correcto.
                    #
                    # Pero la tabla de la Corte llega todos los días como
                    # 'CORTE DE APELACIONES DE TEMUCO.xls', sin fecha: guardarla con
                    # su nombre hacía que cada día borrara al anterior y quedara una
                    # sola copia. Se le antepone la fecha del correo para no perder
                    # la evidencia de los días previos.
                    if fecha_del_estado_diario(limpio) is None and fecha_msg:
                        limpio = f"{fecha_msg.isoformat()}__{limpio}"
                    destino = DIR_PLANILLAS / limpio
                    # El nombre original viaja aparte: la fecha y el tipo se leen
                    # de él y no del archivo en disco, para que el prefijo que
                    # acabamos de agregar no se confunda con una fecha que hubiera
                    # venido del PJUD.
                    nombre_pjud = nombre.replace("/", "_").replace("\\", "_")
                    try:
                        carga = sub.get_payload(decode=True)
                        if not carga:
                            continue
                        destino.write_bytes(carga)
                    except Exception as e:
                        log(f"  ⚠ no se pudo guardar {limpio}: {e}")
                        continue
                    rutas.append((destino, fecha_msg, nombre_pjud, uid_actual))
        return rutas, "", uids_ok, uidvalidity
    except imaplib.IMAP4.error as e:
        return [], f"IMAP rechazó la sesión ({e}) — revisar clave de aplicación", set(), None
    except (socket.timeout, OSError) as e:
        return [], f"no hubo red o el servidor no respondió ({e})", set(), None
    except Exception as e:
        return [], f"fallo inesperado leyendo la bandeja ({e})", set(), None
    finally:
        socket.setdefaulttimeout(None)
        if mail is not None:
            try:
                mail.close()
            except Exception:
                pass
            try:
                mail.logout()
            except Exception:
                pass


def guardar_dia(ruta_planilla, fecha_correo, nombre_pjud, forzar):
    """Procesa una planilla y la guarda como el snapshot de su día.

    `nombre_pjud` es el nombre tal como lo mandó el PJUD; de ahí salen la fecha y
    el tipo. La ruta en disco puede llevar un prefijo agregado por nosotros y no
    sirve para eso.

    Devuelve (estado, fecha_iso, tipo) donde estado es 'nuevo', 'ya_estaba',
    'sin_movimientos' o 'ilegible'.
    """
    tipo = tipo_de_planilla(nombre_pjud)
    fecha = fecha_del_estado_diario(nombre_pjud)
    fuente_fecha = "nombre_archivo"
    if fecha is None:
        # Respaldo: la fecha de recepción del correo. Menos confiable —el correo
        # del día siguiente trae el estado del día anterior— así que queda
        # anotado de dónde salió.
        fecha = fecha_correo
        fuente_fecha = "fecha_correo"
    if fecha is None:
        return "ilegible", None, tipo

    fecha_iso = fecha.isoformat()
    destino = DIR_DIAS / f"{fecha_iso}__{tipo}.json"
    if destino.exists() and not forzar:
        return "ya_estaba", fecha_iso, tipo

    res = procesar_excel_pjud(str(ruta_planilla))
    if res.get("status") != "ok":
        return "ilegible", fecha_iso, tipo

    movimientos = res.get("movimientos", [])
    if not movimientos:
        # Un día sin movimientos es un dato, no un error: se guarda igual para
        # que el día quede cubierto y no aparezca como hueco.
        estado = "sin_movimientos"
    else:
        estado = "nuevo"

    registro = {
        "fecha_reporte": fecha_iso,
        "fuente_fecha": fuente_fecha,
        "tipo_planilla": tipo,
        "archivo": ruta_planilla.name,
        "archivo_original_pjud": nombre_pjud,
        "capturado_en": datetime.datetime.now().isoformat(timespec="seconds"),
        "total_movimientos": len(movimientos),
        "desglose_tribunales": res.get("desglose_tribunales", {}),
    }
    if tipo in TIPOS_PARA_INDICE:
        registro["movimientos"] = movimientos
    else:
        # De la tabla de la Corte se guarda el recuento pero no las filas: son 240
        # por día, en su mayoría causas ajenas, y ya se decidió que no cuentan como
        # actividad. Eran el 87% del peso de los snapshots. La evidencia sigue
        # completa en planillas/, que es el archivo tal como lo mandó el PJUD.
        registro["movimientos"] = []
        registro["filas_no_guardadas"] = len(movimientos)
        registro["motivo"] = (
            "Tipo de planilla que no alimenta el reloj: sin columna de rol "
            "confiable. Las filas quedan en el .xls original en planillas/."
        )
    destino.write_text(
        json.dumps(registro, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return estado, fecha_iso, tipo


def dias_habiles_entre(inicio, fin):
    """Lunes a viernes entre dos fechas, inclusive. El Estado Diario no se
    publica sábado ni domingo, así que un fin de semana sin archivo no es hueco.
    No descuenta feriados: para eso está feriadosChile.js en el front, y traerlo
    acá duplicaría la fuente de verdad. El costo es que algún feriado va a
    aparecer listado como faltante."""
    dias = []
    cursor = inicio
    while cursor <= fin:
        if cursor.weekday() < 5:
            dias.append(cursor)
        cursor += datetime.timedelta(days=1)
    return dias


def reconstruir_indice():
    """Recorre todos los snapshots y deja el índice rol -> última aparición.

    Se reconstruye completo en cada corrida en vez de actualizarse incremental:
    con un archivo por día el costo es despreciable y elimina la posibilidad de
    que el índice quede desincronizado de la evidencia que lo respalda.
    """
    archivos = sorted(DIR_DIAS.glob("*.json"))
    if not archivos:
        log("· todavía no hay días capturados: no se genera índice")
        return None

    causas = {}
    fechas_cubiertas = set()
    por_tipo = {}
    descartados = {"tipo_no_confiable": 0, "sin_rol_valido": 0}

    for ruta in archivos:
        try:
            reg = json.loads(ruta.read_text(encoding="utf-8"))
        except Exception as e:
            log(f"  ⚠ snapshot ilegible {ruta.name}: {e}")
            continue
        fecha = reg.get("fecha_reporte")
        if not fecha:
            continue
        tipo = reg.get("tipo_planilla", "otro")
        por_tipo[tipo] = por_tipo.get(tipo, 0) + 1

        if tipo not in TIPOS_PARA_INDICE:
            descartados["tipo_no_confiable"] += reg.get("total_movimientos", 0)
            continue

        # Un día cuenta como cubierto sólo si se leyó una planilla que sirve para
        # el reloj. Si el único archivo de ese día fue la tabla de la Corte, el
        # día sigue siendo un hueco y así debe figurar.
        fechas_cubiertas.add(fecha)

        for mov in reg.get("movimientos", []):
            clave = normalizar_rol(mov.get("rol"))
            if not parece_rol(clave):
                descartados["sin_rol_valido"] += 1
                continue
            entrada = causas.get(clave)
            if entrada is None:
                entrada = {
                    "rol_normalizado": clave,
                    "rol_visto": mov.get("rol"),
                    "caratula": mov.get("caratula"),
                    "tribunal": mov.get("tribunal"),
                    "jurisdiccion": mov.get("jurisdiccion"),
                    "primera_aparicion": fecha,
                    "ultima_aparicion": fecha,
                    "veces_visto": 0,
                    "ultimo_estado": mov.get("estado"),
                }
                causas[clave] = entrada
            entrada["veces_visto"] += 1
            if fecha < entrada["primera_aparicion"]:
                entrada["primera_aparicion"] = fecha
            if fecha >= entrada["ultima_aparicion"]:
                entrada["ultima_aparicion"] = fecha
                entrada["ultimo_estado"] = mov.get("estado")
                entrada["tribunal"] = mov.get("tribunal") or entrada["tribunal"]
                if mov.get("caratula") and mov["caratula"] != "Sin carátula registrada":
                    entrada["caratula"] = mov["caratula"]

    hoy = datetime.date.today()
    for entrada in causas.values():
        ultima = datetime.date.fromisoformat(entrada["ultima_aparicion"])
        entrada["dias_sin_aparecer"] = (hoy - ultima).days

    # Cobertura: sin esto el índice es indefendible, porque no habría manera de
    # distinguir una causa quieta de un período que el sistema no alcanzó a leer.
    orden = sorted(fechas_cubiertas)
    primero = datetime.date.fromisoformat(orden[0])
    ultimo = datetime.date.fromisoformat(orden[-1])
    esperados = dias_habiles_entre(primero, ultimo)
    faltantes = [d.isoformat() for d in esperados if d.isoformat() not in fechas_cubiertas]

    indice = {
        "generado_en": datetime.datetime.now().isoformat(timespec="seconds"),
        "advertencia": (
            "dias_sin_aparecer cuenta días desde la última vez que la causa figuró "
            "en el Estado Diario. NO equivale a 'sin gestión útil' del Art. 152 CPC: "
            "es un indicador para decidir qué expedientes revisar, no una "
            "conclusión jurídica."
        ),
        "cobertura": {
            "desde": orden[0],
            "hasta": orden[-1],
            "dias_capturados": len(fechas_cubiertas),
            "dias_habiles_esperados": len(esperados),
            "dias_habiles_faltantes": faltantes,
            "nota_faltantes": (
                "Un día faltante NO es un día sin movimiento: es un día que el "
                "sistema no leyó. Puede incluir feriados, que sí son días sin "
                "publicación."
            ),
            "snapshots_por_tipo": por_tipo,
            "tipos_que_alimentan_el_reloj": list(TIPOS_PARA_INDICE),
            "filas_descartadas": descartados,
            "nota_descartes": (
                "tipo_no_confiable son filas de planillas que no son la nómina del "
                "estudio (la tabla de la Corte de Apelaciones): se capturan como "
                "evidencia pero no cuentan como actividad."
            ),
        },
        "total_causas_vistas": len(causas),
        "causas": sorted(
            causas.values(), key=lambda c: c["dias_sin_aparecer"], reverse=True
        ),
    }

    # Cruce con el catálogo: cuántas de las causas en tramitación nunca han
    # aparecido. Al principio van a ser casi todas —la serie recién empieza— y
    # eso es exactamente lo que hay que poder ver.
    if CAUSAS_JSON.exists():
        try:
            catalogo = json.loads(CAUSAS_JSON.read_text(encoding="utf-8"))
            casos = catalogo.get("casos", [])
            vistos = set(causas.keys())
            nunca = [
                {"rit": c.get("rit"), "tribunal": c.get("tribunal"), "caratula": c.get("caratula")}
                for c in casos
                if normalizar_rol(c.get("rit")) not in vistos
            ]
            indice["cruce_catalogo"] = {
                "total_en_catalogo": len(casos),
                "con_alguna_aparicion": len(casos) - len(nunca),
                "sin_ninguna_aparicion": len(nunca),
                "nota": (
                    "sin_ninguna_aparicion alto es lo normal mientras la serie sea "
                    "corta: sólo dice que no se movieron en los días capturados."
                ),
                "muestra_sin_aparicion": nunca[:50],
            }
        except Exception as e:
            log(f"  ⚠ no se pudo cruzar con pjudCausesData.json: {e}")

    INDICE.write_text(json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8")
    return indice


def anotar_bitacora(entrada):
    with BITACORA.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dias", type=int, default=30,
                    help="ventana de correos a revisar (por defecto 30). Una ventana "
                         "amplia hace que el sistema se recupere solo si estuvo apagado.")
    ap.add_argument("--forzar", action="store_true",
                    help="re-escribe snapshots de días ya guardados")
    ap.add_argument("--solo-indice", action="store_true",
                    help="no toca el correo: sólo reconstruye el índice")
    ap.add_argument("--releer-correos", action="store_true",
                    help="ignora la caché de correos ya procesados y baja la ventana "
                         "completa de nuevo")
    args = ap.parse_args()

    for d in (RAIZ, DIR_PLANILLAS, DIR_DIAS):
        d.mkdir(parents=True, exist_ok=True)

    inicio = time.time()
    resumen = {
        "ejecutado_en": datetime.datetime.now().isoformat(timespec="seconds"),
        "ventana_dias": args.dias,
    }

    if args.solo_indice:
        indice = reconstruir_indice()
        if indice:
            log(f"✔ índice reconstruido: {indice['total_causas_vistas']} causas")
        return 0

    creds = cargar_credenciales()
    if creds is None:
        resumen.update({"resultado": "sin_credenciales", "leyo_bandeja": False})
        anotar_bitacora(resumen)
        log("✖ sin credenciales utilizables: no se leyó la bandeja")
        return 1
    usuario, clave, remitente = creds

    log(f"→ leyendo bandeja de {usuario}, ventana {args.dias} días")
    planillas, error, uids_nuevos, uidvalidity = descargar_planillas(
        usuario, clave, remitente, args.dias, usar_cache=not args.releer_correos
    )

    if error:
        # Este es el caso que el scraper OJV reportaba como "sin cambios".
        resumen.update({
            "resultado": "error_lectura",
            "leyo_bandeja": False,
            "detalle": error,
        })
        anotar_bitacora(resumen)
        log(f"✖ NO se pudo leer la bandeja: {error}")
        log("  (no se concluye nada sobre movimientos: no se leyó)")
        return 1

    conteo = {"nuevo": 0, "ya_estaba": 0, "sin_movimientos": 0, "ilegible": 0}
    dias_nuevos = []
    uids_con_falla = set()
    for ruta, fecha_correo, nombre_pjud, uid in planillas:
        estado, fecha_iso, tipo = guardar_dia(ruta, fecha_correo, nombre_pjud, args.forzar)
        conteo[estado] = conteo.get(estado, 0) + 1
        if estado in ("nuevo", "sin_movimientos") and fecha_iso:
            dias_nuevos.append(f"{fecha_iso}/{tipo}")
        if estado == "ilegible":
            uids_con_falla.add(uid)
            log(f"  ⚠ planilla ilegible o sin fecha: {ruta.name}")

    # La caché se extiende sólo con los correos que quedaron enteramente
    # resueltos. Uno con una planilla ilegible se deja fuera para que la próxima
    # corrida lo reintente en vez de darlo por hecho.
    if uidvalidity:
        cache_previa = cargar_cache_uids(uidvalidity) if not args.releer_correos else set()
        guardar_cache_uids(uidvalidity, cache_previa | (uids_nuevos - uids_con_falla))

    log(f"· planillas: {len(planillas)} · nuevas {conteo['nuevo']} · "
        f"ya estaban {conteo['ya_estaba']} · vacías {conteo['sin_movimientos']} · "
        f"ilegibles {conteo['ilegible']}")
    for d in sorted(set(dias_nuevos)):
        log(f"  + {d}")

    indice = reconstruir_indice()

    resumen.update({
        "resultado": "ok",
        "leyo_bandeja": True,
        "planillas_bajadas": len(planillas),
        "dias_nuevos": sorted(set(dias_nuevos)),
        "conteo": conteo,
        "segundos": round(time.time() - inicio, 1),
    })
    if indice:
        resumen["cobertura"] = indice["cobertura"]
        resumen["total_causas_vistas"] = indice["total_causas_vistas"]
        cob = indice["cobertura"]
        log(f"✔ cobertura {cob['desde']} → {cob['hasta']}: "
            f"{cob['dias_capturados']} días capturados, "
            f"{len(cob['dias_habiles_faltantes'])} hábiles sin leer")
        log(f"✔ {indice['total_causas_vistas']} causas con al menos una aparición")
    anotar_bitacora(resumen)
    return 0


if __name__ == "__main__":
    sys.exit(main())
