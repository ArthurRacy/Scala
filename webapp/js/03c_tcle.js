/**
 * ============================================================================
 * 03C_TCLE — Termo de consentimento para anestesia, em PDF
 * ============================================================================
 * O TEXTO do termo mora em TCLE_TEXTO, logo abaixo, separado do código que
 * monta o PDF — para a equipe revisar e ajustar sem mexer em lógica.
 *
 * IMPORTANTE: é um MODELO. Antes de usar com pacientes, o texto deve ser
 * revisado pelo responsável técnico do serviço (e, se possível, pelo
 * jurídico), conforme a Resolução CFM nº 2.174/2017.
 * ============================================================================
 */
'use strict';

var TCLE_TEXTO = {
  titulo: 'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO PARA ANESTESIA',
  servico: 'Serviço de Anestesiologia',

  paragrafos: [
    'Eu, abaixo assinado(a), declaro que fui informado(a) de forma clara e em linguagem acessível, ' +
    'pelo(a) médico(a) anestesiologista, sobre o procedimento anestésico a que serei submetido(a) ' +
    'para a realização da cirurgia descrita acima.',

    'Fui esclarecido(a) de que a técnica anestésica — anestesia geral, anestesia regional ' +
    '(raquianestesia, peridural ou bloqueios de nervos), sedação e/ou anestesia local — será escolhida ' +
    'pelo(a) anestesiologista de acordo com as minhas condições clínicas e o tipo de cirurgia, podendo ' +
    'ser modificada ou associada a outras técnicas durante o procedimento sempre que necessário para a ' +
    'minha segurança.',

    'Entendi que toda anestesia envolve riscos. Os efeitos mais comuns, em geral passageiros, incluem ' +
    'náuseas, vômitos, dor de garganta, rouquidão, tremores, sonolência, dor de cabeça, dor ou hematoma ' +
    'no local da punção e retenção urinária. Complicações menos frequentes incluem reações alérgicas, ' +
    'lesões em dentes ou lábios durante a intubação, alterações da pressão arterial e do ritmo cardíaco, ' +
    'broncoaspiração e alterações neurológicas transitórias. Complicações graves, como parada ' +
    'cardiorrespiratória, lesão neurológica permanente ou óbito, são raras, mas possíveis.',

    'Comprometo-me a seguir as orientações recebidas, em especial o jejum pré-operatório e o uso ou a ' +
    'suspensão de medicamentos. Declaro ter informado com veracidade meu histórico de saúde, alergias, ' +
    'medicamentos em uso, cirurgias e anestesias anteriores e hábitos (tabagismo, álcool e outras ' +
    'substâncias), ciente de que omitir informações pode aumentar os riscos.',

    'Autorizo o(a) anestesiologista e sua equipe a realizar os procedimentos necessários ao controle da ' +
    'anestesia e ao tratamento de intercorrências, inclusive monitorização invasiva, acesso venoso ' +
    'central, transfusão de hemoderivados em situação de urgência e encaminhamento à unidade de terapia ' +
    'intensiva, se indicado.',

    'Tive a oportunidade de fazer perguntas, que foram respondidas de forma satisfatória. Sei que posso ' +
    'revogar este consentimento a qualquer momento antes do procedimento, sem prejuízo ao meu ' +
    'atendimento, conforme o Código de Ética Médica e a Resolução CFM nº 2.174/2017.'
  ]
};

var TCLE = (function () {

  function dataBRouLinha(iso) {
    return (typeof dataBR === 'function' && dataBR(iso)) || '____/____/________';
  }

  /** Parágrafos do termo: o texto da clínica (separado por linha em branco) ou o padrão. */
  function paragrafos(clinica) {
    var proprio = clinica && typeof clinica.textoTcle === 'string' ? clinica.textoTcle.trim() : '';
    if (!proprio) return TCLE_TEXTO.paragrafos;
    return proprio.split(/\n\s*\n/).map(function (p) { return p.replace(/\s*\n\s*/g, ' ').trim(); })
      .filter(function (p) { return p; });
  }

  /**
   * Monta o PDF do termo.
   *   dados:  { paciente, telefone, convenio, procedimento, dataCirurgia,
   *             cirurgiao, anestesista, dataAvaliacao, idCirurgia, idAvaliacao }
   *   opcoes: { clinica: { nome, cnpj, endereco, telefone, responsavel, crm, textoTcle },
   *             assinatura: { tracos, nome, documento, quando, codigo } }
   * Com `assinatura`, o termo sai assinado: os traços feitos na tela sobre a
   * linha do paciente, a data preenchida e um código de conferência.
   */
  function gerar(dados, opcoes) {
    dados = dados || {};
    opcoes = opcoes || {};
    var clinica = opcoes.clinica || {};
    var ass = opcoes.assinatura || null;
    var d = PDF.documento({ margem: 56, titulo: TCLE_TEXTO.titulo });

    d.texto(clinica.nome || TCLE_TEXTO.servico, { tam: clinica.nome ? 10.5 : 9, negrito: !!clinica.nome,
      alinhar: 'centro', cinza: clinica.nome ? null : '0.35', depois: 1 });
    var contato = [clinica.cnpj ? 'CNPJ ' + clinica.cnpj : '', clinica.endereco, clinica.telefone]
      .filter(function (x) { return x; }).join('  ·  ');
    if (contato) d.texto(contato, { tam: 8, alinhar: 'centro', cinza: '0.35', depois: 2 });
    d.espaco(4);
    d.texto(TCLE_TEXTO.titulo, { tam: 13, negrito: true, alinhar: 'centro', depois: 10 });
    d.regua({ depois: 6 });

    d.texto('IDENTIFICAÇÃO', { tam: 9, negrito: true, cinza: '0.35', depois: 0 });
    d.campo('Paciente', dados.paciente || '');
    if (dados.convenio) d.campo('Convênio', dados.convenio);
    d.campo('Procedimento / cirurgia', dados.procedimento || '');
    d.campo('Data prevista da cirurgia', dados.dataCirurgia ? dataBRouLinha(dados.dataCirurgia) : '');
    d.campo('Cirurgião', dados.cirurgiao || '');
    d.campo('Anestesiologista', dados.anestesista || '');
    if (dados.dataAvaliacao) d.campo('Avaliação pré-anestésica em', dataBRouLinha(dados.dataAvaliacao));
    d.espaco(6);
    d.regua({ depois: 8 });

    paragrafos(clinica).forEach(function (p) {
      d.texto(p, { tam: 9.5, entrelinha: 13.5, depois: 7 });
    });

    d.espaco(4);
    d.texto('Local e data: _____________________________________,  ' +
      (ass && ass.quando ? dataBRouLinha(ass.quando.slice(0, 10)) : '____/____/________'), { tam: 10 });

    d.assinatura('Paciente ou responsável legal',
      ass ? [ass.nome, ass.documento].filter(function (x) { return x; }).join('  ·  ')
          : 'Nome legível, RG/CPF e, se responsável, grau de parentesco',
      ass ? ass.tracos : null);
    d.assinaturasLado([
      { rotulo: 'Médico(a) anestesiologista', detalhe: 'Nome e CRM' },
      { rotulo: 'Testemunha', detalhe: 'Nome e RG/CPF' }
    ]);

    var ref = [dados.idCirurgia, dados.idAvaliacao].filter(Boolean).join(' / ');
    var hoje = typeof dataBR === 'function' ? dataBR(new Date()) : '';
    var rt = clinica.responsavel ? 'Responsável técnico: ' + clinica.responsavel + (clinica.crm ? ' — CRM ' + clinica.crm : '') : '';
    return d.blob(function (pag, total) {
      return [
        ass ? 'Assinado na tela em ' + ass.quando + (ass.codigo ? '  ·  código de conferência ' + ass.codigo : '') : '',
        [rt, 'Gerado em ' + hoje + (ref ? '  ·  ref. ' + ref : '') + '  ·  Página ' + pag + ' de ' + total]
          .filter(function (x) { return x; }).join('  ·  ')
      ].filter(function (x) { return x; });
    });
  }

  /** Nome de arquivo sem acento nem caractere proibido. */
  function nomeArquivo(dados) {
    var base = (typeof normalizar === 'function' ? normalizar(dados.paciente || 'paciente') : 'paciente')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'paciente';
    return 'TCLE_anestesia_' + base + '.pdf';
  }

  /** Dá para compartilhar arquivo pelo menu do sistema (WhatsApp, e-mail…)? */
  function podeCompartilhar() {
    if (typeof window !== 'undefined' && window.MODO_ONLINE) return false;   // a página publicada recusa o Web Share
    try {
      var teste = new File([new Blob(['%PDF'])], 'x.pdf', { type: 'application/pdf' });
      return !!(navigator.canShare && navigator.canShare({ files: [teste] }));
    } catch (e) { return false; }
  }

  function compartilhar(blob, nome, paciente) {
    var arquivo = new File([blob], nome, { type: 'application/pdf' });
    return navigator.share({
      files: [arquivo],
      title: 'Termo de consentimento — anestesia',
      text: 'Olá' + (paciente ? ', ' + String(paciente).split(' ')[0] : '') +
        '! Segue o termo de consentimento da anestesia para leitura e assinatura.'
    });
  }

  /**
   * Link para abrir a conversa com o paciente no WhatsApp (o PDF é anexado à
   * mão na conversa — o link só abre o chat com a mensagem pronta).
   * Devolve '' quando o telefone não tem DDD + número.
   */
  function linkWhatsApp(telefone, paciente, clinica) {
    var n = String(telefone || '').replace(/\D/g, '');
    if (n.length === 10 || n.length === 11) n = '55' + n;
    if (!/^55\d{10,11}$/.test(n)) return '';
    var primeiro = String(paciente || '').trim().split(/\s+/)[0] || '';
    var msg = 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Aqui é ' +
      ((clinica && clinica.nome) || 'o serviço de anestesiologia') +
      '. Vamos enviar o termo de consentimento da anestesia para você ler com calma antes da cirurgia.';
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
  }

  return { gerar: gerar, nomeArquivo: nomeArquivo, podeCompartilhar: podeCompartilhar, compartilhar: compartilhar,
    linkWhatsApp: linkWhatsApp, paragrafos: paragrafos };
})();
