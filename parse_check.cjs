const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');

const Parser = acorn.Parser.extend(jsx());
const content = fs.readFileSync('src/components/CasoDetailModal.jsx', 'utf8');

try {
  Parser.parse(content, { sourceType: 'module', ecmaVersion: 2020 });
  console.log("No syntax errors found by acorn-jsx.");
} catch (e) {
  console.log("Syntax error at line", e.loc.line, "col", e.loc.column);
  console.log("Error:", e.message);
}
