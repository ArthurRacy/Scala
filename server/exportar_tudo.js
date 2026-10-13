/**
 * ============================================================================
 * EXPORTAR TUDO — "Baixar todos os dados": um .zip com tudo o que o sistema tem
 * ============================================================================
 * Para a clínica guardar por conta própria o que passar do prazo de guarda do
 * sistema (3 anos), ou levar para outro lugar. Só o Anestesista chefe baixa.
 *
 *   LEIA-ME.txt                       o que é cada coisa e como conferir
 *   backup/anestesia_backup_<dia>.json   os dados completos; volta para o sistema
 *                                     em Dados e backup → Importar backup
 *   planilhas/<aba>.csv               as mesmas informações para abrir no Excel
 *   exames/<avaliação>/<id> - <nome>.pdf   os PDFs de exame + exames/indice.csv
 *                                     (paciente, data, quem anexou, SHA-256)
 *   exames_removidos/…                os PDFs removidos que ainda estão no prazo
 *   log/                              o histórico de alterações e de acessos
 *   CONFERENCIA.txt                   o que foi conferido ao montar o pacote
 *   SHA256SUMS.txt                    a impressão digital de cada arquivo acima
 *
 * Os dados (JSON e planilhas) são tirados de uma vez, no começo: o pacote é o
 * retrato de um instante. Os PDFs vêm do disco, um por um, e cada um tem o
 * SHA-256 conferido com o da ficha. Nada fica inteiro na memória além do JSON.
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var criarPacoteZip = require('./pacote_zip').criarPacoteZip;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/** Um pedaço de nome de arquivo que abre em qualquer sistema (sem / \ : * ? " < > | nem controle). */
function nomeSeguro(s, max) {
  var t = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return t.slice(0, max || 80).trim();
}

function semExtensaoPdf(nome) { return String(nome || '').replace(/\.pdf$/i, ''); }

/**
 * Escreve o pacote em `res` (os cabeçalhos HTTP já devem ter saído). `ctx`:
 * { armazem, store, DADOS, pastaLogs, quem: { nome }, revisao, hoje, agora (texto), forcarZip64 (testes) }.
 * Devolve Promise<resumo>. Se falhar no meio, rejeita: quem chamou derruba a conexão, para o navegador
 * mostrar "falhou" em vez de guardar um .zip pela metade.
 */
function exportarTudo(res, ctx) {
  var DADOS = ctx.DADOS, armazem = ctx.armazem, store = ctx.store;
  var zip = criarPacoteZip(res, { forcarZip64: ctx.forcarZip64 });
  var somas = [];                 // [caminho no pacote, sha256]
  var problemas = [];
  var resumo = { exames: 0, examesRemovidos: 0, planilhas: 0, logs: 0, bytesDeExames: 0, problemas: problemas };

  function por(caminho, dados, op) {
    var buf = Buffer.isBuffer(dados) ? dados : Buffer.from(String(dados), 'utf8');
    somas.push([caminho, sha256(buf)]);
    return zip.adicionar(caminho, buf, op);
  }
  function emSerie(lista, fn) {
    return lista.reduce(function (p, item) { return p.then(function () { return fn(item); }); }, Promise.resolve());
  }

  /* --- o retrato dos dados, de uma vez ---------------------------------- */
  var e = store.estado;
  var json = DADOS.exportarJSON(e);
  var planilhas = null, erroPlanilhas = null;
  try { planilhas = DADOS.exportarCSVs(store); } catch (x) { erroPlanilhas = x && x.message ? x.message : String(x); }
  var avaliacaoPorUid = {};
  (e.avaliacoes || []).forEach(function (a) { if (a.uid) avaliacaoPorUid[a.uid] = a; });
  var metas = armazem.metasAnexos();
  var removidos = armazem.listarRemovidos();
  var logs = [];
  try {
    logs = fs.readdirSync(ctx.pastaLogs).filter(function (n) {
      return !/\.tmp$/.test(n) && fs.statSync(path.join(ctx.pastaLogs, n)).isFile();
    }).sort();
  } catch (x) { problemas.push('pasta de LOG não foi lida: ' + (x && x.message)); }

  var nomeBackup = 'backup/anestesia_backup_' + ctx.hoje + '.json';
  var leiame = [
    'TODOS OS DADOS DO SISTEMA DE ANESTESIA',
    '',
    'Baixado em ' + ctx.agora + ' por ' + (ctx.quem && ctx.quem.nome || '?') + ' (revisão ' + ctx.revisao + ' dos dados).',
    'Tem dados de pacientes (dado de saúde, LGPD): guarde em lugar protegido, com acesso só de quem precisa.',
    '',
    'O QUE TEM AQUI',
    '  ' + nomeBackup,
    '      Os dados completos: cadastro, escala, cirurgias, avaliações, boletins, fichas de qualidade, repasse e LOG.',
    '      Volta para o sistema em Dados e backup > Importar backup (isso SUBSTITUI os dados que estiverem lá).',
    '  planilhas/          As mesmas informações em planilha (.csv; abre no Excel).',
    '  exames/             Os PDFs de exame (' + metas.length + '), numa pasta por avaliação.',
    '                      exames/indice.csv diz de que paciente, cirurgia e data é cada um.',
    '  exames_removidos/   PDFs que alguém removeu e que o sistema ainda guarda (' + removidos.length + '): ficam 3 anos',
    '                      contados da remoção. O indice.csv da pasta diz quem removeu e quando.',
    '  log/                O histórico de alterações e de acessos, como o sistema guarda (arquivos mensais .jsonl.gz).',
    '  CONFERENCIA.txt     O que foi conferido ao montar este pacote.',
    '  SHA256SUMS.txt      A impressão digital (SHA-256) de cada arquivo. Se um arquivo mudar, a impressão muda.',
    '',
    'COMO CONFERIR, ANOS DEPOIS',
    '  Windows (PowerShell):  Get-FileHash -Algorithm SHA256 "caminho do arquivo"',
    '  Linux ou Mac, na pasta do pacote:  sha256sum -c SHA256SUMS.txt',
    '  Compare com a linha do arquivo em SHA256SUMS.txt: tem de ser igual.',
    '  O SHA-256 de cada exame também está em exames/indice.csv: é o mesmo que o sistema registrou quando ele foi anexado.',
    ''
  ].join('\r\n');

  /* --- exames ------------------------------------------------------------ */
  var linhasExames = [['ARQUIVO NO PACOTE', 'ID DO EXAME', 'ID DA AVALIAÇÃO', 'ID DA CIRURGIA', 'DATA DA CIRURGIA', 'PACIENTE',
    'NOME DO ARQUIVO', 'TAMANHO (BYTES)', 'SHA-256', 'ANEXADO EM', 'ANEXADO POR', 'SITUAÇÃO']];
  var linhasRemovidos = [['ARQUIVO NO PACOTE', 'ID DO EXAME', 'ID DA AVALIAÇÃO', 'ID DA CIRURGIA', 'DATA DA CIRURGIA', 'PACIENTE',
    'NOME DO ARQUIVO', 'TAMANHO (BYTES)', 'SHA-256', 'ANEXADO EM', 'ANEXADO POR', 'REMOVIDO EM', 'REMOVIDO POR', 'SITUAÇÃO']];

  function dadosDaAvaliacao(m) {
    var a = avaliacaoPorUid[m.uidAvaliacao] || {};
    return { idAvaliacao: m.idAvaliacao || a.id || '', idCirurgia: a.idCirurgia || '', data: a.dataCirurgia || '', paciente: a.paciente || '' };
  }

  /** Lê o PDF e confere com a ficha. Devolve { buf, situacao } (buf null se não achou). */
  function lerConferido(caminho, m) {
    return fs.promises.readFile(caminho).then(function (buf) {
      var h = sha256(buf);
      var registrado = /^[0-9a-f]{64}$/.test(String(m.sha256 || '')) ? m.sha256 : '';
      if (registrado && registrado !== h) return { buf: buf, hash: h, situacao: 'CONTEÚDO DIFERENTE DO REGISTRADO (SHA-256 não confere)' };
      return { buf: buf, hash: h, situacao: registrado ? 'confere' : 'sem impressão registrada' };
    }, function () { return { buf: null, hash: '', situacao: 'ARQUIVO NÃO ENCONTRADO' }; });
  }

  function umExame(m) {
    var d = dadosDaAvaliacao(m);
    var pasta = 'exames/' + (nomeSeguro(d.idAvaliacao, 40) || 'sem-avaliacao') + '/';
    var arquivo = pasta + m.id + ' - ' + (nomeSeguro(semExtensaoPdf(m.nome), 80) || 'exame') + '.pdf';
    return lerConferido(armazem.caminhoDoAnexo(m.id), m).then(function (r) {
      if (r.situacao !== 'confere' && r.situacao !== 'sem impressão registrada') problemas.push('exame ' + m.id + ': ' + r.situacao);
      linhasExames.push([r.buf ? arquivo : '', m.id, d.idAvaliacao, d.idCirurgia, d.data, d.paciente, m.nome || '',
        r.buf ? r.buf.length : '', r.hash || m.sha256 || '', m.criadoEm || '', m.criadoPor || '', r.situacao]);
      if (!r.buf) return null;
      resumo.exames++;
      resumo.bytesDeExames += r.buf.length;
      return por(arquivo, r.buf, { comprimir: false });
    });
  }

  function umRemovido(item) {
    var m = item.ficha || { id: item.id };
    var d = dadosDaAvaliacao(m);
    var pasta = 'exames_removidos/' + (nomeSeguro(d.idAvaliacao, 40) || 'sem-avaliacao') + '/';
    var arquivo = pasta + item.chave + ' - ' + (nomeSeguro(semExtensaoPdf(m.nome), 80) || 'exame') + '.pdf';
    var leitura = item.pdf ? lerConferido(item.pdf, m) : Promise.resolve({ buf: null, hash: '', situacao: 'ARQUIVO NÃO ENCONTRADO' });
    return leitura.then(function (r) {
      if (!item.ficha && r.buf) r.situacao = 'removido antes das fichas: sem dados da avaliação';
      linhasRemovidos.push([r.buf ? arquivo : '', m.id, d.idAvaliacao, d.idCirurgia, d.data, d.paciente, m.nome || '',
        r.buf ? r.buf.length : '', r.hash || m.sha256 || '', m.criadoEm || '', m.criadoPor || '', m.removidoEm || '', m.removidoPor || '', r.situacao]);
      if (!r.buf) return null;
      resumo.examesRemovidos++;
      return por(arquivo, r.buf, { comprimir: false });
    });
  }

  /* --- na ordem do LEIA-ME ---------------------------------------------- */
  return por('LEIA-ME.txt', leiame)
    .then(function () { return por(nomeBackup, json); })
    .then(function () {
      if (erroPlanilhas) { problemas.push('as planilhas não foram geradas: ' + erroPlanilhas); return null; }
      return emSerie(planilhas, function (p) {
        resumo.planilhas++;
        return por('planilhas/' + nomeSeguro(p.nome, 60) + '.csv', '﻿' + p.conteudo);
      });
    })
    .then(function () { return emSerie(metas, umExame); })
    .then(function () { return por('exames/indice.csv', '﻿' + DADOS.paraCSV(linhasExames)); })
    .then(function () { return emSerie(removidos, umRemovido); })
    .then(function () { return por('exames_removidos/indice.csv', '﻿' + DADOS.paraCSV(linhasRemovidos)); })
    .then(function () {
      return emSerie(logs, function (n) {
        return fs.promises.readFile(path.join(ctx.pastaLogs, n)).then(function (buf) {
          resumo.logs++;
          return por('log/' + n, buf, { comprimir: !/\.gz$/.test(n) });
        }, function (x) { problemas.push('arquivo de LOG ' + n + ' não foi lido: ' + (x && x.message)); });
      });
    })
    .then(function () {
      var conferencia = [
        'CONFERÊNCIA DO PACOTE — ' + ctx.agora,
        '',
        'Exames: ' + resumo.exames + ' de ' + metas.length + ' no pacote (' + (resumo.bytesDeExames / 1048576).toFixed(1) + ' MB).',
        'Exames removidos ainda no prazo: ' + resumo.examesRemovidos + ' de ' + removidos.length + '.',
        'Planilhas: ' + resumo.planilhas + '. Arquivos de LOG: ' + resumo.logs + '.',
        'Cada PDF foi lido do disco e o SHA-256 comparado com o registrado quando foi anexado.',
        '',
        problemas.length ? 'PROBLEMAS (' + problemas.length + '):' : 'Nenhum problema encontrado.'
      ].concat(problemas.map(function (p) { return '  - ' + p; }), ['']).join('\r\n');
      return por('CONFERENCIA.txt', conferencia);
    })
    .then(function () {
      var texto = somas.map(function (s) { return s[1] + '  ' + s[0]; }).join('\n') + '\n';
      return zip.adicionar('SHA256SUMS.txt', Buffer.from(texto, 'utf8'));
    })
    .then(function () { return zip.fechar(); })
    .then(function (fim) {
      resumo.arquivos = fim.arquivos;
      resumo.bytes = fim.bytes;
      return resumo;
    });
}

module.exports = { exportarTudo: exportarTudo, nomeSeguro: nomeSeguro };
