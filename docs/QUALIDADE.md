# Qualidade e segurança em anestesia

Módulo de registro e acompanhamento de desfechos, processos e estrutura, por
paciente e por procedimento anestésico, com painel e relatórios para a
coordenação. O anestesista preenche a **ficha de qualidade** de cada
atendimento (inclusive pelo celular); a coordenação registra a **estrutura** por
unidade, sala e turno e configura as **definições clínicas**.

> **Estado: protótipo para aprovação.** Antes de implantar, o responsável
> técnico de anestesiologia precisa conferir as definições
> ([QUALIDADE_INDICADORES.md](QUALIDADE_INDICADORES.md)), os limiares e os
> critérios de elegibilidade — ver a seção *Checklist de aprovação*.

## Onde está cada peça

| O quê | Onde |
|---|---|
| Formato da ficha, eventos, validação, pendências, acompanhamento | `core/06c_qualidade.js` |
| Estrutura: equipamentos, carro de parada, equipe, sangue, treinamentos, vínculo com o atendimento | `core/06d_estrutura.js` |
| Definição e cálculo de cada indicador, filtros, comparação, completude | `core/09c_qualidade_painel.js` |
| Operações no store (criar, salvar, evento, acompanhamento, revisão, concluir, reabrir, estrutura, configuração) | `core/12_store.js` |
| Tela da ficha (por etapa) e lista | `webapp/js/telas/qualidade.js` |
| Painel (indicadores, comparação, configuração clínica) | `webapp/js/telas/painel_qualidade.js` |
| Tela de estrutura (coordenação) | `webapp/js/telas/estrutura.js` |
| PDF da ficha e do relatório | `webapp/js/03f_qualidade_pdf.js` |
| PPTX (apresentação), sem biblioteca | `webapp/js/03h_pptx.js` |
| Dados fictícios do protótipo | `webapp/js/demo_online.js` |
| Relatórios de exemplo | `tools/gerar_exemplos_qualidade.js` → `saida/exemplos_qualidade/` |
| Catálogo para aprovação | `tools/gerar_docs_qualidade.js` → `docs/QUALIDADE_INDICADORES.md` |
| Testes | `qa/20_qualidade.test.js`, `qa/21_qualidade_prototipo.test.js`, `qa/19_servidor.test.js` |

## Como o formulário funciona

**Seis etapas** (abas da ficha): Identificação · Pré-anestésica · Intraoperatório ·
Recuperação · Acompanhamento (24 h, 48 h e 30 dias) · Transição e satisfação — mais a
**Revisão clínica**.

**Cada campo grava sozinho ao sair dele.** Não há botão de salvar: dá para
preencher aos poucos, no celular, entre um caso e outro, e continuar depois.
Quem abre o app volta exatamente onde parou.

**Perguntas de evento têm quatro botões** — *Sim*, *Não*, *Não se aplica*,
*Não avaliado/sem informação* — e **nascem todas apagadas**. Clicar de novo no
botão marcado desmarca. Campo em branco quer dizer "ninguém respondeu" e nunca
é lido como ausência de evento.

**"Sim" abre os campos do evento**: o formulário da etapa já vem com o tipo
escolhido e o cursor na descrição — data e horário, descrição, gravidade,
conduta adotada, evolução, relação com a anestesia e situação da investigação,
mais os campos próprios daquele evento (ex.: PCR pede circunstâncias, ritmo
inicial, duração da RCP e retorno de circulação; via aérea difícil pede se era
prevista, tentativas e complicação). Se a pessoa responde "Sim" e não detalha, a
pergunta mostra um lembrete — sem impedir nada.

**Só o pertinente aparece.** Bloqueio neuromuscular, intubação, via aérea
difícil, intubação esofágica, reintubação e despertar são da anestesia geral:
com sedação, raquianestesia, peridural ou bloqueio periférico, somem da tela e
deixam de ser cobrados. Enquanto nenhuma técnica foi escolhida, tudo aparece —
não dá para esconder o que ainda não se sabe que não se aplica.

**Vários eventos do mesmo tipo** no mesmo atendimento são permitidos (dois
episódios de hipotensão, por exemplo). Editar um evento que mudou no meio do
caminho (outra pessoa, outra aba) é recusado com aviso.

**Intervalos calculados**: duração da anestesia, permanência na SRPA, tempo de
jejum (horário da última ingestão até o início da anestesia), tempo entre o
antibiótico e a incisão, IMC. Horários que atravessam a meia-noite não viram
duração negativa.

**Destaques**: dor acima do limiar (padrão: acima de 7) e temperatura abaixo do
limiar (padrão: abaixo de 36 °C) na chegada à SRPA.

## Regras que não se negociam

1. **Dado ausente não é resultado negativo.** Sem resposta ou com "não
   avaliado", o atendimento fica em *sem informação*, fora do numerador e do
   denominador, e é contado à parte. Sem denominador, a taxa aparece "—", nunca 0%.
2. **A atribuição à anestesia é um campo separado** (*Relação com a anestesia*),
   preenchido por avaliação clínica. O sistema não presume causalidade.
3. **O que o anestesista registrou e o que a revisão clínica confirmou ficam
   distintos.** A revisão acrescenta confirmação, relação, investigação e parecer;
   não apaga o registro original. Cada evento guarda a origem
   (*Anestesista* ou *Revisão clínica*) e quem confirmou.
4. **Pendência nunca impede o atendimento.** A ficha pode ser concluída com
   itens em aberto; eles continuam contando como *registro incompleto*.
5. **Sem dado posterior, registra-se o motivo.** *Sem informação* e *perda de
   seguimento* exigem justificativa.
6. **Nenhuma referência normativa nasce pronta.** Nenhum indicador é marcado
   como exigência de SBA, ANVISA, Patient Safety Movement ou outra entidade.
   Fonte, versão e data de revisão são registradas pela coordenação, indicador a
   indicador; sem elas o painel diz "nenhuma fonte registrada".
7. **Denominadores respeitam a população elegível** de cada indicador
   (capnografia só entre os indicados; despertar só em anestesia geral; TOF só
   com monitorização neuromuscular…). "Não se aplica" tira o atendimento da conta.

## Ciclo da ficha

```
Em preenchimento --concluir--> Concluída --reabrir (motivo, ≥10 letras)--> Em preenchimento (versão + 1)
```

- **Concluída trava só o que é do centro cirúrgico.** O acompanhamento de 24 h,
  48 h e 30 dias e a revisão clínica continuam abertos, porque acontecem depois.
- **Histórico de alterações**: cada gravação guarda campo, valor anterior,
  valor novo, autor, data e hora dentro da própria ficha (as 300 últimas), e uma
  entrada por gravação vai para o LOG de auditoria.
- **Acompanhamento vencido** (a data da cirurgia mais 1, 2 ou 30 dias já passou)
  sem resposta aparece como pendente, na ficha, na lista e no painel. Janela
  marcada como *Realizado* sem as perguntas dela respondidas também vira
  pendência — o dado não some calado.
- **Cirurgia com ficha não se exclui** (mude o STATUS para Cancelada). Ficha
  criada por engano e nunca concluída nem revisada pode ser descartada.

## Estrutura (coordenação)

Registro por **data, turno, unidade e sala**: 12 itens de equipamento
(capnógrafo, monitor multiparamétrico, aparelho de anestesia, oxímetro,
aspirador, fonte de oxigênio, carrinho de via aérea difícil, desfibrilador,
aquecimento, bomba de infusão, monitor de TOF, monitor de profundidade), carro
de parada (disponível, checado, data), anestesiologistas e salas em
funcionamento, sangue e hemoderivados e treinamentos e simulações.

**O anestesista não repete nada disso.** O atendimento se liga sozinho ao
registro por data, unidade, sala e horário (sala específica vence unidade
inteira; turno específico vence "dia inteiro"), e o vínculo aparece na ficha e
no PDF. Item **não verificado** não conta como disponível nem como falta.
Dois registros para a mesma data, turno, unidade e sala são recusados.

## Painel e relatórios

Filtros: período, unidade, especialidade, procedimento (tipo), técnica, ASA,
caráter e profissional. Para cada indicador: eventos, elegíveis, denominador,
taxa, sem informação, sem acompanhamento, meta (se configurada), definição e
fórmula (botão de informação) e evolução mês a mês.

**Comparação por profissional** (só coordenação): a taxa vem separada por
risco — *ASA I–II* e *ASA III+* — com o *n* embaixo de cada uma, ao lado do
perfil (% ASA III+ e % não eletivos). É **estratificação**, não um modelo
estatístico de risco; com poucos casos a taxa é instável.

| Exportação | Conteúdo | Identifica paciente? |
|---|---|---|
| CSV / Excel — indicadores | Um indicador por linha: eventos, denominador, sem informação, taxa, meta, definição, fórmula, fonte | Não |
| CSV — atendimentos | Uma linha por atendimento com o resultado em cada indicador (Sim / Não / Sem informação / Fora da população) | **Não**: só ID da ficha e mês, sem nome, prontuário nem data exata |
| Planilhas (.zip) | Indicadores + evolução + atendimentos | Não |
| PDF — relatório | Cobertura, indicadores por grupo, definições e fórmulas, evolução, estrutura, satisfação, ressalvas | Não |
| PPTX — apresentação | Capa, um slide por grupo (tabela nativa, editável), estrutura e satisfação, "como ler" | Não |
| PDF — ficha | O atendimento inteiro, com histórico e itens sem resposta | **Sim** (é prontuário de qualidade) |
| CSV — lista de fichas | Lista operacional do mês | Sim |

## Acesso e proteção de dados

- **Modo servidor da clínica**: login individual (scrypt), sessão em cookie
  HttpOnly, trava após 5 senhas erradas, `acessos.log`, backups com retenção —
  os mesmos do resto do sistema.
- **Papéis**: *equipe* (anestesistas, secretaria) cria, preenche, conclui e
  reabre fichas, registra acompanhamento e vê o painel do serviço. *Admin*
  (coordenação) também registra **estrutura**, altera a **configuração
  clínica** e usa a **comparação por profissional**. O servidor recusa com 403 o
  que a equipe não pode — a tela esconder o botão é só cortesia. Quem entra com
  o nome de um anestesista do cadastro vê primeiro os próprios atendimentos
  (*Só os meus atendimentos*).
- **Rastreabilidade**: toda gravação vai para o LOG (autor, data, hora, campo);
  o histórico da ficha guarda o valor anterior e o novo.
- **LGPD**: a ficha traz dado de saúde. Fora do servidor da clínica (um
  computador só), os dados ficam no navegador sem login — use computador com
  usuário próprio, bloqueio de tela e disco criptografado. **A versão online é
  demonstração: não use dado real de paciente nela.** A finalidade, a base
  legal, o prazo de guarda e quem é o controlador dos dados são decisões da
  instituição (ver *Decisões em aberto*).
- **Backup**: fichas, estrutura e configuração clínica vão no backup `.json` e
  passam pelo mesmo saneamento de importação (campo desconhecido é descartado).

## Configuração clínica

Tela *Painel de qualidade → Configuração clínica* (coordenação):

- **Aprovação do responsável técnico** (nome, CRM, data, versão) — sem ela, o
  painel e os relatórios avisam que as definições não foram aprovadas;
- **Limiares** (SpO₂, PAM, PA sistólica de hipertensão grave, temperatura, dor, TOF,
  jejum de sólidos e de líquidos, janela do antibiótico);
- **Meta** por indicador;
- **Referência** por indicador: fonte, versão e data de revisão;
- **Indicador ativo/inativo** no painel.

Toda mudança vai para o LOG.

## Checklist de aprovação

Para quem aprova (o pedido original fala em três verificações):

1. **O preenchimento é prático?** Abrir uma ficha no celular e no computador;
   conferir o toque único por resposta, o "Sim" que abre o evento e o que some
   quando a técnica não é anestesia geral. *Protótipo navegável*: versão online
   ou `Abrir sistema.bat` (a demonstração traz 18 atendimentos fictícios).
2. **Os cálculos estão corretos?** Conferir contra as contas à mão em
   [QUALIDADE_INDICADORES.md](QUALIDADE_INDICADORES.md); a planilha *atendimentos*
   (CSV) mostra, linha a linha, quem entra em cada numerador e denominador. A
   bateria (`node qa 20`, `node qa 21`) refaz essas contas de forma independente.
3. **As definições correspondem aos protocolos da instituição?** Ler o
   catálogo indicador por indicador; ajustar limiares, elegibilidade e metas;
   registrar a aprovação e as referências na configuração clínica.

## Decisões em aberto (da instituição, não do sistema)

- **Limiares de partida que não vieram do pedido** e precisam de validação:
  PA sistólica de hipertensão grave (180 mmHg), jejum mínimo (8 h sólidos, 2 h
  líquidos), relação TOF adequada (0,9) e janela do antibiótico (0 a 60 min antes
  da incisão). SpO₂ < 90 %, PAM < 65 mmHg, temperatura < 36 °C e dor > 7 vêm do
  pedido.
- **Fontes e versões** de cada indicador que tenha referência normativa ou técnica.
- **Metas** — nenhuma vem preenchida.
- **Quem é o revisor clínico** e com que frequência as fichas são revisadas.
- **Papéis**: o sistema tem dois (equipe e admin). Se a instituição quiser um
  papel de *coordenação de qualidade* distinto do administrador do sistema, é
  uma extensão pequena, mas é decisão de organização.
- **LGPD**: base legal, prazo de guarda, controlador e encarregado.
- **Nem tudo está no sistema**: não há importação automática de dados de monitor;
  a assinatura da ficha é o registro no sistema (com autor, data e histórico), não
  certificado digital ICP-Brasil; o instrumento de satisfação é livre (a
  instituição escolhe qual usar).
