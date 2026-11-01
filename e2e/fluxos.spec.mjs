// Fluxos críticos de ponta a ponta (Onda 4, E2): login, quadro pessoal, negócio e nota no CRM, confirmação da RENATA e link público do cliente.
// Cada fluxo confere o que a PESSOA vê e, quando muda dado, que ele ficou gravado. A acessibilidade (axe-core) é conferida nas telas principais.
import { test, expect } from '@playwright/test';
import { loginUi, apiAs, checkAxe, stamp } from './helpers.mjs';
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
