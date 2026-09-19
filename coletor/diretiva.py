#!/usr/bin/env python3
"""Contrato e escrita atômica da diretiva operacional do Painel OS."""

import json
import os
import re
import tempfile
from datetime import date, datetime
from pathlib import Path

STATUS = {"ativa", "concluida", "cancelada"}
CHAVES = {"versao", "status", "objetivo", "prazo", "criada_em", "atualizada_em", "origem"}
CHAVES_ORIGEM = {"canal", "mensagem_id"}


class DiretivaInvalida(ValueError):
    pass


def _instante(valor, campo):
    if not isinstance(valor, str):
        raise DiretivaInvalida(f"{campo} não é texto")
    try:
        datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DiretivaInvalida(f"{campo} inválido") from exc


def validar(bruto):
    if not isinstance(bruto, dict) or set(bruto) != CHAVES:
        raise DiretivaInvalida("estrutura da diretiva inválida")
    if bruto["versao"] != 1:
        raise DiretivaInvalida("versão incompatível")
    if bruto["status"] not in STATUS:
        raise DiretivaInvalida("status inválido")
    objetivo = bruto["objetivo"]
    if not isinstance(objetivo, str) or not objetivo.strip() or len(objetivo) > 500:
        raise DiretivaInvalida("objetivo inválido")
    if re.search(r"(?:\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\b55\d{10,11}\b)", objetivo):
        raise DiretivaInvalida("objetivo contém dado pessoal")
    try:
        date.fromisoformat(bruto["prazo"])
    except (TypeError, ValueError) as exc:
        raise DiretivaInvalida("prazo inválido") from exc
    _instante(bruto["criada_em"], "criada_em")
    _instante(bruto["atualizada_em"], "atualizada_em")
    origem = bruto["origem"]
    if not isinstance(origem, dict) or set(origem) != CHAVES_ORIGEM:
        raise DiretivaInvalida("origem inválida")
    if origem["canal"] not in {"telegram", "terminal"}:
        raise DiretivaInvalida("canal de origem inválido")
    if not isinstance(origem["mensagem_id"], str) or not re.fullmatch(r"[0-9]{1,20}", origem["mensagem_id"]):
        raise DiretivaInvalida("mensagem_id inválido")
    return bruto


def carregar(caminho: Path):
    try:
        return validar(json.loads(caminho.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, DiretivaInvalida) as exc:
        return {
            "erro": f"diretiva indisponível ({type(exc).__name__})",
            "status": "erro", "objetivo": None, "prazo": None,
            "criada_em": None, "atualizada_em": None, "origem": None,
        }


def gravar_atomico(caminho: Path, bruto):
    dado = validar(bruto)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd, temporario = tempfile.mkstemp(prefix=".diretiva-", suffix=".json", dir=caminho.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as arquivo:
            json.dump(dado, arquivo, ensure_ascii=False, indent=2)
            arquivo.write("\n")
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.replace(temporario, caminho)
        descritor = os.open(caminho.parent, os.O_DIRECTORY)
        try:
            os.fsync(descritor)
        finally:
            os.close(descritor)
    finally:
        try:
            os.unlink(temporario)
        except FileNotFoundError:
            pass
