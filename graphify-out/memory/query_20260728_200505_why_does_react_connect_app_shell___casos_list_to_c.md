---
type: "query"
date: "2026-07-28T20:05:05.997062+00:00"
question: "Why does react connect App Shell & Casos List to Calculadora Términos (Plazos), Matriz Probatoria & Casos, Directorio Clientes & Drive, Oxlint Rules, Agenda, Tareas & Asistente, Dashboard & Parte Diario?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["ref_react"]
---

# Q: Why does react connect App Shell & Casos List to Calculadora Términos (Plazos), Matriz Probatoria & Casos, Directorio Clientes & Drive, Oxlint Rules, Agenda, Tareas & Asistente, Dashboard & Parte Diario?

## Answer

The react node is imported by every single component in the application (like AgendaPlazos.jsx, CalculadoraTerminos.jsx, Dashboard.jsx, etc.). Since these components are categorized into separate communities based on their domain logic, the shared dependency on the React library acts as a universal bridge across all modules. Furthermore, the react node connects to plugins via .oxlintrc.json, linking the runtime library directly to the static analysis rules.

## Outcome

- Signal: useful

## Source Nodes

- ref_react