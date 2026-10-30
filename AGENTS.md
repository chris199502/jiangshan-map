# Fork maintenance

Before editing this fork or merging upstream, read [docs/FORK_MAINTENANCE.md](docs/FORK_MAINTENANCE.md).

- `origin` is `chris199502/jiangshan-map`; `upstream` is `DeanChensj/jiangshan-map`.
- Preserve the custom years-ago line in the timeline bubble, its BCE calculation, mobile clearance, and regression checks when resolving conflicts.
- Merge upstream into this fork; do not reset this branch to upstream or replace whole conflicted files with either side.
- After changing JS/CSS, run `node scripts/sync_version.js`, `node scripts/validate_years_ago.cjs`, and `node scripts/validate_atlas.js`. See the maintenance document for browser checks and prerequisites.
