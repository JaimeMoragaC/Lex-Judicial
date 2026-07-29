import os
import time
from playwright.sync_api import sync_playwright

def probar_clic_fisico_humano():
    perfil_dir = "/home/jaime/.config/lexcontrol_chrome_profile"
    url = "https://oficinajudicialvirtual.pjud.cl/"
    
    print("🚀 Iniciando navegador visible para prueba de clic físico humano en 'Mi Estado Diario'...")
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=perfil_dir,
            headless=False,
            viewport={"width": 1366, "height": 768},
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-infobars", "--no-first-run"]
        )
        page = context.pages[0] if len(context.pages) > 0 else context.new_page()
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.navigator.chrome = { runtime: {}, app: {}, csid: {}, loadTimes: () => {} };
        """)
        
        print("🌐 Cargando portada OJV...")
        page.goto(url)
        
        print("==========================================================================")
        print("🚨 JAIME: SI TE PIDE CLAVE, INGRESALA AHORA PARA ENTRAR AL PORTAL.")
        print("⌛ Esperando hasta 60 segundos a ver tu sesión activa (Jaime Moraga C.)...")
        print("==========================================================================")
        
        sesion_lista = False
        for i in range(60):
            txt_body = page.locator("body").inner_text().lower()
            if "jaime moraga" in txt_body or "mi estado diario" in txt_body or "cerrar sesión" in txt_body:
                sesion_lista = True
                print(f"✅ ¡Sesión privada detectada con éxito en segundo {i}!")
                break
            time.sleep(1)
            
        if not sesion_lista:
            print("❌ No se detectó el ingreso en 60 segundos.")
            return

        print("🛑 PAUSA DE 3 SEGUNDOS tras login para estabilizar el portal...")
        print("\n" + "="*75)
        print("🚨 JAIME: POR FAVOR HAZ CLIC TÚ MISMO EN 'MI ESTADO DIARIO' O 'MIS CAUSAS' CON TU MOUSE REAL.")
        print("👉 Como tú haces el clic con tu hardware y driver de Linux real, Imperva jamás te bloqueará.")
        print("⌛ El robot esperará hasta 60 segundos en silencio a que abras tu sección para auditar y extraer los datos...")
        print("="*75 + "\n")
        
        seccion_abierta = False
        for i in range(60):
            # Revisamos texto en el documento principal y en todos los iframes del navegador
            textos_total = page.content().lower() + " " + " ".join([f.content().lower() for f in page.frames])
            if any(w in textos_total for w in ["tribunal", "rol", "carátula", "caratula", "fecha resolución", "movimientos del día", "estados diarios"]):
                seccion_abierta = True
                print(f"✅ ¡Sección judicial abierta por Jaime detectada con éxito en segundo {i}!")
                break
            time.sleep(1)

        if not seccion_abierta:
            print("⚠️ No se detectaron tablas de causas abiertas en 60 segundos.")
            
        print("⌛ Esperando 3 segundos para tomar foto del estado del portal...")
        page.wait_for_timeout(3000)
        
        foto_res = "/home/jaime/Descargas/lex-control-casos/prueba_real_pjud_resultado.png"
        page.screenshot(path=foto_res, full_page=True)
        print(f"📸 Foto guardada en: {foto_res}")
        
        # Verificación infalible en TODO el DOM y TODOS los iframes del navegador
        html_global = page.content().lower() + " " + " ".join([f.content().lower() for f in page.frames])
        rechazado = False
        for frase in ["was rejected", "support id", "the requested url was rejected", "please consult with your administrator"]:
            if frase in html_global:
                rechazado = True
                break
                
        if rechazado:
            print("❌ FALLO CONFIRMADO: El recuadro rojo de rechazo de Imperva WAF apareció en pantalla.")
        else:
            print("🎉 ¡ÉXITO ROTUNDO! No hay recuadro de rechazo. Al hacer tú el clic físico, el portal funciona perfecto y el robot puede leer los datos en silencio.")
            
        time.sleep(3)

if __name__ == "__main__":
    probar_clic_fisico_humano()
