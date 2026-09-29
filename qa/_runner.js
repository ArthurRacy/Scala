/**
 * ============================================================================
 * qa/_runner.js — Arnês de testes (sem dependência externa)
 * ============================================================================
 * Só o necessário: describe/it, asserções com mensagem útil, e um relatório
 * final que diz exatamente qual expectativa falhou e com que valores.
 *
 * Zero dependências é decisão de projeto: o sistema roda em três runtimes
 * (Node, navegador, Apps Script) e a QA não deve introduzir um quarto
 * ambiente com node_modules para manter.
 * ============================================================================
 */
'use strict';

var estado = {
  suites: [],
  suiteAtual: null,
  total: 0,
  passou: 0,
  falhou: 0,
  falhas: []
};

/** Agrupa testes. */
function describe(nome, fn) {
  var anterior = estado.suiteAtual;
  var suite = { nome: nome, pai: anterior, testes: 0, falhas: 0 };
  estado.suites.push(suite);
  estado.suiteAtual = suite;
  try {
    fn();
  } catch (e) {
    registrarFalha(nome + ' (erro ao montar a suíte)', e && e.message ? e.message : String(e), e);
  }
  estado.suiteAtual = anterior;
}

/** Caminho completo da suíte, para o relatório. */
function caminho(suite) {
  var partes = [];
  while (suite) { partes.unshift(suite.nome); suite = suite.pai; }
  return partes.join(' > ');
}

/** Testes assíncronos ainda em andamento (o teste devolveu uma Promise). */
var pendentes = [];

/** Um teste. Pode devolver uma Promise: o relatório espera por ela. */
function it(nome, fn) {
  estado.total++;
  var suite = estado.suiteAtual;
  if (suite) suite.testes++;

  function falhar(e) {
    estado.falhou++;
    if (suite) suite.falhas++;
    registrarFalha((suite ? caminho(suite) + ' > ' : '') + nome, e && e.message ? e.message : String(e), e);
  }

  try {
    var r = fn();
    if (r && typeof r.then === 'function') {
      var item = { nome: (suite ? caminho(suite) + ' > ' : '') + nome, feito: false };
      pendentes.push(item);
      item.promessa = Promise.resolve(r).then(function () { item.feito = true; estado.passou++; },
        function (e) { item.feito = true; falhar(e); });
      return;
    }
    estado.passou++;
  } catch (e) {
    falhar(e);
  }
}

/**
 * Espera os testes assíncronos. O que não terminar em `ms` conta como
 * falha — uma Promise esquecida não pode "passar" em silêncio.
 */
function aguardar(ms) {
  var lista = pendentes;
  pendentes = [];
  return new Promise(function (resolver) {
    var timer = setTimeout(function () {
      lista.filter(function (p) { return !p.feito; }).forEach(function (p) {
        p.feito = true;
        estado.falhou++;
        registrarFalha(p.nome, 'teste assíncrono não terminou em ' + ms + ' ms');
      });
      resolver();
    }, ms || 20000);
    Promise.all(lista.map(function (p) { return p.promessa; })).then(function () { clearTimeout(timer); resolver(); });
  });
}

function registrarFalha(onde, msg, erro) {
  estado.falhas.push({
    onde: onde,
    msg: msg,
    pilha: erro && erro.stack ? String(erro.stack).split('\n').slice(1, 4).join('\n') : ''
  });
}

/* ---------------------------------------------------------- asserções ---- */

function formatar(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  return String(v);
}

/** Igualdade estrita, com números tolerando ruído de ponto flutuante. */
function igual(obtido, esperado, mensagem) {
  if (typeof obtido === 'number' && typeof esperado === 'number') {
    if (Math.abs(obtido - esperado) < 1e-9) return;
  } else if (obtido === esperado) {
    return;
  }
  throw new Error((mensagem ? mensagem + ': ' : '') +
    'esperado ' + formatar(esperado) + ', obtido ' + formatar(obtido));
}

/** Igualdade profunda por JSON. */
function igualProfundo(obtido, esperado, mensagem) {
  var a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) return;
  throw new Error((mensagem ? mensagem + ': ' : '') +
    'esperado ' + b + ', obtido ' + a);
}

function verdadeiro(valor, mensagem) {
  if (valor) return;
  throw new Error((mensagem ? mensagem + ': ' : '') + 'esperado valor verdadeiro, obtido ' + formatar(valor));
}

function falso(valor, mensagem) {
  if (!valor) return;
  throw new Error((mensagem ? mensagem + ': ' : '') + 'esperado valor falso, obtido ' + formatar(valor));
}

/** Números próximos, com tolerância explícita. */
function proximo(obtido, esperado, tolerancia, mensagem) {
  tolerancia = tolerancia === undefined ? 0.0001 : tolerancia;
  if (Math.abs(Number(obtido) - Number(esperado)) <= tolerancia) return;
  throw new Error((mensagem ? mensagem + ': ' : '') +
    'esperado ~' + esperado + ' (+-' + tolerancia + '), obtido ' + formatar(obtido));
}

/** A função deve lançar. */
function lanca(fn, mensagem) {
  try {
    fn();
  } catch (e) {
    return;
  }
  throw new Error((mensagem ? mensagem + ': ' : '') + 'esperado que lançasse erro, mas não lançou');
}

/** Lista contém o item. */
function contem(lista, item, mensagem) {
  if ((lista || []).indexOf(item) >= 0) return;
  throw new Error((mensagem ? mensagem + ': ' : '') +
    formatar(item) + ' não está em ' + formatar(lista));
}

/* ------------------------------------------------------------ relatório -- */

function relatorio(titulo) {
  var linhas = [];
  linhas.push('');
  linhas.push('='.repeat(72));
  linhas.push('  ' + (titulo || 'QA'));
  linhas.push('='.repeat(72));

  estado.suites.forEach(function (s) {
    if (s.testes === 0) return;
    var marca = s.falhas === 0 ? 'OK  ' : 'FALHA';
    linhas.push('  ' + marca + '  ' + caminho(s) + '  (' + s.testes + ' teste(s))');
  });

  if (estado.falhas.length) {
    linhas.push('');
    linhas.push('-'.repeat(72));
    linhas.push('  FALHAS (' + estado.falhas.length + ')');
    linhas.push('-'.repeat(72));
    estado.falhas.forEach(function (f, i) {
      linhas.push('  ' + (i + 1) + ') ' + f.onde);
      linhas.push('     ' + f.msg);
      if (f.pilha) linhas.push(f.pilha.split('\n').map(function (l) { return '     ' + l.trim(); }).join('\n'));
    });
  }

  linhas.push('');
  linhas.push('-'.repeat(72));
  linhas.push('  TOTAL: ' + estado.total + '   PASSOU: ' + estado.passou + '   FALHOU: ' + estado.falhou);
  linhas.push('  RESULTADO: ' + (estado.falhou === 0 ? 'APROVADO' : 'REPROVADO'));
  linhas.push('='.repeat(72));

  return linhas.join('\n');
}

function resumo() {
  return { total: estado.total, passou: estado.passou, falhou: estado.falhou, falhas: estado.falhas };
}

function zerar() {
  estado.suites = [];
  estado.suiteAtual = null;
  estado.total = 0;
  estado.passou = 0;
  estado.falhou = 0;
  estado.falhas = [];
}

module.exports = {
  describe: describe, it: it,
  igual: igual, igualProfundo: igualProfundo,
  verdadeiro: verdadeiro, falso: falso,
  proximo: proximo, lanca: lanca, contem: contem,
  relatorio: relatorio, resumo: resumo, zerar: zerar, aguardar: aguardar
};
