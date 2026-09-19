# PAINEL OS

A operação do Gastão Matos em telas: quais agentes existem, quem convocou quem,
o que o cron dispara sozinho, o que os verificadores acharam, o que está pronto
para sair do estúdio de conteúdo, e o que a casa aprendeu.

**O painel não gera número nenhum.** Ele mostra o que um coletor mediu no disco,
e todo número aparece com a hora em que foi medido. Tela sem fonte escreve na
própria tela que não tem dado e diz o que falta: ela nunca mostra zero no lugar
de "não consegui ler", porque zero de ausência e zero de erro chegam iguais na
tela e essa confusão já custou um dia inteiro nesta casa.

```
coletor/coletar_estado.py   mede o disco       -> web/src/dados/estado.json
servidor/servir.py          autentica e serve  -> web/dist na porta 5199
web/                        React 19 + Vite + Tailwind 4, sem biblioteca de UI
```

Medido em 10/09/2026: **13.854 linhas de produção** (8.251 de TypeScript no
front, 4.076 no coletor, 1.165 no servidor, mais CSS e shell) e **4.998 linhas
de teste**, em 13 telas.

> **Este documento tem três blocos, nesta ordem: o planejamento (o que falta),
> o que já foi feito, e as referências.** Depois deles vem o manual de operação,
> que é o que põe o painel de pé numa máquina. Quem só quer usar o painel pode
> pular direto para "Abrir o painel".

---

# 1. PLANEJAMENTO

Estado em 10/09/2026: o painel está **congelado por decisão do dono**
("vamos retornar isso semana que vem, tenho outras demandas mais urgentes").
Nada desta seção deve ser implementado sem ele reabrir o assunto. O que está
escrito aqui é o mapa de retomada, não uma fila de trabalho ativa.

## 1.1 O que ele pediu e ainda não está na tela

### A. Os agentes AO VIVO na tela da tarefa (prioridade 1)

Palavras dele: *"quando eu colocar você pra fazer uma tarefa, mostrar quais
agentes você está contatando naquela tarefa, quantos estão ativos naquele
momento, qual etapa eles estão fazendo"*.

**O que existe hoje é HISTÓRICO de convocação, não presença.** O painel conta
quantas vezes cada cargo foi chamado em janelas de 24h e 7d, lendo os
transcripts já gravados em disco. Ele não sabe dizer quem está vivo agora nem em
que etapa está.

É o item mais valioso da lista, por dois motivos: é a versão em tela de uma
coisa que ele cobrou três vezes por mensagem ("cadê a utilização dos agentes"),
e é o que diferencia este painel de um relatório. Um relatório conta o que
aconteceu; a tela ao vivo deixa ele **cortar o que não importa e apressar o que
importa** enquanto ainda dá tempo.

‼️ **METADE DISTO JÁ EXISTE E NÃO ESTÁ LIGADA EM NADA.** Existe
`servidor/agentes_vivos.py`, 376 linhas, que é exatamente essa sonda: responde
quais agentes estão contatados, quantos agora e em que etapa. **Zero
importadores, zero referências em todo `/opt/gastaomatos`, inclusive cron e
shell.** Medido em 10/09/2026: ele roda, devolve `ok: true`, custa 4,6 segundos,
e é leitura pura (zero escritas).

**"Nunca foi ligado" e "não funciona" não são a mesma coisa**, e a medição diz
que ele funciona. Quem retomar este item começa dali, não do zero: falta a rota
no servidor, o campo no estado e a tela. **Antes de escrever uma linha nova,
abra esse arquivo.**

⚠️ E o custo dele é a decisão que sobra: **4,6 segundos** é caro para uma tela
que quer dizer "agora". O servidor hoje espera no máximo 8 segundos por uma
coleta inteira e cacheia por 15 segundos. Ou essa sonda sai do caminho da coleta
(rota própria, chamada pela tela em intervalo curto), ou "ao vivo" vai chegar
com 15 segundos de atraso e o nome vai estar mentindo.

A escolha de fundo, e é a razão de não ser trivial: hoje a fonte é arquivo em
disco lido de tempos em tempos, e presença é um estado que muda a cada segundo.
Ou o agente passa a escrever "estou vivo, nesta etapa" num lugar que o painel
lê, ou o painel olha processo em vez de transcript (que é o que a sonda faz).
**A escolha entre esses dois caminhos é uma porta de mão única** (define o
contrato de todos os agentes da casa), então ela não se decide na pressa de
implementar.

⚠️ E a armadilha vai colada: **contador que o próprio agente escreve é a opinião
dele sobre o próprio trabalho.** Se "etapa" for um campo que o agente preenche,
a tela vai mostrar o que ele acha que está fazendo. Isso já mordeu esta casa
(agendamento contado como reunião, recibo de lançamento contado como retorno).
Presença medida por processo vivo é fato; etapa declarada pelo agente é relato.
Os dois podem aparecer, com nomes diferentes.

### B. "O que você acha que falta"

Ele pediu, e ele mesmo mandou esperar até o Cofre de conhecimento ficar pronto.
O Cofre ficou pronto em 10/09. **Este item está liberado para ser feito, e ainda
não foi.**

## 1.2 A decisão que só ele toma (nenhuma linha de código resolve antes)

### O que "PENDENTE" quer dizer na fila de Aprovações

`coletor/coletar_estado.py:2789` calcula assim:

```python
"aprovacao_disponivel": _peca_tem_artefato_seguro(p, pasta) and status == "pendente",
```

Medido por mim em 10/09/2026, sobre o estado servido (gerado 17h28 UTC):
**`aprovacao_disponivel` é `True` em 0 de 131 peças da lista.** O botão "enviar
para aprovação" nasce desabilitado em todas, sempre.

‼️ **As duas condições são mutuamente exclusivas neste vocabulário, e é por isso
que a regra nunca vai passar.** Medido:

- o acervo tem **236 peças**, e **73 delas estão em `pendente`**, então a palavra
  existe e é comum;
- a **lista que chega na tela tem 131 peças, e nenhuma delas é `pendente`**;
- dessas 131, **84 têm artefato de verdade**.

A causa está no laço que monta a lista (`coletar_estado.py:2727-2755`): o
`por_status` é contado **antes** dos filtros, e a `lista` é montada **depois**
de três, sendo o decisivo `pasta.is_dir()`. **Uma peça `pendente` nesta casa é
planejada e ainda não produzida, então ela não tem pasta em disco**, e é
descartada antes de o campo sequer ser calculado.

Ou seja, o servidor pede uma peça que **ao mesmo tempo tenha arquivo em disco e
não tenha sido produzida**. Não é uma regra apertada: é uma condição
contraditória por construção.

- **o servidor supõe** que "pendente" quer dizer *produzida, esperando o sim*;
- **nesta casa** "pendente" quer dizer *planejada e ainda não produzida*.

Quem decide qual vocabulário vale é ele, e a decisão tem que nomear **um estado
que exista depois de a peça ganhar pasta em disco**, senão a fila continua vazia
com outra regra escrita.

⚠️ **E o afrouxamento óbvio é o errado.** Se a regra virar só "tem artefato",
entram cerca de 120 itens de uma vez, incluindo peças de julho, peças de
**cliente** (que não vão na vitrine pessoal dele) e três versões da mesma peça.
**Fila que nasce suja ensina a casa a ignorar a fila**, e aí a tela vira
decoração. O caminho seguro é mais estreito que o óbvio: definir o estado que
significa "produzida e esperando decisão", e só ele entra.

## 1.3 Dívida técnica em aberto

Cada item abaixo foi medido em 10/09/2026, com o arquivo e a linha ao lado.
**Quatro itens que constavam do levantamento anterior foram remedidos hoje e
NÃO estão nesta lista, porque já estão consertados ou não reproduziram**; eles
aparecem na seção 1.4, para ninguém gastar um dia consertando o que está de pé.

| # | o que está aberto | onde | por que importa |
|---:|---|---|---|
| 1 | O coletor lê **3,8 GB** de transcripts byte a byte a cada abertura da tela, e a pasta só cresce | `coletor/coletar_estado.py:1560` e `:1753` (`rglob("*.jsonl")`), sobre `~/.claude/projects` | Medido em 10/09: 3,8 GB em 1.498 arquivos. O levantamento anterior media 858 MB. **Piora sozinho**, e é o único item da lista que fica pior sem ninguém mexer em nada |
| 2 | O coletor grava a saída **dentro de `web/src/`**, que é código-fonte importado pelo build | `coletar_estado.py:49` (`SAIDA`) e `:3146` (`SAIDA.write_text`) | Dado de execução morando na pasta do código faz build e coleta disputarem o mesmo arquivo. E o `write_text` **não é atômico**: uma coleta interrompida no meio deixa JSON pela metade no lugar do bom |
| 3 | O `erro_coletor` leva **stderr do coletor até o navegador**, com caminho de disco dentro | `servidor/servir.py:219` (`r.stderr[:400]`) e `:235` | Traceback de Python carrega caminho absoluto (`/opt/gastaomatos/...`). O resto do painel tem trava explícita contra caminho privado; esta porta passa por fora dela |
| 4 | `diretiva.objetivo` **não passa por `rotulo_seguro`** | `coletor/diretiva.py:36-40` | Medido com precisão: e-mail e telefone brasileiro **são** bloqueados, e a diretiva inteira é recusada (falha fechada, correto). O que passa é qualquer outro texto livre, **inclusive nome de cliente**, que é justamente o que `rotulo_seguro` existe para mascarar |
| 5 | `tarefas.por_projeto[].projeto` sai **sem sanitização nenhuma** | `coletar_estado.py:469-471` | O nome do projeto vem da API remota de tarefas e vai direto para a tela. Projeto batizado com nome de cliente aparece inteiro. ⚠️ **A varredura irmã, nas arestas do Cofre, deu resultado diferente e melhor:** em `coletar_estado.py:774`, `de` e `para` carregam **id**, não texto livre, e o `porque` **passa** pela trava. Ali o risco só existe se um id for batizado com nome. **Não trate os dois como o mesmo defeito** |
| 6 | O relógio do topo é o **único da tela sem fuso declarado** | `web/src/App.tsx:63` | `toLocaleTimeString('pt-BR', { hour12: false })`, sem `timeZone`. Ele renderiza no fuso de quem está olhando. Todo o resto do painel carimba "utc" ao lado do número. No navegador dele (BRT, UTC-3) o topo mostra uma hora **3 horas atrás** dos carimbos vizinhos, sem dizer que é outro fuso. Confirmado por varredura: **1 ocorrência sem `timeZone` em todo o `web/src`** |
| 7 | A pílula "N DE M CHECAGENS REPROVADAS" **soma duas frotas diferentes** | `coletar_estado.py:100` e `:111` | O coletor lê `luana/verificar_frota_ULTIMO.txt` e `renato/verificar_bots_ULTIMO.txt` e apresenta um total só. São duas frotas independentes, com donos diferentes. A tela não diz de qual delas são as reprovadas, então o número não aponta para ninguém |
| 8 | **`data/calendario.json` é lido por dois lugares e escrito por ninguém** | `coletar_estado.py` e `coletor/calendario_teste.py:9` | Busca ampla em `/opt/gastaomatos` não acha produtor, e nenhuma linha de cron gera o arquivo (controle positivo rodado: a mesma busca acha quem escreve `estado.json`). **Alguém alimenta esse snapshot à mão**, ou seja, existe um passo manual escondido dentro do que parece automático. Efeito medido em 10/09: o snapshot tem 44,5 horas, passou do limite de 24h, a Agenda mostra o bloco vencido e **`calendario_teste.py` reprova** |
| 9 | **O `nginx-painel-os.conf` do repositório não é o que está no ar** | `servidor/nginx-painel-os.conf` contra `/etc/nginx/conf.d/painel-os.conf` | O arquivo versionado só tem `listen 80` e nenhum bloco TLS. O que serve de verdade tem 443, certificado e o redirecionamento. **Quem instalar numa máquina nova seguindo o arquivo do repositório instala um painel sem TLS**, e o arquivo não avisa. A conf instalada ainda tem um `location` de outra aplicação dentro, que não é do painel |
| 10 | O cartão oficial de "esta tela não tem dado" **nunca aparece na tela** | `web/src/ui/SemDado.tsx` e `web/src/telas/Vazias.tsx` | `SemDado` só é usado dentro de `TelaSemDado`, e **nenhuma rota chama `TelaSemDado`**. A única tela de fato vazia, Chamadas, **reescreve o texto à mão** (`Chamadas.tsx:49-54`). Duas versões da mesma frase, e a que alguém for editar é a que ninguém vê |

⚠️ **Sobre o item 7, uma advertência de método:** o total é medido a cada coleta
e muda sozinho. Uma prova de 10/09 mostrava "3 de 171"; um levantamento anterior
falava em "6 de 145". **Os dois estão certos nas suas datas.** O que é
permanente, e o que precisa de conserto, é a mistura das duas frotas, não o
número. Quem for consertar isto conserta a separação, não o valor.

## 1.4 O que foi remedido hoje e NÃO precisa de conserto

Isto está aqui de propósito. Levantamento envelhece, e mandar alguém consertar o
que já está de pé é como mandar caçar defeito que não existe.

| item do levantamento anterior | medido em 10/09/2026 | veredito |
|---|---|---|
| "JSON incompleto derruba a tela inteira (tela branca)" | Existe `web/src/ui/Erro.tsx` com dois componentes: `Rede`, um error boundary **por vista** (`getDerivedStateFromError`, e limpa o erro ao trocar de tela), e `EstadoInvalido`, que mostra o caminho de cada campo com problema | **CONSERTADO.** A tela não fica branca: ela nomeia a vista que quebrou e mantém o menu de pé |
| "o comentário do `tipos.ts` promete a garantia oposta" | `web/src/dados/tipos.ts:10` hoje aponta para `validar.ts` como quem garante, e o `validar.ts` documenta por extenso que o `as unknown as Estado` antigo não validava nada | **CONSERTADO** |
| "`Cofre.tsx`, por volta de 610-618: o comentário afirma que a razão da ligação não passa pela trava, e passa" | O texto que a tela renderiza hoje diz o contrário certo: *"A razão da ligação também passa por essa trava, com uma diferença de ordem"*. O próprio comentário acima registra que `_cofre_razao` passou a chamar `_cofre_texto` em 10/09/2026, 16h19 UTC | **CONSERTADO no mesmo dia do levantamento** |
| "`--color-tinta-3` reprova contraste (3,58:1) em 176 elementos de 9,5px" | **Não reproduziu.** Medido no CSS que o navegador de fato recebe (`web/dist/assets/index-C0RnVuV_.css`): `--color-tinta-3:#7a4a0f` sobre `--color-fundo:#f7f1e6` dá **6,64:1**, exatamente o que o comentário do `index.css:47` afirma, e `.text-tinta-3` compila para `color:var(--color-tinta-3)` sem opacidade nenhuma | **NÃO CONFIRMADO.** O único token de contraste muito baixo é `--color-dourado:#f5a623`, a **1,80:1**, e ele **não pinta texto**: `Cabecalho` usa essa cor só num traço decorativo de 2px de largura, enquanto o texto ao lado usa `.rotulo`, que é tinta-3. Se alguém tiver medido 3,58:1 num elemento renderizado, **falta o seletor**: número medido no elemento errado é pior que número ausente |

## 1.5 O que NÃO entra

Escrito porque escopo que não se declara volta sozinho:

- **O painel não publica nada.** Nenhuma rota chama o produtor, a agenda ou o
  publicador. Aprovar registra a decisão e devolve `publicado: false`.
- **Não existe conector de Instagram nem de LinkedIn.** Alcance, clique e
  engajamento continuam nulos e bloqueados na Analítica, e link registrado não é
  chamado de desempenho.
- **O painel não acessa o Drive.** A ingestão de chamadas é local, por pasta.
- **Nenhum dado de cliente em tela**, nunca, em nenhuma tela. Isto não é
  preferência, é trava do coletor, e está descrito em "Nome de cliente não
  aparece em tela".

---

# 2. O QUE JÁ FOI FEITO

Cada afirmação desta seção foi conferida no código ou na tela em 10/09/2026, não
copiada da versão anterior deste arquivo.

## 2.1 Está no ar, agora

Medido em 10/09/2026, 17h00 BRT:

| o que | como foi medido | resultado |
|---|---|---|
| processo servindo | `ss -ltnp \| grep 5199` | `python3` escutando em `127.0.0.1:5199`, preso ao loopback |
| a trava responde | `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:5199/` | **401** sem credencial |
| o domínio responde | `curl -o /dev/null -w '%{http_code}' https://painel.casaldotrafego.com/` | **401** através do proxy, ou seja, HTTPS de pé com a trava atrás dele |

## 2.2 As 13 telas, e a fonte de cada uma

O menu sai de um lugar só: `web/src/nav/rotas.ts`. Acrescentar tela é
acrescentar entrada lá, e nenhum componente muda.

| # | tela | quanto tem hoje | de onde vem |
|---:|---|---|---|
| 1 | Centro de comando | parcial | diretiva vigente, tarefas, CRM agregado, follow-up, os dois verificadores, 65 jobs de cron e as convocações. Qualificação individual, resultado de chamada e comparecimento ficam **declarados fora da cobertura** |
| 2 | Estúdio de conteúdo | **236 peças no acervo, 131 na lista servida, 84 com artefato** | `posts.json` e os arquivos reais de `out/`. Duas ações: baixar o artefato e enviar à fila. **Não existe botão de publicação** |
| 3 | Aprovações | **0, e é zero medido** | `data/aprovacoes.json`: a fila foi lida e está vazia, o que a tela diz com essas palavras. Decisão autenticada, com transições estritas e idempotência |
| 4 | Cobranças | **0 faturas atrasadas, e é zero medido** | relatório canônico de vencidos, reduzido a agregados por faixa de atraso e moeda antes de virar JSON. Falha de acesso fica nula e explícita, nunca zero |
| 5 | Diretores | **31 agentes, 12 playbooks** | catálogo de agentes, transcripts, verificadores e crontab. Organograma, squads, ranking e quem está encostado |
| 6 | Tarefas | **169 abertas** | API remota do gestor de tarefas, somente leitura. Carteira aberta sem `done`, e sem título, nota, id ou PII |
| 7 | Pipeline comercial | **6.563 leads em 19 organizações** | `analytics` remoto somado. Sem linha individual, sem nome de organização, sem lead nem contato |
| 8 | Chamadas | **vazia, e é a única** | a caixa local de exportações está vazia e o Drive não está conectado. A tela escreve isso, em vez de mostrar zero |
| 9 | Agenda | **65 jobs de cron, mais publicações agendadas** | crontab, peças com status `agendado` e o snapshot do calendário. ⚠️ O bloco do calendário está **vencido** hoje (ver dívida técnica, item 8). Presença e reunião ocorrida ficam explicitamente fora |
| 10 | Analítica de conteúdo | **148 publicações, 56 com agenda** | `posts.json`, só da marca própria. Alcance, clique e engajamento ficam **nulos e bloqueados** por falta de conector |
| 11 | Biblioteca | **248 itens, 0 atalhos quebrados, 35 rótulos mascarados** | índice sanitizado de `out/`, `PRONTOS/` e `PRONTOS-CLIENTES/`. Entradas de cliente não expõem rótulo nem caminho |
| 12 | Ferramentas | **27 conexões medidas** | MCPs descobertos nos adaptadores, recibos de plugins e componentes locais, com proveniência e sem comando, caminho ou credencial no JSON |
| 13 | Cofre de conhecimento | **46 aprendizados, 25 ligações, 7 áreas, grau médio 1,1, cobertura 69,6%** | `data/cofre.json`. Cada nó é um aprendizado com autor, data, fonte e caso; aresta só existe quando a fonte declara a ligação, e cada âncora é conferida contra o arquivo citado |

⚠️ **Os números acima são de um instante** (estado gerado em 10/09/2026, 17h28
UTC) e mudam a cada coleta. Eles estão aqui para dizer **o que tem fonte viva**,
não para virar contrato. O que é permanente é a coluna da direita.

Além dessas, existe a **ficha do agente**, que é rota de detalhe e não item de
menu: tarefas do dia, carga, ferramentas, conexões, convocações em 24h e 7d,
retornos e arquivo de definição.

⚠️ **O rótulo "tem dado?" sai do estado, não do campo digitado.** Antes ele era
escrito à mão em `rotas.ts` e venceu: três telas estavam declaradas "nenhum"
mostrando número medido, e a barra lateral escrevia "sem dado ainda" em cima de
dado real. Hoje quem decide é `web/src/nav/rotulo.ts`, e ele é conservador de
propósito: promove a vista declarada "nenhum" cuja fonte respondeu, rebaixa a
vista cuja fonte sumiu (com o motivo medido junto), e **nunca melhora** uma
ressalva que alguém redigiu à mão, porque ressalva é julgamento editorial.

⚠️ **A cobertura disso é parcial, e vale saber qual metade é qual:** existem
**8 sondas** (Aprovações, Cobranças, Ferramentas, Cofre, Chamadas, Tarefas,
Pipeline, Biblioteca). As outras **5 vistas continuam valendo o texto estático**
de `rotas.ts`, porque são compostas de várias fontes e não têm sonda. Nessas
cinco, o rótulo pode envelhecer sem ninguém ver.

## 2.3 As travas que já estão de pé

**A autenticação mora na porta, não na decisão.** A checagem está em
`parse_request`, o ponto único por onde toda requisição passa antes de qualquer
despacho. Não é um `if` dentro do `do_GET`: rota nova, verbo novo e arquivo
estático **nascem protegidos**, sem ninguém lembrar.

- A credencial vem de **arquivo**, lido a cada requisição, nunca de variável de
  ambiente. Apagar o arquivo com o servidor no ar fecha o painel no mesmo
  segundo, não na próxima reinicialização.
- A comparação é em **tempo constante** (`hmac.compare_digest` sobre SHA-256,
  que também esconde o comprimento), e os dois lados são sempre calculados.
- **Falha fechada.** Arquivo ausente, vazio, sem `:`, com senha curta, com
  permissão frouxa ou que virou link simbólico devolve **503 em tudo**,
  inclusive para quem manda a credencial certa. Nunca "sem senha configurada,
  então libera".
- O header `Authorization` **nunca** é logado. O `realm` é genérico e não nomeia
  o que está atrás da porta.

**Privacidade auditada antes de gravar.** O coletor reprova caminho privado
(`/opt`, `/home`, `~`), e-mail, formato de token e campo novo com nome de
credencial, recursivamente, sobre o estado inteiro. O validador do navegador
repete a mesma trava na entrada da API.

**Validação de verdade na entrada da tela.** `web/src/dados/validar.ts` confere
campo a campo o JSON que chega pela rede. Quando rejeita, o dado **não é usado e
não vira zero**: a tela mostra o caminho de cada campo com problema e mantém o
último estado válido. E o arquivo declara sozinho o que **não** cobre: ele não
confere se o número está certo, só se é número.

**Ninguém fica com a tela branca.** `web/src/ui/Erro.tsx` põe um error boundary
por vista: a tela que quebra é nomeada, o erro aparece, e as outras continuam
abrindo pelo menu.

## 2.4 O que os testes cobrem, e o desenho deles

São **17 arquivos de teste**, mais 5 roteiros de navegador. Rodados em
10/09/2026: **16 dos 17 passam**, e a falha é explicada logo abaixo. Nenhum
deles escreve em produção: todos usam diretório temporário.

Não existe runner instalado (sem vitest, sem jest, sem script `test` no
`package.json`). Cada teste se roda sozinho, com Node 22:

```bash
cd /opt/gastaomatos/luana/painel_os

# tipos
(cd web && npx tsc --noEmit)

# front, 6 arquivos, todos passando
node --experimental-strip-types web/src/dados/cron.teste.ts      # parser de cron
node --experimental-strip-types web/src/dados/cofre.teste.ts     # layout e BFS do Cofre
node --experimental-strip-types web/src/dados/grafo.teste.ts     # o grafo
node --experimental-strip-types web/src/dados/validar.teste.ts   # contrato do estado
node --experimental-strip-types web/src/dados/relogio.teste.ts   # prazo da diretiva
node --experimental-strip-types web/src/nav/rotulo.teste.ts      # o rótulo "tem dado?"

# coletor, 7 arquivos
python3 coletor/coletor.teste.py                # privacidade e fontes
python3 coletor/chamadas_teste.py               # contrato de chamada
python3 coletor/importar_chamadas_teste.py      # o importador
python3 coletor/sanitizar_calendario_teste.py   # o que sai do calendário
python3 coletor/estudio_fontes.teste.py         # lotes recebidos
python3 coletor/motores_teste.py                # services e motor por agente
python3 coletor/calendario_teste.py             # ⚠️ reprova hoje, ver abaixo

# servidor, 4 arquivos
python3 servidor/auth.teste.py         # a trava da porta
python3 servidor/aprovacoes.teste.py   # a fila e as transições
python3 servidor/estudio.teste.py      # download e envio à fila
python3 servidor/latencia.teste.py     # a espera da coleta
```

E os 5 roteiros de navegador, que **abrem o painel de verdade e gravam PNG em
`provas/`**, por isso não são para rodar sem intenção:

```bash
node provas/navegador.teste.mjs      # as 13 telas em 390x844 e 1440x900, mais o JSON bruto
node provas/cofre.navegador.mjs      # o Cofre com 45 nós sintéticos
node provas/motores.navegador.mjs    # os 4 estados do motor, na tela
```

⚠️ **A falha de hoje não é regressão de código, é o relógio.**
`coletor/calendario_teste.py:13` afirma que o snapshot não está vencido, e ele
lê o arquivo de **produção**, não uma cópia. Medido: o snapshot foi coletado em
08/09 às 23h28 UTC, ou seja **44,5 horas**, contra o limite de 24h. **A causa
raiz é o item 8 da dívida técnica**: ninguém escreve esse arquivo. O teste está
certo e o dado é que envelheceu.

O que vale registrar não é a lista, é o **desenho**, porque ele é o que
sobrevive a refatoração:

- **Todo teste tem caso que precisa REPROVAR.** O do cron tem caso positivo e
  negativo; o da autenticação exige ver um 401 **e** um 503, não só o 200. Teste
  que só sabe aprovar não distingue "está certo" de "parei de olhar".
- **O roteiro do Cofre existe porque o teste geral media existência.** Contar nó,
  contar aresta e ver a ficha trocar aprova qualquer desenho com 5 registros.
  Ele troca o estado por **45 nós sintéticos que atravessam o leitor de verdade**
  e mede o retângulo real de cada rótulo no navegador. Ele começa apontando o
  detector para dois rótulos empilhados de propósito: sem ver o detector acusar
  ali, todo "zero sobreposto" seria falso.
- **O teste de navegador injeta um valor inventado e exige vê-lo na tela.** Se a
  tela não refletir o que a API devolveu, todo o resto do arquivo ficaria verde
  por não estar olhando nada.
- **Nenhum teste para ou sobe service.** Esta conta não tem sudo, e derrubar o
  service da operação derruba a conversa do dono. O caso "um ativo" é medido no
  systemd de verdade; os outros são injetados, e os arquivos declaram isso.

⚠️ **Passar no validador é o piso, não o pronto.** Nenhuma trava mede "está
bom": elas medem "não está proibido". Peça e tela que passam em tudo continuam
precisando de alguém abrindo e olhando.

---

# 3. REFERÊNCIAS

## 3.0 Onde o material mora

```
/opt/gastaomatos/luana/conteudo/referencias/nievas-os-painel/
```

101 frames `.jpg` e 6 vídeos `.mp4`, todos baixados em 08/09/2026 (BRT). As
séries são nomeadas por data e tela: `0816_SISTEMA`, `0819_SISTEMA`,
`0825_EQUIPO`, `0827_LLAMADAS`, `0829_EQUIPO`, `0901_EQUIPO`, `0905_EQUIPO`,
mais dois lotes soltos, `f_` e `g_`. Dentro há a subpasta
`reel-9418-bennett-os/`, com vídeo, transcrição e 18 frames de uma **segunda**
referência.

⚠️ **Não existe print da referência do Kimi, e isso é de propósito.** Ela mora
como link, e a regra escrita na memória da casa é que **a distância se mede
abrindo os dois no navegador, tela por tela, nunca por print**. Foi assim que
ela foi medida aqui.

⚠️ **`painel_os/provas/` não é referência: é obra nossa.** São 113 PNGs do nosso
próprio painel, gerados pelos testes de navegador. Servem como termo de
comparação lado a lado, nunca como modelo.

## 3.1 Referência principal: **NIEVAS OS**

É o sistema que ele viu em vídeo, e é dele que sai o desenho do nosso painel
inteiro: os 13 itens de menu, a ideia de organograma clicável, a ficha lateral
do agente, e os nomes originais em espanhol.

Identidade da tela: **"NIEVAS OS / OPERACIONES AGENTES"** no canto superior
esquerdo. Barra superior sempre com trilha (`nievas-os / <tela>`), um contador
de **"LLAMADAS DE AGENTE"** (lido entre 1.301 e 1.387 ao longo da série), uma
pílula verde "Sistema agéntico operativo" e um relógio. Rodapé da lateral com
versão e hora.

‼️ **É um alvo em movimento, e toda contagem dele precisa da data do retrato.**
Medido nos frames em 10/09/2026: **6 agentes** e **9 itens de menu** na série de
16/08/2026; **13 agentes** e **13 itens de menu** na de 25/08; **14 agentes** na
de 05/09. Uma contagem repetida sem data já circulou nesta casa como se fosse o
estado de hoje e virou comparação errada. **Material de terceiro descreve o dia
em que foi publicado e não avisa quando muda.**

⚠️ **O número 13 do nosso menu não vem da quantidade de agentes**, vem dos
rótulos da barra lateral ao longo da série. Não confundir quantidade de agentes
com quantidade de telas.

### O que a série mostra com o miolo aberto

Cada bloco abaixo foi lido abrindo o frame. O caminho é relativo a
`referencias/nievas-os-painel/`.

**`f_3s.jpg` e `0825_EQUIPO_33s.jpg`, tela Equipo (o organograma).**
Sobretítulo, título serifado terminado em ponto ("Trece agentes, tres áreas.")
e subtítulo em uma linha. Quatro contadores no topo:
**13 AGENTES · 3 ÁREAS · 3 NIVELES · 7 ACTIVOS**, mais um botão de ação.
No canvas, o organograma em três níveis: CEO no topo, três responsáveis abaixo
(CMO, CRO, CFO), e os especialistas pendurados neles. O nó selecionado ganha
halo. Rodapé do canvas com zoom em 100%, botão "reacomodar" e legenda de cor por
área. Painel direito com o agente selecionado: estado, nome, papel, modelo,
**"o que está fazendo agora"** em uma frase, **"reporta a"**, **"tem a cargo"**,
**a fila do dia** (linhas com hora, estado e descrição), três métricas, e dois
botões, "abrir ficha completa" e "falar com o agente".

**`f_14s.jpg`, tela Tareas.** Título "Cola de trabajo." e quatro indicadores:
**46 na fila · 19 concluídas · 20 em curso · 7 aguardando**. Uma linha de filtro
por dono (chips com o nome de cada agente, mais "todos") e o contador "8 de 46"
ao lado. Tabela de oito linhas com colunas **hora, dono, estado, tarefa, camada,
modelo**, estado com bolinha colorida. Rodapé: "a fila se atualiza sozinha".

**`0819_SISTEMA_40s.jpg`, tela Centro de Mando.** Título "Centro de
operaciones." e **quatro indicadores com comparação contra ontem**
(147 consultas, +18; 38 leads qualificados, +6; 11 chamadas agendadas, +2;
63 follow-ups enviados, +21). Faixa de três cards: **diretiva atual** (uma frase
grande em serifada, com autor e estado), **contexto de raciocínio** (agente
atual, tarefas abertas, janela de contexto e percentual usado) e **saúde do
sistema** (CPU, RAM, disco em barras). Abaixo, a origem das consultas em barra
empilhada mais lista com número e quantos qualificaram. Faixa técnica com
integridade, chamadas de agente, mensagens, tokens e erros. Rodapé "falar com um
agente": seis atalhos, um por agente, com o modelo embaixo.

⚠️ Uma correção de ponteiro: `g_28s.jpg` já foi citado nesta casa como prova do
Centro de Mando, e **não é**: é a ficha do agente Investigador. O Centro de
Mando de verdade é `0819_SISTEMA_40s.jpg`.

**`g_28s.jpg`, a ficha do agente.** Trilha própria com "voltar à rede".
Cabeçalho com nome, estado, e uma barra de metadados (papel, modelo, número de
conexões, número de memórias), mais três números à direita e um botão "abrir
canal direto". Coluna esquerda: **as tarefas de hoje** (com marcador "4
concluídas, 2 ativas") e **o que ele escreveu na memória compartilhada** (cards
com a fonte). Coluna direita, quatro blocos empilhados: **carga atual** em
percentual, **ferramentas habilitadas** com chave liga e desliga, **conexões**
(outros agentes com o papel ao lado) e **saída do dia** (arquivos).

**`f_26s.jpg`, tela Bóveda de Conocimiento.** Título "Memoria compartida." e
quatro indicadores: **38 nós · 56 conexões · 6 agentes · 62 arquivos**. Grafo de
força sobre grade sutil, nós coloridos de tamanhos diferentes, rótulo só em
alguns. Painel direito com o nó selecionado: espécie e peso, título, autor, o
aprendizado em uma frase, e a linha de fonte com hora. Abaixo, **"conecta com
5"**, e cada relação leva uma **etiqueta de tipo** (decisão, objeção, métrica,
arquivo). No pé, **"tipos de registro"** como grade de nove chips com contagem
(regra 6, dor 4, gancho 4, arquivo 4, conceito 3, sinal 3, métrica 3, alerta 3,
lead 3, decisão 2).

**`0827_LLAMADAS_23s.jpg`, tela Llamadas.** Dois contadores no topo, com nomes
que são frases ("para perguntar na próxima", "dito em voz alta"). Grafo grande
com nós de tamanhos variados, dois com anel de seleção, e **tooltip flutuante**
sobre o nó apontado com o rótulo e "em 6 chamadas". Legenda de cor no rodapé
separando **chamada, dor, objeção, o prometido, o que faltou, achado**. Painel
direito com **citação literal em itálico**, um bloco "quanto isso custa", a
lista de em quais chamadas aquilo apareceu, e as objeções em barras ordenadas
por frequência.

**`0901_EQUIPO_48s.jpg`, tela Estudio de Contenido.** Quatro indicadores
(3 na mesa, 1 renderizando, 16 prontos para assinar, 0 publicados hoje). Três
colunas: **a mesa** (pautas com duas barras de progresso rotuladas cada),
**visor** (a peça em 9:16 com metadados de formato, duração e dimensão) e
**saída** (resumo, redes em caixas de seleção, e dois botões, baixar e
publicar). Faixa inferior com a parede de miniaturas prontas.

### O que a série NÃO abre

Estas telas só aparecem como **rótulo de menu**: `Biblioteca`, `Analítica`,
`Pipeline`, `Agenda`, `Herramientas`, `Aprobaciones` e a de cobrança.

‼️ **Por isso as nossas telas equivalentes têm estrutura e aviso, não imitação.**
Dizer que estão iguais ao original seria afirmar semelhança com um miolo que
ninguém viu. Quem for mexer nelas não tem referência: tem que resolver de
cabeça, e declarar isso.

### Os fluxos que o original mostra, e que o nosso backend precisa preservar

1. O CEO lê o estado agregado, define prioridade e distribui tarefas; a fila e a
   carga de cada ficha mudam junto.
2. Agentes escrevem na mesma memória e outros agentes leem o achado (o exemplo
   explícito: a análise detecta a perda depois do primeiro contato, e o comercial
   muda o follow-up).
3. Uma chamada entra sozinha depois da transcrição, vira evidência estruturada e
   se agrega às anteriores.
4. Conteúdo percorre pesquisa, direção, roteiro, análise e edição. **Publicação
   e resultado são estados diferentes** e não podem ser fundidos.
5. Finanças concilia banco e fatura e gera cobrança; **existência de lançamento
   não prova recebimento.**

## 3.2 O grafo do Kimi, e a queixa aberta dele

**Endereço:** <https://y66awiibymclm.ok.kimi.link/>
**Medido em 10/09/2026, 16h50 BRT**, com Chromium de verdade (Playwright), em
1440x900 e em 390x844. Respondeu **HTTP 200**.

⚠️ **`curl` não serve para medir esta página, nem as nossas.** Ela monta a tela
no cliente. Página que responde 200 com quase nada de HTML é sintoma de
instrumento errado, não de site morto.

‼️ **A primeira coisa medida derruba a suposição mais comum sobre este link:
ele não é um painel de operação.** Chama-se **"Knowledge Atlas · AI Concept
Map"** e é **um grafo e nada mais**: uma tela só, sem menu, sem telas irmãs, sem
organograma, sem tarefa, sem CRM. Ele não é referência para 12 das nossas 13
telas. **O que ele é referência, com precisão, é o nosso Cofre de conhecimento.**

### O que ele tem

**Cabeçalho:** o nome, e embaixo a linha de escala,
`81 concepts · 7 clusters · directed prerequisites`.

**Coluna esquerda:** campo de busca; legenda dos 7 grupos, cada um com bolinha
colorida, contagem, e clicável para filtrar; a lista dos 81 conceitos
**ordenada por grau**, com o selecionado destacado; e um rodapé com quatro
números grandes, **81 nós visíveis, 121 arestas visíveis, grau médio 3,0**, e
**quadros por segundo**, que muda ao vivo (medi 24, 37 e 39).

**Centro:** o grafo, em **três dimensões**. Cor por grupo, raio por grau, e
rótulo só nos nós de grau alto (13 rótulos visíveis em 1440px, 4 em 390px), o
que evita empilhamento sem precisar cortar nome.

**Coluna direita:** escreve "nada selecionado" enquanto nada está selecionado.
**Ao clicar num nó ela vira a ficha**, e essa é a parte mais forte:
linha de contexto (`DEEP LEARNING · DEGREE 7 · LAYER 6`, ou seja grupo, grau e
camada); o nome; uma frase explicando; **`PREREQUISITES 4`**, a lista do que vem
**antes**, cada item com a cor do grupo dele e a etiqueta `PRE`; **`ENABLES 3`**,
a lista do que aquilo **destrava**, com a etiqueta `NEXT`; e dois botões,
**"centrar aqui"** e **"achar caminho a partir daqui"**.

**Barra inferior:** três modos de layout (`Atlas`, `Sphere`, `Layers`), três
interruptores (`Signal flow`, `Labels`, `Auto-orbit`), zoom, modo noturno e
`Reset`. O canto superior direito nomeia o modo: em `Atlas` diz `FREE ORBIT`; ao
clicar em `Layers` muda para **`DEPENDENCY TIERS`** e os nós se reorganizam em
camadas por profundidade de pré-requisito.

**Instruções escritas na própria tela:** arrastar para girar, roda para dar
zoom, clicar num nó para focar, **`Shift`+clique num segundo nó para o caminho
mais curto**, `Esc` para limpar.

### O que a referência tem que o nosso Cofre não tem

‼️ **Cuidado com print velho aqui, porque isto me mordeu ao escrever esta
seção.** A prova `provas/v5-cofre.png` é de 10/09 às 12h04 BRT e mostra **5
aprendizados**; o estado das **17h28 UTC do mesmo dia** tem **46**. O Cofre
cresce durante o dia. **Os números abaixo são do estado medido, não do print.**

| medida | Kimi | nosso Cofre | |
|---|---:|---:|---|
| nós | 81 | **46** | mesma ordem de grandeza |
| arestas | 121 | **25** | quase 5 vezes menos |
| grau médio | 3,0 | **1,1** | **é aqui que está a distância** |
| grupos | 7 | 7 | igual |

‼️ **A distância não é de quantidade de nós, é de LIGAÇÃO.** Com grau médio 1,1,
o nosso mapa é um punhado de pares soltos; com 3,0, o deles é uma malha que se
percorre. E a cobertura declarada no nosso próprio estado diz o mesmo:
**69,6%**, ou seja, cerca de 14 dos 46 aprendizados não se ligam a nada.
**Encher de nó não conserta isso: só aumenta o número de ilhas.**

Isto é lista verificável, não opinião:

| # | a referência tem | o nosso tem | o que muda |
|---:|---|---|---|
| 1 | **121 arestas para 81 nós**, grau médio 3,0 | **25 arestas para 46 nós**, grau médio 1,1 | **É a diferença que explica quase todas as outras.** Busca, filtro e caminho mais curto existem para percorrer uma malha. Numa malha esparsa eles não têm o que fazer, e a tela parece pobre mesmo com nó suficiente |
| 2 | Arestas **dirigidas**, e a ficha separa o que vem antes (`PRE`) do que aquilo destrava (`NEXT`) | ligação sem direção | **A maior falta conceitual, e ela não depende de volume:** já dava para dizer qual aprendizado nasceu de qual |
| 3 | Cada relação da ficha **é clicável e leva ao nó** | a ficha lista, não navega | |
| 4 | **Campo de busca** | não tem | |
| 5 | Lista lateral **ordenada por grau**, clicável | listas de área e de quem aprendeu, com contagem | a nossa não ordena por importância nem navega |
| 6 | **Três modos de layout**, sendo um deles ordenação por profundidade de dependência | um layout fixo | |
| 7 | **Três dimensões**, com rotação, órbita automática e zoom | duas dimensões, estático | |
| 8 | Interruptor de rótulos | rótulo sempre ligado, com a regra escrita na tela ("5 de 5 nomes cabem neste tamanho") | a nossa solução é honesta, mas não dá controle a quem olha |
| 9 | Botões de ação na ficha ("centrar aqui", "achar caminho") | não tem | o caminho mais curto existe no nosso, mas só por atalho de teclado |
| 10 | Modo noturno e `Reset` | não tem | |
| 11 | **Contador de quadros por segundo ao vivo** | não tem | é o detalhe que faz a tela parecer instrumento, e não relatório |

**E uma falta que só aparece comparando com o NIEVAS, não com o Kimi:** lá cada
relação da ficha carrega uma **etiqueta de tipo** (decisão, objeção, métrica,
arquivo) e a tela tem um rodapé com a **contagem por tipo de registro**. O nosso
tem espécie no nó, e não tem tipo na aresta.

**O que o nosso já tem e é igual, para ninguém refazer o que está feito:** cor
por área, tamanho do círculo por número de ligações, ficha lateral que troca ao
selecionar, e **`Shift`+clique num segundo nó mostrando o caminho entre os dois**
(a referência usa exatamente o mesmo gesto). Mais um recurso que **nenhuma das
duas referências tem**: cada nó nosso carrega autor, data, fonte e o caso real,
e a âncora é conferida contra o arquivo citado.

**A frase dele:** *"o que você fez ainda não ficou nem perto do que eu vejo no
Kimi"*. Com um quinto das ligações e duas dimensões contra três, ele está certo
do ponto de vista de quem olha.

‼️ **E a resposta não é executar os onze itens da tabela.** Os itens 1 (ligar os
nós que já existem) e 2 (dar direção à ligação) mudam a tela mais que os outros
nove juntos, e são os dois mais baratos, porque **não dependem de escrever
aprendizado novo: dependem de declarar ligação entre os 46 que já estão lá.**
Fazer o resto antes disso produz uma tela cheia de controle sem nada para
controlar.

## 3.3 Terceira referência: **BENNETT OS**

Em `referencias/nievas-os-painel/reel-9418-bennett-os/`, com vídeo, transcrição
e 18 frames, recebida em 08/09/2026 22h36 BRT (que é 09/09 em UTC, e por isso as
notas dela divergem em um dia).

⚠️ **Ela não pertence à série do Nievas e não altera a contagem de 13 telas.**
É um sistema diferente, e o que se sabe do tamanho dele ("37 agentes, seis
departamentos") é **fala do autor no vídeo**, não número medido em tela.

Vale por um motivo específico: **é um painel de operação construído em volta de
um grafo de conhecimento**, ou seja, é o cruzamento das duas outras referências.
Identidade "BENNETT OS · V3 · OPERATOR MODE", tema escuro, tipografia
monoespaçada. A barra lateral é agrupada por função, e isso é o que mais
interessa: `OPERATE`, `AGENTS`, `INTELLIGENCE`, `SYSTEM`, `VARIANTS`, com o
rodapé declarando **"0/21 systems live"**, que é uma cobertura declarada na
própria interface.

A tela de grafo tem dois modos (radial e neural), uma caixa de ingestão em texto
ou voz, busca, e um painel com **"o cérebro em números"** (120 notas, 8 pastas,
595 ligações, 8 grupos), **domínios de conhecimento** em barras, e **as notas
mais ligadas**. A ficha de um item traz um bloco chamado **"a escada"**, com três
degraus rotulados (conduzido por humano, assistido por humano, totalmente
autônomo), **quem é o humano responsável**, quem executa, e o procedimento
escrito em passos numerados.

**O que dali vale copiar, e não copiamos:** a cobertura declarada no rodapé do
menu ("N de M no ar") e a escada de autonomia por item. As duas são maneiras de
a tela dizer honestamente o quanto dela está de pé, que é o mesmo princípio do
nosso rótulo "tem dado?".

---

---

# COMO OPERAR

Daqui para baixo é o manual da máquina. Ele supõe que você nunca viu este painel.

## Abrir o painel

<https://painel.casaldotrafego.com/> de qualquer computador, no navegador.

O navegador pede **usuário e senha** antes de mostrar qualquer coisa. Ele guarda
a credencial pela sessão: só se digita de novo depois de fechar o navegador. Não
existe túnel SSH e não existe passo de terminal para abrir.

Onde a credencial mora e como se troca está em "A senha", abaixo.

## Subir

```bash
cd /opt/gastaomatos/luana/painel_os/web && npm run build
cd /opt/gastaomatos/luana/painel_os
setsid nohup python3 -u servidor/servir.py > servidor/painel.log 2>&1 &
```

⚠️ **Sem credencial válida o painel não sobe**, e o log diz o motivo em uma
linha (código de saída 2). Isso é de propósito: painel no ar sem saber quem é
quem é exatamente o defeito que este arquivo existe para não ter.

⚠️ **Onde ele escuta depende de um marcador, e isso confunde quem chega.** Se
`servidor/.https-ativo` existir, o servidor prende em `127.0.0.1` e só o nginx
alcança; se não existir, ele escuta em `0.0.0.0`. Hoje o marcador **existe**,
então tentar abrir pelo IP e pela porta 5199 de outra máquina não responde nada,
e isso é o comportamento correto, não uma queda.

O `@reboot` já instalado no crontab chama `servidor/iniciar.sh`, que usa `exec`
para o processo Python ficar visível e não escondido atrás de um wrapper.

O cron também chama `servidor/garantir-ativo.sh` a cada minuto, com `umask 077`
para o log não ficar legível por outros usuários. Ele usa uma trava para impedir
concorrência, valida que o dono da porta é este servidor e exige 401 local sem
credencial. **Só relança quando a porta está livre.** Porta ocupada por processo
desconhecido, ou servidor que responde algo diferente de 401, reprova alto e
fica registrado em `servidor/watchdog.log`, em vez de matar o que estiver lá.

### Testar a persistência sem reiniciar a máquina

```bash
/opt/gastaomatos/luana/painel_os/servidor/testar-operacao.sh
```

Ele confere a linha exata do `@reboot`, a sintaxe e a permissão dos scripts,
sobe o mesmo servidor em `127.0.0.1:15199`, exige **401** sem credencial e
encerra só essa instância, sem tocar no processo real.

⚠️ Isso prova que o comando de boot funciona hoje. A prova definitiva de boot só
existe depois de um reboot de verdade.

## Ativar HTTPS numa máquina nova

Já está ativo nesta. O procedimento fica registrado para quem repetir a
instalação.

Criar primeiro o registro A do domínio apontando para o IP do servidor. Enquanto
o DNS público responder NXDOMAIN, o instalador para **antes** de alterar o nginx
ou pedir certificado. Depois da propagação, um comando:

```bash
sudo /opt/gastaomatos/luana/painel_os/servidor/ativar-https.sh
```

Ele valida o DNS num resolvedor público, instala `servidor/nginx-painel-os.conf`,
roda `nginx -t`, recarrega, usa o Certbot, força o redirecionamento de HTTP para
HTTPS e só então cria o marcador que prende a aplicação em `127.0.0.1:5199`.
Valida o PID antes de encerrar o servidor antigo e o relança como usuário comum,
nunca como root.

⚠️ Os arquivos estáticos e `/api/estado` passam pelo **mesmo** `location /`, e é
isso que impede o proxy de quebrar as rotas do SPA. Se qualquer etapa falhar, o
script restaura o nginx anterior, remove o marcador e garante que o servidor
autenticado continue acessível, em vez de deixar uma ativação pela metade.

‼️ **ARMADILHA MEDIDA EM 10/09/2026, e ela vai pegar quem repetir a instalação:
`servidor/nginx-painel-os.conf`, o arquivo do repositório, NÃO é o que está no
ar.** O arquivo versionado só tem `listen 80` e **nenhum bloco TLS**. O que
serve de verdade é `/etc/nginx/conf.d/painel-os.conf`, com 443, o certificado e
o redirecionamento. Quem instalar numa máquina nova copiando o arquivo do
repositório **sobe um painel sem TLS achando que subiu com**, e nada avisa. Isto
está na dívida técnica como item 9: **compare os dois arquivos antes de usar
qualquer um deles.**

Como conferir que o TLS está mesmo de pé, sem credencial nenhuma:

```bash
curl -s -o /dev/null -w 'https: %{http_code}\n' https://painel.casaldotrafego.com/
curl -s -o /dev/null -w 'http:  %{http_code}\n' http://painel.casaldotrafego.com/
```

Medido em 10/09/2026: **401** no HTTPS (a trava respondendo através do proxy) e
**301** no HTTP (redirecionando). ⚠️ **O `auth_basic` do nginx está comentado de
propósito**: quem autentica é o Python, num lugar só. Ligar os dois criaria duas
travas para manter em dia, e uma delas ia envelhecer.

## A senha: onde mora, o que protege, e como trocar

**Onde mora:** um arquivo de uma linha só, no formato `usuario:senha`, em
`/opt/gastaomatos/luana/.painel_os.credencial`, fora da pasta do projeto e fora
de qualquer repositório. **Este documento não diz e nunca vai dizer qual é.**

**Como trocar:** editar a linha do arquivo e reiniciar o servidor. O servidor
recusa senha com menos de **16 caracteres**. O arquivo tem que ficar `chmod 600`,
e o servidor recusa subir se a permissão estiver frouxa:

```bash
chmod 600 /opt/gastaomatos/luana/.painel_os.credencial
```

⚠️ **Não abra esse arquivo para "conferir o formato".** Existe
`painel_os/servidor/abrir.sh`, que fala com o painel lendo a credencial por
dentro (pelo stdin do `curl`, então ela não aparece nem em `ps` nem no
histórico). Toda vez que o caminho normal exigir abrir o arquivo, alguém vai
abrir, e a senha vaza na saída de quem estava só conferindo uma tela. **Use o
wrapper.**

**O que continua de fora, dito para ninguém supor o contrário:** não há registro
de quem entrou (o log tem código, origem e rota, não sessão); não há bloqueio por
tentativa repetida além de um atraso de 0,4s por erro; e a credencial é **uma só**
para todo mundo que a tiver.

## Rodar só o coletor

```bash
python3 /opt/gastaomatos/luana/painel_os/coletor/coletar_estado.py
```

Ele escreve `web/src/dados/estado.json`, que **entra no bundle** (o React importa
o arquivo).

⚠️ **Depois de qualquer mudança no coletor que afete o que vai para a tela,
refaça o build**, senão o `web/dist` continua servindo o dado antigo:

```bash
cd /opt/gastaomatos/luana/painel_os/web && npm run build
```

Quando a coleta ultrapassa 8 segundos, a primeira resposta conserva o snapshot
anterior e declara `coleta_em_andamento`. O frontend repete a consulta em série,
com 2,5 segundos entre respostas e teto de 16 tentativas, e para assim que
recebe o snapshot concluído. Não há requisições sobrepostas e não é preciso
atualizar a página na mão.

## Ingestão local de chamadas

O painel **não acessa o Drive**. Exportações estruturadas colocadas em
`dados/chamadas-inbox/*.json` entram na próxima coleta.

```bash
cd /opt/gastaomatos/luana/painel_os
python3 coletor/importar_chamadas.py /caminho/da/exportacao
python3 coletor/coletar_estado.py
cd web && npm run build
```

Cada arquivo usa `schema: "painel-os/chamada@1"` e exige `escopo_id`,
`chamada_id`, `origem_id`, `ocorrido_em` em ISO 8601, uma lista não vazia de
`citacoes` e uma lista não vazia de `achados`. Citação exige `id`, `trecho`,
`inicio_s` e `fim_s`. Achado exige `id`, `tipo` (`dor`, `objecao`, `promessa`,
`falta` ou `achado`), `rotulo` e `citacao_ids` que existam naquela chamada.
**Sem citação, não há nó.**

⚠️ **Um arquivo inválido reprova o lote inteiro**, de propósito, para uma leitura
parcial não parecer completa. Link simbólico, arquivo maior que 1 MB, data sem
fuso e referência órfã reprovam igual, sem alterar o acervo anterior. Reimportar
o mesmo lote é idempotente.

⚠️ **O escopo é fechado na marca própria.** Um contrato de cliente ou de outro
negócio reprova a importação inteira, então padrões de duas operações nunca são
agregados entre si.

O coletor publica hashes curtos dos identificadores, nunca os IDs de origem, e o
campo `fonte` publicado é apenas `caixa local protegida`, nunca o caminho
absoluto do servidor.

## Nome de cliente não aparece em tela

Regra da casa: **nenhum dado real de cliente em tela.**

O coletor lê os nomes de `memoria/clientes.md` e os nega explicitamente em cima
do rótulo inteiro de cada job de cron, em todos os ramos que produzem rótulo.
**Cliente novo fica protegido assim que entra em `clientes.md`**, sem mexer em
código.

⚠️ **Se `clientes.md` não puder ser lido, o coletor não emite rótulo de texto
livre nenhum**: todos viram `[rótulo omitido: sem lista de clientes]` e o motivo
vai para `cron.negacao.erro`, que aparece no rodapé da tela. Falha fechada e
visível, nunca silenciosa.

Nomes de bot e produto da casa continuam aparecendo de propósito, porque não são
pessoa. A lista de permitidos está no topo do coletor.

Rastreabilidade usa somente o nome do arquivo e rótulo técnico
(`posts.json`, `operação:luana`, `agente:global/dev.md`), nunca o caminho.

## Qual agente está no ar, e por qual motor

O dono mantém **mais de um service por agente** e troca qual sobe para trocar o
motor de IA.

⚠️ **Não escreva a lista de services à mão.** `coletor/motores.py` descobre os
services no systemd por prefixo a cada coleta, então um service novo aparece
sozinho. Lista escrita à mão faz o service novo **nascer invisível**, que é pior
que reprovado.

**O motor sai do que o service EXECUTA, e três armadilhas foram medidas aqui:**

1. **O nome do arquivo é rótulo.** `luana.service` não quer dizer Claude nem
   Codex.
2. **O fragmento `.service` do disco também mente.** O arquivo em
   `/etc/systemd/system/` pode mandar rodar um motor e um drop-in em
   `<service>.d/` zerar esse `ExecStart` e pôr outro no lugar. Quem lê o arquivo
   conclui o motor errado. A fonte certa é `systemctl show -p ExecStart`, que já
   vem com os drop-ins aplicados. Pela mesma razão, **config de systemd se lê com
   `systemctl cat`, nunca com `cat` no arquivo.**
3. **O script pode ser um despachante.** Um `start.sh` pode ter os dois motores
   escritos dentro, decidindo por um arquivo de configuração. Trocar esse arquivo
   troca o motor **sem mudar uma linha de service**.

Quando o service está **ativo**, o motor vem do processo (o cgroup da unidade),
que vale mais que qualquer leitura de script, porque o `.sh` pode ter mudado
depois do boot. Sem sinal forte, o painel escreve **"motor não identificado"** em
vez de chutar.

São quatro estados, e o terceiro é o que importa:

| estado | tela | o que é |
|---|---|---|
| um ativo | verde, com o nome do motor | normal |
| **mais de um ativo** | **vermelho, "conflito: N no ar"** | **defeito**: duas sessões no mesmo bot dão erro 409 no Telegram e o bot fica mudo |
| nenhum ativo | âmbar, "fora do ar" | o agente não está rodando |
| indeterminado | neutro, "indeterminado" | a sonda não respondeu. **Nunca vira "inativo"** |

⚠️ O último tem motivo próprio: `systemctl is-active` responde `inactive` tanto
para service **parado** quanto para service que **não existe**, e o código de
saída era descartado. Por isso a sonda usa `systemctl show`, que separa os dois
em `LoadState=not-found`. **Service apagado e service parado são a mesma tela**
para quem lê só o texto.

---

## Onde este arquivo se encaixa

Este README é a **fonte única** do painel, para qualquer motor de IA que trabalhe
nesta pasta. **Não criar um segundo manual por motor, nem um arquivo novo a cada
pedido.** O estado do dia a dia da operação continua em
`/opt/gastaomatos/luana/working-memory.md`; identidade e regras dos agentes
continuam em `AGENTS.md` e `CLAUDE.md`.
