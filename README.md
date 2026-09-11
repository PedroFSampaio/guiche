# Guichê — atendimento da unidade

Aplicação web para recepção, responsáveis de Alto Custo (rosa), retirada de medicamentos (amarela), entrega de documentos (branca), painel da TV e histórico diário.

## Acesso e primeiro uso

A versão Sites é privada e usa autenticação ChatGPT. O primeiro acesso autorizado configura a administração. Em Equipe e acessos, cadastre os e-mails, perfis e locais; para outras pessoas entrarem, o compartilhamento do Site também precisa ser autorizado. A TV usa perfil próprio e exige um clique em Ativar painel e chamadas por voz, devido às regras de áudio dos navegadores. Os responsáveis não precisam manter a TV aberta em seus próprios computadores.

A prévia local usa a identidade fictícia do starter, somente em localhost. Dados locais de teste não são publicados. Nunca use essa identidade de desenvolvimento como mecanismo de autenticação em um servidor de rede.

## Regras implementadas

- Senhas por atividade e data, com fuso America/Sao_Paulo; números não são reutilizados após cancelamento.
- Fila por prioridade e ordem de entrada na fila; prioridade sempre vem antes da fila comum nesta versão.
- Transferência mantém o mesmo registro de paciente, gera senha da atividade de destino e conserva a senha anterior nas movimentações. O histórico lista somente a atividade final.
- Atividades adicionais são encaminhadas sequencialmente após a conclusão, na ordem apresentada no cadastro.
- Chamadas de setores diferentes são anunciadas sequencialmente, com mínimo de sete segundos e espera pelo fim do áudio. A voz fala primeiro e último nome. A tela mostra nome, senha, serviço e local.
- O operador vê a diferença entre chamada aguardando anúncio e já anunciada. Ausência e início exigem anúncio.
- Rechamada não incrementa a contagem de pendências. Cada pendência é encerrada após três outros pacientes distintos chamados pelo mesmo responsável, após ciência do aviso. Não se registra como atendimento realizado.
- Ausentes podem retornar à fila no mesmo dia, conservando a senha; cancelamentos e saídas são preservados no histórico.
- Pendências de dias anteriores continuam visíveis para o responsável; a troca de data não apaga registros.
- Controle de autorização no servidor. Operadores recebem apenas a atividade atribuída. Administração e recepção têm visão geral; TV recebe somente os dados necessários ao painel.
- Persistência D1 com registros separados e lote transacional, versão global e repetição em caso de concorrência. Evita atribuir a mesma senha ou paciente a duas chamadas concorrentes.

## Desenvolvimento

Requer Node 22.13+ e npm. Instalar com `npm run install:ci`. Gerar migrações com `npm run db:generate`; compilar com `npm run build`.

Aplicar a migração inicial local uma única vez:

    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_rare_starfox.sql

Iniciar com `npm run dev` e abrir a URL indicada. Testes: `node --experimental-strip-types --test tests/queue.test.ts`; tipagem: `npx tsc --noEmit`.

## Validação e limites da primeira versão

Há testes para prioridade, isolamento, reinício diário, transferências, múltiplas atividades, ausência, anúncio sequencial e encerramento após três distintos. Cadastros e chamadas concorrentes foram verificados pela API local. O fluxo básico foi exercitado no navegador com dados fictícios.

Antes do uso real, validar o áudio no equipamento da TV e homologar o fluxo com a equipe. Não houve teste de carga ou teste físico em vários computadores. A sincronização consulta o servidor a cada dois segundos. A primeira implementação lê os registros da unidade para aplicar regras; para histórico volumoso, evoluir para consultas indexadas por dia e setor, paginação e política de backup. O painel recupera uma chamada abandonada por desconexão após 45 segundos e registra a interrupção; o responsável pode rechamar.

Não há impressão de senha nesta versão. O acesso por contas próprias da unidade, sem ChatGPT, requer a escolha de outra estratégia de autenticação e implantação.
