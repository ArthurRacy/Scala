#!/usr/bin/env node
/**
 * Gera docs/ENTIDADES.drawio — modelo de entidades do sistema, para abrir em
 * https://app.diagrams.net/ (Arquivo > Abrir de > Dispositivo).
 *
 * Tudo é posicionado por conta: cada entidade é uma tabela (cabeçalho + uma linha por
 * campo), as setas saem da linha do campo que referencia e entram na tabela alvo por
 * rotas calculadas, e o gerador confere sozinho se alguma caixa sai do seu quadro, se
 * duas se sobrepõem ou se um texto não cabe na coluna. Uso:
 *     node tools/gerar_diagrama_entidades.js
 */
'use strict';
var fs = require('fs'), path = require('path');

/* ------------------------------------------------------------- paleta ---- */
var C = {
  verde: '#0d7c66', verdeEscuro: '#0e573f', verdeSuave: '#e9f5f2',
  texto: '#0e1a16', cinza: '#5b6862', cinzaClaro: '#8a9690', borda: '#ccd5d1', quadro: '#f6f8f7', zebra: '#f7faf9',
  alerta: '#9a6207', alertaSuave: '#fdf3e2', perigo: '#b4232a',
  info: '#14568a', infoSuave: '#e8f1f9', ok: '#2f7a3a', okSuave: '#e6f4e8'
};

/* ----------------------------------------------------------- geometria ---- */
var LH = 22, HEAD = 30, PAD = 8, CHAR_NOME = 6.7, CHAR_DET = 6.0;

var ENT = {};      // id -> entidade
var QUADROS = [];  // molduras de grupo
function ent(id, x, y, w, titulo, tipo, linhas, tag) {
  ENT[id] = { id: id, x: x, y: y, w: w, titulo: titulo, tipo: tipo, linhas: linhas, tag: tag || '',
    h: HEAD + LH * linhas.length + PAD };
}
function cy(id, i) { return ENT[id].y + HEAD + LH * i + LH / 2; }   // centro vertical da linha i
function fy(id, yAbs) { return +((yAbs - ENT[id].y) / ENT[id].h).toFixed(4); }  // fração (0–1) da altura
function fx(id, xAbs) { return +((xAbs - ENT[id].x) / ENT[id].w).toFixed(4); }  // fração (0–1) da largura
function quadro(rotulo, descricao, x, y, w, h, tipo, ids, alinhar) { QUADROS.push({ rotulo: rotulo, descricao: descricao, x: x, y: y, w: w, h: h, tipo: tipo || 'atual', ids: ids, alinhar: alinhar }); }

// linha = [chave, campo, detalhe, atenção?]   chave: 'PK' | 'UK' | 'FK' | '!' | ''
var W = 270;

/* --- equipe, escala e repasse ------------------------------------------- */
ent('esb', 60, 170, W, 'ESCALA-BASE', 'atual', [
  ['', 'posição', '1 a 5'], ['', 'dia da semana', 'segunda a sábado'], ['', 'anestesista', 'por NOME', 1]]);
ent('esm', 60, 300, W, 'ESCALA MENSAL', 'atual', [
  ['', 'data', 'dia da semana'], ['', 'posição', '1 a 5'], ['', 'anest. calculado', 'por NOME', 1], ['', 'anest. efetivo', 'por NOME', 1]]);
ent('rep', 60, 452, W, 'REPASSE', 'atual', [
  ['', 'mês', 'AAAA-MM'], ['', 'despesas', 'R$'], ['', 'pagamentos', 'lista por pessoa'], ['', 'anestesista', 'por NOME', 1]]);
ent('ane', 460, 300, 300, 'ANESTESISTA', 'atual', [
  ['PK', 'id', 'A01'], ['', 'nome', 'usado como chave', 1], ['', 'ativo', 'sim / não'], ['', 'CRM · PIX', ''], ['', 'telefone · e-mail', '']]);

/* --- administração e auditoria ------------------------------------------ */
ent('cfg', 860, 170, W, 'CONFIGURAÇÃO', 'atual', [
  ['', 'clínica · TCLE', 'texto editável'], ['', 'qualidade', 'limiares e metas'], ['', 'sequências', 'IDs sem reuso']]);
ent('usr', 1150, 170, W, 'USUÁRIO', 'atual', [
  ['PK', 'login', ''], ['', 'nome · papel', 'admin ou equipe'], ['', 'senha', 'scrypt'], ['', 'sessões', 'cookie HttpOnly']], 'só no servidor');
ent('est', 1440, 170, W, 'ESTRUTURA', 'atual', [
  ['PK', 'id', ''], ['UK', 'uid', ''], ['', 'unidade · sala · turno', 'texto', 1], ['', 'itens verificados', ''],
  ['!', 'vínculo c/ cirurgia', 'por texto', 1]]);

/* --- cadastros que faltam (proposta) ------------------------------------ */
ent('pac', 60, 690, W, 'PACIENTE', 'proposta', [
  ['PK', 'uid', ''], ['', 'nome', ''], ['', 'CPF · prontuário', ''], ['', 'nascimento', ''], ['', 'telefone', '']], 'proposta');
ent('prc', 60, 856, W, 'PROCEDIMENTO', 'proposta', [
  ['PK', 'código TUSS', ''], ['', 'nome', ''], ['', 'tipo', 'alimenta o gráfico']], 'proposta');
ent('cnv', 60, 978, W, 'CONVÊNIO', 'proposta', [['PK', 'uid', ''], ['', 'nome', '']], 'proposta');
ent('cih', 60, 1078, W, 'CIRURGIÃO', 'proposta', [['PK', 'uid', ''], ['', 'nome', ''], ['', 'CRM', '']], 'proposta');
ent('sal', 60, 1200, W, 'SALA / UNIDADE', 'proposta', [['PK', 'uid', ''], ['', 'unidade', ''], ['', 'sala', '']], 'proposta');

/* --- atendimento --------------------------------------------------------- */
ent('cir', 460, 680, 300, 'CIRURGIA', 'atual', [
  ['PK', 'id', 'CIR0001'], ['!', 'uid', 'ausente', 1], ['', 'data · status', ''], ['', 'horários', 'previsto e real'],
  ['', 'paciente', 'texto livre', 1], ['', 'procedimento', 'texto + TUSS', 1], ['', 'convênio', 'texto livre', 1],
  ['', 'cirurgião', 'texto livre', 1], ['', 'sala', 'texto livre', 1], ['', 'anestesista', 'por NOME', 1],
  ['', 'avaliação · valor · NF', '']]);
ent('ava', 880, 680, W, 'AVALIAÇÃO PRÉ', 'atual', [
  ['PK', 'id', 'AVP0001'], ['UK', 'uid', 'estável'], ['FK', 'idCirurgia', ''], ['', 'anestesista', 'por NOME', 1],
  ['', 'data · hora', ''], ['', 'realizada · TCLE', ''], ['', 'valor · pago', '']]);
ent('exa', 1250, 680, W, 'EXAME (PDF)', 'atual', [
  ['PK', 'id', 'EX…'], ['FK', 'uidAvaliacao', ''], ['', 'nome · tamanho', ''], ['', 'criado em · por', ''],
  ['!', 'tipo · data da coleta', 'ausente', 1], ['!', 'hash do arquivo', 'ausente', 1]], 'fora do estado');
ent('bol', 880, 892, W, 'BOLETIM ANESTÉSICO', 'atual', [
  ['PK', 'id', 'BOL0001'], ['UK', 'uid', ''], ['FK', 'idCirurgia', ''], ['', 'status · versão', 'histórico'], ['', 'assinatura', 'SHA-256']]);
ent('fic', 880, 1058, W, 'FICHA DE QUALIDADE', 'atual', [
  ['PK', 'id', ''], ['UK', 'uid', ''], ['FK', 'idCirurgia', ''], ['', 'status · etapas', ''], ['', 'histórico', 'campo a campo']]);
ent('log', 460, 1050, 300, 'LOG (auditoria)', 'atual', [
  ['PK', 'seq', ''], ['', 'data · hora', ''], ['', 'usuário', ''], ['', 'aba · campo', ''], ['', 'antes → depois', ''],
  ['!', 'idCirurgia', 'texto', 1]]);

/* ------------------------------------------------------------- quadros ---- */
quadro('EQUIPE, ESCALA E REPASSE', 'quem trabalha, quando e quanto recebe', 40, 120, 760, 500, 'atual', ['esb', 'esm', 'rep', 'ane']);
quadro('ADMINISTRAÇÃO E ESTRUTURA', 'configuração, acesso e estrutura da unidade', 840, 120, 880, 500, 'atual', ['cfg', 'usr', 'est']);
quadro('CADASTROS QUE FALTAM', 'proposta', 40, 650, 300, 680, 'proposta', ['pac', 'prc', 'cnv', 'cih', 'sal']);
quadro('ATENDIMENTO', 'tudo ligado à cirurgia', 420, 650, 1140, 680, 'atual', ['cir', 'ava', 'exa', 'bol', 'fic', 'log']);

/* -------------------------------------------------------------- ligações -- */
// tipo: 'id' (por ID/uid, robusta) | 'nome' (por nome ou texto, frágil) | 'nova' (proposta)
var LIG = [];
function lig(o) { LIG.push(o); }

// por NOME → ANESTESISTA (entra pela esquerda, cada uma num ponto)
lig({ tipo: 'nome', de: 'esb', linha: 2, para: 'ane', entradaY: 330, curvaX: 365, rot: 'por NOME' });
lig({ tipo: 'nome', de: 'esm', linha: 2, para: 'ane', entradaY: 372, curvaX: 395, rot: 'por NOME' });
lig({ tipo: 'nome', de: 'rep', linha: 3, para: 'ane', entradaY: 414, curvaX: 425, rot: 'por NOME' });
// CIRURGIA e AVALIAÇÃO → ANESTESISTA (por baixo)
lig({ tipo: 'nome', reta: 'v', de: 'cir', para: 'ane', x: 700, rot: 'por NOME' });
lig({ tipo: 'nome', de: 'ava', saida: 'topo', para: 'ane', entradaX: 745, pontos: [[1015, 635], [745, 635]], rot: 'por NOME' });

// ligações por ID/uid
lig({ tipo: 'id', de: 'ava', linha: 2, para: 'cir', entradaY: 735, curvaX: 840, lado: 'dir', card: 'zeroOuUm' });
lig({ tipo: 'id', de: 'bol', linha: 2, para: 'cir', entradaY: 835, curvaX: 820, lado: 'dir', card: 'zeroOuUm' });
lig({ tipo: 'id', de: 'fic', linha: 2, para: 'cir', entradaY: 935, curvaX: 800, lado: 'dir', card: 'zeroOuUm' });
lig({ tipo: 'id', reta: 'h', de: 'exa', linha: 1, para: 'ava', alvoLinha: 1, card: 'muitos' });
// LOG → CIRURGIA (texto)
lig({ tipo: 'nome', reta: 'v', de: 'log', para: 'cir', rot: 'idCirurgia (texto)', invertida: true });

// cadastros propostos (a cirurgia hoje guarda texto)
[['pac', 4, 400], ['prc', 5, 352], ['cnv', 6, 364], ['cih', 7, 376], ['sal', 8, 388]].forEach(function (p) {
  lig({ tipo: 'nova', de: 'cir', linha: p[1], lado: 'esq', para: p[0], curvaX: p[2] });
});

/* ------------------------------------------------------------- saída XML -- */
var proximo = 2;
function id() { return 'c' + (proximo++); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function cel(valor, estilo, x, y, w, h, pai) {
  var i = id();
  return { id: i, xml: '<mxCell id="' + i + '" value="' + esc(valor) + '" style="' + estilo + '" vertex="1" parent="' + (pai || '1') +
    '"><mxGeometry x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" as="geometry"/></mxCell>' };
}

var xml = [];
var problemas = [];

/* título */
xml.push(cel('Modelo de entidades', 'text;html=1;align=left;verticalAlign=middle;fontSize=26;fontStyle=1;fontColor=' + C.verdeEscuro + ';', 40, 20, 700, 36).xml);
xml.push(cel('Sistema de Gestão e Escala de Anestesia<br>Retrato do código em 01/10/2026: o que existe hoje e os cadastros que faltam',
  'text;html=1;align=left;verticalAlign=top;fontSize=13;fontColor=' + C.cinza + ';', 40, 60, 680, 40).xml);

/* legenda — três colunas: ligações · chaves · símbolos */
xml.push(cel('', 'rounded=1;arcSize=5;fillColor=#ffffff;strokeColor=' + C.borda + ';', 760, 12, 960, 100).xml);
xml.push(cel('LEGENDA', 'text;html=1;align=left;verticalAlign=middle;fontSize=10;fontStyle=1;fontColor=' + C.cinzaClaro + ';', 776, 14, 120, 16).xml);
function amostra(x1, y, estilo) {
  var i = id();
  xml.push('<mxCell id="' + i + '" style="html=1;' + estilo + '" edge="1" parent="1"><mxGeometry relative="1" as="geometry">' +
    '<mxPoint x="' + x1 + '" y="' + y + '" as="sourcePoint"/><mxPoint x="' + (x1 + 52) + '" y="' + y + '" as="targetPoint"/></mxGeometry></mxCell>');
}
function textoLeg(t, x, y, cor, larg) {
  xml.push(cel(t, 'text;html=1;align=left;verticalAlign=middle;fontSize=11;fontColor=' + (cor || C.texto) + ';whiteSpace=wrap;', x, y - 10, larg || 230, 20).xml);
}
function selo(t, x, y, fundo, cor) {
  xml.push(cel(t, 'rounded=1;arcSize=30;strokeColor=none;fontSize=9;fontStyle=1;fillColor=' + fundo + ';fontColor=' + cor + ';', x, y - 7, 26, 14).xml);
}
// coluna 1 — tipos de ligação
amostra(780, 44, 'strokeColor=' + C.verdeEscuro + ';strokeWidth=1.5;startArrow=ERzeroToOne;endArrow=ERmandOne;startSize=10;endSize=10;');
textoLeg('Ligação por ID ou uid (robusta)', 842, 44);
amostra(780, 66, 'strokeColor=' + C.perigo + ';strokeWidth=1.5;dashed=1;endArrow=open;endSize=7;');
textoLeg('Ligação por nome ou texto (frágil)', 842, 66, C.perigo);
amostra(780, 88, 'strokeColor=' + C.ok + ';strokeWidth=1.5;dashed=1;startArrow=ERmany;endArrow=ERmandOne;startSize=10;endSize=10;');
textoLeg('Ligação proposta (cadastro novo)', 842, 88, C.ok);
// coluna 2 — chaves
selo('PK', 1086, 44, C.verdeSuave, C.verdeEscuro);  textoLeg('chave primária (identifica a linha)', 1120, 44, C.texto, 250);
selo('UK', 1086, 66, C.verdeSuave, C.verdeEscuro);  textoLeg('identificador estável (uid), não muda', 1120, 66, C.texto, 250);
selo('FK', 1086, 88, C.infoSuave, C.info);          textoLeg('chave estrangeira (aponta para outra tabela)', 1120, 88, C.texto, 250);
// coluna 3 — símbolos e destaques
selo('!', 1400, 44, '#f6dfb4', C.alerta);           textoLeg('linha âmbar: ponto de atenção do modelo', 1434, 44, C.alerta, 270);
textoLeg('Pontas: barra = um · círculo = opcional', 1400, 66, C.texto, 300);
textoLeg('pé de galinha = muitos', 1400, 82, C.texto, 300);
xml.push(cel('', 'rounded=1;arcSize=20;fillColor=' + C.okSuave + ';strokeColor=' + C.ok + ';dashed=1;dashPattern=6 4;', 1400, 96, 26, 10).xml);
textoLeg('tabela tracejada: entidade proposta', 1434, 101, C.ok, 270);

/* quadros */
QUADROS.forEach(function (q) {
  var proposta = q.tipo === 'proposta';
  xml.push(cel('<b>' + q.rotulo + '</b>&nbsp;&nbsp;·&nbsp;&nbsp;<span style="font-weight:normal">' + q.descricao + '</span>', 'rounded=1;arcSize=1.5;html=1;whiteSpace=wrap;' + (q.alinhar === 'right' ? 'align=right;spacingRight=16;' : 'align=left;spacingLeft=16;') + 'verticalAlign=top;spacingTop=5;fontSize=11;fontStyle=1;fontColor=' +
    (proposta ? C.ok : C.cinza) + ';fillColor=' + (proposta ? '#f3faf4' : C.quadro) + ';strokeColor=' + (proposta ? C.ok : C.borda) + ';' +
    (proposta ? 'dashed=1;dashPattern=6 4;' : ''), q.x, q.y, q.w, q.h).xml);
});

/* tabelas */
Object.keys(ENT).forEach(function (k) {
  var e = ENT[k], proposta = e.tipo === 'proposta';
  var cab = cel(e.titulo,
    'swimlane;html=1;whiteSpace=wrap;fontStyle=1;fontSize=13;startSize=' + HEAD + ';horizontal=1;collapsible=0;resizeParent=0;align=left;spacingLeft=12;' +
    'fillColor=' + (proposta ? C.okSuave : C.verde) + ';fontColor=' + (proposta ? C.ok : '#ffffff') + ';strokeColor=' + (proposta ? C.ok : C.verdeEscuro) + ';' +
    'swimlaneFillColor=#ffffff;rounded=1;arcSize=5;strokeWidth=1.25;' + (proposta ? 'dashed=1;dashPattern=6 4;' : ''), e.x, e.y, e.w, e.h);
  e.cid = cab.id;
  xml.push(cab.xml);
  if (e.tag) {
    xml.push(cel(e.tag, 'text;html=1;align=right;verticalAlign=middle;fontSize=9;fontStyle=1;fontColor=' + (proposta ? C.ok : '#d6efe8') + ';spacingRight=10;',
      e.w - 120, 0, 120, HEAD, cab.id).xml);
  }
  e.linhas.forEach(function (l, i) {
    var chave = l[0], nome = l[1], det = l[2] || '', atencao = !!l[3];
    var y = HEAD + LH * i;
    var fundo = atencao ? C.alertaSuave : (i % 2 ? C.zebra : '#ffffff');
    xml.push(cel('', 'rounded=0;strokeColor=none;fillColor=' + fundo + ';', 1, y, e.w - 2, LH, cab.id).xml);
    if (chave) {
      var corBadge = { PK: [C.verdeSuave, C.verdeEscuro], UK: [C.verdeSuave, C.verdeEscuro], FK: [C.infoSuave, C.info], '!': [C.alertaSuave, C.alerta] }[chave];
      var fundoBadge = chave === '!' ? '#f6dfb4' : corBadge[0];
      xml.push(cel(chave, 'rounded=1;arcSize=30;strokeColor=none;fontSize=9;fontStyle=1;fillColor=' + fundoBadge + ';fontColor=' + corBadge[1] + ';',
        8, y + 4, 26, 14, cab.id).xml);
    }
    var nomeW = Math.ceil(nome.length * CHAR_NOME) + 10;
    var detW = e.w - 42 - nomeW - 10;
    xml.push(cel(nome, 'text;html=1;align=left;verticalAlign=middle;fontSize=12;fontColor=' + C.texto + ';fontStyle=' + (chave === 'PK' ? 1 : 0) + ';spacingLeft=0;whiteSpace=nowrap;',
      40, y, nomeW, LH, cab.id).xml);
    if (det) {
      xml.push(cel(det, 'text;html=1;align=right;verticalAlign=middle;fontSize=11;fontColor=' + (atencao ? C.alerta : C.cinzaClaro) + ';fontStyle=' + (atencao ? 1 : 0) + ';spacingRight=8;whiteSpace=nowrap;',
        40 + nomeW, y, e.w - 42 - nomeW, LH, cab.id).xml);
      if (det.length * CHAR_DET + 12 > detW) problemas.push('texto não cabe: ' + e.titulo + ' → "' + nome + '" / "' + det + '" (faltam ' + Math.round(det.length * CHAR_DET + 12 - detW) + 'px)');
    }
    if (nomeW + 42 > e.w - 6) problemas.push('nome não cabe: ' + e.titulo + ' → "' + nome + '"');
  });
});

/* setas */
var CORES = { id: C.verdeEscuro, nome: C.perigo, nova: C.ok };
LIG.forEach(function (l) {
  var a = ENT[l.de], b = ENT[l.para];
  var estilo = 'html=1;rounded=1;fontSize=10;labelBackgroundColor=#ffffff;strokeWidth=1.5;strokeColor=' + CORES[l.tipo] + ';fontColor=' + CORES[l.tipo] + ';';
  var pontos = '';
  if (l.tipo === 'id') {
    var inicio = l.card === 'muitos' ? 'ERzeroToMany' : 'ERzeroToOne';
    estilo += 'startArrow=' + inicio + ';endArrow=ERmandOne;startSize=10;endSize=10;endFill=0;startFill=0;';
  } else if (l.tipo === 'nome') {
    estilo += 'dashed=1;endArrow=open;endSize=7;startArrow=none;';
  } else {
    estilo += 'dashed=1;startArrow=ERmany;endArrow=ERmandOne;startSize=10;endSize=10;endFill=0;startFill=0;';
  }

  var src, dst;
  if (l.reta === 'v') {         // vertical reta entre duas tabelas empilhadas
    var cima = a.y < b.y ? a : b, baixo = a.y < b.y ? b : a;
    var xm = l.x !== undefined ? l.x : Math.max(cima.x, baixo.x) + Math.min(cima.w, baixo.w) / 2;
    src = 'exitX=' + fx(a.id, xm) + ';exitY=' + (a.y < b.y ? 1 : 0) + ';';
    dst = 'entryX=' + fx(b.id, xm) + ';entryY=' + (a.y < b.y ? 0 : 1) + ';';
    estilo += 'edgeStyle=none;' + src + dst;
  } else if (l.reta === 'h') {  // horizontal reta, linhas alinhadas
    var yAbs = cy(a.id, l.linha), lado = a.x > b.x;
    estilo += 'edgeStyle=none;exitX=' + (lado ? 0 : 1) + ';exitY=' + fy(a.id, yAbs) + ';entryX=' + (lado ? 1 : 0) + ';entryY=' + fy(b.id, cy(b.id, l.alvoLinha)) + ';';
    if (Math.abs(yAbs - cy(b.id, l.alvoLinha)) > 0.5) problemas.push('seta reta fora de alinhamento: ' + a.titulo + ' → ' + b.titulo);
  } else if (l.saida === 'topo') {
    estilo += 'edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=' + fx(b.id, l.entradaX) + ';entryY=1;';
    pontos = '<Array as="points">' + l.pontos.map(function (p) { return '<mxPoint x="' + p[0] + '" y="' + p[1] + '"/>'; }).join('') + '</Array>';
  } else {                      // cotovelo: horizontal, vertical (na curvaX), horizontal
    var yOrig = cy(a.id, l.linha);
    var saiPelaEsq = l.lado === 'esq' || l.lado === 'dir';       // 'dir' = a origem está à direita do alvo → sai pela esquerda
    var origemDireita = a.x > b.x;
    var yDest = l.entradaY !== undefined ? l.entradaY : ENT[l.para].y + ENT[l.para].h / 2;
    estilo += 'edgeStyle=elbowEdgeStyle;elbow=horizontal;exitX=' + (origemDireita ? 0 : 1) + ';exitY=' + fy(a.id, yOrig) +
      ';entryX=' + (origemDireita ? 1 : (a.x < b.x ? 0 : 1)) + ';entryY=' + fy(b.id, yDest) + ';';
    if (l.lado === 'esq') {   // cirurgia → cadastro à esquerda: sai pela esquerda da cirurgia, entra pela direita do cadastro
      estilo = estilo.replace(/exitX=[^;]*;/, 'exitX=0;').replace(/entryX=[^;]*;/, 'entryX=1;');
    } else if (!origemDireita && a.x < b.x) {   // origem à esquerda, alvo à direita (escalas → anestesista)
      estilo = estilo.replace(/exitX=[^;]*;/, 'exitX=1;').replace(/entryX=[^;]*;/, 'entryX=0;');
    }
    pontos = '<Array as="points"><mxPoint x="' + l.curvaX + '" y="' + yOrig + '"/></Array>';
  }
  var i = id();
  var origem = l.invertida ? b : a, destino = l.invertida ? a : b;
  xml.push('<mxCell id="' + i + '" value="' + esc(l.rot || '') + '" style="' + estilo + '" edge="1" parent="1" source="' + a.cid + '" target="' + b.cid +
    '"><mxGeometry relative="1" as="geometry">' + pontos + '</mxGeometry></mxCell>');
});

/* resumo (dentro do quadro de administração) */
var porId = LIG.filter(function (l) { return l.tipo === 'id'; }).length;
var porNome = LIG.filter(function (l) { return l.tipo === 'nome'; }).length + 1;   // + Estrutura, que liga por texto e não tem seta
var novas = Object.keys(ENT).filter(function (k) { return ENT[k].tipo === 'proposta'; }).length;
var existentes = Object.keys(ENT).length - novas;
var resumo = '<b style="font-size:14px;color:' + C.verdeEscuro + '">Leitura do modelo</b><br><br>' +
  '•&nbsp; <b>' + existentes + '</b> entidades hoje; <b>' + novas + '</b> cadastros ainda não existem e vivem como texto livre dentro da cirurgia.<br><br>' +
  '•&nbsp; Ligações por ID ou uid: <b>' + porId + '</b>. Por nome ou texto: <b>' + porNome + '</b> — e renomear um anestesista exige cascata.<br><br>' +
  '•&nbsp; A <b>cirurgia não tem uid</b>, e o <b>exame</b> mora fora do estado (sem tipo, data da coleta nem hash).<br><br>' +
  '•&nbsp; Sem a entidade <b>Paciente</b>, o mesmo paciente em duas cirurgias não se correlaciona.<br><br>' +
  '<b>Ordem sugerida:</b> 1) backup externo com teste de restauração · 2) banco transacional e exclusão lógica · 3) Paciente e uid em todas as entidades.';
xml.push(cel(resumo, 'rounded=1;arcSize=3;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=16;fontSize=12.5;fontColor=' + C.texto +
  ';fillColor=#ffffff;strokeColor=' + C.borda + ';', 860, 345, 840, 225).xml);

/* ------------------------------------------------------------ conferência -- */
var ks = Object.keys(ENT);
ks.forEach(function (a) {
  var A = ENT[a];
  if (A.x < 0 || A.y < 0 || A.x + A.w > 1760 || A.y + A.h > 1350) problemas.push('fora da página: ' + A.titulo);
  ks.forEach(function (b) {
    if (a >= b) return;
    var B = ENT[b];
    if (A.x < B.x + B.w + 8 && B.x < A.x + A.w + 8 && A.y < B.y + B.h + 8 && B.y < A.y + A.h + 8) problemas.push('tabelas coladas ou sobrepostas: ' + A.titulo + ' e ' + B.titulo);
  });
});
QUADROS.forEach(function (q) {
  q.ids.forEach(function (k) {
    var e = ENT[k];
    if (e.x < q.x + 10 || e.y < q.y + 30 || e.x + e.w > q.x + q.w - 10 || e.y + e.h > q.y + q.h - 10) problemas.push('fora do quadro "' + q.rotulo + '": ' + e.titulo);
  });
});
LIG.forEach(function (l) {
  if (!ENT[l.de] || !ENT[l.para]) problemas.push('ligação com entidade inexistente: ' + l.de + ' → ' + l.para);
  if (l.linha !== undefined && !ENT[l.de].linhas[l.linha]) problemas.push('ligação aponta para linha inexistente em ' + l.de);
});

var doc = '<mxfile host="app.diagrams.net"><diagram name="Entidades" id="entidades"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1800" pageHeight="1380" math="0" shadow="0" background="#ffffff"><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  xml.join('') + '</root></mxGraphModel></diagram></mxfile>';
var destino = path.join(__dirname, '..', 'docs', 'ENTIDADES.drawio');
fs.writeFileSync(destino, doc, 'utf8');

console.log('Gravado: ' + destino);
console.log(ks.length + ' entidades (' + existentes + ' existentes, ' + novas + ' propostas), ' + LIG.length + ' setas, ' + QUADROS.length + ' quadros, ' + Math.round(doc.length / 1024) + ' KB');
if (problemas.length) {
  console.log('\nATENÇÃO — ' + problemas.length + ' problema(s) de enquadramento:');
  problemas.forEach(function (p) { console.log('  - ' + p); });
  process.exitCode = 1;
} else {
  console.log('Conferência de enquadramento: sem problemas (tudo dentro do quadro, nada sobreposto, todo texto cabe).');
}
