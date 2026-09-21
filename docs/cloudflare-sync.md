# Sincronização compartilhada gratuita

O aplicativo continua sendo um projeto Cloudflare Pages. A sincronização usa apenas:

- Pages Functions no próprio projeto;
- um banco Cloudflare D1;
- um link secreto gerado pelo aplicativo.

Não existe servidor separado para administrar.

## Fonte canônica

Quando o compartilhamento está desligado, `localStorage` continua sendo a fonte local daquele aparelho.

Quando o compartilhamento está ativado:

1. o app cria um token aleatório forte;
2. o token identifica a fonte compartilhada;
3. somente o hash SHA-256 do token é armazenado no D1;
4. a versão canônica dos viveiros e biometrias fica no D1;
5. `localStorage` vira apenas uma cópia/cache local;
6. o app consulta a fonte a cada 15 segundos enquanto está visível e também ao voltar para a janela;
7. qualquer salvamento usa controle de versão para impedir sobrescrita silenciosa quando dois aparelhos alteram os dados ao mesmo tempo.

O token viaja no fragmento `#share=...` do link. Fragmentos não são enviados automaticamente ao servidor pelo navegador. O app lê o token e o envia à API somente via HTTPS.

Quem possuir o link compartilhado consegue ler e editar os dados. Não publique esse link.

## Ativar no Cloudflare

O código já está pronto. Falta apenas criar e vincular um D1 ao projeto Pages:

1. Cloudflare Dashboard → **Workers & Pages** → **D1** → criar um banco, por exemplo `viveiro-daniel`.
2. Abrir o projeto Pages do Viveiro Daniel.
3. **Settings → Bindings → Add → D1 database binding**.
4. Usar exatamente o nome de variável **DB**.
5. Selecionar o banco criado.
6. Fazer um novo deploy da `main`.

Não é necessário rodar migration manualmente: a Function cria a tabela `shared_state` no primeiro uso com `CREATE TABLE IF NOT EXISTS`. O arquivo `migrations/0001_shared_state.sql` existe apenas para documentação e manutenção futura.

## Como usar

No aparelho principal:

1. abrir o dashboard;
2. tocar em **Ativar grátis**;
3. tocar em **Copiar link**;
4. enviar esse link ao segundo aparelho.

No segundo aparelho:

1. abrir o link recebido;
2. o app salva a chave compartilhada localmente;
3. carrega imediatamente a versão canônica do D1.

Depois disso ambos podem abrir o endereço normal do site naquele navegador. A chave já estará salva naquele aparelho.

## Conflitos

Cada salvamento envia a versão que o aparelho leu.

Se outro aparelho salvou primeiro, a API responde com conflito em vez de sobrescrever silenciosamente. O aplicativo carrega a versão mais nova e pede que a pessoa revise e salve novamente.

## Limites do modo gratuito

A arquitetura foi escolhida para caber com ampla margem no plano gratuito para duas pessoas:

- Pages Functions compartilham a cota gratuita de Workers;
- D1 possui cotas gratuitas próprias de leitura, escrita e armazenamento;
- a sincronização periódica ocorre apenas quando a página está visível.

Se uma cota gratuita for atingida, a Cloudflare passa a devolver erro; o projeto não depende de um servidor mensal dedicado.
