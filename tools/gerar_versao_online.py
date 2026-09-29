#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
============================================================================
gerar_versao_online.py — Página única para publicar o sistema online
============================================================================
Gera UM arquivo HTML com todo o sistema dentro (CSS, core, telas, seed e o
logo), pronto para publicar como página do Claude (Artifact).

Diferenças para a versão instalada (webapp/index.html):
  - tudo embutido: a página publicada não carrega arquivos soltos;
  - window.MODO_ONLINE = true: a página publicada não baixa nada sozinha —
    PDF, CSV (.zip) e backup saem pela capacidade "downloads" da página
    (publicar com capabilities {downloads: true}), que pede confirmação a
    quem está vendo; sem ela, o botão avisa em vez de ficar mudo;
  - inclui js/demo_online.js: quem abre o link pela primeira vez vê
    cirurgias de EXEMPLO (fictícias, marcadas) em vez de telas vazias;
  - sem a meta Content-Security-Policy: quem hospeda define a política.

A lista e a ORDEM dos scripts vêm do próprio webapp/index.html — não há
uma segunda lista para esquecer de atualizar.

Com --completo, a saída é um documento HTML inteiro (doctype, charset,
viewport), pronto para hospedar em GitHub Pages ou qualquer servidor comum.
Sem a capacidade "downloads" do Artifact, o download é o comum do navegador.

Uso:
    python tools/gerar_versao_online.py [saida.html] [--completo]
    (padrão: publicacao/gestao_anestesia.html)
============================================================================
"""
import base64
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBAPP = os.path.join(RAIZ, "webapp")


def ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def scripts_da_pagina():
    """Caminhos (relativos a webapp/) das <script src> do index.html, em ordem."""
    html = ler(os.path.join(WEBAPP, "index.html"))
    return re.findall(r'<script src="([^"]+)"></script>', html)


def embutir_js(rel):
    codigo = ler(os.path.normpath(os.path.join(WEBAPP, rel)))
    # "</script" dentro de uma string encerraria o bloco antes da hora.
    codigo = re.sub(r"</(script)", r"<\\/\1", codigo, flags=re.IGNORECASE)
    return "<script>\n/* ---- %s ---- */\n%s\n</script>" % (rel, codigo)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    completo = "--completo" in sys.argv[1:]
    saida = args[0] if args else os.path.join(RAIZ, "publicacao", "gestao_anestesia.html")
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)

    css = ler(os.path.join(WEBAPP, "css", "app.css"))

    # A página única não tem a pasta public/: a Inter (OFL) vai embutida no CSS,
    # senão o @font-face aponta para um arquivo que não existe e cai em Arial.
    referencia_fonte = 'url("../public/fonts/inter-latin-wght.woff2")'
    with open(os.path.join(WEBAPP, "public", "fonts", "inter-latin-wght.woff2"), "rb") as f:
        fonte = "url(data:font/woff2;base64,%s)" % base64.b64encode(f.read()).decode("ascii")
    if referencia_fonte not in css:
        sys.exit("gerar_versao_online: o @font-face da Inter mudou em app.css; ajuste a substituicao.")
    css = css.replace(referencia_fonte, fonte)

    with open(os.path.join(WEBAPP, "public", "logo.png"), "rb") as f:
        logo = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")

    with open(os.path.join(WEBAPP, "public", "the-one-logo.png"), "rb") as f:
        logo_marca = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")

    scripts = scripts_da_pagina()
    # Os exemplos entram antes da casca (06_app), que é quem dá a partida.
    i = next(k for k, s in enumerate(scripts) if s.endswith("06_app.js"))
    scripts = scripts[:i] + ["js/demo_online.js"] + scripts[i:]

    partes = [
        "<title>Gestão de Anestesia</title>",
        '<meta name="description" content="Escala, cirurgias, avaliações pré-anestésicas e produção do grupo de anestesistas.">',
        '<meta name="referrer" content="no-referrer">',
        '<link rel="icon" href="%s">' % logo,
        "<style>\n%s\n</style>" % css,
        "<noscript><p style=\"max-width:620px;margin:56px auto;font:14px/1.6 system-ui\">"
        "Este sistema faz todos os cálculos no próprio navegador e precisa de JavaScript ativado.</p></noscript>",
        "<script>window.MODO_ONLINE = true; window.LOGO_URL = %r; window.LOGO_MARCA_URL = %r;</script>" % (logo, logo_marca),
    ]
    partes += [embutir_js(s) for s in scripts]

    corpo = "\n".join(partes) + "\n"
    if completo:
        corpo = ('<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
                 '<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n'
                 + corpo + '</body>\n</html>\n')
    with open(saida, "w", encoding="utf-8", newline="\n") as f:
        f.write(corpo)

    print("Gerado: %s (%d KB, %d scripts)" % (saida, os.path.getsize(saida) // 1024, len(scripts)))


if __name__ == "__main__":
    main()
