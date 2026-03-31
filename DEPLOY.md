# 🚀 服务器自动化部署指南

本文档介绍如何配置 GitHub Actions 自动部署到你的服务器。

## 📋 前置条件

1. 一台 Linux 服务器（Ubuntu/CentOS 等）
2. 服务器已安装 Node.js 和 npm
3. 服务器已配置 systemd 服务
4. 你有服务器的 SSH 访问权限

## 🔧 第一步：服务器初始化配置

### 1.1 在服务器上执行初始化脚本

将 `scripts/init-server.sh` 上传到服务器并执行：

```bash
# 在服务器上执行
chmod +x init-server.sh
sudo ./init-server.sh
```

这个脚本会：
- 安装 Node.js 20.x
- 创建 `/opt/timer-server` 目录
- 克隆代码仓库
- 创建 systemd 服务
- 配置防火墙

### 1.2 创建部署用户（推荐）

为了安全，建议创建一个专门的部署用户：

```bash
# 创建部署用户
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG wheel deploy  # CentOS
# 或
sudo usermod -aG sudo deploy   # Ubuntu

# 设置密码
sudo passwd deploy
```

### 1.3 配置 SSH 免密登录

在本地生成 SSH 密钥（如果还没有）：

```bash
ssh-keygen -t ed25519 -C "github-actions"
```

将公钥添加到服务器的部署用户：

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@你的服务器IP
```

**获取私钥内容**（用于 GitHub Secrets）：

```bash
cat ~/.ssh/id_ed25519
```

复制输出的全部内容。

## 🔐 第二步：配置 GitHub Secrets

在 GitHub 仓库中，进入 **Settings → Secrets and variables → Actions**，添加以下 Secrets：

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `SSH_PRIVATE_KEY` | SSH 私钥内容 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SERVER_HOST` | 服务器 IP 或域名 | `8.146.237.94` |
| `SERVER_USER` | SSH 用户名 | `deploy` 或 `root` |

### 添加步骤：

1. 进入仓库的 Settings 页面
2. 点击左侧 Secrets and variables → Actions
3. 点击 **New repository secret**
4. 输入 Name 和 Value
5. 点击 **Add secret**

## 🧪 第三步：测试部署

### 3.1 手动触发测试

1. 进入仓库的 **Actions** 标签
2. 选择 **Deploy Server to Production**
3. 点击 **Run workflow**
4. 观察部署日志

### 3.2 自动触发测试

1. 修改 `timer-server/` 下的任意文件
2. 提交并推送到 `main` 分支
3. 观察 Actions 是否自动触发

## 📁 工作流说明

本项目提供两种部署工作流：

### 方案一：Git Pull 方式（`deploy-server.yml`）

**适用场景**：服务器上已有代码仓库

**流程**：
1. SSH 连接到服务器
2. 执行 `git pull` 拉取最新代码
3. 运行 `npm install`
4. 重启 systemd 服务

**优点**：
- 部署速度快（只传输变更）
- 保留 Git 历史记录
- 可以在服务器上快速回滚

### 方案二：Rsync 方式（`deploy-server-rsync.yml`）

**适用场景**：大项目或需要排除某些文件

**流程**：
1. 使用 rsync 同步文件到服务器
2. 在服务器上安装依赖
3. 重启服务

**优点**：
- 可以精确控制同步哪些文件
- 适合多服务器部署
- 不依赖服务器上的 Git

## 🔄 回滚操作

如果部署出现问题，可以在服务器上快速回滚：

```bash
# 进入项目目录
cd /opt/timer-server

# 查看提交历史
git log --oneline -10

# 回滚到上一个版本
git reset --hard HEAD~1

# 或回滚到指定版本
git reset --hard <commit-hash>

# 重启服务
sudo systemctl restart timer-server
```

## 🛠️ 故障排查

### 问题 1：SSH 连接失败

```
Error: Permission denied (publickey)
```

**解决**：
1. 检查 `SSH_PRIVATE_KEY` 是否正确
2. 确保公钥已添加到服务器的 `~/.ssh/authorized_keys`
3. 检查服务器 SSH 配置：`/etc/ssh/sshd_config` 中的 `PubkeyAuthentication yes`

### 问题 2：权限不足

```
Error: sudo: no tty present
```

**解决**：
编辑服务器上的 `/etc/sudoers`：

```bash
sudo visudo
```

添加：
```
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart timer-server
```

### 问题 3：服务启动失败

```bash
# 在服务器上查看日志
sudo journalctl -u timer-server -n 50

# 查看服务状态
sudo systemctl status timer-server
```

### 问题 4：健康检查失败

检查：
1. 服务器防火墙是否放行了 3000 端口
2. 服务是否真的启动了
3. `/health` 端点是否正常响应

## 📝 自定义配置

### 修改部署分支

编辑 `.github/workflows/deploy-server.yml`：

```yaml
on:
  push:
    branches: [ main, develop ]  # 添加 develop 分支
```

### 添加部署通知

可以在工作流末尾添加钉钉/企业微信/Slack 通知：

```yaml
- name: Notify DingTalk
  if: success()
  run: |
    curl -X POST "${{ secrets.DINGTALK_WEBHOOK }}" \
      -H "Content-Type: application/json" \
      -d '{"msgtype": "text", "text": {"content": "✅ 部署成功"}}'
```

### 多服务器部署

```yaml
strategy:
  matrix:
    server: [server1, server2, server3]
steps:
  - name: Deploy to ${{ matrix.server }}
    run: |
      ssh ${{ secrets[format('SERVER_USER_{0}', matrix.server)] }}@${{ secrets[format('SERVER_HOST_{0}', matrix.server)] }} ...
```

## 🎯 最佳实践

1. **使用部署分支**：不要直接在 `main` 分支开发，使用 Pull Request 合并
2. **部署前测试**：添加测试步骤，确保代码质量
3. **蓝绿部署**：对于高可用要求，考虑使用蓝绿部署策略
4. **备份数据**：部署前备份重要数据
5. **监控告警**：部署后检查服务状态和日志

## 📞 需要帮助？

- 查看 Actions 日志获取详细错误信息
- 检查服务器的系统日志：`sudo journalctl -f`
- 确保所有 Secrets 都已正确配置
