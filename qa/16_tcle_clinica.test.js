/**
 * QA 16 — Clínica e termo de consentimento
 *   - dados da clínica: gravação, validação, LOG e saneamento no backup
 *   - texto do termo personalizado pela equipe
 *   - termo assinado na tela: PDF válido, com os traços e o código
 *   - atalho do WhatsApp do paciente
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var RAIZ = path.join(__dirname, '..');
  var ctx = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {}, downloadBloqueado: function () { return false; } },
    SEED_INICIAL: dados.seed, Blob: Blob, console: console
  }));
  ['03_dados.js', '03b_pdf.js', '03c_tcle.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx);
  });
  var DADOS = vm.runInContext('DADOS', ctx);
  var TCLE = vm.runInContext('TCLE', ctx);
  var PDF = vm.runInContext('PDF', ctx);

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa' }); }

  /** Mesmo caminho do gerar(), devolvendo o texto do PDF em vez do Blob. */
  function fonteDoTermo(dadosTermo, opcoes) {
    var original = PDF.documento, fonte = null;
    PDF.documento = function (cfg) {
      var d = original(cfg), blob = d.blob;
      d.blob = function (r) { fonte = d.fonte(r); return blob(r); };
      return d;
    };
    try { TCLE.gerar(dadosTermo, opcoes); } finally { PDF.documento = original; }
    return fonte;
  }

  describe('Dados da clínica', function () {

    it('grava, e cada campo alterado vai para o LOG', function () {
      var st = novoStore();
      verdadeiro(st.salvarConfigClinica({ nome: 'Clínica X', cnpj: '12.345.678/0001-90', responsavel: 'Dr. Y', crm: '1234-SP' }).ok);
      igual(st.clinica().nome, 'Clínica X');
      var campos = st.estado.log.filter(function (l) { return l.aba === 'CONFIGURAÇÃO'; }).map(function (l) { return l.campo; });
      verdadeiro(campos.indexOf('NOME DA CLÍNICA') >= 0 && campos.indexOf('CNPJ') >= 0);
    });

    it('CNPJ precisa de 14 dígitos', function () {
      falso(novoStore().salvarConfigClinica({ cnpj: '12.345.678/0001' }).ok);
    });

    it('texto do termo no LOG vira tamanho, não o texto inteiro', function () {
      var st = novoStore();
      st.salvarConfigClinica({ textoTcle: 'Parágrafo um.\n\nParágrafo dois.' });
      var l = st.estado.log.filter(function (x) { return x.campo === 'TEXTO DO TCLE'; })[0];
      igual(l.de, '(padrão)');
      igual(l.para, '30 caracteres');
    });

    it('vai no backup e volta saneado', function () {
      var st = novoStore();
      st.salvarConfigClinica({ nome: 'Clínica X', textoTcle: 'Texto próprio.' });
      var r = DADOS.importarJSON(DADOS.exportarJSON(st.estado));
      igual(r.estado.config.clinica.nome, 'Clínica X');
      igual(r.estado.config.clinica.textoTcle, 'Texto próprio.');
      var mal = JSON.parse(DADOS.exportarJSON(st.estado));
      mal.dados.config.clinica.nome = { x: 1 };
      igual(DADOS.importarJSON(JSON.stringify(mal)).estado.config.clinica.nome, undefined);
    });
  });

  describe('Termo de consentimento', function () {

    it('texto próprio: um parágrafo por bloco separado por linha em branco', function () {
      var p = TCLE.paragrafos({ textoTcle: 'Primeiro\nparágrafo.\n\n\nSegundo.' });
      igual(p.length, 2);
      igual(p[0], 'Primeiro parágrafo.');
      igual(TCLE.paragrafos({}).length, vm.runInContext('TCLE_TEXTO.paragrafos.length', ctx), 'vazio = padrão');
    });

    var fonte = fonteDoTermo(
      { paciente: 'Ana Souza', procedimento: 'Rinoplastia', dataCirurgia: '2026-10-15', idCirurgia: 'CIR0001', idAvaliacao: 'AVP0001' },
      { clinica: { nome: 'Clínica Ávila', responsavel: 'Dr. Y', crm: '1234-SP', textoTcle: 'Declaro que li.' },
        assinatura: { tracos: [[[0.1, 0.5], [0.5, 0.2], [0.9, 0.6]]], nome: 'Ana Souza', documento: 'CPF 1',
          quando: '2026-09-25 10:00:00', codigo: 'abc123' } });

    it('sai um PDF válido, com xref certa', function () {
      igual(fonte.slice(0, 8), '%PDF-1.4');
      var sx = Number(fonte.match(/startxref\n(\d+)/)[1]);
      igual(fonte.slice(sx, sx + 4), 'xref');
    });

    it('leva a clínica, o texto próprio, a assinatura em vetor e o código', function () {
      verdadeiro(fonte.indexOf(PDF.literal('Clínica Ávila')) >= 0, 'nome da clínica');
      verdadeiro(fonte.indexOf(PDF.literal('Declaro que li.')) >= 0, 'texto próprio');
      verdadeiro(/q 0\.05 0\.16 0\.35 RG[\s\S]+? m\n[\s\S]+? l\n[\s\S]+?S\nQ/.test(fonte), 'traços da assinatura');
      verdadeiro(fonte.indexOf('abc123') >= 0, 'código de conferência');
      verdadeiro(fonte.indexOf(PDF.literal('Responsável técnico: Dr. Y — CRM 1234-SP')) >= 0 ||
        fonte.indexOf('CRM 1234-SP') >= 0, 'responsável técnico no rodapé');
    });
  });

  describe('WhatsApp do paciente', function () {
    it('monta o link com 55 + DDD + número', function () {
      verdadeiro(/^https:\/\/wa\.me\/5511987654321\?text=/.test(TCLE.linkWhatsApp('(11) 98765-4321', 'Ana')));
      verdadeiro(/^https:\/\/wa\.me\/5511987654321\?/.test(TCLE.linkWhatsApp('+55 11 98765-4321', 'Ana')));
      verdadeiro(/^https:\/\/wa\.me\/551133334444\?/.test(TCLE.linkWhatsApp('(11) 3333-4444', 'Ana')));
    });
    it('sem DDD não monta', function () {
      igual(TCLE.linkWhatsApp('98765-4321', 'Ana'), '');
      igual(TCLE.linkWhatsApp('', 'Ana'), '');
    });
  });
};
