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
   (`src/App.jsx` tem ~9.900 linhas — leia com `offset`/`limit` ou `grep`,
   nunca o arquivo inteiro sem motivo). Comece pelo **§0 do `PROJECT_CONTEXT.md`**
   (mapa dos módulos, endereços, acessos e linha do tempo) para saber onde fica cada coisa.
7. Investigue progressivamente: **documentação → arquivos relacionados →
   dependências necessárias**. Só amplie a busca (`grep` livre / Explore
   agent) se os dois documentos não cobrirem o que você precisa.
8. **Nunca assuma que a documentação está correta se o código mostrar o
   contrário** — o código é sempre a fonte da verdade. Nesse caso, corrija a
   documentação antes de seguir.

## Stack (resumo — detalhes em `PROJECT_CONTEXT.md`)

React 18 + Vite (`src/App.jsx` + módulos em `src/*/`) · Express/Node ESM (`server/`)
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
npm run build     # vite build -> dist/
npm run preview   # serve dist/ localmente
npm start         # produção: node server/index.js
```

Sem test runner/linter configurado — verificação = `npm run build` limpo +
testes descartáveis (Node para lógica pura, HTTP real contra o Postgres local, conferência
no browser). O que não deu para testar de verdade (IA real, aparelho real, OAuth real) deve
ser dito como **não testado** e entrar na §15 do `PROJECT_CONTEXT.md`.

## Arquivos que NÃO devem ser mexidos sem necessidade explícita

- `package-lock.json` — não editar manualmente.
- `dist/` — gerado, nunca editar à mão nem commitar mudança manual.
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
