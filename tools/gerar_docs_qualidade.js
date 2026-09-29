#!/usr/bin/env node
/**
 * ============================================================================
 * gerar_docs_qualidade.js — Catálogo de indicadores, para a aprovação clínica
 * ============================================================================
 * Escreve docs/QUALIDADE_INDICADORES.md a partir do que o SISTEMA usa
 * (core/06c e core/09c), nunca de texto copiado à mão. É o documento que o
 * responsável técnico de anestesiologia lê para aprovar: para cada evento
 * clínico e cada indicador, o que é, como se calcula e a quem se aplica.
 * Como sai do código, não pode divergir dele.
 *
 *   node tools/gerar_docs_qualidade.js
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var core = require(path.join(__dirname, '..', 'core'));

var L = [];
function p(t) { L.push(t === undefined ? '' : t); }

var cfg = core.LIMIARES_QUALIDADE_PADRAO;
function n(v) { return String(v).replace('.', ','); }

p('# Indicadores de qualidade e segurança — catálogo para aprovação');
p();
p('> Gerado por `node tools/gerar_docs_qualidade.js` a partir do código. Não edite à mão: mude o');
p('> catálogo em `core/06c_qualidade.js` ou `core/09c_qualidade_painel.js` e gere de novo.');
p();
p('Este documento existe para uma decisão: **o responsável técnico de anestesiologia confere se cada');
p('definição, população elegível e limiar corresponde ao protocolo da instituição** — e só então o');
p('módulo entra em uso. Nada aqui está classificado como exigência da SBA, da ANVISA, do Patient Safety');
p('Movement ou de qualquer outra entidade; quando houver referência, ela é registrada na tela');
p('*Painel de qualidade → Configuração clínica*, com **fonte, versão e data de revisão**, indicador por');
p('indicador.');
p();

p('## Como ler os números');
p();
p('| Termo | Significado |');
p('|---|---|');
p('| **Elegíveis** | Atendimentos da população do indicador (ex.: capnografia só entra se foi indicada). |');
p('| **Com informação** | Elegíveis com resposta "Sim" ou "Não" — é o **denominador** da taxa. |');
p('| **Eventos** | Elegíveis com "Sim" (desfecho ocorreu / processo foi cumprido) — é o **numerador**. |');
p('| **Sem informação** | Elegíveis sem resposta ou com "Não avaliado/sem informação". Ficam **fora do numerador e do denominador** e são contados à parte. |');
p('| **Sem acompanhamento** | Parte dos "sem informação" cuja janela (24 h, 48 h ou 30 dias) já venceu sem resposta. |');
p('| **Taxa** | Eventos ÷ com informação × 100. Sem denominador, não há taxa (aparece "—", nunca 0%). |');
p();
p('**"Não se aplica" tira o atendimento da população elegível** (não entra em nada). **Campo em branco nunca');
p('é lido como "não houve evento".** A atribuição de um evento à anestesia é um campo separado,');
p('preenchido por avaliação clínica, e o sistema não presume causalidade.');
p();

p('## Limiares clínicos (configuráveis)');
p();
p('Valores de partida do sistema — **não são norma**. A coordenação os altera, o responsável técnico os');
p('aprova, e cada mudança vai para o LOG de auditoria.');
p();
p('| Limiar | Valor padrão | Usado em |');
p('|---|---|---|');
p('| SpO₂ mínima aceitável | ' + n(cfg.spo2) + ' % | Hipoxemia intraoperatória |');
p('| PAM mínima aceitável | ' + n(cfg.pam) + ' mmHg | Hipotensão intraoperatória |');
p('| PA sistólica de hipertensão grave | ' + n(cfg.pasGrave) + ' mmHg | Referência do registro de hipertensão grave |');
p('| Temperatura mínima na chegada à SRPA | ' + n(cfg.temperatura) + ' °C | Hipotermia na chegada à SRPA |');
p('| Pontuação de dor forte | acima de ' + n(cfg.dor) + ' | Dor forte na SRPA (destaque na ficha) |');
p('| Relação TOF adequada | ' + n(cfg.tof) + ' ou mais | Relação TOF adequada antes da saída |');
p('| Jejum mínimo para sólidos | ' + n(cfg.jejumSolidos) + ' h | Jejum pré-operatório adequado |');
p('| Jejum mínimo para líquidos | ' + n(cfg.jejumLiquidos) + ' h | Jejum pré-operatório adequado |');
p('| Janela do antibiótico | 0 a ' + n(cfg.antibioticoJanela) + ' min antes da incisão | Profilaxia antibiótica no tempo |');
p();

var grupos = core.gruposQualidade();
p('## Indicadores (' + core.INDICADORES_QUALIDADE.length + ')');
p();
p('Desfecho: **menor é melhor**. Processo: **maior é melhor**. A coluna *Acompanhamento* indica de qual');
p('janela posterior o indicador depende.');
p();

var janelaRotulo = { h24: '24 horas', h48: '48 horas', d30: '30 dias' };

grupos.forEach(function (g) {
  p('### ' + g);
  p();
  core.INDICADORES_QUALIDADE.filter(function (i) { return i.grupo === g; }).forEach(function (i) {
    p('#### ' + i.nome);
    p();
    p('- **Tipo:** ' + (i.tipo === 'processo' ? 'processo (maior é melhor)' : 'desfecho (menor é melhor)'));
    p('- **Definição:** ' + i.definicao);
    p('- **Fórmula:** ' + i.formula);
    p('- **População elegível:** ' + (i.elegibilidade || 'Todos os atendimentos com ficha de qualidade.'));
    p('- **Acompanhamento:** ' + (i.janela ? janelaRotulo[i.janela] : 'não depende de janela posterior'));
    p('- **Chave técnica:** `' + i.chave + '`');
    p();
  });
});

p('## Eventos clínicos registrados (' + core.EVENTOS_QUALIDADE.length + ')');
p();
p('Cada evento tem uma pergunta de quatro opções (Sim, Não, Não se aplica, Não avaliado/sem informação) que');
p('**nasce sem resposta**. Quando a resposta é "Sim", o formulário abre os campos: **data e horário,');
p('descrição, gravidade, conduta adotada, evolução, relação com a anestesia e situação da investigação**,');
p('mais os campos próprios do evento (abaixo). O mesmo tipo de evento pode ser registrado mais de uma vez no');
p('mesmo atendimento. Eventos marcados com *(só anestesia geral)* não aparecem nem são cobrados em');
p('atendimentos sem anestesia geral.');
p();
p('| Evento | Etapa | Campos próprios |');
p('|---|---|---|');
var etapas = {};
core.ETAPAS_QUALIDADE.forEach(function (e) { etapas[e.chave] = e.rotulo; });
core.EVENTOS_QUALIDADE.forEach(function (e) {
  p('| ' + e.rotulo + (e.aplicaA === 'geral' ? ' *(só anestesia geral)*' : '') + ' | ' + (etapas[e.etapa] || e.etapa) +
    ' | ' + (e.campos.length ? e.campos.map(function (c) { return c.rotulo; }).join('; ') : '—') + ' |');
});
p();

p('## Listas de escolha');
p();
p('Gravidade: ' + core.OPCOES_QUALIDADE.gravidade.join(', ') + '.');
p();
p('Relação com a anestesia (avaliação clínica): ' + core.OPCOES_QUALIDADE.relacao.join(', ') + '.');
p();
p('Situação da investigação: ' + core.OPCOES_QUALIDADE.investigacao.join(', ') + '.');
p();
p('Confirmação na revisão clínica: ' + core.OPCOES_QUALIDADE.confirmacao.join(', ') + '.');
p();

p('## Faixas de validação (só barram erro de digitação)');
p();
p('| Campo | Faixa aceita |');
p('|---|---|');
Object.keys(core.LIMITES_QUALIDADE).forEach(function (k) {
  var l = core.LIMITES_QUALIDADE[k];
  p('| ' + l.rotulo + ' | ' + n(l.min) + ' a ' + n(l.max) + (l.unidade ? ' ' + l.unidade : '') + ' |');
});
p();
p('São faixas de sanidade, **não alarmes clínicos**: valor extremo mas possível passa.');
p();

var saida = path.join(__dirname, '..', 'docs', 'QUALIDADE_INDICADORES.md');
fs.writeFileSync(saida, L.join('\n'), 'utf8');
console.log('Escrito ' + saida + ' (' + core.INDICADORES_QUALIDADE.length + ' indicadores, ' +
  core.EVENTOS_QUALIDADE.length + ' eventos).');
