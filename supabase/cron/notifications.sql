-- Run after deploying Daymark and enabling pg_cron, pg_net, and Vault.
-- Store secrets from the SQL editor once; never commit real values.
select vault.create_secret('https://YOUR_DAYMARK_DOMAIN', 'daymark_app_url');
select vault.create_secret('YOUR_CRON_SECRET', 'daymark_cron_secret');

select cron.schedule(
  'daymark-notifications-every-15-minutes',
  '*/15 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'daymark_app_url') || '/api/cron/notifications',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daymark_cron_secret')
      )
    );
  $$
);
