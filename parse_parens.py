import re

with open('src/components/CasoDetailModal.jsx', 'r') as f:
    text = f.read()

text = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', '""', text)
text = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", "''", text)
text = re.sub(r'`[^`]*`', '``', text)
text = re.sub(r'//.*', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
text = re.sub(r'\{/\*.*?\*/\}', '', text, flags=re.DOTALL)

stack = []
for i, line in enumerate(text.split('\n')):
    for j, char in enumerate(line):
        if char == '(':
            stack.append((char, i+1))
        elif char == ')':
            if not stack:
                print(f"EXTRA ) at line {i+1}")
            else:
                stack.pop()

if stack:
    print(f"Unclosed (: {len(stack)} remaining")
else:
    print("All ( ) matched perfectly!")
