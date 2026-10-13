/**
 * ============================================================================
 * TELA — Usuários e permissões (só o Anestesista chefe)
 * ============================================================================
 * Quem entra no sistema e o que cada um pode (core/12b_permissoes.js e
 * docs/PERMISSOES.md):
 *   - o Anestesista chefe tem tudo e é o único que cadastra usuários e decide
 *     as permissões; o chefe PRINCIPAL é o único que cria ou altera outro chefe
 *     e passa a função de principal;
 *   - os outros usuários têm a lista de permissões que o chefe marcar, a partir
 *     de um modelo (Anestesista ou Secretária).
 * Ninguém é apagado: quem sai do grupo é desativado (o LOG continua com o
 * nome). Senha nova ou permissão diferente derruba as sessões abertas da pessoa.
 *
 * Funciona igual no servidor da clínica (SERVIDOR.admin) e na demonstração
 * online (DEMO.admin, contas guardadas só no navegador): `app.contas()`.
 * ============================================================================
 */
'use strict';

TELAS.usuarios = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao;

  var lista = null;       // última lista lida
  var erro = null;

  function carregar(app) {
    return app.contas().usuarios().then(function (u) { lista = u; erro = null; app.redesenhar(); },
      function (e) { erro = e.message; app.redesenhar(); });
  }

  function permissao(id) { return core.PERMISSOES.filter(function (p) { return p.id === id; })[0]; }
  function rotulos(ids) { return ids.map(function (id) { return permissao(id).rotulo; }).join(', '); }

  function seloDoAcesso(u) {
    if (u.papel === 'chefe') {
      return el('span', { class: 'selo selo-info' }, core.PERFIS.chefe.rotulo + (u.principal ? ' · principal' : ''));
    }
    return el('span', { class: 'selo selo-na' }, core.rotuloDoAcesso(u));
  }

  function render(app) {
    if (lista === null && !erro) {
      carregar(app);
      return el('div', { class: 'cartao' }, el('div', { class: 'cartao-corpo t-medio' }, 'Carregando os usuários…'));
    }
    if (erro) {
      return el('div', { class: 'aviso aviso-erro' }, [icone('alerta'), el('div', { class: 'aviso-corpo' }, erro)]);
    }
    var eu = app.quem();
    var principal = lista.filter(function (u) { return u.principal; })[0];
    return el('div', { class: 'pilha' }, [
      el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [icone('info'), el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Só o Anestesista chefe cadastra usuários e decide as permissões de cada um'),
        el('div', { class: 't-pq' }, 'Cada usuário recebe a lista de permissões que você marcar, a partir de um modelo (Anestesista ou ' +
          'Secretária). ' + (principal ? principal.nome + ' é o chefe principal: só ele cria ou altera outro Anestesista chefe. ' : '') +
          'Quem sai do grupo é desativado — o nome continua no LOG. Mudar as permissões de alguém derruba as sessões dela: ela entra ' +
          'de novo já com o acesso novo.'),
        el('div', { class: 't-mpq t-suave mt-2' }, 'Só do chefe, não se dá a ninguém: ' + core.EXCLUSIVO_DO_CHEFE.join('; ') + '.')
      ])]),
      el('div', { class: 'cartao' }, [
        cab('Usuários do sistema', lista.length + ' cadastrado(s)', [
          el('button', { class: 'btn btn-primario btn-pq', onclick: function () { form(app, null); } }, [icone('mais'), 'Novo usuário'])
        ]),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [{ rotulo: 'Nome' }, { rotulo: 'Login' }, { rotulo: 'Acesso' }, { rotulo: 'Permissões', num: true },
            { rotulo: 'Assina como' }, { rotulo: 'Situação' }, { rotulo: '', classe: 'acoes' }],
          linhas: lista.map(function (u) {
            return {
              celulas: [
                el('span', { class: 'celula-principal' }, u.nome + (u.login === eu.login ? ' (você)' : '')),
                el('span', { class: 'mono' }, u.login),
                seloDoAcesso(u),
                el('span', { class: 't-pq' }, u.papel === 'chefe' ? 'todas' : u.permissoes.length + ' de ' + core.PERMISSOES.length),
                el('span', { class: 't-pq' }, nomeDoVinculo(app, u)),
                u.ativo ? el('span', { class: 'selo selo-ok' }, 'ativo') : el('span', { class: 'selo selo-cancelada' }, 'desativado'),
                el('button', { class: 'btn btn-plano btn-icone btn-pq', title: 'Editar', 'aria-label': 'Editar ' + u.nome,
                  onclick: function (ev) { ev.stopPropagation(); form(app, u); } }, icone('lapis'))
              ],
              __onclick: function () { form(app, u); }
            };
          })
        }))
      ])
    ]);
  }

  /** O anestesista do cadastro a que o login está ligado (quem assina boletim). */
  function nomeDoVinculo(app, u) {
    var a = u.anestesistaId ? app.store.estado.anestesistas.filter(function (x) { return x.id === u.anestesistaId; })[0] : null;
    if (a) return a.nome;
    if (!core.pode(u, 'boletim.assinar')) return '—';
    return u.anestesistaId ? u.anestesistaId : 'não assina (sem vínculo)';
  }

  /* --------------------------------------------------- lista de permissões -- */

  /**
   * As caixas de permissão, agrupadas. `estado.lista` é a seleção atual; ligar uma liga o que ela exige, desligar
   * desliga o que depende dela (e avisa).
   */
  function painelDePermissoes(estado, aoMudar) {
    var no = el('div', { class: 'permissoes' });

    function desenhar() {
      UI.limpar(no);
      core.GRUPOS_DE_PERMISSAO.forEach(function (g) {
        var itens = core.PERMISSOES.filter(function (p) { return p.grupo === g.id; });
        no.appendChild(el('fieldset', { class: 'permissoes-grupo' }, [el('legend', null, g.rotulo)].concat(itens.map(function (p) {
          var marcada = estado.lista.indexOf(p.id) >= 0;
          var caixa = el('input', {
            type: 'checkbox', checked: marcada, disabled: !!p.sempre || estado.travado,
            'aria-describedby': 'perm_' + p.id.replace('.', '_'),
            onchange: function () { alternar(p.id, caixa.checked); }
          });
          return el('label', { class: 'permissao' + (marcada ? ' ligada' : '') }, [
            caixa,
            el('span', { class: 'permissao-texto' }, [
              el('span', { class: 'permissao-rotulo' }, [p.rotulo].concat((p.cuidado || []).map(function (c) {
                return el('span', { class: 'selo selo-pendente sem-ponto permissao-cuidado' }, core.CUIDADOS_DE_PERMISSAO[c]);
              }))),
              el('span', { class: 't-mpq t-suave', id: 'perm_' + p.id.replace('.', '_') }, p.descricao +
                (p.sempre ? ' Vem sempre.' : '') +
                (p.depende.length && !p.sempre ? ' Precisa de: ' + rotulos(p.depende) + '.' : ''))
            ])
          ]);
        }))));
      });
    }

    function alternar(id, ligar) {
      if (ligar) {
        var antes = estado.lista.slice();
        estado.lista = core.completarDependencias(estado.lista.concat([id]));
        var junto = estado.lista.filter(function (x) { return x !== id && antes.indexOf(x) < 0; });
        if (junto.length) UI.info('Ligadas junto', rotulos(junto) + ': "' + permissao(id).rotulo + '" precisa delas.');
      } else {
        var cair = core.dependentesDe(id).filter(function (x) { return estado.lista.indexOf(x) >= 0; });
        estado.lista = estado.lista.filter(function (x) { return x !== id && cair.indexOf(x) < 0; });
        if (cair.length) UI.info('Desligadas junto', rotulos(cair) + ': dependiam de "' + permissao(id).rotulo + '".');
      }
      desenhar();
      aoMudar();
    }

    desenhar();
    return { no: no, desenhar: desenhar };
  }

  /* ------------------------------------------------------------- formulário -- */

  function form(app, u) {
    var novo = !u;
    var eu = app.quem();
    var souPrincipal = !!eu.principal;
    u = u || { papel: 'anestesista', ativo: true, permissoes: core.MODELOS_DE_PERMISSAO.anestesista.slice() };
    var ehChefeAlvo = u.papel === 'chefe';
    // Conta de chefe: só o principal mexe (o servidor também confere).
    var travado = !novo && ehChefeAlvo && !souPrincipal;
    var estado = {
      papel: u.papel,
      lista: ehChefeAlvo ? core.MODELOS_DE_PERMISSAO.anestesista.slice() : (u.permissoes || core.permissoesDe(u.papel)).slice(),
      travado: travado
    };
    var listaSalva = ehChefeAlvo ? core.IDS_DE_PERMISSAO.slice() : estado.lista.slice();
    var confirmando = false;

    var opcoesDoPerfil = [
      { valor: 'anestesista', rotulo: 'Modelo Anestesista' },
      { valor: 'secretaria', rotulo: 'Modelo Secretária' }
    ];
    if (souPrincipal || ehChefeAlvo) opcoesDoPerfil.unshift({ valor: 'chefe', rotulo: 'Anestesista chefe (todas as permissões)' });

    var fNome = UI.campo({ rotulo: 'Nome', nome: 'nome', valor: u.nome || '', obrigatorio: true, dica: 'Como vai aparecer no LOG.' });
    var fLogin = novo ? UI.campo({ rotulo: 'Login', nome: 'login', obrigatorio: true, exemplo: 'ex.: secretaria',
      dica: 'Letras minúsculas, números, ponto ou hífen. Não muda depois.' }) : null;
    var fPapel = UI.campo({ rotulo: 'Acesso', nome: 'papel', tipo: 'select', vazioPermitido: false, valor: u.papel,
      opcoes: opcoesDoPerfil, aoMudar: trocarModelo,
      dica: souPrincipal ? 'Escolher um modelo marca as permissões dele; depois ligue ou desligue o que quiser.'
        : 'Escolher um modelo marca as permissões dele. Só o chefe principal cria outro Anestesista chefe.' });
    var fVinculo = UI.campo({ rotulo: 'Assina boletim como (anestesista do cadastro)', nome: 'anestesistaId', tipo: 'select', vazioPermitido: true,
      valor: u.anestesistaId || '',
      opcoes: app.store.estado.anestesistas.filter(function (a) { return a.ativo === 'Sim'; }).map(function (a) { return { valor: a.id, rotulo: a.nome }; }),
      dica: 'Só quem tem "Assinar o boletim" é ligado: o boletim sai no nome e no CRM do anestesista escolhido.' });
    var fAtivo = novo ? null : UI.campo({ rotulo: 'Situação', nome: 'ativo', tipo: 'select', vazioPermitido: false, valor: u.ativo ? 'sim' : 'nao',
      opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Desativado (não entra mais)' }] });
    var fSenha = UI.campo({ rotulo: novo ? 'Senha inicial' : 'Nova senha (deixe em branco para manter)', nome: 'senha', tipo: 'password',
      obrigatorio: novo, dica: 'Pelo menos 8 caracteres. A pessoa pode trocar depois, no menu dela.' });
    fSenha.input.setAttribute('autocomplete', 'new-password');
    var campos = [fNome, fLogin, fPapel, fVinculo, fAtivo, fSenha].filter(Boolean);
    var f = UI.formulario(campos);
    if (travado) campos.forEach(function (c) { c.input.disabled = true; });

    var resumo = el('div', { class: 'permissoes-resumo t-pq', 'aria-live': 'polite' });
    var avisoConfirmar = el('div', { class: 'aviso aviso-atencao', hidden: true, role: 'alert' });
    var painel = painelDePermissoes(estado, atualizar);
    var blocoPermissoes = el('div', null, [resumo, painel.no]);
    var blocoChefe = el('div', { class: 'aviso aviso-info' }, [icone('escudo'), el('div', { class: 'aviso-corpo' }, [
      el('strong', null, 'O Anestesista chefe tem todas as permissões'),
      el('div', { class: 't-pq' }, 'E também o que não se dá a ninguém: ' + core.EXCLUSIVO_DO_CHEFE.join('; ') + '.')
    ])]);

    function papelEscolhido() { return f.dados().papel || estado.papel; }

    function trocarModelo() {
      var p = papelEscolhido();
      if (p !== 'chefe') estado.lista = core.MODELOS_DE_PERMISSAO[p].slice();
      painel.desenhar();
      atualizar();
    }

    function listaFinal() { return papelEscolhido() === 'chefe' ? core.IDS_DE_PERMISSAO.slice() : estado.lista.slice(); }

    function atualizar() {
      confirmando = false;
      avisoConfirmar.hidden = true;
      var chefe = papelEscolhido() === 'chefe';
      blocoPermissoes.hidden = chefe;
      blocoChefe.hidden = !chefe;
      var assina = chefe || estado.lista.indexOf('boletim.assinar') >= 0;
      fVinculo.input.disabled = travado || !assina;
      if (!assina) fVinculo.input.value = '';
      var modelo = core.modeloDaLista(estado.lista);
      var entram = listaFinal().filter(function (x) { return listaSalva.indexOf(x) < 0; });
      var saem = listaSalva.filter(function (x) { return listaFinal().indexOf(x) < 0; });
      UI.preencher(resumo, [
        el('strong', null, estado.lista.length + ' de ' + core.PERMISSOES.length + ' permissões'),
        ' · ', modelo ? 'igual ao modelo ' + core.PERFIS[modelo].rotulo : 'ajustado à mão',
        novo || (!entram.length && !saem.length) ? null : el('div', { class: 't-mpq mt-1' }, [
          entram.length ? 'Passa a ter: ' + rotulos(entram) + '. ' : '',
          saem.length ? 'Deixa de ter: ' + rotulos(saem) + '.' : ''
        ]),
        assina && !fVinculo.input.value && !chefe ? el('div', { class: 't-mpq mt-1' },
          'Tem "Assinar o boletim", mas sem vínculo com um anestesista do cadastro não consegue assinar.') : null
      ]);
    }

    /** Permissões novas que pedem atenção (dinheiro, dado pessoal, apaga ou altera). */
    function sensiveisQueEntram() {
      return listaFinal().filter(function (id) {
        var p = permissao(id);
        return listaSalva.indexOf(id) < 0 && (p.cuidado || []).some(function (c) { return c !== 'prontuario'; });
      });
    }

    function salvar(botao) {
      var d = f.dados();
      var sensiveis = novo ? [] : sensiveisQueEntram();
      if (sensiveis.length && !confirmando) {
        confirmando = true;
        UI.preencher(avisoConfirmar, [icone('alerta'), el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Confirme o acesso novo'),
          el('div', { class: 't-pq' }, (d.nome || u.nome) + ' passa a ter: ' + rotulos(sensiveis) + '. Clique em "Salvar" de novo para confirmar.')
        ])]);
        avisoConfirmar.hidden = false;
        return;
      }
      var pedido = { nome: d.nome, papel: d.papel, anestesistaId: d.anestesistaId || '' };
      if (d.papel !== 'chefe') pedido.permissoes = estado.lista.slice();
      if (novo) { pedido.novo = true; pedido.login = d.login; }
      else { pedido.login = u.login; pedido.ativo = d.ativo === 'sim'; }
      if (d.senha) pedido.senha = d.senha;
      botao.disabled = true;
      app.contas().salvarUsuario(pedido).then(function () {
        UI.fecharModal();
        UI.ok(novo ? 'Usuário criado' : 'Usuário atualizado', novo ? 'Passe o login e a senha inicial para ' + d.nome + '.' : null);
        lista = null;
        carregar(app);
      }, function (e) {
        botao.disabled = false;
        confirmando = false;
        var soltos = e.erros ? f.mostrarErros(e.erros) : [e.message];
        if (soltos.length) UI.erro('Não foi salvo', soltos.join(' '));
      });
    }

    function passarPrincipal() {
      UI.confirmar({
        titulo: 'Passar a função de chefe principal?',
        aviso: u.nome + ' passa a ser o único que cria ou altera outro Anestesista chefe. Você continua chefe.',
        rotulo: 'Passar a função'
      }, function () {
        app.contas().transferirPrincipal(u.login).then(function () {
          UI.ok('Função passada', u.nome + ' agora é o chefe principal.');
          if (app.servidor) location.reload(); else { lista = null; carregar(app); }
        }, function (e) { UI.erro('A função não foi passada', e.message); });
      });
    }

    var botao = el('button', { class: 'btn btn-primario', onclick: function () { salvar(botao); } }, [icone('check'), 'Salvar']);
    UI.abrirModal({
      titulo: novo ? 'Novo usuário' : u.nome,
      sub: novo ? 'Acesso ao sistema' : 'Login ' + u.login + ' · ' + (ehChefeAlvo && u.principal ? 'Anestesista chefe principal' : core.rotuloDoAcesso(u)),
      tamanho: 'largo',
      corpo: [
        travado ? el('div', { class: 'aviso aviso-atencao' }, [icone('cadeado'), el('div', { class: 'aviso-corpo' },
          'Só o Anestesista chefe principal altera a conta de outro chefe.')]) : null,
        el('div', { class: 'campos-auto' }, campos.map(function (c) { return c.no; })),
        el('h3', { class: 'permissoes-titulo' }, 'Permissões'),
        blocoChefe,
        blocoPermissoes,
        avisoConfirmar
      ],
      acoes: [
        !novo && ehChefeAlvo && souPrincipal && !u.principal && u.ativo
          ? el('button', { class: 'btn', onclick: passarPrincipal }, [icone('escudo'), 'Passar a função de principal']) : null,
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        travado ? null : botao
      ]
    });
    atualizar();
  }

  return { render: render };
})();
