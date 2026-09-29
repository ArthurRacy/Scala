/**
 * ============================================================================
 * 03H_PPTX — Apresentação (.pptx) do painel de indicadores, sem biblioteca
 * ============================================================================
 * O .pptx é um .zip de XML (OOXML). O projeto não usa dependência externa, e
 * o zip já existe em 03_dados (`DADOS.zip`, método "armazenar"), então o que
 * falta é escrever as partes do pacote — que é o que este arquivo faz:
 *
 *   [Content_Types].xml   tipos das partes
 *   _rels/.rels           raiz -> ppt/presentation.xml
 *   ppt/presentation.xml  tamanho do slide (16:9) e a lista de slides
 *   ppt/slideMasters/…    mestre, layout em branco e tema mínimos
 *   ppt/slides/slideN.xml um slide por página do relatório
 *
 * Cada slide é montado a partir de uma descrição simples
 * ({ titulo, subtitulo, linhas | tabela, texto, rodape }): `linhas` são pares
 * rótulo/valor; `tabela` é uma tabela nativa do PowerPoint (editável), com
 * colunas de largura e alinhamento próprios. Sem imagem, sem gráfico nativo —
 * o objetivo é levar o painel para a reunião de coordenação, com as mesmas
 * definições e as mesmas ressalvas do relatório em PDF.
 * ============================================================================
 */
'use strict';

var PPTX = (function () {

  var LARGURA = 12192000;   // EMU — 16:9
  var ALTURA = 6858000;
  var EMU_CM = 360000;

  var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';

  var CABECALHO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  /** Texto -> XML seguro. */
  function esc(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      // Caracteres de controle não são válidos em XML 1.0.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  function cm(v) { return Math.round(v * EMU_CM); }

  /* ------------------------------------------------------- partes fixas */

  function contentTypes(nSlides) {
    var overrides = '';
    for (var i = 1; i <= nSlides; i++) {
      overrides += '<Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    }
    return CABECALHO + '<Types xmlns="' + NS_CT + '">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      overrides + '</Types>';
  }

  function relsRaiz() {
    return CABECALHO + '<Relationships xmlns="' + NS_REL + '">' +
      '<Relationship Id="rId1" Type="' + NS_R + '/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="' + NS_R + '/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + NS_R + '/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';
  }

  function presentation(nSlides) {
    var ids = '';
    for (var i = 1; i <= nSlides; i++) ids += '<p:sldId id="' + (255 + i) + '" r:id="rId' + (i + 1) + '"/>';
    return CABECALHO + '<p:presentation xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + ids + '</p:sldIdLst>' +
      '<p:sldSz cx="' + LARGURA + '" cy="' + ALTURA + '"/>' +
      '<p:notesSz cx="6858000" cy="9144000"/>' +
      '</p:presentation>';
  }

  function presentationRels(nSlides) {
    var rels = '<Relationship Id="rId1" Type="' + NS_R + '/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
    for (var i = 1; i <= nSlides; i++) {
      rels += '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_R + '/slide" Target="slides/slide' + i + '.xml"/>';
    }
    rels += '<Relationship Id="rId' + (nSlides + 2) + '" Type="' + NS_R + '/theme" Target="theme/theme1.xml"/>';
    return CABECALHO + '<Relationships xmlns="' + NS_REL + '">' + rels + '</Relationships>';
  }

  var MAPA_CORES = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
    'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

  function slideMaster() {
    return CABECALHO + '<p:sldMaster xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
      '<p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      '</p:spTree></p:cSld>' + MAPA_CORES +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '</p:sldMaster>';
  }

  function slideMasterRels() {
    return CABECALHO + '<Relationships xmlns="' + NS_REL + '">' +
      '<Relationship Id="rId1" Type="' + NS_R + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="' + NS_R + '/theme" Target="../theme/theme1.xml"/>' +
      '</Relationships>';
  }

  function slideLayout() {
    return CABECALHO + '<p:sldLayout xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P +
      '" type="blank" preserve="1">' +
      '<p:cSld name="Em branco"><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      '</p:spTree></p:cSld>' + MAPA_CORES + '</p:sldLayout>';
  }

  function slideLayoutRels() {
    return CABECALHO + '<Relationships xmlns="' + NS_REL + '">' +
      '<Relationship Id="rId1" Type="' + NS_R + '/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      '</Relationships>';
  }

  function slideRels() {
    return CABECALHO + '<Relationships xmlns="' + NS_REL + '">' +
      '<Relationship Id="rId1" Type="' + NS_R + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '</Relationships>';
  }

  /** Tema mínimo, mas completo: sem ele o PowerPoint recusa o arquivo. */
  function tema() {
    function estiloPreenchimento() {
      return '<a:fillStyleLst>' +
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
        '<a:solidFill><a:schemeClr val="phClr"><a:tint val="60000"/></a:schemeClr></a:solidFill>' +
        '<a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill>' +
        '</a:fillStyleLst>';
    }
    function estiloLinha() {
      var l = '';
      [6350, 12700, 19050].forEach(function (w) {
        l += '<a:ln w="' + w + '" cap="flat" cmpd="sng" algn="ctr">' +
          '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
      });
      return '<a:lnStyleLst>' + l + '</a:lnStyleLst>';
    }
    var efeitos = '<a:effectStyleLst>' +
      '<a:effectStyle><a:effectLst/></a:effectStyle>' +
      '<a:effectStyle><a:effectLst/></a:effectStyle>' +
      '<a:effectStyle><a:effectLst/></a:effectStyle>' +
      '</a:effectStyleLst>';
    var fundo = '<a:bgFillStyleLst>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill>' +
      '</a:bgFillStyleLst>';

    return CABECALHO + '<a:theme xmlns:a="' + NS_A + '" name="Anestesia">' +
      '<a:themeElements>' +
      '<a:clrScheme name="Anestesia">' +
      '<a:dk1><a:srgbClr val="1B2430"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="15563F"/></a:dk2><a:lt2><a:srgbClr val="EEF2F1"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="15563F"/></a:accent1><a:accent2><a:srgbClr val="2E7D62"/></a:accent2>' +
      '<a:accent3><a:srgbClr val="B8860B"/></a:accent3><a:accent4><a:srgbClr val="8C2F39"/></a:accent4>' +
      '<a:accent5><a:srgbClr val="2F5D8C"/></a:accent5><a:accent6><a:srgbClr val="6B7280"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="2F5D8C"/></a:hlink><a:folHlink><a:srgbClr val="6B7280"/></a:folHlink>' +
      '</a:clrScheme>' +
      '<a:fontScheme name="Anestesia">' +
      '<a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
      '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
      '</a:fontScheme>' +
      '<a:fmtScheme name="Anestesia">' + estiloPreenchimento() + estiloLinha() + efeitos + fundo + '</a:fmtScheme>' +
      '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  }

  function docPropsCore(titulo) {
    var agora = agoraTexto().replace(' ', 'T') + 'Z';
    return CABECALHO + '<cp:coreProperties ' +
      'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(titulo) + '</dc:title>' +
      '<dc:creator>' + esc(CONFIG.NOME_SISTEMA) + '</dc:creator>' +
      '<cp:lastModifiedBy>' + esc(CONFIG.NOME_SISTEMA) + '</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + agora + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + agora + '</dcterms:modified>' +
      '</cp:coreProperties>';
  }

  function docPropsApp(nSlides) {
    return CABECALHO + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>' + esc(CONFIG.NOME_SISTEMA) + '</Application>' +
      '<Slides>' + nSlides + '</Slides>' +
      '</Properties>';
  }

  /* ------------------------------------------------------------ slides */

  /** Um parágrafo de texto. */
  function paragrafo(texto, o) {
    o = o || {};
    if (texto === '') return '<a:p><a:endParaRPr lang="pt-BR"/></a:p>';
    var props = '<a:rPr lang="pt-BR" sz="' + (o.tam || 1400) + '"' +
      (o.negrito ? ' b="1"' : '') + ' dirty="0">' +
      '<a:solidFill><a:srgbClr val="' + (o.cor || '1B2430') + '"/></a:solidFill></a:rPr>';
    return '<a:p><a:pPr algn="' + (o.alinhar || 'l') + '"/>' +
      '<a:r>' + props + '<a:t>' + esc(texto) + '</a:t></a:r></a:p>';
  }

  /** Caixa de texto posicionada, em centímetros. */
  function caixa(id, nome, x, y, largura, altura, paragrafos) {
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + esc(nome) + '"/>' +
      '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + cm(x) + '" y="' + cm(y) + '"/>' +
      '<a:ext cx="' + cm(largura) + '" cy="' + cm(altura) + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr>' +
      '<a:lstStyle/>' + paragrafos.join('') + '</p:txBody></p:sp>';
  }

  /**
   * Tabela nativa (a:tbl dentro de p:graphicFrame). `t`: { colunas: [{ rotulo, largura (cm),
   * alinhar }], linhas: [[texto | { texto, destaque }, ...]] }. A primeira linha é o cabeçalho.
   */
  function tabela(id, x, y, t) {
    var altLinha = 0.82;
    var grade = t.colunas.map(function (c) { return '<a:gridCol w="' + cm(c.largura) + '"/>'; }).join('');

    function celula(texto, col, cab, destaque) {
      var borda = '<a:lnB w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="' +
        (cab ? '15563F' : 'D7DEDA') + '"/></a:solidFill><a:prstDash val="solid"/></a:lnB>';
      var fundo = cab ? '<a:solidFill><a:srgbClr val="EEF2F1"/></a:solidFill>' : '<a:noFill/>';
      return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' +
        paragrafo(texto, { tam: cab ? 1050 : 1150, negrito: cab || destaque, alinhar: col.alinhar === 'direita' ? 'r' : (col.alinhar === 'centro' ? 'ctr' : 'l'),
          cor: cab ? '15563F' : (destaque ? '8C2F39' : '1B2430') }) +
        '</a:txBody><a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="ctr">' +
        '<a:lnL w="0"><a:noFill/></a:lnL><a:lnR w="0"><a:noFill/></a:lnR><a:lnT w="0"><a:noFill/></a:lnT>' +
        borda + fundo + '</a:tcPr></a:tc>';
    }

    var linhas = '<a:tr h="' + cm(altLinha) + '">' + t.colunas.map(function (c) {
      return celula(c.rotulo, c, true, false);
    }).join('') + '</a:tr>';
    t.linhas.forEach(function (l) {
      linhas += '<a:tr h="' + cm(altLinha) + '">' + l.map(function (v, k) {
        var d = v && typeof v === 'object';
        return celula(d ? v.texto : v, t.colunas[k], false, d && v.destaque);
      }).join('') + '</a:tr>';
    });

    var largura = t.colunas.reduce(function (s, c) { return s + c.largura; }, 0);
    return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Tabela"/>' +
      '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="' + cm(x) + '" y="' + cm(y) + '"/><a:ext cx="' + cm(largura) + '" cy="' + cm(altLinha * (t.linhas.length + 1)) + '"/></p:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
      '<a:tbl><a:tblPr firstRow="1"/><a:tblGrid>' + grade + '</a:tblGrid>' + linhas + '</a:tbl>' +
      '</a:graphicData></a:graphic></p:graphicFrame>';
  }

  /**
   * Monta um slide. `s`: { titulo, subtitulo, linhas: [{ rotulo, valor, nota, destaque }],
   * tabela, texto: [parágrafos soltos], rodape }.
   */
  function slide(s) {
    var formas = [];
    var id = 2;

    formas.push(caixa(id++, 'Título', 1.6, 1.0, 29.3, 1.6, [
      paragrafo(s.titulo || '', { tam: 2400, negrito: true, cor: '15563F' })
    ]));
    if (s.subtitulo) {
      formas.push(caixa(id++, 'Subtítulo', 1.6, 2.4, 29.3, 1.0, [
        paragrafo(s.subtitulo, { tam: 1200, cor: '6B7280' })
      ]));
    }

    var y = 3.4;
    if (s.linhas && s.linhas.length) {
      var rotulos = [], valores = [];
      s.linhas.forEach(function (l) {
        rotulos.push(paragrafo(l.rotulo, { tam: 1600, negrito: !!l.destaque }));
        valores.push(paragrafo(l.valor + (l.nota ? '   ' + l.nota : ''),
          { tam: 1600, negrito: true, alinhar: 'l', cor: l.destaque ? '8C2F39' : '15563F' }));
      });
      var altura = Math.min(11.5, 0.95 * s.linhas.length + 0.4);
      formas.push(caixa(id++, 'Rótulos', 1.6, y, 15.4, altura, rotulos));
      formas.push(caixa(id++, 'Valores', 17.4, y, 13.5, altura, valores));
      y += altura + 0.3;
    }

    if (s.tabela) {
      formas.push(tabela(id++, 1.6, y, s.tabela));
      y += 0.82 * (s.tabela.linhas.length + 1) + 0.5;
    }

    if (s.texto && s.texto.length) {
      formas.push(caixa(id++, 'Texto', 1.6, y, 29.3, Math.max(1.2, 15.5 - y), s.texto.map(function (t) {
        return paragrafo(t, { tam: 1100, cor: '4B5563' });
      })));
    }

    if (s.rodape) {
      formas.push(caixa(id++, 'Rodapé', 1.6, 16.2, 29.3, 0.8, [
        paragrafo(s.rodape, { tam: 900, cor: '9CA3AF' })
      ]));
    }

    return CABECALHO + '<p:sld xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
      '<p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      formas.join('') +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  /** Lista de partes do pacote: [{ nome, dados }]. */
  function partes(slides, titulo) {
    var arquivos = [
      { nome: '[Content_Types].xml', dados: contentTypes(slides.length) },
      { nome: '_rels/.rels', dados: relsRaiz() },
      { nome: 'docProps/core.xml', dados: docPropsCore(titulo) },
      { nome: 'docProps/app.xml', dados: docPropsApp(slides.length) },
      { nome: 'ppt/presentation.xml', dados: presentation(slides.length) },
      { nome: 'ppt/_rels/presentation.xml.rels', dados: presentationRels(slides.length) },
      { nome: 'ppt/slideMasters/slideMaster1.xml', dados: slideMaster() },
      { nome: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', dados: slideMasterRels() },
      { nome: 'ppt/slideLayouts/slideLayout1.xml', dados: slideLayout() },
      { nome: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', dados: slideLayoutRels() },
      { nome: 'ppt/theme/theme1.xml', dados: tema() }
    ];
    slides.forEach(function (s, i) {
      arquivos.push({ nome: 'ppt/slides/slide' + (i + 1) + '.xml', dados: slide(s) });
      arquivos.push({ nome: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', dados: slideRels() });
    });
    return arquivos;
  }

  /** Blob .pptx a partir da descrição dos slides. */
  function gerar(slides, titulo) {
    var zip = DADOS.zip(partes(slides, titulo));
    return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  return { gerar: gerar, partes: partes, slide: slide, esc: esc, LARGURA: LARGURA, ALTURA: ALTURA };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { PPTX: PPTX };
