# Pixel Office RPG assets

Base visual: tiles de 16 px, exibidos em múltiplos inteiros sempre que a escala da sala permite. O Canvas usa `imageSmoothingEnabled = false`, coordenadas lógicas inteiras e DPR limitado a 2 pelo controlador existente.

Paleta:

| Papel | Cor |
| --- | --- |
| Vazio | `#081013` |
| Contorno | `#101820` |
| Teal profundo | `#173f3f` |
| Teal musgo | `#2d5a4f` |
| Madeira | `#9a6238` |
| Ouro | `#e1b657` |
| Creme | `#f3e3b1` |
| Folhagem | `#5b8c55` |

`environment-atlas.png` foi gerado como uma grade 3 por 2. Contém piso, parede, mesa, cadeira, divisória e planta. O renderer recorta as regiões opacas de cada célula.

`character-walk-4dir.png` foi gerado como uma grade 3 por 4. As linhas são baixo, esquerda, direita e cima. Cada direção possui três quadros de caminhada.

Limitação atual: a folha não possui poses próprias para sentar ou digitar. Na mesa, o renderer usa o quadro parado voltado para cima e preserva o deslocamento e as transições da máquina de estados existente.

## Robôs dos agentes de IA (12/10/2026)

Pedido do Gastão: os agentes de IA do painel (não os humanos: Luana, Renato, Bia,
Gastão continuam com `character-walk-4dir.png`) precisam virar ROBÔS visualmente
distintos, no estilo exato do vídeo de referência do concorrente
(@agencialetsgoup, escritório de advocacia com IA), não no 8-bit pixel art que
o resto do office usa hoje. Correção do próprio Gastão no meio da tarefa: "eu
pedi igual ao vídeo, qual é a dificuldade pra entender isso" — o estilo real do
vídeo é CARTOON FLAT 2.5D liso (tipo jogo mobile de gerenciamento/tycoon,
robôs arredondados tipo cápsula estilo Among Us), não pixel art.

### Arquivos gerados

8 PNGs, fundo transparente, 512px de altura (largura proporcional, ~400px):

| Arquivo | Variação | Base HEX |
| --- | --- | --- |
| `robot-azul-frente.png` / `robot-azul-costas.png` | Azul | `#3A86FF` |
| `robot-violeta-frente.png` / `robot-violeta-costas.png` | Violeta | `#8B5CF6` |
| `robot-verde-frente.png` / `robot-verde-costas.png` | Verde-esmeralda | `#2DBE8C` |
| `robot-marfim-frente.png` / `robot-marfim-costas.png` | Marfim/dourado (combina com a paleta do office: `cream` + `gold`) | `#F3E3B1` + trim `#e1b657` |

Todos: corpo cápsula arredondado tipo "Among Us" sem pernas visíveis (a base
arredonda sozinha), cabeça-domo fundida ao corpo, visor escuro com um
"olho" em pílula brilhante ciano (mesma cor de brilho em todas as variações,
só o corpo muda de cor), antena com ponta luminosa no topo, painel branco no
peito com gravata escura e crachá quadrado na cor da variação (vista de
frente), e costas lisas sem rosto com uma luz de status + duas ranhuras de
indicador (vista de costas, que é a pose predominante: a maioria dos
agentes passa o tempo sentada "trabalhando/silenciosa", e o código do office
(`drawCharacter` em `PixelOffice.rpg.ts`) usa a direção `up` = costas pra
esses dois estados).

### Como foram gerados

MCP/OpenRouter do skill `banana` estavam com as duas chaves salvas
(`~/.banana/.env` e `/opt/gastaomatos/luana/.env.openrouter`) expiradas/
inválidas (HTTP 401) no momento desta tarefa. Fallback usado: o `image_gen`
nativo do Codex, via `bash codex_mecanico.sh --rede --pode-editar <pasta> "<prompt>" <pasta>`
(mesmo caminho documentado em `memoria/ferramentas.md` da Luana para geração
de imagem). Fundo pedido em magenta sólido `#FF00FF` pra chroma key
confiável; removido e recortado com Pillow puro (sem ImageMagick, que não
está instalado neste servidor) — script usado em
`/tmp/.../scratchpad/robots/process.py` (scratchpad de sessão, não
versionado; reproduzir o chroma-key é trivial com Pillow se precisar
regenerar: distância euclidiana ao magenta com feather na borda).

### Comparação com a referência

Comparativo lado a lado (frame real do vídeo x as 4 variações) ficou salvo em
`/tmp/claude-1001/-opt-gastaomatos-luana/ae99121c-2838-4bcf-92f9-fb8e6ef58d3f/scratchpad/robots/comparativo_referencia.png`
(scratchpad de sessão, pode não sobreviver — refazer é rápido se precisar).
Avaliação: acerta o essencial do pedido (cartoon flat liso, não pixelado,
corpo cápsula tipo Among Us, cores vivas variadas, visor com olho
brilhante, acabamento toy/clay glossy). Diferença honesta: o robô da
referência tem proporção um pouco mais "chibi humanoide" (corpo mais curto,
pernas pequenas visíveis por baixo da mesa); o nosso é uma cápsula mais
alongada sem pernas. Na prática isso tende a não aparecer, porque o agente
passa a maior parte do tempo sentado atrás da mesa (pernas ficariam
escondidas de qualquer forma), mas registro a diferença caso alguém queira
pedir uma rodada de ajuste fino de proporção depois.

### Limitação atual / o que falta (fora do escopo desta tarefa)

Só os PNGs estáticos frente/costas foram gerados e julgados. NÃO existe
ainda: visão lateral (esquerda/direita) nem atlas de caminhada com 3 quadros
por direção no mesmo formato de `character-walk-4dir.png` (grade 3x4,
1254x1254). Isso é trabalho de código (`.ts`/`.tsx`) pra outro agente, que
decide como mapear essas imagens estáticas no sistema de `drawCharacter` /
`variedCharacterSprite` — sugestão: como os robôs são cores sólidas
geradas por variação (não por tint dinâmico como os humanos), cada agente
de IA deveria SORTEAR uma das 4 variações pela mesma lógica de hash estável
que já existe pro resto do visual (ex. `stableHash` sobre a chave do
agente), em vez de tingir uma única folha-base.

**Aviso técnico importante pra quem for integrar:** o renderer dos humanos
usa `ctx.imageSmoothingEnabled = false` de propósito, porque
`character-walk-4dir.png` é pixel art (precisa de upscale em blocos, sem
suavização). Essas imagens dos robôs NÃO são pixel art, são ilustração
cartoon lisa com gradiente e sombra suave — desenhar com
`imageSmoothingEnabled = false` vai serrilhar a arte e destruir a
qualidade. Quem integrar precisa ligar a suavização (ou usar um contexto
2D separado) só pro desenho dos robôs, mantendo `false` só pros sprites de
humanos.
