// Detecção de duplicidade (PRD 42). CNPJ igual = bloqueia; nome parecido ou
// e-mail/telefone iguais = só avisa ("Possível registro duplicado") e deixa o
// usuário confirmar. Volume por organização é pequeno (centenas), então a
// comparação de nome roda em JS sobre as empresas da org — sem depender de
// extensão do Postgres (pg_trgm) que talvez não exista em produção.
import { companyNameKey, similarity, onlyDigits } from './text.js';

const NAME_THRESHOLD = 0.85;

function brief(r) {
  return { id: r.id, legalName: r.legal_name, tradeName: r.trade_name, cnpj: r.cnpj };
}

export async function findCompanyDuplicates(db, orgId, { cnpj, legalName, tradeName, excludeId }) {
  const digits = onlyDigits(cnpj);
  let exactCnpj = null;
  if (digits.length === 14) {
    const { rows } = await db.query(
      `SELECT id, legal_name, trade_name, cnpj FROM crm_companies
       WHERE org_id=$1 AND cnpj=$2 AND deleted_at IS NULL AND ($3::uuid IS NULL OR id<>$3::uuid)`,
      [orgId, digits, excludeId || null],
    );
    exactCnpj = rows[0] ? brief(rows[0]) : null;
  }
  const keys = [legalName, tradeName].map(companyNameKey).filter(Boolean);
  const byName = [];
  if (keys.length) {
    const { rows } = await db.query(
      `SELECT id, legal_name, trade_name, cnpj, name_norm FROM crm_companies
       WHERE org_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id<>$2::uuid)`,
      [orgId, excludeId || null],
    );
    for (const r of rows) {
      if (exactCnpj && r.id === exactCnpj.id) continue;
      const theirs = String(r.name_norm || '').split('|').filter(Boolean);
      let best = 0;
      keys.forEach((a) => theirs.forEach((b) => { best = Math.max(best, similarity(a, b)); }));
      if (best >= NAME_THRESHOLD) byName.push({ ...brief(r), score: Math.round(best * 100) / 100 });
    }
    byName.sort((a, b) => b.score - a.score);
  }
  return { exactCnpj, byName: byName.slice(0, 5) };
}

export async function findContactDuplicates(db, orgId, { email, phone, whatsapp, excludeId }) {
  const e = String(email || '').trim().toLowerCase();
  const phones = [phone, whatsapp].map(onlyDigits).filter((p) => p.length >= 8).map((p) => p.slice(-9));
  if (!e && !phones.length) return [];
  const { rows } = await db.query(
    `SELECT k.id, k.first_name, k.last_name, k.email, k.phone, k.whatsapp, k.company_id, c.legal_name AS company_name
     FROM crm_contacts k JOIN crm_companies c ON c.id = k.company_id
     WHERE k.org_id=$1 AND k.deleted_at IS NULL AND ($2::uuid IS NULL OR k.id<>$2::uuid)
       AND ( ($3 <> '' AND lower(k.email) = $3)
          OR right(regexp_replace(k.phone,'\\D','','g'),9) = ANY($4::text[])
          OR right(regexp_replace(k.whatsapp,'\\D','','g'),9) = ANY($4::text[]) )
     LIMIT 5`,
    [orgId, excludeId || null, e, phones],
  );
  return rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email, companyId: r.company_id, companyName: r.company_name }));
}
