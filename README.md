# Sub2API 拼车额度看板

独立的只读额度看板。服务端使用 Sub2API 管理员 API Key 拉取数据，向拼车成员展示账号容量、5 小时/周额度，以及用户在选定时间范围内的消费、Token、缓存命中率和请求统计。

管理员 API Key 仅保存在服务端环境变量中，不会发送到浏览器。

## 本地运行

```bash
npm install
npm run build
npm start
```

先复制 `.env.example` 为 `.env` 并填写自己的配置。默认访问 `http://localhost:4173`；`.env` 已被 Git 和 Docker 构建忽略。

## Docker

```bash
export SUB2API_BASE_URL=https://your-sub2api.example.com
export SUB2API_ADMIN_KEY=admin-replace-me
export VIEWER_PASSWORD=replace-with-a-long-shared-password
export SESSION_SECRET=replace-with-at-least-32-random-characters
docker compose up -d --build
```

Compose 使用 `environment` 字段传入配置，不依赖额外的容器配置文件。公开部署时请使用强密码和随机会话密钥，并通过 HTTPS 反向代理暴露服务。若代理会传递真实客户端 IP，将 `TRUST_PROXY` 设为 `1`。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `SUB2API_BASE_URL` | Sub2API 服务地址 |
| `SUB2API_ADMIN_KEY` | 仅服务端使用的管理员 API Key |
| `VIEWER_PASSWORD` | 拼车成员使用的共享查看密码 |
| `SESSION_SECRET` | 查看会话签名密钥，至少 32 个字符 |
| `PORT` | 服务端口，默认 `4173` |
| `CACHE_TTL_SECONDS` | 上游数据缓存秒数，默认 `30` |
| `SESSION_DAYS` | 查看登录有效期，默认 `30` |
| `TRUST_PROXY` | 在可信反向代理后设为 `1` |
