# 狼人杀在线游戏 - 启动指南

## 项目结构

```
werewolf-game/
├── backend/        # Node.js + Express 后端服务
└── frontend/       # Vue 3 H5 前端应用
```

## 快速启动

### 1. 后端启动

```bash
cd werewolf-game/backend

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 或直接运行
npm start
```

后端会运行在 `http://localhost:3000`

### 2. 前端启动（新终端）

```bash
cd werewolf-game/frontend

# 安装依赖
npm install

# 开发模式运行
npm run dev
```

前端会运行在 `http://localhost:5173`

### 3. 在浏览器中打开

访问 `http://localhost:5173`

## 功能演示

### 当前实现的功能

✅ **房间管理**
- 创建房间
- 加入房间
- 查看房间列表
- 查看房间内玩家

✅ **API 端点**
- `POST /api/rooms` - 创建房间
- `POST /api/rooms/:roomId/join` - 加入房间
- `GET /api/rooms` - 获取房间列表
- `GET /api/rooms/:roomId` - 获取房间信息
- `POST /api/easemob/token` - 获取环信token

✅ **前端 UI**
- 大厅页面（创建/加入房间）
- 游戏房间页面（玩家列表）
- 响应式设计

### 下一步要做的事情

📋 **环信SDK集成**
- 在Room.vue中初始化环信WebSocket连接
- 实现文字聊天消息发送/接收
- 实现语音通话功能

📋 **游戏逻辑**
- 角色分配（狼人、村民、预言家等）
- 游戏流程管理（白天/夜间）
- 投票机制
- 胜负判定

📋 **优化**
- 数据库集成（替代内存存储）
- WebSocket实时更新
- 生产环境部署配置

## 环信 SDK 集成步骤

### 1. 安装环信 SDK

```bash
cd frontend
npm install easemob-websdk
```

### 2. 在 Room.vue 中使用

```javascript
import WebIM from 'easemob-websdk'

WebIM.conn.open({
  user: playerId,
  pwd: easemobToken,
  appKey: EASEMOB_APP_KEY
})
```

具体的集成代码会在下一阶段提供。

## 部署到 ECS

### 1. 上传项目文件到 ECS

```bash
scp -r werewolf-game root@your-ecs-ip:/home/
```

### 2. 在 ECS 上安装依赖

```bash
# 安装 Node.js（如果还未安装）
curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
sudo yum install -y nodejs

# 安装后端依赖
cd /home/werewolf-game/backend
npm install --production

# 安装前端依赖并构建
cd /home/werewolf-game/frontend
npm install
npm run build
```

### 3. 配置 Nginx

创建 `/etc/nginx/conf.d/werewolf.conf`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /home/werewolf-game/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 4. 启动服务

```bash
# 启动后端（使用 PM2）
npm install -g pm2
pm2 start /home/werewolf-game/backend/server.js --name werewolf-backend

# 启动 Nginx
sudo systemctl start nginx
```

## 测试 API

### 创建房间

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"playerName": "Alice"}'
```

### 获取房间列表

```bash
curl http://localhost:3000/api/rooms
```

### 加入房间

```bash
curl -X POST http://localhost:3000/api/rooms/{roomId}/join \
  -H "Content-Type: application/json" \
  -d '{"playerName": "Bob"}'
```

## 配置文件

### 后端配置

编辑 `backend/server.js` 中的环信配置：

```javascript
const EASEMOB_CONFIG = {
  appKey: '你的AppKey',
  orgName: '你的组织名',
  appName: '你的应用名',
  clientId: process.env.EASEMOB_CLIENT_ID,
  clientSecret: process.env.EASEMOB_CLIENT_SECRET
}
```

## 常见问题

**Q: 前端无法连接后端 API？**
- 检查后端是否运行在 3000 端口
- 检查 CORS 是否启用（已在代码中配置）

**Q: 环信 token 获取失败？**
- 确认 AppKey 是否正确
- 检查环信控制台是否创建了对应的应用

**Q: 页面刷新后房间数据丢失？**
- 目前使用内存存储，刷新会重置。生产环境需要使用数据库

## 下一步

1. ✅ 验证前后端能否正常通信
2. ⏳ 集成环信 SDK 实现文字聊天
3. ⏳ 添加游戏核心逻辑
4. ⏳ 部署到 ECS 服务器

有任何问题，欢迎反馈！🎮
