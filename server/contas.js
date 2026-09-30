/**
 * ============================================================================
 * CONTAS — Usuários, senhas e sessões do modo servidor
 * ============================================================================
 *   <dados>/usuarios.json   { login, nome, papel, ativo, sal, hash, criadoEm }
 *   <dados>/sessoes.json    sessões ativas, pelo SHA-256 do token (quem lê o
 *                           arquivo não consegue entrar com ele)
 *
 * Senha: scrypt (Node, sem biblioteca), sal próprio por usuário, comparação
 * em tempo constante. Sessão: token aleatório de 256 bits em cookie
 * HttpOnly + SameSite=Strict; cai após 12 h sem uso ou 7 dias no total.
 * Tentativas: 5 senhas erradas em 15 min travam aquele login (e aquele
 * endereço) por 15 min.
 *
 * Papéis: 'admin' (tudo, inclusive usuários, cadastro, financeiro e backup)
 * e 'equipe' (a operação do dia a dia).
 *
 * Primeiro acesso: sem nenhum usuário, o servidor cria um código de uso
 * único (mostrado na janela do servidor e gravado em PRIMEIRO_ACESSO.txt);
 * quem tem o código cria o administrador pela própria tela de entrada.
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var PAPEIS = ['admin', 'equipe'];
var LOGIN = /^[a-z0-9._-]{3,30}$/;
var OCIOSA_MS = 12 * 3600 * 1000;
var MAXIMA_MS = 7 * 24 * 3600 * 1000;
var TENTATIVAS = 5;
var JANELA_MS = 15 * 60 * 1000;

function criarContas(pasta) {
  var arqUsuarios = path.join(pasta, 'usuarios.json');
  var arqSessoes = path.join(pasta, 'sessoes.json');
  var arqCodigo = path.join(pasta, 'PRIMEIRO_ACESSO.txt');

  function ler(arquivo, padrao) {
    try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { return padrao; }
  }
  function gravar(arquivo, obj) {
    var tmp = arquivo + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
    fs.renameSync(tmp, arquivo);
  }

  var usuarios = ler(arqUsuarios, []);
  if (!Array.isArray(usuarios)) usuarios = [];
  var sessoes = ler(arqSessoes, {});
  if (!sessoes || typeof sessoes !== 'object') sessoes = {};
  var tentativas = {};    // chave -> { falhas, desde, travadoAte }
  var codigo = null;

  function hash(senha, sal) {
    return crypto.scryptSync(String(senha), sal, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  }
  function sha(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
  function publico(u) { return u ? { login: u.login, nome: u.nome, papel: u.papel, ativo: u.ativo !== false } : null; }
  function porLogin(login) {
    var l = String(login || '').trim().toLowerCase();
    return usuarios.filter(function (u) { return u.login === l; })[0] || null;
  }

  var gravarSessoesAgendado = null;
  function salvarSessoes(agora) {
    if (agora) { clearTimeout(gravarSessoesAgendado); gravarSessoesAgendado = null; gravar(arqSessoes, sessoes); return; }
    if (gravarSessoesAgendado) return;
    gravarSessoesAgendado = setTimeout(function () { gravarSessoesAgendado = null; gravar(arqSessoes, sessoes); }, 5000);
    if (gravarSessoesAgendado.unref) gravarSessoesAgendado.unref();
  }

  /* ------------------------------------------------------ primeiro acesso */

  /** Código de uso único enquanto não houver usuário. null quando já há. */
  function codigoPrimeiroAcesso() {
    if (usuarios.length) return null;
    if (!codigo) {
      codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
      fs.writeFileSync(arqCodigo, 'Código para criar o administrador (uso único): ' + codigo + '\n');
    }
    return codigo;
  }

  /* --------------------------------------------------------- validações */

  function validar(dados, novo) {
    var erros = [];
    if (novo && !LOGIN.test(String(dados.login || ''))) {
      erros.push({ campo: 'login', msg: 'Login: 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado.' });
    }
    if (dados.nome !== undefined && (String(dados.nome).trim().length < 2 || String(dados.nome).trim().length > 80)) {
      erros.push({ campo: 'nome', msg: 'Nome: de 2 a 80 letras.' });
    }
    if (dados.papel !== undefined && PAPEIS.indexOf(dados.papel) < 0) erros.push({ campo: 'papel', msg: 'Papel inválido.' });
    if (dados.senha !== undefined) {
      var s = String(dados.senha);
      if (s.length < 8) erros.push({ campo: 'senha', msg: 'A senha precisa de pelo menos 8 caracteres.' });
      else if (s.length > 200) erros.push({ campo: 'senha', msg: 'Senha longa demais.' });
    }
    return erros;
  }

  /* ----------------------------------------------------------- usuários */

  function criarUsuario(dados) {
    var d = { login: String(dados.login || '').trim().toLowerCase(), nome: String(dados.nome || '').trim(),
      papel: dados.papel || 'equipe', senha: dados.senha };
    var erros = validar(d, true);
    if (porLogin(d.login)) erros.push({ campo: 'login', msg: 'Já existe um usuário "' + d.login + '".' });
    if (erros.length) return { ok: false, erros: erros };
    var sal = crypto.randomBytes(16).toString('hex');
    usuarios.push({ login: d.login, nome: d.nome, papel: d.papel, ativo: true, sal: sal, hash: hash(d.senha, sal),
      criadoEm: new Date().toISOString() });
    gravar(arqUsuarios, usuarios);
    if (codigo) { codigo = null; try { fs.unlinkSync(arqCodigo); } catch (e) { /* ok */ } }
    return { ok: true, usuario: publico(porLogin(d.login)) };
  }

  function adminsAtivos() { return usuarios.filter(function (u) { return u.papel === 'admin' && u.ativo !== false; }); }

  /** Muda nome, papel, ativo ou define senha nova (pelo administrador). */
  function alterarUsuario(login, dados) {
    var u = porLogin(login);
    if (!u) return { ok: false, erros: [{ campo: 'login', msg: 'Usuário não encontrado.' }] };
    var d = {};
    ['nome', 'papel', 'senha'].forEach(function (k) { if (dados[k] !== undefined && dados[k] !== '') d[k] = dados[k]; });
    var erros = validar(d, false);
    var ficaAdminAtivo = (d.papel || u.papel) === 'admin' && (dados.ativo === undefined ? u.ativo !== false : !!dados.ativo);
    if (u.papel === 'admin' && u.ativo !== false && !ficaAdminAtivo && adminsAtivos().length <= 1) {
      erros.push({ campo: 'papel', msg: 'Este é o único administrador ativo: crie outro antes de tirá-lo.' });
    }
    if (erros.length) return { ok: false, erros: erros };
    if (d.nome) u.nome = String(d.nome).trim();
    if (d.papel) u.papel = d.papel;
    if (dados.ativo !== undefined) u.ativo = !!dados.ativo;
    if (d.senha) { u.sal = crypto.randomBytes(16).toString('hex'); u.hash = hash(d.senha, u.sal); }
    gravar(arqUsuarios, usuarios);
    // Senha trocada ou acesso cortado: as sessões abertas caem.
    if (d.senha || u.ativo === false) encerrarSessoesDe(u.login);
    return { ok: true, usuario: publico(u) };
  }

  /** A própria pessoa troca a senha, confirmando a atual. */
  function trocarSenha(login, atual, nova) {
    var u = porLogin(login);
    // Quem tem uma sessão aberta (esquecida, roubada) não pode descobrir a senha
    // atual por tentativa e erro: mesma trava do login, por usuário.
    var chave = 's:' + (u ? u.login : String(login || '').trim().toLowerCase());
    if (travado(chave)) {
      return { ok: false, travado: true, erros: [{ campo: 'atual', msg: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' }] };
    }
    if (!u || !confere(u, atual)) {
      falhou(chave);
      return { ok: false, erros: [{ campo: 'atual', msg: 'A senha atual não confere.' }] };
    }
    delete tentativas[chave];
    var erros = validar({ senha: nova }, false);
    if (erros.length) return { ok: false, erros: erros };
    u.sal = crypto.randomBytes(16).toString('hex');
    u.hash = hash(nova, u.sal);
    gravar(arqUsuarios, usuarios);
    return { ok: true };
  }

  function listar() { return usuarios.map(publico); }
  function usuario(login) { return publico(porLogin(login)); }

  /* --------------------------------------------------------- tentativas */

  function travado(chave) {
    var t = tentativas[chave];
    return !!(t && t.travadoAte && t.travadoAte > Date.now());
  }
  function falhou(chave) {
    var agora = Date.now();
    var t = tentativas[chave];
    if (!t || agora - t.desde > JANELA_MS) t = tentativas[chave] = { falhas: 0, desde: agora, travadoAte: 0 };
    t.falhas++;
    if (t.falhas >= TENTATIVAS) t.travadoAte = agora + JANELA_MS;
  }

  function confere(u, senha) {
    var a = Buffer.from(hash(senha, u.sal), 'hex');
    var b = Buffer.from(u.hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Confere login e senha. Devolve { ok, usuario } ou { ok:false, travado }.
   * `ip` entra na trava para ninguém travar o login alheio de outro lugar
   * sem também travar a si mesmo.
   */
  function entrar(login, senha, ip) {
    var l = String(login || '').trim().toLowerCase();
    var chaves = ['l:' + l, 'i:' + ip];
    if (chaves.some(travado)) return { ok: false, travado: true };
    var u = porLogin(l);
    // Mesmo sem usuário, calcula um hash: o tempo de resposta não revela quem existe.
    var bate = u ? confere(u, senha) : (hash(senha, 'x'), false);
    if (!bate || u.ativo === false) { chaves.forEach(falhou); return { ok: false }; }
    chaves.forEach(function (k) { delete tentativas[k]; });
    return { ok: true, usuario: publico(u) };
  }

  /* ----------------------------------------------------------- sessões */

  function iniciarSessao(login) {
    var token = crypto.randomBytes(32).toString('base64url');
    var agora = Date.now();
    sessoes[sha(token)] = { login: String(login), criadaEm: agora, usadaEm: agora };
    salvarSessoes(true);
    return token;
  }

  /** Usuário da sessão (e renova o uso), ou null. */
  function sessao(token) {
    if (!token) return null;
    var k = sha(token);
    var s = sessoes[k];
    if (!s) return null;
    var agora = Date.now();
    var u = porLogin(s.login);
    if (!u || u.ativo === false || agora - s.usadaEm > OCIOSA_MS || agora - s.criadaEm > MAXIMA_MS) {
      delete sessoes[k];
      salvarSessoes();
      return null;
    }
    if (agora - s.usadaEm > 60000) { s.usadaEm = agora; salvarSessoes(); }
    return publico(u);
  }

  function encerrarSessao(token) {
    if (!token) return;
    delete sessoes[sha(token)];
    salvarSessoes(true);
  }

  /** Derruba as sessões de um usuário. `manter` (token) poupa a sessão de quem acabou de trocar a senha. */
  function encerrarSessoesDe(login, manter) {
    var poupar = manter ? sha(manter) : null;
    Object.keys(sessoes).forEach(function (k) { if (sessoes[k].login === login && k !== poupar) delete sessoes[k]; });
    salvarSessoes(true);
  }

  return {
    PAPEIS: PAPEIS,
    codigoPrimeiroAcesso: codigoPrimeiroAcesso,
    temUsuarios: function () { return usuarios.length > 0; },
    criarUsuario: criarUsuario,
    alterarUsuario: alterarUsuario,
    trocarSenha: trocarSenha,
    listar: listar,
    usuario: usuario,
    entrar: entrar,
    iniciarSessao: iniciarSessao,
    sessao: sessao,
    encerrarSessao: encerrarSessao,
    encerrarSessoesDe: encerrarSessoesDe,
    gravarSessoes: function () { salvarSessoes(true); }
  };
}

module.exports = { criarContas: criarContas };
