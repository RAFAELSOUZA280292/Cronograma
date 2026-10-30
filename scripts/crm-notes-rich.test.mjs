// Notas formatadas do CRM: higienização do HTML e texto puro derivado (server/richNote.js). Rodar: node scripts/crm-notes-rich.test.mjs
import assert from 'node:assert/strict';
import { MAX_CRM_NOTE_HTML, noteToText, sanitizeCrmNoteHtml } from '../server/richNote.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

ok('mantém a formatação permitida e os emojis', () => {
  const h = '<h2>📞 Ligação</h2><h3>⏭️ Próximo</h3><p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s></p><ul><li>✅ um</li></ul><ol><li>dois</li></ol><blockquote>⚠️ atenção</blockquote><hr>';
  const c = sanitizeCrmNoteHtml(h);
  for (const t of ['<h2>', '<h3>', '<strong>', '<em>', '<u>', '<s>', '<ul>', '<ol>', '<blockquote>', '<hr']) assert.ok(c.includes(t), t);
  for (const e of ['📞', '⏭️', '✅', '⚠️']) assert.ok(c.includes(e), e);
});

ok('remove script, evento, imagem, iframe, estilo e atributos', () => {
  const c = sanitizeCrmNoteHtml('<p onclick="x()" style="color:red">oi<script>alert(1)</script><img src=x onerror=alert(2)><iframe src="//evil"></iframe><style>*{}</style></p>');
  assert.equal(c, '<p>oi</p>');
});

ok('links: só http, https, mailto e tel; sempre com rel e nova aba', () => {
  const c = sanitizeCrmNoteHtml('<a href="javascript:alert(1)">a</a><a href="data:text/html;base64,AAA">b</a><a href="https://pricetax.com.br" onclick="x()">c</a><a href="mailto:a@b.com">d</a><a href="tel:+5547999999999">e</a>');
  assert.ok(!/javascript:|data:|onclick/.test(c));
  assert.ok(c.includes('href="https://pricetax.com.br"') && c.includes('rel="noopener noreferrer nofollow"') && c.includes('target="_blank"'));
  assert.ok(c.includes('mailto:a@b.com') && c.includes('tel:+5547999999999'));
});

ok('texto puro derivado: parágrafos, marcadores, citação e emoji (é o que busca e auditoria leem)', () => {
  const t = noteToText(sanitizeCrmNoteHtml('<h2>💬 Conversa</h2><p>Sra. <strong>Cirlei</strong> pediu orçamento</p><ul><li>proposta ✅</li><li>data ⏳</li></ul><blockquote>📌 aguardando</blockquote><hr><p>fim</p>'), 'html');
  assert.equal(t, '💬 Conversa\nSra. Cirlei pediu orçamento\n• proposta ✅\n• data ⏳\n📌 aguardando\n\n———\nfim');
});

ok('texto digitado com < e & não vira etiqueta', () => {
  const c = sanitizeCrmNoteHtml('<p>5 &lt; 7 &amp; 9 &gt; 3 &lt;b&gt;x&lt;/b&gt;</p>');
  assert.equal(noteToText(c, 'html'), '5 < 7 & 9 > 3 <b>x</b>');
  assert.ok(!c.includes('<b>'));
});

ok('vazio e lixo não quebram', () => {
  assert.equal(sanitizeCrmNoteHtml(''), '');
  assert.equal(sanitizeCrmNoteHtml(null), '');
  assert.equal(noteToText(sanitizeCrmNoteHtml('<p></p><p><br></p>'), 'html'), '');
  assert.ok(sanitizeCrmNoteHtml('<p>' + 'x'.repeat(MAX_CRM_NOTE_HTML * 3) + '</p>').length <= MAX_CRM_NOTE_HTML * 2 + 20);
});

console.log(`\n${n} verificações ok`);
