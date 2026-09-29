/**
 * ============================================================================
 * TELA — Clínica e termo
 * ============================================================================
 * Identificação que sai no termo de consentimento (nome, CNPJ, endereço,
 * telefone, responsável técnico e CRM) e o TEXTO do termo, que a equipe pode
 * revisar e ajustar aqui, sem mexer em código. Cada alteração vai para o LOG.
 * ============================================================================
 */
'use strict';

TELAS.clinica = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao;

  function clinica(app) {
    var c = app.store.clinica();
    var textoAtual = c.textoTcle || TCLE_TEXTO.paragrafos.join('\n\n');
    var personalizado = !!c.textoTcle;

    var f = {
      nome: UI.campo({ rotulo: 'Nome da clínica / serviço', nome: 'nome', valor: c.nome || '', largo: true,
        exemplo: 'Ex.: Serviço de Anestesiologia — Clínica X' }),
      cnpj: UI.campo({ rotulo: 'CNPJ', nome: 'cnpj', valor: c.cnpj || '', exemplo: '00.000.000/0000-00' }),
      telefone: UI.campo({ rotulo: 'Telefone', nome: 'telefone', valor: c.telefone || '', exemplo: '(00) 0000-0000' }),
      endereco: UI.campo({ rotulo: 'Endereço', nome: 'endereco', valor: c.endereco || '', largo: true }),
      responsavel: UI.campo({ rotulo: 'Responsável técnico', nome: 'responsavel', valor: c.responsavel || '' }),
      crm: UI.campo({ rotulo: 'CRM do responsável', nome: 'crm', valor: c.crm || '', exemplo: '000000-UF' })
    };
    var form = UI.formulario([f.nome, f.cnpj, f.telefone, f.endereco, f.responsavel, f.crm]);

    var texto = el('textarea', { class: 'entrada', id: 'clinica-texto-tcle', rows: 18,
      style: 'font-size:13px;line-height:1.55' });
    texto.value = textoAtual;

    function salvar(textoTcle) {
      var d = form.dados();
      d.textoTcle = textoTcle;
      var r = app.store.salvarConfigClinica(d);
      if (!r.ok) {
        var soltos = form.mostrarErros(r.erros);
        if (soltos.length) UI.erro('Não foi possível salvar', soltos.join(' '));
        return false;
      }
      app.salvarEredesenhar();
      return true;
    }

    /** Texto igual ao padrão não é "personalizado": guarda vazio e segue o padrão. */
    function textoParaGuardar() {
      var t = texto.value.trim();
      return t === TCLE_TEXTO.paragrafos.join('\n\n').trim() ? '' : t;
    }

    return el('div', { class: 'pilha' }, [
      el('div', { class: 'aviso aviso-atencao', style: 'margin:0' }, [
        icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'O texto padrão do termo é um MODELO'),
          el('div', { class: 't-pq' },
            'Antes de usar com pacientes, o responsável técnico deve revisar (e, se possível, o jurídico), conforme a ' +
            'Resolução CFM nº 2.174/2017. Ajuste abaixo o que for preciso — o sistema passa a usar o texto de vocês.')
        ])
      ]),

      el('div', { class: 'cartao' }, [
        cab('Identificação da clínica', 'sai no cabeçalho e no rodapé do termo'),
        el('div', { class: 'cartao-corpo' }, [
          el('div', { class: 'campo-grupo' }, [f.nome.no]),
          el('div', { class: 'campo-grupo mt-3' }, [f.cnpj.no, f.telefone.no]),
          el('div', { class: 'campo-grupo mt-3' }, [f.endereco.no]),
          el('div', { class: 'campo-grupo mt-3' }, [f.responsavel.no, f.crm.no]),
          el('div', { class: 'linha mt-4' }, [
            el('button', { class: 'btn btn-primario', onclick: function () {
              if (salvar(textoParaGuardar())) UI.ok('Dados da clínica salvos');
            } }, [icone('check'), 'Salvar'])
          ])
        ])
      ]),

      el('div', { class: 'cartao' }, [
        cab('Texto do termo de consentimento', personalizado ? 'texto de vocês' : 'texto padrão (modelo)'),
        el('div', { class: 'cartao-corpo' }, [
          el('p', { class: 't-pq t-medio', style: 'margin-top:0' },
            'Cada parágrafo separado por uma linha em branco. A identificação do paciente, da cirurgia e as ' +
            'assinaturas o sistema coloca sozinho.'),
          texto,
          el('div', { class: 'linha mt-3', style: 'flex-wrap:wrap' }, [
            el('button', { class: 'btn btn-primario', onclick: function () {
              if (salvar(textoParaGuardar())) UI.ok('Texto do termo salvo', 'Os próximos termos já saem com ele.');
            } }, [icone('check'), 'Salvar texto']),
            el('button', { class: 'btn', onclick: function () {
              texto.value = TCLE_TEXTO.paragrafos.join('\n\n');
              if (salvar('')) UI.info('Texto padrão restaurado');
            } }, [icone('troca'), 'Voltar ao texto padrão']),
            el('button', { class: 'btn', onclick: function () {
              var c2 = Object.assign({}, form.dados(), { textoTcle: textoParaGuardar() });
              var blob = TCLE.gerar({ paciente: 'Paciente de exemplo', procedimento: 'Rinoplastia',
                dataCirurgia: hojeISO(), cirurgiao: 'Dr(a). Exemplo', anestesista: 'Anestesiologista' }, { clinica: c2 });
              ANEXOS.baixarBlob(blob, 'TCLE_exemplo.pdf');
            } }, [icone('baixar'), 'Ver termo de exemplo'])
          ])
        ])
      ])
    ]);
  }

  return { render: clinica };
})();
