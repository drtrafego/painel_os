"""Contrato V2 e projeção pública. Não altera registros legados nem aprova conteúdo."""
from __future__ import annotations
import copy
import hashlib
import json
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Callable

RELACOES = frozenset(('cita', 'sustentada_por', 'substitui', 'contradiz', 'depende_de', 'aplica_se_a', 'associada_por_termo'))
NATUREZAS = frozenset(('fonte', 'informacao', 'regra', 'decisao', 'procedimento', 'hipotese', 'entidade'))

class ErroCofre(ValueError):
    """Mensagem é um código estável, não incorpora documento ou caminho privado."""


def canonico(valor: Any) -> bytes:
    return json.dumps(valor, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha256(valor: bytes) -> str:
    return hashlib.sha256(valor).hexdigest()


def _texto(v: Any, maximo: int = 200) -> bool:
    return isinstance(v, str) and bool(v.strip()) and len(v) <= maximo


def instante(v: str | None, fim_dia: bool = False) -> datetime | None:
    if v is None:
        return None
    if not isinstance(v, str):
        raise ErroCofre('data_invalida')
    try:
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', v):
            dt = datetime.strptime(v, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            return dt + (timedelta(days=1, microseconds=-1) if fim_dia else timedelta())
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})', v):
            raise ValueError()
        dt = datetime.fromisoformat(v.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            raise ValueError()
        return dt.astimezone(timezone.utc)
    except ValueError as e:
        raise ErroCofre('data_invalida') from e


def validar_metadados(m: Any, entidade: str = 'no') -> dict:
    if not isinstance(m, dict) or m.get('schema_version') != 2 or not _texto(m.get('versao'), 80):
        raise ErroCofre('metadados_invalidos')
    escopo = m.get('escopo')
    if not isinstance(escopo, dict) or not _texto(escopo.get('operacao_id')) or 'projeto_id' not in escopo:
        raise ErroCofre('escopo_ausente')
    for k in ('projeto_id', 'recurso_id'):
        if escopo.get(k) is not None and not _texto(escopo[k]):
            raise ErroCofre('escopo_invalido')
    r = m.get('revisao')
    if not isinstance(r, dict) or r.get('estado') not in ('pendente', 'aprovada', 'rejeitada', 'revogada'):
        raise ErroCofre('revisao_invalida')
    for k in ('decisao_id', 'revisor_id'):
        if k not in r or (r[k] is not None and not _texto(r[k])):
            raise ErroCofre('revisao_invalida')
        if r['estado'] == 'aprovada' and not r[k]:
            raise ErroCofre('aprovacao_sem_identidade')
    vig = m.get('vigencia')
    if not isinstance(vig, dict) or any(k not in vig for k in ('desde', 'ate', 'revisar_em')):
        raise ErroCofre('vigencia_invalida')
    d, a = instante(vig['desde']), instante(vig['ate'], True)
    instante(vig['revisar_em'], True)
    if d and a and d > a:
        raise ErroCofre('vigencia_invertida')
    if entidade == 'no' and m.get('natureza') not in NATUREZAS:
        raise ErroCofre('natureza_invalida')
    if entidade == 'aresta' and m.get('relacao') not in RELACOES:
        raise ErroCofre('relacao_invalida')
    evs = m.get('evidencias')
    if not isinstance(evs, list) or len(evs) > 100:
        raise ErroCofre('evidencias_invalidas')
    vistos = set()
    for ev in evs:
        if not isinstance(ev, dict) or not _texto(ev.get('id')) or ev['id'] in vistos or not _texto(ev.get('fonte_id')) or not _texto(ev.get('trecho'), 16000):
            raise ErroCofre('evidencia_invalida')
        vistos.add(ev['id'])
        for k in ('documento_sha256', 'trecho_sha256'):
            if not isinstance(ev.get(k), str) or not re.fullmatch('[a-f0-9]{64}', ev[k]):
                raise ErroCofre('hash_invalido')
        if ev.get('localizacao') not in ('localizada', 'ausente', 'nao_verificada') or 'verificado_em' not in ev:
            raise ErroCofre('localizacao_invalida')
        instante(ev['verificado_em'])
    return m


def projetar_metadados_publicos(valor: Any, entidade: str, fonte_id: str, fonte_bytes: bytes, sanitizar: Callable[[str], str], agora: datetime) -> dict:
    """V2 inválido não pode promover legado nem atravessar a trava de privacidade.
    Só campos conhecidos. Localização é recalculada; aprovação segue apenas registrada.
    Evidência de outra fonte exige consulta autorizada no runtime, não fetch livre aqui.
    """
    m = validar_metadados(valor, entidade)
    if agora.tzinfo is None:
        raise ErroCofre('relogio_sem_fuso')
    fonte_bytes.decode('utf-8', errors='strict')
    keys = ('schema_version', 'versao', 'escopo', 'revisao', 'vigencia', 'evidencias')
    out = {k: copy.deepcopy(m[k]) for k in keys}
    out['natureza' if entidade == 'no' else 'relacao'] = m['natureza' if entidade == 'no' else 'relacao']
    out['escopo'] = {k: m['escopo'].get(k) for k in ('operacao_id', 'projeto_id', 'recurso_id')}
    out['revisao'] = {k: m['revisao'][k] for k in ('estado', 'decisao_id', 'revisor_id')}
    out['vigencia'] = {k: m['vigencia'][k] for k in ('desde', 'ate', 'revisar_em')}
    out['evidencias'] = []
    for ev in m['evidencias']:
        atual = {k: ev[k] for k in ('id', 'fonte_id', 'trecho', 'documento_sha256', 'trecho_sha256')}
        if ev['fonte_id'] != fonte_id:
            atual.update(localizacao='nao_verificada', verificado_em=None)
        else:
            trecho = ev['trecho'].encode('utf-8')
            confere = sha256(fonte_bytes) == ev['documento_sha256'] and sha256(trecho) == ev['trecho_sha256'] and trecho in fonte_bytes
            atual.update(localizacao='localizada' if confere else 'ausente', verificado_em=agora.isoformat())
        out['evidencias'].append(atual)
    def conferir(v):
        if isinstance(v, dict): return {k: conferir(x) for k, x in v.items()}
        if isinstance(v, list): return [conferir(x) for x in v]
        if isinstance(v, str):
            limpo = sanitizar(v)
            # Não publicar um trecho reescrito junto com o hash do texto original.
            if limpo != v: raise ErroCofre('metadado_bloqueado_pela_privacidade')
        return v
    return conferir(out)


def anexar_semantica_arestas(arestas: list[dict], propostas: Any, fontes_de: dict[str, tuple[str, bytes]], sanitizar: Callable[[str], str], agora: datetime) -> tuple[list[dict], list[str]]:
    """Enriquece ligações já comprovadas pelo coletor legado; nunca cria provas por similaridade.
    Aceita mais de uma relação do mesmo par, com IDs distintos e motivo idêntico à fonte.
    """
    if propostas is None: return arestas, []
    if not isinstance(propostas, list): return arestas, ['relacoes_v2_invalido']
    resultado = [dict(a) for a in arestas]
    originais = list(arestas)
    avisos = []; ids = {a['id'] for a in resultado if a.get('id')}
    for p in propostas:
        try:
            if not isinstance(p, dict) or not _texto(p.get('id')) or p['id'] in ids or p.get('tipo') != 'declarada':
                raise ErroCofre('relacao_v2_invalida')
            candidatos = [a for a in originais if a.get('tipo') == 'declarada' and all(a.get(k) == p.get(k) for k in ('de', 'para', 'porque'))]
            if not candidatos or p['de'] not in fontes_de: raise ErroCofre('relacao_v2_sem_base_declarada')
            fonte_id, dados = fontes_de[p['de']]
            meta = projetar_metadados_publicos(p.get('semantica_v2'), 'aresta', fonte_id, dados, sanitizar, agora)
            if sanitizar(p['id']) != p['id']: raise ErroCofre('id_bloqueado_pela_privacidade')
            novo = {**candidatos[0], 'id': p['id'], 'semantica_v2': meta}
            idx = next((i for i, a in enumerate(resultado) if not a.get('semantica_v2') and all(a.get(k) == p.get(k) for k in ('de', 'para', 'porque'))), None)
            if idx is None: resultado.append(novo)
            else: resultado[idx] = novo
            ids.add(p['id'])
        except (ErroCofre, ValueError, TypeError, KeyError, UnicodeError):
            # Não incorpora strings do registro rejeitado em mensagens públicas.
            avisos.append('relação V2 recusada: conferir contrato, fonte, identidade ou privacidade')
    return resultado, avisos
