import sys

def check_brackets(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    stack = []
    
    for i, line in enumerate(lines):
        for j, char in enumerate(line):
            if char in '{[(':
                stack.append((char, i+1, j+1))
            elif char in '}])':
                if not stack:
                    print(f"Unmatched closing {char} at line {i+1} col {j+1}")
                    return
                last_char, last_line, last_col = stack.pop()
                expected = {'{': '}', '[': ']', '(': ')'}[last_char]
                if char != expected:
                    print(f"Mismatched closing {char} at line {i+1} col {j+1}. Expected {expected} to close {last_char} from line {last_line} col {last_col}")
                    return

    if stack:
        print("Unclosed brackets:")
        for char, line, col in stack:
            print(f"{char} at line {line} col {col}")
    else:
        print("Brackets match!")

check_brackets('src/components/CasoDetailModal.jsx')
