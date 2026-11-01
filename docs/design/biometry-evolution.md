# Biometrias: comparação e validade dos indicadores

## Objetivo

Mostrar ao operador o que mudou, durante quantos dias e com quais limitações. O usuário liberou reorganizar a apresentação e informou que não conhece espécie, sistema e procedência da tabela alimentar. Não há autorização técnica para uma recomendação de arraçoamento específica.

## Evidências recebidas

O PDF tem seis linhas preenchidas do V01, de 13/06 a 22/07/2026, população inicial 150.000. O V02 contém planejamento sem biometrias medidas; zeros e #VALOR! não serão importados como medições. O cabeçalho diz 74 dias, enquanto a última linha diz 75: a convenção inclusiva de dias do cultivo será explicitada; intervalos entre medições usam diferença real de datas, sem +1.

A coluna chamada crescimento semanal é diferença bruta, mesmo nos intervalos de 11, 8 e 6 dias. O campo crescimento médio divide peso por idade e presume massa inicial nula. Ambos deixam de ser os indicadores apresentados de evolução. O núcleo novo usa Δpeso / Δdias e equivalente em sete dias.

A fotografia alimentar repete 1 g em três linhas; em 1, 2, 3, 6 e 18 g há linhas cujo "ideal" fica fora da faixa. A transcrição será preservada, com validação e sem uso automático. O exemplo de planilha 220.000 × 3,15 g × 4,5% dá 31,185 kg/dia; 32 kg/dia implica 102,934% sob essa hipótese. Não é prova de sobrevivência >100% nem mortalidade.

## Implementação

- Núcleo de evolução separado da reconstrução histórica das fórmulas do relatório. Dados originais e acumulados não são migrados silenciosamente.
- Gráfico de peso com eixo temporal real, sem projeção, com seleção acessível dos intervalos entre biometrias. Peso, kg de ração e percentuais não compartilham um mesmo eixo.
- Comparação antes/depois, ganho observado no intervalo, g/dia e equivalente semanal. Na primeira biometria, crescimento indisponível. Datas repetidas/inválidas não geram divisão por zero ou valores inventados. Redução do peso amostral recebe descrição neutra.
- Mudanças de composição por transferências são sinalizadas; a variação de médias não prova crescimento do mesmo lote. Faixas de confiança não podem ser inferidas de uma pesagem agrupada sem distribuição individual.
- Ração diária antes/depois e total fornecido no intervalo. O total acumulado não é tratado como consumo medido nem extrapolado para os dias ausentes.
- Simulação pela ração em seção própria, com taxa e hipótese explícitas. Sem taxa ou ração zero não se infere estoque zero. Resultados >100% não são validados nem limitados artificialmente a 100%. Alteração da taxa impede interpretação simples do delta de biomassa como mudança real.
- FCA não é mostrado como eficiência validada a partir de biomassa inferida da própria ração. Falta biomassa independente, delimitação de período e contabilização de fluxos. Preserva-se reconstrução numérica do relatório para conferência, nunca como recomendação atual.
- Novas pesagens deixam de receber taxa automática da tabela interna sem procedência. Taxas existentes permanecem explícitas ao editar. A foto nova é consulta, sem interpolação, extrapolação ou botão de recomendação.
- Prévia local usa o histórico efetivamente preenchido do PDF e um viveiro fictício vazio, sem importar sobre a base persistida.

## Fontes e teste

FAO https://www.fao.org/4/s4314e/s4314e09.htm, seções 8.1 e 8.3: taxa depende de contexto, peso e estoque e a amostragem é uma fonte de viés. aquacultuR, commit 9ea0a43842f8ea770486524c1be181ffea7242d3, R/growth.R e R/feed_conversion.R, leitura comparativa de métricas, sem copiar código GPL. A implementação independente usa identidades matemáticas e testes de unidades.

Regressões: seis medidas do PDF; 3,6→4,9 g em 11 dias = 0,11818 g/dia e 0,82727 g/7 dias; 7,1→9,1 g em sete dias e 69 kg de ração no período; primeiro registro; data repetida; peso negativo; ração zero; foto com pesos repetidos/ideal fora da faixa; 103% não validado; transferência no intervalo; preservação de taxa histórica.


## Validação da implementação

60 testes aprovados. O cálculo do histórico agora usa intervalos reais também em seus campos derivados; crescimento inicial e FCA sem base independente são `null`. O índice antigo do relatório foi renomeado para `feedToStandingBiomassRatio`, com uso restrito à reconciliação. A leitura mantém os acumulados originais, inclusive contraditórios, e os avisos de conflito são testados através do componente renderizado. Diferenças não comparáveis aparecem como indisponíveis no histórico.

Revisão independente: duas observações corrigidas e reconferidas (acumulado reconstruído antes de validar; nulo apresentado como zero). Teste no navegador: troca entre intervalos de 7 e 11 dias, edição histórica retirando taxa, primeira biometria com ração zero sem estimativa de estoque, consulta às 21 linhas da foto e revisão em 320/375 px sem transbordamento horizontal nas telas verificadas. Não houve importação na base persistida nem validação em operação física.
