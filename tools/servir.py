#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
============================================================================
servir.py — Abre o sistema no navegador
============================================================================
Sobe um servidor estatico na raiz do projeto e abre o web app. Precisa ser
servidor (e nao duplo clique no index.html) porque a pagina carrega os
modulos de ../core/, e alguns navegadores bloqueiam isso em file://.

Uso:
    python tools/servir.py            # porta 8080
    python tools/servir.py 9000       # outra porta
    python tools/servir.py --nao-abrir

Encerre com Ctrl+C.
============================================================================
"""
import functools
import http.server
import os
import posixpath
import socket
import socketserver
import sys
import threading
import urllib.parse
import webbrowser

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO_APP = "/webapp/"

# So estas pastas sao servidas. A raiz do projeto tem planilha com dados
# (saida/), dados extraidos (data/) e ferramentas; nada disso precisa sair
# pelo navegador. Menor superficie possivel, mesmo em 127.0.0.1.
PASTAS_PUBLICAS = ("/webapp/", "/core/")

# Mesma politica do <meta> do index.html, mais o que so vale por cabecalho
# (frame-ancestors: ninguem embute o sistema num iframe de outro site).
POLITICA = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; "
            "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


class Manipulador(http.server.SimpleHTTPRequestHandler):
    """Serve so o web app e o core, sem cache e sem log ruidoso."""

    def _caminho_permitido(self):
        # Confere o caminho JA decodificado e normalizado — exatamente o que
        # translate_path vai abrir. Conferir o texto cru deixaria passar
        # "/webapp/%2e%2e/saida/..." (o ".." so aparece depois de decodificar).
        cru = self.path.split("?", 1)[0].split("#", 1)[0]
        decodificado = urllib.parse.unquote(cru, errors="surrogatepass")
        if "\\" in decodificado or "\x00" in decodificado:
            return False
        normal = posixpath.normpath(decodificado)
        if normal in ("/", "."):
            return "redirecionar"
        if normal == "/webapp":
            return True
        return normal.startswith(PASTAS_PUBLICAS)

    def _responder(self, head):
        ok = self._caminho_permitido()
        if ok == "redirecionar":
            self.send_response(302)
            self.send_header("Location", CAMINHO_APP)
            self.end_headers()
            return None
        if not ok:
            self.send_error(404, "Nao encontrado")
            return None
        return super().do_HEAD() if head else super().do_GET()

    def do_GET(self):
        self._responder(False)

    def do_HEAD(self):
        self._responder(True)

    def list_directory(self, path):
        # Sem listagem de pasta: so arquivos pedidos pelo nome.
        self.send_error(404, "Nao encontrado")
        return None

    def end_headers(self):
        # Sem cache: durante o uso diario o arquivo pode ser atualizado e o
        # usuario nao deveria precisar limpar o cache do navegador.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Content-Security-Policy", POLITICA)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()

    def log_message(self, formato, *args):
        # Silencia 200/304; mostra apenas erro, que e o que importa aqui.
        codigo = args[1] if len(args) > 1 else ""
        if str(codigo).startswith(("4", "5")):
            sys.stderr.write("  %s %s\n" % (codigo, args[0] if args else ""))

    def guess_type(self, path):
        # Garante UTF-8 nos tipos textuais (Windows costuma devolver ANSI).
        tipo = super().guess_type(path)
        if path.endswith(".woff2"):
            return "font/woff2"  # o registro do Windows nem sempre conhece
        if tipo in ("text/html", "text/css", "text/javascript",
                    "application/javascript", "application/json"):
            return tipo + "; charset=utf-8"
        return tipo


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def porta_livre(porta):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", porta)) != 0


def main():
    args = [a for a in sys.argv[1:]]
    abrir = "--nao-abrir" not in args
    args = [a for a in args if not a.startswith("--")]

    # Prioridade: argumento na linha de comando > variavel de ambiente PORT
    # (usada por ferramentas de preview que atribuem a porta sozinhas) > 8080.
    porta = int(args[0]) if args else int(os.environ.get("PORT", 8080))

    # Se a porta pedida esta ocupada, tenta as proximas em vez de estourar.
    tentativas = 0
    while not porta_livre(porta) and tentativas < 20:
        porta += 1
        tentativas += 1
    if tentativas:
        print("Porta ocupada; usando %d." % porta)

    if not os.path.isdir(os.path.join(RAIZ, "webapp")):
        sys.exit("Nao encontrei a pasta webapp/ em %s" % RAIZ)
    if not os.path.isfile(os.path.join(RAIZ, "webapp", "js", "seed.js")):
        print("Aviso: webapp/js/seed.js nao existe. O sistema abre vazio.")
        print("       Gere com: python tools/gerar_seed_js.py")

    manipulador = functools.partial(Manipulador, directory=RAIZ)
    url = "http://localhost:%d%s" % (porta, CAMINHO_APP)

    with Servidor(("127.0.0.1", porta), manipulador) as httpd:
        print("=" * 62)
        print("  Sistema de Gestao e Escala de Anestesia")
        print("=" * 62)
        print("  Servindo: %s" % RAIZ)
        print("  Endereco: %s" % url)
        print("  Encerrar: Ctrl+C")
        print("=" * 62)

        if abrir:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")


if __name__ == "__main__":
    main()
