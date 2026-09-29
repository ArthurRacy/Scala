/**
 * QA 02 — Rodízio, escalas mensais e consolidada
 * Cobre a regra de giro semanal e a TASK-203 (busca de posição).
 * O teste mais importante do arquivo compara as 395 linhas geradas contra as
 * 395 linhas que JÁ EXISTEM na planilha em uso.
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso, igualProfundo = t.igualProfundo;

  var seed = dados.seed;
  var ref = dados.escalasRef;

  describe('ESCALA_BASE', function () {

    it('tem 30 linhas: 6 dias x 5 posições', function () {
      igual(seed.ESCALA_BASE.length, 30);
    });

    it('indexa corretamente, herdando o dia das linhas em branco', function () {
      var idx = core.indexarEscalaBase(seed.ESCALA_BASE);
      igual(Object.keys(idx).length, 6);
      core.DOMINIOS.DIA_SEMANA_ESCALA.forEach(function (dia) {
        igual(Object.keys(idx[dia]).length, 5, dia + ' deveria ter 5 posições');
      });
    });

    it('o elenco de QUINTA-FEIRA é o da planilha', function () {
      var idx = core.indexarEscalaBase(seed.ESCALA_BASE);
      var q = idx['QUINTA-FEIRA'];
      igual(q[1].nome, 'Fabrício Tavares');
      igual(q[2].nome, 'Heloísa Roncolato');
      igual(q[3].nome, 'Marcus Vinícius');
      igual(q[4].nome, 'Maria Fernanda');
      igual(q[5].nome, 'Priscilla De Carli');
    });

    it('passa na validação contra o cadastro', function () {
      var rel = core.validarEscalaBase(seed.ESCALA_BASE, seed.ANESTESISTAS);
      verdadeiro(rel.ok, 'erros: ' + rel.erros.map(function (e) { return e.msg; }).join(' | '));
    });

    it('acusa nome que não existe no cadastro', function () {
      var ruim = JSON.parse(JSON.stringify(seed.ESCALA_BASE));
      ruim[0].nome = 'Fulano Inexistente';
      var rel = core.validarEscalaBase(ruim, seed.ANESTESISTAS);
      falso(rel.ok);
    });

    it('acusa o mesmo anestesista duas vezes no mesmo dia', function () {
      var ruim = JSON.parse(JSON.stringify(seed.ESCALA_BASE));
      ruim[1].nome = ruim[0].nome;          // duplica dentro de SEGUNDA-FEIRA
      ruim[1].id = ruim[0].id;
      var rel = core.validarEscalaBase(ruim, seed.ANESTESISTAS);
      falso(rel.ok, 'duplicidade no dia deixaria a chave DATA+ANESTESISTA ambígua');
    });

    it('acusa posição vazia', function () {
      var ruim = JSON.parse(JSON.stringify(seed.ESCALA_BASE));
      ruim[3].nome = '';
      var rel = core.validarEscalaBase(ruim, seed.ANESTESISTAS);
      falso(rel.ok);
    });
  });

  describe('Regra de giro semanal', function () {

    it('a primeira ocorrência de cada dia da semana tem giro 0', function () {
      igual(core.giroDaData('2026-10-01'), 0, '1ª quinta');
      igual(core.giroDaData('2026-10-02'), 0, '1ª sexta');
      igual(core.giroDaData('2026-10-03'), 0, '1º sábado');
      igual(core.giroDaData('2026-10-05'), 0, '1ª segunda do horizonte');
      igual(core.giroDaData('2026-10-06'), 0, '1ª terça');
      igual(core.giroDaData('2026-10-07'), 0, '1ª quarta');
    });

    it('cada semana avança um giro dentro do mesmo dia da semana', function () {
      igual(core.giroDaData('2026-10-08'), 1, '2ª quinta');
      igual(core.giroDaData('2026-10-15'), 2, '3ª quinta');
      igual(core.giroDaData('2026-10-22'), 3, '4ª quinta');
      igual(core.giroDaData('2026-10-29'), 4, '5ª quinta');
    });

    it('o ciclo fecha em 5 semanas e volta à ordem-base', function () {
      igual(core.giroDaData('2026-11-05'), 0, '6ª quinta volta ao giro 0');
    });

    it('o giro é contado por dia da semana, não por semana do calendário', function () {
      // 05/10 é a 2ª semana do calendário, mas a 1ª segunda do horizonte.
      igual(core.giroDaData('2026-10-05'), 0);
      igual(core.giroDaData('2026-10-12'), 1);
    });

    it('o giro fica sempre entre 0 e 4, inclusive antes da âncora', function () {
      ['2026-09-24', '2026-10-01', '2026-12-31', '2027-03-15'].forEach(function (d) {
        var g = core.giroDaData(d);
        verdadeiro(g >= 0 && g <= 4, 'giro fora da faixa em ' + d + ': ' + g);
      });
    });

    it('aplica o giro na escolha do anestesista', function () {
      var idx = core.indexarEscalaBase(seed.ESCALA_BASE);
      // 01/10 (giro 0) posição 1 = Fabrício; 08/10 (giro 1) posição 1 = Heloísa
      igual(core.anestesistaDoRodizio(idx, '2026-10-01', 1).nome, 'Fabrício Tavares');
      igual(core.anestesistaDoRodizio(idx, '2026-10-08', 1).nome, 'Heloísa Roncolato');
      igual(core.anestesistaDoRodizio(idx, '2026-10-08', 5).nome, 'Fabrício Tavares', 'quem era 1 vira 5');
    });
  });

  describe('FIDELIDADE — escalas mensais geradas x planilha em uso', function () {

    [10, 11, 12].forEach(function (mes) {
      var aba = core.cfgMesEscala(mes).aba;

      it('"' + aba + '" gera o mesmo número de linhas da planilha', function () {
        var ger = core.gerarEscalaMensal(2026, mes, seed.ESCALA_BASE, {}, seed.ANESTESISTAS);
        igual(ger.length, ref[String(mes)].length);
      });

      it('"' + aba + '" reproduz DATA, DIA, POSIÇÃO, CALCULADO, ID e EFETIVO linha por linha', function () {
        var ger = core.gerarEscalaMensal(2026, mes, seed.ESCALA_BASE, {}, seed.ANESTESISTAS);
        var real = ref[String(mes)];
        for (var i = 0; i < real.length; i++) {
          igual(ger[i].data, real[i].data, 'linha ' + (i + 2) + ' DATA');
          igual(ger[i].dia, real[i].dia, 'linha ' + (i + 2) + ' DIA DA SEMANA');
          igual(Number(ger[i].posicao), Number(real[i].posicao), 'linha ' + (i + 2) + ' POSIÇÃO');
          igual(ger[i].calculado, real[i].calculado, 'linha ' + (i + 2) + ' ANESTESISTA (CALCULADO)');
          igual(ger[i].idCalculado, real[i].idCalculado, 'linha ' + (i + 2) + ' ID_ANESTESISTA');
          igual(ger[i].efetivo, real[i].efetivo, 'linha ' + (i + 2) + ' ANESTESISTA EFETIVO');
        }
      });
    });

    it('no total, as 395 linhas das três abas batem', function () {
      var total = 0;
      [10, 11, 12].forEach(function (mes) {
        total += core.gerarEscalaMensal(2026, mes, seed.ESCALA_BASE, {}, seed.ANESTESISTAS).length;
      });
      igual(total, 395);
    });
  });

  describe('Ajuste manual da escala', function () {

    it('ANESTESISTA EFETIVO segue a fórmula SE(ajuste="Sim"; substituto; calculado)', function () {
      var l = { calculado: 'Fabrício Tavares', ajuste: 'Sim', substituto: 'Alene Cunha' };
      core.recalcularEfetivo(l);
      igual(l.efetivo, 'Alene Cunha');

      l.ajuste = 'Não';
      core.recalcularEfetivo(l);
      igual(l.efetivo, 'Fabrício Tavares', 'desligar o ajuste volta ao calculado');
    });

    it('ajuste marcado sem substituto mantém o calculado', function () {
      var l = { calculado: 'Fabrício Tavares', ajuste: 'Sim', substituto: '' };
      core.recalcularEfetivo(l);
      igual(l.efetivo, 'Fabrício Tavares');
    });

    it('o ajuste sobrevive à regeneração da escala (não apaga histórico)', function () {
      var ajustes = {};
      ajustes[core.chaveDataPosicao('2026-10-01', 1)] = {
        ajuste: 'Sim', substituto: 'Alene Cunha', motivo: 'Congresso'
      };
      var ger = core.gerarEscalaMensal(2026, 10, seed.ESCALA_BASE, ajustes, seed.ANESTESISTAS);
      var alvo = ger[0];
      igual(alvo.calculado, 'Fabrício Tavares', 'o calculado não muda');
      igual(alvo.efetivo, 'Alene Cunha', 'o efetivo passa a ser o substituto');
      igual(alvo.motivo, 'Congresso');
    });
  });

  describe('ESCALA_CONSOLIDADA e TASK-203', function () {
    var escalas = {};
    [10, 11, 12].forEach(function (m) {
      escalas[m] = core.gerarEscalaMensal(2026, m, seed.ESCALA_BASE, {}, seed.ANESTESISTAS);
    });
    var cons = core.gerarConsolidada(escalas, seed.ANESTESISTAS);
    var idx = core.indexarConsolidada(cons);

    it('une as três escalas em 395 linhas', function () {
      igual(cons.length, 395);
    });

    it('monta as duas chaves compostas em todas as linhas', function () {
      cons.forEach(function (l) {
        verdadeiro(!core.vazio(l.chavePosicao), 'linha sem CHAVE DATA+POSIÇÃO');
        verdadeiro(!core.vazio(l.chaveNome), 'linha sem CHAVE DATA+ANESTESISTA');
      });
    });

    it('preenche o ID_ANESTESISTA a partir do nome efetivo', function () {
      igual(cons[0].id, 'A06', 'Fabrício Tavares é A06');
      cons.forEach(function (l) {
        verdadeiro(!core.vazio(l.id), 'linha de ' + l.data + ' pos ' + l.posicao + ' sem ID');
      });
    });

    it('nenhuma CHAVE DATA+ANESTESISTA se repete (busca não fica ambígua)', function () {
      var vistas = {};
      cons.forEach(function (l) {
        falso(vistas[l.chaveNome], 'chave repetida: ' + l.chaveNome);
        vistas[l.chaveNome] = true;
      });
    });

    it('TASK-203 — acha a posição do anestesista na data', function () {
      igual(idx.posicaoDe('2026-10-01', 'Fabrício Tavares'), 1);
      igual(idx.posicaoDe('2026-10-01', 'Priscilla De Carli'), 5);
      igual(idx.posicaoDe('2026-10-08', 'Fabrício Tavares'), 5, 'depois do giro');
    });

    it('TASK-203 — devolve o literal "fora da escala-base" quando não acha', function () {
      igual(idx.posicaoDe('2026-10-01', 'Alene Cunha'), core.CONFIG.FORA_DA_ESCALA);
      igual(idx.posicaoDe('2026-10-01', 'Alene Cunha'), 'fora da escala-base');
    });

    it('TASK-203 — devolve vazio quando falta data ou nome', function () {
      igual(idx.posicaoDe('', 'Fabrício Tavares'), '');
      igual(idx.posicaoDe('2026-10-01', ''), '');
    });

    it('lista os 5 escalados do dia separados por " | "', function () {
      igual(idx.escaladosDoDia('2026-10-01'),
        'Fabrício Tavares | Heloísa Roncolato | Marcus Vinícius | Maria Fernanda | Priscilla De Carli');
    });

    it('acha o nome de uma posição na data', function () {
      igual(idx.nomeNaPosicao('2026-10-01', 1), 'Fabrício Tavares');
      igual(idx.nomeNaPosicao('2026-10-04', 1), core.CONFIG.FORA_DA_ESCALA, 'domingo não tem escala');
    });

    it('domingo não aparece na consolidada', function () {
      cons.forEach(function (l) {
        falso(l.dia === 'DOMINGO', 'domingo na consolidada: ' + l.data);
      });
    });

    it('cada data tem exatamente 5 posições', function () {
      Object.keys(idx.porData).forEach(function (d) {
        igual(idx.porData[d].length, 5, 'data ' + d);
      });
    });
  });
};
