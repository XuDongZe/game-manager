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

---

## 2026-05-15 — 本地文件夹绑定 + 重新部署 + Bug 修复

### 背景

实际体验时发现两个核心问题：1）部署完成后详情页没有任何来源文件信息，用户无法快速重新部署；2）版本历史存在遗留 Bug。本次围绕「本地路径」功能完整交付并修复全部体验问题。

---

### 新功能：本地文件夹绑定 & 文件夹上传模式

**目标**：让用户不用每次都手动选文件，部署完成后记住来源，下次一键重新部署。

#### 文件夹上传（Deploy.tsx）

- 上传区新增「📁 选择文件夹」按钮，使用 `<input webkitdirectory>` 兼容所有浏览器
- 选中文件夹后，前端用 `packFileListToZip` 打包所有白名单文件为 ZIP，再走现有上传流程，后端无需改动
- 打包时过滤 `node_modules/`、`.git/`、`.DS_Store` 及非白名单扩展名

#### 来源文件自动记录（folderHandle.ts + Deploy.tsx）

- 部署成功回调里自动调用 `saveSourceName(gameId, file.name)`，将文件/文件夹名存入 `localStorage`
- 无需用户手动绑定，部署后详情页立即显示来源信息

#### 详情页「绑定本地文件夹」& 「重新部署」（GameDetail.tsx）

三态逻辑：

| 状态 | 显示内容 |
|---|---|
| Chrome/Edge 且已绑定 FSA 文件夹 | 📁 文件夹名 + **⚡ 快速重新部署**（自动打包上传，无需选文件） |
| 有来源文件名（普通部署过的） | 📄 文件名 + **🔄 重新部署**（跳转部署页，表单已预填） |
| 无任何记录 | 「未绑定」+ **🔄 重新部署** + 📁 绑定文件夹（仅 Chrome/Edge 显示） |

#### 重新部署预填表单（Deploy.tsx）

「重新部署」跳转到 `/deploy?uploader=...&gameSlug=...&displayName=...`，表单通过 `useSearchParams` 读取 URL 参数自动填充，用户只需重新选文件点部署即可。

#### File System Access API 降级策略

- Chrome/Edge 支持 FSA → 可绑定文件夹 handle 存入 IndexedDB，下次无需重新选择
- 微信/飞书/夸克/Safari/Firefox 不支持 FSA → 静默降级，显示「重新部署」跳转按钮，不报错

**新增工具模块**：

| 文件 | 说明 |
|---|---|
| `web/src/utils/folderHandle.ts` | IndexedDB 存取 FSA DirectoryHandle；localStorage 存取 sourceName；权限检查/请求 |
| `web/src/utils/folderPack.ts` | 递归读取文件夹（FSA API）或 FileList（webkitdirectory），白名单过滤，打包为 ZIP |

---

### Bug 修复

**Bug 1：版本历史显示「v1 0」**

- **根因**：`is_rollback` 是 SQLite integer（`0`/`1`），JSX 中 `{v.is_rollback && '(回滚)'}` 导致数字 `0` 被渲染为字符，与版本号拼接后变成 `v1 0`
- **修法**：改为 `{!!v.is_rollback && '(回滚)'}`，与 `locked` 字段的修法保持一致
- **教训**：SQLite integer 字段在 JSX 中做条件渲染必须先转布尔，此类 Bug 在项目中已出现两次

**Bug 2：回滚按钮不显示 `failed` 状态版本**

- **根因**：回滚条件写的是 `status !== 'live' && status !== 'failed' && status !== 'deploying'`，导致只有 `rolled_back` 状态才能回滚，`failed` 的版本无法操作
- **修法**：去掉 `!== 'failed'` 条件，只排除当前 `live` 和正在 `deploying` 的版本

**Bug 3：版本状态显示英文**

- **修法**：新增 `getStatusLabel()` 函数，将 `live/failed/rolled_back/deploying` 映射为「运行中/失败/已回滚/部署中」

**Bug 4：详情页快速部署成功后跳转到错误页面**

- **根因**：倒计时归零时调用 `navigate(deployedGameId)`，而快速部署用的是当前游戏 id，跳转逻辑多余
- **修法**：改为 `fetchGameData()` 刷新当前页版本历史，不跳转

---

### 涉及文件

| 文件 | 变更说明 |
|---|---|
| `web/src/utils/folderHandle.ts` | 新建：FSA handle 存取、权限检查、sourceName localStorage 存取 |
| `web/src/utils/folderPack.ts` | 新建：文件夹打包逻辑（FSA + webkitdirectory 两种来源） |
| `web/src/types.ts` | 新增 `FolderBinding` 接口 |
| `web/src/pages/Deploy.tsx` | 文件夹上传模式、部署后自动 saveSourceName、URL 参数预填表单 |
| `web/src/pages/GameDetail.tsx` | 三态文件绑定区、快速重新部署、重新部署跳转预填、倒计时改刷新 |
| `web/src/components/VersionHistory.tsx` | is_rollback 转布尔、状态中文化、回滚按钮条件修正 |

---

### 涉及提交

| commit | 说明 |
|---|---|
| `3d991ae` | feat: 本地文件夹绑定 + 文件夹上传模式 |
| `8d46560` | fix: 版本历史多处修复 + 快速部署体验优化 |
| `ac46dc9` | fix: 部署后自动记录来源文件名，详情页始终显示重新部署入口 |

---

## 2026-05-14 — 单文件支持 & Bug 修复 & 体验优化

### 背景

通过浏览器模拟真实产品经理操作（上传 `word-match-demo.html` → 部署 → 访问），发现若干 Bug 和体验问题，本次一并修复。

---

### 新功能：支持单个 HTML 文件上传

**变更**：`web/src/pages/Deploy.tsx` + 新增依赖 `jszip`

原来只支持 `.zip`。现在选择 `.html` 文件后，前端在浏览器端用 JSZip 自动打包为 ZIP 再上传，后端无需任何改动。

- 选文件期间打包 → 按钮保持禁用并显示 ⏳ `正在打包 HTML 文件...`
- 打包完成后上传区显示 `（已自动打包为 ZIP）` 提示
- `accept=".zip,.html,.htm"`，两种格式均可拖拽

---

### Bug 修复

**Bug 1：部署成功后链接拼错，访问 404**

- **根因**：前端用表单输入的原始 `userId`/`gameName` 拼游戏链接，而后端会对其做 `sanitizeName`（小写、替换非法字符），两端不一致导致链接失效
- **修法**：后端在 SSE `done` 事件中附带 `gameId` 字段（sanitize 后的真实值），前端从事件里取 `gameId` 拼链接和跳转路径

**Bug 2：Git commit 日志截断**

- **根因**：原来打印 `git commit` 命令的 stdout 第一行（形如 `[main (root-commit) abc1234] v1 by...`），截断明显
- **修法**：commit 后单独执行 `git log -1 --format="%H"` 取完整 hash，日志改为 `Git commit：abc1234ef (v1)` 格式

**Bug 3：`/:gameId(*)/versions` 路由被通配符吞掉**

- **根因**：Express 的 `/:gameId(*)` 贪婪匹配，把 `/versions` 后缀也纳入了 `gameId`，导致版本历史 API 始终返回 404
- **修法**：`/versions` 路由改用正则 `/^\/(.+)\/versions$/`，并调整顺序放到通配符路由之前

**Bug 4：`sanitizeName` 对纯中文输入返回空字符串**

- **根因**：用户在「你的名字」填中文（如「小明」），sanitize 后为空字符串，拼出的 `gameId` 形如 `/word-match`（含前置斜杠），导致路由和链接均异常
- **修法**：`sanitizeName` 结果为空时 fallback 为 `"user"`；前端对「游戏标识」字段加格式校验，必须包含至少一个英文字母或数字

**Bug 5：iframe 内链接可能打开管理后台**

- **根因**：游戏 iframe 没有沙箱限制，若游戏内有 `<a>` 或 JS 触发导航，可能在 iframe 内打开管理后台页面
- **修法**：给 iframe 加 `sandbox="allow-scripts allow-same-origin"`，禁止顶层导航，脚本和同源请求正常保留

---

### 体验优化

**1. 部署表单字段重命名**

| 旧字段 | 新字段 | 原因 |
|---|---|---|
| `开发者 ID (userId)` | `你的名字` | 面向非技术产品经理，原名过于技术化 |
| `游戏标识 (gameName)` | `游戏标识`（加说明文字） | 保留技术标识概念，增加「只能用英文字母和数字，用于生成访问链接」说明 |

**2. 新增「游戏名称」字段**

部署表单增加「游戏名称」（展示用，可中文，选填）输入框，存入 `games.name`，在游戏列表卡片和详情页标题中展示。原来卡片只显示技术标识（`word-match`），现在可显示中文名（`单词对对碰`）。

**3. 部署成功后 5 秒自动跳转详情页**

部署成功后不再停留在日志页等待用户点击，改为显示倒计时 `N 秒后自动跳转到详情页...`，5 秒后自动导航。保留「立即查看详情」和「去玩游戏」按钮供用户提前操作。

---

### 涉及文件

| 文件 | 变更说明 |
|---|---|
| `web/src/pages/Deploy.tsx` | 单文件支持、表单重构、loading 状态、自动跳转、gameId 修复 |
| `web/src/components/LogViewer.tsx` | `onComplete` 回调签名由 `() => void` 改为 `(msg: LogMessage) => void`，透传 done 事件数据 |
| `web/src/components/VersionHistory.tsx` | 适配新 `onComplete` 签名 |
| `web/src/types.ts` | `LogMessage` 新增 `gameId?: string` 字段 |
| `server/src/routes/deploy.ts` | `done()` 附带 `gameId`；接收并透传 `displayName` 字段 |
| `server/src/routes/games.ts` | `/versions` 路由改用正则并前置；修复通配符路由顺序 |
| `server/src/services/deployer.ts` | commit hash 取法修正；`sanitizeName` 空值 fallback；`getOrCreateGame` 接收 `displayName`；rollback 空 commit 静默处理 |

---

## 2026-05-14 — 部署验证、删除功能上线、Bug 修复（第二轮）

### 背景

部署最新 main 分支后通过浏览器全流程体验，发现并修复多处遗留 Bug，同时将 `feature/version-slots` 分支中已开发的游戏删除/锁定功能移植到 main。

---

### 新功能：游戏锁定 / 解锁 / 删除

**变更文件**：`server/src/db.ts`、`server/src/routes/games.ts`、`web/src/pages/GameDetail.tsx`、`web/src/types.ts`

| 功能 | 说明 |
|---|---|
| 🔒 锁定 | 游戏详情页右上角「锁定」按钮，锁定后禁止删除，防止误操作 |
| 🔓 解锁 | 锁定状态下按钮变为「解锁」，解锁后删除按钮恢复可用 |
| 🗑️ 删除 | 二次确认后删除游戏及所有版本历史，成功后跳回列表页 |

**后端**：`games` 表新增 `locked INTEGER DEFAULT 0` 列；`PATCH /api/games/:id` 支持 `locked` 字段；新增 `DELETE /api/games/:id` 路由（已锁定时返回 403）。
**数据库迁移**：通过 `ALTER TABLE games ADD COLUMN locked` 对已有库做幂等迁移，列已存在时 catch 并忽略错误。

---

### Bug 修复

**Bug 1：历史脏数据 — gameId 以 `/` 开头（`/word-match-v2`）**

- **根因**：早期 `sanitizeName` 尚未加 fallback，纯中文用户名经 sanitize 得到空字符串，拼出 `gameId = "/word-match-v2"`，导致游戏列表项链接异常、详情页 iframe 加载管理后台自身
- **处理**：直接在 VPS SQLite 中删除该条脏记录及对应文件目录（`/opt/www/word-match-v2`、`/opt/repos/word-match-v2.git`）

**Bug 2：`game.locked` 是 SQLite integer，React JSX 中 `{0 && ...}` 会把数字 `0` 渲染为文字**

- **现象**：游戏标题显示 `0测试游戏`
- **根因**：SQLite 返回的 `locked` 字段是 `0`/`1`（integer），React 渲染 `{game.locked && <span>🔒</span>}` 时，`0` 在 JSX 中是 falsy 但会被渲染成字符 `"0"`
- **修法**：所有判断 `game.locked` 的地方改用 `!!game.locked` 强制转布尔

**Bug 3：`deploy.ts` 中存在无 fallback 的 sanitize 重复实现**

- **根因**：`deploy.ts` 里 inline 了一份 sanitize 逻辑（用于计算 lockKey 和返回给前端的 gameId），但这份拷贝没有 `|| "user"` fallback。上一轮只修了 `deployer.ts`，`deploy.ts` 里的那份漏改，导致中文用户名的 safeUser 仍是空字符串
- **现象**：`"体验者"` 部署后 gameId 返回 `/del-test`，前端跳转 `/game/%2Fdel-test`，详情页数据全空
- **修法**：将 `deployer.ts` 中的 `sanitizeName` 改为 `export`，`deploy.ts` 直接 import 复用，彻底消除重复

**教训**：同一逻辑存在多份拷贝是根本风险。修 Bug 时必须全局搜索同类实现，不能只改找到的第一处。

---

### 其他清理

| 项目 | 内容 |
|---|---|
| `.gitignore` | 新增 `.playwright-mcp/`、`*.png`、`*.jpeg`、`*.jpg`，防止自动化测试截图被误提交 |
| 游戏标识说明文案 | 「只能用英文字母和数字」→「只能用英文字母、数字和连字符」（与实际校验逻辑一致） |
| `resetForm` 漏清空 `uploader` | 「继续部署」点击后「你的名字」字段残留上一次输入，补上 `setUploader('')` |

---

### 涉及提交

| commit | 说明 |
|---|---|
| `67c9067` | chore: 忽略 playwright 临时文件及截图 |
| `4be5fbc` | fix: 修正游戏标识说明文案（允许连字符），修复「继续部署」未清空名字字段 |
| `281ecf9` | feat: 游戏详情页增加锁定/解锁和删除功能 |
| `afa2c18` | fix: locked 字段为 SQLite integer，用 `!!` 转布尔防止数字 0 被渲染 |
| `8ae2707` | fix: 复用 `sanitizeName`（含 fallback），消除 `deploy.ts` 中无 fallback 的重复实现 |
