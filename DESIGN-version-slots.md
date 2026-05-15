# 版本体验 Slot 功能设计文档

## 一、背景与目标

### 现有问题

当前版本管理是**运维视角**：部署、回滚、审计日志。  
所有游戏只有一个 `live/` 目录，"切换版本"等于全局替换内容，用户无法同时访问多个版本。

### 目标

让产品人员可以**快速在多个版本之间切换体验**，对比差异，无需等待部署/回滚。

### 限制条件

**游戏内只能使用相对路径引用资源。** Slot 和 preview 的 URL 深度与 live 不同，若游戏内硬编码了 `/games/{user}/{game}/...` 绝对路径，或构建工具设置了固定 `publicPath`，资源请求仍会走向 live 目录，版本隔离失效。部署校验阶段建议扫描 HTML/JS 中是否存在 `/games/` 开头的绝对路径引用并给出警告。

---

## 二、核心模型

### 两条独立轨道

```
live/          → 当前正式版本（由部署/回滚决定，不受 slot 影响）
slot-1/        → 用户手动绑定的体验位（懒加载，绑定时才占用磁盘）
slot-2/        → 用户手动绑定的体验位
...            → 全局配置 MAX_SLOTS 个（默认 2）
```

`live` 和 `slot` 完全独立，互不干扰。

### Slot 生命周期

```
[空] ──(用户预览某版本后手动绑定)──→ [已绑定: vN]
  ↑                                        │
  └──────────(用户手动清空)─────────────────┘
                                           │
                          新版本部署后 slot 内容不变
                          但前端显示"与 live 版本不同"提示
```

### 用户操作流

1. 在版本历史表格中，点击某版本的 **「预览」** → iframe 加载 `/games/{id}/preview/v{N}-{ts}/`（临时 checkout，不写 slot）
2. 预览满意后，点击 **「绑定到体验位」** → 选择 slot-1 或 slot-2 → 后端 git checkout 写入对应 slot 目录
3. 前端版本 tab 切换：`[live: v5]  [slot-1: v3 ⚠]  [slot-2: 空]`
4. 可对版本添加**备注标签**（如"旧关卡设计"、"测试版音效"）

---

## 三、URL 设计

| 路径 | 内容 | 说明 |
|------|------|------|
| `/games/{user}/{game}/` | live 版本 | 现有，不变 |
| `/games/{user}/{game}/slot/1/` | slot-1 绑定版本 | 新增 |
| `/games/{user}/{game}/slot/2/` | slot-2 绑定版本 | 新增 |
| `/games/{user}/{game}/preview/v{N}-{ts}/` | 临时预览（按需） | 新增，目录含时间戳避免多用户共享冲突 |

Slot URL 固定，资源内容随绑定关系变化（用户无感知）。

---

## 四、磁盘结构

```
/opt/www/{user}/{game}/
  ├── live/                     # 当前正式版本（现有）
  ├── slot-1/                   # 体验位1（空 = 目录不存在）
  ├── slot-2/                   # 体验位2（空 = 目录不存在）
  └── preview/
      └── v3-1715000000000/     # 临时预览目录（含时间戳，TTL 后自动删除）
```

**懒加载原则**：slot 目录在用户首次绑定时才通过 `git checkout` 创建，空槽不占磁盘。

**路径推导**：`games.www_path` 字段存储的是 `live/` 的完整路径（`/opt/www/{user}/{game}/live`）。所有 slot/preview 操作需通过 `path.dirname(game.www_path)` 获取游戏根目录，不得直接修改 `www_path` 字段的含义（避免破坏现有 deploy/rollback 逻辑）。

---

## 五、数据模型变更

### 5.1 versions 表新增字段

```sql
ALTER TABLE versions ADD COLUMN notes TEXT DEFAULT NULL;
-- 用户为版本添加的备注标签，如"旧关卡设计"
```

### 5.2 新增 game_slots 表

```sql
CREATE TABLE IF NOT EXISTS game_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     TEXT    NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slot_index  INTEGER NOT NULL,          -- 1, 2, ...MAX_SLOTS
  version_num INTEGER,                   -- 绑定的版本号，NULL = 空槽
  commit_hash TEXT,                      -- 绑定时的 commit hash，用于 live 差异判断
  bound_by    TEXT,
  bound_at    DATETIME,
  UNIQUE(game_id, slot_index)
);
```

> `ON DELETE CASCADE`：删除游戏时自动清理 slot 记录。删除游戏的 API 还需额外清理磁盘上的 `slot-*/` 和 `preview/` 目录。

### 5.3 全局配置

`server/src/config.ts`（新建）：

```ts
export const MAX_SLOTS = parseInt(process.env.MAX_SLOTS ?? "2", 10);
export const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000; // 预览目录 2 小时后清理
```

---

## 六、后端 API

### 6.1 查询 slot 状态

```
GET /api/games/:gameId/slots
```

响应：

```json
[
  {
    "slot_index": 1,
    "version_num": 3,
    "bound_by": "alice",
    "bound_at": "2026-05-14T10:00:00Z",
    "is_same_as_live": false
  },
  {
    "slot_index": 2,
    "version_num": null,
    "bound_by": null,
    "bound_at": null,
    "is_same_as_live": null
  }
]
```

`is_same_as_live`：通过比较 `slot.commit_hash === live_version.commit_hash` 计算，而非版本号差值。原因：回滚操作会产生新版本号但内容可能与旧版本相同，版本号差值在此场景下具有误导性。

接口同时做磁盘一致性校验：若磁盘目录存在但 DB 无记录（或反之），对应槽返回 `"status": "orphan"`，提示用户手动清理。

### 6.2 绑定版本到 slot（SSE，有日志流）

```
POST /api/games/:gameId/slots/:slotIndex/bind
Content-Type: application/json

{ "version_num": 3, "operator": "alice" }
```

后端流程：
1. 校验 `slot_index` 合法（`1 ≤ N ≤ MAX_SLOTS`）
2. 校验 `version_num` 存在且 `status IN ('live', 'rolled_back')`（排除 `failed`、`deploying`）
3. 纳入 `withLock(gameId)` 防止与 deploy/rollback/preview 并发操作 git
4. `git checkout v{N}` → `path.dirname(game.www_path)/slot-{N}/`（rsync 原子替换）
5. 先写磁盘，成功后再更新 `game_slots` 表（含 `commit_hash`）；磁盘失败则不更新 DB
6. SSE 推送进度，完成后 `{ done: true, ok: true }`

### 6.3 清空 slot

```
DELETE /api/games/:gameId/slots/:slotIndex
```

后端顺序：**先删 DB 记录，再删磁盘目录。**  
（若先删磁盘后 DB 更新失败，DB 仍显示已绑定但访问 404；先删 DB 则最差情况仅多占磁盘空间。）

### 6.4 临时预览（按需 checkout）

```
POST /api/games/:gameId/preview
Content-Type: application/json

{ "version_num": 3 }
```

后端：
1. 纳入 `withLock(gameId)` 防并发 git 冲突
2. 生成目录名：`v{N}-{Date.now()}`（含时间戳，每次 checkout 独立目录，避免多用户共享同一目录时的清理冲突）
3. `git checkout v{N}` → `path.dirname(game.www_path)/preview/v{N}-{ts}/`
4. 返回 `{ "url": "/games/{gameId}/preview/v{N}-{ts}/" }`

**TTL 清理**：服务启动时注册 `setInterval`，每 10 分钟扫描 `preview/` 下的目录，删除创建时间超过 `PREVIEW_TTL_MS`（2 小时）的目录。使用目录名中的时间戳判断，无需额外状态存储。

### 6.5 添加版本备注

```
PATCH /api/games/:gameId/versions/:versionNum
Content-Type: application/json

{ "notes": "旧关卡设计" }
```

---

## 七、Nginx 配置变更

**顺序要求**：slot 和 preview 的 location **必须放在现有泛匹配 `(.+)` 规则之前**，否则所有请求会被现有规则优先捕获，新规则永远不会命中。

在现有 `game-manager.conf` 的泛匹配规则**之前**插入：

```nginx
# Slot 体验位（固定 URL，内容随绑定变化）
# 注意：必须位于现有 /games/.../(.+) 规则之前
location ~ ^/games/([^/]+)/([^/]+)/slot/(\d+)/ {
    alias /opt/www/$1/$2/slot-$3/;
    try_files $uri $uri/index.html =404;
    expires 0;
    add_header Cache-Control "no-cache";
}

# 临时预览版本（目录名含时间戳）
location ~ ^/games/([^/]+)/([^/]+)/preview/([^/]+)/ {
    alias /opt/www/$1/$2/preview/$3/;
    try_files $uri $uri/index.html =404;
    expires 0;
    add_header Cache-Control "no-cache";
}
```

`try_files` 使用 `$uri/index.html =404` 相对路径写法，避免在 fallback 阶段引用已失效的正则捕获变量 `$1/$2/$3`。

Slot 和预览目录均设 `no-cache`，确保绑定后立即生效。

---

## 八、前端变更

### 8.1 GameDetail.tsx — 版本 Tab

在游戏预览 iframe 上方新增版本切换 tab：

```
[live: v5]  [slot-1: v3 ⚠]  [slot-2: 空槽]
```

- **live**：始终存在，点击切换 iframe src 到 `/games/{id}/`
- **slot-N（已绑定）**：显示版本号；若 `is_same_as_live = false` 则显示 ⚠ 提示"与 live 版本不同"
- **slot-N（空槽）**：显示"+ 绑定版本"，仅当用户正在预览某版本时可点击
- 点击 tab 只改变 iframe `src`，无后端请求

### 8.2 VersionHistory.tsx — 操作列扩展

每个版本行新增操作按钮：

| 按钮 | 条件 | 行为 |
|------|------|------|
| 预览 | 所有版本 | POST `/preview` → 更新 iframe src（不占 slot） |
| 绑定到体验位 | 当前正在预览该版本时才显示 | 弹出 slot 选择器 → POST `/slots/:N/bind`（SSE） |
| 回滚至此版本 | 现有逻辑，不变 | 现有 |

版本备注：每行可展开编辑 `notes` 字段（PATCH）。

### 8.3 新增类型定义（types.ts）

```ts
export interface GameSlot {
  slot_index: number;
  version_num: number | null;
  commit_hash: string | null;
  bound_by: string | null;
  bound_at: string | null;
  is_same_as_live: boolean | null;
  status?: 'ok' | 'orphan';  // 磁盘/DB 不一致时为 'orphan'
}
```

---

## 九、与现有实现的兼容性

| 现有模块 | 是否改动 | 说明 |
|----------|----------|------|
| `deployer.ts` deploy() | **不改** | live 逻辑完全不变 |
| `deployer.ts` rollback() | **不改** | 复用 git checkout 逻辑到新 `bindSlot()` 函数 |
| `routes/deploy.ts` | **不改** | 新增 routes/slots.ts 独立维护 |
| `routes/games.ts` | **小改** | 新增 `PATCH /:gameId/versions/:vN` 备注接口；DELETE 游戏时补充清理磁盘 slot/preview 目录 |
| `db.ts` | **小改** | 新增建表语句 + versions 表 ALTER + `ON DELETE CASCADE` |
| `nginx.conf` | **插入** | 在泛匹配规则之前插入两条 location，不修改现有规则 |
| `GameDetail.tsx` | **扩展** | 新增 tab 组件，iframe 逻辑不变 |
| `VersionHistory.tsx` | **扩展** | 新增按钮列，现有回滚逻辑不变 |

**零破坏性**：live 路径、现有 API、回滚流程均不受影响。

---

## 十、开发任务分解

### P0 — 核心链路

- [ ] `db.ts`：新增 `game_slots` 表（含 `commit_hash`、`ON DELETE CASCADE`）+ `versions.notes` 字段
- [ ] `server/src/config.ts`：MAX_SLOTS、PREVIEW_TTL_MS 配置
- [ ] `services/deployer.ts`：新增 `bindSlot()` 函数，使用 `path.dirname(game.www_path)` 推导根目录
- [ ] `routes/slots.ts`：GET slots（含磁盘一致性校验）、POST bind（SSE + withLock）、DELETE slot（先删 DB 再删磁盘）
- [ ] `routes/slots.ts`：POST preview（withLock + 时间戳目录名 + TTL 定时清理）
- [ ] `server/src/index.ts`：挂载 `/api/games/:gameId/slots` 路由
- [ ] `nginx.conf`：在泛匹配规则前插入 slot + preview location（使用相对路径 `try_files`）
- [ ] `GameDetail.tsx`：版本 tab 组件 + iframe src 切换 + `is_same_as_live` ⚠ 提示
- [ ] `VersionHistory.tsx`：「预览」按钮 + 预览态激活后显示「绑定」按钮

### P1 — 完善体验

- [ ] `routes/games.ts`：PATCH versions/:vN 备注接口
- [ ] `routes/games.ts`：DELETE 游戏时清理磁盘 slot/preview 目录
- [ ] `VersionHistory.tsx`：备注标签编辑
- [ ] 前端：slot 绑定进度 SSE 日志展示（复用 LogViewer 组件）
- [ ] 前端：`orphan` 状态的异常提示 + 一键清理入口

### P2 — 优化

- [ ] 部署校验时扫描游戏文件中的绝对路径引用并给出警告
- [ ] `behind_by` 的前端文案优化（"与 live 内容一致" / "与 live 版本不同"）
- [ ] MAX_SLOTS 支持管理后台可视化配置

---

## 十一、风险与对策

| 风险 | 对策 |
|------|------|
| slot/preview 被现有 Nginx 泛匹配拦截 | 新 location 必须位于泛匹配规则之前，部署后 `nginx -s reload` |
| bind / deploy / preview 并发操作 git | 三者均纳入 `withLock(gameId)` 互斥锁 |
| 磁盘写成功但 DB 更新失败（孤儿目录） | GET /slots 做磁盘校验，返回 `orphan` 状态；先写磁盘再写 DB |
| 清空 slot 时顺序错误导致 404 | 先删 DB 再删磁盘 |
| preview 目录共享（多用户同时预览同版本） | 目录名含时间戳，每次 checkout 独立目录 |
| 游戏内绝对路径引用导致 slot 资源指向 live | 文档限制 + 部署时扫描警告 |
| `www_path` 存的是 `live/` 路径，非游戏根目录 | 所有 slot/preview 操作统一用 `path.dirname(game.www_path)` |
| MAX_SLOTS 缩小后已有 slot 超出范围 | GET /slots 返回所有已存在 slot（含超出范围的），提示用户清理 |
