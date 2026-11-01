# Viveiro Daniel

Aplicativo mobile-first para registrar amostras, ração, aplicações de produtos e transferências entre viveiros de camarão. A interface distingue registros, diferenças calculadas e simulações dependentes de hipóteses.

## Biometria e evolução

A pesagem tem duas etapas: data e amostra; depois ração e revisão. O operador informa peso total em gramas, quantidade de camarões, ração fornecida no dia e total fornecido desde a biometria anterior (ou povoamento na primeira).

- Peso médio: peso total da amostra / quantidade amostrada.
- Variação: peso médio atual − anterior.
- Intervalo: diferença real entre datas, em dias, sem adicionar 1.
- Variação diária: diferença de peso / dias do intervalo.
- Equivalente semanal: variação diária × 7; não é projeção futura.
- Na primeira pesagem ou entre datas iguais não há crescimento calculado.
- Dia de cultivo: data da biometria − povoamento + 1, por convenção inclusiva.
- Densidade cadastral: saldo de animais / área em m². O saldo inclui transferências e não desconta mortalidade não registrada.

O gráfico usa o tempo real entre as datas e apenas pontos medidos. O operador seleciona um intervalo e compara peso antes/depois, ritmo normalizado, ração diária e total do período. Transferências na janela são sinalizadas porque podem mudar a composição das amostras.

O total de ração do período inclui o dia da biometria. Não pode ser menor que a ração registrada para aquele dia. A leitura preserva acumulados e totais originais para expor contradições. Ao salvar uma edição, `normalizeBiometryInputs` recompõe explicitamente a cadeia a partir dos períodos registrados, respeitando âncoras de acumulado nos registros antigos.

## Taxa alimentar e simulação

Espécie, sistema, ração e origem técnica da tabela ainda não foram confirmados. Novas pesagens não recebem taxa alimentar automática. É possível salvar sem taxa; ao editar, taxas anteriores permanecem explícitas e podem ser retiradas ou revisadas.

A fotografia recebida em 01/11/2026 foi transcrita em `src/data/feedReference.ts`, mantendo pesos repetidos e valores "ideais" fora do mínimo/máximo. A consulta identifica esses conflitos; não interpola, extrapola ou recomenda percentuais.

Se houver taxa informada e ração diária positiva, uma seção própria permite simular:

- Referência com todo o saldo cadastral: `(saldo × peso médio em g / 1.000) × (taxa % / 100)` em kg/dia.
- Biomassa inferida da ração: `ração diária / (taxa % / 100)` em kg.
- Percentual equivalente do saldo: `biomassa inferida / (saldo × peso médio / 1.000) × 100`.

Esses resultados não medem estoque vivo nem demonstram mortalidade. Percentuais acima de 100% são uma hipótese incompatível com os registros, não sobrevivência real e não são limitados artificialmente a 100%. Um dia sem ração não é convertido em estoque zero. Alterar a taxa altera a base da simulação.

O FCA não é validado a partir de biomassa inferida da mesma ração. É necessário ganho independente de biomassa e contabilização das entradas e saídas no mesmo período. A razão antiga `ração acumulada / biomassa inferida` permanece apenas como `feedToStandingBiomassRatio`, para reconciliar a aritmética do relatório; `fca` fica indisponível.

## Evidência e testes

O PDF fornecido tem seis linhas preenchidas do V01. Elas sustentam testes de reprodução dos valores de entrada e da aritmética histórica; não validam biologicamente as estimativas. No intervalo final: 857 − 788 = 69 kg e 9,1 − 7,1 = 2 g em sete dias. Já 3,6 → 4,9 g em onze dias equivale a 0,11818 g/dia ou 0,82727 g por sete dias.

Método e limitações: `docs/design/biometry-evolution.md`.
Pesquisa e fontes: `docs/research/2026-11-01-calculation-research-start.md`.
Transferências e saldo: `docs/transferencias.md`.

Fontes primárias consultadas:

- [FAO: alimentação, biomassa e amostragem](https://www.fao.org/4/s4314e/s4314e09.htm).
- [aquacultuR: métricas de crescimento](https://github.com/TellAnAx/aquacultuR/blob/cran/R/growth.R) e [conversão alimentar](https://github.com/TellAnAx/aquacultuR/blob/cran/R/feed_conversion.R), como comparação metodológica. Implementação independente, sem incorporação de código GPL.
- [Embrapa, Documentos 44, 2021](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1132637/1/doc44-2021.pdf), como referência de manejo. A expressão de sobrevivência da p. 33 contém inconsistência e não foi usada como regra do app.

## Rodar e conferir

Node.js 20+:

    npm install
    npm run dev
    npm test
    npm run build

O build estático fica em `dist/`. Em desenvolvimento, `/?demo=2` abre uma demonstração isolada, apenas em memória, com as seis biometrias históricas do PDF no V01 e um V02 fictício. Recarregar restaura a demonstração. Os dados da demonstração não são usados como base persistida nem sincronizados e não entram no bundle de produção.

## Persistência e atualização no Cloudflare Pages

Projeto estático e gratuito: React/Vite no frontend, sem servidor, Functions, banco D1, login ou sincronização remota. Build `npm run build`, saída `dist`, Node.js 20+. Não exige variável de ambiente nem binding. A branch de produção é `main`.

Os registros ficam no localStorage de cada navegador. A versão atual lê as chaves v1/v2/v3, guarda os bytes originais em `viveiro-daniel:before-v4` e cria a base v4. Preserva todos os IDs, inclusive V01/V02, biometrias, movimentos, produtos e metadados. Não altera população ou ração por suposição e não insere dados de exemplo em uma instalação nova. As chaves antigas permanecem guardadas. Uma falha de leitura ou gravação é exibida e não substitui registros por exemplos.

Para atualizar um aparelho em uso, abrir/recarregar **o mesmo endereço HTTPS no mesmo navegador**, sem limpar os dados do site. Outro domínio, preview, navegador ou aparelho usa armazenamento diferente. Não há sincronização automática entre celulares.

Em **Backup e troca de aparelho** é possível exportar JSON, importar um arquivo com prévia e confirmação de substituição e exportar as cópias originais para recuperação assistida. Uma cópia do estado anterior é guardada antes de salvar. Mantenha um arquivo fora do navegador: limpeza, desinstalação e perda do celular podem remover os dados locais. A atualização não recupera registros que versões anteriores já apagaram; pode haver cópias antigas nas chaves preservadas.

Uma alteração salva em outra aba impede sobrescrita silenciosa: recarregue antes de continuar. Essa proteção é local e não substitui controle transacional entre dispositivos.

Detalhes: [atualização e backups](docs/cloudflare-sync.md).

As gravações da versão nova usam Web Locks para serializar abas quando o navegador oferece essa API. Sem ela, permanece a detecção de versão desatualizada, sem garantia contra duas gravações exatamente simultâneas.
