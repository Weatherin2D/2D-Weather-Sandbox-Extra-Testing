from pathlib import Path
b = Path('shaders/fragment/boundaryShader.frag').read_text().splitlines()
c = Path('shaders/common.glsl').read_text().splitlines()
out=[]
for line in b:
    if line.strip() == '#include "common.glsl"':
        out.extend(c)
    else:
        out.append(line)
stack=[]
for i,line in enumerate(out, start=1):
    for ch in line:
        if ch == '{':
            stack.append((i,line))
        elif ch == '}':
            if stack:
                stack.pop()
            else:
                print('unmatched close', i, line)
print('unmatched opens', len(stack))
for lineno,line in stack:
    print('open at', lineno, line)
