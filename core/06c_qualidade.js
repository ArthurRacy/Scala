/**
 * ============================================================================
 * 06C_QUALIDADE — Ficha de indicadores de qualidade e segurança em anestesia
 * ============================================================================
 * Uma ficha por cirurgia, ao lado do boletim anestésico. O boletim é o
 * PRONTUÁRIO da anestesia (o que aconteceu, assinado); a ficha é o registro
 * de QUALIDADE (desfechos, processos e acompanhamento), que alimenta o painel
 * da coordenação. São coisas diferentes e por isso vivem separadas: reabrir
 * um boletim assinado é evento sério; corrigir um dado de qualidade, não.
 *
 * Não é aba da planilha: é dado próprio do sistema (estado.fichasQualidade),
 * como o repasse e o boletim. O formato é FECHADO — `lerFicha` reconstrói a
 * ficha campo a campo. O mesmo filtro serve à gravação vinda da tela
 * (estrito: valor estranho vira erro com o nome do campo) e à importação de
 * backup (tolerante: valor estranho fica de fora).
 *
 * REGRAS QUE O FORMATO GARANTE (pedido do serviço)
 *   1. Nenhuma resposta clínica nasce preenchida. Campo em branco é "não
 *      respondido" e NUNCA é lido como "não houve evento" — por isso as
 *      respostas têm quatro opções explícitas (Sim, Não, Não se aplica,
 *      Não avaliado/sem informação) e o vazio é uma quinta situação.
 *   2. A atribuição de um evento à anestesia é campo SEPARADO (`relacao`),
 *      preenchido por avaliação clínica. Nada aqui presume causalidade.
 *   3. O mesmo tipo de evento pode ser registrado várias vezes no mesmo
 *      atendimento (a lista `eventos` não tem chave única por tipo).
 *   4. O que o anestesista registrou e o que a revisão clínica confirmou
 *      ficam distinguíveis (`origem` e `confirmado` em cada evento).
 *   5. Falta de preenchimento nunca bloqueia: `pendenciasFicha` lista, não
 *      impede.
 *
 * CICLO DE VIDA
 *   Em preenchimento --concluir--> Concluída --reabrir(motivo)--> Em preench.
 * Concluída não trava o acompanhamento: as janelas de 24 h, 48 h e 30 dias
 * continuam podendo ser respondidas (é o que o serviço pediu). O que a
 * conclusão faz é declarar que a parte do centro cirúrgico está fechada.
 * ============================================================================
 */

var FICHA_RASCUNHO = 'Em preenchimento';
var FICHA_CONCLUIDA = 'Concluída';

/**
 * As quatro respostas de evento clínico. O vazio ('') é a ausência de
 * resposta e continua existindo: é ele que a tela mostra ao abrir, e é ele
 * que o painel conta como "sem informação".
 */
var RESPOSTA_SIM = 'Sim';
var RESPOSTA_NAO = 'Não';
var RESPOSTA_NA = 'Não se aplica';
var RESPOSTA_SEM = 'Não avaliado/sem informação';
var RESPOSTAS_QUALIDADE = [RESPOSTA_SIM, RESPOSTA_NAO, RESPOSTA_NA, RESPOSTA_SEM];

/** Etapas do formulário, na ordem do atendimento. */
var ETAPAS_QUALIDADE = [
  { chave: 'identificacao', rotulo: 'Identificação do atendimento' },
  { chave: 'pre',   rotulo: 'Avaliação pré-anestésica' },
  { chave: 'intra', rotulo: 'Período intraoperatório' },
  { chave: 'srpa',  rotulo: 'Recuperação pós-anestésica' },
  { chave: 'seg',   rotulo: 'Acompanhamento (24 h, 48 h e 30 dias)' },
  { chave: 'transicao', rotulo: 'Transição de cuidado e satisfação' }
];

/** Janelas de acompanhamento posterior. */
var SEGUIMENTOS_QUALIDADE = [
  { chave: 'h24', rotulo: '24 horas', horas: 24 },
  { chave: 'h48', rotulo: '48 horas', horas: 48 },
  { chave: 'd30', rotulo: '30 dias',  horas: 720 }
];

/** Situação de uma janela de acompanhamento. Vazio = ainda pendente. */
var SITUACOES_SEGUIMENTO = ['Realizado', 'Sem informação', 'Perda de seguimento'];

/** Listas de escolha. A ficha guarda o TEXTO, não um código (ver 06b). */
var OPCOES_QUALIDADE = {
  vinculo: ['Convênio', 'Particular', 'SUS', 'Outro'],
  carater: ['Eletivo', 'Urgência', 'Emergência'],
  asa: ['I', 'II', 'III', 'IV', 'V', 'VI'],
  destino: ['Enfermaria', 'UTI', 'Alta', 'Outro'],
  tecnicas: ['Geral balanceada', 'Geral venosa total', 'Geral inalatória', 'Raquianestesia', 'Peridural',
    'Raqui + peridural', 'Bloqueio periférico', 'Sedação', 'Local com sedação'],
  gravidade: ['Leve', 'Moderada', 'Grave', 'Ameaça à vida', 'Óbito'],
  // Atribuição à anestesia: campo separado, preenchido por avaliação clínica.
  relacao: ['Não avaliada', 'Não relacionada', 'Improvável', 'Possível', 'Provável', 'Definida'],
  investigacao: ['Não iniciada', 'Em andamento', 'Concluída', 'Não se aplica'],
  origemEvento: ['Anestesista', 'Revisão clínica'],
  confirmacao: ['Confirmado', 'Não confirmado', 'Registro descartado'],
  jejumTipo: ['Sólidos', 'Leite não materno / fórmula', 'Leite materno', 'Líquidos sem resíduo', 'Nada por boca'],
  escalaDor: ['EVA (0–10)', 'EVN (0–10)', 'Escala verbal', 'FLACC', 'Outra'],
  respondente: ['Paciente', 'Acompanhante', 'Não respondeu'],
  destinoPassagem: ['SRPA', 'UTI', 'Enfermaria', 'Alta direta'],
  metodoTof: ['Aceleromiografia', 'Cinemiografia', 'Eletromiografia', 'Estimulação visual/tátil', 'Outro'],
  subtipoNeuro: ['Delirium', 'Disfunção cognitiva', 'AVC', 'Neuropatia periférica', 'Outro'],
  lesaoViaAerea: ['Nenhuma', 'Fratura de dente', 'Lesão labial', 'Lesão de mucosa/faringe', 'Outra'],
  reconhecimento: ['Imediato', 'Tardio'],
  tipoLesaoPosicao: ['Compressão nervosa', 'Lesão de pele/pressão', 'Lesão ocular', 'Lesão articular', 'Outra'],
  dificuldadePrevista: ['Prevista', 'Não prevista']
};

/**
 * CATÁLOGO DE EVENTOS.
 * Cada item vira: uma pergunta de quatro opções em `respostas[chave]` e,
 * quando a resposta for "Sim", um ou mais registros em `eventos`.
 * `campos` são os campos próprios daquele tipo de evento — o formulário
 * mostra só os pertinentes, como pedido.
 *
 * `etapa` diz em que momento do formulário a pergunta aparece.
 * Nenhum item traz classificação normativa: referência (fonte, versão e data)
 * é registrada pela coordenação na configuração clínica, indicador a
 * indicador — ver 09c_qualidade_painel.js e `config.qualidade`.
 */
var EVENTOS_QUALIDADE = [
  /* ---- Mortalidade e morbidade grave ---------------------------------- */
  { chave: 'obito24h', janela: 'h24', rotulo: 'Óbito em até 24 horas', grupo: 'Mortalidade e morbidade grave', etapa: 'seg',
    campos: [] },
  { chave: 'obito48h', janela: 'h48', rotulo: 'Óbito em até 48 horas', grupo: 'Mortalidade e morbidade grave', etapa: 'seg',
    campos: [] },
  { chave: 'obito30d', janela: 'd30', rotulo: 'Óbito em até 30 dias', grupo: 'Mortalidade e morbidade grave', etapa: 'seg',
    campos: [] },
  { chave: 'pcrSala', rotulo: 'Parada cardiorrespiratória na sala cirúrgica',
    grupo: 'Mortalidade e morbidade grave', etapa: 'intra',
    campos: [
      { chave: 'circunstancias', rotulo: 'Circunstâncias', tipo: 'texto', max: 500, largo: true },
      { chave: 'ritmo', rotulo: 'Ritmo inicial', tipo: 'texto', max: 80 },
      { chave: 'duracaoRcp', rotulo: 'Duração da RCP (min)', tipo: 'numero', limite: 'minutos' },
      { chave: 'retorno', rotulo: 'Retorno de circulação espontânea', tipo: 'resposta' }
    ] },
  { chave: 'despertar', janela: 'h24', rotulo: 'Despertar intraoperatório com recordação explícita (suspeita ou confirmado)',
    grupo: 'Mortalidade e morbidade grave', etapa: 'seg', aplicaA: 'geral',
    campos: [
      { chave: 'situacao', rotulo: 'Situação', tipo: 'opcao', opcoes: ['Suspeita', 'Confirmado'] },
      { chave: 'instrumento', rotulo: 'Instrumento usado na entrevista', tipo: 'texto', max: 120 }
    ] },
  { chave: 'disfuncaoNeuro', janela: 'h48', rotulo: 'Disfunção neurológica perioperatória',
    grupo: 'Mortalidade e morbidade grave', etapa: 'seg',
    campos: [
      { chave: 'subtipo', rotulo: 'Tipo', tipo: 'opcao', opcoes: OPCOES_QUALIDADE.subtipoNeuro },
      { chave: 'subtipoOutro', rotulo: 'Qual (se outro)', tipo: 'texto', max: 120 }
    ] },
  { chave: 'viaAereaDificil', rotulo: 'Intubação ou ventilação difícil',
    grupo: 'Mortalidade e morbidade grave', etapa: 'intra', aplicaA: 'geral',
    campos: [
      { chave: 'previsao', rotulo: 'A dificuldade era prevista?', tipo: 'opcao', opcoes: OPCOES_QUALIDADE.dificuldadePrevista },
      { chave: 'tentativas', rotulo: 'Tentativas', tipo: 'numero', limite: 'tentativas' },
      { chave: 'complicacao', rotulo: 'Complicação', tipo: 'opcao', opcoes: OPCOES_QUALIDADE.lesaoViaAerea },
      { chave: 'complicacaoOutra', rotulo: 'Qual (se outra)', tipo: 'texto', max: 120 }
    ] },

  /* ---- Complicações respiratórias -------------------------------------- */
  { chave: 'intubacaoEsofagica', rotulo: 'Intubação esofágica', grupo: 'Complicações respiratórias', etapa: 'intra',
    aplicaA: 'geral',
    campos: [
      { chave: 'reconhecimento', rotulo: 'Reconhecimento', tipo: 'opcao', opcoes: OPCOES_QUALIDADE.reconhecimento },
      { chave: 'comoReconheceu', rotulo: 'Como foi reconhecida', tipo: 'texto', max: 200 }
    ] },
  { chave: 'broncoaspiracao', rotulo: 'Broncoaspiração pulmonar perioperatória',
    grupo: 'Complicações respiratórias', etapa: 'intra', campos: [] },
  { chave: 'reintubacao24h', janela: 'h24', rotulo: 'Reintubação não planejada em até 24 horas',
    grupo: 'Complicações respiratórias', etapa: 'seg', aplicaA: 'geral',
    campos: [{ chave: 'motivo', rotulo: 'Motivo', tipo: 'texto', max: 300, largo: true }] },

  /* ---- Complicações cardiovasculares ----------------------------------- */
  { chave: 'hipertensaoGrave', rotulo: 'Hipertensão grave no intraoperatório',
    grupo: 'Complicações cardiovasculares', etapa: 'intra',
    campos: [{ chave: 'tratamento', rotulo: 'Tratamento', tipo: 'texto', max: 200, largo: true }] },
  { chave: 'isquemiaMiocardio', janela: 'h48', rotulo: 'Isquemia ou infarto do miocárdio perioperatório',
    grupo: 'Complicações cardiovasculares', etapa: 'seg',
    campos: [
      { chave: 'criterio', rotulo: 'Critério diagnóstico', tipo: 'texto', max: 200, largo: true },
      { chave: 'troponina', rotulo: 'Troponina (se dosada)', tipo: 'texto', max: 60 }
    ] },
  { chave: 'vasopressorNaoPlanejado', rotulo: 'Instabilidade hemodinâmica com vasopressor não planejado',
    grupo: 'Complicações cardiovasculares', etapa: 'intra',
    campos: [
      { chave: 'medicamento', rotulo: 'Medicamento', tipo: 'texto', max: 80 },
      { chave: 'motivo', rotulo: 'Motivo', tipo: 'texto', max: 200, largo: true },
      { chave: 'intervencao', rotulo: 'Intervenção realizada', tipo: 'texto', max: 200, largo: true }
    ] },

  /* ---- Outros desfechos clínicos --------------------------------------- */
  { chave: 'bnmResidual', rotulo: 'Bloqueio neuromuscular residual (suspeita ou confirmado)',
    grupo: 'Outros desfechos clínicos', etapa: 'srpa', aplicaA: 'geral',
    campos: [
      { chave: 'situacao', rotulo: 'Situação', tipo: 'opcao', opcoes: ['Suspeita', 'Confirmado'] },
      { chave: 'tof', rotulo: 'Relação TOF no momento', tipo: 'numero', limite: 'tof' }
    ] },
  { chave: 'lesaoCornea', rotulo: 'Lesão de córnea', grupo: 'Outros desfechos clínicos', etapa: 'srpa',
    campos: [{ chave: 'lado', rotulo: 'Lado', tipo: 'opcao', opcoes: ['Direito', 'Esquerdo', 'Bilateral'] }] },
  { chave: 'lesaoPosicionamento', rotulo: 'Lesão relacionada ao posicionamento',
    grupo: 'Outros desfechos clínicos', etapa: 'srpa',
    campos: [
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'opcao', opcoes: OPCOES_QUALIDADE.tipoLesaoPosicao },
      { chave: 'local', rotulo: 'Localização', tipo: 'texto', max: 120 }
    ] },

  /* ---- Transição de cuidado -------------------------------------------- */
  { chave: 'falhaComunicacao', rotulo: 'Falha de comunicação na passagem de cuidado',
    grupo: 'Transição de cuidado', etapa: 'transicao',
    campos: [
      { chave: 'consequencia', rotulo: 'Consequência', tipo: 'texto', max: 300, largo: true },
      { chave: 'providencia', rotulo: 'Providência adotada', tipo: 'texto', max: 300, largo: true }
    ] }
];

/**
 * O que é pertinente à técnica anestésica do atendimento. `aplicaA: 'geral'`
 * marca o que só existe na anestesia geral (via aérea, bloqueador
 * neuromuscular, despertar). Enquanto nenhuma técnica foi escolhida, tudo é
 * pertinente: não dá para esconder o que ainda não se sabe que não se aplica.
 * Sedação, raquianestesia, peridural e bloqueios periféricos não pedem os
 * itens de anestesia geral.
 */
function pertinenteNaFicha(f, aplicaA) {
  if (!aplicaA) return true;
  var tecnicas = (f.atendimento && f.atendimento.tecnicas) || [];
  var outra = f.atendimento && f.atendimento.tecnicaOutra;
  if (!tecnicas.length && !outra) return true;
  if (aplicaA === 'geral') return ehGeralNaFicha(f) || (!tecnicas.length && !!outra);
  return true;
}

/** Eventos da etapa que são pertinentes a esta ficha. */
function eventosPertinentes(f, etapa) {
  return eventosDaEtapa(etapa).filter(function (e) { return pertinenteNaFicha(f, e.aplicaA); });
}

/** Um evento do catálogo pela chave. */
function eventoQualidade(chave) {
  for (var i = 0; i < EVENTOS_QUALIDADE.length; i++) {
    if (EVENTOS_QUALIDADE[i].chave === chave) return EVENTOS_QUALIDADE[i];
  }
  return null;
}

/** Eventos de uma etapa do formulário. */
function eventosDaEtapa(etapa) {
  return EVENTOS_QUALIDADE.filter(function (e) { return e.etapa === etapa; });
}

/**
 * Itens do checklist de passagem de cuidado (informações essenciais
 * transmitidas). Cada um é uma marcação simples: transmitido ou não.
 */
var ITENS_PASSAGEM = [
  { chave: 'identificacao', rotulo: 'Identificação do paciente e procedimento' },
  { chave: 'antecedentes', rotulo: 'Antecedentes, alergias e comorbidades' },
  { chave: 'tecnica', rotulo: 'Técnica anestésica e via aérea' },
  { chave: 'intercorrencias', rotulo: 'Intercorrências do intraoperatório' },
  { chave: 'fluidos', rotulo: 'Fluidos, sangramento e diurese' },
  { chave: 'farmacos', rotulo: 'Fármacos administrados e horários' },
  { chave: 'analgesia', rotulo: 'Plano de analgesia' },
  { chave: 'pendencias', rotulo: 'Pendências e sinais de alerta' }
];

/**
 * Faixas aceitas. NÃO são alarmes clínicos: só barram erro de digitação.
 * Os limiares CLÍNICOS (SpO₂ < 90%, PAM < 65 mmHg, T < 36 °C, EVA > 7,
 * TOF ≥ 0,9, jejum) são configuráveis pela coordenação — ver
 * LIMIARES_QUALIDADE_PADRAO em 09c_qualidade_painel.js.
 */
var LIMITES_QUALIDADE = {
  idade:      { rotulo: 'Idade', min: 0, max: 120, unidade: 'anos' },
  peso:       { rotulo: 'Peso', min: 0.3, max: 400, unidade: 'kg', casas: 1 },
  altura:     { rotulo: 'Altura', min: 30, max: 250, unidade: 'cm' },
  spo2:       { rotulo: 'SpO₂ mínima', min: 20, max: 100, unidade: '%' },
  pam:        { rotulo: 'PAM mínima', min: 10, max: 200, unidade: 'mmHg' },
  pas:        { rotulo: 'PA sistólica máxima', min: 40, max: 320, unidade: 'mmHg' },
  minutos:    { rotulo: 'Tempo acumulado', min: 0, max: 1440, unidade: 'min' },
  temperatura:{ rotulo: 'Temperatura', min: 25, max: 45, unidade: '°C', casas: 1 },
  dor:        { rotulo: 'Pontuação de dor', min: 0, max: 10, casas: 1 },
  tof:        { rotulo: 'Relação TOF', min: 0, max: 1.5, casas: 2 },
  tentativas: { rotulo: 'Tentativas', min: 1, max: 10 },
  nota:       { rotulo: 'Nota de satisfação', min: 0, max: 10, casas: 1 },
  // Usados pelos registros de estrutura (06d), que leem pelo mesmo leitor.
  anestesiologistas: { rotulo: 'Anestesiologistas', min: 0, max: 200 },
  salas:         { rotulo: 'Salas em funcionamento', min: 0, max: 100 },
  participantes: { rotulo: 'Participantes', min: 0, max: 500 },
  horas:         { rotulo: 'Carga horária', min: 0, max: 100, unidade: 'h', casas: 1 }
};

/** Listas da ficha e o máximo de linhas de cada uma. */
var LISTAS_QUALIDADE = { eventos: 80 };

/** Quantas entradas de histórico a ficha guarda (as mais recentes). */
var MAX_HISTORICO_QUALIDADE = 300;

/* ================================================================ leitura */

function ehObjetoQ(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function semValorQ(v) { return v === null || v === undefined || (typeof v === 'string' && txt(v) === ''); }

function numeroBRQ(n) { return String(n).replace('.', ','); }

/**
 * Leitor de campos da ficha. Estrito (gravação vinda da tela): valor que não
 * se entende vira erro com o nome do campo. Tolerante (backup): vira vazio.
 */
function leitorQualidade(estrito) {
  var erros = [];
  function falha(msg, campo) { if (estrito) erros.push({ campo: campo || 'ficha', msg: msg }); }

  var L = {
    erros: erros,

    texto: function (v, max) {
      if (typeof v !== 'string' && typeof v !== 'number') return '';
      return txt(v).slice(0, max || 200);
    },

    numero: function (v, chave, rotulo) {
      var lim = LIMITES_QUALIDADE[chave];
      if (semValorQ(v)) return null;
      var n = typeof v === 'number' ? (isFinite(v) ? v : null) : (typeof v === 'string' ? paraNumero(v) : null);
      if (n === null) { falha((rotulo || lim.rotulo) + ': "' + txt(v) + '" não é um número.'); return null; }
      var fator = Math.pow(10, lim.casas || 0);
      n = Math.round(n * fator) / fator;
      if (n < lim.min || n > lim.max) {
        falha((rotulo || lim.rotulo) + ' ' + numeroBRQ(n) + ' fora da faixa aceita (' + numeroBRQ(lim.min) + ' a ' +
          numeroBRQ(lim.max) + (lim.unidade ? ' ' + lim.unidade : '') + ').');
        return null;
      }
      return n;
    },

    hora: function (v, rotulo) {
      if (semValorQ(v)) return '';
      var h = typeof v === 'string' || typeof v === 'number' ? paraHora(v) : '';
      if (!h) falha(rotulo + ': horário inválido ("' + txt(v) + '").');
      return h;
    },

    data: function (v, rotulo) {
      if (semValorQ(v)) return '';
      var d = paraData(v);
      if (!d) falha(rotulo + ': data inválida ("' + txt(v) + '").');
      return d || '';
    },

    opcao: function (v, lista, rotulo) {
      if (semValorQ(v)) return '';
      var achado = typeof v === 'string' ? lista.filter(function (o) { return mesmoTexto(o, v); })[0] : null;
      if (!achado) falha(rotulo + ': "' + txt(v) + '" não é uma opção válida.');
      return achado || '';
    },

    /**
     * Resposta de evento clínico. O vazio é preservado: campo em branco NÃO
     * é "não houve evento", e nada aqui escolhe uma opção por conta própria.
     */
    resposta: function (v, rotulo) {
      return L.opcao(v, RESPOSTAS_QUALIDADE, rotulo || 'Resposta');
    },

    sim: function (v) { return v === true || (typeof v === 'string' && ehSim(v)); },

    escolhas: function (v, max) {
      var vistos = {};
      return (Array.isArray(v) ? v : [])
        .filter(function (x) { return typeof x === 'string' && txt(x) !== ''; })
        .map(function (x) { return txt(x).slice(0, 80); })
        .filter(function (x) { var k = normalizar(x); if (vistos[k]) return false; vistos[k] = true; return true; })
        .slice(0, max || 20);
    }
  };
  return L;
}

/** Campos próprios de um tipo de evento, lidos conforme o catálogo. */
function lerDadosDoEvento(L, tipo, bruto) {
  var def = eventoQualidade(tipo);
  var saida = {};
  if (!def) return saida;
  bruto = ehObjetoQ(bruto) ? bruto : {};
  def.campos.forEach(function (c) {
    var v = bruto[c.chave];
    if (c.tipo === 'numero') saida[c.chave] = L.numero(v, c.limite, c.rotulo);
    else if (c.tipo === 'opcao') saida[c.chave] = L.opcao(v, c.opcoes, c.rotulo);
    else if (c.tipo === 'resposta') saida[c.chave] = L.resposta(v, c.rotulo);
    else if (c.tipo === 'hora') saida[c.chave] = L.hora(v, c.rotulo);
    else saida[c.chave] = L.texto(v, c.max || 200);
  });
  return saida;
}

/**
 * Reconstrói uma ficha campo a campo. Devolve { ficha, erros }.
 * `estrito`: erros de leitura aparecem (gravação); sem ele, somem (backup).
 * É idempotente: ler o que já foi lido dá a mesma ficha.
 */
function lerFicha(f, estrito) {
  f = ehObjetoQ(f) ? f : {};
  var L = leitorQualidade(estrito);
  function obj(v) { return ehObjetoQ(v) ? v : {}; }

  var at = obj(f.atendimento), pre = obj(f.pre), pr = obj(f.processo), intra = obj(f.intra),
      srpa = obj(f.srpa), tr = obj(f.transicao), sat = obj(f.satisfacao), rev = obj(f.revisao);

  var n = {
    id: L.texto(f.id, 20),
    uid: L.texto(f.uid, 40),
    idCirurgia: L.texto(f.idCirurgia, 20),
    status: f.status === FICHA_CONCLUIDA ? FICHA_CONCLUIDA : FICHA_RASCUNHO,
    versao: Math.max(1, Math.min(999, Math.floor(Number(f.versao)) || 1)),
    criadoEm: L.texto(f.criadoEm, 19),
    criadoPor: L.texto(f.criadoPor, 80),
    atualizadoEm: L.texto(f.atualizadoEm, 19),
    atualizadoPor: L.texto(f.atualizadoPor, 80),
    concluidaEm: L.texto(f.concluidaEm, 19),
    concluidaPor: L.texto(f.concluidaPor, 80),

    /* ---- 1. Identificação do atendimento ------------------------------ */
    atendimento: {
      prontuario: L.texto(at.prontuario, 40),
      vinculo: L.opcao(at.vinculo, OPCOES_QUALIDADE.vinculo, 'Vínculo'),
      convenio: L.texto(at.convenio, 80),
      especialidade: L.texto(at.especialidade, 80),
      unidade: L.texto(at.unidade, 80),
      sala: L.texto(at.sala, 40),
      carater: L.opcao(at.carater, OPCOES_QUALIDADE.carater, 'Caráter do procedimento'),
      idade: L.numero(at.idade, 'idade'),
      peso: L.numero(at.peso, 'peso'),
      altura: L.numero(at.altura, 'altura'),
      asa: L.opcao(at.asa, OPCOES_QUALIDADE.asa, 'ASA'),
      tecnicas: L.escolhas(at.tecnicas, 12),
      tecnicaOutra: L.texto(at.tecnicaOutra, 200),
      inicioAnestesia: L.hora(at.inicioAnestesia, 'Início da anestesia'),
      fimAnestesia: L.hora(at.fimAnestesia, 'Término da anestesia'),
      entradaSrpa: L.hora(at.entradaSrpa, 'Entrada na SRPA'),
      saidaSrpa: L.hora(at.saidaSrpa, 'Saída da SRPA'),
      destino: L.opcao(at.destino, OPCOES_QUALIDADE.destino, 'Destino após o procedimento'),
      destinoOutro: L.texto(at.destinoOutro, 120)
    },

    /* ---- 2/4. Avaliação pré-anestésica e processos de entrada --------- */
    pre: {
      avaliacaoDocumentada: L.resposta(pre.avaliacaoDocumentada, 'Avaliação pré-anestésica documentada'),
      avaliacaoCompleta: L.resposta(pre.avaliacaoCompleta, 'Avaliação pré-anestésica completa'),
      jejumData: L.data(pre.jejumData, 'Data da última ingestão'),
      jejumHora: L.hora(pre.jejumHora, 'Horário da última ingestão'),
      jejumTipo: L.opcao(pre.jejumTipo, OPCOES_QUALIDADE.jejumTipo, 'Tipo de alimento ou líquido'),
      viaAereaAvaliada: L.resposta(pre.viaAereaAvaliada, 'Avaliação de via aérea'),
      viaAereaDificilPrevista: L.resposta(pre.viaAereaDificilPrevista, 'Via aérea difícil prevista'),
      protocoloViaAerea: L.resposta(pre.protocoloViaAerea, 'Adesão ao protocolo de via aérea difícil'),
      carrinhoDisponivel: L.resposta(pre.carrinhoDisponivel, 'Carrinho de via aérea difícil disponível'),
      carrinhoChecado: L.resposta(pre.carrinhoChecado, 'Carrinho de via aérea difícil checado'),
      obs: L.texto(pre.obs, 1000)
    },

    /* ---- 4. Indicadores de processo ----------------------------------- */
    processo: {
      checklistRealizado: L.resposta(pr.checklistRealizado, 'Checklist de segurança cirúrgica'),
      checklistEntrada: L.resposta(pr.checklistEntrada, 'Checklist — entrada'),
      checklistPausa: L.resposta(pr.checklistPausa, 'Checklist — pausa cirúrgica'),
      checklistSaida: L.resposta(pr.checklistSaida, 'Checklist — saída'),
      checklistCompleto: L.resposta(pr.checklistCompleto, 'Checklist completo'),
      checklistPendencias: L.texto(pr.checklistPendencias, 500),
      capnografiaIndicada: L.resposta(pr.capnografiaIndicada, 'Capnografia indicada'),
      capnografiaUsada: L.resposta(pr.capnografiaUsada, 'Capnografia contínua utilizada'),
      capnografiaMotivo: L.texto(pr.capnografiaMotivo, 300),
      atbIndicada: L.resposta(pr.atbIndicada, 'Profilaxia antibiótica indicada'),
      atbNome: L.texto(pr.atbNome, 120),
      atbDose: L.texto(pr.atbDose, 60),
      atbHora: L.hora(pr.atbHora, 'Horário da profilaxia antibiótica'),
      incisaoHora: L.hora(pr.incisaoHora, 'Horário da incisão'),
      atbRedose: L.resposta(pr.atbRedose, 'Redose de antibiótico'),
      atbRedoseHora: L.hora(pr.atbRedoseHora, 'Horário da redose'),
      profundidadeIndicada: L.resposta(pr.profundidadeIndicada, 'Monitorização de profundidade indicada'),
      profundidadeUsada: L.resposta(pr.profundidadeUsada, 'Monitorização de profundidade utilizada'),
      profundidadeDispositivo: L.texto(pr.profundidadeDispositivo, 80),
      aquecimentoAtivo: L.resposta(pr.aquecimentoAtivo, 'Aquecimento ativo'),
      monitorTemperatura: L.resposta(pr.monitorTemperatura, 'Monitorização de temperatura'),
      bnmUsado: L.resposta(pr.bnmUsado, 'Uso de bloqueador neuromuscular'),
      bnmMonitorizado: L.resposta(pr.bnmMonitorizado, 'Monitorização neuromuscular'),
      bnmMetodo: L.opcao(pr.bnmMetodo, OPCOES_QUALIDADE.metodoTof, 'Método de monitorização neuromuscular'),
      tofValor: L.numero(pr.tofValor, 'tof', 'Relação TOF'),
      tofHora: L.hora(pr.tofHora, 'Momento da medição do TOF'),
      bnmRevertido: L.resposta(pr.bnmRevertido, 'Reversão do bloqueio neuromuscular'),
      bnmRevMedicamento: L.texto(pr.bnmRevMedicamento, 80),
      bnmRevDose: L.texto(pr.bnmRevDose, 60),
      bnmRevHora: L.hora(pr.bnmRevHora, 'Horário da reversão'),
      obs: L.texto(pr.obs, 1000)
    },

    /* ---- 3. Medidas do intraoperatório -------------------------------- */
    intra: {
      intubacao: L.resposta(intra.intubacao, 'Intubação traqueal'),
      spo2Minima: L.numero(intra.spo2Minima, 'spo2'),
      minutosSpo2Abaixo: L.numero(intra.minutosSpo2Abaixo, 'minutos', 'Tempo com SpO₂ abaixo do limiar'),
      pamMinima: L.numero(intra.pamMinima, 'pam'),
      minutosPamAbaixo: L.numero(intra.minutosPamAbaixo, 'minutos', 'Tempo com PAM abaixo do limiar'),
      pasMaxima: L.numero(intra.pasMaxima, 'pas'),
      obs: L.texto(intra.obs, 1000)
    },

    /* ---- 3. Recuperação pós-anestésica -------------------------------- */
    srpa: {
      temperaturaChegada: L.numero(srpa.temperaturaChegada, 'temperatura', 'Temperatura na chegada à SRPA'),
      nausea: L.resposta(srpa.nausea, 'Náusea pós-operatória'),
      nauseaHora: L.hora(srpa.nauseaHora, 'Horário da avaliação de náusea'),
      vomito: L.resposta(srpa.vomito, 'Vômito pós-operatório'),
      vomitoHora: L.hora(srpa.vomitoHora, 'Horário da avaliação de vômito'),
      tratamentoNv: L.texto(srpa.tratamentoNv, 300),
      profilaxiaNvIndicada: L.resposta(srpa.profilaxiaNvIndicada, 'Profilaxia de náusea e vômito indicada'),
      profilaxiaNvFeita: L.resposta(srpa.profilaxiaNvFeita, 'Profilaxia de náusea e vômito realizada'),
      profilaxiaNvMedicamentos: L.texto(srpa.profilaxiaNvMedicamentos, 300),
      profilaxiaNvHorarios: L.texto(srpa.profilaxiaNvHorarios, 200),
      dorEscala: L.opcao(srpa.dorEscala, OPCOES_QUALIDADE.escalaDor, 'Escala de dor'),
      dorPontuacao: L.numero(srpa.dorPontuacao, 'dor', 'Pontuação de dor'),
      dorHora: L.hora(srpa.dorHora, 'Horário da avaliação de dor'),
      dorTratamento: L.texto(srpa.dorTratamento, 300),
      dorReavaliacao: L.numero(srpa.dorReavaliacao, 'dor', 'Pontuação na reavaliação de dor'),
      dorReavaliacaoHora: L.hora(srpa.dorReavaliacaoHora, 'Horário da reavaliação de dor'),
      obs: L.texto(srpa.obs, 1000)
    },

    /* ---- 3. Respostas de evento (uma por item do catálogo) ------------ */
    respostas: {},

    /* ---- 3. Eventos registrados --------------------------------------- */
    eventos: [],

    /* ---- 7. Acompanhamento posterior ---------------------------------- */
    seguimentos: {},

    /* ---- 6. Transição de cuidado -------------------------------------- */
    transicao: {
      realizada: L.resposta(tr.realizada, 'Passagem de cuidado registrada'),
      destino: L.opcao(tr.destino, OPCOES_QUALIDADE.destinoPassagem, 'Destino da passagem'),
      hora: L.hora(tr.hora, 'Horário da passagem de cuidado'),
      transmitidoPor: L.texto(tr.transmitidoPor, 120),
      recebidoPor: L.texto(tr.recebidoPor, 120),
      itens: {},
      obs: L.texto(tr.obs, 500)
    },

    /* ---- 6. Satisfação ------------------------------------------------ */
    satisfacao: {
      aplicada: L.resposta(sat.aplicada, 'Pesquisa de satisfação aplicada'),
      instrumento: L.texto(sat.instrumento, 120),
      escala: L.texto(sat.escala, 80),
      data: L.data(sat.data, 'Data da pesquisa de satisfação'),
      respondente: L.opcao(sat.respondente, OPCOES_QUALIDADE.respondente, 'Respondente'),
      nota: L.numero(sat.nota, 'nota'),
      comentario: L.texto(sat.comentario, 1000)
    },

    /* ---- 7. Revisão clínica ------------------------------------------- */
    revisao: {
      revisadoPor: L.texto(rev.revisadoPor, 120),
      revisadoEm: L.texto(rev.revisadoEm, 19),
      parecer: L.texto(rev.parecer, 2000)
    },

    historico: []
  };

  EVENTOS_QUALIDADE.forEach(function (e) {
    n.respostas[e.chave] = L.resposta(ehObjetoQ(f.respostas) ? f.respostas[e.chave] : '', e.rotulo);
  });

  ITENS_PASSAGEM.forEach(function (i) {
    var itens = ehObjetoQ(tr.itens) ? tr.itens : {};
    n.transicao.itens[i.chave] = L.sim(itens[i.chave]);
  });

  SEGUIMENTOS_QUALIDADE.forEach(function (s) {
    var g = obj(ehObjetoQ(f.seguimentos) ? f.seguimentos[s.chave] : null);
    n.seguimentos[s.chave] = {
      situacao: L.opcao(g.situacao, SITUACOES_SEGUIMENTO, 'Acompanhamento de ' + s.rotulo),
      data: L.data(g.data, 'Data do acompanhamento de ' + s.rotulo),
      hora: L.hora(g.hora, 'Horário do acompanhamento de ' + s.rotulo),
      por: L.texto(g.por, 120),
      justificativa: L.texto(g.justificativa, 500),
      obs: L.texto(g.obs, 1000)
    };
  });

  n.eventos = (Array.isArray(f.eventos) ? f.eventos : [])
    .filter(ehObjetoQ)
    .slice(0, LISTAS_QUALIDADE.eventos)
    .map(function (ev) {
      var tipo = typeof ev.tipo === 'string' && eventoQualidade(ev.tipo) ? ev.tipo : '';
      if (!tipo && estrito) L.erros.push({ campo: 'eventos', msg: 'Tipo de evento desconhecido: "' + txt(ev.tipo) + '".' });
      return {
        tipo: tipo,
        data: L.data(ev.data, 'Data do evento'),
        hora: L.hora(ev.hora, 'Horário do evento'),
        descricao: L.texto(ev.descricao, 1000),
        gravidade: L.opcao(ev.gravidade, OPCOES_QUALIDADE.gravidade, 'Gravidade'),
        conduta: L.texto(ev.conduta, 1000),
        evolucao: L.texto(ev.evolucao, 1000),
        // Campo SEPARADO: a atribuição à anestesia é avaliação clínica.
        relacao: L.opcao(ev.relacao, OPCOES_QUALIDADE.relacao, 'Relação com a anestesia'),
        investigacao: L.opcao(ev.investigacao, OPCOES_QUALIDADE.investigacao, 'Situação da investigação'),
        dados: lerDadosDoEvento(L, tipo, ev.dados),
        origem: L.opcao(ev.origem, OPCOES_QUALIDADE.origemEvento, 'Origem do registro') || OPCOES_QUALIDADE.origemEvento[0],
        confirmado: L.opcao(ev.confirmado, OPCOES_QUALIDADE.confirmacao, 'Confirmação na revisão'),
        confirmadoPor: L.texto(ev.confirmadoPor, 120),
        confirmadoEm: L.texto(ev.confirmadoEm, 19),
        registradoEm: L.texto(ev.registradoEm, 19),
        registradoPor: L.texto(ev.registradoPor, 80)
      };
    })
    .filter(function (ev) { return !!ev.tipo; });

  n.historico = (Array.isArray(f.historico) ? f.historico : [])
    .filter(ehObjetoQ)
    .slice(-MAX_HISTORICO_QUALIDADE)
    .map(function (h) {
      return {
        quando: L.texto(h.quando, 19),
        quem: L.texto(h.quem, 80),
        etapa: L.texto(h.etapa, 40),
        campo: L.texto(h.campo, 120),
        de: L.texto(h.de, 200),
        para: L.texto(h.para, 200)
      };
    });

  ordenarEventosFicha(n);
  return { ficha: n, erros: L.erros };
}

/** Ficha de fonte externa (backup), sem erro: o que não se entende fica de fora. */
function normalizarFicha(f) { return lerFicha(f, false).ficha; }

/** Lista de fichas de um backup: só o que tem cara de ficha passa. */
function sanearFichasQualidade(lista) {
  return (Array.isArray(lista) ? lista : []).filter(function (f) {
    return ehObjetoQ(f) && !vazio(f.idCirurgia);
  }).map(normalizarFicha);
}

/** Eventos em ordem de data e horário (sem data, no fim). */
function ordenarEventosFicha(f) {
  f.eventos = f.eventos.map(function (e, i) { return { e: e, i: i }; })
    .sort(function (a, b) {
      var da = a.e.data || '9999-99-99', db = b.e.data || '9999-99-99';
      if (da !== db) return da < db ? -1 : 1;
      var ha = a.e.hora || '99:99', hb = b.e.hora || '99:99';
      if (ha !== hb) return ha < hb ? -1 : 1;
      return a.i - b.i;
    })
    .map(function (x) { return x.e; });
  return f;
}

/* ============================================================== cálculos */

function ehGeralNaFicha(f) {
  return (f.atendimento.tecnicas || []).some(function (t) { return /^geral/i.test(normalizar(t)); });
}

/**
 * Intervalos calculados a partir dos horários informados (pedido explícito
 * do serviço). Atravessar a meia-noite é tratado como no boletim: tudo é
 * medido a partir da referência do atendimento (o início da anestesia).
 */
function resumoQualidade(f, cirurgia) {
  var at = f.atendimento;
  var ref = horaParaMinutos(at.inicioAnestesia);
  if (ref === null) ref = horaParaMinutos(at.entradaSrpa);

  function dif(de, ate) {
    var a = minutoNoBoletim(ref, de), z = minutoNoBoletim(ref, ate);
    return a === null || z === null ? null : z - a;
  }

  var dataCirurgia = paraData(cirurgia && cirurgia.data) || '';
  var jejum = null;
  if (f.pre.jejumData && f.pre.jejumHora && dataCirurgia && at.inicioAnestesia) {
    var dias = diasEntre(f.pre.jejumData, dataCirurgia);
    if (dias !== null && dias >= 0 && dias <= 30) {
      var minutos = dias * 1440 + horaParaMinutos(at.inicioAnestesia) - horaParaMinutos(f.pre.jejumHora);
      if (minutos >= 0) jejum = Math.round(minutos / 6) / 10;   // horas, 1 casa
    }
  }

  return {
    duracaoAnestesia: dif(at.inicioAnestesia, at.fimAnestesia),
    permanenciaSrpa: dif(at.entradaSrpa, at.saidaSrpa),
    // Minutos entre a administração do antibiótico e a incisão (positivo = antes da incisão).
    antibioticoAntesDaIncisao: (function () {
      var a = minutoNoBoletim(ref, f.processo.atbHora), i = minutoNoBoletim(ref, f.processo.incisaoHora);
      return a === null || i === null ? null : i - a;
    })(),
    jejumHoras: jejum,
    imc: at.peso !== null && at.altura ? Math.round((at.peso / Math.pow(at.altura / 100, 2)) * 10) / 10 : null,
    eventos: f.eventos.length,
    eventosGraves: f.eventos.filter(function (e) {
      return e.gravidade === 'Grave' || e.gravidade === 'Ameaça à vida' || e.gravidade === 'Óbito';
    }).length
  };
}

/* ============================================================= validação */

/**
 * Coerência da ficha já lida: horários em ordem, justificativa presente
 * quando a janela foi fechada sem dado, PA coerente. Devolve
 * { ok, erros, avisos }. Só o que é ERRO impede gravar.
 */
function validarFicha(f) {
  var erros = [], avisos = [];
  function erro(campo, msg) { erros.push({ campo: campo, msg: msg }); }
  function aviso(campo, msg) { avisos.push({ campo: campo, msg: msg }); }

  var at = f.atendimento;
  var ref = horaParaMinutos(at.inicioAnestesia);

  if (at.inicioAnestesia && at.fimAnestesia) {
    var d = minutoNoBoletim(ref, at.fimAnestesia) - minutoNoBoletim(ref, at.inicioAnestesia);
    if (d < 0 || d > CONFIG.DURACAO_MAXIMA_HORAS * 60) {
      erro('atendimento.fimAnestesia', 'O término da anestesia (' + at.fimAnestesia + ') não fecha com o início (' +
        at.inicioAnestesia + '). Se passou da meia-noite, confira os horários digitados.');
    }
  }
  if (at.entradaSrpa && at.saidaSrpa) {
    var s = minutoNoBoletim(ref, at.saidaSrpa) - minutoNoBoletim(ref, at.entradaSrpa);
    if (s < 0) erro('atendimento.saidaSrpa', 'A saída da SRPA (' + at.saidaSrpa + ') vem antes da entrada (' + at.entradaSrpa + ').');
  }
  if (at.destino === 'Outro' && !at.destinoOutro) {
    erro('atendimento.destinoOutro', 'Destino "Outro": descreva qual.');
  }

  if (f.intra.pasMaxima !== null && f.intra.pamMinima !== null && f.intra.pamMinima > f.intra.pasMaxima) {
    erro('intra.pamMinima', 'A PAM mínima (' + f.intra.pamMinima + ') não pode ser maior que a PA sistólica máxima (' +
      f.intra.pasMaxima + ').');
  }

  f.eventos.forEach(function (e, i) {
    var def = eventoQualidade(e.tipo);
    var nome = def ? def.rotulo : 'Evento';
    if (!e.descricao) erro('eventos', nome + ': falta a descrição.');
    if (!e.data && !e.hora) aviso('eventos', nome + ': sem data nem horário.');
    if (e.confirmado && !e.confirmadoPor) {
      erro('eventos', nome + ': a confirmação da revisão precisa dizer quem confirmou.');
    }
    if (i > LISTAS_QUALIDADE.eventos) erro('eventos', 'Limite de eventos atingido.');
  });

  SEGUIMENTOS_QUALIDADE.forEach(function (s) {
    var g = f.seguimentos[s.chave];
    if ((g.situacao === 'Sem informação' || g.situacao === 'Perda de seguimento') && !g.justificativa) {
      erro('seguimentos.' + s.chave, 'Acompanhamento de ' + s.rotulo + ' marcado como "' + g.situacao +
        '": explique o motivo (fica no registro).');
    }
    if (g.situacao === 'Realizado' && !g.data) {
      erro('seguimentos.' + s.chave, 'Acompanhamento de ' + s.rotulo + ' realizado: informe a data.');
    }
  });

  if (f.satisfacao.aplicada === RESPOSTA_SIM && !f.satisfacao.instrumento) {
    aviso('satisfacao.instrumento', 'Pesquisa de satisfação aplicada sem instrumento identificado.');
  }

  // Resposta "Sim" sem nenhum evento detalhado é PENDÊNCIA, não erro: o
  // atendimento não pode parar por causa do formulário.
  EVENTOS_QUALIDADE.forEach(function (e) {
    if (f.respostas[e.chave] === RESPOSTA_SIM && !f.eventos.some(function (x) { return x.tipo === e.chave; })) {
      aviso('respostas.' + e.chave, e.rotulo + ': marcado como "Sim" e ainda sem o detalhamento do evento.');
    }
  });

  return { ok: erros.length === 0, erros: erros, avisos: avisos };
}

/* ============================================================ pendências */

/**
 * O que falta na ficha, por etapa: [{ etapa, rotulo, itens:[texto] }].
 * Nada aqui bloqueia — é a lista que a tela e o painel mostram como
 * "registro incompleto".
 */
function pendenciasFicha(f, hoje, cirurgia) {
  var at = f.atendimento;
  var porEtapa = {};
  function falta(etapa, texto) {
    if (!porEtapa[etapa]) porEtapa[etapa] = [];
    porEtapa[etapa].push(texto);
  }
  function respondido(v) { return v === RESPOSTA_SIM || v === RESPOSTA_NAO || v === RESPOSTA_NA; }

  if (!at.prontuario) falta('identificacao', 'Número do prontuário');
  if (!at.vinculo) falta('identificacao', 'Convênio ou particular');
  if (!at.especialidade) falta('identificacao', 'Especialidade');
  if (!at.sala) falta('identificacao', 'Sala');
  if (!at.carater) falta('identificacao', 'Caráter do procedimento');
  if (!at.asa) falta('identificacao', 'Classificação ASA');
  if (at.peso === null) falta('identificacao', 'Peso');
  if (!at.tecnicas.length && !at.tecnicaOutra) falta('identificacao', 'Técnica anestésica');
  if (!at.inicioAnestesia || !at.fimAnestesia) falta('identificacao', 'Início e término da anestesia');
  if (!at.destino) falta('identificacao', 'Destino após o procedimento');

  if (!respondido(f.pre.avaliacaoDocumentada)) falta('pre', 'Avaliação pré-anestésica documentada');
  if (!f.pre.jejumHora) falta('pre', 'Horário da última ingestão');
  if (!respondido(f.pre.viaAereaAvaliada)) falta('pre', 'Avaliação de via aérea');

  if (!respondido(f.processo.checklistRealizado)) falta('intra', 'Checklist de segurança cirúrgica');
  if (!respondido(f.processo.capnografiaIndicada)) falta('intra', 'Capnografia — indicação');
  if (!respondido(f.processo.atbIndicada)) falta('intra', 'Profilaxia antibiótica — indicação');
  // Bloqueador neuromuscular é da anestesia geral: fora dela, não se cobra.
  if (pertinenteNaFicha(f, 'geral')) {
    if (!respondido(f.processo.bnmUsado)) falta('intra', 'Uso de bloqueador neuromuscular');
    if (f.processo.bnmUsado === RESPOSTA_SIM && !respondido(f.processo.bnmMonitorizado)) {
      falta('intra', 'Monitorização neuromuscular');
    }
  }
  eventosPertinentes(f, 'intra').forEach(function (e) {
    if (!respondido(f.respostas[e.chave])) falta('intra', e.rotulo);
  });

  if (f.srpa.temperaturaChegada === null) falta('srpa', 'Temperatura na chegada à SRPA');
  if (!respondido(f.srpa.nausea)) falta('srpa', 'Náusea pós-operatória');
  if (!respondido(f.srpa.vomito)) falta('srpa', 'Vômito pós-operatório');
  if (f.srpa.dorPontuacao === null) falta('srpa', 'Dor na SRPA');
  eventosPertinentes(f, 'srpa').forEach(function (e) {
    if (!respondido(f.respostas[e.chave])) falta('srpa', e.rotulo);
  });

  janelasVencidas(f, hoje, cirurgia).forEach(function (j) {
    if (!f.seguimentos[j.chave].situacao) falta('seg', 'Acompanhamento de ' + j.rotulo);
  });
  // Janela marcada como realizada: as perguntas dela têm de ter resposta. Sem isto o dado some como
  // "sem informação" no painel sem ninguém ter sido avisado.
  SEGUIMENTOS_QUALIDADE.forEach(function (j) {
    if (f.seguimentos[j.chave].situacao !== 'Realizado') return;
    EVENTOS_QUALIDADE.filter(function (e) { return e.janela === j.chave && pertinenteNaFicha(f, e.aplicaA); })
      .forEach(function (e) {
        if (!respondido(f.respostas[e.chave])) falta('seg', e.rotulo + ' (acompanhamento de ' + j.rotulo + ' realizado)');
      });
  });

  if (!respondido(f.transicao.realizada)) falta('transicao', 'Registro de passagem de cuidado');
  if (!respondido(f.satisfacao.aplicada)) falta('transicao', 'Pesquisa de satisfação');

  return ETAPAS_QUALIDADE.filter(function (e) { return porEtapa[e.chave]; }).map(function (e) {
    return { etapa: e.chave, rotulo: e.rotulo, itens: porEtapa[e.chave] };
  });
}

/** Total de itens pendentes na ficha. */
function totalPendenciasFicha(f, hoje, cirurgia) {
  return pendenciasFicha(f, hoje, cirurgia).reduce(function (s, g) { return s + g.itens.length; }, 0);
}

/**
 * Janelas de acompanhamento cujo prazo já passou, contando da data da
 * cirurgia. Sem data da cirurgia, nenhuma vence (não dá para cobrar prazo
 * que não se sabe calcular).
 */
function janelasVencidas(f, hoje, cirurgia) {
  var base = paraData(cirurgia && cirurgia.data);
  var ref = paraData(hoje) || hojeISO();
  if (!base) return [];
  return SEGUIMENTOS_QUALIDADE.filter(function (s) {
    var limite = somarDias(base, Math.ceil(s.horas / 24));
    return limite <= ref;
  });
}

/** Acompanhamentos ainda em aberto (janela vencida e sem situação). */
function seguimentosPendentes(f, hoje, cirurgia) {
  return janelasVencidas(f, hoje, cirurgia).filter(function (s) {
    return !f.seguimentos[s.chave].situacao;
  });
}

/* ========================================================== construção */

/**
 * Ficha nova para uma cirurgia. Puxa da cirurgia só o que já está digitado
 * lá (sala, convênio, horários reais): é adiantamento de digitação, não
 * resposta clínica — nenhuma pergunta de evento nasce respondida.
 */
function novaFicha(id, cirurgia, usuario, quando) {
  quando = quando || agoraTexto();
  cirurgia = cirurgia || {};
  var particular = mesmoTexto(cirurgia.convenio, 'Particular');
  return normalizarFicha({
    id: id, uid: novoUid(), idCirurgia: txt(cirurgia.id),
    criadoEm: quando, criadoPor: usuario, atualizadoEm: quando, atualizadoPor: usuario,
    atendimento: {
      convenio: txt(cirurgia.convenio),
      vinculo: vazio(cirurgia.convenio) ? '' : (particular ? 'Particular' : 'Convênio'),
      sala: txt(cirurgia.sala),
      inicioAnestesia: paraHora(cirurgia.inicioReal) || '',
      fimAnestesia: paraHora(cirurgia.fimReal) || ''
    }
  });
}

/** Seções de objeto que a tela pode mudar. */
var SECOES_OBJETO_QUALIDADE = ['atendimento', 'pre', 'processo', 'intra', 'srpa', 'satisfacao'];

/**
 * Aplica mudanças de campos. Só chaves conhecidas passam; identidade,
 * situação, eventos, seguimentos, revisão e histórico têm caminho próprio.
 * Devolve { ficha, erros }.
 */
function aplicarMudancasFicha(f, mudancas) {
  var bruto = JSON.parse(JSON.stringify(f));
  var m = ehObjetoQ(mudancas) ? mudancas : {};

  SECOES_OBJETO_QUALIDADE.forEach(function (s) {
    if (!ehObjetoQ(m[s])) return;
    Object.keys(m[s]).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(bruto[s], k)) bruto[s][k] = m[s][k];
    });
  });

  if (ehObjetoQ(m.respostas)) {
    Object.keys(m.respostas).forEach(function (k) {
      if (eventoQualidade(k)) bruto.respostas[k] = m.respostas[k];
    });
  }

  if (ehObjetoQ(m.transicao)) {
    Object.keys(m.transicao).forEach(function (k) {
      if (k === 'itens') {
        if (!ehObjetoQ(m.transicao.itens)) return;
        Object.keys(m.transicao.itens).forEach(function (i) {
          if (Object.prototype.hasOwnProperty.call(bruto.transicao.itens, i)) {
            bruto.transicao.itens[i] = m.transicao.itens[i];
          }
        });
      } else if (Object.prototype.hasOwnProperty.call(bruto.transicao, k)) {
        bruto.transicao[k] = m.transicao[k];
      }
    });
  }

  return lerFicha(bruto, true);
}

/**
 * Inclui, altera ou remove um evento. `op`: { acao, indice, evento, conferir }.
 * `conferir` é o evento como a tela o viu: se mudou no meio do caminho,
 * nada é alterado.
 */
function aplicarEventoFicha(f, op) {
  function falha(msg) { return { ficha: null, erros: [{ campo: 'eventos', msg: msg }] }; }
  op = ehObjetoQ(op) ? op : {};
  var bruto = JSON.parse(JSON.stringify(f));
  var lista = bruto.eventos;

  if (op.acao === 'adicionar') {
    if (lista.length >= LISTAS_QUALIDADE.eventos) {
      return falha('Limite de ' + LISTAS_QUALIDADE.eventos + ' eventos atingido neste atendimento.');
    }
    if (!eventoQualidade(op.evento && op.evento.tipo)) return falha('Escolha o tipo do evento.');
    lista.push(ehObjetoQ(op.evento) ? op.evento : {});
  } else if (op.acao === 'alterar' || op.acao === 'remover') {
    var i = Number(op.indice);
    if (!(i >= 0 && i < lista.length && Math.floor(i) === i)) return falha('Evento não encontrado.');
    if (op.conferir !== undefined && jsonCanonico(lista[i]) !== jsonCanonico(op.conferir)) {
      return falha('Este evento mudou enquanto você editava. Confira a lista e tente de novo.');
    }
    if (op.acao === 'remover') lista.splice(i, 1);
    else {
      var novo = ehObjetoQ(op.evento) ? op.evento : {};
      // O tipo de um evento gravado não muda: trocá-lo é apagar e registrar outro.
      novo.tipo = lista[i].tipo;
      lista[i] = novo;
    }
  } else {
    return falha('Operação desconhecida.');
  }
  return lerFicha(bruto, true);
}

/** Aplica a resposta de uma janela de acompanhamento. */
function aplicarSeguimentoFicha(f, janela, dados) {
  function falha(msg) { return { ficha: null, erros: [{ campo: 'seguimentos', msg: msg }] }; }
  var def = SEGUIMENTOS_QUALIDADE.filter(function (s) { return s.chave === janela; })[0];
  if (!def) return falha('Janela de acompanhamento desconhecida: ' + janela + '.');
  var bruto = JSON.parse(JSON.stringify(f));
  var alvo = bruto.seguimentos[janela];
  dados = ehObjetoQ(dados) ? dados : {};
  Object.keys(dados).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(alvo, k)) alvo[k] = dados[k];
  });
  return lerFicha(bruto, true);
}

/**
 * Entradas de histórico a partir do que mudou entre duas fichas.
 * O LOG geral guarda a trilha de auditoria do sistema; isto fica DENTRO da
 * ficha para que ela seja legível sozinha (e no PDF), sem varrer o LOG.
 */
function historicoDaFicha(antes, depois, quando, quem) {
  var saida = [];
  function comparar(etapa, rotuloBase, a, b) {
    Object.keys(b).forEach(function (k) {
      var va = a ? a[k] : undefined, vb = b[k];
      if (ehObjetoQ(vb) || Array.isArray(vb)) {
        if (jsonCanonico(va === undefined ? null : va) !== jsonCanonico(vb)) {
          saida.push({ quando: quando, quem: quem, etapa: etapa, campo: rotuloBase + k,
            de: resumoValorQualidade(va), para: resumoValorQualidade(vb) });
        }
        return;
      }
      if (String(va === undefined || va === null ? '' : va) !== String(vb === null ? '' : vb)) {
        saida.push({ quando: quando, quem: quem, etapa: etapa, campo: rotuloBase + k,
          de: resumoValorQualidade(va), para: resumoValorQualidade(vb) });
      }
    });
  }
  ['atendimento', 'pre', 'processo', 'intra', 'srpa', 'respostas', 'transicao', 'satisfacao', 'revisao']
    .forEach(function (s) { comparar(s, '', antes[s] || {}, depois[s] || {}); });
  SEGUIMENTOS_QUALIDADE.forEach(function (s) {
    comparar('seguimentos', s.chave + '.', antes.seguimentos[s.chave] || {}, depois.seguimentos[s.chave] || {});
  });
  if (antes.eventos.length !== depois.eventos.length) {
    saida.push({ quando: quando, quem: quem, etapa: 'eventos', campo: 'eventos',
      de: String(antes.eventos.length), para: String(depois.eventos.length) });
  } else if (jsonCanonico(antes.eventos) !== jsonCanonico(depois.eventos)) {
    saida.push({ quando: quando, quem: quem, etapa: 'eventos', campo: 'eventos',
      de: 'alterado', para: String(depois.eventos.length) + ' evento(s)' });
  }
  return saida;
}

/** Valor curto para o histórico. */
function resumoValorQualidade(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  if (Array.isArray(v)) return v.length ? v.join(', ').slice(0, 200) : '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 200);
  return String(v).slice(0, 200);
}

/** Acrescenta entradas ao histórico, mantendo só as mais recentes. */
function comHistorico(f, entradas) {
  f.historico = f.historico.concat(entradas).slice(-MAX_HISTORICO_QUALIDADE);
  return f;
}

/**
 * Congela a ficha inteira. O store guarda fichas congeladas pelo mesmo
 * motivo do boletim: mudar uma no lugar, sem passar pela transação,
 * quebraria o desfazer.
 */
function congelarFicha(f) {
  (function congelar(o) {
    if (!o || typeof o !== 'object' || Object.isFrozen(o)) return;
    Object.freeze(o);
    Object.keys(o).forEach(function (k) { congelar(o[k]); });
  })(f);
  return f;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FICHA_RASCUNHO: FICHA_RASCUNHO,
    FICHA_CONCLUIDA: FICHA_CONCLUIDA,
    RESPOSTA_SIM: RESPOSTA_SIM,
    RESPOSTA_NAO: RESPOSTA_NAO,
    RESPOSTA_NA: RESPOSTA_NA,
    RESPOSTA_SEM: RESPOSTA_SEM,
    RESPOSTAS_QUALIDADE: RESPOSTAS_QUALIDADE,
    ETAPAS_QUALIDADE: ETAPAS_QUALIDADE,
    SEGUIMENTOS_QUALIDADE: SEGUIMENTOS_QUALIDADE,
    SITUACOES_SEGUIMENTO: SITUACOES_SEGUIMENTO,
    OPCOES_QUALIDADE: OPCOES_QUALIDADE,
    EVENTOS_QUALIDADE: EVENTOS_QUALIDADE,
    ITENS_PASSAGEM: ITENS_PASSAGEM,
    LIMITES_QUALIDADE: LIMITES_QUALIDADE,
    LISTAS_QUALIDADE: LISTAS_QUALIDADE,
    leitorQualidade: leitorQualidade,
    eventoQualidade: eventoQualidade,
    eventosDaEtapa: eventosDaEtapa,
    eventosPertinentes: eventosPertinentes,
    pertinenteNaFicha: pertinenteNaFicha,
    lerFicha: lerFicha,
    normalizarFicha: normalizarFicha,
    sanearFichasQualidade: sanearFichasQualidade,
    ordenarEventosFicha: ordenarEventosFicha,
    ehGeralNaFicha: ehGeralNaFicha,
    resumoQualidade: resumoQualidade,
    validarFicha: validarFicha,
    pendenciasFicha: pendenciasFicha,
    totalPendenciasFicha: totalPendenciasFicha,
    janelasVencidas: janelasVencidas,
    seguimentosPendentes: seguimentosPendentes,
    novaFicha: novaFicha,
    aplicarMudancasFicha: aplicarMudancasFicha,
    aplicarEventoFicha: aplicarEventoFicha,
    aplicarSeguimentoFicha: aplicarSeguimentoFicha,
    historicoDaFicha: historicoDaFicha,
    resumoValorQualidade: resumoValorQualidade,
    comHistorico: comHistorico,
    congelarFicha: congelarFicha
  };
}
