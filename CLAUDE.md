# CLAUDE.md — Instruções permanentes (PRICETAX Cronograma)

Antes de qualquer tarefa nova, siga esta ordem:

1. **Leia primeiro `CLAUDE.md`** (este arquivo) **e `PROJECT_CONTEXT.md`**
   (raiz) — memória técnica oficial: arquitetura, banco, deploy, regras de
   negócio, decisões, bugs já resolvidos, pendências.
2. Consulte código **só das áreas relacionadas à tarefa** — use
   `docs/PROJECT_MAP.md` para localizar componente/função por linha em
   `src/App.jsx` antes de abrir o arquivo.
3. **Não refaça uma varredura completa do projeto** sem necessidade — os
   dois arquivos acima existem exatamente pra evitar isso.
4. Reutilize o conhecimento já documentado em vez de redescobrir.
5. **Atualize a documentação** (`PROJECT_CONTEXT.md` e/ou
   `docs/PROJECT_MAP.md`) sempre que uma alteração mudar arquitetura, regra
   de negócio, infraestrutura ou comportamento relevante — na mesma sessão.
6. Evite carregar arquivos grandes ou módulos não relacionados no contexto
   (`src/App.jsx` tem ~3.200 linhas; telas pesadas em `src/screens/`, ações em `src/app/`, estilos `S` em `src/styles/S.js` — leia com `offset`/`limit` ou `grep`,
   nunca o arquivo inteiro sem motivo). Comece pelo **§0 do `PROJECT_CONTEXT.md`**
   (mapa dos módulos, endereços, acessos e linha do tempo) para saber onde fica cada coisa.
7. Investigue progressivamente: **documentação → arquivos relacionados →
   dependências necessárias**. Só amplie a busca (`grep` livre / Explore
   agent) se os dois documentos não cobrirem o que você precisa.
8. **Nunca assuma que a documentação está correta se o código mostrar o
   contrário** — o código é sempre a fonte da verdade. Nesse caso, corrija a
   documentação antes de seguir.

## Stack (resumo — detalhes em `PROJECT_CONTEXT.md`)

React 19 + Vite 8 (`src/App.jsx` + módulos em `src/*/`) · Express 5/Node ESM (`server/`)
· Postgres via `pg`, sem ORM · JWT+bcrypt · IA Anthropic (+ Voyage para embeddings) ·
Railway (deploy automático em push na `main`). Working dir local **não é** repo git —
deploy é fetch/rsync/build/commit/push num clone separado. **Política vigente (Rafael,
2026-08-25, reafirmada): commit + push sem pedir confirmação a cada vez**, depois de
`git fetch` e checar divergência, e **verificando em produção em seguida**. (O texto
antigo "sempre confirmar antes do push" foi superado por essa instrução; o detalhe
está em `PROJECT_CONTEXT.md` §3.)

## Comandos

```bash
npm run dev       # vite + node --watch server/index.js, :5173 (proxy /api -> :3001)
npm run build     # vite build -> dist/ (+ move os sourcemaps para .sourcemaps/, fora da pasta pública)
npm run preview   # serve dist/ localmente
npm start         # produção: node server/index.js
```

Sem test runner/linter configurado — verificação = `npm run build` limpo +
testes descartáveis (Node para lógica pura, HTTP real contra o Postgres local, conferência
no browser). O que não deu para testar de verdade (IA real, aparelho real, OAuth real) deve
ser dito como **não testado** e entrar na §15 do `PROJECT_CONTEXT.md`.

## Arquivos que NÃO devem ser mexidos sem necessidade explícita

- `package-lock.json` — não editar manualmente.
- `dist/` e `.sourcemaps/` — gerados, nunca editar à mão nem commitar (os sourcemaps são só do servidor, para o log de erros; nunca servir ao público).
- `.env` — segredos locais, nunca commitar.
- `server/db.js` (schema SQL) — sensível, afeta produção; só mexa se a
  tarefa pedir explicitamente um campo relacional novo (não JSONB).

## Padrões de código

- Sem comentários desnecessários; sem abstração prematura.
- Lista completa de padrões obrigatórios (mutação de estado, soft delete,
  CSS/tema, mobile, autorização por `org_id`) está em `PROJECT_CONTEXT.md`
  §16 — não duplicar aqui.

Antes de alterar qualquer funcionalidade, **abra e confira os arquivos
envolvidos** — a documentação localiza e dá contexto, não substitui ler o
código antes de mudar algo.

## Operar o CRM de produção (autorização permanente do Rafael, 2026-10-25)

O Rafael autorizou de forma **permanente** que o Claude Code **crie, edite, mova, exclua e registre** no CRM de produção (empresas, contatos,
negócios, atividades, notas, produtos, funis, etapas, cadências, visões) sempre que a tarefa pedir — **sem pedir confirmação a cada gravação**.
Ele quer tudo registrado como Claude Code; o que ele NÃO quer é ficar sem registro.

- **Canal único:** a chave `crm_operate` da API de conectividade → `{PRICETAX_URL}/api/connect/crm/…` (mesmas rotas e regras de `/api/crm`;
  `PRICETAX_URL` e `PRICETAX_CRM_TOKEN` ficam no `.env`, nunca na conversa, em commit ou em log). **Não** use a sessão do navegador do Rafael
  (cookie), nem SQL direto em produção, para gravar no CRM. Leitura de apoio pode usar o navegador, mas a escrita vai pela chave.
  ```bash
  export $(grep -E '^PRICETAX_(URL|CRM_TOKEN)=' .env | xargs)   # não use `. ./.env`: há linha com espaço sem aspas
  curl -s "$PRICETAX_URL/api/connect/crm/pipelines" -H "Authorization: Bearer $PRICETAX_CRM_TOKEN"
  curl -s -X POST "$PRICETAX_URL/api/connect/crm/cadences" -H "Authorization: Bearer $PRICETAX_CRM_TOKEN" -H "Content-Type: application/json" -d '{…}'
  ```
- **Registro (automático, não dá para esquecer):** auditoria, linha do tempo, histórico de etapas e autor da nota saem como
  **"Claude Code"** (usuário dedicado) ou **"Claude Code (por Rafael Souza)"** (chave dele); cada gravação entra em `api_token_actions` (Meu perfil › Conectar mostra as últimas).
- **Como trabalhar:** descreva o que vai gravar em uma linha, grave, **leia de volta** para provar o resultado e diga o que mudou. Se a gravação
  for em massa (mais de ~20 registros), faça primeiro uma prévia (contagem + 3 exemplos) e grave em lotes.
- **Continua fora do alcance da chave (de propósito):** escrita da migração do PipeRun (só pela tela); excluir de verdade (a chave só faz exclusão
  lógica, como a tela); criar/alterar usuários, senhas, permissões e tokens (são do Rafael); qualquer coisa fora do CRM.
- Se o harness recusar uma ação mesmo assim, **pare e explique**; não contorne (navegador, SQL, outro caminho). A regra de permissão é do Rafael:
  `PROJECT_CONTEXT.md` §99 traz as linhas para ele liberar.

