// Ferramentas de Empresas (cronogramas dos clientes) e tarefas de reunião — §101. Mesmo acesso da tela (canAccessProject) e, para alterar, só equipe (master/pricetax).
// Cronograma: usa o motor `applyPlanOps` da API de conectividade (atômico, valida equipe/fases/datas, devolve o que desfaz). Tarefas de reunião: editam
// `meetings[].actionItems` do projeto. Toda gravação deixa linha no Log da empresa ("RENATA (IA, a pedido de …)") e reindexa a memória da RENATA.
import crypto from 'node:crypto';
import { T } from '../validate.js';
import { pool, nextPhaseColor } from '../../db.js';
import { canAccessProject } from '../../routes.js';
import { applyPlanOps } from '../../connect.js';
import { syncProjectMemoryFromDiff } from '../../memoryIngest.js';
import { todayInSp } from '../../widgetSummary.js';
import { notifyTodoChanges } from '../../todoNotifications.js';
import { callInternal } from '../internalCall.js';
import { searchProjectMemory } from '../../memoryRetrieval.js';

const uid = (p) => `${p}-${crypto.randomBytes(5).toString('base64url')}`;
const alive = (a) => (Array.isArray(a) ? a.filter((x) => x && !x.deleted) : []);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const name = (d) => (d.company && (d.company.nomeFantasia || d.company.name)) || 'Sem nome';
const isStaff = (u) => !!u && (u.isSuperAdmin || u.role === 'master' || u.role === 'pricetax');
const canSee = (u) => !!u.companiesAccess || !!u.isSuperAdmin;
const who = (ctx) => `RENATA (IA, a pedido de ${ctx.user.name || ctx.user.username})`;
const TODO_STATUS = ['nao-iniciado', 'em-andamento', 'concluida', 'nao-relevante'];

async function loadVisible(ctx) {
  const { rows } = await pool.query(`SELECT id, org_id, data FROM projects WHERE org_id=$1`, [ctx.orgId]);
  return rows.filter((r) => canAccessProject(ctx.user, r.data, r.org_id));
}

// Edita UM projeto numa transação: `mutate(data, helpers)` devolve {status, json, next?, logText?}.
async function withProject(ctx, projectId, mutate) {
  if (!isStaff(ctx.user)) return { status: 403, json: { message: 'Só a equipe PRICETAX altera cronogramas e tarefas de empresas.' } };
  const client = await pool.connect();
  let out; let before; let afterData; let r;
  try {
    await client.query('BEGIN');
    const q = await client.query('SELECT id, org_id, data FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
    r = q.rows[0];
    if (!r || r.org_id !== ctx.orgId || !canAccessProject(ctx.user, r.data, r.org_id)) { await client.query('ROLLBACK'); return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } }; }
    before = r.data;
    out = mutate(structuredClone(r.data), { who: who(ctx), now: new Date().toISOString(), today: todayInSp() });
    if (out.status >= 400 || !out.next) { await client.query('ROLLBACK'); return out; }
    afterData = out.next;
    afterData.log = [{ ts: new Date().toISOString(), action: `${out.logText} — ${who(ctx)}`, user: who(ctx), activityId: null }, ...(Array.isArray(afterData.log) ? afterData.log : [])].slice(0, 300);
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(afterData), projectId]);
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* já encerrada */ } throw e; } finally { client.release(); }
  syncProjectMemoryFromDiff(pool, r.org_id, projectId, before, afterData).catch((e) => console.error('RENATA: falha ao reindexar memória após ajuste', e.message));
  // Quem foi definido como responsável de uma tarefa de reunião recebe o mesmo aviso da tela ("RENATA (IA, a pedido de …) te definiu como responsável…").
  notifyTodoChanges({ user: { ...ctx.user, name: who(ctx) } }, projectId, name(afterData), before, afterData).catch(() => {});
  return out;
}

const opsSchema = T.arr('Operações do cronograma (até 100). Cada uma tem "op": activity.set | activity.add | activity.delete | activity.restore | sub.set | sub.add | sub.move | sub.delete | sub.restore | pauta.link. '
  + 'Referências: activity/ref {id} ou título exato. Ex.: {"op":"activity.set","ref":{"id":"…"},"set":{"status":"concluido","date":"2026-11-03","responsible":"Nome da equipe"}}; '
  + '{"op":"sub.set","activity":{"id":"…"},"sub":{"id":"…"},"set":{"done":true}}. Campos de atividade: title,status(nao-iniciado|em-andamento|pausado|concluido),date,endDate,responsible,desc,priority,required,phase,kind. Campos de subatividade: title,done,skipped,skipReason,date,responsible,kind,guide,pautaDe.',
{ type: 'object', additionalProperties: true, properties: { op: T.str('Operação') } }, { minItems: 1, maxItems: 100 });


// Dependências entre subatividades (campo `predecessors`): uma subatividade aberta não pode ter data ANTES da de uma predecessora também aberta.
// O ajuste do cronograma é recusado se criar violações NOVAS (as que já existiam não contam) — a menos que a pessoa aceite explicitamente.
function depViolations(data) {
  const subs = new Map();
  for (const a of alive(data.activities)) for (const s of alive(a.subactivities)) subs.set(s.id, { s, a });
  const out = [];
  for (const [id, { s, a }] of subs) {
    for (const pid of Array.isArray(s.predecessors) ? s.predecessors : []) {
      const p = subs.get(pid);
      if (!s.done && p && !p.s.done && p.s.date && s.date && p.s.date > s.date) out.push({ key: `${id}<${pid}`, subatividade: s.title, data: s.date, predecessora: p.s.title, dataPredecessora: p.s.date, atividade: a.title });
    }
  }
  return out;
}
const newViolations = (before, after) => { const had = new Set(depViolations(before).map((v) => v.key)); return depViolations(after).filter((v) => !had.has(v.key)).map(({ key, ...v }) => v); };
const mem = (d) => alive(d.meetings);

export function registerEmpresas(registry) {
  const base = { module: 'Empresas (cronogramas)', visible: canSee };
  registry.add({ ...base, name: 'empresas_listar', summary: 'Lista as empresas (cronogramas de clientes) que o usuário pode ver, com contagens. Use para achar o id de uma empresa pelo nome.', risk: 'read', params: T.obj({ q: T.str('Nome, fantasia ou CNPJ') }),
    run: async (ctx, i) => {
      const q = norm(i.q);
      const list = (await loadVisible(ctx)).map((r) => { const acts = alive(r.data.activities); return { id: r.id, nome: name(r.data), cnpj: (r.data.company && r.data.company.cnpj) || '', status: (r.data.company && r.data.company.status) || '', atividades: acts.length, concluidas: acts.filter((a) => a.status === 'concluido').length, reunioes: alive(r.data.meetings).length }; })
        .filter((c) => !q || norm(`${c.nome} ${c.cnpj}`).includes(q)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return { status: 200, json: { total: list.length, empresas: list.slice(0, 60) } };
    } });
  registry.add({ ...base, name: 'empresa_ver_cronograma', summary: 'Mostra uma empresa: equipe, fases, reuniões (com tarefas abertas) e atividades (id, status, datas, responsável, fase, nº de subatividades). Para ver as SUBATIVIDADES (e predecessoras) de uma atividade, passe atividadeId. Use antes de ajustar o cronograma.', risk: 'read',
    params: T.obj({ id: T.str('Id da empresa (empresas_listar)'), somenteAtrasadas: T.bool('Só atividades abertas com prazo vencido'), atividadeId: T.str('Id de uma atividade: devolve também as subatividades dela'), limit: T.int('Máximo de atividades (padrão 60)', { minimum: 1, maximum: 200 }) }, ['id']),
    run: async (ctx, i) => {
      const r = (await loadVisible(ctx)).find((x) => x.id === i.id);
      if (!r) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const d = r.data; const today = todayInSp();
      const phases = alive(d.phases).map((p) => ({ id: p.id, nome: p.name }));
      const pn = Object.fromEntries(phases.map((p) => [p.id, p.nome]));
      const subs = new Map(alive(d.activities).flatMap((a) => alive(a.subactivities).map((s) => [s.id, s])));
      let acts = alive(d.activities).map((a) => {
        const sl = alive(a.subactivities);
        const base = { id: a.id, titulo: a.title, status: a.status, inicio: a.date || '', fim: a.endDate || a.date || '', responsavel: a.responsible || '', fase: pn[a.phase] || '', prioridade: a.priority || '', atrasada: a.status !== 'concluido' && !!(a.endDate || a.date) && (a.endDate || a.date) < today, subatividades: sl.length, subatividadesAbertas: sl.filter((s) => !s.done && !s.skipped).length };
        if (i.atividadeId && a.id === i.atividadeId) base.detalheSubatividades = sl.map((s) => ({ id: s.id, titulo: s.title, feita: !!s.done, pulada: !!s.skipped, data: s.date || '', responsavel: s.responsible || '', tipo: s.kind || 'trabalho', ...(Array.isArray(s.predecessors) && s.predecessors.length ? { predecessoras: s.predecessors.map((pid) => ({ id: pid, titulo: (subs.get(pid) || {}).title || '(removida)', data: (subs.get(pid) || {}).date || '' })) } : {}) }));
        return base;
      });
      if (i.somenteAtrasadas) acts = acts.filter((a) => a.atrasada);
      const total = acts.length;
      const meetings = alive(d.meetings).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15).map((m) => ({ id: m.id, titulo: m.title, data: m.date, hora: m.time || '', tarefasAbertas: alive(m.actionItems).filter((t) => !['concluida', 'nao-relevante'].includes(t.status)).length, tarefasTotal: alive(m.actionItems).length }));
      // ordem das chaves importa: o que é curto vem primeiro, as atividades por último (se algo for cortado por tamanho, são elas)
      return { status: 200, json: { hoje: today, empresa: name(d), status: (d.company && d.company.status) || '', equipe: alive(d.team).map((t) => t.name), fases: phases, reunioes: meetings, totalAtividades: total, atividades: acts.slice(0, i.limit || 60) } };
    } });
  // Leitura do CONTEÚDO das reuniões (resumo, decisões, participantes, tarefas, transcrição) — antes a RENATA só via a lista, sem o que foi dito, e
  // procurava em rotas genéricas até estourar o limite de consultas (2026-10-29).
  registry.add({ ...base, name: 'reuniao_ver', summary: 'Lê uma reunião de uma empresa: participantes, resumo, decisões e tarefas (com responsável, prazo e status). Sem reuniaoId, devolve a reunião mais recente que já aconteceu. Use para saber O QUE FOI DITO/DECIDIDO ("o que o cliente perguntou na última reunião?"). A transcrição (só equipe) vem em trecho e só se transcricao=true.', risk: 'read',
    params: T.obj({ empresaId: T.str('Id da empresa (empresas_listar)'), reuniaoId: T.str('Id da reunião (vem em empresa_ver_cronograma); vazio = a mais recente'), transcricao: T.bool('Incluir trecho da transcrição (até 8.000 caracteres)') }, ['empresaId']),
    run: async (ctx, i) => {
      const r = (await loadVisible(ctx)).find((x) => x.id === i.empresaId);
      if (!r) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const today = todayInSp();
      const list = alive(r.data.meetings).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const m = i.reuniaoId ? list.find((x) => x.id === i.reuniaoId) : (list.find((x) => x.date && x.date <= today) || list[0]);
      if (!m) return { status: 404, json: { message: i.reuniaoId ? 'Reunião não encontrada nesta empresa.' : 'Esta empresa não tem reunião registrada.' } };
      return { status: 200, json: {
        empresa: name(r.data), id: m.id, titulo: m.title || '', data: m.date || '', hora: m.time || '', participantes: Array.isArray(m.participants) ? m.participants : [],
        resumo: clip(m.summary, 6000), decisoes: clip(m.decisions, 4000),
        tarefas: alive(m.actionItems).slice(0, 40).map((t) => ({ id: t.id, titulo: clip(t.title, 200), responsavel: t.responsible || '', ladoCliente: t.owner === 'cliente', prazo: t.dueDate || '', status: t.status || '', area: t.area || '' })),
        outrasReunioes: list.filter((x) => x.id !== m.id).slice(0, 8).map((x) => ({ id: x.id, titulo: clip(x.title, 80), data: x.date || '' })),
        ...(i.transcricao && isStaff(ctx.user) ? { transcricao: clip(m.transcript, 8000), transcricaoCortada: String(m.transcript || '').length > 8000 } : {}),
      } };
    } });
  registry.add({ ...base, name: 'reunioes_buscar', summary: 'Busca um tema na memória das reuniões de UMA empresa (resumos, decisões, trechos da conversa) e devolve os trechos mais relevantes com reunião e data. Use para achar ONDE um assunto foi tratado ("saldo credor de PIS/COFINS na KUHN"); depois leia a reunião com reuniao_ver.', risk: 'read',
    params: T.obj({ empresaId: T.str('Id da empresa (empresas_listar)'), consulta: T.str('O assunto, em poucas palavras', { maxLength: 300 }), limite: T.int('Máximo de trechos (padrão 8)', { minimum: 1, maximum: 15 }) }, ['empresaId', 'consulta']),
    run: async (ctx, i) => {
      const r = (await loadVisible(ctx)).find((x) => x.id === i.empresaId);
      if (!r) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const chunks = await searchProjectMemory(pool, { orgId: ctx.orgId, projectId: r.id, query: i.consulta, limit: i.limite || 8 });
      return { status: 200, json: { empresa: name(r.data), total: chunks.length, trechos: chunks.map((c) => ({ reuniaoId: c.meetingId || '', reuniao: clip(c.meetingTitle, 80), data: c.meetingDate || '', tipo: c.kind, texto: clip(c.content, 900) })) } };
    } });
  registry.add({ ...base, name: 'cronograma_simular', summary: 'SIMULA ajustes no cronograma de uma empresa sem gravar nada: mostra o que mudaria e aponta operações inválidas. Sempre simule antes de aplicar mudanças grandes.', risk: 'read',
    params: T.obj({ id: T.str('Id da empresa'), ops: opsSchema }, ['id', 'ops']),
    run: async (ctx, i) => {
      const r = (await loadVisible(ctx)).find((x) => x.id === i.id);
      if (!r) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const out = applyPlanOps(r.data, i.ops, who(ctx));
      if (out.errors.length) return { status: 400, json: { message: 'Há operações inválidas; nada seria gravado.', errors: out.errors } };
      const quebras = newViolations(r.data, out.next);
      return { status: 200, json: { simulacao: true, mudariam: out.results.length, resultados: out.results, dependenciasQuebradas: quebras, ...(quebras.length ? { aviso: 'Estes ajustes deixariam subatividades com data ANTES da predecessora. Ajuste também as dependentes, ou aplique com aceitarDependenciasQuebradas=true se for de propósito.' } : {}) } };
    } });
  registry.add({ ...base, name: 'cronograma_aplicar', summary: 'APLICA ajustes no cronograma de uma empresa (status, datas, responsáveis, subatividades, atividades novas; excluir vai para a lixeira). Tudo ou nada. '
    + 'Mais de uma operação, ou qualquer exclusão, pede confirmação do usuário. Preserve as regras: responsável precisa estar na equipe da empresa.', risk: 'write',
    params: T.obj({ id: T.str('Id da empresa'), ops: opsSchema, motivo: T.str('Por quê (vai para o Log da empresa)', { maxLength: 300 }), aceitarDependenciasQuebradas: T.bool('Aplicar mesmo que alguma subatividade fique com data antes da predecessora (só se a pessoa pediu)') }, ['id', 'ops']),
    bulk: (i) => i.ops.length, confirm: (i) => i.ops.some((o) => /delete$/.test(String(o.op))), bulkNote: 'Para vários ajustes, simule primeiro com cronograma_simular.',
    describe: (i) => `Aplicar ${i.ops.length} ajuste(s) no cronograma da empresa${i.ops.some((o) => /delete$/.test(String(o.op))) ? ' (inclui EXCLUSÃO)' : ''}${i.motivo ? ` — ${i.motivo}` : ''}.`,
    undo: (i, b, r) => (r && Array.isArray(r.undo) && r.undo.length ? { tool: 'cronograma_aplicar', input: { id: i.id, ops: r.undo, motivo: 'desfazer ajuste anterior da RENATA' }, label: 'desfazer o ajuste do cronograma' } : null),
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      const out = applyPlanOps(data, i.ops, h.who);
      if (out.errors.length) return { status: 400, json: { message: 'Nada foi gravado: há operações inválidas.', errors: out.errors } };
      const quebras = newViolations(data, out.next);
      if (quebras.length && !i.aceitarDependenciasQuebradas) return { status: 409, json: { message: 'Nada foi gravado: estes ajustes deixariam subatividades com data antes da predecessora. Ajuste também as dependentes (inclua-as nas operações) ou repita com aceitarDependenciasQuebradas=true se for de propósito.', dependenciasQuebradas: quebras } };
      return { status: 200, next: out.next, logText: `Cronograma ajustado: ${out.results.length} alteração(ões)${i.motivo ? `. ${clip(i.motivo, 200)}` : ''}`, json: { aplicadas: out.results.length, resultados: out.results, criadas: out.created, undo: out.undo } };
    }),
    summarize: (i, r) => `Cronograma ajustado: ${r.aplicadas} alteração(ões).` });

  // ---------- tarefas de reunião
  const findTodo = (data, id) => { for (const m of alive(data.meetings)) { const t = (m.actionItems || []).find((x) => x && !x.deleted && x.id === id); if (t) return { m, t }; } return null; };
  registry.add({ ...base, name: 'tarefas_reuniao_listar', summary: 'Lista tarefas de reunião (itens de ação) das empresas que o usuário vê. Filtros: empresa, responsável (parte do nome), status, só vencidas.', risk: 'read',
    params: T.obj({ empresaId: T.str('Id da empresa'), responsavel: T.str('Parte do nome do responsável'), status: T.enm('Status', TODO_STATUS), somenteVencidas: T.bool('Só abertas com prazo vencido'), abertas: T.bool('Só não concluídas'), limit: T.int('Máximo (até 100)', { minimum: 1, maximum: 100 }) }),
    run: async (ctx, i) => {
      const today = todayInSp(); const out = [];
      for (const r of await loadVisible(ctx)) {
        if (i.empresaId && r.id !== i.empresaId) continue;
        for (const m of alive(r.data.meetings)) for (const t of alive(m.actionItems)) {
          const open = !['concluida', 'nao-relevante'].includes(t.status);
          if (i.abertas && !open) continue; if (i.status && t.status !== i.status) continue;
          if (i.responsavel && !norm(t.responsible).includes(norm(i.responsavel))) continue;
          const late = open && !!t.dueDate && t.dueDate < today;
          if (i.somenteVencidas && !late) continue;
          out.push({ id: t.id, titulo: clip(t.title, 120), empresa: name(r.data), empresaId: r.id, reuniao: clip(m.title, 60), reuniaoId: m.id, responsavel: t.responsible || '', prazo: t.dueDate || '', status: t.status, vencida: late });
        }
      }
      out.sort((a, b) => (b.vencida - a.vencida) || (a.prazo || '9999').localeCompare(b.prazo || '9999'));
      return { status: 200, json: { hoje: today, total: out.length, tarefas: out.slice(0, i.limit || 50) } };
    } });
  registry.add({ ...base, name: 'tarefa_reuniao_criar', summary: 'Cria uma tarefa (item de ação) numa reunião de uma empresa, com responsável, prazo e dono (pricetax ou cliente).', risk: 'write', creates: true,
    params: T.obj({ empresaId: T.str('Id da empresa'), reuniaoId: T.str('Id da reunião (empresa_ver_cronograma lista as reuniões)'), title: T.str('Título da tarefa', { maxLength: 300 }), responsible: T.str('Responsável (nome)'), owner: T.enm('Quem executa', ['pricetax', 'cliente']), dueDate: T.date('Prazo'), notes: T.str('Observações') }, ['empresaId', 'reuniaoId', 'title']),
    describe: (i) => `Criar a tarefa “${i.title}”${i.responsible ? ` para ${i.responsible}` : ''}${i.dueDate ? ` até ${i.dueDate}` : ''}.`,
    undo: (i, b, r) => (r && r.tarefa ? { tool: 'tarefa_reuniao_excluir', input: { empresaId: i.empresaId, id: r.tarefa.id }, label: 'excluir a tarefa criada' } : null),
    run: (ctx, i) => withProject(ctx, i.empresaId, (data, h) => {
      const m = alive(data.meetings).find((x) => x.id === i.reuniaoId);
      if (!m) return { status: 404, json: { message: 'Reunião não encontrada nesta empresa.' } };
      const item = { id: uid('mai'), title: i.title, responsible: i.responsible || '', owner: i.owner === 'cliente' ? 'cliente' : 'pricetax', dueDate: i.dueDate || '', status: 'nao-iniciado', deleted: false, subtitle: '', notes: i.notes || '', subtasks: [], comments: [], attachments: [], createdBy: h.who, createdAt: h.now };
      m.actionItems = [...(m.actionItems || []), item];
      return { status: 201, next: data, logText: `Tarefa criada na reunião "${clip(m.title, 60)}": "${clip(i.title, 100)}"`, json: { tarefa: { id: item.id, titulo: item.title, responsavel: item.responsible, prazo: item.dueDate, reuniao: m.title } } };
    }) });
  registry.add({ ...base, name: 'tarefa_reuniao_atualizar', summary: 'Altera uma tarefa de reunião: título, responsável, prazo, status (nao-iniciado, em-andamento, concluida, nao-relevante), dono, observações.', risk: 'write',
    params: T.obj({ empresaId: T.str('Id da empresa'), id: T.str('Id da tarefa (tarefas_reuniao_listar)'), title: T.str('Título'), responsible: T.str('Responsável'), owner: T.enm('Quem executa', ['pricetax', 'cliente']), dueDate: T.date('Prazo'), limparPrazo: T.bool('Remover o prazo'), status: T.enm('Status', TODO_STATUS), notes: T.str('Observações') }, ['empresaId', 'id']),
    describe: (i) => `Alterar a tarefa ${i.id}: ${Object.keys(i).filter((k) => !['empresaId', 'id'].includes(k)).join(', ')}.`,
    undo: (i, b, r) => { const a = r && r.anterior; if (!a) return null; const input = { empresaId: i.empresaId, id: i.id }; for (const k of ['title', 'responsible', 'owner', 'status', 'notes']) if (i[k] !== undefined) input[k] = a[k] === undefined ? '' : a[k]; if (i.dueDate !== undefined || i.limparPrazo) { if (a.dueDate) input.dueDate = a.dueDate; else input.limparPrazo = true; } return Object.keys(input).length > 2 ? { tool: 'tarefa_reuniao_atualizar', input, label: 'devolver os valores anteriores da tarefa' } : null; },
    run: (ctx, i) => withProject(ctx, i.empresaId, (data, h) => {
      const f = findTodo(data, i.id);
      if (!f) return { status: 404, json: { message: 'Tarefa não encontrada.' } };
      const prev = { title: f.t.title, responsible: f.t.responsible || '', owner: f.t.owner || 'pricetax', dueDate: f.t.dueDate || '', status: f.t.status, notes: f.t.notes || '' };
      const ch = [];
      for (const k of ['title', 'responsible', 'owner', 'status', 'notes']) if (i[k] !== undefined) { f.t[k] = i[k]; ch.push(k); }
      if (i.limparPrazo) { f.t.dueDate = ''; ch.push('prazo removido'); } else if (i.dueDate !== undefined) { f.t.dueDate = i.dueDate; ch.push('prazo'); }
      return { status: 200, next: data, logText: `Tarefa "${clip(f.t.title, 80)}" alterada (${ch.join(', ')})`, json: { anterior: prev, tarefa: { id: f.t.id, titulo: f.t.title, responsavel: f.t.responsible, prazo: f.t.dueDate, status: f.t.status }, alteracoes: ch } };
    }), summarize: (i, r) => `Tarefa “${r.tarefa.titulo}” atualizada (${r.alteracoes.join(', ')}).` });
  registry.add({ ...base, name: 'tarefa_reuniao_excluir', summary: 'Exclui uma tarefa de reunião (lixeira).', risk: 'critical', params: T.obj({ empresaId: T.str('Id da empresa'), id: T.str('Id da tarefa') }, ['empresaId', 'id']), before: async (ctx, i) => { const r = (await loadVisible(ctx)).find((x) => x.id === i.empresaId); const f = r && findTodo(r.data, i.id); return f ? { titulo: f.t.title, responsavel: f.t.responsible || '', prazo: f.t.dueDate || '', reuniao: f.m.title, empresa: name(r.data) } : undefined; },
    describe: (i, b) => `EXCLUIR a tarefa de reunião “${(b && b.titulo) || i.id}”${b && b.empresa ? ` de ${b.empresa}` : ''}.`,
    run: (ctx, i) => withProject(ctx, i.empresaId, (data, h) => {
      const f = findTodo(data, i.id);
      if (!f) return { status: 404, json: { message: 'Tarefa não encontrada.' } };
      f.t.deleted = true; f.t.deletedAt = h.now; f.t.deletedBy = h.who;
      return { status: 200, next: data, logText: `Tarefa excluída: "${clip(f.t.title, 100)}"`, json: { excluida: { id: f.t.id, titulo: f.t.title } } };
    }) });

  // ---------- reuniões
  registry.add({ ...base, name: 'reuniao_criar', summary: 'Cria uma reunião no cronograma de uma empresa (título, data, hora, participantes, resumo, decisões). Tarefas da reunião: tarefa_reuniao_criar.', risk: 'write', creates: true,
    params: T.obj({ empresaId: T.str('Id da empresa'), title: T.str('Título', { maxLength: 200 }), date: T.date('Data'), time: T.str('Hora HH:MM'), participants: T.arr('Participantes (nomes)', T.str('nome'), { maxItems: 40 }), summary: T.str('Resumo'), decisions: T.str('Decisões') }, ['empresaId', 'title']),
    describe: (i) => `Criar a reunião “${i.title}”${i.date ? ` em ${i.date}` : ''}.`, undo: (i, b, r) => (r && r.reuniao ? { tool: 'reuniao_excluir', input: { empresaId: i.empresaId, id: r.reuniao.id }, label: 'excluir a reunião criada' } : null),
    run: (ctx, i) => withProject(ctx, i.empresaId, (data, h) => {
      const m = { id: uid('mtg'), title: i.title, date: i.date || h.today, time: i.time || '', participants: i.participants || [], transcript: '', summary: i.summary || '', decisions: i.decisions || '', actionItems: [], createdAt: h.now, deleted: false, deletedAt: '', deletedBy: '' };
      data.meetings = [...(data.meetings || []), m];
      return { status: 201, next: data, logText: `Reunião criada: "${clip(m.title, 100)}"`, json: { reuniao: { id: m.id, titulo: m.title, data: m.date, hora: m.time } } };
    }) });
  registry.add({ ...base, name: 'reuniao_atualizar', summary: 'Altera uma reunião: título, data, hora, participantes, resumo, decisões.', risk: 'write',
    params: T.obj({ empresaId: T.str('Id da empresa'), id: T.str('Id da reunião'), title: T.str('Título'), date: T.date('Data'), time: T.str('Hora HH:MM'), participants: T.arr('Participantes (substitui a lista)', T.str('nome'), { maxItems: 40 }), summary: T.str('Resumo'), decisions: T.str('Decisões') }, ['empresaId', 'id']),
    describe: (i) => `Alterar a reunião ${i.id}: ${Object.keys(i).filter((k) => !['empresaId', 'id'].includes(k)).join(', ')}.`,
    undo: (i, b, r) => (r && r.anterior ? { tool: 'reuniao_atualizar', input: { empresaId: i.empresaId, id: i.id, ...Object.fromEntries(Object.keys(r.anterior).map((k) => [k, r.anterior[k]])) }, label: 'devolver os valores anteriores da reunião' } : null),
    run: (ctx, i) => withProject(ctx, i.empresaId, (data, h) => {
      const m = mem(data).find((x) => x.id === i.id);
      if (!m) return { status: 404, json: { message: 'Reunião não encontrada.' } };
      const ant = {}; const ch = [];
      for (const k of ['title', 'date', 'time', 'participants', 'summary', 'decisions']) if (i[k] !== undefined) { ant[k] = m[k] === undefined ? '' : m[k]; m[k] = i[k]; ch.push(k); }
      return { status: 200, next: data, logText: `Reunião "${clip(m.title, 80)}" alterada (${ch.join(', ')})`, json: { anterior: ant, reuniao: { id: m.id, titulo: m.title, data: m.date, hora: m.time }, alteracoes: ch } };
    }), summarize: (i, r) => `Reunião “${r.reuniao.titulo}” atualizada (${r.alteracoes.join(', ')}).` });
  registry.add({ ...base, name: 'reuniao_excluir', summary: 'Exclui uma reunião (lixeira da empresa).', risk: 'critical', params: T.obj({ empresaId: T.str('Id da empresa'), id: T.str('Id da reunião') }, ['empresaId', 'id']),
    before: async (ctx, i) => { const r = (await loadVisible(ctx)).find((x) => x.id === i.empresaId); const m = r && mem(r.data).find((x) => x.id === i.id); return m ? { titulo: m.title, data: m.date, tarefas: alive(m.actionItems).length, empresa: name(r.data) } : undefined; },
    describe: (i, b) => `EXCLUIR a reunião “${(b && b.titulo) || i.id}”${b && b.tarefas ? ` (com ${b.tarefas} tarefa(s))` : ''}.`,
    run: (ctx, i) => withProject(ctx, i.empresaId, (data, h) => {
      const m = mem(data).find((x) => x.id === i.id);
      if (!m) return { status: 404, json: { message: 'Reunião não encontrada.' } };
      m.deleted = true; m.deletedAt = h.now; m.deletedBy = h.who;
      return { status: 200, next: data, logText: `Reunião excluída: "${clip(m.title, 100)}"`, json: { excluida: { id: m.id, titulo: m.title } } };
    }) });

  // ---------- cadastro, equipe e fases da empresa
  registry.add({ ...base, name: 'empresa_atualizar_cadastro', summary: 'Altera o cadastro de uma empresa do cronograma: razão social, nome fantasia e situação (ativo/pausado). O CNPJ não se altera por aqui (ele controla o acesso).', risk: 'write',
    params: T.obj({ id: T.str('Id da empresa'), name: T.str('Razão social'), nomeFantasia: T.str('Nome fantasia'), status: T.enm('Situação', ['ativo', 'pausado']) }, ['id']),
    describe: (i) => `Alterar o cadastro da empresa: ${Object.keys(i).filter((k) => k !== 'id').join(', ')}.`,
    undo: (i, b, r) => (r && r.anterior ? { tool: 'empresa_atualizar_cadastro', input: { id: i.id, ...r.anterior }, label: 'devolver o cadastro anterior' } : null),
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      data.company = { ...(data.company || {}) };
      const ant = {}; const ch = [];
      for (const k of ['name', 'nomeFantasia', 'status']) if (i[k] !== undefined) { ant[k] = data.company[k] === undefined ? (k === 'status' ? 'ativo' : '') : data.company[k]; data.company[k] = i[k]; ch.push(k); }
      return { status: 200, next: data, logText: `Cadastro alterado (${ch.join(', ')})`, json: { anterior: ant, empresa: name(data), alteracoes: ch } };
    }), summarize: (i, r) => `Cadastro de “${r.empresa}” atualizado (${r.alteracoes.join(', ')}).` });
  registry.add({ ...base, name: 'empresa_equipe_adicionar', summary: 'Adiciona uma pessoa/área à equipe de uma empresa (responsáveis das atividades vêm da equipe).', risk: 'write', creates: true,
    params: T.obj({ id: T.str('Id da empresa'), name: T.str('Nome (pessoa ou área)', { maxLength: 120 }), area: T.str('Área') }, ['id', 'name']),
    describe: (i) => `Adicionar “${i.name}” à equipe da empresa.`, undo: (i) => ({ tool: 'empresa_equipe_remover', input: { id: i.id, name: i.name }, label: 'remover da equipe' }),
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      data.team = Array.isArray(data.team) ? [...data.team] : [];
      if (alive(data.team).some((t) => norm(t.name) === norm(i.name))) return { status: 409, json: { message: `“${i.name}” já está na equipe.` } };
      const m = { id: uid('team'), name: i.name, area: i.area || '', userId: null, username: null, role: null };
      data.team.push(m);
      return { status: 201, next: data, logText: `Responsável adicionado à equipe: ${i.name}`, json: { membro: { id: m.id, nome: m.name } } };
    }) });
  registry.add({ ...base, name: 'empresa_equipe_remover', summary: 'Remove uma pessoa/área da equipe de uma empresa (atividades que já a citam continuam com o nome).', risk: 'critical', params: T.obj({ id: T.str('Id da empresa'), name: T.str('Nome exato do membro') }, ['id', 'name']),
    describe: (i) => `REMOVER “${i.name}” da equipe da empresa.`, undo: (i, b, r) => (r && r.removido ? { tool: 'empresa_equipe_adicionar', input: { id: i.id, name: r.removido.name, area: r.removido.area || '' }, label: 'devolver à equipe' } : null),
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      const m = alive(data.team).find((t) => norm(t.name) === norm(i.name));
      if (!m) return { status: 404, json: { message: `“${i.name}” não está na equipe desta empresa.` } };
      data.team = data.team.filter((t) => t.id !== m.id);
      return { status: 200, next: data, logText: `Responsável removido da equipe: ${m.name}`, json: { removido: { id: m.id, name: m.name, area: m.area || '' } } };
    }) });
  const phaseOf = (data, ref) => (Array.isArray(data.phases) ? data.phases : []).find((p) => String(p.id) === String(ref) || norm(p.name) === norm(ref));
  registry.add({ ...base, name: 'empresa_fase_criar', summary: 'Cria uma fase no cronograma da empresa.', risk: 'write', creates: true, params: T.obj({ id: T.str('Id da empresa'), name: T.str('Nome da fase', { maxLength: 100 }), sub: T.str('Subtítulo/descrição') }, ['id', 'name']),
    describe: (i) => `Criar a fase “${i.name}”.`,
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      data.phases = Array.isArray(data.phases) ? [...data.phases] : [];
      if (phaseOf(data, i.name)) return { status: 409, json: { message: `Já existe a fase “${i.name}”.` } };
      const nums = data.phases.map((p) => p.id).filter((x) => typeof x === 'number');
      const ph = { id: nums.length === data.phases.length ? (nums.length ? Math.max(...nums) + 1 : 1) : uid('ph'), name: i.name, sub: i.sub || '', color: nextPhaseColor(data.phases.length) };
      data.phases.push(ph);
      return { status: 201, next: data, logText: `Fase criada: "${i.name}"`, json: { fase: { id: ph.id, nome: ph.name } } };
    }) });
  registry.add({ ...base, name: 'empresa_fase_atualizar', summary: 'Renomeia uma fase ou altera a descrição.', risk: 'write', params: T.obj({ id: T.str('Id da empresa'), fase: T.str('Fase (id ou nome atual)'), name: T.str('Novo nome'), sub: T.str('Nova descrição') }, ['id', 'fase']),
    describe: (i) => `Alterar a fase “${i.fase}”.`,
    undo: (i, b, r) => (r && r.anterior ? { tool: 'empresa_fase_atualizar', input: { id: i.id, fase: String(r.faseId), ...r.anterior }, label: 'devolver os valores anteriores da fase' } : null),
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      const ph = phaseOf(data, i.fase);
      if (!ph) return { status: 404, json: { message: `Fase “${i.fase}” não encontrada. Fases: ${(data.phases || []).map((p) => p.name).join(', ')}.` } };
      const ant = {}; const ch = [];
      for (const k of ['name', 'sub']) if (i[k] !== undefined) { ant[k] = ph[k] || ''; ph[k] = i[k]; ch.push(k); }
      return { status: 200, next: data, logText: `Fase alterada: "${clip(ant.name || ph.name, 80)}" (${ch.join(', ')})`, json: { faseId: ph.id, anterior: ant, fase: { id: ph.id, nome: ph.name }, alteracoes: ch } };
    }), summarize: (i, r) => `Fase “${r.fase.nome}” atualizada.` });
  registry.add({ ...base, name: 'empresa_fase_excluir', summary: 'Exclui uma fase; as atividades dela passam para outra fase (a primeira restante). Sempre pede confirmação.', risk: 'critical', params: T.obj({ id: T.str('Id da empresa'), fase: T.str('Fase (id ou nome)') }, ['id', 'fase']),
    describe: (i) => `EXCLUIR a fase “${i.fase}” (as atividades dela mudam de fase).`,
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      const list = Array.isArray(data.phases) ? data.phases : [];
      const ph = phaseOf(data, i.fase);
      if (!ph) return { status: 404, json: { message: `Fase “${i.fase}” não encontrada.` } };
      if (list.length <= 1) return { status: 400, json: { message: 'A empresa precisa ter ao menos uma fase.' } };
      const fb = list.find((x) => x.id !== ph.id);
      data.activities = (data.activities || []).map((a) => (a.phase === ph.id ? { ...a, phase: fb.id } : a));
      data.phases = list.filter((x) => x.id !== ph.id);
      return { status: 200, next: data, logText: `Fase removida: "${ph.name}" (atividades movidas para "${fb.name}")`, json: { excluida: ph.name, atividadesMovidasPara: fb.name } };
    }) });

  // ---------- empresa nova / excluir empresa
  registry.add({ ...base, name: 'empresa_criar', summary: 'Cria uma empresa (cliente) com o cronograma padrão da casa a partir da data de kickoff. Sempre pede confirmação (cria cronograma completo e libera o CNPJ para quem a cria).', risk: 'write', confirm: 'always', creates: true,
    visible: (u) => isStaff(u) && canSee(u),
    params: T.obj({ name: T.str('Razão social', { maxLength: 200 }), nomeFantasia: T.str('Nome fantasia'), cnpj: T.str('CNPJ (14 dígitos)'), kickoffDate: T.date('Data de kickoff (padrão hoje)') }, ['name']),
    route: { method: 'POST', path: '/api/projects' }, map: (i) => ({ company: { name: i.name, ...(i.nomeFantasia ? { nomeFantasia: i.nomeFantasia } : {}), ...(i.cnpj ? { cnpj: i.cnpj } : {}) }, ...(i.kickoffDate ? { kickoffDate: i.kickoffDate } : {}) }),
    describe: (i) => `CRIAR a empresa “${i.nomeFantasia || i.name}” com o cronograma padrão${i.kickoffDate ? ` (kickoff ${i.kickoffDate})` : ''}.`,
    summarize: (i, r) => `Empresa “${(r.project && r.project.company && (r.project.company.nomeFantasia || r.project.company.name)) || i.name}” criada (id ${r.project && r.project.id}).` });
  registry.add({ ...base, name: 'empresa_excluir', summary: 'EXCLUI DE VEZ uma empresa e todo o cronograma dela (não há lixeira). Exige que a pessoa digite o nome exato da empresa (nomeConfirmado) e sempre pede confirmação. Só use se a pessoa pediu isso explicitamente.', risk: 'critical',
    visible: (u) => isStaff(u) && canSee(u),
    params: T.obj({ id: T.str('Id da empresa'), nomeConfirmado: T.str('Nome da empresa exatamente como a PESSOA digitou para confirmar') }, ['id', 'nomeConfirmado']),
    before: async (ctx, i) => { const r = (await loadVisible(ctx)).find((x) => x.id === i.id); return r ? { empresa: name(r.data), atividades: alive(r.data.activities).length, reunioes: alive(r.data.meetings).length } : undefined; },
    describe: (i, b) => `EXCLUIR DE VEZ a empresa “${(b && b.empresa) || i.id}”${b ? ` (${b.atividades} atividades, ${b.reunioes} reuniões)` : ''} — sem lixeira.`,
    run: async (ctx, i) => {
      const r = (await loadVisible(ctx)).find((x) => x.id === i.id);
      if (!r) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const nm = name(r.data);
      if (norm(nm) !== norm(i.nomeConfirmado) && norm(r.data.company && r.data.company.name) !== norm(i.nomeConfirmado)) return { status: 400, json: { message: `O nome confirmado não confere com a empresa (“${nm}”). Peça à pessoa para digitar o nome exato antes de excluir.` } };
      const out = await callInternal({ userId: ctx.user.id, commandId: ctx.actionId, method: 'DELETE', path: `/api/projects/${encodeURIComponent(i.id)}` });
      return out.status === 200 ? { status: 200, json: { excluida: { id: i.id, empresa: nm } } } : out;
    } });
}
