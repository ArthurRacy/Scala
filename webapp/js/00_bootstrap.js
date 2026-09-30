/**
 * ============================================================================
 * 00_BOOTSTRAP — Ponte entre o core e o navegador
 * ============================================================================
 * Os módulos do core foram escritos para viver no escopo GLOBAL: é assim que o
 * Google Apps Script funciona e é assim que uma sequência de <script> funciona.
 * No Node.js, `core/index.js` recria esse mesmo ambiente publicando tudo em
 * globalThis.
 *
 * Nas telas existe código como `core.totaisHoras(...)`, escrito para ser lido
 * igual nos testes (onde `core` é o módulo) e no navegador. Aqui `core` é
 * apenas um apelido para o objeto global — onde as funções do core realmente
 * estão depois que as <script> carregam. Sem cópia, sem duplicação de estado.
 * ============================================================================
 */
'use strict';

var core = window;

/**
 * Marca no <html> se isto é um celular DE VERDADE — não uma janela estreita.
 *
 * A diferença importa: o layout de celular (gaveta no lugar da barra lateral,
 * uma coluna, topo compacto) deve aparecer no telefone, e não quando alguém
 * estreita a janela no computador. Por isso a conta usa o TAMANHO FÍSICO da
 * tela (screen), que não muda ao redimensionar a janela, somado aos sinais de
 * entrada por toque.
 *
 * `?dispositivo=celular` na URL força o modo, para conseguir conferir o layout
 * de telefone sem ter um telefone na mão.
 */
(function marcarDispositivo() {
  var forcado = (String(location.search).match(/[?&]dispositivo=(celular|desktop)/) || [])[1];

  var celular = false;
  if (forcado) {
    celular = forcado === 'celular';
  } else if (window.matchMedia && window.screen) {
    var toque = window.matchMedia('(pointer: coarse)').matches &&
                window.matchMedia('(hover: none)').matches;
    var telaPequena = Math.min(screen.width || 0, screen.height || 0) <= 768;
    celular = toque && telaPequena;
  }

  document.documentElement.setAttribute('data-dispositivo', celular ? 'celular' : 'desktop');
})();

/**
 * Verificação de carga: se alguma <script> do core não veio, a tela mostraria
 * um erro obscuro ("X is not a function") no primeiro clique. Melhor falhar
 * agora, dizendo exatamente o que falta.
 */
(function conferirCore() {
  var obrigatorios = [
    'CONFIG', 'SCHEMA', 'DOMINIOS',
    'paraData', 'paraHora', 'duracaoMinutos', 'chaveDataPosicao',
    'indexarEscalaBase', 'gerarEscalaMensal', 'gerarConsolidada', 'indexarConsolidada',
    'recalcularCirurgia', 'sincronizarAvaliacoes',
    'calcularHoras', 'montarLedger', 'calcularFinanceiro',
    'indicadoresDoAnestesista', 'montarDashboard',
    'diffParaLog', 'criarStore', 'estadoVazio',
    // Um símbolo de cada arquivo restante do core: script que não carregou (rede,
    // disco) derrubava a partida mais adiante, com tela vazia e sem mensagem.
    'chaveMes', 'classificarTipoCirurgia', 'novoUid', 'lerBoletim', 'leitorQualidade',
    'ITENS_ESTRUTURA', 'calcularRepasse', 'configQualidadePadrao', 'copiasParaApagar', 'calcularDashboard'
  ];

  var faltando = obrigatorios.filter(function (n) { return typeof window[n] === 'undefined'; });
  if (faltando.length === 0) return;
  window.CORE_INCOMPLETO = true;   // a partida não tenta abrir o sistema por cima desta mensagem

  document.addEventListener('DOMContentLoaded', function () {
    document.body.innerHTML =
      '<div style="max-width:640px;margin:56px auto;padding:24px;font:14px/1.6 system-ui,sans-serif;' +
      'border:1px solid #e3e7ec;border-radius:14px;background:#fff;color:#0f1721">' +
      '<h1 style="font-size:19px;margin:0 0 12px">Falha ao carregar o sistema</h1>' +
      '<p style="margin:0 0 12px">Estes módulos do core não foram encontrados:</p>' +
      '<pre style="background:#f6f7f9;padding:12px;border-radius:8px;overflow:auto;margin:0 0 12px">' +
      faltando.join('\n') + '</pre>' +
      '<p style="margin:0 0 8px"><strong>Causa provável:</strong> a página foi aberta direto do disco ' +
      '(<code>file://</code>) e o navegador bloqueou os arquivos, ou a pasta <code>core/</code> não está ' +
      'ao lado da pasta <code>webapp/</code>.</p>' +
      '<p style="margin:0"><strong>Como resolver:</strong> abra um terminal na pasta do projeto e rode ' +
      '<code>python tools/servir.py</code>. O sistema abre em ' +
      '<a href="http://localhost:8080/webapp/">http://localhost:8080/webapp/</a>.</p>' +
      '</div>';
  });
})();
