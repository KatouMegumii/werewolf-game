# CLAUDE.md — 狼人杀在线游戏

## 项目概览

H5 在线狼人杀游戏平台:Vue 3 + TS 前端,Express + Socket.io 后端,环信(声网)IM 做用户体系与群聊。

- `backend/` — Express + Socket.io(`server.js` 约 1300 行),PostgreSQL(`db.js`,boards 表),环信 REST 集成
- `frontend/` — Vue 3 + Pinia + Vite,页面:`Login` / `Lobby`(大厅) / `Config`(板子配置) / `Room`(游戏房间)
- 部署:后端 pm2(`werewolf-backend`),前端 Nginx 服务 `frontend/dist`(配置模板在 `deploy/nginx-werewolf.conf`),发布用 `./deploy.sh`(拉取+装依赖+重启后端+build 前端)
- 线上地址:http://langrensha.jxjhlrs.fun(https 未配;`backend/.env` 有环信凭证,勿提交——已在 .gitignore)

## 架构要点(当前实现)

- **房间生命周期**:建房(REST 建环信私有群,群主=房主)→ 入房(socket joinRoom **鉴权**:玩家必须真实在 room.players,否则 joinRoomFailed)→ 主动退出 leaveRoom(立即移除+空房删房+解散环信群)→ 断线 30s 缓冲重连(`schedulePlayerRemoval/cancelPlayerRemoval`)→ 每 30s 清扫孤儿房间
- **房主**:后端 `room.hostPlayerId` 判定(非座位号);房主退出自动转移给座位号最小玩家(广播 hostChanged);API:kick / transfer / dissolve / settings(仅房主)
- **座位**:`findAvailableSeat` 分配**第一个空闲座位**(不能 room.players.length+1,会与换座玩家撞号)
- **环信集成(重点)**:
  - 登录:后端 `/api/easemob/token` 用 App Token + `grant_type: inherit` 签发用户 token(免密);前端 `open({user, accessToken})`,token 只存内存+sessionStorage,**密码永不落前端**
  - 群管理:后端 REST 建群/加成员/移除/解散;`room.hostEasemobUser` 是环信群主,**群主不进不参与成员管理**(环信禁止移除群主)
  - **聊天(关键架构)**:发送走**后端 REST 代理**(`POST /api/rooms/:id/message` → 环信 REST `POST /messages`),接收走 **SDK `onTextMessage`**。**不要用 SDK `conn.send` 发群消息**(见心得)。双通道(socket.io 兜底)统一 `pushMessage` 去重(2s 同发送者同内容)
- **凭证安全**:登录/注册后环信 user token 由后端签发,前端 sessionStorage 缓存,关浏览器失效

## 今日开发心得(2026-08-03,踩坑记录)

1. **环信 SDK 4.9→4.24 是大版本跳跃,API 大面积改名**:
   - 群 API:`client.Group.joinGroup` → **`client.joinGroup`**(直接挂 connection 实例)
   - 消息回调:`onTxtMsg`/`onImageMsg` → **`onTextMessage`/`onImageMessage`**(旧名字永远不触发,消息"收不到"的根因之一)
   - 消息创建:`new WebIM.message('txt', {...})` → **`WebIM.message.create({...})`**
2. **环信 SDK 4.24 `conn.send` 发送群消息在此集群(ngi-a1)下永久挂起**:`call send` 后等服务器回执不返回(Promise 永不 resolve),直到断连报 510。已排除:joinGroup 403、伪 sock(sock 诊断正常:WebSocket/readyState 1)、压缩协商。**解法:发送走后端 REST 代理,接收走 SDK onTextMessage**(两者都实测可用)。此问题建议提环信工单,若官方有解可切回 SDK 发送
3. **joinGroup 在"已是成员"时 403,且可能卡死发送队列** → 成员由后端 REST 添加即可,前端**不要调 joinGroup**(SDK 登录后自动同步群列表,日志 `directJoined`/`membersPresence` 可证)
4. **座位撞号 bug**:join 时 `seatNumber = room.players.length + 1` 会与已换座玩家撞号(房主退出重进必撞:房间剩 B 坐 2 号,房主重进分配 2 号)→ 前端 `getPlayerBySeat` 匹配到 B,自己永远不显示,点一下换座才"出现"。**必须分配第一个空闲座位**
5. **socket.emit 后立即 disconnect 会丢包**(leaveRoom 事件丢失 → 房间残留)。修复:立即释放引用 + 延迟 500ms 断开;后端另有 30s 断线缓冲兜底。**socket.io 服务端 handler 不接收 callback 时,客户端传的 ack 不会触发**(曾误以为自动 ack)
6. **socket.io 的 CORS 与 HTTP 分开配置**:`app.use(cors())` 全放开,但 `io` 的 cors 默认只允许 localhost:5173 → 页面从域名加载时 WebSocket 握手被浏览器拦截(现象:HTTP 全通、socket 无连接日志、joinRoom 到不了后端)。开发默认 `origin: true`,生产用 `VITE_ALLOWED_ORIGIN` 配域名
7. **"/root 下文件 Nginx 读不了"**:nginx 用户无法穿透 `/root`(700 权限)→ 500 Permission denied。`chmod o+x /root` 解决(项目目录在 /root/werewolf-game)
8. **阿里云 ECS 直连 GitHub 间歇性不通**:git pull 会无限挂起(光标闪烁无输出)。`curl -m 10 -I https://github.com` 先测;不通时换 ssh 协议/走代理/或本地打包 scp 上传
9. **房主离开后环信群成员管理**:App Token 不能移除环信群主(403 forbidden_op),群主身份保留到群解散——设计上群主进出房间跳过成员管理
10. **板子座位数**:`roles` 是 `[{key,name,count}]` 数组,**座位数 = 各角色 count 之和**,不是 roles.length

## 后续开发指导

1. **游戏核心玩法(下一大模块)**:角色分配 → 昼夜流程 → 投票 → 胜负判定。Socket.io 通道已就位(`sendSystemMessage`/`receiveMessage` 可复用),房间 `gameState: {}` 是预留位
2. **实时通话(二期)**:用户已确认用 AgoraRTC 自研封装(不嵌 React 的 EaseCallUIKit)。前提:环信控制台开通声网音视频能力
3. **已知待办**:
   - 环信 SDK send 挂死 → 提环信工单(SDK 4.24 + ngi-a1 集群),有解则把聊天发送切回 SDK
   - https 未配(certbot --nginx 可配,需 ECS 安全组放行 443;配后同步 `VITE_API_URL`/`VITE_ALLOWED_ORIGIN` 为 https)
   - `db.js` 的 boards 表只有板子,房间数据全在内存(重启即丢)——规模大了换数据库持久化
4. **开发约定**:
   - 改 `backend/.env` 后**必须重启后端**(dotenv 启动时读一次,nodemon 不会因 .env 变化重载)
   - 前端改动 → 本地 `npm run build` 验证 → 云上 `./deploy.sh`;浏览器强刷(无痕窗口)排除缓存
   - 环信 REST 端点(建群/加成员/消息)都以 `ngi-a1.easemob.com` 为前缀,`getAppToken()` 有缓存
   - 本地开发:后端 `npm run dev`(3000),前端 `npm run dev`(5173),本地 PG(Homebrew postgresql@16,库 werewolf,用户 dingyi 免密)

## 关键文件索引

- `backend/server.js` — 全部业务:auth/rooms/房主/环信REST/socket 事件
- `frontend/src/stores/gameStore.ts` — Pinia 状态:登录凭证、房间、socket、环信、消息(pushMessage 去重)
- `frontend/src/api/easemob.ts` — SDK 封装:token 登录、群消息收发(onTextMessage)、消息 create
- `frontend/src/views/Room.vue` — 房间 UI:座位区(renderTick 强制重建)、聊天、设置面板
- `deploy/nginx-werewolf.conf` — Nginx 生产配置(含 /socket.io/ Upgrade 反代)
- `deploy.sh` — 一键发布
