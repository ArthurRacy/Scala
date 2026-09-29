/**
 * ============================================================================
 * 03F_QUALIDADE_PDF — Ficha de qualidade e relatório do painel em PDF
 * ============================================================================
 * Dois documentos, montados com o gerador sem biblioteca (03b_pdf):
 *
 *   ficha()      — o atendimento inteiro: identificação, etapas, eventos,
 *                  acompanhamento, transição de cuidado, satisfação, revisão
 *                  clínica e o histórico de alterações.
 *   relatorio()  — o painel de indicadores de um recorte: cada indicador com
 *                  eventos, elegíveis, taxa, DEFINIÇÃO e FÓRMULA, quantos
 *                  registros ficaram sem informação e a evolução no tempo.
 *
 * Uma regra atravessa os dois: campo sem resposta sai como "sem informação",
 * nunca como "não". É a mesma regra do cálculo (09c) — o papel não pode
 * dizer uma coisa e o painel outra.
 * ============================================================================
 */
'use strict';

var QUALIDADE_PDF = (function () {

  function vl(v, sufixo) {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace('.', ',') + (sufixo || '');
  }

  function resposta(v) { return v || 'sem informação'; }

  function duracao(min) {
    if (min === null || min === undefined) return '';
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? h + 'h' + (m < 10 ? '0' : '') + m : m + ' min';
  }

  function pct(v) { return v === null || v === undefined ? '—' : String(v).replace('.', ',') + '%'; }

  function dataHora(iso) {
    if (!iso) return '';
    return (dataBR(iso.slice(0, 10)) || '') + (iso.length > 11 ? ' ' + iso.slice(11, 16) : '');
  }

  function nomeArquivo(f, cirurgia) {
    var nome = txt(cirurgia && cirurgia.paciente) || 'paciente';
    return 'Qualidade ' + f.id + ' - ' + nome.replace(/[\\/:*?"<>|]+/g, ' ') + ' - ' +
      (paraData(cirurgia && cirurgia.data) || 'sem data') + '.pdf';
  }

  /* ====================================================== ficha ======= */

  function montarFicha(f, cirurgia, opcoes) {
    opcoes = opcoes || {};
    var clinica = opcoes.clinica || {};
    var estrutura = opcoes.estrutura || null;
    var hoje = opcoes.hoje || hojeISO();
    var r = resumoQualidade(f, cirurgia);
    var at = f.atendimento;
    var d = PDF.documento({ titulo: 'Ficha de indicadores de qualidade ' + f.id, margem: 44 });

    d.texto(clinica.nome || CONFIG.NOME_SISTEMA, { tam: 11, negrito: true, alinhar: 'centro', depois: 2 });
    d.texto('Ficha de indicadores de qualidade e segurança em anestesia', { tam: 13, negrito: true, alinhar: 'centro', depois: 2 });
    d.texto(f.id + ' · ' + f.status + (f.versao > 1 ? ' · versão ' + f.versao : ''),
      { tam: 9, alinhar: 'centro', cinza: '0.35' });
    d.regua();

    /* ---- 1. Identificação --------------------------------------------- */
    d.secao('1. Identificação do atendimento');
    d.pares([
      ['Paciente', txt(cirurgia && cirurgia.paciente)],
      ['Prontuário', at.prontuario],
      ['Data', dataBR(cirurgia && cirurgia.data)],
      ['Cirurgia', txt(cirurgia && cirurgia.id)],
      ['Procedimento', txt(cirurgia && cirurgia.procedimento)],
      ['Especialidade', at.especialidade],
      ['Unidade', at.unidade],
      ['Sala', at.sala || txt(cirurgia && cirurgia.sala)],
      ['Vínculo', at.vinculo + (at.convenio && !mesmoTexto(at.convenio, at.vinculo) ? ' · ' + at.convenio : '')],
      ['Anestesiologista', txt(cirurgia && cirurgia.anestesista)],
      ['Cirurgião', txt(cirurgia && cirurgia.cirurgiao)],
      ['Caráter', at.carater],
      ['Idade', vl(at.idade, ' anos')],
      ['Peso', vl(at.peso, ' kg')],
      ['Altura', vl(at.altura, ' cm')],
      ['ASA', at.asa],
      ['IMC', vl(r.imc, ' kg/m²')],
      ['Técnica anestésica', at.tecnicas.concat(at.tecnicaOutra ? [at.tecnicaOutra] : []).join(', ')]
    ], 3);
    d.pares([
      ['Início da anestesia', at.inicioAnestesia],
      ['Término da anestesia', at.fimAnestesia],
      ['Duração da anestesia', duracao(r.duracaoAnestesia)],
      ['Entrada na SRPA', at.entradaSrpa],
      ['Saída da SRPA', at.saidaSrpa],
      ['Permanência na SRPA', duracao(r.permanenciaSrpa)],
      ['Destino', at.destino === 'Outro' ? at.destinoOutro : at.destino]
    ], 3);

    /* ---- 2. Avaliação pré-anestésica ----------------------------------- */
    d.secao('2. Avaliação pré-anestésica');
    d.pares([
      ['Avaliação documentada', resposta(f.pre.avaliacaoDocumentada)],
      ['Avaliação completa', resposta(f.pre.avaliacaoCompleta)],
      ['Via aérea avaliada', resposta(f.pre.viaAereaAvaliada)],
      ['Via aérea difícil prevista', resposta(f.pre.viaAereaDificilPrevista)],
      ['Adesão ao protocolo de via aérea', resposta(f.pre.protocoloViaAerea)],
      ['Carrinho de via aérea disponível', resposta(f.pre.carrinhoDisponivel)],
      ['Carrinho checado', resposta(f.pre.carrinhoChecado)],
      ['Última ingestão', (dataBR(f.pre.jejumData) || '') + ' ' + f.pre.jejumHora],
      ['Tipo de ingestão', f.pre.jejumTipo],
      ['Tempo de jejum', vl(r.jejumHoras, ' h')]
    ], 3);
    if (f.pre.obs) d.campo('Observações', f.pre.obs, { tam: 9 });

    /* ---- 3. Intraoperatório: processo e medidas ------------------------ */
    d.secao('3. Período intraoperatório — processo');
    d.pares([
      ['Checklist realizado', resposta(f.processo.checklistRealizado)],
      ['Etapa de entrada', resposta(f.processo.checklistEntrada)],
      ['Pausa cirúrgica', resposta(f.processo.checklistPausa)],
      ['Etapa de saída', resposta(f.processo.checklistSaida)],
      ['Checklist completo', resposta(f.processo.checklistCompleto)],
      ['Pendências do checklist', f.processo.checklistPendencias],
      ['Capnografia indicada', resposta(f.processo.capnografiaIndicada)],
      ['Capnografia utilizada', resposta(f.processo.capnografiaUsada)],
      ['Motivo (se não)', f.processo.capnografiaMotivo],
      ['Profilaxia antibiótica', resposta(f.processo.atbIndicada)],
      ['Antibiótico', f.processo.atbNome + (f.processo.atbDose ? ' · ' + f.processo.atbDose : '')],
      ['Horário do antibiótico', f.processo.atbHora],
      ['Horário da incisão', f.processo.incisaoHora],
      ['Antibiótico antes da incisão', r.antibioticoAntesDaIncisao === null ? '' : r.antibioticoAntesDaIncisao + ' min'],
      ['Redose', resposta(f.processo.atbRedose) + (f.processo.atbRedoseHora ? ' · ' + f.processo.atbRedoseHora : '')],
      ['Profundidade indicada', resposta(f.processo.profundidadeIndicada)],
      ['Profundidade monitorizada', resposta(f.processo.profundidadeUsada)],
      ['Dispositivo', f.processo.profundidadeDispositivo],
      ['Aquecimento ativo', resposta(f.processo.aquecimentoAtivo)],
      ['Monitorização de temperatura', resposta(f.processo.monitorTemperatura)],
      ['Bloqueador neuromuscular', resposta(f.processo.bnmUsado)],
      ['Monitorização neuromuscular', resposta(f.processo.bnmMonitorizado)],
      ['Método', f.processo.bnmMetodo],
      ['Relação TOF', vl(f.processo.tofValor) + (f.processo.tofHora ? ' às ' + f.processo.tofHora : '')],
      ['Reversão do bloqueio', resposta(f.processo.bnmRevertido)],
      ['Medicamento da reversão', f.processo.bnmRevMedicamento +
        (f.processo.bnmRevDose ? ' · ' + f.processo.bnmRevDose : '') +
        (f.processo.bnmRevHora ? ' · ' + f.processo.bnmRevHora : '')]
    ], 3);

    d.secao('3. Período intraoperatório — medidas');
    d.pares([
      ['Intubação traqueal', resposta(f.intra.intubacao)],
      ['Menor SpO₂', vl(f.intra.spo2Minima, '%')],
      ['Tempo com SpO₂ baixa', vl(f.intra.minutosSpo2Abaixo, ' min')],
      ['Menor PAM', vl(f.intra.pamMinima, ' mmHg')],
      ['Tempo com PAM baixa', vl(f.intra.minutosPamAbaixo, ' min')],
      ['Maior PA sistólica', vl(f.intra.pasMaxima, ' mmHg')]
    ], 3);
    if (f.intra.obs) d.campo('Observações', f.intra.obs, { tam: 9 });

    /* ---- 4. Recuperação pós-anestésica --------------------------------- */
    d.secao('4. Recuperação pós-anestésica');
    d.pares([
      ['Temperatura na chegada', vl(f.srpa.temperaturaChegada, ' °C')],
      ['Náusea', resposta(f.srpa.nausea) + (f.srpa.nauseaHora ? ' · ' + f.srpa.nauseaHora : '')],
      ['Vômito', resposta(f.srpa.vomito) + (f.srpa.vomitoHora ? ' · ' + f.srpa.vomitoHora : '')],
      ['Tratamento de náusea/vômito', f.srpa.tratamentoNv],
      ['Profilaxia indicada', resposta(f.srpa.profilaxiaNvIndicada)],
      ['Profilaxia realizada', resposta(f.srpa.profilaxiaNvFeita)],
      ['Medicamentos da profilaxia', f.srpa.profilaxiaNvMedicamentos],
      ['Horários da profilaxia', f.srpa.profilaxiaNvHorarios],
      ['Escala de dor', f.srpa.dorEscala],
      ['Pontuação de dor', vl(f.srpa.dorPontuacao) + (f.srpa.dorHora ? ' às ' + f.srpa.dorHora : '')],
      ['Tratamento da dor', f.srpa.dorTratamento],
      ['Reavaliação da dor', vl(f.srpa.dorReavaliacao) + (f.srpa.dorReavaliacaoHora ? ' às ' + f.srpa.dorReavaliacaoHora : '')]
    ], 3);
    if (f.srpa.obs) d.campo('Observações', f.srpa.obs, { tam: 9 });

    /* ---- 5. Respostas de evento ---------------------------------------- */
    d.secao('5. Eventos clínicos — respostas');
    d.tabela([
      { rotulo: 'Evento', largura: 0.56, quebrar: true },
      { rotulo: 'Grupo', largura: 0.28, quebrar: true },
      { rotulo: 'Resposta', largura: 0.16 }
    ], EVENTOS_QUALIDADE.map(function (e) {
      return [e.rotulo, e.grupo, f.respostas[e.chave] || 'sem informação'];
    }), { tam: 7.5 });

    if (f.eventos.length) {
      d.secao('5. Eventos registrados', { direita: f.eventos.length + ' registro(s)' });
      f.eventos.forEach(function (ev, i) {
        var def = eventoQualidade(ev.tipo);
        d.garantir(70);
        d.texto((i + 1) + '. ' + (def ? def.rotulo : ev.tipo), { tam: 9.5, negrito: true, depois: 1 });
        var pares = [
          ['Data e horário', (dataBR(ev.data) || '') + (ev.hora ? ' ' + ev.hora : '')],
          ['Gravidade', ev.gravidade],
          ['Relação com a anestesia', ev.relacao || 'não avaliada'],
          ['Situação da investigação', ev.investigacao],
          ['Registrado por', ev.origem + (ev.registradoPor ? ' · ' + ev.registradoPor : '')],
          ['Revisão clínica', ev.confirmado ? ev.confirmado + (ev.confirmadoPor ? ' · ' + ev.confirmadoPor : '') : '']
        ];
        (def ? def.campos : []).forEach(function (c) {
          pares.push([c.rotulo, ev.dados[c.chave] === null || ev.dados[c.chave] === undefined ? '' : String(ev.dados[c.chave]).replace('.', ',')]);
        });
        d.pares(pares, 3, { tam: 8 });
        if (ev.descricao) d.campo('Descrição', ev.descricao, { tam: 8.5 });
        if (ev.conduta) d.campo('Conduta', ev.conduta, { tam: 8.5 });
        if (ev.evolucao) d.campo('Evolução', ev.evolucao, { tam: 8.5 });
        d.espaco(4);
      });
    }

    /* ---- 6. Acompanhamento --------------------------------------------- */
    d.secao('6. Acompanhamento posterior');
    d.tabela([
      { rotulo: 'Janela', largura: 0.12 }, { rotulo: 'Situação', largura: 0.2 },
      { rotulo: 'Data e hora', largura: 0.18 }, { rotulo: 'Por', largura: 0.18, quebrar: true },
      { rotulo: 'Justificativa / observação', largura: 0.32, quebrar: true }
    ], SEGUIMENTOS_QUALIDADE.map(function (s) {
      var g = f.seguimentos[s.chave];
      return [s.rotulo, g.situacao || 'pendente', (dataBR(g.data) || '') + (g.hora ? ' ' + g.hora : ''),
        g.por, [g.justificativa, g.obs].filter(function (x) { return !!x; }).join(' · ')];
    }), { tam: 8 });

    /* ---- 7. Transição de cuidado e satisfação -------------------------- */
    d.secao('7. Transição de cuidado');
    d.pares([
      ['Passagem registrada', resposta(f.transicao.realizada)],
      ['Destino', f.transicao.destino],
      ['Horário', f.transicao.hora],
      ['Transmitida por', f.transicao.transmitidoPor],
      ['Recebida por', f.transicao.recebidoPor],
      ['Falha de comunicação', f.respostas.falhaComunicacao || 'sem informação']
    ], 3);
    d.tabela([
      { rotulo: 'Informação essencial transmitida', largura: 0.8, quebrar: true },
      { rotulo: 'Transmitida', largura: 0.2, alinhar: 'centro' }
    ], ITENS_PASSAGEM.map(function (i) {
      return [i.rotulo, f.transicao.itens[i.chave] ? 'sim' : 'não'];
    }), { tam: 8 });
    if (f.transicao.obs) d.campo('Observações', f.transicao.obs, { tam: 9 });

    d.secao('7. Satisfação do paciente');
    d.pares([
      ['Pesquisa aplicada', resposta(f.satisfacao.aplicada)],
      ['Instrumento', f.satisfacao.instrumento],
      ['Escala', f.satisfacao.escala],
      ['Data', dataBR(f.satisfacao.data)],
      ['Respondente', f.satisfacao.respondente],
      ['Nota', vl(f.satisfacao.nota)]
    ], 3);
    if (f.satisfacao.comentario) d.campo('Comentário', f.satisfacao.comentario, { tam: 9 });

    /* ---- 8. Estrutura vinculada ---------------------------------------- */
    if (estrutura) {
      d.secao('8. Estrutura da unidade no período', { direita: estrutura.id });
      d.pares([
        ['Data', dataBR(estrutura.data)], ['Turno', estrutura.turno],
        ['Unidade', estrutura.unidade], ['Sala', estrutura.sala],
        ['Carro de parada checado', resposta(estrutura.carroParada.checado)],
        ['Sangue disponível', resposta(estrutura.sangue.disponivel)],
        ['Anestesiologistas', vl(estrutura.anestesiologistas)],
        ['Salas em funcionamento', vl(estrutura.salasFuncionando)]
      ], 3);
      d.texto('Os dados de estrutura vêm do registro da coordenação, vinculado por data, unidade, sala e turno — ' +
        'não foram digitados nesta ficha.', { tam: 8, cinza: '0.4' });
    }

    /* ---- 9. Pendências ------------------------------------------------- */
    var pend = pendenciasFicha(f, hoje, cirurgia);
    if (pend.length) {
      d.secao('9. Itens sem resposta', { direita: totalPendenciasFicha(f, hoje, cirurgia) + ' item(ns)' });
      pend.forEach(function (g) { d.campo(g.rotulo, g.itens.join(' · '), { tam: 8.5 }); });
      d.texto('Item sem resposta não é ausência de evento: fica de fora do cálculo dos indicadores e é contado ' +
        'à parte, como registro incompleto.', { tam: 8, cinza: '0.4' });
    }

    /* ---- 10. Revisão clínica e histórico ------------------------------- */
    if (f.revisao.revisadoEm) {
      d.secao('10. Revisão clínica');
      d.pares([['Revisado por', f.revisao.revisadoPor], ['Em', dataHora(f.revisao.revisadoEm)]], 3);
      if (f.revisao.parecer) d.campo('Parecer', f.revisao.parecer, { tam: 9 });
    }

    if (f.historico.length) {
      d.secao('Histórico de alterações', { direita: f.historico.length + ' registro(s)' });
      d.tabela([
        { rotulo: 'Quando', largura: 0.16 }, { rotulo: 'Quem', largura: 0.16, quebrar: true },
        { rotulo: 'Etapa', largura: 0.14 }, { rotulo: 'Campo', largura: 0.18, quebrar: true },
        { rotulo: 'De', largura: 0.18, quebrar: true }, { rotulo: 'Para', largura: 0.18, quebrar: true }
      ], f.historico.slice(-80).reverse().map(function (h) {
        return [dataHora(h.quando), h.quem, h.etapa, h.campo, h.de, h.para];
      }), { tam: 7 });
    }

    d.espaco(6);
    d.assinaturasLado([
      { rotulo: 'Anestesiologista responsável', detalhe: txt(cirurgia && cirurgia.anestesista) },
      { rotulo: 'Revisão clínica', detalhe: f.revisao.revisadoPor || '—' }
    ]);

    function rodape(pagina, total) {
      return [
        'Ficha de qualidade ' + f.id + ' · ' + txt(cirurgia && cirurgia.paciente) + ' · ' +
          (dataBR(cirurgia && cirurgia.data) || '') + ' · ' + f.status,
        'Página ' + pagina + ' de ' + total + ' · gerado em ' + dataHora(agoraTexto()) + ' · ' +
          (clinica.nome || CONFIG.NOME_SISTEMA)
      ];
    }

    return { documento: d, nome: nomeArquivo(f, cirurgia), rodape: rodape };
  }

  /* ================================================== relatório ======= */

  function periodoTexto(filtros) {
    var f = filtros || {};
    if (f.de && f.ate) return dataBR(f.de) + ' a ' + dataBR(f.ate);
    if (f.de) return 'de ' + dataBR(f.de);
    if (f.ate) return 'até ' + dataBR(f.ate);
    return 'todo o período';
  }

  /** Os filtros aplicados, em texto, para ninguém ler o número fora de contexto. */
  function filtrosTexto(filtros) {
    var f = filtros || {};
    var partes = [];
    [['unidade', 'Unidade'], ['especialidade', 'Especialidade'], ['procedimento', 'Procedimento'],
      ['tecnica', 'Técnica'], ['asa', 'ASA'], ['carater', 'Caráter'], ['anestesista', 'Profissional']]
      .forEach(function (p) { if (!vazio(f[p[0]])) partes.push(p[1] + ': ' + f[p[0]]); });
    return partes.length ? partes.join(' · ') : 'sem filtros além do período';
  }

  function montarRelatorio(painel, opcoes) {
    opcoes = opcoes || {};
    var clinica = opcoes.clinica || {};
    var anonimo = opcoes.anonimo !== false;   // agregado e sem identificação, por padrão
    var d = PDF.documento({ titulo: 'Relatório de indicadores de qualidade', margem: 44 });

    d.texto(clinica.nome || CONFIG.NOME_SISTEMA, { tam: 11, negrito: true, alinhar: 'centro', depois: 2 });
    d.texto('Indicadores de qualidade e segurança em anestesia', { tam: 13, negrito: true, alinhar: 'centro', depois: 2 });
    d.texto(periodoTexto(painel.filtros) + ' · ' + filtrosTexto(painel.filtros),
      { tam: 9, alinhar: 'centro', cinza: '0.35' });
    d.regua();

    var c = painel.completude;
    d.secao('Cobertura do período');
    d.pares([
      ['Atendimentos com ficha', String(c.atendimentos)],
      ['Fichas concluídas', String(c.concluidas)],
      ['Fichas com revisão clínica', String(c.revisadas)],
      ['Fichas incompletas', String(c.incompletas)],
      ['Itens sem resposta', String(c.itensPendentes)],
      ['Acompanhamentos em aberto', String(c.semAcompanhamento)]
    ], 3);

    if (!painel.aprovada) {
      d.texto('As definições clínicas destes indicadores ainda não foram aprovadas pelo responsável técnico de ' +
        'anestesiologia. Os limiares em uso são os padrão do sistema.', { tam: 8.5, cinza: '0.3' });
    } else {
      d.texto('Definições aprovadas por ' + painel.config.aprovacao.responsavel +
        (painel.config.aprovacao.crm ? ' (CRM ' + painel.config.aprovacao.crm + ')' : '') +
        ' em ' + dataBR(painel.config.aprovacao.em) +
        (painel.config.aprovacao.versao ? ' · versão ' + painel.config.aprovacao.versao : '') + '.',
        { tam: 8.5, cinza: '0.3' });
    }

    gruposQualidade().forEach(function (grupo) {
      var linhas = painel.indicadores.filter(function (i) { return i.grupo === grupo; });
      if (!linhas.length) return;
      d.secao(grupo);
      d.tabela([
        { rotulo: 'Indicador', largura: 0.34, quebrar: true },
        { rotulo: 'Eventos', largura: 0.1, alinhar: 'centro' },
        { rotulo: 'Elegíveis', largura: 0.1, alinhar: 'centro' },
        { rotulo: 'Com informação', largura: 0.13, alinhar: 'centro' },
        { rotulo: 'Sem informação', largura: 0.13, alinhar: 'centro' },
        { rotulo: 'Taxa', largura: 0.1, alinhar: 'direita' },
        { rotulo: 'Meta', largura: 0.1, alinhar: 'direita' }
      ], linhas.map(function (i) {
        return [i.nome, String(i.eventos), String(i.elegiveis), String(i.respondidos),
          String(i.semInformacao) + (i.semAcompanhamento ? ' (' + i.semAcompanhamento + ' s/ acomp.)' : ''),
          pct(i.taxa), i.meta === null ? '—' : pct(i.meta)];
      }), { tam: 7.5 });
    });

    d.secao('Definições e fórmulas');
    painel.indicadores.forEach(function (i) {
      d.garantir(46);
      d.texto(i.nome + ' · ' + i.grupo, { tam: 9, negrito: true, depois: 1 });
      d.texto('Definição: ' + i.definicao, { tam: 8, depois: 1 });
      d.texto('Fórmula: ' + i.formula, { tam: 8, depois: 1 });
      d.texto('População elegível: ' + i.elegibilidade, { tam: 8, depois: 1 });
      d.texto('Referência: ' + (i.referencia
        ? i.referencia.fonte + (i.referencia.versao ? ' · versão ' + i.referencia.versao : '') +
          (i.referencia.revisadaEm ? ' · revisada em ' + dataBR(i.referencia.revisadaEm) : '')
        : 'nenhuma fonte normativa ou técnica registrada para este indicador'),
        { tam: 8, cinza: '0.4', depois: 6 });
    });

    var comSerie = painel.indicadores.filter(function (i) { return i.serie && i.serie.length > 1; });
    if (comSerie.length) {
      d.secao('Evolução mês a mês');
      comSerie.forEach(function (i) {
        d.garantir(30);
        d.campo(i.nome, i.serie.map(function (p) {
          return p.mes + ': ' + (p.taxa === null ? 'sem informação' : pct(p.taxa)) +
            ' (' + p.eventos + '/' + p.respondidos + ')';
        }).join('   ·   '), { tam: 8 });
      });
    }

    var s = painel.satisfacao;
    d.secao('Satisfação do paciente');
    d.pares([
      ['Respostas com nota', String(s.respostas)],
      ['Nota média', s.media === null ? '—' : String(s.media).replace('.', ',')],
      ['Instrumentos', s.instrumentos.map(function (x) { return x.instrumento + ' (' + x.respostas + ')'; }).join(', ')]
    ], 3);

    var e = painel.estrutura;
    d.secao('Indicadores de estrutura', { direita: e.registros + ' registro(s) no período' });
    if (e.registros) {
      d.tabela([
        { rotulo: 'Item', largura: 0.42, quebrar: true },
        { rotulo: 'Verificados', largura: 0.15, alinhar: 'centro' },
        { rotulo: 'Disponíveis', largura: 0.15, alinhar: 'centro' },
        { rotulo: 'Indisponíveis', largura: 0.14, alinhar: 'centro' },
        { rotulo: 'Taxa', largura: 0.14, alinhar: 'direita' }
      ], e.itens.map(function (i) {
        return [i.rotulo + (i.critico ? ' (essencial)' : ''), String(i.verificados), String(i.disponiveis),
          String(i.indisponiveis), pct(i.taxa)];
      }), { tam: 7.5 });
      d.pares([
        ['Carro de parada checado', pct(e.carro.taxa) + ' (' + e.carro.checados + '/' + e.carro.respondidos + ')'],
        ['Sangue disponível', pct(e.sangue.taxa) + ' (' + e.sangue.disponiveis + '/' + e.sangue.respondidos + ')'],
        ['Anestesiologistas por sala', e.equipe.anestesiologistasPorSala === null ? '—' :
          String(e.equipe.anestesiologistasPorSala).replace('.', ',')],
        ['Treinamentos e simulações', String(e.treinamentos.length)]
      ], 2);
    } else {
      d.texto('Nenhum registro de estrutura no período.', { tam: 9, cinza: '0.4' });
    }

    d.secao('Como ler este relatório');
    d.texto('Dado ausente não é resultado negativo: o atendimento sem resposta fica em "sem informação", fora do ' +
      'numerador e fora do denominador da taxa. O denominador de cada indicador é a sua população elegível com ' +
      'informação — não o total de atendimentos.', { tam: 8.5 });
    d.texto('A atribuição de um evento à anestesia é registrada evento a evento, por avaliação clínica, e não é ' +
      'presumida pelo sistema.', { tam: 8.5 });
    d.texto('Comparações entre profissionais exigem considerar o perfil e o risco dos pacientes de cada um ' +
      '(ASA, caráter do procedimento e volume), que o painel mostra ao lado das taxas.', { tam: 8.5 });
    if (anonimo) {
      d.texto('Este relatório é agregado: não traz identificação de pacientes.', { tam: 8.5, cinza: '0.4' });
    }

    function rodape(pagina, total) {
      return [
        'Indicadores de qualidade · ' + periodoTexto(painel.filtros) + ' · ' + c.atendimentos + ' atendimento(s)',
        'Página ' + pagina + ' de ' + total + ' · gerado em ' + dataHora(agoraTexto()) + ' · ' +
          (clinica.nome || CONFIG.NOME_SISTEMA)
      ];
    }

    return { documento: d, nome: 'Indicadores de qualidade - ' + periodoTexto(painel.filtros).replace(/\//g, '-') + '.pdf',
      rodape: rodape };
  }

  return {
    /** PDF da ficha: { blob, nome }. */
    gerarFicha: function (f, cirurgia, opcoes) {
      var m = montarFicha(f, cirurgia, opcoes);
      return { blob: m.documento.blob(m.rodape), nome: m.nome };
    },
    /** Texto do PDF da ficha (para teste). */
    fonteFicha: function (f, cirurgia, opcoes) {
      var m = montarFicha(f, cirurgia, opcoes);
      return m.documento.fonte(m.rodape);
    },
    /** PDF do relatório do painel: { blob, nome }. */
    gerarRelatorio: function (painel, opcoes) {
      var m = montarRelatorio(painel, opcoes);
      return { blob: m.documento.blob(m.rodape), nome: m.nome };
    },
    /** Texto do PDF do relatório (para teste). */
    fonteRelatorio: function (painel, opcoes) {
      var m = montarRelatorio(painel, opcoes);
      return m.documento.fonte(m.rodape);
    },
    nomeArquivo: nomeArquivo,
    periodoTexto: periodoTexto,
    filtrosTexto: filtrosTexto
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { QUALIDADE_PDF: QUALIDADE_PDF };
