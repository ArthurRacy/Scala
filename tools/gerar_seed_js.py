#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
============================================================================
gerar_seed_js.py — Embute os dados mestres no web app
============================================================================
Le data/seed.json e escreve webapp/js/seed.js com a variavel SEED_INICIAL.

Por que embutir em vez de buscar o .json por fetch: o sistema precisa abrir
tambem em file:// (duplo clique), e fetch de arquivo local e bloqueado pelo
navegador. Um <script> com a variavel dentro funciona nos dois casos.

Uso:
    python tools/gerar_seed_js.py
============================================================================
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = os.path.join(RAIZ, "data", "seed.json")
SAIDA = os.path.join(RAIZ, "webapp", "js", "seed.js")

CABECALHO = """/**
 * ============================================================================
 * seed.js — Dados mestres da planilha (ARQUIVO GERADO, NAO EDITE A MAO)
 * ============================================================================
 * Origem : %(origem)s
 * Gerado : %(gerado)s
 * Conteudo: %(n_anest)d anestesistas e %(n_base)d postos na escala-base.
 *
 * Para atualizar depois de mexer na planilha:
 *     python tools/extrair_dados.py "<planilha.xlsx>"
 *     python tools/gerar_seed_js.py
 *
 * Este arquivo so e usado quando o navegador ainda nao tem nada salvo. A
 * partir da primeira gravacao, a verdade passa a ser o localStorage, e o
 * seed serve apenas de ponto de partida para uma instalacao nova.
 * ============================================================================
 */
'use strict';

var SEED_INICIAL = """


def main():
    if not os.path.exists(ENTRADA):
        sys.exit("Falta %s. Rode primeiro: python tools/extrair_dados.py \"<planilha.xlsx>\"" % ENTRADA)

    with open(ENTRADA, encoding="utf-8") as f:
        seed = json.load(f)

    anest = seed.get("ANESTESISTAS", [])
    base = seed.get("ESCALA_BASE", [])

    if not anest:
        sys.exit("O seed.json nao tem anestesistas.")
    if not base:
        sys.exit("O seed.json nao tem ESCALA_BASE.")

    corpo = {
        "origem": seed.get("origem", "(desconhecida)"),
        "extraidoEm": seed.get("extraidoEm", ""),
        "ANESTESISTAS": anest,
        "ESCALA_BASE": base,
    }

    texto = CABECALHO % {
        "origem": seed.get("origem", "(desconhecida)"),
        "gerado": seed.get("extraidoEm", ""),
        "n_anest": len(anest),
        "n_base": len(base),
    }
    texto += json.dumps(corpo, ensure_ascii=False, indent=1)
    texto += ";\n"

    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        f.write(texto)

    print("Gravado: %s" % SAIDA)
    print("  %d anestesistas, %d postos na escala-base" % (len(anest), len(base)))


if __name__ == "__main__":
    main()
