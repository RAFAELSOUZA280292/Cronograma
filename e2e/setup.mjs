// Cria (uma vez) a organização e os usuários do teste de fluxos no banco local `cronograma_e2e`. Idempotente. Senha só de teste, local.
import bcrypt from 'bcryptjs';
export const ORG = 'e2e-org';
export const PASS = 'E2e-senha-local-1';
export const USERS = { master: 'e2e_master', vendedor: 'e2e_vendedor' };

export default async function setup() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')) throw new Error('banco não é local');
  const { pool } = await import('../server/db.js');
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO organizations (id, slug, name) VALUES ($1,'e2e-org','Organização de teste') ON CONFLICT (id) DO NOTHING`, [ORG]);
  const mk = (id, name, role, crm) => pool.query(
    `INSERT INTO users (id,username,password_hash,name,email,role,org_id,companies_access,all_companies_access,crm_role,personal_access,onboarding_done_at)
     VALUES ($1,$1,$2,$3,$4,$5,$6,true,true,$7,true,now()) ON CONFLICT (id) DO UPDATE SET password_hash=EXCLUDED.password_hash, blocked=false, onboarding_done_at=COALESCE(users.onboarding_done_at, now())`,
    [id, hash, name, `${id}@teste.local`, role, ORG, crm]);
  await mk(USERS.master, 'Marina Teste', 'master', '');
  await mk(USERS.vendedor, 'Vitor Vendas', 'pricetax', 'vendedor');
  await pool.end();
}
