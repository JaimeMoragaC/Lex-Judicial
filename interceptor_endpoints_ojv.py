#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Interceptor de Endpoints OJV — Descubrimiento de API Interna del PJUD
=====================================================================
PROPÓSITO: Abrir TU navegador real (con tu perfil y sesión existente),
navegar la OJV, y capturar TODOS los requests HTTP que el frontend hace
al backend. Esto descubre los endpoints reales que usa la OJV internamente.

INSTRUCCIONES:
  1. Ejecutar: python3 interceptor_endpoints_ojv.py
  2. Se abrirá Chromium con tu sesión. Si ya estás logueado, verás el portal.
  3. Navega normalmente: abre "Mis Causas", "Estado Diario", consulta algún ROL.
  4. El script captura TODOS los requests en silencio.
  5. Cuando cierres la ventana, se exporta todo a endpoints_descubiertos.json

RESULTADO: Un mapa completo de los endpoints reales del PJUD, con sus headers,
cookies, payloads y respuestas. Esto es la prueba de si se puede o no hacer
requests HTTP directos.
"""

import os
import sys
import json
import time
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("ERROR: Necesitas playwright. Instalar con: pip install playwright && playwright install chromium")
    sys.exit(1)

PERFIL_DIR = "/home/jaime/.config/lexcontrol_chrome_profile"
BASE_DIR = Path(__file__).resolve().parent
SALIDA = BASE_DIR / "endpoints_descubiertos.json"
SALIDA_COOKIES = BASE_DIR / "cookies_sesion_activa.json"

# Dominios que nos interesan (ignoramos analytics, fonts, etc.)
DOMINIOS_PJUD = [
    "oficinajudicialvirtual.pjud.cl",
    "pjud.cl",
    "civil.pjud.cl",
    "laboral.pjud.cl",
    "familia.pjud.cl",
    "cobranza.pjud.cl",
    "corte.pjud.cl",
    "suprema.pjud.cl",
    "reformaprocesal.pjud.cl",
]

# Extensiones de recursos estáticos que ignoramos
EXT_ESTATICAS = (".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg",
                 ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map")


class InterceptorOJV:
    def __init__(self):
        self.requests_capturados = []
        self.responses_capturadas = {}
        self.contador = 0
        self.inicio = time.time()

    def es_dominio_pjud(self, url):
        """¿El request va a un dominio del PJUD?"""
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return any(d in parsed.netloc for d in DOMINIOS_PJUD)

    def es_recurso_estatico(self, url):
        """¿Es un .js, .css, imagen, fuente, etc.?"""
        path = url.split("?")[0].lower()
        return any(path.endswith(ext) for ext in EXT_ESTATICAS)

    def on_request(self, request):
        """Callback que se ejecuta en CADA request que hace el navegador."""
        url = request.url

        if not self.es_dominio_pjud(url):
            return
        if self.es_recurso_estatico(url):
            return

        self.contador += 1
        metodo = request.method
        headers = dict(request.headers)
        post_data = None

        try:
            post_data = request.post_data
        except Exception:
            pass

        entrada = {
            "id": self.contador,
            "timestamp": datetime.now().isoformat(),
            "method": metodo,
            "url": url,
            "headers": headers,
            "post_data": post_data,
            "content_type": headers.get("content-type", ""),
            "referer": headers.get("referer", ""),
        }

        self.requests_capturados.append(entrada)

        # Indicador visual en consola
        emoji = "📤" if metodo == "GET" else "📮"
        print(f"  {emoji} [{self.contador:03d}] {metodo} {url[:120]}")
        if post_data:
            # Mostrar primeros 200 chars del payload
            preview = str(post_data)[:200]
            print(f"       └─ PAYLOAD: {preview}")

    def on_response(self, response):
        """Callback que captura la respuesta de cada request."""
        url = response.url

        if not self.es_dominio_pjud(url):
            return
        if self.es_recurso_estatico(url):
            return

        status = response.status
        headers_resp = dict(response.headers)
        content_type = headers_resp.get("content-type", "")

        body_preview = None
        try:
            # Solo capturamos el body si es JSON, HTML o texto
            if any(t in content_type for t in ["json", "html", "text", "xml",
                                                 "javascript"]):
                body = response.text()
                body_preview = body[:2000]  # primeros 2000 chars
        except Exception:
            body_preview = "(no se pudo leer el body)"

        entrada_resp = {
            "url": url,
            "status": status,
            "content_type": content_type,
            "headers": headers_resp,
            "body_preview": body_preview,
        }

        # Asociar respuesta con su request
        for req in reversed(self.requests_capturados):
            if req["url"] == url:
                req["response_status"] = status
                req["response_content_type"] = content_type
                req["response_body_preview"] = body_preview
                break

        emoji_status = "✅" if 200 <= status < 400 else "❌"
        print(f"       {emoji_status} Response: {status} | {content_type[:50]}")

    def exportar(self, cookies):
        """Exporta todos los endpoints descubiertos y las cookies activas."""
        # Clasificar los endpoints
        endpoints_api = []
        endpoints_paginas = []
        endpoints_otros = []

        for req in self.requests_capturados:
            ct = req.get("response_content_type", "")
            if any(t in ct for t in ["json", "xml"]):
                endpoints_api.append(req)
            elif "html" in ct:
                endpoints_paginas.append(req)
            else:
                endpoints_otros.append(req)

        resultado = {
            "generado_en": datetime.now().isoformat(),
            "duracion_sesion_seg": round(time.time() - self.inicio, 1),
            "total_requests": len(self.requests_capturados),
            "resumen": {
                "endpoints_api": len(endpoints_api),
                "paginas_html": len(endpoints_paginas),
                "otros": len(endpoints_otros),
            },
            "ENDPOINTS_API": endpoints_api,
            "paginas": endpoints_paginas,
            "otros": endpoints_otros,
        }

        with open(SALIDA, "w", encoding="utf-8") as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False)

        # Guardar cookies para el cliente directo
        cookies_export = {
            "exportado_en": datetime.now().isoformat(),
            "cookies": cookies,
            "instruccion": (
                "Estas cookies son de una sesión legítima. Se usan en "
                "cliente_directo_ojv.py para probar requests HTTP sin navegador."
            ),
        }
        with open(SALIDA_COOKIES, "w", encoding="utf-8") as f:
            json.dump(cookies_export, f, indent=2, ensure_ascii=False)

        print(f"\n{'='*75}")
        print(f"📊 RESUMEN DE INTERCEPTACIÓN")
        print(f"{'='*75}")
        print(f"  Total requests capturados: {len(self.requests_capturados)}")
        print(f"  Endpoints API (JSON/XML):  {len(endpoints_api)}")
        print(f"  Páginas HTML:              {len(endpoints_paginas)}")
        print(f"  Otros:                     {len(endpoints_otros)}")
        print(f"\n  📁 Endpoints guardados en: {SALIDA}")
        print(f"  🍪 Cookies guardadas en:   {SALIDA_COOKIES}")

        if endpoints_api:
            print(f"\n  🎯 ENDPOINTS API DESCUBIERTOS:")
            for ep in endpoints_api:
                print(f"     {ep['method']} {ep['url'][:100]}")
                if ep.get("post_data"):
                    print(f"        └─ POST data: {str(ep['post_data'])[:100]}")
        else:
            print(f"\n  ⚠️  No se detectaron endpoints API (JSON/XML).")
            print(f"      Navega más secciones de la OJV para descubrir más.")

        print(f"{'='*75}")


def main():
    os.makedirs(PERFIL_DIR, exist_ok=True)
    interceptor = InterceptorOJV()

    print("=" * 75)
    print("🔍 INTERCEPTOR DE ENDPOINTS OJV — DESCUBRIMIENTO DE API INTERNA")
    print("=" * 75)
    print()
    print("Se va a abrir Chromium con tu perfil existente.")
    print("INSTRUCCIONES:")
    print("  1. Si ya estás logueado, navega directamente.")
    print("     Si no, ingresa tu clave y resuelve el CAPTCHA.")
    print("  2. Navega por las secciones que quieras investigar:")
    print("     - 'Mis Causas' → buscar una causa por ROL")
    print("     - 'Estado Diario'")
    print("     - 'Consulta de Causas'")
    print("     - 'Ingreso de Escritos' (sin enviar, solo abrir)")
    print("  3. CIERRA la ventana cuando termines.")
    print()
    print("Todos los requests HTTP serán capturados en silencio.")
    print("=" * 75)
    print()

    with sync_playwright() as p:
        chrome_bin = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None

        launch_args = [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--no-first-run",
        ]

        context = p.chromium.launch_persistent_context(
            user_data_dir=PERFIL_DIR,
            executable_path=chrome_bin,
            headless=False,
            viewport={"width": 1366, "height": 768},
            args=launch_args,
        )

        # Inyección anti-detección
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.navigator.chrome = { runtime: {}, app: {}, csid: {}, loadTimes: () => {} };
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['es-CL', 'es', 'en']});
        """)

        page = context.pages[0] if context.pages else context.new_page()

        # REGISTRAR INTERCEPTORES EN TODAS LAS PÁGINAS
        def registrar_interceptores(pg):
            pg.on("request", interceptor.on_request)
            pg.on("response", interceptor.on_response)

        registrar_interceptores(page)

        # También interceptar nuevas pestañas/popups
        context.on("page", lambda new_page: registrar_interceptores(new_page))

        # Navegar a la OJV
        print("🌐 Navegando a oficinajudicialvirtual.pjud.cl...")
        print("   (Los requests aparecerán aquí abajo en tiempo real)")
        print()

        page.goto("https://oficinajudicialvirtual.pjud.cl/",
                   wait_until="domcontentloaded")

        # Esperar hasta que el usuario cierre la ventana
        try:
            while True:
                if len(context.pages) == 0 or page.is_closed():
                    print("\n👋 Ventana cerrada por el usuario.")
                    break
                time.sleep(1)
        except Exception as e:
            print(f"\n⚠️ Sesión terminada: {e}")

        # Exportar cookies activas
        try:
            cookies = context.cookies()
        except Exception:
            cookies = []

        try:
            context.close()
        except Exception:
            pass

    # Exportar todo
    interceptor.exportar(cookies)

    print(f"\n🚀 SIGUIENTE PASO:")
    print(f"   Ejecuta: python3 cliente_directo_ojv.py")
    print(f"   Ese script intentará usar los endpoints descubiertos")
    print(f"   con tus cookies, SIN navegador, para probar si el WAF lo bloquea.")


if __name__ == "__main__":
    main()
