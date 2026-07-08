# Agent Canvas 预发环境部署指南

本文档说明如何将 `agent-canvas-mvp` 通过 GitLab CI/CD 自动部署到独立的 demo / 预发服务器，并通过公网访问。

## 架构概览

```text
开发者 push → GitLab (eaglelab-gitlab.tcljd.com)
  → validate (typecheck / lint)
  → build Docker image → GitLab Container Registry
  → SSH 到预发服务器 → docker compose pull/up
  → 公网访问 http(s)://<STAGING_PUBLIC_URL>
```

触发分支：

- `main`
- `feature/mcp-app-widget-host`

## 一次性准备（预发服务器）

### 1. 准备一台 Linux 服务器

要求：

- 可 SSH 访问
- 已开放应用端口（默认 `3000`，或通过 Nginx 反代 `80/443`）
- 建议 2 vCPU / 2GB RAM 以上

### 2. 初始化 Docker 与部署目录

在服务器上以 root 或 sudo 执行（从本仓库复制脚本到服务器，或在 clone 后的目录中运行）：

```bash
sudo DEPLOY_USER=deploy STAGING_DEPLOY_PATH=/opt/agent-canvas APP_PORT=3000 bash deploy/scripts/bootstrap-server.sh
```

### 3. 配置 deploy 用户 SSH 密钥

在本地生成专用于 CI 的密钥（不要用个人私钥）：

```bash
ssh-keygen -t ed25519 -C "gitlab-ci-agent-canvas" -f ./agent-canvas-staging-deploy -N ""
```

将 `agent-canvas-staging-deploy.pub` 追加到服务器：

```text
/home/deploy/.ssh/authorized_keys
```

私钥 `agent-canvas-staging-deploy` 的内容稍后写入 GitLab CI 变量 `STAGING_SSH_PRIVATE_KEY`。

### 4. （可选）Nginx 公网 HTTPS

复制 `deploy/nginx/agent-canvas.conf.example` 到服务器 Nginx 配置目录，修改 `server_name` 与 upstream 端口，然后 reload Nginx。

若使用 HTTPS，请在 GitLab 变量 `STAGING_PUBLIC_URL` 中填写完整 URL，例如 `https://agent-canvas-demo.yourcompany.com`。

## GitLab CI/CD 变量配置

进入 GitLab 项目：**Settings → CI/CD → Variables**，添加以下变量。

### 必填（部署连通）

| 变量名 | 说明 | 示例 | Masked |
|--------|------|------|--------|
| `STAGING_HOST` | 预发服务器 IP 或域名 | `10.1.2.3` | 否 |
| `STAGING_USER` | SSH 用户 | `deploy` | 否 |
| `STAGING_DEPLOY_PATH` | 部署目录 | `/opt/agent-canvas` | 否 |
| `STAGING_SSH_PRIVATE_KEY` | CI 部署私钥（见下方说明） | File 或 Variable | Protect ✅，**不要 Mask** |

私钥变量三种填法（任选其一）：

**推荐：Type = File**

1. Add variable → Key: `STAGING_SSH_PRIVATE_KEY`
2. **Type 选 File**（不是 Variable）
3. Value 粘贴私钥全文（含 `BEGIN`/`END` 行）
4. 勾选 **Protect variable**，**不要勾选 Mask variable**
5. CI 会把内容写入临时文件，脚本自动 `cp` 到 `~/.ssh/id_rsa`

**备选：Type = Variable（不 Mask）**

- 同上粘贴私钥全文，Type 选 Variable，只勾 Protect，不勾 Mask

**备选：Base64 单行（可 Mask）**

GitLab 的 Mask 不允许换行和空格，原始私钥无法 Mask。若必须 Mask，在本地生成单行 base64：

```bash
base64 < agent-canvas-staging-deploy | tr -d '\n'
```

GitLab 变量 Key 改为 `STAGING_SSH_PRIVATE_KEY_B64`，Value 粘贴这一整行，可勾选 Mask。
| `STAGING_PUBLIC_URL` | 公网访问地址（用于 GitLab Environment） | `http://10.1.2.3:3000` | 否 |

### 必填（应用密钥）

| 变量名 | 说明 |
|--------|------|
| `TURING_API_KEY` | Turing 代理 API Key（与本地 `.env.local` 相同变量名） |

### 可选（有默认值）

| 变量名 | 默认值 |
|--------|--------|
| `TURING_API_BASE` | `https://live-turing.cn.llm.tcljd.com/api/v1` |
| `TURING_MODEL` | `turing/gpt-5.5` |
| `OPENAI_API` | `chat_completions` |
| `MCP_SERVER_URL` | FluxInk MCP URL |
| `MCP_AUTH_TOKEN` | 空 |
| `MCP_TIMEOUT_MS` | `60000` |
| `APP_PORT` | `3000` |
| `PORTAL_FRAME_ANCESTOR_ORIGIN` | 空（允许任意 iframe 嵌入时留空） |

GitLab 内置变量（通常无需手动配置）：

- `CI_REGISTRY`
- `CI_REGISTRY_USER`
- `CI_REGISTRY_PASSWORD`
- `CI_REGISTRY_IMAGE`

### 启用 Container Registry

确保项目 **Settings → General → Visibility** 下 Container Registry 已启用。  
若公司 GitLab 禁用了 Registry，需要联系管理员开启，或改用 Shell Runner 在目标机构建（见文末备选方案）。

## 日常发布流程

1. 本地 dev 验证通过
2. commit 并 push 到 GitLab：

```bash
git push origin feature/mcp-app-widget-host
# 或合并到 main 后
git push origin main
```

3. 打开 GitLab **CI/CD → Pipelines**，确认三个阶段成功：
   - `validate:typecheck`
   - `build:image`
   - `deploy:staging`
4. 浏览器访问 `STAGING_PUBLIC_URL`，验证：
   - `GET /api/health` 返回 `{ "ok": true }`
   - 对话、画布、LLM、函数图等功能

## 手动部署

非默认分支或需要重跑部署时，可在 Pipeline 中手动触发 `deploy:staging:manual` job（需已有 `build:image` 产物）。

## 服务器上常用运维命令

```bash
cd /opt/agent-canvas
docker compose ps
docker compose logs -f agent-canvas
docker compose pull && docker compose up -d
cat .env   # 检查运行时环境变量（勿泄露 Key）
curl -s http://127.0.0.1:3000/api/health
```

## 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `build:image` 失败 | Runner 未启用 Docker-in-Docker | 联系 GitLab 管理员为 Runner 开启 `privileged` + dind |
| `deploy:staging` SSH 失败 | 密钥/防火墙/用户权限 | 检查 `STAGING_SSH_PRIVATE_KEY`、`authorized_keys`、安全组 22 端口 |
| 容器启动但 502 | 端口未开放或 Nginx 配置错误 | 检查 `APP_PORT`、防火墙、Nginx upstream |
| LLM 不可用 | `TURING_API_KEY` 未配置 | 在 GitLab Variables 补全并重新 deploy |
| 画布空白 | CSP 或 FluxInk 外网不可达 | 检查服务器出网与 MCP URL |

## 备选方案：目标机 Shell Runner

若公司 GitLab 无法使用 Container Registry + DinD，可在预发服务器安装 GitLab Shell Runner，并将 `.gitlab-ci.yml` 的 build/deploy 改为在目标机直接 `docker build`。当前默认方案是 **Registry + SSH deploy**，更适合独立 demo 服务器。

## 安全说明（demo 环境）

- 密钥只放在 GitLab CI Variables 与服务端 `.env`，不要提交到仓库
- demo 环境建议使用专用 deploy 密钥，定期轮换
- 公网暴露时建议加 Nginx + HTTPS + IP 白名单或 Basic Auth
