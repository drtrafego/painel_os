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
