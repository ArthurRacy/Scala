/**
 * ============================================================================
 * 03_DOMINIOS — Listas fechadas (data validation) e validação de registros
 * ============================================================================
 * Os valores abaixo são os literais EXATOS das validações de dados da planilha.
 * Foram lidos do arquivo em uso, não inventados:
 *
 *   CIRURGIAS!B  -> "Agendada,Confirmada,Realizada,Cancelada,Remarcada"
 *   CIRURGIAS!K  -> "Amil,Bradesco,Assefaz,Unimed,Particular"
 *   Sim/Não      -> ANESTESISTAS!C, ESCALA*!F, CIRURGIAS!S:V, AVALIAÇÕES J:K:M
 *   FIN/IND/DASH -> "1..12" no seletor de mês
 *
 * Trocar a grafia de qualquer item aqui invalida as fórmulas SUMIFS/COUNTIFS
 * da planilha, que comparam por texto literal.
 * ============================================================================
 */

var DOMINIOS = {
  /** CIRURGIAS!STATUS — ordem igual à da lista suspensa. */
  STATUS_CIRURGIA: ['Agendada', 'Confirmada', 'Realizada', 'Cancelada', 'Remarcada'],

  /** CIRURGIAS!CONVÊNIO */
  CONVENIO: ['Amil', 'Bradesco', 'Assefaz', 'Unimed', 'Particular'],

  /** Todas as colunas booleanas. */
  SIM_NAO: ['Sim', 'Não'],

  /** Dias da ESCALA_BASE (6 dias; domingo não tem rodízio). */
  DIA_SEMANA_ESCALA: ['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'],

  /** Seletor de mês das abas de relatório. */
  MES: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],

  /* --- Valores calculados (não são lista suspensa, mas são vocabulário fixo) */

  /** CIRURGIAS!T — STATUS DA AVALIAÇÃO PRÉ-ANESTÉSICA (fórmula). */
  STATUS_AVALIACAO: ['N/A', 'Realizada', 'Pendente'],

  /** FINANCEIRO ledger, coluna TIPO. */
  TIPO_LANCAMENTO: ['Anestesia', 'Avaliação pré'],

  /** FINANCEIRO ledger, coluna STATUS DA NOTA. */
  STATUS_NOTA: ['Sem nota', 'Emitida']
};

/** Rótulos "amigáveis" para os status, usados na interface. */
var CLASSE_STATUS = {
  'Agendada':   'agendada',
  'Confirmada': 'confirmada',
  'Realizada':  'realizada',
  'Cancelada':  'cancelada',
  'Remarcada':  'remarcada'
};

/**
 * Devolve o valor canônico do domínio a partir de uma digitação livre,
 * ignorando acento e caixa. Devolve '' se não pertencer ao domínio.
 *   canonizar('STATUS_CIRURGIA', 'realizada') -> 'Realizada'
 */
function canonizar(nomeDominio, valor) {
  var lista = DOMINIOS[nomeDominio];
  if (!lista) throw new Error('Domínio desconhecido: ' + nomeDominio);
  var alvo = normalizar(valor);
  if (alvo === '') return '';
  for (var i = 0; i < lista.length; i++) {
    if (normalizar(lista[i]) === alvo) return lista[i];
  }
  return '';
}

/** true se o valor pertence ao domínio (vazio conta como válido). */
function noDominio(nomeDominio, valor) {
  if (vazio(valor)) return true;
  return canonizar(nomeDominio, valor) !== '';
}

/* ======================================================================== */
/*                            VALIDAÇÃO DE REGISTROS                        */
/* ======================================================================== */

/**
 * Cria um coletor de problemas. Separa ERRO (bloqueia gravação) de
 * AVISO (grava, mas sinaliza). Nunca lança exceção: o chamador decide.
 */
function novoRelatorio() {
  return {
    erros: [],
    avisos: [],
    erro: function (campo, msg) { this.erros.push({ campo: campo, msg: msg }); return this; },
    aviso: function (campo, msg) { this.avisos.push({ campo: campo, msg: msg }); return this; },
    get ok() { return this.erros.length === 0; },
    resumo: function () {
      return this.erros.map(function (e) { return e.msg; })
        .concat(this.avisos.map(function (a) { return a.msg; })).join(' | ');
    }
  };
}

/**
 * Valida uma cirurgia. `ctx` traz { nomesAnestesistas: [...] } para conferir
 * se o anestesista digitado existe no cadastro (TASK-201).
 */
function validarCirurgia(c, ctx) {
  ctx = ctx || {};
  var r = novoRelatorio();

  if (vazio(c.data)) r.erro('data', 'DATA DA CIRURGIA é obrigatória.');
  else if (!dataValida(c.data)) r.erro('data', 'DATA DA CIRURGIA inválida: ' + c.data);

  if (vazio(c.paciente)) r.erro('paciente', 'NOME DO PACIENTE é obrigatório.');

  if (!noDominio('STATUS_CIRURGIA', c.status)) {
    r.erro('status', 'STATUS fora da lista: ' + c.status + ' (use ' + DOMINIOS.STATUS_CIRURGIA.join(', ') + ').');
  }
  if (!noDominio('CONVENIO', c.convenio)) {
    r.aviso('convenio', 'CONVÊNIO fora da lista: ' + c.convenio + '.');
  }

  // TASK-201: anestesista restrito aos nomes do cadastro.
  if (!vazio(c.anestesista) && ctx.nomesAnestesistas) {
    var achou = ctx.nomesAnestesistas.some(function (n) { return mesmoTexto(n, c.anestesista); });
    if (!achou) r.erro('anestesista', 'ANESTESISTA "' + c.anestesista + '" não existe no cadastro.');
  }
  if (!vazio(c.anestesista) && ctx.nomesInativos &&
      ctx.nomesInativos.some(function (n) { return mesmoTexto(n, c.anestesista); })) {
    r.aviso('anestesista', txt(c.anestesista) + ' está marcado como INATIVO no cadastro.');
  }

  // Duas cirurgias do mesmo anestesista se cruzando: aviso na hora, não bloqueio
  // (a Integridade só mostrava isso depois de gravado).
  if (ctx.cirurgias) {
    conflitosDaCirurgia(c, ctx.cirurgias).forEach(function (o) {
      r.aviso('anestesista', txt(c.anestesista) + ' já tem a cirurgia ' + txt(o.id) + ' (' + paraHora(o.inicioPrev) + '–' +
        paraHora(o.fimPrev) + ') que se sobrepõe a este horário.');
    });
  }

  var realizada = mesmoTexto(c.status, CONFIG.STATUS_EXECUTADO);
  if (realizada && vazio(c.anestesista)) {
    r.aviso('anestesista', 'Cirurgia Realizada sem ANESTESISTA — as horas e a produção não vão para ninguém.');
  }
  if (realizada && dataValida(c.data) && paraData(c.data) > hojeISO()) {
    r.aviso('status', 'Cirurgia marcada como Realizada com data futura (' + dataBR(c.data) + ') — confira o status ou a data.');
  }

  // Horários: formato e coerência.
  ['inicioPrev', 'fimPrev', 'inicioReal', 'fimReal'].forEach(function (campo) {
    if (!vazio(c[campo]) && paraHora(c[campo]) === '') {
      r.erro(campo, 'Hora inválida em ' + campo + ': ' + c[campo] + ' (use HH:MM).');
    }
  });

  if (!vazio(c.inicioPrev) && paraHora(c.inicioPrev) !== '' && paraHora(c.inicioPrev) === paraHora(c.fimPrev)) {
    r.aviso('fimPrev', 'Término previsto igual ao início — a duração estimada fica zero.');
  }

  var dur = duracaoHoras(c.inicioReal, c.fimReal);
  if (dur !== null && dur > CONFIG.DURACAO_MAXIMA_HORAS) {
    r.aviso('fimReal', 'TEMPO REAL de ' + horasTexto(dur) + ' excede o teto de ' + CONFIG.DURACAO_MAXIMA_HORAS + 'h — confira os horários.');
  }

  // Um só lado do horário real preenchido: a duração não fecha.
  if (vazio(c.inicioReal) !== vazio(c.fimReal)) {
    r.aviso('fimReal', 'Horário real incompleto: preencha início E término para contar TEMPO REAL.');
  }

  // TASK-401: cirurgia executada sem horário real é pendência, não erro.
  if (mesmoTexto(c.status, CONFIG.STATUS_EXECUTADO) && (vazio(c.inicioReal) || vazio(c.fimReal))) {
    r.aviso('fimReal', 'Cirurgia Realizada sem horário real completo — entra em CIRURGIAS SEM HORÁRIO REAL PREENCHIDO.');
  }

  if (!noDominio('SIM_NAO', c.avaliacaoNec)) r.erro('avaliacaoNec', 'AVALIAÇÃO PRÉ NECESSÁRIA? deve ser Sim ou Não.');
  if (!noDominio('SIM_NAO', c.pago)) r.erro('pago', 'PAGO? deve ser Sim ou Não.');

  var valor = paraNumero(c.valor);
  if (!vazio(c.valor) && valor === null) r.erro('valor', 'VALOR DA ANESTESIA inválido: ' + c.valor + '.');
  if (valor !== null && valor < 0) r.erro('valor', 'VALOR DA ANESTESIA não pode ser negativo.');

  if (ehSim(c.pago) && valor === null) {
    r.aviso('valor', 'Marcado como PAGO sem VALOR DA ANESTESIA preenchido.');
  }
  if (!vazio(c.dataPagamento) && !dataValida(c.dataPagamento)) {
    r.erro('dataPagamento', 'DATA DO PAGAMENTO inválida: ' + c.dataPagamento);
  }

  return r;
}

/** Valida uma avaliação pré-anestésica. */
function validarAvaliacao(a, ctx) {
  ctx = ctx || {};
  var r = novoRelatorio();

  if (vazio(a.idCirurgia)) r.erro('idCirurgia', 'ID_CIRURGIA é obrigatório — a avaliação sempre pertence a uma cirurgia.');
  else if (ctx.idsCirurgia && ctx.idsCirurgia.indexOf(txt(a.idCirurgia)) < 0) {
    r.erro('idCirurgia', 'ID_CIRURGIA "' + a.idCirurgia + '" não existe em CIRURGIAS.');
  }

  // TASK-303: anestesista da avaliação restrito ao cadastro.
  if (!vazio(a.anestesista) && ctx.nomesAnestesistas) {
    var achou = ctx.nomesAnestesistas.some(function (n) { return mesmoTexto(n, a.anestesista); });
    if (!achou) r.erro('anestesista', 'ANESTESISTA DA AVALIAÇÃO "' + a.anestesista + '" não existe no cadastro.');
  }

  if (!vazio(a.data) && !dataValida(a.data)) r.erro('data', 'DATA DA AVALIAÇÃO inválida: ' + a.data);
  if (!vazio(a.hora) && paraHora(a.hora) === '') r.erro('hora', 'HORA DA AVALIAÇÃO inválida: ' + a.hora + ' (use HH:MM).');

  ['realizada', 'tcle', 'pago'].forEach(function (campo) {
    if (!noDominio('SIM_NAO', a[campo])) r.erro(campo, campo + ' deve ser Sim ou Não.');
  });

  if (ehSim(a.realizada) && vazio(a.anestesista)) {
    r.aviso('anestesista', 'Avaliação marcada como realizada sem ANESTESISTA DA AVALIAÇÃO.');
  }
  if (ehSim(a.realizada) && vazio(a.data)) {
    r.aviso('data', 'Avaliação marcada como realizada sem DATA DA AVALIAÇÃO — o mês de competência fica o da cirurgia.');
  }

  var valor = paraNumero(a.valor);
  if (!vazio(a.valor) && valor === null) r.erro('valor', 'VALOR DA AVALIAÇÃO inválido: ' + a.valor + '.');
  if (valor !== null && valor < 0) r.erro('valor', 'VALOR DA AVALIAÇÃO não pode ser negativo.');

  // A consulta pré-anestésica vem ANTES da cirurgia (ou no mesmo dia).
  if (dataValida(a.data) && dataValida(a.dataCirurgia) && paraData(a.data) > paraData(a.dataCirurgia)) {
    r.aviso('data', 'DATA DA AVALIAÇÃO (' + dataBR(a.data) + ') é posterior à cirurgia (' +
      dataBR(a.dataCirurgia) + ') — confira.');
  }
  if (ehSim(a.pago) && valor === null) r.aviso('valor', 'Marcada como PAGO sem VALOR DA AVALIAÇÃO preenchido.');
  if (!vazio(a.dataPagamento) && !dataValida(a.dataPagamento)) {
    r.erro('dataPagamento', 'DATA DO PAGAMENTO inválida: ' + a.dataPagamento);
  }

  return r;
}

/** Valida um anestesista do cadastro. */
function validarAnestesista(a, ctx) {
  ctx = ctx || {};
  var r = novoRelatorio();

  if (vazio(a.id)) r.erro('id', 'ID_ANESTESISTA é obrigatório.');
  else if (!/^A\d{2}$/.test(txt(a.id))) r.aviso('id', 'ID_ANESTESISTA fora do padrão A01–A15: ' + a.id);

  if (vazio(a.nome)) r.erro('nome', 'NOME é obrigatório.');
  if (!noDominio('SIM_NAO', a.ativo)) r.erro('ativo', 'ATIVO deve ser Sim ou Não.');

  if (!vazio(a.email) && txt(a.email).indexOf('@') < 0) r.aviso('email', 'E-MAIL sem "@": ' + a.email);

  // Nome duplicado é grave: as chaves DATA+ANESTESISTA e os SUMIFS usam o nome.
  if (ctx.outrosNomes && ctx.outrosNomes.some(function (n) { return mesmoTexto(n, a.nome); })) {
    r.erro('nome', 'NOME duplicado: "' + a.nome + '". Os vínculos da planilha usam o nome como chave.');
  }
  if (ctx.outrosIds && ctx.outrosIds.indexOf(txt(a.id)) >= 0) {
    r.erro('id', 'ID_ANESTESISTA duplicado: ' + a.id);
  }

  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOMINIOS: DOMINIOS, CLASSE_STATUS: CLASSE_STATUS,
    canonizar: canonizar, noDominio: noDominio, novoRelatorio: novoRelatorio,
    validarCirurgia: validarCirurgia, validarAvaliacao: validarAvaliacao,
    validarAnestesista: validarAnestesista
  };
}
