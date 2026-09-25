#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teste do cookie de sessão do painel (conserto de 25/09/2026).

    python3 /opt/gastaomatos/luana/painel_os/servidor/sessao.teste.py

Antes disto o cookie `painel_os_auth` carregava base64(usuario:senha), sem
HttpOnly nem Secure, renovado em toda resposta, sem logout. Este arquivo
prova o comportamento novo: token opaco, só o hash mora em disco, HttpOnly
+ Secure, expira 30 dias a partir do LOGIN (não renova sozinho), logout
derruba a sessão, o cookie antigo deixou de ser aceito e é apagado, e trocar
a senha no arquivo de credencial derruba toda sessão vigente.

Sobe uma instância PRÓPRIA do servidor, numa porta efêmera de 127.0.0.1, com
arquivo de credencial e `data/sessoes.json` de mentira (nunca o real: ver
`servir.SESSOES` sobrescrito abaixo, mesmo princípio do `servir.CREDENCIAL`
em auth.teste.py). Não repete a prova da trava básica (401/503 por rota),
isso já é `auth.teste.py`; aqui é só o mecanismo de cookie/sessão.
"""

import base64
import contextlib
import importlib.util
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from base64 import b64encode
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import mkdtemp

AQUI = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("servir", AQUI / "servir.py")
servir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(servir)

USUARIO = "usuario-de-teste"
SENHA = "senha-de-teste-longa-o-bastante-123456"
SENHA_NOVA = "outra-senha-tambem-longa-o-bastante-99"
falhas: list[str] = []


def confere(nome: str, obtido, esperado) -> bool:
    ok = obtido == esperado
    marca = "ok  " if ok else "FALHOU"
    print(f"  {marca}  {nome}: esperado {esperado!r}, obtido {obtido!r}")
    if not ok:
        falhas.append(nome)
    return ok


def confere_que(nome: str, verdadeiro: bool) -> bool:
    return confere(nome, verdadeiro, True)


def bate(porta: int, rota: str = "/", metodo: str = "GET",
         credencial: tuple[str, str] | None = None,
         cookies: dict[str, str] | None = None,
         intent: str | None = None, https: bool = False) -> tuple[int, list[str]]:
    corpo = b"" if metodo == "POST" else None
    req = urllib.request.Request(f"http://127.0.0.1:{porta}{rota}", data=corpo, method=metodo)
    if credencial:
        cru = f"{credencial[0]}:{credencial[1]}".encode()
        req.add_header("Authorization", "Basic " + b64encode(cru).decode())
    if cookies:
        req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()))
    if intent:
        req.add_header("X-Painel-Intent", intent)
    if https:
        req.add_header("X-Forwarded-Proto", "https")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, list(r.headers.get_all("Set-Cookie") or [])
    except urllib.error.HTTPError as e:
        return e.code, list(e.headers.get_all("Set-Cookie") or [])
    except OSError:
        return 0, []


def cookie_de(set_cookies: list[str], nome: str) -> str | None:
    for sc in set_cookies:
        if sc.startswith(f"{nome}="):
            return sc
    return None


def valor_de(set_cookie: str, nome: str) -> str:
    trecho = set_cookie.split(";", 1)[0]
    return trecho[len(nome) + 1:]


def sobe(manipulador) -> tuple[ThreadingHTTPServer, int]:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), manipulador)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def main() -> int:
    pasta = Path(mkdtemp(prefix="painel-sessao-teste-"))
    cred = pasta / "credencial"
    cred.write_text(f"{USUARIO}:{SENHA}\n", encoding="utf-8")
    os.chmod(cred, 0o600)

    # Nunca o servidor real, nunca /opt/gastaomatos/luana/painel_os/data/*:
    # os três moram só nesta pasta temporária, apagada no fim.
    servir.CREDENCIAL = cred
    servir.SESSOES = pasta / "sessoes.json"
    servir.HTTPS_ATIVO = pasta / "https-ativo"  # não criado ainda: gate fechado por padrão
    servir.ATRASO_FALHA = 0.0

    srv, porta = sobe(partial(servir.Manipulador, directory=str(servir.DIST)))
    print(f"servidor de teste em 127.0.0.1:{porta}, credencial de mentira em {cred}\n")

    captura = io.StringIO()
    with contextlib.redirect_stderr(captura):
        print("A) login cria sessão")
        status, cookies = bate(porta, "/", credencial=(USUARIO, SENHA))
        confere("status do login", status, 200)
        sc_sessao = cookie_de(cookies, "painel_os_sessao")
        confere_que("Set-Cookie de sessão presente no login", sc_sessao is not None)
        sc_sessao = sc_sessao or ""
        confere_que("cookie de sessão é HttpOnly", "HttpOnly" in sc_sessao)
        confere_que("cookie de sessão é Secure", "Secure" in sc_sessao)
        confere_que("cookie de sessão é SameSite=Lax", "SameSite=Lax" in sc_sessao)
        confere_que("cookie de sessão dura 30 dias", f"Max-Age={30*24*60*60}" in sc_sessao)
        confere_que("cookie de sessão vale em toda rota", "Path=/" in sc_sessao)
        token = valor_de(sc_sessao, "painel_os_sessao")
        confere_que("token não está vazio", bool(token))

        print("\nB) o token não é, nem contém, nem decodifica para a credencial")
        confere_que("token não contém a senha em claro", SENHA not in token)
        confere_que("token não contém o usuário em claro", USUARIO not in token)
        decodificou_credencial = False
        for pad in ("", "=", "=="):
            try:
                cru = base64.urlsafe_b64decode(token + pad)
            except Exception:
                continue
            if SENHA.encode() in cru or f"{USUARIO}:{SENHA}".encode() in cru:
                decodificou_credencial = True
        confere("token não decodifica para a credencial", decodificou_credencial, False)
        cru_basic_do_login = base64.b64encode(f"{USUARIO}:{SENHA}".encode()).decode()
        confere_que("token é diferente do base64(usuario:senha) do cookie antigo",
                    token != cru_basic_do_login)

        print("\nC) só o hash mora em disco (data/sessoes.json)")
        texto_arquivo = servir.SESSOES.read_text(encoding="utf-8")
        confere_que("o token cru não aparece no arquivo de sessões", token not in texto_arquivo)
        confere_que("a senha não aparece no arquivo de sessões", SENHA not in texto_arquivo)
        dados_sessoes = json.loads(texto_arquivo)
        confere_que("o hash do token está gravado", servir._hash_token(token) in dados_sessoes["sessoes"])

        print("\nD) cookie sozinho autentica, e NÃO renova a cada resposta")
        status2, cookies2 = bate(porta, "/", cookies={"painel_os_sessao": token})
        confere("status só com cookie de sessão", status2, 200)
        confere_que("resposta autenticada por cookie já válido não reemite Set-Cookie de sessão",
                    cookie_de(cookies2, "painel_os_sessao") is None)

        print("\nE) token alterado não autentica")
        token_errado = token[:-1] + ("a" if token[-1] != "a" else "b")
        status3, _ = bate(porta, "/", cookies={"painel_os_sessao": token_errado})
        confere("status com token adulterado", status3, 401)

        print("\nF) sessão expirada dá 401 e é removida do arquivo")
        status_exp1, cookies_exp = bate(porta, "/", credencial=(USUARIO, SENHA))
        token_exp = valor_de(cookie_de(cookies_exp, "painel_os_sessao"), "painel_os_sessao")
        hash_exp = servir._hash_token(token_exp)
        dados = json.loads(servir.SESSOES.read_text(encoding="utf-8"))
        dados["sessoes"][hash_exp]["expira_em"] = time.time() - 10
        servir._gravar_sessoes_atomico(dados, servir.SESSOES)
        status_exp2, _ = bate(porta, "/", cookies={"painel_os_sessao": token_exp})
        confere("status com sessão expirada", status_exp2, 401)
        dados_depois = json.loads(servir.SESSOES.read_text(encoding="utf-8"))
        confere_que("sessão expirada some do arquivo", hash_exp not in dados_depois["sessoes"])

        print("\nG) logout invalida a sessão e apaga o cookie")
        servir.HTTPS_ATIVO.touch()  # só agora o gate de mutação abre, como nas outras rotas
        _, cookies_login2 = bate(porta, "/", credencial=(USUARIO, SENHA))
        token2 = valor_de(cookie_de(cookies_login2, "painel_os_sessao"), "painel_os_sessao")
        status_pre, _ = bate(porta, "/", cookies={"painel_os_sessao": token2})
        confere("sessão nova funciona antes do logout", status_pre, 200)
        # Antes de gastar a sessão no logout de verdade: sem a intenção
        # humana, a rota tem que recusar e a sessão continua de pé.
        status_sem_intent, _ = bate(
            porta, "/api/logout", metodo="POST", cookies={"painel_os_sessao": token2}, https=True,
        )
        confere("logout sem X-Painel-Intent é recusado", status_sem_intent, 400)
        confere("sessão sobrevive à tentativa de logout sem intenção",
                bate(porta, "/", cookies={"painel_os_sessao": token2})[0], 200)
        status_logout, cookies_logout = bate(
            porta, "/api/logout", metodo="POST", cookies={"painel_os_sessao": token2},
            intent="logout", https=True,
        )
        confere("status do /api/logout", status_logout, 200)
        sc_apaga = cookie_de(cookies_logout, "painel_os_sessao")
        confere_que("logout apaga o cookie de sessão (Max-Age=0)",
                    bool(sc_apaga) and "Max-Age=0" in sc_apaga)
        status_pos, _ = bate(porta, "/", cookies={"painel_os_sessao": token2})
        confere("sessão morre depois do logout", status_pos, 401)

        print("\nH) o cookie antigo não autentica mais, e é apagado em toda resposta")
        cru_antigo = base64.b64encode(f"{USUARIO}:{SENHA}".encode()).decode()
        status_legado, cookies_legado = bate(porta, "/", cookies={"painel_os_auth": cru_antigo})
        confere("cookie antigo sozinho não autentica", status_legado, 401)
        sc_legado = cookie_de(cookies_legado, "painel_os_auth")
        confere_que("resposta manda apagar o cookie antigo", bool(sc_legado) and "Max-Age=0" in sc_legado)

        print("\nI) trocar a senha derruba toda sessão vigente")
        _, cookies_login3 = bate(porta, "/", credencial=(USUARIO, SENHA))
        token3 = valor_de(cookie_de(cookies_login3, "painel_os_sessao"), "painel_os_sessao")
        confere("sessão nova funciona antes da troca de senha",
                bate(porta, "/", cookies={"painel_os_sessao": token3})[0], 200)
        cred.write_text(f"{USUARIO}:{SENHA_NOVA}\n", encoding="utf-8")
        confere("sessão criada com a senha antiga morre depois da troca",
                bate(porta, "/", cookies={"painel_os_sessao": token3})[0], 401)
        cred.write_text(f"{USUARIO}:{SENHA}\n", encoding="utf-8")  # devolve, por via das dúvidas

    saida_capturada = captura.getvalue()
    print("\nJ) nada disso vazou pro log do servidor (stderr capturado do lote acima)")
    confere_que("o token do login não aparece no log", token not in saida_capturada)
    confere_que("o token do logout não aparece no log", token2 not in saida_capturada)
    confere_que("a senha não aparece no log", SENHA not in saida_capturada)
    confere_que("a senha nova não aparece no log", SENHA_NOVA not in saida_capturada)
    confere_que("o header Cookie não é ecoado no log", "painel_os_sessao=" not in saida_capturada)

    srv.shutdown()
    for f in pasta.glob("*"):
        f.unlink()
    pasta.rmdir()

    print()
    if falhas:
        print(f"REPROVADO: {len(falhas)} caso(s): " + ", ".join(falhas))
        return 1
    print("APROVADO: sessão por cookie opaco, com logout e sem vazar credencial.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
