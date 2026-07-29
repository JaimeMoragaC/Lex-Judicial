# Graph Report - /home/jaime/Descargas/lex-control-casos  (2026-07-26)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 113 nodes · 195 edges · 15 communities (14 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- package.json
- MotorDiferencialOJV
- CalculadoraTerminos.jsx
- devDependencies
- LexControlFileHandler
- App.jsx
- mockData.js
- .oxlintrc.json
- DirectorioClientes.jsx
- MOCK_CASOS
- Dashboard.jsx

## God Nodes (most connected - your core abstractions)
1. `react` - 13 edges
2. `MOCK_CASOS` - 11 edges
3. `MotorDiferencialOJV` - 9 edges
4. `registrar_log()` - 8 edges
5. `LexControlFileHandler` - 6 edges
6. `CalculadoraTerminos()` - 6 edges
7. `esFeriado()` - 6 edges
8. `formatearFechaEs()` - 6 edges
9. `calcularPlazoCPC()` - 6 edges
10. `calcularPlazoCPP()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `AsistenteProactivo()` --references--> `MOCK_CASOS`  [EXTRACTED]
  src/components/AsistenteProactivo.jsx → src/mockData.js
- `CalculadoraTerminos()` --calls--> `calcularPlazoCPC()`  [EXTRACTED]
  src/components/CalculadoraTerminos.jsx → src/utils/plazosChile.js
- `CalculadoraTerminos()` --calls--> `calcularPlazoCPP()`  [EXTRACTED]
  src/components/CalculadoraTerminos.jsx → src/utils/plazosChile.js
- `CalculadoraTerminos()` --calls--> `calcularPlazoLaboralAdmin()`  [EXTRACTED]
  src/components/CalculadoraTerminos.jsx → src/utils/plazosChile.js
- `CalculadoraTerminos()` --calls--> `formatearFechaEs()`  [EXTRACTED]
  src/components/CalculadoraTerminos.jsx → src/utils/plazosChile.js

## Import Cycles
- None detected.

## Communities (15 total, 1 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.12
Nodes (16): lucide-react, dependencies, lucide-react, react, react-dom, name, private, scripts (+8 more)

### Community 1 - "MotorDiferencialOJV"
Cohesion: 0.27
Nodes (5): MotorDiferencialOJV, OPCIÓN A: Abre Chromium en modo VISIBLE en el escritorio del abogado.         Pe, Conexión HTTP/JavaScript real usando Chromium Headless contra pjud.cl con Perfil, Lee .pjud_config.json para obtener RUT, Clave y ajustes de conexión., registrar_log()

### Community 2 - "CalculadoraTerminos.jsx"
Cohesion: 0.47
Nodes (10): CalculadoraTerminos(), calcularPlazoCPC(), calcularPlazoCPP(), calcularPlazoLaboralAdmin(), CATALOGO_PLAZOS, esDomingo(), esFeriado(), esInhabilCPC() (+2 more)

### Community 3 - "devDependencies"
Cohesion: 0.18
Nodes (11): oxlint, devDependencies, oxlint, @types/react, @types/react-dom, vite, @vitejs/plugin-react, @types/react (+3 more)

### Community 4 - "LexControlFileHandler"
Cohesion: 0.31
Nodes (3): BaseHTTPRequestHandler, LexControlFileHandler, procesar_excel_pjud()

### Community 5 - "App.jsx"
Cohesion: 0.39
Nodes (5): react, App(), CasosList(), Sidebar(), MOCK_STATS

### Community 6 - "mockData.js"
Cohesion: 0.31
Nodes (5): MOCK_AUDIENCIAS_HOY_SEMANA, MOCK_CLIENTES, MOCK_PLAZOS_FATALES, REAL_CASO_TEMUCO, PJUD_CASOS

### Community 7 - ".oxlintrc.json"
Cohesion: 0.25
Nodes (7): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, warn

### Community 8 - "DirectorioClientes.jsx"
Cohesion: 0.36
Nodes (3): CasoDetailModal(), DirectorioClientes(), REAL_DISK_DATA

### Community 9 - "MOCK_CASOS"
Cohesion: 0.40
Nodes (3): AsistenteProactivo(), MOCK_CASOS, MOCK_MATRIZ_PROBATORIA

## Knowledge Gaps
- **21 isolated node(s):** `$schema`, `oxc`, `react/rules-of-hooks`, `warn`, `name` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.jsx` to `CalculadoraTerminos.jsx`, `mockData.js`, `.oxlintrc.json`, `DirectorioClientes.jsx`, `MOCK_CASOS`, `Dashboard.jsx`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `plugins` connect `.oxlintrc.json` to `App.jsx`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `$schema`, `oxc`, `react/rules-of-hooks` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._