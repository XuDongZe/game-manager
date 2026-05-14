# Game Manager

供非技术产品人员部署和体验 HTML/JS 前端小游戏的托管管理平台。

## 快速连接 VPS

```bash
ssh game-manager
```

## 本地开发

```bash
# 后端
cd server && npm install && npm run dev

# 前端
cd web && npm install && npm run dev
```

## 首次部署（VPS 初始化）

```bash
# 在 VPS 上执行一次
curl -fsSL https://raw.githubusercontent.com/XuDongZe/game-manager/main/scripts/install.sh | sudo bash
```

## CI/CD

push main 分支后 GitHub Actions 自动构建并部署到 VPS。

需在仓库 Settings → Secrets 中配置：

| Secret | 说明 |
|---|---|
| `VPS_HOST` | VPS IP 地址 |
| `VPS_USER` | SSH 用户名 |
| `DEPLOY_KEY` | `setup-ssh-deploy.sh` 输出的私钥内容 |
