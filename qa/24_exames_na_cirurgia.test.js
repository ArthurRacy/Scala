/**
 * QA 24 — Exames do paciente na tela de cirurgia nova
 *   - a regra que diz se a cirurgia gera avaliação (é nela que os PDFs ficam)
 *   - o que o store devolve e a tela usa para achar a avaliação recém-criada
 *   - ANEXOS.conferir e a fila de espera: PDFs escolhidos antes de a avaliação existir
 *   - ligações da tela de cirurgia e o CSS que mantém o modal dentro do celular
 * O IndexedDB e o DOM são verificados no navegador (docs/QA.md): Node não tem.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var RAIZ = path.join(__dirname, '..');

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa' }); }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Maria Teste', procedimento: 'Rinoplastia', cirurgiao: 'Dr. X', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Não', sala: 'Sala 1', valor: 1000, pago: 'Não'
    }, extra || {});
  }

  /** PDF de mentira, mas com o cabeçalho certo. Mesmo nome = mesmo arquivo (tamanho e data iguais). */
  function pdf(nome, conteudo) {
    return new File(['%PDF-1.4\n' + (conteudo || nome) + '\n%%EOF'], nome, { type: 'application/pdf', lastModified: 1700000000000 });
  }

  /** O FileReader do navegador, em cima de Blob.arrayBuffer() (o Node não tem FileReader). */
  function LeitorDeTeste() {}
  LeitorDeTeste.prototype.readAsArrayBuffer = function (blob) {
    var eu = this;
    blob.arrayBuffer().then(function (buf) { eu.result = buf; if (eu.onload) eu.onload(); },
      function () { if (eu.onerror) eu.onerror(); });
  };

  /** Uma "página" sem DOM e sem IndexedDB, só com o ANEXOS dentro. */
  function carregarAnexos() {
    var ctx = vm.createContext({
      window: {}, console: console, Blob: Blob, File: File, FileReader: LeitorDeTeste,
      UI: { salvarArquivo: function () { return Promise.resolve(true); } }
    });
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', '03a_anexos.js'), 'utf8'), ctx);
    return vm.runInContext('ANEXOS', ctx);
  }

  /** O motivo da recusa (a Promise tem de rejeitar). */
  function motivo(promessa) {
    return promessa.then(function () { throw new Error('deveria ter recusado'); }, function (e) { return e.message; });
  }

  /* ------------------------------------------------------------------ */

  describe('Exames — a cirurgia que gera a avaliação onde eles ficam', function () {

    it('cirurgiaPedeAvaliacao: "Sim" e não cancelada', function () {
      verdadeiro(core.cirurgiaPedeAvaliacao({ avaliacaoNec: 'Sim', status: 'Agendada' }));
      verdadeiro(core.cirurgiaPedeAvaliacao({ avaliacaoNec: 'Sim', status: 'Realizada' }));
      falso(core.cirurgiaPedeAvaliacao({ avaliacaoNec: 'Não', status: 'Agendada' }));
      falso(core.cirurgiaPedeAvaliacao({ avaliacaoNec: '', status: 'Agendada' }));
      falso(core.cirurgiaPedeAvaliacao({ avaliacaoNec: 'Sim', status: 'Cancelada' }), 'cancelada não gera');
      falso(core.cirurgiaPedeAvaliacao(null));
    });

    it('é a mesma regra que cria a linha: a tela e o store concordam nas quatro combinações', function () {
      ['Sim', 'Não'].forEach(function (nec) {
        ['Agendada', 'Cancelada'].forEach(function (status) {
          var st = novoStore();
          var r = st.adicionarCirurgia(cirurgia({ avaliacaoNec: nec, status: status }));
          verdadeiro(r.ok, nec + '/' + status);
          igual(r.criadas.length, core.cirurgiaPedeAvaliacao({ avaliacaoNec: nec, status: status }) ? 1 : 0, nec + '/' + status);
        });
      });
    });

    it('adicionarCirurgia devolve a avaliação criada (uid e idCirurgia): é por ela que a tela acha o destino dos PDFs', function () {
      var st = novoStore();
      var r = st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim' }));
      verdadeiro(r.ok);
      igual(r.criadas.length, 1);
      igual(r.criadas[0].idCirurgia, st.estado.cirurgias[0].id);
      verdadeiro(String(r.criadas[0].uid).length > 4, 'a avaliação nasce com uid');
      igual(st.estado.avaliacoes[0].uid, r.criadas[0].uid, 'é a mesma que ficou no estado');
    });

    it('cirurgia já lançada e marcada "Sim" depois também devolve a avaliação criada (Salvar alterações)', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia());
      igual(st.estado.avaliacoes.length, 0);
      var r = st.atualizarCirurgia(st.estado.cirurgias[0].id, { avaliacaoNec: 'Sim' });
      verdadeiro(r.ok);
      igual(r.criadas.length, 1);
      igual(r.criadas[0].uid, st.estado.avaliacoes[0].uid);
    });

    it('mesma semente, mesmo uid: a tela e o servidor concordam sobre a avaliação antes de o PDF ser enviado', function () {
      var ctx = { agora: '2026-10-05 08:00:00', semente: 'abc123xyz' };
      function rodar() {
        var st = novoStore();
        core.executarComContexto(ctx, function () { return st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim' })); });
        return st.estado.avaliacoes[0].uid;
      }
      igual(rodar(), rodar());
    });
  });

  /* ------------------------------------------------------------------ */

  describe('Exames — conferência do arquivo (ANEXOS.conferir)', function () {
    var ANEXOS = carregarAnexos();

    it('aceita PDF de verdade, inclusive com lixo antes do cabeçalho (até o 1º KB)', function () {
      return ANEXOS.conferir(pdf('hemograma.pdf')).then(function () {
        return ANEXOS.conferir(new File(['lixo\r\n\r\n%PDF-1.7\nconteúdo'], 'scanner.pdf'));
      });
    });

    it('recusa texto com extensão .pdf, arquivo vazio e arquivo grande demais, com a frase pronta para a tela', function () {
      return motivo(ANEXOS.conferir(new File(['não sou pdf'], 'falso.pdf'))).then(function (m) {
        igual(m, '"falso.pdf" não é um PDF.');
        return motivo(ANEXOS.conferir(new File([], 'vazio.pdf')));
      }).then(function (m) {
        igual(m, '"vazio.pdf" está vazio.');
        return motivo(ANEXOS.conferir({ name: 'enorme.pdf', size: ANEXOS.TAMANHO_MAXIMO + 1 }));
      }).then(function (m) {
        igual(m, '"enorme.pdf" passa de 25 MB.');
        return motivo(ANEXOS.conferir(null));
      }).then(function (m) { igual(m, 'Nenhum arquivo.'); });
    });
  });

  /* ------------------------------------------------------------------ */

  describe('Exames — fila de espera (ANEXOS.novaFila)', function () {

    it('separa o que entrou, o que foi recusado e o que já estava na fila', function () {
      var fila = carregarAnexos().novaFila();
      return fila.adicionar([pdf('hemograma.pdf'), new File(['x'], 'falso.pdf'), new File([], 'vazio.pdf')]).then(function (r) {
        igual(r.aceitos.map(function (f) { return f.name; }).join(','), 'hemograma.pdf');
        igual(r.recusados.map(function (x) { return x.nome; }).join(','), 'falso.pdf,vazio.pdf');
        verdadeiro(/não é um PDF/.test(r.recusados[0].motivo) && /vazio/.test(r.recusados[1].motivo), 'cada recusa traz o seu motivo');
        igual(r.repetidos.length, 0);
        return fila.adicionar([pdf('hemograma.pdf'), pdf('ecg.pdf')]);
      }).then(function (r) {
        igual(r.repetidos.join(','), 'hemograma.pdf', 'o mesmo arquivo de novo não duplica');
        igual(r.aceitos.map(function (f) { return f.name; }).join(','), 'ecg.pdf');
        igual(fila.itens().map(function (f) { return f.name; }).join(','), 'hemograma.pdf,ecg.pdf', 'na ordem em que entraram');
      });
    });

    it('nome igual com conteúdo diferente é outro arquivo', function () {
      var fila = carregarAnexos().novaFila();
      return fila.adicionar([pdf('exame.pdf', 'um')]).then(function () {
        return fila.adicionar([pdf('exame.pdf', 'outro conteúdo mais comprido')]);
      }).then(function (r) {
        igual(r.aceitos.length, 1);
        igual(fila.tamanho(), 2);
      });
    });

    it('duas levas soltas quase juntas com o mesmo arquivo não o duplicam', function () {
      var fila = carregarAnexos().novaFila();
      return Promise.all([fila.adicionar([pdf('a.pdf')]), fila.adicionar([pdf('a.pdf')])]).then(function (rs) {
        igual(fila.tamanho(), 1);
        igual(rs[0].aceitos.length + rs[1].aceitos.length, 1);
        igual(rs[0].repetidos.length + rs[1].repetidos.length, 1);
      });
    });

    it('remover tira só o arquivo indicado', function () {
      var fila = carregarAnexos().novaFila();
      var a = pdf('a.pdf'), b = pdf('b.pdf');
      return fila.adicionar([a, b]).then(function () {
        fila.remover(a);
        igual(fila.itens().map(function (f) { return f.name; }).join(','), 'b.pdf');
        fila.remover(a);   // remover de novo não faz nada
        igual(fila.tamanho(), 1);
      });
    });
  });

  /* ------------------------------------------------------------------ */

  describe('Exames — envio da fila para a avaliação', function () {

    /** ANEXOS no modo servidor, com uma "rede" que registra o que recebeu. */
    function comRede(recusa) {
      var ANEXOS = carregarAnexos(), recebidos = [];
      ANEXOS.usarServidor({
        enviar: function (avaliacao, arquivo) {
          if (recusa && recusa === arquivo.name) return Promise.reject(new Error('o servidor recusou'));
          recebidos.push(avaliacao.uid + ':' + arquivo.name);
          return Promise.resolve({
            id: 'EX' + recebidos.length, uidAvaliacao: avaliacao.uid, idAvaliacao: avaliacao.id, nome: arquivo.name,
            tamanho: arquivo.size, tipo: 'application/pdf', criadoEm: '2026-10-01T10:00:00Z', criadoPor: 'qa'
          });
        }
      });
      return { ANEXOS: ANEXOS, recebidos: recebidos };
    }

    it('manda um a um, na ordem, presos ao uid da avaliação, e esvazia a fila', function () {
      var x = comRede(), fila = x.ANEXOS.novaFila();
      return fila.adicionar([pdf('hemograma.pdf'), pdf('ecg.pdf')]).then(function () {
        return fila.enviarPara({ uid: 'uAVAL1', id: 'AVP0007' }, 'Fulana');
      }).then(function (res) {
        igual(res.feitos, 2);
        igual(res.falhas.length, 0);
        igual(x.recebidos.join(','), 'uAVAL1:hemograma.pdf,uAVAL1:ecg.pdf');
        igual(fila.tamanho(), 0);
        igual(x.ANEXOS.contar('uAVAL1'), 2, 'ficaram na lista da avaliação');
        igual(x.ANEXOS.contar('uOUTRA'), 0, 'e só nela');
      });
    });

    it('o que falha fica na fila e vem em `falhas`; os outros seguem (nada se perde em silêncio)', function () {
      var x = comRede('ecg.pdf'), fila = x.ANEXOS.novaFila();
      return fila.adicionar([pdf('hemograma.pdf'), pdf('ecg.pdf'), pdf('rx.pdf')]).then(function () {
        return fila.enviarPara({ uid: 'uAVAL1', id: 'AVP0007' });
      }).then(function (res) {
        igual(res.feitos, 2);
        igual(res.falhas.length, 1);
        igual(res.falhas[0].nome, 'ecg.pdf');
        igual(res.falhas[0].motivo, 'o servidor recusou');
        igual(x.recebidos.join(','), 'uAVAL1:hemograma.pdf,uAVAL1:rx.pdf');
        igual(fila.itens().map(function (f) { return f.name; }).join(','), 'ecg.pdf', 'fica para tentar de novo');
      });
    });

    it('avaliação sem uid: nada é enviado e todos os arquivos voltam em `falhas`', function () {
      var x = comRede(), fila = x.ANEXOS.novaFila();
      return fila.adicionar([pdf('a.pdf'), pdf('b.pdf')]).then(function () {
        return fila.enviarPara({ id: 'AVP0001' });
      }).then(function (res) {
        igual(res.feitos, 0);
        igual(res.falhas.length, 2);
        igual(x.recebidos.length, 0);
        igual(fila.tamanho(), 2);
      });
    });

    it('fila vazia não envia nada e não falha', function () {
      var x = comRede();
      return x.ANEXOS.novaFila().enviarPara({ uid: 'u1', id: 'AVP0001' }).then(function (res) {
        igual(res.feitos, 0);
        igual(res.falhas.length, 0);
      });
    });
  });

  /* ------------------------------------------------------------------ */

  describe('Exames — ligações da tela de cirurgia', function () {
    // Sem DOM no Node, estas conferem o que o navegador não deve perder numa edição futura.
    var tela = fs.readFileSync(path.join(RAIZ, 'webapp', 'js', 'telas', 'cirurgias.js'), 'utf8');
    var css = fs.readFileSync(path.join(RAIZ, 'webapp', 'css', 'app.css'), 'utf8');
    var salvar = (tela.match(/function salvar\(\) \{[\s\S]*?\n    \}\n/) || [''])[0];

    it('salvar() confere os exames ANTES de gravar e só manda a fila DEPOIS de fechar o modal', function () {
      verdadeiro(salvar.length > 200, 'salvar() não encontrada');
      var confere = salvar.indexOf('exames.impedimento()');
      var grava = salvar.indexOf('store.adicionarCirurgia');
      var fecha = salvar.indexOf('UI.fecharModal()');
      var envia = salvar.indexOf('exames.guardar(');
      verdadeiro(confere > 0 && confere < grava, 'impedimento() vem antes de gravar');
      verdadeiro(fecha > grava, 'o modal só fecha com a cirurgia gravada');
      verdadeiro(envia > fecha, 'os PDFs só seguem depois: a avaliação precisa existir');
    });

    it('erro de validação volta para a aba de dados, onde estão os campos com erro', function () {
      var depoisDoErro = salvar.slice(salvar.indexOf('if (!r.ok)'));
      var aba = depoisDoErro.indexOf("mostrarAba('dados')");
      var campos = depoisDoErro.indexOf('form.mostrarErros');
      verdadeiro(aba >= 0 && aba < campos, "mostrarAba('dados') antes de pintar os campos");
    });

    it('quem decide se a cirurgia gera avaliação é o core, não uma cópia da regra na tela', function () {
      verdadeiro(/cirurgiaPedeAvaliacao\(/.test(tela));
      falso(/STATUS_EXCLUIDO/.test(tela), 'a tela não repete a regra do status cancelado');
    });

    it('a aba de exames não entra nos dados gravados da cirurgia', function () {
      // form.dados() só lê os campos do UI.formulario; a fila vive em abaExames.
      var lista = (tela.match(/var form = UI\.formulario\(\[[\s\S]*?\]\);/) || [''])[0];
      verdadeiro(lista.length > 20, 'lista de campos do formulário');
      falso(/exame/i.test(lista), 'nenhum campo de exame dentro do formulário');
    });

    // Sem os comentários: o de .modal cita "min-width: 0" e faria o teste passar sem a declaração.
    var semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');

    it('o modal não passa da largura do celular com nome de arquivo comprido (.modal { min-width: 0 })', function () {
      var bloco = (semComentarios.match(/\n\.modal \{[\s\S]*?\n\}/) || [''])[0];
      verdadeiro(bloco.length > 20, 'regra .modal não encontrada');
      verdadeiro(/min-width:\s*0/.test(bloco), 'sem min-width: 0 o modal estourava 375px e cortava o botão de salvar');
    });

    it('com abas, a altura do modal é fixa (não encolhe e cresce a cada troca)', function () {
      verdadeiro(/\.modal\.com-abas \{[^}]*\bheight:/.test(semComentarios));
    });

    it('arquivo solto fora da área de exames é barrado (o navegador não abre o PDF no lugar do sistema)', function () {
      verdadeiro(/COMP\.impedirSoltarArquivo\(caixa\.parentNode\)/.test(tela));
    });
  });
};
