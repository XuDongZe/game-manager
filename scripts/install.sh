#!/usr/bin/env bash
# =============================================================================
# Game Manager — VPS 一键初始化脚本
# 适用系统：Ubuntu 24.04 LTS
# 用法：sudo bash install.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

[[ $EUID -ne 0 ]] && err "请以 root 权限运行：sudo bash install.sh"

# ─── 1. 系统依赖 ──────────────────────────────────────────────────────────────
log "更新系统包列表..."
apt-get update -qq

log "安装基础依赖..."
apt-get install -y -qq curl wget git rsync unzip nginx sqlite3

# ─── 2. Node.js 20 LTS ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  log "安装 Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
else
  log "Node.js 已安装：$(node -v)"
fi

# ─── 3. PM2 ───────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "安装 PM2..."
  npm install -g pm2 --quiet
  pm2 startup systemd -u root --hp /root | tail -1 | bash || true
else
  log "PM2 已安装：$(pm2 -v)"
fi

# ─── 4. 目录结构 ──────────────────────────────────────────────────────────────
log "创建服务器目录结构..."
mkdir -p /opt/repos
mkdir -p /opt/www
mkdir -p /opt/game-manager/data
mkdir -p /var/log/game-manager

chmod 755 /opt/repos /opt/www /opt/game-manager
chmod 755 /var/log/game-manager

# ─── 5. Git 全局配置 ──────────────────────────────────────────────────────────
log "配置 Git..."
git config --global user.name  "Game Manager"
git config --global user.email "game-manager@localhost"
git config --global init.defaultBranch main

# ─── 6. Nginx 配置 ────────────────────────────────────────────────────────────
log "配置 Nginx..."
NGINX_CONF=/etc/nginx/sites-available/game-manager

cat > "$NGINX_CONF" << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    # 管理后台静态文件
    location / {
        root /opt/game-manager/web;
        try_files $uri $uri/ /index.html;
        expires -1;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        client_max_body_size 600m;
    }

    # SSE 部署日志流（禁用缓冲）
    location /api/deploy/logs {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
    }

    # 游戏静态文件（带缓存）
    location ~ ^/games/([^/]+)/([^/]+)/(.+)$ {
        alias /opt/www/$1/$2/live/$3;
        try_files $uri =404;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # 游戏入口 index.html（不缓存，保证新版本立即生效）
    location ~ ^/games/([^/]+)/([^/]+)/$ {
        alias /opt/www/$1/$2/live/;
        try_files index.html =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
NGINX_EOF

# 启用站点，禁用默认站点
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/game-manager
rm -f /etc/nginx/sites-enabled/default

# 测试并重启 Nginx
nginx -t && systemctl reload nginx
log "Nginx 配置完成"

# ─── 7. 日志目录权限 ──────────────────────────────────────────────────────────
log "配置日志目录..."
chown -R root:root /var/log/game-manager

# ─── 8. 磁盘监控 cron ─────────────────────────────────────────────────────────
log "设置磁盘使用率监控 cron..."
CRON_JOB='*/30 * * * * df -h / | awk '\''NR==2{gsub(/%/,"",$5); if($5+0>80) print "[WARN] 磁盘使用率超过 80%: "$5"%"}'\'' >> /var/log/game-manager/disk-monitor.log 2>&1'

# 添加到 crontab（避免重复）
(crontab -l 2>/dev/null | grep -v 'disk-monitor' ; echo "$CRON_JOB") | crontab -

# ─── 9. 防火墙（ufw） ─────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  log "配置防火墙..."
  ufw allow 22/tcp   comment 'SSH'   || true
  ufw allow 80/tcp   comment 'HTTP'  || true
  ufw allow 443/tcp  comment 'HTTPS' || true
  # 3000 端口只允许本地访问，不对外暴露
  ufw --force enable || true
fi

# ─── 完成 ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  VPS 初始化完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Node.js : $(node -v)"
echo "  npm     : $(npm -v)"
echo "  PM2     : $(pm2 -v)"
echo "  Git     : $(git --version)"
echo "  Nginx   : $(nginx -v 2>&1)"
echo ""
echo "  目录结构："
echo "    /opt/repos/          ← Git bare 仓库"
echo "    /opt/www/            ← Nginx 托管游戏目录"
echo "    /opt/game-manager/   ← 应用本体"
echo "    /var/log/game-manager/ ← 日志"
echo ""
echo "  下一步：运行 setup-ssh-deploy.sh 配置 SSH 部署密钥"
echo ""
