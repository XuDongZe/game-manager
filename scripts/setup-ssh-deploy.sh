#!/usr/bin/env bash
# setup-ssh-deploy.sh
# 在本地开发机上运行，生成 ED25519 部署密钥并配置到 VPS
# 用法：bash setup-ssh-deploy.sh <VPS_IP> <VPS_USER>
# 示例：bash setup-ssh-deploy.sh 47.93.180.91 root
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }
step() { echo -e "${CYAN}[STEP]${NC}  $*"; }

VPS_IP="${1:-}"
VPS_USER="${2:-root}"
KEY_NAME="game-manager-deploy"
KEY_PATH="$HOME/.ssh/${KEY_NAME}"

[[ -z "$VPS_IP" ]] && err "请提供 VPS IP 地址\n用法：bash setup-ssh-deploy.sh <VPS_IP> [VPS_USER]"

step "1/4 生成 ED25519 部署密钥..."
if [[ -f "$KEY_PATH" ]]; then
  warn "密钥已存在：$KEY_PATH，跳过生成"
else
  ssh-keygen -t ed25519 -C "game-manager-deploy@$(date +%Y%m%d)" -f "$KEY_PATH" -N ""
  log "密钥已生成：$KEY_PATH"
fi

step "2/4 将公钥上传到 VPS（需要输入 VPS 密码）..."
ssh-copy-id -i "${KEY_PATH}.pub" "${VPS_USER}@${VPS_IP}"
log "公钥已上传"

step "3/4 验证免密登录..."
if ssh -i "$KEY_PATH" -o BatchMode=yes -o ConnectTimeout=5 "${VPS_USER}@${VPS_IP}" "echo ok" &>/dev/null; then
  log "免密登录验证通过 ✓"
else
  err "免密登录验证失败，请手动检查"
fi

step "4/4 输出 GitHub Actions Secret 配置..."
echo ""
echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}  GitHub Actions Secrets 配置（在仓库 Settings 中添加）${NC}"
echo -e "${CYAN}======================================================${NC}"
echo ""
echo -e "  ${YELLOW}Secret 名称${NC}       ${YELLOW}值${NC}"
echo    "  ─────────────────────────────────────────────"
echo -e "  VPS_HOST          ${GREEN}${VPS_IP}${NC}"
echo -e "  VPS_USER          ${GREEN}${VPS_USER}${NC}"
echo    "  DEPLOY_KEY        （见下方私钥内容）"
echo ""
echo -e "${YELLOW}私钥内容（完整复制，包含 BEGIN/END 行）：${NC}"
echo "─────────────────────────────────────────────"
cat "$KEY_PATH"
echo "─────────────────────────────────────────────"
echo ""

step "本地 SSH config 配置（可选，方便 ssh game-manager 直连）..."
SSH_CONFIG="$HOME/.ssh/config"
if ! grep -q "Host game-manager" "$SSH_CONFIG" 2>/dev/null; then
  cat >> "$SSH_CONFIG" << EOF

Host game-manager
  HostName ${VPS_IP}
  User ${VPS_USER}
  IdentityFile ${KEY_PATH}
  ServerAliveInterval 60
EOF
  log "已添加 SSH 别名：ssh game-manager"
else
  warn "SSH config 中已有 game-manager 条目，跳过"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SSH 部署密钥配置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  快速连接 VPS：ssh game-manager"
echo ""
