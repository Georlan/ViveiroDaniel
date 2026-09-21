# Viveiro Daniel

Aplicativo web **mobile-first** para controle zootécnico simples de viveiros de camarão.

A regra do produto é simples: a pessoa informa somente dados fáceis de observar no campo e o aplicativo calcula o restante quando a relação está sustentada pelos registros analisados.

## Fluxo de biometria

Nos novos registros o modo simples pede:

- data da biometria;
- peso total da amostra em gramas;
- quantidade de camarões pesados;
- ração usada por dia no momento da biometria;
- ração fornecida desde a biometria anterior, ou desde o povoamento na primeira biometria.

O aplicativo calcula automaticamente:

- peso médio = peso da amostra / quantidade;
- crescimento em relação à biometria anterior;
- ração acumulada = acumulado anterior + ração informada para o período;
- ração p/100%;
- sobrevivência estimada;
- biomassa;
- FCA;
- crescimento médio.

### Taxa de alimentação

A taxa ainda não possui uma regra matemática confirmada pelo material disponível.

Para facilitar o uso, o app sugere a taxa correspondente ao ponto de peso mais próximo observado no histórico real do V01. Essa sugestão é apresentada explicitamente como **estimativa** e pode ser corrigida manualmente antes de salvar.

Ela não deve ser tratada como tabela zootécnica definitiva.

## Evidências usadas

O relatório da Fazenda DJ confirma as relações matemáticas usadas nos seis registros preenchidos do V01.

O controle operacional mostrado posteriormente também fornece um exemplo importante: no intervalo final do relatório aparecem 788 kg de ração acumulada no dia 68 e 857 kg no dia 75; o registro operacional desse período informa 69 kg de ração. Portanto:

    788 + 69 = 857

Isso sustenta o fluxo de pedir a **ração do período** e deixar o aplicativo manter o acumulado, sem exigir que o usuário faça essa soma.

A amostra operacional também mostra o processo:

    peso total da amostra / quantidade de camarões = peso médio

Por exemplo:

    303 g / 33 = 9,1818... g

## Estado atual

- Dashboard mobile-first.
- V01 e V02 preservados conforme o relatório.
- Cadastro de viveiro.
- Registro de biometria em modo simples.
- Planejamento de biometria.
- Comparação direta entre biometrías no lugar do gráfico principal.
- Histórico completo.
- Persistência local no navegador com localStorage quando o compartilhamento está desligado.
- Sincronização opcional entre aparelhos usando Pages Functions + Cloudflare D1 como fonte canônica.
- Link compartilhado com chave aleatória, controle de versão e detecção de conflito.
- Testes matemáticos contra as seis linhas preenchidas do V01.
- Testes do fluxo simples de amostra e ração do período.
- Build estático pronto para Cloudflare Pages.

Não há servidor dedicado. A sincronização compartilhada é opcional e usa recursos serverless do próprio Cloudflare Pages/D1.

Quando ativada, o D1 vira a fonte canônica e o localStorage fica como cache local. O segundo aparelho entra pela opção **Copiar link** no dashboard. Veja `docs/cloudflare-sync.md` para vincular gratuitamente um D1 ao projeto.

## Cálculos confirmados pelo relatório

Os cálculos usam precisão completa internamente e arredondamento apenas na apresentação.

- Densidade = população inicial / (área em ha × 10.000)
- Dia da biometria = data da biometria - data de povoamento + 1
- Crescimento = peso atual - peso anterior
- Crescimento médio = peso atual / (dia da biometria / 7)
- Ração p/100% = (população inicial × peso atual / 1000) × taxa de alimentação
- Sobrevivência estimada = ração/dia / ração p/100%
- Biomassa = ração/dia / taxa de alimentação
- FCA = ração acumulada / biomassa

Na primeira linha histórica do relatório, o campo chamado crescimento equivale ao próprio peso atual. O relatório também não normaliza esse campo quando o intervalo entre biometrias é diferente de sete dias.

## Rodar localmente

Requer Node.js 20+.

    npm install
    npm run dev

Testes:

    npm test

Build de produção:

    npm run build

O resultado fica em dist/.

## Cloudflare Pages

- Framework preset: Vite
- Build command: npm run build
- Build output directory: dist
- Node.js: 20+
- Variáveis de ambiente: nenhuma obrigatória
- Binding opcional para sincronização: D1 com nome **DB**

O arquivo public/_redirects mantém o fallback da SPA para index.html. A rota `/api/state` é atendida por Pages Functions quando o D1 está vinculado.

## Regra do produto

> Se o dado não está sustentado pelos registros disponíveis ou por uma relação matemática validada, ele não entra como verdade automática.

Estimativas devem permanecer identificadas como estimativas e ajustáveis quando necessário.
