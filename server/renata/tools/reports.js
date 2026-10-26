// Relatórios e visão da equipe (somente leitura) — §101: "o que a minha equipe fez hoje", atrasos por responsável e quem sou eu / quem é a equipe.
// Só equipe PRICETAX (master/pricetax) vê o consolidado da equipe; cada pessoa vê o que a tela já mostraria a ela.
import { T } from '../validate.js';
import { pool } from '../../db.js';
import { canAccessProject } from '../../routes.js';
import { crmCan, crmRoleOf } from '../../crm/permissions.js';
import { todayInSp } from '../../widgetSummary.js';

const alive = (a) => (Array.isArray(a) ? a.filter((x) => x && !x.deleted) : []);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const staff = (u) => !!u && (u.isSuperAdmin || u.role === 'master' || u.role === 'pricetax');
const brDay = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const cname = (d) => (d.company && (d.company.nomeFantasia || d.company.name)) || 'Sem nome';
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function registerReports(registry) {
  const base = { module: 'Relatórios', risk: 'read' };
  registry.add({ ...base, name: 'plataforma_quem_sou_eu', module: 'Plataforma', summary: 'Quem está pedindo: nome, perfil, acessos (Empresas, Gestão de Atividades, XFlow, CRM e perfil no CRM) e a data de hoje com o dia da semana. Use para resolver "hoje", "amanhã", "sexta".', params: T.obj({}),
    run: async (ctx) => {
      const u = ctx.user; const today = todayInSp();
      const wd = WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
      return { status: 200, json: { id: u.id, nome: u.name, perfil: u.role, hoje: today, diaDaSemana: wd, acessos: { empresas: !!u.companiesAccess, gestaoDeAtividades: !!u.personalAccess, xflow: u.xflowRole || null, crm: crmRoleOf(u) || null } } };
    } });
  registry.add({ ...base, name: 'plataforma_pessoas', module: 'Plataforma', summary: 'Pessoas da equipe PRICETAX (id e nome) para traduzir "a Eduarda" em um usuário. Responsáveis de cronograma são nomes; responsáveis do CRM e de XFlow são ids.',
    visible: staff, params: T.obj({ q: T.str('Parte do nome') }),
    run: async (ctx, i) => {
      const { rows } = await pool.query(`SELECT id, name, role, crm_role FROM users WHERE org_id=$1 AND role IN ('master','pricetax') AND blocked=false AND (expires_at IS NULL OR expires_at > now()) ORDER BY name`, [ctx.orgId]);
      const q = String(i.q || '').toLowerCase();
      return { status: 200, json: { pessoas: rows.filter((r) => !q || r.name.toLowerCase().includes(q)).map((r) => ({ id: r.id, nome: r.name, perfil: r.role, perfilCrm: r.crm_role || null })) } };
    } });
  registry.add({ ...base, name: 'relatorio_equipe_dia', summary: 'O que a equipe fez em um dia (padrão hoje): ações registradas nos Logs das empresas e na linha do tempo do CRM, agrupadas por pessoa, com exemplos. Só equipe PRICETAX.', visible: staff,
    params: T.obj({ data: T.date('Dia (AAAA-MM-DD); padrão hoje') }),
    run: async (ctx, i) => {
      const day = i.data || todayInSp(); const people = new Map();
      const add = (who, kind, text) => { const k = who || '(sem nome)'; if (!people.has(k)) people.set(k, { pessoa: k, empresas: 0, crm: 0, exemplos: [] }); const p = people.get(k); p[kind] += 1; if (p.exemplos.length < 6) p.exemplos.push(clip(text, 140)); };
      const { rows } = await pool.query(`SELECT id, org_id, data FROM projects WHERE org_id=$1`, [ctx.orgId]);
      for (const r of rows) {
        if (!canAccessProject(ctx.user, r.data, r.org_id)) continue;
        for (const l of Array.isArray(r.data.log) ? r.data.log : []) if (l && l.ts && brDay(l.ts) === day) add(String(l.user || '').replace(/^RENATA \(IA, a pedido de (.+)\)$/, 'RENATA para $1'), 'empresas', `${cname(r.data)}: ${l.action}`);
      }
      if (crmCan(ctx.user, 'read')) {
        const { rows: tl } = await pool.query(`SELECT actor_name, summary FROM crm_timeline_events WHERE org_id=$1 AND (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date ORDER BY occurred_at DESC LIMIT 400`, [ctx.orgId, day]);
        tl.forEach((t) => add(t.actor_name, 'crm', t.summary));
      }
      const list = [...people.values()].sort((a, b) => (b.empresas + b.crm) - (a.empresas + a.crm));
      return { status: 200, json: { dia: day, pessoas: list.length, total: list.reduce((n, p) => n + p.empresas + p.crm, 0), porPessoa: list.slice(0, 25), observacao: 'Conta o que ficou registrado em Logs e no CRM; trabalho que não gera registro não aparece.' } };
    } });
  registry.add({ ...base, name: 'relatorio_atrasos', summary: 'Atrasos por responsável: atividades de cronograma, tarefas de reunião e atividades do CRM com prazo vencido. Só equipe PRICETAX.', visible: staff, params: T.obj({}),
    run: async (ctx) => {
      const today = todayInSp(); const by = new Map();
      const bump = (who, kind, item) => { const k = who || '(sem responsável)'; if (!by.has(k)) by.set(k, { responsavel: k, cronograma: 0, tarefasReuniao: 0, crm: 0, exemplos: [] }); const p = by.get(k); p[kind] += 1; if (p.exemplos.length < 5) p.exemplos.push(clip(item, 120)); };
      const { rows } = await pool.query(`SELECT id, org_id, data FROM projects WHERE org_id=$1`, [ctx.orgId]);
      for (const r of rows) {
        if (!canAccessProject(ctx.user, r.data, r.org_id) || (r.data.company && r.data.company.status === 'pausado')) continue;
        for (const a of alive(r.data.activities)) { const due = a.endDate || a.date; if (a.status !== 'concluido' && due && due < today) bump(a.responsible, 'cronograma', `${cname(r.data)} — ${a.title} (venceu ${due})`); }
        for (const m of alive(r.data.meetings)) for (const t of alive(m.actionItems)) if (!['concluida', 'nao-relevante'].includes(t.status) && t.dueDate && t.dueDate < today) bump(t.responsible, 'tarefasReuniao', `${cname(r.data)} — ${t.title} (venceu ${t.dueDate})`);
      }
      if (crmCan(ctx.user, 'read')) {
        const { rows: ca } = await pool.query(`SELECT COALESCE(u.name,'(sem responsável)') AS owner, a.title, to_char(a.due_date,'YYYY-MM-DD') AS due FROM crm_activities a LEFT JOIN users u ON u.id=a.owner_id WHERE a.org_id=$1 AND a.status='open' AND a.deleted_at IS NULL AND a.due_date < $2::date`, [ctx.orgId, today]);
        ca.forEach((x) => bump(x.owner, 'crm', `CRM — ${x.title} (venceu ${x.due})`));
      }
      const list = [...by.values()].map((p) => ({ ...p, total: p.cronograma + p.tarefasReuniao + p.crm })).sort((a, b) => b.total - a.total);
      return { status: 200, json: { hoje: today, pessoas: list.length, total: list.reduce((n, p) => n + p.total, 0), porResponsavel: list.slice(0, 30) } };
    } });
}
