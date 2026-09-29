/**
 * ============================================================================
 * 02_UTIL — Datas, horas, durações, dinheiro e chaves compostas
 * ============================================================================
 * Regras de representação canônica do sistema (decididas para casar com a
 * planilha sem ambiguidade):
 *
 *   data    -> string 'YYYY-MM-DD'  (nunca objeto Date; imune a fuso horário)
 *   hora    -> string 'HH:MM'       (24h)
 *   duracao -> number em HORAS decimais (6.5 = 6h30)
 *   moeda   -> number em reais
 *
 * A planilha guarda duração como fração de dia (MOD(fim-início,1)). A conversão
 * mora só aqui: `horasParaFracaoDia` / `fracaoDiaParaHoras`. Nenhum outro módulo
 * precisa saber disso.
 * ============================================================================
 */

/* ------------------------------------------------------------------ texto -- */

/** Texto aparado; null/undefined viram ''. */
function txt(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** true se o valor é vazio para efeito de planilha ('' ou null). */
function vazio(v) {
  return txt(v) === '';
}

/** Normaliza para comparação: sem acento, minúsculo, espaços colapsados. */
function normalizar(v) {
  var s = txt(v).toLowerCase();
  var de = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
  var para = 'aaaaaeeeeiiiiooooouuuucn';
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var j = de.indexOf(s[i]);
    out += (j >= 0) ? para[j] : s[i];
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Compara dois textos ignorando acento/caixa/espaço. */
function mesmoTexto(a, b) {
  return normalizar(a) === normalizar(b);
}

/** Inteiro com 2 dígitos. */
function pad2(n) {
  n = Number(n);
  return (n < 10 ? '0' : '') + n;
}

/* ------------------------------------------------------------------ datas -- */

var MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Converte qualquer entrada razoável para 'YYYY-MM-DD'.
 * Aceita: 'YYYY-MM-DD', 'DD/MM/YYYY', Date, e serial de data do Excel.
 * Devolve '' se não der para interpretar.
 */
function paraData(v) {
  if (v === null || v === undefined || v === '') return '';

  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
  }

  if (typeof v === 'number' && isFinite(v)) {
    // Serial do Excel: dia 1 = 1900-01-01, com o bug do ano 1900 embutido.
    var ms = Math.round((v - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  var s = txt(v);
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);

  return '';
}

/** true se 'YYYY-MM-DD' existe de verdade no calendário. */
function dataValida(iso) {
  var s = paraData(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-');
  var a = Number(p[0]), me = Number(p[1]), d = Number(p[2]);
  if (me < 1 || me > 12 || d < 1) return false;
  return d <= diasNoMes(a, me);
}

/** Quantidade de dias do mês. */
function diasNoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Mês (1-12) de uma data ISO; '' se inválida. */
function mesDe(iso) {
  var s = paraData(iso);
  return s ? Number(s.slice(5, 7)) : '';
}

/** Ano de uma data ISO; '' se inválida. */
function anoDe(iso) {
  var s = paraData(iso);
  return s ? Number(s.slice(0, 4)) : '';
}

/**
 * Dia da semana em português MAIÚSCULO, no mesmo vocabulário da planilha
 * (CHOOSE(WEEKDAY(data,2),...)): SEGUNDA-FEIRA ... SÁBADO, DOMINGO.
 */
var DIAS_SEMANA = ['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA',
  'SEXTA-FEIRA', 'SÁBADO', 'DOMINGO'];

function diaDaSemana(iso) {
  var s = paraData(iso);
  if (!s) return '';
  var p = s.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  // getUTCDay(): 0=domingo. WEEKDAY(...,2): 1=segunda.
  var idx = (d.getUTCDay() + 6) % 7;
  return DIAS_SEMANA[idx];
}

/** Data ISO -> 'DD/MM/YYYY' para exibição. */
function dataBR(iso) {
  var s = paraData(iso);
  if (!s) return '';
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

/** Data ISO -> objeto Date em UTC (evita deslocamento de fuso). */
function dataParaUTC(iso) {
  var s = paraData(iso);
  if (!s) return null;
  var p = s.split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
}

/** Quantidade de dias de `de` até `ate` (negativo se `ate` for anterior). */
function diasEntre(de, ate) {
  var a = dataParaUTC(de), b = dataParaUTC(ate);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Soma `n` dias a uma data ISO e devolve ISO. */
function somarDias(iso, n) {
  var d = dataParaUTC(iso);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + Number(n));
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/**
 * Primeira data >= `de` que cai no dia da semana pedido.
 * primeiraOcorrencia('2026-10-01','SEGUNDA-FEIRA') -> '2026-10-05'
 */
function primeiraOcorrencia(de, nomeDiaSemana) {
  var base = paraData(de);
  if (!base) return '';
  for (var i = 0; i < 7; i++) {
    var cand = somarDias(base, i);
    if (diaDaSemana(cand) === nomeDiaSemana) return cand;
  }
  return '';
}

/** Lista de datas ISO de um mês, de segunda a sábado (pula domingo). */
function datasUteisDoMes(ano, mes) {
  var out = [];
  var total = diasNoMes(ano, mes);
  for (var d = 1; d <= total; d++) {
    var iso = ano + '-' + pad2(mes) + '-' + pad2(d);
    if (diaDaSemana(iso) !== 'DOMINGO') out.push(iso);
  }
  return out;
}

/* ------------------------------------------------------------------ horas -- */

/**
 * Converte para 'HH:MM'. Aceita 'HH:MM', 'HH:MM:SS', 'H:MM', Date,
 * e fração de dia do Excel (0.5 = 12:00). Devolve '' se não interpretar.
 */
function paraHora(v) {
  if (v === null || v === undefined || v === '') return '';

  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return pad2(v.getHours()) + ':' + pad2(v.getMinutes());
  }

  if (typeof v === 'number' && isFinite(v)) {
    var frac = v - Math.floor(v);          // ignora a parte de data
    var mins = Math.round(frac * 24 * 60);
    if (mins >= 1440) mins = mins % 1440;
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }

  var s = txt(v);
  var m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return '';
  var h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return '';
  return pad2(h) + ':' + pad2(mi);
}

/** 'HH:MM' -> minutos desde a meia-noite; null se vazio/inválido. */
function horaParaMinutos(v) {
  var s = paraHora(v);
  if (!s) return null;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

/* --------------------------------------------------------------- durações -- */

/**
 * Duração entre duas horas, em MINUTOS inteiros.
 * Replica MOD(fim-início,1) da planilha: se o fim é menor que o início, a
 * cirurgia cruzou a meia-noite e a duração dá a volta no dia.
 * Devolve null quando falta um dos lados (equivale ao "" das fórmulas).
 *
 * Esta é a unidade CANÔNICA de acumulação no sistema. Toda hora digitada é
 * HH:MM, então a duração é sempre um número inteiro de minutos — somar
 * minutos é exato, enquanto somar horas fracionárias (10/60 = 0,1666...)
 * acumula erro de arredondamento a cada parcela.
 */
function duracaoMinutos(inicio, fim) {
  var a = horaParaMinutos(inicio);
  var b = horaParaMinutos(fim);
  if (a === null || b === null) return null;
  var diff = b - a;
  if (diff < 0) diff += 1440;            // virada de meia-noite
  return diff;
}

/**
 * Duração entre duas horas, em HORAS decimais.
 * Sem arredondamento: o arredondamento acontece só na exibição ou depois de
 * somar, nunca por parcela.
 */
function duracaoHoras(inicio, fim) {
  var m = duracaoMinutos(inicio, fim);
  return m === null ? null : m / 60;
}

/** Minutos -> horas decimais (null-safe). */
function minutosParaHoras(m) {
  if (m === null || m === undefined || m === '') return null;
  return Number(m) / 60;
}

/** Horas decimais -> minutos arredondados ao inteiro (null-safe). */
function horasParaMinutos(h) {
  if (h === null || h === undefined || h === '') return null;
  return Math.round(Number(h) * 60);
}

/** Horas decimais -> fração de dia (formato nativo da planilha). */
function horasParaFracaoDia(h) {
  if (h === null || h === undefined || h === '') return '';
  return Number(h) / 24;
}

/** Fração de dia -> horas decimais. */
function fracaoDiaParaHoras(f) {
  if (f === null || f === undefined || f === '') return null;
  return Number(f) * 24;
}

/** Horas decimais -> 'HHh MM' para exibição ('' quando null). */
function horasTexto(h) {
  if (h === null || h === undefined || h === '') return '';
  var total = Math.round(Number(h) * 60);
  var sinal = total < 0 ? '-' : '';
  total = Math.abs(total);
  return sinal + Math.floor(total / 60) + 'h' + (total % 60 ? ' ' + pad2(total % 60) : '');
}

/** Horas decimais -> '[h]:mm', igual ao que a planilha mostra. */
function horasHHMM(h) {
  if (h === null || h === undefined || h === '') return '';
  var total = Math.round(Number(h) * 60);
  // Sinal à parte: sem isso, -30 min saía "-1:-30".
  var sinal = total < 0 ? '-' : '';
  total = Math.abs(total);
  return sinal + Math.floor(total / 60) + ':' + pad2(total % 60);
}

/* ------------------------------------------------------------------ moeda -- */

/**
 * Converte para número. Aceita 'R$ 1.234,56', '1234.56', 1234.56.
 * Devolve null quando vazio — importante para distinguir "zero" de "não
 * preenchido" (o ledger da planilha ignora linha com VALOR em branco).
 */
function paraNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;

  var s = txt(v).replace(/[R$\s ]/g, '');
  if (s === '') return null;
  // 1.234,56 (pt-BR) -> 1234.56 ; 1234.56 (en) fica como está.
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  // Só pontos em grupos de três ("1.500", "1.250.000"): é milhar do pt-BR,
  // não decimal — "1.500" lido como 1,5 transformaria R$ 1.500 em R$ 1,50.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/** Soma tratando null como zero. */
function soma(a, b) {
  return (paraNumero(a) || 0) + (paraNumero(b) || 0);
}

/** Número -> 'R$ 1.234,56'. */
function moedaBR(v) {
  var n = paraNumero(v);
  if (n === null) return '';
  var neg = n < 0;
  // Trabalha em centavos inteiros: 1234,999 arredonda para 1.235,00 (antes
  // saía "1.234,100", porque os centavos viravam 100 sem passar para o real).
  var centavos = Math.round((Math.abs(n) + Number.EPSILON) * 100);
  if (centavos === 0) neg = false;
  var inteiro = Math.floor(centavos / 100).toString();
  var cent = pad2(centavos % 100);
  var comPonto = '';
  for (var i = 0; i < inteiro.length; i++) {
    if (i > 0 && (inteiro.length - i) % 3 === 0) comPonto += '.';
    comPonto += inteiro[i];
  }
  return (neg ? '-' : '') + 'R$ ' + comPonto + ',' + cent;
}

/** Arredonda para 2 casas, evitando ruído de ponto flutuante. */
function arredondar2(v) {
  var n = paraNumero(v);
  if (n === null) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Arredonda horas para 4 casas (precisão de segundos e sobra). */
function arredondar4(v) {
  var n = paraNumero(v);
  if (n === null) return null;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/* --------------------------------------------------------------- booleano -- */

/** Normaliza qualquer verdade para o literal 'Sim'/'Não' da planilha. */
function paraSimNao(v) {
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  var n = normalizar(v);
  if (n === '') return '';
  if (n === 'sim' || n === 's' || n === 'true' || n === '1' || n === 'x') return 'Sim';
  if (n === 'nao' || n === 'n' || n === 'false' || n === '0') return 'Não';
  return txt(v);
}

/** true apenas para 'Sim' (em qualquer caixa/acento). */
function ehSim(v) {
  return normalizar(v) === 'sim';
}

/* ---------------------------------------------------- chaves compostas ----- */

/**
 * CHAVE DATA+POSIÇÃO — exatamente TEXT(data,"YYYY-MM-DD")&"|"&posição.
 * Usada para achar quem está na posição N de um dia.
 */
function chaveDataPosicao(data, posicao) {
  var d = paraData(data);
  if (!d || vazio(posicao)) return '';
  return d + '|' + Number(posicao);
}

/**
 * CHAVE DATA+ANESTESISTA — TEXT(data,"YYYY-MM-DD")&"|"&nome.
 * Atenção: a planilha usa o NOME (não o ID). Mantido idêntico.
 */
function chaveDataAnestesista(data, nome) {
  var d = paraData(data);
  var n = txt(nome);
  if (!d || !n) return '';
  return d + '|' + n;
}

/** Chave de competência 'YYYY-MM' para agrupar por mês. */
function chaveCompetencia(mes, ano) {
  if (vazio(mes) || vazio(ano)) return '';
  return Number(ano) + '-' + pad2(mes);
}

/* --------------------------------------------------------------------- ID -- */

/**
 * Gera o próximo ID sequencial com prefixo e zero-padding.
 * proximoId('CIR', ['CIR0001','CIR0007']) -> 'CIR0008'
 */
function proximoId(prefixo, existentes, largura, piso) {
  largura = largura || 4;
  // `piso`: maior número já emitido alguma vez (mesmo que a linha tenha sido
  // apagada). Garante que um ID nunca volta a ser usado por outro registro —
  // senão o LOG de "C0010 excluída" passaria a falar de outra cirurgia.
  var maior = Number(piso) || 0;
  var re = new RegExp('^' + prefixo + '(\\d+)$');
  (existentes || []).forEach(function (id) {
    var m = re.exec(txt(id));
    if (m) {
      var n = Number(m[1]);
      if (n > maior) maior = n;
    }
  });
  var s = String(maior + 1);
  while (s.length < largura) s = '0' + s;
  return prefixo + s;
}

/** Parte numérica de um ID ("C0012" -> 12); 0 quando não casa o prefixo. */
function numeroDoId(prefixo, id) {
  var m = new RegExp('^' + prefixo + '(\\d+)$').exec(txt(id));
  return m ? Number(m[1]) : 0;
}

/* ------------------------------------------------- contexto de execução -- */

/**
 * Relógio e sorteio de uma operação. No modo servidor, cada comando roda
 * primeiro no navegador e depois de novo no servidor; para os dois chegarem
 * EXATAMENTE ao mesmo estado (mesmo LOG, mesmos uid), o comando leva junto a
 * hora ("agora") e a semente dos identificadores ("semente"). Fora de
 * executarComContexto, vale o relógio da máquina e o sorteio comum.
 */
var CONTEXTO_EXECUCAO = { agora: null, semente: null, contador: 0 };

function executarComContexto(ctx, fn) {
  var antes = { agora: CONTEXTO_EXECUCAO.agora, semente: CONTEXTO_EXECUCAO.semente, contador: CONTEXTO_EXECUCAO.contador };
  CONTEXTO_EXECUCAO.agora = (ctx && ctx.agora) || null;
  CONTEXTO_EXECUCAO.semente = (ctx && ctx.semente) || null;
  CONTEXTO_EXECUCAO.contador = 0;
  try {
    return fn();
  } finally {
    CONTEXTO_EXECUCAO.agora = antes.agora;
    CONTEXTO_EXECUCAO.semente = antes.semente;
    CONTEXTO_EXECUCAO.contador = antes.contador;
  }
}

/** Timestamp 'YYYY-MM-DD HH:MM:SS' para a aba LOG (o do contexto, se houver). */
function agoraTexto(d) {
  if (!d && CONTEXTO_EXECUCAO.agora) return CONTEXTO_EXECUCAO.agora;
  d = d || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

/* ------------------------------------------------------ conferência -- */

/**
 * JSON com as chaves em ordem alfabética, em todos os níveis. O mesmo dado
 * dá sempre o mesmo texto — base do código de conferência de um documento
 * assinado (a ordem em que os campos foram gravados não pode mudar o código).
 */
function jsonCanonico(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jsonCanonico).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
    .map(function (k) { return JSON.stringify(k) + ':' + jsonCanonico(v[k]); }).join(',') + '}';
}

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/** Texto -> bytes UTF-8 (lista de números 0..255). */
function bytesUtf8(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      var d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/**
 * SHA-256 do texto (em UTF-8), em hexadecimal. Escrito à mão porque o código
 * de conferência tem de sair igual no navegador, no Node e no Apps Script —
 * e cada um oferece uma API diferente (e a do navegador é assíncrona).
 */
function sha256Hex(texto) {
  var bytes = bytesUtf8(String(texto));
  var n = bytes.length;
  var bitsAlto = Math.floor(n / 0x20000000);
  var bitsBaixo = (n * 8) >>> 0;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push((bitsAlto >>> 24) & 255, (bitsAlto >>> 16) & 255, (bitsAlto >>> 8) & 255, bitsAlto & 255,
    (bitsBaixo >>> 24) & 255, (bitsBaixo >>> 16) & 255, (bitsBaixo >>> 8) & 255, bitsBaixo & 255);

  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Array(64);
  for (var off = 0; off < bytes.length; off += 64) {
    var t;
    for (t = 0; t < 16; t++) {
      w[t] = (bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) |
        (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3];
    }
    for (t = 16; t < 64; t++) {
      var x = w[t - 15], y = w[t - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (t = 0; t < 64; t++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var t1 = (k + S1 + ((e & f) ^ (~e & g)) + SHA256_K[t] + w[t]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
  }
  return h.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    jsonCanonico: jsonCanonico, sha256Hex: sha256Hex,
    CONTEXTO_EXECUCAO: CONTEXTO_EXECUCAO, executarComContexto: executarComContexto,
    numeroDoId: numeroDoId,
    txt: txt, vazio: vazio, normalizar: normalizar, mesmoTexto: mesmoTexto, pad2: pad2,
    MESES_NOME: MESES_NOME, DIAS_SEMANA: DIAS_SEMANA,
    paraData: paraData, dataValida: dataValida, diasNoMes: diasNoMes,
    mesDe: mesDe, anoDe: anoDe, diaDaSemana: diaDaSemana, dataBR: dataBR,
    datasUteisDoMes: datasUteisDoMes, dataParaUTC: dataParaUTC,
    diasEntre: diasEntre, somarDias: somarDias, primeiraOcorrencia: primeiraOcorrencia,
    paraHora: paraHora, horaParaMinutos: horaParaMinutos,
    duracaoMinutos: duracaoMinutos, minutosParaHoras: minutosParaHoras,
    horasParaMinutos: horasParaMinutos,
    duracaoHoras: duracaoHoras, horasParaFracaoDia: horasParaFracaoDia,
    fracaoDiaParaHoras: fracaoDiaParaHoras, horasTexto: horasTexto, horasHHMM: horasHHMM,
    paraNumero: paraNumero, soma: soma, moedaBR: moedaBR,
    arredondar2: arredondar2, arredondar4: arredondar4,
    paraSimNao: paraSimNao, ehSim: ehSim,
    chaveDataPosicao: chaveDataPosicao, chaveDataAnestesista: chaveDataAnestesista,
    chaveCompetencia: chaveCompetencia,
    proximoId: proximoId, agoraTexto: agoraTexto
  };
}
