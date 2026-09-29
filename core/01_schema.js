/**
 * ============================================================================
 * 01_SCHEMA — As 11 abas mestras, coluna por coluna
 * ============================================================================
 * Fonte da verdade da estrutura. Cada rótulo abaixo é BYTE-A-BYTE igual ao
 * cabeçalho da planilha em uso, incluindo acentos, parênteses e "(auto)".
 * O importador/exportador XLSX e as fórmulas do Apps Script casam por esses
 * rótulos — mudar um texto aqui quebra o vínculo com a planilha.
 *
 * `tipo`  : texto | data | hora | duracao | numero | moeda | inteiro | booleano
 *           ("booleano" = domínio Sim/Não, gravado como texto na planilha)
 * `origem`: 'MANUAL' (digitação) | 'AUTO' (calculado — nunca digitar)
 * `campo` : chave canônica usada no código JS (estável, sem acento)
 * ============================================================================
 */

/** Aba de apoio que existe no arquivo mas não é aba mestra. */
var ABA_LEIA_ME = 'LEIA-ME';

var SCHEMA = {

  /* ======================= 1. ANESTESISTAS ============================== */
  ANESTESISTAS: {
    aba: 'ANESTESISTAS',
    linhaCabecalho: 1,
    primeiraLinha: 2,
    chave: 'id',
    colunas: [
      { col: 'A', rotulo: 'ID_ANESTESISTA',  campo: 'id',       tipo: 'texto',    origem: 'MANUAL' },
      { col: 'B', rotulo: 'NOME',            campo: 'nome',     tipo: 'texto',    origem: 'MANUAL' },
      { col: 'C', rotulo: 'ATIVO (Sim/Não)', campo: 'ativo',    tipo: 'booleano', origem: 'MANUAL' },
      { col: 'D', rotulo: 'TELEFONE',        campo: 'telefone', tipo: 'texto',    origem: 'MANUAL' },
      { col: 'E', rotulo: 'E-MAIL',          campo: 'email',    tipo: 'texto',    origem: 'MANUAL' },
      { col: 'F', rotulo: 'OBSERVAÇÕES',     campo: 'obs',      tipo: 'texto',    origem: 'MANUAL' },
      // Coluna nova, criada pelo sistema — não existe na planilha original.
      // `extra` a deixa fora da conferência de fidelidade e o Apps Script só
      // a lê/escreve se o cabeçalho existir na aba.
      { col: 'G', rotulo: 'CHAVE PIX',       campo: 'pix',      tipo: 'texto',    origem: 'MANUAL', extra: true },
      // CRM: vai na assinatura do boletim anestésico (e nasce do boletim, se
      // ninguém preencheu no cadastro).
      { col: 'H', rotulo: 'CRM',             campo: 'crm',      tipo: 'texto',    origem: 'MANUAL', extra: true }
    ]
  },

  /* ======================= 2. ESCALA_BASE =============================== */
  ESCALA_BASE: {
    aba: 'ESCALA_BASE',
    linhaCabecalho: 1,
    primeiraLinha: 2,
    colunas: [
      { col: 'A', rotulo: 'DIA DA SEMANA',                      campo: 'dia',     tipo: 'texto',   origem: 'MANUAL' },
      { col: 'B', rotulo: 'ORDEM ALFABÉTICA (posição inicial)', campo: 'posicao', tipo: 'inteiro', origem: 'MANUAL' },
      { col: 'C', rotulo: 'ANESTESISTA',                        campo: 'nome',    tipo: 'texto',   origem: 'MANUAL' },
      { col: 'D', rotulo: 'ID_ANESTESISTA',                     campo: 'id',      tipo: 'texto',   origem: 'AUTO'   }
    ]
  },

  /* ================= 3. ESCALAS MENSAIS (OUT/NOV/DEZ 2026) ============== */
  /** Uma definição, três abas (CONFIG.MESES_ESCALA[i].aba). */
  ESCALA_MENSAL: {
    aba: null, // resolvido por mês via cfgMesEscala()
    linhaCabecalho: 1,
    primeiraLinha: 2,
    colunas: [
      { col: 'A', rotulo: 'DATA',                               campo: 'data',        tipo: 'data',     origem: 'AUTO'   },
      { col: 'B', rotulo: 'DIA DA SEMANA',                      campo: 'dia',         tipo: 'texto',    origem: 'AUTO'   },
      { col: 'C', rotulo: 'POSIÇÃO NO RODÍZIO',                 campo: 'posicao',     tipo: 'inteiro',  origem: 'AUTO'   },
      { col: 'D', rotulo: 'ANESTESISTA (CALCULADO)',            campo: 'calculado',   tipo: 'texto',    origem: 'AUTO'   },
      { col: 'E', rotulo: 'ID_ANESTESISTA',                     campo: 'idCalculado', tipo: 'texto',    origem: 'AUTO'   },
      { col: 'F', rotulo: 'AJUSTE MANUAL? (Sim/Não)',           campo: 'ajuste',      tipo: 'booleano', origem: 'MANUAL' },
      { col: 'G', rotulo: 'ANESTESISTA SUBSTITUTO (se ajuste)', campo: 'substituto',  tipo: 'texto',    origem: 'MANUAL' },
      { col: 'H', rotulo: 'ANESTESISTA EFETIVO',                campo: 'efetivo',     tipo: 'texto',    origem: 'AUTO'   },
      { col: 'I', rotulo: 'MOTIVO DO AJUSTE',                   campo: 'motivo',      tipo: 'texto',    origem: 'MANUAL' }
    ]
  },

  /* ==================== 4. ESCALA_CONSOLIDADA =========================== */
  ESCALA_CONSOLIDADA: {
    aba: 'ESCALA_CONSOLIDADA',
    linhaCabecalho: 1,
    primeiraLinha: 2,
    colunas: [
      { col: 'A', rotulo: 'DATA',                   campo: 'data',         tipo: 'data',    origem: 'AUTO' },
      { col: 'B', rotulo: 'DIA DA SEMANA',          campo: 'dia',          tipo: 'texto',   origem: 'AUTO' },
      { col: 'C', rotulo: 'POSIÇÃO',                campo: 'posicao',      tipo: 'inteiro', origem: 'AUTO' },
      { col: 'D', rotulo: 'ANESTESISTA EFETIVO',    campo: 'efetivo',      tipo: 'texto',   origem: 'AUTO' },
      { col: 'E', rotulo: 'ID_ANESTESISTA',         campo: 'id',           tipo: 'texto',   origem: 'AUTO' },
      { col: 'F', rotulo: 'CHAVE DATA+POSIÇÃO',     campo: 'chavePosicao', tipo: 'texto',   origem: 'AUTO' },
      { col: 'G', rotulo: 'CHAVE DATA+ANESTESISTA', campo: 'chaveNome',    tipo: 'texto',   origem: 'AUTO' }
    ]
  },

  /* ========================= 5. CIRURGIAS =============================== */
  CIRURGIAS: {
    aba: 'CIRURGIAS',
    linhaCabecalho: 1,
    primeiraLinha: 2,
    chave: 'id',
    colunas: [
      { col: 'A',  rotulo: 'ID_CIRURGIA',                             campo: 'id',            tipo: 'texto',    origem: 'AUTO'   },
      { col: 'B',  rotulo: 'STATUS',                                  campo: 'status',        tipo: 'texto',    origem: 'MANUAL', dominio: 'STATUS_CIRURGIA' },
      { col: 'C',  rotulo: 'DATA DA CIRURGIA',                        campo: 'data',          tipo: 'data',     origem: 'MANUAL' },
      { col: 'D',  rotulo: 'HORA INÍCIO PREVISTA',                    campo: 'inicioPrev',    tipo: 'hora',     origem: 'MANUAL' },
      { col: 'E',  rotulo: 'HORA TÉRMINO PREVISTA',                   campo: 'fimPrev',       tipo: 'hora',     origem: 'MANUAL' },
      { col: 'F',  rotulo: 'TEMPO ESTIMADO',                          campo: 'tempoEstimado', tipo: 'duracao',  origem: 'AUTO'   },
      { col: 'G',  rotulo: 'HORA INÍCIO REAL',                        campo: 'inicioReal',    tipo: 'hora',     origem: 'MANUAL' },
      { col: 'H',  rotulo: 'HORA TÉRMINO REAL',                       campo: 'fimReal',       tipo: 'hora',     origem: 'MANUAL' },
      { col: 'I',  rotulo: 'TEMPO REAL',                              campo: 'tempoReal',     tipo: 'duracao',  origem: 'AUTO'   },
      { col: 'J',  rotulo: 'NOME DO PACIENTE',                        campo: 'paciente',      tipo: 'texto',    origem: 'MANUAL' },
      { col: 'K',  rotulo: 'CONVÊNIO',                                campo: 'convenio',      tipo: 'texto',    origem: 'MANUAL', dominio: 'CONVENIO' },
      { col: 'L',  rotulo: 'TELEFONE DO PACIENTE',                    campo: 'telefone',      tipo: 'texto',    origem: 'MANUAL' },
      { col: 'M',  rotulo: 'PROCEDIMENTO/CIRURGIA',                   campo: 'procedimento',  tipo: 'texto',    origem: 'MANUAL' },
      { col: 'N',  rotulo: 'CIRURGIÃO',                               campo: 'cirurgiao',     tipo: 'texto',    origem: 'MANUAL' },
      { col: 'O',  rotulo: 'ANESTESISTA',                             campo: 'anestesista',   tipo: 'texto',    origem: 'MANUAL', dominio: 'ANESTESISTAS' },
      { col: 'P',  rotulo: 'ID_ANESTESISTA (auto)',                   campo: 'idAnestesista', tipo: 'texto',    origem: 'AUTO'   },
      { col: 'Q',  rotulo: 'POSIÇÃO DO ANESTESISTA NO RODÍZIO',       campo: 'posicao',       tipo: 'texto',    origem: 'AUTO'   },
      { col: 'R',  rotulo: 'LOCAL/SALA',                              campo: 'sala',          tipo: 'texto',    origem: 'MANUAL' },
      { col: 'S',  rotulo: 'AVALIAÇÃO PRÉ NECESSÁRIA?',               campo: 'avaliacaoNec',  tipo: 'booleano', origem: 'MANUAL' },
      { col: 'T',  rotulo: 'STATUS DA AVALIAÇÃO PRÉ-ANESTÉSICA',      campo: 'statusAval',    tipo: 'texto',    origem: 'AUTO'   },
      { col: 'U',  rotulo: 'VALOR DA ANESTESIA',                      campo: 'valor',         tipo: 'moeda',    origem: 'MANUAL' },
      { col: 'V',  rotulo: 'PAGO?',                                   campo: 'pago',          tipo: 'booleano', origem: 'MANUAL' },
      { col: 'W',  rotulo: 'DATA DO PAGAMENTO',                       campo: 'dataPagamento', tipo: 'data',     origem: 'MANUAL' },
      { col: 'X',  rotulo: 'NÚMERO DA NOTA FISCAL',                   campo: 'nf',            tipo: 'texto',    origem: 'MANUAL' },
      { col: 'Y',  rotulo: 'OBSERVAÇÕES',                             campo: 'obs',           tipo: 'texto',    origem: 'MANUAL' },
      { col: 'Z',  rotulo: 'DIA DA SEMANA (auto)',                    campo: 'dia',           tipo: 'texto',    origem: 'AUTO'   },
      { col: 'AA', rotulo: 'ANESTESISTAS ESCALADOS NO DIA (auto)',    campo: 'escalados',     tipo: 'texto',    origem: 'AUTO'   },
      { col: 'AB', rotulo: 'SUGESTÃO ANESTESISTA - POSIÇÃO 1 (auto)', campo: 'sugestaoPos1',  tipo: 'texto',    origem: 'AUTO'   },
      { col: 'AC', rotulo: 'MÊS (auto)',                              campo: 'mes',           tipo: 'inteiro',  origem: 'AUTO'   },
      { col: 'AD', rotulo: 'ANO (auto)',                              campo: 'ano',           tipo: 'inteiro',  origem: 'AUTO'   }
    ]
  },

  /* ====================== 6. AVALIAÇÕES PRÉ ============================= */
  AVALIACOES_PRE: {
    aba: 'AVALIAÇÕES PRÉ',
    linhaCabecalho: 1,
    primeiraLinha: 2,
    chave: 'id',
    colunas: [
      { col: 'A', rotulo: 'ID_AVALIAÇÃO',                   campo: 'id',            tipo: 'texto',    origem: 'AUTO'   },
      { col: 'B', rotulo: 'ID_CIRURGIA',                    campo: 'idCirurgia',    tipo: 'texto',    origem: 'AUTO'   },
      { col: 'C', rotulo: 'PACIENTE (auto)',                campo: 'paciente',      tipo: 'texto',    origem: 'AUTO'   },
      { col: 'D', rotulo: 'DATA DA CIRURGIA (auto)',        campo: 'dataCirurgia',  tipo: 'data',     origem: 'AUTO'   },
      { col: 'E', rotulo: 'NOME DA CIRURGIA (auto)',        campo: 'nomeCirurgia',  tipo: 'texto',    origem: 'AUTO'   },
      { col: 'F', rotulo: 'ANESTESISTA DA CIRURGIA (auto)', campo: 'anestCirurgia', tipo: 'texto',    origem: 'AUTO'   },
      { col: 'G', rotulo: 'ANESTESISTA DA AVALIAÇÃO',       campo: 'anestesista',   tipo: 'texto',    origem: 'MANUAL', dominio: 'ANESTESISTAS' },
      { col: 'H', rotulo: 'DATA DA AVALIAÇÃO',              campo: 'data',          tipo: 'data',     origem: 'MANUAL' },
      { col: 'I', rotulo: 'HORA DA AVALIAÇÃO',              campo: 'hora',          tipo: 'hora',     origem: 'MANUAL' },
      { col: 'J', rotulo: 'REALIZADA? (Sim/Não)',           campo: 'realizada',     tipo: 'booleano', origem: 'MANUAL' },
      { col: 'K', rotulo: 'TCLE ASSINADO? (Sim/Não)',       campo: 'tcle',          tipo: 'booleano', origem: 'MANUAL' },
      { col: 'L', rotulo: 'VALOR DA AVALIAÇÃO',             campo: 'valor',         tipo: 'moeda',    origem: 'MANUAL' },
      { col: 'M', rotulo: 'PAGO? (Sim/Não)',                campo: 'pago',          tipo: 'booleano', origem: 'MANUAL' },
      { col: 'N', rotulo: 'DATA DO PAGAMENTO',              campo: 'dataPagamento', tipo: 'data',     origem: 'MANUAL' },
      { col: 'O', rotulo: 'NÚMERO DA NOTA FISCAL',          campo: 'nf',            tipo: 'texto',    origem: 'MANUAL' },
      { col: 'P', rotulo: 'OBSERVAÇÕES',                    campo: 'obs',           tipo: 'texto',    origem: 'MANUAL' },
      { col: 'Q', rotulo: 'MÊS (auto)',                     campo: 'mes',           tipo: 'inteiro',  origem: 'AUTO'   },
      { col: 'R', rotulo: 'ANO (auto)',                     campo: 'ano',           tipo: 'inteiro',  origem: 'AUTO'   }
    ]
  },

  /* ========================= 7. FINANCEIRO ============================== */
  /**
   * Aba híbrida: bloco de indicadores mensais (linhas 3–15) + ledger detalhado
   * (cabeçalho na linha 20, lançamentos a partir da 21).
   */
  FINANCEIRO: {
    aba: 'FINANCEIRO',
    titulo: 'FINANCEIRO — INDICADORES MENSAIS',
    filtro: { mes: 'B3', ano: 'B4' },
    indicadores: [
      { linha: 6,  rotulo: 'VALOR TOTAL DE ANESTESIAS',    campo: 'totalAnestesias'    },
      { linha: 7,  rotulo: 'VALOR RECEBIDO DE ANESTESIAS', campo: 'recebidoAnestesias' },
      { linha: 8,  rotulo: 'VALOR PENDENTE DE ANESTESIAS', campo: 'pendenteAnestesias' },
      { linha: 10, rotulo: 'VALOR TOTAL DE AVALIAÇÕES',    campo: 'totalAvaliacoes'    },
      { linha: 11, rotulo: 'VALOR RECEBIDO DE AVALIAÇÕES', campo: 'recebidoAvaliacoes' },
      { linha: 12, rotulo: 'VALOR PENDENTE DE AVALIAÇÕES', campo: 'pendenteAvaliacoes' },
      { linha: 14, rotulo: 'TOTAL GERAL RECEBIDO',         campo: 'totalRecebido'      },
      { linha: 15, rotulo: 'TOTAL GERAL PENDENTE',         campo: 'totalPendente'      }
    ],
    ledger: {
      linhaCabecalho: 20,
      primeiraLinha: 21,
      nota: 'Linhas abaixo: ledger detalhado por lançamento (auto-preenchido — não digitar diretamente).',
      colunas: [
        { col: 'A', rotulo: 'DATA',               campo: 'data',          tipo: 'data',     origem: 'AUTO' },
        { col: 'B', rotulo: 'TIPO',               campo: 'tipo',          tipo: 'texto',    origem: 'AUTO' },
        { col: 'C', rotulo: 'ID',                 campo: 'id',            tipo: 'texto',    origem: 'AUTO' },
        { col: 'D', rotulo: 'PACIENTE',           campo: 'paciente',      tipo: 'texto',    origem: 'AUTO' },
        { col: 'E', rotulo: 'ANESTESISTA',        campo: 'anestesista',   tipo: 'texto',    origem: 'AUTO' },
        { col: 'F', rotulo: 'VALOR',              campo: 'valor',         tipo: 'moeda',    origem: 'AUTO' },
        { col: 'G', rotulo: 'PAGO?',              campo: 'pago',          tipo: 'booleano', origem: 'AUTO' },
        { col: 'H', rotulo: 'DATA PAGAMENTO',     campo: 'dataPagamento', tipo: 'data',     origem: 'AUTO' },
        { col: 'I', rotulo: 'NÚMERO NOTA FISCAL', campo: 'nf',            tipo: 'texto',    origem: 'AUTO' },
        { col: 'J', rotulo: 'STATUS DA NOTA',     campo: 'statusNota',    tipo: 'texto',    origem: 'AUTO' },
        { col: 'K', rotulo: 'OBSERVAÇÃO',         campo: 'obs',           tipo: 'texto',    origem: 'AUTO' }
      ]
    }
  },

  /* =========================== 8. HORAS ================================= */
  HORAS: {
    aba: 'HORAS',
    titulo: 'HORAS TRABALHADAS POR ANESTESISTA (2026)',
    nota: 'Horas REAIS = HORA TÉRMINO REAL - HORA INÍCIO REAL. Horas ESTIMADAS = previsto. Os dois nunca são somados juntos (colunas separadas).',
    linhaCabecalho: 4,
    primeiraLinha: 5,
    colunas: [
      { col: 'A', rotulo: 'ID_ANESTESISTA',                        campo: 'id',             tipo: 'texto',   origem: 'AUTO' },
      { col: 'B', rotulo: 'NOME',                                  campo: 'nome',           tipo: 'texto',   origem: 'AUTO' },
      { col: 'C', rotulo: 'OUT/26 - REAIS',                        campo: 'real_10',        tipo: 'duracao', origem: 'AUTO' },
      { col: 'D', rotulo: 'NOV/26 - REAIS',                        campo: 'real_11',        tipo: 'duracao', origem: 'AUTO' },
      { col: 'E', rotulo: 'DEZ/26 - REAIS',                        campo: 'real_12',        tipo: 'duracao', origem: 'AUTO' },
      { col: 'F', rotulo: 'TOTAL REAIS',                           campo: 'totalReais',     tipo: 'duracao', origem: 'AUTO' },
      { col: 'G', rotulo: 'OUT/26 - ESTIMADAS',                    campo: 'estim_10',       tipo: 'duracao', origem: 'AUTO' },
      { col: 'H', rotulo: 'NOV/26 - ESTIMADAS',                    campo: 'estim_11',       tipo: 'duracao', origem: 'AUTO' },
      { col: 'I', rotulo: 'DEZ/26 - ESTIMADAS',                    campo: 'estim_12',       tipo: 'duracao', origem: 'AUTO' },
      { col: 'J', rotulo: 'TOTAL ESTIMADAS',                       campo: 'totalEstimadas', tipo: 'duracao', origem: 'AUTO' },
      { col: 'K', rotulo: 'CIRURGIAS SEM HORÁRIO REAL PREENCHIDO', campo: 'semHorarioReal', tipo: 'inteiro', origem: 'AUTO' }
    ]
  },

  /* ========================= 9. INDICADORES ============================= */
  INDICADORES: {
    aba: 'INDICADORES',
    titulo: 'INDICADORES MENSAIS POR ANESTESISTA',
    filtro: { mes: 'B3', ano: 'B4', anestesista: 'B5' },
    indicadores: [
      { linha: 8,  rotulo: 'NÚMERO DE CIRURGIAS',                        campo: 'numCirurgias'   },
      { linha: 9,  rotulo: 'HORAS REAIS DE CIRURGIA',                    campo: 'horasReais'     },
      { linha: 10, rotulo: 'HORAS ESTIMADAS',                            campo: 'horasEstimadas' },
      { linha: 11, rotulo: 'NÚMERO DE AVALIAÇÕES PRÉ-ANESTÉSICAS',       campo: 'numAvaliacoes'  },
      { linha: 12, rotulo: 'VALOR TOTAL EM ANESTESIAS',                  campo: 'totalAnest'     },
      { linha: 13, rotulo: 'VALOR RECEBIDO EM ANESTESIAS',               campo: 'recebidoAnest'  },
      { linha: 14, rotulo: 'VALOR PENDENTE EM ANESTESIAS',               campo: 'pendenteAnest'  },
      { linha: 15, rotulo: 'VALOR TOTAL EM AVALIAÇÕES',                  campo: 'totalAval'      },
      { linha: 16, rotulo: 'VALOR RECEBIDO EM AVALIAÇÕES',               campo: 'recebidoAval'   },
      { linha: 17, rotulo: 'VALOR PENDENTE EM AVALIAÇÕES',               campo: 'pendenteAval'   },
      { linha: 18, rotulo: 'TOTAL RECEBIDO',                             campo: 'totalRecebido'  },
      { linha: 19, rotulo: 'QUANTIDADE DE NOTAS FISCAIS',                campo: 'qtdNotas'       },
      { linha: 20, rotulo: 'QUANTIDADE DE PROCEDIMENTOS SEM NF (pagos)', campo: 'qtdSemNota'     }
    ],
    comparativo: {
      titulo: 'COMPARATIVO — TODOS OS ANESTESISTAS NO MÊS/ANO SELECIONADO',
      linhaTitulo: 22,
      linhaCabecalho: 23,
      primeiraLinha: 24,
      colunas: [
        { col: 'A', rotulo: 'ANESTESISTA',                   campo: 'anestesista',   tipo: 'texto',   origem: 'AUTO' },
        { col: 'B', rotulo: 'Nº CIRURGIAS',                  campo: 'numCirurgias',  tipo: 'inteiro', origem: 'AUTO' },
        { col: 'C', rotulo: 'HORAS REAIS',                   campo: 'horasReais',    tipo: 'duracao', origem: 'AUTO' },
        { col: 'D', rotulo: 'Nº AVALIAÇÕES',                 campo: 'numAvaliacoes', tipo: 'inteiro', origem: 'AUTO' },
        { col: 'E', rotulo: 'VALOR TOTAL ANEST.',            campo: 'totalAnest',    tipo: 'moeda',   origem: 'AUTO' },
        { col: 'F', rotulo: 'VALOR RECEBIDO ANEST.',         campo: 'recebidoAnest', tipo: 'moeda',   origem: 'AUTO' },
        { col: 'G', rotulo: 'VALOR PENDENTE ANEST.',         campo: 'pendenteAnest', tipo: 'moeda',   origem: 'AUTO' },
        { col: 'H', rotulo: 'TOTAL RECEBIDO (ANEST.+AVAL.)', campo: 'totalRecebido', tipo: 'moeda',   origem: 'AUTO' }
      ]
    }
  },

  /* ========================== 10. DASHBOARD ============================= */
  DASHBOARD: {
    aba: 'DASHBOARD',
    titulo: 'DASHBOARD GERENCIAL — SERVIÇO DE ANESTESIOLOGIA',
    filtro: { mes: 'B3', ano: 'B4' },
    kpis: [
      { linha: 6,  rotulo: 'Cirurgias realizadas',                campo: 'cirurgiasRealizadas' },
      { linha: 7,  rotulo: 'Cirurgias canceladas',                campo: 'cirurgiasCanceladas' },
      { linha: 8,  rotulo: 'Horas totais de anestesia',           campo: 'horasTotais'         },
      { linha: 9,  rotulo: 'Número de avaliações pré-anestésicas', campo: 'numAvaliacoes'       },
      { linha: 10, rotulo: 'Receita de anestesias',                campo: 'receitaAnestesias'   },
      { linha: 11, rotulo: 'Receita de avaliações',                campo: 'receitaAvaliacoes'   },
      { linha: 12, rotulo: 'Total recebido',                       campo: 'totalRecebido'       },
      { linha: 13, rotulo: 'Total pendente',                       campo: 'totalPendente'       },
      { linha: 14, rotulo: 'Procedimentos sem nota fiscal',        campo: 'semNotaFiscal'       }
    ],
    graficos: {
      nota: 'DADOS DOS GRÁFICOS (auto — não excluir; alimentam os gráficos abaixo)',
      linhaNota: 16,
      porAnestesista: { linhaCabecalho: 17, primeiraLinha: 18, cabecalho: ['ANESTESISTA', 'CIRURGIAS'] },
      porMes:         { linhaCabecalho: 35, primeiraLinha: 36, cabecalho: ['MÊS', 'CIRURGIAS REALIZADAS'] }
    }
  },

  /* ============================= 11. LOG ================================ */
  LOG: {
    aba: 'LOG',
    linhaCabecalho: 1,
    primeiraLinha: 2,
    colunas: [
      { col: 'A', rotulo: 'DATA/HORA',      campo: 'quando',     tipo: 'texto', origem: 'AUTO' },
      { col: 'B', rotulo: 'USUÁRIO',        campo: 'usuario',    tipo: 'texto', origem: 'AUTO' },
      { col: 'C', rotulo: 'ABA',            campo: 'aba',        tipo: 'texto', origem: 'AUTO' },
      { col: 'D', rotulo: 'ID_CIRURGIA',    campo: 'idCirurgia', tipo: 'texto', origem: 'AUTO' },
      { col: 'E', rotulo: 'CAMPO ALTERADO', campo: 'campo',      tipo: 'texto', origem: 'AUTO' },
      { col: 'F', rotulo: 'VALOR ANTERIOR', campo: 'de',         tipo: 'texto', origem: 'AUTO' },
      { col: 'G', rotulo: 'NOVO VALOR',     campo: 'para',       tipo: 'texto', origem: 'AUTO' }
    ]
  }
};

/** Ordem das abas mestras, como aparecem na planilha. */
var ORDEM_ABAS = [
  'ANESTESISTAS', 'ESCALA_BASE', 'ESCALA_MENSAL', 'ESCALA_CONSOLIDADA',
  'CIRURGIAS', 'AVALIACOES_PRE', 'FINANCEIRO', 'HORAS',
  'INDICADORES', 'DASHBOARD', 'LOG'
];

/** Colunas de uma tabela, dado o nome lógico da aba. */
function schemaColunas(nomeLogico) {
  var s = SCHEMA[nomeLogico];
  if (!s) throw new Error('Aba desconhecida no schema: ' + nomeLogico);
  if (s.colunas) return s.colunas;
  if (s.ledger && s.ledger.colunas) return s.ledger.colunas;
  throw new Error('Aba sem colunas tabulares: ' + nomeLogico);
}

/** Mapa rótulo -> campo, para importar planilha casando por cabeçalho. */
function schemaMapaRotulos(nomeLogico) {
  var m = {}, cols = schemaColunas(nomeLogico);
  for (var i = 0; i < cols.length; i++) m[cols[i].rotulo] = cols[i].campo;
  return m;
}

/** Rótulos na ordem das colunas — usado ao exportar. */
function schemaCabecalho(nomeLogico) {
  return schemaColunas(nomeLogico).map(function (c) { return c.rotulo; });
}

/**
 * Rótulos que existem na planilha em uso — sem as colunas `extra` que o
 * sistema acrescentou. É contra isto que a QA de fidelidade confere.
 */
function schemaCabecalhoPlanilha(nomeLogico) {
  return schemaColunas(nomeLogico)
    .filter(function (c) { return !c.extra; })
    .map(function (c) { return c.rotulo; });
}

/** Campos calculados (origem AUTO) — o usuário nunca digita nestes. */
function schemaCamposAuto(nomeLogico) {
  return schemaColunas(nomeLogico)
    .filter(function (c) { return c.origem === 'AUTO'; })
    .map(function (c) { return c.campo; });
}

/** Coluna (letra) de um campo — usado pelo Apps Script para escrever fórmulas. */
function schemaColunaDe(nomeLogico, campo) {
  var cols = schemaColunas(nomeLogico);
  for (var i = 0; i < cols.length; i++) if (cols[i].campo === campo) return cols[i].col;
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCHEMA: SCHEMA, ORDEM_ABAS: ORDEM_ABAS, ABA_LEIA_ME: ABA_LEIA_ME,
    schemaColunas: schemaColunas, schemaMapaRotulos: schemaMapaRotulos,
    schemaCabecalho: schemaCabecalho, schemaCabecalhoPlanilha: schemaCabecalhoPlanilha,
    schemaCamposAuto: schemaCamposAuto,
    schemaColunaDe: schemaColunaDe
  };
}
