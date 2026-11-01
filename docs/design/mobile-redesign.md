# Viveiro Daniel — interface para uso em campo

A lista deve responder onde entrar e o que foi medido. A tela interna deve facilitar uma nova pesagem, revisar o crescimento e acessar transferências e produtos. Cadastro e cálculos auxiliares aparecem sob demanda.

## Direção

Ubuntu Sans local, com números tabulares. Títulos 28–36 px, valores 28–40 px, corpo 16 px e apoio 14 px. Fundo mineral #edf3f2, superfícies #ffffff, tinta #142f32, ação #145a4e, área ilustrada #e1eddf e alerta #81520e. Botões sólidos com borda inferior e sombra curta; foco visível. A cor indica função e estado, com texto acompanhando.

Lista em coluna: título → viveiros com desenho vetorial e leitura → botão de cadastro. Detalhe: identificação e ciclo → última pesagem → ações → histórico → cadastro. Formulário de pesagem em duas etapas, amostra e ração, com retorno preservando os campos e revisão antes de salvar.

Os SVGs próprios mostram viveiro e balança. São ilustrações, sem representar instalações reais. A imagem raster decorativa anterior deixa de ser usada. A hierarquia usa áreas claras e escuras, proximidade e escala, evitando repetir molduras de mesmo peso para cada valor.

Os cálculos e o contrato de sincronização permanecem no domínio existente. A prévia de dois viveiros é isolada e inclui um histórico fictício para avaliar a interface preenchida e um viveiro sem pesagens para avaliar o primeiro uso.

## Verificação

39 testes automatizados e build de produção aprovados. No navegador, a demonstração foi exercitada para salvar pesagem, voltar preservando campos, bloquear ração do período menor que a diária, transferir entre dois viveiros e registrar produto. Revisão de largura em 320 e 375 px, com formulário em coluna única e sem transbordamento horizontal nas telas verificadas.

O teste de transferência revelou uma conversão anterior incorreta de gramas para kg (divisão por 1.000.000). A fórmula foi movida para o domínio e corrigida para divisão por 1.000, com regressão para 1.000 animais de 10 g = 10 kg. Nenhum dado persistido foi migrado. O dia do cultivo na visão atual passou a usar a mesma contagem inclusiva das biometrias.
