/**
 * ============================================================================
 * 05B_PROCEDIMENTOS — Tipos de cirurgia e catálogo TUSS
 * ============================================================================
 * Vocabulário de procedimentos, separado das regras de cálculo da aba
 * CIRURGIAS (05_cirurgias.js): o catálogo muda por decisão clínica/comercial,
 * as fórmulas da planilha não. Módulos que mudam por motivos diferentes moram
 * em arquivos diferentes.
 *
 * Depende só de 02_util (normalizar). Não lê nem grava estado.
 * ============================================================================
 */

/* ==========================================================================
 * TIPOS DE CIRURGIA — classificação do PROCEDIMENTO/CIRURGIA (tabela TUSS)
 * ==========================================================================
 * A coluna PROCEDIMENTO/CIRURGIA continua texto livre (é assim na planilha).
 * O tipo é DEDUZIDO do texto, por palavra-chave ou pelo código TUSS escrito
 * nele — nada novo para digitar, e cirurgias antigas já entram no gráfico.
 *
 * Códigos TUSS (Terminologia Unificada da Saúde Suplementar, tabela 22)
 * conferidos na consulta pública da tabela. Vários procedimentos puramente
 * estéticos (ritidoplastia, lipoaspiração, mastopexia, gluteoplastia) NÃO têm
 * código próprio na TUSS — ficam com `tuss: []` e são reconhecidos pelo nome.
 *
 * A ORDEM importa: vence o primeiro tipo cujo termo aparece no texto. Por
 * isso "face completa" vem antes de "face" e "mastopexia" antes de "mama".
 * Termos com espaço nas pontas (' lipo ') só casam palavra inteira.
 * ========================================================================== */
var TIPO_CIRURGIA_OUTROS = 'Outros';

var TIPOS_CIRURGIA = [
  { tipo: 'Face completa',
    termos: ['face completa', 'facial completa', 'full face', 'lifting completo', 'ritidoplastia completa', 'ritidoplastia total'],
    sugestoes: ['Face completa', 'Ritidoplastia completa (face e pescoço)'],
    tuss: [] },
  { tipo: 'Face',
    termos: ['ritidoplast', 'ritidectom', 'lifting', ' face ', 'facial', 'frontoplast', 'cervicoplast', 'mentoplast', 'bichectom'],
    sugestoes: ['Ritidoplastia (face)', 'Mini lifting facial', 'Frontoplastia', 'Cervicoplastia', 'Mentoplastia'],
    tuss: [] },
  { tipo: 'Blefaroplastia',
    termos: ['blefaroplast', 'blefarocalaze', 'dermatocalaze', 'bolsas palpebrais', 'ptose palpebral', 'palpebra'],
    sugestoes: ['Blefaroplastia'],
    tuss: [
      { codigo: '30301106', descricao: 'Dermatocalaze ou blefarocalaze - unilateral' },
      { codigo: '30301092', descricao: 'Correção de bolsas palpebrais - unilateral' },
      { codigo: '30301181', descricao: 'Ptose palpebral - correção cirúrgica - unilateral' }
    ] },
  { tipo: 'Rinoplastia',
    termos: ['rinoplast', 'rinossept', 'septoplast', 'nariz'],
    sugestoes: ['Rinoplastia'],
    tuss: [
      { codigo: '30501342', descricao: 'Rinoplastia reparadora' },
      { codigo: '30501350', descricao: 'Rinosseptoplastia funcional' },
      { codigo: '30501369', descricao: 'Septoplastia (qualquer técnica sem vídeo)' }
    ] },
  { tipo: 'Transplante capilar',
    termos: ['transplante capilar', 'implante capilar', 'microenxerto', 'calvicie', 'alopecia', ' fue ', ' fut ', 'capilar'],
    sugestoes: ['Transplante capilar'],
    tuss: [
      { codigo: '30101158', descricao: 'Correção cirúrgica de sequelas de alopecia traumática com microenxertos pilosos (por região)' }
    ] },
  { tipo: 'Otoplastia',
    termos: ['otoplast', 'orelha'],
    sugestoes: ['Otoplastia'],
    tuss: [] },
  { tipo: 'Mastopexia',
    termos: ['mastopex'],
    sugestoes: ['Mastopexia', 'Mastopexia com prótese'],
    tuss: [] },
  { tipo: 'Ginecomastia',
    termos: ['ginecomast'],
    sugestoes: ['Ginecomastia'],
    tuss: [{ codigo: '30602114', descricao: 'Ginecomastia - unilateral' }] },
  { tipo: 'Mamoplastia',
    termos: ['mamoplast', 'mastoplast', 'protese mamaria', 'protese de mama', 'implante mamario',
             'hipertrofia mamaria', 'assimetria mamaria', ' mama ', ' mamas '],
    sugestoes: ['Mamoplastia de aumento', 'Mamoplastia redutora'],
    tuss: [
      { codigo: '30602351', descricao: 'Mamoplastia' },
      { codigo: '30602122', descricao: 'Correção da hipertrofia mamária - unilateral' },
      { codigo: '30602033', descricao: 'Correção cirúrgica da assimetria mamária' },
      { codigo: '30602262', descricao: 'Reconstrução da mama com prótese e/ou expansor' },
      { codigo: '30602327', descricao: 'Substituição de prótese mamária' }
    ] },
  { tipo: 'Abdominoplastia',
    termos: ['abdominoplast', 'dermolipectom', 'abdome em avental', 'diastase'],
    sugestoes: ['Abdominoplastia', 'Miniabdominoplastia'],
    tuss: [{ codigo: '30101271', descricao: 'Dermolipectomia para correção de abdome em avental' }] },
  { tipo: 'Braquioplastia',
    termos: ['braquioplast', 'braquial', ' braco ', ' bracos '],
    sugestoes: ['Braquioplastia'],
    tuss: [{ codigo: '30101190', descricao: 'Correção de lipodistrofia braquial, crural ou trocanteriana de membros superiores e inferiores' }] },
  { tipo: 'Cruroplastia',
    termos: ['cruroplast', 'crural', ' coxa ', ' coxas '],
    sugestoes: ['Cruroplastia (coxas)'],
    tuss: [] },
  { tipo: 'Gluteoplastia',
    termos: ['gluteoplast', 'gluteo'],
    sugestoes: ['Gluteoplastia'],
    tuss: [] },
  { tipo: 'Lipoaspiração',
    termos: ['lipoaspir', 'lipoescultura', 'lipoenxert', ' lipo '],
    sugestoes: ['Lipoaspiração', 'Lipoescultura', 'Lipoenxertia'],
    tuss: [] }
];

/** Texto em minúsculas, sem acento e sem pontuação, com espaço nas pontas. */
function textoParaTipo_(v) {
  return ' ' + normalizar(v).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

/**
 * Tipo de uma cirurgia a partir do texto do procedimento.
 * Um código TUSS escrito no texto decide antes das palavras-chave.
 */
function classificarTipoCirurgia(procedimento) {
  var alvo = textoParaTipo_(procedimento);
  if (alvo.trim() === '') return TIPO_CIRURGIA_OUTROS;

  var i, j;
  for (i = 0; i < TIPOS_CIRURGIA.length; i++) {
    var codigos = TIPOS_CIRURGIA[i].tuss;
    for (j = 0; j < codigos.length; j++) {
      if (alvo.indexOf(' ' + codigos[j].codigo + ' ') >= 0) return TIPOS_CIRURGIA[i].tipo;
    }
  }
  for (i = 0; i < TIPOS_CIRURGIA.length; i++) {
    var termos = TIPOS_CIRURGIA[i].termos;
    for (j = 0; j < termos.length; j++) {
      if (alvo.indexOf(termos[j]) >= 0) return TIPOS_CIRURGIA[i].tipo;
    }
  }
  return TIPO_CIRURGIA_OUTROS;
}

/**
 * Sugestões para o campo PROCEDIMENTO/CIRURGIA: os nomes usuais e, quando
 * existe, a descrição TUSS com o código entre parênteses.
 */
function sugestoesProcedimento() {
  var out = [];
  TIPOS_CIRURGIA.forEach(function (t) {
    t.sugestoes.forEach(function (s) { out.push({ valor: s, tipo: t.tipo }); });
    t.tuss.forEach(function (x) {
      out.push({ valor: x.descricao + ' (TUSS ' + x.codigo + ')', tipo: t.tipo, codigo: x.codigo });
    });
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIPOS_CIRURGIA: TIPOS_CIRURGIA,
    TIPO_CIRURGIA_OUTROS: TIPO_CIRURGIA_OUTROS,
    classificarTipoCirurgia: classificarTipoCirurgia,
    sugestoesProcedimento: sugestoesProcedimento
  };
}
