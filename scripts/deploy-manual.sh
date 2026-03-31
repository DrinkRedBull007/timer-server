#!/bin/bash
# 手动部署脚本 - 用于本地一键部署到服务器

set -e

# 配置（请根据实际情况修改）
SERVER_HOST="${SERVER_HOST:-8.146.237.94}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_DIR="/opt/timer-server"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚀 手动部署到服务器${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "服务器: ${YELLOW}$SERVER_USER@$SERVER_HOST${NC}"
echo -e "目录: ${YELLOW}$SERVER_DIR${NC}"
echo ""

# 检查 SSH 连接
echo -e "${BLUE}[1/4] 检查 SSH 连接...${NC}"
if ! ssh -o ConnectTimeout=5 "$SERVER_USER@$SERVER_HOST" "echo 'SSH 连接成功'" > /dev/null 2>&1; then
    echo -e "${RED}❌ SSH 连接失败，请检查:${NC}"
    echo "   1. 服务器地址是否正确"
    echo "   2. SSH 密钥是否已配置"
    echo "   3. 服务器是否可访问"
    exit 1
fi
echo -e "${GREEN}✅ SSH 连接成功${NC}"

# 同步代码
echo ""
echo -e "${BLUE}[2/4] 同步代码到服务器...${NC}"
rsync -avz --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='logs' \
    --exclude='*.log' \
    -e ssh \
    ./timer-server/ \
    "$SERVER_USER@$SERVER_HOST:$SERVER_DIR/timer-server/"

echo -e "${GREEN}✅ 代码同步完成${NC}"

# 安装依赖并重启服务
echo ""
echo -e "${BLUE}[3/4] 安装依赖并重启服务...${NC}"
ssh "$SERVER_USER@$SERVER_HOST" << EOF
    cd $SERVER_DIR/timer-server
    
    echo "安装依赖..."
    npm install --production
    
    echo "重启服务..."
    sudo systemctl restart timer-server
    
    sleep 2
    
    if systemctl is-active --quiet timer-server; then
        echo "服务运行正常"
    else
        echo "服务启动失败"
        exit 1
    fi
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 服务启动失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 服务重启成功${NC}"

# 健康检查
echo ""
echo -e "${BLUE}[4/4] 健康检查...${NC}"
sleep 3
if curl -f "http://$SERVER_HOST:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 健康检查通过${NC}"
else
    echo -e "${RED}❌ 健康检查失败${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "🌐 服务地址: ${YELLOW}http://$SERVER_HOST:3000${NC}"
echo ""
echo "📊 常用命令:"
echo "   查看日志: ssh $SERVER_USER@$SERVER_HOST 'journalctl -u timer-server -f'"
echo "   查看状态: ssh $SERVER_USER@$SERVER_HOST 'systemctl status timer-server'"
echo ""
