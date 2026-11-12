# 全民打飞机：微应用发布说明

## Render 环境变量

如果应用创建于 Linux DO，在 Render 服务的 Environment 中填写：

```env
MINI_APP_ISSUER=https://linux.do
MINI_APP_ID=01a1cdba-4aad-77cd-9c6e-89dcc61b7ffa
MINI_APP_PUBLIC_ORIGIN=https://zha-fei-ji.onrender.com
MINI_APP_CHANNELS=sandbox
```

保存并部署包含本轮修复的后端。正式发布时可将渠道改为 `production,sandbox`，或者只允许 `production`。社区地址必须与应用所属社区一致；URL 不加结尾斜杠。当前改动不会自动更改 Render 后台配置。

服务端按已验证 JWT 的社区、应用和渠道分配引擎，网页匿名访问使用独立引擎。沙箱、正式、网页版无法互相匹配或凭房间号加入。续接必须满足端点、社区、应用、渠道及用户一致。未配置鉴权时 `/mini-app/ws` 拒绝连接，不会静默放行。当前官方规范不要求已建立连接因 JWT 到期或固定 300 秒而关闭；每次重连仍重新验签。

## 本次上传包

- 应用：全民打飞机
- ID：`01a1cdba-4aad-77cd-9c6e-89dcc61b7ffa`
- 版本：`1.0.0`
- WSS：`wss://zha-fei-ji.onrender.com/mini-app/ws`
- 文件：`dist/mini-app/release-1.0.0-20261111/package/app.zip`
- SHA-256：`479a51ff36914d3068950049cb550a8f39eba49776308459ea84454553506559`

上传这份新 ZIP，不要上传旧的 `dist/mini-app/package/app.zip`。本次保留了旧构建目录。图标在社区应用页单独上传 `public/quanmin-plane-icon.png`，不需要放进运行 ZIP。

## 后续构建

```bash
npm test
npm run skins:check
npm run build:mini-app
```

构建前会验证最终 ID、版本和 WSS 地址；占位 ID、示例域名与无效版本直接失败。环境变量 `MINI_APP_ID`、`MINI_APP_VERSION`、`MINI_APP_WS_URL` 可以覆盖源码，但同样经过校验。打包使用官方 SDK `pack`。每次重新打包后还应使用同步过规则的 mapp-developer skill `scripts/check_zip.mjs` 验证最终 ZIP。

## 沙箱验收

1. 上传新 ZIP，首次打开正常显示大厅，无永久加载状态。
2. 使用两个有沙箱访问资格的账号测试快速匹配、好友房和完整对局。
3. 测试网络断开与重连、退出结算，以及关闭再打开后的皮肤与战绩恢复。
4. 拒绝权限或游客访问时，有明确提示且人机仍能使用。
5. 复制邀请只在点击后触发；检查手机布阵和三套皮肤。
6. 测试沙箱房间号不能从正式版或网页版加入。

本地测试和 ZIP 校验通过不代表已通过社区沙箱或审核。测试后在应用页新建发布，选择同一份构建，填写更新说明及审核备注。若历史已有正式 `1.0.0`，需选择更高版本重新构建。

## 权限与数据流说明

- `user.read`：读取社区昵称及联机平台授权。
- `network.websocket`：连接本应用运营的 Render 服务，用于房间、匹配、布局和回合消息。布局由服务端验证，只向对手公开允许看到的信息。
- `clipboard.write`：点击复制邀请时写入房间邀请文案。
- `storage.read` / `storage.write`：保存战绩、皮肤和新手引导记录。
- 不要求用户输入论坛密码，不读取论坛 Cookie；认证公钥从配置中的固定社区地址获取，握手失败拒绝连接。
- 对局与房间在服务端内存中，服务重启或免费实例休眠会中断进行中的对局；不声称持久化恢复。
