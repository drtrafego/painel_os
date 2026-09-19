#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reduz uma leitura do Google Calendar a contagens sem PII.

Este arquivo não chama nem altera o Google Calendar. Ele recebe a resposta de
uma leitura já autorizada e grava somente janela, duração e contagens por dia.
Título, descrição, participantes, local, URL e IDs nunca atravessam a saída.
"""

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


VERSAO = 1


class ErroCalendario(ValueError):
    pass


def instante(valor, campo):
    if not isinstance(valor, str):
        raise ErroCalendario(f"{campo}: data ausente")
    try:
        data = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError as e:
        raise ErroCalendario(f"{campo}: data inválida") from e
    if data.tzinfo is None:
        raise ErroCalendario(f"{campo}: data sem fuso")
    return data


def sanitizar(bruto, inicio, fim, coletado_em):
    if not isinstance(bruto, dict):
        raise ErroCalendario("resposta não é objeto")
    recipiente = bruto.get("result") if isinstance(bruto.get("result"), dict) else bruto
    eventos = recipiente.get("events")
    if not isinstance(eventos, list):
        raise ErroCalendario("events não é lista")
    if recipiente.get("next_page_token") or recipiente.get("nextPageToken"):
        raise ErroCalendario("leitura paginada incompleta")

    janela_inicio = instante(inicio, "janela.inicio")
    janela_fim = instante(fim, "janela.fim")
    capturado = instante(coletado_em, "coletado_em")
    if janela_fim <= janela_inicio:
        raise ErroCalendario("janela invertida")

    dias = {}
    encerrados = futuros = minutos_total = ocupados = 0
    respostas = {"aceito": 0, "recusado": 0, "talvez": 0, "pendente": 0, "não informado": 0}
    mapa_resposta = {
        "accepted": "aceito", "declined": "recusado", "tentative": "talvez",
        "needsAction": "pendente", None: "não informado",
    }
    for indice, evento in enumerate(eventos):
        if not isinstance(evento, dict):
            raise ErroCalendario(f"events[{indice}] não é objeto")
        comeco = instante(evento.get("start"), f"events[{indice}].start")
        termino = instante(evento.get("end"), f"events[{indice}].end")
        if termino <= comeco or comeco < janela_inicio or comeco >= janela_fim:
            raise ErroCalendario(f"events[{indice}]: horário fora do contrato")
        duracao = round((termino - comeco).total_seconds() / 60)
        if duracao > 24 * 60:
            raise ErroCalendario(f"events[{indice}]: duração acima de 24h")
        chave = comeco.date().isoformat()
        dia = dias.setdefault(chave, {
            "data": chave, "eventos_agendados": 0, "minutos_agendados": 0,
            "horario_encerrado_ate_coleta": 0, "futuros_na_coleta": 0,
        })
        dia["eventos_agendados"] += 1
        dia["minutos_agendados"] += duracao
        minutos_total += duracao
        if termino <= capturado:
            encerrados += 1
            dia["horario_encerrado_ate_coleta"] += 1
        else:
            futuros += 1
            dia["futuros_na_coleta"] += 1
        if evento.get("transparency") != "transparent":
            ocupados += 1
        resposta = evento.get("my_response_status")
        if resposta not in mapa_resposta:
            raise ErroCalendario(f"events[{indice}]: resposta desconhecida")
        respostas[mapa_resposta[resposta]] += 1

    return {
        "versao": VERSAO,
        "status": "pronto",
        "fonte": "Google Calendar primário, leitura agregada",
        "coletado_em": capturado.astimezone(timezone.utc).isoformat(),
        "janela": {"inicio": inicio, "fim": fim, "fuso": "America/Sao_Paulo"},
        "totais": {
            "eventos_agendados": len(eventos), "minutos_agendados": minutos_total,
            "horarios_encerrados_ate_coleta": encerrados, "eventos_futuros_na_coleta": futuros,
            "blocos_ocupados": ocupados, "reunioes_ocorridas": None,
        },
        "respostas": respostas,
        "dias": [dias[k] for k in sorted(dias)],
        "erro": None,
    }


def gravar_atomico(caminho, dados):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd, temporario = tempfile.mkstemp(prefix=".calendario-", suffix=".json", dir=caminho.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, ensure_ascii=False, indent=2)
            arquivo.write("\n")
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.replace(temporario, caminho)
    finally:
        if os.path.exists(temporario):
            os.unlink(temporario)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("entrada", type=Path)
    parser.add_argument("saida", type=Path)
    parser.add_argument("--inicio", required=True)
    parser.add_argument("--fim", required=True)
    parser.add_argument("--coletado-em", required=True)
    args = parser.parse_args()
    bruto = json.loads(args.entrada.read_text(encoding="utf-8"))
    gravar_atomico(args.saida, sanitizar(bruto, args.inicio, args.fim, args.coletado_em))


if __name__ == "__main__":
    main()
