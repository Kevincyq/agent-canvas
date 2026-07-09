# Agent Canvas 预发环境部署指南

GitLab 仅作**代码仓库**；因公司网络策略不允许 GitLab 与外部预发服务器互通，**不使用 GitLab CI/CD 自动部署**。

预发发布改为：**本地一键脚本 → rsync 代码 → 服务器 docker build/up**。

## 架构概览

```text
本地开发验证
  → git push GitLab（版本管理）
  → pnpm run deploy:staging（本地执行）
  → rsync 代码到预发服务器
  → 上传 .env.local 为服务器 .env
  → 服务器 docker build + docker compose up
  → https://dralk-demo.tcljd.com
```

## 预发环境信息

| 项 | 值 |
|----|-----|
| 公网地址 | `https://dralk-demo.tcljd.com` |
| 服务器 | `ubuntu@39.107.230.27` |
| 部署目录 | `/home/ubuntu/agent_canvas` |
| GitLab | `https://eaglelab-gitlab.tcljd.com/yangqin.chen/agent_canvas` |

## 一次性准备

### 1. 服务器初始化（若未完成）

```bash
cd /home/ubuntu/agent_canvas
sudo env DEPLOY_USER=ubuntu STAGING_DEPLOY_PATH=/home/ubuntu/agent_canvas APP_PORT=3000 \
  bash deploy/scripts/bootstrap-server.sh

sudo DOMAIN=dralk-demo.tcljd.com EMAIL=you@tcl.com \
  bash deploy/scripts/setup-nginx-tls.sh
```

### 2. 本地 SSH 密钥

确保本机有部署私钥，且公钥已写入服务器 `~/.ssh/authorized_keys`：

```bash
ssh -i ./agent-canvas-staging-deploy ubuntu@39.107.230.27
```

### 3. 本地部署配置

```bash
cp deploy/deploy.env.example deploy/deploy.env
# 按需修改 STAGING_HOST / STAGING_USER / SSH_KEY 等
```

### 4. 本地环境变量

确保项目根目录有 `.env.local`（从 `.env.example` 复制并填写 `TURING_API_KEY` 等）。  
部署时会上传到服务器作为 `.env`（**不会提交到 Git**）。

## 日常发布

```bash
# 1. 本地验证
pnpm run dev

# 2. 提交并推送到 GitLab（仅版本管理）
git add .
git commit -m "your message"
git push origin feature/mcp-app-widget-host

# 3. 本地一键部署到预发
pnpm run deploy:staging
```

脚本 `deploy/scripts/local-deploy.sh` 会：

1. `rsync` 同步代码（排除 `node_modules`、`.next`、`.env.local` 等）
2. 将 `.env.local` + 生产运行时变量写入服务器 `.env`
3. SSH 执行 `deploy/scripts/server-deploy.sh`（服务器上 `docker build` + `up`）
4. 容器内健康检查

## 验证

```bash
curl -s https://dralk-demo.tcljd.com/api/health
```

应返回 `{"ok":true,"service":"agent-canvas-mvp",...}`。

## 服务器运维

```bash
ssh ubuntu@39.107.230.27
cd /home/ubuntu/agent_canvas
docker compose -f deploy/docker-compose.local.yml ps
docker compose -f deploy/docker-compose.local.yml logs -f agent-canvas
curl -s http://127.0.0.1:3000/api/health
```

## 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `pnpm run deploy:staging` SSH 失败 | 密钥/权限 | 检查 `deploy/deploy.env` 中 `SSH_KEY` 与服务器 `authorized_keys` |
| `docker build` 失败 | 磁盘不足/依赖问题 | `df -h`，查看 build 日志 |
| HTTPS 502 | 容器未启动 | `docker compose ps`，看 `agent-canvas` 日志 |
| LLM 不可用 | `.env.local` 未配 Key | 补全 `TURING_API_KEY` 后重新 deploy |
| 画布空白 | MCP/CSP | 检查服务器出网与 `MCP_SERVER_URL` |

## 关于 GitLab CI

`.gitlab-ci.yml` 已设置 `workflow: when: never`，不会自动跑 Pipeline。  
若未来公司打通 GitLab 与预发机网络，可再启用 Registry/Runner 方案。

## 安全说明

- `.env.local`、`deploy/deploy.env`、SSH 私钥**不要提交**到 Git
- 部署脚本会把 `.env.local` 上传到服务器 `.env`，注意服务器访问权限
