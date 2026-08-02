#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cliente HTTP Directo OJV — Prueba de Bypass del WAF F5 BIG-IP
=============================================================
PROPÓSITO: Demostrar si es posible (o no) hacer requests HTTP directos
a los endpoints del PJUD usando cookies de una sesión legítima,
SIN usar ningún navegador.

REQUISITOS:
  1. Haber ejecutado primero interceptor_endpoints_ojv.py y haber navegado
     por la OJV para descubrir endpoints.
  2. Tener cookies_sesion_activa.json (generado por el interceptor).

USO:
  python3 cliente_directo_ojv.py                    # Prueba básica
  python3 cliente_directo_ojv.py --endpoint URL     # Probar un endpoint específico
  python3 cliente_directo_ojv.py --todos            # Probar todos los descubiertos

RESULTADO: Muestra con total transparencia si cada request:
  ✅ Pasó el WAF y devolvió datos reales
  ❌ Fue bloqueado por el WAF (403, redirect, challenge JS, etc.)
"""

import json
import sys
import time
import argparse
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("ERROR: Necesitas requests. Instalar con: pip install requests")
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent
ENDPOINTS_FILE = BASE_DIR / "endpoints_descubiertos.json"
COOKIES_FILE = BASE_DIR / "cookies_sesion_activa.json"
COOKIES_FALLBACK = BASE_DIR / "pjud_cookies.json"
RESULTADOS_FILE = BASE_DIR / "resultados_prueba_waf.json"


def cargar_cookies():
    """Carga las cookies de la sesión activa o del fallback."""
    cookies_path = COOKIES_FILE if COOKIES_FILE.exists() else COOKIES_FALLBACK
    if not cookies_path.exists():
        print(f"❌ No se encontró archivo de cookies.")
        print(f"   Ejecuta primero: python3 interceptor_endpoints_ojv.py")
        sys.exit(1)

    with open(cookies_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cookies_raw = data.get("cookies", [])
    print(f"🍪 Cookies cargadas de: {cookies_path.name}")
    print(f"   Total cookies: {len(cookies_raw)}")

    # Convertir formato Playwright a dict para requests
    cookies_dict = {}
    cookies_pjud = []
    for c in cookies_raw:
        nombre = c.get("name", "")
        valor = c.get("value", "")
        dominio = c.get("domain", "")

        # Solo cookies del PJUD
        if "pjud" in dominio:
            cookies_dict[nombre] = valor
            cookies_pjud.append(c)
            print(f"   🔑 {nombre} = {valor[:30]}... (dominio: {dominio})")

    if not cookies_dict:
        print("❌ No se encontraron cookies del PJUD. ¿Te logueaste?")
        sys.exit(1)

    return cookies_dict, cookies_pjud


def construir_headers(cookies_pjud):
    """Construye headers que imiten un navegador real."""
    return {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
                  "image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://oficinajudicialvirtual.pjud.cl/",
        "Origin": "https://oficinajudicialvirtual.pjud.cl",
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
    }


def analizar_respuesta(resp):
    """Analiza si la respuesta es real o un bloqueo del WAF."""
    status = resp.status_code
    content_type = resp.headers.get("Content-Type", "")
    body = resp.text[:3000]
    body_lower = body.lower()

    resultado = {
        "status_code": status,
        "content_type": content_type,
        "content_length": len(resp.text),
        "headers_respuesta": dict(resp.headers),
    }

    # Detectar bloqueos del WAF
    indicadores_bloqueo = []

    # 1. Status code de bloqueo
    if status == 403:
        indicadores_bloqueo.append("HTTP 403 Forbidden")
    elif status == 429:
        indicadores_bloqueo.append("HTTP 429 Too Many Requests (rate limit)")
    elif status == 503:
        indicadores_bloqueo.append("HTTP 503 Service Unavailable")
    elif status in (301, 302, 307, 308):
        location = resp.headers.get("Location", "")
        if "captcha" in location.lower() or "challenge" in location.lower():
            indicadores_bloqueo.append(f"Redirect a challenge: {location}")

    # 2. Contenido que indica bloqueo F5
    f5_indicators = [
        "please enable javascript",
        "browser verification",
        "checking your browser",
        "access denied",
        "bot detection",
        "f5_cspm",
        "ts_csrf",
        "bigipserver",
        "request rejected",
        "your request has been blocked",
        "automated access",
        "_tspd_",
    ]
    for indicator in f5_indicators:
        if indicator in body_lower:
            indicadores_bloqueo.append(f"Contenido F5/WAF detectado: '{indicator}'")

    # 3. Challenge JavaScript (página vacía con solo JS)
    if len(body.strip()) < 500 and "<script" in body_lower and "document" not in body_lower:
        indicadores_bloqueo.append("Probable JS challenge (body pequeño con script)")

    # 4. Detectar si hay contenido real del PJUD
    indicadores_exito = []
    pjud_markers = [
        "poder judicial", "oficina judicial", "mis causas", "estado diario",
        "tribunal", "causa", "rol", "caratulado", "juzgado", "corte",
        "escrito", "resolución", "escritorio", "bandeja", "jurisdicción",
    ]
    for marker in pjud_markers:
        if marker in body_lower:
            indicadores_exito.append(f"Contenido PJUD: '{marker}'")

    resultado["indicadores_bloqueo"] = indicadores_bloqueo
    resultado["indicadores_exito"] = indicadores_exito
    resultado["bloqueado"] = len(indicadores_bloqueo) > 0
    resultado["datos_reales"] = len(indicadores_exito) > 0 and not resultado["bloqueado"]
    resultado["body_preview"] = body[:1500]

    return resultado


def probar_endpoint(session, metodo, url, headers, post_data=None):
    """Prueba un endpoint y reporta resultado."""
    try:
        if metodo.upper() == "POST":
            # Determinar formato del post_data
            content_type = headers.get("Content-Type", "")
            if "json" in content_type:
                resp = session.post(url, headers=headers, json=json.loads(post_data),
                                     timeout=30, allow_redirects=False)
            elif "form" in content_type or "urlencoded" in content_type:
                resp = session.post(url, headers=headers, data=post_data,
                                     timeout=30, allow_redirects=False)
            else:
                resp = session.post(url, headers=headers, data=post_data,
                                     timeout=30, allow_redirects=False)
        else:
            resp = session.get(url, headers=headers, timeout=30,
                               allow_redirects=False)

        return analizar_respuesta(resp)

    except requests.exceptions.ConnectionError as e:
        return {"error": f"Conexión rechazada: {e}", "bloqueado": True, "datos_reales": False}
    except requests.exceptions.Timeout:
        return {"error": "Timeout (30s)", "bloqueado": True, "datos_reales": False}
    except Exception as e:
        return {"error": f"Error: {e}", "bloqueado": True, "datos_reales": False}


def main():
    parser = argparse.ArgumentParser(description="Prueba de bypass WAF PJUD")
    parser.add_argument("--endpoint", help="URL específica a probar")
    parser.add_argument("--todos", action="store_true",
                        help="Probar todos los endpoints descubiertos")
    args = parser.parse_args()

    print("=" * 75)
    print("🧪 CLIENTE HTTP DIRECTO — PRUEBA DE BYPASS WAF F5 BIG-IP")
    print("=" * 75)
    print()
    print("Este script hace requests HTTP PUROS (sin navegador) usando")
    print("las cookies de tu sesión legítima. El resultado mostrará si")
    print("el WAF los bloquea o los deja pasar.")
    print()

    # Cargar cookies
    cookies_dict, cookies_pjud = cargar_cookies()
    headers = construir_headers(cookies_pjud)

    # Crear sesión
    session = requests.Session()
    for nombre, valor in cookies_dict.items():
        session.cookies.set(nombre, valor, domain="oficinajudicialvirtual.pjud.cl")

    resultados = []
    total_ok = 0
    total_bloqueado = 0

    # URLs a probar
    urls_prueba = []

    if args.endpoint:
        urls_prueba.append(("GET", args.endpoint, None))
    elif args.todos and ENDPOINTS_FILE.exists():
        with open(ENDPOINTS_FILE, "r", encoding="utf-8") as f:
            datos = json.load(f)
        for ep in datos.get("ENDPOINTS_API", []) + datos.get("paginas", []):
            urls_prueba.append((ep["method"], ep["url"], ep.get("post_data")))
    else:
        # Pruebas básicas por defecto
        urls_prueba = [
            ("GET", "https://oficinajudicialvirtual.pjud.cl/", None),
            ("GET", "https://oficinajudicialvirtual.pjud.cl/indexN.php", None),
            ("GET", "https://oficinajudicialvirtual.pjud.cl/ADIR_871/mis_causas.php", None),
            ("GET", "https://oficinajudicialvirtual.pjud.cl/ADIR_871/estado_diario.php", None),
            ("GET", "https://oficinajudicialvirtual.pjud.cl/ADIR_871/escritorio.php", None),
            ("GET", "https://oficinajudicialvirtual.pjud.cl/ADIR_871/ingreso_escrito.php", None),
        ]
        # Si hay endpoints descubiertos, agregarlos
        if ENDPOINTS_FILE.exists():
            try:
                with open(ENDPOINTS_FILE, "r", encoding="utf-8") as f:
                    datos = json.load(f)
                for ep in datos.get("ENDPOINTS_API", []):
                    urls_prueba.append((ep["method"], ep["url"], ep.get("post_data")))
                print(f"\n📋 También probando {len(datos.get('ENDPOINTS_API', []))} "
                      f"endpoints API descubiertos por el interceptor.")
            except Exception:
                pass

    print(f"\n{'─'*75}")
    print(f"🚀 Ejecutando {len(urls_prueba)} pruebas...")
    print(f"{'─'*75}\n")

    for idx, (metodo, url, post_data) in enumerate(urls_prueba):
        print(f"[{idx+1}/{len(urls_prueba)}] {metodo} {url[:90]}")

        resultado = probar_endpoint(session, metodo, url, headers, post_data)
        resultado["metodo"] = metodo
        resultado["url"] = url
        resultados.append(resultado)

        if resultado.get("error"):
            print(f"  💥 {resultado['error']}")
            total_bloqueado += 1
        elif resultado["bloqueado"]:
            print(f"  ❌ BLOQUEADO por WAF")
            for ind in resultado["indicadores_bloqueo"]:
                print(f"     └─ {ind}")
            total_bloqueado += 1
        elif resultado["datos_reales"]:
            print(f"  ✅ PASÓ EL WAF — Datos reales del PJUD recibidos")
            for ind in resultado["indicadores_exito"][:3]:
                print(f"     └─ {ind}")
            total_ok += 1
        else:
            status = resultado.get("status_code", "?")
            ct = resultado.get("content_type", "?")
            print(f"  ⚠️  Status {status} | {ct} — revisar manualmente")
            # Mostrar preview
            preview = resultado.get("body_preview", "")[:200]
            if preview:
                print(f"     └─ Preview: {preview[:150]}...")

        # Pausa entre requests para no disparar rate limiting
        if idx < len(urls_prueba) - 1:
            time.sleep(2)

        print()

    # Guardar resultados
    reporte = {
        "generado_en": datetime.now().isoformat(),
        "total_pruebas": len(resultados),
        "pasaron_waf": total_ok,
        "bloqueados": total_bloqueado,
        "indeterminados": len(resultados) - total_ok - total_bloqueado,
        "veredicto": "",
        "resultados": resultados,
    }

    if total_ok > 0 and total_bloqueado == 0:
        reporte["veredicto"] = (
            "✅ CONFIRMADO: El WAF F5 NO bloquea requests HTTP directos "
            "cuando se usan cookies de sesión legítimas. La teoría de cómo "
            "Chateau envió 38.477 escritos es VIABLE."
        )
    elif total_ok > 0 and total_bloqueado > 0:
        reporte["veredicto"] = (
            "⚠️ PARCIAL: Algunos endpoints pasan el WAF y otros no. "
            "Es posible que ciertos endpoints tengan protección adicional."
        )
    elif total_bloqueado > 0 and total_ok == 0:
        reporte["veredicto"] = (
            "❌ TENÍAS RAZÓN: El WAF F5 BIG-IP bloquea TODOS los requests "
            "HTTP directos, incluso con cookies legítimas. La automatización "
            "sin navegador NO funciona contra el PJUD."
        )
    else:
        reporte["veredicto"] = (
            "⚠️ INDETERMINADO: No se pudo confirmar ni descartar. "
            "Las respuestas necesitan revisión manual."
        )

    with open(RESULTADOS_FILE, "w", encoding="utf-8") as f:
        json.dump(reporte, f, indent=2, ensure_ascii=False)

    print("=" * 75)
    print("📊 VEREDICTO FINAL")
    print("=" * 75)
    print(f"  Pruebas ejecutadas:    {len(resultados)}")
    print(f"  Pasaron el WAF:        {total_ok}")
    print(f"  Bloqueados por WAF:    {total_bloqueado}")
    print(f"  Indeterminados:        {len(resultados) - total_ok - total_bloqueado}")
    print()
    print(f"  {reporte['veredicto']}")
    print()
    print(f"  📁 Reporte completo en: {RESULTADOS_FILE}")
    print("=" * 75)


if __name__ == "__main__":
    main()
