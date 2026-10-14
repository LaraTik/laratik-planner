-- Seed a mixed media fixture into the disposable E2E database so the library
-- gallery can be verified in a real browser.
--
-- Dimensions are deliberately varied to cover the cases the redesign has to
-- get right:
--   * 1080x1920 (9:16)  - vertical reel. The old grid forced aspect-[4/3] and
--                         centre-cropped these into a horizontal sliver.
--   * 1920x1080 (16:9) - wide landscape.
--   * 800x800           - square.
--   * 4000x300          - panorama, must clamp to ratio 2.
--   * 300x4000          - ultra-tall, must clamp to ratio 0.5.
--   * NULL dimensions   - legacy asset with no extracted metadata, must fall
--                         back to 4:3 rather than collapsing.
--   * video / document  - icon tiles, no image element.
--   * processing / failed / trashed - non-ready status chips, no image element.
--
-- Objects deliberately carry no preview variant and no readable bytes: the
-- fixture exists to verify LAYOUT (aspect ratio, column flow, tile chrome,
-- status chips), not image delivery. Image bytes are covered by the storage
-- integration tests.
--
-- Disposable-database only. Safe to re-run: clears its own namespace first.

DELETE FROM media_asset
WHERE storage_object_id IN (
  SELECT id FROM storage_object WHERE object_key LIKE 'e2e-media-fixture/%'
);
DELETE FROM storage_object WHERE object_key LIKE 'e2e-media-fixture/%';

DO $fn$
DECLARE
  v_agency uuid;
  v_workspace uuid;
  v_user uuid;
  v_storage uuid;
  r record;
BEGIN
  SELECT id INTO v_agency FROM agency ORDER BY created_at LIMIT 1;
  SELECT id INTO v_workspace FROM workspace ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user FROM "user" ORDER BY created_at LIMIT 1;

  IF v_agency IS NULL OR v_workspace IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'seed agencies/workspaces/users required before media fixture';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      -- title, kind, mime, w, h, bytes, status, visibility
      ('Vertical reel 9x16',    'image',    'image/png',       1080, 1920, 2400000, 'ready',      'workspace'),
      ('Wide banner 16x9',      'image',    'image/png',       1920, 1080, 1800000, 'ready',      'workspace'),
      ('Square logo',           'image',    'image/png',        800,  800,  120000, 'ready',      'workspace'),
      ('Panorama strip',        'image',    'image/png',       4000,  300,  900000, 'ready',      'agency'),
      ('Ultra tall story',      'image',    'image/png',        300, 4000, 1500000, 'ready',      'workspace'),
      ('Legacy no dimensions',  'image',    'image/png',       NULL, NULL,  300000, 'ready',      'workspace'),
      ('Product photo',         'image',    'image/jpeg',      1200, 1200,  700000, 'ready',      'agency'),
      ('Hero image',            'image',    'image/jpeg',      1600,  900,  640000, 'ready',      'workspace'),
      ('Launch carousel slide', 'image',    'image/png',       1080, 1080,  420000, 'ready',      'agency'),
      ('Behind the scenes',     'image',    'image/jpeg',      1400,  933,  510000, 'ready',      'workspace'),
      ('Teaser cut',            'video',    'video/mp4',       1080, 1920, 8200000, 'ready',      'workspace'),
      ('Explainer video',       'video',    'video/mp4',       1920, 1080, 9400000, 'ready',      'agency'),
      ('Brand guidelines',      'document', 'application/pdf',  NULL, NULL, 2400000, 'ready',      'workspace'),
      ('Copy deck',             'document', 'text/plain',      NULL, NULL,   18000, 'ready',      'workspace'),
      ('Pending upload',        'image',    'image/png',       1080, 1080,  200000, 'processing', 'workspace'),
      ('Failed upload',         'image',    'image/png',       1080, 1080,  200000, 'failed',     'workspace'),
      ('Archived asset',        'image',    'image/jpeg',      1200,  800,  330000, 'trashed',    'workspace'),
      ('Q3 report cover',       'image',    'image/png',       1000, 1500,  480000, 'ready',      'agency'),
      ('Team photo',            'image',    'image/jpeg',      1600, 1067,  760000, 'ready',      'workspace'),
      ('Icon set',              'image',    'image/png',        512,  512,   24000, 'ready',      'workspace'),
      ('Logo primary',          'image',    'image/png',       1000, 1000,   88000, 'ready',      'agency'),
      ('Story highlight',       'image',    'image/png',        720, 1280,  260000, 'ready',      'workspace'),
      ('Case study hero',       'image',    'image/jpeg',      1800, 1200,  980000, 'ready',      'agency'),
      ('Testimonial portrait',  'image',    'image/jpeg',       800, 1200,  290000, 'ready',      'workspace')
    ) AS t(title, kind, mime, w, h, bytes, status, visibility)
  LOOP
    INSERT INTO storage_object (
      id, agency_id, workspace_id, provider, bucket, object_key,
      status, kind, mime_type, byte_size, width, height, created_by
    ) VALUES (
      gen_random_uuid(), v_agency, v_workspace, 'r2',
      'e2e-fixture', 'e2e-media-fixture/' || replace(r.title, ' ', '-') || '.bin',
      'active', r.kind, r.mime, r.bytes, r.w, r.h, v_user
    )
    RETURNING id INTO v_storage;

    INSERT INTO media_asset (
      id, agency_id, owner_workspace_id, storage_object_id, title, tags,
      visibility, status, source_type, created_by
    ) VALUES (
      gen_random_uuid(), v_agency, v_workspace, v_storage, r.title, '{}',
      r.visibility, r.status, 'browser_file', v_user
    );
  END LOOP;
END;
$fn$;

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE so.width IS NULL) AS no_dims,
  count(*) FILTER (WHERE so.kind = 'video') AS videos,
  count(*) FILTER (WHERE so.kind = 'document') AS docs,
  count(*) FILTER (WHERE ma.status <> 'ready') AS non_ready
FROM media_asset ma JOIN storage_object so ON so.id = ma.storage_object_id;