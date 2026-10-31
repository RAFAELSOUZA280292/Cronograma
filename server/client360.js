// Cliente 360 (Onda 3, I1), o caminho inverso: da empresa do CRONOGRAMA para o CRM. A ficha do CRM já mostra os projetos vinculados; aqui a tela da empresa
// no cronograma ganha o lado comercial (negócios, última interação, responsável) e a mesma faixa de alertas. Só leitura, só quem tem acesso à empresa E ao CRM.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { canAccessProject, effectiveOrgId } from './routes.js';
import { crmCan } from './crm/permissions.js';
import { getCompanyOverview } from './crm/queries.js';
import { onlyDigits } from './crm/text.js';

export const router = Router();
router.use(requireAuth);

const compactDeal = (d) => ({ id: d.id, title: d.title, stageName: d.stageName, value: d.value, daysInStage: d.daysInStage, nextActivityTitle: d.nextActivityTitle || '', nextActivityDate: d.nextActivityDate || '', ownerName: d.ownerName || '' });

router.get('/project/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'cliente' || !crmCan(req.user, 'read')) return res.json({ available: false });
    const orgId = effectiveOrgId(req);
    const { rows: pr } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [String(req.params.id).slice(0, 80)]);
    if (!pr[0] || pr[0].org_id !== orgId || !canAccessProject(req.user, pr[0].data, pr[0].org_id)) return res.status(404).json({ message: 'Empresa não encontrada.' });
    const { rows: link } = await pool.query(
      'SELECT cp.company_id FROM crm_company_projects cp JOIN crm_companies c ON c.id = cp.company_id WHERE cp.project_id=$1 AND c.org_id=$2 AND c.deleted_at IS NULL', [req.params.id, orgId]);
    if (!link[0]) {
      // Sem vínculo: sugere a empresa do CRM de mesmo CNPJ (só sugere; vincular é feito pela ficha do CRM, por quem pode gravar lá).
      const cnpj = onlyDigits(pr[0].data && pr[0].data.company && pr[0].data.company.cnpj);
      let suggestion = null;
      if (cnpj.length === 14) {
        const { rows } = await pool.query(`SELECT id, COALESCE(NULLIF(trade_name,''), legal_name) AS name FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL AND regexp_replace(cnpj,'\\D','','g')=$2 LIMIT 1`, [orgId, cnpj]);
        if (rows[0]) suggestion = { companyId: rows[0].id, name: rows[0].name };
      }
      return res.json({ available: true, linked: false, suggestion });
    }
    const o = await getCompanyOverview(orgId, link[0].company_id);
    const open = o.deals.filter((d) => d.status === 'open');
    res.json({
      available: true, linked: true,
      company: { id: o.company.id, name: o.company.tradeName || o.company.legalName, relationship: o.company.relationship, ownerName: o.company.ownerName || '' },
      kpis: { openDeals: o.kpis.openDeals, openDealsValue: o.kpis.openDealsValue, daysSinceInteraction: o.kpis.daysSinceInteraction, openActivities: o.kpis.openActivities, overdueActivities: o.kpis.overdueActivities },
      deals: open.slice(0, 5).map(compactDeal), openDealsTotal: open.length,
      alerts: o.alerts,
    });
  } catch (e) { next(e); }
});
