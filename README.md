# PRICETAX — Cronograma de Reforma Tributária

App de gestão de projeto (Gantt, Tabela, Fases, Quadro) com perfis Cliente / PRICETAX / PRICETAX Master.

## ⚠️ Antes de colocar no ar — leia isto

Este app salva os dados no **navegador de cada pessoa** (localStorage), não num banco de dados compartilhado. Isso significa:

- Cada pessoa que abrir o site vê e edita **a própria cópia** dos dados.
- Se você cadastrar um cronograma no seu computador, seu cliente **não vai ver isso** quando abrir o mesmo link no computador dele.
- O "login" por perfil (Cliente/PRICETAX/Master) hoje é só uma separação de tela — não é senha de verdade.

Isso é suficiente pra **testar o produto, mostrar pra alguém, validar o fluxo**. Para uso real com cliente vendo o mesmo cronograma que a PRICETAX está editando, o próximo passo é um backend com banco de dados — o mesmo padrão que vocês já usam no XClass (Node + banco). Quando quiser, monto isso.

---

## Passo 1 — Rodar local (opcional, pra conferir antes de subir)

Precisa ter o [Node.js](https://nodejs.org) instalado (versão 18 ou mais nova).

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

---

## Passo 2 — Subir para o GitHub

### Opção A — sem usar terminal (mais fácil)

1. Entre em [github.com](https://github.com) e clique em **New repository**.
2. Dê um nome (ex: `pricetax-cronograma`) e crie o repositório **vazio** (não marque "Add README").
3. Na página do repositório recém-criado, clique em **uploading an existing file**.
4. Arraste **todos os arquivos e pastas deste projeto** (menos `node_modules` e `dist`, que não vêm aqui) para a caixa de upload.
5. Clique em **Commit changes**.

### Opção B — com terminal

```bash
git init
git add .
git commit -m "Primeira versão do cronograma"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/pricetax-cronograma.git
git push -u origin main
```

---

## Passo 3 — Conectar no Railway

1. Entre em [railway.com](https://railway.com) e faça login com sua conta GitHub.
2. Clique em **New Project** → **Deploy from GitHub repo**.
3. Escolha o repositório que você acabou de criar.
4. O Railway detecta sozinho que é um projeto Node (por causa do `package.json`) e roda:
   - `npm install`
   - `npm run build` (gera a pasta `dist`)
   - `npm run start` (serve a pasta `dist` na porta que o Railway define)
5. Em **Settings → Networking**, clique em **Generate Domain** para ganhar uma URL pública (tipo `pricetax-cronograma.up.railway.app`).

Pronto — o link já fica no ar e atualiza sozinho toda vez que você der `git push` de novo.

---

## Estrutura do projeto

```
index.html          → página HTML base
src/main.jsx         → ponto de entrada do React
src/App.jsx           → o app inteiro (views, lógica, estilos)
src/lib/storage.js     → onde os dados são salvos (hoje: localStorage do navegador)
package.json            → dependências e comandos de build/start
vite.config.js           → configuração do empacotador
```
