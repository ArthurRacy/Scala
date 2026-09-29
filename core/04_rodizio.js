/**
 * ============================================================================
 * 04_RODIZIO — ESCALA_BASE -> escalas mensais -> ESCALA_CONSOLIDADA
 * ============================================================================
 * COMO O RODÍZIO REALMENTE FUNCIONA (regra extraída da planilha e conferida
 * linha por linha contra as 395 linhas já existentes nas três escalas mensais):
 *
 * A ESCALA_BASE tem 30 linhas = 6 dias da semana (segunda a sábado) x 5
 * posições. Para cada dia da semana ela define um elenco de 5 anestesistas e a
 * POSIÇÃO INICIAL de cada um — é isso que o rótulo "ORDEM ALFABÉTICA (posição
 * inicial)" quer dizer. A cada semana o elenco GIRA uma casa dentro do próprio
 * dia da semana:
 *
 *     anestesista(data, posição) = ESCALA_BASE[dia][((posição - 1 + k) mod 5) + 1]
 *
 * `k` é a k-ésima ocorrência daquele dia da semana desde CONFIG.ANCORA_RODIZIO.
 * O contador é POR DIA DA SEMANA: a primeira segunda do horizonte (05/10/2026)
 * é k=0 mesmo estando na 2ª semana do calendário, porque não existe segunda
 * anterior dentro do horizonte. A cada 5 semanas o ciclo fecha e volta à
 * ordem-base.
 *
 * Conferência: 01/10/2026 (1ª quinta, k=0) traz o elenco de QUINTA na ordem
 * base — Fabrício / Heloísa / Marcus / Maria Fernanda / Priscilla. Já
 * 08/10/2026 (2ª quinta, k=1) começa em Heloísa, deslocado uma casa.
 *
 * Em cima disso vem o ajuste manual, idêntico à fórmula da coluna H:
 *     ANESTESISTA EFETIVO = SE(AJUSTE MANUAL?="Sim"; SUBSTITUTO; CALCULADO)
 *
 * A ESCALA_CONSOLIDADA é a união das três escalas mensais, com as duas chaves
 * compostas que a aba CIRURGIAS usa nos XLOOKUP.
 * ============================================================================
 */

/**
 * Indexa a ESCALA_BASE por dia da semana e posição.
 * Entrada: [{dia, posicao, nome, id}] — 30 linhas, com o dia repetido só na
 * primeira das 5 (igual à planilha, que deixa as outras 4 em branco).
 * Saída: { 'QUINTA-FEIRA': { 1: {nome, id}, ... 5: {...} }, ... }
 */
function indexarEscalaBase(linhas) {
  var idx = {};
  var diaCorrente = '';

  (linhas || []).forEach(function (l) {
    // A planilha só escreve o dia na primeira linha do bloco; herdamos o
    // último dia visto para as linhas seguintes.
    var dia = txt(l.dia) || diaCorrente;
    if (!dia) return;
    diaCorrente = dia;

    var pos = Number(l.posicao);
    if (!pos) return;

    if (!idx[dia]) idx[dia] = {};
    idx[dia][pos] = { nome: txt(l.nome), id: txt(l.id) };
  });

  return idx;
}

/**
 * Dias da semana em que cada anestesista é FIXO na escala-base.
 * O rodízio gira a posição dentro do dia, mas o elenco de cada dia não muda —
 * por isso o dia é a informação estável de "quando fulano trabalha".
 * Saída: { nomeNormalizado: ['SEGUNDA-FEIRA', 'QUINTA-FEIRA'] }, na ordem
 * da semana e sem repetição.
 */
function diasFixosPorAnestesista(linhasEscalaBase) {
  var idx = indexarEscalaBase(linhasEscalaBase);
  var mapa = {};

  DOMINIOS.DIA_SEMANA_ESCALA.forEach(function (dia) {
    var bloco = idx[dia] || {};
    Object.keys(bloco).forEach(function (pos) {
      var nome = bloco[pos].nome;
      if (vazio(nome)) return;
      var k = normalizar(nome);
      if (!mapa[k]) mapa[k] = [];
      if (mapa[k].indexOf(dia) < 0) mapa[k].push(dia);
    });
  });

  return mapa;
}

/**
 * Monta a ESCALA_BASE sozinha, a partir do cadastro.
 *
 * Ordena os anestesistas ATIVOS em ordem alfabética e distribui em blocos
 * consecutivos de 5 pelos dias da semana:
 *
 *     SEGUNDA = 1º ao 5º    QUINTA = 1º ao 5º
 *     TERÇA   = 6º ao 10º   SEXTA  = 6º ao 10º
 *     QUARTA  = 11º ao 15º  SÁBADO = 11º ao 15º
 *
 * Com os 15 do grupo a fila fecha certinho: cada um cai em 2 dias por semana.
 * O giro semanal continua por cima disso — o que esta função define é só a
 * POSIÇÃO INICIAL de cada um, que é exatamente o que a ESCALA_BASE significa.
 *
 * Com outro tamanho de grupo a fila dá a volta e alguém repete de dia, mas
 * nunca dentro do mesmo dia: 5 vagas consecutivas de uma lista de n>=5 são
 * sempre pessoas diferentes.
 *
 * Devolve as 30 linhas no formato da planilha (dia só na primeira das 5).
 */
function gerarEscalaBaseAlfabetica(anestesistas) {
  var ativos = (anestesistas || []).filter(function (a) {
    return a && !vazio(a.nome) && ehSim(a.ativo);
  });

  ativos.sort(function (a, b) {
    var na = normalizar(a.nome), nb = normalizar(b.nome);
    return na < nb ? -1 : (na > nb ? 1 : 0);
  });

  var n = ativos.length;
  // Menos gente que posições: não dá para montar um dia sem repetir ninguém,
  // e repetir deixaria a chave DATA+ANESTESISTA ambígua. Melhor não montar.
  if (n < CONFIG.POSICOES.length) return [];

  var linhas = [];
  var vaga = 0;

  CONFIG.DIAS_ESCALA.forEach(function (dia) {
    CONFIG.POSICOES.forEach(function (pos, i) {
      var a = ativos[vaga % n];
      vaga++;
      linhas.push({
        dia: i === 0 ? dia : '',
        posicao: pos,
        nome: txt(a.nome),
        id: txt(a.id)
      });
    });
  });

  return linhas;
}

/**
 * Confere se a ESCALA_BASE está completa e coerente.
 * Devolve um relatório (erros bloqueiam a geração da escala).
 */
function validarEscalaBase(linhas, anestesistas) {
  var r = novoRelatorio();
  var idx = indexarEscalaBase(linhas);
  var nomes = (anestesistas || []).map(function (a) { return txt(a.nome); });
  var inativos = (anestesistas || []).filter(function (a) { return !ehSim(a.ativo); })
    .map(function (a) { return txt(a.nome); });

  DOMINIOS.DIA_SEMANA_ESCALA.forEach(function (dia) {
    var bloco = idx[dia];
    if (!bloco) { r.erro('dia', 'ESCALA_BASE sem nenhuma linha para ' + dia + '.'); return; }

    CONFIG.POSICOES.forEach(function (pos) {
      var item = bloco[pos];
      if (!item || vazio(item.nome)) {
        r.erro('dia', 'ESCALA_BASE: ' + dia + ' posição ' + pos + ' está vazia.');
        return;
      }
      if (nomes.length && !nomes.some(function (n) { return mesmoTexto(n, item.nome); })) {
        r.erro('nome', 'ESCALA_BASE: "' + item.nome + '" (' + dia + ' pos ' + pos + ') não está no cadastro de ANESTESISTAS.');
      } else if (inativos.some(function (n) { return mesmoTexto(n, item.nome); })) {
        r.aviso('nome', 'ESCALA_BASE: "' + item.nome + '" está INATIVO no cadastro, mas continua escalado(a) em ' +
          dia + ' (posição ' + pos + ') — troque na escala-base ou registre substituições.');
      }
    });

    // O mesmo anestesista duas vezes no mesmo dia deixaria a chave
    // DATA+ANESTESISTA ambígua nos XLOOKUP da planilha.
    var vistos = {};
    CONFIG.POSICOES.forEach(function (pos) {
      var item = bloco[pos];
      if (!item || vazio(item.nome)) return;
      var k = normalizar(item.nome);
      if (vistos[k]) {
        r.erro('nome', 'ESCALA_BASE: "' + item.nome + '" aparece duas vezes em ' + dia +
          ' (posições ' + vistos[k] + ' e ' + pos + ') — a chave DATA+ANESTESISTA ficaria ambígua.');
      } else {
        vistos[k] = pos;
      }
    });
  });

  return r;
}

/**
 * Quantas vezes aquele dia da semana já ocorreu desde a âncora do rodízio,
 * contando a própria data como ocorrência 0.
 *   giroDaData('2026-10-01') -> 0   (1ª quinta)
 *   giroDaData('2026-10-08') -> 1   (2ª quinta)
 *   giroDaData('2026-10-05') -> 0   (1ª segunda do horizonte)
 * Datas anteriores à âncora giram para trás (resultado sempre em 0..4).
 */
function giroDaData(iso, ancora) {
  var dia = diaDaSemana(iso);
  if (!dia || dia === CONFIG.DIA_SEM_ESCALA) return 0;

  var primeira = primeiraOcorrencia(ancora || CONFIG.ANCORA_RODIZIO, dia);
  if (!primeira) return 0;

  var semanas = Math.floor(diasEntre(primeira, iso) / 7) * CONFIG.PASSO_SEMANAL;
  var n = CONFIG.POSICOES.length;
  return ((semanas % n) + n) % n;   // sempre 0..n-1, mesmo para datas passadas
}

/**
 * Quem ocupa a `posicao` numa `data`, segundo a ESCALA_BASE já girada.
 * `idx` é o retorno de indexarEscalaBase().
 */
function anestesistaDoRodizio(idx, iso, posicao, ancora) {
  var dia = diaDaSemana(iso);
  var bloco = idx[dia];
  if (!bloco) return { nome: '', id: '' };

  var n = CONFIG.POSICOES.length;
  var k = giroDaData(iso, ancora);
  var posBase = ((Number(posicao) - 1 + k) % n) + 1;
  return bloco[posBase] || { nome: '', id: '' };
}

/**
 * Projeta a ESCALA_BASE sobre um mês, gerando as linhas da aba mensal.
 *
 * `ajustes` é um mapa de ajustes manuais já existentes, indexado por
 * 'YYYY-MM-DD|posicao', no formato { ajuste:'Sim', substituto:'Nome', motivo:'...' }.
 * Passar os ajustes preserva o histórico: a regeneração da escala nunca apaga
 * uma substituição já registrada.
 */
function gerarEscalaMensal(ano, mes, escalaBase, ajustes, anestesistas, ancora) {
  var idx = indexarEscalaBase(escalaBase);
  var mapaAjustes = ajustes || {};
  var porNome = indexarAnestesistasPorNome(anestesistas);
  var linhas = [];

  datasUteisDoMes(ano, mes).forEach(function (iso) {
    var dia = diaDaSemana(iso);

    // Sem elenco na ESCALA_BASE para este dia da semana, não há escala a
    // projetar. Gerar 5 linhas vazias só encheria a aba de ruído — e é o que
    // acontece num sistema novo, antes de a ESCALA_BASE ser preenchida.
    if (!idx[dia]) return;

    CONFIG.POSICOES.forEach(function (pos) {
      var base = anestesistaDoRodizio(idx, iso, pos, ancora);
      var chave = chaveDataPosicao(iso, pos);
      var aj = mapaAjustes[chave] || {};

      var ehAjuste = ehSim(aj.ajuste);
      var substituto = txt(aj.substituto);
      var efetivo = (ehAjuste && substituto) ? substituto : base.nome;

      linhas.push({
        data: iso,
        dia: dia,
        posicao: pos,
        calculado: base.nome,
        idCalculado: base.id || (porNome[normalizar(base.nome)] || {}).id || '',
        ajuste: ehAjuste ? 'Sim' : 'Não',
        substituto: substituto,
        efetivo: efetivo,
        motivo: txt(aj.motivo)
      });
    });
  });

  return linhas;
}

/**
 * Aplica a fórmula da coluna H sobre uma linha já existente da escala mensal.
 * Usado quando o usuário marca/desmarca o ajuste na interface.
 */
function recalcularEfetivo(linha) {
  var ehAjuste = ehSim(linha.ajuste);
  var substituto = txt(linha.substituto);
  linha.efetivo = (ehAjuste && substituto) ? substituto : txt(linha.calculado);
  return linha;
}

/** Mapa nome-normalizado -> anestesista, para resolver ID a partir do nome. */
function indexarAnestesistasPorNome(anestesistas) {
  var m = {};
  (anestesistas || []).forEach(function (a) {
    var k = normalizar(a.nome);
    if (k) m[k] = a;
  });
  return m;
}

/**
 * Monta a ESCALA_CONSOLIDADA a partir das escalas mensais.
 * `escalasPorMes` = { '2026-10': [linhas...], '2026-11': [...], ... }
 * `meses` = horizonte (lista de infoMes), na ordem em que a consolidada sai.
 * Sem `meses`, usa os meses da planilha e aceita também a chave antiga só
 * com o número do mês ({ 10: [...] }) — é como os testes e o Apps Script
 * antigo montavam o mapa.
 */
function gerarConsolidada(escalasPorMes, anestesistas, meses) {
  var porNome = indexarAnestesistasPorNome(anestesistas);
  var legado = !meses;
  var out = [];

  (meses || horizontePlanilha()).forEach(function (m) {
    var mapa = escalasPorMes || {};
    var linhas = mapa[m.chave] || (legado ? mapa[m.mes] : null) || [];
    linhas.forEach(function (l) {
      var efetivo = txt(l.efetivo);
      var reg = porNome[normalizar(efetivo)];
      out.push({
        data: l.data,
        dia: l.dia,
        posicao: l.posicao,
        efetivo: efetivo,
        id: reg ? reg.id : '',
        chavePosicao: chaveDataPosicao(l.data, l.posicao),
        chaveNome: chaveDataAnestesista(l.data, efetivo)
      });
    });
  });

  return out;
}

/**
 * Índices de busca sobre a consolidada — o equivalente em memória dos
 * XLOOKUP da aba CIRURGIAS.
 *
 *   porChavePosicao['2026-10-01|1'] -> linha
 *   porChaveNome['2026-10-01|Fabrício Tavares'] -> linha
 *   porData['2026-10-01'] -> [linhas ordenadas por posição]
 *
 * Em caso de chave repetida, guarda a PRIMEIRA ocorrência — é o que o
 * XLOOKUP faz por padrão.
 */
function indexarConsolidada(consolidada) {
  var porChavePosicao = {}, porChaveNome = {}, porData = {};

  (consolidada || []).forEach(function (l) {
    if (l.chavePosicao && !(l.chavePosicao in porChavePosicao)) porChavePosicao[l.chavePosicao] = l;
    if (l.chaveNome && !(l.chaveNome in porChaveNome)) porChaveNome[l.chaveNome] = l;
    if (l.data) {
      if (!porData[l.data]) porData[l.data] = [];
      porData[l.data].push(l);
    }
  });

  Object.keys(porData).forEach(function (d) {
    porData[d].sort(function (a, b) { return Number(a.posicao) - Number(b.posicao); });
  });

  return {
    porChavePosicao: porChavePosicao,
    porChaveNome: porChaveNome,
    porData: porData,

    /**
     * TASK-203: posição (1..5) de um anestesista numa data.
     * Devolve o literal 'fora da escala-base' quando não acha — exatamente o
     * texto que a fórmula da coluna Q devolve. Devolve '' se faltar dado.
     */
    posicaoDe: function (data, nome) {
      var k = chaveDataAnestesista(data, nome);
      if (!k) return '';
      var l = this.porChaveNome[k];
      return l ? l.posicao : CONFIG.FORA_DA_ESCALA;
    },

    /** Nome escalado numa posição da data, ou 'fora da escala-base'. */
    nomeNaPosicao: function (data, posicao) {
      var k = chaveDataPosicao(data, posicao);
      if (!k) return '';
      var l = this.porChavePosicao[k];
      return l ? l.efetivo : CONFIG.FORA_DA_ESCALA;
    },

    /**
     * TEXTJOIN(" | ") dos 5 escalados do dia, igual à coluna AA.
     * Posições sem ninguém são omitidas (TEXTJOIN com ignorar_vazio=TRUE).
     */
    escaladosDoDia: function (data) {
      var d = paraData(data);
      if (!d) return '';
      var lista = this.porData[d] || [];
      var nomes = [];
      CONFIG.POSICOES.forEach(function (pos) {
        for (var i = 0; i < lista.length; i++) {
          if (Number(lista[i].posicao) === pos && !vazio(lista[i].efetivo)) {
            nomes.push(txt(lista[i].efetivo));
            break;
          }
        }
      });
      return nomes.join(' | ');
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    indexarEscalaBase: indexarEscalaBase,
    diasFixosPorAnestesista: diasFixosPorAnestesista,
    gerarEscalaBaseAlfabetica: gerarEscalaBaseAlfabetica,
    validarEscalaBase: validarEscalaBase,
    giroDaData: giroDaData,
    anestesistaDoRodizio: anestesistaDoRodizio,
    gerarEscalaMensal: gerarEscalaMensal,
    recalcularEfetivo: recalcularEfetivo,
    indexarAnestesistasPorNome: indexarAnestesistasPorNome,
    gerarConsolidada: gerarConsolidada,
    indexarConsolidada: indexarConsolidada
  };
}
