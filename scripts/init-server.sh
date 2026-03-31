#!/bin/bash
# 服务器初始化脚本 - 首次部署时使用

set -e

echo "========================================"
echo "🚀 Timer Server 服务器初始化"
echo "========================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}无法检测操作系统${NC}"
    exit 1
fi

echo -e "${YELLOW}检测到操作系统: $OS${NC}"

# 1. 安装 Node.js
echo ""
echo "[1/7] 安装 Node.js..."
if ! command -v node &> /dev/null; then
    if [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ] || [ "$OS" = "alinux" ] || [ "$OS" = "alibaba-cloud-linux" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        echo -e "${RED}不支持的操作系统: $OS${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Node.js 已安装: $(node -v)${NC}"
fi

# 2. 安装 Git
echo ""
echo "[2/7] 安装 Git..."
if ! command -v git &> /dev/null; then
    if [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ] || [ "$OS" = "alinux" ] || [ "$OS" = "alibaba-cloud-linux" ]; then
        yum install -y git
    else
        apt-get install -y git
    fi
else
    echo -e "${GREEN}Git 已安装: $(git --version)${NC}"
fi

# 3. 创建项目目录
echo ""
echo "[3/7] 创建项目目录..."
mkdir -p /opt/timer-server
cd /opt/timer-server

# 4. 克隆代码
echo ""
echo "[4/7] 克隆代码仓库..."
if [ ! -d ".git" ]; then
    read -p "请输入 Git 仓库地址 (默认: https://github.com/DrinkRedBull007/timer-sync.git): " repo_url
    repo_url=${repo_url:-https://github.com/DrinkRedBull007/timer-sync.git}
    git clone "$repo_url" .
else
    echo -e "${GREEN}已有 Git 仓库，跳过克隆${NC}"
fi

# 5. 安装依赖
echo ""
echo "[5/7] 安装依赖..."
cd timer-server
npm install

# 6. 创建环境配置
echo ""
echo "[6/7] 配置环境变量..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
CORS_ORIGINS=*
USE_REDIS=false
LOG_LEVEL=info
EOF
    echo -e "${GREEN}已创建默认 .env 文件${NC}"
else
    echo -e "${GREEN}.env 文件已存在${NC}"
fi

# 7. 创建 systemd 服务
echo ""
echo "[7/7] 创建 systemd 服务..."
cat > /etc/systemd/system/timer-server.service << 'EOF'
[Unit]
Description=Timer Sync Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/timer-server/timer-server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 重载 systemd
systemctl daemon-reload
systemctl enable timer-server

# 启动服务
systemctl start timer-server

# 配置防火墙
echo ""
echo "[额外] 配置防火墙..."
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}firewalld 配置完成${NC}"
elif command -v ufw &> /dev/null; then
    ufw allow 3000/tcp 2>/dev/null || true
    echo -e "${GREEN}ufw 配置完成${NC}"
else
    iptables -I INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || true
    echo -e "${GREEN}iptables 配置完成${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}✅ 服务器初始化完成！${NC}"
echo "========================================"
echo ""
echo "📋 后续步骤："
echo "1. 配置 GitHub Secrets:"
echo "   - SSH_PRIVATE_KEY: 服务器 SSH 私钥"
echo "   - SERVER_HOST: $(curl -s ifconfig.me 2>/dev/null || echo '你的服务器IP')"
echo "   - SERVER_USER: root"
echo ""
echo "📊 常用命令："
echo "   查看状态: systemctl status timer-server"
echo "   查看日志: journalctl -u timer-server -f"
echo "   重启服务: systemctl restart timer-server"
echo "   停止服务: systemctl stop timer-server"
echo ""
echo "🌐 服务地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '你的服务器IP'):3000"
echo "========================================"
