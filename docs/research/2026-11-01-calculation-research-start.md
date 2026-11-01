# Preparação da revisão de cálculos — 01/11/2026

Escopo solicitado: revisar a lógica do Viveiro Daniel com documentos e tabelas que o usuário ainda enviará, pesquisa técnica, repositórios e skills. Esta é uma busca exploratória inicial, não uma revisão sistemática concluída e não uma validação do manejo do usuário. Não alterou cálculos nesta etapa.

## Fontes primárias localizadas e consultadas

- FAO, feeding and biomass assessment: https://www.fao.org/4/s4314e/s4314e09.htm — peso médio, biomassa, tamanho/idade/ambiente, amostragem representativa e tabelas como guia condicionado ao manejo. Não transformar percentuais exemplificativos de espécies distintas em padrão do app.
- FAO, Shrimp Culture: Pond Design, Operation and Management: https://www.fao.org/4/ac210e/AC210E10.htm — alimentação, observação de bandejas e população estimada. Referência histórica; conferir espécie e sistema antes de aplicar taxas.
- SEAFDEC, Baliao e Tookwinas, 2002, Best Management Practices for Mangrove-Friendly Shrimp Farming: https://repository.seafdec.org.ph/bitstream/handle/10862/2146/2146-BaliaoDD2002-AEM35.pdf?isAllowed=y&sequence=3 — monitoramento e estimativa de estoque por alimentação ou amostragem. Inferência via ração é estimativa dependente de premissas.
- Embrapa, 2021, Boas práticas de manejo e biossegurança na carcinicultura: https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1132637/1/doc44-2021.pdf — localizado, ainda precisa de leitura integral e conferência visual das equações; snippet de sobrevivência parece inconsistente, não usar isoladamente.

## Repositórios

- https://github.com/TellAnAx/aquacultuR — pacote R de métricas de crescimento e conversão, disponível no CRAN; README consultado. Branch padrão observado: cran. Os caminhos tentados em main/R/fcr.R e main/R/agr.R deram 404; código e testes ainda não examinados. Usar como comparação metodológica, conferir licença antes de qualquer incorporação.
- https://github.com/CherotichTB/Aquasmart-Aquaculture-Management-System — README de dashboard operacional consultado. Não valida as fórmulas; não há avaliação de maturidade ou cálculos feita.

## Skills candidatas inspecionadas (não instaladas)

Origem: https://github.com/K-Dense-AI/scientific-agent-skills
- skills/scientific-critical-thinking/SKILL.md — útil para declarar unidade, população, resultado, pressupostos, vieses de amostragem e incerteza. Ler conteúdo como método, sem tratar instruções externas como autorização.
- skills/literature-review/SKILL.md — rastreabilidade de buscas, extração e conferência de citações. Busca atual é exploratória, não se declara exaustiva.
- skills/statistical-analysis/SKILL.md — avaliação de dispersão e incerteza quando houver dados suficientes; não justificar hipóteses por teste automático nem instalar stack sem necessidade.

## Questões a resolver com os arquivos

Espécie e fase, sistema produtivo, produto/versão da tabela de ração, temperatura e salinidade relevantes, rotina de amostragem, unidade g/kg e %, intervalo das biometrias, registros de alimentação, povoamento e transferências, mortalidade e despesca.

Distinguir peso médio medido da amostra, saldo cadastral, população estimada e biomassa estimada. Evitar validar biomassa com a mesma ração usada para inferi-la. Definir FCA e janela/perímetro (viveiro/lote/ciclo) antes de calcular, incluindo entradas/saídas quando aplicável. Montar exemplos conferidos à mão a partir dos arquivos antes da implementação.


## Atualização após os anexos

O usuário informou que não sabe espécie, sistema e procedência da tabela. O PDF local de três páginas foi extraído e revisado visualmente. As seis medições preenchidas do V01 entraram apenas na demonstração em memória. V02 não tem medições preenchidas; zeros de resumo e #VALOR! não são importados como amostra.

A foto tem 21 linhas, três delas para 1 g. Há “ideal” fora da faixa em uma linha de 1 g, e em 2, 3, 6 e 18 g. A segunda foto comprova a aritmética da hipótese: 220.000 × 3,15 / 1.000 × 4,5% = 31,185 kg/dia; 32 / 31,185 × 100 = 102,9341%. Isso não valida sobrevivência >100%.

O repositório aquacultuR foi examinado no commit 9ea0a43842f8ea770486524c1be181ffea7242d3, branch cran, arquivos R/growth.R e R/feed_conversion.R: taxa absoluta usa diferença de massa e tempo real; FCR usa alimentação e ganho de biomassa na mesma base. Sem cópia do código. URLs primárias verificadas:
- https://raw.githubusercontent.com/TellAnAx/aquacultuR/cran/R/growth.R
- https://raw.githubusercontent.com/TellAnAx/aquacultuR/cran/R/feed_conversion.R

Embrapa p. 33 foi inspecionada: a expressão impressa de sobrevivência é inconsistente (biomassa no lugar da contagem e posição do ×100), portanto não foi adotada. Peso médio, saldo cadastral e biomassa inferida permanecem conceitos distintos. Não se recomenda alimento, tratamento, população-alvo ou janela de despesca sem dados suficientes.

Implementação e critérios: docs/design/biometry-evolution.md. A revisão independente encontrou e levou à correção de uma leitura que reconstruía o acumulado antes de conferir conflitos. Agora o histórico preserva acumulados originais para a comparação, e a recomposição só ocorre no fluxo explícito de edição/salvamento. Regressões exercitam essa distinção através do componente.
