#!/usr/bin/env bash
# Teste de ponta a ponta da API de conectividade (PROJECT_CONTEXT.md §80). Só LÊ: não cria nada.
# Uso:   export PRICETAX_TOKEN='pxk_…'   (gerado em Meu perfil › Conectar)
#        bash docs/testar-conectividade.sh
# Opcional: PRICETAX_URL (padrão https://painel.pricetax.com.br). O token nunca é impresso.
set -u
URL="${PRICETAX_URL:-https://painel.pricetax.com.br}"
if [ -z "${PRICETAX_TOKEN:-}" ]; then echo "Defina PRICETAX_TOKEN antes (export PRICETAX_TOKEN='pxk_…')."; exit 2; fi

call() { # $1 = caminho; grava o corpo em /tmp/_pxk_body e devolve o status
  curl -s -o /tmp/_pxk_body -w "%{http_code}" -H "Authorization: Bearer $PRICETAX_TOKEN" "$URL/api/connect/$1"
}
show() { python3 - "$1" <<'PY'
import json, sys
try:
    d = json.load(open('/tmp/_pxk_body'))
except Exception:
    print('   (resposta não é JSON)'); sys.exit()
what = sys.argv[1]
if what == 'me':
    print('   dono:', d.get('name'), '| papel:', d.get('role'), '| token:', d.get('tokenName'), '| escopo:', d.get('scopeLabel'), '| hoje:', d.get('today'), '| vence:', str(d.get('expiresAt'))[:10])
elif what == 'activities':
    print('   total:', d.get('total'), '| primeiras:', [a.get('title','')[:40] for a in d.get('activities', [])[:3]])
elif what == 'companies':
    c = d.get('companies', [])
    print('   empresas:', d.get('total'), '| primeiras:', [x.get('name','')[:30] for x in c[:3]])
elif what == 'company':
    print('   equipe:', len(d.get('team', [])), '| fases:', len(d.get('phases', [])), '| atividades:', len(d.get('activities', [])), '| reuniões:', len(d.get('meetings', [])))
elif what == 'meeting':
    print('   reunião:', str(d.get('title'))[:50], '| resumo:', 'sim' if d.get('summary') else 'não', '| itens de ação:', len(d.get('actionItems', [])))
elif what == 'agenda':
    print('   Google conectado:', d.get('connected'), '| compromissos:', len(d.get('events', [])))
else:
    print('  ', str(d)[:200])
PY
}

fail=0
check() { # $1 = rótulo, $2 = caminho, $3 = status esperado, $4 = tipo de resumo
  code=$(call "$2")
  if [ "$code" = "$3" ]; then echo "OK   $1 (HTTP $code)"; show "$4"; else echo "FALHA $1: esperado $3, veio $code"; head -c 200 /tmp/_pxk_body; echo; fail=1; fi
}

echo "== API de conectividade em $URL"
check "quem sou eu"              "me"                         200 me
check "atividades abertas"       "activities?status=open&limit=5" 200 activities
check "atividades atrasadas"     "activities?status=overdue"  200 activities
check "atividades de hoje"       "activities?status=today"    200 activities
check "empresas"                 "companies"                  200 companies

# detalhe da 1ª empresa e da 1ª reunião dela, se existirem
cid=$(call companies >/dev/null; python3 -c "import json;c=json.load(open('/tmp/_pxk_body')).get('companies',[]);print(c[0]['id'] if c else '')" 2>/dev/null)
if [ -n "$cid" ]; then
  check "detalhe da 1ª empresa" "companies/$cid" 200 company
  mid=$(call "companies/$cid" >/dev/null; python3 -c "import json;m=json.load(open('/tmp/_pxk_body')).get('meetings',[]);print(m[0]['id'] if m else '')" 2>/dev/null)
  if [ -n "$mid" ]; then check "1ª reunião dela" "companies/$cid/meetings/$mid" 200 meeting; else echo "--   a 1ª empresa não tem reuniões (nada a testar)"; fi
else
  echo "--   nenhuma empresa visível para este usuário (nada a testar)"
fi
check "agenda (3 dias)"          "agenda?days=3"              200 agenda

echo "== Cheques de segurança"
code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/connect/me");                                          [ "$code" = "401" ] && echo "OK   sem token → 401" || { echo "FALHA sem token: $code"; fail=1; }
code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/connect/me?token=$PRICETAX_TOKEN");                    [ "$code" = "401" ] && echo "OK   token na URL é recusado → 401" || { echo "FALHA token na URL: $code"; fail=1; }
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $PRICETAX_TOKEN" "$URL/api/users");   [ "$code" = "401" ] && echo "OK   o token não abre rotas internas (/api/users) → 401" || { echo "FALHA /api/users com token: $code"; fail=1; }
code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/rota-que-nao-existe");                                 [ "$code" = "404" ] && echo "OK   rota inexistente → 404 (JSON)" || { echo "FALHA rota inexistente: $code"; fail=1; }
rm -f /tmp/_pxk_body
[ "$fail" = "0" ] && echo "== TUDO OK" || echo "== HOUVE FALHAS"
exit $fail
