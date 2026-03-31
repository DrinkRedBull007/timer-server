# 🚀 自动化部署配置汇总

## 📋 服务器信息

| 项目 | 值 |
|------|-----|
| 服务器 IP | `8.146.237.94` |
| 用户名 | `root` |
| 密码 | `LXdt798aon!` |
| 端口 | `22` |
| 操作系统 | Alibaba Cloud Linux 3.2104 LTS 64位 |
| GitHub 用户名 | `DrinkRedBull007` |

---

## 🔑 SSH 密钥

### 公钥（添加到服务器）
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ43mJVdl3496zyu5h0r971P3O4kUe9sduigjx0r2iac github-actions
```

### 私钥（添加到 GitHub Secrets）
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCeN5iVXZd+Pes8ruYdK/e9T9zuJFHvbHbooI8dK9omnAAAAJgJAGeiCQBn
ogAAAAtzc2gtZWQyNTUxOQAAACCeN5iVXZd+Pes8ruYdK/e9T9zuJFHvbHbooI8dK9omnA
AAAED64Po+2IPbW+fKaoGLQ9M6poHBOzH5xqLvN8fkD1dSMZ43mJVdl3496zyu5h0r971P
3O4kUe9sduigjx0r2iacAAAADmdpdGh1Yi1hY3Rpb25zAQIDBAUGBw==
-----END OPENSSH PRIVATE KEY-----
```

---

## 📌 快速配置步骤

### 第一步：SSH 登录服务器并初始化

```bash
# 1. SSH 登录（密码: LXdt798aon!）
ssh root@8.146.237.94

# 2. 执行初始化脚本
curl -fsSL https://raw.githubusercontent.com/DrinkRedBull007/timer-sync/main/scripts/server-init-cmd.sh | bash
```

**或者手动执行：**

```bash
# 登录后执行以下命令

# 添加 SSH 公钥
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ43mJVdl3496zyu5h0r971P3O4kUe9sduigjx0r2iac github-actions" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 安装 Node.js
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git

# 克隆代码
mkdir -p /opt/timer-server && cd /opt/timer-server
git clone https://github.com/DrinkRedBull007/timer-sync.git .

# 安装依赖
cd timer-server && npm install

# 创建环境配置
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
CORS_ORIGINS=*
USE_REDIS=false
LOG_LEVEL=info
EOF

# 创建 systemd 服务
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

# 启动服务
systemctl daemon-reload
systemctl enable timer-server --now

# 放行端口
iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
```

### 第二步：配置 GitHub Secrets

访问: https://github.com/DrinkRedBull007/timer-sync/settings/secrets/actions

添加以下 Secrets：

| Secret 名称 | 值 |
|------------|-----|
| `SSH_PRIVATE_KEY` | （上面的私钥内容，包含 BEGIN/END 行）|
| `SERVER_HOST` | `8.146.237.94` |
| `SERVER_USER` | `root` |

### 第三步：推送代码触发自动部署

```bash
git add .
git commit -m "配置自动化部署"
git push origin main
```

---

## ✅ 验证部署

部署完成后访问：
- **服务地址**: http://8.146.237.94:3000
- **健康检查**: http://8.146.237.94:3000/health

---

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `.github/workflows/deploy-server.yml` | GitHub Actions 自动部署配置（Git Pull 方式）|
| `.github/workflows/deploy-server-rsync.yml` | 备用部署配置（Rsync 方式）|
| `scripts/server-init-cmd.sh` | 服务器一键初始化脚本 |
| `scripts/init-server.sh` | 完整的服务器初始化脚本 |
| `scripts/deploy-manual.sh` | 本地手动部署脚本 |
| `DEPLOY.md` | 详细部署文档 |

---

## 🛠️ 常用命令

```bash
# 查看服务状态
systemctl status timer-server

# 查看实时日志
journalctl -u timer-server -f

# 重启服务
systemctl restart timer-server

# 停止服务
systemctl stop timer-server

# 查看部署目录
cd /opt/timer-server && ls -la
```

---

## 📝 注意事项

1. **私钥安全**：私钥文件已保存在 `C:\Users\13320\.ssh\timer_deploy_key`，请勿泄露
2. **防火墙**：如果无法访问，检查阿里云安全组是否放行 3000 端口
3. **自动部署**：只有推送到 `main` 分支且修改了 `timer-server/**` 文件才会触发自动部署
