# Publicação estática e compatibilidade local

Objetivo: publicar o redesenho autorizado como versão principal, inteiramente no frontend do Cloudflare Pages, preservando os registros anteriores.

Decisões: reutilizar React/Vite; nenhuma API, D1 ou conta necessária; atualização automática no mesmo endereço/navegador; transferência entre aparelhos por arquivo. Não existe sincronização automática entre aparelhos sem um armazenamento compartilhado. Não corrigir populações ou apagar registros por ID.

- [x] Testar migração das chaves v1/v2/v3: preservar V01, V02, todas as biometrias, produtos, movimentos e metadados; guardar cópias antes da primeira gravação.
- [x] Implementar armazenamento v4 com falhas visíveis, sem dados de exemplo em instalações novas, sem sobrescrever dados inválidos ou alterações de outra aba.
- [x] Trocar compartilhamento remoto por exportação/importação local, com prévia e confirmação de substituição e backup anterior.
- [x] Remover Functions e dependência de backend, documentar atualização no mesmo domínio e limites de recuperação.
- [ ] Executar testes, build, inspeção no navegador e revisão independente; publicar no GitHub e conferir CI/deploy disponível.
