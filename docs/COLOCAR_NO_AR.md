# Colocar o sistema no ar — lista do que fazer

Atualizada em 05/10/2026, depois do QA geral (`docs/QA_GERAL.md`). Escrita em português simples.
Cada item diz **quem faz**: **[VOCÊ]** só você consegue ou decide · **[EU]** eu faço (no código) depois do
seu "pode seguir" · **[JUNTOS]** eu preparo e você executa ou confere.

---

## Onde estamos, em cinco linhas

1. O sistema funciona e passa na suíte de testes inteira; as contas de dinheiro, repasse, escala e
   datas foram refeitas por fora e batem ao centavo.
2. Hoje ele guarda os dados **no disco do computador servidor** (estado, diário de comandos, cópias).
   Ele **ainda não usa o Supabase** (nem outro banco): essa parte **não foi construída** e precisa da sua
   aprovação. **E ela deixou de ser opcional:** com até 2.500 cirurgias por mês, o desenho de hoje (todo o
   histórico num bloco só) não aguenta o primeiro ano (`docs/ESCALA_E_BANCO.md`).
3. **Não coloque dado real de paciente na nuvem** antes de fechar o item "Jurídico" (etapa 1).
4. Para uso de teste, com **dado fictício**, ele já pode rodar hoje num computador da clínica.
5. O que separa "funciona" de "pode abrir com dado real" não é erro de conta: é **decisão, jurídico,
   conta no Supabase, HTTPS, servidor que reabre sozinho, alerta e backup fora da máquina**.

---

## Etapa 1 — Decisões (só você pode)

**Já decididas por você (07/10/2026) e feitas:** não travar o mês (F03); login ligado a quem assina o boletim (F05);
teto de R$ 100 milhões por mês (F11); sem prejuízo no repasse (F12, nada a fazer: "cada cirurgia feita já foi
paga"); recusar a base que duplica uma pessoa no dia (Q5); não registrar rascunho de boletim no LOG (Q11).

**Mudou o tamanho do trabalho (07/10/2026):** você informou **800 cirurgias por mês** (≈ 9.600 por ano) e até 2.500
no pico. Com isso o desenho de hoje (todo o histórico num bloco só) serve nos **3 a 4 primeiros meses** e **não aguenta o
primeiro ano**: a troca tem de estar pronta antes do 5º mês. Veja `docs/ESCALA_E_BANCO.md`.
A decisão 1 abaixo agora é "banco de dados de verdade, com tela por mês", e não só "guardar o bloco no Supabase".

| # | Decisão | Por que importa | Quem |
|---|---|---|---|
| 1 | **Aprovar o desenho do armazenamento**: banco relacional (PostgreSQL) com a tela carregando um mês por vez e boletim/ficha por registro (`docs/ESCALA_E_BANCO.md`, seção 2), num servidor Node numa máquina pequena, com a chave de serviço **só no servidor**. E **escolher o fornecedor** (Supabase, Neon, AWS... seção 3 do mesmo arquivo). Custo de referência com Supabase: ≈ US$ 32–37 por clínica por mês, acima dos US$ 20 que você citou; você já sabia. | Sem isso eu não começo a parte maior. É a única mudança "grande" que falta, e agora é **necessária** para o volume. | [VOCÊ] |
| 2 | **Jurídico / LGPD.** Prazo de guarda: você decidiu **3 anos no sistema** + o pacote "Baixar todos os dados" guardado pela clínica; confirmar com o advogado que isso cobre o prazo do prontuário (a Lei 13.787/2018 fala em 20 anos). Contrato com o fornecedor (Supabase) e com a hospedagem, quem é o encarregado de dados, termo de uso, o que fazer quando um paciente pede para apagar. | Dado de saúde é dado sensível. Sem isso, **nada de dado real na nuvem**. | [VOCÊ] com advogado |
| 3 | **Confirmar a matriz de perfis** (4 suposições minhas): (a) Anestesista não vê Horas nem Indicadores; (b) Secretária preenche a ficha de qualidade inteira, inclusive a revisão clínica; (c) Secretária edita cadastro e escala-base; (d) usuário antigo "equipe" vira Anestesista. | Quem vê dinheiro e quem assina é regra de negócio. | [VOCÊ] |
| 4 | **Histórico**: alguém precisa ver o **histórico inteiro de uma vez** (relatório de anos) ou basta por mês? (Volume já informado: **800 por mês ≈ 9.600 por ano**, no pico 2.500 por mês.) | Muda o desenho do banco. | [VOCÊ] |
| 5 | **Dinheiro: 2 casas decimais.** Eu entendi "teto de R$ 100 milhões por mês" e também **recusei mais de 2 casas decimais** (centavos), o que você não disse com essas palavras. Está certo? | Muda o que o sistema aceita digitar. | [VOCÊ] |
| 8 | **LOG**: 12 meses na tela (mínimo) e arquivo mensal conferido por 5 anos (0 = nunca apagar). Confirmar com o jurídico. | Você pediu "pelo menos um ano". | [VOCÊ] |
| 10 | O repositório do GitHub é **público** e tem nomes reais do grupo (F19). Tornar privado? | Privacidade. | [VOCÊ] |
| 11 | Aposentar a camada Google Planilhas (nunca foi executada de verdade, F20)? | Menos coisa para manter. | [VOCÊ] |

---

## Etapa 2 — Contas e máquinas (você, eu guio passo a passo)

| # | Tarefa | Observação |
|---|---|---|
| 1 | Conta no **fornecedor do banco** escolhido (Supabase Pro, Neon, AWS... ver `docs/ESCALA_E_BANCO.md`), **região São Paulo**, **um projeto por clínica**; primeiro um projeto de **teste** (no Supabase, o plano Free serve para testar: sem backup, e pausa depois de uma semana parado). | As chaves **nunca** vão para o chat nem para o repositório; ficam só no servidor. |
| 2 | **Máquina para o servidor**: pequena, em São Paulo (ex.: Lightsail US$ 7–12/mês), Linux. | Windows também funciona, mas a janela do `.bat` não reabre sozinha. |
| 3 | **Domínio** (ou subdomínio) e **HTTPS** (Caddy, certificado automático). | Sem HTTPS a senha viaja aberta: só serve para a rede interna da clínica. |
| 4 | **Backup fora da máquina**: copiar todo dia as pastas `copias/`, `logs/` e `anexos/` para outro lugar (um bucket). Guardar por **pelo menos 13 meses**. | Hoje as cópias moram no mesmo disco do sistema: se o disco morre, elas morrem junto. **É o item mais importante para o "um ano".** |
| 5 | **Monitor externo gratuito** (por exemplo UptimeRobot) olhando `https://seu-endereco/api/saude` a cada 5 minutos, com aviso por e-mail/WhatsApp. | A rota já existe. Responde 200 quando está de pé e gravando; 503 quando o disco recusa gravar. |
| 6 | Definir **quem recebe os alertas** e quem mexe no servidor quando o alerta chegar. | Uma pessoa e um reserva. |
| 7 | Conferir **relógio e fuso** do servidor (hora de Brasília; sincronização automática ligada). | O sistema só aceita gravação com a hora certa (dentro de 5 minutos). |

---

## Etapa 3 — Desenvolvimento (eu, depois do seu "pode seguir")

Em ordem de prioridade. Cada item: pequeno, com teste, um commit.

| # | Tarefa | Origem |
|---|---|---|
**Feito em 07/10/2026 (com teste):** F05 login ↔ assinatura do boletim · F11 teto de R$ 100 milhões por mês e 2
casas · Q5 recusa de duplicata na escala · F13 conflito de horário na virada do dia · F14 trava de uma só cópia do
servidor · F06/F17 cookie `Secure` e IP real atrás de proxy (`--atras-de-proxy`) · F15 limite de 30 exames por
avaliação · Q10 argumentos de comando seguros e objeto-no-lugar-de-texto · recuperação de senha do chefe
(`tools/redefinir_senha.js`) · compressão gzip das respostas · RUNBOOK (`docs/RUNBOOK.md`) · modelos de implantação
(`deploy/`: Caddy, serviço, backup fora da máquina) · teste automático no GitHub (`.github/workflows/testes.yml`).

**Feito em 07/10/2026, à tarde (etapa 0 da arquitetura, com teste `qa/38`):** o índice dos exames não recomeça vazio
(era perda real: o próximo exame anexado apagava o vínculo de todos os outros); cada exame tem ficha e SHA-256, conferidos
na partida e a cada dia; **prazo de guarda de 3 anos** (decisão sua): exame removido fica 3 anos contados da remoção (antes
contava do envio e um exame antigo removido saía no mesmo dia) e a cópia mensal fica 36 meses; importar recusa PDF
estragado; **Dados e backup → Baixar todos os dados**, um .zip com tudo, sem limite de tamanho (586 MB de PDFs saíram em
2,2 s com a memória subindo 43 MB), conferido com Python e com o Windows. Isso resolve o "backup completo com PDFs" (F07)
para a guarda; a importação de volta ainda é pelo .json.

**Falta:**

| # | Tarefa | Origem |
|---|---|---|
| 1 | **Banco relacional + tela por mês + boletim/ficha por registro** (`docs/ESCALA_E_BANCO.md`), com a chave de serviço só no servidor, tabelas com segurança por linha ligada e sem política (ninguém acessa direto do navegador), arquivos em bucket privado. **Grande: pede a aprovação da etapa 1, item 1.** | Volume de 2.500/mês |
| 2 | **Backup completo com PDFs** sem estourar a memória: com o banco novo, o backup passa a ser o do próprio banco e do bucket; hoje a importação aceita no máximo 200 MB (a cópia das pastas `anexos/` por `deploy/backup_diario.*` resolve o dia a dia). | F07 |
| 3 | **Script que cria uma clínica nova** (projeto, buckets, chefe, senha inicial) — um sistema por clínica. | Decisão |
| 4 | Mover o saneador de dados que entram de fora para o `core/` (hoje mora numa pasta de tela). | Arquitetura |
| 5 | Usar os modelos de `deploy/` numa máquina de verdade e **testá-los** (serviço, Caddy, backup): foram escritos, não executados. | F16 |

---

## Etapa 4 — Antes de abrir para a equipe

| # | Teste | Como saber que passou |
|---|---|---|
| 1 | **Ensaio de restauração**: pegar um backup, restaurar num servidor limpo. | Todas as cirurgias, boletins, fichas, repasses **e PDFs** voltam; as contas dão o mesmo número. |
| 2 | **Ensaio de queda**: desligar o servidor à força no meio do uso e ligar de novo. | Nada que foi aceito some (o diário reaplica). O teste automático já cobre; repetir no ambiente real. |
| 3 | **Ensaio de disco cheio** no ambiente real. | O sistema recusa gravar com mensagem clara (503), nada se perde, `/api/saude` avisa. |
| 4 | **Revisão de segurança por uma pessoa** (senhas, cookie, cabeçalhos, perfis). | Relatório sem item crítico. |
| 5 | **Uma semana de uso com dados fictícios** por 2 ou 3 pessoas de cada perfil. | Ninguém trava; a tela Integridade fica limpa. |
| 6 | **Conferência clínica** das definições do painel de qualidade (`docs/QUALIDADE_INDICADORES.md`). | Quem usa confirma cada definição. |
| 7 | Conferir que o **alerta chega** (derrubar o servidor de propósito e ver o aviso). | Mensagem recebida em minutos. |

---

## Etapa 5 — Dia da virada

1. Subir o servidor com HTTPS e abrir o endereço.
2. Criar o **Anestesista chefe** com o código de primeiro acesso (some do arquivo quando usado) e trocar a senha.
3. Criar os usuários (Anestesista chefe, Anestesista, Secretária), cada um com senha própria. **Ligar cada chefe e cada
   anestesista ao seu cadastro** (tela Usuários → "Assina boletim como"): sem isso a pessoa não assina boletim. Cadastre **dois chefes**.
4. Conferir **Escala-base**, **cadastro de anestesistas** (nome, CRM, PIX) e **dados da clínica** (CNPJ, termo).
5. Tela **Auditoria → Arquivos e retenção**: conferir 12 meses na tela e prazo de guarda.
6. Fazer uma cirurgia de teste ponta a ponta (cirurgia → avaliação → boletim assinado → ficha de qualidade) e apagar/descartar o que for teste.
7. Confirmar que o **backup fora da máquina** rodou e que o monitor está verde.
8. Guardar fora do computador: a senha do chefe e o contato de quem cuida do servidor.

---

## Etapa 6 — Primeiros 30 dias

| Quando | O que olhar |
|---|---|
| **Todo dia** (1 minuto) | O monitor verde? A tela **Integridade** sem erro? Mensagem de "cópia do dia gravada" no log do servidor? |
| **Toda semana** | Espaço livre em disco; tamanho do estado e tempo de gravação (se passar de 300 ms, avisar); tela **Auditoria** (quem entrou, recusas, acessos negados); duplicidade de pessoa na escala depois de mudar a base. |
| **Todo mês** | **Restaurar uma cópia num lugar de teste** e conferir; conferir os **arquivos de LOG** (botão de conferência de SHA-256); relatório de repasse conferido por duas pessoas. |
| **Dia 30** | Revisar: lentidão, erros, pedidos da equipe, decisões pendentes. Decidir sobre fechamento de mês (F03). |

---

## Se algo der errado (resumo; o passo a passo está em `docs/RUNBOOK.md`)

| Situação | O que fazer |
|---|---|
| **Sistema fora do ar** | O monitor avisa. Reabrir o serviço. Os comandos aceitos estão no diário e voltam sozinhos. |
| **"Não consegui gravar no disco"** (erro 503) | Liberar espaço ou permissão. Nada foi alterado; quem digitou refaz depois. Não precisa reiniciar. |
| **Dado lançado errado** | Tela **Auditoria**: quem, quando, de→para. Corrigir pela própria tela. Restaurar cópia só em caso grave (perde o que veio depois; o sistema guarda uma cópia "antes de restaurar"). |
| **Relógio do computador errado** | O sistema recusa gravações com hora fora de 5 minutos; os freios **não apagam** cópias nem arquivos de LOG de uma vez. Acertar o relógio. |
| **Esqueceram a senha do chefe** | Com o servidor fechado: `node tools/redefinir_senha.js <pasta de dados> <login>` (mostra uma senha temporária). Ou outro chefe troca pela tela Usuários: **cadastre dois chefes**. Ver `docs/RUNBOOK.md`. |
| **Suspeita de acesso indevido** | Tela **Auditoria** (acessos por usuário); trocar as senhas; derrubar as sessões; avisar o jurídico (LGPD tem prazo para comunicar incidente). |

---

## O que **não** mudou (para não haver surpresa)

- As regras de negócio: nada foi alterado sem você saber. O que mudou de visível: LOG mínimo de 12 meses; **só quem
  entrou assina o boletim** (login ligado ao cadastro); **teto de R$ 100 milhões por mês e no máximo 2 casas decimais**;
  **mudança de escala-base que duplica uma pessoa no dia é recusada**; conflito de horário também na virada do dia;
  erro claro quando o disco recusa gravar; linha no LOG ao trocar a escala-base.
- Nada foi enviado ao GitHub, nem publicado em nenhum site, nem criado em nenhuma nuvem.
