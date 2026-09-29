/**
 * ============================================================================
 * 09C_QUALIDADE_PAINEL — Indicadores de qualidade: definição e cálculo
 * ============================================================================
 * Aqui mora a definição de CADA indicador: nome, grupo, texto da definição,
 * fórmula, população elegível e como o valor é medido numa ficha (06c).
 * O cálculo é uma varredura só, sem laço escondido, e devolve para o painel
 * exatamente o que o serviço pediu por indicador:
 *
 *   eventos            numerador
 *   elegiveis          atendimentos da população elegível
 *   respondidos        elegíveis com informação (denominador da taxa)
 *   semInformacao      elegíveis sem resposta — NUNCA contados como "não"
 *   semAcompanhamento  elegíveis cuja janela de seguimento está em aberto
 *   taxa               eventos ÷ respondidos × 100
 *   definicao/formula  o texto que aparece junto do número
 *   meta/referencia    o que a coordenação configurou (pode não haver)
 *   serie              evolução mês a mês
 *
 * DUAS REGRAS QUE NÃO SE NEGOCIAM
 *   1. Dado ausente não é resultado negativo. Fica em `semInformacao`, fora
 *      do numerador e fora do denominador da taxa.
 *   2. Nada aqui afirma origem normativa. Nenhum indicador nasce marcado como
 *      exigência de entidade alguma: fonte, versão e data de revisão são
 *      registradas pela coordenação em `config.qualidade.referencias` e só
 *      então aparecem no painel e no relatório.
 *
 * Os limiares clínicos (SpO₂, PAM, temperatura, dor, TOF, jejum, janela do
 * antibiótico) são configuráveis e devem ser aprovados pelo responsável
 * técnico antes da implantação — ver `config.qualidade.aprovacao`.
 * ============================================================================
 */

/** Limiares clínicos padrão. São ponto de partida, não norma. */
var LIMIARES_QUALIDADE_PADRAO = {
  spo2: 90,            // % — hipoxemia abaixo disto
  pam: 65,             // mmHg — hipotensão abaixo disto
  pasGrave: 180,       // mmHg — hipertensão grave a partir disto
  temperatura: 36,     // °C — hipotermia abaixo disto
  dor: 7,              // pontuação — dor forte acima disto
  tof: 0.9,            // relação TOF adequada a partir disto
  jejumSolidos: 8,     // h
  jejumLiquidos: 2,    // h
  antibioticoJanela: 60 // min antes da incisão (0 a este valor = no tempo)
};

/** Configuração clínica vazia: nada aprovado, nenhuma meta, nenhuma referência. */
function configQualidadePadrao() {
  return {
    limiares: JSON.parse(JSON.stringify(LIMIARES_QUALIDADE_PADRAO)),
    metas: {},
    referencias: {},
    desativados: {},
    aprovacao: { responsavel: '', crm: '', em: '', versao: '', obs: '' }
  };
}

/** Configuração vinda de fora (backup, tela) -> configuração segura. */
function lerConfigQualidade(bruto) {
  var base = configQualidadePadrao();
  var c = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {};

  var lim = c.limiares && typeof c.limiares === 'object' ? c.limiares : {};
  Object.keys(base.limiares).forEach(function (k) {
    var n = paraNumero(lim[k]);
    if (n !== null && isFinite(n) && n >= 0 && n <= 10000) base.limiares[k] = n;
  });

  var metas = c.metas && typeof c.metas === 'object' ? c.metas : {};
  INDICADORES_QUALIDADE.forEach(function (i) {
    var n = paraNumero(metas[i.chave]);
    if (n !== null && isFinite(n) && n >= 0 && n <= 100) base.metas[i.chave] = Math.round(n * 10) / 10;
  });

  var refs = c.referencias && typeof c.referencias === 'object' ? c.referencias : {};
  INDICADORES_QUALIDADE.forEach(function (i) {
    var r = refs[i.chave];
    if (!r || typeof r !== 'object') return;
    var fonte = txt(r.fonte).slice(0, 200);
    if (!fonte) return;
    base.referencias[i.chave] = {
      fonte: fonte,
      versao: txt(r.versao).slice(0, 60),
      revisadaEm: paraData(r.revisadaEm) || ''
    };
  });

  var des = c.desativados && typeof c.desativados === 'object' ? c.desativados : {};
  INDICADORES_QUALIDADE.forEach(function (i) {
    if (des[i.chave] === true) base.desativados[i.chave] = true;
  });

  var ap = c.aprovacao && typeof c.aprovacao === 'object' ? c.aprovacao : {};
  base.aprovacao = {
    responsavel: txt(ap.responsavel).slice(0, 120),
    crm: txt(ap.crm).slice(0, 30),
    em: paraData(ap.em) || '',
    versao: txt(ap.versao).slice(0, 40),
    obs: txt(ap.obs).slice(0, 1000)
  };
  return base;
}

/** A configuração está aprovada pelo responsável técnico? */
function configQualidadeAprovada(cfg) {
  return !!(cfg && cfg.aprovacao && cfg.aprovacao.responsavel && cfg.aprovacao.em);
}

/* ==================================================== medidores comuns */

var MEDIDA_FORA = 'fora';   // fora da população elegível
var MEDIDA_SIM = 'sim';     // houve evento (desfecho) / houve adesão (processo)
var MEDIDA_NAO = 'nao';
var MEDIDA_SEM = 'sem';     // elegível, sem informação

function medidaDaResposta(v) {
  if (v === RESPOSTA_SIM) return MEDIDA_SIM;
  if (v === RESPOSTA_NAO) return MEDIDA_NAO;
  if (v === RESPOSTA_NA) return MEDIDA_FORA;
  return MEDIDA_SEM;   // '' ou 'Não avaliado/sem informação'
}

/** Indicador de desfecho lido de `respostas`. */
function porEvento(chave, elegivel) {
  return function (f, ctx) {
    if (elegivel && !elegivel(f, ctx)) return MEDIDA_FORA;
    return medidaDaResposta(f.respostas[chave]);
  };
}

/** Indicador lido de um campo de resposta (seção.campo). */
function porCampo(secao, campo, elegivel) {
  return function (f, ctx) {
    if (elegivel && !elegivel(f, ctx)) return MEDIDA_FORA;
    return medidaDaResposta(f[secao][campo]);
  };
}

/** Indicador numérico: `valor(f, ctx)` e `atinge(n, cfg)`. */
function porNumero(valor, atinge, elegivel) {
  return function (f, ctx) {
    if (elegivel && !elegivel(f, ctx)) return MEDIDA_FORA;
    var n = valor(f, ctx);
    if (n === null || n === undefined) return MEDIDA_SEM;
    return atinge(n, ctx.limiares) ? MEDIDA_SIM : MEDIDA_NAO;
  };
}

/* ------------------------------------------------------- elegibilidade */

function elegivelGeral(f) { return ehGeralNaFicha(f); }
function elegivelIntubado(f) { return f.intra.intubacao === RESPOSTA_SIM; }
function elegivelBnm(f) { return f.processo.bnmUsado === RESPOSTA_SIM; }
function elegivelBnmMonitorizado(f) { return f.processo.bnmMonitorizado === RESPOSTA_SIM; }
function elegivelCapnografia(f) { return f.processo.capnografiaIndicada === RESPOSTA_SIM; }
function elegivelAtb(f) { return f.processo.atbIndicada === RESPOSTA_SIM; }
function elegivelProfundidade(f) { return f.processo.profundidadeIndicada === RESPOSTA_SIM; }
function elegivelViaAereaPrevista(f) { return f.pre.viaAereaDificilPrevista === RESPOSTA_SIM; }
function elegivelProfilaxiaNv(f) { return f.srpa.profilaxiaNvIndicada === RESPOSTA_SIM; }

/**
 * CATÁLOGO DE INDICADORES.
 * `tipo`: 'desfecho' (menor é melhor) ou 'processo' (maior é melhor).
 * `janela`: a janela de acompanhamento de que o indicador depende, quando
 * depende de uma — é o que permite separar "sem informação" de "ainda não
 * chegou a hora de perguntar".
 */
var INDICADORES_QUALIDADE = [
  /* ================== Mortalidade e morbidade grave =================== */
  { chave: 'obito24h', nome: 'Óbito em até 24 horas', grupo: 'Mortalidade e morbidade grave',
    tipo: 'desfecho', janela: 'h24',
    definicao: 'Óbito do paciente em até 24 horas do término da anestesia, independentemente da causa. ' +
      'A relação com a anestesia é avaliação clínica registrada em separado, evento a evento.',
    formula: 'óbitos em até 24 h ÷ atendimentos com acompanhamento de 24 h respondido × 100',
    medir: porEvento('obito24h') },

  { chave: 'obito48h', nome: 'Óbito em até 48 horas', grupo: 'Mortalidade e morbidade grave',
    tipo: 'desfecho', janela: 'h48',
    definicao: 'Óbito do paciente em até 48 horas do término da anestesia.',
    formula: 'óbitos em até 48 h ÷ atendimentos com acompanhamento de 48 h respondido × 100',
    medir: porEvento('obito48h') },

  { chave: 'obito30d', nome: 'Óbito em até 30 dias', grupo: 'Mortalidade e morbidade grave',
    tipo: 'desfecho', janela: 'd30',
    definicao: 'Óbito do paciente em até 30 dias do procedimento.',
    formula: 'óbitos em até 30 dias ÷ atendimentos com acompanhamento de 30 dias respondido × 100',
    medir: porEvento('obito30d') },

  { chave: 'pcrSala', nome: 'Parada cardiorrespiratória na sala cirúrgica',
    grupo: 'Mortalidade e morbidade grave', tipo: 'desfecho',
    definicao: 'Parada cardiorrespiratória ocorrida dentro da sala cirúrgica, com necessidade de manobras de reanimação.',
    formula: 'paradas na sala ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('pcrSala') },

  { chave: 'despertar', nome: 'Despertar intraoperatório com recordação explícita',
    grupo: 'Mortalidade e morbidade grave', tipo: 'desfecho', janela: 'h24',
    definicao: 'Suspeita ou confirmação de despertar intraoperatório com recordação explícita, em anestesia geral.',
    formula: 'casos suspeitos ou confirmados ÷ anestesias gerais com a pergunta respondida × 100',
    elegibilidade: 'Anestesia geral.',
    medir: porEvento('despertar', elegivelGeral) },

  { chave: 'disfuncaoNeuro', nome: 'Disfunção neurológica perioperatória',
    grupo: 'Mortalidade e morbidade grave', tipo: 'desfecho', janela: 'h48',
    definicao: 'Delirium, disfunção cognitiva, AVC, neuropatia periférica ou outra disfunção neurológica no perioperatório.',
    formula: 'casos ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('disfuncaoNeuro') },

  { chave: 'viaAereaDificil', nome: 'Intubação ou ventilação difícil',
    grupo: 'Mortalidade e morbidade grave', tipo: 'desfecho',
    definicao: 'Dificuldade de intubação ou de ventilação, prevista ou não, com ou sem complicação associada.',
    formula: 'casos ÷ anestesias gerais com a pergunta respondida × 100',
    elegibilidade: 'Anestesia geral.',
    medir: porEvento('viaAereaDificil', elegivelGeral) },

  /* ==================== Complicações respiratórias ==================== */
  { chave: 'intubacaoEsofagica', nome: 'Intubação esofágica', grupo: 'Complicações respiratórias',
    tipo: 'desfecho',
    definicao: 'Intubação esofágica, com registro separado de reconhecimento imediato ou tardio.',
    formula: 'casos ÷ atendimentos com intubação traqueal e a pergunta respondida × 100',
    elegibilidade: 'Atendimentos com intubação traqueal.',
    medir: porEvento('intubacaoEsofagica', elegivelIntubado) },

  { chave: 'broncoaspiracao', nome: 'Broncoaspiração pulmonar perioperatória',
    grupo: 'Complicações respiratórias', tipo: 'desfecho',
    definicao: 'Broncoaspiração de conteúdo gástrico no perioperatório.',
    formula: 'casos ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('broncoaspiracao') },

  { chave: 'reintubacao24h', nome: 'Reintubação não planejada em até 24 horas',
    grupo: 'Complicações respiratórias', tipo: 'desfecho', janela: 'h24',
    definicao: 'Reintubação não planejada em até 24 horas do término da anestesia.',
    formula: 'reintubações ÷ atendimentos com intubação e acompanhamento de 24 h respondido × 100',
    elegibilidade: 'Atendimentos com intubação traqueal.',
    medir: porEvento('reintubacao24h', elegivelIntubado) },

  { chave: 'hipoxemia', nome: 'Hipoxemia intraoperatória', grupo: 'Complicações respiratórias',
    tipo: 'desfecho',
    definicao: 'Menor SpO₂ registrada abaixo do limiar configurado, ou tempo acumulado abaixo dele maior que zero.',
    formula: 'atendimentos com SpO₂ mínima abaixo do limiar ÷ atendimentos com SpO₂ mínima registrada × 100',
    medir: function (f, ctx) {
      var s = f.intra.spo2Minima, t = f.intra.minutosSpo2Abaixo;
      if (s === null && t === null) return MEDIDA_SEM;
      if (t !== null && t > 0) return MEDIDA_SIM;
      if (s === null) return MEDIDA_SEM;
      return s < ctx.limiares.spo2 ? MEDIDA_SIM : MEDIDA_NAO;
    } },

  /* =================== Complicações cardiovasculares ================== */
  { chave: 'hipotensao', nome: 'Hipotensão intraoperatória', grupo: 'Complicações cardiovasculares',
    tipo: 'desfecho',
    definicao: 'Menor PAM registrada abaixo do limiar configurado, ou tempo acumulado abaixo dele maior que zero.',
    formula: 'atendimentos com PAM mínima abaixo do limiar ÷ atendimentos com PAM mínima registrada × 100',
    medir: function (f, ctx) {
      var p = f.intra.pamMinima, t = f.intra.minutosPamAbaixo;
      if (p === null && t === null) return MEDIDA_SEM;
      if (t !== null && t > 0) return MEDIDA_SIM;
      if (p === null) return MEDIDA_SEM;
      return p < ctx.limiares.pam ? MEDIDA_SIM : MEDIDA_NAO;
    } },

  { chave: 'hipertensaoGrave', nome: 'Hipertensão grave no intraoperatório',
    grupo: 'Complicações cardiovasculares', tipo: 'desfecho',
    definicao: 'Episódio de hipertensão grave no intraoperatório, conforme o limiar configurado de PA sistólica.',
    formula: 'casos ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('hipertensaoGrave') },

  { chave: 'isquemiaMiocardio', nome: 'Isquemia ou infarto do miocárdio perioperatório',
    grupo: 'Complicações cardiovasculares', tipo: 'desfecho', janela: 'h48',
    definicao: 'Isquemia ou infarto do miocárdio no perioperatório, conforme critério diagnóstico registrado.',
    formula: 'casos ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('isquemiaMiocardio') },

  { chave: 'vasopressorNaoPlanejado', nome: 'Vasopressor não planejado',
    grupo: 'Complicações cardiovasculares', tipo: 'desfecho',
    definicao: 'Instabilidade hemodinâmica com necessidade de vasopressor não planejado.',
    formula: 'casos ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('vasopressorNaoPlanejado') },

  /* ====================== Outros desfechos clínicos =================== */
  { chave: 'nausea', nome: 'Náusea pós-operatória', grupo: 'Outros desfechos clínicos', tipo: 'desfecho',
    definicao: 'Náusea pós-operatória registrada na recuperação, separada do vômito.',
    formula: 'atendimentos com náusea ÷ atendimentos com a pergunta respondida × 100',
    medir: porCampo('srpa', 'nausea') },

  { chave: 'vomito', nome: 'Vômito pós-operatório', grupo: 'Outros desfechos clínicos', tipo: 'desfecho',
    definicao: 'Vômito pós-operatório registrado na recuperação, separado da náusea.',
    formula: 'atendimentos com vômito ÷ atendimentos com a pergunta respondida × 100',
    medir: porCampo('srpa', 'vomito') },

  { chave: 'dorForte', nome: 'Dor forte na SRPA', grupo: 'Outros desfechos clínicos', tipo: 'desfecho',
    definicao: 'Pontuação de dor na SRPA acima do limiar configurado, na primeira avaliação registrada.',
    formula: 'atendimentos com dor acima do limiar ÷ atendimentos com dor avaliada × 100',
    medir: porNumero(function (f) { return f.srpa.dorPontuacao; },
      function (n, lim) { return n > lim.dor; }) },

  { chave: 'hipotermiaSrpa', nome: 'Hipotermia na chegada à SRPA', grupo: 'Outros desfechos clínicos',
    tipo: 'desfecho',
    definicao: 'Temperatura na chegada à SRPA abaixo do limiar configurado.',
    formula: 'atendimentos com temperatura abaixo do limiar ÷ atendimentos com temperatura medida × 100',
    medir: porNumero(function (f) { return f.srpa.temperaturaChegada; },
      function (n, lim) { return n < lim.temperatura; }) },

  { chave: 'bnmResidual', nome: 'Bloqueio neuromuscular residual', grupo: 'Outros desfechos clínicos',
    tipo: 'desfecho',
    definicao: 'Suspeita ou confirmação de bloqueio neuromuscular residual na recuperação.',
    formula: 'casos ÷ atendimentos com bloqueador neuromuscular e a pergunta respondida × 100',
    elegibilidade: 'Atendimentos com uso de bloqueador neuromuscular.',
    medir: porEvento('bnmResidual', elegivelBnm) },

  { chave: 'lesaoCornea', nome: 'Lesão de córnea', grupo: 'Outros desfechos clínicos', tipo: 'desfecho',
    definicao: 'Lesão de córnea identificada no perioperatório.',
    formula: 'casos ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('lesaoCornea') },

  { chave: 'lesaoPosicionamento', nome: 'Lesão relacionada ao posicionamento',
    grupo: 'Outros desfechos clínicos', tipo: 'desfecho',
    definicao: 'Lesão atribuída ao posicionamento cirúrgico, com tipo e localização registrados.',
    formula: 'casos ÷ atendimentos com a pergunta respondida × 100',
    medir: porEvento('lesaoPosicionamento') },

  /* ========================= Processo ================================= */
  { chave: 'checklist', nome: 'Checklist de segurança cirúrgica completo', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Checklist de segurança cirúrgica realizado e registrado como completo nas três etapas.',
    formula: 'atendimentos com checklist completo ÷ atendimentos com a pergunta respondida × 100',
    medir: porCampo('processo', 'checklistCompleto') },

  { chave: 'capnografia', nome: 'Capnografia contínua quando indicada', grupo: 'Processo', tipo: 'processo',
    definicao: 'Uso de capnografia contínua nos atendimentos em que ela foi registrada como indicada.',
    formula: 'atendimentos com capnografia utilizada ÷ atendimentos com capnografia indicada e uso respondido × 100',
    elegibilidade: 'Atendimentos com capnografia indicada.',
    medir: porCampo('processo', 'capnografiaUsada', elegivelCapnografia) },

  { chave: 'antibioticoNoTempo', nome: 'Profilaxia antibiótica no tempo', grupo: 'Processo', tipo: 'processo',
    definicao: 'Antibiótico administrado antes da incisão, dentro da janela configurada.',
    formula: 'atendimentos com antibiótico dentro da janela ÷ atendimentos com profilaxia indicada e horários informados × 100',
    elegibilidade: 'Atendimentos com profilaxia antibiótica indicada.',
    medir: porNumero(function (f, ctx) { return ctx.resumo.antibioticoAntesDaIncisao; },
      function (n, lim) { return n >= 0 && n <= lim.antibioticoJanela; }, elegivelAtb) },

  { chave: 'profundidade', nome: 'Monitorização de profundidade quando indicada', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Uso de monitorização de profundidade anestésica nos atendimentos em que o protocolo institucional a indica.',
    formula: 'atendimentos com monitorização utilizada ÷ atendimentos com indicação e uso respondido × 100',
    elegibilidade: 'Atendimentos com indicação conforme protocolo institucional.',
    medir: porCampo('processo', 'profundidadeUsada', elegivelProfundidade) },

  { chave: 'protocoloViaAerea', nome: 'Adesão ao protocolo de via aérea difícil', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Adesão ao protocolo institucional de via aérea difícil quando a dificuldade era prevista.',
    formula: 'atendimentos com adesão ÷ atendimentos com via aérea difícil prevista e adesão respondida × 100',
    elegibilidade: 'Atendimentos com via aérea difícil prevista.',
    medir: porCampo('pre', 'protocoloViaAerea', elegivelViaAereaPrevista) },

  { chave: 'carrinhoViaAerea', nome: 'Carrinho de via aérea difícil checado', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Carrinho de via aérea difícil disponível e checado antes do procedimento.',
    formula: 'atendimentos com carrinho checado ÷ atendimentos com a pergunta respondida × 100',
    medir: porCampo('pre', 'carrinhoChecado') },

  { chave: 'avaliacaoPre', nome: 'Avaliação pré-anestésica documentada e completa', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Avaliação pré-anestésica documentada e registrada como completa.',
    formula: 'atendimentos com avaliação completa ÷ atendimentos com a pergunta respondida × 100',
    medir: porCampo('pre', 'avaliacaoCompleta') },

  { chave: 'prevencaoHipotermia', nome: 'Medidas de prevenção de hipotermia', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Aquecimento ativo e monitorização de temperatura no intraoperatório. Conta como adesão quando os dois foram feitos.',
    formula: 'atendimentos com aquecimento ativo e monitorização de temperatura ÷ atendimentos com as duas perguntas respondidas × 100',
    medir: function (f) {
      var a = medidaDaResposta(f.processo.aquecimentoAtivo), m = medidaDaResposta(f.processo.monitorTemperatura);
      if (a === MEDIDA_FORA && m === MEDIDA_FORA) return MEDIDA_FORA;
      if (a === MEDIDA_SEM || m === MEDIDA_SEM) return MEDIDA_SEM;
      return (a === MEDIDA_SIM && m === MEDIDA_SIM) ? MEDIDA_SIM : MEDIDA_NAO;
    } },

  { chave: 'jejumAdequado', nome: 'Jejum pré-operatório adequado', grupo: 'Processo', tipo: 'processo',
    definicao: 'Tempo entre a última ingestão e o início da anestesia igual ou maior que o mínimo configurado ' +
      'para o tipo de alimento ou líquido informado.',
    formula: 'atendimentos com jejum dentro do mínimo ÷ atendimentos com horário e tipo de ingestão informados × 100',
    medir: function (f, ctx) {
      if (f.pre.jejumTipo === 'Nada por boca') return MEDIDA_SIM;
      var h = ctx.resumo.jejumHoras;
      if (h === null || !f.pre.jejumTipo) return MEDIDA_SEM;
      var liquido = /liquido|leite materno/.test(normalizar(f.pre.jejumTipo));
      var minimo = liquido ? ctx.limiares.jejumLiquidos : ctx.limiares.jejumSolidos;
      return h >= minimo ? MEDIDA_SIM : MEDIDA_NAO;
    } },

  { chave: 'monitorizacaoBnm', nome: 'Monitorização neuromuscular quando há bloqueador', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Monitorização neuromuscular nos atendimentos com uso de bloqueador neuromuscular.',
    formula: 'atendimentos com monitorização ÷ atendimentos com bloqueador e a pergunta respondida × 100',
    elegibilidade: 'Atendimentos com uso de bloqueador neuromuscular.',
    medir: porCampo('processo', 'bnmMonitorizado', elegivelBnm) },

  { chave: 'tofAdequado', nome: 'Relação TOF adequada antes da saída', grupo: 'Processo', tipo: 'processo',
    definicao: 'Último valor da relação TOF igual ou acima do limiar configurado, nos atendimentos com monitorização neuromuscular.',
    formula: 'atendimentos com TOF no limiar ÷ atendimentos com monitorização neuromuscular e TOF medido × 100',
    elegibilidade: 'Atendimentos com monitorização neuromuscular.',
    medir: porNumero(function (f) { return f.processo.tofValor; },
      function (n, lim) { return n >= lim.tof; }, elegivelBnmMonitorizado) },

  { chave: 'profilaxiaNv', nome: 'Profilaxia de náusea e vômito quando indicada', grupo: 'Processo',
    tipo: 'processo',
    definicao: 'Profilaxia de náusea e vômito realizada quando indicada.',
    formula: 'atendimentos com profilaxia realizada ÷ atendimentos com indicação e realização respondida × 100',
    elegibilidade: 'Atendimentos com profilaxia de náusea e vômito indicada.',
    medir: porCampo('srpa', 'profilaxiaNvFeita', elegivelProfilaxiaNv) },

  { chave: 'passagemCuidado', nome: 'Passagem de cuidado registrada', grupo: 'Processo', tipo: 'processo',
    definicao: 'Registro da passagem de cuidado para SRPA ou UTI, com horário e profissionais identificados.',
    formula: 'atendimentos com passagem registrada ÷ atendimentos com a pergunta respondida × 100',
    medir: porCampo('transicao', 'realizada') },

  { chave: 'satisfacaoAplicada', nome: 'Pesquisa de satisfação aplicada', grupo: 'Processo', tipo: 'processo',
    definicao: 'Pesquisa de satisfação do paciente com a experiência anestésica aplicada e registrada.',
    formula: 'atendimentos com pesquisa aplicada ÷ atendimentos com a pergunta respondida × 100',
    medir: porCampo('satisfacao', 'aplicada') }
];

/** Um indicador pela chave. */
function indicadorQualidade(chave) {
  for (var i = 0; i < INDICADORES_QUALIDADE.length; i++) {
    if (INDICADORES_QUALIDADE[i].chave === chave) return INDICADORES_QUALIDADE[i];
  }
  return null;
}

/** Grupos de indicadores, na ordem em que aparecem no catálogo. */
function gruposQualidade() {
  var vistos = {}, saida = [];
  INDICADORES_QUALIDADE.forEach(function (i) {
    if (!vistos[i.grupo]) { vistos[i.grupo] = true; saida.push(i.grupo); }
  });
  return saida;
}

/* ============================================== atendimentos e filtros */

/**
 * Junta ficha + cirurgia num "atendimento", que é a unidade do painel.
 * Ficha sem cirurgia correspondente fica de fora: sem a cirurgia não há
 * data, anestesista nem procedimento para filtrar.
 */
function montarAtendimentosQualidade(fichas, cirurgias) {
  var porId = {};
  (cirurgias || []).forEach(function (c) { porId[txt(c.id)] = c; });
  return (fichas || []).map(function (f) {
    var c = porId[f.idCirurgia];
    if (!c) return null;
    var data = paraData(c.data) || '';
    return {
      ficha: f,
      cirurgia: c,
      data: data,
      mes: data ? data.slice(0, 7) : '',
      anestesista: txt(c.anestesista),
      procedimento: txt(c.procedimento),
      tipo: classificarTipoCirurgia(c.procedimento),
      especialidade: txt(f.atendimento.especialidade),
      unidade: txt(f.atendimento.unidade),
      sala: txt(f.atendimento.sala) || txt(c.sala),
      asa: txt(f.atendimento.asa),
      carater: txt(f.atendimento.carater),
      tecnicas: f.atendimento.tecnicas.slice()
    };
  }).filter(function (a) { return a !== null; });
}

/**
 * Filtra atendimentos. Filtros vazios não filtram.
 * `de` e `ate` são datas 'YYYY-MM-DD'.
 */
function filtrarAtendimentosQualidade(atendimentos, filtros) {
  var f = filtros || {};
  var de = paraData(f.de), ate = paraData(f.ate);
  function casa(valor, alvo) { return vazio(alvo) || mesmoTexto(valor, alvo); }
  return (atendimentos || []).filter(function (a) {
    if (de && (!a.data || a.data < de)) return false;
    if (ate && (!a.data || a.data > ate)) return false;
    if (!casa(a.unidade, f.unidade)) return false;
    if (!casa(a.especialidade, f.especialidade)) return false;
    if (!casa(a.anestesista, f.anestesista)) return false;
    if (!casa(a.asa, f.asa)) return false;
    if (!casa(a.carater, f.carater)) return false;
    if (!vazio(f.tecnica) && !a.tecnicas.some(function (t) { return mesmoTexto(t, f.tecnica); })) return false;
    if (!vazio(f.procedimento) && normalizar(a.procedimento).indexOf(normalizar(f.procedimento)) < 0 &&
        !mesmoTexto(a.tipo, f.procedimento)) return false;
    return true;
  });
}

/* ================================================= cálculo do painel */

function taxaPct(numerador, denominador) {
  return denominador ? Math.round((numerador / denominador) * 1000) / 10 : null;
}

/**
 * Calcula todos os indicadores sobre uma lista de atendimentos.
 * `opcoes.cfg`      configuração clínica (limiares, metas, referências).
 * `opcoes.hoje`     data de referência para as janelas de acompanhamento.
 * `opcoes.serie`    true para incluir a evolução mês a mês (padrão: true).
 * Devolve [{...}] na ordem do catálogo, sem os desativados.
 */
function calcularIndicadoresQualidade(atendimentos, opcoes) {
  opcoes = opcoes || {};
  var cfg = lerConfigQualidade(opcoes.cfg);
  var hoje = paraData(opcoes.hoje) || hojeISO();
  var comSerie = opcoes.serie !== false;
  atendimentos = atendimentos || [];

  // O resumo de cada ficha (jejum, antibiótico) é calculado uma vez só.
  var contexto = atendimentos.map(function (a) {
    return { a: a, ctx: { limiares: cfg.limiares, cirurgia: a.cirurgia, resumo: resumoQualidade(a.ficha, a.cirurgia) } };
  });

  return INDICADORES_QUALIDADE.filter(function (ind) { return !cfg.desativados[ind.chave]; }).map(function (ind) {
    var elegiveis = 0, eventos = 0, respondidos = 0, semInfo = 0, semAcomp = 0;
    var porMes = {};

    contexto.forEach(function (x) {
      var m = ind.medir(x.a.ficha, x.ctx);
      if (m === MEDIDA_FORA) return;
      elegiveis++;

      var mes = x.a.mes;
      if (comSerie && mes) {
        if (!porMes[mes]) porMes[mes] = { mes: mes, elegiveis: 0, eventos: 0, respondidos: 0 };
        porMes[mes].elegiveis++;
      }

      if (m === MEDIDA_SEM) {
        semInfo++;
        if (ind.janela && seguimentoEmAberto(x.a.ficha, ind.janela, hoje, x.a.cirurgia)) semAcomp++;
        return;
      }
      respondidos++;
      if (comSerie && mes) porMes[mes].respondidos++;
      if (m === MEDIDA_SIM) {
        eventos++;
        if (comSerie && mes) porMes[mes].eventos++;
      }
    });

    var serie = Object.keys(porMes).sort().map(function (k) {
      var l = porMes[k];
      return { mes: l.mes, elegiveis: l.elegiveis, eventos: l.eventos, respondidos: l.respondidos,
        taxa: taxaPct(l.eventos, l.respondidos) };
    });

    return {
      chave: ind.chave,
      nome: ind.nome,
      grupo: ind.grupo,
      tipo: ind.tipo,
      definicao: ind.definicao,
      formula: ind.formula,
      elegibilidade: ind.elegibilidade || 'Todos os atendimentos com ficha de qualidade.',
      janela: ind.janela || '',
      elegiveis: elegiveis,
      respondidos: respondidos,
      eventos: eventos,
      semInformacao: semInfo,
      semAcompanhamento: semAcomp,
      taxa: taxaPct(eventos, respondidos),
      cobertura: taxaPct(respondidos, elegiveis),
      serie: serie,
      meta: cfg.metas[ind.chave] === undefined ? null : cfg.metas[ind.chave],
      referencia: cfg.referencias[ind.chave] || null
    };
  });
}

/** Rótulos do resultado de um atendimento num indicador (planilha e conferência). */
var ROTULO_MEDIDA = {};
ROTULO_MEDIDA[MEDIDA_SIM] = 'Sim';
ROTULO_MEDIDA[MEDIDA_NAO] = 'Não';
ROTULO_MEDIDA[MEDIDA_SEM] = 'Sem informação';
ROTULO_MEDIDA[MEDIDA_FORA] = 'Fora da população elegível';

/**
 * Resultado de CADA atendimento em CADA indicador — a linha por trás dos
 * números do painel. Serve a dois usos: a conferência (quais atendimentos
 * compõem o numerador de um indicador?) e a planilha de dados para análise
 * na coordenação. A leitura de uma linha:
 *   'Sim'                        entra no numerador e no denominador;
 *   'Não'                        entra só no denominador;
 *   'Sem informação'             fica fora dos dois — e é contado à parte;
 *   'Fora da população elegível' não entra no indicador.
 *
 * NÃO traz nome, prontuário nem telefone: a ficha é identificada só pelo ID
 * (FQA0001) e a data vira mês. Quem precisa do paciente abre a ficha.
 */
function resultadosPorAtendimento(atendimentos, opcoes) {
  opcoes = opcoes || {};
  var cfg = lerConfigQualidade(opcoes.cfg);
  var indicadores = INDICADORES_QUALIDADE.filter(function (i) { return !cfg.desativados[i.chave]; });
  return (atendimentos || []).map(function (a) {
    var ctx = { limiares: cfg.limiares, cirurgia: a.cirurgia, resumo: resumoQualidade(a.ficha, a.cirurgia) };
    var resultados = {};
    indicadores.forEach(function (ind) { resultados[ind.chave] = ROTULO_MEDIDA[ind.medir(a.ficha, ctx)]; });
    return {
      ficha: a.ficha.id, mes: a.mes, anestesista: a.anestesista, especialidade: a.especialidade,
      unidade: a.unidade, tipoProcedimento: a.tipo, tecnicas: a.tecnicas.join(' + '), asa: a.asa,
      carater: a.carater, situacaoFicha: a.ficha.status, eventos: a.ficha.eventos.length,
      resultados: resultados
    };
  });
}

/** A janela de acompanhamento já venceu e continua sem resposta? */
function seguimentoEmAberto(ficha, janela, hoje, cirurgia) {
  var g = ficha.seguimentos[janela];
  if (!g) return false;
  if (g.situacao === 'Realizado') return false;
  if (g.situacao) return true;   // "Sem informação" / "Perda de seguimento": segue sem acompanhamento
  return janelasVencidas(ficha, hoje, cirurgia).some(function (s) { return s.chave === janela; });
}

/**
 * Satisfação: média e distribuição das notas registradas. Fica fora dos
 * indicadores de taxa porque é uma média, não uma proporção.
 */
function resumoSatisfacaoQualidade(atendimentos) {
  var notas = [], instrumentos = {};
  (atendimentos || []).forEach(function (a) {
    var s = a.ficha.satisfacao;
    if (s.aplicada !== RESPOSTA_SIM) return;
    if (s.instrumento) instrumentos[s.instrumento] = (instrumentos[s.instrumento] || 0) + 1;
    if (s.nota !== null) notas.push(s.nota);
  });
  var media = notas.length ? Math.round((notas.reduce(function (s, n) { return s + n; }, 0) / notas.length) * 10) / 10 : null;
  return {
    respostas: notas.length,
    media: media,
    instrumentos: Object.keys(instrumentos).map(function (k) { return { instrumento: k, respostas: instrumentos[k] }; })
      .sort(function (x, y) { return y.respostas - x.respostas; })
  };
}

/**
 * Comparação entre profissionais para UM indicador, sempre acompanhada do
 * perfil dos pacientes de cada um. O serviço pediu isso explicitamente:
 * taxa sem perfil de risco não é comparação, é ranking enganoso — quem lê o
 * painel precisa ver ASA, caráter e volume ao lado do número.
 */
function comparativoQualidade(atendimentos, chave, opcoes) {
  var ind = indicadorQualidade(chave);
  if (!ind) return [];
  opcoes = opcoes || {};
  var porNome = {};
  (atendimentos || []).forEach(function (a) {
    var nome = a.anestesista || '(sem anestesista)';
    if (!porNome[nome]) porNome[nome] = [];
    porNome[nome].push(a);
  });
  return Object.keys(porNome).sort().map(function (nome) {
    var lista = porNome[nome];
    var linha = calcularIndicadoresQualidade(lista, { cfg: opcoes.cfg, hoje: opcoes.hoje, serie: false })
      .filter(function (i) { return i.chave === chave; })[0];
    var ehAlto = function (a) { return a.asa === 'III' || a.asa === 'IV' || a.asa === 'V' || a.asa === 'VI'; };
    var ehBaixo = function (a) { return a.asa === 'I' || a.asa === 'II'; };
    var asa3mais = lista.filter(ehAlto).length;
    var naoEletivo = lista.filter(function (a) { return a.carater === 'Urgência' || a.carater === 'Emergência'; }).length;

    // Estratificação por risco: a mesma conta, separada em ASA I–II e ASA III+.
    // É o ajuste possível sem inventar modelo — compara semelhante com semelhante.
    function estrato(sub) {
      var l = calcularIndicadoresQualidade(sub, { cfg: opcoes.cfg, hoje: opcoes.hoje, serie: false })
        .filter(function (i) { return i.chave === chave; })[0];
      return { atendimentos: sub.length, respondidos: l ? l.respondidos : 0, eventos: l ? l.eventos : 0,
        taxa: l ? l.taxa : null };
    }
    return {
      anestesista: nome,
      atendimentos: lista.length,
      elegiveis: linha ? linha.elegiveis : 0,
      respondidos: linha ? linha.respondidos : 0,
      eventos: linha ? linha.eventos : 0,
      semInformacao: linha ? linha.semInformacao : 0,
      taxa: linha ? linha.taxa : null,
      // Perfil, para a leitura honesta do número.
      asa3mais: asa3mais,
      estratoBaixo: estrato(lista.filter(ehBaixo)),
      estratoAlto: estrato(lista.filter(ehAlto)),
      semAsa: lista.filter(function (a) { return !ehBaixo(a) && !ehAlto(a); }).length,
      pctAsa3mais: taxaPct(asa3mais, lista.length),
      naoEletivo: naoEletivo,
      pctNaoEletivo: taxaPct(naoEletivo, lista.length)
    };
  });
}

/**
 * Situação de preenchimento do conjunto: quantas fichas estão incompletas e
 * quantos acompanhamentos estão em aberto. É o número que diz se o painel
 * pode ser lido com confiança.
 */
function completudeQualidade(atendimentos, hoje) {
  var ref = paraData(hoje) || hojeISO();
  var incompletas = 0, pendentesSeg = 0, concluidas = 0, revisadas = 0, itens = 0;
  (atendimentos || []).forEach(function (a) {
    var n = totalPendenciasFicha(a.ficha, ref, a.cirurgia);
    itens += n;
    if (n > 0) incompletas++;
    if (seguimentosPendentes(a.ficha, ref, a.cirurgia).length) pendentesSeg++;
    if (a.ficha.status === FICHA_CONCLUIDA) concluidas++;
    if (a.ficha.revisao.revisadoEm) revisadas++;
  });
  return {
    atendimentos: (atendimentos || []).length,
    incompletas: incompletas,
    itensPendentes: itens,
    semAcompanhamento: pendentesSeg,
    concluidas: concluidas,
    revisadas: revisadas
  };
}

/** Valores distintos de um campo dos atendimentos, para montar os filtros. */
function opcoesDeFiltroQualidade(atendimentos, campo) {
  var vistos = {};
  (atendimentos || []).forEach(function (a) {
    var v = txt(a[campo]);
    if (v) vistos[v] = true;
  });
  return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LIMIARES_QUALIDADE_PADRAO: LIMIARES_QUALIDADE_PADRAO,
    INDICADORES_QUALIDADE: INDICADORES_QUALIDADE,
    configQualidadePadrao: configQualidadePadrao,
    lerConfigQualidade: lerConfigQualidade,
    configQualidadeAprovada: configQualidadeAprovada,
    indicadorQualidade: indicadorQualidade,
    gruposQualidade: gruposQualidade,
    montarAtendimentosQualidade: montarAtendimentosQualidade,
    filtrarAtendimentosQualidade: filtrarAtendimentosQualidade,
    calcularIndicadoresQualidade: calcularIndicadoresQualidade,
    seguimentoEmAberto: seguimentoEmAberto,
    resultadosPorAtendimento: resultadosPorAtendimento,
    resumoSatisfacaoQualidade: resumoSatisfacaoQualidade,
    comparativoQualidade: comparativoQualidade,
    completudeQualidade: completudeQualidade,
    opcoesDeFiltroQualidade: opcoesDeFiltroQualidade
  };
}
