import re

with open('c:/Users/HP/Documents/15market/15market/src/components/CustomChart.jsx', 'r') as f:
    content = f.read()

tags = []
for m in re.finditer(r'<(div|motion\.div|AnimatePresence)(\s+[^>]*[^/])?>|</(div|motion\.div|AnimatePresence)>', content):
    if m.group(1):
        tags.append({'type': m.group(1), 'open': True, 'pos': m.start()})
    else:
        tags.append({'type': m.group(3), 'open': False, 'pos': m.start()})

stack = []
errors = 0
for i, tag in enumerate(tags):
    if tag['open']:
        stack.append(tag)
    else:
        if not stack:
            line = content.count('\n', 0, tag['pos']) + 1
            print(f"Stray closing tag </{tag['type']}> at line {line}")
            errors += 1
        else:
            last = stack.pop()
            if last['type'] != tag['type']:
                line_open = content.count('\n', 0, last['pos']) + 1
                line_close = content.count('\n', 0, tag['pos']) + 1
                print(f"Mismatch! Opened <{last['type']}> (line {line_open}), closed </{tag['type']}> (line {line_close}) at pos {tag['pos']}")
                errors += 1

for tag in stack:
    line = content.count('\n', 0, tag['pos']) + 1
    print(f"Unclosed tag <{tag['type']}> at line {line}")
    errors += 1

if errors == 0:
    print("SUCCESS: ALL JSX TAGS BALANCED!")
else:
    print(f"FAILED: Found {errors} errors")
