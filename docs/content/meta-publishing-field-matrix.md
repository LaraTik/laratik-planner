# Meta Publishing Field Matrix

Status: implementation baseline, live publishing disabled
Date: 2026-09-04

This matrix defines the initial supported Meta publishing scope. Meta API
permissions, limits, and format support must be revalidated immediately before
provider implementation.

## Initial scope

| Target    | Initial formats              | Required destination           |
| --------- | ---------------------------- | ------------------------------ |
| Instagram | Single image, Reel, carousel | Instagram professional account |
| Facebook  | Text, photo, video Page post | Managed Facebook Page          |

Deferred targets include personal Facebook profiles, consumer Instagram
accounts, Stories, Marketplace listings, comments, messages, ads, and automatic
cross-posting.

## Field policy

| Field                       | Current source                                    | Initial policy                               | Notes                                                    |
| --------------------------- | ------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| Caption                     | `platform_payload.caption`                        | Publishable                                  | Validate per target and provider limits                  |
| Description                 | `platform_payload.description`                    | Publishable where supported                  | Do not assume Instagram and Facebook semantics match     |
| First comment               | `platform_payload.firstComment`                   | Manual follow-up initially                   | Requires a separate provider mutation and failure policy |
| Hashtags                    | `platform_payload.hashtags`                       | Publishable where supported                  | Validate count and rendered caption behavior             |
| Mentions                    | `platform_payload.mentions`                       | Deferred/manual until mapping is implemented | Provider IDs and validation are required                 |
| Collaborators               | `platform_payload.collaborators`                  | Deferred/manual until mapping is implemented | Requires provider-specific account validation            |
| CTA/link                    | `platform_payload.callToAction`, `destinationUrl` | Facebook/link formats first                  | Instagram behavior must be explicitly mapped             |
| Location                    | `platform_payload.location`                       | Deferred until provider ID mapping           | Name alone is not a reliable provider destination        |
| Content language            | `platform_payload.contentLanguage`                | Planner metadata                             | Must not be silently translated                          |
| Alt text                    | `platform_payload.altText`                        | Required editorial field                     | Confirm provider support per format                      |
| Rights confirmation         | `platform_payload.disclosures.rightsConfirmed`    | Blocking                                     | Required before queueing                                 |
| Paid partnership            | `platform_payload.disclosures.paidPartnership`    | Stored; provider mapping deferred            | Never silently drop the disclosure                       |
| AI/synthetic media          | `platform_payload.disclosures`                    | Stored; provider mapping deferred            | Show a manual follow-up when unsupported                 |
| Image crop                  | Instagram payload                                 | Publishable after media validation           | Validate dimensions and aspect ratio                     |
| Carousel order              | Instagram payload                                 | Publishable after child media support        | Each child needs validation and stable order             |
| Reel cover                  | Instagram Reel payload                            | Required                                     | Must be tied to approved media                           |
| Transcript/subtitles        | Instagram Reel payload                            | Editorial metadata initially                 | Provider support and fallback need verification          |
| Audio rights                | Instagram Reel payload                            | Blocking                                     | Required before queueing                                 |
| Facebook media presentation | Facebook payload                                  | Feed photo/video/text first                  | Defer Story, Marketplace, and unsupported variants       |

## Readiness rule

Editorial readiness is not Meta readiness. A channel can be editorially ready
while remaining blocked because its provider capability, token, media delivery,
or format mapping is unavailable.
