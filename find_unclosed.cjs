const fs = require('fs');

const text = fs.readFileSync('src/components/CasoDetailModal.jsx', 'utf8');
const stack = [];
const regex = /<\/?([A-Za-z0-9_-]+)([^>]*?)\/?>/g;
let match;
while ((match = regex.exec(text)) !== null) {
  const isClosing = match[0].startsWith('</');
  const isSelfClosing = match[0].endsWith('/>');
  const tagName = match[1];

  // Skip self-closing and self-evident empty tags
  if (isSelfClosing) continue;

  if (isClosing) {
    if (stack.length > 0) {
      const top = stack.pop();
      if (top.tag !== tagName) {
        console.log(`Mismatch! Expected </${top.tag}> (from line ${top.line}), but found </${tagName}> at index ${match.index}`);
        break;
      }
    } else {
      console.log(`Extra closing tag </${tagName}> at index ${match.index}`);
    }
  } else {
    // calculate line number
    const line = text.substring(0, match.index).split('\n').length;
    stack.push({ tag: tagName, line: line });
  }
}

console.log("Unclosed tags remaining in stack:");
for (const s of stack) {
  console.log(`<${s.tag}> from line ${s.line}`);
}
