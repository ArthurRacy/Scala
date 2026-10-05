/**
 * Teste aleatório do núcleo (store): chama as operações que gravam e as que só leem, com dados plausíveis e absurdos.
 *
 * Confere, a cada chamada:
 *   1. não lança exceção para fora;
 *   2. nenhum resultado "Erro interno" (exceção engolida pela transação = defeito do código, não do usuário);
 *   3. operação RECUSADA não muda nada no estado; operação de LEITURA nunca muda o estado;
 *   4. o estado continua sendo JSON válido;
 *   5. a cada N chamadas: a verificação de integridade não ganha problemas novos;
 *   6. repetir as operações aceitas (mesmo contexto) numa réplica dá EXATAMENTE o mesmo estado
 *      (é o que faz o modelo "o servidor refaz o comando" funcionar).
 *
 * Uso: node tools/aleatorio_store.js [sementes=12] [operacoes=1500]
 *      SO=7 roda só a semente 7 · INICIO=100 começa na semente 100 · DIAG=1 mostra por que cada operação foi recusada
 * O qa/33 roda uma versão curta. Para uma varredura funda, rode vários destes em paralelo com INICIO diferentes.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var RAIZ = path.join(__dirname, '..');
var core = require(path.join(RAIZ, 'core'));
var seedBruto = fs.readFileSync(path.join(RAIZ, 'data', 'seed.json'), 'utf8');

var SEMENTES = Number(process.argv[2]) || 12;
var OPERACOES = Number(process.argv[3]) || 1500;
var INICIO = Number(process.env.INICIO) || 1;
var A_CADA = 40;   // intervalo da conferência de integridade

/* ------------------------------------------------------------ sorteio -- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

var rnd;
function r() { return rnd(); }
function inteiro(a, b) { return a + Math.floor(r() * (b - a + 1)); }
function escolhe(lista) { return lista[Math.floor(r() * lista.length)]; }
function chance(p) { return r() < p; }
function pad(n) { return (n < 10 ? '0' : '') + n; }

/* --------------------------------------------------- valores absurdos -- */
var GRANDE = new Array(3001).join('x');
var ABSURDOS = [
  null, undefined, NaN, Infinity, -Infinity, -1, 0, 1, 0.5, 1e21, -1e21, 1e308, 2147483648, 9007199254740993,
  '', ' ', '   ', '\n', '\u0000', '0', '-1', '1e3', '0x10', '1,5', '1.234,56', '1.234', 'abc', '2026-02-30', '2026-13-01',
  '0000-00-00', '9999-99-99', '2026-10-1', '24:00', '24:61', '99:99', '7:5', '-7:00', '12:30:45', 'meia noite',
  'Sim', 'sim', 'SIM', 'Não', 'nao', 'talvez', true, false, [], [[]], [null], {}, { a: 1 }, [{}], GRANDE,
  '__proto__', 'constructor', 'toString', 'hasOwnProperty', '<script>alert(1)</script>', "'; DROP TABLE x;--",
  '😀', 'ç', 'ÁÉÍÓÚ', '\u202e', JSON.parse('{"__proto__":{"polui":1}}'), JSON.parse('{"constructor":{"prototype":{"polui":1}}}')
];
function absurdo() { return escolhe(ABSURDOS); }

/** Troca folhas por absurdos, apaga chaves, cria chaves esquisitas. */
function estragar(v, p) {
  p = p == null ? 0.12 : p;
  if (v === null || typeof v !== 'object') return chance(p) ? absurdo() : v;
  var saida = Array.isArray(v) ? [] : {};
  Object.keys(v).forEach(function (k) {
    if (!Array.isArray(v) && chance(p / 3)) return;                 // chave some
    saida[k] = estragar(v[k], p);
  });
  if (!Array.isArray(v) && chance(p / 3)) saida[escolhe(['__proto__x', 'constructor', 'id', 'uid', 'extra', 'ok'])] = absurdo();
  if (Array.isArray(v) && chance(p / 3)) saida.push(absurdo());
  return saida;
}

/* ------------------------------------------------ dados plausíveis ---- */
var estadoAtual;   // preenchido a cada chamada
function nomeAnest() { var a = estadoAtual.anestesistas; return a.length && chance(0.92) ? escolhe(a).nome : escolhe(['Dr. Inventado', '', 'A']); }
function idAnest() { var a = estadoAtual.anestesistas; return a.length && chance(0.92) ? escolhe(a).id : escolhe(['A99', '', 'x']); }
function dataIso() { return '2026-' + escolhe(['10', '11', '12']) + '-' + pad(inteiro(1, 28)); }
function dataLonge() { return escolhe(['2026-09-', '2027-01-', '2027-02-', '2026-12-', '2030-06-']) + pad(inteiro(1, 28)); }
function minutos(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
function hora() { return minutos(inteiro(0, 95) * 15); }
function paciente() { return escolhe(['Maria Teste', 'João da Silva', 'Ana Costa', 'Zé', 'Paciente ' + inteiro(1, 40)]); }
function dinheiro() { return escolhe([0, 100, 250.5, 1200, 1234.56, '300,00', '1.500,00', 99999, 0.01, 10.005]); }
function idDe(lista) { return lista.length && chance(0.94) ? escolhe(lista).id : escolhe(['XXX0001', '', 'CIR9999', null, 7]); }
function motivo() { return escolhe(['correção de dados lançados errado', 'erro de digitação na hora', 'revisão pedida pela coordenação', 'curto', '', absurdo()]); }

/** Horários de um atendimento, em ordem (início, fim, entrada e saída da SRPA). */
function tempos() {
  var ini = inteiro(6 * 60, 18 * 60), fim = ini + inteiro(20, 300), ent = fim + inteiro(3, 20), sai = ent + inteiro(20, 200);
  return { ini: ini, fim: fim, ent: ent, sai: sai };
}

function cirurgia() {
  var c = {
    status: escolhe(['Agendada', 'Confirmada', 'Realizada', 'Realizada', 'Cancelada', 'Remarcada']),
    data: chance(0.88) ? dataIso() : dataLonge(),
    inicioPrev: hora(), fimPrev: hora(), paciente: paciente(),
    procedimento: escolhe(['Rinoplastia', 'Colecistectomia', 'Hernioplastia']), cirurgiao: escolhe(['Dr. X', 'Dra. Y']),
    anestesista: nomeAnest(), avaliacaoNec: escolhe(['Sim', 'Não']), sala: 'Sala ' + inteiro(1, 4),
    convenio: escolhe(['Particular', 'Unimed', '']), valor: dinheiro()
  };
  if (chance(0.3)) { var t = tempos(); c.inicioReal = minutos(t.ini); c.fimReal = minutos(t.fim); }
  if (chance(0.2)) { c.pago = 'Sim'; c.dataPagamento = dataIso(); }
  if (chance(0.1)) c.nf = String(inteiro(1, 9999));
  return c;
}

var TRACOS = [[[0.1, 0.5], [0.3, 0.3], [0.5, 0.6], [0.8, 0.4]]];

function boletimMudancas(t) {
  t = t || tempos();
  return {
    paciente: { peso: String(inteiro(3, 190)), idade: String(inteiro(0, 99)), sexo: escolhe(['M', 'F']) },
    pre: { asa: escolhe(core.OPCOES_BOLETIM.asa) },
    tecnicas: [escolhe(core.OPCOES_BOLETIM.tecnicas)],
    monitorizacao: core.MONITORIZACAO_BASICA,
    destino: escolhe(core.OPCOES_BOLETIM.destinos),
    semIntercorrencias: chance(0.7),
    tempos: { inicioAnestesia: minutos(t.ini), fimAnestesia: minutos(t.fim) }
  };
}

function linhaBoletim(lista, t) {
  t = t || tempos();
  var h = minutos(inteiro(t.ini, t.fim));
  if (lista === 'sinais') { var pas = inteiro(70, 200); return { hora: h, pas: String(pas), pad: String(pas - inteiro(20, 60)), fc: String(inteiro(40, 150)), spo2: String(inteiro(80, 100)) }; }
  if (lista === 'farmacos') return { hora: h, nome: escolhe(['Propofol', 'Fentanil', 'Rocurônio']), dose: String(inteiro(1, 300)), unidade: 'mg', via: 'EV' };
  if (lista === 'fluidos') return { hora: h, tipo: escolhe(core.OPCOES_BOLETIM.fluidos || ['Ringer']), volume: String(inteiro(10, 2000)) };
  return { hora: h, descricao: 'Intercorrência ' + inteiro(1, 9), conduta: 'Conduta' };
}

function fichaMudancas(t) {
  t = t || tempos();
  return {
    atendimento: {
      prontuario: String(inteiro(1000, 99999)), vinculo: escolhe(core.OPCOES_QUALIDADE.vinculo), especialidade: 'Cirurgia plástica',
      unidade: 'Centro cirúrgico', sala: 'Sala 1', carater: escolhe(core.OPCOES_QUALIDADE.carater), asa: escolhe(core.OPCOES_QUALIDADE.asa),
      idade: String(inteiro(0, 99)), peso: String(inteiro(3, 190)), altura: String(inteiro(50, 210)),
      tecnicas: [escolhe(core.OPCOES_QUALIDADE.tecnicas)],
      inicioAnestesia: minutos(t.ini), fimAnestesia: minutos(t.fim), entradaSrpa: minutos(t.ent), saidaSrpa: minutos(t.sai),
      destino: escolhe(core.OPCOES_QUALIDADE.destino)
    },
    pre: { avaliacaoDocumentada: escolhe(core.RESPOSTAS_QUALIDADE), avaliacaoCompleta: escolhe(core.RESPOSTAS_QUALIDADE),
      jejumData: dataIso(), jejumHora: hora(), jejumTipo: escolhe(core.OPCOES_QUALIDADE.jejumTipo) },
    processo: { checklistRealizado: escolhe(core.RESPOSTAS_QUALIDADE), capnografiaUsada: escolhe(core.RESPOSTAS_QUALIDADE),
      atbIndicada: escolhe(core.RESPOSTAS_QUALIDADE), atbHora: minutos(t.ini - 30), incisaoHora: minutos(t.ini + 10), tofValor: escolhe(['0,95', '0.5', '1', 'x']) },
    intra: { intubacao: escolhe(core.RESPOSTAS_QUALIDADE), spo2Minima: String(inteiro(50, 100)), pamMinima: String(inteiro(30, 110)) },
    srpa: { temperaturaChegada: escolhe(['36,4', '35', '38.2', 'x']), nausea: escolhe(core.RESPOSTAS_QUALIDADE), dorPontuacao: String(inteiro(0, 10)), dorHora: minutos(t.ent + 5) },
    respostas: (function () { var o = {}; core.EVENTOS_QUALIDADE.slice(0, inteiro(0, 6)).forEach(function (e) { o[e.chave] = escolhe(core.RESPOSTAS_QUALIDADE); }); return o; })()
  };
}

function eventoFicha() {
  var e = escolhe(core.EVENTOS_QUALIDADE);
  return { acao: escolhe(['adicionar', 'adicionar', 'adicionar', 'remover', 'alterar']), indice: inteiro(0, 2),
    evento: { tipo: e.chave, gravidade: escolhe(core.OPCOES_QUALIDADE.gravidade), origem: escolhe(core.OPCOES_QUALIDADE.origemEvento),
      hora: hora(), descricao: 'evento ' + inteiro(1, 9) } };
}

function seguimento() {
  var sit = escolhe(['Realizado', 'Realizado', 'Sem informação', 'Perda de seguimento']);
  return { situacao: sit, data: dataIso(), justificativa: sit === 'Realizado' ? '' : 'Paciente não atendeu em três tentativas.' };
}

function estruturaRegistro() {
  return { data: dataIso(), turno: escolhe(['Manhã', 'Tarde', 'Noite', 'Plantão']), unidade: escolhe(['Centro cirúrgico', 'SRPA']),
    sala: 'Sala ' + inteiro(1, 3), responsavel: 'Fulano' };
}

function configQualidade() {
  return { limiares: { spo2: inteiro(80, 95), pam: inteiro(50, 75), temperatura: 35 + r() * 2, tof: 0.7 + r() * 0.3 },
    aprovacao: { responsavel: 'Dr. Chefe', crm: '123-DF', em: '2026-10-01', versao: '1', obs: '' } };
}

function escalaBaseEmbaralhada() {
  var base = estadoAtual.escalaBase.map(function (l) { return { dia: l.dia, posicao: l.posicao, nome: l.nome }; });
  if (chance(0.85)) {   // troca de lugar entre linhas (continua sendo um arranjo válido de todos)
    var i = inteiro(0, base.length - 1), j = inteiro(0, base.length - 1), tmp = base[i].nome; base[i].nome = base[j].nome; base[j].nome = tmp;
  }
  return base;
}

/* ------------------------------------------------------- operações ----- */
var E = function () { return estadoAtual; };
var OPS = [
  { n: 'adicionarCirurgia', p: 10, a: function () { return [cirurgia()]; } },
  { n: 'atualizarCirurgia', p: 8, a: function () { return [idDe(E().cirurgias), estragar({ status: escolhe(['Realizada', 'Cancelada', 'Agendada']), data: dataIso(), valor: dinheiro(), pago: escolhe(['Sim', 'Não']), anestesista: nomeAnest(), obs: 'x' }, 0.12)]; } },
  { n: 'removerCirurgia', p: 2, a: function () { return [idDe(E().cirurgias), chance(0.5) ? 'teste' : undefined]; } },
  { n: 'atualizarAvaliacao', p: 6, a: function () { return [idDe(E().avaliacoes), estragar({ realizada: escolhe(['Sim', 'Não']), anestesista: nomeAnest(), data: dataIso(), hora: hora(), tcle: escolhe(['Sim', 'Não']), valor: dinheiro(), pago: escolhe(['Sim', 'Não']) }, 0.12)]; } },
  { n: 'salvarAnestesista', p: 3, a: function () { return [estragar(chance(0.5) ? { id: idAnest(), ativo: escolhe(['Sim', 'Não']), pix: 'a@b.com' } : { nome: 'Novo ' + inteiro(1, 5), crm: '1' + inteiro(100, 999) + '-DF' }, 0.15)]; } },
  { n: 'ajustarEscala', p: 5, a: function () { return [dataIso(), inteiro(1, 3), chance(0.8) ? { substituto: nomeAnest(), motivo: 'x' } : { ajuste: false }]; } },
  { n: 'definirEscalaBase', p: 2, a: function () { return [escalaBaseEmbaralhada()]; } },
  { n: 'definirModoEscalaBase', p: 1, a: function () { return [escolhe([true, false, absurdo()])]; } },
  { n: 'aplicarRemanejamento', p: 2, a: function () { return [escolhe([[], [{ id: idDe(E().cirurgias), para: nomeAnest() }], absurdo()])]; } },
  { n: 'salvarConfigClinica', p: 1, a: function () { return [estragar({ nome: 'Clínica ' + inteiro(1, 9), cnpj: '12.345.678/0001-90', endereco: 'Rua x', telefone: '(61) 3333-0000' }, 0.3)]; } },
  { n: 'criarBoletim', p: 3, a: function () { return [idDe(E().cirurgias)]; } },
  { n: 'salvarBoletim', p: 4, a: function () { return [idDe(E().boletins), estragar(boletimMudancas(), 0.1)]; } },
  { n: 'alterarLinhaBoletim', p: 4, a: function () { var l = escolhe(['sinais', 'sinais', 'farmacos', 'fluidos', 'intercorrencias']); return [idDe(E().boletins), l, estragar({ acao: escolhe(['adicionar', 'adicionar', 'adicionar', 'remover', 'alterar']), indice: inteiro(0, 2), linha: linhaBoletim(l) }, 0.1)]; } },
  { n: 'finalizarBoletim', p: 2, a: function () { return [idDe(E().boletins), estragar({ tracos: TRACOS, nome: nomeAnest(), crm: '12345-DF' }, 0.15)]; } },
  { n: 'reabrirBoletim', p: 2, a: function () { return [idDe(E().boletins), motivo()]; } },
  { n: 'descartarBoletim', p: 1, a: function () { return [idDe(E().boletins)]; } },
  { n: 'criarFichaQualidade', p: 3, a: function () { return [idDe(E().cirurgias)]; } },
  { n: 'salvarFichaQualidade', p: 5, a: function () { return [idDe(E().fichasQualidade), estragar(fichaMudancas(), 0.08)]; } },
  { n: 'preencherFichaDoBoletim', p: 2, a: function () { return [idDe(E().fichasQualidade), escolhe([undefined, [], ['peso', 'idade'], absurdo()])]; } },
  { n: 'alterarEventoQualidade', p: 3, a: function () { return [idDe(E().fichasQualidade), estragar(eventoFicha(), 0.08)]; } },
  { n: 'registrarSeguimentoQualidade', p: 3, a: function () { return [idDe(E().fichasQualidade), escolhe(core.SEGUIMENTOS_QUALIDADE.map(function (s) { return s.chave; })), estragar(seguimento(), 0.1)]; } },
  { n: 'revisarFichaQualidade', p: 2, a: function () { return [idDe(E().fichasQualidade), estragar({ revisadoPor: 'Dr. Revisor', parecer: 'ok', eventos: [{ indice: inteiro(0, 2), confirmado: escolhe(['Sim', 'Não', '']) }] }, 0.12)]; } },
  { n: 'concluirFichaQualidade', p: 1, a: function () { return [idDe(E().fichasQualidade)]; } },
  { n: 'reabrirFichaQualidade', p: 2, a: function () { return [idDe(E().fichasQualidade), motivo()]; } },
  { n: 'descartarFichaQualidade', p: 1, a: function () { return [idDe(E().fichasQualidade)]; } },
  { n: 'salvarRegistroEstrutura', p: 3, a: function () { return [chance(0.7) ? estragar(estruturaRegistro(), 0.1) : estragar(Object.assign({ id: idDe(E().estrutura) }, estruturaRegistro()), 0.1)]; } },
  { n: 'removerRegistroEstrutura', p: 1, a: function () { return [idDe(E().estrutura)]; } },
  { n: 'salvarConfigQualidade', p: 1, a: function () { return [estragar(configQualidade(), 0.08)]; } },
  { n: 'salvarDespesasRepasse', p: 3, a: function () { return [2026, inteiro(9, 12), dinheiro(), escolhe(['aluguel', '', absurdo()])]; } },
  { n: 'registrarPagamentoRepasse', p: 3, a: function () { return [2026, inteiro(9, 12), idAnest(), dinheiro(), dataIso()]; } },
  { n: 'atualizarParticipantesRepasse', p: 2, a: function () { return [2026, inteiro(9, 12)]; } },
  { n: 'removerPagamentoRepasse', p: 2, a: function () {
      var reg = E().repasses.filter(function (x) { return x.pagamentos && x.pagamentos.length; });
      if (reg.length && chance(0.8)) { var g = escolhe(reg), pg = escolhe(g.pagamentos); return [Number(g.mes.slice(0, 4)), Number(g.mes.slice(5, 7)), pg.idAnestesista || pg.id || idAnest()]; }
      return [2026, inteiro(9, 12), idAnest()];
    } },
  { n: 'salvarConfigLog', p: 1, a: function () { return [estragar({ mesesNaTela: inteiro(1, 36), anosDeGuarda: inteiro(0, 30) }, 0.1)]; } },
  { n: 'reparar', p: 1, a: function () { return []; } },
  { n: 'estenderHorizonte', p: 1, a: function () { return [inteiro(2026, 2028), inteiro(1, 12)]; } }
];

/** Sequências que levam uma coisa até o fim (para chegar nas regras de baixo, que a validação protege). */
var MACROS = [
  { n: '(fluxo do boletim)', p: 6, f: function (c) {
      var cir = E().cirurgias.length ? escolhe(E().cirurgias) : null; if (!cir) return;
      var b = E().boletins.filter(function (x) { return x.idCirurgia === cir.id; })[0];
      var id = b ? b.id : null;
      if (!id) { var rc = c('criarBoletim', [cir.id]); id = rc && rc.boletim && rc.boletim.id; }
      if (!id) return;
      var t = tempos();
      c('salvarBoletim', [id, boletimMudancas(t)]);
      c('alterarLinhaBoletim', [id, 'sinais', { acao: 'adicionar', linha: linhaBoletim('sinais', t) }]);
      if (chance(0.5)) c('alterarLinhaBoletim', [id, 'farmacos', { acao: 'adicionar', linha: linhaBoletim('farmacos', t) }]);
      if (chance(0.7)) c('finalizarBoletim', [id, { tracos: TRACOS, nome: nomeAnest(), crm: '12345-DF' }]);
      if (chance(0.3)) c('reabrirBoletim', [id, 'correção de dados lançados errado']);
      if (chance(0.3)) c('salvarBoletim', [id, boletimMudancas()]);
    } },
  { n: '(fluxo da ficha)', p: 6, f: function (c) {
      var cir = E().cirurgias.length ? escolhe(E().cirurgias) : null; if (!cir) return;
      var f = E().fichasQualidade.filter(function (x) { return x.idCirurgia === cir.id; })[0];
      var id = f ? f.id : null;
      if (!id) { var rc = c('criarFichaQualidade', [cir.id]); id = rc && rc.ficha && rc.ficha.id; }
      if (!id) return;
      c('salvarFichaQualidade', [id, fichaMudancas()]);
      if (chance(0.6)) c('alterarEventoQualidade', [id, eventoFicha()]);
      if (chance(0.5)) c('preencherFichaDoBoletim', [id, undefined]);
      if (chance(0.6)) c('registrarSeguimentoQualidade', [id, escolhe(['h24', 'h48', 'd30']), seguimento()]);
      if (chance(0.5)) c('revisarFichaQualidade', [id, { revisadoPor: 'Dr. Revisor', parecer: 'ok', eventos: [{ indice: 0, confirmado: 'Sim' }] }]);
      if (chance(0.5)) c('concluirFichaQualidade', [id]);
      if (chance(0.3)) c('reabrirFichaQualidade', [id, 'correção de dados lançados errado']);
    } },
  { n: '(fluxo do repasse)', p: 3, f: function (c) {
      var mes = inteiro(10, 12);
      c('salvarDespesasRepasse', [2026, mes, dinheiro(), 'x']);
      if (chance(0.5)) c('registrarPagamentoRepasse', [2026, mes, idAnest(), dinheiro(), dataIso()]);
      if (chance(0.3)) c('atualizarParticipantesRepasse', [2026, mes]);
    } }
];

/** Só leem: nunca podem mudar o estado nem lançar exceção. */
var LEITURAS = [
  ['horas', function () { return [escolhe([undefined, [10], [10, 11], [1, 2, 3], absurdo()])]; }],
  ['financeiro', function () { return [inteiro(9, 12), escolhe([2026, 2027])]; }],
  ['ledger', function () { return [escolhe([undefined, { mes: inteiro(10, 12), ano: 2026 }, {}, absurdo()])]; }],
  ['indicadores', function () { return [nomeAnest(), inteiro(10, 12), 2026]; }],
  ['comparativo', function () { return [inteiro(10, 12), 2026]; }],
  ['dashboard', function () { return [inteiro(10, 12), 2026]; }],
  ['financeiroAnual', function () { return [escolhe([2026, 2027])]; }],
  ['escalaDoMes', function () { return [2026, inteiro(10, 12)]; }],
  ['pendencias', function () { return [escolhe([undefined, { mes: inteiro(10, 12), ano: 2026 }, {}])]; }],
  ['repasse', function () { return [2026, inteiro(10, 12), escolhe([undefined, { base: 'recebido' }, { base: 'total' }, {}])]; }],
  ['sugerirAnestesista', function () { return [{ data: dataIso(), status: 'Agendada', inicioPrev: hora(), fimPrev: hora() }, undefined]; }],
  ['proporRemanejamento', function () { return [dataIso(), nomeAnest()]; }],
  ['painelQualidade', function () { return [escolhe([{}, { de: '2026-10-01', ate: '2026-12-31' }, undefined]), escolhe([undefined, {}, { serie: false }])]; }],
  ['resultadosQualidade', function () { return [escolhe([{}, { de: '2026-10-01', ate: '2026-12-31' }])]; }],
  ['atendimentosQualidade', function () { return [escolhe([{}, { de: '2026-10-01', ate: '2026-12-31' }, undefined])]; }],
  ['nomesAnestesistas', function () { return [undefined]; }],
  ['verificarIntegridade', function () { return []; }],
  ['configLog', function () { return []; }],
  ['clinica', function () { return []; }]
];

var PESO_OPS = OPS.reduce(function (s, o) { return s + o.p; }, 0);
var PESO_MACROS = MACROS.reduce(function (s, o) { return s + o.p; }, 0);
function sorteia(lista, total) { var x = r() * total; for (var i = 0; i < lista.length; i++) { x -= lista[i].p; if (x <= 0) return lista[i]; } return lista[0]; }

/* ---------------------------------------------------------------- run -- */
function estadoTexto(st) { return core.jsonCanonico(st.estado); }
/** O estado sem o LOG e sem o que é só derivado: serve para saber se a operação mudou DADO. */
function dadoTexto(st) {
  var e = Object.assign({}, st.estado);
  delete e.log; delete e.consolidada;
  return core.jsonCanonico(e);
}
function classe(msg) { return String(msg).replace(/[A-Z]{2,4}\d{3,}/g, 'ID').replace(/\d+/g, 'N'); }
var HORARIO_ESPERADO = /horário|término|início|cobrem mais|fora de ordem|fecha com/i;

var achados = {};
function anota(tipo, op, detalhe, args, sem) {
  var chave = tipo + '|' + op + '|' + classe(detalhe).slice(0, 140);
  if (!achados[chave]) achados[chave] = { tipo: tipo, op: op, detalhe: String(detalhe).slice(0, 400), quantos: 0, sem: sem, args: null };
  achados[chave].quantos++;
  if (!achados[chave].args) { try { achados[chave].args = JSON.stringify(args).slice(0, 700); } catch (e) { achados[chave].args = '(nao serializa)'; } }
}

var estatistica = { chamadas: 0, aceitas: 0, recusadas: 0, leituras: 0, porOp: {}, recusas: {} };

function problemasDeIntegridade(st) {
  var v = st.verificarIntegridade();
  return (v.erros || []).map(function (e) { return classe(e.msg || e.mensagem || JSON.stringify(e)); });
}

function rodar(semente) {
  rnd = mulberry32(semente * 7919 + 13);
  var opcoes = { usuario: 'fuzz', horizonte: 'movel', hoje: '2026-11-30' };
  var st = core.criarStoreComSeed(JSON.parse(seedBruto), opcoes);
  var replica = core.criarStoreComSeed(JSON.parse(seedBruto), opcoes);
  var registro = [];
  var basais = {};
  problemasDeIntegridade(st).forEach(function (p) { basais[p] = true; });
  var passo = 0;

  /** Uma chamada instrumentada (a de baixo de tudo). */
  function chamar(nome, args, leitura) {
    estadoAtual = st.estado;
    passo++;
    var ctx = { agora: '2026-11-30 ' + pad(8 + (passo % 10)) + ':' + pad(passo % 60) + ':' + pad((passo * 7) % 60), semente: 'f' + semente + '-' + passo };
    var antes = estadoTexto(st);
    var dadoAntes = leitura ? '' : dadoTexto(st), logAntes = st.estado.log.length;
    var clone;
    try { clone = JSON.parse(JSON.stringify(args)); } catch (e) { clone = args; }
    var res, lancou = null;
    try { res = core.executarComContexto(ctx, function () { return st[nome].apply(st, clone); }); } catch (e) { lancou = e; }
    estatistica.chamadas++;
    if (lancou) { anota('EXCECAO', nome, (lancou && lancou.message) || String(lancou), args, semente); return null; }
    var depois = estadoTexto(st);

    if (leitura) {
      estatistica.leituras++;
      if (depois !== antes) anota('LEITURA_MUDOU_ESTADO', nome, 'uma operação de leitura alterou o estado', args, semente);
      return res;
    }

    var po = estatistica.porOp[nome] = estatistica.porOp[nome] || { ok: 0, no: 0 };
    var ok = res && res.ok !== false;
    if (ok) { estatistica.aceitas++; po.ok++; } else { estatistica.recusadas++; po.no++; }
    var msgs = res && res.erros ? res.erros.map(function (e) { return (e && (e.msg || e.mensagem)) || String(e); }) : [];
    msgs.forEach(function (m) { if (/Erro interno/.test(m)) anota('ERRO_INTERNO', nome, m, args, semente); });
    if (!ok) {
      var d = estatistica.recusas[nome] = estatistica.recusas[nome] || {};
      msgs.slice(0, 2).forEach(function (m) { var k = classe(m).slice(0, 120); d[k] = (d[k] || 0) + 1; });
      if (depois !== antes) anota('RECUSA_MUDOU_ESTADO', nome, 'a operação foi recusada mas o estado mudou', args, semente);
    } else {
      // Toda mudança de dado aceita tem de deixar rastro no LOG (é a trilha de auditoria por usuário).
      if (st.estado.log.length === logAntes && dadoTexto(st) !== dadoAntes) anota('SEM_LOG', nome, 'a operação mudou dado e não escreveu no LOG', args, semente);
      registro.push({ n: nome, args: clone, ctx: ctx });
    }
    try { JSON.parse(JSON.stringify(st.estado)); } catch (e) { anota('ESTADO_NAO_SERIALIZA', nome, e.message, args, semente); }
    if (passo % A_CADA === 0) {
      problemasDeIntegridade(st).forEach(function (p) {
        if (basais[p]) return; basais[p] = true;
        anota(HORARIO_ESPERADO.test(p) ? 'INTEGRIDADE_HORARIO(esperado)' : 'INTEGRIDADE', nome, p, args, semente);
      });
    }
    return res;
  }

  for (var i = 0; i < OPERACOES; i++) {
    estadoAtual = st.estado;
    var x = r();
    if (x < 0.12) {                                      // leitura
      var L = escolhe(LEITURAS); var la; try { la = L[1](); } catch (e) { la = []; }
      chamar(L[0], la, true);
    } else if (x < 0.30) {                               // sequência completa
      var M = sorteia(MACROS, PESO_MACROS);
      try { M.f(function (n, a) { return chamar(n, a, false); }); } catch (e) { anota('GERADOR', M.n, e.message, [], semente); }
    } else {                                             // uma operação só
      var op = sorteia(OPS, PESO_OPS), args;
      try { args = op.a(); } catch (e) { anota('GERADOR', op.n, e.message, [], semente); continue; }
      chamar(op.n, args, false);
    }
  }

  // Réplica: refaz as operações aceitas com o mesmo contexto.
  registro.forEach(function (c) {
    estadoAtual = replica.estado;
    var rr;
    try { rr = core.executarComContexto(c.ctx, function () { return replica[c.n].apply(replica, JSON.parse(JSON.stringify(c.args))); }); } catch (e) { rr = { ok: false, erros: [{ msg: 'EXC ' + e.message }] }; }
    if (!rr || rr.ok === false) anota('REPLICA_RECUSOU', c.n, JSON.stringify(rr && rr.erros).slice(0, 200), c.args, semente);
  });
  var a = estadoTexto(st), b = estadoTexto(replica);
  if (a !== b) {
    var ja = JSON.parse(a), jb = JSON.parse(b);
    var dif = Object.keys(ja).filter(function (k) { return core.jsonCanonico(ja[k]) !== core.jsonCanonico(jb[k]); });
    anota('REPLICA_DIFERENTE', 'geral', 'partes diferentes: ' + dif.join(','), [], semente);
  }
  problemasDeIntegridade(st).forEach(function (p) { if (!basais[p]) { basais[p] = true; anota(HORARIO_ESPERADO.test(p) ? 'INTEGRIDADE_HORARIO(esperado)' : 'INTEGRIDADE_FINAL', 'geral', p, [], semente); } });
  return { st: st, registro: registro.length };
}

module.exports = {
  rodar: function (semente, operacoes) { if (operacoes) OPERACOES = operacoes; return rodar(semente); },
  achados: function () { return Object.keys(achados).map(function (k) { return achados[k]; }); },
  reiniciar: function () { achados = {}; },
  mulberry32: mulberry32, estragar: estragar, absurdo: absurdo, setRnd: function (f) { rnd = f; }
};
if (require.main === module) {
var t0 = Date.now();
var resumoFinal = [];
var primeira = process.env.SO ? Number(process.env.SO) : INICIO;
var ultima = process.env.SO ? Number(process.env.SO) : INICIO + SEMENTES - 1;
for (var s = primeira; s <= ultima; s++) {
  var res = rodar(s);
  var e = res.st.estado;
  resumoFinal.push('semente ' + s + ': aceitas=' + res.registro + ' cirurgias=' + e.cirurgias.length + ' aval=' + e.avaliacoes.length +
    ' boletins=' + e.boletins.length + ' (finalizados=' + e.boletins.filter(function (b) { return b.status && /final/i.test(b.status); }).length + ')' +
    ' fichas=' + e.fichasQualidade.length + ' (concluídas=' + e.fichasQualidade.filter(function (f) { return /conclu/i.test(f.status || ''); }).length + ')' +
    ' estrutura=' + e.estrutura.length + ' repasses=' + e.repasses.length + ' log=' + e.log.length);
}
console.log(resumoFinal.join('\n'));
console.log('\nChamadas: ' + estatistica.chamadas + ' (leituras ' + estatistica.leituras + ') | aceitas: ' + estatistica.aceitas + ' | recusadas: ' + estatistica.recusadas + ' | ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
console.log('\nOperações que NUNCA foram aceitas (o teste não chegou até o miolo delas):');
console.log(Object.keys(estatistica.porOp).filter(function (k) { return estatistica.porOp[k].ok === 0; }).join(', ') || '(todas foram aceitas ao menos uma vez)');
console.log('\nAceitas/recusadas por operação:');
console.log(Object.keys(estatistica.porOp).sort().map(function (k) { return '  ' + k + ' ' + estatistica.porOp[k].ok + '/' + estatistica.porOp[k].no; }).join('\n'));

if (process.env.DIAG) {
  console.log('\n--- recusas mais comuns (operações aceitas < 25%) ---');
  Object.keys(estatistica.porOp).forEach(function (k) {
    var o = estatistica.porOp[k]; if (o.ok / (o.ok + o.no) >= 0.25) return;
    var d = estatistica.recusas[k] || {};
    var top = Object.keys(d).sort(function (a, b) { return d[b] - d[a]; }).slice(0, 4);
    console.log(k + ' (' + o.ok + '/' + (o.ok + o.no) + ')\n   ' + top.map(function (t) { return d[t] + 'x ' + t; }).join('\n   '));
  });
}

var lista = Object.keys(achados).map(function (k) { return achados[k]; });
var graves = lista.filter(function (a) { return !/esperado/.test(a.tipo); });
console.log('\n================ ACHADOS: ' + graves.length + ' tipos' + (lista.length - graves.length ? ' (+' + (lista.length - graves.length) + ' esperados: horários digitados fora de ordem)' : '') + ' ================');
graves.sort(function (x, y) { return y.quantos - x.quantos; }).forEach(function (a) {
  console.log('\n[' + a.tipo + '] ' + a.op + '  x' + a.quantos + '  (semente ' + a.sem + ')\n  ' + a.detalhe + '\n  args: ' + a.args);
});
process.exit(graves.length ? 1 : 0);

}
