/**
 * ============================================================================
 * DEMO_ONLINE — Cirurgias de EXEMPLO para a versão publicada online
 * ============================================================================
 * Só entra na página gerada por tools/gerar_versao_online.py; a versão
 * instalada na clínica não carrega este arquivo.
 *
 * Quem abre o link pela primeira vez vê o sistema funcionando, em vez de
 * telas vazias. Tudo aqui é fictício e marcado: o paciente se chama
 * "EXEMPLO · Paciente NN" e o cirurgião "Dr(a). Exemplo". O botão "Tirar
 * exemplos" da faixa do topo remove tudo de uma vez.
 * ============================================================================
 */
'use strict';

var DEMO = (function () {

  var MARCA = 'EXEMPLO · Paciente ';

  var PROCEDIMENTOS = [
    'Mamoplastia de aumento', 'Rinoplastia', 'Lipoaspiração de abdome e flancos', 'Abdominoplastia',
    'Mastopexia com prótese', 'Face completa', 'Blefaroplastia', 'Braquioplastia',
    'Transplante capilar', 'Ritidoplastia (face)', 'Mamoplastia redutora', 'Otoplastia',
    'Gluteoplastia', 'Lipoaspiração', 'Rinoplastia', 'Abdominoplastia'
  ];
  // [início, duração em horas] — manhã e tarde, como num dia de centro cirúrgico
  var HORARIOS = [['07:00', 3], ['10:30', 2], ['13:00', 4], ['08:00', 5], ['14:00', 2.5], ['07:30', 4]];
  var CONVENIOS = ['Particular', 'Particular', 'Unimed', 'Particular', 'Bradesco', 'Particular'];
  var VALORES = [2800, 1900, 2400, 3200, 3600, 4200, 1600, 2200, 3900, 3400, 2600, 1500, 3000, 2100, 1900, 3200];

  function somarHoras(hora, horas) {
    var m = horaParaMinutos(hora) + Math.round(horas * 60);
    return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60);
  }

  /** Mês de partida: o atual, se tiver escala; senão o primeiro do horizonte. */
  function mesBase(store) {
    var h = store.horizonte;
    var hoje = mesDaData(hojeISO());
    return buscarMes(h, hoje.ano, hoje.mes) || h[0];
  }

  /** Lança as cirurgias de exemplo (e completa algumas avaliações). */
  function popular(store) {
    var base = mesBase(store);
    if (!base) return 0;
    var seguinte = somarMeses(base.ano, base.mes, 1);
    var dias = datasUteisDoMes(base.ano, base.mes).slice(0, 12)
      .concat(store.temMes(seguinte.ano, seguinte.mes)
        ? datasUteisDoMes(seguinte.ano, seguinte.mes).slice(2, 6) : []);
    var hoje = hojeISO();
    var criadas = 0;

    dias.forEach(function (data, i) {
      var h = HORARIOS[i % HORARIOS.length];
      var inicio = h[0], fim = somarHoras(h[0], h[1]);
      var passada = data < hoje;
      var sugestao = store.sugerirAnestesista({ data: data, status: 'Agendada', inicioPrev: inicio, fimPrev: fim });

      var dados = {
        status: passada ? 'Realizada' : (i % 3 === 0 ? 'Confirmada' : 'Agendada'),
        data: data, inicioPrev: inicio, fimPrev: fim,
        paciente: MARCA + pad2(i + 1),
        convenio: CONVENIOS[i % CONVENIOS.length],
        procedimento: PROCEDIMENTOS[i % PROCEDIMENTOS.length],
        cirurgiao: 'Dr(a). Exemplo',
        anestesista: sugestao.nome || '',
        sala: 'Sala ' + (1 + (i % 3)),
        avaliacaoNec: i % 2 === 0 ? 'Sim' : 'Não',
        valor: VALORES[i % VALORES.length],
        pago: passada && i % 4 !== 1 ? 'Sim' : 'Não',
        obs: 'Registro fictício da demonstração.'
      };
      // Uma realizada fica sem horário real, para mostrar a pendência de horas.
      if (passada && i % 5 !== 2) {
        dados.inicioReal = somarHoras(inicio, 0.25);
        dados.fimReal = somarHoras(fim, 0.5);
      }

      var r = store.adicionarCirurgia(dados);
      if (!r.ok) return;
      criadas++;

      // Metade das avaliações já feitas, com valor.
      if (dados.avaliacaoNec === 'Sim' && i % 4 === 0) {
        var c = store.estado.cirurgias[store.estado.cirurgias.length - 1];
        var a = store.estado.avaliacoes.filter(function (x) { return x.idCirurgia === c.id; })[0];
        if (a) {
          store.atualizarAvaliacao(a.id, {
            anestesista: dados.anestesista, data: somarDias(data, -7), hora: '16:00',
            realizada: 'Sim', tcle: 'Sim', valor: 350, pago: 'Sim'
          });
        }
      }
    });

    boletinsDeExemplo(store);
    criadas += qualidadeDeExemplo(store);
    return criadas;
  }

  /** Assinatura desenhada da demonstração (um rabisco qualquer). */
  var RABISCO = [[[0.06, 0.62], [0.12, 0.3], [0.18, 0.66], [0.26, 0.34], [0.33, 0.6], [0.42, 0.42], [0.52, 0.58],
    [0.63, 0.44], [0.74, 0.55], [0.86, 0.48], [0.94, 0.52]]];

  /**
   * Dois boletins de exemplo: um assinado, completo (com gráfico, fármacos,
   * intercorrência e Aldrete), e um em preenchimento — para quem visita ver
   * as duas situações.
   */
  function boletinsDeExemplo(store) {
    var exemplos = store.estado.cirurgias.filter(function (c) {
      return String(c.paciente || '').indexOf(MARCA) === 0 && c.anestesista;
    });
    if (exemplos[0]) boletimCompleto(store, exemplos[0]);
    if (exemplos[1]) {
      var r = store.criarBoletim(exemplos[1].id);
      if (r.ok) {
        store.salvarBoletim(r.boletim.id, {
          paciente: { idade: 29, sexo: 'F', peso: 58, altura: 162 },
          pre: { asa: 'I', jejum: 10, alergias: 'Nega alergias' },
          tecnicas: ['Geral venosa total'], observacoes: 'Boletim de EXEMPLO em preenchimento.'
        });
      }
    }
  }

  function boletimCompleto(store, c) {
    var r = store.criarBoletim(c.id);
    if (!r.ok) return;
    var id = r.boletim.id;
    var ini = paraHora(c.inicioPrev) || '07:00';
    var dur = duracaoMinutos(c.inicioPrev, c.fimPrev) || 180;
    function t(min) { return somarHoras(ini, min / 60); }

    store.salvarBoletim(id, {
      paciente: { idade: 38, sexo: 'F', peso: 64, altura: 166, prontuario: 'EX-0001' },
      pre: { asa: 'I', jejum: 8, alergias: 'Nega alergias', comorbidades: 'Nega', medicacoes: 'Anticoncepcional oral', mallampati: 'I' },
      tecnicas: ['Geral balanceada'],
      viaAerea: { dispositivo: 'Tubo orotraqueal', tamanho: '7,0', cormack: 'I', tentativas: 1 },
      acesso: 'Jelco 18G no membro superior esquerdo', posicoes: ['Decúbito dorsal'],
      monitorizacao: MONITORIZACAO_BASICA.concat(['Temperatura']),
      ventilacao: { modo: 'Volume controlado (VCV)', vc: 420, fr: 12, peep: 5, fio2: 50 },
      tempos: { entradaSala: t(-10), inicioAnestesia: t(0), inicioCirurgia: t(25), fimCirurgia: t(dur - 15),
        fimAnestesia: t(dur), saidaSala: t(dur + 10) },
      perdas: { sangramento: 200, diurese: 250 },
      destino: 'SRPA',
      recuperacao: { atividade: 2, respiracao: 2, circulacao: 2, consciencia: 1, saturacao: 2, horaAlta: t(dur + 70), dor: 2 },
      observacoes: 'Boletim de EXEMPLO, com dados fictícios.'
    });

    for (var m = 0; m <= dur; m += 5) {
      var queda = m >= 10 && m <= 25;   // hipotensão logo depois da indução
      store.alterarLinhaBoletim(id, 'sinais', { acao: 'adicionar', linha: {
        hora: t(m),
        pas: (queda ? 92 : 118) + (m % 15 === 0 ? 4 : 0) - (m % 10 === 5 ? 3 : 0),
        pad: (queda ? 56 : 74) + (m % 20 === 0 ? 3 : 0),
        fc: 72 + ((m / 5) % 4) * 2 - (queda ? 6 : 0),
        spo2: m % 30 === 0 ? 98 : 99,
        etco2: m >= 5 && m <= dur - 10 ? 34 + (m % 3) : null,
        temp: m % 30 === 0 ? Math.round((36.4 - m / 600) * 10) / 10 : null
      } });
    }
    [[0, 'Midazolam', '2', 'mg', 'IV'], [1, 'Fentanil', '200', 'mcg', 'IV'], [2, 'Propofol', '150', 'mg', 'IV'],
      [2, 'Rocurônio', '40', 'mg', 'IV'], [5, 'Cefazolina', '2', 'g', 'IV'], [6, 'Dexametasona', '8', 'mg', 'IV'],
      [6, 'Sevoflurano', '2', '%', 'Inalatória'], [15, 'Efedrina', '10', 'mg', 'IV'],
      [dur - 20, 'Dipirona', '2', 'g', 'IV'], [dur - 20, 'Ondansetrona', '8', 'mg', 'IV'], [dur - 5, 'Sugamadex', '200', 'mg', 'IV']
    ].forEach(function (f) {
      store.alterarLinhaBoletim(id, 'farmacos', { acao: 'adicionar', linha: { hora: t(f[0]), nome: f[1], dose: f[2], unidade: f[3], via: f[4] } });
    });
    store.alterarLinhaBoletim(id, 'fluidos', { acao: 'adicionar', linha: { nome: 'Ringer lactato', volume: 1500 } });
    store.alterarLinhaBoletim(id, 'intercorrencias', { acao: 'adicionar', linha: { hora: t(15),
      descricao: 'Hipotensão após a indução (PA 92/56). Efedrina 10 mg IV e redução do sevoflurano, com resposta em 5 minutos.' } });
    store.finalizarBoletim(id, { tracos: RABISCO, nome: 'Dr(a). Exemplo', crm: '00000-EX' });
  }


  /* ------------------------------------------- qualidade e segurança --- */

  var MARCA_ESTRUTURA = 'EXEMPLO · registro fictício da demonstração.';

  var ESPECIALIDADES = ['Cirurgia plástica', 'Cirurgia plástica', 'Cirurgia plástica', 'Otorrinolaringologia'];
  var PROC_QUALIDADE = ['Mamoplastia de aumento', 'Abdominoplastia', 'Rinoplastia', 'Lipoaspiração de abdome e flancos',
    'Blefaroplastia', 'Mastopexia com prótese', 'Face completa', 'Mamoplastia redutora', 'Otoplastia',
    'Gluteoplastia', 'Braquioplastia', 'Rinoplastia'];

  /**
   * Fichas de qualidade FICTÍCIAS: cirurgias realizadas nas semanas
   * anteriores, com desfechos, processos, acompanhamentos e lacunas. O
   * desenho é proposital — há evento, há "não", há campo sem resposta, há
   * perda de seguimento e há acompanhamento vencido — para o painel mostrar
   * o que faz com cada situação. Nada aqui é sorteado: cada ficha sai de
   * regras sobre o índice, então a demonstração é sempre a mesma.
   */
  function qualidadeDeExemplo(store) {
    var nomes = store.estado.anestesistas.map(function (a) { return a.nome; })
      .filter(function (n) { return !!n; }).slice(0, 6);
    if (!nomes.length) return 0;
    var hoje = hojeISO();
    var N = 18, criadas = 0;

    function diaUtilAntes(dias) {
      var d = somarDias(hoje, -dias);
      while (diaDaSemana(d) === 'DOMINGO') d = somarDias(d, -1);
      return d;
    }

    for (var i = 0; i < N; i++) {
      // Espalha as cirurgias pelas últimas 11 semanas (as mais antigas já têm os 30 dias vencidos).
      var data = diaUtilAntes(3 + Math.round(i * 4.4));
      var h = HORARIOS[i % HORARIOS.length];
      var inicio = h[0], fim = somarHoras(h[0], h[1]);
      var geral = i % 5 !== 3;
      // Quem estava na escala naquele dia: senão a cirurgia de exemplo sai marcada "fora da escala-base".
      var sugestao = store.sugerirAnestesista({ data: data, status: 'Realizada', inicioPrev: inicio, fimPrev: fim });
      var anest = sugestao.nome || nomes[i % nomes.length];
      var proc = PROC_QUALIDADE[i % PROC_QUALIDADE.length];

      var r = store.adicionarCirurgia({
        status: 'Realizada', data: data, inicioPrev: inicio, fimPrev: fim,
        inicioReal: somarHoras(inicio, 0.2), fimReal: somarHoras(fim, 0.3),
        paciente: MARCA + 'Q' + pad2(i + 1), convenio: CONVENIOS[i % CONVENIOS.length],
        procedimento: proc, cirurgiao: 'Dr(a). Exemplo', anestesista: anest,
        sala: 'Sala ' + (1 + (i % 3)), avaliacaoNec: 'Não', valor: VALORES[i % VALORES.length],
        pago: 'Sim', obs: 'Registro fictício da demonstração.'
      });
      if (!r.ok) continue;
      var cir = store.estado.cirurgias[store.estado.cirurgias.length - 1];
      var fq = store.criarFichaQualidade(cir.id);
      if (!fq.ok) continue;
      var id = fq.ficha.id;
      criadas++;
      preencherFichaDeExemplo(store, id, cir, i, {
        data: data, inicio: inicio, geral: geral, anest: anest, h: h, idadeDias: diasEntre(data, hoje)
      });
    }

    estruturaDeExemplo(store, hoje);
    return criadas;
  }

  function preencherFichaDeExemplo(store, id, cir, i, ctx) {
    var data = ctx.data, geral = ctx.geral, anest = ctx.anest, idadeDias = ctx.idadeDias;
    var incompleta = i % 6 === 3;          // ficha deixada em branco de propósito
    var asa = ['I', 'II', 'II', 'III', 'I', 'II', 'IV', 'II', 'I'][i % 9];
    var carater = i % 11 === 6 ? 'Urgência' : 'Eletivo';
    var durMin = Math.round(ctx.h[1] * 60);
    function t(min) { return somarHoras(ctx.inicio, min / 60); }

    var hipoxemia = i % 9 === 4;
    var hipotensao = i % 4 === 1;
    var vasopressor = i % 8 === 1;
    var dorForte = i % 7 === 3;
    var frio = i % 6 === 5;
    var atbAtrasado = i % 8 === 6;
    var semTof = i % 6 === 4;

    var mud = {
      atendimento: {
        prontuario: 'EX-' + (2000 + i), vinculo: cir.convenio === 'Particular' ? 'Particular' : 'Convênio',
        convenio: cir.convenio, especialidade: ESPECIALIDADES[i % ESPECIALIDADES.length],
        unidade: 'Centro cirúrgico', sala: cir.sala, carater: carater, asa: asa,
        idade: 24 + ((i * 7) % 38), peso: 58 + ((i * 5) % 28), altura: 158 + ((i * 3) % 22),
        tecnicas: geral ? ['Geral balanceada'] : ['Sedação'],
        inicioAnestesia: t(0), fimAnestesia: t(durMin), entradaSrpa: t(durMin + 8), saidaSrpa: t(durMin + 75),
        destino: asa === 'IV' ? 'UTI' : (i % 7 === 0 ? 'Alta' : 'Enfermaria')
      }
    };

    if (!incompleta) {
      mud.pre = {
        avaliacaoDocumentada: 'Sim', avaliacaoCompleta: i % 10 === 7 ? 'Não' : 'Sim',
        viaAereaAvaliada: 'Sim', viaAereaDificilPrevista: i === 11 ? 'Sim' : 'Não',
        protocoloViaAerea: i === 11 ? 'Sim' : 'Não se aplica', carrinhoDisponivel: 'Sim', carrinhoChecado: i % 12 === 9 ? 'Não' : 'Sim',
        jejumData: somarDias(data, -1), jejumHora: i % 9 === 2 ? '05:30' : '21:30', jejumTipo: 'Sólidos'
      };
      mud.processo = {
        checklistRealizado: 'Sim', checklistEntrada: 'Sim', checklistPausa: 'Sim',
        checklistSaida: i % 10 === 7 ? 'Não' : 'Sim', checklistCompleto: i % 10 === 7 ? 'Não' : 'Sim',
        capnografiaIndicada: geral ? 'Sim' : 'Não',
        capnografiaUsada: geral ? (i % 12 === 8 ? 'Não' : 'Sim') : 'Não se aplica',
        capnografiaMotivo: geral && i % 12 === 8 ? 'Capnógrafo da sala em manutenção; monitorização por ausculta e SpO₂.' : '',
        atbIndicada: 'Sim', atbNome: 'Cefazolina', atbDose: '2 g',
        atbHora: atbAtrasado ? t(35) : t(-25), incisaoHora: t(30),
        atbRedose: 'Não se aplica',
        profundidadeIndicada: geral ? 'Sim' : 'Não',
        profundidadeUsada: geral ? (i % 6 === 0 ? 'Não' : 'Sim') : 'Não se aplica',
        profundidadeDispositivo: geral && i % 6 !== 0 ? 'BIS' : '',
        aquecimentoAtivo: i % 5 === 1 ? 'Não' : 'Sim', monitorTemperatura: 'Sim',
        bnmUsado: geral ? 'Sim' : 'Não',
        bnmMonitorizado: geral ? (semTof ? 'Não' : 'Sim') : 'Não se aplica',
        bnmMetodo: geral && !semTof ? 'Aceleromiografia' : '',
        tofValor: geral && !semTof ? (i % 13 === 5 ? '0,80' : '0,95') : '',
        tofHora: geral && !semTof ? t(durMin - 2) : '',
        bnmRevertido: geral ? 'Sim' : 'Não se aplica',
        bnmRevMedicamento: geral ? 'Sugamadex' : '', bnmRevDose: geral ? '2 mg/kg' : '',
        bnmRevHora: geral ? t(durMin - 6) : ''
      };
      mud.intra = {
        intubacao: geral ? 'Sim' : 'Não',
        spo2Minima: hipoxemia ? 86 : 96 + (i % 3), minutosSpo2Abaixo: hipoxemia ? 3 : 0,
        pamMinima: hipotensao ? 58 + (i % 4) : 70 + (i % 12), minutosPamAbaixo: hipotensao ? 6 + (i % 5) : 0,
        pasMaxima: 138 + ((i * 3) % 30)
      };
      mud.srpa = {
        temperaturaChegada: frio ? 35.4 : 36.2 + ((i % 4) / 10),
        nausea: i % 5 === 2 ? 'Sim' : 'Não', nauseaHora: i % 5 === 2 ? t(durMin + 25) : '',
        vomito: i % 9 === 2 ? 'Sim' : 'Não', vomitoHora: i % 9 === 2 ? t(durMin + 30) : '',
        tratamentoNv: i % 5 === 2 ? 'Ondansetrona 4 mg IV' : '',
        profilaxiaNvIndicada: 'Sim', profilaxiaNvFeita: i % 7 === 1 ? 'Não' : 'Sim',
        profilaxiaNvMedicamentos: i % 7 === 1 ? '' : 'Dexametasona 8 mg + Ondansetrona 4 mg',
        profilaxiaNvHorarios: i % 7 === 1 ? '' : t(5) + ' e ' + t(durMin - 20),
        dorEscala: 'EVA (0–10)', dorPontuacao: dorForte ? 8 : 2 + (i % 3), dorHora: t(durMin + 12),
        dorTratamento: dorForte ? 'Morfina 3 mg IV e dipirona 2 g' : '',
        dorReavaliacao: dorForte ? 3 : '', dorReavaliacaoHora: dorForte ? t(durMin + 40) : ''
      };
      // Respostas de evento que o anestesista dá na sala e na SRPA.
      mud.respostas = {
        pcrSala: 'Não', broncoaspiracao: 'Não', hipertensaoGrave: 'Não',
        vasopressorNaoPlanejado: vasopressor ? 'Sim' : 'Não',
        viaAereaDificil: geral ? (i === 5 ? 'Sim' : 'Não') : 'Não se aplica',
        intubacaoEsofagica: geral ? 'Não' : 'Não se aplica',
        bnmResidual: geral ? (i % 13 === 5 ? 'Sim' : 'Não') : 'Não se aplica',
        lesaoCornea: 'Não', lesaoPosicionamento: 'Não', falhaComunicacao: i % 14 === 9 ? 'Sim' : 'Não'
      };
      mud.transicao = {
        realizada: 'Sim', destino: asa === 'IV' ? 'UTI' : 'SRPA', hora: t(durMin + 8),
        transmitidoPor: anest, recebidoPor: 'Enf. Exemplo',
        itens: { identificacao: true, antecedentes: true, tecnica: true, intercorrencias: true,
          fluidos: true, farmacos: true, analgesia: i % 14 !== 9, pendencias: i % 14 !== 9 }
      };
      mud.satisfacao = i % 3 === 2
        ? { aplicada: 'Não' }
        : { aplicada: 'Sim', instrumento: 'Questionário de satisfação anestésica (exemplo)', escala: '0 a 10',
            data: somarDias(data, 1), respondente: 'Paciente', nota: 8 + (i % 3) * 0.5 + (i % 4 === 0 ? 0.5 : 0) };
    }

    var salvo = store.salvarFichaQualidade(id, mud);
    if (!salvo.ok) return;

    function evento(tipo, hora, desc, grav, conduta, evol, relacao, dados) {
      store.alterarEventoQualidade(id, { acao: 'adicionar', evento: {
        tipo: tipo, data: data, hora: hora, descricao: desc, gravidade: grav, conduta: conduta, evolucao: evol,
        relacao: relacao, dados: dados || {} } });
    }
    if (!incompleta) {
      if (vasopressor) {
        evento('vasopressorNaoPlanejado', t(15), 'Hipotensão após a indução (PAM 58) sem resposta à redução do halogenado.',
          'Moderada', 'Efedrina 10 mg IV e redução do sevoflurano.', 'PAM acima de 65 em 5 minutos, estável até o fim.',
          'Possível', { medicamento: 'Efedrina', motivo: 'Hipotensão após indução', intervencao: 'Bolus e ajuste de anestésico inalatório' });
      }
      if (geral && i === 5) {
        evento('viaAereaDificil', t(3), 'Laringoscopia grau III de Cormack-Lehane; intubação na segunda tentativa com bougie.',
          'Leve', 'Bougie e troca de lâmina.', 'Lesão labial superficial, sem sangramento ativo.', 'Possível',
          { previsao: 'Não prevista', tentativas: 2, complicacao: 'Lesão labial' });
      }
      if (geral && i % 13 === 5) {
        evento('bnmResidual', t(durMin + 10), 'TOF de 0,8 na chegada à SRPA, com fraqueza leve à elevação da cabeça.',
          'Leve', 'Nova dose de sugamadex 1 mg/kg.', 'Recuperação completa em 10 minutos.', 'Provável',
          { situacao: 'Confirmado', tof: 0.8 });
      }
      if (i % 14 === 9) {
        evento('falhaComunicacao', t(durMin + 10), 'Plano de analgesia e pendências não repassados à enfermagem da SRPA.',
          'Leve', 'Repasse refeito e prescrição ajustada.', 'Sem consequência clínica.', 'Não relacionada',
          { consequencia: 'Atraso de 20 minutos na analgesia.', providencia: 'Checklist de passagem reforçado com a equipe.' });
      }
    }

    // Acompanhamento posterior: o que já venceu e o que ficou por fazer.
    function seguir(janela, minDias, dados) {
      if (idadeDias >= minDias) store.registrarSeguimentoQualidade(id, janela, dados);
    }
    if (!incompleta) {
      var feito = { situacao: 'Realizado', por: 'Equipe de pós-operatório', hora: '10:00' };
      seguir('h24', 1, Object.assign({ data: somarDias(data, 1) }, feito));
      seguir('h48', 2, Object.assign({ data: somarDias(data, 2) }, feito));
      if (i % 10 === 4) {
        seguir('d30', 30, { situacao: 'Perda de seguimento', data: somarDias(data, 31), por: 'Secretaria',
          justificativa: 'Três tentativas de contato sem sucesso; paciente de outra cidade.' });
      } else if (i % 10 !== 8) {
        seguir('d30', 30, Object.assign({ data: somarDias(data, 31) }, feito));
      }   // i % 10 === 8: a janela de 30 dias vence e fica SEM resposta, para o painel contar.

      // Respostas que só existem depois de a janela correspondente ser respondida.
      if (idadeDias >= 1) {
        var resp = { obito24h: 'Não' };
        if (idadeDias >= 2) {
          resp.obito48h = 'Não'; resp.reintubacao24h = geral ? 'Não' : 'Não se aplica';
          resp.despertar = geral ? 'Não' : 'Não se aplica'; resp.disfuncaoNeuro = 'Não'; resp.isquemiaMiocardio = 'Não';
        }
        if (idadeDias >= 30 && i % 10 !== 4 && i % 10 !== 8) resp.obito30d = 'Não';
        store.salvarFichaQualidade(id, { respostas: resp });
      }
    }

    // Concluídas: quase todas. Rascunhos ficam nas mais recentes e na ficha em branco.
    if (!incompleta && idadeDias > 4) store.concluirFichaQualidade(id);

    // Três revisões clínicas, confirmando o que estiver registrado.
    if (i === 1 || i === 5 || i === 9) {
      var ficha = store.fichaQualidade(id);
      store.revisarFichaQualidade(id, {
        revisadoPor: 'Dr(a). Revisor(a) Exemplo', parecer: 'Revisão de exemplo: registro conferido com o prontuário.',
        eventos: ficha.eventos.map(function (e, k) {
          return { indice: k, confirmado: 'Confirmado', relacao: e.relacao || 'Possível', investigacao: 'Concluída' };
        })
      });
    }
  }

  /** Registros de estrutura fictícios: um por manhã e um por tarde nos últimos dias úteis. */
  function estruturaDeExemplo(store, hoje) {
    var n = 0;
    for (var d = 1; n < 16 && d < 60; d++) {
      var data = somarDias(hoje, -d);
      if (diaDaSemana(data) === 'DOMINGO') continue;
      ['Manhã', 'Tarde'].forEach(function (turno, k) {
        var carroFalhou = (n + k) % 8 === 6;
        store.salvarRegistroEstrutura({
          data: data, turno: turno, unidade: 'Centro cirúrgico', sala: '',
          equipamentos: {
            capnografo: n % 9 === 5 && k === 0 ? 'Indisponível' : 'Disponível e funcionando',
            monitor: 'Disponível e funcionando', aparelhoAnestesia: 'Disponível e funcionando',
            oximetro: 'Disponível e funcionando', aspirador: 'Disponível e funcionando',
            fonteOxigenio: 'Disponível e funcionando',
            viaAereaDificil: (n + k) % 7 === 3 ? 'Disponível com restrição' : 'Disponível e funcionando',
            desfibrilador: n % 11 === 7 && k === 1 ? 'Indisponível' : 'Disponível e funcionando',
            aquecimento: 'Disponível e funcionando', bombaInfusao: 'Disponível e funcionando'
          },
          carroParada: { disponivel: 'Sim', checado: carroFalhou ? 'Não' : 'Sim', dataChecagem: carroFalhou ? '' : data,
            pendencias: carroFalhou ? 'Lacre do carro não conferido no turno.' : '' },
          anestesiologistas: 3 + ((n + k) % 3), salasFuncionando: 2 + ((n + k) % 2),
          sangue: { disponivel: 'Sim', reservaProcedimentoRisco: (n + k) % 5 === 4 ? 'Não se aplica' : 'Sim' },
          treinamentos: n === 4 && k === 0
            ? [{ data: data, tema: 'Simulação de parada cardiorrespiratória no centro cirúrgico',
                tipo: 'Simulação de emergência', participantes: 'Equipe de anestesia e enfermagem do CC (exemplo)',
                numParticipantes: 14, horas: 2 }]
            : (n === 9 && k === 1
              ? [{ data: data, tema: 'Manejo de via aérea difícil', tipo: 'Treinamento',
                  participantes: 'Anestesiologistas (exemplo)', numParticipantes: 9, horas: 3 }]
              : []),
          obs: MARCA_ESTRUTURA
        });
      });
      n++;
    }
  }

  /** Remove tudo que é exemplo (e as avaliações ligadas). */
  function limpar(app) {
    var ids = app.store.estado.cirurgias
      .filter(function (c) { return String(c.paciente || '').indexOf(MARCA) === 0; })
      .map(function (c) { return c.id; });
    if (!ids.length) { UI.info('Não há exemplos para tirar'); return; }
    // Boletim é prontuário e não se apaga pela tela — mas o de exemplo é
    // fictício: sai junto com a cirurgia de exemplo.
    app.store.transacao(function (st) {
      st.boletins = st.boletins.filter(function (b) { return ids.indexOf(b.idCirurgia) < 0; });
      // O mesmo vale para as fichas de qualidade e os registros de estrutura de exemplo.
      st.fichasQualidade = st.fichasQualidade.filter(function (f) { return ids.indexOf(f.idCirurgia) < 0; });
      st.estrutura = st.estrutura.filter(function (r) { return r.obs !== MARCA_ESTRUTURA; });
      return { ok: true, semRecalculo: true };
    });
    ids.forEach(function (id) { app.store.removerCirurgia(id, { comAvaliacoes: true }); });
    app.salvarEredesenhar();
    UI.ok('Exemplos removidos', ids.length + ' cirurgia(s) de exemplo saíram. O sistema está limpo para testar.');
  }

  return { popular: popular, limpar: limpar, MARCA: MARCA };
})();
