"""Parser fechado das exportações locais de chamadas do Painel OS."""

import hashlib
import json
from datetime import datetime
from pathlib import Path

SCHEMA = "painel-os/chamada@1"
TIPOS = {"dor", "objecao", "promessa", "falta", "achado"}
MAX_ARQUIVOS = 500
MAX_BYTES = 1_000_000
MAX_CITACOES = 500
MAX_ACHADOS = 500


class ErroIngestao(ValueError):
    pass


def _instante(valor, onde):
    if not isinstance(valor, str):
        raise ErroIngestao(f"{onde}: data ausente")
    try:
        instante = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ErroIngestao(f"{onde}: data inválida") from exc
    if instante.tzinfo is None or instante.utcoffset() is None:
        raise ErroIngestao(f"{onde}: data precisa informar fuso horário")
    return valor


def _id(valor, onde):
    if not isinstance(valor, str) or not valor.strip() or len(valor) > 100:
        raise ErroIngestao(f"{onde}: identificador inválido")
    return valor.strip()


def carregar_inbox(pasta: Path, sanitizar, escopo_esperado):
    """Retorna registros e grafo; qualquer arquivo ruim reprova o lote todo."""
    arquivos = sorted(pasta.glob("*.json")) if pasta.is_dir() else []
    if not arquivos:
        return None
    if len(arquivos) > MAX_ARQUIVOS:
        raise ErroIngestao(f"lote excede {MAX_ARQUIVOS} arquivos")
    registros, ids_chamada, mascarados = [], set(), 0
    for arquivo in arquivos:
        if arquivo.is_symlink() or not arquivo.is_file():
            raise ErroIngestao(f"{arquivo.name}: links e arquivos especiais não são aceitos")
        try:
            tamanho = arquivo.stat().st_size
        except OSError as exc:
            raise ErroIngestao(f"{arquivo.name}: não foi possível medir o arquivo") from exc
        if tamanho > MAX_BYTES:
            raise ErroIngestao(f"{arquivo.name}: excede {MAX_BYTES} bytes")
        try:
            bruto = json.loads(arquivo.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ErroIngestao(f"{arquivo.name}: JSON inválido") from exc
        if not isinstance(bruto, dict) or bruto.get("schema") != SCHEMA:
            raise ErroIngestao(f"{arquivo.name}: schema precisa ser {SCHEMA}")
        escopo = _id(bruto.get("escopo_id"), f"{arquivo.name}.escopo_id")
        if escopo != escopo_esperado:
            raise ErroIngestao(f"{arquivo.name}: escopo não autorizado")
        chamada_id = _id(bruto.get("chamada_id"), f"{arquivo.name}.chamada_id")
        if chamada_id in ids_chamada:
            raise ErroIngestao(f"{arquivo.name}: chamada_id repetido")
        ids_chamada.add(chamada_id)
        origem = _id(bruto.get("origem_id"), f"{arquivo.name}.origem_id")
        citacoes_brutas, achados_brutos = bruto.get("citacoes"), bruto.get("achados")
        if not isinstance(citacoes_brutas, list) or not citacoes_brutas:
            raise ErroIngestao(f"{arquivo.name}: precisa de ao menos uma citação")
        if not isinstance(achados_brutos, list) or not achados_brutos:
            raise ErroIngestao(f"{arquivo.name}: precisa de ao menos um achado")
        if len(citacoes_brutas) > MAX_CITACOES or len(achados_brutos) > MAX_ACHADOS:
            raise ErroIngestao(f"{arquivo.name}: excede o limite de itens")
        citacoes, citacao_ids = [], set()
        citacao_publica = {}
        for i, item in enumerate(citacoes_brutas):
            if not isinstance(item, dict):
                raise ErroIngestao(f"{arquivo.name}.citacoes[{i}]: objeto esperado")
            cid = _id(item.get("id"), f"{arquivo.name}.citacoes[{i}].id")
            if cid in citacao_ids:
                raise ErroIngestao(f"{arquivo.name}: id de citação repetido")
            citacao_ids.add(cid)
            # O identificador da fonte pode conter nome, e-mail ou telefone. Só
            # o código derivado entra no estado público.
            cid_publico = hashlib.sha256(f"{escopo}:{chamada_id}:{cid}".encode()).hexdigest()[:16]
            citacao_publica[cid] = cid_publico
            trecho, quantos = sanitizar(item.get("trecho"), 500)
            mascarados += quantos
            inicio, fim = item.get("inicio_s"), item.get("fim_s")
            if inicio is not None and (not isinstance(inicio, (int, float)) or inicio < 0):
                raise ErroIngestao(f"{arquivo.name}.{cid}: início inválido")
            if fim is not None and (not isinstance(fim, (int, float)) or fim < 0):
                raise ErroIngestao(f"{arquivo.name}.{cid}: fim inválido")
            if inicio is not None and fim is not None and fim < inicio:
                raise ErroIngestao(f"{arquivo.name}.{cid}: fim anterior ao início")
            citacoes.append({"id": cid_publico, "trecho": trecho, "inicio_s": inicio, "fim_s": fim})
        achados, achado_ids = [], set()
        for i, item in enumerate(achados_brutos):
            if not isinstance(item, dict):
                raise ErroIngestao(f"{arquivo.name}.achados[{i}]: objeto esperado")
            aid = _id(item.get("id"), f"{arquivo.name}.achados[{i}].id")
            tipo = item.get("tipo")
            if aid in achado_ids or tipo not in TIPOS:
                raise ErroIngestao(f"{arquivo.name}.achados[{i}]: id ou tipo inválido")
            achado_ids.add(aid)
            rotulo, quantos = sanitizar(item.get("rotulo"), 90)
            mascarados += quantos
            refs = item.get("citacao_ids")
            if not isinstance(refs, list) or not refs or any(r not in citacao_ids for r in refs):
                raise ErroIngestao(f"{arquivo.name}.{aid}: citação inexistente")
            achados.append({"id": aid, "tipo": tipo, "rotulo": rotulo, "citacao_ids": [citacao_publica[r] for r in refs]})
        registros.append({
            "id": hashlib.sha256(f"{escopo}:{chamada_id}".encode()).hexdigest()[:16],
            "ocorrido_em": _instante(bruto.get("ocorrido_em"), f"{arquivo.name}.ocorrido_em"),
            "origem_id": hashlib.sha256(origem.encode()).hexdigest()[:16],
            "citacoes": citacoes, "achados": achados,
        })

    nos, arestas = {}, {}
    for registro in registros:
        chaves = []
        for achado in registro["achados"]:
            chave = f'{escopo_esperado}:{achado["tipo"]}:{achado["rotulo"].casefold()}'
            no = nos.setdefault(chave, {"id": hashlib.sha256(chave.encode()).hexdigest()[:16], "tipo": achado["tipo"], "rotulo": achado["rotulo"], "frequencia": 0, "evidencias": []})
            no["frequencia"] += 1
            no["evidencias"].append({"chamada_id": registro["id"], "citacao_ids": achado["citacao_ids"]})
            chaves.append(chave)
        for i, a in enumerate(sorted(set(chaves))):
            for b in sorted(set(chaves))[i + 1:]:
                par = (a, b)
                aresta = arestas.setdefault(par, {"de": nos[a]["id"], "para": nos[b]["id"], "frequencia": 0, "chamadas": []})
                aresta["frequencia"] += 1
                aresta["chamadas"].append(registro["id"])
    return {"registros": registros, "nos": list(nos.values()), "arestas": list(arestas.values()), "mascarados": mascarados, "arquivos": len(arquivos)}
