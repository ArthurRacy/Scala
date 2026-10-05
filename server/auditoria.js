/**
 * ============================================================================
 * AUDITORIA — Eventos de acesso por usuário, arquivo mensal do LOG e limpeza
 * ============================================================================
 *   <dados>/logs/acessos.jsonl       eventos de acesso e segurança (uma linha cada):
 *                                    entradas, recusas, saídas, troca de senha, usuários,
 *                                    backup, exames, acessos negados, rotação do log…
 *   <dados>/logs/alteracoes_AAAA-MM.jsonl.gz   o LOG de alterações do mês (estado.log)
 *   <dados>/logs/acessos_AAAA-MM.jsonl.gz      os eventos de acesso do mês
 *   <dados>/logs/indice.json         os arquivos, com SHA-256 do conteúdo e a última rotação
 *
 * A REGRA (as contas estão em core/11b_log_arquivo.js):
 *   1. Todo mês fechado vira arquivo, gravado por inteiro e CONFERIDO (lido de volta e o
 *      SHA-256 recalculado) antes de valer.
 *   2. Só depois disso as linhas anteriores ao corte (padrão: 6 meses) saem da tela/do arquivo vivo.
 *      Nenhuma linha sai sem estar num arquivo conferido; arquivo existente nunca é reescrito
 *      (linha nova de mês já arquivado vai para uma "parte" nova).
 *   3. O arquivo é guardado por `anosDeGuarda` anos (padrão 5; 0 = nunca apagar).
 * Tudo aqui é síncrono: a rotação inteira roda sem que nenhum comando entre no meio.
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');

var LIMITE_EVENTOS = 500;

function criarAuditoria(pasta, core) {
  var dir = path.join(pasta, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  var arqAcessos = path.join(dir, 'acessos.jsonl');
  var arqIndice = path.join(dir, 'indice.json');

  /* ------------------------------------------------------------- disco --- */

  /** Grava num arquivo novo, força para o disco e só então troca pelo antigo. */
  function gravarAtomico(arquivo, conteudo) {
    var tmp = arquivo + '.' + process.pid + '.tmp';
    var fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, conteudo); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    try {
      fs.renameSync(tmp, arquivo);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (e2) { /* segue */ }   // não deixa o temporário para trás
      throw e;
    }
  }

  function sha256(conteudo) { return crypto.createHash('sha256').update(conteudo).digest('hex'); }
  function agora() { return core.agoraTexto(new Date()); }   // com a data explícita: nunca a hora do contexto de um comando
  function caminhoDe(nome) {
    if (!core.lerNomeDoArquivoDeLog(nome)) throw new Error('Nome de arquivo de log inválido.');
    return path.join(dir, nome);
  }

  /* ------------------------------------------------------------ eventos --- */

  /**
   * Anota um evento de acesso, gravado no disco antes de voltar.
   * { login, nome, papel, evento, detalhe, ip, quando } — o que não vier fica vazio; `quando` só vem nos testes
   * (que forçam o "hoje" da rotação) e vale se for um carimbo de verdade.
   */
  function registrar(ev) {
    var e = {
      quando: core.mesDoLog(ev.quando) ? String(ev.quando) : agora(), login: String(ev.login || ''), nome: String(ev.nome || ''), papel: String(ev.papel || ''),
      evento: String(ev.evento || ''), detalhe: String(ev.detalhe || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 300),
      ip: String(ev.ip || '').slice(0, 64)
    };
    var fd = fs.openSync(arqAcessos, 'a');
    try { fs.writeSync(fd, JSON.stringify(e) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return e;
  }

  function lerAcessosVivos() {
    if (!fs.existsSync(arqAcessos)) return { entradas: [], invalidas: 0 };
    return core.entradasDoTextoDeLog(fs.readFileSync(arqAcessos, 'utf8'));
  }

  /**
   * Os eventos de acesso que ainda estão no arquivo vivo, mais novos primeiro.
   * filtro: { login, de, ate, evento, texto, limite }. Devolve { eventos, total }.
   */
  function listarAcessos(filtro) {
    filtro = filtro || {};
    var texto = core.normalizar(filtro.texto || '');
    var todos = lerAcessosVivos().entradas.filter(function (e) {
      if (filtro.login && String(e.login || '').toLowerCase() !== String(filtro.login).toLowerCase()) return false;
      if (filtro.evento && e.evento !== filtro.evento) return false;
      var dia = String(e.quando || '').slice(0, 10);
      if (filtro.de && dia < filtro.de) return false;
      if (filtro.ate && dia > filtro.ate) return false;
      if (texto && core.normalizar([e.login, e.nome, e.evento, e.detalhe, e.ip].join(' ')).indexOf(texto) < 0) return false;
      return true;
    }).reverse();
    var limite = Math.max(1, Math.min(Number(filtro.limite) || LIMITE_EVENTOS, 5000));
    return { eventos: todos.slice(0, limite), total: todos.length };
  }

  /* ------------------------------------------------------------- índice --- */

  function indiceVazio() { return { arquivos: [], ultimaRotacao: null }; }

  /** Lê o índice. Ilegível: guarda de lado e refaz a partir dos arquivos que existem (o conteúdo manda). */
  function lerIndice() {
    if (!fs.existsSync(arqIndice)) return reconstruirIndice();
    try {
      var idx = JSON.parse(fs.readFileSync(arqIndice, 'utf8'));
      if (idx && Array.isArray(idx.arquivos)) return idx;
      throw new Error('formato');
    } catch (e) {
      try { fs.renameSync(arqIndice, arqIndice.replace(/\.json$/, '') + '.ilegivel_' + Date.now() + '.json'); } catch (e2) { /* segue */ }
      return reconstruirIndice();
    }
  }

  function gravarIndice(idx) { gravarAtomico(arqIndice, JSON.stringify(idx, null, 1)); }

  function reconstruirIndice() {
    var idx = indiceVazio();
    fs.readdirSync(dir).forEach(function (nome) {
      var p = core.lerNomeDoArquivoDeLog(nome);
      if (!p) return;
      try {
        var texto = zlib.gunzipSync(fs.readFileSync(path.join(dir, nome))).toString('utf8');
        var lido = core.entradasDoTextoDeLog(texto);
        idx.arquivos.push({
          id: nome.replace(/\.jsonl\.gz$/, ''), tipo: p.tipo, mes: p.mes, parte: p.parte, arquivo: nome,
          entradas: lido.entradas.length, sha256: sha256(texto), tamanho: fs.statSync(path.join(dir, nome)).size,
          criadoEm: agora(), verificadoEm: agora(), verificadoOk: true, reconstruido: true
        });
      } catch (e) { /* arquivo ilegível: fica de fora do índice; a conferência avisa */ }
    });
    if (idx.arquivos.length) gravarIndice(idx);
    return idx;
  }

  /* ----------------------------------------------------------- arquivos --- */

  /** Lê e confere um arquivo do índice: existe, descomprime, o SHA-256 e a contagem batem. */
  function conferirArquivo(item) {
    var p;
    try { p = caminhoDe(item.arquivo); } catch (e) { return { ok: false, motivo: 'nome inválido' }; }
    if (!fs.existsSync(p)) return { ok: false, motivo: 'arquivo ausente' };
    var texto;
    try { texto = zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'); } catch (e) { return { ok: false, motivo: 'arquivo corrompido (não descomprime)' }; }
    if (sha256(texto) !== item.sha256) return { ok: false, motivo: 'o conteúdo mudou desde que foi gravado (SHA-256 não confere)' };
    var lido = core.entradasDoTextoDeLog(texto);
    if (lido.invalidas || lido.entradas.length !== item.entradas) return { ok: false, motivo: 'a quantidade de linhas não confere' };
    return { ok: true, entradas: lido.entradas, texto: texto };
  }

  /**
   * Garante que TODAS as `entradas` do mês estejam em arquivo conferido. Cria o arquivo do mês,
   * ou uma parte nova só com o que faltar (nunca reescreve um arquivo existente).
   * Devolve { coberto, criados:[item], problemas:[texto] }.
   */
  function garantirArquivo(tipo, mes, entradas, idx) {
    var partes = idx.arquivos.filter(function (a) { return a.tipo === tipo && a.mes === mes; });
    var conhecidas = {}, problemas = [];
    partes.forEach(function (p) {
      var c = conferirArquivo(p);
      if (!c.ok) { problemas.push(p.arquivo + ': ' + c.motivo); return; }
      c.entradas.forEach(function (e) { conhecidas[core.jsonCanonico(e)] = true; });
    });
    var novas = entradas.filter(function (e) { return !conhecidas[core.jsonCanonico(e)]; });
    if (!novas.length) return { coberto: true, criados: [], problemas: problemas };

    var parte = partes.reduce(function (m, p) { return Math.max(m, p.parte); }, 0) + 1;
    var nome = core.nomeDoArquivoDeLog(tipo, mes, parte);
    var texto = core.textoDoArquivoDeLog(novas);
    var gz = zlib.gzipSync(texto);
    var p = caminhoDe(nome);
    gravarAtomico(p, gz);
    // Conferência: lê de volta e confere antes de o arquivo valer.
    var volta = zlib.gunzipSync(fs.readFileSync(p)).toString('utf8');
    if (sha256(volta) !== sha256(texto) || core.entradasDoTextoDeLog(volta).entradas.length !== novas.length) {
      try { fs.unlinkSync(p); } catch (e) { /* segue */ }
      throw new Error('O arquivo ' + nome + ' não conferiu depois de gravado.');
    }
    var item = { id: nome.replace(/\.jsonl\.gz$/, ''), tipo: tipo, mes: mes, parte: parte, arquivo: nome,
      entradas: novas.length, sha256: sha256(texto), tamanho: gz.length, criadoEm: agora(), verificadoEm: agora(), verificadoOk: true };
    idx.arquivos.push(item);
    return { coberto: true, criados: [item], problemas: problemas };
  }

  function menor(a, b) { return a < b ? a : b; }

  /**
   * A rotação mensal. `args`: { hoje, log (estado.log), config: { mesesNaTela, anosDeGuarda } }.
   * Arquiva os meses fechados dos dois logs, tira dos eventos de acesso o que passou do corte e apaga
   * os arquivos que passaram do prazo de guarda. As linhas de alteração que podem sair do estado
   * ficam em `podarAlteracoesAte` (quem chama aplica `arquivarLogAte`, que faz parte do estado).
   * Devolve { criados, podarAlteracoesAte, acessosRemovidos, apagados, problemas, erros }.
   */
  function rotacionar(args) {
    var res = { criados: [], podarAlteracoesAte: null, acessosRemovidos: 0, apagados: [], problemas: [], erros: [] };
    var idx = lerIndice();
    var corte = core.corteDaTela(args.hoje, args.config.mesesNaTela);
    var corteSeguro = { alteracoes: corte, acessos: corte };
    var fontes = { alteracoes: args.log || [], acessos: lerAcessosVivos().entradas };

    Object.keys(fontes).forEach(function (tipo) {
      var g = core.agruparLogPorMes(fontes[tipo]);
      Object.keys(g.meses).sort().forEach(function (mes) {
        if (!core.mesFechadoParaArquivo(mes, args.hoje)) return;
        try {
          var r = garantirArquivo(tipo, mes, g.meses[mes], idx);
          res.criados = res.criados.concat(r.criados);
          res.problemas = res.problemas.concat(r.problemas);
        } catch (e) {
          res.erros.push(tipo + ' ' + mes + ': ' + e.message);
          corteSeguro[tipo] = menor(corteSeguro[tipo], mes + '-01');   // este mês não foi arquivado: nada dele sai
        }
      });
    });

    // Eventos de acesso: tira do arquivo vivo o que é anterior ao corte seguro (já está em arquivo conferido).
    var vivos = lerAcessosVivos().entradas;
    var ficam = vivos.filter(function (e) {
      var mes = core.mesDoLog(e.quando);
      return !(mes && String(e.quando).slice(0, 10) < corteSeguro.acessos);
    });
    if (ficam.length !== vivos.length) {
      gravarAtomico(arqAcessos, ficam.map(function (e) { return JSON.stringify(e) + '\n'; }).join(''));
      res.acessosRemovidos = vivos.length - ficam.length;
    }

    // Alterações: só avisa até onde o estado pode ser podado.
    var temParaPodar = (args.log || []).some(function (e) {
      var mes = core.mesDoLog(e.quando);
      return mes && String(e.quando).slice(0, 10) < corteSeguro.alteracoes;
    });
    if (temParaPodar) res.podarAlteracoesAte = corteSeguro.alteracoes;

    // Prazo de guarda dos arquivos.
    var meses = idx.arquivos.map(function (a) { return a.mes; }).filter(function (m, i, l) { return l.indexOf(m) === i; });
    var vencidos = core.mesesDeArquivoParaApagar(meses, args.hoje, args.config.anosDeGuarda);
    var qtdVencidos = idx.arquivos.filter(function (a) { return vencidos.indexOf(a.mes) >= 0; }).length;
    if (qtdVencidos > 4) {
      // Freio: por mês vencem 2 arquivos (alterações e acessos). Quatro ou mais de uma vez só = relógio errado.
      res.problemas.push('A limpeza quis apagar ' + qtdVencidos + ' arquivos de LOG de uma vez — isso só acontece com a data do computador errada. Nada foi apagado; confira o relógio.');
    } else {
      vencidos.forEach(function (mes) {
        idx.arquivos.filter(function (a) { return a.mes === mes; }).forEach(function (a) {
          try { fs.unlinkSync(caminhoDe(a.arquivo)); } catch (e) { /* já não existia */ }
          res.apagados.push(a.arquivo);
        });
        idx.arquivos = idx.arquivos.filter(function (a) { return a.mes !== mes; });
      });
    }

    idx.ultimaRotacao = { quando: agora(), hoje: args.hoje, ok: !res.erros.length, criados: res.criados.length,
      podarAlteracoesAte: res.podarAlteracoesAte, acessosRemovidos: res.acessosRemovidos, apagados: res.apagados.length,
      erros: res.erros.slice(0, 5) };
    gravarIndice(idx);
    return res;
  }

  /** Reconfere todos os arquivos (lê, descomprime, recalcula o SHA-256). { total, conferem, problemas:[{arquivo, motivo}] }. */
  function conferir() {
    var idx = lerIndice();
    var problemas = [];
    idx.arquivos.forEach(function (a) {
      var c = conferirArquivo(a);
      a.verificadoEm = agora();
      a.verificadoOk = c.ok;
      if (!c.ok) { a.problema = c.motivo; problemas.push({ arquivo: a.arquivo, motivo: c.motivo }); } else delete a.problema;
    });
    gravarIndice(idx);
    return { total: idx.arquivos.length, conferem: idx.arquivos.length - problemas.length, problemas: problemas };
  }

  /** Os arquivos, do mais novo para o mais antigo, com a última rotação. */
  function arquivos() {
    var idx = lerIndice();
    return {
      arquivos: idx.arquivos.slice().sort(function (a, b) { return a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : b.parte - a.parte; }),
      ultimaRotacao: idx.ultimaRotacao || null,
      tamanhoTotal: idx.arquivos.reduce(function (s, a) { return s + (a.tamanho || 0); }, 0)
    };
  }

  /** O conteúdo de um arquivo (conferido), para baixar. Devolve { item, entradas } ou lança. */
  function lerArquivo(id) {
    var item = lerIndice().arquivos.filter(function (a) { return a.id === id; })[0];
    if (!item) throw new Error('Arquivo não encontrado.');
    var c = conferirArquivo(item);
    if (!c.ok) throw new Error('O arquivo ' + item.arquivo + ' não confere: ' + c.motivo + '.');
    return { item: item, entradas: c.entradas, texto: c.texto };
  }

  return {
    pasta: dir,
    registrar: registrar,
    listarAcessos: listarAcessos,
    rotacionar: rotacionar,
    conferir: conferir,
    arquivos: arquivos,
    lerArquivo: lerArquivo
  };
}

module.exports = { criarAuditoria: criarAuditoria };
