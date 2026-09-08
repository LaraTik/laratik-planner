# Apify (generic actors) — coming soon

> **Status**: stub. This source is in the catalog but the v1 extractor is not yet graduated from `experimental` to `paid` or `free`. See the [Trend Radar source catalog](../TREND_RADAR.md#per-source-setup) for the full list of available sources.

Apify is the generic-actor bridge. The sidecar's `app/extractor/apify.py` will accept any Apify actor ID + input config; the operator adds a custom `trend_source` row with the actor ID and the sidecar calls the Apify sync API and normalises the output. The pattern is documented in the [Trend Radar operator manual](../TREND_RADAR.md#add-a-custom-source-custom-apify-actor).

If you need a custom source today, contact the team to either enable the Apify extractor early or build a dedicated one for your use case.
