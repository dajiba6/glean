# 开发与部署

[← 返回项目首页](../README.md)

## 安装和配置

需要 Node.js **22.13+**（建议当前 LTS）和 npm。无需 Python 或数据库。

```bash
npm ci
cp config.example.json config.local.json
```

编辑 `config.local.json`：

```json
{
  "host": "127.0.0.1",
  "port": 3000,
  "llm": {
    "baseUrl": "https://your-provider.example/v1",
    "model": "your-model-id",
    "apiKey": "your-secret-key",
    "timeoutMs": 60000
  }
}
```

`baseUrl` 填接口基础地址，**不包含 `/chat/completions`**；服务端会追加它。支持标准 SSE 流式响应，也兼容返回完整 JSON 的服务。公网服务建议 HTTPS；HTTP 用于部署者自行配置的本地模型服务。

真实配置 `config.local.json` 已被 `.gitignore` 忽略；只提交不含密钥的 `config.example.json`。配置改变后需要重启。配置缺失或仍是占位符时可以正常读书，解释接口返回 503，不会假装生成成功。

可通过 `READER_CONFIG=/absolute/path/config.json` 指定配置文件；以下环境变量优先于文件：

| 环境变量 | 含义 |
| --- | --- |
| `HOST` / `PORT` | 监听地址 / 端口 |
| `LLM_BASE_URL` | 模型接口基础地址 |
| `LLM_MODEL` | 模型名称 |
| `LLM_API_KEY` | 密钥，仅服务端读取 |
| `LLM_TIMEOUT_MS` | 模型请求总超时，默认 60000 毫秒 |

不自动加载 `.env` 文件，不使用任何 `VITE_` 变量保存密钥。日志不输出密钥、选中文字或模型响应。解释默认 60 秒超时；浏览器从健康检查读取超时时长，并额外等待 5 秒后结束失联请求。健康检查失败时，浏览器使用 125 秒兜底超时。

## 本地开发

```bash
npm run dev
```

打开 **http://127.0.0.1:3000/glean/**。开发模式由同一个 Node 服务提供 Vite 页面和 API，没有跨域 API 地址。可用 `PORT=3001 npm run dev` 修改端口。

## 构建、生产启动、重启

```bash
npm run build
npm start
```

`npm run build` 先检查 TypeScript，再构建前端和服务端。必须在仓库根目录运行启动命令。前端、PDF worker、字体、CMap 和 WASM 均随构建本地部署，无需从 CDN 加载。

手动运行时，按 Ctrl+C 结束，再执行 `npm start` 即为重启。更新代码后执行 `npm ci && npm run build`，再重启进程；不要覆盖真实配置。没有书籍或阅读记录数据目录，无需数据库备份；只需自行安全备份配置文件。

### Ubuntu / systemd

示例假定项目在 `/opt/reader`，已有名为 `reader` 的运行用户，Node 位于 `/usr/bin/node`。按实际环境修改 [deploy/reader.service](../deploy/reader.service) 的用户、路径与 Node 地址（用 `command -v node` 确认）。

```bash
npm ci
npm run build
# 首次部署时创建并填写 config.local.json；更新时保留它
sudo cp deploy/reader.service /etc/systemd/system/reader.service
sudo systemctl daemon-reload
sudo systemctl enable --now reader
curl http://127.0.0.1:3000/glean/api/health
```

更新构建后：

```bash
sudo systemctl restart reader
sudo systemctl status reader
sudo journalctl -u reader -n 50 --no-pager
```

预期访问链路：

```text
访客 → https://happycyn.cn/glean/
     → 主站 Worker → https://home.happycyn.cn/glean/
     → Cloudflare Tunnel → http://127.0.0.1:3000/glean/
```

当 cloudflared 与应用同在主机网络时可使用上述 loopback 地址；容器部署需按实际网络设置 `HOST` 与隧道目标。反向代理应保留路径和查询参数，并允许流式响应。本仓库不修改 DNS、主站 Worker 或 Tunnel。**代码完成不代表已部署至 crazy-ubuntu。**

## 接口与验证

- `GET /glean/api/health`：不调用模型，返回服务状态、模型是否已配置和 `translationTimeoutMs`，不返回密钥、模型地址或名称。
- `POST /glean/api/translate`：JSON `{"text":"gentle","language":"en"}`；`language` 支持 `en` / `zh`。`en` 是沿用的协议值，实际表示用原文语言解释；`zh` 表示中文解释。
- 成功响应为 NDJSON：`delta`、`done`；流中失败为 `error`，部分结果不能当成功缓存。
- 流开始前使用 JSON 错误与状态码：400 无效输入、413 请求体过大、503 配置缺失、502 模型错误、504 超时。
- 关闭弹窗或切换选词会取消旧请求；取消不保证上游未计费。不自动重试。

```bash
npm test
npm run build
npm run test:e2e
git diff --check
```

浏览器测试默认使用已安装的 Google Chrome；无 Chrome 的机器可运行 `npx playwright install chromium`，然后使用 `PLAYWRIGHT_CHROMIUM=1 npm run test:e2e`。测试使用动态生成的 EPUB/PDF 和本地假模型，无需真实密钥、不产生模型费用。测试服务使用 43137 / 43138 端口，不接触正式配置或生产模型。

测试覆盖基础路径、静态资源、深层刷新、重定向、API 错误、EPUB 内容清洗、点词与选句、原文语言/中文切换、缓存、PDF 缩放翻页、扫描页提示、网络失败重试，以及服务端超时与取消。真实模型兼容性需在填写配置后实际验证。

项目品牌与 GitHub 仓库名为 Glean（`dajiba6/glean`）。公开路径为 `/glean/`；配置环境变量 `READER_CONFIG` 保持兼容。

### crazy-ubuntu 的实际部署

- 使用 `cyn` 用户的 systemd 服务 `glean.service`，模板为 `deploy/glean.user.service`；Node 使用机器已有的 22.22.2。首次执行 `loginctl enable-linger cyn`，保证退出 SSH 后及开机时继续运行。
- 发布目录：`~/Projects/glean/releases/<git-sha>`；`~/Projects/glean/current` 指向当前版本。上传生产构建、`package.json` 和 `package-lock.json`，在发布目录执行 `npm ci --omit=dev`，更新软链接，再执行 `systemctl --user restart glean`。
- 模型配置：`~/.config/glean/config.json`，权限 `600`，独立于发布目录，更新时保留。
- 服务仅监听 Docker 网桥地址 `172.17.0.1:3000`，供现有 cloudflared 容器通过 `host.docker.internal:3000` 访问；不绑定公网地址。
- Tunnel 在原有 `home.happycyn.cn` 规则前增加仅匹配 `/glean` 和 `/glean/*` 的规则；其余路径继续走原服务。
- 主站 Worker 将 `https://happycyn.cn/glean/` 转发至 `https://home.happycyn.cn/glean/`，保留路径、查询参数、请求体与流式响应。
- 机器需要本地代理访问外部模型时，服务使用已有的 `http://127.0.0.1:7897`；代理地址和 Node 路径变化时更新服务文件。

```bash
systemctl --user status glean
journalctl --user -u glean -n 50 --no-pager
curl http://172.17.0.1:3000/glean/api/health
```

回滚时将 `current` 重新指向已保留的上一版本，再重启 `glean`。主站或 Tunnel 配置修改前应保留原配置；不要覆盖其他应用的路由。
