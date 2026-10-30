# Docker + 现有 Caddy 部署

目标地址：`https://history.sensor.dpdns.org`，通过 Cloudflare 橙云代理访问。源站服务器：`95.181.188.86`；项目目录：`/opt/project/jiangshan-map`。

这是纯静态网页，无需 npm 安装或构建。`compose.yaml` 使用官方 `nginx:stable-alpine` 镜像，站点文件只读挂载到容器，监听 `127.0.0.1:18766`。现有 Caddy 负责公网 HTTPS、压缩和证书续期。

只挂载需要公开的网页资源，没有将整个 Git 仓库作为网站根目录，因此 `.git`、维护文档和部署配置不对外提供。Docker 不保存业务数据。

## 1. 准备代码与启动容器

在 Windows PowerShell 登录：

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@95.181.188.86
```

以下命令在 Linux 服务器执行，需要 Docker Engine 和 Docker Compose 插件：

```sh
cd /opt/project/jiangshan-map
git status --short
git pull --ff-only origin main
ss -ltnp | grep ':18766' || true
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose exec -T web nginx -t
curl -I http://127.0.0.1:18766/
docker compose ps
```

先确认工作区干净；如果端口已被其他服务占用，停止并检查，不要结束不明进程。本项目自己的容器已占用该端口时，直接运行 `docker compose up -d` 即可更新配置。
每条命令成功后才继续。首页预期返回 HTTP 200。没有 Node.js 也能部署；修改源码和同步上游时的测试环境要求见 [FORK_MAINTENANCE.md](FORK_MAINTENANCE.md)。

## 2. Cloudflare DNS

在 `sensor.dpdns.org` 区域添加：

| 字段 | 值 |
| --- | --- |
| 类型 | `A` |
| 名称 | `history` |
| IPv4 | `95.181.188.86` |
| 代理状态 | Proxied（橙云，开启小云朵） |
| TTL | Auto |

保持橙云开启；公开 DNS 应解析到 Cloudflare 边缘 IP，用户访问经 Cloudflare 回源到 Caddy。若同名已有 A、AAAA、CNAME 或 NS 记录，先确认用途，不要盲目覆盖或追加指向其他主机的记录。
该子域名需要有效的 Cloudflare 边缘证书，Caddy 提供有效的源站证书。当前区域原有 SSL 模式为 Full，本次保留该设置，已验证两段 HTTPS 和源站证书有效；Full 模式本身不校验源站证书。若需让 Cloudflare 严格校验证书，使用只匹配此域名的 Configuration Rule 设置为 Full (strict)，避免影响其他站点。不要使用 Flexible，否则显式 HTTP → HTTPS 重定向可能循环。

## 3. 接入现有 Caddy

本服务器的 Caddy 容器名是 `caddy`，使用 host 网络；宿主机 `/srv/caddy/Caddyfile` 只读挂载到容器 `/etc/caddy/Caddyfile`。因此它可以直接反向代理本机 `127.0.0.1:18766`。

仓库内 `deploy/Caddyfile` **只是这个站点的配置片段**，不能用它替换服务器完整配置。当前全局设置禁用了自动 HTTP 重定向，因此片段中同时包含显式 HTTP 重定向。

首次安装时先确认还没有此站点块，再备份并追加；不要重复追加：

```sh
grep -n 'history.sensor.dpdns.org' /srv/caddy/Caddyfile
# 若已有匹配，检查或更新原站点块，跳过下面的 cat 追加。
cp -p /srv/caddy/Caddyfile /srv/caddy/Caddyfile.before-history-$(date +%Y%m%d-%H%M%S)
cat deploy/Caddyfile >> /srv/caddy/Caddyfile
docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

验证成功后才热重载，其他站点继续由同一 Caddy 容器服务：

```sh
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

DNS 生效且公网 TCP 80/443 可达后，Caddy 会自动申请并续期证书。首次证书申请可能需要等待；排查最近日志：

```sh
docker logs --since 10m caddy
```

已有 Caddy 数据目录 `/srv/caddy/data` 和配置目录 `/srv/caddy/config` 应保留，不要新建第二个占用 80/443 的 Caddy，也不要删除已有证书数据。

## 4. 验证部署

```sh
curl -I http://history.sensor.dpdns.org/
curl -I https://history.sensor.dpdns.org/
curl -I https://history.sensor.dpdns.org/js/app.js
curl -I https://history.sensor.dpdns.org/.git/config
curl -I https://history.sensor.dpdns.org/docs/FORK_MAINTENANCE.md
```

预期：HTTP 跳转 HTTPS；HTTPS 首页和 JS 返回 200，TLS 证书校验成功；`.git` 和维护文档返回 404。
浏览器访问 `https://history.sensor.dpdns.org/?year=1415`，检查地图、时间轴、人物跳转和“距今 N 年”；手机检查 320px、390px 宽度，气泡不能被轴线遮挡。

## 5. 日常更新

同步上游请先按 [FORK_MAINTENANCE.md](FORK_MAINTENANCE.md) 合并、保留 DIY 并通过测试，再部署已提交的代码：

```sh
cd /opt/project/jiangshan-map
git status --short
git pull --ff-only origin main
docker compose up -d --force-recreate
curl -I https://history.sensor.dpdns.org/
```

单独挂载的 `index.html` 等文件可能在 Git 更新时更换 inode，因此拉取代码后重新创建本项目容器，确保所有挂载都指向新版本。无需重启 Caddy。浏览器如显示旧版本，强制刷新。
升级 nginx 镜像时先执行 `docker compose pull`，再运行上面的重新创建和访问检查；该镜像标签会随官方稳定版更新，不会自动升级运行中的容器。

## 6. 停止与回退

```sh
cd /opt/project/jiangshan-map
docker compose down
```

这只停止本项目容器和网络。若要下线域名，从 `/srv/caddy/Caddyfile` 中移除这一个域名对应的 HTTPS 与 HTTP 块，验证后热重载，再移除本项目的 DNS 记录。不要操作其他容器或删除 Docker volumes。

Caddy 配置修改失败时，在本次修改后尚无其他配置变更的前提下，可用本次备份恢复原文件内容，并重新 validate/reload；若其间其他站点已有修改，只撤销本项目站点块，不整文件恢复。初次部署的回滚备份已按维护者要求清理；后续修改前需重新创建备份。

代码回退使用 `git revert` 创建回退提交，推送后重新拉取并创建网页容器；不要 `reset --hard upstream/main`，以免丢失 DIY 功能和部署文件。
