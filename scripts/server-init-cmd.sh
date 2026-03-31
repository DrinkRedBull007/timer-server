#!/bin/bash
# 在服务器上执行的一键初始化命令
# 服务器: 8.146.237.94 (Alibaba Cloud Linux 3.2104 LTS)

set -e

echo "========================================"
echo "🚀 Timer Server 服务器初始化"
echo "服务器: 8.146.237.94"
echo "========================================"

# 1. 添加 GitHub Actions 公钥
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ43mJVdl3496zyu5h0r971P3O4kUe9sduigjx0r2iac github-actions" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "✅ SSH 公钥已添加"

# 2. 安装 Node.js 20.x
echo ""
echo "[1/4] 安装 Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
fi
node -v
npm -v

# 3. 安装 Git
echo ""
echo "[2/4] 安装 Git..."
if ! command -v git &> /dev/null; then
    yum install -y git
fi
git --version

# 4. 克隆代码
echo ""
echo "[3/4] 克隆代码..."
mkdir -p /opt/timer-server
cd /opt/timer-server
if [ ! -d ".git" ]; then
    git clone https://github.com/DrinkRedBull007/timer-sync.git .
else
    git pull origin main
fi

# 5. 安装依赖和配置
echo ""
echo "[4/4] 安装依赖..."
cd timer-server
npm install

# 创建环境配置
if [ ! -f ".env" ]; then
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
CORS_ORIGINS=*
USE_REDIS=false
LOG_LEVEL=info
EOF
fi

# 6. 创建 systemd 服务
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

# 7. 启动服务
systemctl daemon-reload
systemctl enable timer-server
systemctl start timer-server

# 8. 配置防火墙
echo ""
echo "[额外] 配置防火墙..."
firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
iptables -I INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || true

echo ""
echo "========================================"
echo "✅ 服务器初始化完成！"
echo "========================================"
echo ""
echo "🌐 服务地址: http://8.146.237.94:3000"
echo "🏥 健康检查: http://8.146.237.94:3000/health"
echo ""
echo "📊 常用命令:"
echo "   systemctl status timer-server"
echo "   journalctl -u timer-server -f"
echo "========================================"
