/**
 * QA 08 — Ponte com o Google Sheets (apps-script/*.gs)
 * Testa a camada que lê e escreve a planilha, com um Sheets de mentira.
 * É onde moram os erros mais caros: coluna trocada, linha errada, tipo
 * convertido de forma errada, gatilho duplicando linha.
 */
'use strict';

var Mock = require('./_mock_sheets.js');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso;

  var seed = dados.seed;

  /** Cabeçalho real de uma aba, a partir do schema. */
  function cabecalho(nomeLogico) {
    return core.schemaCabecalho(nomeLogico);
  }

  /**
   * Monta uma planilha falsa com as abas que o sistema espera, já povoada
   * com o cadastro e a escala-base reais.
   */
  function montarPlanilha(extras) {
    extras = extras || {};

    var abas = {};

    /* ANESTESISTAS */
    var linhasAn = [cabecalho('ANESTESISTAS')];
    seed.ANESTESISTAS.forEach(function (a) {
      linhasAn.push([a.id, a.nome, a.ativo, a.telefone || '', a.email || '', a.obs || '']);
    });
    abas['ANESTESISTAS'] = new Mock.FakeSheet('ANESTESISTAS', linhasAn, 66, 6);

    /* ESCALA_BASE */
    var linhasBase = [cabecalho('ESCALA_BASE')];
    seed.ESCALA_BASE.forEach(function (l) {
      linhasBase.push([l.dia || '', l.posicao, l.nome, l.id]);
    });
    abas['ESCALA_BASE'] = new Mock.FakeSheet('ESCALA_BASE', linhasBase, 31, 4);

    /* CIRURGIAS */
    var linhasCir = [cabecalho('CIRURGIAS')].concat(extras.cirurgias || []);
    abas['CIRURGIAS'] = new Mock.FakeSheet('CIRURGIAS', linhasCir, 501, 30);

    /* AVALIAÇÕES PRÉ */
    var linhasAv = [cabecalho('AVALIACOES_PRE')].concat(extras.avaliacoes || []);
    abas['AVALIAÇÕES PRÉ'] = new Mock.FakeSheet('AVALIAÇÕES PRÉ', linhasAv, 301, 18);

    /* ESCALA_CONSOLIDADA */
    abas['ESCALA_CONSOLIDADA'] = new Mock.FakeSheet('ESCALA_CONSOLIDADA',
      [cabecalho('ESCALA_CONSOLIDADA')], 396, 7);

    /* Escalas mensais */
    core.CONFIG.MESES_ESCALA.forEach(function (m) {
      abas[m.aba] = new Mock.FakeSheet(m.aba, [cabecalho('ESCALA_MENSAL')], 140, 9);
    });

    /* LOG */
    abas['LOG'] = new Mock.FakeSheet('LOG', [cabecalho('LOG')], 2, 7);

    /* INDICADORES — só o que os testes tocam */
    var ind = new Mock.FakeSheet('INDICADORES', [['INDICADORES MENSAIS POR ANESTESISTA']], 40, 8);
    abas['INDICADORES'] = ind;

    return abas;
  }

  /** Linha de CIRURGIAS na ordem das 30 colunas. */
  function linhaCirurgia(valores) {
    var cols = core.schemaColunas('CIRURGIAS');
    return cols.map(function (c) {
      return valores[c.campo] === undefined ? '' : valores[c.campo];
    });
  }

  describe('Ambiente de teste do Apps Script', function () {

    it('carrega os três arquivos .gs no escopo global', function () {
      var ctrl = Mock.instalar(montarPlanilha());
      igual(ctrl.arquivosCarregados.length, 3);
      igual(typeof globalThis.instalarSistema, 'function');
      igual(typeof globalThis.aoEditar, 'function');
      igual(typeof globalThis.lerAba_, 'function');
    });
  });

  describe('Leitura da planilha', function () {

    it('mapeia as colunas pelo rótulo do cabeçalho', function () {
      Mock.instalar(montarPlanilha());
      var mapa = mapaColunas_(aba_('CIRURGIAS'), 1);
      igual(mapa['ID_CIRURGIA'], 1);
      igual(mapa['ANESTESISTA'], 15, 'coluna O');
      igual(mapa['ID_ANESTESISTA (auto)'], 16, 'coluna P');
      igual(mapa['ANO (auto)'], 30, 'coluna AD');
    });

    it('lê o cadastro completo dos 15 anestesistas', function () {
      Mock.instalar(montarPlanilha());
      var lista = lerAba_('ANESTESISTAS');
      igual(lista.length, 15);
      igual(lista[0].id, 'A01');
      igual(lista[0].nome, 'Roberta Almeida');
      igual(lista[14].id, 'A15');
    });

    it('lê a escala-base com as 30 linhas', function () {
      Mock.instalar(montarPlanilha());
      igual(lerAba_('ESCALA_BASE').length, 30);
    });

    it('ignora as linhas em branco pré-formatadas', function () {
      Mock.instalar(montarPlanilha());
      // A aba CIRURGIAS tem 501 linhas de capacidade e nenhum dado.
      igual(lerAba_('CIRURGIAS').length, 0);
    });

    it('sobrevive a uma coluna inserida no meio da planilha', function () {
      var abas = montarPlanilha();
      var sheet = abas['ANESTESISTAS'];

      // Simula alguém inserindo "APELIDO" entre NOME e ATIVO: os rótulos
      // mudam de posição, mas a leitura casa por nome.
      sheet.getRange(1, 1, 1, 7).setValues([[
        'ID_ANESTESISTA', 'NOME', 'APELIDO', 'ATIVO (Sim/Não)', 'TELEFONE', 'E-MAIL', 'OBSERVAÇÕES'
      ]]);
      sheet.getRange(2, 1, 1, 7).setValues([['A01', 'Roberta Almeida', 'Bete', 'Sim', '', '', '']]);

      Mock.instalar(abas);
      var lista = lerAba_('ANESTESISTAS');
      igual(lista[0].nome, 'Roberta Almeida');
      igual(lista[0].ativo, 'Sim', 'ATIVO foi lido da nova posição, não da antiga');
    });

    it('lê o estado completo e monta um store funcional', function () {
      Mock.instalar(montarPlanilha());
      var store = storeDaPlanilha_();
      igual(store.estado.anestesistas.length, 15);
      igual(store.estado.escalaBase.length, 30);
      igual(store.estado.consolidada.length, 395, 'a escala é recalculada na leitura');
    });
  });

  describe('Conversão de tipos entre core e planilha', function () {

    it('data: ISO no core, Date na planilha, sem deslocar o dia', function () {
      Mock.instalar(montarPlanilha());
      var celula = paraCelula_('2026-10-08', 'data');
      verdadeiro(celula instanceof Date, 'deveria virar Date');
      igual(celula.getFullYear(), 2026);
      igual(celula.getMonth() + 1, 10);
      igual(celula.getDate(), 8, 'o dia não pode deslocar por fuso');
      igual(normalizarValor_(celula, 'data'), '2026-10-08', 'e volta igual');
    });

    it('hora: HH:MM no core, valor de tempo na planilha', function () {
      Mock.instalar(montarPlanilha());
      var celula = paraCelula_('07:35', 'hora');
      verdadeiro(celula instanceof Date);
      igual(celula.getHours(), 7);
      igual(celula.getMinutes(), 35);
      igual(normalizarValor_(celula, 'hora'), '07:35');
    });

    it('duração: horas decimais no core, fração de dia na planilha', function () {
      Mock.instalar(montarPlanilha());
      igual(paraCelula_(6, 'duracao'), 0.25, '6h = um quarto de dia');
      igual(normalizarValor_(0.25, 'duracao'), 6);
      igual(normalizarValor_(paraCelula_(6.5, 'duracao'), 'duracao'), 6.5, 'ida e volta');
    });

    it('booleano vira o literal Sim/Não da planilha', function () {
      Mock.instalar(montarPlanilha());
      igual(paraCelula_(true, 'booleano'), 'Sim');
      igual(paraCelula_('nao', 'booleano'), 'Não');
      igual(normalizarValor_('SIM', 'booleano'), 'Sim');
    });

    it('vazio permanece vazio, e não vira zero', function () {
      Mock.instalar(montarPlanilha());
      igual(paraCelula_('', 'moeda'), '');
      igual(paraCelula_(null, 'data'), '');
      igual(normalizarValor_('', 'moeda'), null, 'moeda vazia é null, não 0');
    });

    it('moeda ida e volta preserva centavos', function () {
      Mock.instalar(montarPlanilha());
      igual(normalizarValor_(paraCelula_(1234.56, 'moeda'), 'moeda'), 1234.56);
    });
  });

  describe('Escrita na planilha', function () {

    it('escreve a escala mensal e relê igual ao que o core calculou', function () {
      Mock.instalar(montarPlanilha());
      var store = storeDaPlanilha_();
      var linhas = store.escalaDoMes(10);

      escreverAba_('ESCALA_MENSAL', linhas, {
        aba: core.cfgMesEscala(10).aba, limparAntes: true,
        apenasCampos: ['data', 'dia', 'posicao', 'calculado', 'idCalculado', 'efetivo']
      });

      var relido = lerAba_('ESCALA_MENSAL', core.cfgMesEscala(10).aba);
      igual(relido.length, 135);
      igual(relido[0].data, '2026-10-01');
      igual(relido[0].dia, 'QUINTA-FEIRA');
      igual(relido[0].posicao, 1);
      igual(relido[0].calculado, 'Fabrício Tavares');
      igual(relido[0].idCalculado, 'A06');
    });

    it('escreve a consolidada com as duas chaves compostas', function () {
      Mock.instalar(montarPlanilha());
      var store = storeDaPlanilha_();

      escreverAba_('ESCALA_CONSOLIDADA', store.estado.consolidada, { limparAntes: true });

      var relido = lerAba_('ESCALA_CONSOLIDADA');
      igual(relido.length, 395);
      igual(relido[0].chavePosicao, '2026-10-01|1');
      igual(relido[0].chaveNome, '2026-10-01|Fabrício Tavares');
    });

    it('apenasCampos não pisa nas colunas que o usuário digita', function () {
      Mock.instalar(montarPlanilha());
      var store = storeDaPlanilha_();
      var aba = core.cfgMesEscala(10).aba;

      escreverAba_('ESCALA_MENSAL', store.escalaDoMes(10), {
        aba: aba, limparAntes: true,
        apenasCampos: ['data', 'dia', 'posicao', 'calculado', 'idCalculado', 'efetivo']
      });

      // Usuário registra um ajuste manual direto na planilha.
      var sheet = aba_(aba);
      var mapa = mapaColunas_(sheet, 1);
      sheet.getRange(2, mapa['AJUSTE MANUAL? (Sim/Não)']).setValue('Sim');
      sheet.getRange(2, mapa['ANESTESISTA SUBSTITUTO (se ajuste)']).setValue('Alene Cunha');
      sheet.getRange(2, mapa['MOTIVO DO AJUSTE']).setValue('Congresso');

      // Recalcula e reescreve — o ajuste tem de sobreviver.
      var store2 = storeDaPlanilha_();
      escreverAba_('ESCALA_MENSAL', store2.escalaDoMes(10), {
        aba: aba, limparAntes: true,
        apenasCampos: ['data', 'dia', 'posicao', 'calculado', 'idCalculado', 'efetivo']
      });

      var relido = lerAba_('ESCALA_MENSAL', aba);
      igual(relido[0].ajuste, 'Sim', 'o ajuste do usuário não foi apagado');
      igual(relido[0].substituto, 'Alene Cunha');
      igual(relido[0].motivo, 'Congresso');
      igual(relido[0].calculado, 'Fabrício Tavares', 'e o calculado continua correto');
    });

    it('acrescenta no LOG sem apagar o que já havia', function () {
      Mock.instalar(montarPlanilha());

      registrarLog_([core.novaEntradaLog({
        usuario: 'a', aba: 'CIRURGIAS', idCirurgia: 'CIR0001',
        campo: 'STATUS', de: 'Agendada', para: 'Realizada'
      })]);
      registrarLog_([core.novaEntradaLog({
        usuario: 'b', aba: 'CIRURGIAS', idCirurgia: 'CIR0002',
        campo: 'PAGO?', de: 'Não', para: 'Sim'
      })]);

      var log = lerAba_('LOG');
      igual(log.length, 2);
      igual(log[0].idCirurgia, 'CIR0001');
      igual(log[1].idCirurgia, 'CIR0002');
    });

    it('a primeira linha vazia respeita as linhas pré-formatadas', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({ id: 'CIR0001', paciente: 'A' })]
      }));
      var sheet = aba_('CIRURGIAS');
      igual(primeiraLinhaVazia_(sheet, 'CIRURGIAS'), 3, 'logo após a única linha com dado');
    });
  });

  describe('TASK-201 e TASK-303 — listas suspensas instaladas', function () {

    it('cria o intervalo nomeado dos anestesistas', function () {
      var ctrl = Mock.instalar(montarPlanilha());
      criarFaixaDeNomes_();
      verdadeiro(ctrl.planilha.getRangeByName('NOMES_ANESTESISTAS'), 'intervalo deveria existir');
    });

    it('TASK-201 — aplica a lista em CIRURGIAS!ANESTESISTA', function () {
      Mock.instalar(montarPlanilha());
      criarFaixaDeNomes_();
      aplicarValidacoes_();

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      var regra = sheet.getRange(2, mapa['ANESTESISTA']).getDataValidation();

      verdadeiro(regra, 'a coluna ANESTESISTA deveria ter validação');
      igual(regra._tipo, 'faixa', 'aponta para o intervalo do cadastro');
      falso(regra._permiteInvalido, 'não deve aceitar nome fora da lista');
    });

    it('TASK-303 — aplica a lista em AVALIAÇÕES PRÉ!ANESTESISTA DA AVALIAÇÃO', function () {
      Mock.instalar(montarPlanilha());
      criarFaixaDeNomes_();
      aplicarValidacoes_();

      var sheet = aba_('AVALIAÇÕES PRÉ');
      var mapa = mapaColunas_(sheet, 1);
      var regra = sheet.getRange(2, mapa['ANESTESISTA DA AVALIAÇÃO']).getDataValidation();

      verdadeiro(regra, 'a coluna deveria ter validação');
      igual(regra._tipo, 'faixa');
      falso(regra._permiteInvalido);
    });

    it('as listas de STATUS e CONVÊNIO usam os literais do core', function () {
      Mock.instalar(montarPlanilha());
      criarFaixaDeNomes_();
      aplicarValidacoes_();

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);

      var rStatus = sheet.getRange(2, mapa['STATUS']).getDataValidation();
      igual(rStatus._valores.join(','), core.DOMINIOS.STATUS_CIRURGIA.join(','));

      var rConv = sheet.getRange(2, mapa['CONVÊNIO']).getDataValidation();
      igual(rConv._valores.join(','), core.DOMINIOS.CONVENIO.join(','));
    });

    it('a coluna de substituto das escalas também vira lista', function () {
      Mock.instalar(montarPlanilha());
      criarFaixaDeNomes_();
      aplicarValidacoes_();

      var aba = core.cfgMesEscala(11).aba;
      var sheet = aba_(aba);
      var mapa = mapaColunas_(sheet, 1);
      var regra = sheet.getRange(2, mapa['ANESTESISTA SUBSTITUTO (se ajuste)']).getDataValidation();
      verdadeiro(regra);
      igual(regra._tipo, 'faixa');
    });

    it('reinstalar não duplica nem quebra nada', function () {
      var ctrl = Mock.instalar(montarPlanilha());
      criarFaixaDeNomes_();
      aplicarValidacoes_();
      criarFaixaDeNomes_();
      aplicarValidacoes_();

      igual(ctrl.planilha.getNamedRanges().length, 1, 'um único intervalo nomeado');
    });
  });

  describe('TASK-202 e TASK-203 — fórmulas escritas', function () {

    it('escreve a fórmula de ID_ANESTESISTA (auto) com XLOOKUP no cadastro', function () {
      Mock.instalar(montarPlanilha());
      escreverFormulasCirurgias_();

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      var f = sheet.getRange(2, mapa['ID_ANESTESISTA (auto)']).getFormula();

      verdadeiro(/XLOOKUP/.test(f), 'fórmula: ' + f);
      verdadeiro(/ANESTESISTAS!\$B:\$B/.test(f), 'busca pelo NOME');
      verdadeiro(/ANESTESISTAS!\$A:\$A/.test(f), 'devolve o ID');
      verdadeiro(/\$O2/.test(f), 'referencia a coluna ANESTESISTA da própria linha');
    });

    it('escreve a fórmula de POSIÇÃO NO RODÍZIO com a chave DATA+ANESTESISTA', function () {
      Mock.instalar(montarPlanilha());
      escreverFormulasCirurgias_();

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      var f = sheet.getRange(2, mapa['POSIÇÃO DO ANESTESISTA NO RODÍZIO']).getFormula();

      verdadeiro(/TEXT\(\$C2,"YYYY-MM-DD"\)&"\|"&\$O2/.test(f), 'monta a chave certa: ' + f);
      verdadeiro(/ESCALA_CONSOLIDADA!\$G:\$G/.test(f), 'busca na coluna da chave');
      verdadeiro(/ESCALA_CONSOLIDADA!\$C:\$C/.test(f), 'devolve a POSIÇÃO');
      verdadeiro(f.indexOf(core.CONFIG.FORA_DA_ESCALA) >= 0, 'usa a sentinela da planilha');
    });

    it('a fórmula de TEMPO REAL usa MOD, tratando a virada de meia-noite', function () {
      Mock.instalar(montarPlanilha());
      escreverFormulasCirurgias_();

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      var f = sheet.getRange(2, mapa['TEMPO REAL']).getFormula();
      igual(f, '=IF(OR($G2="",$H2=""),"",MOD($H2-$G2,1))');
    });

    it('a fórmula de escalados no dia cobre as 5 posições', function () {
      Mock.instalar(montarPlanilha());
      escreverFormulasCirurgias_();

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      var f = sheet.getRange(2, mapa['ANESTESISTAS ESCALADOS NO DIA (auto)']).getFormula();

      verdadeiro(/TEXTJOIN\(" \| ",TRUE/.test(f), 'junta com " | "');
      for (var p = 1; p <= 5; p++) {
        verdadeiro(f.indexOf('&"|"&' + p + ',') >= 0, 'inclui a posição ' + p);
      }
    });

    it('TASK-302 — escreve as quatro fórmulas espelhadas das avaliações', function () {
      Mock.instalar(montarPlanilha());
      escreverFormulasAvaliacoes_();

      var sheet = aba_('AVALIAÇÕES PRÉ');
      var mapa = mapaColunas_(sheet, 1);

      verdadeiro(/CIRURGIAS!\$J:\$J/.test(sheet.getRange(2, mapa['PACIENTE (auto)']).getFormula()),
        'PACIENTE vem da coluna J de CIRURGIAS');
      verdadeiro(/CIRURGIAS!\$C:\$C/.test(sheet.getRange(2, mapa['DATA DA CIRURGIA (auto)']).getFormula()),
        'DATA vem da coluna C');
      verdadeiro(/CIRURGIAS!\$M:\$M/.test(sheet.getRange(2, mapa['NOME DA CIRURGIA (auto)']).getFormula()),
        'PROCEDIMENTO vem da coluna M');
      verdadeiro(/CIRURGIAS!\$O:\$O/.test(sheet.getRange(2, mapa['ANESTESISTA DA CIRURGIA (auto)']).getFormula()),
        'ANESTESISTA vem da coluna O');
    });

    it('a fórmula de competência da avaliação prefere a data da avaliação', function () {
      Mock.instalar(montarPlanilha());
      escreverFormulasAvaliacoes_();
      var sheet = aba_('AVALIAÇÕES PRÉ');
      var mapa = mapaColunas_(sheet, 1);
      igual(sheet.getRange(2, mapa['MÊS (auto)']).getFormula(),
        '=IF($H2<>"",MONTH($H2),IF($D2<>"",MONTH($D2),""))');
    });
  });

  describe('Correção dos dois erros de fórmula da aba INDICADORES', function () {

    it('corrige B14 (pendente = total - recebido)', function () {
      var abas = montarPlanilha();
      abas['INDICADORES'].getRange('B14').setFormula('=B11-B12');   // o erro original
      Mock.instalar(abas);

      var msg = corrigirFormulasIndicadores_();
      igual(aba_('INDICADORES').getRange('B14').getFormula(), '=B12-B13');
      verdadeiro(/B14/.test(msg), 'o relatório menciona a correção');
    });

    it('corrige B18 (total recebido = recebido + recebido)', function () {
      var abas = montarPlanilha();
      abas['INDICADORES'].getRange('B18').setFormula('=B12+B16');   // o erro original
      Mock.instalar(abas);

      corrigirFormulasIndicadores_();
      igual(aba_('INDICADORES').getRange('B18').getFormula(), '=B13+B16');
    });

    it('não mexe se as fórmulas já estiverem certas', function () {
      var abas = montarPlanilha();
      abas['INDICADORES'].getRange('B14').setFormula('=B12-B13');
      abas['INDICADORES'].getRange('B18').setFormula('=B13+B16');
      Mock.instalar(abas);

      var msg = corrigirFormulasIndicadores_();
      verdadeiro(/já estavam corretas/.test(msg), msg);
    });
  });

  describe('Decisões do grupo levadas à planilha (sem apagar nada)', function () {

    it('cria o cabeçalho CHAVE PIX no cadastro, uma vez só', function () {
      var abas = montarPlanilha();
      Mock.instalar(abas);
      alinharDecisoesDoGrupo_();
      var mapa = mapaColunas_(aba_('ANESTESISTAS'), 1);
      verdadeiro(!!mapa['CHAVE PIX']);
      var msg = alinharDecisoesDoGrupo_();
      falso(/CHAVE PIX criada/.test(msg), 'segunda instalação não duplica');
    });

    it('cria também o cabeçalho CRM (assinatura do boletim), uma vez só', function () {
      var abas = montarPlanilha();
      Mock.instalar(abas);
      var msg = alinharDecisoesDoGrupo_();
      verdadeiro(/CRM criada/.test(msg), msg);
      var mapa = mapaColunas_(aba_('ANESTESISTAS'), 1);
      verdadeiro(mapa['CRM'] > mapa['CHAVE PIX'], 'depois da CHAVE PIX');
      falso(/CRM criada/.test(alinharDecisoesDoGrupo_()), 'segunda instalação não duplica');
    });

    it('oculta os valores por anestesista e mantém contagens e horas', function () {
      var abas = montarPlanilha();
      Mock.instalar(abas);
      alinharDecisoesDoGrupo_();
      var ind = aba_('INDICADORES');
      verdadeiro(ind.isRowHiddenByUser(12), 'VALOR TOTAL EM ANESTESIAS');
      verdadeiro(ind.isRowHiddenByUser(18), 'TOTAL RECEBIDO');
      falso(ind.isRowHiddenByUser(8), 'NÚMERO DE CIRURGIAS continua');
      falso(ind.isRowHiddenByUser(19), 'quantidade de notas continua');
      verdadeiro(ind.isColumnHiddenByUser(5) && ind.isColumnHiddenByUser(8), 'E a H ocultas');
      falso(ind.isColumnHiddenByUser(3), 'HORAS REAIS continua');
    });

    it('a planilha lida depois continua com o PIX gravado pelo sistema', function () {
      var abas = montarPlanilha();
      Mock.instalar(abas);
      alinharDecisoesDoGrupo_();
      var col = mapaColunas_(aba_('ANESTESISTAS'), 1)['CHAVE PIX'];
      aba_('ANESTESISTAS').getRange(2, col).setValue('roberta@exemplo.com');
      igual(lerAba_('ANESTESISTAS')[0].pix, 'roberta@exemplo.com');
    });
  });

  describe('TASK-301 — gatilho cria a linha da avaliação', function () {

    /** Dispara o gatilho como o Apps Script faria. */
    function editar(sheet, linha, coluna, valor, valorAntigo) {
      sheet.getRange(linha, coluna).setValue(valor);
      aoEditar({
        range: sheet.getRange(linha, coluna),
        value: valor,
        oldValue: valorAntigo,
        source: SpreadsheetApp.getActiveSpreadsheet()
      });
    }

    it('cria a avaliação ao marcar "Sim"', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Agendada', paciente: 'Maria Souza',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não'
        })]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      igual(lerAba_('AVALIACOES_PRE').length, 0);

      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Sim', 'Não');

      var avals = lerAba_('AVALIACOES_PRE');
      igual(avals.length, 1);
      igual(avals[0].idCirurgia, 'CIR0001');
      igual(avals[0].id, 'AVP0001');
      igual(avals[0].realizada, 'Não');
      igual(avals[0].anestesista, 'Fabrício Tavares', 'sugere quem operou');
    });

    it('é idempotente: marcar "Sim" de novo não cria segunda linha', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Agendada', paciente: 'Maria Souza',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não'
        })]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);

      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Sim', 'Não');
      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Sim', 'Sim');
      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Sim', 'Sim');

      igual(lerAba_('AVALIACOES_PRE').length, 1, 'uma única avaliação');
    });

    it('desmarcar NÃO apaga a avaliação já criada', function () {
      var ctrl = Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Agendada', paciente: 'Maria Souza',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não'
        })]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);

      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Sim', 'Não');
      igual(lerAba_('AVALIACOES_PRE').length, 1);

      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Não', 'Sim');
      igual(lerAba_('AVALIACOES_PRE').length, 1, 'dado clínico não se descarta sozinho');
      verdadeiro(ctrl.toasts.some(function (t) { return /mantida/i.test(t.titulo); }),
        'deveria avisar que a linha foi preservada');
    });

    it('não cria avaliação para cirurgia cancelada', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Cancelada', paciente: 'Maria Souza',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não'
        })]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Sim', 'Não');

      igual(lerAba_('AVALIACOES_PRE').length, 0);
    });

    it('gera IDs sequenciais para várias cirurgias', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [
          linhaCirurgia({ id: 'CIR0001', status: 'Agendada', paciente: 'A', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não' }),
          linhaCirurgia({ id: 'CIR0002', status: 'Agendada', paciente: 'B', anestesista: 'Alene Cunha', avaliacaoNec: 'Não' }),
          linhaCirurgia({ id: 'CIR0003', status: 'Agendada', paciente: 'C', anestesista: 'Brunna Cintra', avaliacaoNec: 'Não' })
        ]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      var col = mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'];

      editar(sheet, 2, col, 'Sim', 'Não');
      editar(sheet, 3, col, 'Sim', 'Não');
      editar(sheet, 4, col, 'Sim', 'Não');

      var avals = lerAba_('AVALIACOES_PRE');
      igual(avals.length, 3);
      igual(avals.map(function (a) { return a.id; }).join(','), 'AVP0001,AVP0002,AVP0003');
      igual(avals.map(function (a) { return a.idCirurgia; }).join(','), 'CIR0001,CIR0002,CIR0003');
    });

    it('gera o ID_CIRURGIA quando a linha começa a ser preenchida sem ID', function () {
      Mock.instalar(montarPlanilha());
      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);

      editar(sheet, 2, mapa['NOME DO PACIENTE'], 'Paciente Novo', '');
      igual(txt(sheet.getRange(2, mapa['ID_CIRURGIA']).getValue()), 'CIR0001');
    });

    it('registra no LOG a criação automática', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Agendada', paciente: 'Maria',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não'
        })]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      editar(sheet, 2, mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'], 'Sim', 'Não');

      var log = lerAba_('LOG');
      verdadeiro(log.some(function (l) { return /AVALIAÇÃO CRIADA AUTOMATICAMENTE/.test(l.campo); }),
        'campos no log: ' + log.map(function (l) { return l.campo; }).join(' | '));
    });

    it('registra no LOG a alteração de campo crítico', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Agendada', paciente: 'Maria',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não', valor: 1000
        })]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      editar(sheet, 2, mapa['VALOR DA ANESTESIA'], 2500, 1000);

      var log = lerAba_('LOG');
      var entrada = log.filter(function (l) { return l.campo === 'VALOR DA ANESTESIA'; })[0];
      verdadeiro(entrada, 'deveria registrar a mudança de valor');
      igual(entrada.de, '1000');
      igual(entrada.para, '2500');
      igual(entrada.idCirurgia, 'CIR0001');
    });

    it('NÃO registra campo não crítico', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Agendada', paciente: 'Maria',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não'
        })]
      }));

      var sheet = aba_('CIRURGIAS');
      var mapa = mapaColunas_(sheet, 1);
      editar(sheet, 2, mapa['OBSERVAÇÕES'], 'anotação qualquer', '');

      igual(lerAba_('LOG').filter(function (l) {
        return l.campo === 'OBSERVAÇÕES';
      }).length, 0);
    });

    it('uma edição em aba irrelevante não faz nada', function () {
      Mock.instalar(montarPlanilha());
      var sheet = aba_('ESCALA_CONSOLIDADA');

      // Não deve lançar nem escrever nada.
      aoEditar({
        range: sheet.getRange(2, 1), value: 'x', oldValue: '',
        source: SpreadsheetApp.getActiveSpreadsheet()
      });

      igual(lerAba_('LOG').length, 0);
    });

    it('erro interno no gatilho não interrompe a digitação', function () {
      Mock.instalar(montarPlanilha());
      // Um evento malformado não deve lançar para fora.
      aoEditar({ range: null });
      aoEditar(undefined);
      verdadeiro(true, 'chegou até aqui sem lançar');
    });
  });

  describe('Ações do menu', function () {

    it('recalcularEscala preenche as três abas e a consolidada', function () {
      var ctrl = Mock.instalar(montarPlanilha());
      recalcularEscala();

      igual(lerAba_('ESCALA_MENSAL', core.cfgMesEscala(10).aba).length, 135);
      igual(lerAba_('ESCALA_MENSAL', core.cfgMesEscala(11).aba).length, 125);
      igual(lerAba_('ESCALA_MENSAL', core.cfgMesEscala(12).aba).length, 135);
      igual(lerAba_('ESCALA_CONSOLIDADA').length, 395);
      verdadeiro(ctrl.alertas.some(function (a) { return /recalculada/i.test(a.titulo); }));
    });

    it('criarAvaliacoesPendentes cobre linhas colhidas em lote', function () {
      var ctrl = Mock.instalar(montarPlanilha({
        cirurgias: [
          linhaCirurgia({ id: 'CIR0001', status: 'Realizada', paciente: 'A', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Sim' }),
          linhaCirurgia({ id: 'CIR0002', status: 'Realizada', paciente: 'B', anestesista: 'Alene Cunha', avaliacaoNec: 'Sim' }),
          linhaCirurgia({ id: 'CIR0003', status: 'Cancelada', paciente: 'C', anestesista: 'Brunna Cintra', avaliacaoNec: 'Sim' })
        ]
      }));

      ctrl.respostaConfirmacao = true;
      criarAvaliacoesPendentes();

      var avals = lerAba_('AVALIACOES_PRE');
      igual(avals.length, 2, 'a cancelada não gera avaliação');
      igual(avals.map(function (a) { return a.idCirurgia; }).sort().join(','), 'CIR0001,CIR0002');
    });

    it('criarAvaliacoesPendentes avisa quando não há nada pendente', function () {
      var ctrl = Mock.instalar(montarPlanilha());
      criarAvaliacoesPendentes();
      verdadeiro(ctrl.alertas.some(function (a) { return /Nada pendente/i.test(a.titulo); }));
    });

    it('verificarIntegridadePlanilha roda o mesmo motor do core', function () {
      var ctrl = Mock.instalar(montarPlanilha());
      verificarIntegridadePlanilha();
      verdadeiro(ctrl.alertas.length >= 1);
      verdadeiro(/consistente/i.test(ctrl.alertas[0].titulo), ctrl.alertas[0].titulo);
    });

    it('avaliacoesFaltandoNaPlanilha_ olha as células, não o estado recalculado', function () {
      Mock.instalar(montarPlanilha({
        cirurgias: [
          linhaCirurgia({ id: 'CIR0001', status: 'Realizada', paciente: 'A', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Sim' }),
          linhaCirurgia({ id: 'CIR0002', status: 'Realizada', paciente: 'B', anestesista: 'Alene Cunha', avaliacaoNec: 'Não' })
        ]
      }));

      // O store, ao recalcular, cria a avaliação EM MEMÓRIA.
      igual(storeDaPlanilha_().estado.avaliacoes.length, 1, 'o modelo se autocorrige');
      // A planilha, porém, continua sem a linha — é isso que precisa aparecer.
      igual(lerAba_('AVALIACOES_PRE').length, 0, 'a célula segue vazia');

      var faltando = avaliacoesFaltandoNaPlanilha_();
      igual(faltando.length, 1);
      igual(faltando[0].id, 'CIR0001');
    });

    it('a integridade acusa a linha de avaliação ausente na planilha', function () {
      var ctrl = Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Realizada', paciente: 'A',
          anestesista: 'Fabrício Tavares', avaliacaoNec: 'Sim'
        })]
      }));

      verificarIntegridadePlanilha();
      var alerta = ctrl.alertas[ctrl.alertas.length - 1];
      verdadeiro(/erros de integridade/i.test(alerta.titulo), alerta.titulo);
      verdadeiro(/não tem linha na planilha/.test(alerta.msg), alerta.msg);
    });

    it('listarPendenciasDeHorario encontra a cirurgia realizada sem horário real', function () {
      var ctrl = Mock.instalar(montarPlanilha({
        cirurgias: [linhaCirurgia({
          id: 'CIR0001', status: 'Realizada', data: new Date(2026, 9, 1),
          inicioPrev: new Date(1899, 11, 30, 7, 0), fimPrev: new Date(1899, 11, 30, 13, 0),
          paciente: 'Sem Hora', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não'
        })]
      }));

      listarPendenciasDeHorario();
      var alerta = ctrl.alertas[ctrl.alertas.length - 1];
      verdadeiro(/1 cirurgia\(s\) sem horário real/.test(alerta.titulo), alerta.titulo);
      verdadeiro(/CIR0001/.test(alerta.msg));
      verdadeiro(/6h/.test(alerta.msg), 'informa o tempo estimado adotado: ' + alerta.msg);
    });

    it('o menu é criado sem erro', function () {
      Mock.instalar(montarPlanilha());
      onOpen();
      verdadeiro(true);
    });
  });
};
