/**
 * QA 32 — Contas conferidas por um caminho independente do código
 *   Cada conta do sistema é refeita aqui de outro jeito (centavos inteiros, texto cru do estado, Date do JavaScript,
 *   as regras escritas nos comentários do próprio core) e comparada com o resultado do sistema, em estados
 *   aleatórios (sementes fixas: o teste é repetível). Se o código e a conta independente discordam, um dos dois está errado.
 *     - calendário: dia da semana e soma de dias de 2024 a 2044 contra Date, e o ano bissexto (2028 sim, 2100 não, 2000 sim)
 *     - dinheiro: formatação em reais contra Intl, e ida e volta
 *     - indicadores financeiros do mês e a divisão do repasse (a soma das cotas fecha com o líquido, ao centavo)
 *     - rodízio: quem está em cada posição de cada dia, e a escala-base automática
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var x = Math.imul(a ^ a >>> 15, 1 | a);
      x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  var DIAS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];

  /* ====================================================================== */
  describe('Calendário contra o Date do JavaScript', function () {

    it('dia da semana e soma de dias batem em todos os dias de 2024 a 2044', function () {
      var d = new Date(Date.UTC(2024, 0, 1)), fim = Date.UTC(2044, 11, 31), erros = [];
      while (d.getTime() <= fim) {
        var s = iso(d);
        var esperado = DIAS[d.getUTCDay()];
        var obtido = String(core.diaDaSemana(s)).toUpperCase();
        if (obtido !== esperado) erros.push(s + ' dia: ' + obtido + ' != ' + esperado);
        var amanha = new Date(d.getTime() + 86400000);
        if (core.somarDias(s, 1) !== iso(amanha)) erros.push(s + ' +1 dia: ' + core.somarDias(s, 1) + ' != ' + iso(amanha));
        var mais40 = new Date(d.getTime() + 40 * 86400000);
        if (core.somarDias(s, 40) !== iso(mais40)) erros.push(s + ' +40 dias');
        if (core.paraData(s) !== s) erros.push(s + ' paraData');
        if (erros.length > 5) break;
        d = amanha;
      }
      igual(erros.join(' | '), '');
    });

    it('ano bissexto: 2028 e 2000 têm 29/02; 2100, 2026 e 1900 não', function () {
      igual(core.dataValida('2028-02-29'), true);
      igual(core.dataValida('2000-02-29'), true);
      igual(core.dataValida('2100-02-29'), false, '2100 não é bissexto');
      igual(core.dataValida('2026-02-29'), false);
      igual(core.dataValida('1900-02-29'), false);
      igual(core.somarDias('2100-02-28', 1), '2100-03-01');
      igual(core.somarDias('2028-02-28', 1), '2028-02-29');
      igual(core.dataValida('2026-04-31'), false);
      igual(core.dataValida('2026-13-01'), false);
    });

    it('duração entre horas (com virada de meia-noite) bate com a conta em minutos', function () {
      var rnd = mulberry32(7), erros = [];
      for (var i = 0; i < 3000; i++) {
        var a = Math.floor(rnd() * 1440), b = Math.floor(rnd() * 1440);
        var ha = pad(Math.floor(a / 60)) + ':' + pad(a % 60), hb = pad(Math.floor(b / 60)) + ':' + pad(b % 60);
        var esperado = (b - a + 1440) % 1440;
        if (core.duracaoMinutos(ha, hb) !== esperado) erros.push(ha + '→' + hb + ' ' + core.duracaoMinutos(ha, hb) + ' != ' + esperado);
        if (erros.length > 5) break;
      }
      igual(erros.join(' | '), '');
    });
  });

  /* ====================================================================== */
  describe('Dinheiro em reais', function () {

    function nbsp(s) { return s.replace(/ /g, ' '); }

    it('moedaBR bate com o Intl do pt-BR em 5.000 valores, e o texto volta ao mesmo número', function () {
      var rnd = mulberry32(11), erros = [];
      var fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
      for (var i = 0; i < 5000; i++) {
        var centavos = Math.floor(rnd() * Math.pow(10, 1 + Math.floor(rnd() * 9)));   // de R$ 0,00 a milhões
        var v = centavos / 100;
        var meu = core.moedaBR(v), dele = nbsp(fmt.format(v));
        if (nbsp(meu) !== dele) erros.push(v + ': ' + meu + ' != ' + dele);
        var volta = core.paraNumero(meu);
        if (Math.round(volta * 100) !== centavos) erros.push(v + ' ida e volta: ' + volta);
        if (erros.length > 5) break;
      }
      igual(erros.join(' | '), '');
    });

    it('os formatos que a secretária digita viram o número certo', function () {
      var casos = [['1.234,56', 1234.56], ['1234,56', 1234.56], ['1234.56', 1234.56], ['R$ 1.500,00', 1500], ['1.500', 1500],
        ['0,5', 0.5], ['  300 ', 300], ['1.250.000', 1250000], ['10', 10], ['0,01', 0.01]];
      casos.forEach(function (c) { igual(core.paraNumero(c[0]), c[1], '"' + c[0] + '"'); });
    });
  });

  /* ====================================================================== */
  function popular(semente) {
    var rnd = mulberry32(semente * 977 + 5);
    function escolhe(l) { return l[Math.floor(rnd() * l.length)]; }
    var st = core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' });
    var nomes = st.estado.anestesistas.map(function (a) { return a.nome; });
    function dataEm(meses) { return '2026-' + pad(escolhe(meses)) + '-' + pad(1 + Math.floor(rnd() * 28)); }
    function centavos() { return Math.floor(rnd() * 300000); }

    for (var i = 0; i < 50; i++) {
      var c = { status: escolhe(['Agendada', 'Confirmada', 'Realizada', 'Realizada', 'Realizada', 'Cancelada', 'Remarcada']), data: dataEm([10, 11, 12]),
        inicioPrev: '07:00', fimPrev: '09:00', paciente: 'Paciente ' + i, procedimento: 'Procedimento', cirurgiao: 'Dr. X', anestesista: escolhe(nomes),
        avaliacaoNec: escolhe(['Sim', 'Não']), sala: 'Sala 1' };
      if (rnd() < 0.9) c.valor = centavos() / 100;
      if (rnd() < 0.55) { c.pago = 'Sim'; if (rnd() < 0.8) c.dataPagamento = dataEm([9, 10, 11, 12]); }
      if (rnd() < 0.3) c.nf = String(1000 + i);
      st.adicionarCirurgia(c);
    }
    st.estado.avaliacoes.slice().forEach(function (a) {
      var m = { realizada: escolhe(['Sim', 'Não']), anestesista: escolhe(nomes) };
      if (rnd() < 0.8) m.valor = centavos() / 100;
      if (rnd() < 0.6) m.data = dataEm([10, 11, 12]);
      if (rnd() < 0.5) { m.pago = 'Sim'; if (rnd() < 0.7) m.dataPagamento = dataEm([10, 11, 12]); }
      st.atualizarAvaliacao(a.id, m);
    });
    // grupo do mês: alguns inativos
    for (var k = 0; k < 4; k++) { var an = st.estado.anestesistas[Math.floor(rnd() * 15)]; st.salvarAnestesista({ id: an.id, ativo: escolhe(['Sim', 'Não', 'Sim']) }); }
    [10, 11, 12].forEach(function (mes) {
      if (rnd() < 0.8) st.salvarDespesasRepasse(2026, mes, centavos() / 100, 'x');
      var ativos = st.estado.anestesistas.filter(function (a) { return a.ativo === 'Sim'; });
      for (var p = 0; p < 3; p++) st.registrarPagamentoRepasse(2026, mes, escolhe(ativos).id, centavos() / 100 / 10, dataEm([mes]));
    });
    return st;
  }

  var SEMENTES = [1, 2, 3, 4];
  // Os testes só leem o estado: monta cada um uma vez (montar é a parte lenta).
  var guardados = {};
  function populado(semente) { return guardados[semente] || (guardados[semente] = popular(semente)); }

  describe('Indicadores financeiros do mês contra a soma em centavos', function () {

    function cent(v) { return Math.round(Number(v) * 100); }
    function temValor(v) { return v !== '' && v !== null && v !== undefined && isFinite(Number(v)); }

    /** Regras do cabeçalho de core/08_financeiro.js, refeitas sobre o texto cru do estado. */
    function oraculo(estado, mes, ano) {
      var canc = {};
      estado.cirurgias.forEach(function (c) { if (String(c.status).trim().toLowerCase() === 'cancelada') canc[c.id] = true; });
      var o = { totalAnestesias: 0, recebidoAnestesias: 0, totalAvaliacoes: 0, recebidoAvaliacoes: 0, qtdAnestesias: 0, qtdAvaliacoes: 0 };
      estado.cirurgias.forEach(function (c) {
        if (!c.data || Number(String(c.data).slice(5, 7)) !== mes || Number(String(c.data).slice(0, 4)) !== ano) return;
        if (canc[c.id] || !temValor(c.valor)) return;
        o.totalAnestesias += cent(c.valor); o.qtdAnestesias++;
        if (c.pago === 'Sim') o.recebidoAnestesias += cent(c.valor);
      });
      estado.avaliacoes.forEach(function (a) {
        var base = a.data || a.dataCirurgia;
        if (!base || Number(String(base).slice(5, 7)) !== mes || Number(String(base).slice(0, 4)) !== ano) return;
        if (!(a.realizada === 'Sim' || !canc[a.idCirurgia]) || !temValor(a.valor)) return;
        o.totalAvaliacoes += cent(a.valor); o.qtdAvaliacoes++;
        if (a.pago === 'Sim') o.recebidoAvaliacoes += cent(a.valor);
      });
      return o;
    }

    SEMENTES.forEach(function (s) {
      it('estado aleatório ' + s + ': totais, recebidos, pendentes e quantidades batem ao centavo, nos três meses', function () {
        var st = populado(s), erros = [];
        [10, 11, 12].forEach(function (mes) {
          var o = oraculo(st.estado, mes, 2026), f = st.financeiro(mes, 2026);
          function confere(nome, obtidoReais, esperadoCent) { if (cent(obtidoReais) !== esperadoCent) erros.push(mes + '/' + nome + ': ' + obtidoReais + ' != ' + esperadoCent / 100); }
          confere('totalAnestesias', f.totalAnestesias, o.totalAnestesias);
          confere('recebidoAnestesias', f.recebidoAnestesias, o.recebidoAnestesias);
          confere('pendenteAnestesias', f.pendenteAnestesias, o.totalAnestesias - o.recebidoAnestesias);
          confere('totalAvaliacoes', f.totalAvaliacoes, o.totalAvaliacoes);
          confere('recebidoAvaliacoes', f.recebidoAvaliacoes, o.recebidoAvaliacoes);
          confere('pendenteAvaliacoes', f.pendenteAvaliacoes, o.totalAvaliacoes - o.recebidoAvaliacoes);
          confere('totalRecebido', f.totalRecebido, o.recebidoAnestesias + o.recebidoAvaliacoes);
          confere('totalPendente', f.totalPendente, o.totalAnestesias + o.totalAvaliacoes - o.recebidoAnestesias - o.recebidoAvaliacoes);
          confere('totalFaturado', f.totalFaturado, o.totalAnestesias + o.totalAvaliacoes);
          if (f.qtdAnestesias !== o.qtdAnestesias) erros.push(mes + '/qtdAnestesias ' + f.qtdAnestesias + ' != ' + o.qtdAnestesias);
          if (f.qtdAvaliacoes !== o.qtdAvaliacoes) erros.push(mes + '/qtdAvaliacoes ' + f.qtdAvaliacoes + ' != ' + o.qtdAvaliacoes);
        });
        igual(erros.join(' | '), '');
        verdadeiro(st.financeiro(11, 2026).qtdAnestesias > 5, 'o estado de teste tem de ter movimento de verdade');
      });
    });

    it('o resumo do ano é a soma dos meses', function () {
      var st = populado(2), a = st.financeiroAnual(2026), soma = 0;
      a.meses.forEach(function (m) { soma += cent(m.totalRecebido); });
      igual(cent(a.total.totalRecebido), soma);
    });
  });

  /* ====================================================================== */
  describe('Repasse: a divisão fecha com o líquido, ao centavo', function () {

    function cent(v) { return Math.round(Number(v) * 100); }

    /** Regras do cabeçalho de core/09b_repasse.js, refeitas sobre o texto cru do estado. */
    function oraculo(estado, mes, base) {
      var chave = '2026-' + pad(mes);
      var canc = {};
      estado.cirurgias.forEach(function (c) { if (String(c.status).trim().toLowerCase() === 'cancelada') canc[c.id] = true; });
      var bruto = 0;
      function entra(valor, pago, dataPag, competencia) {
        if (pago !== 'Sim' || valor === '' || valor === null || valor === undefined || !isFinite(Number(valor)) || Number(valor) === 0) return;
        var ref = base === 'competencia' ? competencia : (dataPag ? String(dataPag).slice(0, 7) : competencia);
        if (ref === chave) bruto += cent(valor);
      }
      estado.cirurgias.forEach(function (c) { if (!canc[c.id]) entra(c.valor, c.pago, c.dataPagamento, String(c.data).slice(0, 7)); });
      estado.avaliacoes.forEach(function (a) {
        if (!(a.realizada === 'Sim' || !canc[a.idCirurgia])) return;
        entra(a.valor, a.pago, a.dataPagamento, String(a.data || a.dataCirurgia).slice(0, 7));
      });
      var reg = estado.repasses.filter(function (r) { return r.mes === chave; })[0] || { despesas: null, pagamentos: [] };
      var liquido = Math.max(0, bruto - (reg.despesas ? cent(reg.despesas) : 0));
      var grupo = reg.participantes || estado.anestesistas.filter(function (a) { return a.ativo === 'Sim'; }).map(function (a) { return { id: a.id }; });
      var n = grupo.length, base_ = n ? Math.floor(liquido / n) : 0, sobra = n ? liquido - base_ * n : 0;
      var cotas = grupo.map(function (g, i) { return { id: g.id, cota: base_ + (i < sobra ? 1 : 0) }; });
      return { bruto: bruto, liquido: liquido, cotas: cotas, reg: reg };
    }

    SEMENTES.forEach(function (s) {
      ['caixa', 'competencia'].forEach(function (base) {
        it('estado aleatório ' + s + ', base ' + base + ': bruto, líquido, cota de cada um e diferença batem; a soma das cotas é o líquido', function () {
          var st = populado(s), erros = [];
          [10, 11, 12].forEach(function (mes) {
            var o = oraculo(st.estado, mes, base), r = st.repasse(2026, mes, { base: base });
            if (cent(r.bruto) !== o.bruto) erros.push(mes + '/bruto ' + r.bruto + ' != ' + o.bruto / 100);
            if (cent(r.liquido) !== o.liquido) erros.push(mes + '/líquido ' + r.liquido + ' != ' + o.liquido / 100);
            var somaCotas = 0;
            r.linhas.filter(function (l) { return !l.foraDoGrupo; }).forEach(function (l, i) {
              somaCotas += cent(l.cota);
              if (!o.cotas[i] || o.cotas[i].id !== l.id) { erros.push(mes + '/ordem do grupo na linha ' + i); return; }
              if (cent(l.cota) !== o.cotas[i].cota) erros.push(mes + '/cota de ' + l.id + ' ' + l.cota + ' != ' + o.cotas[i].cota / 100);
              var pago = 0;
              (o.reg.pagamentos || []).forEach(function (p) { if (p.idAnestesista === l.id) pago += cent(p.valor); });
              if (cent(l.repassado) !== pago) erros.push(mes + '/repassado de ' + l.id);
              if (cent(l.diferenca) !== o.cotas[i].cota - pago) erros.push(mes + '/diferença de ' + l.id);
            });
            if (r.participantes > 0 && somaCotas !== o.liquido) erros.push(mes + '/a soma das cotas (' + somaCotas / 100 + ') não fecha com o líquido (' + o.liquido / 100 + ')');
            var totalPago = 0; (o.reg.pagamentos || []).forEach(function (p) { totalPago += cent(p.valor); });
            if (cent(r.totalRepassado) !== totalPago) erros.push(mes + '/totalRepassado');
          });
          igual(erros.join(' | '), '');
        });
      });
    });

    it('a cota nunca difere mais de 1 centavo entre duas pessoas do grupo', function () {
      var st = populado(3);
      [10, 11, 12].forEach(function (mes) {
        var cotas = st.repasse(2026, mes).linhas.filter(function (l) { return !l.foraDoGrupo; }).map(function (l) { return cent(l.cota); });
        if (!cotas.length) return;
        verdadeiro(Math.max.apply(null, cotas) - Math.min.apply(null, cotas) <= 1, 'mês ' + mes + ': ' + cotas.join(','));
      });
    });
  });

  /* ====================================================================== */
  describe('Rodízio contra a fórmula escrita em core/04_rodizio.js', function () {

    var ANCORA = '2026-10-01';

    /** anestesista(data, posição) = BASE[dia][((posição − 1 + k) mod 5) + 1], k = ocorrências do dia da semana desde a âncora. */
    function esperado(base, data, pos) {
      var dia = DIAS[new Date(data + 'T00:00:00Z').getUTCDay()];
      var primeira = new Date(ANCORA + 'T00:00:00Z');
      while (DIAS[primeira.getUTCDay()] !== dia) primeira = new Date(primeira.getTime() + 86400000);
      var k = Math.floor((new Date(data + 'T00:00:00Z').getTime() - primeira.getTime()) / 86400000 / 7);
      var bloco = {}, atual = '';
      base.forEach(function (l) { if (l.dia) atual = l.dia; bloco[atual + '|' + l.posicao] = l.nome; });
      return bloco[dia + '|' + (((pos - 1 + k) % 5) + 1)];
    }

    /**
     * Mês ENCERRADO é histórico e fica como foi gravado (mudar a base em março não reescreve outubro): as linhas
     * anteriores a `corte` seguem a base ANTIGA; as de `corte` em diante seguem a base de agora.
     */
    function confereEscala(st, ignorar, baseAntiga, corte) {
      var erros = [];
      st.estado.consolidada.forEach(function (l) {
        if (ignorar && ignorar[l.data + '|' + l.posicao]) return;
        var e = esperado(baseAntiga && l.data < corte ? baseAntiga : st.estado.escalaBase, l.data, l.posicao);
        if (l.efetivo !== e) erros.push(l.data + ' pos ' + l.posicao + ': ' + l.efetivo + ' != ' + e);
      });
      return erros.slice(0, 5).join(' | ');
    }

    it('escala do seed: todas as linhas de todos os meses batem com a fórmula', function () {
      var st = core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' });
      verdadeiro(st.estado.consolidada.length > 300, 'tem de haver escala para conferir');
      igual(confereEscala(st), '');
    });

    it('com substituições registradas, só as posições substituídas mudam (e mudam para o substituto)', function () {
      var st = core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' });
      var trocas = { '2026-10-08|1': 'Alene Cunha', '2026-11-12|3': 'Brunna Cintra', '2026-12-05|2': 'Tiago Tolentino' }, ignorar = {};
      Object.keys(trocas).forEach(function (k) {
        var p = k.split('|');
        // só tenta onde o substituto não está escalado no mesmo dia (a regra do sistema recusa o resto)
        var r = st.ajustarEscala(p[0], Number(p[1]), { substituto: trocas[k], motivo: 'teste' });
        if (r.ok) {
          ignorar[k] = true;
          igual(st.estado.consolidada.filter(function (l) { return l.data === p[0] && l.posicao === Number(p[1]); })[0].efetivo, trocas[k]);
        }
      });
      verdadeiro(Object.keys(ignorar).length >= 1, 'ao menos uma troca tem de ter sido aceita');
      igual(confereEscala(st, ignorar), '');
    });

    it('escala-base automática: ordem alfabética (sem acento) distribuída 5 por dia, em fila circular, para grupos de 5 a 15 pessoas', function () {
      var rnd = mulberry32(21), erros = [];
      function chave(n) { return n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
      for (var rodada = 0; rodada < 10; rodada++) {
        var st = core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' });
        var baseAntiga = JSON.parse(JSON.stringify(st.estado.escalaBase));
        var inativos = Math.floor(rnd() * 11);   // de 0 a 10 inativos: sobram 15 a 5
        var ids = st.estado.anestesistas.map(function (a) { return a.id; }).sort(function () { return rnd() - 0.5; }).slice(0, inativos);
        ids.forEach(function (id) { st.salvarAnestesista({ id: id, ativo: 'Não' }); });
        verdadeiro(st.definirModoEscalaBase(true).ok);
        var ativos = st.estado.anestesistas.filter(function (a) { return a.ativo === 'Sim'; }).map(function (a) { return a.nome; })
          .sort(function (a, b) { return chave(a) < chave(b) ? -1 : (chave(a) > chave(b) ? 1 : 0); });
        var n = ativos.length, vaga = 0, atual = '';
        st.estado.escalaBase.forEach(function (l, i) {
          if (l.dia) atual = l.dia;
          var esperada = ativos[vaga % n]; vaga++;
          if (l.nome !== esperada) erros.push('rodada ' + rodada + ' (' + n + ' ativos) linha ' + i + ': ' + l.nome + ' != ' + esperada);
        });
        var porDia = {}; var dia = '';
        st.estado.escalaBase.forEach(function (l) { if (l.dia) dia = l.dia; (porDia[dia] = porDia[dia] || []).push(l.nome); });
        Object.keys(porDia).forEach(function (d) { if (new Set(porDia[d]).size !== 5) erros.push('rodada ' + rodada + ' ' + d + ': pessoa repetida no mesmo dia'); });
        var e2 = confereEscala(st, null, baseAntiga, '2026-11-01'); if (e2) erros.push('rodada ' + rodada + ' escala: ' + e2);
        if (erros.length > 4) break;
      }
      igual(erros.join(' | '), '');
    });
  });
};
