// E-mail × CRM (§130): "e-mails com a OKUBO" → empresa, negócio (com link) e a lista das conversas de TODA a equipe com ela (só o
// índice: assunto, data, participantes e quem trocou; o texto continua no Gmail de cada um). Só leitura; só quem acessa o CRM.
import { T } from '../validate.js';
import { crmCan } from '../../crm/permissions.js';
import { pool } from '../../db.js';
import { directoryFor, conversationsFor, companyKeys, radarFor } from '../../mailLinks.js';
import { cleanKey, badgeOf, prettyKey } from '../../mailLinksCore.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const brt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function registerEmailLinks(registry, deps = {}) {
  const dirFor = deps.directoryFor || directoryFor;
  const convFor = deps.conversationsFor || conversationsFor;
  const keysOf = deps.companyKeys || companyKeys;
  const radar = deps.radarFor || radarFor;
  const db = deps.pool || pool;

  registry.add({ module: 'E-mail', name: 'email_vinculos', risk: 'read', visible: (u) => !!u && crmCan(u, 'read'),
    summary: 'Liga e-mails ao CRM: dado o nome da empresa ("OKUBO"), um domínio (okubo.com.br) ou um e-mail, diz se é cliente, lead (com o negócio e a etapa, e o link /crm?negocio=…), parceiro ou se está FORA DO CRM, e lista as conversas de TODA a equipe com ela (assunto, data em Brasília, participantes e quem da equipe trocou). Sem nome, devolve o radar "Negócios fora do CRM" (domínios com troca real que ninguém registrou). Não lê o texto: para isso use email_buscar/email_ler_conversa na caixa da própria pessoa.',
    params: T.obj({ empresa: T.str('Nome da empresa, domínio ou e-mail (vazio = radar dos fora do CRM)') }, []),
    run: async (ctx, i) => {
      const orgId = ctx.user.orgId;
      const q = String(i.empresa || '').trim().slice(0, 120);
      const d = await dirFor(orgId);
      if (!q) {
        const r = await radar(orgId, { limit: 15 });
        return { status: 200, json: { foraDoCrm: r.items.map((x) => ({ dominio: x.key, nome: x.name, conversas: x.conversations, equipe: x.team, ultima: brt(x.lastAt), assunto: x.subject, contatos: x.contacts, avisado: x.reported ? `${x.reported.by} em ${brt(x.reported.at)}` : '' })), total: r.count,
          dica: 'Para registrar, proponha empresa, contato e negócio (regra 9d) ou oriente a usar a faixa amarela da Caixa de e-mail.' } };
      }
      let keys = new Set();
      let target = null;
      const key = cleanKey(q);
      if (key) { keys.add(key); target = d.dir.byKey.get(key) || null; }
      if (!target) {
        const n = fold(q);
        const words = (x) => fold(x).split(/[^a-z0-9]+/).filter(Boolean);
        const exact = d.src.companies.find((c) => fold(c.tradeName) === n || fold(c.legalName) === n);
        const useCompany = async (comp) => {
          keys = (await keysOf(orgId, comp.id)) || new Set();
          target = [...d.dir.byKey.values()].find((t) => t.companyId === comp.id) || { source: 'crm', companyId: comp.id, name: comp.tradeName || comp.legalName, relationship: comp.relationship, dealId: null };
        };
        if (exact) await useCompany(exact);
        else if (!key) {
          // Domínios que a equipe já trocou (inclusive os fora do CRM) antes de procurar por pedaço de nome no CRM.
          const { rows } = await db.query('SELECT DISTINCT k FROM mail_thread_index, unnest(keys) k WHERE org_id=$1 LIMIT 5000', [orgId]);
          for (const r of rows) if (words(r.k.split('@').pop()).some((w) => w.startsWith(n))) keys.add(r.k);
          const known = [...keys].map((k) => d.dir.byKey.get(k)).find(Boolean);
          if (known) target = known;
          else if (!keys.size) {
            const comp = d.src.companies.find((c) => [...words(c.tradeName), ...words(c.legalName)].some((w) => w.startsWith(n)));
            const mark = [...d.dir.byKey.entries()].find(([, t]) => t.source !== 'crm' && words(t.name).some((w) => w.startsWith(n)));
            if (comp) await useCompany(comp);
            else if (mark) { keys.add(mark[0]); target = mark[1]; }
          }
        }
      }
      const { conversations } = await convFor(ctx.user, keys);
      const badge = target ? badgeOf(target) : null;
      return { status: 200, json: {
        consulta: q, dominios: [...keys],
        situacao: badge ? badge.text : keys.size ? `FORA DO CRM (${[...keys].map(prettyKey).join(', ')})` : 'Nenhum e-mail da equipe com essa empresa no índice.',
        empresaCrm: target && target.companyId ? { id: target.companyId, link: `/crm?empresa=${target.companyId}` } : null,
        negocio: target && target.dealId ? { id: target.dealId, titulo: target.dealTitle || '', etapa: target.stage || '', situacao: target.dealStatus === 'won' ? 'ganho' : 'aberto', link: `/crm?negocio=${target.dealId}` } : null,
        conversas: conversations.slice(0, 20).map((c) => ({ assunto: c.subject, ultima: brt(c.lastAt), mensagens: c.msgCount, participantes: c.participants.map((p) => p.name ? `${p.name} <${p.email}>` : p.email), equipe: c.team, naMinhaCaixa: c.mine })),
        aviso: 'Índice só com metadados (o texto fica no Gmail de quem trocou). O índice cresce quando cada pessoa abre a caixa e numa varredura a cada 6 h.',
      } };
    } });
}
