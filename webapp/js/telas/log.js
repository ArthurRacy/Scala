/**
 * ============================================================================
 * TELA — Auditoria
 * ============================================================================
 * Trilha append-only das alterações críticas.
 * ============================================================================
 */
'use strict';

TELAS.log = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao, seletor = COMP.seletor;

  function log(app) {
    var f = app.filtros.log;
    var todas = app.store.estado.log;

    var lista = core.filtrarLog(todas, {
      texto: f.texto, aba: f.aba || null
    }).slice().reverse();

    var abas = {};
    todas.forEach(function (l) { abas[l.aba] = (abas[l.aba] || 0) + 1; });

    return el('div', { class: 'pilha' }, [
      el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [
        icone('escudo'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Trilha de auditoria — só cresce, nunca é reescrita'),
          el('div', { class: 't-pq' },
            'Registra quem mudou o quê, quando, e com que valor antes e depois. ' +
            'Só campos críticos entram: status, datas, horários reais, anestesista, valores, pagamento e nota fiscal. ' +
            'Alterar uma observação não polui o log.')
        ])
      ]),

      el('div', { class: 'cartao' }, [
        cab('LOG', lista.length + ' de ' + todas.length + ' registro(s)', [
          el('div', { class: 'busca', style: 'width:220px' }, [
            icone('busca'),
            el('input', {
              class: 'entrada', type: 'search', value: f.texto || '', placeholder: 'ID, campo, valor…',
              oninput: function (ev) { f.texto = ev.target.value; app.redesenhar(); }
            })
          ]),
          seletor({
            valor: f.aba || '', largura: '190px',
            opcoes: [{ valor: '', rotulo: 'Todas as abas' }].concat(
              Object.keys(abas).sort().map(function (k) {
                return { valor: k, rotulo: k + ' (' + abas[k] + ')' };
              })),
            aoMudar: function (v) { f.aba = v; app.redesenhar(); }
          }),
          el('button', {
            class: 'btn btn-pq', disabled: lista.length === 0,
            onclick: function () {
              DADOS.baixarCSV('LOG', DADOS.matrizDaAba('LOG', lista));
              UI.ok('CSV gerado');
            }
          }, [icone('baixar'), 'CSV'])
        ]),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [
            { rotulo: 'Data/hora' }, { rotulo: 'Usuário' }, { rotulo: 'Aba' },
            { rotulo: 'Registro' }, { rotulo: 'Campo alterado' },
            { rotulo: 'Valor anterior', classeCelula: 'envolve' }, { rotulo: 'Novo valor', classeCelula: 'envolve' }
          ],
          linhas: lista.slice(0, 400).map(function (l) {
            return [
              el('span', { class: 'num t-pq' }, l.quando),
              UI.ou(l.usuario),
              el('span', { class: 't-pq' }, l.aba),
              el('span', { class: 'mono t-suave' }, UI.ou(l.idCirurgia)),
              el('span', { class: 'celula-principal t-pq' }, l.campo),
              el('span', { class: 't-suave t-pq' }, l.de),
              el('span', { class: 't-forte t-pq' }, l.para)
            ];
          }),
          vazio: {
            icone: 'historico', titulo: 'Nenhuma alteração registrada',
            texto: 'O log começa a preencher assim que você lançar ou alterar um registro.'
          }
        })),
        lista.length > 400 ? el('div', { class: 'cartao-pe' },
          'Mostrando os 400 mais recentes de ' + lista.length + '.') : null
      ])
    ]);
  }

  return {
    render: log
  };
})();
