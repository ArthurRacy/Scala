# Indicadores de qualidade e segurança — catálogo para aprovação

> Gerado por `node tools/gerar_docs_qualidade.js` a partir do código. Não edite à mão: mude o
> catálogo em `core/06c_qualidade.js` ou `core/09c_qualidade_painel.js` e gere de novo.

Este documento existe para uma decisão: **o responsável técnico de anestesiologia confere se cada
definição, população elegível e limiar corresponde ao protocolo da instituição** — e só então o
módulo entra em uso. Nada aqui está classificado como exigência da SBA, da ANVISA, do Patient Safety
Movement ou de qualquer outra entidade; quando houver referência, ela é registrada na tela
*Painel de qualidade → Configuração clínica*, com **fonte, versão e data de revisão**, indicador por
indicador.

## Como ler os números

| Termo | Significado |
|---|---|
| **Elegíveis** | Atendimentos da população do indicador (ex.: capnografia só entra se foi indicada). |
| **Com informação** | Elegíveis com resposta "Sim" ou "Não" — é o **denominador** da taxa. |
| **Eventos** | Elegíveis com "Sim" (desfecho ocorreu / processo foi cumprido) — é o **numerador**. |
| **Sem informação** | Elegíveis sem resposta ou com "Não avaliado/sem informação". Ficam **fora do numerador e do denominador** e são contados à parte. |
| **Sem acompanhamento** | Parte dos "sem informação" cuja janela (24 h, 48 h ou 30 dias) já venceu sem resposta. |
| **Taxa** | Eventos ÷ com informação × 100. Sem denominador, não há taxa (aparece "—", nunca 0%). |

**"Não se aplica" tira o atendimento da população elegível** (não entra em nada). **Campo em branco nunca
é lido como "não houve evento".** A atribuição de um evento à anestesia é um campo separado,
preenchido por avaliação clínica, e o sistema não presume causalidade.

## Limiares clínicos (configuráveis)

Valores de partida do sistema — **não são norma**. A coordenação os altera, o responsável técnico os
aprova, e cada mudança vai para o LOG de auditoria.

| Limiar | Valor padrão | Usado em |
|---|---|---|
| SpO₂ mínima aceitável | 90 % | Hipoxemia intraoperatória |
| PAM mínima aceitável | 65 mmHg | Hipotensão intraoperatória |
| PA sistólica de hipertensão grave | 180 mmHg | Referência do registro de hipertensão grave |
| Temperatura mínima na chegada à SRPA | 36 °C | Hipotermia na chegada à SRPA |
| Pontuação de dor forte | acima de 7 | Dor forte na SRPA (destaque na ficha) |
| Relação TOF adequada | 0,9 ou mais | Relação TOF adequada antes da saída |
| Jejum mínimo para sólidos | 8 h | Jejum pré-operatório adequado |
| Jejum mínimo para líquidos | 2 h | Jejum pré-operatório adequado |
| Janela do antibiótico | 0 a 60 min antes da incisão | Profilaxia antibiótica no tempo |

## Indicadores (36)

Desfecho: **menor é melhor**. Processo: **maior é melhor**. A coluna *Acompanhamento* indica de qual
janela posterior o indicador depende.

### Mortalidade e morbidade grave

#### Óbito em até 24 horas

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Óbito do paciente em até 24 horas do término da anestesia, independentemente da causa. A relação com a anestesia é avaliação clínica registrada em separado, evento a evento.
- **Fórmula:** óbitos em até 24 h ÷ atendimentos com acompanhamento de 24 h respondido × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** 24 horas
- **Chave técnica:** `obito24h`

#### Óbito em até 48 horas

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Óbito do paciente em até 48 horas do término da anestesia.
- **Fórmula:** óbitos em até 48 h ÷ atendimentos com acompanhamento de 48 h respondido × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** 48 horas
- **Chave técnica:** `obito48h`

#### Óbito em até 30 dias

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Óbito do paciente em até 30 dias do procedimento.
- **Fórmula:** óbitos em até 30 dias ÷ atendimentos com acompanhamento de 30 dias respondido × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** 30 dias
- **Chave técnica:** `obito30d`

#### Parada cardiorrespiratória na sala cirúrgica

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Parada cardiorrespiratória ocorrida dentro da sala cirúrgica, com necessidade de manobras de reanimação.
- **Fórmula:** paradas na sala ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `pcrSala`

#### Despertar intraoperatório com recordação explícita

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Suspeita ou confirmação de despertar intraoperatório com recordação explícita, em anestesia geral.
- **Fórmula:** casos suspeitos ou confirmados ÷ anestesias gerais com a pergunta respondida × 100
- **População elegível:** Anestesia geral.
- **Acompanhamento:** 24 horas
- **Chave técnica:** `despertar`

#### Disfunção neurológica perioperatória

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Delirium, disfunção cognitiva, AVC, neuropatia periférica ou outra disfunção neurológica no perioperatório.
- **Fórmula:** casos ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** 48 horas
- **Chave técnica:** `disfuncaoNeuro`

#### Intubação ou ventilação difícil

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Dificuldade de intubação ou de ventilação, prevista ou não, com ou sem complicação associada.
- **Fórmula:** casos ÷ anestesias gerais com a pergunta respondida × 100
- **População elegível:** Anestesia geral.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `viaAereaDificil`

### Complicações respiratórias

#### Intubação esofágica

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Intubação esofágica, com registro separado de reconhecimento imediato ou tardio.
- **Fórmula:** casos ÷ atendimentos com intubação traqueal e a pergunta respondida × 100
- **População elegível:** Atendimentos com intubação traqueal.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `intubacaoEsofagica`

#### Broncoaspiração pulmonar perioperatória

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Broncoaspiração de conteúdo gástrico no perioperatório.
- **Fórmula:** casos ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `broncoaspiracao`

#### Reintubação não planejada em até 24 horas

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Reintubação não planejada em até 24 horas do término da anestesia.
- **Fórmula:** reintubações ÷ atendimentos com intubação e acompanhamento de 24 h respondido × 100
- **População elegível:** Atendimentos com intubação traqueal.
- **Acompanhamento:** 24 horas
- **Chave técnica:** `reintubacao24h`

#### Hipoxemia intraoperatória

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Menor SpO₂ registrada abaixo do limiar configurado, ou tempo acumulado abaixo dele maior que zero.
- **Fórmula:** atendimentos com SpO₂ mínima abaixo do limiar ÷ atendimentos com SpO₂ mínima registrada × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `hipoxemia`

### Complicações cardiovasculares

#### Hipotensão intraoperatória

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Menor PAM registrada abaixo do limiar configurado, ou tempo acumulado abaixo dele maior que zero.
- **Fórmula:** atendimentos com PAM mínima abaixo do limiar ÷ atendimentos com PAM mínima registrada × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `hipotensao`

#### Hipertensão grave no intraoperatório

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Episódio de hipertensão grave no intraoperatório, conforme o limiar configurado de PA sistólica.
- **Fórmula:** casos ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `hipertensaoGrave`

#### Isquemia ou infarto do miocárdio perioperatório

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Isquemia ou infarto do miocárdio no perioperatório, conforme critério diagnóstico registrado.
- **Fórmula:** casos ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** 48 horas
- **Chave técnica:** `isquemiaMiocardio`

#### Vasopressor não planejado

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Instabilidade hemodinâmica com necessidade de vasopressor não planejado.
- **Fórmula:** casos ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `vasopressorNaoPlanejado`

### Outros desfechos clínicos

#### Náusea pós-operatória

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Náusea pós-operatória registrada na recuperação, separada do vômito.
- **Fórmula:** atendimentos com náusea ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `nausea`

#### Vômito pós-operatório

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Vômito pós-operatório registrado na recuperação, separado da náusea.
- **Fórmula:** atendimentos com vômito ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `vomito`

#### Dor forte na SRPA

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Pontuação de dor na SRPA acima do limiar configurado, na primeira avaliação registrada.
- **Fórmula:** atendimentos com dor acima do limiar ÷ atendimentos com dor avaliada × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `dorForte`

#### Hipotermia na chegada à SRPA

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Temperatura na chegada à SRPA abaixo do limiar configurado.
- **Fórmula:** atendimentos com temperatura abaixo do limiar ÷ atendimentos com temperatura medida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `hipotermiaSrpa`

#### Bloqueio neuromuscular residual

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Suspeita ou confirmação de bloqueio neuromuscular residual na recuperação.
- **Fórmula:** casos ÷ atendimentos com bloqueador neuromuscular e a pergunta respondida × 100
- **População elegível:** Atendimentos com uso de bloqueador neuromuscular.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `bnmResidual`

#### Lesão de córnea

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Lesão de córnea identificada no perioperatório.
- **Fórmula:** casos ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `lesaoCornea`

#### Lesão relacionada ao posicionamento

- **Tipo:** desfecho (menor é melhor)
- **Definição:** Lesão atribuída ao posicionamento cirúrgico, com tipo e localização registrados.
- **Fórmula:** casos ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `lesaoPosicionamento`

### Processo

#### Checklist de segurança cirúrgica completo

- **Tipo:** processo (maior é melhor)
- **Definição:** Checklist de segurança cirúrgica realizado e registrado como completo nas três etapas.
- **Fórmula:** atendimentos com checklist completo ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `checklist`

#### Capnografia contínua quando indicada

- **Tipo:** processo (maior é melhor)
- **Definição:** Uso de capnografia contínua nos atendimentos em que ela foi registrada como indicada.
- **Fórmula:** atendimentos com capnografia utilizada ÷ atendimentos com capnografia indicada e uso respondido × 100
- **População elegível:** Atendimentos com capnografia indicada.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `capnografia`

#### Profilaxia antibiótica no tempo

- **Tipo:** processo (maior é melhor)
- **Definição:** Antibiótico administrado antes da incisão, dentro da janela configurada.
- **Fórmula:** atendimentos com antibiótico dentro da janela ÷ atendimentos com profilaxia indicada e horários informados × 100
- **População elegível:** Atendimentos com profilaxia antibiótica indicada.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `antibioticoNoTempo`

#### Monitorização de profundidade quando indicada

- **Tipo:** processo (maior é melhor)
- **Definição:** Uso de monitorização de profundidade anestésica nos atendimentos em que o protocolo institucional a indica.
- **Fórmula:** atendimentos com monitorização utilizada ÷ atendimentos com indicação e uso respondido × 100
- **População elegível:** Atendimentos com indicação conforme protocolo institucional.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `profundidade`

#### Adesão ao protocolo de via aérea difícil

- **Tipo:** processo (maior é melhor)
- **Definição:** Adesão ao protocolo institucional de via aérea difícil quando a dificuldade era prevista.
- **Fórmula:** atendimentos com adesão ÷ atendimentos com via aérea difícil prevista e adesão respondida × 100
- **População elegível:** Atendimentos com via aérea difícil prevista.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `protocoloViaAerea`

#### Carrinho de via aérea difícil checado

- **Tipo:** processo (maior é melhor)
- **Definição:** Carrinho de via aérea difícil disponível e checado antes do procedimento.
- **Fórmula:** atendimentos com carrinho checado ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `carrinhoViaAerea`

#### Avaliação pré-anestésica documentada e completa

- **Tipo:** processo (maior é melhor)
- **Definição:** Avaliação pré-anestésica documentada e registrada como completa.
- **Fórmula:** atendimentos com avaliação completa ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `avaliacaoPre`

#### Medidas de prevenção de hipotermia

- **Tipo:** processo (maior é melhor)
- **Definição:** Aquecimento ativo e monitorização de temperatura no intraoperatório. Conta como adesão quando os dois foram feitos.
- **Fórmula:** atendimentos com aquecimento ativo e monitorização de temperatura ÷ atendimentos com as duas perguntas respondidas × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `prevencaoHipotermia`

#### Jejum pré-operatório adequado

- **Tipo:** processo (maior é melhor)
- **Definição:** Tempo entre a última ingestão e o início da anestesia igual ou maior que o mínimo configurado para o tipo de alimento ou líquido informado.
- **Fórmula:** atendimentos com jejum dentro do mínimo ÷ atendimentos com horário e tipo de ingestão informados × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `jejumAdequado`

#### Monitorização neuromuscular quando há bloqueador

- **Tipo:** processo (maior é melhor)
- **Definição:** Monitorização neuromuscular nos atendimentos com uso de bloqueador neuromuscular.
- **Fórmula:** atendimentos com monitorização ÷ atendimentos com bloqueador e a pergunta respondida × 100
- **População elegível:** Atendimentos com uso de bloqueador neuromuscular.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `monitorizacaoBnm`

#### Relação TOF adequada antes da saída

- **Tipo:** processo (maior é melhor)
- **Definição:** Último valor da relação TOF igual ou acima do limiar configurado, nos atendimentos com monitorização neuromuscular.
- **Fórmula:** atendimentos com TOF no limiar ÷ atendimentos com monitorização neuromuscular e TOF medido × 100
- **População elegível:** Atendimentos com monitorização neuromuscular.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `tofAdequado`

#### Profilaxia de náusea e vômito quando indicada

- **Tipo:** processo (maior é melhor)
- **Definição:** Profilaxia de náusea e vômito realizada quando indicada.
- **Fórmula:** atendimentos com profilaxia realizada ÷ atendimentos com indicação e realização respondida × 100
- **População elegível:** Atendimentos com profilaxia de náusea e vômito indicada.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `profilaxiaNv`

#### Passagem de cuidado registrada

- **Tipo:** processo (maior é melhor)
- **Definição:** Registro da passagem de cuidado para SRPA ou UTI, com horário e profissionais identificados.
- **Fórmula:** atendimentos com passagem registrada ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `passagemCuidado`

#### Pesquisa de satisfação aplicada

- **Tipo:** processo (maior é melhor)
- **Definição:** Pesquisa de satisfação do paciente com a experiência anestésica aplicada e registrada.
- **Fórmula:** atendimentos com pesquisa aplicada ÷ atendimentos com a pergunta respondida × 100
- **População elegível:** Todos os atendimentos com ficha de qualidade.
- **Acompanhamento:** não depende de janela posterior
- **Chave técnica:** `satisfacaoAplicada`

## Eventos clínicos registrados (17)

Cada evento tem uma pergunta de quatro opções (Sim, Não, Não se aplica, Não avaliado/sem informação) que
**nasce sem resposta**. Quando a resposta é "Sim", o formulário abre os campos: **data e horário,
descrição, gravidade, conduta adotada, evolução, relação com a anestesia e situação da investigação**,
mais os campos próprios do evento (abaixo). O mesmo tipo de evento pode ser registrado mais de uma vez no
mesmo atendimento. Eventos marcados com *(só anestesia geral)* não aparecem nem são cobrados em
atendimentos sem anestesia geral.

| Evento | Etapa | Campos próprios |
|---|---|---|
| Óbito em até 24 horas | Acompanhamento (24 h, 48 h e 30 dias) | — |
| Óbito em até 48 horas | Acompanhamento (24 h, 48 h e 30 dias) | — |
| Óbito em até 30 dias | Acompanhamento (24 h, 48 h e 30 dias) | — |
| Parada cardiorrespiratória na sala cirúrgica | Período intraoperatório | Circunstâncias; Ritmo inicial; Duração da RCP (min); Retorno de circulação espontânea |
| Despertar intraoperatório com recordação explícita (suspeita ou confirmado) *(só anestesia geral)* | Acompanhamento (24 h, 48 h e 30 dias) | Situação; Instrumento usado na entrevista |
| Disfunção neurológica perioperatória | Acompanhamento (24 h, 48 h e 30 dias) | Tipo; Qual (se outro) |
| Intubação ou ventilação difícil *(só anestesia geral)* | Período intraoperatório | A dificuldade era prevista?; Tentativas; Complicação; Qual (se outra) |
| Intubação esofágica *(só anestesia geral)* | Período intraoperatório | Reconhecimento; Como foi reconhecida |
| Broncoaspiração pulmonar perioperatória | Período intraoperatório | — |
| Reintubação não planejada em até 24 horas *(só anestesia geral)* | Acompanhamento (24 h, 48 h e 30 dias) | Motivo |
| Hipertensão grave no intraoperatório | Período intraoperatório | Tratamento |
| Isquemia ou infarto do miocárdio perioperatório | Acompanhamento (24 h, 48 h e 30 dias) | Critério diagnóstico; Troponina (se dosada) |
| Instabilidade hemodinâmica com vasopressor não planejado | Período intraoperatório | Medicamento; Motivo; Intervenção realizada |
| Bloqueio neuromuscular residual (suspeita ou confirmado) *(só anestesia geral)* | Recuperação pós-anestésica | Situação; Relação TOF no momento |
| Lesão de córnea | Recuperação pós-anestésica | Lado |
| Lesão relacionada ao posicionamento | Recuperação pós-anestésica | Tipo; Localização |
| Falha de comunicação na passagem de cuidado | Transição de cuidado e satisfação | Consequência; Providência adotada |

## Listas de escolha

Gravidade: Leve, Moderada, Grave, Ameaça à vida, Óbito.

Relação com a anestesia (avaliação clínica): Não avaliada, Não relacionada, Improvável, Possível, Provável, Definida.

Situação da investigação: Não iniciada, Em andamento, Concluída, Não se aplica.

Confirmação na revisão clínica: Confirmado, Não confirmado, Registro descartado.

## Faixas de validação (só barram erro de digitação)

| Campo | Faixa aceita |
|---|---|
| Idade | 0 a 120 anos |
| Peso | 0,3 a 400 kg |
| Altura | 30 a 250 cm |
| SpO₂ mínima | 20 a 100 % |
| PAM mínima | 10 a 200 mmHg |
| PA sistólica máxima | 40 a 320 mmHg |
| Tempo acumulado | 0 a 1440 min |
| Temperatura | 25 a 45 °C |
| Pontuação de dor | 0 a 10 |
| Relação TOF | 0 a 1,5 |
| Tentativas | 1 a 10 |
| Nota de satisfação | 0 a 10 |
| Anestesiologistas | 0 a 200 |
| Salas em funcionamento | 0 a 100 |
| Participantes | 0 a 500 |
| Carga horária | 0 a 100 h |

São faixas de sanidade, **não alarmes clínicos**: valor extremo mas possível passa.
