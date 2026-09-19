#!/usr/bin/env python3
"""Importa um lote estruturado de chamadas para a caixa protegida.

Não busca Drive nem transcreve áudio. A origem deve conter apenas contratos
`painel-os/chamada@1`. O lote inteiro é validado antes de qualquer publicação.
"""

import argparse
import fcntl
import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

from chamadas_ingestao import ErroIngestao, MAX_BYTES, carregar_inbox
from coletar_estado import CHAMADAS_ESCOPO, CHAMADAS_INBOX, redigir, rotulo_seguro


def sanitizar(texto, limite):
    if not isinstance(texto, str):
        raise ErroIngestao("texto de citação ou achado ausente")
    seguro = rotulo_seguro(texto, limite=limite)
    if not seguro:
        raise ErroIngestao("texto não pôde ser sanitizado")
    return seguro[0], seguro[1] + int(redigir(texto) != texto)


def importar(origem: Path, destino: Path = CHAMADAS_INBOX):
    if not origem.is_dir() or origem.is_symlink():
        raise ErroIngestao("a origem precisa ser uma pasta real")
    entradas = sorted(origem.glob("*.json"))
    if not entradas:
        raise ErroIngestao("a origem não contém arquivos JSON")

    destino.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(destino, 0o700)
    trava = destino.parent / ".chamadas-importacao.lock"
    trava.parent.mkdir(parents=True, exist_ok=True)
    with trava.open("a", encoding="utf-8") as lock:
        os.chmod(trava, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        with tempfile.TemporaryDirectory(dir=destino.parent) as tmp:
            lote = Path(tmp)
            for atual in destino.glob("*.json"):
                if atual.is_symlink() or not atual.is_file():
                    raise ErroIngestao(f"caixa atual contém entrada insegura: {atual.name}")
                shutil.copyfile(atual, lote / atual.name)
            novos = 0
            for entrada in entradas:
                if entrada.is_symlink() or not entrada.is_file():
                    raise ErroIngestao(f"origem contém entrada insegura: {entrada.name}")
                if entrada.stat().st_size > MAX_BYTES:
                    raise ErroIngestao(f"{entrada.name}: excede {MAX_BYTES} bytes")
                conteudo = entrada.read_bytes()
                nome = hashlib.sha256(conteudo).hexdigest() + ".json"
                alvo = lote / nome
                if not alvo.exists():
                    alvo.write_bytes(conteudo)
                    novos += 1

            # Falha fechada: valida o estado completo antes de tocar na caixa.
            resultado = carregar_inbox(lote, sanitizar, CHAMADAS_ESCOPO)
            if resultado is None:
                raise ErroIngestao("lote vazio")
            for candidato in lote.glob("*.json"):
                final = destino / candidato.name
                if final.exists():
                    continue
                temporario = destino / (candidato.name + ".tmp")
                temporario.write_bytes(candidato.read_bytes())
                os.chmod(temporario, 0o600)
                os.replace(temporario, final)
            return novos, len(resultado["registros"])


def main():
    parser = argparse.ArgumentParser(description="Importa exportações estruturadas de chamadas")
    parser.add_argument("origem", type=Path, help="pasta local com contratos JSON")
    args = parser.parse_args()
    try:
        novos, total = importar(args.origem)
    except (ErroIngestao, OSError) as exc:
        print(f"importação rejeitada: {exc}", file=sys.stderr)
        return 1
    print(f"importação concluída: {novos} novos, {total} no acervo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
