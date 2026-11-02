// Cofre do projeto (§124): a RENATA só LISTA o que existe (nome, tipo, pasta, validade do certificado) para orientar a pessoa e sugerir o que arquivar.
// Nunca lê usuário, senha, observação nem arquivo: a consulta nem seleciona essas colunas. Incluir, mostrar e copiar é sempre pela aba Cofre.
import { T } from '../validate.js';
import { pool } from '../../db.js';
import { canAccessProject } from '../../routes.js';
import { todayInSp } from '../../widgetSummary.js';
import { renataItem } from '../../projectVaultCore.js';

const staff = (u) => !!u && (u.isSuperAdmin || u.role === 'master' || u.role === 'pricetax');
const SAFE_COLS = 'id, kind, title, folder, tags, url, (secret_enc IS NOT NULL) AS secret_enc, cert_holder, cert_valid_until, file_name, file_size, created_by_name, created_at';

export function registerCofre(registry) {
  registry.add({ module: 'Empresas (cronogramas)', risk: 'read', name: 'cofre_listar',
    summary: 'Lista o COFRE de uma empresa (aba Cofre): acessos a sistemas (ex.: X da Questão, e-CAC, portal da prefeitura), certificado digital A1 com validade, contratos, procurações, PDFs de entrega, links e notas. Devolve nome, tipo, pasta, etiquetas, se há senha guardada e a situação do certificado — NUNCA usuário nem senha. Use para dizer onde está um documento ou acesso do projeto e para avisar certificado vencendo.',
    visible: staff, params: T.obj({ empresaId: T.str('Id da empresa (use empresas_listar)'), busca: T.str('Opcional: parte do nome, pasta ou etiqueta') }, ['empresaId']),
    run: async (ctx, i) => {
      const { rows: pr } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [i.empresaId]);
      const p = pr[0];
      if (!p || p.org_id !== ctx.orgId || !canAccessProject(ctx.user, p.data, p.org_id)) return { status: 404, json: { message: 'Empresa não encontrada (ou sem acesso).' } };
      const { rows } = await pool.query(`SELECT ${SAFE_COLS} FROM project_vault_items WHERE project_id=$1 AND deleted_at IS NULL ORDER BY folder, title`, [p.id]);
      const q = String(i.busca || '').toLowerCase().trim();
      const hit = (r) => !q || [r.title, r.folder, ...(r.tags || [])].some((s) => String(s || '').toLowerCase().includes(q));
      const today = todayInSp();
      const itens = rows.filter(hit).slice(0, 80).map((r) => renataItem(r, today));
      return { status: 200, json: { total: rows.length, itens,
        observacao: 'Senhas e usuários nunca aparecem aqui nem devem ser pedidos: a pessoa usa "Mostrar"/"Copiar" na aba Cofre da empresa (fica registrado no Log). Se o documento ou acesso pedido não está na lista, sugira guardá-lo no Cofre.' } };
    } });
}
