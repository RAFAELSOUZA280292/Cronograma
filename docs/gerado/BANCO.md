# Banco de dados (gerado do Postgres local após `initDb`)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

**72 tabelas.** Sem ORM: SQL direto com `pg`. O esquema nasce em `server/db.js` (função `initDb`, com `CREATE TABLE IF NOT EXISTS` e `ALTER … ADD COLUMN IF NOT EXISTS`, sempre aditivo) e em módulos próprios (`server/crm/`, `server/renata/schema.js`, `server/meetingEditsSchema.js`, `server/projectVersionsSchema.js`). Colunas `jsonb` guardam estruturas flexíveis (a principal: `projects.data`, o cronograma inteiro da empresa).

## Índice das tabelas

| Tabela | Colunas | Colunas jsonb |
|---|---|---|
| [`ai_answer_cache`](#ai_answer_cache) | 20 | `query_embedding`, `structured`, `cited_sources`, `dependency_meeting_ids`, `dependency_fact_ids`, `cited_fact_ids` |
| [`ai_conversations`](#ai_conversations) | 6 |  |
| [`ai_eval_runs`](#ai_eval_runs) | 7 | `results`, `summary_metrics` |
| [`ai_knowledge_entities`](#ai_knowledge_entities) | 10 |  |
| [`ai_knowledge_fact_entities`](#ai_knowledge_fact_entities) | 4 |  |
| [`ai_knowledge_facts`](#ai_knowledge_facts) | 26 | `embedding` |
| [`ai_messages`](#ai_messages) | 21 | `sources`, `scope`, `proposed_action`, `structured`, `cited_fact_ids` |
| [`ai_metrics_events`](#ai_metrics_events) | 6 | `metadata` |
| [`ai_project_insights`](#ai_project_insights) | 5 |  |
| [`api_token_actions`](#api_token_actions) | 8 |  |
| [`api_tokens`](#api_tokens) | 9 |  |
| [`cnpj_cache`](#cnpj_cache) | 3 | `data` |
| [`company_calendar_events`](#company_calendar_events) | 11 | `emails` |
| [`company_share_links`](#company_share_links) | 12 |  |
| [`crm_activities`](#crm_activities) | 25 |  |
| [`crm_activity_google`](#crm_activity_google) | 5 |  |
| [`crm_audit_logs`](#crm_audit_logs) | 9 | `changes` |
| [`crm_cadences`](#crm_cadences) | 11 | `steps` |
| [`crm_companies`](#crm_companies) | 41 |  |
| [`crm_company_projects`](#crm_company_projects) | 4 |  |
| [`crm_contacts`](#crm_contacts) | 22 |  |
| [`crm_deal_files`](#crm_deal_files) | 13 |  |
| [`crm_deal_items`](#crm_deal_items) | 8 |  |
| [`crm_deal_stage_history`](#crm_deal_stage_history) | 12 |  |
| [`crm_deal_tags`](#crm_deal_tags) | 3 |  |
| [`crm_deals`](#crm_deals) | 29 |  |
| [`crm_notes`](#crm_notes) | 16 | `attachments`, `links` |
| [`crm_pipeline_stages`](#crm_pipeline_stages) | 11 |  |
| [`crm_pipelines`](#crm_pipelines) | 9 |  |
| [`crm_products`](#crm_products) | 14 |  |
| [`crm_saved_views`](#crm_saved_views) | 11 | `config` |
| [`crm_tags`](#crm_tags) | 6 |  |
| [`crm_timeline_events`](#crm_timeline_events) | 12 | `data` |
| [`crm_view_defaults`](#crm_view_defaults) | 4 |  |
| [`daily_content`](#daily_content) | 5 | `payload` |
| [`document_template_items`](#document_template_items) | 12 | `link_meta` |
| [`document_templates`](#document_templates) | 18 | `link_meta`, `comments` |
| [`google_calendar_connections`](#google_calendar_connections) | 6 |  |
| [`ip_geo_cache`](#ip_geo_cache) | 7 |  |
| [`knowledge_material_chunks`](#knowledge_material_chunks) | 9 | `embedding` |
| [`knowledge_materials`](#knowledge_materials) | 27 | `tags`, `progress`, `study` |
| [`meeting_edits`](#meeting_edits) | 11 | `changes`, `undo` |
| [`meeting_parecer_advice`](#meeting_parecer_advice) | 6 | `advice` |
| [`meeting_submissions`](#meeting_submissions) | 12 |  |
| [`notifications`](#notifications) | 10 | `target` |
| [`organizations`](#organizations) | 17 | `settings` |
| [`parecer_studies`](#parecer_studies) | 10 | `study` |
| [`pareceres`](#pareceres) | 16 | `comments` |
| [`personal_board_versions`](#personal_board_versions) | 5 | `data` |
| [`personal_boards`](#personal_boards) | 3 | `data` |
| [`personal_card_events`](#personal_card_events) | 4 |  |
| [`piperun_map`](#piperun_map) | 6 |  |
| [`piperun_raw`](#piperun_raw) | 5 | `payload` |
| [`piperun_runs`](#piperun_runs) | 10 | `progress`, `result` |
| [`product_csat`](#product_csat) | 7 |  |
| [`product_events`](#product_events) | 9 |  |
| [`project_dossiers`](#project_dossiers) | 12 | `progress`, `content`, `sources` |
| [`project_meeting_digests`](#project_meeting_digests) | 6 |  |
| [`project_memory_chunks`](#project_memory_chunks) | 16 | `participants`, `source_ref`, `embedding` |
| [`project_versions`](#project_versions) | 15 | `snapshot`, `stats`, `touched` |
| [`projects`](#projects) | 5 | `data` |
| [`push_subscriptions`](#push_subscriptions) | 9 |  |
| [`renata_actions`](#renata_actions) | 23 | `input`, `before`, `after`, `autorizacao`, `undo` |
| [`renata_conversations`](#renata_conversations) | 8 | `messages`, `context` |
| [`standard_plan_draft`](#standard_plan_draft) | 5 | `data` |
| [`standard_plan_versions`](#standard_plan_versions) | 8 | `data`, `summary` |
| [`task_activity_links`](#task_activity_links) | 15 |  |
| [`user_access_events`](#user_access_events) | 10 |  |
| [`user_usage_events`](#user_usage_events) | 11 |  |
| [`users`](#users) | 29 | `allowed_cnpjs`, `widget_views`, `preferences` |
| [`xflow_events`](#xflow_events) | 10 |  |
| [`xflow_tickets`](#xflow_tickets) | 31 | `data`, `time_breakdown` |

## ai_answer_cache

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `standalone_query` | text | não |  |
| `query_embedding` | jsonb | não |  |
| `participant` | text | sim |  |
| `meeting_id` | text | sim |  |
| `kind` | text | sim |  |
| `structured` | jsonb | não |  |
| `cited_sources` | jsonb | não | '[]'::jsonb |
| `has_evidence` | boolean | não | true |
| `data_fingerprint` | text | não |  |
| `hit_count` | integer | não | 0 |
| `created_at` | timestamp with time zone | não | now() |
| `last_used_at` | timestamp with time zone | não | now() |
| `dependency_meeting_ids` | jsonb | não | '[]'::jsonb |
| `dependency_fact_ids` | jsonb | não | '[]'::jsonb |
| `tokens_input` | integer | não | 0 |
| `tokens_output` | integer | não | 0 |
| `cited_fact_ids` | jsonb | não | '[]'::jsonb |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_answer_cache_lookup_idx`: `USING btree (project_id, data_fingerprint)`

## ai_conversations

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `user_id` | text | não |  |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_conversations_user_project_uidx`: `UNIQUE USING btree (project_id, user_id)`

## ai_eval_runs

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `run_at` | timestamp with time zone | não | now() |
| `git_commit` | text | sim |  |
| `eval_set_version` | text | não |  |
| `results` | jsonb | não |  |
| `summary_metrics` | jsonb | não |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_eval_runs_org_idx`: `USING btree (org_id, run_at)`

## ai_knowledge_entities

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `type` | text | não |  |
| `name` | text | não |  |
| `normalized_name` | text | não |  |
| `linked_user_id` | text | sim |  |
| `linked_project_id` | text | sim |  |
| `mention_count` | integer | não | 0 |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Regra (CHECK): `CHECK ((type = ANY (ARRAY['PERSON'::text, 'COMPANY'::text, 'PROJECT'::text, 'LAW'::text, 'PRODUCT'::text, 'TOPIC'::text])))`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (linked_project_id) REFERENCES projects(id) ON DELETE SET NULL`
- Chave estrangeira: `FOREIGN KEY (linked_user_id) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_knowledge_entities_org_type_idx`: `USING btree (org_id, type)`
- `ai_knowledge_entities_org_type_name_uidx`: `UNIQUE USING btree (org_id, type, normalized_name)`

## ai_knowledge_fact_entities

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `fact_id` | text | não |  |
| `entity_id` | text | não |  |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (entity_id) REFERENCES ai_knowledge_entities(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (fact_id) REFERENCES ai_knowledge_facts(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_knowledge_fact_entities_entity_idx`: `USING btree (entity_id)`
- `ai_knowledge_fact_entities_uidx`: `UNIQUE USING btree (fact_id, entity_id)`

## ai_knowledge_facts

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | sim |  |
| `scope` | text | não |  |
| `subject` | text | não |  |
| `content` | text | não |  |
| `status` | text | não | 'active'::text |
| `superseded_by` | text | sim |  |
| `source_user_id` | text | sim |  |
| `source_conversation_id` | text | sim |  |
| `embedding` | jsonb | sim |  |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |
| `knowledge_type` | text | não | 'FACT'::text |
| `valid_from` | date | sim |  |
| `valid_until` | date | sim |  |
| `origin` | text | não | 'conversation'::text |
| `reference` | text | sim |  |
| `source_date` | date | sim |  |
| `ingested_at` | timestamp with time zone | não | now() |
| `conflicts_with` | text | sim |  |
| `disputed_reviewed_at` | timestamp with time zone | sim |  |
| `disputed_reviewed_by` | text | sim |  |
| `supersede_reason` | text | sim |  |
| `source_meeting_id` | text | sim |  |
| `content_tsv` | tsvector | sim |  |

**Travas do banco:**
- Regra (CHECK): `CHECK ((status = ANY (ARRAY['active'::text, 'disputed'::text, 'superseded'::text, 'pending_validation'::text, 'archived'::text])))`
- Regra (CHECK): `CHECK ((origin = ANY (ARRAY['conversation'::text, 'legislation'::text, 'internal_document'::text, 'methodology'::text, 'best_practice'::text, 'other'::text])))`
- Regra (CHECK): `CHECK ((knowledge_type = ANY (ARRAY['FACT'::text, 'DECISION'::text, 'PREFERENCE'::text, 'RULE'::text, 'HYPOTHESIS'::text, 'PROCEDURE'::text, 'DEFINITION'::text])))`
- Regra (CHECK): `CHECK ((scope = ANY (ARRAY['conversation'::text, 'project'::text, 'org'::text, 'global'::text])))`
- Chave estrangeira: `FOREIGN KEY (superseded_by) REFERENCES ai_knowledge_facts(id)`
- Chave estrangeira: `FOREIGN KEY (source_conversation_id) REFERENCES ai_conversations(id)`
- Chave estrangeira: `FOREIGN KEY (source_user_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (disputed_reviewed_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (conflicts_with) REFERENCES ai_knowledge_facts(id)`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_knowledge_facts_conflicts_idx`: `USING btree (conflicts_with) WHERE (conflicts_with IS NOT NULL)`
- `ai_knowledge_facts_org_idx`: `USING btree (org_id, scope, status)`
- `ai_knowledge_facts_project_idx`: `USING btree (project_id, status)`
- `ai_knowledge_facts_source_meeting_idx`: `USING btree (project_id, source_meeting_id) WHERE (source_meeting_id IS NOT NULL)`
- `ai_knowledge_facts_tsv_idx`: `USING gin (content_tsv)`

## ai_messages

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `conversation_id` | text | não |  |
| `role` | text | não |  |
| `content` | text | não |  |
| `sources` | jsonb | não | '[]'::jsonb |
| `has_evidence` | boolean | sim |  |
| `scope` | jsonb | não | '{}'::jsonb |
| `feedback` | text | sim |  |
| `model` | text | não | ''::text |
| `tokens_input` | integer | sim |  |
| `tokens_output` | integer | sim |  |
| `latency_ms` | integer | sim |  |
| `error` | text | sim |  |
| `created_at` | timestamp with time zone | não | now() |
| `proposed_action` | jsonb | sim |  |
| `action_status` | text | sim |  |
| `structured` | jsonb | sim |  |
| `cited_fact_ids` | jsonb | não | '[]'::jsonb |
| `from_cache` | boolean | não | false |
| `prompt_cache_read_tokens` | integer | não | 0 |
| `prompt_cache_creation_tokens` | integer | não | 0 |

**Travas do banco:**
- Regra (CHECK): `CHECK ((action_status = ANY (ARRAY['pending'::text, 'executed'::text, 'rejected'::text])))`
- Regra (CHECK): `CHECK ((feedback = ANY (ARRAY['up'::text, 'down'::text])))`
- Regra (CHECK): `CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))`
- Chave estrangeira: `FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_messages_cited_facts_idx`: `USING gin (cited_fact_ids jsonb_path_ops)`
- `ai_messages_conversation_idx`: `USING btree (conversation_id, created_at)`

## ai_metrics_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | sim |  |
| `event_type` | text | não |  |
| `metadata` | jsonb | não | '{}'::jsonb |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_metrics_events_type_idx`: `USING btree (org_id, event_type, created_at)`

## ai_project_insights

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `content` | text | não |  |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `ai_project_insights_project_idx`: `USING btree (project_id, created_at)`

## api_token_actions

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | sim |  |
| `token_id` | text | não |  |
| `user_id` | text | não |  |
| `at` | timestamp with time zone | não | now() |
| `method` | text | não |  |
| `path` | text | não |  |
| `status` | integer | não |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (token_id) REFERENCES api_tokens(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `api_token_actions_user_idx`: `USING btree (user_id, at DESC)`

## api_tokens

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `user_id` | text | não |  |
| `name` | text | não |  |
| `scope` | text | não | 'read'::text |
| `token_hash` | text | não |  |
| `created_at` | timestamp with time zone | não | now() |
| `expires_at` | timestamp with time zone | não |  |
| `last_used_at` | timestamp with time zone | sim |  |
| `revoked_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (token_hash)`

**Índices:**
- `api_tokens_token_hash_key`: `UNIQUE USING btree (token_hash)`
- `api_tokens_user_idx`: `USING btree (user_id, created_at DESC)`

## cnpj_cache

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `cnpj` | text | não |  |
| `data` | jsonb | não |  |
| `fetched_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (cnpj)`

## company_calendar_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `project_id` | text | não |  |
| `activity_id` | text | não |  |
| `organizer_user_id` | text | não |  |
| `google_event_id` | text | não |  |
| `start_date` | text | não | ''::text |
| `start_time` | text | não | '10:00'::text |
| `duration_min` | integer | não | 60 |
| `emails` | jsonb | não | '[]'::jsonb |
| `fingerprint` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (project_id, activity_id)`

## company_share_links

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `token` | text | não |  |
| `created_by` | text | não | ''::text |
| `created_by_name` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `expires_at` | timestamp with time zone | sim |  |
| `revoked_at` | timestamp with time zone | sim |  |
| `views` | integer | não | 0 |
| `last_viewed_at` | timestamp with time zone | sim |  |
| `kind` | text | não | 'page'::text |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (token)`

**Índices:**
- `company_share_links_project_idx`: `USING btree (project_id, created_at DESC)`
- `company_share_links_token_key`: `UNIQUE USING btree (token)`

## crm_activities

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `company_id` | uuid | não |  |
| `deal_id` | uuid | sim |  |
| `contact_id` | uuid | sim |  |
| `activity_type` | text | não | 'task'::text |
| `title` | text | não |  |
| `description` | text | não | ''::text |
| `due_date` | date | não |  |
| `due_time` | text | não | ''::text |
| `priority` | text | não | 'normal'::text |
| `status` | text | não | 'open'::text |
| `owner_id` | text | sim |  |
| `completed_at` | timestamp with time zone | sim |  |
| `completed_by` | text | sim |  |
| `outcome` | text | não | ''::text |
| `due_notified_at` | timestamp with time zone | sim |  |
| `created_at` | timestamp with time zone | não | now() |
| `created_by` | text | sim |  |
| `updated_at` | timestamp with time zone | não | now() |
| `updated_by` | text | sim |  |
| `deleted_at` | timestamp with time zone | sim |  |
| `deleted_by` | text | sim |  |
| `cadence_id` | uuid | sim |  |
| `cadence_step` | integer | sim |  |

**Travas do banco:**
- Regra (CHECK): `CHECK ((activity_type = ANY (ARRAY['task'::text, 'call'::text, 'email'::text, 'meeting'::text, 'whatsapp'::text, 'visit'::text, 'followup'::text])))`
- Regra (CHECK): `CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text])))`
- Regra (CHECK): `CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'cancelled'::text])))`
- Chave estrangeira: `FOREIGN KEY (completed_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (deleted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (updated_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (owner_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (contact_id) REFERENCES crm_contacts(id)`
- Chave estrangeira: `FOREIGN KEY (deal_id) REFERENCES crm_deals(id)`
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_activities_cadence_idx`: `USING btree (deal_id) WHERE ((cadence_id IS NOT NULL) AND (status = 'open'::text))`
- `crm_activities_company_idx`: `USING btree (company_id, status, due_date) WHERE (deleted_at IS NULL)`
- `crm_activities_deal_idx`: `USING btree (deal_id, status) WHERE ((deleted_at IS NULL) AND (deal_id IS NOT NULL))`
- `crm_activities_owner_idx`: `USING btree (org_id, owner_id, status, due_date) WHERE (deleted_at IS NULL)`
- `crm_activities_reminder_idx`: `USING btree (due_date) WHERE ((status = 'open'::text) AND (due_notified_at IS NULL) AND (deleted_at IS NULL))`

## crm_activity_google

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `activity_id` | uuid | não |  |
| `user_id` | text | não |  |
| `google_event_id` | text | não |  |
| `html_link` | text | não | ''::text |
| `synced_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (activity_id) REFERENCES crm_activities(id)`
- Chave primária: `PRIMARY KEY (activity_id)`

## crm_audit_logs

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `entity_type` | text | não |  |
| `entity_id` | uuid | não |  |
| `action` | text | não |  |
| `changes` | jsonb | não | '[]'::jsonb |
| `actor_id` | text | sim |  |
| `actor_name` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (actor_id) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_audit_entity_idx`: `USING btree (org_id, entity_type, entity_id, created_at DESC)`

**Gatilhos (triggers):**
- `crm_audit_logs_append_only` (BEFORE DELETE/UPDATE): `EXECUTE FUNCTION crm_block_history_mutation()`

## crm_cadences

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `pipeline_id` | uuid | não |  |
| `stage_id` | uuid | não |  |
| `name` | text | não |  |
| `steps` | jsonb | não | '[]'::jsonb |
| `active` | boolean | não | true |
| `created_at` | timestamp with time zone | não | now() |
| `created_by` | text | sim |  |
| `updated_at` | timestamp with time zone | não | now() |
| `deleted_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (stage_id) REFERENCES crm_pipeline_stages(id)`
- Chave estrangeira: `FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_cadences_stage_uidx`: `UNIQUE USING btree (stage_id) WHERE (deleted_at IS NULL)`

## crm_companies

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `legal_name` | text | não |  |
| `trade_name` | text | não | ''::text |
| `cnpj` | text | não | ''::text |
| `economic_group` | text | não | ''::text |
| `branch_type` | text | não | ''::text |
| `website` | text | não | ''::text |
| `segment` | text | não | ''::text |
| `cnae` | text | não | ''::text |
| `city` | text | não | ''::text |
| `state` | text | não | ''::text |
| `country` | text | não | 'Brasil'::text |
| `relationship` | text | não | 'prospect'::text |
| `source` | text | não | ''::text |
| `owner_id` | text | sim |  |
| `entered_at` | date | sim |  |
| `client_since` | date | sim |  |
| `company_size` | text | não | ''::text |
| `tax_regime` | text | não | ''::text |
| `revenue_estimate` | numeric | sim |  |
| `employees` | integer | sim |  |
| `erp` | text | não | ''::text |
| `strategic_level` | text | não | ''::text |
| `name_norm` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `created_by` | text | sim |  |
| `updated_at` | timestamp with time zone | não | now() |
| `updated_by` | text | sim |  |
| `deleted_at` | timestamp with time zone | sim |  |
| `deleted_by` | text | sim |  |
| `phone` | text | não | ''::text |
| `contact_email` | text | não | ''::text |
| `zip_code` | text | não | ''::text |
| `street` | text | não | ''::text |
| `street_number` | text | não | ''::text |
| `complement` | text | não | ''::text |
| `district` | text | não | ''::text |
| `founded_at` | date | sim |  |
| `share_capital` | numeric | sim |  |
| `cnae_secondary` | text | não | ''::text |

**Travas do banco:**
- Regra (CHECK): `CHECK ((relationship = ANY (ARRAY['prospect'::text, 'client'::text, 'former_client'::text, 'partner'::text])))`
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (deleted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (updated_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (owner_id) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_companies_name_idx`: `USING btree (org_id, name_norm)`
- `crm_companies_org_cnpj_uidx`: `UNIQUE USING btree (org_id, cnpj) WHERE ((cnpj <> ''::text) AND (deleted_at IS NULL))`
- `crm_companies_org_idx`: `USING btree (org_id, deleted_at, relationship)`

## crm_company_projects

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `company_id` | uuid | não |  |
| `project_id` | text | não |  |
| `linked_at` | timestamp with time zone | não | now() |
| `linked_by` | text | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (linked_by) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (company_id, project_id)`

**Índices:**
- `crm_company_projects_project_uidx`: `UNIQUE USING btree (project_id)`

## crm_contacts

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `company_id` | uuid | não |  |
| `first_name` | text | não |  |
| `last_name` | text | não | ''::text |
| `job_title` | text | não | ''::text |
| `department` | text | não | ''::text |
| `email` | text | não | ''::text |
| `phone` | text | não | ''::text |
| `whatsapp` | text | não | ''::text |
| `linkedin` | text | não | ''::text |
| `influence` | text | não | ''::text |
| `decision_role` | text | não | ''::text |
| `relationship_strength` | text | não | ''::text |
| `is_primary` | boolean | não | false |
| `name_norm` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `created_by` | text | sim |  |
| `updated_at` | timestamp with time zone | não | now() |
| `updated_by` | text | sim |  |
| `deleted_at` | timestamp with time zone | sim |  |
| `deleted_by` | text | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (deleted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (updated_by) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_contacts_company_idx`: `USING btree (org_id, company_id, deleted_at)`
- `crm_contacts_email_idx`: `USING btree (org_id, email) WHERE (email <> ''::text)`

## crm_deal_files

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `deal_id` | uuid | não |  |
| `company_id` | uuid | não |  |
| `name` | text | não |  |
| `mime` | text | não | 'application/octet-stream'::text |
| `size` | integer | não | 0 |
| `data` | bytea | não |  |
| `source` | text | não | ''::text |
| `external_id` | text | não | ''::text |
| `created_by` | text | sim |  |
| `created_at` | timestamp with time zone | não | now() |
| `deleted_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (deal_id) REFERENCES crm_deals(id)`
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_deal_files_deal_idx`: `USING btree (org_id, deal_id) WHERE (deleted_at IS NULL)`
- `crm_deal_files_ext_uidx`: `UNIQUE USING btree (org_id, source, external_id) WHERE ((external_id <> ''::text) AND (deleted_at IS NULL))`

## crm_deal_items

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `deal_id` | uuid | não |  |
| `product_id` | uuid | sim |  |
| `name` | text | não |  |
| `quantity` | numeric | não | 1 |
| `unit_price` | numeric | não | 0 |
| `position` | integer | não | 0 |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (deal_id) REFERENCES crm_deals(id)`
- Chave estrangeira: `FOREIGN KEY (product_id) REFERENCES crm_products(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_deal_items_deal_idx`: `USING btree (deal_id, "position")`

## crm_deal_stage_history

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `deal_id` | uuid | não |  |
| `company_id` | uuid | não |  |
| `from_stage_id` | uuid | sim |  |
| `to_stage_id` | uuid | não |  |
| `from_stage_name` | text | não | ''::text |
| `to_stage_name` | text | não |  |
| `days_in_from` | numeric | sim |  |
| `actor_id` | text | sim |  |
| `actor_name` | text | não | ''::text |
| `moved_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave estrangeira: `FOREIGN KEY (actor_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (deal_id) REFERENCES crm_deals(id)`
- Chave estrangeira: `FOREIGN KEY (to_stage_id) REFERENCES crm_pipeline_stages(id)`
- Chave estrangeira: `FOREIGN KEY (from_stage_id) REFERENCES crm_pipeline_stages(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_deal_stage_history_deal_idx`: `USING btree (deal_id, moved_at)`

**Gatilhos (triggers):**
- `crm_deal_stage_history_append_only` (BEFORE DELETE/UPDATE): `EXECUTE FUNCTION crm_block_history_mutation()`

## crm_deal_tags

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `org_id` | text | não |  |
| `deal_id` | uuid | não |  |
| `tag_id` | uuid | não |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (tag_id) REFERENCES crm_tags(id)`
- Chave estrangeira: `FOREIGN KEY (deal_id) REFERENCES crm_deals(id)`
- Chave primária: `PRIMARY KEY (deal_id, tag_id)`

**Índices:**
- `crm_deal_tags_tag_idx`: `USING btree (tag_id)`

## crm_deals

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `company_id` | uuid | não |  |
| `pipeline_id` | uuid | não |  |
| `stage_id` | uuid | não |  |
| `title` | text | não |  |
| `deal_type` | text | não | 'new'::text |
| `value` | numeric | não | 0 |
| `expected_close_date` | date | sim |  |
| `probability_override` | integer | sim |  |
| `owner_id` | text | sim |  |
| `primary_contact_id` | uuid | sim |  |
| `source` | text | não | ''::text |
| `description` | text | não | ''::text |
| `status` | text | não | 'open'::text |
| `lost_reason` | text | não | ''::text |
| `lost_detail` | text | não | ''::text |
| `closed_at` | timestamp with time zone | sim |  |
| `stage_entered_at` | timestamp with time zone | não | now() |
| `board_order` | double precision | não | 0 |
| `created_at` | timestamp with time zone | não | now() |
| `created_by` | text | sim |  |
| `updated_at` | timestamp with time zone | não | now() |
| `updated_by` | text | sim |  |
| `deleted_at` | timestamp with time zone | sim |  |
| `deleted_by` | text | sim |  |
| `external_source` | text | não | ''::text |
| `external_id` | text | não | ''::text |
| `mrr` | numeric | não | 0 |

**Travas do banco:**
- Regra (CHECK): `CHECK (((probability_override IS NULL) OR ((probability_override >= 0) AND (probability_override <= 100))))`
- Regra (CHECK): `CHECK ((status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))`
- Regra (CHECK): `CHECK ((deal_type = ANY (ARRAY['new'::text, 'upsell'::text])))`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (deleted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (updated_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (primary_contact_id) REFERENCES crm_contacts(id)`
- Chave estrangeira: `FOREIGN KEY (owner_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (stage_id) REFERENCES crm_pipeline_stages(id)`
- Chave estrangeira: `FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines(id)`
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_deals_company_idx`: `USING btree (org_id, company_id, deleted_at)`
- `crm_deals_external_uidx`: `UNIQUE USING btree (org_id, external_source, external_id) WHERE (external_id <> ''::text)`
- `crm_deals_org_idx`: `USING btree (org_id, deleted_at, status, stage_id)`

## crm_notes

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `entity_type` | text | não |  |
| `entity_id` | uuid | não |  |
| `company_id` | uuid | não |  |
| `body` | text | não |  |
| `created_at` | timestamp with time zone | não | now() |
| `created_by` | text | sim |  |
| `updated_at` | timestamp with time zone | não | now() |
| `updated_by` | text | sim |  |
| `deleted_at` | timestamp with time zone | sim |  |
| `deleted_by` | text | sim |  |
| `attachments` | jsonb | não | '[]'::jsonb |
| `links` | jsonb | não | '[]'::jsonb |
| `edited_at` | timestamp with time zone | sim |  |
| `author_name` | text | não | ''::text |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (updated_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (deleted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_notes_entity_idx`: `USING btree (org_id, entity_type, entity_id, deleted_at)`

## crm_pipeline_stages

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `pipeline_id` | uuid | não |  |
| `name` | text | não |  |
| `position` | integer | não |  |
| `probability` | integer | não | 0 |
| `kind` | text | não | 'open'::text |
| `color` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `deleted_at` | timestamp with time zone | sim |  |
| `sla_days` | integer | sim |  |

**Travas do banco:**
- Regra (CHECK): `CHECK ((kind = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))`
- Regra (CHECK): `CHECK (((probability >= 0) AND (probability <= 100)))`
- Chave estrangeira: `FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_stages_pipeline_idx`: `USING btree (pipeline_id, "position")`

## crm_pipelines

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `name` | text | não |  |
| `is_default` | boolean | não | false |
| `created_at` | timestamp with time zone | não | now() |
| `deleted_at` | timestamp with time zone | sim |  |
| `on_won_pipeline_id` | uuid | sim |  |
| `on_won_stage_id` | uuid | sim |  |
| `on_won_from_stage_id` | uuid | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (on_won_pipeline_id) REFERENCES crm_pipelines(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (on_won_from_stage_id) REFERENCES crm_pipeline_stages(id)`
- Chave estrangeira: `FOREIGN KEY (on_won_stage_id) REFERENCES crm_pipeline_stages(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_pipelines_default_uidx`: `UNIQUE USING btree (org_id) WHERE (is_default AND (deleted_at IS NULL))`

## crm_products

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `name` | text | não |  |
| `category` | text | não | ''::text |
| `description` | text | não | ''::text |
| `list_price` | numeric | sim |  |
| `billing` | text | não | 'one_time'::text |
| `active` | boolean | não | true |
| `created_at` | timestamp with time zone | não | now() |
| `created_by` | text | sim |  |
| `updated_at` | timestamp with time zone | não | now() |
| `updated_by` | text | sim |  |
| `deleted_at` | timestamp with time zone | sim |  |
| `deleted_by` | text | sim |  |

**Travas do banco:**
- Regra (CHECK): `CHECK ((billing = ANY (ARRAY['one_time'::text, 'recurring'::text])))`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (deleted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (updated_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_products_org_idx`: `USING btree (org_id, deleted_at, active)`

## crm_saved_views

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `scope` | text | não |  |
| `user_id` | text | não |  |
| `name` | text | não |  |
| `name_key` | text | não |  |
| `config` | jsonb | não | '{}'::jsonb |
| `shared` | boolean | não | false |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |
| `deleted_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_saved_views_mine_uidx`: `UNIQUE USING btree (org_id, scope, user_id, name_key) WHERE ((NOT shared) AND (deleted_at IS NULL))`
- `crm_saved_views_shared_uidx`: `UNIQUE USING btree (org_id, scope, name_key) WHERE (shared AND (deleted_at IS NULL))`

## crm_tags

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `name` | text | não |  |
| `name_key` | text | não |  |
| `color` | text | não | 'default'::text |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (org_id, name_key)`

**Índices:**
- `crm_tags_org_id_name_key_key`: `UNIQUE USING btree (org_id, name_key)`

## crm_timeline_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | uuid | não |  |
| `org_id` | text | não |  |
| `company_id` | uuid | não |  |
| `entity_type` | text | não |  |
| `entity_id` | uuid | sim |  |
| `event_type` | text | não |  |
| `summary` | text | não |  |
| `data` | jsonb | não | '{}'::jsonb |
| `actor_id` | text | sim |  |
| `actor_name` | text | não | ''::text |
| `occurred_at` | timestamp with time zone | não | now() |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (company_id) REFERENCES crm_companies(id)`
- Chave estrangeira: `FOREIGN KEY (actor_id) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `crm_timeline_company_idx`: `USING btree (company_id, occurred_at DESC)`

**Gatilhos (triggers):**
- `crm_timeline_events_append_only` (BEFORE UPDATE/DELETE): `EXECUTE FUNCTION crm_block_history_mutation()`

## crm_view_defaults

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `org_id` | text | não |  |
| `user_id` | text | não |  |
| `scope` | text | não |  |
| `view_ref` | text | não |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (org_id, user_id, scope)`

## daily_content

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `kind` | text | não |  |
| `key` | text | não |  |
| `day` | date | não |  |
| `payload` | jsonb | não |  |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (kind, key, day)`

## document_template_items

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `template_id` | text | não |  |
| `kind` | text | não | 'file'::text |
| `file_name` | text | sim |  |
| `mime_type` | text | sim |  |
| `file_size` | integer | sim |  |
| `file_data` | bytea | sim |  |
| `url` | text | sim |  |
| `link_meta` | jsonb | sim |  |
| `preview_text` | text | não | ''::text |
| `position` | integer | não | 0 |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `document_template_items_tpl_idx`: `USING btree (template_id, "position")`

## document_templates

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `kind` | text | não | 'file'::text |
| `title` | text | não |  |
| `description` | text | não | ''::text |
| `category` | text | não | ''::text |
| `file_name` | text | sim |  |
| `mime_type` | text | sim |  |
| `file_size` | integer | sim |  |
| `file_data` | bytea | sim |  |
| `url` | text | sim |  |
| `link_meta` | jsonb | sim |  |
| `preview_text` | text | não | ''::text |
| `comments` | jsonb | não | '[]'::jsonb |
| `created_by` | text | sim |  |
| `created_by_name` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `document_templates_org_idx`: `USING btree (org_id, created_at DESC)`

## google_calendar_connections

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `user_id` | text | não |  |
| `access_token` | text | não |  |
| `refresh_token` | text | não |  |
| `token_expiry` | timestamp with time zone | não |  |
| `calendar_id` | text | não | 'primary'::text |
| `connected_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (user_id)`

## ip_geo_cache

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `ip` | text | não |  |
| `city` | text | não | ''::text |
| `region` | text | não | ''::text |
| `country` | text | não | ''::text |
| `fetched_at` | timestamp with time zone | não | now() |
| `latitude` | double precision | sim |  |
| `longitude` | double precision | sim |  |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (ip)`

## knowledge_material_chunks

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `material_id` | text | não |  |
| `org_id` | text | não |  |
| `idx` | integer | não |  |
| `heading` | text | não | ''::text |
| `ref` | text | não | ''::text |
| `content` | text | não |  |
| `embedding` | jsonb | sim |  |
| `content_tsv` | tsvector | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (material_id) REFERENCES knowledge_materials(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `knowledge_material_chunks_mat_idx`: `USING btree (material_id, idx)`
- `knowledge_material_chunks_tsv_idx`: `USING gin (content_tsv)`

## knowledge_materials

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `title` | text | não |  |
| `topic` | text | não | ''::text |
| `tags` | jsonb | não | '[]'::jsonb |
| `note` | text | não | ''::text |
| `source_kind` | text | não | 'file'::text |
| `file_name` | text | não | ''::text |
| `mime_type` | text | não | ''::text |
| `file_size` | integer | não | 0 |
| `file_data` | bytea | sim |  |
| `full_text` | text | não | ''::text |
| `text_hash` | text | não | ''::text |
| `char_count` | integer | não | 0 |
| `chunk_count` | integer | não | 0 |
| `status` | text | não | 'processing'::text |
| `stage` | text | não | ''::text |
| `progress` | jsonb | não | '{}'::jsonb |
| `error` | text | não | ''::text |
| `study` | jsonb | sim |  |
| `study_error` | text | não | ''::text |
| `fact_id` | text | sim |  |
| `created_by` | text | sim |  |
| `created_by_name` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |
| `archived_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `knowledge_materials_org_idx`: `USING btree (org_id, created_at DESC)`

## meeting_edits

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `meeting_id` | text | não |  |
| `token_id` | text | não | ''::text |
| `actor_name` | text | não | ''::text |
| `note` | text | não | ''::text |
| `changes` | jsonb | não | '[]'::jsonb |
| `undo` | jsonb | não | '{}'::jsonb |
| `undone_at` | timestamp with time zone | sim |  |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `meeting_edits_meeting_idx`: `USING btree (project_id, meeting_id, created_at DESC)`

## meeting_parecer_advice

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `project_id` | text | não |  |
| `meeting_id` | text | não |  |
| `org_id` | text | não |  |
| `advice` | jsonb | não | '{}'::jsonb |
| `signature` | text | não | ''::text |
| `generated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (project_id, meeting_id)`

## meeting_submissions

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `submitted_by` | text | não |  |
| `transcript` | text | não |  |
| `manual_date` | text | não | ''::text |
| `manual_time` | text | não | ''::text |
| `status` | text | não | 'pending'::text |
| `error_message` | text | não | ''::text |
| `meeting_id` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `processed_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Regra (CHECK): `CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])))`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (submitted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

## notifications

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `user_id` | text | não |  |
| `type` | text | não |  |
| `title` | text | não |  |
| `body` | text | não |  |
| `actor_name` | text | não | ''::text |
| `target` | jsonb | não | '{}'::jsonb |
| `read` | boolean | não | false |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `notifications_user_idx`: `USING btree (user_id, read, created_at DESC)`

## organizations

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `slug` | text | não |  |
| `name` | text | não |  |
| `display_name` | text | não | ''::text |
| `logo_light` | text | não | ''::text |
| `logo_dark` | text | não | ''::text |
| `favicon` | text | não | ''::text |
| `primary_color` | text | não | '#F5C400'::text |
| `secondary_color` | text | não | ''::text |
| `login_background` | text | não | ''::text |
| `status` | text | não | 'active'::text |
| `plan` | text | não | 'default'::text |
| `max_users` | integer | sim |  |
| `max_companies` | integer | sim |  |
| `settings` | jsonb | não | '{}'::jsonb |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Regra (CHECK): `CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'blocked'::text])))`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (slug)`

**Índices:**
- `organizations_slug_key`: `UNIQUE USING btree (slug)`

## parecer_studies

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `parecer_id` | text | não |  |
| `org_id` | text | não |  |
| `file_hash` | text | não | ''::text |
| `status` | text | não | 'running'::text |
| `study` | jsonb | sim |  |
| `fact_id` | text | sim |  |
| `model` | text | não | ''::text |
| `error` | text | não | ''::text |
| `started_at` | timestamp with time zone | não | now() |
| `studied_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (parecer_id) REFERENCES pareceres(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (parecer_id)`

**Índices:**
- `parecer_studies_org_idx`: `USING btree (org_id, status)`

## pareceres

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `title` | text | não |  |
| `description` | text | não | ''::text |
| `file_name` | text | não |  |
| `mime_type` | text | não | 'application/pdf'::text |
| `file_size` | integer | não |  |
| `file_data` | bytea | não |  |
| `comments` | jsonb | não | '[]'::jsonb |
| `created_by` | text | sim |  |
| `created_by_name` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |
| `scope` | text | não | 'geral'::text |
| `company_project_id` | text | sim |  |
| `company_name` | text | não | ''::text |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (company_project_id) REFERENCES projects(id) ON DELETE SET NULL`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `pareceres_org_idx`: `USING btree (org_id, created_at DESC)`
- `pareceres_scope_idx`: `USING btree (org_id, scope)`

## personal_board_versions

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('personal_board_versions_id_seq'::regclas… |
| `user_id` | text | não |  |
| `data` | jsonb | não |  |
| `reason` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `personal_board_versions_user_idx`: `USING btree (user_id, created_at DESC)`

## personal_boards

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `user_id` | text | não |  |
| `data` | jsonb | não |  |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (user_id)`

## personal_card_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `user_id` | text | não |  |
| `card_id` | text | não |  |
| `kind` | text | não |  |
| `occurred_at` | timestamp with time zone | não |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (user_id, card_id, kind, occurred_at)`

**Índices:**
- `personal_card_events_user_idx`: `USING btree (user_id, kind, occurred_at DESC)`

## piperun_map

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `org_id` | text | não |  |
| `entity` | text | não |  |
| `pid` | text | não |  |
| `crm_id` | text | não |  |
| `note` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (org_id, entity, pid)`

**Índices:**
- `piperun_map_crm_idx`: `USING btree (org_id, entity, crm_id)`

## piperun_raw

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `org_id` | text | não |  |
| `entity` | text | não |  |
| `pid` | text | não |  |
| `payload` | jsonb | não |  |
| `fetched_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (org_id, entity, pid)`

## piperun_runs

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('piperun_runs_id_seq'::regclass) |
| `org_id` | text | não |  |
| `kind` | text | não |  |
| `status` | text | não | 'running'::text |
| `progress` | jsonb | não | '{}'::jsonb |
| `result` | jsonb | sim |  |
| `error` | text | não | ''::text |
| `started_by` | text | não | ''::text |
| `started_at` | timestamp with time zone | não | now() |
| `finished_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `piperun_runs_org_idx`: `USING btree (org_id, id DESC)`

## product_csat

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('product_csat_id_seq'::regclass) |
| `org_id` | text | não |  |
| `user_id` | text | não |  |
| `at` | timestamp with time zone | não | now() |
| `flow` | text | não |  |
| `score` | integer | sim |  |
| `comment` | text | não | ''::text |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `product_csat_user_idx`: `USING btree (user_id, at DESC)`

## product_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('product_events_id_seq'::regclass) |
| `org_id` | text | não |  |
| `user_id` | text | não |  |
| `at` | timestamp with time zone | não | now() |
| `flow` | text | não |  |
| `outcome` | text | não |  |
| `duration_ms` | integer | não | 0 |
| `route` | text | não | ''::text |
| `status` | integer | não | 0 |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `product_events_org_idx`: `USING btree (org_id, at DESC)`
- `product_events_user_flow_idx`: `USING btree (user_id, flow, outcome)`

## project_dossiers

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `status` | text | não | 'generating'::text |
| `progress` | jsonb | não | '{}'::jsonb |
| `content` | jsonb | sim |  |
| `sources` | jsonb | não | '[]'::jsonb |
| `error` | text | não | ''::text |
| `created_by` | text | sim |  |
| `created_by_name` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `finished_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (created_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `project_dossiers_project_idx`: `USING btree (project_id, created_at DESC)`

## project_meeting_digests

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `project_id` | text | não |  |
| `meeting_id` | text | não |  |
| `digest_key` | text | não |  |
| `digest` | text | não |  |
| `model` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (project_id, meeting_id)`

## project_memory_chunks

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `meeting_id` | text | não |  |
| `kind` | text | não |  |
| `content` | text | não |  |
| `participants` | jsonb | não | '[]'::jsonb |
| `meeting_date` | date | sim |  |
| `meeting_title` | text | não | ''::text |
| `time_ref` | text | não | ''::text |
| `source_ref` | jsonb | não | '{}'::jsonb |
| `scope` | text | não | 'project'::text |
| `chunk_order` | integer | não | 0 |
| `created_at` | timestamp with time zone | não | now() |
| `content_tsv` | tsvector | sim |  |
| `embedding` | jsonb | sim |  |

**Travas do banco:**
- Regra (CHECK): `CHECK ((kind = ANY (ARRAY['transcript_segment'::text, 'meeting_summary'::text, 'meeting_decision'::text, 'meeting_highlight'::text, 'meeting_topic'::text, 'activity'::text, 'activity_comment'::text])…`
- Chave estrangeira: `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `project_memory_chunks_meeting_idx`: `USING btree (project_id, meeting_id)`
- `project_memory_chunks_org_date_idx`: `USING btree (org_id, project_id, meeting_date)`
- `project_memory_chunks_participants_idx`: `USING gin (participants jsonb_path_ops)`
- `project_memory_chunks_tsv_idx`: `USING gin (content_tsv)`

## project_versions

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('project_versions_id_seq'::regclass) |
| `project_id` | text | não |  |
| `org_id` | text | sim |  |
| `created_at` | timestamp with time zone | não | now() |
| `kind` | text | não | 'auto'::text |
| `label` | text | não | ''::text |
| `actor_id` | text | não | ''::text |
| `actor_name` | text | não | ''::text |
| `origin` | text | não | ''::text |
| `company_name` | text | não | ''::text |
| `snapshot` | jsonb | não |  |
| `stats` | jsonb | não | '{}'::jsonb |
| `touched` | jsonb | não | '{}'::jsonb |
| `restored_from` | bigint | sim |  |
| `last_write_at` | timestamp with time zone | sim |  |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `project_versions_org_kind_idx`: `USING btree (org_id, kind, created_at DESC)`
- `project_versions_project_idx`: `USING btree (project_id, id DESC)`

## projects

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `data` | jsonb | não |  |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |
| `org_id` | text | sim |  |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Gatilhos (triggers):**
- `project_versions_del` (BEFORE DELETE): `EXECUTE FUNCTION project_versions_capture()`
- `project_versions_upd` (BEFORE UPDATE): `EXECUTE FUNCTION project_versions_capture()`

## push_subscriptions

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `user_id` | text | não |  |
| `endpoint` | text | não |  |
| `p256dh` | text | não |  |
| `auth` | text | não |  |
| `ua` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `last_ok_at` | timestamp with time zone | sim |  |
| `last_error` | text | não | ''::text |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (endpoint)`

**Índices:**
- `push_subscriptions_endpoint_key`: `UNIQUE USING btree (endpoint)`
- `push_subscriptions_user_idx`: `USING btree (user_id)`

## renata_actions

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `conversation_id` | text | sim |  |
| `tool_use_id` | text | não | ''::text |
| `executor` | text | não | 'RENATA (Inteligência Artificial)'::text |
| `requester_id` | text | não |  |
| `requester_name` | text | não | ''::text |
| `command` | text | não | ''::text |
| `requested_at` | timestamp with time zone | não | now() |
| `executed_at` | timestamp with time zone | sim |  |
| `module` | text | não | ''::text |
| `tool` | text | não |  |
| `risk` | text | não | 'read'::text |
| `summary` | text | não | ''::text |
| `input` | jsonb | não | '{}'::jsonb |
| `before` | jsonb | sim |  |
| `after` | jsonb | sim |  |
| `autorizacao` | jsonb | não | '{}'::jsonb |
| `status` | text | não |  |
| `error` | text | não | ''::text |
| `undo` | jsonb | sim |  |
| `undone_at` | timestamp with time zone | sim |  |
| `idem_key` | text | não | ''::text |

**Travas do banco:**
- Regra (CHECK): `CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text, 'partial'::text, 'cancelled'::text, 'denied'::text])))`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `renata_actions_idem_idx`: `USING btree (requester_id, idem_key, requested_at DESC) WHERE (idem_key <> ''::text)`
- `renata_actions_org_idx`: `USING btree (org_id, requested_at DESC)`
- `renata_actions_user_idx`: `USING btree (requester_id, requested_at DESC)`

**Gatilhos (triggers):**
- `renata_actions_guard_t` (BEFORE DELETE/UPDATE): `EXECUTE FUNCTION renata_actions_guard()`

## renata_conversations

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `org_id` | text | não |  |
| `user_id` | text | não |  |
| `title` | text | não | ''::text |
| `messages` | jsonb | não | '[]'::jsonb |
| `context` | jsonb | não | '{}'::jsonb |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `renata_conversations_user_idx`: `USING btree (user_id, updated_at DESC)`

## standard_plan_draft

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `org_id` | text | não |  |
| `data` | jsonb | não |  |
| `updated_by` | text | não | ''::text |
| `updated_by_name` | text | não | ''::text |
| `updated_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (org_id)`

## standard_plan_versions

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `org_id` | text | não |  |
| `version` | integer | não |  |
| `data` | jsonb | não |  |
| `note` | text | não | ''::text |
| `summary` | jsonb | não | '{}'::jsonb |
| `created_by` | text | não | ''::text |
| `created_by_name` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (org_id, version)`

## task_activity_links

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('task_activity_links_id_seq'::regclass) |
| `org_id` | text | não |  |
| `project_id` | text | não |  |
| `task_id` | text | não |  |
| `task_text` | text | não | ''::text |
| `task_area` | text | não | ''::text |
| `owner_side` | text | não | ''::text |
| `suggested_activity_key` | text | não | ''::text |
| `chosen_activity_key` | text | não | ''::text |
| `decision` | text | não |  |
| `source` | text | não | ''::text |
| `user_id` | text | não | ''::text |
| `created_at` | timestamp with time zone | não | now() |
| `confidence` | real | sim |  |
| `ignored` | boolean | não | false |

**Travas do banco:**
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `task_activity_links_org_idx`: `USING btree (org_id, created_at DESC)`
- `task_activity_links_project_idx`: `USING btree (project_id, task_id)`

## user_access_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('user_access_events_id_seq'::regclass) |
| `user_id` | text | não |  |
| `kind` | text | não |  |
| `at` | timestamp with time zone | não | now() |
| `ip` | text | não | ''::text |
| `forwarded_for` | text | não | ''::text |
| `city` | text | não | ''::text |
| `region` | text | não | ''::text |
| `country` | text | não | ''::text |
| `user_agent` | text | não | ''::text |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `user_access_events_user_idx`: `USING btree (user_id, at DESC)`

## user_usage_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | bigint | não | nextval('user_usage_events_id_seq'::regclass) |
| `user_id` | text | não |  |
| `session_id` | text | não | ''::text |
| `kind` | text | não |  |
| `module` | text | não | ''::text |
| `view` | text | não | ''::text |
| `project_id` | text | não | ''::text |
| `connected_s` | integer | não | 0 |
| `active_s` | integer | não | 0 |
| `action` | text | não | ''::text |
| `at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `user_usage_events_at_idx`: `USING btree (at)`
- `user_usage_events_user_idx`: `USING btree (user_id, at DESC)`

## users

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `username` | text | não |  |
| `password_hash` | text | não |  |
| `name` | text | não |  |
| `email` | text | não | ''::text |
| `role` | text | não |  |
| `cnpj` | text | não | ''::text |
| `allowed_cnpjs` | jsonb | não | '[]'::jsonb |
| `blocked` | boolean | não | false |
| `block_reason` | text | não | ''::text |
| `expires_at` | date | sim |  |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |
| `avatar` | text | não | ''::text |
| `personal_only` | boolean | não | false |
| `org_id` | text | sim |  |
| `is_super_admin` | boolean | não | false |
| `xflow_role` | text | não | ''::text |
| `companies_access` | boolean | não | false |
| `all_companies_access` | boolean | não | false |
| `personal_access` | boolean | não | true |
| `crm_role` | text | não | ''::text |
| `widget_token_hash` | text | sim |  |
| `widget_token_created_at` | timestamp with time zone | sim |  |
| `widget_last_used_at` | timestamp with time zone | sim |  |
| `widget_views` | jsonb | sim |  |
| `preferences` | jsonb | sim |  |
| `onboarding_done_at` | timestamp with time zone | sim |  |
| `widget_token_enc` | text | sim |  |

**Travas do banco:**
- Regra (CHECK): `CHECK ((role = ANY (ARRAY['master'::text, 'pricetax'::text, 'cliente'::text])))`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (username)`

**Índices:**
- `idx_users_widget_token`: `UNIQUE USING btree (widget_token_hash) WHERE (widget_token_hash IS NOT NULL)`
- `users_username_key`: `UNIQUE USING btree (username)`

## xflow_events

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `ticket_id` | text | não |  |
| `org_id` | text | não |  |
| `type` | text | não |  |
| `field` | text | sim |  |
| `old_value` | text | sim |  |
| `new_value` | text | sim |  |
| `note` | text | sim |  |
| `user_id` | text | sim |  |
| `created_at` | timestamp with time zone | não | now() |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (ticket_id) REFERENCES xflow_tickets(id) ON DELETE CASCADE`
- Chave estrangeira: `FOREIGN KEY (user_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `xflow_events_org_idx`: `USING btree (org_id, created_at)`
- `xflow_events_ticket_idx`: `USING btree (ticket_id, created_at)`

## xflow_tickets

| Coluna | Tipo | Nulo? | Padrão |
|---|---|---|---|
| `id` | text | não |  |
| `ticket_number` | integer | não | nextval('xflow_tickets_ticket_number_seq'::regcla… |
| `org_id` | text | não |  |
| `title` | text | não |  |
| `status` | text | não | 'aberta'::text |
| `severity` | text | não | ''::text |
| `priority` | text | não | ''::text |
| `product` | text | não | ''::text |
| `reporter_id` | text | sim |  |
| `assignee_id` | text | sim |  |
| `data` | jsonb | não | '{}'::jsonb |
| `created_at` | timestamp with time zone | não | now() |
| `updated_at` | timestamp with time zone | não | now() |
| `suggested_priority` | text | não | ''::text |
| `status_entered_at` | timestamp with time zone | não | now() |
| `time_breakdown` | jsonb | não | '{}'::jsonb |
| `ball_holder_type` | text | não | 'triage_queue'::text |
| `ball_holder_user_id` | text | sim |  |
| `waiting_on_type` | text | não | ''::text |
| `reopen_count` | integer | não | 0 |
| `homolog_reject_count` | integer | não | 0 |
| `sla_first_response_due_at` | timestamp with time zone | sim |  |
| `sla_first_response_met_at` | timestamp with time zone | sim |  |
| `sla_resolution_due_at` | timestamp with time zone | sim |  |
| `sla_resolution_met_at` | timestamp with time zone | sim |  |
| `sla_paused_at` | timestamp with time zone | sim |  |
| `sla_paused_seconds` | integer | não | 0 |
| `deleted` | boolean | não | false |
| `deleted_at` | timestamp with time zone | sim |  |
| `deleted_by` | text | sim |  |
| `board_order` | double precision | não | 0 |

**Travas do banco:**
- Chave estrangeira: `FOREIGN KEY (deleted_by) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (assignee_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (reporter_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (ball_holder_user_id) REFERENCES users(id)`
- Chave estrangeira: `FOREIGN KEY (org_id) REFERENCES organizations(id)`
- Chave primária: `PRIMARY KEY (id)`

**Índices:**
- `xflow_tickets_deleted_idx`: `USING btree (org_id, deleted)`
