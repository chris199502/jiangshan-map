# 通过现有 Caddy 直接部署

站点地址：`https://history.sensor.dpdns.org`；服务器：`95.181.188.86`；项目目录：`/opt/project/jiangshan-map`。

这是纯静态网页，无需 npm 安装或构建。现有共享 Caddy 容器直接读取网页文件，负责 HTTPS、压缩和证书续期。已移除独立 Nginx 容器、`nginx:stable-alpine` 镜像、旧项目 Compose 文件和 `deploy/nginx.conf`；不再使用本机端口 `18766`。

## 部署文件与公开范围

- `/srv/caddy/compose.yaml` 管理服务器现有的共享 Caddy 容器。
- `deploy/caddy-mount.yaml` 是本项目所需的只读挂载片段，须合并到现有 `caddy` 服务，不能单独启动。
- `deploy/Caddyfile` 只包含本项目的 HTTPS 和 HTTP 站点块，不能覆盖服务器完整 Caddyfile。

仓库目录整体只读挂载到容器内 `/srv/jiangshan-map`，以便 Git 更新文件后直接生效。Caddy 的 `@public` 白名单只公开首页、`assets/`、`css/`、`js/`、`topics/`、`geojson/`，以及 manifest、robots、sitemap、llms 和 LICENSE。其他路径返回 404；`file_server` 还明确隐藏 `.git`、`.github`、文档、脚本、部署文件及技能目录。维护文件仍可由服务器使用，但不能通过网站下载。

新增网页资源目录时，先确认其内容可公开，再更新站点白名单；不要删除白名单或改为公开整个仓库。迁移已验证全部 69 个公开文件与旧站内容一致，并验证私有路径和编码后的路径穿越请求被阻止。

## 首次接入现有 Caddy

在 Windows PowerShell 登录服务器：

```powershell
ssh mega
```

以下命令在 Linux 服务器执行。先确认项目已经克隆到上述路径、工作区干净，且 `/srv/caddy/compose.yaml` 是现有共享 Caddy 的配置：

```sh
cd /opt/project/jiangshan-map
git status --short
git pull --ff-only origin main
test -f index.html
test -d assets
```

将 `deploy/caddy-mount.yaml` 中的 volume 合并到 `/srv/caddy/compose.yaml` 的现有 `caddy` 服务，保留其镜像、网络、证书及配置挂载。该挂载使用 `create_host_path: false`；源目录缺失时应报错，不自动创建空目录。

先检查 `/srv/caddy/Caddyfile` 是否已有 `history.sensor.dpdns.org`：若已有，只更新本项目的 HTTPS/HTTP 块；若没有，才追加 `deploy/Caddyfile` 的内容。保留所有其他域名、全局配置和证书。当前全局禁用了自动 HTTP 重定向，因此片段保留显式 HTTP → HTTPS 重定向。

修改单文件挂载的 Caddyfile 时原地写入，保留 inode；不要用替换文件的方式使容器继续读取旧文件。修改前暂存需要回退的配置，验收成功后清理本次备份。

新增挂载需要重建共享 Caddy，会短暂中断其他站点连接。安排好切换时间后执行：

```sh
docker compose -f /srv/caddy/compose.yaml config --quiet
docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose -f /srv/caddy/compose.yaml up -d --no-deps --force-recreate caddy
```

如果只修改站点配置而未改变挂载，验证后热重载即可：

```sh
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

保留 `/srv/caddy/data` 和 `/srv/caddy/config`。不要创建第二个占用 80/443 的 Caddy，不要停止整个共享栈或删除其他服务的 volumes。

## Cloudflare DNS

在 `sensor.dpdns.org` 区域保留以下记录：

| 字段 | 值 |
| --- | --- |
| 类型 | `A` |
| 名称 | `history` |
| IPv4 | `95.181.188.86` |
| 代理状态 | Proxied（橙云开启） |
| TTL | Auto |

同名已有其他记录时先确认用途，不要盲目覆盖。保留现有区域 SSL 设置；Cloudflare 与源站之间应使用 HTTPS，不能使用会导致重定向循环的 Flexible 模式。Caddy 自动申请和续期源站证书。

## 验证部署

```sh
curl -I http://history.sensor.dpdns.org/
curl -I https://history.sensor.dpdns.org/
curl -I https://history.sensor.dpdns.org/js/app.js
curl -I https://history.sensor.dpdns.org/.git/config
curl -I https://history.sensor.dpdns.org/docs/FORK_MAINTENANCE.md
curl -I https://history.sensor.dpdns.org/deploy/caddy-mount.yaml
```

预期：HTTP 跳转 HTTPS；首页和 JS 返回 200，TLS 校验成功；Git 配置、维护文档和部署文件返回 404。用 `curl --path-as-is` 检查 `/css/%2e%2e/AGENTS.md` 等请求也不能下载私有文件。需要排查时检查 `docker logs --since 10m caddy`。

访问 `https://history.sensor.dpdns.org/?year=1415`，确认地图、时间轴、人物跳转及“距今 N 年”正常；移动端检查 320px、390px 宽度。涉及 JS/CSS 修改时仍须遵守维护文档中的完整回归要求。

## 日常更新

先按 [FORK_MAINTENANCE.md](FORK_MAINTENANCE.md) 手动合并上游、保留 DIY 功能并完成相应测试。部署已提交的代码：

```sh
cd /opt/project/jiangshan-map
git status --short
git pull --ff-only origin main
curl -I https://history.sensor.dpdns.org/
```

只读目录挂载会直接读取更新后的文件；仅更新网页内容无需重建或重载 Caddy，也没有 Node.js 运行时或独立网页容器需要维护。浏览器缓存仍可能需要强制刷新。若修改了 `deploy/Caddyfile`，须同步更新共享 Caddyfile 中本项目的对应块，再验证并热重载；修改挂载则需要重建共享 Caddy。

## 下线与回退

下线时只删除本项目的 HTTPS/HTTP 站点块，验证后热重载。再从共享 Compose 中移除 `/srv/jiangshan-map` 这一处挂载，重建 Caddy，确认没有其他用途后删除本项目 DNS、证书缓存及项目目录。不要对共享 Caddy 执行 `docker compose down`。

配置验证失败时只回退本次修改；若其他配置已同时变化，不整文件恢复。正常网页代码回退使用 `git revert` 创建回退提交，再拉取已提交代码。不要 `reset --hard upstream/main`，也不要重新引入已退役的 Nginx 部署。验收完成后清理本次临时文件和备份。
