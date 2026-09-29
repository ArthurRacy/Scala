/**
 * ============================================================================
 * 00_CONFIG — Parâmetros de negócio
 * ============================================================================
 * Arquivo dual-runtime: roda igual em Node.js, no navegador e no Google Apps
 * Script. Todo valor ajustável pelo grupo mora AQUI; nenhum outro módulo do
 * core carrega número mágico de negócio.
 *
 * IMPORTANTE — fidelidade à planilha:
 * Os nomes de abas, rótulos de domínio e formatos de chave abaixo foram
 * extraídos da planilha em uso ("Cópia de Escala_Total_Anestesia.xlsx").
 * NÃO renomeie nada aqui sem alterar a planilha junto: são os "códigos
 * internos" que ligam os dois lados.
 * ============================================================================
 */

var CONFIG = {
  /* ---- Identidade -------------------------------------------------------- */
  NOME_SISTEMA: 'Sistema de Gestão e Escala de Anestesia',
  VERSAO: '1.0.0',

  /* ---- Horizonte operacional -------------------------------------------- */
  /** Ano das três abas de escala da planilha original. */
  ANO_REFERENCIA: 2026,

  /**
   * Meses com aba de escala própria NA PLANILHA (horizontePlanilha()).
   * `aba` = nome EXATO da aba na planilha (com espaços, sem underscore).
   * `rotulo` = prefixo das colunas da aba HORAS ("OUT/26 - REAIS").
   * O web app não para aqui: usa o horizonte móvel (02b_calendario.js), que
   * segue o calendário a partir destes três meses.
   */
  MESES_ESCALA: [
    { ano: 2026, mes: 10, sigla: 'OUT', rotulo: 'OUT/26', nome: 'Outubro',  aba: 'ESCALA OUTUBRO 2026' },
    { ano: 2026, mes: 11, sigla: 'NOV', rotulo: 'NOV/26', nome: 'Novembro', aba: 'ESCALA NOVEMBRO 2026' },
    { ano: 2026, mes: 12, sigla: 'DEZ', rotulo: 'DEZ/26', nome: 'Dezembro', aba: 'ESCALA DEZEMBRO 2026' }
  ],

  /** Horizonte móvel: quantos meses depois do atual já têm escala montada. */
  MESES_A_FRENTE: 3,
  /** Cirurgia marcada além disto (a partir de hoje) não estende a escala. */
  LIMITE_MESES_FUTURO: 24,
  /**
   * Data de "hoje" fixa ('YYYY-MM-DD') — só para teste ou demonstração.
   * Nulo em produção: vale o relógio da máquina.
   */
  HOJE: null,

  /* ---- Rodízio ----------------------------------------------------------- */
  /**
   * COMO O RODÍZIO FUNCIONA (regra extraída da planilha e conferida contra as
   * 395 linhas já existentes nas três escalas mensais):
   *
   * A ESCALA_BASE define, para cada dia da semana, um elenco de 5 anestesistas
   * e a POSIÇÃO INICIAL de cada um (é o que o rótulo "ORDEM ALFABÉTICA
   * (posição inicial)" quer dizer). A cada semana esse elenco GIRA uma casa
   * dentro do próprio dia da semana:
   *
   *     anestesista(data, posição) = ESCALA_BASE[dia][((posição - 1 + k) mod 5) + 1]
   *
   * onde `k` é a k-ésima ocorrência daquele dia da semana desde ANCORA_RODIZIO.
   * Ou seja: a 1ª quinta-feira do horizonte usa o elenco na ordem-base, a 2ª
   * quinta desloca um, e no 6º giro volta ao início.
   *
   * O contador é POR DIA DA SEMANA, não por semana do calendário: a primeira
   * segunda-feira do horizonte (05/10/2026) é k=0, mesmo estando na 2ª semana,
   * porque não há segunda anterior dentro do horizonte.
   */
  DIAS_ESCALA: ['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'],
  DIA_SEM_ESCALA: 'DOMINGO',
  POSICOES: [1, 2, 3, 4, 5],
  TOTAL_ANESTESISTAS: 15,
  // Primeiro dia do horizonte de escala. É daqui que sai o contador `k`.
  ANCORA_RODIZIO: '2026-10-01',
  // Quantas casas o elenco gira a cada semana.
  PASSO_SEMANAL: 1,

  /* ---- Valores padrão (R$) ---------------------------------------------- */
  // Sugestão de preenchimento; nunca sobrescreve valor digitado.
  VALOR_PADRAO_ANESTESIA: 0,
  VALOR_PADRAO_AVALIACAO: 0,

  /* ---- Regras de cálculo ------------------------------------------------- */
  // Status que caracteriza cirurgia executada — único que entra na cobrança de
  // horário real e na contagem de pendência (TASK-401).
  STATUS_EXECUTADO: 'Realizada',
  // Status excluído de horas, receita e ledger (espelha o "<>Cancelada" das
  // fórmulas SUMIFS/COUNTIFS da planilha).
  STATUS_EXCLUIDO: 'Cancelada',
  // Cirurgia que cruza a meia-noite: MOD(fim-início,1), igual à planilha.
  PERMITIR_VIRADA_MEIA_NOITE: true,
  // Teto de sanidade para duração de uma anestesia, em horas.
  DURACAO_MAXIMA_HORAS: 24,

  /* ---- Prefixos de ID ---------------------------------------------------- */
  PREFIXO_ANESTESISTA: 'A',
  PREFIXO_CIRURGIA: 'CIR',
  PREFIXO_AVALIACAO: 'AVP',
  PREFIXO_BOLETIM: 'BOL',
  PREFIXO_QUALIDADE: 'FQA',
  PREFIXO_ESTRUTURA: 'EST',

  /* ---- Sentinelas de lookup (texto literal da planilha) ------------------ */
  FORA_DA_ESCALA: 'fora da escala-base',

  /* ---- Usuário gravado no LOG quando não há sessão nomeada --------------- */
  USUARIO_PADRAO: 'sistema'
};

/**
 * Config do mês COM ABA NA PLANILHA, ou null. Uso restrito à ponte com a
 * planilha (Apps Script); o resto do sistema usa o horizonte do store.
 */
function cfgMesEscala(mes, ano) {
  for (var i = 0; i < CONFIG.MESES_ESCALA.length; i++) {
    var m = CONFIG.MESES_ESCALA[i];
    if (m.mes === Number(mes) && (ano === undefined || m.ano === Number(ano))) return m;
  }
  return null;
}

/** Lista de meses cobertos, como [{mes,ano}]. */
function cfgMesesRef() {
  var out = [];
  for (var i = 0; i < CONFIG.MESES_ESCALA.length; i++) {
    out.push({ mes: CONFIG.MESES_ESCALA[i].mes, ano: CONFIG.MESES_ESCALA[i].ano || CONFIG.ANO_REFERENCIA });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG: CONFIG, cfgMesEscala: cfgMesEscala, cfgMesesRef: cfgMesesRef };
}
