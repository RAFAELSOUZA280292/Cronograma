// Teste do cofre (M2): cifra/decifra, aceita texto puro antigo e a migração é idempotente. Banco local.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev JWT_SECRET=teste node scripts/secret-box.test.mjs
import assert from 'node:assert/strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'teste-local';
const { seal, open, isSealed } = await import('../server/secretBox.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const s1 = seal('ya29.token-de-acesso'); const s2 = seal('ya29.token-de-acesso');
ok(isSealed(s1) && !s1.includes('ya29'), 'cifrado não contém o texto');
ok(s1 !== s2, 'cada cifra usa IV novo');
ok(open(s1) === 'ya29.token-de-acesso', 'decifra');
ok(open('texto-puro-antigo') === 'texto-puro-antigo', 'texto puro antigo segue legível');
ok(seal(s1) === s1, 'não cifra duas vezes');
ok(open(null) === null && seal(null) === null && seal('') === '', 'nulos');
const bad = s1.slice(0, -4) + 'AAAA'; ok(open(bad) === null, 'adulterado devolve null');
process.env.JWT_SECRET = 'outro'; ok(open(s1) === null, 'segredo trocado devolve null (reconectar)');
process.env.JWT_SECRET = 'teste-local';
if (process.env.DATABASE_URL && /localhost/.test(process.env.DATABASE_URL)) {
  const { pool } = await import('../server/db.js');
  const { sealLegacyGoogleTokens } = await import('../server/googleCalendar.js');
  const uid = `sbx_gtest_${Date.now()}`;
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id) VALUES ($1,$1,'x',$1,'pricetax','sandbox-edu')`, [uid]);
  await pool.query(`INSERT INTO google_calendar_connections (user_id, access_token, refresh_token, token_expiry) VALUES ($1,'acesso-puro','refresh-puro', now())`, [uid]);
  ok((await sealLegacyGoogleTokens()) >= 1, 'migração cifrou a linha antiga');
  const r = (await pool.query('SELECT access_token, refresh_token FROM google_calendar_connections WHERE user_id=$1', [uid])).rows[0];
  ok(isSealed(r.access_token) && isSealed(r.refresh_token) && open(r.access_token) === 'acesso-puro' && open(r.refresh_token) === 'refresh-puro', 'banco guarda cifrado e decifra igual');
  ok((await sealLegacyGoogleTokens()) === 0, 'segunda execução não faz nada');
  await pool.query('DELETE FROM google_calendar_connections WHERE user_id=$1', [uid]); await pool.query('DELETE FROM users WHERE id=$1', [uid]); await pool.end();
}
console.log(`secret-box: ${n} checagens OK`);
