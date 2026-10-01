# CASAL DO TRÁFEGO — escritório CT Gold

**Este pacote contém os arquivos de implementação completos. Não é um prompt para gerar o escritório, nem uma imagem de fundo.**

Abra `PREVIA-CT-ANIMADA.html` no navegador para experimentar a interface. A faixa “PRÉVIA LOCAL” identifica os dados fictícios. Os controles extras de 0/12/24/48/96 agentes, troca de estados e custos fictícios pertencem apenas à demonstração; não entram no painel real.

## Para o agente que vai aplicar

Leia `PARA-O-AGENTE.txt`. Os seis arquivos finais estão em `web/src`, com os caminhos do repositório `drtrafego/painel_os`. `PixelOffice.tsx` já está integrado: não precisa montar o componente, trocar a tela pai ou inventar endpoints.

Aplique numa cópia Git, preservando mudanças locais:

```sh
node /caminho/ct-gold/scripts/aplicar-ct.mjs /caminho/painel_os --check
node /caminho/ct-gold/scripts/aplicar-ct.mjs /caminho/painel_os --apply
```

No Windows, os mesmos comandos funcionam com caminhos entre aspas:

```powershell
node "C:\pacotes\ct-gold\scripts\aplicar-ct.mjs" "C:\projetos\painel_os" --check
node "C:\pacotes\ct-gold\scripts\aplicar-ct.mjs" "C:\projetos\painel_os" --apply
```

O aplicador confere o conteúdo-base de `PixelOffice.tsx`, as dependências e a integridade dos arquivos. Caso haja uma versão mais nova/divergente, ele para, em vez de sobrescrever o trabalho. Há backup e reversão protegida. O aplicador não faz commit, push, SSH, instalação de pacote ou deploy. Ele usa apenas uma consulta Git local para localizar o diretório de backup.

## Resultado

Identidade CT e logo enviada; tema carvão/amarelo; painéis de gastos/consumo e tarefas Renato/Luana; sala dinâmica em perspectiva; personagens procedurais arredondados e animados; mesas e descanso fornecidos pela lógica existente; seleção por personagem/etiqueta/tarefa e teclado; filtro, pausa, zoom, inspetor e agrupamento por lançador.

O cenário é **2.5D em Canvas 2D**, com perspectiva e sombreamento, não uma cena WebGL com modelos 3D idênticos à imagem conceitual. Não usa a imagem gerada como fundo. Não adiciona bibliotecas ou fontes.

## Dois pontos importantes

**Gastos reais:** o contrato atual recebido pelo escritório tem uso de planos/tokens, mas não faturamento por IA. Em produção, o gasto monetário fica “—” até receber a prop opcional `gastosIA` de uma fonte real. O código não inventa cifras, não converte tokens em dinheiro e não usa despesas gerais como gasto de IA. A demonstração permite ligar valores FICTÍCIOS para visualizar esse estado.

**Validação:** o pacote passou pelas verificações locais descritas em `docs/INTEGRACAO-CT.md` e `docs/QA-PREVIA.json`. Ainda é necessário executar o build React 19/Vite e os testes do repositório no ambiente com as dependências do projeto. O GitHub e o servidor não foram modificados.
