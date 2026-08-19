# Canonical Stitch screen parity

Project `5403097764334458790`; design system `assets/e2bbd2e84f524a5eb7e1aa20a22d7531`.

Status values: `Missing`, `Partial`, `Implemented`, `Tested`, `Verified`. Only independent review assigns `Verified`.

| Area                | Screen ID                          | Intended route/surface        | Baseline status | Required proof                              |
| ------------------- | ---------------------------------- | ----------------------------- | --------------- | ------------------------------------------- |
| Workspace Overview  | `f2bf40ae3420498a89916892864a95d9` | `/app/w/[slug]`               | Partial         | KPI behavior + desktop/tablet/mobile visual |
| Monthly Planning    | `96f0dd19cc194373a56b78f813388750` | `/app/w/[slug]/planning`      | Partial         | filters/month/density + responsive visual   |
| Workflow Board      | `f9e58e53b3dd4b61914ce4638a8e8652` | planning board view           | Missing         | status consistency + desktop/mobile         |
| Quick Create        | `9794f1aaedf4415ca45ea078ef9f1a27` | planning drawer/new           | Partial         | defaults/formats + desktop/mobile           |
| Batch Add           | `43a166eded3d4edd8c90512958dbcc11` | planning batch view           | Missing         | parser/validation + visual                  |
| Content Detail      | `f7159c3ea90242d88d7dc15ea6a3fd02` | `/app/w/[slug]/planning/[id]` | Partial         | full role journey + desktop/tablet/mobile   |
| Delivery Review     | `879e7539314c4b9aa4f3c2b8df5c888d` | content/reviews               | Partial         | V1/V2/approval + visual                     |
| Calendar            | `8c0ec0b08e4440fcab83f25817647214` | `/app/w/[slug]/calendar`      | Missing         | month/week/DST/move + responsive            |
| Reviews             | `bb6ac00d2518497eb0200c5911ed9612` | `/app/w/[slug]/reviews`       | Missing         | queue/roles + responsive                    |
| Publishing          | `9cf65ebdff874456bbf5317161783dac` | content publishing            | Partial         | per-channel flow + desktop/mobile           |
| Publishing Recovery | `382b940536414e8ab7d2c2d4f1c68624` | content publishing            | Missing         | failed/retry flow                           |
| Client Review       | `c7dd77e009204fbbb7be6d2f12b66dab` | client-safe reviews           | Missing         | response-shape privacy + visual             |
| Client Calendar     | `218f259a1b61459c8aa87316f1aa45f4` | client-safe calendar          | Missing         | read-only/privacy + visual                  |
| Login               | `2dafd80a096644e6ae120a185c3d798d` | `/signin`                     | Partial         | OAuth/magic-link/keyboard + visual          |
| First Administrator | `a3631dbf967144a3a316b1b8ffb8fe95` | `/setup`                      | Partial         | concurrency/token + visual                  |
| My Work             | `f4dc67d1520545d59782aa466ae3ddd2` | `/app`                        | Partial         | role categories + desktop/mobile            |
| Workspaces          | `01aa8faf8f564f318ac75fef64962954` | `/app/workspaces`             | Partial         | setup/archive/restore + visual              |
| User Management     | `89113980349a4be89a72b4acb00c8667` | `/app/users`                  | Partial         | access editing + visual                     |
| Planning Library    | `7493876f69694919943a1ae5495ccfbd` | workspace library             | Missing         | campaigns/pillars/templates                 |
| Design Queue        | `5ad5fffcb25c48b9b8c6867b713c453d` | workspace design queue        | Missing         | atomic claim + visual                       |
| Social Channels     | `45d945d704bc449188d1e0c0e336ab05` | workspace channels            | Missing         | CRUD/archive + visual                       |
| Team & Invitations  | `2db8ec6ed9ad46b1933db661f07d3d1c` | workspace team                | Missing         | role/privacy + visual                       |
| Workspace Settings  | `2f6acd26c17c40858d61e2ca577dd36f` | workspace settings            | Missing         | defaults/targets/approval mode              |
| Agency AI Settings  | `cb0de669a5c644b083acf3edb377a87b` | `/app/agency-settings`        | Missing         | safe config/test/usage                      |
| Brand Kit           | `16aaf0a9ada7414088b5abdc45062923` | workspace brand kit           | Missing         | fields/private assets + visual              |
| Operational States  | `21068e5ad24645849c5b721b3227aa95` | shared states                 | Partial         | loading/empty/error/denied/archived         |

Responsive baselines must additionally use the tablet and mobile reference IDs in `STUDIOFLOW_MASTER_PROMPT.md`. The Forgot Password screen is an approved deviation because the product uses OAuth and email magic links, not passwords.
