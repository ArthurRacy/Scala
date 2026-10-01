/**
 * ============================================================================
 * 06_AVALIACOES — Integração CIRURGIAS -> AVALIAÇÕES PRÉ
 * ============================================================================
 * TASK-301 [MELHORIA 2]  Criar a linha de avaliação AUTOMATICAMENTE no momento
 *                        em que AVALIAÇÃO PRÉ NECESSÁRIA? vira "Sim".
 * TASK-302               Vincular pelo ID_CIRURGIA e auto-preencher os quatro
 *                        campos espelhados da cirurgia.
 * TASK-303               Restringir ANESTESISTA DA AVALIAÇÃO ao cadastro
 *                        (a lista suspensa em si é aplicada em 03_dominios /
 *                        no Apps Script; aqui fica a regra de dados).
 *
 * PRINCÍPIO DE SEGURANÇA — idempotência:
 * A sincronização pode rodar quantas vezes quiser sem duplicar nada. Ela
 * decide pela existência de vínculo, não pelo evento. Isso é o que impede o
 * efeito clássico de gatilho de planilha ("marquei Sim duas vezes e ganhei
 * duas linhas"). E ela NUNCA apaga uma avaliação já preenchida: se o usuário
 * volta o campo para "Não", a linha é apenas SINALIZADA como órfã, para
 * decisão humana — dado clínico não se descarta por conta própria.
 * ============================================================================
 */

/** Índice { ID_CIRURGIA: [avaliações...] }, preservando a ordem de entrada. */
function indexarAvaliacoesPorCirurgia(avaliacoes) {
  var idx = {};
  (avaliacoes || []).forEach(function (a) {
    var k = txt(a.idCirurgia);
    if (!k) return;
    (idx[k] = idx[k] || []).push(a);
  });
  return idx;
}

/**
 * TASK-302 — Espelha na avaliação os quatro campos da cirurgia.
 * Colunas C, D, E, F da aba AVALIAÇÕES PRÉ:
 *   PACIENTE (auto)                <- CIRURGIAS.NOME DO PACIENTE
 *   DATA DA CIRURGIA (auto)        <- CIRURGIAS.DATA DA CIRURGIA
 *   NOME DA CIRURGIA (auto)        <- CIRURGIAS.PROCEDIMENTO/CIRURGIA
 *   ANESTESISTA DA CIRURGIA (auto) <- CIRURGIAS.ANESTESISTA
 * Se a cirurgia não for encontrada, os quatro campos FICAM como estavam.
 * (A planilha apaga, por IFERROR; aqui isso destruiria o histórico: a
 * avaliação é mantida justamente para não perder dado clínico e financeiro,
 * e sem paciente nem data ela sumiria também do mês de competência.)
 */
function espelharDadosDaCirurgia(a, cirurgia) {
  if (!cirurgia) return a;
  a.paciente = txt(cirurgia.paciente);
  a.dataCirurgia = paraData(cirurgia.data);
  a.nomeCirurgia = txt(cirurgia.procedimento);
  a.anestCirurgia = txt(cirurgia.anestesista);
  return a;
}

/**
 * Colunas Q e R — MÊS/ANO (auto)
 * =IF($H2<>"",MONTH($H2),IF($D2<>"",MONTH($D2),""))
 * Competência é a data da AVALIAÇÃO; se ela ainda não ocorreu, usa a data da
 * cirurgia como referência provisória.
 */
function calcCompetenciaAvaliacao(a) {
  var base = !vazio(a.data) ? a.data : a.dataCirurgia;
  return { mes: vazio(base) ? '' : mesDe(base), ano: vazio(base) ? '' : anoDe(base) };
}

/** Recalcula os campos automáticos de uma avaliação. */
function recalcularAvaliacao(a, cirurgia, porNome) {
  /* --- normalização dos campos digitados ------------------------------- */
  a.data = paraData(a.data);
  a.dataPagamento = paraData(a.dataPagamento);
  a.hora = paraHora(a.hora);
  a.realizada = paraSimNao(a.realizada);
  a.tcle = paraSimNao(a.tcle);
  a.pago = paraSimNao(a.pago);
  a.valor = paraNumero(a.valor);
  a.anestesista = nomeDoCadastro(a.anestesista, porNome);

  /* --- campos espelhados e competência --------------------------------- */
  espelharDadosDaCirurgia(a, cirurgia);
  var comp = calcCompetenciaAvaliacao(a);
  a.mes = comp.mes;
  a.ano = comp.ano;

  return a;
}

/**
 * A cirurgia pede uma avaliação pré-anestésica? É a regra que cria a linha em
 * `sincronizarAvaliacoes`: AVALIAÇÃO PRÉ NECESSÁRIA? = "Sim" e a cirurgia não
 * cancelada. A tela de cirurgia usa a mesma conta para saber, antes de a linha
 * existir, se os exames do paciente terão onde ficar guardados.
 */
function cirurgiaPedeAvaliacao(c) {
  return !!c && ehSim(c.avaliacaoNec) && cirurgiaContabilizavel(c);
}

/**
 * TASK-301 — Sincroniza a aba AVALIAÇÕES PRÉ com a aba CIRURGIAS.
 *
 * Regras, na ordem:
 *   1. Cirurgia com AVALIAÇÃO PRÉ NECESSÁRIA? = "Sim" e SEM avaliação vinculada
 *      -> cria uma linha nova, já espelhada, com REALIZADA?="Não" e TCLE="Não".
 *   2. Avaliação existente -> re-espelha os 4 campos (a cirurgia pode ter tido
 *      paciente, data, procedimento ou anestesista corrigidos).
 *   3. Avaliação cujo ID_CIRURGIA não existe mais, ou cuja cirurgia voltou para
 *      "Não" / foi cancelada -> marcada como órfã em `orfas`. NÃO é apagada.
 *
 * `opcoes.valorPadrao` preenche o VALOR DA AVALIAÇÃO das linhas novas.
 *
 * Devolve um relatório do que mudou, para alimentar a aba LOG e avisar a tela:
 *   { criadas: [...], atualizadas: [...], orfas: [...], avaliacoes: [...] }
 */
function sincronizarAvaliacoes(cirurgias, avaliacoes, opcoes) {
  opcoes = opcoes || {};
  var lista = (avaliacoes || []).slice();
  var idx = indexarAvaliacoesPorCirurgia(lista);

  var porId = {};
  (cirurgias || []).forEach(function (c) {
    var k = txt(c.id);
    if (k) porId[k] = c;
  });

  var criadas = [], atualizadas = [], orfas = [];

  /* --- 1. criar o que falta -------------------------------------------- */
  (cirurgias || []).forEach(function (c) {
    if (!cirurgiaPedeAvaliacao(c)) return;            // não é "Sim", ou está cancelada
    if (vazio(c.id)) return;                          // cirurgia sem ID ainda
    if ((idx[txt(c.id)] || []).length > 0) return;    // já tem: idempotente

    var nova = novaAvaliacao(c, lista, opcoes);
    lista.push(nova);
    (idx[txt(c.id)] = idx[txt(c.id)] || []).push(nova);
    criadas.push(nova);
  });

  /* --- 2. re-espelhar e 3. detectar órfãs ----------------------------- */
  lista.forEach(function (a) {
    garantirUid(a);
    var c = porId[txt(a.idCirurgia)];

    if (!c) {
      orfas.push({ avaliacao: a, motivo: 'ID_CIRURGIA "' + txt(a.idCirurgia) + '" não existe mais em CIRURGIAS.' });
    } else if (!ehSim(c.avaliacaoNec)) {
      orfas.push({ avaliacao: a, motivo: 'A cirurgia ' + txt(c.id) + ' não requer mais avaliação pré.' });
    } else if (!cirurgiaContabilizavel(c)) {
      orfas.push({ avaliacao: a, motivo: 'A cirurgia ' + txt(c.id) + ' está ' + txt(c.status) + '.' });
    }

    var antes = JSON.stringify([a.paciente, a.dataCirurgia, a.nomeCirurgia, a.anestCirurgia, a.mes, a.ano]);
    recalcularAvaliacao(a, c, opcoes.porNome);
    var depois = JSON.stringify([a.paciente, a.dataCirurgia, a.nomeCirurgia, a.anestCirurgia, a.mes, a.ano]);
    if (antes !== depois && criadas.indexOf(a) < 0) atualizadas.push(a);
  });

  return { criadas: criadas, atualizadas: atualizadas, orfas: orfas, avaliacoes: lista };
}

/**
 * Identidade interna e estável da avaliação.
 * O ID_AVALIAÇÃO é sequencial e legível (AV0001); o `uid` é aleatório e nunca
 * se repete, nem depois de "apagar tudo" ou de importar um backup. É ele que
 * prende os PDFs de exame à avaliação certa — prender pelo ID sequencial
 * mostraria o exame de um paciente na avaliação de outro.
 * Não é coluna da planilha: vive só no estado do web app.
 */
function novoUid() {
  // Com semente (modo servidor), o uid se repete igual no navegador e no servidor.
  if (CONTEXTO_EXECUCAO.semente) return 'u' + CONTEXTO_EXECUCAO.semente + (CONTEXTO_EXECUCAO.contador++).toString(36);
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function garantirUid(a) {
  if (a && vazio(a.uid)) a.uid = novoUid();
  return a;
}

/**
 * Monta uma linha nova de avaliação a partir da cirurgia.
 * O ID é gerado olhando os IDs já existentes — sem depender de contador
 * externo, para não dessincronizar se alguém apagar uma linha na planilha.
 */
function novaAvaliacao(cirurgia, existentes, opcoes) {
  opcoes = opcoes || {};
  var ids = (existentes || []).map(function (a) { return txt(a.id); });

  var a = {
    id: proximoId(CONFIG.PREFIXO_AVALIACAO, ids, 4, opcoes.pisoId),
    uid: novoUid(),
    idCirurgia: txt(cirurgia.id),
    paciente: '',
    dataCirurgia: '',
    nomeCirurgia: '',
    anestCirurgia: '',
    // Sugestão: quem faz a avaliação é, por padrão, o anestesista da cirurgia.
    // É só sugestão — a secretária troca pela lista suspensa (TASK-303).
    anestesista: opcoes.herdarAnestesista === false ? '' : txt(cirurgia.anestesista),
    data: '',
    hora: '',
    realizada: 'Não',
    tcle: 'Não',
    // Valor padrão 0 = "sem valor padrão": nasce em branco. Antes nascia
    // R$ 0,00 e cada avaliação virava um lançamento zerado no ledger.
    valor: paraNumero(opcoes.valorPadrao !== undefined ? opcoes.valorPadrao
                                                      : CONFIG.VALOR_PADRAO_AVALIACAO) || null,
    pago: 'Não',
    dataPagamento: '',
    nf: '',
    obs: '',
    mes: '',
    ano: ''
  };

  return recalcularAvaliacao(a, cirurgia, opcoes.porNome);
}

/**
 * A avaliação entra no faturamento? Sim, se foi realizada — mesmo que a
 * cirurgia tenha sido cancelada depois, a consulta aconteceu. Não, se ainda
 * não aconteceu e a cirurgia foi cancelada: não houve consulta a cobrar.
 * `canceladas` = { ID_CIRURGIA: true } das cirurgias canceladas.
 */
function avaliacaoFaturavel(a, canceladas) {
  if (avaliacaoRealizada(a)) return true;
  return !(canceladas && canceladas[txt(a.idCirurgia)]);
}

/** Mapa { ID_CIRURGIA: true } das cirurgias canceladas. */
function indexarCanceladas(cirurgias) {
  var m = {};
  (cirurgias || []).forEach(function (c) {
    if (!cirurgiaContabilizavel(c) && !vazio(c.id)) m[txt(c.id)] = true;
  });
  return m;
}

/** Filtra avaliações por competência (colunas Q/R). */
function filtrarAvaliacoesPorCompetencia(lista, mes, ano) {
  return (lista || []).filter(function (a) {
    return Number(a.mes) === Number(mes) && Number(a.ano) === Number(ano);
  });
}

/** Avaliação realizada? (critério "Sim" na coluna J, usado nos COUNTIFS) */
function avaliacaoRealizada(a) {
  return ehSim(a.realizada);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    novoUid: novoUid,
    avaliacaoFaturavel: avaliacaoFaturavel,
    indexarCanceladas: indexarCanceladas,
    garantirUid: garantirUid,
    cirurgiaPedeAvaliacao: cirurgiaPedeAvaliacao,
    indexarAvaliacoesPorCirurgia: indexarAvaliacoesPorCirurgia,
    espelharDadosDaCirurgia: espelharDadosDaCirurgia,
    calcCompetenciaAvaliacao: calcCompetenciaAvaliacao,
    recalcularAvaliacao: recalcularAvaliacao,
    sincronizarAvaliacoes: sincronizarAvaliacoes,
    novaAvaliacao: novaAvaliacao,
    filtrarAvaliacoesPorCompetencia: filtrarAvaliacoesPorCompetencia,
    avaliacaoRealizada: avaliacaoRealizada
  };
}
