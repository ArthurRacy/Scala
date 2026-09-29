/**
 * ============================================================================
 * 11_LOG — Audit trail de alterações críticas
 * ============================================================================
 * Reproduz a aba LOG: DATA/HORA | USUÁRIO | ABA | ID_CIRURGIA | CAMPO ALTERADO
 *                     | VALOR ANTERIOR | NOVO VALOR
 *
 * O que é "crítico" está em CAMPOS_CRITICOS: são os campos que mexem em
 * dinheiro, em responsabilidade clínica ou na identidade do registro. Mudança
 * de observação não polui o log.
 *
 * O log é APPEND-ONLY. Nada aqui edita ou remove linha registrada — é o que
 * torna a trilha confiável.
 * ============================================================================
 */

/**
 * Campos que geram registro, por aba lógica.
 * O valor é o rótulo da coluna na planilha — é ele que vai para o log, para
 * que a trilha fique legível por quem só conhece a planilha.
 */
var CAMPOS_CRITICOS = {
  CIRURGIAS: {
    status: 'STATUS',
    data: 'DATA DA CIRURGIA',
    anestesista: 'ANESTESISTA',
    paciente: 'NOME DO PACIENTE',
    procedimento: 'PROCEDIMENTO/CIRURGIA',
    inicioReal: 'HORA INÍCIO REAL',
    fimReal: 'HORA TÉRMINO REAL',
    valor: 'VALOR DA ANESTESIA',
    pago: 'PAGO?',
    dataPagamento: 'DATA DO PAGAMENTO',
    nf: 'NÚMERO DA NOTA FISCAL',
    avaliacaoNec: 'AVALIAÇÃO PRÉ NECESSÁRIA?'
  },
  AVALIACOES_PRE: {
    idCirurgia: 'ID_CIRURGIA',
    anestesista: 'ANESTESISTA DA AVALIAÇÃO',
    data: 'DATA DA AVALIAÇÃO',
    realizada: 'REALIZADA? (Sim/Não)',
    tcle: 'TCLE ASSINADO? (Sim/Não)',
    valor: 'VALOR DA AVALIAÇÃO',
    pago: 'PAGO? (Sim/Não)',
    dataPagamento: 'DATA DO PAGAMENTO',
    nf: 'NÚMERO DA NOTA FISCAL'
  },
  ANESTESISTAS: {
    id: 'ID_ANESTESISTA',
    nome: 'NOME',
    ativo: 'ATIVO (Sim/Não)',
    // Para onde vai o repasse: trocar a chave de alguém sem deixar rastro é
    // o golpe mais simples possível num sistema de pagamento.
    pix: 'CHAVE PIX',
    // Vai para a assinatura do boletim anestésico.
    crm: 'CRM'
  },
  ESCALA_MENSAL: {
    ajuste: 'AJUSTE MANUAL? (Sim/Não)',
    substituto: 'ANESTESISTA SUBSTITUTO (se ajuste)',
    motivo: 'MOTIVO DO AJUSTE'
  }
};

/** Valor -> texto legível no log ('(vazio)' quando não há valor). */
function valorParaLog(v) {
  if (v === null || v === undefined || v === '') return '(vazio)';
  if (typeof v === 'number') return String(v);
  return txt(v);
}

/**
 * Cria uma entrada de log. `aba` é o NOME DA ABA na planilha (não o lógico),
 * para que a trilha aponte para onde o usuário realmente vai olhar.
 */
function novaEntradaLog(dados) {
  return {
    quando: dados.quando || agoraTexto(),
    usuario: txt(dados.usuario) || CONFIG.USUARIO_PADRAO,
    aba: txt(dados.aba),
    idCirurgia: txt(dados.idCirurgia),
    campo: txt(dados.campo),
    de: valorParaLog(dados.de),
    para: valorParaLog(dados.para)
  };
}

/**
 * Compara duas versões de um registro e devolve as entradas de log das
 * alterações críticas. Só registra diferença real: mesmo valor com formatação
 * diferente ('7:00' x '07:00') não vira linha de log.
 *
 * `abaLogica` indexa CAMPOS_CRITICOS; `abaPlanilha` é o texto gravado.
 * `idCirurgia` amarra a linha à cirurgia — em AVALIAÇÕES é o ID_CIRURGIA dela,
 * em ANESTESISTAS fica o próprio ID do anestesista (a coluna é a mesma).
 */
function diffParaLog(abaLogica, antes, depois, contexto) {
  contexto = contexto || {};
  var criticos = CAMPOS_CRITICOS[abaLogica] || {};
  var entradas = [];

  var abaPlanilha = contexto.abaPlanilha ||
    (SCHEMA[abaLogica] && SCHEMA[abaLogica].aba) || abaLogica;

  Object.keys(criticos).forEach(function (campo) {
    var de = (antes || {})[campo];
    var para = (depois || {})[campo];

    if (valorParaLog(de) === valorParaLog(para)) return;

    entradas.push(novaEntradaLog({
      quando: contexto.quando,
      usuario: contexto.usuario,
      aba: abaPlanilha,
      idCirurgia: contexto.idCirurgia !== undefined ? contexto.idCirurgia
        : ((depois || {}).idCirurgia || (depois || {}).id || (antes || {}).id || ''),
      campo: criticos[campo],
      de: de,
      para: para
    }));
  });

  return entradas;
}

/** Entrada para criação de registro (não há "valor anterior"). */
function logCriacao(abaLogica, registro, contexto) {
  contexto = contexto || {};
  var abaPlanilha = contexto.abaPlanilha ||
    (SCHEMA[abaLogica] && SCHEMA[abaLogica].aba) || abaLogica;

  return novaEntradaLog({
    quando: contexto.quando,
    usuario: contexto.usuario,
    aba: abaPlanilha,
    idCirurgia: contexto.idCirurgia !== undefined ? contexto.idCirurgia
      : (registro.idCirurgia || registro.id || ''),
    campo: contexto.campo || 'REGISTRO CRIADO',
    de: '',
    para: registro.id || ''
  });
}

/**
 * Resumo legível do registro excluído — vai para o LOG, que é o único lugar
 * onde o dado continua existindo depois da exclusão (junto com os backups).
 */
function resumoDoRegistro(registro) {
  var r = registro || {};
  var partes = [txt(r.id)];
  if (!vazio(r.paciente)) partes.push(txt(r.paciente));
  var data = r.data || r.dataCirurgia;
  if (!vazio(data)) partes.push(dataBR(data) || txt(data));
  if (!vazio(r.procedimento || r.nomeCirurgia)) partes.push(txt(r.procedimento || r.nomeCirurgia));
  if (!vazio(r.anestesista)) partes.push(txt(r.anestesista));
  if (paraNumero(r.valor) !== null) partes.push(moedaBR(r.valor) + (ehSim(r.pago) ? ' (pago)' : ''));
  if (!vazio(r.nf)) partes.push('NF ' + txt(r.nf));
  return partes.filter(function (p) { return p; }).join(' · ');
}

/** Entrada para exclusão de registro, com o resumo do que foi apagado. */
function logExclusao(abaLogica, registro, contexto) {
  contexto = contexto || {};
  var abaPlanilha = contexto.abaPlanilha ||
    (SCHEMA[abaLogica] && SCHEMA[abaLogica].aba) || abaLogica;

  return novaEntradaLog({
    quando: contexto.quando,
    usuario: contexto.usuario,
    aba: abaPlanilha,
    idCirurgia: contexto.idCirurgia !== undefined ? contexto.idCirurgia
      : (registro.idCirurgia || registro.id || ''),
    campo: contexto.campo || 'REGISTRO EXCLUÍDO',
    de: resumoDoRegistro(registro),
    para: ''
  });
}

/**
 * Filtra o log. Aceita { idCirurgia, aba, usuario, campo, de, ate, texto }.
 * `de`/`ate` comparam a parte de data do timestamp.
 */
function filtrarLog(log, filtro) {
  filtro = filtro || {};

  return (log || []).filter(function (l) {
    if (filtro.idCirurgia && !mesmoTexto(l.idCirurgia, filtro.idCirurgia)) return false;
    if (filtro.aba && !mesmoTexto(l.aba, filtro.aba)) return false;
    if (filtro.usuario && !mesmoTexto(l.usuario, filtro.usuario)) return false;
    if (filtro.campo && !mesmoTexto(l.campo, filtro.campo)) return false;

    var dia = txt(l.quando).slice(0, 10);
    if (filtro.de && dia < paraData(filtro.de)) return false;
    if (filtro.ate && dia > paraData(filtro.ate)) return false;

    if (filtro.texto) {
      var alvo = normalizar([l.aba, l.idCirurgia, l.campo, l.de, l.para, l.usuario].join(' '));
      if (alvo.indexOf(normalizar(filtro.texto)) < 0) return false;
    }
    return true;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CAMPOS_CRITICOS: CAMPOS_CRITICOS,
    valorParaLog: valorParaLog,
    novaEntradaLog: novaEntradaLog,
    diffParaLog: diffParaLog,
    logCriacao: logCriacao,
    logExclusao: logExclusao,
    resumoDoRegistro: resumoDoRegistro,
    filtrarLog: filtrarLog
  };
}
