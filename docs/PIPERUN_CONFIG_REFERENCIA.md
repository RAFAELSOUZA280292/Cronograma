# Referência da configuração do PipeRun (conta PriceTax, 25/10/2026)

Gerado do backup (`~/Downloads/PIPERUN_BACKUP/2026-10-25_completo/json`). **Sem dados de clientes** — só a estrutura que o CRM não reproduz como recurso próprio e que precisa estar escrita para quem quiser recriá-la.

## Campos personalizados (17)

| Campo | Tipo | Pertence a | Opções |
|---|---|---|---|
| Forma de Tributação | lista (uma opção) | empresa/pessoa | SIMPLES, Lucro Presumido, Lucro Real, MEI |
| Como você classifica o Porte do Escritório em relação ao número de clientes? | lista (uma opção) | empresa/pessoa | Até 50 clientes, Entre 51 e 100 clientes, Entre 101 e 200 clientes, Entre 201 e 500 clientes, Acima de 500 clientes |
| Qual a faixa de Faturamento de sua empresa? | lista (uma opção) | empresa/pessoa | Até 100 mil por mês, De 101 mil até 150 mil por mês, De 151 mil até 200 mil por mês, De 201 mil até 300 mil por mês |
| Quais são as principais motivações para este projeto de Transição da Reforma Tributária? | texto | negócio |  |
| Quais são as pessoas chave na organização? Além de você, quem mais participa do processo decisório? É importante incluí-lo agora ou que fase do processo? | texto | negócio |  |
| Quantos funcionários a empresa tem? | número | empresa/pessoa |  |
| Título | texto | negócio |  |
| Quais serviços ou produtos você oferece? | lista (várias opções) | negócio | Serviços Contábeis, Consultoria para a Reforma Tributária, Outros |
| Quando pretende começar as Simulações para seus clientes? | lista (uma opção) | negócio | Em até 1 mês?, Em até 3 meses?, Em até 6 meses? |
| Nome / e-mail do usuário do Simulador PriceTax | texto | negócio |  |
| Nome / e-mail do contato financeiro | texto | negócio |  |
| Faixa de Faturamento Anual | lista (uma opção) | negócio | Até R$ 5 milhões, 5 a 20 milhões, 20 a 50 milhões, 50 a 100 milhões, 100 a 300 milhões, 300 a 600 milhões, 600 milhões a 1 bilhão, 1 a 2 bilhões, 2 a 3 bilhões, 3 a 5 bilhões |
| Atividade Principal | lista (uma opção) | negócio | Serviço, Comércio, Indústria |
| Importação e/ou Exportação | lista (uma opção) | negócio | Sim, Não |
| Regime Especial | lista (uma opção) | negócio | Sim, Não |
| Quantidade estimada de fornecedores | número | negócio |  |
| Ajuste percentual por atividade (desconto/acréscimo) | fórmula | negócio | fórmula: ((1 * 1) * 1) |

Os valores já preenchidos nos negócios foram para a descrição do negócio (bloco "Campos do PipeRun"); o CRM não tem campos personalizados estruturados.

## Formulários internos (4)

Nenhum tem link público (`public_hash` vazio): são formulários preenchidos pela equipe dentro do negócio; as respostas viram os campos acima. Cada resposta registrada aparece na linha do tempo do negócio ("formulário … foi respondido").

**Qualificação de Leads** (página "Diagnóstico PriceTax", criado em 2026-04-11)
- Campos: Título do negócio; Origem; Site; Nome da empresa; CNPJ; Faixa de Faturamento Anual; Nome da pessoa; Telefones; E-mails

**Informações para Simulação** (página "Diagnóstico PriceTax", criado em 2026-04-11)
- Campos: Título do negócio; Origem; Faixa de Faturamento Anual; Atividade Principal; Importação e/ou Exportação; Regime Especial; Quantidade estimada de fornecedores; Ajuste percentual por atividade (desconto/acréscimo); Site; Nome da empresa; CNPJ; Nome da pessoa; Telefones; E-mails

**Transferência para Operações** (página "Transferência para Operações", criado em 2026-01-12)
- Campos: Título do negócio; Nome da empresa; CNPJ; Nome / e-mail do usuário do Simulador PriceTax; Nome / e-mail do contato financeiro

**Qualificação Leads Parceiros Contabilidade** (página "Conhecendo seu Escritório", criado em 2026-01-12)
- Campos: Título do negócio; Como você classifica o Porte do Escritório em relação ao número de clientes?; Forma de Tributação; Quantos funcionários a empresa tem?; Qual a faixa de Faturamento de sua empresa?; Quais são as pessoas chave na organização? Além de você, quem mais participa do processo decisório? É importante incluí-lo agora ou que fase do processo?; Quais são as principais motivações para este projeto de Transição da Reforma Tributária?; Quais serviços ou produtos você oferece?; Quando pretende começar as Simulações para seus clientes?

## Funis, etapas e prazos (SLA)

| Funil | Etapas (prazo em dias) |
|---|---|
| Empresas | Leads › Mapeamento › Conexão (5 d) › Reunião de Levantamento de Informações para Simulação › Oportunidade Estruturada › Proposta (2 d) › Negociação (15 d) › Contrato (15 d) |
| Indicações de Contadores | Leads › Mapeamento › Conexão (5 d) › Reunião com o Empresário e Partner › Proposta (2 d) › Negociação (15 d) › Contrato (15 d) |
| Partner - Contadores | Leads › Mapeamento › Conexão (5 d) › Apresentação do Programa PriceTax › Proposta (2 d) › Negociação (15 d) › Contrato (15 d) |
| Tributaristas e Contadores | Leads › Mapeamento › Conexão (5 d) › Apresentação do Programa PriceTax › Acesso Teste › Proposta (2 d) › Negociação (15 d) › Contrato (15 d) |
| Canais de Parceiros | Suspect (9 d) › Conexão › Reunião Agendada › Contrato › Cadência Iniciada |
| Outbound PriceTax | Suspect › Mensagem WhatsApp › Envio de Vídeo de Apresentação › Mensagem Whats ABHV |
| Pós Vendas | Ganhos › Registrados no Trello |

Já recriados no CRM (conferência 41/41).

## Automações

- **Ganhos - Iniciar Operação** (ativa): ao ganhar no funil Empresas, etapa Contrato → cria cópia em Pós Vendas › Ganhos. Reproduzida no CRM (*Funis e etapas › Automação ao ganhar*).
- **Aviso de Ganho** (desativada): e-mail ao financeiro. Não reproduzida.

## Tags (30)

ORIG · Cliente Atual, ORIG · Evento, ORIG · Indicação, ORIG · Parceiro Estratégico, ORIG · Prospecção Ativa, ORIG · Rede Social, ORIG · Relacionamento Institucional, ORIG · Reunião, ORIG · WhatsApp, RESP · Felipe, RESP · Rafael, RESP · Ronaldo, SERV · Auditoria, SERV · BPO Contábil, SERV · BPO Fiscal, SERV · BPO Folha, SERV · Consultoria Tributária, SERV · Controller, SERV · Diagnóstico Tributário, SERV · Implantação ERP, SERV · Palestra / Evento, SERV · Parceria Estratégica, SERV · Planejamento Tributário, SERV · Precificação, SERV · Reforma Tributária, SERV · Treinamento, SW - PortalX, SW - X da Questão, SW - XClass, SW - XPed

## Origens (26)

Leticia Amaral, Rafael Souza, Troia, SINCA-PR, Parceiros Advogados, Ronaldo Dias de Oliveira, OMIE, Formação Reforma Tributária, Trello, Felipe Del Santo, Maurício Landim, Ronaldo Dias Oliveira, WK, Old - A revisar, Lives, Networking, Facebook, Site, Indicações por clientes, Eventos Empresariais, Instagram, Pesquisa Google, Inbound, Parceiros Contadores, Outbound, Valmir Neves

## Motivos de perda (6)

Postergou decisão (Ação futura), Cliente sem perfil, não qualificado, Sem interesse, Fechou com outra empresa, Prazo de entrega, Preço alto

## Tipos de atividade (15)

3º Follow Up, 2º Follow Up, 1º Follow Up, Atividade - Teste, Follow Up, Envio de Proposta, Terceira Tentativa de Contato, Segunda Tentativa de Contato, Abordagem Inicial - Primeiro Tentativa de Contato, Pesquisa de Mapeamento, Whatsapp, Lembrete, Reunião, E-mail, Ligação

## Segmentos (6)

Comércio, Serviços, Indústrias, Empresas de Plataforma Digital, Empresas Contabilidade e BPO, Locadoras

## Webhooks, equipes, integrações

- Webhooks: **0**. Equipes: **0**. Chat (Jivo/Tawk): desligado. Formulários públicos: nenhum.
- Atendimento (WhatsApp) existe como módulo no PipeRun, mas a API não expõe conversas e o usuário do Rafael não tem permissão de atendente — **a conferir por quem atende** (ver `docs/AUDITORIA_MIGRACAO_PIPERUN.md`).
