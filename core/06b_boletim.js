/**
 * ============================================================================
 * 06B_BOLETIM — Boletim anestésico (registro intraoperatório)
 * ============================================================================
 * O boletim é a ficha da anestesia: avaliação resumida, técnica, via aérea,
 * monitorização, horários, sinais vitais em linha do tempo, fármacos,
 * fluidos, balanço, intercorrências e recuperação (Aldrete). Um por cirurgia.
 *
 * Não é aba da planilha: é dado próprio do sistema (estado.boletins), como o
 * repasse. O formato é FECHADO — `lerBoletim` reconstrói cada boletim campo
 * a campo, com valores simples e listas com limite. O mesmo filtro serve à
 * gravação vinda da tela (estrito: valor estranho vira erro com o nome do
 * campo) e à importação de backup (tolerante: valor estranho fica de fora).
 *
 * CICLO DE VIDA
 *   Em preenchimento --finalizar (assinatura)-------------> Finalizado
 *   Finalizado ------reabrir (motivo, vai ao LOG)----------> Em preenchimento
 *                                                           (versão + 1)
 * Finalizado não se edita: é prontuário. O código de conferência é o SHA-256
 * do conteúdo assinado — se o conteúdo mudar por fora (um backup editado à
 * mão), a verificação de integridade aponta.
 *
 * HORÁRIOS podem passar da meia-noite: cada horário vira minutos a partir da
 * referência do boletim (entrada na sala ou, sem ela, o primeiro horário
 * preenchido). Até 3 horas antes da referência conta como "antes"; o resto,
 * como "depois", já no dia seguinte se preciso.
 * ============================================================================
 */

var BOLETIM_RASCUNHO = 'Em preenchimento';
var BOLETIM_FINALIZADO = 'Finalizado';

/**
 * Listas de escolha da tela. O boletim guarda o TEXTO escolhido, não um
 * código: se a lista mudar um dia, o boletim antigo continua legível.
 */
var OPCOES_BOLETIM = {
  sexo: ['F', 'M'],
  asa: ['I', 'II', 'III', 'IV', 'V', 'VI'],
  mallampati: ['I', 'II', 'III', 'IV'],
  cormack: ['I', 'II', 'III', 'IV'],
  tecnicas: ['Geral balanceada', 'Geral venosa total', 'Geral inalatória', 'Raquianestesia', 'Peridural',
    'Raqui + peridural', 'Bloqueio periférico', 'Sedação', 'Local com sedação'],
  dispositivos: ['Cateter nasal / máscara de O₂', 'Máscara facial', 'Máscara laríngea', 'Tubo orotraqueal',
    'Tubo nasotraqueal', 'Traqueostomia'],
  monitorizacao: ['Cardioscopia (ECG)', 'Oximetria de pulso', 'PA não invasiva', 'Capnografia', 'Temperatura',
    'Análise de gases', 'BIS / profundidade anestésica', 'Bloqueio neuromuscular (TOF)', 'PA invasiva', 'Diurese'],
  posicoes: ['Decúbito dorsal', 'Decúbito ventral', 'Decúbito lateral', 'Litotomia', 'Cadeira de praia',
    'Proclive', 'Trendelenburg'],
  vias: ['IV', 'IM', 'SC', 'VO', 'Inalatória', 'Intratecal', 'Peridural', 'Perineural', 'Infiltração local',
    'Tópica', 'Intranasal'],
  unidades: ['mg', 'mcg', 'g', 'UI', 'mL', '%', 'mg/h', 'mcg/kg/min', 'mg/kg/h', 'mL/h'],
  ventilacao: ['Espontânea', 'Assistida manual', 'Volume controlado (VCV)', 'Pressão controlada (PCV)',
    'Pressão de suporte (PSV)'],
  destinos: ['SRPA', 'UTI', 'Quarto / enfermaria', 'Alta ambulatorial'],
  fluidos: ['Ringer lactato', 'Soro fisiológico 0,9%', 'Plasma-Lyte', 'Soro glicosado 5%', 'Coloide', 'Albumina',
    'Concentrado de hemácias', 'Plasma fresco congelado', 'Concentrado de plaquetas', 'Crioprecipitado']
};

/** Atalho da tela: a monitorização mínima de toda anestesia (um clique, nunca automático). */
var MONITORIZACAO_BASICA = ['Cardioscopia (ECG)', 'Oximetria de pulso', 'PA não invasiva', 'Capnografia'];

/**
 * Sugestões de fármacos, com a unidade e a via mais comuns. Só adiantam a
 * digitação: a DOSE é sempre digitada. Anestésico local fica sem via
 * padrão de propósito — intratecal, peridural e perineural são decisões
 * diferentes e têm de ser escolhidas.
 */
var FARMACOS_BOLETIM = [
  { nome: 'Propofol', unidade: 'mg', via: 'IV' },
  { nome: 'Fentanil', unidade: 'mcg', via: 'IV' },
  { nome: 'Sufentanil', unidade: 'mcg', via: 'IV' },
  { nome: 'Remifentanil', unidade: 'mcg/kg/min', via: 'IV' },
  { nome: 'Alfentanil', unidade: 'mcg', via: 'IV' },
  { nome: 'Morfina', unidade: 'mg', via: '' },
  { nome: 'Metadona', unidade: 'mg', via: 'IV' },
  { nome: 'Tramadol', unidade: 'mg', via: 'IV' },
  { nome: 'Midazolam', unidade: 'mg', via: 'IV' },
  { nome: 'Cetamina', unidade: 'mg', via: 'IV' },
  { nome: 'Etomidato', unidade: 'mg', via: 'IV' },
  { nome: 'Dexmedetomidina', unidade: 'mcg', via: 'IV' },
  { nome: 'Clonidina', unidade: 'mcg', via: '' },
  { nome: 'Lidocaína', unidade: 'mg', via: '' },
  { nome: 'Sevoflurano', unidade: '%', via: 'Inalatória' },
  { nome: 'Isoflurano', unidade: '%', via: 'Inalatória' },
  { nome: 'Desflurano', unidade: '%', via: 'Inalatória' },
  { nome: 'Rocurônio', unidade: 'mg', via: 'IV' },
  { nome: 'Cisatracúrio', unidade: 'mg', via: 'IV' },
  { nome: 'Atracúrio', unidade: 'mg', via: 'IV' },
  { nome: 'Succinilcolina', unidade: 'mg', via: 'IV' },
  { nome: 'Sugamadex', unidade: 'mg', via: 'IV' },
  { nome: 'Neostigmina', unidade: 'mg', via: 'IV' },
  { nome: 'Atropina', unidade: 'mg', via: 'IV' },
  { nome: 'Efedrina', unidade: 'mg', via: 'IV' },
  { nome: 'Fenilefrina', unidade: 'mcg', via: 'IV' },
  { nome: 'Metaraminol', unidade: 'mg', via: 'IV' },
  { nome: 'Noradrenalina', unidade: 'mcg/kg/min', via: 'IV' },
  { nome: 'Adrenalina', unidade: 'mcg', via: 'IV' },
  { nome: 'Dexametasona', unidade: 'mg', via: 'IV' },
  { nome: 'Hidrocortisona', unidade: 'mg', via: 'IV' },
  { nome: 'Ondansetrona', unidade: 'mg', via: 'IV' },
  { nome: 'Droperidol', unidade: 'mg', via: 'IV' },
  { nome: 'Metoclopramida', unidade: 'mg', via: 'IV' },
  { nome: 'Dipirona', unidade: 'g', via: 'IV' },
  { nome: 'Paracetamol', unidade: 'g', via: 'IV' },
  { nome: 'Cetoprofeno', unidade: 'mg', via: 'IV' },
  { nome: 'Parecoxibe', unidade: 'mg', via: 'IV' },
  { nome: 'Cefazolina', unidade: 'g', via: 'IV' },
  { nome: 'Clindamicina', unidade: 'mg', via: 'IV' },
  { nome: 'Ácido tranexâmico', unidade: 'g', via: 'IV' },
  { nome: 'Sulfato de magnésio', unidade: 'g', via: 'IV' },
  { nome: 'Omeprazol', unidade: 'mg', via: 'IV' },
  { nome: 'Enoxaparina', unidade: 'mg', via: 'SC' },
  { nome: 'Heparina', unidade: 'UI', via: 'SC' },
  { nome: 'Bupivacaína', unidade: 'mg', via: '' },
  { nome: 'Bupivacaína hiperbárica', unidade: 'mg', via: '' },
  { nome: 'Levobupivacaína', unidade: 'mg', via: '' },
  { nome: 'Ropivacaína', unidade: 'mg', via: '' },
  { nome: 'Lidocaína com vasoconstritor', unidade: 'mL', via: 'Infiltração local' }
];

/** Índice de Aldrete e Kroulik modificado: a posição da opção é a pontuação (0, 1, 2). */
var ALDRETE_ITENS = [
  { campo: 'atividade', rotulo: 'Atividade',
    opcoes: ['Não move as extremidades', 'Move 2 extremidades', 'Move as 4 extremidades'] },
  { campo: 'respiracao', rotulo: 'Respiração',
    opcoes: ['Apneia', 'Dispneia ou respiração limitada', 'Respira fundo e tosse'] },
  { campo: 'circulacao', rotulo: 'Circulação',
    opcoes: ['PA 50% ou mais diferente do pré', 'PA 20 a 49% diferente do pré', 'PA até 20% do pré'] },
  { campo: 'consciencia', rotulo: 'Consciência',
    opcoes: ['Não responde', 'Desperta ao ser chamado', 'Totalmente acordado'] },
  { campo: 'saturacao', rotulo: 'Saturação',
    opcoes: ['SpO₂ < 90% mesmo com O₂', 'Precisa de O₂ para SpO₂ > 90%', 'SpO₂ > 92% em ar ambiente'] }
];
var ALDRETE_ALTA = 9;

/** Os horários do boletim, na ordem em que acontecem. */
var TEMPOS_BOLETIM = [
  { campo: 'entradaSala', rotulo: 'Entrada na sala' },
  { campo: 'inicioAnestesia', rotulo: 'Início da anestesia' },
  { campo: 'inicioCirurgia', rotulo: 'Início da cirurgia' },
  { campo: 'fimCirurgia', rotulo: 'Fim da cirurgia' },
  { campo: 'fimAnestesia', rotulo: 'Fim da anestesia' },
  { campo: 'saidaSala', rotulo: 'Saída da sala' }
];

/**
 * Faixas aceitas. NÃO são alarmes clínicos: só barram erro de digitação
 * (1200 no lugar de 120). Valor extremo, mas possível, passa.
 */
var LIMITES_BOLETIM = {
  idade:       { rotulo: 'Idade', min: 0, max: 120, unidade: 'anos' },
  peso:        { rotulo: 'Peso', min: 0.3, max: 400, unidade: 'kg', casas: 1 },
  altura:      { rotulo: 'Altura', min: 30, max: 250, unidade: 'cm' },
  jejum:       { rotulo: 'Jejum', min: 0, max: 96, unidade: 'h', casas: 1 },
  tentativas:  { rotulo: 'Tentativas de intubação', min: 1, max: 10 },
  vc:          { rotulo: 'Volume corrente', min: 10, max: 2000, unidade: 'mL' },
  fr:          { rotulo: 'Frequência respiratória', min: 2, max: 80, unidade: 'irpm' },
  peep:        { rotulo: 'PEEP', min: 0, max: 30, unidade: 'cmH₂O' },
  fio2:        { rotulo: 'FiO₂', min: 21, max: 100, unidade: '%' },
  pas:         { rotulo: 'PA sistólica', min: 20, max: 300, unidade: 'mmHg' },
  pad:         { rotulo: 'PA diastólica', min: 5, max: 250, unidade: 'mmHg' },
  fc:          { rotulo: 'FC', min: 10, max: 300, unidade: 'bpm' },
  spo2:        { rotulo: 'SpO₂', min: 20, max: 100, unidade: '%' },
  etco2:       { rotulo: 'EtCO₂', min: 0, max: 150, unidade: 'mmHg' },
  temp:        { rotulo: 'Temperatura', min: 25, max: 45, unidade: '°C', casas: 1 },
  volume:      { rotulo: 'Volume', min: 1, max: 30000, unidade: 'mL' },
  sangramento: { rotulo: 'Sangramento', min: 0, max: 50000, unidade: 'mL' },
  diurese:     { rotulo: 'Diurese', min: 0, max: 50000, unidade: 'mL' },
  dor:         { rotulo: 'Dor', min: 0, max: 10 }
};

/** Parâmetros de cada registro de sinais vitais. */
var SINAIS_BOLETIM = ['pas', 'pad', 'fc', 'spo2', 'etco2', 'temp'];

/** Listas do boletim e o máximo de linhas de cada uma. */
var LISTAS_BOLETIM = { sinais: 500, farmacos: 300, fluidos: 60, intercorrencias: 100 };

/** O que vai para a identificação congelada na assinatura. */
var CAMPOS_IDENTIFICACAO = ['idCirurgia', 'paciente', 'data', 'procedimento', 'cirurgiao', 'anestesista', 'crm',
  'convenio', 'sala'];

var DOSE_MAXIMA_BOLETIM = 100000;   // teto de sanidade para a dose digitada (a unidade é outro campo)
var JANELA_MAX_BOLETIM = 18 * 60;   // minutos entre o primeiro e o último horário
var ANTES_DA_REFERENCIA = 180;      // minutos antes da referência que ainda contam como "antes"

/* ================================================================ leitura */

function numeroBR(n) { return String(n).replace('.', ','); }

function ehObjeto(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

/** Nulo, indefinido ou texto só com espaços: campo não preenchido. */
function semValor(v) { return v === null || v === undefined || (typeof v === 'string' && txt(v) === ''); }

/**
 * Leitor de campos. Estrito (gravação vinda da tela): valor que não se
 * entende vira erro com o nome do campo. Tolerante (backup): vira vazio.
 */
function leitorBoletim(estrito) {
  var erros = [];
  function falha(msg) { if (estrito) erros.push({ campo: 'boletim', msg: msg }); }

  return {
    erros: erros,

    texto: function (v, max) {
      if (typeof v !== 'string' && typeof v !== 'number') return '';
      return txt(v).slice(0, max || 200);
    },

    numero: function (v, chave) {
      var lim = LIMITES_BOLETIM[chave];
      if (semValor(v)) return null;
      var n = typeof v === 'number' ? (isFinite(v) ? v : null) : (typeof v === 'string' ? paraNumero(v) : null);
      if (n === null) { falha(lim.rotulo + ': "' + txt(v) + '" não é um número.'); return null; }
      var fator = Math.pow(10, lim.casas || 0);
      n = Math.round(n * fator) / fator;
      if (n < lim.min || n > lim.max) {
        falha(lim.rotulo + ' ' + numeroBR(n) + ' fora da faixa aceita (' + numeroBR(lim.min) + ' a ' +
          numeroBR(lim.max) + (lim.unidade ? ' ' + lim.unidade : '') + ').');
        return null;
      }
      return n;
    },

    hora: function (v, rotulo) {
      if (semValor(v)) return '';
      var h = typeof v === 'string' || typeof v === 'number' ? paraHora(v) : '';
      if (!h) falha(rotulo + ': horário inválido ("' + txt(v) + '").');
      return h;
    },

    opcao: function (v, lista, rotulo) {
      if (semValor(v)) return '';
      var achado = typeof v === 'string' ? lista.filter(function (o) { return mesmoTexto(o, v); })[0] : null;
      if (!achado) falha(rotulo + ': "' + txt(v) + '" não é uma opção válida.');
      return achado || '';
    },

    pontos: function (v, rotulo) {
      if (semValor(v)) return null;
      var n = Number(v);
      if (!(n === 0 || n === 1 || n === 2)) { falha(rotulo + ': a pontuação é 0, 1 ou 2.'); return null; }
      return n;
    },

    sim: function (v) { return v === true || (typeof v === 'string' && ehSim(v)); },

    /** Lista de escolhas (técnicas, monitorização…): texto, sem repetição. */
    escolhas: function (v, max) {
      var vistos = {};
      return (Array.isArray(v) ? v : [])
        .filter(function (x) { return typeof x === 'string' && txt(x) !== ''; })
        .map(function (x) { return txt(x).slice(0, 80); })
        .filter(function (x) { var k = normalizar(x); if (vistos[k]) return false; vistos[k] = true; return true; })
        .slice(0, max || 20);
    }
  };
}

/** Traços da assinatura: listas de pontos [x, y] entre 0 e 1, com limite. */
function lerTracosBoletim(v) {
  var total = 0;
  return (Array.isArray(v) ? v : []).slice(0, 300).map(function (t) {
    return (Array.isArray(t) ? t : []).filter(function (p) {
      return Array.isArray(p) && p.length >= 2 && isFinite(Number(p[0])) && isFinite(Number(p[1])) && total++ < 30000;
    }).map(function (p) {
      return [Math.round(Math.min(1, Math.max(0, Number(p[0]))) * 1000) / 1000,
              Math.round(Math.min(1, Math.max(0, Number(p[1]))) * 1000) / 1000];
    });
  }).filter(function (t) { return t.length > 0; });
}

/**
 * Reconstrói um boletim campo a campo. Devolve { boletim, erros }.
 * `estrito`: erros de leitura aparecem (gravação); sem ele, somem (backup).
 * É idempotente: ler o que já foi lido dá o mesmo boletim.
 */
function lerBoletim(b, estrito) {
  b = ehObjeto(b) ? b : {};
  var L = leitorBoletim(estrito);
  function obj(v) { return ehObjeto(v) ? v : {}; }
  var pac = obj(b.paciente), pre = obj(b.pre), va = obj(b.viaAerea), tp = obj(b.tempos),
      ven = obj(b.ventilacao), per = obj(b.perdas), rec = obj(b.recuperacao);

  function linhas(lista, ler) {
    var v = b[lista];
    return (Array.isArray(v) ? v : []).filter(ehObjeto).slice(0, LISTAS_BOLETIM[lista]).map(ler);
  }

  var n = {
    id: L.texto(b.id, 20),
    uid: L.texto(b.uid, 40),
    idCirurgia: L.texto(b.idCirurgia, 20),
    status: b.status === BOLETIM_FINALIZADO ? BOLETIM_FINALIZADO : BOLETIM_RASCUNHO,
    versao: Math.max(1, Math.min(999, Math.floor(Number(b.versao)) || 1)),
    criadoEm: L.texto(b.criadoEm, 19),
    criadoPor: L.texto(b.criadoPor, 80),
    atualizadoEm: L.texto(b.atualizadoEm, 19),
    atualizadoPor: L.texto(b.atualizadoPor, 80),

    paciente: {
      idade: L.numero(pac.idade, 'idade'),
      sexo: L.opcao(pac.sexo, OPCOES_BOLETIM.sexo, 'Sexo'),
      peso: L.numero(pac.peso, 'peso'),
      altura: L.numero(pac.altura, 'altura'),
      prontuario: L.texto(pac.prontuario, 40)
    },
    pre: {
      asa: L.opcao(pre.asa, OPCOES_BOLETIM.asa, 'ASA'),
      emergencia: L.sim(pre.emergencia),
      jejum: L.numero(pre.jejum, 'jejum'),
      alergias: L.texto(pre.alergias, 500),
      comorbidades: L.texto(pre.comorbidades, 1000),
      medicacoes: L.texto(pre.medicacoes, 1000),
      mallampati: L.opcao(pre.mallampati, OPCOES_BOLETIM.mallampati, 'Mallampati'),
      viaAereaDificil: L.sim(pre.viaAereaDificil)
    },
    tecnicas: L.escolhas(b.tecnicas, 12),
    tecnicaOutra: L.texto(b.tecnicaOutra, 200),
    viaAerea: {
      dispositivo: L.texto(va.dispositivo, 80),
      tamanho: L.texto(va.tamanho, 40),
      cormack: L.opcao(va.cormack, OPCOES_BOLETIM.cormack, 'Cormack-Lehane'),
      tentativas: L.numero(va.tentativas, 'tentativas'),
      dificil: L.sim(va.dificil),
      obs: L.texto(va.obs, 300)
    },
    acesso: L.texto(b.acesso, 300),
    posicoes: L.escolhas(b.posicoes, 10),
    monitorizacao: L.escolhas(b.monitorizacao, 16),
    tempos: {},
    ventilacao: {
      modo: L.texto(ven.modo, 60),
      vc: L.numero(ven.vc, 'vc'),
      fr: L.numero(ven.fr, 'fr'),
      peep: L.numero(ven.peep, 'peep'),
      fio2: L.numero(ven.fio2, 'fio2')
    },
    sinais: linhas('sinais', function (l) {
      var r = { hora: L.hora(l.hora, 'Sinais vitais') };
      SINAIS_BOLETIM.forEach(function (k) { r[k] = L.numero(l[k], k); });
      return r;
    }),
    farmacos: linhas('farmacos', function (l) {
      return { hora: L.hora(l.hora, 'Fármaco'), nome: L.texto(l.nome, 80), dose: L.texto(l.dose, 40),
        unidade: L.texto(l.unidade, 20), via: L.texto(l.via, 40) };
    }),
    fluidos: linhas('fluidos', function (l) {
      return { nome: L.texto(l.nome, 80), volume: L.numero(l.volume, 'volume') };
    }),
    perdas: {
      sangramento: L.numero(per.sangramento, 'sangramento'),
      diurese: L.numero(per.diurese, 'diurese')
    },
    intercorrencias: linhas('intercorrencias', function (l) {
      return { hora: L.hora(l.hora, 'Intercorrência'), descricao: L.texto(l.descricao, 500) };
    }),
    semIntercorrencias: L.sim(b.semIntercorrencias),
    destino: L.texto(b.destino, 60),
    recuperacao: { horaAlta: L.hora(rec.horaAlta, 'Alta da recuperação'), dor: L.numero(rec.dor, 'dor') },
    observacoes: L.texto(b.observacoes, 3000),
    identificacao: null,
    assinatura: null,
    finalizadoEm: L.texto(b.finalizadoEm, 19),
    finalizadoPor: L.texto(b.finalizadoPor, 80),
    historico: []
  };

  TEMPOS_BOLETIM.forEach(function (t) { n.tempos[t.campo] = L.hora(tp[t.campo], t.rotulo); });
  ALDRETE_ITENS.forEach(function (a) { n.recuperacao[a.campo] = L.pontos(rec[a.campo], 'Aldrete, ' + a.rotulo.toLowerCase()); });

  if (n.status === BOLETIM_FINALIZADO) {
    if (ehObjeto(b.identificacao)) {
      n.identificacao = {};
      CAMPOS_IDENTIFICACAO.forEach(function (k) { n.identificacao[k] = L.texto(b.identificacao[k], 200); });
    }
    if (ehObjeto(b.assinatura)) {
      n.assinatura = {
        tracos: lerTracosBoletim(b.assinatura.tracos),
        nome: L.texto(b.assinatura.nome, 120),
        crm: L.texto(b.assinatura.crm, 30),
        quando: L.texto(b.assinatura.quando, 19),
        codigo: L.texto(b.assinatura.codigo, 64).toLowerCase()
      };
    }
  } else {
    // Rascunho não tem assinatura nem identificação congelada.
    n.finalizadoEm = '';
    n.finalizadoPor = '';
  }

  n.historico = (Array.isArray(b.historico) ? b.historico : []).filter(ehObjeto).slice(0, 200).map(function (h) {
    return {
      versao: Math.max(1, Math.floor(Number(h.versao)) || 1),
      finalizadoEm: L.texto(h.finalizadoEm, 19), finalizadoPor: L.texto(h.finalizadoPor, 80),
      codigo: L.texto(h.codigo, 64).toLowerCase(),
      reabertoEm: L.texto(h.reabertoEm, 19), reabertoPor: L.texto(h.reabertoPor, 80),
      motivo: L.texto(h.motivo, 500)
    };
  });

  ordenarLinhasBoletim(n);
  return { boletim: n, erros: L.erros };
}

/** Boletim de fonte externa (backup), sem erro: o que não se entende fica de fora. */
function normalizarBoletim(b) { return lerBoletim(b, false).boletim; }

/** Lista de boletins de um backup: só o que tem cara de boletim passa. */
function sanearBoletins(lista) {
  return (Array.isArray(lista) ? lista : []).filter(function (b) {
    return ehObjeto(b) && !vazio(b.idCirurgia);
  }).map(normalizarBoletim);
}

/* ============================================================== horários */

/** Minutos da referência do boletim no dia (null se não há horário nenhum). */
function referenciaBoletim(b) {
  var tempos = b.tempos || {};
  for (var i = 0; i < TEMPOS_BOLETIM.length; i++) {
    var m = horaParaMinutos(tempos[TEMPOS_BOLETIM[i].campo]);
    if (m !== null) return m;
  }
  var listas = [b.sinais || [], b.farmacos || [], b.intercorrencias || []];
  for (var k = 0; k < listas.length; k++) {
    for (var j = 0; j < listas[k].length; j++) {
      var h = horaParaMinutos(listas[k][j].hora);
      if (h !== null) return h;
    }
  }
  return null;
}

/**
 * Minutos de um horário a partir da referência, atravessando a meia-noite.
 * Devolve null para horário vazio.
 */
function minutoNoBoletim(ref, hora) {
  var m = horaParaMinutos(hora);
  if (m === null) return null;
  if (ref === null || ref === undefined) return m;
  var d = (((m - ref) % 1440) + 1440) % 1440;
  if (d > 1440 - ANTES_DA_REFERENCIA) d -= 1440;
  return d;
}

/** Põe sinais, fármacos e intercorrências em ordem de horário (sem horário, no fim). */
function ordenarLinhasBoletim(b) {
  var ref = referenciaBoletim(b);
  ['sinais', 'farmacos', 'intercorrencias'].forEach(function (lista) {
    b[lista] = b[lista].map(function (l, i) { return { l: l, i: i, m: minutoNoBoletim(ref, l.hora) }; })
      .sort(function (x, y) {
        if (x.m === null && y.m === null) return x.i - y.i;
        if (x.m === null) return 1;
        if (y.m === null) return -1;
        return x.m - y.m || x.i - y.i;
      })
      .map(function (x) { return x.l; });
  });
  return b;
}

/** Duração entre dois horários do boletim, em minutos (null se falta um). */
function duracaoNoBoletim(b, de, ate) {
  var ref = referenciaBoletim(b);
  var a = minutoNoBoletim(ref, b.tempos[de]), z = minutoNoBoletim(ref, b.tempos[ate]);
  return a === null || z === null ? null : z - a;
}

/* ============================================================= validação */

function ehAnestesiaGeral(b) {
  return (b.tecnicas || []).some(function (t) { return /^geral/i.test(normalizar(t)); });
}

/**
 * Coerência do boletim já lido: horários em ordem, registros completos,
 * PA diastólica abaixo da sistólica. Devolve { ok, erros, avisos }.
 */
function validarBoletim(b) {
  var erros = [], avisos = [];
  function erro(campo, msg) { erros.push({ campo: campo, msg: msg }); }

  var ref = referenciaBoletim(b);
  var anterior = null, menor = null, maior = null;
  TEMPOS_BOLETIM.forEach(function (t) {
    var h = b.tempos[t.campo];
    if (!h) return;
    var m = minutoNoBoletim(ref, h);
    if (anterior && m < anterior.m) {
      erro('tempos.' + t.campo, 'Horários fora de ordem: ' + t.rotulo.toLowerCase() + ' (' + h + ') vem antes de ' +
        anterior.rotulo.toLowerCase() + ' (' + anterior.h + '). Se passou da meia-noite, confira o horário digitado.');
    }
    if (!anterior || m >= anterior.m) anterior = { m: m, h: h, rotulo: t.rotulo };
    menor = menor === null ? m : Math.min(menor, m);
    maior = maior === null ? m : Math.max(maior, m);
  });
  if (menor !== null && maior - menor > JANELA_MAX_BOLETIM) {
    erro('tempos', 'Os horários cobrem mais de ' + (JANELA_MAX_BOLETIM / 60) + ' horas — algum foi digitado errado.');
  }

  b.sinais.forEach(function (s) {
    var quando = s.hora ? ' das ' + s.hora : '';
    if (!s.hora) erro('sinais', 'Registro de sinais vitais sem horário.');
    if (SINAIS_BOLETIM.every(function (k) { return s[k] === null; })) erro('sinais', 'Registro de sinais vitais' + quando + ' sem nenhum valor.');
    if (s.pas !== null && s.pad !== null && s.pad >= s.pas) {
      erro('sinais', 'Sinais vitais' + quando + ': a PA diastólica (' + s.pad + ') precisa ser menor que a sistólica (' + s.pas + ').');
    }
  });

  b.farmacos.forEach(function (f) {
    var nome = f.nome || 'Fármaco';
    if (!f.nome) erro('farmacos', 'Fármaco sem nome' + (f.hora ? ' às ' + f.hora : '') + '.');
    if (!f.hora) erro('farmacos', nome + ': falta o horário.');
    if (!f.dose) erro('farmacos', nome + ': falta a dose.');
    else {
      // A unidade tem campo próprio: aqui só cabe o valor. Dose negativa, zero ou
      // texto ("abc", "5 mg") entrava no prontuário e ia para o PDF assinado.
      var dose = paraNumero(f.dose);
      if (dose === null) erro('farmacos', nome + ': a dose "' + f.dose + '" não é um número — digite só o valor e escolha a unidade ao lado.');
      else if (dose <= 0) erro('farmacos', nome + ': a dose precisa ser maior que zero.');
      else if (dose > DOSE_MAXIMA_BOLETIM) erro('farmacos', nome + ': a dose ' + numeroBR(dose) + ' passa de ' + DOSE_MAXIMA_BOLETIM + ' — confira o valor.');
    }
    if (!f.via) erro('farmacos', nome + ': falta a via de administração.');
  });

  b.fluidos.forEach(function (f) {
    if (!f.nome) erro('fluidos', 'Fluido sem nome.');
    if (f.volume === null) erro('fluidos', (f.nome || 'Fluido') + ': falta o volume.');
  });

  b.intercorrencias.forEach(function (i) {
    if (!i.descricao) erro('intercorrencias', 'Intercorrência' + (i.hora ? ' das ' + i.hora : '') + ' sem descrição.');
  });

  if (b.semIntercorrencias && b.intercorrencias.length) {
    avisos.push({ campo: 'intercorrencias', msg: 'Há intercorrências registradas e "sem intercorrências" marcado.' });
  }

  return { ok: erros.length === 0, erros: erros, avisos: avisos };
}

/**
 * O que o boletim precisa ter para ser finalizado, com a situação de cada
 * item: [{ rotulo, ok }]. A tela mostra a lista inteira como checklist.
 */
function requisitosBoletim(b, cirurgia) {
  var t = b.tempos || {};
  var itens = [
    { rotulo: 'Anestesista responsável na cirurgia', ok: !!cirurgia && !vazio(cirurgia.anestesista) },
    { rotulo: 'Peso do paciente', ok: b.paciente.peso !== null },
    { rotulo: 'Classificação ASA', ok: !!b.pre.asa },
    { rotulo: 'Técnica anestésica', ok: b.tecnicas.length > 0 || !!b.tecnicaOutra },
    { rotulo: 'Monitorização', ok: b.monitorizacao.length > 0 },
    { rotulo: 'Início e fim da anestesia', ok: !!t.inicioAnestesia && !!t.fimAnestesia },
    { rotulo: 'Sinais vitais (pelo menos um registro)', ok: b.sinais.length > 0 },
    { rotulo: 'Intercorrências (ou "sem intercorrências")', ok: b.intercorrencias.length > 0 || b.semIntercorrencias },
    { rotulo: 'Destino do paciente', ok: !!b.destino }
  ];
  if (ehAnestesiaGeral(b)) itens.splice(4, 0, { rotulo: 'Via aérea (anestesia geral)', ok: !!b.viaAerea.dispositivo });
  return itens;
}

/** Só os itens que faltam, como texto. */
function pendenciasBoletim(b, cirurgia) {
  return requisitosBoletim(b, cirurgia).filter(function (r) { return !r.ok; }).map(function (r) { return r.rotulo; });
}

/* ============================================================== resumos */

/** Aldrete: total (0–10) quando os 5 itens foram pontuados; senão null. */
function aldreteTotal(rec) {
  var soma = 0;
  for (var i = 0; i < ALDRETE_ITENS.length; i++) {
    var v = rec ? rec[ALDRETE_ITENS[i].campo] : null;
    if (v === null || v === undefined) return null;
    soma += v;
  }
  return soma;
}

/** Números do boletim para a tela e o PDF. */
/**
 * O que os sinais vitais do boletim dizem de pior: menor SpO₂, menor PAM e maior
 * PA sistólica dos registros. A PAM sai da conta clássica (PAS + 2 × PAD) ÷ 3, só
 * dos registros que têm as duas pressões, arredondada para o mmHg inteiro. Sem
 * registro do parâmetro, o valor fica null — ausência não vira zero nem normal.
 */
function resumoSinaisBoletim(b) {
  var r = { registros: 0, spo2Minima: null, pamMinima: null, pasMaxima: null };
  ((b && b.sinais) || []).forEach(function (s) {
    r.registros++;
    var spo2 = paraNumero(s.spo2), pas = paraNumero(s.pas), pad = paraNumero(s.pad);
    if (spo2 !== null && (r.spo2Minima === null || spo2 < r.spo2Minima)) r.spo2Minima = spo2;
    if (pas !== null && (r.pasMaxima === null || pas > r.pasMaxima)) r.pasMaxima = pas;
    if (pas !== null && pad !== null) {
      var pam = Math.round((pas + 2 * pad) / 3);
      if (r.pamMinima === null || pam < r.pamMinima) r.pamMinima = pam;
    }
  });
  return r;
}

function resumoBoletim(b) {
  var entradas = b.fluidos.reduce(function (s, f) { return s + (f.volume || 0); }, 0);
  var saidas = (b.perdas.sangramento || 0) + (b.perdas.diurese || 0);
  var p = b.paciente.peso, a = b.paciente.altura;
  return {
    duracaoAnestesia: duracaoNoBoletim(b, 'inicioAnestesia', 'fimAnestesia'),
    duracaoCirurgia: duracaoNoBoletim(b, 'inicioCirurgia', 'fimCirurgia'),
    duracaoSala: duracaoNoBoletim(b, 'entradaSala', 'saidaSala'),
    entradas: entradas,
    saidas: saidas,
    temBalanco: b.fluidos.length > 0 || b.perdas.sangramento !== null || b.perdas.diurese !== null,
    balanco: entradas - saidas,
    aldrete: aldreteTotal(b.recuperacao),
    imc: p !== null && a ? Math.round((p / Math.pow(a / 100, 2)) * 10) / 10 : null
  };
}

/* ========================================================== conferência */

/**
 * Texto exato que a assinatura cobre: todo o conteúdo clínico, a
 * identificação congelada e a assinatura (sem o próprio código). Fica de
 * fora só o que é controle interno (uid, status, histórico, carimbos de
 * edição).
 */
function conteudoAssinadoBoletim(b) {
  var n = normalizarBoletim(b);
  return jsonCanonico({
    id: n.id, idCirurgia: n.idCirurgia, versao: n.versao,
    paciente: n.paciente, pre: n.pre, tecnicas: n.tecnicas, tecnicaOutra: n.tecnicaOutra,
    viaAerea: n.viaAerea, acesso: n.acesso, posicoes: n.posicoes, monitorizacao: n.monitorizacao,
    tempos: n.tempos, ventilacao: n.ventilacao, sinais: n.sinais, farmacos: n.farmacos,
    fluidos: n.fluidos, perdas: n.perdas, intercorrencias: n.intercorrencias,
    semIntercorrencias: n.semIntercorrencias, destino: n.destino, recuperacao: n.recuperacao,
    observacoes: n.observacoes, identificacao: n.identificacao,
    assinatura: n.assinatura ? { tracos: n.assinatura.tracos, nome: n.assinatura.nome,
      crm: n.assinatura.crm, quando: n.assinatura.quando } : null,
    finalizadoEm: n.finalizadoEm, finalizadoPor: n.finalizadoPor
  });
}

/** Código de conferência: 16 primeiros dígitos hexadecimais do SHA-256. */
function codigoBoletim(b) { return sha256Hex(conteudoAssinadoBoletim(b)).slice(0, 16); }

/** 'a1b2c3d4e5f60718' -> 'A1B2-C3D4-E5F6-0718', para ler em voz alta ou conferir no papel. */
function codigoLegivel(codigo) {
  return String(codigo || '').toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}

// Boletim guardado é imutável (toda mudança troca o objeto inteiro), então a
// conferência de cada objeto é feita uma vez só por sessão.
var CONFERIDOS_BOLETIM = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

/** O conteúdo de um boletim finalizado ainda confere com o código da assinatura? */
function codigoConfereBoletim(b) {
  if (!b || !b.assinatura || !b.assinatura.codigo) return false;
  if (CONFERIDOS_BOLETIM && CONFERIDOS_BOLETIM.has(b)) return CONFERIDOS_BOLETIM.get(b);
  var ok = codigoBoletim(b) === b.assinatura.codigo;
  if (CONFERIDOS_BOLETIM) CONFERIDOS_BOLETIM.set(b, ok);
  return ok;
}

/* ========================================================== construção */

/** Identificação da cirurgia, como fica congelada na assinatura. */
function identificacaoDaCirurgia(cir, crm) {
  cir = cir || {};
  return {
    idCirurgia: txt(cir.id), paciente: txt(cir.paciente), data: paraData(cir.data) || txt(cir.data),
    procedimento: txt(cir.procedimento), cirurgiao: txt(cir.cirurgiao), anestesista: txt(cir.anestesista),
    crm: txt(crm), convenio: txt(cir.convenio), sala: txt(cir.sala)
  };
}

/**
 * Boletim novo para uma cirurgia. Os horários reais já lançados na cirurgia
 * entram como início e fim da anestesia (a pessoa corrige se for o caso).
 */
function novoBoletim(id, cirurgia, usuario, quando) {
  quando = quando || agoraTexto();
  var b = normalizarBoletim({
    id: id, uid: novoUid(), idCirurgia: txt(cirurgia && cirurgia.id),
    criadoEm: quando, criadoPor: usuario, atualizadoEm: quando, atualizadoPor: usuario,
    tempos: { inicioAnestesia: cirurgia && cirurgia.inicioReal, fimAnestesia: cirurgia && cirurgia.fimReal }
  });
  return b;
}

/** Seções que a tela pode mudar num boletim em preenchimento. */
var SECOES_OBJETO_BOLETIM = ['paciente', 'pre', 'viaAerea', 'tempos', 'ventilacao', 'perdas', 'recuperacao'];
var SECOES_VALOR_BOLETIM = ['tecnicas', 'tecnicaOutra', 'acesso', 'posicoes', 'monitorizacao', 'semIntercorrencias',
  'destino', 'observacoes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Só chaves
 * conhecidas passam; identidade, situação e assinatura nunca vêm da tela.
 * Devolve { boletim, erros }.
 */
function aplicarMudancasBoletim(b, mudancas) {
  var bruto = JSON.parse(JSON.stringify(b));
  var m = ehObjeto(mudancas) ? mudancas : {};
  SECOES_OBJETO_BOLETIM.forEach(function (s) {
    if (!ehObjeto(m[s])) return;
    Object.keys(m[s]).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(bruto[s], k)) bruto[s][k] = m[s][k];
    });
  });
  SECOES_VALOR_BOLETIM.forEach(function (s) {
    if (Object.prototype.hasOwnProperty.call(m, s)) bruto[s] = m[s];
  });
  return lerBoletim(bruto, true);
}

/**
 * Inclui, altera ou remove um registro de uma lista (sinais, fármacos,
 * fluidos, intercorrências). `op`: { acao, indice, linha, conferir }.
 * `conferir` é o registro como a tela o viu: se ele mudou no meio do
 * caminho (outra pessoa, outra aba), nada é alterado.
 */
function aplicarLinhaBoletim(b, lista, op) {
  function falha(msg) { return { boletim: null, erros: [{ campo: lista, msg: msg }] }; }
  if (!LISTAS_BOLETIM[lista]) return falha('Lista do boletim desconhecida: ' + lista + '.');
  op = ehObjeto(op) ? op : {};
  var bruto = JSON.parse(JSON.stringify(b));
  var linhas = bruto[lista];

  if (op.acao === 'adicionar') {
    if (linhas.length >= LISTAS_BOLETIM[lista]) return falha('Limite de ' + LISTAS_BOLETIM[lista] + ' registros atingido.');
    linhas.push(ehObjeto(op.linha) ? op.linha : {});
  } else if (op.acao === 'alterar' || op.acao === 'remover') {
    var i = Number(op.indice);
    if (!(i >= 0 && i < linhas.length && Math.floor(i) === i)) return falha('Registro não encontrado.');
    if (op.conferir !== undefined && jsonCanonico(linhas[i]) !== jsonCanonico(op.conferir)) {
      return falha('Este registro mudou enquanto você editava. Confira a lista e tente de novo.');
    }
    if (op.acao === 'remover') linhas.splice(i, 1);
    else linhas[i] = ehObjeto(op.linha) ? op.linha : {};
  } else {
    return falha('Operação desconhecida.');
  }
  return lerBoletim(bruto, true);
}

/**
 * Boletim finalizado a partir do rascunho: identificação congelada,
 * assinatura e código de conferência. Não valida — quem chama confere
 * pendências e erros antes.
 */
function finalizacaoBoletim(b, cirurgia, assinatura, quando, usuario) {
  var f = normalizarBoletim(JSON.parse(JSON.stringify(b)));
  f.status = BOLETIM_FINALIZADO;
  f.identificacao = identificacaoDaCirurgia(cirurgia, assinatura.crm);
  f.assinatura = {
    tracos: lerTracosBoletim(assinatura.tracos), nome: txt(assinatura.nome).slice(0, 120),
    crm: txt(assinatura.crm).slice(0, 30), quando: quando, codigo: ''
  };
  f.finalizadoEm = quando;
  f.finalizadoPor = txt(usuario).slice(0, 80);
  f.atualizadoEm = quando;
  f.atualizadoPor = f.finalizadoPor;
  f = normalizarBoletim(f);
  f.assinatura.codigo = codigoBoletim(f);
  return f;
}

/** Boletim reaberto: a assinatura anterior vai para o histórico, com o motivo. */
function reaberturaBoletim(b, motivo, quando, usuario) {
  var r = normalizarBoletim(JSON.parse(JSON.stringify(b)));
  r.historico = r.historico.concat([{
    versao: r.versao, finalizadoEm: r.finalizadoEm, finalizadoPor: r.finalizadoPor,
    codigo: r.assinatura ? r.assinatura.codigo : '', reabertoEm: quando, reabertoPor: txt(usuario),
    motivo: txt(motivo).slice(0, 500)
  }]);
  r.status = BOLETIM_RASCUNHO;
  r.versao = r.versao + 1;
  r.atualizadoEm = quando;
  r.atualizadoPor = txt(usuario).slice(0, 80);
  return normalizarBoletim(r);
}

/**
 * Congela o boletim inteiro (objeto, listas e registros). O store guarda
 * boletins congelados: mudar um no lugar, sem passar pela transação,
 * quebraria o desfazer — e com o congelamento a tentativa falha na hora.
 */
function congelarBoletim(b) {
  (function congelar(o) {
    if (!o || typeof o !== 'object' || Object.isFrozen(o)) return;
    Object.freeze(o);
    Object.keys(o).forEach(function (k) { congelar(o[k]); });
  })(b);
  return b;
}

/** Sugestão da lista de fármacos pelo nome digitado (sem acento/caixa). */
function farmacoConhecido(nome) {
  return FARMACOS_BOLETIM.filter(function (f) { return mesmoTexto(f.nome, nome); })[0] || null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BOLETIM_RASCUNHO: BOLETIM_RASCUNHO,
    BOLETIM_FINALIZADO: BOLETIM_FINALIZADO,
    OPCOES_BOLETIM: OPCOES_BOLETIM,
    MONITORIZACAO_BASICA: MONITORIZACAO_BASICA,
    FARMACOS_BOLETIM: FARMACOS_BOLETIM,
    ALDRETE_ITENS: ALDRETE_ITENS,
    ALDRETE_ALTA: ALDRETE_ALTA,
    TEMPOS_BOLETIM: TEMPOS_BOLETIM,
    LIMITES_BOLETIM: LIMITES_BOLETIM,
    SINAIS_BOLETIM: SINAIS_BOLETIM,
    LISTAS_BOLETIM: LISTAS_BOLETIM,
    lerBoletim: lerBoletim,
    lerTracosBoletim: lerTracosBoletim,
    normalizarBoletim: normalizarBoletim,
    sanearBoletins: sanearBoletins,
    referenciaBoletim: referenciaBoletim,
    minutoNoBoletim: minutoNoBoletim,
    ordenarLinhasBoletim: ordenarLinhasBoletim,
    duracaoNoBoletim: duracaoNoBoletim,
    ehAnestesiaGeral: ehAnestesiaGeral,
    validarBoletim: validarBoletim,
    requisitosBoletim: requisitosBoletim,
    pendenciasBoletim: pendenciasBoletim,
    aldreteTotal: aldreteTotal,
    resumoBoletim: resumoBoletim,
    resumoSinaisBoletim: resumoSinaisBoletim,
    conteudoAssinadoBoletim: conteudoAssinadoBoletim,
    codigoBoletim: codigoBoletim,
    codigoLegivel: codigoLegivel,
    codigoConfereBoletim: codigoConfereBoletim,
    identificacaoDaCirurgia: identificacaoDaCirurgia,
    novoBoletim: novoBoletim,
    aplicarMudancasBoletim: aplicarMudancasBoletim,
    aplicarLinhaBoletim: aplicarLinhaBoletim,
    finalizacaoBoletim: finalizacaoBoletim,
    reaberturaBoletim: reaberturaBoletim,
    congelarBoletim: congelarBoletim,
    farmacoConhecido: farmacoConhecido
  };
}
