# PRICETAX — painel de trabalho (Cronograma de Reforma Tributária)

O painel (https://painel.pricetax.com.br) é o ecossistema de trabalho da PRICETAX: cada pessoa entra, vê o seu dia
(mensagem do dia, agenda, atividades) e abre o módulo de que precisa.

| Módulo | Endereço | Para quê |
|---|---|---|
| Gestão de Atividades | `/gestao-atividades` | quadro pessoal (Kanban), indicadores de abertura/encerramento |
| Empresas | `/empresas` | cronogramas da Reforma Tributária por cliente, reuniões, atividades |
| XFlow | `/xflow` | BUGs e TASKs do time de desenvolvimento |
| Agenda | `/agenda` | disponibilidade e compromissos (Google Calendar + XFlow + atividades) |
| Visão Geral Empresas | `/visao-geral` | cronograma consolidado de todas as empresas |
| Conhecimento | `/conhecimento` | o que a RENATA (assistente de IA) sabe, com origem e conflitos |
| Pareceres | `/pareceres` | repositório de pareceres técnicos; a RENATA estuda e sugere nas reuniões |
| Modelos de documentos | `/modelos` | modelos com vários anexos (Word, Excel, PDF, HTML) e links com prévia |
| CRM | `/crm` | empresas, contatos, negócios e funis |
| Gestão de Usuários | `/usuarios` | contas, acessos e auditoria (só administrador) |

Também: **Meu perfil** (avatar, senha, **Meu dia**, agenda, widget do iPhone), boas-vindas na primeira entrada e o widget do iPhone (Scriptable).

## Stack

React 18 + Vite · Express (Node, ESM) · PostgreSQL via `pg` (sem ORM) · autenticação JWT em cookie + bcrypt ·
IA Anthropic (+ Voyage para busca semântica) · Google Calendar · deploy no Railway (automático a cada push na `main`).

## Rodando localmente

```bash
npm install
# variáveis mínimas: DATABASE_URL, JWT_SECRET (e SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD no primeiro boot)
npm run dev      # vite + servidor com --watch; app em :5173, API em :3001 (defina PORT=3001)
npm run build    # gera dist/
npm start        # produção: um processo Node serve dist/ e a API
```

Lista completa de variáveis de ambiente, tabelas e rotas: `PROJECT_CONTEXT.md` (§4, §5, §8).

## Documentação

- `PROJECT_CONTEXT.md` — memória técnica oficial: arquitetura, banco, deploy, regras de negócio, decisões, bugs já resolvidos e pendências. **Comece pelo §0.**
- `docs/PROJECT_MAP.md` — onde está cada componente/função (com linhas) e a estrutura de diretórios.
- `CLAUDE.md` — regras de trabalho e padrões de código.
- `docs/` — responsividade, auditoria visual, RENATA (brief, cobertura, eval) e estudo de integração via Telegram.
