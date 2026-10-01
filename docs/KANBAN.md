# Quadro Kanban — situação final

Todas as 12 tarefas estão concluídas. Cada linha aponta onde a implementação
mora e quais testes a cobrem.

Rodar `node qa` executa os 667 testes.

---

## ✅ COLUNA 1 — Backlog (setup da estrutura e dados mestres)

### TASK-101 — Mapear os 15 anestesistas (A01–A15)

**Feito.** Extraídos da planilha, não digitados à mão:
`tools/extrair_dados.py` lê a aba ANESTESISTAS e grava `data/seed.json`;
`tools/gerar_seed_js.py` embute o resultado em `webapp/js/seed.js`, para o
sistema abrir já povoado.

| Onde | Arquivo |
|---|---|
| Dados | `data/seed.json` |
| Schema | `core/01_schema.js` → `SCHEMA.ANESTESISTAS` |
| Cadastro (tela) | `webapp/js/telas/anestesistas.js` |
| Validação | `core/03_dominios.js` → `validarAnestesista()` |

**Testes:** 4 em *TASK-101 — Cadastro dos 15 anestesistas* — confere os 15, os
IDs A01–A15 sem furo, nome obrigatório e ausência de nome duplicado.

---

### TASK-102 — Configurar as 11 abas com nomes e tipos exatos

**Feito.** `core/01_schema.js` declara as 11 abas coluna por coluna, com o
rótulo **byte-a-byte** igual ao da planilha, o tipo de dado e a origem
(`MANUAL` ou `AUTO`).

A fidelidade não é confiada à revisão humana: `tools/extrair_cabecalhos.py`
tira uma impressão digital da planilha real e a QA compara tudo a cada
execução. Um acento trocado no código faz o teste falhar.

| Aba | Colunas | Observação |
|---|---|---|
| ANESTESISTAS | 6 | |
| ESCALA_BASE | 4 | |
| ESCALA OUTUBRO/NOVEMBRO/DEZEMBRO 2026 | 9 | nomes com espaço, não underscore |
| ESCALA_CONSOLIDADA | 7 | as duas chaves compostas |
| CIRURGIAS | 30 | A até AD |
| AVALIAÇÕES PRÉ | 18 | A até R |
| FINANCEIRO | 8 indicadores + ledger de 11 | cabeçalho do ledger na linha 20 |
| HORAS | 11 | cabeçalho na linha 4 |
| INDICADORES | 13 indicadores + comparativo de 8 | comparativo na linha 23 |
| DASHBOARD | 9 KPIs + 2 séries | |
| LOG | 7 | |

**Testes:** 11 em *TASK-102* + 15 em *FIDELIDADE — cabeçalhos do schema x
planilha em uso*.

---

## ✅ COLUNA 2 — To Do (automações na aba CIRURGIAS)

### TASK-201 — Lista suspensa de ANESTESISTA restrita aos 15

**Feito nos três caminhos.** Esta coluna aceitava digitação livre na planilha
original — o risco está explicado em
[REGRAS_DE_NEGOCIO.md §2.1](REGRAS_DE_NEGOCIO.md).

| Caminho | Como |
|---|---|
| Web app | `<select>` dos nomes cadastrados; gravação recusa nome de fora |
| Apps Script | `91_instalar.gs` → validação apontando para `NOMES_ANESTESISTAS` |
| Planilha | `tools/corrigir_planilha.py` aplica a validação no `.xlsx` |

O intervalo nomeado acompanha o cadastro: incluir um anestesista novo já o
torna selecionável, sem reinstalar nada.

**Testes:** 5 em *TASK-201* + 6 em *TASK-201 e TASK-303 — listas suspensas
instaladas* (com Sheets simulado).

---

### TASK-202 — `ID_ANESTESISTA (auto)` por busca no cadastro

**Feito.** `core/05_cirurgias.js` → `calcIdAnestesista()`, equivalente ao
`XLOOKUP` da coluna P. Resolve o nome ignorando acento e caixa, e devolve
vazio (não erro) quando não acha.

No web app o campo aparece **em tempo real** enquanto o usuário escolhe o
anestesista, com cadeado e traço tracejado indicando que é calculado.

**Testes:** 5 em *TASK-202*, incluindo um que percorre os 15 nomes do cadastro.

---

### TASK-203 — `POSIÇÃO DO ANESTESISTA NO RODÍZIO`

**Feito.** `core/05_cirurgias.js` → `calcPosicaoRodizio()`, sobre o índice
`indexarConsolidada()` de `core/04_rodizio.js`. Cruza `DATA` e `ANESTESISTA`
pela chave composta, e devolve o literal `fora da escala-base` quando não acha
— exatamente como a fórmula da coluna Q.

Quando isso acontece, a tela mostra um aviso explicando que pode haver uma
substituição não registrada, com link para a tela de Escala.

**Testes:** 4 em *TASK-203* + 11 em *ESCALA_CONSOLIDADA e TASK-203*.

---

## ✅ COLUNA 3 — In Progress (integração CIRURGIAS ➡️ AVALIAÇÕES PRÉ)

### TASK-301 [MELHORIA 2] — Criar a linha da avaliação automaticamente

**Feito nos dois caminhos.** A linha nasce no momento em que
`AVALIAÇÃO PRÉ NECESSÁRIA?` vira `"Sim"`.

| Caminho | Como |
|---|---|
| Web app | `core/06_avaliacoes.js` → `sincronizarAvaliacoes()`, chamado por `store.recalcular()` |
| Apps Script | `92_gatilhos.gs` → `aoEditar()` observa a coluna e cria a linha |
| Rede de segurança | menu **Criar avaliações pendentes**, para linhas colhidas em lote |

Garantias:

- **idempotente** — decide pela existência do vínculo, não pelo evento;
- **travada** — `LockService` impede linha duplicada em edição simultânea;
- **não destrutiva** — voltar para `"Não"` apenas sinaliza a avaliação como
  órfã; dado clínico não é descartado sozinho;
- cirurgia **cancelada** não gera avaliação.

**Testes:** 10 em *TASK-301 — Criação automática* + 11 em *TASK-301 — gatilho
cria a linha da avaliação*. Cobrem marcar cinco vezes, recalcular dez vezes,
desmarcar, cancelar e criar em lote.

---

### TASK-302 — Vincular por `ID_CIRURGIA` e auto-preencher

**Feito.** `core/06_avaliacoes.js` → `espelharDadosDaCirurgia()`. Os quatro
campos são re-espelhados a cada recálculo, então corrigir o nome do paciente
na cirurgia atualiza a avaliação.

| Em AVALIAÇÕES PRÉ | Vem de CIRURGIAS |
|---|---|
| `PACIENTE (auto)` | `NOME DO PACIENTE` |
| `DATA DA CIRURGIA (auto)` | `DATA DA CIRURGIA` |
| `NOME DA CIRURGIA (auto)` | `PROCEDIMENTO/CIRURGIA` |
| `ANESTESISTA DA CIRURGIA (auto)` | `ANESTESISTA` |

No Apps Script são fórmulas `XLOOKUP`, escritas por
`91_instalar.gs` → `escreverFormulasAvaliacoes_()`.

**Testes:** 7 em *TASK-302* + 2 em *TASK-202/203 — fórmulas escritas*.

---

### TASK-303 — Lista suspensa em `ANESTESISTA DA AVALIAÇÃO`

**Feito nos três caminhos**, junto com a TASK-201. Campo próprio, separado de
`ANESTESISTA DA CIRURGIA (auto)`: quem avalia pode ser diferente de quem
opera, e a receita da avaliação vai para quem a realizou.

**Testes:** 4 em *TASK-303*, incluindo um que percorre os 15 nomes e outro que
confere a separação da receita entre quem operou e quem avaliou.

---

## ✅ COLUNA 4 — Testing & Done (consolidação, indicadores, fallbacks)

### TASK-401 [MELHORIA 3] — Horas, com fallback e contador de pendência

**Feito.** `core/07_horas.js`.

- Horas reais = `TÉRMINO REAL − INÍCIO REAL`
- Horas estimadas = `TÉRMINO PREVISTO − INÍCIO PREVISTO`
- **As duas nunca entram na mesma soma** (regra escrita na linha 2 da aba)
- Realizada sem horário real → sobe
  `CIRURGIAS SEM HORÁRIO REAL PREENCHIDO` e o tempo estimado é adotado
  provisoriamente **em coluna própria** (`pendente`), sem contaminar as reais
- `pendenciasDeHorario()` lista as cirurgias que estão travando o fechamento,
  dizendo qual campo falta e quanto tempo foi adotado

A tela de Horas mostra a lista nominal com botão para completar, e o menu do
Apps Script tem **Listar pendências de horário**.

**Testes:** 10 em *TASK-401* + 5 em *Cálculo básico de horas* + 8 em *Aba
HORAS montada*, incluindo precisão com 20 cirurgias de 10 minutos e virada de
meia-noite.

---

### TASK-402 — Consolidar o FINANCEIRO com ledger unificado

**Feito.** `core/08_financeiro.js`.

- `montarLedger()` une anestesias e avaliações, com os rótulos de `TIPO` da
  planilha (`Anestesia`, `Avaliação pré`)
- `separarPorPagamento()` divide recebidos de pendentes, com subtotais
- `calcularFinanceiro()` reproduz o bloco de indicadores mensais (linhas 6–15)
- `consolidarFinanceiroAnual()` alimenta o gráfico de evolução
- Filtros por competência, anestesista, origem, só pendentes, só sem nota

Mantido o critério da planilha: **lançamento sem VALOR não entra no ledger**.

**Testes:** 13 em *TASK-402 — Ledger unificado* + 7 em *FINANCEIRO —
indicadores mensais*.

---

### TASK-403 — Atualizar INDICADORES e DASHBOARD

**Feito.** `core/09_indicadores.js` e `core/10_dashboard.js`.

- Bloco por anestesista (linhas 8–20) e comparativo dos 15 (linhas 24–38)
- 9 KPIs do dashboard, mais séries por anestesista, por mês, por status e por
  convênio
- Filtro de mês/ano no topo do sistema, afetando todas as telas
- **Dois erros de fórmula da planilha corrigidos** — ver
  [REGRAS_DE_NEGOCIO.md §2.2](REGRAS_DE_NEGOCIO.md)

**Testes:** 12 em *TASK-403 — INDICADORES* + 11 em *TASK-403 — DASHBOARD* + 3
em *Correção dos dois erros de fórmula*.

---

## ✅ Qualidade e segurança em anestesia (pedido de set/2026)

Ficha por paciente e por procedimento, painel para a coordenação, estrutura por
unidade/sala/turno e relatórios. Documentação completa em
[QUALIDADE.md](QUALIDADE.md) e [QUALIDADE_INDICADORES.md](QUALIDADE_INDICADORES.md).

| Item do pedido | Onde | Testes |
|---|---|---|
| 1. Identificação do atendimento | `core/06c_qualidade.js` (`atendimento`), tela *Qualidade → Identificação* | `20_qualidade` |
| 2. Etapas do formulário; 4 respostas sem pré-seleção; campos do evento; só o pertinente à técnica | `RESPOSTAS_QUALIDADE`, `EVENTOS_QUALIDADE`, `pertinenteNaFicha`; `telas/qualidade.js` | `20_qualidade` |
| 3. Indicadores de desfecho por paciente | `EVENTOS_QUALIDADE` + campos `intra` e `srpa`; atribuição à anestesia em `relacao` (campo separado) | `20_qualidade` |
| 4. Indicadores de processo, intervalos calculados | `pre`, `processo`, `resumoQualidade` | `20_qualidade` |
| 5. Indicadores de estrutura, ligados ao atendimento | `core/06d_estrutura.js`, `telas/estrutura.js` | `20_qualidade` |
| 6. Satisfação e transição de cuidado | `satisfacao`, `transicao`, evento `falhaComunicacao` | `20_qualidade` |
| 7. Rascunho, pendências, sem informação/perda de seguimento, histórico, validação, eventos repetidos, registrado × revisado | `pendenciasFicha`, `historicoDaFicha`, `validarFicha`, `revisarFichaQualidade` | `20_qualidade`, `19_servidor` |
| 8. Painel, filtros, definição e fórmula, evolução, comparação por profissional, exportação Excel/CSV, PDF, PPTX | `core/09c_qualidade_painel.js`, `telas/painel_qualidade.js`, `03f_qualidade_pdf.js`, `03h_pptx.js` | `20_qualidade`, `21_qualidade_prototipo` |
| 9. Configuração clínica aprovada, referências sem atribuição automática, acesso e rastreabilidade | `lerConfigQualidade`, `salvarConfigQualidade`, `MUTACOES_SO_ADMIN`, LOG | `20_qualidade`, `19_servidor` |
| 10. Protótipo navegável com dados fictícios e relatório exportado | `demo_online.js`, `tools/gerar_exemplos_qualidade.js` | `21_qualidade_prototipo` |

---

## ✅ Stack flexível (TASK-100 / MELHORIA 1)

**Feito.** Os dois caminhos compartilham o mesmo `core/`:

| | Web app | Apps Script |
|---|---|---|
| Interface | `webapp/` — sem framework, sem build, sem CDN | a própria planilha + menu ⚕ Anestesia |
| Regras | `core/` | `core/` — os mesmos arquivos, copiados sem alteração |
| Dados | localStorage + backup `.json` / `.csv` | as células da planilha |
| Automação | `store.transacao()` | gatilho `onEdit` |

O core roda em Node (testes), no navegador (`<script>`) e no Apps Script
(concatenação por nome) — **um único modelo de runtime**, sem divergência
entre "passou no teste" e "roda na planilha".

---

## Além do pedido

Itens que não estavam no quadro, mas que o trabalho exigiu:

| Item | Onde | Por quê |
|---|---|---|
| Duas listas suspensas que faltavam | TASK-201/303 | nome digitado errado zerava indicadores sem avisar |
| Dois erros de fórmula corrigidos | TASK-403 | `B14` e `B18` da aba INDICADORES não tinham significado financeiro |
| Verificação de integridade | `core/12_store.js`, tela Integridade | audita o estado e separa erro de pendência operacional |
| Reparo automático seguro | idem | gera IDs faltantes, normaliza Sim/Não, cria avaliações ausentes — e **nunca apaga nada** |
| Detecção de conflito de agenda | `core/05_cirurgias.js` | mesmo anestesista com horários sobrepostos no dia |
| Aviso de "fora da escala" | tela de Cirurgias | sinaliza substituição não registrada |
| Trilha de auditoria completa | `core/11_log.js` | append-only, só campos críticos |
| Backup e restauração | `webapp/js/03_dados.js` | `.json` completo e `.csv` por aba |
| Sheets simulado para testes | `qa/_mock_sheets.js` | testar a ponte com a planilha sem abrir o navegador |
| Corretor de `.xlsx` | `tools/corrigir_planilha.py` | para quem segue usando a planilha em paralelo |
| Horizonte móvel | `core/02b_calendario.js` | a planilha só tinha OUT/NOV/DEZ-2026; em janeiro ninguém seria escalado |
| Calendário dia/mês/ano | `webapp/js/01b_componentes.js`, `06_app.js` | navegar direto para qualquer dia, até 24 meses à frente |
| Guarda por mais de um ano | `webapp/js/03d_guarda.js` | IndexedDB, cópias automáticas com retenção, backup diário em pasta |
| Repasse | `core/09b_repasse.js`, tela Repasse | divisão igual do resultado e registro dos pagamentos por PIX |
| Clínica e termo | tela Clínica e termo | dados da clínica e texto do TCLE editáveis; assinatura na tela |
| Versão online | `tools/gerar_versao_online.py` | página única com dados de EXEMPLO para mostrar o sistema |
| Servidor da clínica | `server/`, `webapp/js/03g_servidor.js`, tela Usuários | vários computadores com os mesmos dados, login, papéis e sincronia na hora |
| Boletim anestésico | `core/06b_boletim.js`, `webapp/js/03e_boletim_pdf.js`, tela Boletim | ficha da anestesia com gráfico, assinatura, código de conferência e PDF |
