# Regras de negócio

Tudo aqui foi **extraído da planilha em uso** e conferido contra os dados que
já estavam nela. Nada foi suposto.

---

## 1. O rodízio

### Como funciona

A aba `ESCALA_BASE` tem 30 linhas = **6 dias da semana × 5 posições**. Para
cada dia da semana ela define um elenco de 5 anestesistas e a **posição
inicial** de cada um — é isso que o rótulo `ORDEM ALFABÉTICA (posição inicial)`
quer dizer.

A cada semana o elenco **gira uma casa** dentro do próprio dia da semana:

```
anestesista(data, posição) = ESCALA_BASE[dia][((posição - 1 + k) mod 5) + 1]
```

onde `k` é a **k-ésima ocorrência daquele dia da semana** desde
`CONFIG.ANCORA_RODIZIO` (01/10/2026).

O contador é **por dia da semana**, não por semana do calendário. A primeira
segunda-feira do horizonte (05/10/2026) é `k = 0`, mesmo estando na segunda
semana do calendário, porque não existe segunda anterior dentro do horizonte.

O ciclo fecha em **5 semanas** e volta à ordem-base.

### A conferência

O elenco de QUINTA-FEIRA na `ESCALA_BASE`:

| Posição | Anestesista |
|---|---|
| 1 | Fabrício Tavares |
| 2 | Heloísa Roncolato |
| 3 | Marcus Vinícius |
| 4 | Maria Fernanda |
| 5 | Priscilla De Carli |

Na planilha:

- **01/10/2026** (1ª quinta, `k=0`) → posição 1 = Fabrício Tavares
- **08/10/2026** (2ª quinta, `k=1`) → posição 1 = Heloísa Roncolato, e
  Fabrício passa para a posição 5

O motor do sistema reproduz **395 de 395 linhas** das três escalas mensais,
campo por campo (`DATA`, `DIA DA SEMANA`, `POSIÇÃO`, `ANESTESISTA (CALCULADO)`,
`ID_ANESTESISTA`, `ANESTESISTA EFETIVO`). Esse teste roda a cada `node qa`,
comparando contra `data/escalas_ref.json`, que é um retrato da planilha real.

### Ajuste manual

```
ANESTESISTA EFETIVO = SE(AJUSTE MANUAL? = "Sim"; SUBSTITUTO; CALCULADO)
```

O valor calculado **nunca é sobrescrito**. Recalcular a escala preserva todos
os ajustes já registrados — a regeneração lê os ajustes existentes antes de
reprojetar o rodízio.

### Domingo

Domingo não tem rodízio. Outubro/2026 tem 27 dias úteis, novembro 25 e
dezembro 27 — de onde saem as 135, 125 e 135 linhas das abas mensais.

---

## 2. Duas divergências encontradas na planilha

### 2.1 Faltavam duas listas suspensas

As colunas de anestesista aceitavam **digitação livre**:

- `CIRURGIAS!O` — `ANESTESISTA`
- `AVALIAÇÕES PRÉ!G` — `ANESTESISTA DA AVALIAÇÃO`

Isso é mais grave do que parece. Todos os `SUMIFS`/`COUNTIFS` da planilha
casam o anestesista **por texto exato**. Um "Fabricio Tavares" sem acento, ou
com espaço a mais, não dá erro nenhum: simplesmente soma zero, e as horas e o
faturamento daquela cirurgia desaparecem dos indicadores sem aviso.

**Resolvido em:**
- web app — o campo é `<select>` dos nomes cadastrados, e a gravação recusa
  nome fora do cadastro;
- Apps Script — `instalarSistema()` aplica a validação apontando para o
  intervalo nomeado `NOMES_ANESTESISTAS`, que acompanha o cadastro;
- planilha — `tools/corrigir_planilha.py` aplica as duas validações no `.xlsx`.

### 2.2 Dois erros de fórmula na aba INDICADORES

O bloco de indicadores parece ter sido deslocado uma linha em alguma edição, e
duas referências não acompanharam:

| Célula | Rótulo | Estava | Correto |
|---|---|---|---|
| `B14` | VALOR PENDENTE EM ANESTESIAS | `=B11-B12` | `=B12-B13` |
| `B18` | TOTAL RECEBIDO | `=B12+B16` | `=B13+B16` |

Por quê:

- **B14** — `B11` é `NÚMERO DE AVALIAÇÕES PRÉ-ANESTÉSICAS`, uma **contagem**, e
  `B12` é `VALOR TOTAL EM ANESTESIAS`, **dinheiro**. A fórmula subtraía reais
  de uma quantidade de consultas. O número exibido não tinha significado
  financeiro nenhum (e costuma sair negativo).
  O certo é `VALOR TOTAL (B12) − VALOR RECEBIDO (B13)`.

- **B18** — `B12` é o **total** de anestesias, não o **recebido**. O "total
  recebido" ficava inflado por tudo que ainda não entrou em caixa.
  O certo é `RECEBIDO ANEST. (B13) + RECEBIDO AVAL. (B16)`.

A **tabela comparativa** da mesma aba (linhas 24+) já estava correta —
coluna `G = E−F` e coluna `H = F + recebido de avaliações` — e confirma qual
era a intenção original.

**Resolvido em:**
- web app — `core/09_indicadores.js` implementa direto a conta correta;
- Apps Script — `corrigirFormulasIndicadores_()` reescreve as duas células;
- planilha — `tools/corrigir_planilha.py` corrige no `.xlsx`.

---

## 3. Critérios de contabilização

Os filtros das fórmulas da planilha não são uniformes, e a diferença importa.
O sistema reproduz cada um como está:

| Indicador | Critério de status |
|---|---|
| `NÚMERO DE CIRURGIAS` | apenas `"Realizada"` |
| Horas reais e estimadas | `"<>Cancelada"` (inclui Agendada, Confirmada, Remarcada) |
| Valores de anestesia | `"<>Cancelada"` |
| `CIRURGIAS SEM HORÁRIO REAL PREENCHIDO` | `"Realizada"` **e** `TEMPO REAL` em branco |
| `NÚMERO DE AVALIAÇÕES` | `REALIZADA? = "Sim"` |
| `PROCEDIMENTOS SEM NF (pagos)` | `PAGO? = "Sim"` e NF em branco — **sem filtro de status** |

A última linha merece nota: uma cirurgia **cancelada, marcada como paga e sem
nota** entra nesse contador. Isso é intencional na planilha e é o
comportamento desejado — dinheiro recebido sem nota emitida é exatamente a
pendência que o indicador existe para mostrar, ainda mais num procedimento
cancelado. Há teste cobrindo esse caso.

---

## 4. Horas: a regra de ouro

Está escrita na linha 2 da própria aba HORAS:

> *Horas REAIS = HORA TÉRMINO REAL − HORA INÍCIO REAL. Horas ESTIMADAS =
> previsto. Os dois nunca são somados juntos (colunas separadas).*

O fallback da MELHORIA 3 respeita isso. Quando uma cirurgia realizada fica sem
horário real:

1. o contador `CIRURGIAS SEM HORÁRIO REAL PREENCHIDO` sobe;
2. o tempo estimado é adotado provisoriamente **numa coluna própria**
   (`pendente` / "A confirmar" na tela);
3. as **horas reais continuam sem aquele registro**.

Por isso o sistema devolve quatro números por mês, e não dois:

| Campo | Significado | Equivale à planilha? |
|---|---|---|
| `real` | horas com horário real fechado | sim, idêntico |
| `estimada` | horas previstas | sim, idêntico |
| `pendente` | estimado das realizadas sem hora real | **novo** |
| `projetada` | `real + pendente` | **novo** |

Os dois primeiros são byte-a-byte o que a planilha calcula. Os dois últimos
são informação adicional, em campos separados, para gestão.

### Precisão

Toda duração é acumulada em **minutos inteiros** e convertida para horas uma
única vez, no fim. Somar `10/60` vinte vezes acumula erro de ponto flutuante
(dá 3,334 em vez de 3,3333…); somar `10` vinte vezes e dividir por 60 dá o
valor exato. Há teste cobrindo 20 cirurgias de 10 minutos.

### Virada de meia-noite

`MOD(fim − início; 1)`, igual à planilha: uma cirurgia de 22:00 às 02:30 dura
4h30, não −19h30.

---

## 5. Chaves compostas

Formato **exato** da planilha — mudá-lo quebra os `XLOOKUP`:

```
CHAVE DATA+POSIÇÃO      = TEXT(data;"YYYY-MM-DD") & "|" & posição
CHAVE DATA+ANESTESISTA  = TEXT(data;"YYYY-MM-DD") & "|" & nome
```

A segunda usa o **NOME**, não o ID. É por isso que:

- nome duplicado no cadastro é tratado como **erro de integridade** (deixaria
  a busca ambígua);
- o mesmo anestesista duas vezes no mesmo dia da `ESCALA_BASE` também é erro;
- renomear alguém no cadastro descasa os registros antigos — a tela avisa isso
  e sugere **inativar** em vez de renomear.

Quando a busca não acha, a planilha devolve o literal
`fora da escala-base`. O sistema usa exatamente esse texto
(`CONFIG.FORA_DA_ESCALA`) e a interface o mostra como um selo de alerta.

---

## 6. Avaliações pré-anestésicas

### Criação automática (TASK-301)

A linha nasce quando `AVALIAÇÃO PRÉ NECESSÁRIA?` vira `"Sim"`.

Três garantias que impedem os problemas clássicos de gatilho de planilha:

- **Idempotência** — a decisão é pela *existência do vínculo*, não pelo
  evento. Marcar "Sim" cinco vezes, ou recalcular dez vezes, cria uma linha só.
- **Trava** — no Apps Script, `LockService` impede que duas edições
  simultâneas gerem duas linhas.
- **Nada é apagado** — voltar o campo para `"Não"` apenas **sinaliza** a
  avaliação como órfã. Dado clínico não se descarta por conta própria; quem
  decide é uma pessoa.

Cirurgia **cancelada** não gera avaliação.

### Vínculo e espelhamento (TASK-302)

Ligadas pelo `ID_CIRURGIA`. Quatro campos são copiados da cirurgia e se
mantêm atualizados se ela for corrigida:

| Em AVALIAÇÕES PRÉ | Vem de CIRURGIAS |
|---|---|
| `PACIENTE (auto)` | `NOME DO PACIENTE` |
| `DATA DA CIRURGIA (auto)` | `DATA DA CIRURGIA` |
| `NOME DA CIRURGIA (auto)` | `PROCEDIMENTO/CIRURGIA` |
| `ANESTESISTA DA CIRURGIA (auto)` | `ANESTESISTA` |

### Quem avalia (TASK-303)

`ANESTESISTA DA AVALIAÇÃO` é campo próprio, restrito ao cadastro. O sistema
sugere quem operou (caso mais comum), mas permite trocar — e a receita da
avaliação vai para **quem avaliou**, não para quem operou. Há teste cobrindo
esse caso.

### Competência

```
MÊS/ANO = mês da DATA DA AVALIAÇÃO, ou, se ela ainda não ocorreu,
          mês da DATA DA CIRURGIA
```

Uma avaliação feita em setembro para uma cirurgia de outubro é receita de
**setembro**.

---

## 7. Ledger financeiro (TASK-402)

Duas origens numa lista só:

| Origem | Exclui | Data do lançamento |
|---|---|---|
| Anestesias | sem ID, sem `VALOR`, ou `STATUS = "Cancelada"` | `DATA DA CIRURGIA` |
| Avaliações pré | sem ID ou sem `VALOR` | `DATA DA AVALIAÇÃO` |

`STATUS DA NOTA` = `"Emitida"` se há número de NF, `"Sem nota"` caso contrário.

O critério **"sem VALOR não entra no ledger"** é da própria planilha
(`IF(OR(...;$U2="");"";...)`) e foi mantido: lançamento sem valor não é
receita, é cadastro incompleto. É por isso que `paraNumero('')` devolve `null`
e não `0` — o sistema distingue "zero reais" de "não preenchido".

---

## 8. Parâmetros ajustáveis

Tudo que o grupo pode querer mudar está em `core/00_config.js`:

| Parâmetro | Valor atual | O que faz |
|---|---|---|
| `ANO_REFERENCIA` | 2026 | Ano do horizonte |
| `MESES_ESCALA` | OUT, NOV, DEZ | Meses com aba própria, e o nome exato de cada aba |
| `ANCORA_RODIZIO` | 2026-10-01 | Origem do contador `k` do giro |
| `PASSO_SEMANAL` | 1 | Quantas casas o elenco gira por semana |
| `POSICOES` | 1–5 | Posições por dia |
| `DIAS_ESCALA` | SEG–SÁB | Dias com rodízio |
| `STATUS_EXECUTADO` | `Realizada` | Status que caracteriza cirurgia feita |
| `STATUS_EXCLUIDO` | `Cancelada` | Status fora de horas, receita e ledger |
| `DURACAO_MAXIMA_HORAS` | 24 | Teto de sanidade (gera aviso, não erro) |
| `VALOR_PADRAO_AVALIACAO` | 0 | Sugestão de valor nas linhas novas |

Nenhum outro módulo do core carrega número mágico de negócio.
