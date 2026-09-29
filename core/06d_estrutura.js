/**
 * ============================================================================
 * 06D_ESTRUTURA — Indicadores de estrutura (área da coordenação)
 * ============================================================================
 * Registro por UNIDADE, SALA, TURNO e DATA: equipamentos, carro de parada,
 * quantos anestesiologistas e quantas salas funcionando, sangue e
 * hemoderivados, treinamentos e simulações.
 *
 * O ponto do módulo é NÃO obrigar cada anestesista a repetir o estado da
 * unidade em todo paciente: a coordenação registra uma vez por turno e
 * `estruturaDoAtendimento` liga o registro ao atendimento pela data, pela
 * unidade, pela sala e pelo horário. O vínculo é automático só quando é
 * inequívoco; se houver mais de um registro compatível, vence o mais
 * específico (sala > unidade > geral).
 *
 * Não é aba da planilha: é dado próprio do sistema (estado.estrutura).
 * ============================================================================
 */

/** Turnos. 'Dia inteiro' cobre os três, para quem registra uma vez por dia. */
var TURNOS_ESTRUTURA = ['Manhã', 'Tarde', 'Noite', 'Dia inteiro'];

/** Faixa de horas de cada turno, usada para casar o registro com o atendimento. */
var FAIXAS_TURNO = {
  'Manhã': [0, 719],          // até 11:59
  'Tarde': [720, 1079],       // 12:00 às 17:59
  'Noite': [1080, 1439],      // 18:00 às 23:59
  'Dia inteiro': [0, 1439]
};

/**
 * Itens de equipamento conferidos. `critico: true` entra no indicador de
 * disponibilidade de equipamento essencial.
 */
var ITENS_ESTRUTURA = [
  { chave: 'capnografo', rotulo: 'Capnógrafo', critico: true },
  { chave: 'monitor', rotulo: 'Monitor multiparamétrico', critico: true },
  { chave: 'aparelhoAnestesia', rotulo: 'Aparelho de anestesia', critico: true },
  { chave: 'oximetro', rotulo: 'Oxímetro de pulso', critico: true },
  { chave: 'aspirador', rotulo: 'Aspirador', critico: true },
  { chave: 'fonteOxigenio', rotulo: 'Fonte de oxigênio e reserva', critico: true },
  { chave: 'viaAereaDificil', rotulo: 'Carrinho de via aérea difícil', critico: true },
  { chave: 'desfibrilador', rotulo: 'Desfibrilador', critico: true },
  { chave: 'aquecimento', rotulo: 'Manta ou aquecedor de fluidos', critico: false },
  { chave: 'bombaInfusao', rotulo: 'Bomba de infusão', critico: false },
  { chave: 'tof', rotulo: 'Monitor de bloqueio neuromuscular (TOF)', critico: false },
  { chave: 'profundidade', rotulo: 'Monitor de profundidade anestésica', critico: false }
];

/** Situação de cada item. Vazio = não verificado (nunca lido como "tudo bem"). */
var SITUACOES_ITEM = ['Disponível e funcionando', 'Disponível com restrição', 'Indisponível', 'Não se aplica'];

/**
 * Faixas dos números deste módulo. Moram em LIMITES_QUALIDADE (06c) porque o
 * leitor é o mesmo — aqui fica só o apontamento, para quem lê o arquivo.
 */
var LIMITES_ESTRUTURA = {
  anestesiologistas: LIMITES_QUALIDADE.anestesiologistas,
  salas: LIMITES_QUALIDADE.salas,
  participantes: LIMITES_QUALIDADE.participantes,
  horas: LIMITES_QUALIDADE.horas
};

var LISTAS_ESTRUTURA = { treinamentos: 40 };

/* ================================================================ leitura */

function lerRegistroEstrutura(r, estrito) {
  r = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  var L = leitorQualidade(estrito);
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

  var carro = obj(r.carroParada), sangue = obj(r.sangue), eq = obj(r.equipamentos);

  var n = {
    id: L.texto(r.id, 20),
    uid: L.texto(r.uid, 40),
    data: L.data(r.data, 'Data do registro de estrutura'),
    turno: L.opcao(r.turno, TURNOS_ESTRUTURA, 'Turno'),
    unidade: L.texto(r.unidade, 80),
    sala: L.texto(r.sala, 40),

    equipamentos: {},

    carroParada: {
      disponivel: L.resposta(carro.disponivel, 'Carro de parada disponível'),
      checado: L.resposta(carro.checado, 'Carro de parada checado'),
      dataChecagem: L.data(carro.dataChecagem, 'Data da checagem do carro de parada'),
      pendencias: L.texto(carro.pendencias, 500)
    },

    anestesiologistas: L.numero(r.anestesiologistas, 'anestesiologistas'),
    salasFuncionando: L.numero(r.salasFuncionando, 'salas'),

    sangue: {
      disponivel: L.resposta(sangue.disponivel, 'Sangue e hemoderivados disponíveis'),
      reservaProcedimentoRisco: L.resposta(sangue.reservaProcedimentoRisco, 'Reserva para procedimento de risco'),
      obs: L.texto(sangue.obs, 500)
    },

    treinamentos: (Array.isArray(r.treinamentos) ? r.treinamentos : [])
      .filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); })
      .slice(0, LISTAS_ESTRUTURA.treinamentos)
      .map(function (t) {
        return {
          data: L.data(t.data, 'Data do treinamento'),
          tema: L.texto(t.tema, 160),
          tipo: L.opcao(t.tipo, ['Treinamento', 'Simulação de emergência'], 'Tipo') || 'Treinamento',
          participantes: L.texto(t.participantes, 1000),
          numParticipantes: L.numero(t.numParticipantes, 'participantes'),
          horas: L.numero(t.horas, 'horas')
        };
      }),

    obs: L.texto(r.obs, 1000),
    registradoEm: L.texto(r.registradoEm, 19),
    registradoPor: L.texto(r.registradoPor, 80),
    atualizadoEm: L.texto(r.atualizadoEm, 19),
    atualizadoPor: L.texto(r.atualizadoPor, 80)
  };

  ITENS_ESTRUTURA.forEach(function (i) {
    n.equipamentos[i.chave] = L.opcao(eq[i.chave], SITUACOES_ITEM, i.rotulo);
  });

  return { registro: n, erros: L.erros };
}

function normalizarRegistroEstrutura(r) { return lerRegistroEstrutura(r, false).registro; }

/** Lista de registros de um backup: só o que tem data passa. */
function sanearEstrutura(lista) {
  return (Array.isArray(lista) ? lista : []).filter(function (r) {
    return r && typeof r === 'object' && !Array.isArray(r) && !vazio(r.data);
  }).map(normalizarRegistroEstrutura);
}

/* ============================================================= validação */

function validarRegistroEstrutura(r) {
  var erros = [], avisos = [];
  function erro(campo, msg) { erros.push({ campo: campo, msg: msg }); }

  if (!r.data) erro('data', 'Informe a data do registro.');
  if (!r.turno) erro('turno', 'Escolha o turno.');
  if (!r.unidade) erro('unidade', 'Informe a unidade.');

  if (r.carroParada.checado === RESPOSTA_SIM && !r.carroParada.dataChecagem) {
    erro('carroParada.dataChecagem', 'Carro de parada checado: informe a data da checagem.');
  }
  if (r.salasFuncionando !== null && r.anestesiologistas !== null &&
      r.salasFuncionando > 0 && r.anestesiologistas === 0) {
    avisos.push({ campo: 'anestesiologistas', msg: 'Há salas em funcionamento e nenhum anestesiologista registrado.' });
  }
  r.treinamentos.forEach(function (t) {
    if (!t.tema) erro('treinamentos', 'Treinamento sem tema.');
    if (!t.data) erro('treinamentos', (t.tema || 'Treinamento') + ': falta a data.');
  });

  ITENS_ESTRUTURA.filter(function (i) { return i.critico; }).forEach(function (i) {
    if (!r.equipamentos[i.chave]) {
      avisos.push({ campo: 'equipamentos', msg: i.rotulo + ' ainda não foi verificado neste registro.' });
    }
  });

  return { ok: erros.length === 0, erros: erros, avisos: avisos };
}

/* ============================================================== vínculo */

/**
 * Registro de estrutura que cobre um atendimento.
 * Casa por data; depois, do mais específico para o mais geral:
 *   1. mesma unidade e mesma sala;
 *   2. mesma unidade (sem sala no registro);
 *   3. registro sem unidade (vale para a casa toda).
 * Entre os candidatos, vence o turno que contém o horário do atendimento;
 * na falta dele, "Dia inteiro". Devolve null quando nada casa.
 */
function estruturaDoAtendimento(registros, ficha, cirurgia) {
  var data = paraData(cirurgia && cirurgia.data);
  if (!data) return null;
  var unidade = txt(ficha && ficha.atendimento && ficha.atendimento.unidade);
  var sala = txt(ficha && ficha.atendimento && ficha.atendimento.sala) || txt(cirurgia && cirurgia.sala);
  var minuto = horaParaMinutos((ficha && ficha.atendimento && ficha.atendimento.inicioAnestesia) ||
    (cirurgia && cirurgia.inicioReal) || (cirurgia && cirurgia.inicioPrev));

  function nivel(r) {
    if (!vazio(r.sala) && mesmoTexto(r.sala, sala) && (vazio(r.unidade) || mesmoTexto(r.unidade, unidade))) return 3;
    if (vazio(r.sala) && !vazio(r.unidade) && mesmoTexto(r.unidade, unidade)) return 2;
    if (vazio(r.sala) && vazio(r.unidade)) return 1;
    return 0;
  }

  function cobreHorario(r) {
    if (r.turno === 'Dia inteiro' || !r.turno) return true;
    if (minuto === null) return false;
    var faixa = FAIXAS_TURNO[r.turno];
    return !!faixa && minuto >= faixa[0] && minuto <= faixa[1];
  }

  var candidatos = (registros || []).filter(function (r) { return r.data === data && nivel(r) > 0; });
  if (!candidatos.length) return null;

  candidatos.sort(function (a, b) {
    var na = nivel(a), nb = nivel(b);
    if (na !== nb) return nb - na;
    var ta = (a.turno === 'Dia inteiro' ? 0 : 1), tb = (b.turno === 'Dia inteiro' ? 0 : 1);
    return tb - ta;   // turno específico antes de "dia inteiro"
  });

  var certo = candidatos.filter(cobreHorario)[0];
  return certo || candidatos.filter(function (r) { return r.turno === 'Dia inteiro'; })[0] || null;
}

/* ============================================================== resumos */

/**
 * Consolidado dos registros de estrutura de um período, para o painel.
 * Conta SEMPRE contra o total verificado, nunca contra o total de registros:
 * item não verificado não é item disponível nem item em falta.
 */
function resumoEstrutura(registros) {
  registros = registros || [];
  var itens = ITENS_ESTRUTURA.map(function (i) {
    var verificados = 0, disponiveis = 0, indisponiveis = 0;
    registros.forEach(function (r) {
      var v = r.equipamentos[i.chave];
      if (!v || v === 'Não se aplica') return;
      verificados++;
      if (v === 'Disponível e funcionando') disponiveis++;
      if (v === 'Indisponível') indisponiveis++;
    });
    return {
      chave: i.chave, rotulo: i.rotulo, critico: i.critico,
      verificados: verificados, disponiveis: disponiveis, indisponiveis: indisponiveis,
      naoVerificados: registros.length - verificados,
      taxa: verificados ? Math.round((disponiveis / verificados) * 1000) / 10 : null
    };
  });

  function contar(fn) { return registros.filter(fn).length; }
  var carroRespondido = contar(function (r) { return r.carroParada.checado === RESPOSTA_SIM || r.carroParada.checado === RESPOSTA_NAO; });
  var sangueRespondido = contar(function (r) { return r.sangue.disponivel === RESPOSTA_SIM || r.sangue.disponivel === RESPOSTA_NAO; });

  var treinamentos = [];
  registros.forEach(function (r) {
    r.treinamentos.forEach(function (t) {
      treinamentos.push({ data: t.data, tema: t.tema, tipo: t.tipo, participantes: t.participantes,
        numParticipantes: t.numParticipantes, horas: t.horas, unidade: r.unidade, registro: r.id });
    });
  });
  treinamentos.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });

  var comNumeros = registros.filter(function (r) { return r.anestesiologistas !== null && r.salasFuncionando !== null; });
  var razao = null;
  if (comNumeros.length) {
    var an = comNumeros.reduce(function (s, r) { return s + r.anestesiologistas; }, 0);
    var sl = comNumeros.reduce(function (s, r) { return s + r.salasFuncionando; }, 0);
    razao = sl ? Math.round((an / sl) * 100) / 100 : null;
  }

  return {
    registros: registros.length,
    itens: itens,
    carro: {
      respondidos: carroRespondido,
      checados: contar(function (r) { return r.carroParada.checado === RESPOSTA_SIM; }),
      taxa: carroRespondido ? Math.round((contar(function (r) { return r.carroParada.checado === RESPOSTA_SIM; }) / carroRespondido) * 1000) / 10 : null,
      naoVerificados: registros.length - carroRespondido
    },
    sangue: {
      respondidos: sangueRespondido,
      disponiveis: contar(function (r) { return r.sangue.disponivel === RESPOSTA_SIM; }),
      taxa: sangueRespondido ? Math.round((contar(function (r) { return r.sangue.disponivel === RESPOSTA_SIM; }) / sangueRespondido) * 1000) / 10 : null,
      naoVerificados: registros.length - sangueRespondido
    },
    equipe: {
      registros: comNumeros.length,
      anestesiologistasPorSala: razao,
      maiorNumeroDeSalas: registros.reduce(function (m, r) {
        return r.salasFuncionando !== null ? Math.max(m, r.salasFuncionando) : m;
      }, 0)
    },
    treinamentos: treinamentos
  };
}

/** Registro novo, com os campos de identificação já preenchidos. */
function novoRegistroEstrutura(id, dados, usuario, quando) {
  quando = quando || agoraTexto();
  var base = normalizarRegistroEstrutura(dados);
  base.id = id;
  base.uid = novoUid();
  base.registradoEm = quando;
  base.registradoPor = txt(usuario).slice(0, 80);
  base.atualizadoEm = quando;
  base.atualizadoPor = base.registradoPor;
  return base;
}

function congelarRegistroEstrutura(r) { return congelarFicha(r); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TURNOS_ESTRUTURA: TURNOS_ESTRUTURA,
    FAIXAS_TURNO: FAIXAS_TURNO,
    ITENS_ESTRUTURA: ITENS_ESTRUTURA,
    SITUACOES_ITEM: SITUACOES_ITEM,
    LIMITES_ESTRUTURA: LIMITES_ESTRUTURA,
    LISTAS_ESTRUTURA: LISTAS_ESTRUTURA,
    lerRegistroEstrutura: lerRegistroEstrutura,
    normalizarRegistroEstrutura: normalizarRegistroEstrutura,
    sanearEstrutura: sanearEstrutura,
    validarRegistroEstrutura: validarRegistroEstrutura,
    estruturaDoAtendimento: estruturaDoAtendimento,
    resumoEstrutura: resumoEstrutura,
    novoRegistroEstrutura: novoRegistroEstrutura,
    congelarRegistroEstrutura: congelarRegistroEstrutura
  };
}
