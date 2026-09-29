#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
============================================================================
extrair_dados.py — Exporta os dados mestres da planilha para JSON
============================================================================
Gera dois arquivos:

  data/seed.json       Dados mestres para o sistema arrancar já povoado:
                       ANESTESISTAS (15) + ESCALA_BASE (30 linhas).
  data/escalas_ref.json  As três escalas mensais como estão HOJE na planilha.
                       Serve de gabarito: a QA compara a escala que o motor
                       gera contra estas linhas, provando que o rodizio foi
                       reproduzido sem desvio.

Uso:
    python tools/extrair_dados.py "C:/caminho/Escala_Total_Anestesia.xlsx"
============================================================================
"""
import datetime
import json
import os
import sys

try:
    import openpyxl
except ImportError:
    sys.exit("Instale a dependencia: pip install openpyxl")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_DADOS = os.path.join(RAIZ, "data")

ABAS_ESCALA = [
    (10, "ESCALA OUTUBRO 2026"),
    (11, "ESCALA NOVEMBRO 2026"),
    (12, "ESCALA DEZEMBRO 2026"),
]


def texto(v):
    """Celula -> string limpa ('' quando vazia)."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def data_iso(v):
    """Celula -> 'YYYY-MM-DD' ('' quando nao for data)."""
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return texto(v)


def inteiro(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def ler_anestesistas(wb):
    ws = wb["ANESTESISTAS"]
    out = []
    for r in range(2, ws.max_row + 1):
        ident = texto(ws.cell(r, 1).value)
        nome = texto(ws.cell(r, 2).value)
        if not ident and not nome:
            continue
        out.append({
            "id": ident,
            "nome": nome,
            "ativo": texto(ws.cell(r, 3).value) or "Sim",
            "telefone": texto(ws.cell(r, 4).value),
            "email": texto(ws.cell(r, 5).value),
            "obs": texto(ws.cell(r, 6).value),
        })
    return out


def ler_escala_base(wb):
    ws = wb["ESCALA_BASE"]
    out = []
    for r in range(2, ws.max_row + 1):
        pos = inteiro(ws.cell(r, 2).value)
        nome = texto(ws.cell(r, 3).value)
        if pos is None and not nome:
            continue
        out.append({
            "dia": texto(ws.cell(r, 1).value),
            "posicao": pos,
            "nome": nome,
            "id": texto(ws.cell(r, 4).value),
        })
    return out


def ler_escala_mensal(wb, aba):
    ws = wb[aba]
    out = []
    for r in range(2, ws.max_row + 1):
        data = data_iso(ws.cell(r, 1).value)
        if not data:
            continue
        out.append({
            "data": data,
            "dia": texto(ws.cell(r, 2).value),
            "posicao": inteiro(ws.cell(r, 3).value),
            "calculado": texto(ws.cell(r, 4).value),
            "idCalculado": texto(ws.cell(r, 5).value),
            "ajuste": texto(ws.cell(r, 6).value) or "Não",
            "substituto": texto(ws.cell(r, 7).value),
            # Coluna H e uma formula; data_only=True traz o valor cacheado.
            "efetivo": texto(ws.cell(r, 8).value),
            "motivo": texto(ws.cell(r, 9).value),
        })
    return out


def gravar(nome, conteudo):
    os.makedirs(DIR_DADOS, exist_ok=True)
    caminho = os.path.join(DIR_DADOS, nome)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(conteudo, f, ensure_ascii=False, indent=1)
    return caminho


def main():
    if len(sys.argv) < 2:
        sys.exit("Informe o caminho da planilha .xlsx")
    caminho = sys.argv[1]
    if not os.path.exists(caminho):
        sys.exit("Planilha nao encontrada: " + caminho)

    wb = openpyxl.load_workbook(caminho, data_only=True)

    anestesistas = ler_anestesistas(wb)
    escala_base = ler_escala_base(wb)
    seed = {
        "origem": os.path.basename(caminho),
        "extraidoEm": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "ANESTESISTAS": anestesistas,
        "ESCALA_BASE": escala_base,
    }
    p1 = gravar("seed.json", seed)

    escalas = {}
    for mes, aba in ABAS_ESCALA:
        escalas[str(mes)] = ler_escala_mensal(wb, aba)
    p2 = gravar("escalas_ref.json", escalas)

    print("Gravado: %s  (%d anestesistas, %d linhas de ESCALA_BASE)"
          % (p1, len(anestesistas), len(escala_base)))
    for mes, aba in ABAS_ESCALA:
        print("  %s -> %d linhas" % (aba, len(escalas[str(mes)])))
    print("Gravado: %s" % p2)


if __name__ == "__main__":
    main()
