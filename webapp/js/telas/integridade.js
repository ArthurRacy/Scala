/**
 * ============================================================================
 * TELA — Integridade
 * ============================================================================
 * Verificação de consistência dos dados e reparo automático do que é seguro.
 * ============================================================================
 */
'use strict';

TELAS.integridade = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi, cab = COMP.cabecalhoCartao;

  function integridade(app) {
    var store = app.store;
    var r = app.integridade();

    var porArea = {};
    r.problemas.forEach(function (p) {
      (porArea[p.area] = porArea[p.area] || []).push(p);
    });

    var raiz = el('div', { class: 'pilha' });

    /* ---- Resumo ------------------------------------------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-3' }, [
      kpi({
        rotulo: 'Situação geral',
        valor: r.ok ? 'Íntegro' : 'Com erros',
        nota: r.ok ? 'nenhuma inconsistência de dado' : 'há dados que precisam de correção',
        tom: r.ok ? 'ok' : 'perigo'
      }),
      kpi({ rotulo: 'Erros', valor: UI.inteiro(r.erros.length),
            nota: 'bloqueiam confiança no número', tom: r.erros.length ? 'perigo' : null }),
      kpi({ rotulo: 'Avisos', valor: UI.inteiro(r.avisos.length),
            nota: 'pendências operacionais', tom: r.avisos.length ? 'alerta' : null })
    ]));

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Verificação e reparo', 'o reparo só corrige o que é seguro corrigir sozinho'),
      el('div', { class: 'cartao-corpo' }, [
        el('p', { class: 't-pq t-medio' },
          'O reparo automático gera IDs que estejam faltando, normaliza campos Sim/Não fora do padrão e cria as ' +
          'linhas de avaliação pré das cirurgias marcadas com "Sim". Ele NÃO apaga nada e NÃO resolve nome duplicado — ' +
          'isso exige decisão humana, porque o nome é a chave de vínculo da planilha.'),
        el('div', { class: 'linha mt-4' }, [
          el('button', {
            class: 'btn btn-primario',
            onclick: function () {
              var rep = store.reparar();
              app.salvar();
              if (rep.acoes.length === 0 && rep.integridade.ok) {
                UI.ok('Nada a reparar', 'O estado já estava consistente.');
              } else if (rep.acoes.length) {
                UI.ok('Reparo aplicado', rep.acoes.length + ' correção(ões): ' + rep.acoes.slice(0, 3).join(' · '));
              } else {
                UI.atencao('Reparo sem efeito',
                  'Os problemas restantes precisam de decisão sua — veja a lista abaixo.');
              }
              app.redesenhar();
            }
          }, [icone('escudo'), 'Executar reparo automático']),
          el('button', {
            class: 'btn',
            onclick: function () { app.revisao++; app.redesenhar(); UI.info('Verificação refeita'); }
          }, [icone('troca'), 'Verificar de novo'])
        ])
      ])
    ]));

    /* ---- PDFs de exame sem avaliação --------------------------------- */
    var orfaos = ANEXOS.orfaos(store.estado.avaliacoes);
    if (orfaos.length) {
      raiz.appendChild(el('div', { class: 'aviso aviso-atencao', style: 'margin:0' }, [
        icone('clipe'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, orfaos.length + ' PDF(s) de exame sem avaliação correspondente'),
          el('div', { class: 't-pq' },
            'Sobram de avaliações excluídas ou de um backup importado com outros pacientes. Não aparecem em ' +
            'nenhuma avaliação, mas ocupam espaço e contêm dados de pacientes neste navegador.'),
          el('button', {
            class: 'btn btn-pq mt-2',
            onclick: function () {
              UI.confirmar({
                titulo: 'Apagar ' + orfaos.length + ' PDF(s) órfão(s)?',
                tipo: 'perigo', rotulo: 'Apagar',
                aviso: [el('strong', null, 'Os arquivos serão apagados deste navegador. Não há como desfazer.')],
                texto: orfaos.slice(0, 5).map(function (m) { return m.nome; }).join(', ') +
                  (orfaos.length > 5 ? '…' : '')
              }, function () {
                ANEXOS.remover(orfaos.map(function (m) { return m.id; })).then(function (n) {
                  UI.ok('PDFs órfãos apagados', n + ' arquivo(s).');
                  app.redesenhar();
                }, function (e) { UI.erro('Não foi possível apagar', e.message); });
              });
            }
          }, [icone('lixo'), 'Apagar PDFs órfãos'])
        ])
      ]));
    }

    /* ---- Lista de problemas ------------------------------------------ */
    if (!r.problemas.length) {
      raiz.appendChild(el('div', { class: 'cartao' },
        UI.vazioEstado({
          icone: 'escudo',
          titulo: 'Tudo consistente',
          texto: 'Cadastro, escala, cirurgias, avaliações e horas estão coerentes entre si. ' +
            'Nenhuma pendência operacional em aberto.'
        })));
      return raiz;
    }

    Object.keys(porArea).sort().forEach(function (area) {
      var itens = porArea[area];
      var erros = itens.filter(function (p) { return p.nivel === 'ERRO'; }).length;

      raiz.appendChild(el('div', { class: 'cartao' }, [
        cab(area, itens.length + ' item(ns)' + (erros ? ' · ' + erros + ' erro(s)' : ' · só avisos'),
          [erros
            ? el('span', { class: 'selo selo-cancelada' }, erros + ' erro(s)')
            : el('span', { class: 'selo selo-pendente' }, 'avisos')]),
        el('div', { class: 'cartao-corpo rente' },
          el('div', null, itens.slice(0, 60).map(function (p) {
            var cir = p.id ? store.estado.cirurgias.filter(function (c) { return txt(c.id) === txt(p.id); })[0] : null;

            return el('div', {
              class: 'pendencia',
              style: cir ? 'cursor:pointer' : null,
              onclick: cir ? function () { TELAS.cirurgias.form(app, cir); } : null
            }, [
              el('div', {
                class: 'pendencia-marca',
                style: p.nivel === 'ERRO'
                  ? 'background:var(--perigo-suave);color:var(--perigo)' : null
              }, icone(p.nivel === 'ERRO' ? 'alerta' : 'info')),
              el('div', { class: 'pendencia-corpo' }, [
                el('div', { class: 'pendencia-titulo' }, [
                  el('span', {
                    class: 'selo ' + (p.nivel === 'ERRO' ? 'selo-cancelada' : 'selo-pendente')
                  }, p.nivel === 'ERRO' ? 'Erro' : 'Aviso'),
                  p.id ? el('span', { class: 'mono t-suave', style: 'margin-left:8px' }, p.id) : null
                ]),
                el('div', { class: 'pendencia-texto' }, p.msg)
              ]),
              cir ? el('button', { class: 'btn btn-pq' }, [icone('lapis'), 'Abrir']) : null
            ]);
          }))),
        itens.length > 60 ? el('div', { class: 'cartao-pe' },
          'Mostrando 60 de ' + itens.length + ' itens desta área.') : null
      ]));
    });

    return raiz;
  }

  return {
    render: integridade
  };
})();
