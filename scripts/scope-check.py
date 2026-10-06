#!/usr/bin/env python3
"""Erros de escopo que o `vite build` NÃO pega (já causaram tela quebrada em produção local, §81).
  1. Componente JSX usado sem import/definição (ex.: <Button> sem import em App.jsx).
  2. Uso de variável no corpo de AppScreens ANTES da declaração `const` (TDZ: "Cannot access 'x' before initialization").
Uso: python3 scripts/scope-check.py   (sai com 1 se achar algo). Heurística por regex; falsos positivos conhecidos: `Icon` desestruturado
em src/crm/CrmScreen.jsx e src/xflow/XFlow.jsx."""
import re, glob, sys
bad = 0
for f in sorted(glob.glob('src/**/*.jsx', recursive=True)):
    s = open(f, encoding='utf-8').read()
    for t in sorted(set(re.findall(r'<([A-Z][A-Za-z0-9_]*)\b', s))):
        if not re.search(r'(import[^;]*\b' + t + r'\b|function ' + t + r'\b|const ' + t + r'\b|class ' + t + r'\b|\{[^}]*\b' + t + r'\b[^}]*\}\s*=|as ' + t + r'\b)', s):
            if t == 'Icon' and f in ('src/crm/CrmScreen.jsx', 'src/xflow/XFlow.jsx'):  # `icon: Icon` / `[k, l, Icon]` desestruturados
                continue
            print(f'JSX sem import/definição: {f} <{t}>'); bad += 1
L = open('src/App.jsx', encoding='utf-8').read().split('\n')
start = next(i for i, l in enumerate(L) if l.startswith('function AppScreens'))
end = next(i for i in range(start + 1, len(L)) if L[i] == '}')
decl = {}
for i in range(start + 1, end):
    m = re.match(r'  const (?:\[([^\]]+)\]|(\w+)) =', L[i])
    if m:
        for n in [n.strip() for n in (m.group(1) or m.group(2)).split(',')]:
            if n and n not in decl:
                decl[n] = i
for n, di in decl.items():
    for i in range(start + 1, di):
        l = L[i]
        if re.match(r'  [^ /}]', l) and not re.match(r'  (async )?function ', l) and not l.lstrip().startswith('//') and re.search(r'\b' + re.escape(n) + r'\b', re.sub(r'//.*$', '', l)):
            print(f'TDZ: {n} usado na linha {i + 1}, declarado na {di + 1}: {l.strip()[:80]}'); bad += 1; break
print('scope-check:', 'OK' if not bad else f'{bad} problema(s)')
sys.exit(1 if bad else 0)
