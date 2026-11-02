// Fluxos críticos de ponta a ponta (Onda 4, E2): login, quadro pessoal, negócio e nota no CRM, confirmação da RENATA e link público do cliente.
// Cada fluxo confere o que a PESSOA vê e, quando muda dado, que ele ficou gravado. A acessibilidade (axe-core) é conferida nas telas principais.
import { test, expect } from '@playwright/test';
import { loginUi, apiAs, checkAxe, checkContrast, stamp } from './helpers.mjs';
import { USERS } from './setup.mjs';


test('login: senha errada avisa, senha certa entra na tela inicial', async ({ page }) => {
  await loginUi(page, USERS.master, 'senha-errada');
  await expect(page.getByRole('alert').or(page.getByText(/inválid|incorret|não confere/i)).first()).toBeVisible();
  await expect(page.getByText(/^Olá,/)).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Senha' }).fill('E2e-senha-local-1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, Marina/ })).toBeVisible();
  await checkAxe(page, 'tela-inicial');
});

test('acessibilidade da tela de login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await checkAxe(page, 'login');
});

test('quadro pessoal: criar um cartão e ele continua lá depois de recarregar', async ({ page }) => {
  await loginUi(page, USERS.master);
  await page.goto('/gestao-atividades');
  const title = `Cartão e2e ${stamp()}`;
  await page.locator('.pb-addbtn').first().click();
  await page.getByPlaceholder('Digite o nome da atividade...').fill(title);
  await page.keyboard.press('Enter');
  await expect(page.getByText(title).first()).toBeVisible();
  await page.waitForTimeout(1500); // a gravação do quadro é automática
  await page.reload();
  await expect(page.getByText(title).first()).toBeVisible();
  await checkAxe(page, 'quadro-pessoal');
});

test('CRM: negócio da lista abre pelo teclado e a nota fica gravada', async ({ page }) => {
  await loginUi(page, USERS.master);
  const api = await apiAs(page, USERS.master);
  const tag = stamp();
  const co = await api.post('/api/crm/companies', { legalName: `Empresa E2E ${tag} LTDA`, relationship: 'prospect' });
  expect(co.status, JSON.stringify(co.body)).toBe(201);
  const deal = await api.post('/api/crm/deals', { title: `Negócio E2E ${tag}`, companyId: co.body.company.id });
  expect(deal.status, JSON.stringify(deal.body)).toBe(201);

  await page.goto('/crm');
  await page.getByRole('button', { name: 'Negócios' }).first().click();
  await page.getByRole('button', { name: 'Lista' }).click();
  const row = page.getByRole('row').filter({ hasText: `Negócio E2E ${tag}` });
  await expect(row).toBeVisible();
  await checkAxe(page, 'crm-negocios-lista');
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: `Negócio E2E ${tag}` })).toBeVisible();

  const note = `Nota e2e ${tag}`;
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await page.getByRole('textbox', { name: 'Texto da nota' }).first().click();
  await page.keyboard.type(note);
  await page.keyboard.press('Control+Enter');
  await expect.poll(async () => {
    const r = await api.get(`/api/crm/companies/${co.body.company.id}`);
    return (r.body.notes || []).some((n) => (n.body || '').includes(note));
  }, { timeout: 10000 }).toBeTruthy();
});

test('RENATA: pede para lembrar uma preferência, confirma o cartão e ela aparece na aba Preferências', async ({ page }) => {
  await loginUi(page, USERS.master);
  await page.getByRole('button', { name: 'Falar com a RENATA' }).click();
  const pref = `respostas curtas ${stamp()}`;
  await page.getByRole('textbox', { name: 'Diga o que a RENATA deve fazer' }).fill(`lembre: ${pref}`);
  await page.getByRole('button', { name: 'Enviar' }).click();
  const card = page.getByRole('group', { name: 'Confirmação necessária' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(pref);
  const api = await apiAs(page, USERS.master);
  expect((await api.get('/api/renata/preferences')).body.items.some((i) => i.text === pref), 'não grava antes de confirmar').toBeFalsy();
  await checkAxe(page, 'renata-confirmacao');
  await card.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Pronto, guardei sua preferência.')).toBeVisible();
  await page.getByRole('tab', { name: 'Preferências' }).click();
  await expect(page.getByText(pref)).toBeVisible();
});

test('link público: o cliente vê o acompanhamento sem login e um link revogado deixa de abrir', async ({ page, browser }) => {
  await loginUi(page, USERS.master);
  const api = await apiAs(page, USERS.master);
  const tag = stamp();
  const pr = await api.post('/api/projects', { company: { name: `Cliente Público ${tag}`, nomeFantasia: `Cliente Público ${tag}`, cnpj: '11.222.333/0001-81' } });
  expect(pr.status, JSON.stringify(pr.body)).toBeLessThan(300);
  const projectId = pr.body.id || (pr.body.project && pr.body.project.id);
  const link = await api.post(`/api/company-share/${projectId}`, { days: 30 });
  expect(link.status, JSON.stringify(link.body)).toBe(201);
  const token = link.body.link.token;

  const ctx = await browser.newContext(); // visitante: sem cookie
  const anon = await ctx.newPage();
  await anon.goto(`/a/${token}`);
  await expect(anon.getByText(`Cliente Público ${tag}`).first()).toBeVisible();
  await expect(anon.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect((await anon.request.get('/api/projects')).status(), 'o visitante não alcança a API privada').toBe(401);
  await checkAxe(anon, 'link-publico');

  const rev = await page.request.delete(`/api/company-share/${projectId}`);
  expect(rev.ok()).toBeTruthy();
  const after = await ctx.newPage();
  await after.goto(`/a/${token}`);
  await expect(after.getByText(/não é válido|foi desativado/i)).toBeVisible();
  await ctx.close();
});

test('janelas do CRM (U2): uma só janela do app, rascunho protegido, clicar fora não fecha, foco preso, acima do painel', async ({ page }) => {
  await loginUi(page, USERS.master);
  const api = await apiAs(page, USERS.master);
  const tag = stamp();
  const co = await api.post('/api/crm/companies', { legalName: `Janela E2E ${tag} LTDA`, relationship: 'prospect' });
  expect(co.status, JSON.stringify(co.body)).toBe(201);

  await page.goto('/crm');
  await page.getByRole('button', { name: 'Empresas' }).first().click();
  const row = page.getByRole('row').filter({ hasText: `Janela E2E ${tag}` });
  await row.focus();
  await page.keyboard.press('Enter'); // abre a ficha (painel lateral)
  await page.getByRole('button', { name: 'Editar' }).first().click();

  const modal = page.locator('.ui-frame-overlay.over-drawer');
  await expect(modal.getByRole('heading', { name: 'Editar empresa' })).toBeVisible();
  // acima do painel da ficha: o elemento no centro da janela é da janela, não do painel
  const noTopo = await modal.locator('.ui-frame').evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 40)); });
  expect(noTopo).toBe(true);
  await checkAxe(page, 'crm-janela');

  // clicar fora não fecha
  await page.mouse.click(5, 300);
  await expect(modal).toBeVisible();
  // foco preso: Tab além do último campo continua dentro da janela
  for (let i = 0; i < 60; i += 1) await page.keyboard.press('Tab');
  expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  // rascunho: sujar o formulário e tentar fechar pede confirmação; "Continuar editando" mantém o texto
  const nome = modal.getByRole('textbox', { name: /Razão social/ });
  await nome.fill(`Nome alterado ${tag}`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(modal).toBeVisible();
  await expect(nome).toHaveValue(`Nome alterado ${tag}`);
  // descartar fecha, e a ficha por trás continua aberta
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.crm-drawer')).toBeVisible();
});

test('janelas do XFlow (U2): Nova TASK e detalhe usam a janela única; rascunho protegido; Esc fecha e limpa o endereço', async ({ page }) => {
  await loginUi(page, USERS.master);
  const api = await apiAs(page, USERS.master);
  const tag = stamp();
  const tk = await api.post('/api/xflow/tickets', { title: `TASK e2e ${tag}`, description: 'descrição de teste', product: 'XPED', clientType: 'cliente', type: 'bug' });
  expect(tk.status, JSON.stringify(tk.body)).toBeLessThan(300);
  const num = tk.body.ticket.number;

  await page.goto('/xflow');
  await page.getByRole('button', { name: 'Nova TASK' }).click();
  const nova = page.locator('.ui-frame-overlay.xf-modal').filter({ has: page.getByRole('heading', { name: 'Nova TASK' }) });
  await expect(nova).toBeVisible();
  await expect(nova.getByRole('button', { name: 'Abrir BUG' })).toBeDisabled(); // rodapé fixo da janela, com a trava de campos obrigatórios
  await checkAxe(page, 'xflow-nova-task');
  await nova.getByPlaceholder(/Erro ao calcular/).fill(`Rascunho ${tag}`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Você tem alterações não salvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(nova).toBeVisible();
  await expect(nova.getByPlaceholder(/Erro ao calcular/)).toHaveValue(`Rascunho ${tag}`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sair sem salvar' }).click();
  await expect(nova).toHaveCount(0);

  await page.getByText(`TASK e2e ${tag}`).first().click();
  const det = page.locator('.ui-frame-overlay.xf-modal');
  await expect(det.getByRole('textbox', { name: 'Título da TASK' })).toHaveValue(`TASK e2e ${tag}`);
  await expect(det.getByRole('button', { name: 'Copiar link da TASK' })).toBeVisible();
  expect(page.url()).toContain(`#${num}`);
  await checkAxe(page, 'xflow-detalhe');
  await page.keyboard.press('Escape');
  await expect(det).toHaveCount(0);
  expect(page.url()).not.toContain(`#${num}`);
});

test('janelas do quadro pessoal (U2): detalhe do cartão e gaveta da Lixeira pela janela única', async ({ page }) => {
  await loginUi(page, USERS.master);
  await page.goto('/gestao-atividades');
  const title = `Cartão janela ${stamp()}`;
  await page.locator('.pb-addbtn').first().click();
  await page.getByPlaceholder('Digite o nome da atividade...').fill(title);
  await page.keyboard.press('Enter');
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByText(title).first().click();
  const frame = page.locator('.ui-frame-overlay .ui-frame').first();
  await expect(frame).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Fechar' })).toBeVisible();
  await expect(frame.locator('.ui-frame-head')).toContainText('/'); // quadro / coluna no cabeçalho
  await checkAxe(page, 'quadro-detalhe-cartao');
  await frame.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('.ui-frame-overlay')).toHaveCount(0);

  await page.getByRole('button', { name: 'Lixeira' }).first().click();
  const gaveta = page.locator('.ui-frame.drawer');
  await expect(gaveta.getByRole('heading', { name: 'Lixeira' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gaveta).toHaveCount(0);
});

test('janelas que sobraram (U2): usuários, perfil, notificações, editar e clonar empresa pela janela única, com rascunho protegido', async ({ page }) => {
  await loginUi(page, USERS.master);

  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Novo usuário' }).first().click();
  const frame = page.locator('.ui-frame-overlay .ui-frame').first();
  await expect(frame.getByRole('heading', { name: 'Novo usuário' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Novo usuário' })).toBeVisible();
  await checkContrast(page, 'janela-novo-usuario');
  await frame.getByPlaceholder('Nome completo').fill('Rascunho janela');
  await page.keyboard.press('Escape'); // com rascunho, Esc pede confirmação em vez de fechar
  await expect(page.getByRole('heading', { name: 'Você tem alterações não salvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(frame.getByPlaceholder('Nome completo')).toHaveValue('Rascunho janela');
  await page.getByRole('button', { name: 'Fechar' }).first().click();
  await page.getByRole('button', { name: 'Sair sem salvar' }).click();
  await expect(page.locator('.ui-frame-overlay')).toHaveCount(0);

  await page.getByRole('button', { name: 'Menu da conta' }).click();
  await page.getByRole('menuitem', { name: 'Meu perfil' }).click();
  await expect(page.getByRole('dialog', { name: 'Meu perfil' })).toBeVisible();
  await checkAxe(page, 'janela-meu-perfil');
  await checkContrast(page, 'janela-meu-perfil');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-frame-overlay')).toHaveCount(0);

  await page.getByRole('button', { name: /Notifica/ }).first().click();
  const gaveta = page.locator('.ui-frame.drawer');
  await expect(gaveta).toBeVisible();
  await expect(gaveta.getByRole('button', { name: 'Escolher o que ver' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gaveta).toHaveCount(0);

  const api = await apiAs(page, USERS.master);
  const pr = await api.post('/api/projects', { company: { name: `Janela Empresa ${stamp()}`, cnpj: '11.222.333/0001-81' } });
  expect(pr.status, JSON.stringify(pr.body)).toBeLessThan(300);
  await page.goto('/empresas');
  await page.getByRole('button', { name: 'Editar empresa' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Editar empresa' })).toBeVisible();
  await checkContrast(page, 'janela-editar-empresa');
  await page.keyboard.press('Escape'); // sem rascunho, Esc fecha direto
  await expect(page.locator('.ui-frame-overlay')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clonar atividades para uma nova empresa' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Clonar empresa' })).toBeVisible();
  await page.mouse.click(5, 300); // clicar fora sem rascunho fecha
  await expect(page.locator('.ui-frame-overlay')).toHaveCount(0);
});

test('janelas da empresa (U2): detalhe da atividade e envio de transcrição, rascunho protegido e texto legível nos dois temas', async ({ page }) => {
  await loginUi(page, USERS.master);
  const api = await apiAs(page, USERS.master);
  const nome = `Janela Atividade ${stamp()}`;
  const pr = await api.post('/api/projects', { company: { name: nome, nomeFantasia: nome, cnpj: '11.222.333/0001-81' } });
  expect(pr.status, JSON.stringify(pr.body)).toBeLessThan(300);
  await page.goto('/empresas');
  await page.getByText(nome).first().click();
  await page.getByRole('button', { name: /Abrir em tela cheia a atividade/ }).first().click();
  const frame = page.locator('.ui-frame-overlay .ui-frame').first();
  await expect(frame).toBeVisible();
  await expect(frame.locator('.ui-frame-head')).toContainText('#1');
  await checkContrast(page, 'janela-atividade');
  await frame.locator('input[type=text]').first().fill('Título alterado na janela');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Você tem alterações não salvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(frame.locator('input[type=text]').first()).toHaveValue('Título alterado na janela');
  await frame.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Sair sem salvar' }).or(page.getByRole('button', { name: 'Salvar e sair' })).first().waitFor({ timeout: 2000 }).then(() => page.getByRole('button', { name: 'Sair sem salvar' }).click()).catch(() => {});
  await expect(page.locator('.ui-frame-overlay')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Reuniões' }).or(page.getByRole('button', { name: 'Reuniões' })).first().click();
  await page.getByRole('button', { name: /Enviar transcrição/ }).first().click();
  const envio = page.getByRole('dialog', { name: 'Enviar transcrição' });
  await expect(envio).toBeVisible();
  await checkContrast(page, 'janela-transcricao');
  await envio.getByLabel('Transcrição da reunião').fill('texto de teste');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Descartar a transcrição?')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(envio).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.locator('.ui-frame-overlay')).toHaveCount(0);
});

// Vidro (2026-11-01): a barra do topo é translúcida com blur. O texto dela precisa ler em qualquer coisa que passe por baixo, então o teste põe o PIOR fundo
// possível atrás da barra (branco no escuro, preto no claro) e mede cada texto e ícone em cima dele: texto >= 4.5:1, ícone >= 3:1 (WCAG AA).
for (const theme of ['dark', 'light']) {
  test(`vidro: barra do topo legível sobre o pior fundo (${theme})`, async ({ page }) => {
    await loginUi(page, USERS.master);
    await page.goto('/gestao-atividades');
    await page.waitForSelector('.shell-bar');
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const res = await page.evaluate((worst) => {
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
      const bar = document.querySelector('.shell-bar');
      const base = worst === 'white' ? [255, 255, 255] : [0, 0, 0];
      const barSolid = over(parse(getComputedStyle(bar).backgroundColor), base);
      const out = [];
      for (const el of bar.querySelectorAll('button, .shell-search, .shell-cur, a')) {
        const cs = getComputedStyle(el); if (!el.getBoundingClientRect().width) continue;
        const text = (el.textContent || '').replace(/⌘K|Ctrl\+K/g, '').trim();
        if (!text && !el.querySelector('svg')) continue;
        const bgv = parse(cs.backgroundColor);
        out.push({ name: text || '(ícone)', text: !!text, ratio: ratio(parse(cs.color), bgv.length ? over(bgv, barSolid) : barSolid) });
      }
      const f = getComputedStyle(bar);
      return { out, blur: f.backdropFilter || f.webkitBackdropFilter };
    }, theme === 'dark' ? 'white' : 'black');
    expect(res.blur, 'a barra tem blur').not.toBe('none');
    expect(res.out.length, 'mediu algum item da barra').toBeGreaterThan(3);
    const ruins = res.out.filter((i) => i.ratio < (i.text ? 4.5 : 3)).map((i) => `${i.name} ${i.ratio.toFixed(2)}`);
    expect(ruins, 'itens da barra abaixo do contraste mínimo').toEqual([]);
  });
}

test('quadro pessoal: mover uma coluna com as atividades para outra página, com desfazer, e continua assim depois de recarregar', async ({ page }) => {
  await loginUi(page, USERS.master);
  await page.goto('/gestao-atividades');
  const title = `Coluna movida ${stamp()}`;
  await page.locator('.pb-addbtn').first().click();
  await page.getByPlaceholder('Digite o nome da atividade...').fill(title);
  await page.keyboard.press('Enter');
  await expect(page.getByText(title).first()).toBeVisible();
  const tabs = page.locator('input[aria-label^="Nome do quadro"]');
  const first = await tabs.first().inputValue();
  const destino = `Destino ${stamp()}`;
  await page.getByTitle('Nova página').click();
  await tabs.last().fill(destino);
  await expect(page.locator(`input[aria-label="Nome do quadro ${destino}"]`)).toBeVisible();
  await page.locator(`input[aria-label="Nome do quadro ${first}"]`).click();
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByRole('button', { name: 'Nova coluna', exact: true }).click(); // a página precisa ter mais de uma coluna, senão a mudança é recusada de propósito
  await page.waitForTimeout(800);
  // a coluna é achada pela atividade que este teste criou (o banco local guarda páginas de execuções anteriores)
  const colDaAtividade = () => page.getByText(title).first().locator('xpath=(ancestor::div[.//input[starts-with(@aria-label,"Nome da coluna")]])[last()]');
  const colTitle = await colDaAtividade().locator('input[aria-label^="Nome da coluna"]').first().inputValue();
  const colMenu = () => colDaAtividade().getByRole('button', { name: 'Mais ações', exact: true }).first();
  const moverParaNovaPagina = async () => {
    await colMenu().click();
    await page.getByRole('button', { name: 'Mover para outra página...', exact: true }).click();
    await page.locator('button').filter({ hasText: new RegExp(`^${destino}$`) }).click();
  };

  // mover e desfazer na hora: a coluna volta para a página de origem
  await moverParaNovaPagina();
  await expect(page.getByText(title)).toHaveCount(0);
  await expect(page.getByText(new RegExp(`movida para a página "${destino}"`))).toBeVisible();
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByText(title).first()).toBeVisible();
  await page.waitForTimeout(1500); // a gravação automática termina antes de abrir o menu de novo

  // mover de novo: a coluna e a atividade aparecem na página nova e continuam lá depois de recarregar
  await moverParaNovaPagina();
  await expect(page.getByText(title)).toHaveCount(0);
  await page.locator(`input[aria-label="Nome do quadro ${destino}"]`).click();
  await expect(page.getByText(title).first()).toBeVisible();
  await expect(page.locator(`input[aria-label="Nome da coluna ${colTitle}"]`).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator(`input[aria-label="Nome do quadro ${destino}"]`).click();
  await expect(page.getByText(title).first()).toBeVisible();
  await page.locator(`input[aria-label="Nome do quadro ${first}"]`).click();
  await expect(page.getByText(title)).toHaveCount(0);
});
