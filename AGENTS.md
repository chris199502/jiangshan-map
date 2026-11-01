# Fork maintenance

Before editing this fork or merging upstream, read [docs/FORK_MAINTENANCE.md](docs/FORK_MAINTENANCE.md).

For deployment through the shared Caddy container, read [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md). Preserve `deploy/Caddyfile`, `deploy/caddy-mount.yaml`, the public-path allowlist, and existing Caddy sites during upstream merges. Do not restore the retired Nginx container or expose private repository files.

- `origin` is `chris199502/jiangshan-map`; `upstream` is `DeanChensj/jiangshan-map`.
- Push commits only to this user's fork (`origin`). Use `upstream` only to fetch and merge updates. Never push to upstream, create pull requests against upstream, or otherwise submit changes to the upstream repository.
- Preserve the custom years-ago line in the timeline bubble, its BCE calculation, mobile clearance, and regression checks when resolving conflicts.
- Merge upstream into this fork; do not reset this branch to upstream or replace whole conflicted files with either side.
- After changing JS/CSS, run `node scripts/sync_version.js`, `node scripts/validate_years_ago.cjs`, and `node scripts/validate_atlas.js`. See the maintenance document for browser checks and prerequisites.
