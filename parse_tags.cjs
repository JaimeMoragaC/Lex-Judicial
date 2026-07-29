const fs = require('fs');
const code = fs.readFileSync('src/components/CasoDetailModal.jsx', 'utf8');

// Simplified JSX tag counter
const tagRegex = /<\/?([a-zA-Z0-9_-]+)(?:[^>]*?)(\/?)>/g;
const stack = [];

let match;
while ((match = tagRegex.exec(code)) !== null) {
  const isClosing = match[0].startsWith('</');
  const isSelfClosing = match[2] === '/';
  const tagName = match[1];

  if (isSelfClosing) continue;

  if (isClosing) {
    if (stack.length === 0) {
      console.log(`Extra closing tag: ${tagName} at index ${match.index}`);
    } else {
      const top = stack.pop();
      if (top !== tagName) {
        console.log(`Mismatched closing tag! Expected ${top}, found ${tagName} at index ${match.index}`);
      }
    }
  } else {
    stack.push(tagName);
  }
}

if (stack.length > 0) {
  console.log("Unclosed tags:", stack);
} else {
  console.log("All tags closed.");
}
