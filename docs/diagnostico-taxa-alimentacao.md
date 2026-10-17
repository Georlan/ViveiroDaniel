# Diagnóstico de taxa de alimentação e sobrevivência estimada

## Evidências (Fazenda DJ)

A tabela fotográfica `Grama → % Biomassa` contém **taxas de alimentação**, não taxas de sobrevivência. A fórmula reconstruída do relatório zootécnico V01 (página 2) é:

- biomassa estimada = ração por dia / (taxa / 100)
- biomassa máxima teórica = população inicial × peso médio (g) / 1000
- sobrevivência inferida = biomassa estimada / biomassa máxima teórica × 100
- ração acumulada é outra entrada, usada no FCA, e não determina a sobrevivência diretamente.

No relatório original, as taxas de alimentação das seis biometrias V01 diferem das taxas da foto pelo peso mais próximo:

| Peso (g) | Taxa usada no relatório | Referência por peso | Ração diária (kg) | Sobrevivência estimada no relatório |
| ---: | ---: | ---: | ---: | ---: |
| 3,5 | 5,0% | 4,5% | 17 | 65% |
| 3,6 | 5,0% | 4,1% | 22 | 81% |
| 4,9 | 4,5% | 3,6% | 22 | 67% |
| 5,5 | 4,0% | 3,6% | 20 | 61% |
| 7,1 | 3,5% | 3,1% | 18 | 48% |
| 9,1 | 3,5% | 2,8% | 15 | 31% |

Exemplo: aos 3,6 g, 150.000 camarões e 22 kg/dia, utilizar 5% resulta em 81,48% de sobrevivência estimada. Substituir a taxa por 4,1% da foto altera a mesma inferência para 99,37% **sem modificar nenhum camarão ou medição**.

## Incompatibilidade observada no viveiro atual

O operador confirmou 32 kg de ração diária e a população inicial utilizada no cadastro é de **220.000**, sem contabilizar bônus na aplicação. A captura da biometria mostra 3,14 g e ração acumulada 382 kg.

- Taxa pelo peso mais próximo (3 g): **4,5%**
- Biomassa máxima teórica: 220.000 × 3,14 / 1000 = **690,8 kg**
- Ração diária correspondente a 100% *nessa hipótese*: 690,8 × 0,045 = **31,086 kg**
- Diferença frente aos 32 kg/dia informados: **0,914 kg/dia**
- Inversão da taxa gera biomassa 711,11 kg e inferência 102,94%.

**102,94% não é uma sobrevivência real e não prova erro na biometria.** É uma incompatibilidade entre ração diária observada e uma taxa de referência aproximada assumida como exata. Não existe evidência suficiente para determinar a taxa efetiva, a biomassa real ou a mortalidade a partir desses dados isoladamente.

Não alterar automaticamente a taxa para ~4,64%, reduzir ração diária, modificar a população inicial ou truncar sobrevivência em 100%. Essas ações esconderiam a incompatibilidade sem validarem o manejo.

## Comportamento correto do produto

- Aceitar normalmente os dados palpáveis/observados, mantendo o histórico de biometria, peso e ração acumulada.
- Distinguir claramente taxa **sugerida por tabela** de taxa efetiva/confirmada pelo operador.
- Tratar a inferência de sobrevivência como dependente da hipótese sobre taxa e biomassa; não como medição.
- Quando a estimativa exceder o limite teórico, ocultar biomassa, sobrevivência e FCA como indicadores válidos, mostrando a diferença em **kg de ração por dia** e explicando a hipótese.
- Não bloquear o registro nem sugerir alterações arbitrárias no manejo.
- Manter população de 220.000 como informado, sem acrescentar bônus.
- Histórico auditável de alterações de entrada no D1 (a partir da implantação da funcionalidade, não retroativo).

A tabela fotográfica é apenas uma referência de alimentação por peso; o relatório V01 utiliza taxas operacionalmente distintas. A ausência de sobrevivências superiores a 100% nas seis linhas originais **não é uma garantia matemática** para outros valores de ração, peso e população.
