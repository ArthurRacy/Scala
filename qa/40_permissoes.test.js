/**
 * QA 40 — Permissões por usuário (core/12b_permissoes.js, server/contas.js, docs/PERMISSOES.md)
 *   - catálogo: ids únicos, grupos e dependências que existem, sem ciclo; toda operação do store, toda tela e toda
 *     rota do servidor apontam para uma permissão (ou são só do chefe / só do servidor)
 *   - dependências: ligar uma liga o que ela exige; desligar desliga o que depende dela; lista incoerente é recusada;
 *     lista guardada com dependência faltando fecha (nunca abre mais do que está escrito)
 *   - o LOG e "Baixar os dados" mostram dinheiro e contatos: exigem ver o repasse e os contatos
 *   - acesso ajustado: o que entra vale, o que sai deixa de valer (telas, operações, campos)
 *   - corte e réplica: em todas as combinações válidas dos cortes, a tela que reexecuta os comandos já cortados
 *     chega ao mesmo estado visível que o servidor mostraria
 *   - servidor: migração sem mudar o acesso de ninguém (com cópia), chefe principal, exclusivas do chefe, rotas por
 *     permissão, permissão nova derruba as sessões e deixa rastro
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;
  var RAIZ = path.join(__dirname, '..');
  var U = require('./_servidor_util')(core);
  var DADOS = U.DADOS;

  var TELAS = ['painel', 'escala', 'quadro', 'cirurgias', 'avaliacoes', 'boletim', 'qualidade',
    'horas', 'financeiro', 'repasse', 'indicadores', 'painel_qualidade', 'estrutura',
    'anestesistas', 'clinica', 'integridade', 'log', 'usuarios', 'dados'];

  function comLista(papel, lista) { return { papel: papel, permissoes: lista }; }
  function semAs(lista, tirar) { return lista.filter(function (x) { return tirar.indexOf(x) < 0; }); }

  describe('Permissões — o catálogo', function () {

    it('29 permissões, ids únicos, grupos e dependências que existem, "Ver a operação" sempre', function () {
      igual(core.PERMISSOES.length, 29);
      igual(new Set(core.IDS_DE_PERMISSAO).size, 29, 'ids repetidos');
      var grupos = core.GRUPOS_DE_PERMISSAO.map(function (g) { return g.id; });
      core.PERMISSOES.forEach(function (p) {
        verdadeiro(grupos.indexOf(p.grupo) >= 0, p.id + ': grupo ' + p.grupo);
        verdadeiro(p.rotulo && p.descricao, p.id + ' sem rótulo ou descrição');
        p.depende.forEach(function (d) { verdadeiro(core.IDS_DE_PERMISSAO.indexOf(d) >= 0, p.id + ' depende de ' + d + ', que não existe'); });
        (p.cuidado || []).forEach(function (c) { verdadeiro(!!core.CUIDADOS_DE_PERMISSAO[c], p.id + ': cuidado ' + c); });
      });
      igual(core.PERMISSOES.filter(function (p) { return p.sempre; }).map(function (p) { return p.id; }).join(), 'operacao.ver');
    });

    it('dependências sem ciclo: nenhuma permissão depende, por algum caminho, dela mesma', function () {
      core.IDS_DE_PERMISSAO.forEach(function (id) {
        falso(core.dependentesDe(id).indexOf(id) >= 0, id + ' está num ciclo');
      });
    });

    it('toda operação do store tem dono no catálogo: uma permissão, só o chefe ou só o servidor', function () {
      core.MUTACOES_STORE.forEach(function (nome) {
        var p = core.PERMISSAO_DA_OPERACAO[nome];
        verdadeiro(p === core.SO_CHEFE || p === core.INTERNA || core.IDS_DE_PERMISSAO.indexOf(p) >= 0, nome + ' sem permissão: ' + p);
      });
      igual(Object.keys(core.PERMISSAO_DA_OPERACAO).sort().join(), core.MUTACOES_STORE.slice().sort().join(), 'tabela com operação que não existe');
    });

    it('toda tela tem permissão; Usuários é só do chefe', function () {
      TELAS.forEach(function (tela) {
        var p = core.PERMISSAO_DA_TELA[tela];
        verdadeiro(p === core.SO_CHEFE || core.IDS_DE_PERMISSAO.indexOf(p) >= 0, tela + ': ' + p);
      });
      igual(core.PERMISSAO_DA_TELA.usuarios, core.SO_CHEFE);
      var app = fs.readFileSync(path.join(RAIZ, 'webapp', 'js', '06_app.js'), 'utf8');
      var naCasca = (app.match(/\{ chave: '(\w+)'/g) || []).map(function (s) { return s.replace(/\{ chave: '|'/g, ''); });
      igual(naCasca.slice().sort().join(), TELAS.filter(function (x) { return x !== 'dados'; }).sort().join(), 'telas da casca');
    });

    it('toda rota da tabela é conferida no servidor, e o servidor não tem rota de chefe fora da tabela', function () {
      var fonte = fs.readFileSync(path.join(RAIZ, 'server', 'servidor.js'), 'utf8');
      Object.keys(core.PERMISSAO_DA_ROTA).forEach(function (rota) {
        var p = core.PERMISSAO_DA_ROTA[rota];
        verdadeiro(p === core.SO_CHEFE || core.IDS_DE_PERMISSAO.indexOf(p) >= 0, rota + ': ' + p);
        verdadeiro(fonte.indexOf("exigirDaRota('" + rota + "')") >= 0, rota + ' não é conferida no servidor');
      });
      igual((fonte.match(/soChefe\(\)/g) || []).length, 2, 'soChefe só dentro de exigir()');
    });

    it('os modelos são listas coerentes, e nenhum traz o que é da coordenação, da auditoria ou do download', function () {
      Object.keys(core.MODELOS_DE_PERMISSAO).forEach(function (m) {
        var v = core.validarPermissoes(core.MODELOS_DE_PERMISSAO[m]);
        verdadeiro(v.ok, m + ': ' + JSON.stringify(v.erros));
        igual(core.completarDependencias(core.MODELOS_DE_PERMISSAO[m]).join(), v.lista.join(), m + ' completo');
        ['qualidade.comparar', 'qualidade.coordenar', 'auditoria.ver', 'integridade', 'dados.exportar'].forEach(function (p) {
          falso(core.MODELOS_DE_PERMISSAO[m].indexOf(p) >= 0, m + ' não traz ' + p);
        });
      });
    });

    it('o chefe tem todas; perfil desconhecido, nenhuma', function () {
      igual(core.permissoesDe('chefe').length, 29);
      igual(core.permissoesDe({ papel: 'chefe', permissoes: [] }).length, 29, 'lista guardada não diminui o chefe');
      igual(core.permissoesDe('visitante').length, 0);
      igual(core.permissoesDe({ papel: 'visitante', permissoes: core.IDS_DE_PERMISSAO }).length, 0);
    });
  });

  describe('Permissões — dependências', function () {

    it('ligar uma liga o que ela exige; desligar desliga o que depende dela', function () {
      igual(core.completarDependencias(['repasse.gerir']).join(), 'operacao.ver,financeiro.ver,repasse.ver,repasse.gerir');
      igual(core.completarDependencias(['boletim.reabrir']).join(), 'operacao.ver,boletim.ver,boletim.preencher,boletim.assinar,boletim.reabrir');
      igual(core.dependentesDe('financeiro.ver').join(), 'financeiro.editar,repasse.ver,repasse.gerir,auditoria.ver,integridade,dados.exportar');
      igual(core.dependentesDe('exames.ver').join(), 'exames.anexar,exames.remover,dados.exportar');
    });

    it('o LOG e o download mostram dinheiro e contatos: exigem ver o repasse e os contatos', function () {
      var a = core.completarDependencias(['auditoria.ver']);
      ['financeiro.ver', 'repasse.ver', 'contatos.ver'].forEach(function (p) { verdadeiro(a.indexOf(p) >= 0, 'auditoria precisa de ' + p); });
      var d = core.completarDependencias(['dados.exportar']);
      ['auditoria.ver', 'exames.ver', 'financeiro.ver', 'contatos.ver'].forEach(function (p) { verdadeiro(d.indexOf(p) >= 0, 'download precisa de ' + p); });
    });

    it('lista incoerente ou com permissão inventada é recusada, com o porquê', function () {
      var v = core.validarPermissoes(['operacao.ver', 'repasse.gerir']);
      falso(v.ok);
      verdadeiro(/"Gerir o repasse" precisa de "Ver o repasse"/.test(v.erros[0].msg), v.erros[0].msg);
      var w = core.validarPermissoes(['operacao.ver', 'tudo.liberado']);
      falso(w.ok);
      verdadeiro(/não existe: tudo\.liberado/.test(w.erros[0].msg));
      falso(core.validarPermissoes('operacao.ver').ok, 'texto no lugar de lista');
      verdadeiro(core.validarPermissoes([]).ok, 'lista vazia vira só "Ver a operação"');
      igual(core.validarPermissoes([]).lista.join(), 'operacao.ver');
    });

    it('lista guardada com dependência faltando fecha, e o que não se conhece é ignorado', function () {
      var quem = comLista('anestesista', ['operacao.ver', 'repasse.gerir', 'boletim.ver', 'coisa.qualquer']);
      igual(core.permissoesDe(quem).join(), 'operacao.ver,boletim.ver');
      falso(core.perfilPodeExecutar(quem, 'registrarPagamentoRepasse', []).ok);
    });

    it('modelo reconhecido só quando a lista é exatamente a dele', function () {
      igual(core.modeloDaLista(core.MODELOS_DE_PERMISSAO.secretaria), 'secretaria');
      igual(core.modeloDaLista(core.MODELOS_DE_PERMISSAO.anestesista.concat(['horas.ver'])), '');
      igual(core.rotuloDoAcesso(comLista('anestesista', core.MODELOS_DE_PERMISSAO.anestesista.concat(['horas.ver']))), 'Anestesista (ajustado)');
      igual(core.rotuloDoAcesso('secretaria'), 'Secretária');
    });
  });

  describe('Permissões — acesso ajustado pessoa a pessoa', function () {

    var ANEST = core.MODELOS_DE_PERMISSAO.anestesista;
    var SEC = core.MODELOS_DE_PERMISSAO.secretaria;

    it('o que entra vale: anestesista com Horas e Indicadores abre as duas telas', function () {
      var quem = comLista('anestesista', ANEST.concat(['horas.ver', 'indicadores.ver']));
      verdadeiro(core.perfilPodeVerTela(quem, 'horas') && core.perfilPodeVerTela(quem, 'indicadores'));
      falso(core.perfilPodeVerTela(quem, 'financeiro'), 'sem dinheiro continua');
    });

    it('o que sai deixa de valer: secretária sem excluir cirurgia e sem remover exame', function () {
      var quem = comLista('secretaria', semAs(SEC, ['cirurgias.excluir', 'exames.remover']));
      falso(core.perfilPodeExecutar(quem, 'removerCirurgia', ['CIR0001']).ok);
      verdadeiro(core.perfilPodeExecutar(quem, 'atualizarCirurgia', ['CIR0001', { obs: 'x' }]).ok);
      falso(core.pode(quem, 'exames.remover'));
      verdadeiro(core.pode(quem, 'exames.anexar'));
    });

    it('ver valores sem poder alterá-los: recebe o dinheiro, mas não o envia', function () {
      var quem = comLista('anestesista', ANEST.concat(['financeiro.ver']));
      var r = core.perfilPodeExecutar(quem, 'atualizarCirurgia', ['CIR0001', { valor: 10 }]);
      falso(r.ok);
      igual(r.motivo, 'campo');
      var estado = { cirurgias: [{ id: 'CIR0001', valor: 10, pago: 'Sim' }], avaliacoes: [], anestesistas: [], repasses: [{ x: 1 }], log: [{ y: 1 }] };
      var visto = core.projetarEstadoParaPerfil(estado, quem);
      igual(visto.cirurgias[0].valor, 10, 'vê o valor');
      igual(visto.repasses.length, 0, 'sem "Ver o repasse"');
      igual(visto.log.length, 0, 'sem a auditoria');
    });

    it('revisão clínica separada do preenchimento da ficha', function () {
      var quem = comLista('secretaria', semAs(SEC, ['qualidade.revisar']));
      verdadeiro(core.perfilPodeExecutar(quem, 'salvarFichaQualidade', []).ok);
      falso(core.perfilPodeExecutar(quem, 'revisarFichaQualidade', []).ok);
      falso(core.perfilPodeExecutar(quem, 'reabrirFichaQualidade', []).ok);
    });

    it('quem recebe todas as 29 continua sem o que é só do chefe', function () {
      var quem = comLista('secretaria', core.IDS_DE_PERMISSAO);
      falso(core.perfilPodeExecutar(quem, 'salvarConfigLog', []).ok, 'regras do LOG');
      falso(core.perfilPodeVerTela(quem, 'usuarios'), 'tela Usuários');
      falso(core.pode(quem, core.SO_CHEFE));
      falso(core.perfilPodeExecutar(quem, 'arquivarLogAte', []).ok, 'nem o que é do servidor');
    });
  });

  describe('Permissões — corte e réplica em todas as combinações válidas', function () {

    var HOJE = '2026-10-05';
    var CIR = { status: 'Realizada', data: '2026-10-05', inicioPrev: '07:00', fimPrev: '09:00', inicioReal: '07:00', fimReal: '09:00',
      paciente: 'Paciente A', procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não' };

    var BASE = core.MODELOS_DE_PERMISSAO.anestesista;
    var LIGAVEIS = ['financeiro.ver', 'repasse.ver', 'contatos.ver', 'auditoria.ver'];

    /** As listas que dá para montar ligando ou não cada interruptor (as incoerentes ficam de fora). */
    function combinacoes() {
      var saida = [], vistos = {};
      for (var m = 0; m < 16; m++) {
        var lista = BASE.concat(LIGAVEIS.filter(function (p, i) { return m & (1 << i); }));
        var v = core.validarPermissoes(lista);
        if (!v.ok) continue;
        var chave = v.lista.join();
        if (!vistos[chave]) { vistos[chave] = true; saida.push(v.lista); }
      }
      return saida;
    }

    function semOsCarimbos(estado) {
      var e = JSON.parse(JSON.stringify(estado));
      delete e.salvoEm;
      e.log = [];
      return e;
    }

    it('sete combinações válidas dos cortes (dinheiro, repasse, contatos, LOG)', function () {
      igual(combinacoes().length, 7);
    });

    it('em cada uma, o corte bate com a permissão e a tela chega ao mesmo estado visível do servidor', function () {
      combinacoes().forEach(function (lista) {
        var quem = comLista('anestesista', lista);
        var completo = core.criarStoreComSeed(dados.seed, { usuario: 'Chefe', horizonte: 'movel', hoje: HOJE });
        var visao = core.criarStore(DADOS.sanearEstado(JSON.parse(JSON.stringify(
          core.projetarEstadoParaPerfil(DADOS.enxugar(completo.estado), quem)))), { usuario: 'Tela', horizonte: 'movel', hoje: HOJE });
        visao.recalcular();
        var n = 0, falhas = [];
        function comando(nome) {
          var args = Array.prototype.slice.call(arguments, 1);
          var ctx = { agora: HOJE + ' 10:' + String(10 + (++n)).padStart(2, '0') + ':00', semente: 'sem' + n + 'abcdef' };
          var r = core.executarComContexto(ctx, function () { return completo[nome].apply(completo, JSON.parse(JSON.stringify(args))); });
          if (!r || r.ok === false) return;
          var enviado = core.redigirComandoParaPerfil({ revisao: n, nome: nome, args: JSON.parse(JSON.stringify(args)), contexto: ctx, usuario: 'Chefe' }, quem);
          if (enviado.oculto) return;
          visao.usuario = enviado.usuario;
          var res = core.executarComContexto(enviado.contexto, function () { return visao[enviado.nome].apply(visao, enviado.args); });
          if (!res || res.ok === false) falhas.push(nome + ': ' + JSON.stringify(res && res.erros));
        }
        comando('adicionarCirurgia', Object.assign({}, CIR, { valor: 1837.45, pago: 'Não' }));
        comando('adicionarCirurgia', Object.assign({}, CIR, { paciente: 'Paciente B', inicioPrev: '10:00', fimPrev: '11:00',
          inicioReal: '10:00', fimReal: '11:00', anestesista: 'Alene Cunha', avaliacaoNec: 'Sim' }));
        comando('atualizarCirurgia', 'CIR0001', { valor: 2291.9, pago: 'Sim', nf: 'NF-ALFA' });
        comando('atualizarAvaliacao', completo.estado.avaliacoes[0].id, { realizada: 'Sim', valor: 351.15, nf: 'NF-BETA' });
        comando('salvarAnestesista', { id: 'A02', pix: 'a02@exemplo.com', telefone: '(11) 90000-0000' });
        comando('salvarDespesasRepasse', 2026, 10, 123.45, 'aluguel');
        comando('registrarPagamentoRepasse', 2026, 10, 'A01', 61.37, '2026-10-20');
        comando('removerCirurgia', 'CIR0002', { comAvaliacoes: true });

        var nomeDaLista = LIGAVEIS.filter(function (p) { return lista.indexOf(p) >= 0; }).join('+') || 'só o modelo';
        igual(falhas.join(' | '), '', nomeDaLista + ': nenhum comando cortado pode falhar na tela');
        var c = { dinheiro: lista.indexOf('financeiro.ver') < 0, repasse: lista.indexOf('repasse.ver') < 0, contatos: lista.indexOf('contatos.ver') < 0 };
        var crua = JSON.stringify(DADOS.enxugar(visao.estado));
        igual(crua.indexOf('NF-ALFA') < 0, c.dinheiro, nomeDaLista + ': dinheiro');
        igual(visao.estado.repasses.length === 0, c.repasse, nomeDaLista + ': repasse');
        igual(crua.indexOf('a02@exemplo.com') < 0, c.contatos, nomeDaLista + ': contatos');
        igual(core.jsonCanonico(semOsCarimbos(core.projetarEstadoParaPerfil(DADOS.enxugar(completo.estado), quem))),
          core.jsonCanonico(semOsCarimbos(core.projetarEstadoParaPerfil(DADOS.enxugar(visao.estado), quem))),
          nomeDaLista + ': o que a tela enxerga = o que o servidor mostraria');
      });
    });
  });

  describe('Permissões no servidor', function () {

    function contasDe(pasta) { return JSON.parse(fs.readFileSync(path.join(pasta, 'usuarios.json'), 'utf8')); }

    it('arquivo antigo, sem listas: cada um ganha a do seu modelo (o mesmo acesso), com cópia do arquivo de antes', function () {
      var pasta = U.pastaTemp();
      var antigo = [
        { login: 'admin', nome: 'Chefe', papel: 'admin', ativo: true, sal: 'x', hash: 'y' },
        { login: 'chefe2', nome: 'Outro chefe', papel: 'chefe', ativo: true, sal: 'x', hash: 'y' },
        { login: 'dra', nome: 'Doutora', papel: 'equipe', ativo: true, sal: 'x', hash: 'y' },
        { login: 'sec', nome: 'Secretária', papel: 'secretaria', ativo: true, sal: 'x', hash: 'y' }
      ];
      fs.writeFileSync(path.join(pasta, 'usuarios.json'), JSON.stringify(antigo));
      var contas = require('../server/contas').criarContas(pasta, { custo: 1024 });
      var u = {};
      contas.listar().forEach(function (x) { u[x.login] = x; });
      igual(u.dra.permissoes.join(), core.permissoesDe('anestesista').join(), 'anestesista com o modelo');
      igual(u.sec.permissoes.join(), core.permissoesDe('secretaria').join(), 'secretária com o modelo');
      igual(u.admin.permissoes.length, 29, 'chefe com todas');
      verdadeiro(u.admin.principal && !u.chefe2.principal, 'um só principal: o primeiro chefe');
      var gravado = contasDe(pasta);
      verdadeiro(Array.isArray(gravado[2].permissoes) && Array.isArray(gravado[3].permissoes), 'lista escrita por extenso no arquivo');
      falso('permissoes' in gravado[0], 'o chefe não guarda lista');
      igual(JSON.parse(fs.readFileSync(path.join(pasta, 'usuarios.antes-das-permissoes.json'), 'utf8'))[2].papel, 'equipe', 'cópia de antes');
    });

    it('só o chefe principal cria, promove, altera ou rebaixa outro chefe; o principal só sai passando a função', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (principal, srv, p, base) {
        var outro = U.cliente(base);
        return U.chefe(principal, pasta).then(function () {
          return principal.post('/api/usuarios', { novo: true, login: 'chefe2', nome: 'Chefe Dois', papel: 'chefe', senha: U.SENHA });
        }).then(function (r) {
          igual(r.status, 200, 'o principal cria outro chefe: ' + JSON.stringify(r.corpo));
          falso(r.corpo.usuario.principal, 'o novo não é principal');
          return outro.post('/api/entrar', { login: 'chefe2', senha: U.SENHA });
        }).then(function () {
          return outro.post('/api/usuarios', { novo: true, login: 'chefe3', nome: 'Chefe Três', papel: 'chefe', senha: U.SENHA });
        }).then(function (r) {
          igual(r.status, 400, 'o outro chefe não cria chefe');
          verdadeiro(/principal/.test(r.corpo.erros[0].msg));
          return outro.post('/api/usuarios', { novo: true, login: 'sec1', nome: 'Secretária Um', papel: 'secretaria', senha: U.SENHA });
        }).then(function (r) {
          igual(r.status, 200, 'mas cadastra usuários');
          return outro.post('/api/usuarios', { login: 'sec1', papel: 'chefe' });
        }).then(function (r) {
          igual(r.status, 400, 'e não promove ninguém a chefe');
          return outro.post('/api/usuarios', { login: 'admin', ativo: false });
        }).then(function (r) {
          igual(r.status, 400, 'nem desativa o principal');
          return principal.post('/api/usuarios', { login: 'admin', papel: 'anestesista' });
        }).then(function (r) {
          igual(r.status, 400, 'o principal não se rebaixa');
          verdadeiro(/passe a função/.test(r.corpo.erros[0].msg));
          return outro.post('/api/usuarios/principal', { login: 'chefe2' });
        }).then(function (r) {
          igual(r.status, 400, 'só o principal passa a função');
          return principal.post('/api/usuarios/principal', { login: 'sec1' });
        }).then(function (r) {
          igual(r.status, 400, 'a função só vai para um chefe');
          return principal.post('/api/usuarios/principal', { login: 'chefe2' });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          var u = contasDe(pasta);
          igual(u.filter(function (x) { return x.principal; }).map(function (x) { return x.login; }).join(), 'chefe2', 'um só principal');
          return principal.post('/api/usuarios', { login: 'chefe2', ativo: false });
        }).then(function (r) {
          igual(r.status, 400, 'o antigo principal agora não mexe no novo');
          return outro.post('/api/usuarios', { login: 'admin', papel: 'anestesista' });
        }).then(function (r) {
          igual(r.status, 200, 'o novo principal rebaixa o antigo: ' + JSON.stringify(r.corpo));
          igual(r.corpo.usuario.permissoes.join(), core.permissoesDe('anestesista').join(), 'e ele fica com o modelo do perfil novo');
        });
      }, pasta);
    });

    it('permissões ajustadas pelo chefe valem no servidor: telas, comandos e rotas', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (chefe, srv, p, base) {
        var sec;
        var lista = core.completarDependencias(semAs(core.MODELOS_DE_PERMISSAO.secretaria,
          ['cirurgias.excluir', 'exames.remover', 'exames.anexar']).concat(['dados.exportar']));
        return U.chefe(chefe, pasta).then(function () {
          return U.novoUsuario(chefe, base, 'sec1', 'Secretária Um', 'secretaria');
        }).then(function (c) {
          sec = c;
          return chefe.post('/api/usuarios', { login: 'sec1', permissoes: lista });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          verdadeiro(r.corpo.entraram.indexOf('dados.exportar') >= 0 && r.corpo.sairam.indexOf('cirurgias.excluir') >= 0, 'diz o que entrou e saiu');
          return sec.get('/api/estado');
        }).then(function (r) {
          igual(r.status, 401, 'mudou a permissão: a sessão caiu');
          return sec.post('/api/entrar', { login: 'sec1', senha: U.SENHA });
        }).then(function () {
          return U.comando(chefe, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { avaliacaoNec: 'Sim' }));
        }).then(function () {
          return U.comando(sec, 'removerCirurgia', 'CIR0001', { comAvaliacoes: true });
        }).then(function (x) {
          igual(x.resp.status, 403, 'não exclui mais cirurgia');
          igual(x.resp.corpo.motivo, 'perfil');
          return sec.get('/api/estado');
        }).then(function (r) {
          verdadeiro(r.corpo.estado.log.length > 0, 'com "Ver a auditoria" (veio junto do download), recebe o LOG');
          return sec.post('/api/anexos', U.PDF, { 'X-Uid-Avaliacao': r.corpo.estado.avaliacoes[0].uid, 'X-Nome': 'x.pdf', 'Content-Type': 'application/pdf' });
        }).then(function (r) {
          igual(r.status, 403, 'não anexa exame');
          return sec.get('/api/backup');
        }).then(function (r) {
          igual(r.status, 200, 'baixa o backup');
          return sec.get('/api/auditoria/acessos');
        }).then(function (r) {
          igual(r.status, 200, 'lê os acessos');
          return sec.post('/api/auditoria/rotacionar', {});
        }).then(function (r) {
          igual(r.status, 403, 'arquivar o LOG continua só do chefe');
          return sec.post('/api/importar', '{}', { 'Content-Type': 'application/json' });
        }).then(function (r) {
          igual(r.status, 403, 'importar continua só do chefe');
          return sec.get('/api/usuarios');
        }).then(function (r) {
          igual(r.status, 403, 'usuários continuam só do chefe');
          return chefe.get('/api/auditoria/acessos?evento=usuario_alterado');
        }).then(function (r) {
          var ev = r.corpo.eventos.filter(function (e) { return e.evento === 'usuario_alterado'; })[0];
          verdadeiro(ev && /sec1/.test(ev.detalhe) && /\+dados\.exportar/.test(ev.detalhe) && /-cirurgias\.excluir/.test(ev.detalhe),
            'o rastro diz quem, de quem e o que entrou e saiu: ' + (ev && ev.detalhe));
        });
      }, pasta);
    });

    it('lista incoerente ou inventada não é gravada; e só quem assina pode ser ligado a um anestesista', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (chefe, srv, p, base) {
        return U.chefe(chefe, pasta).then(function () {
          return U.novoUsuario(chefe, base, 'dra1', 'Doutora Um', 'anestesista');
        }).then(function () {
          return chefe.post('/api/usuarios', { login: 'dra1', permissoes: ['operacao.ver', 'repasse.gerir'] });
        }).then(function (r) {
          igual(r.status, 400);
          verdadeiro(/precisa de/.test(r.corpo.erros[0].msg));
          return chefe.post('/api/usuarios', { login: 'dra1', permissoes: ['operacao.ver', 'superpoder'] });
        }).then(function (r) {
          igual(r.status, 400);
          return chefe.post('/api/usuarios', { login: 'dra1', permissoes: semAs(core.MODELOS_DE_PERMISSAO.anestesista, ['boletim.assinar', 'boletim.reabrir']), anestesistaId: 'A07' });
        }).then(function (r) {
          igual(r.status, 400, 'sem "Assinar o boletim" não é ligada');
          verdadeiro(/não assina boletim/.test(r.corpo.erros[0].msg), JSON.stringify(r.corpo));
          var gravada = contasDe(pasta).filter(function (x) { return x.login === 'dra1'; })[0];
          igual(gravada.permissoes.join(), core.permissoesDe('anestesista').join(), 'nada gravado nas recusas');
        });
      }, pasta);
    });

    it('sem "Abrir os exames" o servidor não entrega nem a lista nem o PDF', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (chefe, srv, p, base) {
        var dra, id;
        return U.chefe(chefe, pasta).then(function () {
          return U.comando(chefe, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { avaliacaoNec: 'Sim' }));
        }).then(function (x) {
          return chefe.post('/api/anexos', U.PDF, { 'X-Uid-Avaliacao': x.store.estado.avaliacoes[0].uid, 'X-Nome': 'e.pdf', 'Content-Type': 'application/pdf' });
        }).then(function (r) {
          id = r.corpo.meta.id;
          return chefe.post('/api/usuarios', { novo: true, login: 'dra1', nome: 'Doutora Um', papel: 'anestesista', senha: U.SENHA,
            permissoes: semAs(core.MODELOS_DE_PERMISSAO.anestesista, ['exames.ver', 'exames.anexar', 'exames.remover']) });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          dra = U.cliente(base);
          return dra.post('/api/entrar', { login: 'dra1', senha: U.SENHA });
        }).then(function () { return dra.get('/api/anexos'); }).then(function (r) {
          igual(r.status, 403, 'lista');
          return dra.get('/api/anexos/' + id);
        }).then(function (r) {
          igual(r.status, 403, 'PDF');
          return dra.del('/api/anexos/' + id);
        }).then(function (r) {
          igual(r.status, 403, 'remover');
        });
      }, pasta);
    });
  });

  describe('Permissões — a tela de Usuários e a demonstração seguem as mesmas regras', function () {

    function demo() {
      var guardado = {};
      var ctx = vm.createContext(Object.assign({}, core, {
        UI: { info: function () {}, ok: function () {} }, console: console,
        sessionStorage: { getItem: function () { return 'chefe'; }, setItem: function () {}, removeItem: function () {} },
        localStorage: {
          getItem: function (k) { return guardado[k] || null; },
          setItem: function (k, v) { guardado[k] = String(v); }
        },
        location: { reload: function () {} }
      }));
      vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', 'demo_online.js'), 'utf8'), ctx);
      var D = vm.runInContext('DEMO', ctx);
      var st = core.criarStoreComSeed(dados.seed, { usuario: 'demo', horizonte: 'movel', hoje: '2026-10-13' });
      return { DEMO: D, admin: D.admin({ store: st }), guardado: guardado };
    }

    it('na demonstração, o chefe cria uma conta com permissões escolhidas e ela entra com elas', function () {
      var d = demo();
      var lista = core.MODELOS_DE_PERMISSAO.anestesista.concat(['horas.ver']);
      return d.admin.salvarUsuario({ novo: true, login: 'dra.nova', nome: 'Doutora Nova', papel: 'anestesista', senha: 'senha-da-dra', permissoes: lista })
        .then(function () { return d.admin.usuarios(); })
        .then(function (us) {
          var u = us.filter(function (x) { return x.login === 'dra.nova'; })[0];
          igual(u.permissoes.join(), core.validarPermissoes(lista).lista.join());
          igual(core.rotuloDoAcesso(u), 'Anestesista (ajustado)');
          verdadeiro(d.guardado['anestesia.demo.contas'], 'guardado no navegador');
          falso(/senha-da-dra/.test(d.guardado['anestesia.demo.contas']), 'a senha não fica escrita');
        });
    });

    it('na demonstração valem as regras do servidor: dependência, chefe principal, senha das fixas', function () {
      var d = demo();
      return d.admin.salvarUsuario({ novo: true, login: 'xum', nome: 'X Um', papel: 'secretaria', senha: 'senha-xum-ok', permissoes: ['repasse.gerir'] })
        .then(function () { throw new Error('aceitou lista incoerente'); }, function (e) { verdadeiro(/precisa de/.test(e.message), e.message); })
        .then(function () { return d.admin.salvarUsuario({ login: 'anestesista', nome: 'Anestesista', papel: 'anestesista', senha: 'outra-senha-1' }); })
        .then(function () { throw new Error('mudou a senha de conta fixa'); }, function (e) { verdadeiro(/não muda/.test(e.message), e.message); })
        .then(function () { return d.admin.salvarUsuario({ login: 'chefe', nome: 'Chefe', papel: 'secretaria' }); })
        .then(function () { throw new Error('rebaixou o principal'); }, function (e) { verdadeiro(/principal/.test(e.message), e.message); });
    });
  });
};
