# 开发日志

## 2026-05-14 — 项目从零到上线

### 背景

Game Manager 是一个游戏托管管理平台，供非技术产品经理部署和体验 HTML/JS 前端小游戏。本日完成从零设计到 VPS 上线的完整交付。

---

### 阶段一：项目初始化 & 代码开发

**后端（`server/`）**

| 文件 | 说明 |
|---|---|
| `src/db.ts` | SQLite 初始化，`games` + `versions` 两张表，WAL 模式 + 外键约束 |
| `src/services/logger.ts` | Winston + daily-rotate-file，按日滚动 gzip 归档到 `/var/log/game-manager/` |
| `src/services/deployer.ts` | 核心部署逻辑：文件安全校验（路径穿越过滤、文件类型白名单、500MB 体积限制）→ git commit/tag → rsync 原子替换 live 目录 → SQLite 写版本记录；回滚逻辑：git checkout 旧 tag → rsync → 记录新版本（审计链完整） |
| `src/routes/deploy.ts` | `POST /api/deploy`（multipart + SSE 实时日志流）、`POST /api/deploy/:gameId/rollback`；per-game 互斥锁防并发写冲突 |
| `src/routes/games.ts` | `GET/PATCH /api/games`，`GET /api/games/:id/versions` |
| `src/index.ts` | Express 入口，端口 3000，`/api/health` 健康检查 |

**前端（`web/`）**

| 文件 | 说明 |
|---|---|
| `src/pages/GameList.tsx` | 卡片列表 + 名称搜索 + 标签过滤 |
| `src/pages/Deploy.tsx` | 拖拽上传 ZIP + userId/gameName 输入 + 提交后 SSE 实时日志 + 成功后显示试玩链接 |
| `src/pages/GameDetail.tsx` | 游戏信息 + iframe 嵌入试玩 + 版本历史 |
| `src/components/LogViewer.tsx` | SSE 实时日志组件，自动滚底，深色控制台风格，每条日志带时间戳 |
| `src/components/VersionHistory.tsx` | 版本历史列表（绿/红/灰色状态标注）+ 回滚触发 + 就地 SSE 日志 |

**类型检查结果**：前后端均 `tsc --noEmit` 0 错误。

**基础设施文件**

- `nginx/game-manager.conf`：静态前端（`web/dist`）+ API 代理 + SSE 无缓冲 + 游戏静态文件缓存策略
- `ecosystem.config.js`：PM2 启动配置，注入 `DATA_DIR`、`LOG_DIR`、`REPOS_ROOT`、`WWW_ROOT` 等环境变量
- `scripts/install.sh`：VPS 一键初始化（Node.js 20、PM2、Git、Nginx、目录结构、cron 磁盘监控、防火墙）
- `scripts/setup-ssh-deploy.sh`：本地生成 ED25519 部署密钥 → 上传 VPS → 输出 GitHub Secrets 配置
- `.github/workflows/deploy-server.yml`：push main → 构建前后端 → rsync VPS → PM2 reload

---

### 阶段二：GitHub 仓库创建 & 推送

- 使用 `gh repo create` 创建私有仓库 `XuDongZe/game-manager`
- 完成初始提交（32 个文件，6605 行）并推送 main 分支
- 后改为 public（`gh repo edit --visibility public`），便于 VPS 直接访问原始文件

**仓库地址**：https://github.com/XuDongZe/game-manager

---

### 阶段三：VPS 环境初始化

**服务器信息**

- 阿里云 Ubuntu 24.04，IP：`47.93.180.91`
- SSH 别名：`ssh game-manager`（通过 `setup-ssh-deploy.sh` 配置）

**执行步骤**

1. 本地 `scp scripts/install.sh game-manager:/tmp/` 上传脚本（仓库为私有时无法直接 curl）
2. `ssh game-manager "sudo bash /tmp/install.sh"` 执行初始化
   - 安装：Node.js v20.20.2、PM2 v7.0.1、Nginx 1.24.0、Git 2.43.0、SQLite3
   - 创建目录：`/opt/repos/`、`/opt/www/`、`/opt/game-manager/`、`/var/log/game-manager/`
   - 配置 Nginx、cron 磁盘监控、ufw 防火墙
3. 安装 `build-essential`（`better-sqlite3` 需要原生编译）
4. `rsync` 同步代码到 `/opt/game-manager/`
5. VPS 上 `npm ci && npm run build`（后端 + 前端）
6. 创建 `ecosystem.config.js` 注入环境变量，PM2 启动服务

**遇到的问题及解决**

| 问题 | 原因 | 解决 |
|---|---|---|
| `curl` 无法拉取 install.sh | 仓库为私有，返回 404 | 改用 `scp` 上传脚本，后续改仓库为 public |
| `better-sqlite3` 编译失败 | VPS 缺少 `build-essential` | `apt install build-essential python3 make g++` |
| Nginx 静态文件 404 | `root` 配置指向 `web/` 而非 `web/dist/` | 修正 nginx.conf 中 root 路径为 `/opt/game-manager/web/dist` |

---

### 阶段四：CI/CD 配置 & 验证

**GitHub Actions Secrets 配置**（通过 `gh secret set` 直接从文件写入，避免手动粘贴格式问题）

| Secret | 值 |
|---|---|
| `VPS_HOST` | `47.93.180.91` |
| `VPS_USER` | `root` |
| `DEPLOY_KEY` | `~/.ssh/game-manager-deploy` 私钥内容 |

**前三次 Actions 失败原因**：手动粘贴私钥时格式错误（`Error loading key "(stdin)": error in libcrypto`），改用 `gh secret set DEPLOY_KEY < ~/.ssh/game-manager-deploy` 解决。

**最终验证结果**（Run ID: 25856596323，耗时 38s）

```
✓ Build server
✓ Build web
✓ Sync to VPS
✓ Restart service
```

---

### 最终状态

| 检查项 | 状态 |
|---|---|
| 前端 `http://47.93.180.91/` | ✅ HTTP 200 |
| 后端 `http://47.93.180.91/api/health` | ✅ `{"ok":true}` |
| PM2 进程 | ✅ `online` |
| GitHub Actions CI/CD | ✅ push main 自动部署 |

---

### 待办 / 后续迭代

- [ ] P2-2：游戏封面图截图预览（`cover_url` 字段已预留，可用 Puppeteer 实现）
- [ ] HTTPS 配置（Let's Encrypt / 阿里云证书）
- [ ] 磁盘使用率告警通知（目前只写日志，可接入钉钉/飞书 Webhook）
- [ ] Actions Node.js 版本升级（当前 actions/checkout@v4、actions/setup-node@v4 使用 Node.js 20，需在 2026-06-02 前升级到 v5）
