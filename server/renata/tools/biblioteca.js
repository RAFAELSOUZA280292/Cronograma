// Biblioteca de conhecimento (2026-10-27, §116): a RENATA operacional consulta os materiais que a equipe ensinou (somente leitura, só equipe PRICETAX).
// O envio, a edição e o arquivamento são feitos pela tela (Conhecimento › Biblioteca): arquivo e conferência humana.
import { T } from '../validate.js';
import { pool } from '../../db.js';
import { searchMaterial } from '../../knowledgeLibrary.js';

const staff = (u) => !!u && (u.isSuperAdmin || u.role === 'master' || u.role === 'pricetax');

export function registerBiblioteca(registry) {
  registry.add({ module: 'Conhecimento', risk: 'read', name: 'biblioteca_consultar',
    summary: 'Procura na Biblioteca de conhecimento (materiais que a PRICETAX enviou: estudos, apresentações, notas técnicas) os trechos que tratam do assunto e devolve resumo e trechos com título, página/slide e texto original. Use para perguntas de conteúdo técnico (ex.: produtor rural antes e depois da reforma) e cite o título do material. Só equipe PRICETAX.',
    visible: staff, params: T.obj({ pergunta: T.str('A pergunta ou o assunto, em português, como a pessoa fez') }, ['pergunta']),
    run: async (ctx, i) => {
      const out = await searchMaterial({ orgId: ctx.orgId, query: String(i.pergunta || ''), limit: 6 });
      if (!out.passages.length) return { status: 200, json: { encontrou: false, observacao: 'Nenhum material da biblioteca trata deste assunto. Diga isso com franqueza; não complete com conhecimento próprio sobre norma ou número.' } };
      const { rows } = await pool.query('SELECT id, study FROM knowledge_materials WHERE id = ANY($1::text[])', [out.materials.map((m) => m.id)]);
      const study = new Map(rows.map((r) => [r.id, r.study]));
      return { status: 200, json: {
        encontrou: true,
        materiais: out.materials.map((m) => ({ titulo: m.title, tema: m.topic, resumo: (study.get(m.id) && study.get(m.id).executiveSummary) || m.summary })),
        trechos: out.passages.map((p) => ({ material: p.title, onde: [p.ref, p.heading].filter(Boolean).join(' · '), texto: p.content })),
        observacao: 'Responda só com o que os trechos dizem, citando o material; se o ponto perguntado não está nos trechos, diga que o material não cobre.',
      } };
    } });
}
