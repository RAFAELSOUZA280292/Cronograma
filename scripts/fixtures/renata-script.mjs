// Roteiro do "modelo" usado só em teste local (scripts/renata.test.mjs): decide as chamadas de ferramenta a partir da mensagem ([T1]…) e do que as ferramentas devolveram.
const tu = (name, input) => ({ type: 'tool_use', name, input });
const text = (t) => ({ type: 'text', text: t });
const id = (s, tag) => (new RegExp(`${tag}=([\\w-]+)`).exec(s) || [])[1];
const last = (st) => st.toolResults[0];

export default async function respond(st) {
  const u = st.lastUserText;
  const r = last(st);
  if (/^\[T1\]/.test(u)) {
    if (!r) return { content: [tu('crm_criar_empresa', { legalName: 'Teste RENATA Ltda', relationship: 'prospect' })] };
    if (r.name === 'crm_criar_empresa') return r.ok ? { content: [tu('crm_criar_negocio', { companyId: r.dados.company.id, title: 'Negócio RENATA', value: 5000 })] } : { content: [text(`Falhou: ${r.erro}`)] };
    return { content: [text(r.ok ? `Pronto: ${r.resumo}` : `Falhou: ${r.erro}`)] };
  }
  if (/^\[T2\]/.test(u)) { // excluir negócio (crítico → confirmação)
    if (!r) return { content: [tu('crm_excluir_negocio', { id: id(u, 'deal') })] };
    return { content: [text(r.ok ? 'Excluído.' : `Não excluí: ${r.erro}`)] };
  }
  if (/^\[T3\]/.test(u)) { // vendedor tenta excluir empresa (sem permissão) e depois contato
    if (!r) return { content: [tu('crm_excluir_empresa', { id: id(u, 'company') })] };
    return { content: [text(r.ok ? 'Excluí.' : `Não consegui: ${r.erro}`)] };
  }
  if (/^\[T4\]/.test(u)) { // atualizar (baixo risco)
    if (!r) return { content: [tu('crm_atualizar_negocio', { id: id(u, 'deal'), value: 9999 })] };
    return { content: [text(r.ok ? `Atualizado: ${r.resumo}` : `Falhou: ${r.erro}`)] };
  }
  if (/^\[T5\]/.test(u)) { // lote (confirmação)
    if (!r) return { content: [tu('crm_lote_atualizar_atividades', { ids: [id(u, 'a'), id(u, 'b')], priority: 'high' })] };
    return { content: [text(r.ok ? `Lote: ${JSON.stringify(r.dados)}` : `Não fiz o lote: ${r.erro}`)] };
  }
  if (/^\[T6\]/.test(u)) { // quadro pessoal
    if (!r) return { content: [tu('quadro_criar_atividade', { title: 'Revisar cronograma do cliente X', dueDate: '2026-10-30', priority: 'alta' })] };
    if (r.name === 'quadro_criar_atividade') return { content: [tu('quadro_listar', { status: 'open' })] };
    if (r.name === 'quadro_listar') { const c = r.dados.cartoes.find((x) => /cliente X/.test(x.title)); return { content: [tu('quadro_concluir_atividade', { id: c.id })] }; }
    return { content: [text(`Quadro ok: ${r.resumo}`)] };
  }
  if (/^\[T7\]/.test(u)) { // cronograma: simular, aplicar 1 op (auto), aplicar 2 ops (confirmação)
    const pid = id(u, 'proj');
    if (!r) return { content: [tu('cronograma_simular', { id: pid, ops: [{ op: 'activity.set', ref: { id: 'a1' }, set: { status: 'concluido' } }] })] };
    if (r.name === 'cronograma_simular') return { content: [tu('cronograma_aplicar', { id: pid, ops: [{ op: 'activity.set', ref: { id: 'a1' }, set: { status: 'concluido' } }], motivo: 'teste' })] };
    if (r.name === 'cronograma_aplicar' && r.ok && !st.toolUses.some((x) => x.input && x.input.motivo === 'multi')) return { content: [tu('cronograma_aplicar', { id: pid, ops: [{ op: 'activity.set', ref: { id: 'a2' }, set: { date: '2026-12-01' } }, { op: 'activity.set', ref: { id: 'a2' }, set: { responsible: 'Beltrano' } }], motivo: 'multi' })] };
    return { content: [text(r.ok ? `Cronograma: ${r.resumo}` : `Falhou: ${r.erro}`)] };
  }
  if (/^\[T8\]/.test(u)) { // tarefas de reunião
    const pid = id(u, 'proj');
    if (!r) return { content: [tu('tarefa_reuniao_criar', { empresaId: pid, reuniaoId: 'm1', title: 'Enviar relatório fiscal', responsible: 'Beltrano', dueDate: '2026-10-28' })] };
    if (r.name === 'tarefa_reuniao_criar') return { content: [tu('tarefa_reuniao_atualizar', { empresaId: pid, id: r.dados.tarefa.id, status: 'em-andamento' })] };
    return { content: [text(r.ok ? `Tarefa: ${r.resumo}` : `Falhou: ${r.erro}`)] };
  }
  if (/^\[T9\]/.test(u)) { // relatórios
    if (!r) return { content: [tu('relatorio_equipe_dia', {})] };
    if (r.name === 'relatorio_equipe_dia') return { content: [tu('relatorio_atrasos', {})] };
    return { content: [text(`Relatórios: ok=${r.ok}`)] };
  }
  if (/^\[T10\]/.test(u)) { // genérico: consultar, rota excluída, executar (confirmação)
    if (!r) return { content: [tu('plataforma_consultar', { path: '/api/knowledge/overview' })] };
    if (r.name === 'plataforma_consultar' && r.ok) return { content: [tu('plataforma_consultar', { path: '/api/users' })] };
    if (r.name === 'plataforma_consultar' && !r.ok) return { content: [tu('plataforma_executar', { method: 'POST', path: '/api/daily/onboarding-complete', body: {}, descricao: 'Marcar a boas-vindas como concluída' })] };
    return { content: [text(r.ok ? 'Executado.' : `Não executei: ${r.erro}`)] };
  }
  if (/^\[T11\]/.test(u)) { // duplicidade na mesma resposta
    if (!r) return { content: [tu('crm_criar_empresa', { legalName: 'Zzdup Renata SA' }), tu('crm_criar_empresa', { legalName: 'Zzdup Renata SA' })] };
    return { content: [text('Dedupe ok')] };
  }
  if (/^\[T12\]/.test(u)) { // pendência ignorada
    if (!r) return { content: [tu('crm_excluir_negocio', { id: id(u, 'deal') })] };
    return { content: [text('Fim')] };
  }
  if (/^\[T13\]/.test(u)) { // parâmetro inválido e ferramenta desconhecida
    if (!r) return { content: [tu('crm_criar_negocio', { companyId: 'nao-e-uuid', title: 'x' }), tu('ferramenta_que_nao_existe', {})] };
    return { content: [text('Tratei os erros')] };
  }
  if (/^\[TX\]/.test(u)) { // executor genérico de testes: [TX] {"calls":[{"name":"ferramenta","input":{…}}, …]} — todas as chamadas na mesma resposta
    if (!r) return { content: JSON.parse(u.slice(4).trim()).calls.map((c) => tu(c.name, c.input || {})) };
    return { content: [text('TX concluído')] };
  }
  return { content: [text(`(sem roteiro) ${u}`)] };
}
