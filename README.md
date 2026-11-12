# 全民打飞机

双人回合制的“全民打飞机”网页游戏：双方在 10×10 棋盘上各藏 3 架飞机，轮流攻击猜位置，先击落对方全部飞机机头的一方获胜。支持**联机对战**和**人机对战**，既能作为独立网页运行，也能打包成 Discourse 社区微应用。

## 游戏规则

- 每架飞机 10 格：机头 1、机翼 5、机身 1、尾翼 3，可朝上下左右；三架飞机须完整放在棋盘内且不重叠。
- 攻击结果：`·` 未命中、`✕` 打中机身、`○` 打中机头（击落）。
- **打中机头可以继续攻击**，其他情况换对方。只有打中机头才算击落。
- 击落后公开该架飞机的完整轮廓；残骸不能再次攻击，AI 和超时代打也会避开。
- 每回合限时（联机默认 30 秒，人机 60 秒），超时由系统随机代打，连续超时 3 次判负。
- 游戏内右上角「规则」按钮可随时查看。

## 功能

- 联机对战：创建 / 加入房间、房间列表、复制邀请、再来一局（显示对方意愿）
- 人机对战：简单 / 普通 / 困难三档电脑对手，不需要联网
- 布置飞机：随机布置、拖动、选中旋转，鼠标和触屏都支持
- 对局：攻击 / 标记模式切换、回合倒计时、对局记录、结束后公开对方布局、命中率与用时
- 断线重连：45 秒内重连可接回原对局，对手会看到掉线提示
- 战绩：本机记录联机 / 人机胜负、命中率和最少攻击获胜（微应用使用社区存储）
- 防作弊：飞机布局由服务端校验；开局时只下发自己的布局，对方飞机仅在击落时公开

### 游戏大厅与快速游戏

- **快速游戏**：服务端优先加入等待最久的可用公开房间，没有对手时创建公开等待房。公开大厅与快速游戏共用房间池。
- **公开大厅**：实时显示房主、准备状态、等待时间及加入入口。掉线房主、满员、进行中和停留在结算的房间不会被匹配；在线数字按已连接会话统计，不代表去重人数。
- **好友对战**：创建的房间默认不公开、不参与匹配，持房间号即可加入；仍由房主在双方准备后开局。
- **等待与准备**：等待时可以调整布局或提前准备，20 秒后提供明确的「改玩人机」入口；切换前由服务端确认退出公开房间。匹配到两人后有 60 秒准备时间，双方准备且在线即自动开局。超时移除未准备或掉线者，不记胜负；已准备者继续等待下一位对手。
- **取消与恢复**：布阵阶段可取消匹配，已开局时取消请求会被拒绝，需要在对局页确认退出。刷新恢复房间类型、等待计时、准备期限及已提交布局；重复请求不会重复建房，旧房间的取消请求不会影响新房间。
- 匹配沿用单进程内存状态，不依赖新数据库。当前不包含段位、聊天、观战，也不会用电脑冒充真人；匿名多会话不做账号级去重。
- 新大厅与等待卡片全部复用已有 `--sk-*` 变量和通用组件，切换皮肤不改变匹配流程。

### 皮肤

顶栏「🎨 皮肤」可切换皮肤，默认使用「经典蓝」，也可以选「跟随系统」按系统深浅色自动切换，选择会自动保存。内置「夜空雷达」「晴空纸面」「经典蓝」三套。皮肤只改颜色、字体、图标和特效，不改变布局。

制作新皮肤：复制 `src/skins/_template.js`，按 [docs/skins.md](docs/skins.md) 填写后运行：

```bash
npm run skins:check     # 校验规范与对比度
npm run skins:preview   # 生成 dist/skins-preview.html 对比预览
```

### 操作与恢复

- 进入房间时预先随机布置三架飞机，可以拖动、旋转或重新随机；手机端将准备和开始按钮集中在棋盘下方的吸底操作区。人机点击「准备并开始」后，电脑准备完成即自动开局。
- 默认快速攻击（点格子立即攻击）；关闭「快速攻击」后改为先选格子再确认，并记住偏好。虚线表示猜测标记，最近攻击有边框与文字提示。
- 独立网页版在同一标签页刷新后，可在服务端会话保留期内恢复房间、已提交的布局、攻击记录和结局。未提交的布局、个人标记和本地人机对局不保存；服务器重启或会话过期后无法恢复。微应用继续使用原有页面内断线续接。
- 主动退出会先结算再返回大厅；同一对局重复收到结局或刷新结局页面不会重复计分。「最少攻击获胜」只新增正常击落获胜的纪录，旧战绩保留。
- 创建、加入等请求在断线、发送失败或超过 8 秒未响应时会解除等待并提示重试。

### 回归验证

```bash
node --test tests/*.test.js
```

手机与双客户端回归使用项目已有 Playwright 包及本机 Google Chrome，在隔离的浏览器上下文中运行：

```bash
# 分别在两个终端启动隔离的服务与前端
PORT=3107 node server.js
NO_DEVTOOLS=1 VITE_WS_URL=ws://127.0.0.1:3107/ws npm run dev -- --host 127.0.0.1 --port 5174

# 第三个终端执行，截图保存到 /tmp/airplane-*-after.png
GAME_TEST_URL=http://127.0.0.1:5174 node tests/ui-smoke.mjs
# 大厅、三套皮肤、快速匹配和转人机回归（使用同一前后端）
GAME_TEST_URL=http://127.0.0.1:5174 node tests/lobby-smoke.mjs
```

## 代码结构

| 位置 | 说明 |
| --- | --- |
| `shared/planes.js` | 飞机形状、布局校验、随机布置（前后端共用） |
| `shared/game-engine.js` | 对局引擎：房间、准备、回合、计时、再来一局、掉线（前后端共用） |
| `server.js` | HTTP 服务 + 把 WebSocket 事件转给对局引擎 |
| `server/realtime.js` | 基于 `ws` 的轻量实时层，支持断线续接 |
| `server/mini-app-auth.js` | 微应用平台 JWT 校验 |
| `src/local/` | 人机对战：浏览器内运行同一对局引擎 + 电脑玩家（`ai.js` 概率推理） |
| `src/components/` | 大厅、房间（布置飞机）、对局、规则弹窗、皮肤选择 |
| `src/skins/` | 皮肤规范（`schema.js`）、注册与切换（`index.js`）、内置皮肤与模板 |
| `src/net/socket.js` | 客户端实时连接（网页版原生 WebSocket / 微应用 SDK） |

## 技术栈

- 前端：Vue 3 + Vite
- 后端：Node.js + Express + `ws`
- 社区微应用：[Discourse 微应用 SDK](https://github.com/linux-do/mapp-developer-guide)（`vendor/mini-app-sdk`）

## 安装与运行

```bash
npm install
npm run start        # 同时启动后端（3000）和前端开发服务器（5173）
```

浏览器打开 http://localhost:5173 。局域网内其他设备访问 `http://<你的IP>:5173` 即可联机。

调试日志：生产构建默认不输出 `console.log`；网页版地址加 `?debug=1`（或在控制台执行 `localStorage.debug = '1'`）后刷新即可打开。服务端设置 `DEBUG=1` 会打印每条事件。

## 部署方式

### 传统部署（开发/测试环境）

1. 确保已安装 Node.js 和 npm
2. 克隆本仓库
3. 安装依赖：

```bash
npm install
```

4. 启动服务器和前端（开发模式）：

```bash
npm run start
```

5. 游戏将在 http://localhost:5173 上运行

### Docker部署（推荐生产环境）

#### 方式一：使用Docker Compose（推荐）

1. 确保已安装Docker和Docker Compose
2. 在项目根目录执行：

```bash
# 构建并启动容器
docker-compose up -d

# 查看运行状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

3. 游戏将在 http://localhost:3000 上运行

#### 方式二：使用Docker命令

1. 构建镜像：

```bash
docker build -t airplane-game .
```

2. 运行容器：

```bash
docker run -d \
  --name airplane-game \
  -p 3000:3000 \
  --restart unless-stopped \
  airplane-game
```

#### Docker部署优势

- **镜像体积优化**：使用多阶段构建，生产镜像仅包含必要文件
- **安全性提升**：运行在非root用户环境下
- **环境一致性**：确保在任何支持Docker的环境中都能正常运行
- **便于扩展**：可轻松进行水平扩展和负载均衡

#### 管理命令

```bash
# 停止容器
docker-compose down

# 重新构建和启动
docker-compose up -d --build

# 查看容器日志
docker-compose logs airplane-game

# 进入容器调试
docker exec -it airplane-game sh
```

## 社区微应用

本项目可以打包为 [社区微应用](https://github.com/linux-do/mapp-developer-guide)，在论坛内直接游玩。网页版和微应用共用同一套 Vue 界面和同一个游戏服务。

### 架构

| | 独立网页版 | 社区微应用 |
| --- | --- | --- |
| 构建 | `npm run build` → `dist/` | `npm run build:mini-app` → `dist/mini-app/package/app.zip` |
| 页面 | 由 `server.js` 同源提供 | 由社区容器加载 `index.html` 片段 + 单个 IIFE `app.js` / `app.css` |
| 实时连接 | 原生 WebSocket → `/ws` | SDK `sdk.network.reconnectSocket("game")` → `/mini-app/ws` |
| 鉴权 | 无 | 握手时校验平台 JWT（`mini_app_token`） |
| 用户名 | 手动输入 | 默认填入社区昵称（`user.read`） |

微应用运行在沙箱中，所以：原生 `alert/confirm` 改为应用内提示框（`src/ui/dialog.js`）；复制房间号走 SDK 剪贴板（`clipboard.write`）；不加载外部字体；不修改页面地址。

### 1. 部署游戏服务（需要公网 HTTPS）

微应用只能连接 `wss://` 端点，且域名不能与论坛相同。把 Docker 服务部署到你的域名并配置 TLS 反向代理（需要支持 WebSocket upgrade），然后在 `docker-compose.yml` 中填写：

```yaml
environment:
  - MINI_APP_ISSUER=https://linux.do              # 社区基地址，含子目录，不以 / 结尾
  - MINI_APP_ID=社区应用页分配的应用ID
  - MINI_APP_PUBLIC_ORIGIN=https://zha-fei-ji.onrender.com  # 本服务对外 HTTPS 地址
  - MINI_APP_CHANNELS=production,sandbox          # sandbox 调试时加入 sandbox
```

配置后 `/mini-app/ws` 会从 `MINI_APP_ISSUER/mini-app-api/jwks` 获取公钥并校验每次握手；未配置时不校验（仅适合本地开发）。`/ws` 始终供网页版使用。

可选的对局参数：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `TURN_MS` | `30000` | 每回合限时（毫秒）。超时由服务器代为随机攻击，连续 3 次超时判负 |
| `RESUME_GRACE_MS` | `45000` | 断线后保留会话的时间（毫秒）。期间重连可接回原对局，超时判离开 |

服务端规则（防作弊）：飞机布局由服务端按标准机型校验；开局时每位玩家只收到自己的布局，对方飞机只在被击落时公开该架、在对局结束后全部公开。

### 2. 构建并上传

1. 在社区个人资料的应用页创建应用，复制应用 ID。
2. 构建 ZIP：

```bash
MINI_APP_ID=应用ID MINI_APP_VERSION=1.0.0 MINI_APP_WS_URL=wss://zha-fei-ji.onrender.com/mini-app/ws npm run build:mini-app
```

3. 在应用的沙箱页签上传 `dist/mini-app/package/app.zip`，在 `/apps-sandbox/<app-id>/<version>-<sha>` 中测试，再按[提审说明](https://github.com/linux-do/mapp-developer-guide/blob/main/docs/submission-review.md)发布。调试版（保留 source map）使用 `npm run build:mini-app:debug`。

申请的权限见 `mini-app/manifest.json`：`user.read`（默认昵称）、`network.websocket`（联机）、`clipboard.write`（复制邀请）、`storage.read` / `storage.write`（保存战绩）。每次重新上传需要修改内容或提高版本号。

## 局域网访问说明

### Docker部署局域网访问

1. 找到本机IP地址（Windows使用`ipconfig`，Mac/Linux使用`ifconfig`或`ip addr`命令）
2. 确保防火墙允许端口3000的访问
3. 启动Docker容器：`docker-compose up -d`
4. 局域网内其他用户可通过以下地址访问：
   - Docker部署：`http://[你的IP地址]:3000`

### 传统部署局域网访问

1. 确保防火墙允许端口3000和5173的访问
2. 启动应用：`npm run start`
3. 局域网内其他用户可通过以下地址访问：
   - 开发环境：`http://[你的IP地址]:5173`
   - 生产环境：`http://[你的IP地址]:3000`

注意：如果使用传统生产环境，请先执行`npm run build`构建应用。

## 故障排除

### Docker相关问题

**问题：容器启动失败**
```bash
# 检查容器日志
docker-compose logs airplane-game

# 检查容器状态
docker-compose ps
```

**问题：端口被占用**
```bash
# 修改docker-compose.yml中的端口映射
ports:
  - "3001:3000"  # 将主机端口改为3001
```

**问题：Socket.io连接失败**
- 确认防火墙已开放相应端口
- 检查容器网络配置是否正确
- 验证客户端连接的URL是否正确

### 性能优化建议

- 生产环境建议使用Docker部署
- 可考虑使用nginx作为反向代理
- 启用Docker容器资源限制以优化资源使用
