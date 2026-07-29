const babel = require('@babel/core');
const fs = require('fs');
try {
  const code = fs.readFileSync('src/components/CasoDetailModal.jsx', 'utf8');
  babel.transformSync(code, {
    presets: ['@babel/preset-react']
  });
  console.log("Babel parse successful");
} catch(e) {
  console.log(e.message);
}
