# QA — o que a bateria cobre

```bash
node qa              # tudo (596 testes)
node qa 05           # só o arquivo que começa com "05"
node qa rodizio      # só os arquivos cujo nome contém "rodizio"
```

Sai com código 1 se qualquer teste falhar, então serve de porta de CI.
Zero dependências: o arnês está em `qa/_runner.js`.

**Resultado atual: 596 testes, 596 aprovados.**

---

## Os dois testes que mais importam

A maior parte de uma suíte confirma o que o autor achou que escreveu. Estes
dois confrontam o código com a realidade do arquivo do cliente:

### 1. Fidelidade dos cabeçalhos (15 testes)

`tools/extrair_cabecalhos.py` tira uma impressão digital da planilha real
(`data/cabecalhos_planilha.json`) e a QA compara **rótulo por rótulo** com
`core/01_schema.js` — inclusive acento, parêntese e "(auto)".

Cobre as 6 abas tabulares, as 3 escalas mensais, o cabeçalho da aba HORAS na
linha 4, o do ledger na linha 20, o do comparativo na linha 23, e os rótulos
de indicador coluna A de FINANCEIRO, INDICADORES e DASHBOARD.

Trocar um acento no código faz o teste falhar antes de o sistema chegar perto
da planilha.

### 2. Fidelidade do rodízio (7 testes)

O motor gera as três escalas mensais a partir da `ESCALA_BASE` e compara com
`data/escalas_ref.json` — retrato do que **já está** nas abas da planilha.

**395 de 395 linhas** conferidas campo por campo: `DATA`, `DIA DA SEMANA`,
`POSIÇÃO`, `ANESTESISTA (CALCULADO)`, `ID_ANESTESISTA` e
`ANESTESISTA EFETIVO`.

Foi esse teste que derrubou a primeira leitura da regra do rodízio: a hipótese
inicial ("elenco fixo por dia da semana") acertava a primeira semana e errava
915 campos depois dela. A regra correta — giro de uma casa por semana — está
em [REGRAS_DE_NEGOCIO.md §1](REGRAS_DE_NEGOCIO.md).

---

## Cobertura por arquivo

O bloco de fidelidade dos cabeçalhos (15 testes) roda em **toda** invocação,
inclusive quando você filtra por um arquivo só — é a rede que protege contra
desalinhamento com a planilha. Os números abaixo são os testes próprios de
cada arquivo; somados aos 15, dão 514.

| Arquivo | Testes | O que cobre |
|---|---|---|
| *(sempre)* | 15 | Fidelidade dos cabeçalhos do schema contra a planilha |
| `01_fundacao.test.js` | 36 | Schema das 11 abas, cadastro dos 15, datas/horas/durações, dinheiro, chaves compostas, domínios |
| `02_rodizio.test.js` | 34 | ESCALA_BASE, giro semanal, fidelidade das 395 linhas, ajuste manual, consolidada, TASK-203 |
| `03_cirurgias.test.js` | 40 | TASK-201/202/203, colunas de tempo, colunas Z/AA/AB/AC/AD, coluna T, critérios de contabilização, conflito de agenda, normalização |
| `04_avaliacoes.test.js` | 26 | TASK-301/302/303 e validação da avaliação |
| `05_horas.test.js` | 25 | TASK-401, fallback, contador de pendência, aba HORAS, precisão |
| `06_financeiro.test.js` | 43 | TASK-402 (ledger), indicadores mensais, TASK-403 (indicadores e dashboard) |
| `07_store.test.js` | 51 | Transações, rollback, idempotência, integridade, reparo, LOG, robustez |
| `08_appsscript.test.js` | 56 | Ponte com o Google Sheets, com Sheets simulado; decisões do grupo levadas à planilha (CHAVE PIX, CRM, linhas e colunas ocultas, nada apagado) |
| `09_automacao.test.js` | 31 | Escala-base automática, menor posição livre, remanejamento |
| `10_ajustes_grupo.test.js` | 18 | Tipos de cirurgia (TUSS), comparativo sem valores, dias fixos, PIX, PDF do TCLE |
| `11_arquitetura_seguranca.test.js` | 26 | IDs nunca reaproveitados, uid da avaliação, campos protegidos, rollback, saneamento de importação, CSV sem fórmula, auditoria do PIX, estrutura de módulos e CSP |
| `12_calendario.test.js` | 22 | Horizonte móvel além de dez/2026, rodízio sem salto na virada do ano, mês encerrado preservado, navegação do calendário (faixa de 24 meses, mês distante montado na hora, ajuste que sobrevive à recarga), migração de estado antigo |
| `13_revisao_logica.test.js` | 18 | Centavos e milhar em dinheiro, horas negativas, nome canônico, horário de duração zero, avisos de validação, avaliação cancelada fora do faturamento, histórico preservado na exclusão, renomeação em cascata, mesma pessoa em dois postos |
| `14_guarda.test.js` | 9 | Retenção das cópias automáticas (diárias, mensais, marcos de 400 dias), backup completo com PDFs, partida |
| `15_repasse.test.js` | 11 | Divisão igual com centavos sem sobra, base caixa × competência, despesas, registro do que foi repassado |
| `16_tcle_clinica.test.js` | 9 | Dados da clínica (CNPJ, LOG, backup saneado), texto próprio do termo, PDF válido com assinatura em vetor e código, link de WhatsApp do paciente |
| `17_boletim.test.js` | 30 | Boletim anestésico: SHA-256 contra vetores oficiais e o Node, leitura estrita x tolerante, horários atravessando a meia-noite, validação (PA, fármaco sem via), checklist, ciclo de vida (criar, finalizar, reabrir com motivo, descartar), horário real e CRM levados na assinatura, cirurgia com boletim não se exclui, congelamento e rollback, integridade (adulteração, órfão, duplicado), backup, CSV e PDF com xref conferida |
| `18_downloads.test.js` | 4 | Planilhas num .zip (CRC-32 igual ao do zlib, nomes com acento em UTF-8, conteúdo intacto); versão online entregando pela capacidade "downloads" (nome, bytes com BOM, recusa sem erro) |
| `19_servidor.test.js` | 12 | Modo servidor: só webapp/ e core/ servidos (sem travessia), primeiro acesso com código, cookie HttpOnly/SameSite, CSRF, trava após 5 senhas erradas, comando reexecutado chega ao MESMO estado da tela (uid, LOG, assinatura), concorrência (criar recusado, editar aceito), papéis, PDFs com cascata, reinício e diário reaplicado, SSE, backup e importação; **ficha de qualidade idêntica no servidor e na tela, sobrevivendo ao reinício, e recusa (403) de estrutura e configuração clínica para a equipe** |
| `20_qualidade.test.js` | 66 | Ficha de qualidade: nenhuma resposta nasce marcada, leitura estrita x tolerante, idempotência, imutabilidade; intervalos (duração, SRPA, jejum, antibiótico, meia-noite); pendência que não bloqueia; janela realizada sem respostas vira pendência; ciclo de vida (concluir, reabrir com motivo, descartar, IDs que não renascem); vários eventos do mesmo tipo; relação com a anestesia nunca presumida; histórico com autor e horário; revisão clínica sem apagar o registro original; **dado ausente nunca vira "não"**, "não se aplica" sai da população, elegibilidade por indicador, limiares configuráveis, evolução mês a mês, filtros, completude; pertinência à técnica; comparação estratificada por ASA; estrutura (duplicidade, vínculo com o atendimento, item não verificado); configuração clínica e aprovação; integridade, backup e saneamento; PDF, planilha e PPTX |
| `21_qualidade_prototipo.test.js` | 14 | Protótipo: a demonstração (18 atendimentos fictícios, estrutura, eventos, acompanhamentos, lacunas) monta sem erro e a integridade fecha; os números do painel batem com a recontagem independente das fichas; eventos + "não" + sem informação = elegíveis em todos os 36 indicadores; comparação por profissional soma o painel geral; exportação por atendimento sem nome, prontuário nem data exata; "Tirar exemplos" limpa tudo; cirurgia com ficha não se exclui |

---

## O Sheets simulado

`qa/_mock_sheets.js` implementa a parte da API do Apps Script que os `.gs`
realmente usam: `getSheetByName`, `getRange` (nas duas formas — por índice e
em notação A1), `getValues`/`setValues`, `getLastRow`, `getMaxRows`,
`setDataValidation`, `setFormulas`, mais `Session`, `LockService`, `ScriptApp`
e `Logger`.

Os três arquivos `.gs` são carregados no escopo global por `eval` indireto —
que é exatamente o que o Apps Script faz ao concatenar os arquivos do projeto
por ordem de nome.

**Por que vale o trabalho:** `node --check` prova que o `.gs` compila, não que
ele lê e escreve a planilha certo. A ponte é onde moram os erros mais caros
(coluna trocada, linha errada, tipo convertido errado, gatilho duplicando
linha), e este mock permite testá-la sem abrir o navegador nem tocar numa
planilha real.

O mock encontrou dois defeitos reais durante o desenvolvimento — descritos
abaixo.

---

## Defeitos que a QA pegou

Vale registrar, porque explica decisões de código:

### Revisão de arquitetura e segurança (set/2026)

- **Busca perdia o foco a cada tecla.** A tela é redesenhada a cada `input`
  e o campo era recriado; o cursor ia para o `<body>`. A casca agora guarda e
  devolve foco e posição do cursor.
- **PDF de um paciente podia aparecer na avaliação de outro.** Os anexos se
  prendiam ao ID sequencial (AVP0001), que renasce depois de "apagar tudo" ou
  de importar backup. Agora se prendem a um `uid` aleatório da avaliação; o
  que sobra aparece como órfão em Integridade.
- **IDs apagados renasciam.** Excluir a última cirurgia devolvia o número
  para a próxima, e o LOG de "CIR0010 excluída" passava a falar de outra.
  Agora há uma sequência que nunca desce.
- **Servidor servia o projeto inteiro**, inclusive a planilha com dados em
  `saida/`, e `/webapp/%2e%2e/saida/...` furava a primeira versão do filtro.
  Agora o caminho é decodificado e normalizado antes de conferir.
- **CSV com fórmula ativa** (`=HYPERLINK(...)` num nome de paciente) e
  **exportação do FINANCEIRO sempre do primeiro mês** (lia `store.mesAtual`,
  que não existe).
- **Troca de CHAVE PIX não ia para o LOG.**
- **Dado salvo corrompido era sobrescrito** pelo próximo auto-save; agora
  vai para uma chave de quarentena e o usuário é avisado.
- **Duas abas abertas** apagavam o trabalho uma da outra; agora a que ficou
  para trás para de salvar e pede recarga.

### 1. Erro de ponto flutuante nas horas

20 cirurgias de 10 minutos somavam **3,334 h** em vez de 3,3333…

Causa: cada duração era arredondada para 4 casas (`10/60 → 0,1667`) e depois
somada 20 vezes. O erro por parcela é pequeno; a soma o multiplica.

Correção: toda duração passou a ser acumulada em **minutos inteiros** e
convertida uma única vez no fim. `core/02_util.js` → `duracaoMinutos()` é
agora a unidade canônica; `horas`, `indicadores` e `dashboard` somam minutos.

### 2. Escala fantasma num sistema vazio

Sem `ESCALA_BASE` preenchida, o gerador produzia **395 linhas em branco** —
uma para cada data × posição, todas sem anestesista.

Correção: `gerarEscalaMensal()` pula a data quando não há elenco na base para
aquele dia da semana. Sistema novo começa com escala vazia, como esperado.

### 3. `criarAvaliacoesPendentes` nunca achava nada

A função comparava contra o estado **recalculado** do store — mas
`store.recalcular()` executa a sincronização da TASK-301 e cria as avaliações
faltantes *em memória*. A lista de faltantes vinha sempre vazia: o próprio
recálculo havia "consertado" o que se queria detectar na planilha.

Correção: `avaliacoesFaltandoNaPlanilha_()` lê o estado **cru** das células.

### 4. O mesmo ponto cego na verificação de integridade

Pela mesma razão, a checagem "cirurgia exige avaliação e não tem linha" nunca
dispararia a partir da planilha.

Correção: `verificarIntegridadePlanilha()` acrescenta a checagem sobre o
estado cru. É a diferença entre *"o modelo está coerente"* e *"as células
estão coerentes"*.

---

## Aritmética conferida à mão

Além dos testes, o cenário abaixo foi montado na interface e cada número
verificado manualmente:

| Indicador | Esperado | Conferência |
|---|---|---|
| Cirurgias realizadas (out) | 3 | 3 realizadas de 5 lançadas |
| Horas de anestesia | 8:50 | 6:25 + 2:25 |
| A confirmar | 4:00 | estimado da realizada sem horário real |
| Faturado no mês | R$ 6.530,00 | 1850 + 1400 + 2100 + 900 + 280 (avaliação) |
| Recebido | R$ 4.230,00 | 1850 + 2100 + 280 |
| A receber | R$ 2.300,00 | 6530 − 4230 |
| Taxa de cancelamento | 25,0% | 1 cancelada / 4 desfechos |
| Pagos sem nota | 1 | a paga sem NF |
| Total de horas reais (ano) | 14:10 | 8:50 (out) + 5:20 (nov) |

Note que a cirurgia **Agendada** entra no faturamento (critério
`"<>Cancelada"`) mas não na contagem de realizadas (critério `"Realizada"`) —
é assim na planilha, e está em
[REGRAS_DE_NEGOCIO.md §3](REGRAS_DE_NEGOCIO.md).

---

## Verificação da interface

Cada uma das 10 telas foi aberta no navegador, em tema claro e escuro, com o
console sem erro:

Painel · Escala (com as três abas internas) · Cirurgias · Avaliações pré ·
Horas · Financeiro · Indicadores · Anestesistas · Integridade · Auditoria

Fluxo testado de ponta a ponta pela interface, não por API:

1. Abrir **Nova cirurgia**, escolher 08/10/2026 e Heloísa Roncolato
2. Conferir que `ID do anestesista` mostrou **A05** (TASK-202) e
   `Posição no rodízio` mostrou **1** (TASK-203) — em tempo real, antes de salvar
3. Conferir que `Tempo estimado` e `Tempo real` calcularam (6:00 e 6:25)
4. Marcar `Avaliação pré necessária? = Sim` e ver o aviso da criação automática
5. Salvar, e conferir que **AVP0001** nasceu vinculada a **CIR0001**, com
   paciente, data, procedimento e anestesista espelhados (TASK-302)
6. Conferir as duas entradas no LOG e a gravação no navegador

### Verificações de robustez

- **Erro em uma tela não derruba o sistema.** `redesenhar()` tem barreira de
  erro: a tela quebrada vira um cartão explicativo com caminho de volta ao
  painel, e os dados seguem salvos. Isso foi observado em funcionamento
  durante o desenvolvimento, quando dois arquivos tinham erro de sintaxe.
- **Falta de módulo é detectada no arranque.** `webapp/js/00_bootstrap.js`
  confere 20 símbolos do core e, se faltar algum, mostra a lista e como
  resolver — em vez de um `X is not a function` no primeiro clique.
- **Armazenamento bloqueado** (janela privada) gera aviso persistente
  sugerindo exportar backup, e o sistema continua utilizável.
- **`localStorage` cheio** é tratado: a gravação avisa em vez de falhar calada.

---

## O que não está coberto

Honestidade sobre os limites:

- **Não há teste automatizado de interface.** As telas foram verificadas à
  mão, no navegador. Um `node qa` verde não garante que a tela renderiza — para
  isso, os arquivos de `webapp/js/` passam por `node --check`, o teste 11
  confere que toda tela está carregada e registrada, e a verificação no
  navegador percorreu as 15 telas (desktop, celular, tema claro e escuro),
  incluindo o calendário (mouse, teclado e largura de celular) e o boletim
  (preenchimento, registros com Enter, assinatura, reabertura, PDF).
- **O Apps Script real não foi executado.** O mock cobre a lógica da ponte,
  mas o comportamento de cota, permissão de gatilho e latência do Google só
  aparece na planilha de verdade. A instalação é idempotente e não destrutiva
  justamente por isso.
- **Volume.** Há teste com 500 cirurgias no core. Os dados moram no
  IndexedDB (cota de gigabytes, não os ~5 MB do `localStorage`); o gargalo
  provável passa a ser o tempo de execução do Apps Script em escritas linha a
  linha — motivo pelo qual `escreverAba_()` usa `setValues` em bloco.
