// Ferramentas de Empresas (cronogramas dos clientes) e tarefas de reunião — §101. Mesmo acesso da tela (canAccessProject) e, para alterar, só equipe (master/pricetax).
// Cronograma: usa o motor `applyPlanOps` da API de conectividade (atômico, valida equipe/fases/datas, devolve o que desfaz). Tarefas de reunião: editam
// `meetings[].actionItems` do projeto. Toda gravação deixa linha no Log da empresa ("RENATA (IA, a pedido de …)") e reindexa a memória da RENATA.
import crypto from 'node:crypto';
import { T } from '../validate.js';
import { pool } from '../../db.js';
import { canAccessProject } from '../../routes.js';
import { applyPlanOps } from '../../connect.js';
import { syncProjectMemoryFromDiff } from '../../memoryIngest.js';
import { todayInSp } from '../../widgetSummary.js';
import { notifyTodoChanges } from '../../todoNotifications.js';

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

export function registerEmpresas(registry) {
  const base = { module: 'Empresas (cronogramas)', visible: canSee };
  registry.add({ ...base, name: 'empresas_listar', summary: 'Lista as empresas (cronogramas de clientes) que o usuário pode ver, com contagens. Use para achar o id de uma empresa pelo nome.', risk: 'read', params: T.obj({ q: T.str('Nome, fantasia ou CNPJ') }),
    run: async (ctx, i) => {
      const q = norm(i.q);
      const list = (await loadVisible(ctx)).map((r) => { const acts = alive(r.data.activities); return { id: r.id, nome: name(r.data), cnpj: (r.data.company && r.data.company.cnpj) || '', status: (r.data.company && r.data.company.status) || '', atividades: acts.length, concluidas: acts.filter((a) => a.status === 'concluido').length, reunioes: alive(r.data.meetings).length }; })
        .filter((c) => !q || norm(`${c.nome} ${c.cnpj}`).includes(q)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return { status: 200, json: { total: list.length, empresas: list.slice(0, 60) } };
    } });
  registry.add({ ...base, name: 'empresa_ver_cronograma', summary: 'Mostra uma empresa: equipe, fases, atividades (com ids, status, datas, responsável e subatividades) e reuniões. Use antes de ajustar o cronograma.', risk: 'read',
    params: T.obj({ id: T.str('Id da empresa (empresas_listar)'), somenteAtrasadas: T.bool('Só atividades abertas com prazo vencido') }, ['id']),
    run: async (ctx, i) => {
      const r = (await loadVisible(ctx)).find((x) => x.id === i.id);
      if (!r) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const d = r.data; const today = todayInSp();
      const phases = alive(d.phases).map((p) => ({ id: p.id, nome: p.name }));
      const pn = Object.fromEntries(phases.map((p) => [p.id, p.nome]));
      let acts = alive(d.activities).map((a) => ({
        id: a.id, titulo: a.title, status: a.status, inicio: a.date || '', fim: a.endDate || a.date || '', responsavel: a.responsible || '', fase: pn[a.phase] || '', prioridade: a.priority || '',
        atrasada: a.status !== 'concluido' && !!(a.endDate || a.date) && (a.endDate || a.date) < today,
        subatividades: alive(a.subactivities).map((s) => ({ id: s.id, titulo: s.title, feita: !!s.done, pulada: !!s.skipped, data: s.date || '', responsavel: s.responsible || '', tipo: s.kind || 'trabalho' })),
      }));
      if (i.somenteAtrasadas) acts = acts.filter((a) => a.atrasada);
      const meetings = alive(d.meetings).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12).map((m) => ({ id: m.id, titulo: m.title, data: m.date, tarefasAbertas: alive(m.actionItems).filter((t) => !['concluida', 'nao-relevante'].includes(t.status)).length }));
      return { status: 200, json: { hoje: today, empresa: name(d), status: (d.company && d.company.status) || '', equipe: alive(d.team).map((t) => ({ nome: t.name, papel: t.role || '' })), fases: phases, atividades: acts, reunioes: meetings } };
    } });
  registry.add({ ...base, name: 'cronograma_simular', summary: 'SIMULA ajustes no cronograma de uma empresa sem gravar nada: mostra o que mudaria e aponta operações inválidas. Sempre simule antes de aplicar mudanças grandes.', risk: 'read',
    params: T.obj({ id: T.str('Id da empresa'), ops: opsSchema }, ['id', 'ops']),
    run: async (ctx, i) => {
      const r = (await loadVisible(ctx)).find((x) => x.id === i.id);
      if (!r) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const out = applyPlanOps(r.data, i.ops, who(ctx));
      if (out.errors.length) return { status: 400, json: { message: 'Há operações inválidas; nada seria gravado.', errors: out.errors } };
      return { status: 200, json: { simulacao: true, mudariam: out.results.length, resultados: out.results } };
    } });
  registry.add({ ...base, name: 'cronograma_aplicar', summary: 'APLICA ajustes no cronograma de uma empresa (status, datas, responsáveis, subatividades, atividades novas; excluir vai para a lixeira). Tudo ou nada. '
    + 'Mais de uma operação, ou qualquer exclusão, pede confirmação do usuário. Preserve as regras: responsável precisa estar na equipe da empresa.', risk: 'write',
    params: T.obj({ id: T.str('Id da empresa'), ops: opsSchema, motivo: T.str('Por quê (vai para o Log da empresa)', { maxLength: 300 }) }, ['id', 'ops']),
    bulk: (i) => i.ops.length, confirm: (i) => i.ops.some((o) => /delete$/.test(String(o.op))), bulkNote: 'Para vários ajustes, simule primeiro com cronograma_simular.',
    describe: (i) => `Aplicar ${i.ops.length} ajuste(s) no cronograma da empresa${i.ops.some((o) => /delete$/.test(String(o.op))) ? ' (inclui EXCLUSÃO)' : ''}${i.motivo ? ` — ${i.motivo}` : ''}.`,
    undo: (i, b, r) => (r && Array.isArray(r.undo) && r.undo.length ? { tool: 'cronograma_aplicar', input: { id: i.id, ops: r.undo, motivo: 'desfazer ajuste anterior da RENATA' }, label: 'desfazer o ajuste do cronograma' } : null),
    run: (ctx, i) => withProject(ctx, i.id, (data, h) => {
      const out = applyPlanOps(data, i.ops, h.who);
      if (out.errors.length) return { status: 400, json: { message: 'Nada foi gravado: há operações inválidas.', errors: out.errors } };
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
}
