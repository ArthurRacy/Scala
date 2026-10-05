'use strict';
/**
 * Verificador de nomes indefinidos (análise estática com o analisador de JS que vem dentro do Node).
 *   node --expose-internals tools/verificar_nomes.js
 *
 * Acha o identificador que é usado e nunca foi declarado — o erro que só aparece em tempo de execução, na primeira
 * vez que alguém clica ("X is not defined"). Confere quatro ambientes, que têm regras diferentes:
 *   - navegador: core + webapp compartilham o escopo global;
 *   - core carregado pelo Node: só vale o que é EXPORTADO (módulo `module.exports`); um nome que existe no
 *     navegador mas ficou fora do export quebra no servidor e nos testes;
 *   - servidor (CommonJS);
 *   - Apps Script (core + .gs).
 * Sai com código 1 se achar algo fora da lista de nomes conhecidos (globais do navegador que esta lista não
 * conhece, e `DEMO`, que só existe na versão online). Zero dependências: usa o analisador do próprio Node, que
 * exige o sinalizador --expose-internals (se a versão do Node não o tiver, avisa e sai com código 2).
 */
var fs = require('fs'), path = require('path');
var acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); } catch (e) {
  console.log('Analisador indisponível neste Node (rode com: node --expose-internals tools/verificar_nomes.js). Nada foi conferido.');
  process.exit(2);
}
var RAIZ = process.env.RAIZ_DO_PROJETO || path.join(__dirname, '..');

var BUILTINS = new Set(('undefined NaN Infinity arguments Object Function Array String Number Boolean Symbol BigInt Math JSON Date RegExp Error TypeError ' +
  'RangeError SyntaxError ReferenceError EvalError URIError Promise Map Set WeakMap WeakSet WeakRef Proxy Reflect Intl parseInt parseFloat isNaN isFinite ' +
  'encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape eval globalThis ArrayBuffer SharedArrayBuffer DataView Int8Array Uint8Array ' +
  'Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array AggregateError ' +
  'setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone console performance URL URLSearchParams TextEncoder TextDecoder ' +
  'AbortController AbortSignal Blob fetch Headers Request Response FormData Event EventTarget atob btoa crypto').split(' '));

var NAVEGADOR = new Set(('BroadcastChannel window document navigator localStorage sessionStorage indexedDB IDBKeyRange location history screen alert confirm prompt ' +
  'requestAnimationFrame cancelAnimationFrame getComputedStyle matchMedia Image EventSource XMLHttpRequest MutationObserver ResizeObserver ' +
  'IntersectionObserver DOMParser CustomEvent KeyboardEvent MouseEvent File FileReader FileList HTMLElement Element Node SVGElement HTMLInputElement ' +
  'showDirectoryPicker CSS DOMException devicePixelRatio innerWidth innerHeight scrollTo open print close self top parent frames ' +
  'Notification Worker ServiceWorker caches CompressionStream DecompressionStream ReadableStream WritableStream TransformStream').split(' '));

var SO_ONLINE = new Set(['DEMO']);   // só existe na página gerada para a versão online (demo_online.js), sempre atrás de typeof
var NODE = new Set('require module exports __dirname __filename process Buffer global setImmediate clearImmediate'.split(' '));
var APPS = new Set(('SpreadsheetApp Session LockService ScriptApp Logger Utilities PropertiesService CacheService HtmlService ContentService UrlFetchApp ' +
  'DriveApp GmailApp CalendarApp MailApp Browser').split(' '));

function lerAst(arq) {
  var codigo = fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, '');
  return acorn.parse(codigo, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
}

function nomesDoPadrao(p, saida) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier': saida.push(p.name); break;
    case 'ObjectPattern': p.properties.forEach(function (x) { nomesDoPadrao(x.type === 'RestElement' ? x.argument : x.value, saida); }); break;
    case 'ArrayPattern': p.elements.forEach(function (x) { nomesDoPadrao(x, saida); }); break;
    case 'AssignmentPattern': nomesDoPadrao(p.left, saida); break;
    case 'RestElement': nomesDoPadrao(p.argument, saida); break;
  }
}

function filhos(no, fn) {
  Object.keys(no).forEach(function (k) {
    if (k === 'loc' || k === 'start' || k === 'end') return;
    var v = no[k];
    if (Array.isArray(v)) v.forEach(function (x) { if (x && typeof x.type === 'string') fn(x, k); });
    else if (v && typeof v.type === 'string') fn(v, k);
  });
}

/** Declarações da função (sem entrar nas funções internas): var, let, const, function, class, catch. */
function coletar(no, nomes) {
  if (!no) return;
  switch (no.type) {
    case 'FunctionExpression': case 'ArrowFunctionExpression': return;
    case 'FunctionDeclaration': if (no.id) nomes.add(no.id.name); return;
    case 'ClassDeclaration': if (no.id) nomes.add(no.id.name); break;
    case 'VariableDeclaration':
      no.declarations.forEach(function (d) { var l = []; nomesDoPadrao(d.id, l); l.forEach(function (n) { nomes.add(n); }); });
      break;
    case 'CatchClause': if (no.param) { var l2 = []; nomesDoPadrao(no.param, l2); l2.forEach(function (n) { nomes.add(n); }); } break;
  }
  filhos(no, function (f) { coletar(f, nomes); });
}

function declaracoesGlobais(ast) {
  var nomes = new Set();
  ast.body.forEach(function (n) { coletar(n, nomes); });
  // window.X = ... / globalThis.X = ... / this.X = ...
  (function achar(no) {
    if (!no) return;
    if (no.type === 'AssignmentExpression' && no.left.type === 'MemberExpression' && !no.left.computed &&
        no.left.object.type === 'Identifier' && (no.left.object.name === 'window' || no.left.object.name === 'globalThis') &&
        no.left.property.type === 'Identifier') nomes.add(no.left.property.name);
    filhos(no, achar);
  })(ast);
  return nomes;
}

function exportadosDoModulo(ast) {
  // module.exports = { a: a, b: b } (dentro do if typeof module...)
  var saida = new Set();
  (function achar(no) {
    if (!no) return;
    if (no.type === 'AssignmentExpression' && no.left.type === 'MemberExpression' && no.left.object.type === 'Identifier' &&
        no.left.object.name === 'module' && no.left.property.name === 'exports' && no.right.type === 'ObjectExpression') {
      no.right.properties.forEach(function (p) { if (p.key) saida.add(p.key.name || p.key.value); });
    }
    filhos(no, achar);
  })(ast);
  return saida;
}

function ehReferencia(no, pai, chave) {
  if (!pai) return true;
  switch (pai.type) {
    case 'MemberExpression': return chave !== 'property' || pai.computed;
    case 'Property': return chave === 'key' ? pai.computed : true;
    case 'MethodDefinition': case 'PropertyDefinition': return chave === 'key' ? pai.computed : true;
    case 'LabeledStatement': case 'BreakStatement': case 'ContinueStatement': return false;
    case 'UnaryExpression': return !(pai.operator === 'typeof' && chave === 'argument');
    case 'VariableDeclarator': return chave !== 'id';
    case 'AssignmentPattern': return chave !== 'left';
    case 'ArrayPattern': case 'ObjectPattern': case 'RestElement': return false;
    default: return true;
  }
}

function verificar(arq, ast, permitidos) {
  var problemas = [];
  function resolver(escopo, nome) {
    for (var e = escopo; e; e = e.pai) if (e.nomes.has(nome)) return true;
    return false;
  }
  function funcao(no, escopoPai) {
    var nomes = new Set();
    if (no.type === 'FunctionExpression' && no.id) nomes.add(no.id.name);
    no.params.forEach(function (p) { var l = []; nomesDoPadrao(p, l); l.forEach(function (n) { nomes.add(n); }); });
    nomes.add('arguments');
    if (no.type !== 'ArrowFunctionExpression') nomes.add('this');
    var escopo = { pai: escopoPai, nomes: nomes };
    if (no.body.type === 'BlockStatement') no.body.body.forEach(function (n) { coletar(n, nomes); });
    // defaults dos parâmetros e corpo
    no.params.forEach(function (p) { visitar(p, no, 'params', escopo); });
    visitar(no.body, no, 'body', escopo);
  }
  function visitar(no, pai, chave, escopo) {
    if (!no || typeof no.type !== 'string') return;
    switch (no.type) {
      case 'Identifier':
        if (ehReferencia(no, pai, chave) && !resolver(escopo, no.name) && !permitidos.has(no.name)) {
          problemas.push({ nome: no.name, linha: no.loc.start.line, escrita: !!(pai && pai.type === 'AssignmentExpression' && chave === 'left') });
        }
        return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        funcao(no, escopo); return;
      case 'ObjectPattern': no.properties.forEach(function (p) { if (p.value) visitar(p.value, p, 'value', escopo); if (p.computed) visitar(p.key, p, 'key', escopo); }); return;
    }
    filhos(no, function (f, k) { visitar(f, no, k, escopo); });
  }
  var topo = { pai: null, nomes: new Set() };
  ast.body.forEach(function (n) { coletar(n, topo.nomes); });
  ast.body.forEach(function (n) { visitar(n, ast, 'body', topo); });
  return problemas;
}

function listar(dir, ext, rec) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    var p = path.join(dir, d.name);
    if (d.isDirectory() && rec) out = out.concat(listar(p, ext, rec));
    else if (d.isFile() && ext.test(d.name)) out.push(p);
  });
  return out;
}

function relatar(titulo, itens) {
  console.log('\n=== ' + titulo + ' ===');
  var total = 0;
  itens.forEach(function (it) {
    // agrupa por nome
    var porNome = {};
    it.problemas.forEach(function (p) { (porNome[p.nome] = porNome[p.nome] || []).push(p.linha + (p.escrita ? '(atribuição)' : '')); });
    Object.keys(porNome).forEach(function (n) {
      total++;
      console.log('  ' + path.relative(RAIZ, it.arquivo).replace(/\\/g, '/') + ': "' + n + '" não está definido (linhas ' + porNome[n].slice(0, 6).join(', ') + ')');
    });
  });
  if (!total) console.log('  nenhum problema');
  return total;
}

/* --------------------------------------------------------- navegador (HTML) */
var html = fs.readFileSync(path.join(RAIZ, 'webapp/index.html'), 'utf8');
var scripts = [], re = /<script src="([^"]+)"><\/script>/g, m;
while ((m = re.exec(html))) scripts.push(path.normalize(path.join(RAIZ, 'webapp', m[1])));
var astsNav = scripts.map(function (a) { return { arquivo: a, ast: lerAst(a) }; });
var globaisNav = new Set();
astsNav.forEach(function (x) { declaracoesGlobais(x.ast).forEach(function (n) { globaisNav.add(n); }); });
var permNav = new Set([].concat(Array.from(BUILTINS), Array.from(NAVEGADOR), Array.from(NODE), Array.from(SO_ONLINE), Array.from(globaisNav)));
// no navegador `module`/`require` só aparecem dentro de `typeof module !== 'undefined'`
var rNav = astsNav.map(function (x) { return { arquivo: x.arquivo, problemas: verificar(x.arquivo, x.ast, permNav) }; });
var t1 = relatar('NAVEGADOR (core + webapp, escopo global compartilhado; ' + scripts.length + ' scripts)', rNav);

/* ----------------------------------------------- core carregado pelo Node */
var core = require(RAIZ + '/core');
var exportados = new Set(Object.keys(core));
var arqsCore = core.ARQUIVOS_CORE.map(function (f) { return path.join(RAIZ, 'core', f); });
var rCore = arqsCore.map(function (a) {
  var ast = lerAst(a);
  var perm = new Set([].concat(Array.from(BUILTINS), Array.from(NODE), Array.from(exportados), Array.from(declaracoesGlobais(ast))));
  return { arquivo: a, problemas: verificar(a, ast, perm) };
});
var t2 = relatar('CORE NO NODE (só vale o que é exportado; ' + arqsCore.length + ' arquivos)', rCore);

/* ------------------------------------------------------------- servidor */
var arqsServidor = listar(path.join(RAIZ, 'server'), /\.js$/, false);
var rSrv = arqsServidor.map(function (a) {
  var ast = lerAst(a);
  var perm = new Set([].concat(Array.from(BUILTINS), Array.from(NODE), Array.from(declaracoesGlobais(ast))));
  return { arquivo: a, problemas: verificar(a, ast, perm) };
});
var t3 = relatar('SERVIDOR (CommonJS)', rSrv);

/* ----------------------------------------------------------- Apps Script */
var arqsGs = listar(path.join(RAIZ, 'apps-script'), /\.gs$/, false);
var astsGs = arqsGs.map(function (a) { return { arquivo: a, ast: lerAst(a) }; });
var globaisGs = new Set(globaisNav);
astsGs.forEach(function (x) { declaracoesGlobais(x.ast).forEach(function (n) { globaisGs.add(n); }); });
var permGs = new Set([].concat(Array.from(BUILTINS), Array.from(APPS), Array.from(NODE), Array.from(globaisGs)));
// o Apps Script junta core + .gs no mesmo escopo; document/window não existem lá
['window', 'document', 'navigator', 'localStorage'].forEach(function (n) { permGs.delete(n); });
var rGs = astsGs.map(function (x) { return { arquivo: x.arquivo, problemas: verificar(x.arquivo, x.ast, permGs) }; });
var t4 = relatar('APPS SCRIPT (core + .gs)', rGs);

/* -------------------------------------------------------------- tools/qa */
var arqsTools = listar(path.join(RAIZ, 'tools'), /\.js$/, false);
var rTools = arqsTools.map(function (a) {
  var ast = lerAst(a);
  var perm = new Set([].concat(Array.from(BUILTINS), Array.from(NODE), Array.from(declaracoesGlobais(ast))));
  return { arquivo: a, problemas: verificar(a, ast, perm) };
});
var t5 = relatar('FERRAMENTAS (tools/*.js)', rTools);

console.log('\nTOTAL de nomes suspeitos: ' + (t1 + t2 + t3 + t4 + t5));
