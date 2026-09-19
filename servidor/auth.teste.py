#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teste da trava de autenticação do painel.

    python3 /opt/gastaomatos/luana/painel_os/servidor/auth.teste.py

Ele sobe uma instância PRÓPRIA do servidor, numa porta efêmera de 127.0.0.1,
com um arquivo de credencial de mentira. Não encosta no painel que está no ar
nem no arquivo de credencial de verdade.

O ponto do arquivo, e o motivo de ele existir: um teste que só sabe ver o 200
não distingue "a trava está de pé" de "eu parei de olhar". Aqui ele é obrigado
a ver **401 e 503**, e no fim roda um CONTROLE NEGATIVO: as mesmas asserções
contra um servidor sem trava nenhuma, que TEM que reprovar. Se o controle
passar, o teste inteiro está furado e o script diz isso.

/api/estado é exercitado só SEM credencial, de propósito: com credencial ele
dispararia o coletor de verdade. O que importa provar ali é que o JSON não sai
para quem não tem senha.
"""

import importlib.util
import os
import sys
import threading
import urllib.error
import urllib.request
from base64 import b64encode
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import mkdtemp

AQUI = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("servir", AQUI / "servir.py")
servir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(servir)

USUARIO = "usuario-de-teste"
SENHA = "senha-de-teste-longa-o-bastante-123456"
falhas: list[str] = []


def bate(porta: int, rota: str = "/", credencial: tuple[str, str] | None = None,
         metodo: str = "GET") -> int:
    corpo = b"" if metodo == "POST" else None
    req = urllib.request.Request(f"http://127.0.0.1:{porta}{rota}", data=corpo, method=metodo)
    if credencial:
        cru = f"{credencial[0]}:{credencial[1]}".encode()
        req.add_header("Authorization", "Basic " + b64encode(cru).decode())
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except OSError:
        return 0


def cabecalhos(porta: int, credencial: tuple[str, str]) -> dict[str, str]:
    req = urllib.request.Request(f"http://127.0.0.1:{porta}/")
    cru = f"{credencial[0]}:{credencial[1]}".encode()
    req.add_header("Authorization", "Basic " + b64encode(cru).decode())
    with urllib.request.urlopen(req, timeout=20) as resposta:
        return {k.lower(): v for k, v in resposta.headers.items()}


def confere(nome: str, obtido, esperado, registrar: list | None = None) -> bool:
    ok = obtido == esperado
    saida = falhas if registrar is None else registrar
    marca = "ok  " if ok else "FALHOU"
    print(f"  {marca}  {nome}: esperado {esperado}, obtido {obtido}")
    if not ok:
        saida.append(nome)
    return ok


def sobe(manipulador) -> tuple[ThreadingHTTPServer, int]:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), manipulador)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def main() -> int:
    pasta = Path(mkdtemp(prefix="painel-auth-teste-"))
    cred = pasta / "credencial"

    def escreve(texto: str, modo: int = 0o600) -> None:
        cred.write_text(texto, encoding="utf-8")
        os.chmod(cred, modo)

    escreve(f"# comentário ignorado\n\n{USUARIO}:{SENHA}\n")
    servir.CREDENCIAL = cred  # só no processo de teste; o servidor real não muda
    servir.ATRASO_FALHA = 0.0  # o atraso é anti-varredura, não faz parte do que se prova

    srv, porta = sobe(partial(servir.Manipulador, directory=str(servir.DIST)))
    print(f"servidor de teste em 127.0.0.1:{porta}, credencial de mentira em {cred}\n")

    print("A) com a credencial no lugar")
    confere("/ sem credencial", bate(porta), 401)
    confere("/ com credencial ERRADA", bate(porta, credencial=(USUARIO, "outra-senha-qualquer-1234")), 401)
    confere("/ com usuário errado", bate(porta, credencial=("outro", SENHA)), 401)
    confere("/api/estado SEM credencial", bate(porta, "/api/estado"), 401)
    confere("/assets/ SEM credencial", bate(porta, "/assets/"), 401)
    # POST não tem do_POST neste servidor: sem a trava viraria 501. Com ela, o
    # 401 sai ANTES do despacho, que é a promessa de morar em parse_request.
    confere("POST (verbo sem rota) cai na mesma trava",
            bate(porta, "/qualquer", metodo="POST"), 401)
    confere("rota inexistente sem credencial", bate(porta, "/nao-existe"), 401)
    confere("/ COM credencial certa", bate(porta, credencial=(USUARIO, SENHA)), 200)
    confere("rota inexistente COM credencial devolve 404 sem derrubar a thread",
            bate(porta, "/nao-existe", credencial=(USUARIO, SENHA)), 404)
    confere("POST autenticado fora da rota de decisão devolve 404",
            bate(porta, "/api/aprovacoes", credencial=(USUARIO, SENHA), metodo="POST"), 404)
    confere("rota de decisão sem credencial para antes do corpo",
            bate(porta, "/api/aprovacoes/decidir", metodo="POST"), 401)
    confere("rota autenticada falha fechada antes do HTTPS",
            bate(porta, "/api/aprovacoes/decidir", credencial=(USUARIO, SENHA), metodo="POST"), 503)
    confere("download do Estúdio sem credencial para antes do artefato",
            bate(porta, "/api/estudio/artefato?id=1"), 401)
    confere("download autenticado falha fechado antes do HTTPS",
            bate(porta, "/api/estudio/artefato?id=1", credencial=(USUARIO, SENHA)), 503)
    confere("envio para Aprovações sem credencial para antes do corpo",
            bate(porta, "/api/estudio/aprovacoes", metodo="POST"), 401)
    confere("envio autenticado falha fechado antes do HTTPS",
            bate(porta, "/api/estudio/aprovacoes", credencial=(USUARIO, SENHA), metodo="POST"), 503)
    headers = cabecalhos(porta, (USUARIO, SENHA))
    confere("conteúdo não pode ser interpretado como outro MIME",
            headers.get("x-content-type-options"), "nosniff")
    confere("painel não pode ser embutido em frame",
            headers.get("x-frame-options"), "DENY")
    confere("referência não vaza URL do painel",
            headers.get("referrer-policy"), "no-referrer")
    confere("política de conteúdo existe na própria aplicação",
            bool(headers.get("content-security-policy")), True)
    confere("servidor não expõe versão do Python",
            headers.get("server"), "PainelOS")

    print("\nB) falha FECHADA (cada ramo de recusa com o seu caso)")
    cred.unlink()
    confere("arquivo ausente, sem credencial", bate(porta), 503)
    confere("arquivo ausente, COM a credencial que era certa",
            bate(porta, credencial=(USUARIO, SENHA)), 503)

    escreve(f"{USUARIO}:{SENHA}\n", modo=0o644)
    confere("permissão 644", bate(porta, credencial=(USUARIO, SENHA)), 503)

    escreve("# só comentário\n\n")
    confere("nenhuma linha útil", bate(porta, credencial=(USUARIO, SENHA)), 503)

    escreve(f"{USUARIO}:curta\n")
    confere("senha abaixo do mínimo", bate(porta, credencial=(USUARIO, SENHA)), 503)

    escreve("linha-sem-dois-pontos\n")
    confere("formato inválido", bate(porta, credencial=(USUARIO, SENHA)), 503)

    escreve(f"{USUARIO}:{SENHA}\n")
    confere("credencial devolvida, volta a servir", bate(porta, credencial=(USUARIO, SENHA)), 200)

    print("\nC) comparação (unitário)")
    u, s = USUARIO.encode(), SENHA.encode()
    cabecalho = "Basic " + b64encode(f"{USUARIO}:{SENHA}".encode()).decode()
    confere("header certo confere", servir.credencial_confere(cabecalho, u, s), True)
    confere("header vazio não confere", servir.credencial_confere("", u, s), False)
    confere("esquema errado não confere", servir.credencial_confere("Bearer abc", u, s), False)
    confere("base64 quebrado não confere", servir.credencial_confere("Basic @@@", u, s), False)
    confere("senha prefixo não confere",
            servir.credencial_confere("Basic " + b64encode(f"{USUARIO}:{SENHA[:-1]}".encode()).decode(), u, s), False)
    srv.shutdown()

    print("\nD) CONTROLE NEGATIVO: as mesmas asserções contra um servidor SEM trava")
    print("   (elas TÊM que falhar aqui; se passarem, este teste não mede nada)")
    srv2, porta2 = sobe(partial(SimpleHTTPRequestHandler, directory=str(servir.DIST)))
    controle: list[str] = []
    confere("[controle] / sem credencial daria 401", bate(porta2), 401, registrar=controle)
    confere("[controle] /assets/ sem credencial daria 401", bate(porta2, "/assets/"), 401, registrar=controle)
    srv2.shutdown()

    for f in cred.parent.glob("*"):
        f.unlink()
    cred.parent.rmdir()

    print()
    if len(controle) < 2:
        print("REPROVADO: o controle negativo PASSOU. O teste está furado, "
              "não é o servidor que está certo.")
        return 2
    print(f"controle negativo reprovou nos {len(controle)} casos, como tinha que reprovar.")
    if falhas:
        print(f"REPROVADO: {len(falhas)} caso(s): " + ", ".join(falhas))
        return 1
    print("APROVADO: a trava recusa, e recusa fechado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
