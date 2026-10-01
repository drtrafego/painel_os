# Escritório CT Gold — integração e limites

## 1. Entrega de código

O pacote contém um `web/src/ui/PixelOffice.tsx` **inteiro e já integrado**, não apenas uma receita de alterações. O componente exportado continua `PixelOffice`. O import da tela `web/src/telas/Tarefas.tsx` permanece válido. As props existentes continuam compatíveis; `gastosIA` é opcional.

| Arquivo final | Responsabilidade |
|---|---|
| `web/src/ui/PixelOffice.tsx` | Lógica original preservada + chamada do novo desenhista + composição visual e painéis |
| `web/src/ui/PixelOffice.gold.ts` | Desenho procedural da sala, mesas, plantas, cadeiras, bonecos e alvos de clique |
| `web/src/ui/PixelOffice.gold.css` | Estilo com escopo `.ct-office`, sem alterar body/:root ou outras telas |
| `web/src/ui/PixelOffice.wall.tsx` | Painéis React reais de consumo e tarefas Renato/Luana |
| `web/src/ui/PixelOffice.wall-data.ts` | Adaptadores de leitura, formatação e contrato opcional de gastos |
| `web/src/assets/casal-do-trafego.png` | Logo fornecida pelo usuário, redimensionada para a interface |

Não há nova dependência npm, arquivo de fonte, chave de API, modelo 3D remoto ou endpoint. Não se usa imagem gerada como background. O resultado executável é uma interpretação leve 2.5D do conceito, não uma reprodução fotorealista/3D do mockup.

## 2. Base confirmada e preservação

Repositório `drtrafego/painel_os`.

Commit-base consultado: `565c2977807cbc3099c36bf88afd17afd50f6740`.

Git blob do componente original: `86282b346ed24540a4fdf53461ef51da55597710`. Esse blob foi reconfirmado na retomada. A cópia integral usada para gerar o arquivo final tem exatamente esse hash Git, incluindo o tamanho e bytes do arquivo.

O pacote NÃO fornece substitutos para nenhum arquivo em `web/src/dados`. Usa os imports originais. `MANIFEST.json` registra os hashes esperados das seis dependências operacionais diretas, além dos hashes dos arquivos finais.

`tests/preservacao-e-instalador.mjs` desfaz em memória as sete intervenções documentadas no TSX final. O resultado deve voltar **exatamente** ao blob original. Isso torna auditável que funções de negócio não foram reescritas.

Intervenções: imports visuais; prop opcional de custo; desestruturação compatível de props; fallback local do desenhista; substituição da chamada que pinta o quadro; leitura das tarefas a partir dos grupos existentes; composição final do JSX. A função original de árvore de lançados, antes não apresentada, é usada no detalhe expansível do inspetor.

Permanecem intactos: catálogo, aliases, resolução de identidade, chaves compostas, sessões complementares, `montarExecucoesVisuais`, `filtrarSquadsSobDemanda`, `useSquadsSobDemanda`, `SQUADS_SOB_DEMANDA`, permanência de 3 minutos, transição de 720 ms, `calcularLayoutSala`, posições operacionais e descanso, `estadoDaMesa`, imports do motor de movimento, cálculo do relógio, pausa, visibilidade do documento, leitura da sonda, mouse, teclado e controles de zoom. A dimensão física do palco pode mudar conforme o novo CSS responsivo; a planta continua sendo calculada pela mesma função original para a dimensão disponível.

## 3. Animação e quantidade de agentes

A máquina existente decide fase, destino e posição. O novo desenhista recebe poses já decididas. O loop permanece `requestAnimationFrame`, usando o relógio original.

Digitando: pequeno movimento repetitivo dos braços. Caminhando: balanço das pernas/corpo na trajetória recebida. Silencioso: permanece na mesa. Parado: segue o descanso que a máquina atual determinar. Não há rotina aleatória para mandar agentes descansar nem sincronização com a fala. Movimento reduzido remove esses movimentos decorativos.

A cena usa somente `layout.ilhas`, `ilha.postos`, `layout.mesas` e a lista de personagens recebida. Não há teto artificial de 24/40 agentes, agentes decorativos extras, squads sempre abertos ou posições compráveis. Mais agentes passam pela mesma distribuição de mesas e coworking do componente original. O mapa usa o enquadramento original e rolagem interna quando ampliado. Quantidades grandes podem exigir zoom para ler nomes.

O novo desenho tem projeção oblíqua. Os alvos de clique são projetados com a mesma transformação, inclusive durante a abertura/fechamento dos ambientes. Etiquetas e bonecos são clicáveis. Mouse e teclado continuam chamando `aoSelecionarAgente`. Se o desenhista falhar, o código tenta o renderer anterior sem reexecutar a máquina de estados do mesmo quadro.

## 4. Tarefas: execuções reais, não outro gerenciador

As duas colunas são derivadas de `agruparAgentesAtivosPorLancador(agentes)`. A atribuição é o campo operacional `dono`, conforme a função existente — não o nome, aparência ou squad.

São exibidas execuções vivas (`trabalhando` / `silencioso`) com tarefa, nome, ferramenta e seleção. Uma execução silenciosa não é marcada como concluída nem enviada ao descanso pelo painel de tarefas. Não são exibidos checkboxes de conclusão que gravem dados sem endpoint. Bia e outras origens não são descartadas: continuam nos grupos do inspetor e na cena conforme as regras originais.

## 5. Gastos e consumo: fonte e ausência de dados

O tipo `Estado` e a tela pai consultados contêm `uso_planos` (Claude/Codex, percentuais, tokens estimados e fonte/atualização), não uma série de cobranças por IA em moeda. `financeiro.despesa_mes` é despesa geral e **não** foi reutilizado como gasto de IA.

O painel mostra o uso recebido de `estado.uso_planos`. Valores não medidos aparecem como “—”, distinguindo ausência de zero. Percentuais/estimativas não são apresentados como dinheiro. Dados sem confirmação são sinalizados.

A prop opcional tem contrato explícito:

```ts
interface GastosIA {
  periodo: string
  atualizadoEm: string | null
  fonte: string
  itens: readonly {
    id: string
    nome: string
    valor: number | null
    moeda: string // ISO 4217, conforme a fonte
  }[]
}
```

Um adaptador de billing já existente pode fornecê-la sem modificar o renderer. Não foi inventado um endpoint. Exemplo de ligação, **somente quando a fonte real existir**:

```tsx
<PixelOffice
  {...propsQueJaExistem}
  gastosIA={custosReaisJaValidados}
/>
```

Não é necessário adicionar essa prop para usar o escritório novo. Sem ela, custos em dinheiro continuam não informados. Totais são separados por moeda e permanecem não informados se algum item da mesma moeda não tiver valor. Tokens nunca são convertidos em dinheiro por estimativa neste pacote. O checkbox de custos fictícios existe apenas na prévia local, não no código de produção.

## 6. Aplicação conservadora

Extraia o pacote fora do clone. A raiz do clone deve conter `web/package.json`. Não aponte o instalador diretamente para a pasta de produção.

```sh
node /caminho/ct-gold/scripts/aplicar-ct.mjs /caminho/painel_os --check
node /caminho/ct-gold/scripts/aplicar-ct.mjs /caminho/painel_os --apply
```

O aplicador verifica todos os arquivos antes de gravar. Ele aceita a cópia Windows com CRLF, mas recusa alterações de conteúdo, arquivos novos já existentes com outro conteúdo, dependências diferentes e links simbólicos nos caminhos de destino. É idempotente quando o pacote já está aplicado. Protege contra edição concorrente dos destinos entre conferir e aplicar.

O backup fica em `.git/ct-office-backups/...` (ou no diretório Git equivalente de um worktree), fora do conteúdo a versionar. O caminho é impresso. Para desfazer antes de haver edições posteriores:

```sh
node /caminho/ct-gold/scripts/aplicar-ct.mjs /caminho/painel_os --restore /caminho/do/backup
```

A reversão se recusa a apagar edições posteriores. Depois de compartilhar um commit, prefira reverter somente o commit visual pelo fluxo habitual. Nunca use reset total, force-push ou substituição da pasta inteira.

## 7. Validação executada aqui

Evidências em `QA-PREVIA.json`, `QA-SQUADS.json`, `TESTES-INSTALADOR.txt`, `PRESERVACAO.json`, `TRANSPILE.json` e `TYPESCRIPT.txt`.

- Verificação do renderer por TypeScript 5.8.3 com `strict`, `noUnusedLocals`, `noUnusedParameters`.
- Transpilação sem erro sintático dos módulos novos, componente atualizado e original.
- Montagem do **TSX atualizado** numa prévia React local com dados simulados. Não é apenas um HTML parecido.
- 75 cenários de desenho: sete fases, dia/noite, redução de movimento e progressos dos ambientes; ausência de mutação dos dados; contexto Canvas restaurado; alvos finitos; nenhum agente extra no estado vazio ou em squads não fornecidos.
- 14 testes de adaptadores: ausência/zero, números inválidos, soma por moeda, origem de tarefas, chaves compostas e silêncio preservado.
- Clique real nas 24 etiquetas; seleção por teclado/tarefa; filtro Só ativos; pausa; transições de trabalho e descanso; sinalização de sonda vencida.
- 0, 12, 24, 48 e 96 agentes simulados; coworking expandido para os agentes extras.
- 42 comparações entre as funções do TSX original e novo para materialização dos agentes e layout; mesmos resultados para as entradas simuladas.
- Larguras 320, 390, 768, 1100, 1440, 1672 e 1920, sem overflow horizontal da página. A rolagem no mapa é intencional.
- Relógio virtual: squads permanecem antes dos 3 minutos, são removidos após o tempo + transição e reabrem quando um agente volta a trabalhar.
- Dez verificações de instalador/reversão em repositório temporário: conflito, dependência divergente, CRLF, idempotência, backup e edição concorrente.

A prévia embute React 18.2 já disponível no ambiente de QA e stubs do catálogo/resolvedor, ambiente e hook da sonda. Os algoritmos principais e o desenho são os arquivos do pacote; a referência da máquina de animação usada na prévia reproduz as funções lidas do repositório, não é um arquivo de produção a ser instalado. Esses elementos de demonstração não substituem as dependências reais. As licenças da prévia estão em `preview/THIRD-PARTY-NOTICES.txt`.

Os tempos de renderer no JSON são medidas desta máquina e amostra; não são garantia de FPS no computador do usuário. A quantidade de agentes altera o custo de desenho.

## 8. Validação que o agente deve executar antes do push/deploy

Não foi executado o build completo com React 19/Vite do repositório: o clone e as dependências de produção não estavam disponíveis no ambiente local de execução. A leitura do código pelo conector GitHub e a aplicação sobre uma fixture não substituem esse build.

```sh
git diff --check
git diff -- web/src/ui/PixelOffice.tsx
cd web
npm run build
```

Inspecione também os cinco arquivos novos; `git diff` comum não mostra untracked. Execute os testes existentes do projeto pelo fluxo habitual, especialmente `escritorio-animacao.teste.ts`, `escritorio-layout.teste.ts`, `layout-ilhas-45-agentes.teste.ts`, `escritorio-hierarquia.teste.ts`, `pixel-agents.teste.ts` e `lancadores.teste.ts`. Não edite testes para esconder regressões.

Confira com dados reais: squads nunca convocados/encerrando/reabrindo, permanência e remoção por tempo, silêncio na mesa, descanso, troca de ferramenta, execução temporária, sonda indisponível/vencida, página oculta, movimento reduzido e zoom do navegador 50%–200%. Não foi feito deploy nem teste na VPS.

## 9. GitHub

A tentativa de criar a branch separada `feat/escritorio-ct-gold` recebeu `403 — Resource not accessible by integration`. Não foi criada branch, commit ou PR. A implementação foi entregue como pacote local. O agente com acesso de escrita pode aplicar, validar e enviar somente os seis arquivos de execução. Não é necessário fornecer token ou senha no chat.
