/**
 * ============================================================================
 * TELA — Usuários (modo servidor, só o Anestesista chefe)
 * ============================================================================
 * Quem entra no sistema da clínica e com que perfil (core/12b_permissoes.js):
 *   - Anestesista chefe: poder total, inclusive usuários, backup e restauração;
 *   - Anestesista: painel de operação e painel de qualidade, sem dinheiro;
 *   - Secretária: operação e gestão, sem painel de qualidade nem administração.
 * Ninguém é apagado: quem sai do grupo é desativado (o LOG continua com o
 * nome). Senha nova derruba as sessões abertas da pessoa.
 * ============================================================================
 */
'use strict';

TELAS.usuarios = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao;

  var lista = null;       // última lista lida do servidor
  var erro = null;

  function carregar(app) {
    return SERVIDOR.admin.usuarios().then(function (u) { lista = u; erro = null; app.redesenhar(); },
      function (e) { erro = e.message; app.redesenhar(); });
  }

  function render(app) {
    if (lista === null && !erro) {
      carregar(app);
      return el('div', { class: 'cartao' }, el('div', { class: 'cartao-corpo t-medio' }, 'Carregando os usuários…'));
    }
    if (erro) {
      return el('div', { class: 'aviso aviso-erro' }, [icone('alerta'), el('div', { class: 'aviso-corpo' }, erro)]);
    }
    var eu = SERVIDOR.usuario();
    return el('div', { class: 'pilha' }, [
      el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [icone('info'), el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Perfis de acesso'),
        el('div', { class: 't-pq' }, core.ORDEM_DOS_PERFIS.map(function (p) { return core.PERFIS[p].rotulo + ': ' + core.PERFIS[p].resumo; }).join(' ') +
          ' Quem sai do grupo é desativado — o nome continua no LOG. Mudar o perfil de alguém derruba as sessões dela: ela entra de novo com o perfil novo.')
      ])]),
      el('div', { class: 'cartao' }, [
        cab('Usuários do sistema', lista.length + ' cadastrado(s)', [
          el('button', { class: 'btn btn-primario btn-pq', onclick: function () { form(app, null); } }, [icone('mais'), 'Novo usuário'])
        ]),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [{ rotulo: 'Nome' }, { rotulo: 'Login' }, { rotulo: 'Perfil' }, { rotulo: 'Situação' }, { rotulo: '', classe: 'acoes' }],
          linhas: lista.map(function (u) {
            return {
              celulas: [
                el('span', { class: 'celula-principal' }, u.nome + (u.login === eu.login ? ' (você)' : '')),
                el('span', { class: 'mono' }, u.login),
                el('span', { class: u.papel === 'chefe' ? 'selo selo-info' : 'selo selo-na' }, (core.PERFIS[u.papel] || { rotulo: u.papel }).rotulo),
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

  function form(app, u) {
    var novo = !u;
    u = u || { papel: 'anestesista', ativo: true };
    var campos = [
      UI.campo({ rotulo: 'Nome', nome: 'nome', valor: u.nome || '', obrigatorio: true, largo: true,
        dica: 'Como vai aparecer no LOG.' }),
      novo ? UI.campo({ rotulo: 'Login', nome: 'login', obrigatorio: true, exemplo: 'ex.: secretaria',
        dica: 'Letras minúsculas, números, ponto ou hífen. Não muda depois.' }) : null,
      UI.campo({ rotulo: 'Perfil de acesso', nome: 'papel', tipo: 'select', vazioPermitido: false, valor: u.papel,
        opcoes: core.ORDEM_DOS_PERFIS.map(function (p) { return { valor: p, rotulo: core.PERFIS[p].rotulo }; }),
        dica: 'Mudar o perfil de quem já usa o sistema derruba as sessões abertas dela.' }),
      novo ? null : UI.campo({ rotulo: 'Situação', nome: 'ativo', tipo: 'select', vazioPermitido: false, valor: u.ativo ? 'sim' : 'nao',
        opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Desativado (não entra mais)' }] }),
      UI.campo({ rotulo: novo ? 'Senha inicial' : 'Nova senha (deixe em branco para manter)', nome: 'senha', tipo: 'password',
        obrigatorio: novo, dica: 'Pelo menos 8 caracteres. A pessoa pode trocar depois, no menu dela.' })
    ].filter(Boolean);
    campos.forEach(function (c) { if (c.nome === 'senha') c.input.setAttribute('autocomplete', 'new-password'); });
    var f = UI.formulario(campos);

    function salvar(botao) {
      var d = f.dados();
      var pedido = { nome: d.nome, papel: d.papel };
      if (novo) { pedido.novo = true; pedido.login = d.login; }
      else { pedido.login = u.login; pedido.ativo = d.ativo === 'sim'; }
      if (d.senha) pedido.senha = d.senha;
      botao.disabled = true;
      SERVIDOR.admin.salvarUsuario(pedido).then(function () {
        UI.fecharModal();
        UI.ok(novo ? 'Usuário criado' : 'Usuário atualizado', novo ? 'Passe o login e a senha inicial para ' + d.nome + '.' : null);
        lista = null;
        carregar(app);
      }, function (e) {
        botao.disabled = false;
        var soltos = e.erros ? f.mostrarErros(e.erros) : [e.message];
        if (soltos.length) UI.erro('Não foi salvo', soltos.join(' '));
      });
    }

    var botao = el('button', { class: 'btn btn-primario', onclick: function () { salvar(botao); } }, [icone('check'), 'Salvar']);
    UI.abrirModal({
      titulo: novo ? 'Novo usuário' : u.nome,
      sub: novo ? 'Acesso ao sistema da clínica' : 'Login ' + u.login,
      tamanho: 'estreito',
      corpo: campos.map(function (c, i) { return i ? el('div', { class: 'mt-3' }, c.no) : c.no; }),
      acoes: [el('div', { class: 'espaco' }), el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'), botao]
    });
  }

  return { render: render };
})();
