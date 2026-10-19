# Guichê — versão de testes 0.2.0-test.1

Sistema local da unidade com usuário e senha, filas por atividade e painel da televisão. Requer Node.js 24 ou superior e dependências instaladas.

## Execução

- Local: abra `Iniciar-Guiche-Local.cmd`, acesse http://127.0.0.1:5173.
- Rede: após configurar os requisitos abaixo, abra `Iniciar-Guiche-Rede.cmd`.
- Compilar: `npm run build`. Desenvolvimento: `npm run dev`. Testes: `npm test`.
- Backup consistente com o sistema ligado: `npm run backup:local`.

Os comandos padrão usam Next.js e SQLite. Preserve `.local-data/guiche.sqlite`. Backups ficam em `.local-data/backups`; mantenha também uma cópia protegida fora deste computador. Os testes usam bancos separados e pacientes fictícios.

## Docker (servidor)

O container usa a rede Docker externa `lan` com IP fixo `172.20.0.15` e não publica portas. O acesso externo fica por conta do proxy reverso.

- Crie um `.env` com o endereço público do proxy, por exemplo `GUICHE_PUBLIC_ORIGIN=https://guiche.exemplo.local`.
- Suba com `docker compose up -d --build`.
- O proxy deve encaminhar para `http://172.20.0.15:3000` preservando o cabeçalho `Host`.
- O HTTPS é terminado no proxy; não exponha a porta 3000 fora da rede Docker.
- Os dados ficam em `./.local-data`. Backup: `docker compose exec guiche node scripts/backup-local.mjs`.

## Rede da unidade

Endereço preparado: **https://172.20.64.7:5443**. Mantenha o servidor ligado, sem suspensão e com IP estável. Todos os computadores devem acessar esse mesmo servidor, sem copiar o banco para cada máquina.

A TI precisa confirmar/reservar o IP, permitir TCP 5443 no firewall somente para a rede da unidade e configurar a confiança no certificado público `.local-data/tls/guiche-cert.pem` nos computadores e na TV, ou substituí-lo por certificado da infraestrutura da unidade. Nunca distribuir o arquivo `guiche-key.pem`.

Impressão SHA-256 do certificado: `864A2CEC47E59F54CF6981B1189959C5A89DC183F69035F41C211473144F6293`. Vencimento: **13/12/2026**; renovar antes dessa data. A preparação não instalou certificados no Windows nem alterou o firewall. A conexão deve abrir sem alertas de certificado. Não expor o servidor diretamente à internet.

O HTTPS foi validado neste computador, incluindo certificado, cookie Secure/HttpOnly e rejeição de Host/origem incorretos. Ainda é necessário conferir a conexão entre os equipamentos reais.

## Acessos

Em Equipe e acessos, a administração cadastra, edita e exclui funcionários. Senha vazia na edição mantém a atual. Alterações revogam sessões anteriores. Não é permitido excluir o próprio acesso ou deixar atendimentos pendentes sem responsável.

- Administração: recepção, atendimento, histórico, equipe e televisão.
- Recepção: pacientes e controles remotos de televisão/áudio.
- Atendentes: somente fila e histórico da atividade atribuída, com Excel diário.
- TV: apenas painel, após autorização da administração ou recepção.

A conta original de reserva **Sampaio** mantém os privilégios administrativos, fica oculta na equipe e não pode ser excluída ou alterada por outros administradores. Senhas usam scrypt com salt. Sessões HttpOnly/SameSite expiram em 12 horas; cinco falhas bloqueiam o usuário por 15 minutos. Não há recuperação por e-mail.

## Atendimento e painel

As filas seguem prioridade e ordem de entrada por atividade e dia, no fuso de São Paulo. Transferências e atividades adicionais mantêm o registro do paciente. Cancelamentos, ausências e conclusões permanecem no histórico. O Excel informa chegada, chamada, início, responsável e resultado.

O painel alterna suavemente entre rosa (Alto Custo), amarelo (Controlados/Retirada) e cinza (Documentos). O último paciente permanece até a próxima chamada. Anúncios são serializados com mínimo de sete segundos e espera pelo término da voz. Início e ausência exigem anúncio exibido. Depois do início, é possível encerrar ou concluir e encaminhar.

Após ciência do aviso, uma pendência é encerrada após três outros pacientes distintos chamados pelo mesmo responsável, sem contar como atendimento realizado. Rechamadas não incrementam essa contagem. A virada de dia não apaga pendências.

Voz e ding-dong são controles independentes na recepção/administração. O navegador pode exigir uma interação inicial na TV para liberar áudio. A voz usa apenas uma voz local em português disponível no equipamento. Volume, voz e reprodução precisam ser conferidos na TV física. Tela cheia é configurada no navegador/equipamento; o painel não oferece Sair nem Tela cheia.

## Validação

Consulte `outputs/revisao/REVISAO.md` e os resultados na mesma pasta. A carga simulada com 12 atendentes não substitui a homologação em equipamentos físicos ou testes prolongados com histórico volumoso. Para grande volume acumulado, ainda será necessário evoluir consultas por dia/setor e paginação. Esta edição é destinada à homologação local supervisionada; os resultados não garantem disponibilidade de 99%.

## Chat interno

O botão **Chat da equipe**, no canto inferior direito, oferece conversa geral e mensagens privadas entre funcionários. Cada conversa privada só pode ser consultada pelos participantes, inclusive quando outro usuário é administrador. A TV e a conta reserva ficam fora do chat e da lista de contatos.

Novas mensagens geram um pop-up silencioso dentro do sistema com remetente e conversa. Clique para abrir; a contagem de não lidas permanece no botão e nos contatos. O sistema precisa estar aberto e conectado para receber os avisos; não há notificações do Windows nem som. A atualização ocorre aproximadamente a cada dois segundos.

Mensagens têm até 2.000 caracteres, nome e horário. O histórico é persistido no mesmo banco e incluído no backup. **Carregar anteriores** permite consultar além das 100 mensagens mais recentes. Excluir um acesso mantém as conversas anteriores, mas impede novos envios àquele contato.

Validação do chat: quatro testes automatizados aprovados, isolamento de conversas, controle de leitura, reenvio sem duplicação, paginação, bloqueio de TV/reserva e preservação após exclusão. A API passou também por 20 envios simultâneos em banco separado; pop-up, abertura e envio conferidos no navegador. Resultados em `outputs/revisao/chat.json`.
