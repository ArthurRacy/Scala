/**
 * ============================================================================
 * 03E_BOLETIM_PDF — O boletim anestésico em PDF (para o prontuário)
 * ============================================================================
 * Monta o documento com o gerador sem biblioteca (03b_pdf): identificação,
 * avaliação resumida, técnica, horários, gráfico de sinais vitais em vetor
 * (PA em "v" e "^", FC em pontos, como nas fichas de papel), tabelas de
 * sinais, fármacos, fluidos e intercorrências, recuperação, a assinatura e
 * o histórico de versões.
 *
 * Boletim finalizado usa a identificação CONGELADA na assinatura; rascunho
 * usa a cirurgia de agora e sai marcado "RASCUNHO — sem assinatura".
 * ============================================================================
 */
'use strict';

var BOLETIM_PDF = (function () {

  var COR_PA = [0.72, 0.11, 0.11];
  var COR_FC = [0.1, 0.3, 0.65];

  function valor(v, sufixo) {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace('.', ',') + (sufixo || '');
  }

  function umaCasa(v, sufixo) {
    return v === null || v === undefined ? '' : v.toFixed(1).replace('.', ',') + (sufixo || '');
  }

  function duracao(min) {
    if (min === null || min === undefined) return '';
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h' + (m < 10 ? '0' : '') + m : m + ' min';
  }

  function simNao(v) { return v ? 'Sim' : 'Não'; }

  /** Identificação: a congelada (finalizado) ou a da cirurgia de agora (rascunho). */
  function identificacao(b, cirurgia, crm) {
    return b.status === BOLETIM_FINALIZADO && b.identificacao ? b.identificacao : identificacaoDaCirurgia(cirurgia, crm);
  }

  function nomeArquivo(b, ident) {
    var nome = txt(ident && ident.paciente) || 'paciente';
    return 'Boletim anestésico - ' + nome.replace(/[\\/:*?"<>|]+/g, ' ') + ' - ' + (paraData(ident && ident.data) || 'sem data') +
      (b.status === BOLETIM_FINALIZADO ? '' : ' (rascunho)') + '.pdf';
  }

  /* -------------------------------------------------------- gráfico --- */

  /**
   * Gráfico de PA e FC na linha do tempo do boletim. Eixo X em horário real
   * (atravessa a meia-noite), eixo Y de 0 a 240 (ou mais, se precisar).
   */
  function grafico(d, b) {
    var ref = referenciaBoletim(b);
    var pontos = b.sinais.map(function (s) { return { m: minutoNoBoletim(ref, s.hora), s: s }; })
      .filter(function (p) { return p.m !== null; });
    var marcos = [
      { campo: 'inicioAnestesia', sigla: 'IA' }, { campo: 'inicioCirurgia', sigla: 'IC' },
      { campo: 'fimCirurgia', sigla: 'TC' }, { campo: 'fimAnestesia', sigla: 'TA' }
    ].map(function (x) { return { sigla: x.sigla, m: minutoNoBoletim(ref, b.tempos[x.campo]) }; })
      .filter(function (x) { return x.m !== null; });

    var todos = pontos.map(function (p) { return p.m; }).concat(marcos.map(function (x) { return x.m; }));
    if (!todos.length) return;
    var t0 = Math.floor(Math.min.apply(null, todos) / 5) * 5;
    var t1 = Math.ceil(Math.max.apply(null, todos) / 5) * 5;
    if (t1 - t0 < 30) t1 = t0 + 30;

    var maxV = 240;
    pontos.forEach(function (p) {
      [p.s.pas, p.s.pad, p.s.fc].forEach(function (v) { if (v !== null && v > maxV) maxV = Math.ceil(v / 20) * 20; });
    });

    d.desenho(186, function (g) {
      var c = g.caixa;
      var x0 = c.x + 26, x1 = c.x + c.largura - 6, y0 = c.y + 30, y1 = c.y + c.altura - 12;
      function X(m) { return x0 + (m - t0) / (t1 - t0) * (x1 - x0); }
      function Y(v) { return y0 + v / maxV * (y1 - y0); }

      // Grade horizontal (20 em 20) e valores do eixo (40 em 40).
      for (var v = 0; v <= maxV; v += 20) {
        g.linha(x0, Y(v), x1, Y(v), { cor: v % 40 === 0 ? 0.82 : 0.9, espessura: 0.35 });
        if (v % 40 === 0) g.texto(x0 - 4, Y(v) - 2.4, String(v), { tam: 6.5, alinhar: 'direita', cinza: '0.4' });
      }

      // Grade vertical: passo que deixa os rótulos de hora legíveis.
      var passo = [5, 10, 15, 30, 60, 120].filter(function (p) { return (x1 - x0) / ((t1 - t0) / p) >= 7; })[0] || 120;
      var rotulo = [15, 30, 60, 120, 240].filter(function (p) { return p >= passo && (x1 - x0) / ((t1 - t0) / p) >= 30; })[0] || 240;
      for (var m = Math.ceil(t0 / passo) * passo; m <= t1; m += passo) {
        var marcado = ((m % rotulo) + rotulo) % rotulo === 0;
        g.linha(X(m), y0, X(m), y1, { cor: marcado ? 0.8 : 0.92, espessura: 0.35 });
        if (marcado) {
          var hm = ((((ref || 0) + m) % 1440) + 1440) % 1440;
          g.texto(X(m), y0 - 9, pad2(Math.floor(hm / 60)) + ':' + pad2(hm % 60), { tam: 6.5, alinhar: 'centro', cinza: '0.4' });
        }
      }
      g.retangulo(x0, y0, x1 - x0, y1 - y0, { contorno: 0.6, espessura: 0.5 });

      // Marcos da anestesia e da cirurgia.
      marcos.forEach(function (mk) {
        g.linha(X(mk.m), y0, X(mk.m), y1, { cor: 0.35, espessura: 0.6, tracejado: [2.5, 2] });
        g.texto(X(mk.m), y1 + 3, mk.sigla, { tam: 6.5, negrito: true, alinhar: 'centro', cinza: '0.25' });
      });

      // FC: pontos ligados.
      var fc = pontos.filter(function (p) { return p.s.fc !== null; }).map(function (p) { return [X(p.m), Y(p.s.fc)]; });
      g.polilinha(fc, { cor: COR_FC, espessura: 0.6 });
      fc.forEach(function (p) { g.circulo(p[0], p[1], 1.5, { cor: COR_FC }); });

      // PA: "v" na sistólica, "^" na diastólica, ligadas por um fio.
      pontos.forEach(function (p) {
        var x = X(p.m);
        if (p.s.pas !== null && p.s.pad !== null) g.linha(x, Y(p.s.pad), x, Y(p.s.pas), { cor: [0.85, 0.6, 0.6], espessura: 0.5 });
        if (p.s.pas !== null) g.marca(x, Y(p.s.pas), 'v', { cor: COR_PA });
        if (p.s.pad !== null) g.marca(x, Y(p.s.pad), '^', { cor: COR_PA });
      });

      // Legenda.
      var ly = c.y + 6, lx = x0;
      g.marca(lx + 3, ly + 1, 'v', { cor: COR_PA }); g.texto(lx + 9, ly - 1, 'PA sistólica', { tam: 6.5 });
      lx += 60;
      g.marca(lx + 3, ly + 3, '^', { cor: COR_PA }); g.texto(lx + 9, ly - 1, 'PA diastólica', { tam: 6.5 });
      lx += 64;
      g.circulo(lx + 3, ly + 1.5, 1.5, { cor: COR_FC }); g.texto(lx + 9, ly - 1, 'FC (bpm)', { tam: 6.5 });
      lx += 50;
      g.texto(lx, ly - 1, 'IA/TA: início e término da anestesia · IC/TC: início e término da cirurgia · mmHg / bpm',
        { tam: 6.5, cinza: '0.4' });
    });
  }

  /* -------------------------------------------------------- documento - */

  /**
   * Monta o PDF. `opcoes`: { clinica, crm (do cadastro, para o rascunho) }.
   * Devolve { documento, nome, rodape } — gerar() transforma em Blob.
   */
  function montar(b, cirurgia, opcoes) {
    opcoes = opcoes || {};
    var clinica = opcoes.clinica || {};
    var ident = identificacao(b, cirurgia, opcoes.crm);
    var r = resumoBoletim(b);
    var final = b.status === BOLETIM_FINALIZADO;
    var d = PDF.documento({ margem: 40, titulo: 'Boletim anestésico ' + b.id });

    /* Cabeçalho: clínica à esquerda, título à direita. */
    d.desenho(40, function (g) {
      var c = g.caixa, topo = c.y + c.altura;
      g.texto(c.x, topo - 12, clinica.nome || 'Clínica', { tam: 11, negrito: true });
      var linha2 = [clinica.cnpj ? 'CNPJ ' + clinica.cnpj : '', clinica.telefone || ''].filter(Boolean).join(' · ');
      if (linha2) g.texto(c.x, topo - 24, linha2, { tam: 7.5, cinza: '0.4' });
      if (clinica.endereco) g.texto(c.x, topo - 34, clinica.endereco, { tam: 7.5, cinza: '0.4' });
      g.texto(c.x + c.largura, topo - 13, 'BOLETIM ANESTÉSICO', { tam: 14, negrito: true, alinhar: 'direita' });
      g.texto(c.x + c.largura, topo - 25, b.id + ' · versão ' + b.versao + ' · cirurgia ' + ident.idCirurgia,
        { tam: 8, alinhar: 'direita', cinza: '0.35' });
      if (!final) {
        g.texto(c.x + c.largura, topo - 36, 'RASCUNHO — sem assinatura', { tam: 8, negrito: true, alinhar: 'direita', cor: COR_PA });
      }
    });

    d.secao('Identificação');
    var p = b.paciente;
    d.pares([
      ['Paciente', ident.paciente], ['Data da cirurgia', dataBR(ident.data)], ['Prontuário', p.prontuario],
      ['Procedimento', ident.procedimento], ['Cirurgião', ident.cirurgiao], ['Convênio · sala', [ident.convenio, ident.sala].filter(Boolean).join(' · ')],
      ['Anestesista', ident.anestesista], ['CRM', ident.crm], ['Idade · sexo', [valor(p.idade, ' anos'), p.sexo].filter(Boolean).join(' · ')],
      ['Peso', valor(p.peso, ' kg')], ['Altura', valor(p.altura, ' cm')], ['IMC', umaCasa(r.imc, ' kg/m²')]
    ], 3);

    d.secao('Avaliação pré-anestésica');
    var pre = b.pre;
    d.pares([
      ['ASA', pre.asa ? pre.asa + (pre.emergencia ? ' E (emergência)' : '') : ''], ['Jejum', valor(pre.jejum, ' h')],
      ['Mallampati', pre.mallampati], ['Via aérea difícil prevista', simNao(pre.viaAereaDificil)],
      ['Alergias', pre.alergias], ['Comorbidades', pre.comorbidades]
    ], 2);
    if (pre.medicacoes) d.pares([['Medicações em uso', pre.medicacoes]], 1);

    d.secao('Técnica, via aérea e monitorização');
    var va = b.viaAerea, ven = b.ventilacao;
    d.pares([
      ['Técnica anestésica', b.tecnicas.concat(b.tecnicaOutra ? [b.tecnicaOutra] : []).join(' + ')],
      ['Posição', b.posicoes.join(', ')],
      ['Via aérea', [va.dispositivo, va.tamanho ? 'nº ' + va.tamanho : ''].filter(Boolean).join(' · ')],
      ['Cormack-Lehane · tentativas', [va.cormack, va.tentativas ? va.tentativas + ' tentativa(s)' : ''].filter(Boolean).join(' · ')],
      ['Via aérea difícil', va.dificil ? 'Sim' + (va.obs ? ' — ' + va.obs : '') : (va.obs || 'Não')],
      ['Acessos', b.acesso],
      ['Ventilação', [ven.modo, ven.vc !== null ? 'VC ' + ven.vc + ' mL' : '', ven.fr !== null ? 'FR ' + ven.fr + ' irpm' : '',
        ven.peep !== null ? 'PEEP ' + ven.peep : '', ven.fio2 !== null ? 'FiO2 ' + ven.fio2 + '%' : ''].filter(Boolean).join(' · ')],
      ['Monitorização', b.monitorizacao.join(', ')]
    ], 2);

    d.secao('Horários', { direita: [r.duracaoAnestesia !== null ? 'anestesia ' + duracao(r.duracaoAnestesia) : '',
      r.duracaoCirurgia !== null ? 'cirurgia ' + duracao(r.duracaoCirurgia) : '',
      r.duracaoSala !== null ? 'sala ' + duracao(r.duracaoSala) : ''].filter(Boolean).join(' · ') });
    d.pares(TEMPOS_BOLETIM.map(function (t) { return [t.rotulo, b.tempos[t.campo]]; }), 6);

    d.secao('Sinais vitais', { direita: b.sinais.length + ' registro(s)' });
    if (b.sinais.length) {
      grafico(d, b);
      d.tabela([
        { rotulo: 'Hora', largura: 0.12 }, { rotulo: 'PA (mmHg)', largura: 0.2, alinhar: 'centro' },
        { rotulo: 'FC (bpm)', largura: 0.17, alinhar: 'centro' }, { rotulo: 'SpO2 (%)', largura: 0.17, alinhar: 'centro' },
        { rotulo: 'EtCO2 (mmHg)', largura: 0.17, alinhar: 'centro' }, { rotulo: 'Temp. (°C)', largura: 0.17, alinhar: 'centro' }
      ], b.sinais.map(function (s) {
        return [s.hora, s.pas !== null || s.pad !== null ? (s.pas === null ? '—' : s.pas) + '/' + (s.pad === null ? '—' : s.pad) : '',
          valor(s.fc), valor(s.spo2), valor(s.etco2), umaCasa(s.temp)];
      }), { tam: 8 });
    } else {
      d.texto('Nenhum registro.', { tam: 9, cinza: '0.4' });
    }

    d.secao('Fármacos', { direita: b.farmacos.length + ' administração(ões)' });
    if (b.farmacos.length) {
      d.tabela([
        { rotulo: 'Hora', largura: 0.12 }, { rotulo: 'Fármaco', largura: 0.44 },
        { rotulo: 'Dose', largura: 0.22, alinhar: 'direita' }, { rotulo: 'Via', largura: 0.22, alinhar: 'centro' }
      ], b.farmacos.map(function (f) { return [f.hora, f.nome, [f.dose, f.unidade].filter(Boolean).join(' '), f.via]; }));
    } else {
      d.texto('Nenhum registro.', { tam: 9, cinza: '0.4' });
    }

    d.secao('Fluidos e balanço', { direita: r.temBalanco ? 'balanço ' + (r.balanco > 0 ? '+' : '') + r.balanco + ' mL' : '' });
    if (b.fluidos.length) {
      d.tabela([{ rotulo: 'Fluido', largura: 0.7 }, { rotulo: 'Volume (mL)', largura: 0.3, alinhar: 'direita' }],
        b.fluidos.map(function (f) { return [f.nome, valor(f.volume)]; }));
    }
    d.pares([
      ['Entradas', r.entradas + ' mL'], ['Sangramento', valor(b.perdas.sangramento, ' mL')],
      ['Diurese', valor(b.perdas.diurese, ' mL')], ['Balanço', r.temBalanco ? (r.balanco > 0 ? '+' : '') + r.balanco + ' mL' : '']
    ], 4);

    d.secao('Intercorrências');
    if (b.intercorrencias.length) {
      d.tabela([{ rotulo: 'Hora', largura: 0.12 }, { rotulo: 'O que houve e conduta', largura: 0.88, quebrar: true }],
        b.intercorrencias.map(function (i) { return [i.hora, i.descricao]; }));
    } else {
      d.texto(b.semIntercorrencias ? 'Sem intercorrências.' : 'Não informado.', { tam: 9 });
    }

    d.secao('Recuperação e destino', { direita: r.aldrete !== null ? 'Aldrete ' + r.aldrete + '/10' +
      (r.aldrete >= ALDRETE_ALTA ? ' (critério de alta)' : '') : '' });
    d.pares([['Destino', b.destino], ['Alta da recuperação', b.recuperacao.horaAlta], ['Dor (0 a 10)', valor(b.recuperacao.dor)]], 3);
    d.tabela([{ rotulo: 'Aldrete e Kroulik', largura: 0.22 }, { rotulo: 'Avaliação', largura: 0.64 },
      { rotulo: 'Pontos', largura: 0.14, alinhar: 'centro' }],
      ALDRETE_ITENS.map(function (a) {
        var v = b.recuperacao[a.campo];
        return [a.rotulo, v === null ? 'não avaliado' : a.opcoes[v], v === null ? '—' : String(v)];
      }), { tam: 8 });

    if (b.observacoes) {
      d.secao('Observações');
      d.texto(b.observacoes, { tam: 9 });
    }

    /* Assinatura. */
    if (final && b.assinatura) {
      d.garantir(96);
      d.espaco(8);
      d.assinatura(b.assinatura.nome + (b.assinatura.crm ? ' — CRM ' + b.assinatura.crm : ''),
        'Assinado em ' + dataBR(b.assinatura.quando.slice(0, 10)) + ' ' + b.assinatura.quando.slice(11, 16) +
        ' · código de conferência ' + codigoLegivel(b.assinatura.codigo), b.assinatura.tracos);
    } else {
      d.espaco(8);
      d.assinatura('Anestesiologista responsável', 'Rascunho: o boletim ainda não foi assinado no sistema');
    }

    if (b.historico.length) {
      d.secao('Histórico de versões');
      d.tabela([
        { rotulo: 'Versão', largura: 0.09, alinhar: 'centro' }, { rotulo: 'Assinada em', largura: 0.17 },
        { rotulo: 'Código', largura: 0.2 }, { rotulo: 'Reaberta em · por', largura: 0.22 },
        { rotulo: 'Motivo', largura: 0.32, quebrar: true }
      ], b.historico.map(function (h) {
        return [String(h.versao), h.finalizadoEm, codigoLegivel(h.codigo), h.reabertoEm + (h.reabertoPor ? ' · ' + h.reabertoPor : ''), h.motivo];
      }), { tam: 7.5 });
    }

    function rodape(pagina, total) {
      return [
        'Boletim anestésico ' + b.id + ' · ' + (ident.paciente || '') + ' · ' + (dataBR(ident.data) || '') +
          (final ? ' · código ' + codigoLegivel(b.assinatura && b.assinatura.codigo) : ' · RASCUNHO'),
        'Página ' + pagina + ' de ' + total + ' · gerado em ' + dataBR(agoraTexto().slice(0, 10)) + ' ' + agoraTexto().slice(11, 16) +
          ' · ' + (clinica.nome || CONFIG.NOME_SISTEMA)
      ];
    }

    return { documento: d, nome: nomeArquivo(b, ident), rodape: rodape };
  }

  /** O PDF pronto (Blob) e o nome do arquivo. */
  function gerar(b, cirurgia, opcoes) {
    var m = montar(b, cirurgia, opcoes);
    return { blob: m.documento.blob(m.rodape), nome: m.nome };
  }

  /** O texto do PDF (para teste). */
  function fonte(b, cirurgia, opcoes) {
    var m = montar(b, cirurgia, opcoes);
    return m.documento.fonte(m.rodape);
  }

  return { gerar: gerar, fonte: fonte, nomeArquivo: nomeArquivo };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { BOLETIM_PDF: BOLETIM_PDF };
