# Estudo: comunicação com o Cronograma via Telegram Bot API

> **Status: estudo, não implementado.** Documento de referência técnica pra
> quando (se) o Rafael decidir seguir com isso. Nenhum código foi escrito.
> Contexto: ele queria um jeito fácil (sem ferramenta oficial/burocrática)
> de ele e o time falarem com o painel — cogitamos e-mail, WhatsApp e
> Telegram; recomendação foi e-mail primeiro (mais simples ainda), Telegram
> como alternativa mais "de chat" se e-mail não bastar. Pedido explícito:
> estudar Telegram e documentar, sem aplicar ainda.

## 1. Por que Telegram entra na conversa

Comparado a WhatsApp (ver decisão anterior, `PROJECT_CONTEXT.md` — sessão
2026-09), o Telegram Bot API é **de longe o mais simples dos três canais**
de mandar/receber mensagem:

| | Telegram Bot API | WhatsApp (oficial Meta) | WhatsApp (Z-API/Twilio) | E-mail (Mailgun inbound) |
|---|---|---|---|---|
| Aprovação/verificação de negócio | Não precisa | Sim, burocrático | Não | Não |
| Custo | Grátis, sempre | Grátis (com limites) | Pago (mensal + por msg) | Grátis até um volume razoável |
| Tempo de setup | ~5 minutos | Dias/semanas | ~1 hora | ~30 minutos |
| Sensação de "chat" (tempo real) | Sim | Sim | Sim | Não (é e-mail) |
| Time já usa no dia a dia | Não (precisa instalar) | Sim (todo mundo já usa) | Sim | Sim |
| Risco de ToS | Nenhum (é a API oficial) | Nenhum | Alto (automação não-oficial) | Nenhum |

**Conclusão da comparação**: Telegram ganha em simplicidade técnica e custo,
mas perde porque o time já usa WhatsApp no dia a dia e não usa Telegram —
ou seja, tem uma barreira de adoção (precisar instalar/abrir um app que
hoje ninguém usa) que o e-mail e o WhatsApp não têm.

## 2. Como funciona, na prática

### 2.1 Criar o bot (uma vez, leva minutos)

1. Abrir conversa com **[@BotFather](https://t.me/botfather)** no Telegram
   (é o próprio bot oficial do Telegram pra criar outros bots).
2. Mandar `/newbot`.
3. Escolher um nome de exibição (ex.: "PRICETAX Cronograma") e um
   **username único terminado em "bot"** (ex.: `pricetax_cronograma_bot`)
   — **não dá pra mudar depois**, escolher com calma.
4. O BotFather devolve um **token** (formato
   `123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`) — é a credencial de
   autenticação pra toda chamada à API. Fica igual a uma `ANTHROPIC_API_KEY`:
   variável de ambiente no Railway (`TELEGRAM_BOT_TOKEN`), nunca commitada.

Não tem processo de aprovação, revisão de conteúdo, nem verificação de
CNPJ/negócio — o bot já funciona no instante em que o token é gerado.

### 2.2 Receber mensagens: webhook (não polling)

A API tem dois jeitos de o servidor saber que chegou mensagem:

- **`getUpdates` (polling)**: o servidor fica perguntando pro Telegram
  "tem mensagem nova?" de tempos em tempos. Simples de testar localmente,
  mas desperdiça requisição e tem atraso.
- **Webhook (`setWebhook`)**: o Telegram manda um `POST` direto pro seu
  servidor assim que uma mensagem chega. **Essa é a opção certa aqui**,
  porque:
  - Exige HTTPS com certificado válido — e o Cronograma **já tem isso de
    graça** via Railway (`painel.pricetax.com.br` já é HTTPS com certificado
    confiável; não precisa gerar certificado auto-assinado nem nada disso
    que a documentação do Telegram descreve pra quem hospeda em servidor
    próprio).
  - Configuração é uma chamada só, uma vez:
    ```bash
    curl -F "url=https://painel.pricetax.com.br/api/telegram/webhook" \
      -F "secret_token=UM_SEGREDO_SO_SEU" \
      https://api.telegram.org/bot<TOKEN>/setWebhook
    ```
    O `secret_token` é opcional mas recomendado: o Telegram devolve esse
    valor num header (`X-Telegram-Bot-Api-Secret-Token`) em toda chamada
    ao webhook, e o servidor confere antes de processar — é a forma de ter
    certeza que quem está chamando o endpoint é mesmo o Telegram, não
    alguém tentando forjar uma requisição.
  - Portas aceitas: 443, 80, 88 ou 8443 — Railway já serve na 443 por
    padrão, sem ajuste nenhum necessário.

### 2.3 Formato do que chega no webhook

Cada mensagem chega como um `POST` com JSON parecido com isto:

```json
{
  "update_id": 10000,
  "message": {
    "message_id": 1365,
    "date": 1757347200,
    "from": { "id": 1111111, "first_name": "Rafael", "username": "rafaelsouza" },
    "chat": { "id": 1111111, "type": "private" },
    "text": "Reunião de hoje com o cliente X: ..."
  }
}
```

Campos que interessam:
- **`message.from.id`** — identificador único e permanente da pessoa no
  Telegram (não muda mesmo se ela trocar de username). É essa a "chave"
  que precisaria ficar salva no cadastro de usuário do Cronograma pra
  saber quem mandou a mensagem.
- **`message.chat.id`** — pra onde responder (numa conversa privada é
  igual ao `from.id`; em grupo é diferente).
- **`message.text`** — texto simples.
- **`message.document`** / **`message.photo`** — quando vem um arquivo
  anexado, vem só uma referência (`file_id`), não o arquivo em si (ver
  próxima seção).

### 2.4 Baixando um arquivo anexado (ex.: transcrição em .txt/.pdf)

Vem em dois passos (o Telegram nunca manda o arquivo direto no webhook):

1. `GET https://api.telegram.org/bot<TOKEN>/getFile?file_id=<ID>` →
   devolve um `file_path`.
2. `GET https://api.telegram.org/file/bot<TOKEN>/<file_path>` → baixa o
   arquivo de verdade.

### 2.5 Mandando mensagem/arquivo de volta

`POST https://api.telegram.org/bot<TOKEN>/sendMessage` (texto) ou
`sendDocument` (arquivo) — é uma chamada HTTP simples, sem SDK obrigatório
(dá pra usar `fetch` puro, sem dependência nova no `package.json`, ao
contrário do que fizemos com `@anthropic-ai/sdk` pra caixa de transcrições).

## 3. Limites técnicos (confirmados na doc oficial + FAQ, 2026-09)

| Limite | Valor |
|---|---|
| Download de arquivo (bot recebendo, via `getFile`) | até 20 MB |
| Upload de arquivo (bot mandando) | até 50 MB |
| Texto de mensagem (`sendMessage`) | até 4096 caracteres — passou disso, a API recusa (`Bad Request: message is too long`), **não trunca sozinho** |
| Legenda de mídia (`caption`) | até 1024 caracteres (há indício de que a Telegram ampliou isso pra 4096 em alguns contextos — confirmar na hora de implementar) |
| Taxa — mesmo chat individual | ~1 mensagem/segundo |
| Taxa — mesmo grupo | até 20 mensagens/minuto |
| Taxa — broadcast geral (chats diferentes) | ~30 mensagens/segundo (sobe pra 1000/s com "paid broadcasts", recurso pago que não se aplica aqui) |
| Botões de teclado inline | até 100 botões; `callback_data` de cada botão até 64 bytes |
| Parâmetro de deep link (`?start=`) | 1–64 caracteres, só alfanumérico + `_` e `-` |

**Achado importante pro nosso caso de uso**: uma transcrição de reunião
real facilmente passa de 4096 caracteres (a do TECUMSEH que o Rafael
mandou nessa mesma sessão tinha ~70KB de texto). Se a pessoa **colar a
transcrição direto como mensagem de texto**, o Telegram do lado do
cliente quebra automaticamente em várias mensagens ao enviar — o que faz
o webhook receber **várias chamadas separadas** pra uma única
transcrição, e o backend precisaria remontar isso (por ordem de
`message_id`/tempo, com uma janela de espera antes de considerar
"terminou de colar"), o que é frágil. **A solução mais simples é orientar
a pessoa a mandar a transcrição como arquivo (`.txt`) em vez de colar
como texto** — documento não tem esse limite de 4096 (só o limite de
20 MB de download, que um `.txt` de transcrição nunca chega perto de
atingir), e chega inteiro numa `message.document` só, sem fragmentação.

## 4. Recursos avançados (além do básico)

Pesquisa adicional (2026-09) na documentação oficial, focada no que é
relevante pra esse tipo de integração:

### 4.1 Deep linking (`?start=`) — resolve o vínculo pessoa↔empresa melhor que um comando manual

Todo bot tem um link `https://t.me/<username_do_bot>?start=PARAMETRO`.
Quando alguém abre esse link, o Telegram manda a mensagem `/start
PARAMETRO` pro bot automaticamente — a pessoa só precisa clicar, não
precisa digitar nada. Isso muda a seção 5 abaixo: em vez de pedir pra
pessoa **digitar** um código (`/vincular A1B2C3`), o botão "Vincular
Telegram" no painel pode gerar direto um **link clicável**
`https://t.me/pricetax_bot?start=A1B2C3` — a pessoa clica, o Telegram
abre já com a mensagem pronta, ela só confirma o envio. Menos fricção,
menos erro de digitação.

### 4.2 Inline keyboards + `callback_query` — pra escolher a empresa

`InlineKeyboardMarkup` manda botões junto da mensagem (não confundir com
o teclado normal de digitação). Cada botão carrega um `callback_data`
(até 64 bytes) que volta pro backend como um update `callback_query`
quando clicado. É exatamente o mecanismo certo pra resolver "a pessoa tem
acesso a mais de uma empresa — qual delas é essa transcrição?": o bot
manda uma mensagem com um botão por empresa, a pessoa clica na certa, o
backend recebe o `callback_data` (ex.: `empresa:proj-1enhk7i`) e processa
— sem precisar a pessoa digitar nome de empresa (que pode ter erro de
digitação/ambiguidade).

### 4.3 `setWebhook` — parâmetros que passei batido na primeira pesquisa

- `secret_token` (já mencionado acima) — confirmado: 1 a 256 caracteres,
  só `A-Z a-z 0-9 _ -`.
- `allowed_updates` — lista de quais tipos de update o Telegram deve
  mandar pro webhook (ex.: só `["message", "callback_query"]`). Sem isso,
  vem tudo (incluindo coisas que não usaríamos, tipo `edited_message`,
  `poll`) — vale restringir pra reduzir tráfego/processamento à toa.
- `max_connections` — 1 a 100 conexões HTTPS simultâneas (padrão 40) —
  não é algo que precisaríamos tocar no volume do Cronograma.
- `drop_pending_updates` — zera a fila de updates acumulados; útil só na
  hora de trocar/reconfigurar o webhook em teste, pra não processar lixo
  acumulado de testes anteriores.

### 4.4 `setMyCommands` — menu de comandos na UI do Telegram

Registra uma lista de comandos (ex.: `/vincular`, `/ajuda`) que aparece
como sugestão na caixa de digitação do Telegram — puro polish de UX, zero
impacto técnico, mas deixa o bot parecendo "profissional" em vez de
exigir que a pessoa saiba os comandos de cor.

### 4.5 `sendChatAction` — mostrar "digitando..." enquanto processa

Chama esse método com `action: "typing"` assim que a transcrição chega e
antes de responder — mostra o indicador nativo de "digitando..." no
Telegram da pessoa. Como o processamento pela Claude API não é instantâneo
(mesma lógica de `processSubmission()` já existente, que já é
fire-and-forget), isso comunica "recebi, tô processando" sem precisar
nem mandar uma mensagem de texto pra isso.

### 4.6 `parse_mode` — formatação nas respostas do bot

`sendMessage` aceita `parse_mode: "HTML"` ou `"MarkdownV2"` pra formatar a
resposta (negrito, itálico, link). Útil pra responder algo como "✅
Reunião **Kickoff com o cliente** registrada — <a href='...'>abrir no
painel</a>" em vez de texto corrido. MarkdownV2 exige escapar um bocado de
caracteres especiais (`_*[]()~\`>#+-=|{}.!`); HTML é mais simples de gerar
a partir de template string no backend.

### 4.7 Local Bot API Server (self-hosted) — não necessário agora

Existe uma versão open-source do servidor da API
([tdlib/telegram-bot-api](https://github.com/tdlib/telegram-bot-api)) que
dá pra hospedar você mesmo em vez de usar `api.telegram.org` — remove o
limite de 20 MB de download e sobe o de upload pra 2000 MB. **Não parece
necessário aqui**: transcrição de texto nunca chega perto de 20 MB: isso
só entraria em cogitação se um dia quisessem mandar áudio/vídeo de
reunião direto pelo bot. Guardar como opção futura, não como parte do
plano inicial.

## 5. O problema real de identificação: "quem é essa pessoa?"

Isso é o ponto que mais importa pra encaixar no Cronograma, e o Telegram
**não resolve sozinho**: `message.from.id` é só um número aleatório do
Telegram — não tem nome de empresa, CNPJ, nem e-mail cadastrado junto.

Pra saber "esse `from.id` é o Rafael, da empresa X" o Cronograma precisaria
de um **passo de vínculo, uma vez só por pessoa** — usando deep linking
(§4.1), que é mais simples pra quem usa do que digitar comando:
1. No painel, o usuário logado clica em "Vincular Telegram" → o backend
   gera um código curto (ex.: `A1B2C3`), válido por alguns minutos, e
   mostra um link `https://t.me/pricetax_bot?start=A1B2C3` (ou um QR code
   apontando pra ele, pra quem está no celular escanear com a câmera).
2. A pessoa clica/escaneia → o Telegram abre e já manda `/start A1B2C3`
   pro bot sozinho.
3. O backend recebe o `from.id` junto com o código no webhook, confere
   contra o código gerado, e grava a vinculação (`from.id` ↔ `user.id`)
   numa tabela nova — mesmo problema (e solução parecida) que
   `server/google.js` já resolveu pro OAuth do Google Calendar, só que
   mais simples (não tem OAuth de verdade aqui, é só um código curto).

Sem esse passo, o bot recebe mensagem mas não tem como saber pra qual
empresa/projeto aquilo deveria ir. E se a pessoa tem acesso a mais de uma
empresa, ainda falta resolver *qual* empresa aquela transcrição específica
é — aí entra o inline keyboard do §4.2 (bot pergunta, pessoa clica).

## 6. Como isso se encaixaria no Cronograma (se for implementado)

A peça que já existe — `server/meetingInbox.js` (caixa de transcrições,
`PROJECT_CONTEXT.md` §24.1) — já faz praticamente tudo que seria
necessário: recebe texto bruto, chama a Claude API, cria a reunião. O
Telegram só trocaria a **porta de entrada**:

```
Hoje:   usuário cola no modal do painel → POST /api/meeting-inbox
Depois: usuário manda no Telegram       → POST /api/telegram/webhook
                                             → resolve from.id → user.id → projeto vinculado
                                             → chama a MESMA processSubmission() já existente
```

Ou seja, **não duplicaria a lógica de extração por IA** — só adicionaria
um router novo (`server/telegram.js`, mesmo padrão de `server/google.js`)
que traduz "mensagem do Telegram" em "chamada pra função que já existe".

Isso pressupõe resolver antes o vínculo pessoa↔empresa da seção 5 (deep
linking) e, se a pessoa tiver acesso a mais de uma empresa, o
desambiguador por inline keyboard do §4.2.

## 7. Riscos e limitações conhecidas

- **Adoção**: o time não usa Telegram hoje. Isso é o maior risco prático —
  tecnicamente simples, mas depende de as pessoas efetivamente abrirem
  outro app.
- **Modo privacidade em grupo**: se o bot for usado dentro de um grupo (em
  vez de conversa 1-a-1 com cada pessoa), por padrão ele só vê mensagens
  que começam com `/comando` ou que o mencionam (`@bot`) — precisa
  desativar o "privacy mode" pelo BotFather (`/setprivacy` → `Disable`) se
  quiser que ele leia qualquer mensagem solta no grupo.
- **Sem histórico/reenvio automático de mensagens perdidas**: se o
  servidor cair, o Telegram tenta reentregar por um tempo, mas não é uma
  fila garantida — não é o tipo de canal pra dado crítico sem confirmação
  de recebimento (por isso a resposta do bot pro usuário confirmando "recebi,
  processando" importa).
- **Transcrição colada como texto pode fragmentar** (§3) — precisa orientar
  claramente "manda como arquivo .txt", não confiar que a pessoa vai colar
  texto corrido sem estourar 4096 caracteres.

## 8. Próximos passos, se for pra frente

1. Decidir se vale a pena mesmo com o time não usando Telegram hoje (ou se
   fica só pro Rafael/sócios).
2. Criar o bot via BotFather (5 min, sem custo, reversível — dá pra
   apagar/recriar à vontade enquanto testando) + `setMyCommands` (§4.4)
   com `/vincular` e `/ajuda`.
3. Implementar `server/telegram.js`: webhook (com `allowed_updates`
   restrito a `message`+`callback_query`, §4.3) + tabela de vínculo
   `telegram_links` (`user_id`, `telegram_chat_id`, `codigo`, `expira_em`)
   usando deep link (§4.1) em vez de código digitado + roteamento pra
   `processSubmission()` já existente + `sendChatAction` (§4.5) enquanto
   processa.
4. Testar local com `ngrok`/similar antes de configurar o `setWebhook`
   apontando pra produção (o Telegram exige HTTPS público — não dá pra
   testar `setWebhook` contra `localhost` sem um túnel).
