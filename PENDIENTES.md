# LexControl — Pendientes

Hoja de ruta al 29-07-2026. El orden no es por dificultad sino por lo que cambia
la práctica.

## El diagnóstico de fondo

El sistema trata la historia del estudio como **archivo**. Debería tratarla como
**inteligencia**. Los números que lo justifican, sacados de los propios datos:

```
1.557 causas · 783 en tramitación · 143 tribunales · 17.742 documentos

660 de las causas en tramitación ingresaron hace más de 3 años.

Contrapartes recurrentes:
   EMPRESA ELÉCTRICA CAREN      137 causas
   ISAPRE MASVIDA                47
   ISAPRE CONSALUD               45
   TRANSMISORA VALLE ALLIPEN     35
```

---

## 1. Reloj de inactividad — prioritaria

**El riesgo:** abandono del procedimiento, Art. 152 CPC — seis meses sin gestión
útil. Con 783 causas en tramitación, la probabilidad de que ninguna esté derivando
hacia abandono es cero.

**Por qué hoy es imposible:** sólo se guarda `fechaIngreso`, que es cuándo entró la
causa, no cuándo se movió por última vez. El sistema no puede decir cuál duerme.

**Por qué ahora sí se puede:** el Estado Diario que llega por correo dice todos los
días qué causas se movieron. Hoy se muestra en pantalla y se pierde. Persistirlo por
día construye el reloj en pocas semanas — y lo que **no** aparezca en seis meses es
la lista de riesgo.

Es la más barata de las cuatro y la única cuya ausencia es un problema de
responsabilidad profesional, no de comodidad.

## 2. Biblioteca de argumentos con resultado

137 causas contra la misma contraparte no son 137 causas: son una campaña. Hoy el
sistema las muestra como filas sin relación entre sí.

Falta el vínculo **escrito presentado → resolución posterior → resultado**. El
material ya está escrito, en los 17.742 documentos del disco; lo que no existe es la
conexión.

Es el activo que un competidor no puede comprar: puede adquirir el mismo software,
no diez años de escritos con sus resultados pegados.

## 3. Tiempos reales por tribunal

Cuánto se demora de verdad cada una de las 143 cortes y juzgados entre una etapa y
la siguiente, derivado de la propia historia del estudio. No está publicado en
ninguna parte. Sirve para comprometerle un plazo a un cliente y poder respaldarlo.

## 4. Trazabilidad defensiva

Poder demostrar qué sabía el sistema y cuándo. Hoy un plazo en el Radar no distingue
entre uno verificado contra la resolución y uno aceptado sin mirar. Si el sistema se
equivoca, responde el abogado.

---

## Fuera de alcance, por decisión

Facturación, CRM y firma electrónica. Se compran hechos y no diferencian en nada.
Cada hora ahí es una hora no invertida en lo único propio: el corpus.

---

## Pendientes técnicos menores

- **El Dashboard no muestra de qué día es el Estado Diario que exhibe.** El servidor
  ya devuelve `fecha_estado_diario`, `antiguedad_dias` y `es_de_hoy`; falta pintarlo
  y avisar fuerte cuando no sea de hoy. Importa porque el "principio de continuidad"
  de `/sincronizar_gmail_pjud` retrocede hasta 15 archivos y puede mostrar uno viejo.
- `Dashboard.jsx` conserva 150 estilos inline. Se dejó sin reescribir a propósito:
  8 secciones y 3 integraciones OJV, con riesgo de perder funcionalidad.
- Tres feriados por verificar contra el calendario oficial, todos por reglas de
  traslado con feriado en domingo o sábado: **2025-06-29 vs 30**, **2025-10-12 vs 13**
  y **2026-10-31 vs 30**. Una vez confirmados se fijan en `AJUSTES_OFICIALES`
  (`src/utils/feriadosChile.js`).
- El índice de texto quedó incompleto: correr `python3 indexar_pdfs.py` (es
  incremental, retoma solo).

## Nota sobre el scraper de la OJV

`motor_ojv_diferencial.py` está bloqueado por un **WAF F5 BIG-IP** en el perímetro,
no por Clave Única ni por el CAPTCHA: rechaza incluso sesiones ya autenticadas. Y
reportaba "293 causas auditadas, 293 sin cambio" cuando en realidad lo habían
bloqueado — no distinguía "no hubo movimientos" de "no pude entrar".

Es vía muerta y no vale la pena insistir: **el Estado Diario llega por correo todos
los días y funciona.**
