// Tabela do briefing diário (Onda 3, R3): uma linha por pessoa por dia, gravada ANTES de enviar — é o que impede aviso duplicado (mesmo com duas instâncias).
// Arquivo sem imports de propósito: db.js o chama no boot e não pode criar ciclo com o resto do servidor.
export async function ensureBriefingSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS briefing_runs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     DATE NOT NULL,
    total   INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
  )`);
}
