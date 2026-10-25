-- Applied only to the local staging database after pg_restore.
-- Preserve production workflow/content rows for realistic local design review,
-- while removing credentials and replacing account identities with local-only
-- addresses. The copy remains confidential production content.
BEGIN;

DO $$
DECLARE
  preview_admin_id uuid;
BEGIN
  SELECT u.id
  INTO preview_admin_id
  FROM public."user" AS u
  JOIN public.agency_membership AS membership ON membership.user_id = u.id
  WHERE membership.status = 'active'
    AND membership.is_agency_admin = true
  ORDER BY u.created_at, u.id
  LIMIT 1;

  IF preview_admin_id IS NULL THEN
    RAISE EXCEPTION 'No active agency administrator exists for the local preview account';
  END IF;

  UPDATE public."user" AS u
  SET email = CASE
        WHEN u.id = preview_admin_id THEN 'local-preview@example.invalid'
        ELSE 'local-user-' || replace(u.id::text, '-', '') || '@example.invalid'
      END,
      name = CASE WHEN u.id = preview_admin_id THEN 'Local Preview Admin' ELSE 'Local User' END,
      display_name = CASE WHEN u.id = preview_admin_id THEN 'Local Preview Admin' ELSE 'Local User' END,
      image = NULL,
      avatar_path = NULL,
      password_hash = NULL,
      must_change_password = false,
      role = CASE WHEN u.id = preview_admin_id THEN 'agency_admin' ELSE u.role END;
END $$;

-- Remove all credentials capable of signing in or reaching another service.
TRUNCATE TABLE public."account", public."session", public."verification_token";
TRUNCATE TABLE public.mcp_access_token;
TRUNCATE TABLE public.ai_provider_secret;
TRUNCATE TABLE public.agency_social_dek;
TRUNCATE TABLE public.agency_social_provider_config;
TRUNCATE TABLE public.social_oauth_state;
TRUNCATE TABLE public.advertising_credential_version;
TRUNCATE TABLE public.platform_storage_provider_config;
TRUNCATE TABLE public.notification_email_delivery, public.outbox_event;
-- Production audit history can contain IPs, user agents, and full snapshots.
-- These append-only tables are not useful for visual review, so omit them
-- entirely instead of weakening their triggers in the staging database.
TRUNCATE TABLE public.agency_entitlement_change,
  public.platform_audit_event,
  public.support_access_audit;

UPDATE public.invitation
SET email = ('local-invite-' || replace(id::text, '-', '') || '@example.invalid')::citext,
    invitee_name = NULL,
    token_hash = md5('local-preview:' || id::text),
    last_sent_at = NULL;

-- Invalidate any saved production bearer-link hashes in the local copy.
UPDATE public.media_share_link
SET token_hash = md5('local-preview-media:' || id::text);

UPDATE public.media_share_collection
SET token_hash = md5('local-preview-collection:' || id::text);

UPDATE public.advertising_report_share
SET token_hash = md5('local-preview-report:' || id::text);

UPDATE public.social_connection
SET status = 'needs_reauth',
    scopes = '{}'::text[],
    credentials_ciphertext = 'LOCAL_SNAPSHOT_CREDENTIAL_REMOVED',
    credentials_iv = 'LOCAL_SNAPSHOT_CREDENTIAL_REMOVED',
    credentials_tag = 'LOCAL_SNAPSHOT_CREDENTIAL_REMOVED',
    credentials_key_version = 1,
    access_token_expires_at = NULL,
    refresh_token_expires_at = NULL,
    metadata = '{}'::jsonb;

UPDATE public.advertising_connection
SET status = 'invalid',
    credential_ref = 'local-snapshot:' || id::text,
    current_credential_version = 0,
    last_validated_at = NULL,
    last_validation_status = NULL,
    last_validation_code = NULL,
    revoked_at = COALESCE(revoked_at, now());

UPDATE public.agency_storage_config
SET mode = 'managed',
    account_id = NULL,
    bucket_override = NULL,
    endpoint_override = NULL,
    access_key_ciphertext = NULL,
    access_key_last_four = NULL,
    access_key_key_version = NULL,
    secret_access_key_ciphertext = NULL,
    secret_access_key_last_four = NULL,
    secret_access_key_key_version = NULL,
    enabled = false,
    status = 'disabled',
    last_health_check_ok = NULL,
    last_error_code = NULL;

UPDATE public.ai_feature_setting
SET enabled = false,
    tool_calling_enabled = false,
    key_source = 'environment',
    masked_key_suffix = NULL,
    last_connection_test_at = NULL,
    last_connection_test_ok = NULL;

UPDATE public.workspace_settings
SET meta_publishing_enabled = false,
    community_inbox_auto_send_enabled = false,
    community_inbox_emergency_stop = true;

-- Invalidate external community identities and replace message bodies while
-- retaining row counts, states, timestamps, and relationships for the UI.
UPDATE public.community_conversation
SET external_conversation_id = 'local-conversation-' || id::text,
    external_root_id = CASE WHEN external_root_id IS NULL THEN NULL ELSE 'local-root-' || id::text END,
    external_post_id = CASE WHEN external_post_id IS NULL THEN NULL ELSE 'local-post-' || id::text END,
    metadata = '{}'::jsonb;

UPDATE public.community_message
SET external_message_id = 'local-message-' || id::text,
    body = CASE
      WHEN length(body) < 45 THEN 'Local preview message.'
      ELSE repeat('Local preview message. ', LEAST(ceil(length(body)::numeric / 23)::integer, 20))
    END,
    author_name = CASE WHEN author_name IS NULL THEN NULL ELSE 'Customer' END,
    author_external_id = CASE WHEN author_external_id IS NULL THEN NULL ELSE 'local-author-' || id::text END,
    external_parent_id = CASE WHEN external_parent_id IS NULL THEN NULL ELSE 'local-parent-' || id::text END,
    metadata = '{}'::jsonb;

UPDATE public."comment"
SET body = CASE
  WHEN length(body) < 45 THEN 'Local preview note.'
  ELSE repeat('Local preview note. ', LEAST(ceil(length(body)::numeric / 20)::integer, 20))
END;

UPDATE public.notification
SET title = 'Local preview notification',
    body = 'Notification content is anonymized in this local snapshot.',
    message_params = NULL;

UPDATE public.activity_event
SET before_data = '{}'::jsonb,
    after_data = '{}'::jsonb,
    metadata = '{}'::jsonb;

-- Redact email addresses that also appear in ordinary text or JSON fields.
-- Keep local fake account addresses intact so the dev sign-in route can use
-- the existing agency-admin membership without creating a new user.
DO $$
DECLARE
  column_info record;
  email_pattern constant text := '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}';
BEGIN
  FOR column_info IN
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'character', 'jsonb')
      AND NOT (table_name = 'user' AND column_name = 'email')
      AND NOT (table_name = 'invitation' AND column_name = 'email')
  LOOP
    IF column_info.data_type = 'jsonb' THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = regexp_replace(%I::text, %L, %L, ''gi'')::jsonb WHERE %I::text ~* %L',
        column_info.table_name,
        column_info.column_name,
        column_info.column_name,
        email_pattern,
        'redacted@example.invalid',
        column_info.column_name,
        email_pattern
      );
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET %I = regexp_replace(%I::text, %L, %L, ''gi'') WHERE %I::text ~* %L',
        column_info.table_name,
        column_info.column_name,
        column_info.column_name,
        email_pattern,
        'redacted@example.invalid',
        column_info.column_name,
        email_pattern
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
