# Atualização estática e backups locais

A versão atual não utiliza backend. Cloudflare Pages entrega `dist/`; não há API, Functions, D1 ou configuração paga. O antigo recurso de compartilhamento remoto foi removido. Tokens antigos não são enviados nem usados para substituir dados locais.

## Atualizar um celular já em uso

1. Abrir o mesmo endereço de produção, no mesmo navegador usado anteriormente.
2. Recarregar a página sem limpar os dados do site.
3. Conferir viveiros, lista completa de biometrias, produtos e movimentos.
4. Abrir **Backup e troca de aparelho** e exportar o arquivo; guardar uma cópia fora do celular.

O localStorage é separado por origem (protocolo, domínio e porta). Não trocar `pages.dev` por domínio próprio, nem usar o endereço de preview para procurar registros de produção. Outra origem não consegue ler os dados anteriores.

## Migração

- Prioridade: v4, v3, v2, v1; uma lista vazia mais recente é respeitada.
- Antes da primeira migração, guardar todas as chaves antigas encontradas, byte a byte, em `viveiro-daniel:before-v4`.
- Validar a estrutura completa; nenhum cadastro ou biometria é descartado silenciosamente.
- Preservar V01 e V02 independentemente do ID ou versão do cadastro.
- Não acrescentar produtos de relatórios nem apagar biometrias ou metadados.
- Dados inválidos ou falta de espaço bloqueiam a migração. Exportação das cópias de recuperação permanece disponível quando o navegador permite leitura.
- A versão antiga pode ter apagado registros antes desta atualização. Não é possível reconstruir o que não existe mais; cópias legadas, quando presentes, ficam no arquivo de recuperação.

## Outro aparelho

Exportar o backup JSON no aparelho de origem, enviar o arquivo pelo meio escolhido pelo operador e importar no destino. A prévia mostra viveiros, biometrias e produtos. Confirmar substituição explicitamente; o estado anterior fica em `viveiro-daniel:previous-save`. Importação não mescla duas bases automaticamente.

**Exportar cópias de recuperação** gera um arquivo separado com valores brutos das chaves antigas e da gravação anterior. É destinado à recuperação assistida; não é importado diretamente como base operacional. Não inclui tokens antigos de compartilhamento.

## Publicação

GitHub `main` → integração existente do Cloudflare Pages → `npm run build` → `dist`. A publicação preserva o armazenamento do navegador no mesmo domínio. `_headers` solicita revalidação do HTML para obter a versão atual, sem apagar localStorage.

Fontes: [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [Cloudflare headers](https://developers.cloudflare.com/pages/configuration/headers/).

As gravações da versão nova usam Web Locks para serializar abas quando o navegador oferece essa API. Sem ela, permanece a detecção de versão desatualizada, sem garantia contra duas gravações exatamente simultâneas.
