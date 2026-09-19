#!/usr/bin/env python3
"""Valida um JSON novo e substitui a diretiva canônica de forma atômica.

Uso: python3 coletor/atualizar_diretiva.py /caminho/para/nova-diretiva.json
O arquivo de entrada nunca é alterado. Dado inválido não toca na fonte atual.
"""

import json
import sys
from pathlib import Path

from diretiva import DiretivaInvalida, gravar_atomico

ALVO = Path(__file__).resolve().parent.parent / "data" / "diretiva.json"


def main():
    if len(sys.argv) != 2:
        print("uso: atualizar_diretiva.py <novo.json>", file=sys.stderr)
        return 2
    entrada = Path(sys.argv[1]).resolve()
    if entrada == ALVO.resolve():
        print("a entrada deve ser outro arquivo; a fonte não é lida e sobrescrita no mesmo passo", file=sys.stderr)
        return 2
    try:
        bruto = json.loads(entrada.read_text(encoding="utf-8"))
        gravar_atomico(ALVO, bruto)
    except (OSError, json.JSONDecodeError, DiretivaInvalida) as exc:
        print(f"diretiva recusada: {type(exc).__name__}", file=sys.stderr)
        return 1
    print(f"diretiva atualizada: {ALVO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
