# Fork 定制与上游同步

本仓库是 `https://github.com/chris199502/jiangshan-map.git`，上游为 `https://github.com/DeanChensj/jiangshan-map.git`。
服务器目录为 `/opt/project/jiangshan-map`，使用 `main` 分支维护上游代码和本仓库的 DIY 提交。上游同步由维护者手动执行。

**提交边界：只向用户自己的 fork（`origin`）推送提交。`upstream` 仅用于拉取并合并上游更新，禁止向上游推送、创建以上游为目标的 PR，或以其他方式向上游提交修改。** 后续 AI 必须遵守此规则。

## 必须保留的 DIY 功能

功能提交：`a429b49`（`feat(timeline): show years ago below the selected year`）。

- 底部年份气泡第一行保留公元年份和年号，第二行居中显示“距今 N 年”，使用较小的浅色文字。
- 拖动时间轴、自动播放、输入年份、点击历史事件、人物行迹跳转以及切换语言时，第二行跟随当前所选年份更新。
- 基准为浏览者设备的当前年份，不写死为 2026，也不是服务器年份；按年份差计算，不计算月日或周年。
- 公元年份：`当前年份 - 所选年份`；公元前年份在数据中为负数，计算为 `当前年份 - 所选年份 - 1`，因为没有公元 0 年。应用的跳转逻辑会跳过 0 年。
- 以 2026 年为例：1415 年 → 距今 611 年；前 221 年 → 距今 2246 年；前 1 年 → 距今 2026 年；公元 1 年 → 距今 2025 年；2026 年 → 距今 0 年。
- 英文显示 `N years ago`（1 年用 `1 year ago`）；简繁中文都显示“距今 N 年”。
- 气泡与轴线保持间距，避免轴线/指针遮字。目前桌面气泡底边距轨道顶边 7px，手机为 18px；支持至少 320px 宽的手机屏幕。

涉及的代码位置：

| 文件 | 定制内容 |
| --- | --- |
| `js/app.js` | `formatYearsAgo()` 计算文案；`_syncScrubberUi()` 更新第二行 |
| `index.html` | `#scrubber-Bubble` 内的 `#bubble-years-ago`；资源版本哈希 |
| `css/style.css` | 第二行样式；桌面 `#scrubber-rail-wrap` 上留白 44px；手机第一行高度 50px，气泡 `top: -54px` |
| `scripts/validate_years_ago.cjs` | 公元、公元前、当前年份与语言的零依赖回归测试 |
| `scripts/validate_atlas.js` | 现有手机时间轴布局断言随第一行高度调整为 50px |
| `.github/workflows/ci.yml` | 保留现有完整校验，并运行距今年数回归测试 |

不修改历史数据，不增加运行时依赖，也不设置自动同步任务。

通过现有 Caddy 直接部署见 [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)。合并上游时须保留 `deploy/Caddyfile`、`deploy/caddy-mount.yaml`、公开路径白名单和该部署文档。站点由共享 Caddy 容器直接提供静态文件，已移除独立 Nginx 容器及原 `compose.yaml`、`deploy/nginx.conf`；不要在同步上游时恢复旧部署。仅更新网页资源时无需重建或重载 Caddy，不覆盖服务器其他站点配置。

## 我的位置

- 右下角白色圆角箭头按钮按需请求浏览器定位，定位成功后跳转到当前位置并显示独立蓝点；不自动请求权限或持续跟随。
- 再次点击定位按钮关闭定位，获取位置期间也可取消。关闭时清空坐标、蓝点和距离，恢复被替代的菱形，保留当前视图与事迹、搜索及手动选择。取消的请求即使稍后返回，也不能恢复蓝点、移动镜头或显示错误；重新开启时只接受最新请求的结果。
- 使用 `#grp-user-location` 独立图层和 `userLocation` 状态，不能复用 `activeTrace` 或调用 `locate()` / `openGenealogyAt()`，避免改变搜索结果、手动点选、人物和路线卡片。蓝点独立接收点击，不能穿透命中附近菱形或继承其悬浮提示；仅同地点时打开对应菱形的事迹，不重合时点击蓝点关闭事迹浮签。切换年份与搜索后仍保留蓝点。
- 经纬度只留在当前页面内存，不写入分享链接或浏览器存储。授权拒绝、超时、定位不可用以及超出地图覆盖范围时显示提示，保留原视图。
- 用户在等待定位时发生搜索、点选或拖动，返回的结果只更新蓝点，不抢回镜头。
- 蓝点与事件菱形在同一地点时（100 米内，兼容事件坐标三位小数的舍入），隐藏该菱形的外观，保留点击区域和事迹；不重合时两种标记均保留。事件浮签显示当前所选事件地点距用户的直线距离，多地点事件随所选地点更新。未授权定位时不显示距离。
- 涉及文件：`index.html`、`css/style.css`、`js/app.js`；回归命令：`node scripts/validate_user_location.cjs`。同步上游时须保留此功能及 CI 检查。

## 手动同步上游

开发和验证环境需要 Node.js 20+、Python 3，并且完整校验使用的 `python3` 命令必须可用。服务器克隆时没有预装 Node.js，本次验证使用临时 Node.js 22；后续维护需自行准备 Node.js。静态网页运行无需 Node.js 或构建。

在服务器登录并进入目录；本地也可以在自己的克隆目录执行相同 Git 命令。

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@95.181.188.86
```

以下为登录服务器后的命令：

```sh
cd /opt/project/jiangshan-map
git status --short
git remote -v
```

工作区必须干净；如有修改，先确认来源并提交或自行保存，不要覆盖。检查 `origin` 和 `upstream` 与本文地址相同。如果是新克隆，尚未配置 `upstream`，执行一次：

```sh
git remote add upstream https://github.com/DeanChensj/jiangshan-map.git
```

按顺序执行，任意一步失败就停止并处理，不能继续推送：

```sh
git switch main
git pull --ff-only origin main
git fetch upstream
git branch backup/before-upstream-YYYYMMDD-HHMM
git merge --no-ff --no-commit upstream/main
```

创建备份分支时，把 `YYYYMMDD-HHMM` 换成当前时间，使用尚不存在的名称。备份分支用于保留同步前的完整状态。
若显示 `Already up to date`，不需要创建合并提交，直接检查本地是否有需要推送的提交。
若存在冲突，先完成下一节的处理。若合并成功，仍然需要检查 DIY 功能是否完整，再执行：

```sh
node scripts/sync_version.js
node scripts/validate_years_ago.cjs
node scripts/validate_atlas.js
git diff --check
git diff --cached --stat
git diff
```

验证通过并检查浏览器效果后，只暂存冲突解决和资源哈希变化涉及的文件，确认没有混入其他修改，再完成合并：

```sh
git add index.html
# 若手动解决了其他文件的冲突，也逐个 git add 对应文件。
git diff --cached
git commit -m "Merge upstream/main and preserve custom years-ago display"
git push origin main
```

如果服务器没有 GitHub 推送凭据，可在已有凭据的本地克隆中完成合并与推送，再在服务器使用 `git pull --ff-only origin main` 更新。不要把私钥或访问令牌写入仓库。

## 给后续 AI 的冲突处理说明

1. 先读本文和 `AGENTS.md`，查看 `git status`、`git diff --name-only --diff-filter=U`、本地定制提交以及上游修改。确认现有工作没有被覆盖。
2. 将上游的新逻辑与上表中的定制合并。不要整文件选 `ours` / `theirs`；不要使用 `reset --hard upstream/main`、强制推送或用上游完整覆盖 fork。
3. 若上游重构或移动了控制器，将 `formatYearsAgo()` 和第二行更新迁移到新的年份显示入口。若气泡改名或组件化，保留两行布局及全部跳转场景；同步更新测试与本文的位置说明。
4. 若 `index.html` 的冲突只有资源版本哈希，先保留有效 HTML 标签和新增第二行，再运行 `node scripts/sync_version.js` 生成最终哈希。不要手猜哈希，确保所有冲突标记都已解决后再运行验证。
5. 若 CSS 或上游布局测试冲突，根据最终布局调整断言；保留原有测试的其他检查。不要删除检查来掩盖功能回归。公元前跨纪元必须扣除不存在的 0 年。
6. 执行上面的两个测试命令和资源同步。用浏览器检查 1440px 桌面，以及 390px、320px 手机宽度，确认第二行可见、不被轴线遮挡、没有新增横向溢出；检查简/繁/英文，以及前 221、前 1、公元 1、1415 和当前年份，检查拖动、播放、事件及人物跳转。
7. 所有校验通过后再提交、推送。若无法正确判断冲突，保留冲突现场并说明具体文件与未决问题；如需撤销本次尚未提交的合并，使用 `git merge --abort`，不要覆盖已有 DIY 提交。

Git 合并会保留本仓库的提交，但无法保证未来上游改动永远没有冲突。这里选择人工合并和测试，不自动发布未经验证的更新。
