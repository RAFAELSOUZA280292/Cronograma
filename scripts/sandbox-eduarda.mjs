// Sandbox LOCAL: monta uma organização com os dados reais do backup do PipeRun (sem arquivos/imagens) para testar a rotina da Eduarda. Recusa banco não local.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) { console.error('só local'); process.exit(2); }
import fs from 'node:fs'; import os from 'node:os'; import bcrypt from 'bcryptjs';
const { pool } = await import('../server/db.js');
const { storeRaw } = await import('../server/crm/piperun/extract.js');
const { runMigration } = await import('../server/crm/piperun/migrate.js');
const J = os.homedir() + '/Downloads/PIPERUN_BACKUP/2026-10-25_completo/json/';
const ORG = 'sandbox-edu';
const PASS = process.argv[2];
await pool.query('SELECT 1');
// o histórico do CRM é somente-inserção (gatilho): no sandbox local desliga os gatilhos só para refazer o ambiente
const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];
for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
for (const t of ['crm_deal_files','crm_deal_tags','crm_activities','crm_notes','crm_deal_stage_history','crm_deal_items','crm_deals','crm_tags','crm_products','crm_pipeline_stages','crm_pipelines','crm_contacts','crm_timeline_events','crm_audit_logs','crm_company_projects','crm_companies','piperun_raw','piperun_map','piperun_runs']) { await pool.query(`DELETE FROM ${t} WHERE org_id=$1`, [ORG]).catch(() => {}); }
for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
await pool.query('DELETE FROM users WHERE org_id=$1', [ORG]); await pool.query('DELETE FROM organizations WHERE id=$1', [ORG]);
await pool.query(`INSERT INTO organizations (id, slug, name) VALUES ($1,'sandbox-edu','Sandbox Eduarda')`, [ORG]);
const hash = await bcrypt.hash(PASS, 10);
const mk = (id, name, role, crm, email) => pool.query(`INSERT INTO users (id,username,password_hash,name,email,role,org_id,companies_access,all_companies_access,crm_role) VALUES ($1,$1,$2,$3,$4,$5,$6,true,true,$7)`, [id, hash, name, email, role, ORG, crm]);
await mk('sbx_admin', 'Rafael Souza', 'master', '', 'rafael.souza@pricetax.com.br');
await mk('sbx_eduarda', 'Eduarda Costa', 'pricetax', 'vendedor', 'eduarda.costa@pricetax.com.br');
await mk('sbx_felipe', 'Felipe Dal Santo', 'master', '', 'felipedalsanto@pricetax.com.br');
const raw = {};
for (const n of ['users','origins','lostReasons','activityTypes','pipelines','stages','segments','companies','persons','customFields','deals','notes','activities','files','proposals','tags','items','emails','histories']) raw[n] = JSON.parse(fs.readFileSync(J + n + '.json', 'utf8'));
raw.cnaes = Object.values(JSON.parse(fs.readFileSync(J + 'cnaes_usados.json', 'utf8'))).filter(Boolean);
for (const [e, rows] of Object.entries(raw)) await storeRaw(ORG, e, rows);
const res = await runMigration(ORG, { id: 'sbx_admin', name: 'Rafael Souza' }, { ownerMap: {}, includeFiles: false });
console.log(JSON.stringify({ deals: res.deals, notes: res.notes, acts: res.activities, extras: res.dealExtras }));
const { rows } = await pool.query(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND owner_id='sbx_eduarda'`, [ORG]);
console.log('negócios da Eduarda no sandbox:', rows[0].n);
await pool.end();
