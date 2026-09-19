#!/usr/bin/env python3
import importlib.util
import base64
import json
import os
import tempfile
import threading
import urllib.error
import urllib.request
from functools import partial
from pathlib import Path

AQUI = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("servir_estudio", AQUI / "servir.py")
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)
falhas = []

def ok(nome, condicao):
    print(("ok    " if condicao else "FALHA ") + nome)
    if not condicao: falhas.append(nome)

def erro(funcao, codigo):
    try: funcao()
    except s.ErroDecisao as exc: return exc.codigo == codigo
    return False

with tempfile.TemporaryDirectory() as tmp:
    raiz = Path(tmp); out = raiz/"out"; pasta = out/"peca-segura"; pasta.mkdir(parents=True)
    video = pasta/"saida.mp4"; video.write_bytes(b"video-real")
    posts = raiz/"posts.json"
    dados = {"posts":[
        {"n":101,"marca":"gastaomatos","status":"pendente","titulo":"não deve sair","assets":{"_dir":str(pasta),"video_reel":"saida.mp4"}},
        {"n":102,"marca":"cliente-x","status":"pendente","assets":{"_dir":str(pasta),"video_reel":"saida.mp4"}},
    ]}
    posts.write_text(json.dumps(dados), encoding="utf-8")
    fila = raiz/"aprovacoes.json"; fila.write_text(json.dumps({"versao":1,"itens":[]}), encoding="utf-8")

    achados = s.resolver_artefatos(101, posts, out)
    ok("resolve artefato real da marca própria", achados == [video.resolve()])
    ok("marca de cliente é bloqueada", erro(lambda: s.resolver_artefatos(102, posts, out), 403))
    dados["posts"][0]["assets"]["video_reel"] = "../segredo.txt"
    posts.write_text(json.dumps(dados), encoding="utf-8")
    ok("path traversal é bloqueado", erro(lambda: s.resolver_artefatos(101, posts, out), 403))
    try:
        (pasta/"atalho.mp4").symlink_to(video)
        posts.write_text(json.dumps(dados), encoding="utf-8")
        ok("link simbólico é bloqueado", erro(lambda: s.resolver_artefatos(101, posts, out), 403))
        (pasta/"atalho.mp4").unlink()
    except OSError:
        ok("link simbólico é bloqueado (ignorado no Windows sem privilégio de symlink)", True)
    dados["posts"][0]["assets"]["video_reel"] = "saida.mp4"
    posts.write_text(json.dumps(dados), encoding="utf-8")

    pedido = {"id":101,"chave_idempotencia":"estudio_1234567890abcdef"}
    codigo, resposta = s.enviar_aprovacao(pedido, fila, posts, out)
    salvo = json.loads(fila.read_text())
    ok("envio cria item aguardando", codigo == 201 and salvo["itens"][0]["id"] == "peca_101" and salvo["itens"][0]["estado"] == "aguardando")
    ok("envio nunca publica", resposta["publicado"] is False and video.read_bytes() == b"video-real")
    ok("fila e auditoria não recebem título, caminho nem chave bruta", "não deve sair" not in fila.read_text() and str(pasta) not in fila.read_text() and pedido["chave_idempotencia"] not in fila.read_text())
    codigo2, resposta2 = s.enviar_aprovacao(pedido, fila, posts, out)
    salvo2 = json.loads(fila.read_text())
    ok("repetição é idempotente", codigo2 == 200 and resposta2["idempotente"] and len(salvo2["itens"]) == 1 and len(salvo2["entradas"]) == 1)
    ok("arquivo persistente fica 600", os.name == "nt" or (fila.stat().st_mode & 0o777 == 0o600))
    ok("campo extra é rejeitado", erro(lambda: s.enviar_aprovacao({**pedido,"publicar":True}, fila, posts, out), 400))
    dados["posts"][0]["status"] = "postado"; posts.write_text(json.dumps(dados), encoding="utf-8")
    outro_pedido = {"id":101,"chave_idempotencia":"estudio_outro_1234567890"}
    ok("peça já publicada não volta para aprovação", erro(lambda: s.enviar_aprovacao(outro_pedido, fila, posts, out), 409))
    dados["posts"][0]["status"] = "pendente"; posts.write_text(json.dumps(dados), encoding="utf-8")

    # Integração HTTP positiva, simulando exclusivamente o proxy HTTPS local.
    fila.write_text(json.dumps({"versao":1,"itens":[]}), encoding="utf-8")
    cred = raiz/"credencial"; cred.write_text("teste:senha-de-teste-com-mais-de-16\n", encoding="utf-8"); os.chmod(cred, 0o600)
    marcador = raiz/".https-ativo"; marcador.touch()
    s.CREDENCIAL = cred; s.HTTPS_ATIVO = marcador; s.POSTS_JSON = posts; s.APROVACOES = fila; s.ARTEFATOS_RAIZ = out.resolve(); s.ATRASO_FALHA = 0
    srv = s.ServidorPainel(("127.0.0.1", 0), partial(s.Manipulador, directory=str(raiz)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    auth = base64.b64encode(b"teste:senha-de-teste-com-mais-de-16").decode()
    headers = {"Authorization":f"Basic {auth}","X-Forwarded-Proto":"https"}
    req = urllib.request.Request(f"http://127.0.0.1:{srv.server_address[1]}/api/estudio/artefato?id=101", headers=headers)
    with urllib.request.urlopen(req) as resposta:
        corpo = resposta.read(); disposicao = resposta.headers.get("Content-Disposition", "")
    ok("GET autenticado entrega o arquivo real", corpo == b"video-real")
    ok("download usa nome técnico sem PII nem caminho", disposicao == 'attachment; filename="peca-101.mp4"')
    corpo_post = json.dumps(pedido).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{srv.server_address[1]}/api/estudio/aprovacoes", data=corpo_post, method="POST", headers={**headers,"Content-Type":"application/json","X-Painel-Intent":"enviar-aprovacao"})
    with urllib.request.urlopen(req) as resposta:
        retorno = json.loads(resposta.read())
    ok("POST autenticado envia à fila sem publicar", retorno["publicado"] is False and json.loads(fila.read_text())["itens"][0]["estado"] == "aguardando")
    srv.shutdown(); srv.server_close()

print(f"{len(falhas)} falha(s)" if falhas else "TODOS PASSARAM")
raise SystemExit(1 if falhas else 0)
