# CLAUDE.md — 狼人杀在线游戏

## 项目概览

H5 在线狼人杀游戏平台:Vue 3 + TS 前端,Express + Socket.io 后端,环信(声网)IM 做用户体系与群聊。

- `backend/` — Express + Socket.io(`server.js` 约 1300 行),PostgreSQL(`db.js`,boards 表),环信 REST 集成
- `frontend/` — Vue 3 + Pinia + Vite,页面:`Login` / `Lobby`(大厅) / `Config`(板子配置) / `Room`(游戏房间)
- 部署(云服务器 `/root/werewolf-game`,需先 `chmod o+x /root` 否则 Nginx 500):后端 pm2(`werewolf-backend`),前端 Nginx 服务 `frontend/dist`(配置模板在 `deploy/nginx-werewolf.conf`),发布 = 服务器上执行 `./deploy.sh`:`git pull`(网络不稳重试一次)→ 后端 `npm install` + `pm2 restart werewolf-backend`(无则 `pm2 start server.js --name "werewolf-backend"`)→ 前端 `npm install` + `npm run build`
- **注意:每次发布都会 pm2 重启后端 → 内存房间全部丢失**(房间数据在内存,重启后不可恢复),遗留环信群靠启动清扫自动解散(见心得 11)
- 线上地址:https://langrensha.jxjhlrs.fun(https 已配,certbot;`backend/.env` 有环信凭证,勿提交——已在 .gitignore)

## 架构要点(当前实现)

- **房间生命周期**:建房(REST 建环信私有群,群主=房主)→ 入房(socket joinRoom **鉴权**:玩家必须真实在 room.players,否则 joinRoomFailed)→ 主动退出 leaveRoom(立即移除+空房删房+解散环信群)→ 断线 30s 缓冲重连(`schedulePlayerRemoval/cancelPlayerRemoval`)→ 每 30s 清扫孤儿房间
- **房主**:后端 `room.hostPlayerId` 判定(非座位号);房主退出自动转移给座位号最小玩家(广播 hostChanged);API:kick / transfer / dissolve / settings(仅房主)
- **座位**:`findAvailableSeat` 分配**第一个空闲座位**(不能 room.players.length+1,会与换座玩家撞号)
- **环信集成(重点)**:
  - 登录:后端 `/api/easemob/token` 用 App Token + `grant_type: inherit` 签发用户 token(免密);前端 `open({user, accessToken})`,token 只存内存+sessionStorage,**密码永不落前端**
  - 群管理:后端 REST 建群/加成员/移除/解散;`room.hostEasemobUser` 是环信群主,**群主不进不参与成员管理**(环信禁止移除群主);**群随房间销毁**:房主解散/最后一人离房/孤儿清扫都调 `destroyEasemobGroup`,失败进 `pendingGroupDestroys` 队列由 30s 清扫兜底重试(404 幂等)
  - **用户名大小写(约定,2026-08-07 两次实测定稿)**:环信**登录/查询大小写不敏感、账号以小写存储**(输入大写 `Testplayer1` 实际登录的是 `testplayer1`,后台无大写账号;早前"大小写保留、两个独立用户"的推断是误读应用层数据分裂)。策略 = **注册小写(创建规范)+ 登录原样验密、后端 GET /users 解析真实名、前端原样存储使用**(见心得 12,新增代码涉及 username 必须遵守)
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
12. **环信用户名大小写(换头像/昵称"保存成功但重新登录回退"的根因;2026-08-07 两次实测定稿)**:环信**登录/查询大小写不敏感,账号创建即以小写存储**(输入大写 `Testplayer1` 登录到的是 `testplayer1`,后台不存在大写账号;此前"大小写保留、两个独立用户"的推断被实测推翻——看到的"两个用户"是应用层数据分裂:PG boards 里 userId 大小写两种记录/旧 localStorage 残留,不是环信层两个用户)。关键教训仍是 **metadata(昵称/头像)读写 key 的一致性**:曾因读写大小写不一致把属性劈成两条记录导致回退。**策略 = 注册小写 + 全程真实名**,防御四层:
    - ① **注册小写(创建规范)**:`/api/auth/register` + 前端注册表单统一 `toLowerCase()`,新用户一律小写,保证 `用户名 == 环信真实名 == metadata key` 一致,不再产生新分裂
    - ② **登录与后续操作(访问规范)**:登录输入**原样 trim 不转大小写**验密(环信大小写不敏感,原样即可命中),后端 `GET /users` 解析真实名随响应返回,前端 `setCurrentUser`/`getEasemobToken` **原样存储使用**。曾用 toLowerCase 覆盖真实名导致 SDK user/token 不一致、聊天语音挂掉(已修;真实名方案在大小写敏感/不敏感两种假设下都成立,是稳的设计,无需简化回 toLowerCase)
    - ③ 后端所有环信调用入口(`PUT /api/auth/user`/`/api/easemob/token`/建房/入房)统一经 `normalizeEasemobUsername()` 取环信真实名——`GET /users` 大小写不敏感,带缓存;兜底存量混合大小写记录(必须靠 GET 取真实名,不能自己转)
    - ④ 登录补**密码验证**(`grant_type=password` 换 token,错密码 401):此前 login 只 GET /users 查存在性,**任意密码可登录任意账号**
14. **PG 驼峰列名折叠(建房 403/收藏规则失效的隐藏根因,2026-08-07)**:PostgreSQL 会把**未加引号**的驼峰列名折叠成小写——`CREATE TABLE` 写的 `userId/isFavorite/gameConfig` 实际是 `userid/isfavorite/gameconfig`,pg 驱动返回的 key 也是小写,`row.userId` 永远是 undefined!曾导致:板子归属校验(`boardRow.userId`=undefined)对**任何板子**都 403「板子不存在或无权使用」、GET /api/boards 的 isFavorite/gameConfig 读取失效(收藏星不显示、规则刷新回默认)。**规矩:SQL 一律用小写列名,SELECT 用 `AS "驼峰"` 别名还原 API 契约**(前端不用改)
11. **环信群生命周期必须与房间删除绑定,否则环信后台残留群**:房间数据全在内存、环信群在环信服务器持久化,两者不对称。曾有三处泄漏:① 进程重启(pm2/deploy.sh)内存房间全丢,群永久残留(**最大泄漏源**,每次发布就批量残留);② 30s 孤儿清扫删房不删群;③ `destroyEasemobGroup` 失败仅 warn 无重试。修复:删房必删群(含孤儿清扫,去掉空房死角);删群失败进 `pendingGroupDestroys` 重试队列,30s 清扫兜底(404 幂等);**启动清扫**:仅 pm2 生产环境触发,群名统一 `room_{6位房间号}` 前缀过滤(避免误删共用 appkey 的其他群),**先取群快照再 listen**(避免误删新群),`EASEMOB_STARTUP_SWEEP=0` 可禁用,本地 npm run dev 不触发
13. **语音(iOS Chrome 连不上 + "测几十秒计 18 分钟时长")**:① iOS 上 getUserMedia **必须由用户手势触发**——自动进频道(无手势)取麦克风会被静默拒绝,且失败后必须留**手势重试入口**(语音按钮三态:加入中 disabled / 失败可点重试 / 已加入静音切换);Agora `createMicrophoneAudioTrack` 要**先于 `client.join`**(iOS WebKit 文档建议);codec 用 `vp8`(纯音频不影响音质)。② `voiceCall.ts` 的 Agora client 是**模块级单例**,三条泄漏路径让服务端会话挂到 Agora 超时(~10-20min,环信后台按此计费):join 失败时 `client.leave()` fire-and-forget 且立即置 null(leave 挂起=僵尸会话)、`leaveVoice` 早退跳过清理、刷新/关标签页无 `pagehide` 兜底。修复:失败路径 **await leave(3s 超时兜底)再置 null**、`leaveVoice` 用 `hasClient()` 判断而非仅 isVoiceJoined、`pagehide` 时尽力 leave;`voiceError` 带上具体原因上屏(手机无控制台,排查靠 UI)。③ **服务端踢人停表**(2026-08-07 实现):声网 RESTful 频道管理 `POST api.sd-rtn.com/dev/v1/kicking-rule`,鉴权 = Customer ID/Secret 的 HTTP Basic(控制台→RESTful API 生成),body `{appid(从 rtc-token 响应缓存), cname, time:0, privileges:['join_channel']}`——**只填 cname 不填 uid = 频道级全踢,time:0 = 立即移出且规则即刻过期(可加入其他频道)**;房间销毁三处(空房/解散/清扫)联动调用,死亡客户端计费立即停止

## 后续开发指导

1. **游戏核心玩法 + 房间状态机(下一大模块,设计草案 2026-08-07)**:
   - **状态流转**:waiting(等待)→ playing(发牌+昼夜轮转)→ ended(结算);后端唯一权威,`room.status` 字段已存在但**无流转**,`gameState: {}` 已预留
   - **gameState 结构**:角色分配、昼夜阶段、存活、投票记录(房间对象字段已留)
   - Socket 通道已就位(`sendSystemMessage`/`receiveMessage` 可复用);房主/系统触发流转,socket 广播状态
   - **与语音的关联**:频道 `room_{roomId}` 已按房间隔离;分组语音(狼人夜间等)用 `switchVoiceChannel`(voiceCall.ts 已实现)按阶段切频道;**ended/房间销毁 → 服务端踢人停表**(已实现,声网 RESTful kicking-rule,见心得 13)
2. **实时通话**:已实现(voiceCall.ts + voiceStore,语音房间模式:进房即在频道、全员 host 可发言、静音 setEnabled);跨浏览器与计费残留教训见心得 13;服务端踢人停表已实现(房间销毁三处联动)
3. **已知待办**:
   - 环信 SDK send 挂死 → 提环信工单(SDK 4.24 + ngi-a1 集群),有解则把聊天发送切回 SDK
   - **服务端踢人停表**:已实现(声网 RESTful `POST /dev/v1/kicking-rule`,cname 级 + time:0,房间销毁三处联动:空房/解散/清扫)——**注意 .env 需配 `AGORA_CUSTOMER_ID`/`AGORA_CUSTOMER_SECRET`**(声网控制台 → 项目 → RESTful API 生成;appid 从 rtc-token 响应自动缓存,无需配置);没配凭证时踢人自动跳过仅 warn,回归"客户端死亡计费等 Agora 超时"的旧行为
   - 语音跨浏览器兼容与"18分钟语音时长"教训已修(见心得 13),真机 iOS Chrome/Safari 回归验证待做
   - `db.js` 的 boards 表只有板子,房间数据全在内存(重启即丢)——规模大了换数据库持久化
4. **开发约定**:
   - 改 `backend/.env` 后**必须重启后端**(dotenv 启动时读一次,nodemon 不会因 .env 变化重载)
   - **改动做完由 Claude 直接 `git commit`**(需 push 时也顺手做)——线上 `deploy.sh` 靠 `git pull` 部署,**未提交的改动永远不会上线**(曾因漏提交 ext 改动导致线上跑旧代码、误判环信 ext 不透传,浪费一轮排查)
   - 前端改动 → 本地 `npm run build` 验证 → 云上 `./deploy.sh`;浏览器强刷(无痕窗口)排除缓存
   - 环信 REST 端点(建群/加成员/消息)都以 `ngi-a1.easemob.com` 为前缀,`getAppToken()` 有缓存
   - 本地开发:后端 `npm run dev`(3000),前端 `npm run dev`(5173),本地 PG(Homebrew postgresql@16,库 werewolf,用户 dingyi 免密)

## 关键文件索引

- `backend/server.js` — 全部业务:auth/rooms/房主/环信REST/socket 事件
- `shared/boardUtils.js` — 座位数计算**唯一实现**(前后端共用,shared/package.json 声明 type:module;改规则只改这里)
- `frontend/src/stores/gameStore.ts` — Pinia 状态:登录凭证、房间、socket、环信、消息(pushMessage 去重)
- `frontend/src/api/easemob.ts` — SDK 封装:token 登录、群消息收发(onTextMessage)、消息 create
- `frontend/src/views/Room.vue` — 房间 UI:座位区(renderTick 强制重建)、聊天、设置面板
- `deploy/nginx-werewolf.conf` — Nginx 生产配置(含 /socket.io/ Upgrade 反代)
- `deploy.sh` — 一键发布(云服务器执行;git pull→重启后端→build 前端;**重启会丢全部房间**,遗留环信群由启动清扫解散)
