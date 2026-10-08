# Migração do Painel OS para systemd

Este procedimento deve ser executado por alguém com sudo completo. O arquivo
`painel-os.service` executa o mesmo processo que `servidor/iniciar.sh` executa
hoje: `/usr/bin/python3 -u servidor/servir.py`, no diretório do painel.

O serviço roda como `claude`, não como root. A porta 5199 não é privilegiada,
o diretório do painel e `data/` pertencem a `claude`, e a credencial
`/opt/gastaomatos/luana/.painel_os.credencial` é legível exclusivamente por
esse usuário. Não há requisito identificado para privilégios de root.

## Instalação

1. Faça uma cópia do crontab de root e remova estas duas entradas exatas com
   `sudo crontab -e`:

   ```cron
   @reboot /opt/gastaomatos/luana/painel_os/servidor/iniciar.sh
   * * * * * umask 077; /opt/gastaomatos/luana/painel_os/servidor/garantir-ativo.sh >> /opt/gastaomatos/luana/painel_os/servidor/watchdog.log 2>&1
   ```

   Comandos para a cópia e conferência:

   ```bash
   sudo sh -c 'crontab -l > /root/crontab.antes-painel-os-systemd'
   sudo crontab -l
   ```

   Remova as duas linhas antes de parar o processo antigo. A entrada `@reboot`
   também precisa sair: ela iniciaria novamente um processo fora do systemd.
   Não remova a coleta regular de cinco minutos, se existir; ela não é o
   watchdog `garantir-ativo.sh`.

2. Instale a unit e recarregue a configuração do systemd:

   ```bash
   sudo install -o root -g root -m 0644 \
     /opt/gastaomatos/luana/painel_os/painel-os.service \
     /etc/systemd/system/painel-os.service
   sudo systemd-analyze verify /etc/systemd/system/painel-os.service
   sudo systemctl daemon-reload
   ```

3. Confirme o processo legado que ocupa a porta e pare somente esse processo:

   ```bash
   sudo /usr/bin/pgrep -af '^/usr/bin/python3 -u servidor/servir\.py$'
   sudo /usr/sbin/ss -ltnp 'sport = :5199'
   sudo /usr/bin/pkill -TERM -f '^/usr/bin/python3 -u servidor/servir\.py$'
   ```

   O `pgrep` precisa mostrar apenas o processo do painel antes do `pkill`.
   Espere a porta ser liberada:

   ```bash
   until ! sudo /usr/sbin/ss -ltnH 'sport = :5199' | grep -q .; do sleep 1; done
   ```

4. Habilite e inicie o serviço, depois confira a saúde:

   ```bash
   sudo systemctl enable --now painel-os.service
   sudo systemctl status painel-os.service --no-pager
   curl --silent --output /dev/null --write-out 'HTTP %{http_code}\n' \
     --max-time 3 http://127.0.0.1:5199/
   ```

   A última chamada deve devolver `HTTP 401`, que confirma que o servidor está
   no ar e que a autenticação continua fechada. Para os logs, use
   `sudo journalctl -u painel-os.service -n 100 --no-pager`.

## Operação depois da migração

Luana já pode controlar o processo com as permissões de sudo existentes:

```bash
sudo systemctl restart painel-os.service
sudo systemctl status painel-os.service
```

O restart automático fica sob responsabilidade de `Restart=always` com espera
de 10 segundos. O watchdog `servidor/garantir-ativo.sh` deixa de ser usado e
não deve permanecer no cron, pois ele inicia processos fora do systemd e pode
competir pela porta 5199.

## Reversão

Se for necessário voltar temporariamente ao comportamento anterior, pare e
desabilite a unit, restaure o backup do crontab após revisá-lo e recarregue o
cron conforme a política do host:

```bash
sudo systemctl disable --now painel-os.service
sudo crontab /root/crontab.antes-painel-os-systemd
```

Não faça a reversão enquanto a unit estiver ativa, para evitar dois processos
disputando a porta 5199.
