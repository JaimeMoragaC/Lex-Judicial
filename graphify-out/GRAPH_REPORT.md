# Graph Report - .  (2026-07-28)

## Corpus Check
- Large corpus: 38 files · ~589,966 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 121 nodes · 220 edges · 15 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Package Dependencies (React)
- Motor OJV Diferencial
- Local Server (LexControl)
- Calculadora Términos (Plazos)
- Vite & Linter Config
- Matriz Probatoria & Casos
- App Shell & Casos List
- Directorio Clientes & Drive
- Oxlint Rules
- Agenda, Tareas & Asistente
- Dashboard & Parte Diario

## God Nodes (most connected - your core abstractions)
1. `MOCK_CASOS` - 14 edges
2. `react` - 13 edges
3. `MotorDiferencialOJV` - 9 edges
4. `registrar_log()` - 8 edges
5. `LexControlFileHandler` - 7 edges
6. `CalculadoraTerminos()` - 6 edges
7. `integrarExpedienteIA()` - 6 edges
8. `REAL_DISK_DATA` - 6 edges
9. `esFeriado()` - 6 edges
10. `formatearFechaEs()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `AgendaPlazos()` --references--> `MOCK_CASOS`  [EXTRACTED]
  src/components/AgendaPlazos.jsx → src/mockData.js
- `AsistenteProactivo()` --calls--> `integrarExpedienteIA()`  [EXTRACTED]
  src/components/AsistenteProactivo.jsx → src/mockData.js
- `AsistenteProactivo()` --references--> `MOCK_CASOS`  [EXTRACTED]
  src/components/AsistenteProactivo.jsx → src/mockData.js
- `CalculadoraTerminos()` --calls--> `calcularPlazoCPC()`  [EXTRACTED]
  src/components/CalculadoraTerminos.jsx → src/utils/plazosChile.js
- `CalculadoraTerminos()` --calls--> `calcularPlazoCPP()`  [EXTRACTED]
  src/components/CalculadoraTerminos.jsx → src/utils/plazosChile.js

## Import Cycles
- None detected.

## Communities (15 total, 0 thin omitted)

### Community 0 - "Package Dependencies (React)"
Cohesion: 0.12
Nodes (16): lucide-react, dependencies, lucide-react, react, react-dom, name, private, scripts (+8 more)

### Community 1 - "Motor OJV Diferencial"
Cohesion: 0.27
Nodes (5): MotorDiferencialOJV, OPCIÓN A: Abre Chromium en modo VISIBLE en el escritorio del abogado. Permite…, Conexión HTTP/JavaScript real usando Chromium Headless contra pjud.cl con…, Lee .pjud_config.json para obtener RUT, Clave y ajustes de conexión., registrar_log()

### Community 2 - "Local Server (LexControl)"
Cohesion: 0.27
Nodes (5): BaseHTTPRequestHandler, analizar_con_gemini(), extraer_metadatos_forenses_pdf(), LexControlFileHandler, procesar_excel_pjud()

### Community 3 - "Calculadora Términos (Plazos)"
Cohesion: 0.47
Nodes (10): CalculadoraTerminos(), calcularPlazoCPC(), calcularPlazoCPP(), calcularPlazoLaboralAdmin(), CATALOGO_PLAZOS, esDomingo(), esFeriado(), esInhabilCPC() (+2 more)

### Community 4 - "Vite & Linter Config"
Cohesion: 0.18
Nodes (11): oxlint, devDependencies, oxlint, @types/react, @types/react-dom, vite, @vitejs/plugin-react, @types/react (+3 more)

### Community 5 - "Matriz Probatoria & Casos"
Cohesion: 0.24
Nodes (7): MatrizProbatoria(), MOCK_MATRIZ_PROBATORIA, REAL_CASO_TEMUCO, savedAudiencias, savedIACasos, savedPlazos, PJUD_CASOS

### Community 6 - "App Shell & Casos List"
Cohesion: 0.39
Nodes (5): react, App(), CasosList(), Sidebar(), MOCK_STATS

### Community 7 - "Directorio Clientes & Drive"
Cohesion: 0.33
Nodes (5): CasoDetailModal(), DirectorioClientes(), SmartDriveSorter(), MOCK_CLIENTES, REAL_DISK_DATA

### Community 8 - "Oxlint Rules"
Cohesion: 0.25
Nodes (7): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, warn

### Community 9 - "Agenda, Tareas & Asistente"
Cohesion: 0.43
Nodes (6): AgendaPlazos(), AsistenteProactivo(), DEFAULT_TAREAS, integrarExpedienteIA(), MOCK_CASOS, MOCK_PLAZOS_FATALES

### Community 10 - "Dashboard & Parte Diario"
Cohesion: 0.50
Nodes (3): Dashboard(), MOCK_AUDIENCIAS_HOY_SEMANA, PARTE_DIARIO_OJV

## Knowledge Gaps
- **24 isolated node(s):** `$schema`, `oxc`, `react/rules-of-hooks`, `warn`, `name` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Shell & Casos List` to `Calculadora Términos (Plazos)`, `Matriz Probatoria & Casos`, `Directorio Clientes & Drive`, `Oxlint Rules`, `Agenda, Tareas & Asistente`, `Dashboard & Parte Diario`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `plugins` connect `Oxlint Rules` to `App Shell & Casos List`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Vite & Linter Config` to `Package Dependencies (React)`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `$schema`, `oxc`, `react/rules-of-hooks` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Dependencies (React)` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._