/**
 * QA 01 — Fundação: schema, utilitários e domínios
 * Cobre TASK-101 e TASK-102 (estrutura e tipos das 11 abas).
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso, igualProfundo = t.igualProfundo, contem = t.contem;

  /* ===================================================== TASK-102 ======= */
  describe('TASK-102 — Estrutura das 11 abas', function () {

    it('o schema declara exatamente 11 abas mestras', function () {
      igual(core.ORDEM_ABAS.length, 11);
    });

    it('os nomes de aba batem com a planilha, inclusive acentos e espaços', function () {
      igual(core.SCHEMA.ANESTESISTAS.aba, 'ANESTESISTAS');
      igual(core.SCHEMA.ESCALA_BASE.aba, 'ESCALA_BASE');
      igual(core.SCHEMA.ESCALA_CONSOLIDADA.aba, 'ESCALA_CONSOLIDADA');
      igual(core.SCHEMA.CIRURGIAS.aba, 'CIRURGIAS');
      igual(core.SCHEMA.AVALIACOES_PRE.aba, 'AVALIAÇÕES PRÉ');
      igual(core.SCHEMA.FINANCEIRO.aba, 'FINANCEIRO');
      igual(core.SCHEMA.HORAS.aba, 'HORAS');
      igual(core.SCHEMA.INDICADORES.aba, 'INDICADORES');
      igual(core.SCHEMA.DASHBOARD.aba, 'DASHBOARD');
      igual(core.SCHEMA.LOG.aba, 'LOG');
    });

    it('as três escalas mensais usam os nomes de aba com espaço (não underscore)', function () {
      igual(core.cfgMesEscala(10).aba, 'ESCALA OUTUBRO 2026');
      igual(core.cfgMesEscala(11).aba, 'ESCALA NOVEMBRO 2026');
      igual(core.cfgMesEscala(12).aba, 'ESCALA DEZEMBRO 2026');
    });

    it('CIRURGIAS tem as 30 colunas de A a AD, na ordem', function () {
      var cols = core.schemaColunas('CIRURGIAS');
      igual(cols.length, 30);
      igual(cols[0].rotulo, 'ID_CIRURGIA');
      igual(cols[0].col, 'A');
      igual(cols[29].rotulo, 'ANO (auto)');
      igual(cols[29].col, 'AD');
    });

    it('AVALIAÇÕES PRÉ tem 18 colunas de A a R', function () {
      var cols = core.schemaColunas('AVALIACOES_PRE');
      igual(cols.length, 18);
      igual(cols[0].rotulo, 'ID_AVALIAÇÃO');
      igual(cols[17].rotulo, 'ANO (auto)');
    });

    it('HORAS tem 11 colunas e o contador de pendência na última', function () {
      var cols = core.schemaColunas('HORAS');
      igual(cols.length, 11);
      igual(cols[10].rotulo, 'CIRURGIAS SEM HORÁRIO REAL PREENCHIDO');
    });

    it('ESCALA_CONSOLIDADA declara as duas chaves compostas', function () {
      var rot = core.schemaCabecalho('ESCALA_CONSOLIDADA');
      contem(rot, 'CHAVE DATA+POSIÇÃO');
      contem(rot, 'CHAVE DATA+ANESTESISTA');
    });

    it('LOG tem as 7 colunas do audit trail', function () {
      igualProfundo(core.schemaCabecalho('LOG'), [
        'DATA/HORA', 'USUÁRIO', 'ABA', 'ID_CIRURGIA',
        'CAMPO ALTERADO', 'VALOR ANTERIOR', 'NOVO VALOR'
      ]);
    });

    it('todo campo calculado está marcado como AUTO (não digitável)', function () {
      var auto = core.schemaCamposAuto('CIRURGIAS');
      ['id', 'tempoEstimado', 'tempoReal', 'idAnestesista', 'posicao', 'statusAval',
        'dia', 'escalados', 'sugestaoPos1', 'mes', 'ano'].forEach(function (campo) {
        contem(auto, campo, 'campo ' + campo + ' deveria ser AUTO');
      });
    });

    it('todo campo digitável NÃO está marcado como AUTO', function () {
      var auto = core.schemaCamposAuto('CIRURGIAS');
      ['status', 'data', 'paciente', 'anestesista', 'valor', 'pago', 'nf'].forEach(function (campo) {
        falso(auto.indexOf(campo) >= 0, 'campo ' + campo + ' deveria ser MANUAL');
      });
    });

    it('cada coluna tem tipo de dado declarado', function () {
      var tipos = ['texto', 'data', 'hora', 'duracao', 'numero', 'moeda', 'inteiro', 'booleano'];
      core.ORDEM_ABAS.forEach(function (logico) {
        var cols;
        try { cols = core.schemaColunas(logico); } catch (e) { return; }
        cols.forEach(function (c) {
          contem(tipos, c.tipo, logico + '.' + c.campo + ' tem tipo inválido');
        });
      });
    });
  });

  /* ===================================================== TASK-101 ======= */
  describe('TASK-101 — Cadastro dos 15 anestesistas', function () {

    it('o seed traz exatamente 15 anestesistas', function () {
      igual(dados.seed.ANESTESISTAS.length, 15);
      igual(core.CONFIG.TOTAL_ANESTESISTAS, 15);
    });

    it('os IDs vão de A01 a A15, sem furo nem repetição', function () {
      var ids = dados.seed.ANESTESISTAS.map(function (a) { return a.id; }).sort();
      var esperado = [];
      for (var i = 1; i <= 15; i++) esperado.push('A' + core.pad2(i));
      igualProfundo(ids, esperado);
    });

    it('todo anestesista tem nome preenchido', function () {
      dados.seed.ANESTESISTAS.forEach(function (a) {
        verdadeiro(!core.vazio(a.nome), 'anestesista ' + a.id + ' sem nome');
      });
    });

    it('não há nome duplicado (o nome é chave de vínculo na planilha)', function () {
      var vistos = {};
      dados.seed.ANESTESISTAS.forEach(function (a) {
        var k = core.normalizar(a.nome);
        falso(vistos[k], 'nome duplicado: ' + a.nome);
        vistos[k] = true;
      });
    });
  });

  /* ============================================== utilitários =========== */
  describe('Datas, horas e durações', function () {

    it('reconhece o dia da semana no vocabulário da planilha', function () {
      igual(core.diaDaSemana('2026-10-01'), 'QUINTA-FEIRA');
      igual(core.diaDaSemana('2026-10-02'), 'SEXTA-FEIRA');
      igual(core.diaDaSemana('2026-10-03'), 'SÁBADO');
      igual(core.diaDaSemana('2026-10-04'), 'DOMINGO');
      igual(core.diaDaSemana('2026-10-05'), 'SEGUNDA-FEIRA');
      igual(core.diaDaSemana('2026-10-06'), 'TERÇA-FEIRA');
      igual(core.diaDaSemana('2026-10-07'), 'QUARTA-FEIRA');
    });

    it('aceita data em ISO, em pt-BR, como Date e como serial do Excel', function () {
      igual(core.paraData('2026-10-01'), '2026-10-01');
      igual(core.paraData('01/10/2026'), '2026-10-01');
      igual(core.paraData(new Date(2026, 9, 1)), '2026-10-01');
      igual(core.paraData(46296), '2026-10-01');
    });

    it('rejeita data inexistente no calendário', function () {
      falso(core.dataValida('2026-02-30'));
      falso(core.dataValida('2026-13-01'));
      verdadeiro(core.dataValida('2028-02-29'), '2028 é bissexto');
      falso(core.dataValida('2026-02-29'), '2026 não é bissexto');
    });

    it('conta os dias úteis de cada mês do horizonte (segunda a sábado)', function () {
      igual(core.datasUteisDoMes(2026, 10).length, 27);
      igual(core.datasUteisDoMes(2026, 11).length, 25);
      igual(core.datasUteisDoMes(2026, 12).length, 27);
    });

    it('nenhum domingo entra na lista de dias úteis', function () {
      [10, 11, 12].forEach(function (m) {
        core.datasUteisDoMes(2026, m).forEach(function (d) {
          falso(core.diaDaSemana(d) === 'DOMINGO', d + ' é domingo e não deveria estar na escala');
        });
      });
    });

    it('calcula duração como a planilha: MOD(fim-início,1)', function () {
      igual(core.duracaoHoras('07:00', '13:00'), 6);
      igual(core.duracaoHoras('07:30', '08:00'), 0.5);
      igual(core.duracaoHoras('22:00', '02:00'), 4, 'cirurgia que cruza a meia-noite');
      igual(core.duracaoHoras('07:00', '07:00'), 0, 'início igual ao fim');
    });

    it('devolve null quando falta um dos horários (equivale ao "" da fórmula)', function () {
      igual(core.duracaoHoras('07:00', ''), null);
      igual(core.duracaoHoras('', '13:00'), null);
      igual(core.duracaoHoras('', ''), null);
    });

    it('converte horas decimais para fração de dia e volta sem perda', function () {
      igual(core.horasParaFracaoDia(6), 0.25);
      igual(core.fracaoDiaParaHoras(0.25), 6);
      igual(core.fracaoDiaParaHoras(core.horasParaFracaoDia(7.5)), 7.5);
    });

    it('interpreta hora vinda como fração de dia do Excel', function () {
      igual(core.paraHora(0.5), '12:00');
      igual(core.paraHora(0.291666666666667), '07:00');
    });
  });

  describe('Dinheiro', function () {

    it('lê valor em pt-BR e en-US', function () {
      igual(core.paraNumero('R$ 1.234,56'), 1234.56);
      igual(core.paraNumero('1234.56'), 1234.56);
      igual(core.paraNumero(1234.56), 1234.56);
      igual(core.paraNumero('1.200,00'), 1200);
    });

    it('distingue vazio de zero — vazio não é receita', function () {
      igual(core.paraNumero(''), null);
      igual(core.paraNumero(null), null);
      igual(core.paraNumero(0), 0);
    });

    it('formata em real brasileiro', function () {
      igual(core.moedaBR(1234.5), 'R$ 1.234,50');
      igual(core.moedaBR(1000000), 'R$ 1.000.000,00');
      igual(core.moedaBR(0), 'R$ 0,00');
      igual(core.moedaBR(-50), '-R$ 50,00');
    });
  });

  describe('Chaves compostas (formato exato da planilha)', function () {

    it('CHAVE DATA+POSIÇÃO usa YYYY-MM-DD|posição', function () {
      igual(core.chaveDataPosicao('2026-10-01', 1), '2026-10-01|1');
      igual(core.chaveDataPosicao('01/10/2026', 5), '2026-10-01|5');
    });

    it('CHAVE DATA+ANESTESISTA usa o NOME, não o ID', function () {
      igual(core.chaveDataAnestesista('2026-10-01', 'Fabrício Tavares'), '2026-10-01|Fabrício Tavares');
    });

    it('chave vazia quando falta data ou valor', function () {
      igual(core.chaveDataPosicao('', 1), '');
      igual(core.chaveDataAnestesista('2026-10-01', ''), '');
    });
  });

  describe('Domínios fechados (listas suspensas da planilha)', function () {

    it('STATUS tem os 5 valores da validação de dados', function () {
      igualProfundo(core.DOMINIOS.STATUS_CIRURGIA,
        ['Agendada', 'Confirmada', 'Realizada', 'Cancelada', 'Remarcada']);
    });

    it('CONVÊNIO tem os 5 convênios da validação de dados', function () {
      igualProfundo(core.DOMINIOS.CONVENIO,
        ['Amil', 'Bradesco', 'Assefaz', 'Unimed', 'Particular']);
    });

    it('Sim/Não usa "Não" com til, como na planilha', function () {
      igualProfundo(core.DOMINIOS.SIM_NAO, ['Sim', 'Não']);
    });

    it('canoniza digitação livre para o valor exato do domínio', function () {
      igual(core.canonizar('STATUS_CIRURGIA', 'realizada'), 'Realizada');
      igual(core.canonizar('STATUS_CIRURGIA', 'CANCELADA'), 'Cancelada');
      igual(core.canonizar('CONVENIO', 'unimed'), 'Unimed');
      igual(core.canonizar('SIM_NAO', 'nao'), 'Não', 'sem acento deve casar com "Não"');
    });

    it('não inventa valor fora do domínio', function () {
      igual(core.canonizar('STATUS_CIRURGIA', 'Suspensa'), '');
      falso(core.noDominio('STATUS_CIRURGIA', 'Suspensa'));
    });

    it('normaliza Sim/Não a partir de booleano e de variantes', function () {
      igual(core.paraSimNao(true), 'Sim');
      igual(core.paraSimNao(false), 'Não');
      igual(core.paraSimNao('sim'), 'Sim');
      igual(core.paraSimNao('NAO'), 'Não');
      igual(core.paraSimNao(''), '');
    });
  });
};
