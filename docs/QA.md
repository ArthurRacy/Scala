# QA — o que a bateria cobre

```bash
node qa              # tudo (847 testes)
node qa 05           # só o arquivo que começa com "05"
node qa rodizio      # só os arquivos cujo nome contém "rodizio"
```

Sai com código 1 se qualquer teste falhar, então serve de porta de CI.
Zero dependências: o arnês está em `qa/_runner.js`.

**Resultado atual: 847 testes, 847 aprovados.**

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
cada arquivo; somados aos 15, dão 514 (mais os arquivos 25 e 26, que vieram depois).

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
| `14_guarda.test.js` | 9 | Retenção das cópias automáticas (diárias, mensais por 36 meses, marcos de 400 dias), backup completo com PDFs, partida |
| `15_repasse.test.js` | 19 | Divisão igual com centavos sem sobra, base caixa × competência, despesas, registro do que foi repassado, e o grupo do mês guardado (desativar alguém não muda meses passados nem apaga repasse pago) |
| `16_tcle_clinica.test.js` | 9 | Dados da clínica (CNPJ, LOG, backup saneado), texto próprio do termo, PDF válido com assinatura em vetor e código, link de WhatsApp do paciente |
| `17_boletim.test.js` | 30 | Boletim anestésico: SHA-256 contra vetores oficiais e o Node, leitura estrita x tolerante, horários atravessando a meia-noite, validação (PA, fármaco sem via), checklist, ciclo de vida (criar, finalizar, reabrir com motivo, descartar), horário real e CRM levados na assinatura, cirurgia com boletim não se exclui, congelamento e rollback, integridade (adulteração, órfão, duplicado), backup, CSV e PDF com xref conferida |
| `18_downloads.test.js` | 4 | Planilhas num .zip (CRC-32 igual ao do zlib, nomes com acento em UTF-8, conteúdo intacto); versão online entregando pela capacidade "downloads" (nome, bytes com BOM, recusa sem erro) |
| `19_servidor.test.js` | 13 | Modo servidor: só webapp/ e core/ servidos (sem travessia), primeiro acesso com código, cookie HttpOnly/SameSite, CSRF, trava após 5 senhas erradas, comando reexecutado chega ao MESMO estado da tela (uid, LOG, assinatura), concorrência (criar recusado, editar aceito), papéis, PDFs com cascata (e PDF para avaliação que o servidor não conhece é recusado, sem sobra no disco), reinício e diário reaplicado, SSE, backup e importação; **ficha de qualidade idêntica no servidor e na tela, sobrevivendo ao reinício, e recusa (403) de estrutura e configuração clínica para a equipe** |
| `20_qualidade.test.js` | 66 | Ficha de qualidade: nenhuma resposta nasce marcada, leitura estrita x tolerante, idempotência, imutabilidade; intervalos (duração, SRPA, jejum, antibiótico, meia-noite); pendência que não bloqueia; janela realizada sem respostas vira pendência; ciclo de vida (concluir, reabrir com motivo, descartar, IDs que não renascem); vários eventos do mesmo tipo; relação com a anestesia nunca presumida; histórico com autor e horário; revisão clínica sem apagar o registro original; **dado ausente nunca vira "não"**, "não se aplica" sai da população, elegibilidade por indicador, limiares configuráveis, evolução mês a mês, filtros, completude; pertinência à técnica; comparação estratificada por ASA; estrutura (duplicidade, vínculo com o atendimento, item não verificado); configuração clínica e aprovação; integridade, backup e saneamento; PDF, planilha e PPTX |
| `21_qualidade_prototipo.test.js` | 14 | Protótipo: a demonstração (18 atendimentos fictícios, estrutura, eventos, acompanhamentos, lacunas) monta sem erro e a integridade fecha; os números do painel batem com a recontagem independente das fichas; eventos + "não" + sem informação = elegíveis em todos os 36 indicadores; comparação por profissional soma o painel geral; exportação por atendimento sem nome, prontuário nem data exata; "Tirar exemplos" limpa tudo; cirurgia com ficha não se exclui |
| `22_regressoes_qa.test.js` | 28 | Uma regressão por achado da rodada de QA de 29/09/2026: dose de fármaco, configuração clínica, conflito de horário, repasse, servidor (corpo `null`, sessões, trava da troca de senha), nomes acessíveis, partida com arquivo faltando e formato de telefone/PIX/CRM/CNPJ |
| `23_ficha_do_boletim.test.js` | 20 | Ficha preenchida a partir do boletim: menor SpO₂, menor PAM (PAS + 2 × PAD ÷ 3) e maior PAS dos sinais vitais; o que é sugerido (vazio, igual, diferente); destino; valor fora da faixa da ficha não é sugerido; **resposta Sim/Não nunca é preenchida**; só o marcado é copiado, com origem no histórico e no LOG; recusa sem boletim, sem novidade e com ficha concluída; comando aceito no servidor; o painel enxerga o valor copiado (hipoxemia, hipotensão, "sem informação"); botão da tela |
| `25_perfis.test.js` | 23 | Os três perfis do core: nomes antigos (`admin`, `equipe`), telas de cada perfil, quem faz cada operação (tabela conferida operação por operação; operação sem classificação nasce fechada), o anestesista não envia nem recebe dinheiro, estado e comandos cortados por perfil e **a tela do anestesista (reexecutando comandos já cortados) chega ao MESMO estado visível do servidor, sem nunca guardar dinheiro** (sabotado de propósito para provar que o teste pega vazamento) |
| `26_perfis_servidor.test.js` | 13 | Os perfis no servidor de verdade (HTTP): primeiro acesso cria o chefe, arquivo de usuários antigo migrado, cada perfil recebe o estado do seu tamanho (nenhum dinheiro, PIX ou repasse ao anestesista), comandos cortados, SSE que não revela repasse, operações recusadas (403) por perfil e por campo de dinheiro, administração só do chefe, exames para os três, mudar o perfil derruba as sessões, o único chefe não se rebaixa |
| `28_log_core.test.js` | 23 | O LOG por usuário e o arquivo mensal no core: as contas (meses, corte da tela, prazo de guarda, texto canônico do arquivo, nome do arquivo sem caminho), o login em toda linha do LOG (inclusive a avaliação criada sozinha), filtrar por pessoa (a linha antiga pelo nome), a coluna LOGIN fora da conferência com a planilha, a configuração (só o chefe, dentro da faixa, vai para o LOG) e `arquivarLogAte` (tira só o anterior ao corte, deixa a linha "LOG ARQUIVADO", linha sem data nunca sai, corte inválido não muda nada, rollback não estraga o já arquivado, nenhum perfil a manda) |
| `29_log_servidor.test.js` | 18 | No servidor de verdade: eventos de acesso por usuário (entrada, recusa sem guardar a senha, bloqueio, saída, senha, usuários, backup, exames, acesso negado), só o chefe os vê; o LOG de alterações leva o login; **o mês fechado vira arquivo com SHA-256 e nenhuma linha se perde nem é inventada**, rodar de novo não repete nada, mês aberto e primeiro dia do mês seguinte não arquivam, **falha ao gravar o arquivo não tira nada da tela**, arquivo existente nunca é reescrito (parte nova), arquivo adulterado é denunciado e não serve de desculpa, a tela (réplica) acompanha a limpeza e chega ao mesmo estado, reiniciar mantém tudo, prazo de guarda (e 0 = nunca), download em CSV e JSON com o login, índice estragado é refeito dos arquivos |
| `27_fuso.test.js` | 3 | Hora de Brasília em qualquer fuso do computador (e o dia de Brasília quando o UTC já virou); **servidor de verdade num processo com `TZ=UTC` (como numa nuvem) aceita a hora de Brasília e recusa a de UTC** |
| `24_exames_na_cirurgia.test.js` | 22 | Exames do paciente na tela de cirurgia nova: a regra que diz se a cirurgia gera avaliação (onde os PDFs ficam) é a mesma da criação da linha e vem do core; `adicionarCirurgia` e `atualizarCirurgia` devolvem a avaliação criada (uid e `idCirurgia`) e a mesma semente dá o mesmo uid na tela e no servidor; conferência do arquivo (PDF de verdade com lixo antes do cabeçalho, texto com extensão `.pdf`, vazio, grande demais); fila de espera (aceitos, recusados com motivo, repetidos, duas levas quase juntas, remover); envio um a um preso ao uid, o que falha fica na fila e sai em `falhas`, avaliação sem uid não envia nada; ligações da tela (conferir os exames antes de gravar e enviar só depois de fechar, erro volta para a aba de dados, a regra vem do core, soltar fora da área é barrado) e o CSS que mantém o modal dentro do celular com nome de arquivo comprido e a altura fixa com abas |
| `30_nomes.test.js` | 1 | Nenhum nome usado sem existir, nos quatro ambientes (navegador, core no Node, servidor, Apps Script): o erro "X is not defined" que só aparece quando alguém clica, e o nome que existe no navegador mas ficou fora do `module.exports` do core (`tools/verificar_nomes.js`) |
| `31_robustez.test.js` | 16 | Dado com nome de propriedade do JavaScript (`constructor`, `__proto__`, `toString`…) como data, dia, nome ou ID não derruba o recálculo nem suja o `Object`; `horas()` e `aplicarRemanejamento` com entrada fora do contrato; **cirurgia que vira a meia-noite conflita com a do dia seguinte (F13)**; **mudar a escala-base (ou o cadastro, com a base automática) que deixaria a mesma pessoa em duas posições no mesmo dia é RECUSADO e nada muda**; trocar um posto da base deixa linha no LOG |
| `32_contas_independentes.test.js` | 22 | **As contas refeitas por fora**: calendário contra o `Date` (2024 a 2044) e o ano bissexto; `moedaBR` contra o `Intl` do pt-BR em 5.000 valores e ida e volta; financeiro do mês e **repasse (a soma das cotas fecha com o líquido, ao centavo)** contra centavos inteiros em estados aleatórios, nas duas bases; rodízio contra a fórmula (com substituições, e escala-base automática de 5 a 15 pessoas, com o mês encerrado congelado) |
| `33_aleatorio.test.js` | 1 | Operações sorteadas (3 sementes × 120 passos, `tools/aleatorio_store.js`): nenhuma exceção, nenhum "Erro interno", **recusa não muda o estado**, leitura não muda o estado, e a réplica refeita fica **idêntica** |
| `34_disco_e_freios.test.js` | 6 | **Disco recusando gravação**: o comando é desfeito (503) e nada fica pela metade nem duplica; importar sem gravar no disco é desfeito e `/api/saude` avisa (e volta ao normal); o diário não fica com linha pela metade; **freios contra relógio errado** (não apaga quase todas as cópias de uma vez, nem mais de 4 arquivos de LOG); `/api/saude` sem login e sem dado |
| `35_assinatura_login.test.js` | 6 | **O boletim só é assinado por quem entrou no sistema (F05)**: o contexto vem do cadastro; sem vínculo ninguém assina, ligado só no próprio nome, o CRM do cadastro manda (cadastro sem CRM aceita o digitado); no servidor de verdade: chefe e anestesista, secretária recusada, vínculo de uma pessoa só, que exista, e que se desfaz |
| `36_servidor_operacao.test.js` | 11 | **Uma só cópia do servidor por pasta (F14)** (trava velha refeita); **recuperar a senha do chefe** (`tools/redefinir_senha.js`, só com o servidor fechado, registrado no LOG); **atrás de proxy**: cookie `Secure` e IP do LOG só com `--atras-de-proxy` e pedido do próprio computador (F06, F17); respostas em **gzip** idênticas ao original; argumentos com `__proto__`/`constructor`/fundo demais recusados (Q10); 30 exames por avaliação (F15) |
| `37_limites_de_valor.test.js` | 9 | **Teto de R$ 100 milhões por mês** (cada lançamento e a soma do mês, cancelada não conta, recusa não deixa rastro) e **no máximo 2 casas decimais**, em cirurgia, avaliação e despesas do repasse (F11); objeto no lugar de texto não vira `[object Object]` |
| `38_exames_e_exportacao.test.js` | 18 | **Exames que não se perdem**: o índice ilegível ou apagado é refeito das fichas (nunca recomeça vazio), instalação antiga ganha fichas, PDF sem ficha fica e é avisado; **SHA-256** de cada exame e conferência (sumido, trocado, fora do índice, limite por rodada, alerta na Auditoria); exame removido fica **3 anos contados da remoção** (com freio), cópia mensal 36 meses; importar recusa PDF com SHA-256 diferente; **baixar todos os dados**: só o chefe, .zip que abre (CRC conferido por um leitor independente), backup que volta, planilhas, exames por avaliação, removidos com quem removeu, LOG, `SHA256SUMS.txt` que confere, ZIP64, e o gravador para se a conexão cai |

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

### Rodada de QA completa (29/09/2026)

Web app percorrido tela por tela no navegador (desktop e celular), servidor sondado por HTTP, core com fuzz de 10 mil operações e ida e volta de backup.
Corrigido, um commit por defeito, cada um com teste em `22_regressoes_qa.test.js`:

- **Dose de fármaco negativa ou texto** ("-5 mg") entrava no boletim e no PDF assinado — agora só número maior que zero.
- **Configuração clínica** aceitava SpO₂ mínima 150 e TOF 2 (distorcia os 36 indicadores) e trocava "abc" pelo padrão dizendo "salva" — agora recusa com a faixa.
- **Conflito de horário** só aparecia na Integridade, depois de gravado — agora avisa no formulário e no lançamento.
- **Repasse** aceitou R$ 999.999.999.999 para uma cota de R$ 123,34 — teto no core e segundo clique quando passa do que falta.
- **Servidor**: corpo JSON `null` dava 500; trocar a senha não derrubava as outras sessões; `/api/minha-senha` sem trava de tentativas.
- **Acessibilidade**: buscas e filtros sem nome para leitor de tela.
- **Partida**: arquivo do core que não carrega deixava a tela vazia; a verificação de carga só conferia 20 símbolos.
- **Ficha de qualidade**: o chip "N item(ns) sem resposta" do topo nunca aparecia (a troca de aba zerava o atualizador).
- Menores: hora cortada na linha de fármacos, "Boletim: em breve" já implementado, telefone/PIX/CRM/CNPJ sem conferência de formato, intervalo de datas invertido sem explicação.

Não corrigido (registrado): a trava de login vale para o login de qualquer endereço (5 erros travam o administrador por 15 min); `qa/19_servidor.test.js` falhava de vez em quando com "fetch failed" (**corrigido em 02/10/2026**: os auxiliares dos testes de servidor mandam `Connection: close`, então nenhuma conexão parada é reaproveitada; 4 rodadas completas seguidas sem falha); os PDFs não desenham caracteres fora do Windows-1252 (nome com ideograma sai "??").

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
