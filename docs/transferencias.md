# Transferência entre viveiros

O registro de transferência cria uma saída no viveiro de origem e uma entrada no destino, com o mesmo identificador e a mesma data. A população de controle em uma data é a população inicial somada às entradas e subtraída das saídas ocorridas até aquela data. As biometrias anteriores à transferência continuam usando a população que existia na data de cada medição.

A biomassa movimentada é estimada por `quantidade transferida × peso médio (g) ÷ 1.000.000`, em kg. O peso sugerido vem da última biometria da origem e pode ser ajustado para representar o lote transferido. O registro não altera o peso amostrado do destino; uma nova biometria é necessária para medir a mistura real.

O saldo de animais é um livro de movimentações baseado na população cadastrada. Ele não desconta mortalidade não registrada e, portanto, não substitui uma contagem ou estimativa de sobrevivência. A biomassa transferida também é uma estimativa baseada no peso médio informado.

Indicadores derivados de ração e taxa de alimentação só são mostrados quando não ultrapassam a biomassa máxima teórica da população de controle. Se os dados não forem compatíveis, o app preserva as entradas e mostra a diferença de ração diária frente à referência de 100%, sem tratar a sobrevivência calculada acima de 100% como válida.

## Conferência do saldo e correção de população inicial

O campo **População inicial (sem transferências)** representa apenas os animais
efetivamente povoado(s) nesse viveiro, antes das movimentações. Se um viveiro foi
abastecido inteiramente por uma transferência registrada, esse valor deve ser
**zero**, e a entrada de transferência determina seu saldo. Uma entrada de
78.000 animais para um viveiro de 5.000 m² dá 15,6 animais/m².

A interface discrimina população inicial, entradas e saídas e oferece edição
explícita para zerar a população inicial quando houver entradas. Essa ação
**não é automática**: a coincidência entre os dois números não prova que são
duplicados. Se já foram cadastrados 78.000 como iniciais *e* mais 78.000
como transferência, o saldo será 156.000 até que o operador revise a entrada.
O histórico original das movimentações permanece intacto.

Registros com mesmo `transferId` e direção repetidos dentro de um viveiro
não são contados duas vezes no saldo. A proteção contra envios duplicados
também se aplica ao botão de registrar transferência.

## FCA após movimentações

Sem a distribuição do consumo de ração entre lotes ou medição confiável de
biomassa na movimentação, `ração acumulada / biomassa atual` não fornece
um FCA interpretável após transferências. O aplicativo mantém os dados medidos
e as estimativas plausíveis de biomassa e sobrevivência sob a hipótese da
taxa informada, mas mostra o FCA como indisponível após a primeira
transferência na data da biometria. Não atribuir automaticamente um FCA
artificial a animais recebidos de outro viveiro.
