// Tela inicial personalizável e favoritos (§126): validação do que vem do PUT, leitura do salvo e mescla do layout salvo com
// blocos novos. Rodar: node scripts/home-layout.test.mjs
import assert from 'node:assert/strict';
import {
  BLOCKS, DEFAULT_LAYOUT, cleanLayout, mergeLayout, isDefaultLayout, moveBlock, moveBlockTo, setBlockWidth, setBlockHidden,
  cleanSpace, cleanSpaces, cleanFavorites, cleanUrl, readHome, buildHomePatch, isSpaceId, newSpaceId, MAX_SPACES, MAX_FAVORITES,
} from '../shared/homeLayout.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok ${name}`); };
const ids = (l) => l.items.map((x) => x.id);

t('quem nunca mexeu vê o padrão, igual à tela de antes', () => {
  const m = mergeLayout(null, {});
  assert.deepEqual(m, DEFAULT_LAYOUT);
  assert.equal(isDefaultLayout(m), true);
  // §130: 'mailRadar' (Negócios fora do CRM) só existe para quem tem CRM; para os demais a grade o esconde e a tela fica como antes.
  assert.deepEqual(ids(m), ['daily', 'briefing', 'today', 'week', 'continue', 'agenda', 'mailRadar', 'modules']);
  assert.deepEqual(m.items.find((x) => x.id === 'agenda'), { id: 'agenda', w: 6 });
});

t('layout salvo antigo ganha os blocos novos logo depois do vizinho do padrão', () => {
  const saved = { items: [{ id: 'today', w: 6 }, { id: 'daily', w: 2 }, { id: 'modules', w: 6 }] };
  const m = mergeLayout(saved, {});
  assert.deepEqual(ids(m), ['today', 'week', 'continue', 'agenda', 'mailRadar', 'daily', 'briefing', 'modules']);
  assert.equal(m.items[0].w, 6, 'largura salva fica');
  assert.equal(m.items.find((x) => x.id === 'week').w, 3, 'bloco novo entra com a largura padrão');
  assert.equal(new Set(ids(m)).size, m.items.length, 'sem repetidos');
});

t('bloco que vem antes de todos no padrão entra no começo', () => {
  const m = mergeLayout({ items: [{ id: 'modules', w: 6 }] }, {});
  assert.equal(ids(m)[0], 'daily');
  assert.equal(ids(m).at(-1), 'modules');
});

t('escondido continua escondido depois da mescla', () => {
  const m = mergeLayout({ items: [{ id: 'daily', w: 3, hidden: true }] }, {});
  assert.equal(m.items.find((x) => x.id === 'daily').hidden, true);
});

t('lixo no layout salvo: bloco inexistente, repetido, largura inválida, item torto', () => {
  const l = cleanLayout({ items: [{ id: 'xpto', w: 3 }, { id: 'today', w: 5 }, { id: 'today', w: 2 }, null, 'daily', { id: 'daily', w: 2, hidden: 'sim' }] });
  assert.deepEqual(l, { items: [{ id: 'today', w: 3 }, { id: 'daily', w: 2 }] });
  assert.equal(cleanLayout(null), null);
  assert.equal(cleanLayout({ items: 'x' }), null);
  assert.deepEqual(mergeLayout({ items: 'x' }, {}), DEFAULT_LAYOUT, 'layout ilegível volta ao padrão');
});

t('"Meu espaço": só entra no layout se existir o conteúdo; vários permitidos', () => {
  const a = 'space-abc123'; const b = 'space-zz9900';
  assert.equal(isSpaceId(a), true);
  assert.equal(isSpaceId('space-'), false);
  assert.equal(isSpaceId('space-<script>'), false);
  const spaces = { [a]: { title: 'Metas', note: '', links: [] }, [b]: { title: 'Links', note: '', links: [] } };
  const m = mergeLayout({ items: [{ id: a, w: 2 }, { id: 'space-semdado', w: 3 }, { id: b, w: 4 }, { id: 'daily', w: 3 }] }, spaces);
  assert.deepEqual(ids(m).slice(0, 3), [a, b, 'daily']);
  assert.equal(m.items.some((x) => x.id === 'space-semdado'), false);
  assert.match(newSpaceId(() => 0.123456789), /^space-[a-z0-9]{6,}$/);
  assert.equal(isSpaceId(newSpaceId()), true);
});

t('operações: subir/descer, mover para, largura, esconder', () => {
  let l = mergeLayout(null, {});
  l = moveBlock(l, 'today', -2);
  assert.deepEqual(ids(l).slice(0, 3), ['today', 'daily', 'briefing']);
  assert.equal(moveBlock(l, 'today', -1), l, 'primeiro não sobe');
  l = moveBlockTo(l, 'daily', 'modules');
  assert.equal(ids(l).at(-1), 'daily');
  l = setBlockWidth(l, 'daily', 4);
  assert.equal(l.items.at(-1).w, 4);
  assert.equal(setBlockWidth(l, 'daily', 5), l, 'largura fora da lista é ignorada');
  l = setBlockHidden(l, 'week', true);
  assert.equal(l.items.find((x) => x.id === 'week').hidden, true);
  l = setBlockHidden(l, 'week', false);
  assert.equal('hidden' in l.items.find((x) => x.id === 'week'), false);
  assert.equal(isDefaultLayout(l), false);
});

t('URL: só http/https, sem usuário e senha', () => {
  assert.equal(cleanUrl('www.gov.br'), 'https://www.gov.br/');
  assert.equal(cleanUrl('javascript:alert(1)'), null);
  assert.equal(cleanUrl('data:text/html,oi'), null);
  assert.equal(cleanUrl('https://a:b@x.com'), null);
  assert.equal(cleanUrl(''), null);
  assert.equal(cleanUrl(`https://x.com/${'a'.repeat(600)}`), null);
});

t('"Meu espaço" limpo: título padrão, nota cortada, link ruim descartado', () => {
  const s = cleanSpace({ title: '   ', note: 'x'.repeat(5000), links: [{ name: '', url: 'receita.fazenda.gov.br' }, { name: 'mal', url: 'javascript:x' }, null] });
  assert.equal(s.title, 'Meu espaço');
  assert.equal(s.note.length, 4000);
  assert.deepEqual(s.links, [{ name: 'receita.fazenda.gov.br', url: 'https://receita.fazenda.gov.br/' }]);
  const many = {};
  for (let i = 0; i < 10; i += 1) many[`space-aaaa${i}0`] = { title: `E${i}` };
  many['nao-e-espaco'] = { title: 'x' };
  const c = cleanSpaces(many);
  assert.equal(Object.keys(c).length, MAX_SPACES);
  assert.equal('nao-e-espaco' in c, false);
});

t('favoritos: tipos aceitos, sem repetidos, link normalizado, rótulo obrigatório', () => {
  const f = cleanFavorites([
    { kind: 'module', id: 'crm', label: 'CRM' },
    { kind: 'module', id: 'crm', label: 'CRM de novo' },
    { kind: 'company', id: 'p-1', label: 'KUHN', hint: '00.000.000/0001-00' },
    { kind: 'link', id: 'www.nfe.fazenda.gov.br', label: '' },
    { kind: 'link', id: 'javascript:alert(1)', label: 'x' },
    { kind: 'script', id: 'x', label: 'x' },
    { kind: 'card', id: 'c1', label: '' },
  ]);
  assert.deepEqual(f.map((x) => `${x.kind}:${x.id}`), ['module:crm', 'company:p-1', 'link:https://www.nfe.fazenda.gov.br/']);
  assert.equal(f[2].label, 'nfe.fazenda.gov.br');
  assert.equal(f[1].hint, '00.000.000/0001-00');
  assert.equal(cleanFavorites('x').length, 0);
});

t('leitura do salvo: nada salvo → favoritos null (a tela migra os do navegador), layout null (padrão)', () => {
  assert.deepEqual(readHome(null), { layout: null, spaces: {}, favorites: null });
  assert.deepEqual(readHome({ home: { favorites: [] } }).favorites, []);
  const r = readHome({ home: { layout: { items: [{ id: 'space-abcd12', w: 2 }, { id: 'space-orfao1', w: 2 }, { id: 'today', w: 6 }] }, spaces: { 'space-abcd12': { title: 'A' } } } });
  assert.deepEqual(r.layout.items.map((x) => x.id), ['space-abcd12', 'today'], 'espaço sem conteúdo sai do layout lido');
});

t('PUT: valida e devolve só o que veio; layout null = restaurar padrão', () => {
  assert.equal(buildHomePatch({}).error, 'Nada para salvar.');
  assert.equal(buildHomePatch({ layout: 'x' }).error, 'Layout inválido.');
  assert.deepEqual(buildHomePatch({ layout: null }).patch, { layout: null });
  assert.ok(buildHomePatch({ favorites: 'x' }).error);
  assert.ok(buildHomePatch({ favorites: Array.from({ length: MAX_FAVORITES + 1 }, (_, i) => ({ kind: 'module', id: `m${i}`, label: 'x' })) }).error);
  assert.ok(buildHomePatch({ spaces: [] }).error);
  const many = {};
  for (let i = 0; i <= MAX_SPACES; i += 1) many[`space-bbbb${i}0`] = {};
  assert.ok(buildHomePatch({ spaces: many }).error);
  const ok = buildHomePatch({ layout: { items: [{ id: 'space-new123', w: 2 }, { id: 'daily', w: 6 }] }, spaces: { 'space-new123': { title: 'Novo' } } });
  assert.deepEqual(ok.patch.layout.items, [{ id: 'space-new123', w: 2 }, { id: 'daily', w: 6 }]);
  assert.equal(ok.patch.spaces['space-new123'].title, 'Novo');
  const orphan = buildHomePatch({ layout: { items: [{ id: 'space-zzz999', w: 2 }] }, spaces: {} });
  assert.deepEqual(orphan.patch.layout.items, [], 'espaço que não veio junto sai do layout');
});

t('catálogo: ids únicos e larguras válidas', () => {
  assert.equal(new Set(BLOCKS.map((b) => b.id)).size, BLOCKS.length);
  assert.ok(BLOCKS.every((b) => [2, 3, 4, 6].includes(b.w)));
});

console.log(`\n${n} verificações da tela inicial personalizável passaram.`);
