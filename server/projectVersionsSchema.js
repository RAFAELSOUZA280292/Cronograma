// Versionamento do cronograma (§83): tabela `project_versions` + gatilhos em `projects`. A captura mora no BANCO de propósito: `projects.data` é gravado inteiro por ~17 pontos do
// servidor (PATCH da tela, API de conectividade, RENATA, triagem, padrão…); um gatilho cobre todos eles, inclusive os que ainda vão existir, e nunca depende de alguém lembrar de chamar.
//  - UPDATE que muda activities/phases/team  -> guarda o estado ANTERIOR (ponto de restauração). Várias gravações seguidas da mesma pessoa/origem numa janela de 5 min viram UM ponto (autosave).
//  - DELETE da empresa                       -> guarda o documento INTEIRO (`pre_delete`), para recriar a empresa.
//  - O gatilho nunca derruba a gravação de negócio: qualquer falha dele vira WARNING e a gravação segue.
//  - Quem fez: `app.actor_id/app.actor_name/app.origin`, definidos por server/projectAudit.js antes de cada gravação em `projects`.
export const COALESCE_MINUTES = 5;

export async function ensureProjectVersionsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_versions (
      id            BIGSERIAL PRIMARY KEY,
      project_id    TEXT NOT NULL,
      org_id        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      kind          TEXT NOT NULL DEFAULT 'auto',
      label         TEXT NOT NULL DEFAULT '',
      actor_id      TEXT NOT NULL DEFAULT '',
      actor_name    TEXT NOT NULL DEFAULT '',
      origin        TEXT NOT NULL DEFAULT '',
      company_name  TEXT NOT NULL DEFAULT '',
      snapshot      JSONB NOT NULL,
      stats         JSONB NOT NULL DEFAULT '{}'::jsonb,
      touched       JSONB NOT NULL DEFAULT '{}'::jsonb,
      restored_from BIGINT,
      last_write_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_versions_project_idx ON project_versions(project_id, id DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_versions_org_kind_idx ON project_versions(org_id, kind, created_at DESC)`);

  await pool.query(`
    CREATE OR REPLACE FUNCTION pv_schedule(d jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
      SELECT jsonb_build_object(
        'activities', CASE WHEN jsonb_typeof(d->'activities') = 'array' THEN d->'activities' ELSE '[]'::jsonb END,
        'phases',     CASE WHEN jsonb_typeof(d->'phases') = 'array' THEN d->'phases' ELSE '[]'::jsonb END,
        'team',       CASE WHEN jsonb_typeof(d->'team') = 'array' THEN d->'team' ELSE '[]'::jsonb END)
    $$
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION pv_stats(d jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
      WITH s AS (SELECT pv_schedule(d) AS v),
      acts AS (SELECT a FROM s, jsonb_array_elements(s.v->'activities') a WHERE jsonb_typeof(a) = 'object' AND coalesce(a->>'deleted','false') <> 'true'),
      subs AS (SELECT x FROM acts, jsonb_array_elements(CASE WHEN jsonb_typeof(acts.a->'subactivities') = 'array' THEN acts.a->'subactivities' ELSE '[]'::jsonb END) x
               WHERE jsonb_typeof(x) = 'object' AND coalesce(x->>'deleted','false') <> 'true')
      SELECT jsonb_build_object('activities', (SELECT count(*) FROM acts), 'subs', (SELECT count(*) FROM subs), 'done', (SELECT count(*) FROM subs WHERE x->>'done' = 'true'))
    $$
  `);
  // Resumo de "o que mudou" entre dois estados (por id de atividade); o detalhe campo a campo é calculado na consulta (shared/scheduleVersion.js).
  await pool.query(`
    CREATE OR REPLACE FUNCTION pv_touched(o jsonb, n jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
      WITH oa AS (SELECT a FROM jsonb_array_elements(o->'activities') a WHERE jsonb_typeof(a) = 'object'),
           na AS (SELECT a FROM jsonb_array_elements(n->'activities') a WHERE jsonb_typeof(a) = 'object'),
           ch AS (SELECT jsonb_build_object('id', na.a->>'id', 'title', left(coalesce(na.a->>'title',''), 80)) j FROM na JOIN oa ON oa.a->>'id' = na.a->>'id' WHERE oa.a IS DISTINCT FROM na.a),
           ad AS (SELECT jsonb_build_object('id', na.a->>'id', 'title', left(coalesce(na.a->>'title',''), 80)) j FROM na WHERE NOT EXISTS (SELECT 1 FROM oa WHERE oa.a->>'id' = na.a->>'id')),
           rm AS (SELECT jsonb_build_object('id', oa.a->>'id', 'title', left(coalesce(oa.a->>'title',''), 80)) j FROM oa WHERE NOT EXISTS (SELECT 1 FROM na WHERE na.a->>'id' = oa.a->>'id'))
      SELECT jsonb_build_object(
        'changed', coalesce((SELECT jsonb_agg(j) FROM (SELECT j FROM ch LIMIT 40) t), '[]'::jsonb), 'changedCount', (SELECT count(*) FROM ch),
        'added',   coalesce((SELECT jsonb_agg(j) FROM (SELECT j FROM ad LIMIT 40) t), '[]'::jsonb), 'addedCount', (SELECT count(*) FROM ad),
        'removed', coalesce((SELECT jsonb_agg(j) FROM (SELECT j FROM rm LIMIT 40) t), '[]'::jsonb), 'removedCount', (SELECT count(*) FROM rm),
        'phases', (o->'phases') IS DISTINCT FROM (n->'phases'), 'team', (o->'team') IS DISTINCT FROM (n->'team'))
    $$
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION project_versions_capture() RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE
      old_s jsonb; new_s jsonb; latest record;
      v_actor_id text; v_actor_name text; v_origin text; v_company text;
    BEGIN
      BEGIN
        v_actor_id := coalesce(nullif(current_setting('app.actor_id', true), ''), '');
        v_actor_name := coalesce(nullif(current_setting('app.actor_name', true), ''), 'Sistema (sem usuário identificado)');
        v_origin := coalesce(nullif(current_setting('app.origin', true), ''), 'sistema');
        IF TG_OP = 'DELETE' THEN
          v_company := coalesce(OLD.data->'company'->>'nomeFantasia', OLD.data->'company'->>'name', '');
          INSERT INTO project_versions (project_id, org_id, kind, label, actor_id, actor_name, origin, company_name, snapshot, stats)
          VALUES (OLD.id, OLD.org_id, 'pre_delete', 'Empresa excluída', v_actor_id, v_actor_name, v_origin, v_company, OLD.data, pv_stats(OLD.data));
          RETURN OLD;
        END IF;
        IF coalesce(current_setting('app.version_skip', true), '') = '1' THEN RETURN NEW; END IF;
        old_s := pv_schedule(OLD.data); new_s := pv_schedule(NEW.data);
        IF old_s IS NOT DISTINCT FROM new_s THEN RETURN NEW; END IF;
        SELECT id, kind, actor_id, origin, created_at, snapshot INTO latest FROM project_versions WHERE project_id = OLD.id ORDER BY id DESC LIMIT 1;
        IF FOUND AND latest.kind = 'auto' AND latest.actor_id = v_actor_id AND latest.origin = v_origin
           AND latest.created_at > now() - interval '${COALESCE_MINUTES} minutes' THEN
          UPDATE project_versions SET touched = pv_touched(latest.snapshot, new_s), last_write_at = now() WHERE id = latest.id;
          RETURN NEW;
        END IF;
        v_company := coalesce(OLD.data->'company'->>'nomeFantasia', OLD.data->'company'->>'name', '');
        INSERT INTO project_versions (project_id, org_id, kind, actor_id, actor_name, origin, company_name, snapshot, stats, touched, last_write_at)
        VALUES (OLD.id, OLD.org_id, 'auto', v_actor_id, v_actor_name, v_origin, v_company, old_s, pv_stats(old_s), pv_touched(old_s, new_s), now());
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'project_versions_capture falhou (a gravação segue): %', SQLERRM;
      END;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END
    $fn$
  `);
  await pool.query(`DROP TRIGGER IF EXISTS project_versions_upd ON projects`);
  await pool.query(`CREATE TRIGGER project_versions_upd BEFORE UPDATE OF data ON projects FOR EACH ROW EXECUTE FUNCTION project_versions_capture()`);
  await pool.query(`DROP TRIGGER IF EXISTS project_versions_del ON projects`);
  await pool.query(`CREATE TRIGGER project_versions_del BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION project_versions_capture()`);
}
