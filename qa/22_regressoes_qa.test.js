/**
 * QA 22 — Regressões da rodada de QA de 29/09/2026
 * Cada bloco leva o número do achado (ISSUE-NNN) do relatório
 * .gstack/qa-reports/qa-report-localhost-2026-09-29.md e prende o defeito no
 * lugar: o teste falha se o comportamento antigo voltar.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa' }); }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Maria Teste', procedimento: 'Rinoplastia', cirurgiao: 'Dr. X', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Não', sala: 'Sala 1', valor: 1000, pago: 'Não'
    }, extra || {});
  }

  function comBoletim() {
    var st = novoStore();
    st.adicionarCirurgia(cirurgia({ status: 'Realizada' }));
    var cid = st.estado.cirurgias[0].id;
    return { st: st, id: st.criarBoletim(cid).boletim.id };
  }

  /* ------------------------------------------------------------------ */

  describe('ISSUE-006 — dose do fármaco no boletim', function () {
    // Regression: ISSUE-006 — dose "-5" entrava no prontuário assinado
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    function adicionarFarmaco(x, dose) {
      return x.st.alterarLinhaBoletim(x.id, 'farmacos',
        { acao: 'adicionar', linha: { hora: '07:10', nome: 'Propofol', dose: dose, unidade: 'mg', via: 'IV' } });
    }

    it('dose negativa, zero, texto e absurda são recusadas e nada é gravado', function () {
      var x = comBoletim();
      ['-5', '0', 'abc', '5 mg', '100001', '-0,5'].forEach(function (d) {
        var r = adicionarFarmaco(x, d);
        falso(r.ok, 'dose "' + d + '" deveria ser recusada');
        verdadeiro(/dose/i.test(r.erros.map(function (e) { return e.msg; }).join(' ')), 'mensagem cita a dose: ' + d);
      });
      igual(x.st.boletim(x.id).farmacos.length, 0, 'nenhum fármaco entrou');
    });

    it('doses válidas (inteira, vírgula decimal, milhar) continuam entrando', function () {
      var x = comBoletim();
      ['150', '0,05', '2.5', '1.000'].forEach(function (d) {
        verdadeiro(adicionarFarmaco(x, d).ok, 'dose "' + d + '" deveria entrar');
      });
      igual(x.st.boletim(x.id).farmacos.length, 4);
    });

    it('a dose inválida também aparece na validação do boletim (Integridade)', function () {
      var b = core.normalizarBoletim({ farmacos: [{ hora: '07:00', nome: 'Propofol', dose: '-5', unidade: 'mg', via: 'IV' }] });
      var msgs = core.validarBoletim(b).erros.map(function (e) { return e.msg; }).join(' | ');
      verdadeiro(/maior que zero/.test(msgs), msgs);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-001 — conflito de horário avisado na hora de marcar', function () {
    // Regression: ISSUE-001 — duas cirurgias do mesmo anestesista se cruzando
    // eram gravadas sem aviso; o README promete o aviso "na hora".
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    function msgs(r) { return (r.avisos || []).map(function (a) { return a.msg; }).join(' | '); }

    it('adicionar cirurgia que cruza outra do mesmo anestesista grava e avisa qual é', function () {
      var st = novoStore();
      verdadeiro(st.adicionarCirurgia(cirurgia({ inicioPrev: '08:00', fimPrev: '10:30' })).ok);
      var r = st.adicionarCirurgia(cirurgia({ paciente: 'Outra', inicioPrev: '09:00', fimPrev: '11:00' }));
      verdadeiro(r.ok, 'não bloqueia');
      verdadeiro(/Fabrício Tavares já tem a cirurgia CIR0001 \(08:00–10:30\)/.test(msgs(r)), msgs(r));
      igual(st.estado.cirurgias.length, 2);
    });

    it('encostar, outro anestesista, outro dia e cancelada não geram aviso', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ inicioPrev: '07:00', fimPrev: '09:00' }));
      [
        cirurgia({ inicioPrev: '09:00', fimPrev: '11:00' }),
        cirurgia({ inicioPrev: '08:00', fimPrev: '10:00', anestesista: 'Roberta Almeida' }),
        cirurgia({ inicioPrev: '08:00', fimPrev: '10:00', data: '2026-10-16' }),
        cirurgia({ inicioPrev: '08:00', fimPrev: '10:00', status: 'Cancelada' })
      ].forEach(function (c, i) {
        var r = st.adicionarCirurgia(c);
        verdadeiro(r.ok, 'caso ' + i);
        falso(/sobrep/.test(msgs(r)), 'caso ' + i + ': ' + msgs(r));
      });
    });

    it('editar a cirurgia para cruzar outra avisa; editar sem cruzar não', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ inicioPrev: '07:00', fimPrev: '09:00' }));
      st.adicionarCirurgia(cirurgia({ paciente: 'B', inicioPrev: '10:00', fimPrev: '12:00' }));
      var r = st.atualizarCirurgia('CIR0002', { inicioPrev: '08:00', fimPrev: '11:00' });
      verdadeiro(r.ok);
      verdadeiro(/CIR0001/.test(msgs(r)), msgs(r));
      var r2 = st.atualizarCirurgia('CIR0002', { inicioPrev: '13:00', fimPrev: '15:00' });
      falso(/sobrep/.test(msgs(r2)), msgs(r2));
    });

    it('conflitosDaCirurgia não conta a própria e ignora horário incompleto', function () {
      var a = { id: 'CIR0001', data: '2026-10-15', status: 'Agendada', anestesista: 'X', inicioPrev: '08:00', fimPrev: '10:00' };
      igual(core.conflitosDaCirurgia(a, [a]).length, 0, 'a própria');
      igual(core.conflitosDaCirurgia({ id: '(novo)', data: '2026-10-15', status: 'Agendada', anestesista: 'x', inicioPrev: '09:00', fimPrev: '' }, [a]).length, 0, 'sem término');
      igual(core.conflitosDaCirurgia({ id: '(novo)', data: '2026-10-15', status: 'Agendada', anestesista: 'x', inicioPrev: '09:00', fimPrev: '11:00' }, [a]).length, 1, 'nome sem maiúscula ainda cruza');
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-007 — valor absurdo no repasse', function () {
    // Regression: ISSUE-007 — R$ 999.999.999.999,00 foi registrado como repasse
    // de uma cota de R$ 123,34 e a coluna "falta" ficou negativa.
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    it('repasse acima do teto de sanidade é recusado e nada é gravado', function () {
      var st = novoStore();
      var r = st.registrarPagamentoRepasse(2026, 10, 'A01', '999999999999', '2026-10-05');
      falso(r.ok);
      verdadeiro(/acima de/.test(r.erros[0].msg), r.erros[0].msg);
      igual(core.registroDeRepasse(st.estado.repasses, '2026-10').pagamentos.length, 0);
    });

    it('valores normais continuam sendo registrados, inclusive acima da cota (adiantamento)', function () {
      var st = novoStore();
      verdadeiro(st.registrarPagamentoRepasse(2026, 10, 'A01', '123,34', '2026-10-05').ok);
      verdadeiro(st.registrarPagamentoRepasse(2026, 10, 'A01', 5000, '2026-10-06').ok);
      igual(core.registroDeRepasse(st.estado.repasses, '2026-10').pagamentos.length, 2);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('Servidor da clínica — achados da QA de 29/09/2026', function () {
    // Regression: SRV-1 (corpo "null" dava 500), SRV-2 (trocar a senha não derrubava
    // as outras sessões) e SRV-3 (troca de senha sem trava de tentativas).
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md
    var criarServidor = require('../server/servidor.js').criarServidor;
    var SENHA = 'senha-forte-qa-1', NOVA = 'senha-nova-qa-22';

    /** Uma chamada HTTP sem reaproveitar conexão (evita soquete velho de outro teste). */
    function chamar(porta, metodo, url, corpo, cookie) {
      return new Promise(function (resolver, rejeitar) {
        var dadosCorpo = corpo === undefined ? null : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
        var req = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: url, agent: false, headers: Object.assign(
          { 'X-Anestesia': '1', 'Content-Type': 'application/json', Connection: 'close' },
          dadosCorpo === null ? {} : { 'Content-Length': Buffer.byteLength(dadosCorpo) },
          cookie ? { Cookie: cookie } : {}) }, function (res) {
          var partes = [];
          res.on('data', function (c) { partes.push(c); });
          res.on('end', function () {
            var texto = Buffer.concat(partes).toString('utf8'), json = null;
            try { json = JSON.parse(texto); } catch (e) { /* não é JSON */ }
            var set = res.headers['set-cookie'];
            resolver({ status: res.statusCode, corpo: json, cookie: set ? String(set[0]).split(';')[0] : null });
          });
        });
        req.on('error', rejeitar);
        if (dadosCorpo !== null) req.write(dadosCorpo);
        req.end();
      });
    }

    /** Sobe um servidor de mentira com o administrador criado e devolve o que os testes precisam. */
    function comAdmin(fn) {
      var pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'anest-qa22-'));
      var srv = criarServidor({ dados: pasta, porta: 0, host: '127.0.0.1', silencioso: true });
      var porta, admin;
      return srv.iniciar().then(function (info) {
        porta = info.porta;
        return chamar(porta, 'POST', '/api/primeiro-acesso',
          { codigo: srv.contas.codigoPrimeiroAcesso(), login: 'admin', nome: 'Admin QA', senha: SENHA });
      }).then(function (r) {
        admin = r;
        return fn(porta, r.cookie, srv);
      }).then(function () { return srv.fechar(); }, function (e) {
        return srv.fechar().then(function () { throw e; });
      }).then(function () { fs.rmSync(pasta, { recursive: true, force: true }); });
    }

    it('corpo JSON "null" (ou lista, número) é pedido ilegível (400), não erro interno (500)', function () {
      return comAdmin(function (porta, cookie) {
        var rotas = ['/api/entrar', '/api/primeiro-acesso', '/api/comando', '/api/usuarios', '/api/minha-senha', '/api/apagar-tudo'];
        var fila = Promise.resolve();
        rotas.forEach(function (rota) {
          ['null', '[]', '123', '"x"'].forEach(function (c) {
            fila = fila.then(function () { return chamar(porta, 'POST', rota, c, cookie); }).then(function (r) {
              igual(r.status, 400, rota + ' com corpo ' + c + ' -> ' + r.status);
            });
          });
        });
        return fila;
      });
    });

    it('trocar a própria senha derruba as OUTRAS sessões e mantém a atual', function () {
      return comAdmin(function (porta, cookieA) {
        var cookieB;
        return chamar(porta, 'POST', '/api/entrar', { login: 'admin', senha: SENHA }).then(function (r) {
          cookieB = r.cookie;
          return chamar(porta, 'GET', '/api/eu', undefined, cookieB);
        }).then(function (r) {
          igual(r.status, 200, 'a outra sessão vale antes da troca');
          return chamar(porta, 'POST', '/api/minha-senha', { atual: SENHA, nova: NOVA }, cookieA);
        }).then(function (r) {
          igual(r.status, 200);
          return chamar(porta, 'GET', '/api/eu', undefined, cookieB);
        }).then(function (r) {
          igual(r.status, 401, 'a outra sessão caiu');
          return chamar(porta, 'GET', '/api/eu', undefined, cookieA);
        }).then(function (r) {
          igual(r.status, 200, 'a sessão que trocou a senha continua');
          return chamar(porta, 'POST', '/api/entrar', { login: 'admin', senha: NOVA });
        }).then(function (r) { igual(r.status, 200, 'a senha nova entra'); });
      });
    });

    it('errar a senha atual cinco vezes trava a troca de senha (429), até com a senha certa', function () {
      return comAdmin(function (porta, cookie) {
        var status = [], fila = Promise.resolve();
        for (var i = 0; i < 5; i++) {
          fila = fila.then(function () { return chamar(porta, 'POST', '/api/minha-senha', { atual: 'errada-errada', nova: NOVA }, cookie); })
            .then(function (r) { status.push(r.status); });
        }
        return fila.then(function () {
          igual(status.join(','), '400,400,400,400,400');
          return chamar(porta, 'POST', '/api/minha-senha', { atual: SENHA, nova: NOVA }, cookie);
        }).then(function (r) {
          igual(r.status, 429, 'travado, nem a senha certa troca');
          return chamar(porta, 'GET', '/api/eu', undefined, cookie);
        }).then(function (r) { igual(r.status, 200, 'a sessão em si segue válida'); });
      });
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-008 — controles de filtro com nome acessível', function () {
    // Regression: ISSUE-008 — campos de busca e filtros só tinham placeholder: o
    // leitor de tela os anunciava sem nome (WCAG 4.1.2 / 3.3.2).
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md
    var TELAS = path.join(__dirname, '..', 'webapp', 'js', 'telas');

    it('todo campo de busca (type: \'search\') das telas declara aria-label', function () {
      var faltando = [];
      fs.readdirSync(TELAS).filter(function (f) { return /\.js$/.test(f); }).forEach(function (arq) {
        var linhas = fs.readFileSync(path.join(TELAS, arq), 'utf8').split(/\r?\n/);
        linhas.forEach(function (l, i) {
          if (!/type:\s*'search'/.test(l)) return;
          var janela = linhas.slice(Math.max(0, i - 3), i + 6).join('\n');
          if (!/aria-label/.test(janela)) faltando.push(arq + ':' + (i + 1));
        });
      });
      igual(faltando.join(', '), '', 'campo de busca sem aria-label');
    });

    it('seletor dentro de <label> ou com opção inicial que muda declara `rotulo` (aria-label não pode vir da 1ª opção)', function () {
      ['painel_qualidade.js', 'qualidade.js'].forEach(function (arq) {
        var linhas = fs.readFileSync(path.join(TELAS, arq), 'utf8').split(/\r?\n/);
        linhas.forEach(function (l, i) {
          if (!/COMP\.seletor\(\{/.test(l)) return;
          verdadeiro(/rotulo:/.test(linhas.slice(i, i + 4).join('\n')), arq + ':' + (i + 1) + ' COMP.seletor sem rotulo');
        });
      });
    });

    it('o seletor de filtro dá nome acessível a partir da primeira opção quando ninguém informa', function () {
      var fonte = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'js', '01b_componentes.js'), 'utf8');
      verdadeiro(/function seletor\(cfg\)[\s\S]{0,700}'aria-label'/.test(fonte), 'seletor sem aria-label');
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-004 — partida do web app quando um arquivo do core não carrega', function () {
    // Regression: ISSUE-004 — com 09c_qualidade_painel.js fora do ar a tela ficava
    // vazia e o único sinal era "configQualidadePadrao is not defined" no console:
    // a verificação de carga só conferia 20 símbolos, de parte dos arquivos.
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md
    var JS = path.join(__dirname, '..', 'webapp', 'js');

    it('a verificação de carga cita ao menos um símbolo de CADA arquivo do core', function () {
      var fonte = fs.readFileSync(path.join(JS, '00_bootstrap.js'), 'utf8');
      var bloco = (fonte.match(/var obrigatorios = \[([\s\S]*?)\];/) || [])[1];
      verdadeiro(!!bloco, 'lista obrigatorios não encontrada');
      var lista = (bloco.match(/'([A-Za-z0-9_]+)'/g) || []).map(function (s) { return s.slice(1, -1); });
      var semCobertura = core.ARQUIVOS_CORE.filter(function (arq) {
        var exportado = require(path.join(__dirname, '..', 'core', arq));
        return !Object.keys(exportado).some(function (k) { return lista.indexOf(k) >= 0; });
      });
      igual(semCobertura.join(', '), '', 'arquivo do core sem símbolo na verificação de carga');
    });

    it('erro na partida vira mensagem na tela (não promessa rejeitada calada)', function () {
      var fonte = fs.readFileSync(path.join(JS, '06_app.js'), 'utf8');
      verdadeiro(/\.catch\(falhaNaPartida\)/.test(fonte), 'iniciar() precisa terminar em .catch(falhaNaPartida)');
      verdadeiro(/function falhaNaPartida\(e\)[\s\S]{0,900}Não foi possível abrir o sistema/.test(fonte));
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-003/010 — telefone, PIX, CRM e CNPJ com formato conferido (aviso, não bloqueio)', function () {
    // Regression: ISSUE-003 — "abc" de telefone, "<script>x</script>" de chave PIX e "xx" de CRM
    // eram gravados sem uma palavra; ISSUE-010 — CNPJ 11.111.111/1111-11 passava (só se contava dígitos).
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    function msgs(r) { return (r.avisos || []).map(function (a) { return a.msg; }).join(' | '); }

    it('validadores: casos certos e errados', function () {
      [['11.222.333/0001-81', true], ['11222333000181', true], ['11.111.111/1111-11', false], ['00.000.000/0000-00', false],
        ['12.345.678/0001-90', false], ['123', false]].forEach(function (c) {
        igual(core.cnpjValido(c[0]), c[1], 'CNPJ ' + c[0]);
      });
      [['529.982.247-25', true], ['111.111.111-11', false], ['123.456.789-00', false]].forEach(function (c) {
        igual(core.cpfValido(c[0]), c[1], 'CPF ' + c[0]);
      });
      [['(61) 99999-0000', true], ['61999990000', true], ['+55 61 3333-4444', true], ['abc', false], ['123', false]].forEach(function (c) {
        igual(core.telefoneValido(c[0]), c[1], 'telefone ' + c[0]);
      });
      ['fabricio@exemplo.com', '529.982.247-25', '+5561999990000', '61999990000', '123e4567-e89b-12d3-a456-426614174000'].forEach(function (p) {
        verdadeiro(core.chavePixValida(p), 'PIX ' + p);
      });
      ['<script>x</script>', 'abc', '12345', ''].forEach(function (p) { falso(core.chavePixValida(p), 'PIX ' + p); });
      ['12345-DF', 'CRM/DF 12345', '1234-SP'].forEach(function (c) { verdadeiro(core.crmValido(c), 'CRM ' + c); });
      ['xx', '12', '12345678'].forEach(function (c) { falso(core.crmValido(c), 'CRM ' + c); });
    });

    it('cadastro de anestesista com contato fora do padrão grava e avisa cada campo', function () {
      var st = novoStore();
      var r = st.salvarAnestesista({ id: 'A01', telefone: 'abc', pix: '<script>x</script>', crm: 'xx', email: 'nao-e-email' });
      verdadeiro(r.ok, 'não bloqueia');
      var m = msgs(r);
      verdadeiro(/TELEFONE/.test(m) && /CHAVE PIX/.test(m) && /CRM/.test(m) && /E-MAIL/.test(m), m);
    });

    it('cadastro com dados certos não gera aviso', function () {
      var st = novoStore();
      var r = st.salvarAnestesista({ id: 'A01', telefone: '(61) 99999-0000', pix: 'roberta@exemplo.com', crm: '12345-DF', email: 'r@x.com' });
      verdadeiro(r.ok);
      igual(msgs(r), '');
    });

    it('telefone do paciente fora do padrão avisa na cirurgia', function () {
      var st = novoStore();
      var r = st.adicionarCirurgia(cirurgia({ telefone: 'abc' }));
      verdadeiro(r.ok);
      verdadeiro(/TELEFONE do paciente/.test(msgs(r)), msgs(r));
      igual(msgs(st.adicionarCirurgia(cirurgia({ paciente: 'B', telefone: '(61) 99999-0000', inicioPrev: '13:00', fimPrev: '14:00' }))), '');
    });

    it('CNPJ da clínica com dígito verificador errado grava e avisa; o certo passa limpo; 14 dígitos segue obrigatório', function () {
      var st = novoStore();
      var r = st.salvarConfigClinica({ nome: 'Clínica X', cnpj: '11.111.111/1111-11' });
      verdadeiro(r.ok);
      verdadeiro(/dígito verificador inválido/.test(msgs(r)), msgs(r));
      var r2 = st.salvarConfigClinica({ cnpj: '11.222.333/0001-81', telefone: '(61) 3333-4444', crm: '1234-SP' });
      verdadeiro(r2.ok);
      igual(msgs(r2), '');
      falso(st.salvarConfigClinica({ cnpj: '11.222.333/0001' }).ok);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-012 — chip de pendências no topo da ficha de qualidade', function () {
    // Regression: ISSUE-012 — o topo da ficha só mostrava "em preenchimento": o chip "N item(ns) sem
    // resposta" nunca aparecia, porque trocar(aba) zerava a lista de atualizadores onde o topo estava.
    // Found by /qa on 2026-09-30 (ao ligar a ficha ao boletim)
    var fonte = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'js', 'telas', 'qualidade.js'), 'utf8');

    it('o atualizador do topo é registrado como FIXO e refazer() roda os fixos junto com os da etapa', function () {
      verdadeiro(/function aoMudarFixo\(fn\)/.test(fonte), 'falta aoMudarFixo');
      verdadeiro(/atualizadoresFixos\.concat\(atualizadores\)\.forEach/.test(fonte), 'refazer() não roda os fixos');
      verdadeiro(/aoMudarFixo\(function \(f\) \{\s*var n = totalPendenciasFicha/.test(fonte),
        'o chip de pendências do topo precisa usar aoMudarFixo');
    });

    it('trocar(aba) continua zerando só os atualizadores da etapa, não os do topo', function () {
      var trocar = (fonte.match(/function trocar\(chave\) \{[\s\S]*?\n    \}/) || [''])[0];
      verdadeiro(/atualizadores = \[\];/.test(trocar), 'trocar deveria zerar os da etapa');
      falso(/atualizadoresFixos = \[\]/.test(trocar), 'trocar não pode zerar os fixos');
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-009 — configuração clínica da qualidade', function () {
    // Regression: ISSUE-009 — SpO₂ mínima 150 e TOF 2 eram aceitos; "abc" e -5
    // voltavam ao padrão com o aviso "Configuração clínica salva".
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    function msgs(r) { return (r.erros || []).map(function (e) { return e.msg; }).join(' | '); }

    it('limiar impossível ou que não é número é recusado, com o motivo, e nada muda', function () {
      var st = novoStore();
      var antes = core.jsonCanonico(st.configQualidade());
      [
        [{ spo2: '150' }, /SpO₂ mínima aceitável 150 fora da faixa/],
        [{ spo2: '-5' }, /fora da faixa/],
        [{ spo2: 'abc' }, /"abc" não é um número/],
        [{ tof: '2' }, /Relação TOF adequada 2 fora da faixa aceita \(0,5 a 1,5\)/],
        [{ tof: '90' }, /fora da faixa/],
        [{ jejumSolidos: '-3' }, /Jejum mínimo para sólidos/],
        [{ dor: '11' }, /Pontuação de dor/],
        [{ temperatura: '10' }, /Temperatura mínima/]
      ].forEach(function (c) {
        var r = st.salvarConfigQualidade({ limiares: c[0] });
        falso(r.ok, JSON.stringify(c[0]));
        verdadeiro(c[1].test(msgs(r)), JSON.stringify(c[0]) + ' -> ' + msgs(r));
      });
      igual(core.jsonCanonico(st.configQualidade()), antes, 'a configuração guardada não mudou');
    });

    it('limiares plausíveis e campo em branco (volta ao padrão) continuam valendo', function () {
      var st = novoStore();
      var r = st.salvarConfigQualidade({ limiares: { spo2: '92', pam: '', tof: '0,9', jejumSolidos: 6 } });
      verdadeiro(r.ok, msgs(r));
      igual(st.configQualidade().limiares.spo2, 92);
      igual(st.configQualidade().limiares.pam, 65, 'em branco = padrão');
      igual(st.configQualidade().limiares.tof, 0.9);
      igual(st.configQualidade().limiares.jejumSolidos, 6);
    });

    it('meta fora de 0 a 100, texto e datas que não existem também são recusados', function () {
      var st = novoStore();
      var chave = core.INDICADORES_QUALIDADE[0].chave;
      falso(st.salvarConfigQualidade({ metas: (function () { var m = {}; m[chave] = '150'; return m; })() }).ok);
      falso(st.salvarConfigQualidade({ metas: (function () { var m = {}; m[chave] = 'x'; return m; })() }).ok);
      var r = st.salvarConfigQualidade({ aprovacao: { responsavel: 'Dr. R', em: '2026-13-45' } });
      falso(r.ok);
      verdadeiro(/Data da aprovação inválida/.test(msgs(r)), msgs(r));
      var ok = st.salvarConfigQualidade({ aprovacao: { responsavel: 'Dr. R', em: '2026-09-01' } });
      verdadeiro(ok.ok, msgs(ok));
    });

    it('a leitura de backup segue tolerante: valor ruim vira o padrão, sem erro', function () {
      var cfg = core.lerConfigQualidade({ limiares: { spo2: 'abc', pam: '-5', tof: '0,8' } });
      igual(cfg.limiares.spo2, 90);
      igual(cfg.limiares.pam, 65);
      igual(cfg.limiares.tof, 0.8);
    });
  });
};
