# Desafio DevSecOps — Gerenciador de Tarefas

Site estático do desafio ADA Tech. Carrega tarefas de `src/db.json` e permite adicionar tarefas à tela. Novas tarefas não são persistidas após recarregar; não há servidor nem banco de dados real.

## Correções

- Removidas a chave de API e a senha do JavaScript. Não são necessárias ao site. Segredos não devem ser injetados no bundle: qualquer visitante pode lê-los. Credenciais reais expostas devem ser revogadas/rotacionadas pelo responsável.
- Substituído `innerHTML` por `createElement` e `textContent`: entradas são exibidas como texto.
- Removido `eval`, impedindo que uma tarefa execute JavaScript.
- Mensagens públicas de erro não incluem stack trace. Respostas HTTP e formato do JSON são validados.
- Removidos Lodash, Express e Axios: estavam desatualizados e nenhum arquivo os utilizava. O manifest e o lockfile agora não possuem dependências.
- Removido o manipulador inline do botão e adicionada Content Security Policy via meta tag, sem `unsafe-inline` nem `unsafe-eval`.

## Como a pipeline funciona

Os jobs são `security`, `build` e `deploy`. A permissão OIDC para assinatura fica no job `build`, que não executa em PRs. O Semgrep usa somente regras locais, com métricas e verificação de versão desativadas.

O arquivo `.github/workflows/pipeline.yml` executa em pushes e pull requests para `main`, além de execução manual. Qualquer falha bloqueia os passos seguintes. Não há `continue-on-error` nos controles de segurança.

| Etapa | Funcionamento e bloqueio |
| --- | --- |
| Checkout | Obtém o histórico para analisar os novos commits e não persiste credenciais Git. |
| Gitleaks | Analisa os arquivos atuais e, em push/PR, os commits entre a base e o HEAD. Usa regras padrão e uma regra adicional para senha de banco. Segredos geram saída 1; logs são redigidos. |
| Semgrep | Executa regras locais versionadas para `eval`, escrita de HTML e credenciais públicas. `--error` bloqueia achados; `--strict` bloqueia erros de configuração. |
| Grype | Examina o repositório e seus manifests/lockfiles; falha para vulnerabilidades médias, altas ou críticas, mesmo sem correção disponível. Não analisa apenas o diretório do site, onde faltariam os manifests. |
| Testes | Verifica carregamento, entradas com HTML/JavaScript, tarefas vazias, múltiplas tarefas e erros. Falhas bloqueiam a publicação. |
| Empacotamento | Gera `artifact.tar` apenas com os arquivos públicos de `src/` e calcula SHA-256. |
| Cosign | Assina o tar de verdade com OIDC do GitHub Actions e grava o bundle Sigstore. O certificado e registro público permitem verificar a origem; nenhuma chave privada persistente é necessária. |
| Verificação | O job de deploy verifica o hash e a assinatura antes de extrair. Exige o emissor OIDC do GitHub e a identidade exata de `pipeline.yml` na branch `main` deste repositório. |
| GitHub Pages | Publica o site verificado. `needs: build` impede deploy após falhas. |

Pull requests executam os scans e testes, mas não assinam nem publicam. Assinatura e deploy ocorrem somente na `main`. As actions estão fixadas por SHA para reduzir risco de alteração de tags; atualizar esses SHAs e as versões dos scanners exige revisão periódica.

### Histórico de segredos

Esta pipeline verifica o estado atual e os **novos commits**, não todo o histórico herdado do desafio. Isso evita esconder achados antigos com uma exclusão ampla e permite corrigir o exercício sem reescrever commits de terceiros. No primeiro push sem base e na execução manual, somente os arquivos atuais são analisados.

Os segredos antigos continuam no histórico: remover do arquivo não desfaz a exposição. Uma auditoria integral pode ser feita com `gitleaks git . --redact`; ela deve apontar os commits vulneráveis originais. Revogação/rotação e eventual limpeza coordenada do histórico são responsabilidades separadas. Não adicionar segredos nem mesmo em um commit intermediário: o scan incremental também verifica esses commits.

## Executar localmente

```bash
python3 -m http.server 8000 --directory src
```

Abra `http://localhost:8000`. Em outro terminal:

```bash
npm test
python3 -m pip install semgrep==1.180.0
semgrep scan --config .semgrep.yml --error --strict --metrics off --disable-version-check src/
gitleaks dir . --redact --exit-code 1
grype dir:. --fail-on medium
```

Gitleaks e Grype precisam estar instalados; a pipeline instala/usa as ferramentas automaticamente. Não é necessário instalar dependências Node para servir o site nem rodar os testes.

## Demonstrar bloqueio e correção

1. Em uma branch de laboratório, aplicar apenas a pipeline e suas configurações sobre o código original. Abrir um PR: o Gitleaks deve bloquear a credencial original.
2. Remover as credenciais e executar novamente: as regras locais do Semgrep devem bloquear `eval` e `innerHTML`.
3. Corrigir o JavaScript e manter temporariamente as dependências originais; gerar o lockfile com `npm install --package-lock-only --ignore-scripts` e rodar o Grype. A versão da base de vulnerabilidades pode alterar os achados.
4. Aplicar a remoção das dependências não utilizadas e o lockfile corrigido. Os scans e testes devem passar, sujeito à execução real e à base atual do Grype.
5. Aplicar a solução final em uma branch limpa, sem novos commits contendo credenciais, para não bloquear o scan incremental. Guardar os links das execuções com falha e com sucesso como evidência do desafio.

Não fazer esses experimentos na branch de produção. Para provar a verificação de integridade, altere uma cópia de `artifact.tar` e execute a verificação: ela deve falhar antes da extração.

## Configuração de produção

1. Use um fork/repositório com permissão de escrita e branch `main`.
2. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
3. Habilite Actions e permita a implantação da `main` no ambiente `github-pages`.
4. Envie os arquivos corrigidos e acompanhe a execução em **Actions**.
5. Copie a URL retornada pelo step de deploy para a seção abaixo.

Assinar requer acesso a Fulcio/Rekor da Sigstore; scanners precisam obter bases e downloads. Falhas desses serviços bloqueiam a pipeline, em vez de aprovar sem análise. A assinatura publica a identidade do workflow no registro de transparência.

## Validação desta entrega

Cinco testes Node passaram localmente; `npm ci` validou o lockfile. YAML e JSON foram parseados com sucesso. Gitleaks: duas credenciais detectadas no original (saída 1), nenhum segredo na solução (saída 0). Semgrep com regras locais: quatro achados no original (saída 1), nenhum na solução (saída 0). Grype v0.120.1 analisou a solução e não encontrou vulnerabilidades (saída 0). Assinatura OIDC e deploy ainda precisam ser confirmados no GitHub Actions; não há evidência de pipeline verde nem de publicação no fork nesta entrega.

## URL de produção

**Pendente de deploy no repositório de destino.** Formato usual para Pages de projeto: `https://<usuario>.github.io/<repositorio>/`. Esse formato não confirma que um site está publicado.
