# Revisão dos relatos do operador — 01/11/2026

Os dois áudios enviados foram transcritos localmente. O primeiro esclarece que 78.000 animais em 5.000 m² devem resultar em 15,6 animais/m². O segundo solicita revisão das estimativas, da taxa de alimentação e da biomassa. As capturas antigas são evidência dos problemas relatados, não comprovação do estado atual dos dados reais.

## Comportamentos implementados

- Alternância entre comparação de intervalos e lista completa, incluindo a última biometria e todos os registros anteriores.
- Densidade cadastral na entrada do viveiro e em cada biometria, usando o saldo na data correspondente. Não equivale a contagem de sobreviventes.
- Cadastro distingue povoamento direto de recebimento por transferência. No segundo caso, a população inicial própria é zero; o saldo vem das movimentações.
- Destino com saldo existente exige confirmação de que são animais adicionais. Cadastro com população inicial e entradas apresenta a composição do saldo e acesso à revisão.
- PL/g aceita decimais e preserva 3,39 na exibição.
- Ração diária maior que o total do período bloqueia novo salvamento. A troca dos campos depende da ação explícita “Inverter valores”. Dados históricos conflitantes permanecem visíveis, sinalizados para revisão.
- Inferência pela ração permanece condicional. Resultado acima de 100% não é exibido como sobrevivência válida, e FCA exige ganho de biomassa independente.

## Evidência de verificação

65 testes automatizados passaram, incluindo cinco regressões específicas destes relatos; compilação de produção e verificação de espaços do diff passaram. Revisão de código focada não encontrou problema bloqueante.

No navegador local de demonstração: cadastro por transferência com inicial zero, área 5.000 m² e entrada de 78.000 produziu 15,6 animais/m²; PL/g 3,39 foi salvo e exibido. O caso 152 kg/dia e 25 kg acumulados foi bloqueado; “Inverter valores” produziu 25 e 152 respectivamente. A lista mostrou seis registros e não apresentou rolagem horizontal a 320 px. Inspeção visual adicional a 375 px.

As verificações não comprovam os dados reais do operador, sincronização de produção ou uso em aparelho físico. Cadastros antigos com dupla entrada precisam de revisão explícita da população inicial. Não há correção automática baseada em suposição.
