# GitHub Secrets 配置指南

## 🔑 SSH 密钥信息

### 公钥（需要添加到服务器）
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ43mJVdl3496zyu5h0r971P3O4kUe9sduigjx0r2iac github-actions
```

### 私钥（已复制到剪贴板，需要添加到 GitHub Secrets）
```
（私钥内容在剪贴板中，请勿泄露）
```

---

## 📋 配置步骤

### 第一步：添加公钥到服务器

在你的服务器上执行：

```bash
# 创建 .ssh 目录
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 添加公钥
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ43mJVdl3496zyu5h0r971P3O4kUe9sduigjx0r2iac github-actions" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 验证
 cat ~/.ssh/authorized_keys
```

### 第二步：添加私钥到 GitHub Secrets

1. 访问 https://github.com/DrinkRedBull007/timer-sync/settings/secrets/actions
2. 点击 **New repository secret**
3. 添加以下 Secrets：

| Secret 名称 | 值 |
|------------|-----|
| `SSH_PRIVATE_KEY` | （粘贴剪贴板中的私钥内容）|
| `SERVER_HOST` | `8.146.237.94` |
| `SERVER_USER` | `root` |

### 第三步：初始化服务器

SSH 登录到服务器并执行：

```bash
# 登录服务器
ssh root@8.146.237.94
# 密码: LXdt798aon!

# 执行初始化脚本
curl -fsSL https://raw.githubusercontent.com/DrinkRedBull007/timer-sync/main/scripts/init-server.sh | bash
```

### 第四步：推送代码触发部署

```bash
git add .
git commit -m "配置自动化部署"
git push origin main
```

---

## ✅ 验证部署

部署完成后，访问：
- **服务地址**: http://8.146.237.94:3000
- **健康检查**: http://8.146.237.94:3000/health

---

## 🛠️ 故障排查

### SSH 连接失败
```bash
# 在服务器上检查 SSH 服务
systemctl status sshd

# 检查 SELinux（如果是 Alibaba Cloud Linux）
getenforce
setenforce 0  # 临时关闭
```

### 部署脚本权限问题
```bash
# 给脚本执行权限
chmod +x scripts/*.sh
```

### 查看部署日志
```bash
# GitHub Actions 日志
# 访问: https://github.com/DrinkRedBull007/timer-sync/actions

# 服务器日志
journalctl -u timer-server -f
```
