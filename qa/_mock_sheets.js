/**
 * ============================================================================
 * qa/_mock_sheets.js — Google Sheets de mentira, suficiente para testar a ponte
 * ============================================================================
 * Implementa a parte da API do Apps Script que apps-script/*.gs realmente usa:
 * getSheetByName, getRange, getValues/setValues, getLastRow/getLastColumn,
 * getMaxRows, setDataValidation, setFormulas, além de Session, LockService,
 * ScriptApp e Logger.
 *
 * Por que isto existe: `node --check` prova que o .gs compila, não que ele lê
 * e escreve a planilha certo. A ponte é onde moram os erros mais caros
 * (coluna trocada, linha errada, tipo convertido de forma errada), e este
 * mock permite testá-la sem abrir o navegador nem tocar numa planilha real.
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

/** Célula vazia é '' (é assim que o Sheets devolve). */
function matriz(linhas, colunas, preencher) {
  var m = [];
  for (var r = 0; r < linhas; r++) {
    var linha = [];
    for (var c = 0; c < colunas; c++) linha.push(preencher === undefined ? '' : preencher);
    m.push(linha);
  }
  return m;
}

/** Uma aba. `dados` é matriz de valores, linha 1 = cabeçalho. */
function FakeSheet(nome, dados, maxRows, maxCols) {
  this._nome = nome;
  this._maxCols = maxCols || Math.max.apply(null, [1].concat(dados.map(function (l) { return l.length; })));
  this._maxRows = maxRows || Math.max(dados.length, 2);

  // Normaliza para uma matriz retangular do tamanho declarado.
  this._celulas = matriz(this._maxRows, this._maxCols);
  this._formulas = matriz(this._maxRows, this._maxCols);
  this._validacoes = matriz(this._maxRows, this._maxCols, null);

  for (var r = 0; r < dados.length && r < this._maxRows; r++) {
    for (var c = 0; c < dados[r].length && c < this._maxCols; c++) {
      var v = dados[r][c];
      this._celulas[r][c] = (v === undefined || v === null) ? '' : v;
    }
  }
}

FakeSheet.prototype.getName = function () { return this._nome; };
FakeSheet.prototype.hideRows = function (ini, n) {
  this._linhasOcultas = this._linhasOcultas || {};
  for (var i = 0; i < (n || 1); i++) this._linhasOcultas[ini + i] = true;
};
FakeSheet.prototype.hideColumns = function (ini, n) {
  this._colunasOcultas = this._colunasOcultas || {};
  for (var i = 0; i < (n || 1); i++) this._colunasOcultas[ini + i] = true;
};
FakeSheet.prototype.isRowHiddenByUser = function (l) { return !!(this._linhasOcultas || {})[l]; };
FakeSheet.prototype.isColumnHiddenByUser = function (c) { return !!(this._colunasOcultas || {})[c]; };
FakeSheet.prototype.getMaxRows = function () { return this._maxRows; };
FakeSheet.prototype.getMaxColumns = function () { return this._maxCols; };

/** Última linha com algum conteúdo (é assim que o Sheets se comporta). */
FakeSheet.prototype.getLastRow = function () {
  for (var r = this._maxRows - 1; r >= 0; r--) {
    for (var c = 0; c < this._maxCols; c++) {
      if (String(this._celulas[r][c]).trim() !== '') return r + 1;
    }
  }
  return 0;
};

FakeSheet.prototype.getLastColumn = function () {
  for (var c = this._maxCols - 1; c >= 0; c--) {
    for (var r = 0; r < this._maxRows; r++) {
      if (String(this._celulas[r][c]).trim() !== '') return c + 1;
    }
  }
  return 0;
};

/**
 * Aceita as duas formas do Apps Script:
 *   getRange(linha, coluna [, nLinhas, nColunas])
 *   getRange('B14')  |  getRange('B14:D20')
 */
FakeSheet.prototype.getRange = function (a, coluna, nLinhas, nColunas) {
  if (typeof a === 'string') {
    var r = interpretarA1(a);
    return new FakeRange(this, r.linha, r.coluna, r.nLinhas, r.nColunas);
  }
  return new FakeRange(this, a, coluna, nLinhas || 1, nColunas || 1);
};

/** 'B14' / 'B14:D20' -> {linha, coluna, nLinhas, nColunas}. */
function interpretarA1(a1) {
  var partes = String(a1).replace(/\$/g, '').toUpperCase().split(':');

  function ponto(s) {
    var m = /^([A-Z]+)(\d+)$/.exec(s);
    if (!m) throw new Error('Notação A1 não reconhecida: ' + a1);
    var col = 0;
    for (var i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
    return { linha: Number(m[2]), coluna: col };
  }

  var ini = ponto(partes[0]);
  if (partes.length === 1) return { linha: ini.linha, coluna: ini.coluna, nLinhas: 1, nColunas: 1 };

  var fim = ponto(partes[1]);
  return {
    linha: Math.min(ini.linha, fim.linha),
    coluna: Math.min(ini.coluna, fim.coluna),
    nLinhas: Math.abs(fim.linha - ini.linha) + 1,
    nColunas: Math.abs(fim.coluna - ini.coluna) + 1
  };
}

/** Cresce a aba se alguém escrever além do limite (o Sheets faz isso). */
FakeSheet.prototype._garantir = function (linha, coluna) {
  while (this._maxRows < linha) {
    this._celulas.push(matriz(1, this._maxCols)[0]);
    this._formulas.push(matriz(1, this._maxCols)[0]);
    this._validacoes.push(matriz(1, this._maxCols, null)[0]);
    this._maxRows++;
  }
  while (this._maxCols < coluna) {
    for (var r = 0; r < this._maxRows; r++) {
      this._celulas[r].push('');
      this._formulas[r].push('');
      this._validacoes[r].push(null);
    }
    this._maxCols++;
  }
};

function FakeRange(sheet, linha, coluna, nLinhas, nColunas) {
  this._s = sheet;
  this._l = linha;
  this._c = coluna;
  this._nl = nLinhas;
  this._nc = nColunas;
  sheet._garantir(linha + nLinhas - 1, coluna + nColunas - 1);
}

FakeRange.prototype.getSheet = function () { return this._s; };
FakeRange.prototype.getRow = function () { return this._l; };
FakeRange.prototype.getColumn = function () { return this._c; };
FakeRange.prototype.getNumRows = function () { return this._nl; };
FakeRange.prototype.getNumColumns = function () { return this._nc; };

FakeRange.prototype.getA1Notation = function () {
  function letra(n) {
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  var a = letra(this._c) + this._l;
  if (this._nl === 1 && this._nc === 1) return a;
  return a + ':' + letra(this._c + this._nc - 1) + (this._l + this._nl - 1);
};

FakeRange.prototype.getValues = function () {
  var out = [];
  for (var r = 0; r < this._nl; r++) {
    var linha = [];
    for (var c = 0; c < this._nc; c++) {
      linha.push(this._s._celulas[this._l - 1 + r][this._c - 1 + c]);
    }
    out.push(linha);
  }
  return out;
};

FakeRange.prototype.getValue = function () { return this.getValues()[0][0]; };

FakeRange.prototype.setValues = function (bloco) {
  if (bloco.length !== this._nl) {
    throw new Error('setValues: esperava ' + this._nl + ' linha(s), recebeu ' + bloco.length);
  }
  for (var r = 0; r < this._nl; r++) {
    if (bloco[r].length !== this._nc) {
      throw new Error('setValues: linha ' + r + ' com ' + bloco[r].length +
        ' coluna(s), esperava ' + this._nc);
    }
    for (var c = 0; c < this._nc; c++) {
      this._s._celulas[this._l - 1 + r][this._c - 1 + c] = bloco[r][c];
    }
  }
  return this;
};

FakeRange.prototype.setValue = function (v) {
  this._s._celulas[this._l - 1][this._c - 1] = v;
  return this;
};

FakeRange.prototype.clearContent = function () {
  for (var r = 0; r < this._nl; r++) {
    for (var c = 0; c < this._nc; c++) this._s._celulas[this._l - 1 + r][this._c - 1 + c] = '';
  }
  return this;
};

FakeRange.prototype.getFormula = function () {
  return this._s._formulas[this._l - 1][this._c - 1] || '';
};

FakeRange.prototype.setFormula = function (f) {
  this._s._formulas[this._l - 1][this._c - 1] = f;
  return this;
};

FakeRange.prototype.setFormulas = function (bloco) {
  for (var r = 0; r < bloco.length; r++) {
    for (var c = 0; c < bloco[r].length; c++) {
      this._s._formulas[this._l - 1 + r][this._c - 1 + c] = bloco[r][c];
    }
  }
  return this;
};

FakeRange.prototype.setDataValidation = function (regra) {
  for (var r = 0; r < this._nl; r++) {
    for (var c = 0; c < this._nc; c++) this._s._validacoes[this._l - 1 + r][this._c - 1 + c] = regra;
  }
  return this;
};

FakeRange.prototype.getDataValidation = function () {
  return this._s._validacoes[this._l - 1][this._c - 1];
};

/** Planilha. */
function FakeSpreadsheet(abas) {
  this._abas = abas || {};
  this._nomeados = {};
  this._toasts = [];
  this._alertas = [];
}

FakeSpreadsheet.prototype.getSheetByName = function (n) { return this._abas[n] || null; };
FakeSpreadsheet.prototype.getSheets = function () {
  var self = this;
  return Object.keys(this._abas).map(function (k) { return self._abas[k]; });
};
FakeSpreadsheet.prototype.getNamedRanges = function () {
  var self = this;
  return Object.keys(this._nomeados).map(function (nome) {
    return {
      getName: function () { return nome; },
      getRange: function () { return self._nomeados[nome]; },
      remove: function () { delete self._nomeados[nome]; }
    };
  });
};
FakeSpreadsheet.prototype.setNamedRange = function (nome, faixa) { this._nomeados[nome] = faixa; };
FakeSpreadsheet.prototype.getRangeByName = function (nome) { return this._nomeados[nome] || null; };
FakeSpreadsheet.prototype.toast = function (msg, titulo) { this._toasts.push({ titulo: titulo, msg: msg }); };

/**
 * Instala o ambiente falso em globalThis e carrega os arquivos .gs.
 * Devolve o controlador, com a planilha e os registros de alerta/toast.
 */
function instalar(abas) {
  var planilha = new FakeSpreadsheet(abas);

  var controlador = {
    planilha: planilha,
    alertas: [],
    toasts: planilha._toasts,
    respostaConfirmacao: true,
    validacoesCriadas: []
  };

  function novaRegra(tipo) {
    var r = { _tipo: tipo, _valores: null, _faixa: null, _ajuda: '', _permiteInvalido: true };
    var api = {
      requireValueInList: function (v) { r._tipo = 'lista'; r._valores = v; return api; },
      requireValueInRange: function (f) { r._tipo = 'faixa'; r._faixa = f; return api; },
      setAllowInvalid: function (b) { r._permiteInvalido = b; return api; },
      setHelpText: function (t) { r._ajuda = t; return api; },
      build: function () { controlador.validacoesCriadas.push(r); return r; }
    };
    return api;
  }

  globalThis.SpreadsheetApp = {
    getActiveSpreadsheet: function () { return planilha; },
    getActive: function () { return planilha; },
    newDataValidation: function () { return novaRegra(); },
    getUi: function () {
      return {
        alert: function (titulo, msg) {
          controlador.alertas.push({ titulo: titulo, msg: msg });
          return controlador.respostaConfirmacao ? 'YES' : 'NO';
        },
        ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
        Button: { YES: 'YES', NO: 'NO' },
        createMenu: function () {
          var m = {
            addItem: function () { return m; },
            addSeparator: function () { return m; },
            addToUi: function () { return m; }
          };
          return m;
        }
      };
    }
  };

  globalThis.Session = {
    getActiveUser: function () { return { getEmail: function () { return 'teste@clinica.local'; } }; }
  };

  globalThis.LockService = {
    getDocumentLock: function () {
      return { tryLock: function () { return true; }, releaseLock: function () {} };
    }
  };

  globalThis.ScriptApp = {
    getProjectTriggers: function () { return controlador._gatilhos || []; },
    newTrigger: function (fn) {
      var t = { _fn: fn };
      var api = {
        forSpreadsheet: function () { return api; },
        onEdit: function () { return api; },
        create: function () {
          controlador._gatilhos = controlador._gatilhos || [];
          controlador._gatilhos.push({ getHandlerFunction: function () { return t._fn; } });
          return t;
        }
      };
      return api;
    },
    deleteTrigger: function () {}
  };

  globalThis.Logger = { log: function () {} };

  /**
   * Carrega os .gs no escopo GLOBAL, na ordem de nome — exatamente como o
   * Apps Script faz ao concatenar os arquivos do projeto.
   *
   * `eval` indireto (guardado numa variável) avalia em escopo global, então as
   * `function`s dos .gs passam a existir em globalThis e podem chamar umas às
   * outras e o core, igual no ambiente real. `eval` direto criaria tudo dentro
   * desta função e nada seria visível de fora.
   */
  var dir = path.join(__dirname, '..', 'apps-script');
  var arquivos = fs.readdirSync(dir).filter(function (f) { return /\.gs$/.test(f); }).sort();
  var avaliarNoGlobal = eval;

  arquivos.forEach(function (f) {
    avaliarNoGlobal(fs.readFileSync(path.join(dir, f), 'utf8'));
  });

  controlador.arquivosCarregados = arquivos;
  return controlador;
}

module.exports = {
  FakeSheet: FakeSheet,
  FakeRange: FakeRange,
  FakeSpreadsheet: FakeSpreadsheet,
  instalar: instalar,
  matriz: matriz,
  interpretarA1: interpretarA1
};
