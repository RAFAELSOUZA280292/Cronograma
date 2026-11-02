// Cria (uma vez) a organização e os usuários do teste de fluxos no banco local `cronograma_e2e`. Idempotente. Senha só de teste, local.
import bcrypt from 'bcryptjs';
import { LAUNCH_TOUR_ID } from '../shared/launchTour.js';
export const ORG = 'e2e-org';
export const PASS = 'E2e-senha-local-1';
export const USERS = { master: 'e2e_master', vendedor: 'e2e_vendedor' };

export default async function setup() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')) throw new Error('banco não é local');
  const { pool } = await import('../server/db.js');
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO organizations (id, slug, name) VALUES ($1,'e2e-org','Organização de teste') ON CONFLICT (id) DO NOTHING`, [ORG]);
  const mk = (id, name, role, crm, xflow = '') => pool.query(
    `INSERT INTO users (id,username,password_hash,name,email,role,org_id,companies_access,all_companies_access,crm_role,personal_access,onboarding_done_at,xflow_role)
     VALUES ($1,$1,$2,$3,$4,$5,$6,true,true,$7,true,now(),$8) ON CONFLICT (id) DO UPDATE SET password_hash=EXCLUDED.password_hash, blocked=false, onboarding_done_at=COALESCE(users.onboarding_done_at, now()), xflow_role=EXCLUDED.xflow_role`,
    [id, hash, name, `${id}@teste.local`, role, ORG, crm, xflow]);
  await mk(USERS.master, 'Marina Teste', 'master', '', 'admin');
  await mk(USERS.vendedor, 'Vitor Vendas', 'pricetax', 'vendedor');
  // Estado de partida limpo: o teste da RENATA guarda uma preferência por rodada e o limite é de 15 por pessoa (sem isto, a 16ª rodada falhava).
  await pool.query("UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) - 'renataMemory' WHERE org_id = $1", [ORG]);
  // Boas-vindas obrigatória (§132) cobre a tela inteira: os usuários de teste já a concluíram (a própria tela tem teste em scripts/launch-tour.test.mjs).
  await pool.query(`UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{tours}', COALESCE(preferences->'tours', '{}'::jsonb) || jsonb_build_object($2::text, to_jsonb(now())), true) WHERE org_id = $1`, [ORG, LAUNCH_TOUR_ID]);
  await pool.end();
}
