# Game Manager — 设计文档

## 一、需求

### 目标
搭建一个游戏托管服务器，供**非技术产品人员**部署和体验 HTML/JS/TS 前端小游戏。

### 用户场景

**部署游戏（产品经理操作）**
1. 打开管理网页
2. 填写用户名、游戏名，拖拽上传游戏 ZIP 包
3. 点击部署，实时查看部署日志和进度
4. 部署完成后，直接点击链接体验游玩

**版本管理**
- 每次部署自动生成一个版本（v1、v2、v3…）
- 可在版本历史中查看所有历史部署
- 支持一键回滚到任意历史版本

**游戏列表**
- 展示所有游戏（卡片式）
- 支持按名称搜索
- 支持自定义标签分组（如：益智、休闲、动作）
- 点击游戏直接进入体验

### 核心约束
- 游戏均为纯前端页面，无后端、无数据库
- 用户不懂 Git，不接触服务器
- 服务器在国内，目标用户在国内
- 需要部署日志持久化（按日滚动归档）

---

## 二、架构

### 基础设施
| 组件 | 规格 |
|---|---|
| 服务器 | 阿里云 Ubuntu 24.04，2 vCPU，2 GiB RAM，40 GiB 磁盘，3 Mbps 带宽 |
| 反向代理 | Nginx（静态托管 + 后台代理） |
| 后端 | Node.js + Express + TypeScript |
| 前端 | React + Vite + TypeScript |
| 数据库 | SQLite（游戏元数据 + 版本记录） |
| 版本控制 | Git bare repo（每个游戏独立仓库） |
| 进程管理 | PM2 |
| 日志 | Winston + daily-rotate-file |

### 系统结构

```
产品经理（浏览器）
    │  上传 ZIP / 查看列表 / 体验游玩
    ▼
Nginx（47.93.180.91:80）
    ├── /              → 管理后台 UI（静态）
    ├── /api           → Node.js 后端（port 3000）
    └── /games/{user}/{game}/  → 游戏静态文件
                                  /opt/www/{user}/{game}/live/
Node.js 后端
    ├── 接收 ZIP → 解压 → git commit → 原子替换 live 目录
    ├── SSE 实时推送部署日志
    └── SQLite 读写游戏元数据 / 版本记录
```

### 服务器目录

```
/opt/
├── repos/                        # Git bare 仓库（版本存储）
│   └── {user}/{game}.git/
├── www/                          # Nginx 托管目录
│   └── {user}/{game}/live/       # 当前版本（nginx root）
└── game-manager/                 # 应用本体
    ├── server/                   # Node.js 后端
    ├── web/                      # 前端构建产物
    └── data/games.db             # SQLite

/var/log/game-manager/
├── deploy-YYYY-MM-DD.log         # 按日滚动，自动 gzip 压缩
└── error-YYYY-MM-DD.log
```

### 代码仓库结构

```
game-manager/
├── .github/workflows/
│   └── deploy-server.yml         # 后台自身的 CI/CD
├── server/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── upload.ts         # ZIP 上传 + 进度
│   │   │   ├── deploy.ts         # 部署触发 + SSE 日志流
│   │   │   └── games.ts          # 游戏列表 CRUD
│   │   ├── services/
│   │   │   ├── deployer.ts       # 解压 / git commit / nginx reload
│   │   │   └── logger.ts         # Winston 日志
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── GameList.tsx      # 游戏列表 / 搜索 / 标签
│   │   │   ├── Deploy.tsx        # 上传工作台
│   │   │   └── Play.tsx          # 游戏播放页
│   │   └── components/
│   │       ├── LogViewer.tsx     # SSE 实时日志
│   │       └── VersionHistory.tsx# 版本历史 + 回滚
│   ├── package.json
│   └── vite.config.ts
├── nginx/
│   └── game-manager.conf
└── scripts/
    ├── install.sh                # VPS 一键初始化
    └── setup-ssh-deploy.sh       # 配置 SSH deploy key
```

---

## 三、核心流程

### 部署流程

```
1. PM 填写游戏信息，上传 ZIP
2. POST /api/deploy（multipart）
3. 服务端：
   a. 解压 ZIP → /tmp/deploy-{uuid}/
   b. git add -A && git commit -m "v{N} by {user} at {time}"
      git tag v{N}
      → /opt/repos/{user}/{game}.git
   c. rsync staging → live（原子替换，零停机）
   d. INSERT INTO versions (game_id, version_num, commit_hash, ...)
4. SSE 实时推送每步日志到浏览器
5. 清理临时目录
```

### 回滚流程

```
1. PM 在版本历史中点击「回滚到 vN」
2. POST /api/games/:gameId/rollback { version: N }
3. 服务端：
   a. git checkout v{N} → /tmp/rollback-{uuid}/
   b. rsync → live（原子替换）
   c. INSERT versions: v{N+1}, is_rollback=true, rollback_to=N
4. SSE 推送回滚日志
```

### 版本历史

- **文件内容**：存于 Git，每版本对应一个 commit + tag
- **展示元数据**：存于 SQLite（版本号、时间、操作人、状态）
- **回滚**：checkout 旧 tag + 原子替换，回滚本身记为新版本（审计链完整）

---

## 四、数据模型

```sql
CREATE TABLE games (
    id          TEXT PRIMARY KEY,   -- "{user}/{game}"
    name        TEXT NOT NULL,
    user_name   TEXT NOT NULL,
    tags        TEXT,               -- JSON array
    cover_url   TEXT,
    repo_path   TEXT NOT NULL,      -- /opt/repos/{user}/{game}.git
    www_path    TEXT NOT NULL,      -- /opt/www/{user}/{game}/live
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     TEXT NOT NULL REFERENCES games(id),
    version_num INTEGER NOT NULL,
    commit_hash TEXT NOT NULL,
    git_tag     TEXT NOT NULL,      -- "v1", "v2"
    deployed_by TEXT NOT NULL,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status      TEXT DEFAULT 'deploying', -- deploying | live | failed | rolled_back
    is_rollback BOOLEAN DEFAULT FALSE,
    rollback_to INTEGER,
    file_size_kb INTEGER,
    UNIQUE(game_id, version_num)
);
```

---

## 五、Nginx 配置

```nginx
server {
    listen 80;
    server_name 47.93.180.91;

    # 管理后台
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }

    # SSE（禁用缓冲）
    location /api/deploy/logs {
        proxy_pass http://127.0.0.1:3000;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
    }

    # 游戏静态文件
    location ~ ^/games/([^/]+)/([^/]+)/ {
        alias /opt/www/$1/$2/live/;
        try_files $uri $uri/ /games/$1/$2/index.html;
        expires 1h;
        add_header Cache-Control "public";
    }

    # 游戏入口（index.html 不缓存）
    location ~ ^/games/([^/]+)/([^/]+)/index\.html$ {
        alias /opt/www/$1/$2/live/index.html;
        add_header Cache-Control "no-cache";
    }
}
```

---

## 六、CI/CD

game-manager **后台自身**通过 GitHub Actions 自动部署到 VPS。游戏内容的部署完全在服务器本地完成，不经过 GitHub。

```yaml
# .github/workflows/deploy-server.yml
name: Deploy Game Manager

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd server && npm ci && npm run build
      - run: cd web && npm ci && npm run build
      - name: Sync to VPS
        uses: burnett01/rsync-deployments@v8
        with:
          switches: -avzr --delete
          path: ./
          remote_path: /opt/game-manager/
          remote_host: ${{ secrets.VPS_HOST }}
          remote_user: ${{ secrets.VPS_USER }}
          remote_key: ${{ secrets.DEPLOY_KEY }}
      - name: Restart
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: pm2 restart game-manager || pm2 start /opt/game-manager/server/dist/index.js --name game-manager
```

---

## 七、技术选型说明

| 决策 | 选择 | 原因 |
|---|---|---|
| 游戏托管 | 自托管 VPS + Nginx | 国内访问无障碍；GitHub Pages/Vercel 国内不稳定；Gitee Pages 已下线 |
| 版本控制 | Git bare repo（服务端本地） | 无外部依赖；操作简单；不需要 GitHub 账号 |
| 实时日志 | SSE（Server-Sent Events） | 单向推送天然适合日志场景；穿透 Nginx 代理；浏览器自动重连 |
| 文件上传 | busboy（流式） | 不缓冲大文件；内存占用低 |
| 元数据存储 | SQLite | 零运维；2GB 内存友好；无需独立数据库进程 |
| 并发安全 | per-game 互斥锁 | Git 不支持并发写同一仓库 |
| 进程管理 | PM2 | 崩溃自重启；比 Docker 轻量；适合 2GB 内存 |

---

## 八、风险与对策

| 风险 | 对策 |
|---|---|
| 磁盘占满 | cron 监控磁盘使用率，>80% 时写日志告警 |
| 并发部署损坏 git | per-game 互斥锁，队列化处理 |
| ZIP 恶意文件 | 限制解压后体积 ≤500MB；过滤 `../` 路径穿越；拒绝非 web 文件 |
| nginx 缓存旧版本 | `index.html` 设 `no-cache`；资源文件用构建 hash 命名 |
| 3Mbps 带宽瓶颈 | 游戏包控制在 10MB 以内；静态资源浏览器缓存后二次访问瞬开 |

---

## 九、开发里程碑

| 优先级 | 内容 |
|---|---|
| P0 | VPS 环境初始化（Nginx、Node.js、PM2、Git） |
| P0 | SSH 免密登录配置 |
| P0 | 后端核心：ZIP 上传 → git commit → 部署 → SSE 日志 |
| P0 | 前端：上传工作台 + 实时日志展示 |
| P1 | 版本历史页面 + 回滚功能 |
| P1 | 游戏列表：搜索 + 标签分组 |
| P1 | Winston 日志滚动归档 |
| P2 | game-manager 后台 GitHub Actions CI/CD |
| P2 | 游戏封面图截图预览 |
