# 🐺 狼人杀在线游戏

一个完整的H5在线狼人杀游戏平台，支持6-12名玩家，包含25个角色、实时聊天、房间管理等功能。

## 📋 项目结构

```
werewolf-game/
├── backend/           # Node.js + Express 后端服务
│   ├── server.js      # 主服务器，包含API路由、Easemob集成
│   └── .env           # 环信配置（需要配置）
├── frontend/          # Vue 3 + Vite H5 前端应用
│   ├── src/
│   │   ├── views/     # 页面组件
│   │   │   ├── Login.vue      # 登录注册
│   │   │   ├── Lobby.vue      # 大厅（房间列表、用户信息）
│   │   │   ├── Config.vue     # 板子配置（角色选择）
│   │   │   └── Room.vue       # 游戏房间
│   │   ├── components/
│   │   │   └── AppLayout.vue  # 共享布局组件
│   │   ├── stores/
│   │   │   └── gameStore.ts   # Pinia 状态管理
│   │   └── style.css          # 全局样式（深色主题）
│   └── ROLES_GUIDE.md         # 25个角色详细文档（.gitignore）
└── README.md
```

## 🚀 快速启动

### 1. 后端启动

```bash
cd werewolf-game/backend

# 安装依赖
npm install

# 配置环信凭证（在 .env 中）
# EASEMOB_CLIENT_ID=your_client_id
# EASEMOB_CLIENT_SECRET=your_client_secret

# 开发模式运行
npm run dev
```

后端运行在 `http://localhost:3000`

### 2. 前端启动（新终端）

```bash
cd werewolf-game/frontend

# 安装依赖
npm install

# 开发模式运行
npm run dev
```

前端运行在 `http://localhost:5173`

### 3. 打开浏览器

访问 `http://localhost:5173`

## ✅ 已实现功能

### 用户系统
- ✅ 注册/登录（使用Easemob环信账户）
- ✅ 用户信息管理（昵称、头像、ID、胜率）
- ✅ 头像选择（24个Emoji头像）
- ✅ localStorage 本地会话持久化
- ✅ 每个用户拥有独立的Easemob账户

### 大厅页面
- ✅ 用户信息卡片展示（ID、胜率）
- ✅ 房间创建/加入
- ✅ 房间列表显示

### 板子配置页面
- ✅ 新增/编辑/删除板子
- ✅ 收藏功能
- ✅ 25个角色（10个狼人、13个好人、2个第三方）
- ✅ 角色介绍抽屉（支持分类查看）
- ✅ 角色详细信息（技能、补充说明）
- ✅ 完整游戏规则配置（发牌方式、狼人胜利条件、亮暗牌等）
- ✅ 全屏编辑抽屉，支持4列网格展示角色
- ✅ 多层drawer交互隔离（遮罩层防止底层操作）

### 角色库（25个）
**狼人阵营（10个）：** 狼人、狼王、白狼王、狼美人、梦魇、恶灵骑士、石像鬼、隐狼、机械狼、邪恶商人

**好人阵营（13个）：** 村民、预言家、女巫、猎人、守卫、通灵师、魔术师、骑士、白痴、守墓人、奇迹商人、熊、摄梦人

**第三方（2个）：** 丘比特、盗贼

### 技术栈
- 🎨 Vue 3 Composition API + TypeScript
- 📦 Pinia 状态管理
- 🛣️ Vue Router 4 导航
- 🎭 Lucide Vue Next 图标库
- 🌙 深色主题 CSS 变量
- ⚡ Vite 构建工具
- 🔌 Express.js 后端
- 💬 Socket.io 实时通讯
- 🐦 Easemob IM SDK 集成
- 🌐 环信 REST API (用户管理、群组)
- 📝 dotenv 环境变量管理

## 🎮 游戏规则配置

板子配置支持以下规则选项：

- **发牌方式**：单身份 / 双身份
- **狼人胜利条件**：屠边 / 屠城
- **出局亮牌**：亮牌 / 暗牌
- **女巫首夜可自救**：可 / 不可
- **警长竞选**：有 / 无
- **自爆吞警徽**：单爆 / 双爆（仅在有警长竞选时显示）
- **自爆后首页可交流**：是 / 否

## 🔑 API 端点

### 用户认证
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `PUT /api/auth/user/:username` - 更新用户信息

### 房间管理
- `GET /api/rooms` - 获取房间列表
- `POST /api/rooms` - 创建房间
- `GET /api/rooms/:roomId` - 获取房间信息
- `POST /api/rooms/:roomId/join` - 加入房间

### Easemob集成
- `POST /api/easemob/token` - 获取Easemob token

## 📝 环信配置

### 获取凭证步骤

1. 注册 [Easemob 环信](https://www.easemob.com/)
2. 创建应用，获取 AppKey
3. 在应用管理中生成 Client ID 和 Client Secret
4. 在 `.env` 文件中配置：

```env
EASEMOB_CLIENT_ID=your_client_id
EASEMOB_CLIENT_SECRET=your_client_secret
EASEMOB_GRANT_TYPE=client_credentials
EASEMOB_APP_KEY=your_org_name#your_app_name
```

## 🎯 下一步开发方向

- ⏳ 游戏房间实时状态管理（WebSocket）
- ⏳ 角色分配系统
- ⏳ 游戏流程控制（白天/夜间轮换）
- ⏳ 投票机制
- ✅ 实时聊天集成 (Socket.io + Easemob IM)
- ⏳ 游戏胜负判定
- ⏳ 数据库集成（替代内存存储）

## 📖 环信集成详解

查看 [EASEMOB_INTEGRATION.md](./EASEMOB_INTEGRATION.md) 了解：
- 完整的环信集成流程
- 用户认证工作流
- 群组聊天实现
- 下一步优化方案

## 🛠️ 开发命令

### 前端

```bash
# 开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### 后端

```bash
# 开发模式（自动重启）
npm run dev

# 直接启动
npm start
```

## ⚙️ 部署到生产环境

### ECS 部署

```bash
# 1. 上传项目
scp -r werewolf-game root@your-ecs-ip:/home/

# 2. 安装依赖
cd /home/werewolf-game/backend && npm install --production
cd /home/werewolf-game/frontend && npm install && npm run build

# 3. 配置 Nginx
# 参考下方 Nginx 配置示例

# 4. 启动服务（使用 PM2）
npm install -g pm2
pm2 start backend/server.js --name werewolf-backend
pm2 startup
pm2 save
```

### Nginx 配置示例

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
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📱 响应式设计

- 专为H5设计，完全适配移动设备
- 深色主题，护眼体验
- 底部安全区域适配（刘海屏、虚拟键盘）
- 滑动抽屉交互
- 网格式角色选择

## 💡 常见问题

**Q: 前端无法连接后端 API？**
- 检查后端是否运行在 3000 端口
- 检查 CORS 是否启用（已在代码中配置）

**Q: 环信 token 获取失败？**
- 确认 Client ID 和 Secret 是否正确
- 检查环信应用状态
- 验证 AppKey 格式（orgName#appName）

**Q: 页面刷新后数据丢失？**
- 用户数据保存在 localStorage
- 房间数据目前使用内存存储，刷新会重置
- 生产环境建议集成数据库

## 📄 许可证

MIT

---

有任何问题或建议，欢迎反馈！🎮
