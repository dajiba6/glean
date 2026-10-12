# Reader

一个临时使用的英文电子书阅读器。浏览器本地打开 EPUB / PDF，点击单词或划选文字后，用大模型显示简单英文解释；点击「看不懂，看看中文」切换中文。

## 已实现

- EPUB：目录、分页、字号和阅读宽度调整；PDF：文字层、目录、页码跳转和缩放。
- 单击单词立即解释；划选文字后点击「解释这段文字」。仅选中文字发送给模型，不附带附近段落、书名或整本书。
- 流式解释、取消、超时、明确错误和手动重试；中英文结果仅在当前页面内存中缓存。
- 书籍在浏览器内存中解析，不上传整本书、不使用数据库、不保存历史。刷新页面需重新选书，原文件不受影响。
- 服务端读取统一模型配置，支持 OpenAI 兼容 Chat Completions 接口。浏览器无法读取密钥或更改上游地址。
- 全站及 API 使用 `/reader/` 前缀。

第一版面向电脑端的现代浏览器。扫描 PDF 不进行 OCR；需要密码的 PDF 和 DRM 电子书暂不支持。PDF 的复杂多栏、断词及跨页选区不保证完整阅读顺序。EPUB 不运行书中脚本，并清洗活动内容、阻止外部资源加载。

按当前产品决定，公开实例无密码、无调用频率/并发/额度限制，所有访客使用部署者的模型额度。HTTP JSON 请求体有 1 MB 的传输保护，不属于模型配额。仅部署者可修改模型目的地址；客户端不能把服务端当作任意 URL 代理，模型请求也不跟随重定向。

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

打开 **http://127.0.0.1:3000/reader/**。开发模式由同一个 Node 服务提供 Vite 页面和 API，没有跨域 API 地址。可用 `PORT=3001 npm run dev` 修改端口。

## 构建、生产启动、重启

```bash
npm run build
npm start
```

`npm run build` 先检查 TypeScript，再构建前端和服务端。必须在仓库根目录运行启动命令。前端、PDF worker、字体、CMap 和 WASM 均随构建本地部署，无需从 CDN 加载。

手动运行时，按 Ctrl+C 结束，再执行 `npm start` 即为重启。更新代码后执行 `npm ci && npm run build`，再重启进程；不要覆盖真实配置。没有书籍或阅读记录数据目录，无需数据库备份；只需自行安全备份配置文件。

### Ubuntu / systemd

示例假定项目在 `/opt/reader`，已有名为 `reader` 的运行用户，Node 位于 `/usr/bin/node`。按实际环境修改 [deploy/reader.service](deploy/reader.service) 的用户、路径与 Node 地址（用 `command -v node` 确认）。

```bash
npm ci
npm run build
# 首次部署时创建并填写 config.local.json；更新时保留它
sudo cp deploy/reader.service /etc/systemd/system/reader.service
sudo systemctl daemon-reload
sudo systemctl enable --now reader
curl http://127.0.0.1:3000/reader/api/health
```

更新构建后：

```bash
sudo systemctl restart reader
sudo systemctl status reader
sudo journalctl -u reader -n 50 --no-pager
```

预期访问链路：

```text
访客 → https://happycyn.cn/reader/
     → 主站 Worker → https://read.happycyn.cn/reader/
     → Cloudflare Tunnel → http://127.0.0.1:3000/reader/
```

当 cloudflared 与应用同在主机网络时可使用上述 loopback 地址；容器部署需按实际网络设置 `HOST` 与隧道目标。反向代理应保留路径和查询参数，并允许流式响应。本仓库不修改 DNS、主站 Worker 或 Tunnel。**代码完成不代表已部署至 crazy-ubuntu。**

## 接口与验证

- `GET /reader/api/health`：不调用模型，返回服务状态、模型是否已配置和 `translationTimeoutMs`，不返回密钥、模型地址或名称。
- `POST /reader/api/translate`：JSON `{"text":"gentle","language":"en"}`；`language` 支持 `en` / `zh`。
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

测试覆盖基础路径、静态资源、深层刷新、重定向、API 错误、EPUB 内容清洗、点词与选句、英文/中文切换、缓存、PDF 缩放翻页、扫描页提示、网络失败重试，以及服务端超时与取消。真实模型兼容性需在填写配置后实际验证。

## 项目结构

```text
src/readers/     EPUB 和 PDF 阅读组件
src/selection.ts 单词与选区识别
src/Explanation.tsx 解释弹窗及本次会话缓存
src/sanitize.ts 浏览器本地 EPUB 清洗
server/         配置加载、模型流转发、页面服务
shared/         SSE 解析
tests/          服务端及浏览器测试
deploy/         systemd 模板
```

与旁边的 `personal-site` 仓库独立开发、构建和部署。项目约定见 [AGENTS.md](AGENTS.md)。

## 开源许可

本项目采用 [MIT](LICENSE) 许可。依赖保留各自的许可证（包括 PDF.js 的 Apache-2.0 和 epub.js 的 BSD-2-Clause）。
