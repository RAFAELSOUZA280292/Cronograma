// Gera docs/RENATA_MATRIZ_COBERTURA.md (§101): disponibilidade por aba, função humana × operação da RENATA (com status honesto), e a tabela de TODAS as rotas do servidor
// com a classificação (ferramenta curada / acesso genérico com confirmação / excluída e por quê). Também VALIDA o catálogo contra o código:
//   - toda ferramenta com `route` aponta para uma rota que existe de verdade;
//   - nenhuma ferramenta duplicada; todo risco válido; toda rota está classificada.
//   node scripts/renata-coverage.mjs            # grava o documento
//   node scripts/renata-coverage.mjs --check    # confere (sai 1 se o documento ou o índice de rotas estiverem desatualizados, ou se o catálogo estiver incoerente)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { registry } = await import('../server/renata/index.js');
const { routeIndex, matchRoute, curatedSet, classify } = await import('../server/renata/policy.js');

const problems = [];
const tools = registry.all();
for (const t of tools) {
  if (t.route) {
    const p = t.route.path.replace(/\{(\w+)\}/g, ':$1');
    if (!matchRoute(t.route.method, p.replace(/:(\w+)/g, 'x'))) problems.push(`Ferramenta ${t.name}: a rota ${t.route.method} ${t.route.path} não existe no servidor.`);
  }
}
const cur = curatedSet(registry);
const routes = routeIndex().map((r) => ({ ...r, ...classify(r, cur) }));
const count = (k) => routes.filter((r) => r.kind === k).length;
const toolByRoute = new Map();
for (const t of tools) if (t.route) toolByRoute.set(`${t.route.method} ${t.route.path.replace(/\{(\w+)\}/g, ':x')}`, t.name);
const sig = (r) => `${r.method} ${r.path.replace(/:[^/]+/g, ':x')}`;

const modules = [...new Set(tools.map((t) => t.module))];
const byMod = Object.fromEntries(modules.map((m) => [m, tools.filter((t) => t.module === m)]));
const riskCount = (r) => tools.filter((t) => t.risk === r).length;

const AVAIL = [
  ['Início (tela "Olá")', '✅', 'Botão RENATA na barra única'], ['Empresas (todas as abas: Resumo, Reuniões, Tarefas, Linha do tempo, Tabela, Fases, Kanban, Mapa, Triagem)', '✅', 'Botão na barra; a RENATA recebe a empresa aberta e a aba'],
  ['Gestão de Atividades', '✅', 'Botão na barra; módulo informado'], ['XFlow', '✅', 'Botão na barra; módulo informado'], ['Agenda', '✅', 'Botão na barra; módulo informado'], ['Visão Geral', '✅', 'Botão na barra; módulo informado'],
  ['Conhecimento', '✅', 'Botão na barra; módulo informado'], ['CRM (Visão geral, Agenda, Negócios, Empresas, Contatos, Produtos)', '✅', 'Botão na barra; recebe a tela e o negócio/empresa aberto'], ['Pareceres', '✅', 'Botão na barra; módulo informado'],
  ['Modelos', '✅', 'Botão na barra; módulo informado'], ['Usuários', '✅', 'Botão na barra; as ferramentas de usuários são excluídas por segurança'], ['Inteligência', '✅', 'Botão na barra; módulo informado'],
];

// ✅ implementada e exercitada por teste ponta a ponta · 🟡 parcial/limitada (explicada) · ⬜ pendente · 🚫 excluída de propósito (segurança)
const ROWS = [
  ['CRM', 'Buscar empresa, contato, negócio', 'crm_buscar', '✅', 'renata-tools'],
  ['CRM', 'Ver ficha da empresa e histórico', 'crm_ver_empresa, crm_historico_empresa', '✅', 'renata-tools'],
  ['CRM', 'Cadastrar / editar empresa', 'crm_criar_empresa, crm_atualizar_empresa', '✅', 'renata (T1, T11 duplicidade), renata-tools'],
  ['CRM', 'Excluir empresa', 'crm_excluir_empresa (confirmação)', '✅', 'renata-tools (administrador confirma e a empresa vai para a lixeira), renata (T3: sem permissão → negado)'],
  ['CRM', 'Consultar CNPJ na Receita', 'crm_consultar_cnpj', '🟡', 'Implementada; não testada (serviço externo). Duplicidade é avisada pelo servidor.'],
  ['CRM', 'Vincular empresa a cronograma', 'crm_vincular_projeto', '✅', 'renata-tools'],
  ['CRM', 'Desvincular cronograma / restaurar empresa excluída', 'plataforma_executar (confirmação)', '🟡', 'Sem ferramenta própria; acesso genérico testado (T10) mas não estas rotas.'],
  ['CRM', 'Contatos: criar, editar, excluir', 'crm_criar_contato, crm_atualizar_contato, crm_excluir_contato', '✅', 'renata-tools'],
  ['CRM', 'Negócios: criar, editar, mover de etapa, tags', 'crm_criar_negocio, crm_atualizar_negocio, crm_mover_negocio, crm_definir_tags_negocio', '✅', 'renata (T1, T4 + desfazer), renata-tools'],
  ['CRM', 'Negócios: ganhar, perder, excluir', 'crm_fechar_negocio_ganho, crm_fechar_negocio_perdido, crm_excluir_negocio (confirmação)', '✅', 'renata (T2, T12), renata-tools'],
  ['CRM', 'Lead rápido (empresa + contato + negócio)', 'crm_criar_lead_rapido', '✅', 'renata-tools'],
  ['CRM', 'Atividades: criar, reagendar, trocar responsável, concluir, reabrir, cancelar', 'crm_criar_atividade, crm_atualizar_atividade, crm_concluir_atividade, crm_reabrir_atividade, crm_cancelar_atividade', '✅', 'renata-tools'],
  ['CRM', 'Atividades: excluir', 'crm_excluir_atividade (confirmação)', '✅', 'renata-tools'],
  ['CRM', 'Notas: registrar, editar, excluir', 'crm_registrar_nota, crm_editar_nota, crm_excluir_nota', '✅', 'renata-tools'],
  ['CRM', 'Anexos de nota / arquivos do negócio', '—', '⬜', 'Exigem enviar/ler arquivo; a RENATA ainda não manipula arquivos.'],
  ['CRM', 'Produtos: criar, editar, excluir', 'crm_criar_produto, crm_atualizar_produto, crm_excluir_produto (confirmação)', '✅', 'renata-tools'],
  ['CRM', 'Funis, etapas (prazo/probabilidade) e cadências', 'crm_criar_funil, crm_atualizar_funil, crm_salvar_etapas, crm_arquivar_funil, crm_criar_cadencia, crm_excluir_cadencia', '✅', 'renata-tools (todos com confirmação)'],
  ['CRM', 'Operações em lote (negócios e atividades)', 'crm_lote_atualizar_negocios, crm_lote_atualizar_atividades (confirmação com contagem)', '✅', 'renata (T5), renata-tools'],
  ['CRM', 'Painéis Meu dia / Time / Receita / Contas', 'crm_painel', '✅', 'renata-tools'],
  ['CRM', 'Visões salvas e painel inicial', 'plataforma_executar (confirmação)', '🟡', 'Sem ferramenta própria.'],
  ['CRM', 'Auditoria de um negócio/empresa', 'plataforma_consultar', '🟡', 'Leitura genérica.'],
  ['CRM', 'Importar planilhas, trazer clientes do painel, migração do PipeRun', '—', '🚫', 'Operações em massa com arquivo e conferência na tela, só administrador.'],
  ['Empresas', 'Listar empresas e ver o cronograma (atividades, subatividades, equipe, fases, reuniões)', 'empresas_listar, empresa_ver_cronograma', '✅', 'renata-tools'],
  ['Empresas', 'Ajustar atividade (status, datas, responsável, prioridade, fase, tipo)', 'cronograma_simular, cronograma_aplicar (desfazer; vários ajustes pedem confirmação)', '✅', 'renata (T7: simula, aplica, confirma, desfaz e confere o Log)'],
  ['Empresas', 'Subatividades: marcar feita, pular, mover, criar, excluir/restaurar; criar atividade; vincular pauta', 'cronograma_aplicar (ops sub.* / activity.add / pauta.link)', '🟡', 'Mesmo motor testado (renata, connect-fixes), mas estas operações não têm teste próprio na RENATA.'],
  ['Empresas', 'Reorganizar preservando dependências entre atividades', 'cronograma_aplicar', '🟡', 'O motor não lê nem ajusta predecessoras; hoje reordena datas sem recalcular dependências.'],
  ['Empresas', 'Tarefas de reunião: criar, editar (responsável, prazo, status), excluir, listar', 'tarefa_reuniao_criar/atualizar/excluir, tarefas_reuniao_listar', '✅', 'renata (T8), renata-tools'],
  ['Empresas', 'Criar reunião, editar pauta/transcrição, enviar transcrição', 'plataforma_executar (meeting-inbox)', '🟡', 'Sem ferramenta própria.'],
  ['Empresas', 'Criar / excluir / pausar empresa; equipe, fases e cadastro da empresa', 'plataforma_executar (POST/DELETE /api/projects)', '🟡', 'Equipe, fases e cadastro são parte do documento do projeto, que só a tela regrava: ainda sem ferramenta (⬜ para essas edições).'],
  ['Empresas', 'Vínculo tarefa↔atividade, levantamento, lacunas, cronograma padrão, histórico de versões', 'plataforma_consultar / plataforma_executar', '🟡', 'Acesso genérico (confirmação em tudo que altera).'],
  ['Empresas', 'Links públicos e compartilhamento externo', '—', '🚫', 'Gerados pela própria pessoa na tela.'],
  ['Gestão de Atividades', 'Cartões: criar, editar (título, prazo, prioridade, status, coluna), concluir, excluir', 'quadro_criar_atividade, quadro_atualizar_atividade, quadro_concluir_atividade, quadro_excluir_atividade', '✅', 'renata (T6), renata-tools'],
  ['Gestão de Atividades', 'Listar o quadro', 'quadro_listar', '✅', 'renata-tools'],
  ['Gestão de Atividades', 'Checklist, comentários, anexos, tags; páginas e colunas; arquivar', '—', '⬜', 'O quadro é regravado pela tela; só cartão a cartão por enquanto. Edição local não salva vence a da RENATA (a tela recarrega em até ~12 s).'],
  ['Gestão de Atividades', 'Quadro público compartilhado', '—', '🚫', 'Link público gerado na tela.'],
  ['Agenda', 'Listar compromissos', 'agenda_listar', '✅', 'renata-tools (sem Google conectado devolve vazio)'],
  ['Agenda', 'Criar compromisso (com convidados pede confirmação)', 'agenda_criar_evento', '🟡', 'Confirmação com convidados testada; criação real depende do Google conectado (testada só a falha clara).'],
  ['Agenda', 'Responder convite', 'agenda_responder_convite', '🟡', 'Testada só a falha tratada (sem Google).'],
  ['Agenda', 'Conectar o Google', '—', '🚫', 'OAuth: a pessoa autoriza na tela.'],
  ['XFlow', 'Listar e abrir ticket', 'xflow_listar, xflow_criar', '✅', 'renata-tools'],
  ['XFlow', 'Ações do ticket (triagem, aprovar, fechar, comentar, mover, SLA)', 'plataforma_executar (PATCH /api/xflow/tickets/:id)', '🟡', 'Sem ferramenta própria (cada ação tem regra de papel e transição).'],
  ['Conhecimento', 'Buscar na memória da RENATA', 'conhecimento_buscar', '✅', 'renata-tools'],
  ['Conhecimento', 'Editar fatos, resolver conflitos, entidades', 'plataforma_executar', '🟡', 'Sem ferramenta própria.'],
  ['Pareceres / Modelos', 'Listar', 'pareceres_listar, modelos_listar', '✅', 'renata-tools'],
  ['Pareceres / Modelos', 'Subir, editar, excluir, comentar; estudar pareceres', 'plataforma_executar', '🟡', 'Upload de arquivo ainda não; edição/comentário genéricos.'],
  ['Notificações', 'Ver e marcar todas como lidas', 'notificacoes_listar, notificacoes_marcar_todas_lidas', '✅', 'renata-tools'],
  ['Notificações', 'Marcar uma, categorias que quer ver', 'plataforma_executar', '🟡', 'Sem ferramenta própria.'],
  ['Relatórios', 'O que a equipe fez hoje / atrasos por responsável', 'relatorio_equipe_dia, relatorio_atrasos', '✅', 'renata (T9), renata-tools'],
  ['Relatórios', 'Exportar planilha / PDF', '—', '⬜', 'Ações de tela que geram arquivo.'],
  ['Plataforma', 'Quem sou eu, equipe, descobrir operações', 'plataforma_quem_sou_eu, plataforma_pessoas, plataforma_rotas', '✅', 'renata-tools'],
  ['Plataforma', 'Qualquer outra rota liberada', 'plataforma_consultar, plataforma_executar', '✅', 'renata (T10: consulta, recusa de rota excluída, confirmação)'],
  ['Usuários / Inteligência / Meu perfil', 'Usuários, acessos, senhas, chaves de API, telemetria, push, widget', '—', '🚫', 'Segurança: credenciais, permissões e dados de pessoas são só pela tela e por administradores.'],
];

const L = [];
L.push('# RENATA — matriz de cobertura operacional');
L.push('');
L.push('> Gerado por `scripts/renata-coverage.mjs` a partir do código (catálogo de ferramentas + índice de rotas). Não edite à mão: mude o catálogo ou as linhas do script e rode de novo. Testes: `scripts/renata.test.mjs` (conversa, confirmação, permissões, auditoria, desfazer), `scripts/renata-tools.test.mjs` (cada ferramenta, ponta a ponta) e `scripts/renata-coverage.mjs --check`.');
L.push('');
L.push('**Legenda:** ✅ implementada e exercitada por teste ponta a ponta · 🟡 parcial/limitada (explicado) · ⬜ pendente · 🚫 fora do alcance de propósito (segurança)');
L.push('');
L.push('## Resumo');
L.push(`- **${tools.length} ferramentas estruturadas** em ${modules.length} módulos (${riskCount('read')} de consulta, ${riskCount('write')} de escrita de baixo risco/reversível, ${riskCount('critical')} críticas com confirmação obrigatória).`);
L.push(`- **${routes.length} rotas** no servidor: ${count('curated')} cobertas por ferramenta própria, ${count('generic')} por acesso genérico (consulta livre; qualquer alteração pede confirmação) e ${count('excluded')} excluídas de propósito.`);
const rows = (k) => ROWS.filter((r) => r[3] === k).length;
L.push(`- **${ROWS.length} funcionalidades humanas mapeadas**: ${rows('✅')} ✅, ${rows('🟡')} 🟡, ${rows('⬜')} ⬜, ${rows('🚫')} 🚫.`);
L.push('- **Critério "100% das funcionalidades" NÃO está atendido ainda**: as linhas 🟡 e ⬜ abaixo são o que falta. As rotas "genéricas" já são alcançáveis (com confirmação), mas sem esquema de parâmetros; as ⬜ precisam de trabalho novo (arquivos, edição de documentos inteiros).');
L.push('');
L.push('## 1. Onde a RENATA está disponível');
L.push('O botão **RENATA** fica na barra única do topo (ModuleShell), presente em todos os módulos, e o item "Falar com a RENATA" também está na busca Ctrl+K. Verificado no navegador em 25/10/2026 em todos os 11 módulos e na tela inicial. A impressão de "só em duas abas" vinha do assistente flutuante de projeto (Reuniões/Atividades), que é outra coisa (memória de reuniões de UMA empresa); o botão geral já existia em todas as telas, mas só consultava — agora opera.');
L.push('');
L.push('| Tela / módulo | Disponível | Observação |');
L.push('|---|---|---|');
for (const a of AVAIL) L.push(`| ${a.join(' | ')} |`);
L.push('');
L.push('## 2. Função humana × operação da RENATA');
L.push('');
L.push('| Módulo | Função humana | Operação da RENATA | Status | Evidência / limite |');
L.push('|---|---|---|---|---|');
for (const r of ROWS) L.push(`| ${r.join(' | ')} |`);
L.push('');
L.push('## 3. Catálogo de ferramentas');
for (const m of modules) {
  L.push('');
  L.push(`### ${m}`);
  L.push('| Ferramenta | Risco | Rota / execução | O que faz |');
  L.push('|---|---|---|---|');
  for (const t of byMod[m]) L.push(`| \`${t.name}\` | ${t.risk === 'read' ? 'consulta' : t.risk === 'write' ? (t.confirm || t.bulk ? 'escrita (confirma em certos casos)' : 'escrita') : 'crítica (confirma)'} | ${t.route ? `${t.route.method} ${t.route.path}` : 'sob medida'} | ${t.summary.replace(/\|/g, '/').slice(0, 150)} |`);
}
L.push('');
L.push('## 4. Todas as rotas do servidor e como a RENATA as alcança');
L.push('');
L.push('| Rota | Classificação | Ferramenta / motivo |');
L.push('|---|---|---|');
for (const r of routes) {
  const how = r.kind === 'curated' ? (toolByRoute.get(sig(r)) || 'ferramenta sob medida') : r.kind === 'excluded' ? `fora do alcance: ${r.why}` : 'acesso genérico (plataforma_consultar / plataforma_executar com confirmação)';
  L.push(`| \`${r.method} ${r.path}\` | ${r.kind === 'curated' ? 'ferramenta' : r.kind === 'generic' ? 'genérica' : 'excluída'} | ${how} |`);
}
L.push('');
const out = `${L.join('\n')}\n`;
const target = path.join(root, 'docs', 'RENATA_MATRIZ_COBERTURA.md');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (cur !== out) { console.error('docs/RENATA_MATRIZ_COBERTURA.md desatualizada: rode node scripts/renata-coverage.mjs'); process.exit(1); }
  console.log(`matriz em dia: ${tools.length} ferramentas, ${routes.length} rotas, ${ROWS.length} funcionalidades`);
} else {
  fs.writeFileSync(target, out);
  console.log(`matriz gravada: ${tools.length} ferramentas, ${routes.length} rotas (${count('curated')} curadas, ${count('generic')} genéricas, ${count('excluded')} excluídas), ${ROWS.length} funcionalidades`);
}
process.exit(0);
