/**
 * QA 38 — Exames que não se perdem e "baixar todos os dados" (etapa 0 da arquitetura, 07/10/2026)
 *   - o índice dos exames ilegível ou perdido é refeito das fichas: nunca recomeça vazio (antes, o próximo exame
 *     anexado apagava o vínculo de todos os outros com a sua avaliação)
 *   - cada exame tem impressão digital (SHA-256); a conferência acha arquivo sumido, trocado ou fora do índice
 *   - exame removido fica 3 anos contados da REMOÇÃO (antes contava do envio: exame antigo removido saía no mesmo dia)
 *   - importar backup recusa o PDF cujo SHA-256 não bate com o registrado
 *   - baixar todos os dados: só o chefe; um .zip completo, que abre (CRC de cada arquivo), com SHA256SUMS que confere,
 *     também no formato ZIP64
 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var U = require('./_servidor_util.js')(core);
  var RAIZ = path.join(__dirname, '..');
  var criarArmazem = require(path.join(RAIZ, 'server', 'armazem.js')).criarArmazem;
  var pacoteZip = require(path.join(RAIZ, 'server', 'pacote_zip.js'));

  function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
  function pdf(texto) { return Buffer.from('%PDF-1.4\n% ' + texto + '\n%%EOF\n'); }
  function pdfsEm(dir) { return fs.readdirSync(dir).filter(function (n) { return /\.pdf$/.test(n); }); }
  /** Carimbo do nome em removidos/ (UTC), `dias` atrás. */
  function carimboDiasAtras(dias) {
    return new Date(Date.now() - dias * 86400000).toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '_');
  }

  /**
   * Leitor de .zip independente do gravador: acha o fim (ZIP64 também), percorre o índice, abre cada arquivo pelo
   * cabeçalho local e confere o CRC-32 e o tamanho. Devolve { zip64, nomes, ler(nome) }.
   */
  function lerZip(buf) {
    var crc = typeof zlib.crc32 === 'function' ? function (b) { return zlib.crc32(b) >>> 0; } : pacoteZip.crc32;
    var i = buf.length - 22;
    while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
    if (i < 0) throw new Error('fim do zip não encontrado');
    var n = buf.readUInt16LE(i + 10), inicio = buf.readUInt32LE(i + 16), zip64 = false;
    if (n === 0xffff || inicio === 0xffffffff) {
      if (buf.readUInt32LE(i - 20) !== 0x07064b50) throw new Error('localizador ZIP64 ausente');
      var p64 = Number(buf.readBigUInt64LE(i - 20 + 8));
      if (buf.readUInt32LE(p64) !== 0x06064b50) throw new Error('fim ZIP64 ausente');
      n = Number(buf.readBigUInt64LE(p64 + 32));
      inicio = Number(buf.readBigUInt64LE(p64 + 48));
      zip64 = true;
    }
    var nomes = [], conteudo = {}, p = inicio;
    for (var k = 0; k < n; k++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('entrada ' + k + ' do índice quebrada');
      var metodo = buf.readUInt16LE(p + 10), c = buf.readUInt32LE(p + 16), comp = buf.readUInt32LE(p + 20), tam = buf.readUInt32LE(p + 24);
      var ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
      var nome = buf.toString('utf8', p + 46, p + 46 + ln);
      if (off === 0xffffffff) {
        var extra = buf.subarray(p + 46 + ln, p + 46 + ln + le);
        if (extra.readUInt16LE(0) !== 1) throw new Error('extra ZIP64 ausente em ' + nome);
        off = Number(extra.readBigUInt64LE(4));
      }
      p += 46 + ln + le + lc;
      if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('cabeçalho local de ' + nome + ' fora do lugar');
      var lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28);
      if (buf.toString('utf8', off + 30, off + 30 + lnl) !== nome) throw new Error('nome local diferente: ' + nome);
      var bruto = buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + comp);
      var d = metodo === 8 ? zlib.inflateRawSync(bruto) : Buffer.from(bruto);
      if (d.length !== tam) throw new Error('tamanho de ' + nome);
      if (crc(d) !== c) throw new Error('CRC de ' + nome + ' não confere');
      nomes.push(nome);
      conteudo[nome] = d;
    }
    return { zip64: zip64, nomes: nomes, ler: function (nome) { return conteudo[nome]; } };
  }

  /* ====================================================================== */
  describe('Exames: o índice nunca recomeça vazio', function () {

    it('índice ilegível: é guardado de lado, refeito das fichas, e o próximo exame não apaga os outros', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      a.salvarAnexo({ id: 'EXaaaaaa1', uidAvaliacao: 'U1', nome: 'um.pdf', criadoEm: '2026-10-01T10:00:00.000Z' }, pdf('1'));
      a.salvarAnexo({ id: 'EXaaaaaa2', uidAvaliacao: 'U2', nome: 'dois.pdf', criadoEm: '2026-10-02T10:00:00.000Z' }, pdf('2'));
      fs.writeFileSync(path.join(pasta, 'anexos', 'indice.json'), '[{"id":"EXaaa');      // estragado no meio

      var b = criarArmazem(pasta, core);                                                   // o servidor reabre
      igual(b.metasAnexos().map(function (m) { return m.id + ':' + m.uidAvaliacao; }).join(','), 'EXaaaaaa1:U1,EXaaaaaa2:U2', 'refeito das fichas, na ordem');
      var avisos = b.tirarAvisos();
      igual(avisos.length, 1);
      igual(avisos[0].codigo, 'exames_indice_refeito');
      verdadeiro(fs.readdirSync(path.join(pasta, 'anexos')).some(function (n) { return /^indice\.ilegivel_.*\.json$/.test(n); }), 'o estragado fica guardado');
      igual(b.tirarAvisos().length, 0, 'cada aviso sai uma vez só');

      b.salvarAnexo({ id: 'EXaaaaaa3', uidAvaliacao: 'U3' }, pdf('3'));
      var c = criarArmazem(pasta, core);
      igual(c.metasAnexos().length, 3, 'os três continuam ligados às suas avaliações');
      igual(c.lerAnexo('EXaaaaaa1').toString(), pdf('1').toString());
      igual(c.tirarAvisos().length, 0, 'índice bom: nenhum aviso');
    });

    it('índice apagado: refeito das fichas', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      a.salvarAnexo({ id: 'EXbbbbbb1', uidAvaliacao: 'U1' }, pdf('1'));
      fs.unlinkSync(path.join(pasta, 'anexos', 'indice.json'));
      var b = criarArmazem(pasta, core);
      igual(b.metasAnexos().length, 1);
      igual(b.tirarAvisos()[0].codigo, 'exames_indice_refeito');
    });

    it('instalação de antes das fichas: cada exame ganha a sua ao abrir — e daí o índice pode se perder sem perder nada', function () {
      var pasta = U.pastaTemp();
      var dir = path.join(pasta, 'anexos');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'EXvelho001.pdf'), pdf('antigo'));
      fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify([{ id: 'EXvelho001', uidAvaliacao: 'UV', nome: 'antigo.pdf', tamanho: pdf('antigo').length }]));
      criarArmazem(pasta, core);
      verdadeiro(fs.existsSync(path.join(dir, 'EXvelho001.json')), 'a ficha foi criada');
      fs.writeFileSync(path.join(dir, 'indice.json'), 'lixo');
      var b = criarArmazem(pasta, core);
      igual(b.metasAnexos().map(function (m) { return m.uidAvaliacao; }).join(), 'UV', 'o vínculo voltou da ficha');
    });

    it('PDF sem ficha nenhuma: continua no disco e o aviso diz qual é', function () {
      var pasta = U.pastaTemp();
      var dir = path.join(pasta, 'anexos');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'EXsolto0001.pdf'), pdf('solto'));
      fs.writeFileSync(path.join(dir, 'indice.json'), '{');
      var b = criarArmazem(pasta, core);
      var avisos = b.tirarAvisos();
      verdadeiro(avisos.some(function (x) { return x.codigo === 'exames_com_problema' && /EXsolto0001\.pdf/.test(x.detalhe); }), JSON.stringify(avisos));
      verdadeiro(fs.existsSync(path.join(dir, 'EXsolto0001.pdf')), 'nada foi apagado');
    });
  });

  /* ====================================================================== */
  describe('Exames: impressão digital (SHA-256) e conferência', function () {

    it('anexar registra o SHA-256 e o tamanho do que foi gravado, na ficha e no índice', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      var m = a.salvarAnexo({ id: 'EXcccccc1', uidAvaliacao: 'U1', tamanho: 999 }, pdf('x'));
      igual(m.sha256, sha(pdf('x')));
      igual(m.tamanho, pdf('x').length, 'o tamanho é o do arquivo, não o informado');
      igual(JSON.parse(fs.readFileSync(path.join(pasta, 'anexos', 'EXcccccc1.json'), 'utf8')).sha256, m.sha256);
    });

    it('a conferência acha arquivo sumido, conteúdo trocado e PDF fora do índice — e registra a impressão dos antigos', function () {
      var pasta = U.pastaTemp();
      var dir = path.join(pasta, 'anexos');
      var a = criarArmazem(pasta, core);
      ['1', '2', '3', '4'].forEach(function (k) { a.salvarAnexo({ id: 'EXdddddd' + k, uidAvaliacao: 'U' + k }, pdf(k)); });
      return a.conferirAnexos().then(function (r) {
        igual(r.total, 4);
        igual(r.problemas, 0, JSON.stringify(r));
        igual(r.lidos, 4);
        // um exame "de antes" (sem impressão), um trocado no disco, um sumido e um PDF que ninguém registrou
        var idx = JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf8'));
        delete idx[0].sha256;
        fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify(idx));
        fs.writeFileSync(path.join(dir, 'EXdddddd2.pdf'), pdf('X'));     // mesmo tamanho, outro conteúdo
        fs.unlinkSync(path.join(dir, 'EXdddddd3.pdf'));
        fs.writeFileSync(path.join(dir, 'EXintruso01.pdf'), pdf('?'));
        return criarArmazem(pasta, core).conferirAnexos();
      }).then(function (r) {
        igual(r.registrados, 1, 'o antigo ganhou a impressão');
        igual(r.conteudoAlterado.join(), 'EXdddddd2');
        igual(r.semArquivo.join(), 'EXdddddd3');
        igual(r.foraDoIndice.join(), 'EXintruso01.pdf');
        igual(r.problemas, 3);
        var idx = JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf8'));
        igual(idx[0].sha256, sha(pdf('1')), 'gravada no índice');
        igual(JSON.parse(fs.readFileSync(path.join(dir, 'EXdddddd1.json'), 'utf8')).sha256, sha(pdf('1')), 'e na ficha');
      });
    });

    it('lê no máximo `limite` exames já conferidos por rodada, começando pelos de conferência mais antiga', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      for (var k = 0; k < 5; k++) a.salvarAnexo({ id: 'EXeeeeee' + k, uidAvaliacao: 'U' }, pdf(String(k)));
      return a.conferirAnexos({ limite: 2 }).then(function (r) {
        igual(r.lidos, 2);
        return a.conferirAnexos({ limite: 2 });
      }).then(function (r) {
        igual(r.lidos, 2);
        var conferidos = a.metasAnexos().filter(function (m) { return m.conferidoEm; }).length;
        igual(conferidos, 4, 'a segunda rodada pegou outros dois');
      });
    });

    it('no servidor: a conferência da partida põe o problema na Auditoria', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      a.salvarAnexo({ id: 'EXffffff1', uidAvaliacao: 'U1' }, pdf('1'));
      fs.unlinkSync(path.join(pasta, 'anexos', 'EXffffff1.pdf'));
      return U.comServidor(function (cli, srv) {
        return srv.conferirExames('teste').then(function () {
          var ev = srv.auditoria.listarAcessos({ evento: 'exames_com_problema' }).eventos;
          verdadeiro(ev.length >= 1, 'evento de alerta');
          verdadeiro(/1 sem o arquivo \(EXffffff1\)/.test(ev[0].detalhe), ev[0].detalhe);
        });
      }, pasta, { semConferenciaNaPartida: true });
    });
  });

  /* ====================================================================== */
  describe('Exames removidos: 3 anos contados da remoção', function () {

    it('exame anexado há 2 anos e removido hoje continua guardado (antes saía na limpeza do mesmo dia)', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      a.salvarAnexo({ id: 'EXantigo01', uidAvaliacao: 'U1' }, pdf('a'));
      var dois = new Date(Date.now() - 730 * 86400000);
      fs.utimesSync(path.join(pasta, 'anexos', 'EXantigo01.pdf'), dois, dois);
      igual(a.removerAnexos(['EXantigo01'], 'Fulana'), 1);
      a.aplicarRetencao();
      var rem = fs.readdirSync(path.join(pasta, 'anexos', 'removidos'));
      igual(rem.length, 2, 'PDF e ficha: ' + rem.join());
      var ficha = JSON.parse(fs.readFileSync(path.join(pasta, 'anexos', 'removidos', rem.filter(function (n) { return /\.json$/.test(n); })[0]), 'utf8'));
      igual(ficha.removidoPor, 'Fulana');
      igual(ficha.uidAvaliacao, 'U1');
      verdadeiro(!!ficha.removidoEm);
      falso(fs.existsSync(path.join(pasta, 'anexos', 'EXantigo01.json')), 'a ficha saiu de anexos/');
    });

    it('sai de vez depois de 3 anos da remoção; antes disso fica; nome fora do padrão nunca sai', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      var dir = path.join(pasta, 'anexos', 'removidos');
      var velho = 'EXvelho0001_' + carimboDiasAtras(core.RETENCAO_COPIAS.diasExamesRemovidos + 2);
      var quase = 'EXquase0001_' + carimboDiasAtras(core.RETENCAO_COPIAS.diasExamesRemovidos - 2);
      [velho + '.pdf', velho + '.json', quase + '.pdf', 'qualquer.pdf'].forEach(function (n) { fs.writeFileSync(path.join(dir, n), 'x'); });
      var antigo = new Date(Date.now() - 5000 * 86400000);
      fs.utimesSync(path.join(dir, 'qualquer.pdf'), antigo, antigo);
      a.aplicarRetencao();
      igual(fs.readdirSync(dir).sort().join(), [quase + '.pdf', 'qualquer.pdf'].sort().join());
      igual(a.tirarExpurgos().sort().join(), [velho + '.json', velho + '.pdf'].join(), 'o servidor fica sabendo do que saiu (vai para a Auditoria)');
      igual(core.RETENCAO_COPIAS.diasExamesRemovidos, 1096, '3 anos');
    });

    it('relógio adiantado (quase tudo "vencido" de uma vez): não apaga nada e avisa', function () {
      var pasta = U.pastaTemp();
      var a = criarArmazem(pasta, core);
      var dir = path.join(pasta, 'anexos', 'removidos');
      for (var k = 0; k < 12; k++) fs.writeFileSync(path.join(dir, 'EXmuito' + String(k).padStart(4, '0') + '_' + carimboDiasAtras(2000) + '.pdf'), 'x');
      a.aplicarRetencao();
      igual(pdfsEm(dir).length, 12, 'nada saiu');
      verdadeiro(/exames removidos.*Nada foi apagado; confira o relógio/.test(a.freioDaRetencao() || ''), String(a.freioDaRetencao()));
    });

    it('a cópia do mês fica 36 meses', function () {
      igual(core.RETENCAO_COPIAS.mesesMensais, 36);
    });
  });

  /* ====================================================================== */
  describe('Importar backup confere o SHA-256 dos PDFs', function () {

    it('o PDF estragado no caminho é recusado; os outros entram', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        var uid, backup;
        return U.chefe(cli, pasta).then(function () {
          return U.comando(cli, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { avaliacaoNec: 'Sim' }));
        }).then(function () { return cli.get('/api/estado'); }).then(function (r) {
          uid = r.corpo.estado.avaliacoes[0].uid;
          return cli.post('/api/anexos', pdf('bom'), { 'X-Uid-Avaliacao': uid, 'X-Nome': 'bom.pdf' });
        }).then(function () {
          return cli.post('/api/anexos', pdf('ruim'), { 'X-Uid-Avaliacao': uid, 'X-Nome': 'ruim.pdf' });
        }).then(function () { return cli.get('/api/backup?pdfs=1'); }).then(function (r) {
          backup = Buffer.isBuffer(r.corpo) ? JSON.parse(r.corpo.toString('utf8')) : r.corpo;
          igual(backup.anexos.length, 2);
          verdadeiro(backup.anexos.every(function (x) { return /^[0-9a-f]{64}$/.test(x.meta.sha256); }), 'o backup leva a impressão');
          var ruim = backup.anexos.filter(function (x) { return x.meta.nome === 'ruim.pdf'; })[0];
          ruim.conteudo = pdf('RUIM').toString('base64');                 // ainda é "PDF", mas não é o mesmo
          return cli.del('/api/anexos/' + backup.anexos[0].meta.id);
        }).then(function () {
          return cli.del('/api/anexos/' + backup.anexos[1].meta.id);
        }).then(function () { return cli.post('/api/importar', Buffer.from(JSON.stringify(backup))); }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          igual(r.corpo.pdfs, 1);
          igual(r.corpo.pdfsRecusados, 1);
          return cli.get('/api/anexos');
        }).then(function (r) {
          igual(r.corpo.metas.map(function (m) { return m.nome; }).join(), 'bom.pdf');
          return cli.get('/api/auditoria/acessos?evento=exames_com_problema');
        }).then(function (r) {
          verdadeiro(r.corpo.eventos.some(function (e) { return /importação: 1 PDF/.test(e.detalhe); }), JSON.stringify(r.corpo.eventos));
        });
      }, pasta);
    });
  });

  /* ====================================================================== */
  describe('Baixar todos os dados (.zip)', function () {

    /** Chefe com uma cirurgia, uma avaliação, dois exames (um removido) e devolve o que precisa para conferir. */
    function montar(cli, pasta) {
      var x = {};
      return U.chefe(cli, pasta).then(function () {
        return U.comando(cli, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { avaliacaoNec: 'Sim', paciente: 'Maria / Exportada' }));
      }).then(function () { return cli.get('/api/estado'); }).then(function (r) {
        x.avaliacao = r.corpo.estado.avaliacoes[0];
        return cli.post('/api/anexos', pdf('hemograma'), { 'X-Uid-Avaliacao': x.avaliacao.uid, 'X-Nome': encodeURIComponent('Hemograma ç: 1/2.pdf') });
      }).then(function (r) {
        x.fica = r.corpo.meta;
        return cli.post('/api/anexos', pdf('ecg'), { 'X-Uid-Avaliacao': x.avaliacao.uid, 'X-Nome': 'ecg.pdf' });
      }).then(function (r) {
        x.sai = r.corpo.meta;
        return cli.del('/api/anexos/' + x.sai.id);
      }).then(function () { return x; });
    }

    it('só o Anestesista chefe baixa', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli, srv, p, base) {
        return U.chefe(cli, pasta).then(function () {
          return U.novoUsuario(cli, base, 'anest', 'Anestesista Um', 'anestesista');
        }).then(function (an) { return an.get('/api/exportar-tudo'); }).then(function (r) {
          igual(r.status, 403);
          return U.novoUsuario(cli, base, 'secre', 'Secretária Um', 'secretaria');
        }).then(function (se) { return se.get('/api/exportar-tudo'); }).then(function (r) {
          igual(r.status, 403);
          return U.cliente(base).get('/api/exportar-tudo');
        }).then(function (r) {
          igual(r.status, 401, 'sem sessão');
        });
      }, pasta);
    });

    it('o pacote abre, tem tudo, e cada arquivo confere com o SHA256SUMS', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        var x;
        return montar(cli, pasta).then(function (r) { x = r; return cli.get('/api/exportar-tudo'); }).then(function (r) {
          igual(r.status, 200);
          igual(r.headers.get('content-type'), 'application/zip');
          verdadeiro(/attachment; filename="anestesia_todos_os_dados_2026-10-05\.zip"/.test(r.headers.get('content-disposition')), r.headers.get('content-disposition'));
          var z = lerZip(r.corpo);
          falso(z.zip64, 'pacote pequeno: zip comum');
          igual(z.nomes[0], 'LEIA-ME.txt', 'o LEIA-ME vem primeiro');

          // os dados voltam para o sistema
          var nomeBackup = 'backup/anestesia_backup_2026-10-05.json';
          var imp = U.DADOS.importarJSON(z.ler(nomeBackup).toString('utf8'));
          verdadeiro(imp.ok, imp.erro);
          igual(imp.estado.cirurgias[0].paciente, 'Maria / Exportada');

          // planilhas
          verdadeiro(z.nomes.indexOf('planilhas/CIRURGIAS.csv') >= 0, z.nomes.join('\n'));
          verdadeiro(/Maria \/ Exportada/.test(z.ler('planilhas/CIRURGIAS.csv').toString('utf8')));

          // o exame, na pasta da avaliação, com nome que abre em qualquer sistema, e igual ao enviado
          var arq = 'exames/' + x.avaliacao.id + '/' + x.fica.id + ' - Hemograma ç_ 1_2.pdf';
          verdadeiro(z.nomes.indexOf(arq) >= 0, 'esperava ' + arq + ' em\n' + z.nomes.join('\n'));
          igual(z.ler(arq).toString(), pdf('hemograma').toString());
          var indice = z.ler('exames/indice.csv').toString('utf8');
          verdadeiro(indice.indexOf(sha(pdf('hemograma'))) >= 0, 'o índice tem o SHA-256');
          verdadeiro(/Maria \/ Exportada/.test(indice) && /;confere/.test(indice), indice);

          // o removido, com quem removeu
          var removido = z.nomes.filter(function (n) { return n.indexOf('exames_removidos/' + x.avaliacao.id + '/' + x.sai.id + '_') === 0; });
          igual(removido.length, 1, z.nomes.join('\n'));
          igual(z.ler(removido[0]).toString(), pdf('ecg').toString());
          verdadeiro(/Chefe da Clínica/.test(z.ler('exames_removidos/indice.csv').toString('utf8')), 'quem removeu');

          // LOG e conferência
          verdadeiro(z.nomes.indexOf('log/acessos.jsonl') >= 0, 'o LOG de acessos vai junto');
          verdadeiro(/Nenhum problema encontrado/.test(z.ler('CONFERENCIA.txt').toString('utf8')), z.ler('CONFERENCIA.txt').toString('utf8'));

          // SHA256SUMS: uma linha por arquivo (menos ele mesmo), e cada uma confere
          var linhas = z.ler('SHA256SUMS.txt').toString('utf8').trim().split('\n');
          igual(linhas.length, z.nomes.length - 1);
          linhas.forEach(function (l) {
            var m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l);
            verdadeiro(!!m, 'linha no formato do sha256sum: ' + l);
            igual(sha(z.ler(m[2])), m[1], m[2]);
          });
          return cli.get('/api/auditoria/acessos?evento=dados_exportados');
        }).then(function (r) {
          igual(r.corpo.eventos.length, 1);
          verdadeiro(/1 exame\(s\), 1 removido\(s\)/.test(r.corpo.eventos[0].detalhe), r.corpo.eventos[0].detalhe);
        });
      }, pasta);
    });

    it('exame trocado no disco: o pacote sai, e a conferência e o índice dizem qual', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        var x;
        return montar(cli, pasta).then(function (r) {
          x = r;
          fs.writeFileSync(path.join(pasta, 'anexos', x.fica.id + '.pdf'), pdf('HEMOGRAMA'));
          return cli.get('/api/exportar-tudo');
        }).then(function (r) {
          var z = lerZip(r.corpo);
          verdadeiro(/PROBLEMAS \(1\)/.test(z.ler('CONFERENCIA.txt').toString('utf8')));
          verdadeiro(/CONTEÚDO DIFERENTE DO REGISTRADO/.test(z.ler('exames/indice.csv').toString('utf8')));
        });
      }, pasta);
    });

    it('no formato ZIP64 (o de pacotes acima de 4 GB ou 65.535 arquivos) também abre e confere', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        return montar(cli, pasta).then(function () { return cli.get('/api/exportar-tudo'); }).then(function (r) {
          var z = lerZip(r.corpo);
          verdadeiro(z.zip64, 'fim ZIP64');
          verdadeiro(z.nomes.length > 8, z.nomes.join());
          z.ler('SHA256SUMS.txt').toString('utf8').trim().split('\n').forEach(function (l) {
            var m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l);
            igual(sha(z.ler(m[2])), m[1], m[2]);
          });
        });
      }, pasta, { forcarZip64ParaTestes: true });
    });

    it('o gravador de zip recusa escrever depois de fechado e para se a conexão cai', function () {
      var EventEmitter = require('events');
      var saida = new EventEmitter();
      saida.write = function () { return false; };            // a rede "não anda": vai esperar o drain
      var z = pacoteZip.criarPacoteZip(saida);
      var esperando = z.adicionar('a.txt', 'x');
      saida.emit('close');                                    // o navegador cancelou
      return esperando.then(function () { throw new Error('devia falhar'); }, function (e) {
        verdadeiro(/conexão caiu/.test(e.message), e.message);
        return z.adicionar('b.txt', 'y').then(function () { throw new Error('devia falhar'); }, function (e2) {
          verdadeiro(/conexão caiu/.test(e2.message), e2.message);
        });
      });
    });
  });
};
