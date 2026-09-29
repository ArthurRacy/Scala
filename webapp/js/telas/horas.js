/**
 * ============================================================================
 * TELA — Horas
 * ============================================================================
 * Balanço de horas por anestesista. Reais e estimadas nunca se somam.
 * ============================================================================
 */
'use strict';

TELAS.horas = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi, cab = COMP.cabecalhoCartao;

  function horas(app) {
    var store = app.store;
    // Colunas = meses do ano selecionado que já têm escala (o horizonte
    // avança com o calendário; em 2026 são OUT/NOV/DEZ, como na planilha).
    var meses = core.mesesDoAno(store.horizonte, app.ano);
    var linhas = store.horas(meses);
    var totais = core.totaisHoras(linhas);
    var pend = store.pendencias();

    var comMovimento = linhas.filter(function (l) {
      return l.totalReais > 0 || l.totalEstimadas > 0 || l.semHorarioReal > 0;
    });

    var raiz = el('div', { class: 'pilha' });

    /* ---- Regra de ouro ------------------------------------------------ */
    raiz.appendChild(el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [
      icone('relogio'),
      el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Horas reais e estimadas nunca se somam'),
        el('div', { class: 't-pq' }, SCHEMA.HORAS.nota + ' ' +
          'Quando uma cirurgia realizada fica sem horário real, ela entra no contador de pendência e o tempo estimado ' +
          'é adotado provisoriamente na coluna "A confirmar" — nunca dentro das horas reais.')
      ])
    ]));

    /* ---- KPIs -------------------------------------------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      kpi({ rotulo: 'Total de horas reais', valor: UI.horasZero(totais.totalReais),
            nota: 'horário real fechado', tom: 'acento' }),
      kpi({ rotulo: 'Total estimado', valor: UI.horasZero(totais.totalEstimadas),
            nota: 'conforme o previsto' }),
      kpi({ rotulo: 'A confirmar', valor: UI.horasZero(totais.totalPendentes),
            nota: 'estimado adotado provisoriamente',
            tom: totais.totalPendentes > 0 ? 'alerta' : null }),
      kpi({ rotulo: 'Sem horário real', valor: UI.inteiro(totais.semHorarioReal),
            nota: 'cirurgias realizadas a fechar',
            tom: totais.semHorarioReal > 0 ? 'perigo' : 'ok' })
    ]));

    /* ---- Pendências (TASK-401) --------------------------------------- */
    if (pend.length) {
      raiz.appendChild(el('div', { class: 'cartao' }, [
        cab('Cirurgias sem horário real preenchido',
          pend.length + (pend.length === 1 ? ' pendência' : ' pendências') + ' — clique para completar'),
        el('div', { class: 'cartao-corpo rente' },
          el('div', null, pend.slice(0, 40).map(function (p) {
            var cir = store.estado.cirurgias.filter(function (c) { return txt(c.id) === txt(p.id); })[0];
            return el('div', {
              class: 'pendencia',
              style: 'cursor:pointer',
              onclick: function () { if (cir) TELAS.cirurgias.form(app, cir); }
            }, [
              el('div', { class: 'pendencia-marca' }, icone('relogio')),
              el('div', { class: 'pendencia-corpo' }, [
                el('div', { class: 'pendencia-titulo' }, [
                  el('span', { class: 'mono t-suave' }, p.id), ' · ',
                  UI.ou(p.paciente), ' · ', p.anestesista
                ]),
                el('div', { class: 'pendencia-texto' }, p.mensagem)
              ]),
              el('button', { class: 'btn btn-pq' }, [icone('lapis'), 'Completar'])
            ]);
          }))),
        pend.length > 40 ? el('div', { class: 'cartao-pe' },
          'Mostrando 40 de ' + pend.length + ' pendências.') : null
      ]));
    } else {
      raiz.appendChild(el('div', { class: 'aviso aviso-ok', style: 'margin:0' }, [
        UI.visto(false),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Nenhuma pendência de horário'),
          el('div', { class: 't-pq' }, 'Todas as cirurgias realizadas têm início e término reais preenchidos.')
        ])
      ]));
    }

    /* ---- Tabela de horas --------------------------------------------- */
    var colunas = [{ rotulo: 'Anestesista' }, { rotulo: 'ID' }];
    meses.forEach(function (m) {
      colunas.push({ rotulo: m.rotulo + ' reais', num: true });
    });
    colunas.push({ rotulo: 'Total reais', num: true });
    meses.forEach(function (m) {
      colunas.push({ rotulo: m.rotulo + ' estim.', num: true });
    });
    colunas.push({ rotulo: 'Total estimadas', num: true });
    colunas.push({ rotulo: 'A confirmar', num: true, dica: 'Tempo estimado adotado onde falta o horário real' });
    colunas.push({ rotulo: 'Sem horário', num: true, dica: 'CIRURGIAS SEM HORÁRIO REAL PREENCHIDO' });

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Horas trabalhadas por anestesista (' + app.ano + ')', 'uma linha por anestesista', [
        el('button', {
          class: 'btn btn-pq',
          onclick: function () {
            var cols = core.colunasHoras(meses);
            var m = [cols.map(function (c) { return c.rotulo; })];
            linhas.forEach(function (l) {
              m.push(cols.map(function (c) { return DADOS.paraCelula(l[c.campo], c.tipo); }));
            });
            DADOS.baixarCSV('HORAS_' + app.ano, m);
            UI.ok('CSV gerado');
          }
        }, [icone('baixar'), 'CSV'])
      ]),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: colunas,
        linhas: comMovimento.map(function (l) {
          var celulas = [
            el('span', { class: 'celula-principal' }, l.nome),
            el('span', { class: 'mono t-suave' }, l.id)
          ];
          meses.forEach(function (m) {
            celulas.push(l['real_' + m.chave] ? UI.horasZero(l['real_' + m.chave]) : el('span', { class: 't-suave' }, '—'));
          });
          celulas.push(el('strong', null, UI.horasZero(l.totalReais)));
          meses.forEach(function (m) {
            celulas.push(l['estim_' + m.chave] ? UI.horasZero(l['estim_' + m.chave]) : el('span', { class: 't-suave' }, '—'));
          });
          celulas.push(el('strong', { class: 't-medio' }, UI.horasZero(l.totalEstimadas)));
          celulas.push(l.totalPendentes
            ? el('span', { class: 't-alerta t-forte' }, UI.horasZero(l.totalPendentes))
            : el('span', { class: 't-suave' }, '—'));
          celulas.push(l.semHorarioReal
            ? el('span', { class: 'selo selo-pendente' }, String(l.semHorarioReal))
            : el('span', { class: 't-suave' }, '—'));
          return celulas;
        }),
        rodape: (function () {
          var r = ['Total (' + comMovimento.length + ')', ''];
          meses.forEach(function (m) {
            var s = 0;
            comMovimento.forEach(function (l) { s += horasParaMinutos(l['real_' + m.chave]) || 0; });
            r.push(UI.horasZero(minutosParaHoras(s)));
          });
          r.push(UI.horasZero(totais.totalReais));
          meses.forEach(function (m) {
            var s = 0;
            comMovimento.forEach(function (l) { s += horasParaMinutos(l['estim_' + m.chave]) || 0; });
            r.push(UI.horasZero(minutosParaHoras(s)));
          });
          r.push(UI.horasZero(totais.totalEstimadas));
          r.push(UI.horasZero(totais.totalPendentes));
          r.push(String(totais.semHorarioReal));
          return r;
        })(),
        vazio: {
          icone: 'relogio',
          titulo: 'Nenhuma hora lançada',
          texto: 'Lance cirurgias com horários para o balanço de horas aparecer aqui.'
        }
      }))
    ]));

    /* ---- Gráfico ------------------------------------------------------ */
    if (comMovimento.length) {
      raiz.appendChild(el('div', { class: 'cartao' }, [
        cab('Horas reais por anestesista', 'total do ano de ' + app.ano),
        el('div', { class: 'cartao-corpo' },
          GFX.barrasH(comMovimento.map(function (l) {
            return { rotulo: l.nome, valor: l.totalReais };
          }), {
            ocultarZero: true, cor: 'var(--s1)', formatar: function (v) { return horasHHMM(v); },
            vazio: 'Nenhuma hora real fechada.', descricao: 'Horas reais por anestesista'
          }))
      ]));
    }

    return raiz;
  }

  return {
    render: horas
  };
})();
