/**
 * ============================================================================
 * 03G_SERVIDOR — O web app em rede (modo servidor)
 * ============================================================================
 * Só age quando a página vem do servidor da clínica (MODO_SERVIDOR = true,
 * ver 00_modo.js e server/servidor.js). Então:
 *   - sem sessão, a tela de entrada (e o primeiro acesso) vem antes de tudo;
 *   - o estado vem do servidor — nunca do armazenamento deste navegador;
 *   - cada operação do store roda aqui na hora (a tela responde já) e vai ao
 *     servidor como COMANDO: nome, argumentos, hora e semente. O servidor
 *     reexecuta com o mesmo core e chega ao mesmo estado;
 *   - a fila manda um comando por vez; o que outras pessoas gravam chega por
 *     SSE e é reexecutado aqui, na ordem do servidor;
 *   - se o servidor recusar (alguém criou ou removeu algo no mesmo
 *     instante), a tela recarrega os dados e diz o que precisa ser refeito.
 *     Nada é gravado por cima do trabalho de outra pessoa em silêncio.
 * ============================================================================
 */
'use strict';

var SERVIDOR = (function () {

  var el = UI.el, icone = UI.icone;

  var ativo = false;
  var usuario = null;          // { login, nome, papel }
  var hoje = null;
  var desvio = 0;              // ms: relógio do servidor menos o daqui
  var confirmada = 0;          // última revisão confirmada pelo servidor
  var conhecida = 0;           // maior revisão que o servidor já anunciou
  var cliente = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var fila = [];               // comandos aplicados aqui, ainda sem confirmação
  var enviando = false;
  var falhasSeguidas = 0;
  var originais = {};          // métodos do store sem o envoltório (para reexecutar)
  var app = null;
  var fonte = null;            // EventSource
  var buscando = null;         // Promise da sincronização em andamento
  var semConexao = false;
  var noStatus = null;

  var DESCRICAO = {
    adicionarCirurgia: 'lançar cirurgia', atualizarCirurgia: 'alterar cirurgia', removerCirurgia: 'excluir cirurgia',
    atualizarAvaliacao: 'alterar avaliação pré', salvarAnestesista: 'salvar anestesista', ajustarEscala: 'substituição na escala',
    definirEscalaBase: 'escala-base', definirModoEscalaBase: 'modo da escala-base', aplicarRemanejamento: 'remanejamento',
    salvarConfigClinica: 'dados da clínica', salvarDespesasRepasse: 'despesas do repasse',
    registrarPagamentoRepasse: 'registro de repasse', removerPagamentoRepasse: 'desfazer repasse',
    criarBoletim: 'criar boletim', salvarBoletim: 'campo do boletim', alterarLinhaBoletim: 'registro do boletim',
    finalizarBoletim: 'assinatura do boletim', reabrirBoletim: 'reabertura do boletim', descartarBoletim: 'descartar boletim',
    reparar: 'reparo dos dados'
  };

  /* =============================================================== rede */

  function pedir(metodo, caminho, corpo, extras) {
    var h = Object.assign({ 'X-Anestesia': '1', 'X-Cliente': cliente }, extras || {});
    var body;
    if (corpo instanceof Blob) body = corpo;
    else if (corpo !== undefined) { body = JSON.stringify(corpo); h['Content-Type'] = 'application/json'; }
    return fetch(caminho, { method: metodo, headers: h, body: body, credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        var tipo = r.headers.get('content-type') || '';
        var leitura = /json/.test(tipo) ? r.json().catch(function () { return {}; }) : r.blob();
        return leitura.then(function (c) { return { status: r.status, ok: r.ok, corpo: c }; });
      });
  }

  function semente() { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20); }
  function agoraDoServidor() { return agoraTexto(new Date(Date.now() + desvio)); }

  /* ============================================================ partida */

  /**
   * Na partida:
   *   { modo: 'local' }                            não é o servidor da clínica
   *   { modo: 'entrada', primeiroAcesso }          precisa entrar
   *   { modo: 'servidor', estado, usuario, hoje }  pronto
   *   { modo: 'fora' }                             servidor fora do ar
   * Servidor fora do ar NUNCA cai para os dados deste navegador: seria mostrar
   * dado velho como se fosse o da clínica.
   */
  function detectar() {
    if (typeof MODO_SERVIDOR === 'undefined' || !MODO_SERVIDOR) return Promise.resolve({ modo: 'local' });
    return pedir('GET', '/api/eu').then(function (r) {
      if (r.status === 401) return { modo: 'entrada', primeiroAcesso: !!(r.corpo && r.corpo.primeiroAcesso) };
      if (!r.ok) return { modo: 'fora' };
      return carregar();
    }, function () { return { modo: 'fora' }; });
  }

  function carregar() {
    var t0 = Date.now();
    return pedir('GET', '/api/estado').then(function (r) {
      if (r.status === 401) return { modo: 'entrada' };
      if (!r.ok) return { modo: 'fora' };
      var c = r.corpo;
      desvio = c.agora - Math.round((t0 + Date.now()) / 2);
      usuario = c.usuario;
      hoje = c.hoje;
      confirmada = conhecida = c.revisao;
      ativo = true;
      return { modo: 'servidor', estado: DADOS.sanearEstado(c.estado), usuario: usuario, hoje: hoje };
    }, function () { return { modo: 'fora' }; });
  }

  /** Liga o app: SSE, aviso ao fechar com alteração pendente. */
  function conectar(aplicacao) {
    app = aplicacao;
    ouvir();
    window.addEventListener('beforeunload', function (ev) {
      if (!fila.length) return;
      ev.preventDefault();
      ev.returnValue = '';
    });
  }

  /* ======================================================== comandos */

  /**
   * Envolve as operações que mudam dados: roda aqui (com hora e semente
   * guardadas) e enfileira o comando. Chamar a cada store novo.
   */
  function envolver(store) {
    originais = {};
    store.usuario = usuario.nome;
    MUTACOES_STORE.forEach(function (nome) {
      var original = store[nome];
      originais[nome] = original;
      store[nome] = function () {
        var args = Array.prototype.slice.call(arguments);
        // Janela aberta antes de a tela recarregar os dados do servidor: o
        // store dela ficou velho, e gravar nele divergiria do servidor.
        if (avisouSessao) {
          return { ok: false, erros: [{ campo: '', msg: 'Sua sessão terminou. Entre de novo para continuar.' }], avisos: [] };
        }
        if (app && app.store !== store) {
          return { ok: false, erros: [{ campo: '', msg: 'Os dados foram atualizados enquanto esta janela estava aberta. Feche-a e abra de novo.' }], avisos: [] };
        }
        if (MUTACOES_SO_ADMIN.indexOf(nome) >= 0 && usuario.papel !== 'admin') {
          return { ok: false, erros: [{ campo: '', msg: 'Só o administrador do sistema pode fazer isso.' }], avisos: [] };
        }
        var copia = JSON.parse(JSON.stringify(args));
        var ctx = { agora: agoraDoServidor(), semente: semente() };
        store.usuario = usuario.nome;
        var r = executarComContexto(ctx, function () { return original.apply(store, args); });
        if (nome === 'reparar' || (r && r.ok)) {
          fila.push({ nome: nome, args: copia, contexto: ctx, hoje: hoje });
          atualizarStatus();
          enviar();
        }
        return r;
      };
    });
  }

  function enviar() {
    if (enviando || !fila.length) return;
    enviando = true;
    var c = fila[0];
    pedir('POST', '/api/comando', { nome: c.nome, args: c.args, contexto: c.contexto, base: confirmada, hoje: c.hoje, cliente: cliente })
      .then(function (r) {
        enviando = false;
        falhasSeguidas = 0;
        semConexao = false;
        if (r.status === 200 && r.corpo.ok) {
          fila.shift();
          confirmada = r.corpo.revisao;
          conhecida = Math.max(conhecida, confirmada);
          // Aceito, mas outra pessoa gravou antes: a ordem no servidor é
          // outra, então esta tela recarrega para ficar igual a ele.
          if (r.corpo.concorrente) { recarregar(); return; }
          atualizarStatus();
          if (fila.length) enviar(); else sincronizar();
          return;
        }
        if (r.status === 401) { sessaoEncerrada(); return; }
        recarregar({ descartados: fila.splice(0), resposta: r });
      }, function () {
        enviando = false;
        falhasSeguidas++;
        semConexao = true;
        atualizarStatus();
        setTimeout(enviar, Math.min(30000, 1000 * Math.pow(2, Math.min(falhasSeguidas, 5))));
      });
  }

  /** Espera a fila esvaziar (ou desistir): usado por app.salvar(). */
  function aguardarFila() {
    return new Promise(function (resolver) {
      (function ver() { if (!fila.length) resolver({ ok: true }); else setTimeout(ver, 150); })();
    });
  }

  /**
   * Busca o estado inteiro do servidor e troca o desta tela. `info` traz os
   * comandos que ficaram de fora e a resposta do servidor, para avisar.
   */
  function recarregar(info) {
    info = info || {};
    var descartados = info.descartados || fila.splice(0);
    return pedir('GET', '/api/estado').then(function (r) {
      if (r.status === 401) { sessaoEncerrada(); return; }
      if (!r.ok) throw new Error('servidor');
      var c = r.corpo;
      usuario = c.usuario;
      hoje = c.hoje;
      confirmada = conhecida = c.revisao;
      semConexao = false;
      app.trocarEstado(DADOS.sanearEstado(c.estado), 'servidor');
      // Redesenha já (e não "quando livre"): a tela aberta segura o store
      // antigo, e continuar digitando nela gravaria no store errado.
      app.redesenhar();
      atualizarStatus();
      if (descartados.length) avisarDescartados(descartados, info.resposta);
      if (info.aviso) UI.info(info.aviso[0], info.aviso[1]);
    }).catch(function () {
      semConexao = true;
      atualizarStatus();
      setTimeout(function () { recarregar({ descartados: descartados, resposta: info.resposta, aviso: info.aviso }); }, 3000);
    });
  }

  function avisarDescartados(lista, resposta) {
    var nomes = lista.map(function (c) { return DESCRICAO[c.nome] || c.nome; })
      .filter(function (n, i, a) { return a.indexOf(n) === i; }).join(', ');
    var corpo = resposta && resposta.corpo || {};
    if (resposta && resposta.status === 200 && corpo.erros) {
      UI.erro('O servidor recusou: ' + nomes, corpo.erros.map(function (e) { return e.msg; }).join(' ') +
        ' A tela foi atualizada com os dados atuais.', 0);
    } else if (corpo.motivo === 'dia') {
      UI.atencao('Virou o dia no servidor', 'Os dados foram atualizados. Refaça: ' + nomes + '.', 0);
    } else if (corpo.motivo === 'relogio') {
      UI.atencao('Relógio deste computador fora da hora', 'Acerte a data e a hora do computador e refaça: ' + nomes + '.', 0);
    } else if (resposta && resposta.status === 403) {
      UI.erro('Sem permissão', (corpo.erro || 'Só o administrador pode fazer isso.') + ' Não foi salvo: ' + nomes + '.', 0);
    } else {
      UI.atencao('Outra pessoa gravou no mesmo instante',
        'Para não gravar por cima do trabalho dela, isto não foi salvo: ' + nomes +
        '. A tela já mostra os dados atuais — confira e refaça.', 0);
    }
  }

  /** Reexecuta aqui o que outras pessoas gravaram (na ordem do servidor). */
  function sincronizar() {
    if (buscando) return buscando;
    if (enviando || fila.length || conhecida <= confirmada || !app) return Promise.resolve();
    buscando = pedir('GET', '/api/comandos?desde=' + confirmada).then(function (r) {
      buscando = null;
      if (r.status === 401) { sessaoEncerrada(); return; }
      if (!r.ok || r.corpo.recarregar) { recarregar(); return; }
      if (r.corpo.hoje !== hoje) { recarregar({ aviso: ['Virou o dia', 'Os dados foram atualizados para a data de hoje.'] }); return; }
      if (fila.length) return;   // a pessoa mexeu enquanto buscava: a resposta do comando dela decide
      var quem = {};
      var st = app.store;
      for (var i = 0; i < r.corpo.comandos.length; i++) {
        var c = r.corpo.comandos[i];
        if (c.revisao !== confirmada + 1 || !originais[c.nome]) { recarregar(); return; }
        st.usuario = c.usuario;
        var res = null;
        try {
          res = executarComContexto(c.contexto, function () { return originais[c.nome].apply(st, c.args); });
        } catch (e) { res = null; }
        st.usuario = usuario.nome;
        if (!(c.nome === 'reparar' || (res && res.ok))) { recarregar(); return; }
        confirmada = c.revisao;
        quem[c.usuario] = true;
      }
      conhecida = Math.max(conhecida, confirmada);
      if (Object.keys(quem).length) {
        app.revisao++;
        app.redesenharQuandoLivre();
        atualizarStatus('Atualizado por ' + Object.keys(quem).join(', '));
      }
      if (conhecida > confirmada) sincronizar();
    }, function () { buscando = null; });
    return buscando;
  }

  /* ================================================================ SSE */

  function ouvir() {
    if (fonte) fonte.close();
    fonte = new EventSource('/api/eventos');
    fonte.addEventListener('ola', function (ev) {
      var d = JSON.parse(ev.data);
      semConexao = false;
      conhecida = Math.max(conhecida, d.revisao);
      if (d.hoje !== hoje) recarregar({ aviso: ['Virou o dia', 'Os dados foram atualizados para a data de hoje.'] });
      else { enviar(); sincronizar(); }
      atualizarStatus();
    });
    fonte.addEventListener('comando', function (ev) {
      var d = JSON.parse(ev.data);
      conhecida = Math.max(conhecida, d.revisao);
      if (d.cliente !== cliente) sincronizar();
    });
    fonte.addEventListener('recarregar', function (ev) {
      var d = JSON.parse(ev.data);
      var motivos = { importar: 'importou um backup', 'apagar-tudo': 'apagou os dados', restaurar: 'restaurou uma cópia' };
      recarregar({ aviso: d.motivo === 'dia'
        ? ['Virou o dia', 'Os dados foram atualizados para a data de hoje.']
        : ['Dados substituídos', (d.usuario || 'O administrador') + ' ' + (motivos[d.motivo] || 'substituiu os dados') + '.'] });
    });
    fonte.addEventListener('anexos', function (ev) {
      var d = JSON.parse(ev.data);
      if (d.cliente === cliente) return;
      ANEXOS.iniciar().then(function () { if (app) app.redesenharQuandoLivre(); });
    });
    fonte.onerror = function () {
      semConexao = true;
      atualizarStatus();
      // Sessão encerrada também derruba o SSE: confere.
      pedir('GET', '/api/eu').then(function (r) { if (r.status === 401) sessaoEncerrada(); }, function () { /* fora do ar */ });
    };
  }

  var avisouSessao = false;
  function sessaoEncerrada() {
    if (avisouSessao) return;
    avisouSessao = true;
    if (fonte) fonte.close();
    atualizarStatus();
    var n = fila.length;
    UI.abrirModal({
      titulo: 'Sua sessão terminou',
      tamanho: 'estreito',
      corpo: [el('p', { class: 'sem-margem t-medio' }, 'Entre de novo para continuar.' +
        (n ? ' ' + n + ' alteração(ões) desta tela não chegaram ao servidor e precisarão ser refeitas.' : ''))],
      acoes: [el('div', { class: 'espaco' }), el('button', { class: 'btn btn-primario', onclick: function () { location.reload(); } }, 'Entrar de novo')]
    });
  }

  /* ============================================================= status */

  /** Ponto de status no rodapé da barra lateral: conectado, salvando, sem conexão. */
  function noDeStatus() {
    if (!noStatus) noStatus = el('div', { class: 'status-servidor', role: 'status', 'aria-live': 'polite' });
    atualizarStatus();
    return noStatus;
  }

  var ultimoRecado = null, timerRecado = null;
  function atualizarStatus(recado) {
    if (!noStatus) return;
    if (recado) {
      ultimoRecado = recado;
      clearTimeout(timerRecado);
      timerRecado = setTimeout(function () { ultimoRecado = null; atualizarStatus(); }, 6000);
    }
    var classe = 'ok', texto = 'Conectado ao servidor';
    if (avisouSessao) { classe = 'erro'; texto = 'Sessão encerrada — entre de novo'; }
    else if (semConexao) { classe = 'erro'; texto = 'Sem conexão' + (fila.length ? ' — ' + fila.length + ' alteração(ões) aguardando' : ''); }
    else if (fila.length) { classe = 'salvando'; texto = 'Salvando…'; }
    else if (ultimoRecado) texto = ultimoRecado;
    noStatus.className = 'status-servidor ' + classe;
    noStatus.textContent = texto;
  }

  /* ============================================================ entrada */

  /** Tela de entrada (sem a casca do sistema). */
  function telaDeEntrada(info) {
    info = info || {};
    document.title = 'Entrar — ' + CONFIG.NOME_SISTEMA;
    var primeiro = !!info.primeiroAcesso;
    var campos = primeiro ? [
      UI.campo({ rotulo: 'Código de primeiro acesso', nome: 'codigo', obrigatorio: true,
        dica: 'Aparece na janela do servidor (e no arquivo PRIMEIRO_ACESSO.txt da pasta de dados).' }),
      UI.campo({ rotulo: 'Seu nome', nome: 'nome', obrigatorio: true }),
      UI.campo({ rotulo: 'Login', nome: 'login', obrigatorio: true, exemplo: 'ex.: fabricio', dica: 'Letras minúsculas, números, ponto ou hífen.' }),
      UI.campo({ rotulo: 'Senha', nome: 'senha', tipo: 'password', obrigatorio: true, dica: 'Pelo menos 8 caracteres.' }),
      UI.campo({ rotulo: 'Repita a senha', nome: 'senha2', tipo: 'password', obrigatorio: true })
    ] : [
      UI.campo({ rotulo: 'Login', nome: 'login', obrigatorio: true }),
      UI.campo({ rotulo: 'Senha', nome: 'senha', tipo: 'password', obrigatorio: true })
    ];
    campos.forEach(function (c) {
      c.input.setAttribute('autocomplete', c.nome === 'login' ? 'username' : /senha/.test(c.nome) ? (primeiro ? 'new-password' : 'current-password') : 'off');
    });
    var form = UI.formulario(campos);
    var aviso = el('div', { class: 'aviso aviso-erro', hidden: true, role: 'alert' });
    var botao = el('button', { class: 'btn btn-primario entrada-botao', type: 'submit' }, primeiro ? 'Criar administrador e entrar' : 'Entrar');

    function mostrarErro(msg) { UI.preencher(aviso, [icone('alerta'), el('div', { class: 'aviso-corpo' }, msg)]); aviso.hidden = false; }

    var formulario = el('form', {
      class: 'pilha-pq', novalidate: true,
      onsubmit: function (ev) {
        ev.preventDefault();
        aviso.hidden = true;
        var d = form.dados();
        if (primeiro && d.senha !== d.senha2) { form.campo('senha2').erro('As senhas não conferem.'); return; }
        form.limparErros();
        botao.disabled = true;
        var corpo = primeiro ? { codigo: d.codigo, nome: d.nome, login: d.login, senha: d.senha } : { login: d.login, senha: d.senha };
        pedir('POST', primeiro ? '/api/primeiro-acesso' : '/api/entrar', corpo).then(function (r) {
          if (r.ok) { location.reload(); return; }
          botao.disabled = false;
          if (r.corpo && r.corpo.erros) {
            var soltos = form.mostrarErros(r.corpo.erros);
            if (soltos.length) mostrarErro(soltos.join(' '));
          } else mostrarErro((r.corpo && r.corpo.erro) || 'Não foi possível entrar.');
        }, function () {
          botao.disabled = false;
          mostrarErro('O servidor não respondeu. Confira se ele está ligado e se este computador está na rede da clínica.');
        });
      }
    }, campos.map(function (c) { return c.no; }).concat([aviso, botao]));

    document.body.appendChild(el('main', { class: 'entrada-pagina' }, el('div', { class: 'cartao entrada-cartao' }, [
      el('div', { class: 'entrada-marca' }, [
        el('div', { class: 'marca-bloco' },
          el('img', { class: 'marca-logo', src: window.LOGO_MARCA_URL || 'public/the-one-logo.png', alt: 'THE ONE', width: 172, height: 96 })),
        el('div', null, [el('h1', null, 'Gestão de Anestesia'), el('div', { class: 't-pq t-medio' }, primeiro
          ? 'Primeiro acesso: crie o administrador do sistema' : 'Entre com seu usuário da clínica')])
      ]),
      formulario
    ])));
    var primeiroCampo = campos[0].input;
    setTimeout(function () { primeiroCampo.focus(); }, 30);
  }

  /** Servidor fora do ar na partida. */
  function telaForaDoAr() {
    document.body.appendChild(el('main', { class: 'entrada-pagina' }, el('div', { class: 'cartao entrada-cartao' }, [
      el('div', { class: 'aviso aviso-erro' }, [icone('alerta'), el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'O servidor da clínica não respondeu'),
        el('div', { class: 't-pq' }, 'Confira se o computador do servidor está ligado, com a janela do sistema aberta, e se este computador está na mesma rede.')
      ])]),
      el('button', { class: 'btn btn-primario mt-3', onclick: function () { location.reload(); } }, 'Tentar de novo')
    ])));
  }

  /* ============================================================ conta */

  function sair() {
    pedir('POST', '/api/sair', {}).then(function () { location.reload(); }, function () { location.reload(); });
  }

  function formTrocarSenha() {
    var fAtual = UI.campo({ rotulo: 'Senha atual', nome: 'atual', tipo: 'password', obrigatorio: true });
    var fNova = UI.campo({ rotulo: 'Nova senha', nome: 'nova', tipo: 'password', obrigatorio: true, dica: 'Pelo menos 8 caracteres.' });
    var fNova2 = UI.campo({ rotulo: 'Repita a nova senha', nome: 'nova2', tipo: 'password', obrigatorio: true });
    var form = UI.formulario([fAtual, fNova, fNova2]);
    UI.abrirModal({
      titulo: 'Trocar minha senha', tamanho: 'estreito',
      corpo: [fAtual.no, el('div', { class: 'mt-3' }, fNova.no), el('div', { class: 'mt-3' }, fNova2.no)],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', {
          class: 'btn btn-primario', onclick: function () {
            var d = form.dados();
            if (d.nova !== d.nova2) { fNova2.erro('As senhas não conferem.'); return; }
            pedir('POST', '/api/minha-senha', { atual: d.atual, nova: d.nova }).then(function (r) {
              if (!r.ok) { var s = form.mostrarErros((r.corpo && r.corpo.erros) || []); if (s.length) UI.erro('Senha não trocada', s.join(' ')); return; }
              UI.fecharModal();
              UI.ok('Senha trocada');
            }, function () { UI.erro('O servidor não respondeu'); });
          }
        }, [icone('check'), 'Trocar senha'])
      ]
    });
  }

  /** Menu da conta (rodapé da barra lateral). */
  function menuConta() {
    UI.abrirModal({
      titulo: usuario.nome,
      sub: 'Login ' + usuario.login + ' · ' + (usuario.papel === 'admin' ? 'administrador' : 'equipe'),
      tamanho: 'estreito',
      corpo: [el('p', { class: 'sem-margem t-pq t-medio' },
        'As alterações que você faz vão para o LOG com o seu nome. Os dados ficam no servidor da clínica.')],
      acoes: [
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); formTrocarSenha(); } }, [icone('cadeado'), 'Trocar senha']),
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn btn-perigo', onclick: function () {
          if (fila.length) { UI.atencao('Ainda salvando', 'Espere a fila esvaziar antes de sair.'); return; }
          sair();
        } }, [icone('voltar'), 'Sair'])
      ]
    });
  }

  /* ========================================================== anexos */

  /** O que ANEXOS precisa para guardar os PDFs no servidor. */
  var anexosNaRede = {
    metas: function () {
      return pedir('GET', '/api/anexos').then(function (r) {
        if (!r.ok) throw new Error((r.corpo && r.corpo.erro) || 'Servidor recusou a lista de exames.');
        return r.corpo.metas || [];
      });
    },
    enviar: function (avaliacao, arquivo) {
      return pedir('POST', '/api/anexos', arquivo, {
        'Content-Type': 'application/pdf', 'X-Uid-Avaliacao': String(avaliacao.uid),
        'X-Nome': encodeURIComponent(String(arquivo.name || 'exame.pdf'))
      }).then(function (r) {
        if (!r.ok) throw new Error((r.corpo && r.corpo.erro) || 'O servidor recusou o arquivo.');
        return r.corpo.meta;
      });
    },
    arquivo: function (id) {
      return pedir('GET', '/api/anexos/' + encodeURIComponent(id)).then(function (r) {
        if (!r.ok) throw new Error('Arquivo não encontrado no servidor.');
        return r.corpo;
      });
    },
    remover: function (id) {
      return pedir('DELETE', '/api/anexos/' + encodeURIComponent(id)).then(function (r) {
        if (!r.ok) throw new Error((r.corpo && r.corpo.erro) || 'O servidor não removeu o arquivo.');
      });
    }
  };

  /* ================================================== administração */

  function exigirOk(r, padrao) {
    if (r.ok) return r.corpo;
    var c = r.corpo || {};
    var e = new Error(c.erro || (c.erros ? c.erros.map(function (x) { return x.msg; }).join(' ') : padrao));
    e.erros = c.erros;
    throw e;
  }

  var admin = {
    usuarios: function () { return pedir('GET', '/api/usuarios').then(function (r) { return exigirOk(r, 'Sem acesso.').usuarios; }); },
    salvarUsuario: function (dados) { return pedir('POST', '/api/usuarios', dados).then(function (r) { return exigirOk(r, 'Não foi salvo.'); }); },
    copias: function () { return pedir('GET', '/api/copias').then(function (r) { return exigirOk(r, 'Sem acesso.').copias; }); },
    restaurarCopia: function (id) { return pedir('POST', '/api/copias/restaurar', { id: id }).then(function (r) { return exigirOk(r, 'Não foi restaurada.'); }); },
    backup: function (comPdfs) {
      return pedir('GET', '/api/backup' + (comPdfs ? '?pdfs=1' : '')).then(function (r) {
        if (!r.ok) exigirOk(r, 'Sem acesso.');
        var corpo = r.corpo instanceof Blob ? r.corpo : new Blob([JSON.stringify(r.corpo)], { type: 'application/json' });
        return corpo;
      });
    },
    importar: function (arquivo) {
      return pedir('POST', '/api/importar', arquivo, { 'Content-Type': 'application/json' }).then(function (r) { return exigirOk(r, 'Não foi importado.'); });
    },
    apagarTudo: function () {
      return pedir('POST', '/api/apagar-tudo', { confirmacao: 'APAGAR' }).then(function (r) { return exigirOk(r, 'Não foi apagado.'); });
    }
  };

  return {
    detectar: detectar,
    conectar: conectar,
    envolver: envolver,
    aguardarFila: aguardarFila,
    telaDeEntrada: telaDeEntrada,
    telaForaDoAr: telaForaDoAr,
    noDeStatus: noDeStatus,
    menuConta: menuConta,
    anexos: anexosNaRede,
    admin: admin,
    ativo: function () { return ativo; },
    usuario: function () { return usuario; },
    hoje: function () { return hoje; },
    ehAdmin: function () { return !!(usuario && usuario.papel === 'admin'); },
    pendentes: function () { return fila.length; }
  };
})();
