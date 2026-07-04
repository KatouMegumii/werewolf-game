# 云端部署指南

## 前置要求

- ECS实例（推荐 Ubuntu 20.04 LTS 或更高版本）
- Node.js 18+ 和 npm
- Git
- PM2（进程管理器）

## 部署步骤

### 1. ECS环境准备

```bash
# 登录ECS，更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js和npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装PM2全局
sudo npm install -g pm2

# 验证安装
node --version
npm --version
pm2 --version
```

### 2. 克隆代码

```bash
# 进入工作目录
cd /home/ubuntu/

# 克隆仓库（假设使用GitHub）
git clone <your-repo-url> werewolf-game
cd werewolf-game
```

### 3. 后端部署

```bash
cd backend

# 安装依赖
npm install

# 创建 .env 文件（复制.env.example并填入真实凭证）
cp .env.example .env
# 编辑 .env，填入以下内容：
# EASEMOB_CLIENT_ID=your_client_id
# EASEMOB_CLIENT_SECRET=your_client_secret
# VITE_ALLOWED_ORIGIN=http://your-domain.com
# PORT=3000

# 用PM2启动后端
pm2 start server.js --name "werewolf-backend"

# 验证后端运行
curl http://localhost:3000/health
```

### 4. 前端部署

```bash
cd ../frontend

# 安装依赖
npm install

# 创建 .env 文件
cp .env.example .env
# 编辑 .env，填入：
# VITE_API_URL=http://your-domain.com:3000

# 构建
npm run build

# 用PM2启动前端开发服务器（或用Nginx）
# 方式A：PM2启动（开发环境）
pm2 start "npm run dev" --name "werewolf-frontend"

# 方式B：用Nginx提供（生产环境推荐）
# 见下方Nginx配置
```

### 5. 使用Nginx反向代理（生产推荐）

```bash
# 安装Nginx
sudo apt install -y nginx

# 创建Nginx配置
sudo nano /etc/nginx/sites-available/werewolf

# 粘贴以下内容：
```

```nginx
upstream backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;  # 改为你的域名

    # 前端静态文件
    location / {
        root /home/ubuntu/werewolf-game/frontend/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # 后端API和WebSocket
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Socket.io
    location /socket.io {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/werewolf /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 6. 启用HTTPS（推荐用Let's Encrypt）

```bash
# 安装Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo systemctl enable certbot.timer
```

### 7. PM2进程管理

```bash
# 查看所有进程
pm2 list

# 保存进程列表（开机自启）
pm2 save
pm2 startup

# 查看日志
pm2 logs werewolf-backend
pm2 logs werewolf-frontend

# 重启服务
pm2 restart werewolf-backend
pm2 restart werewolf-frontend

# 停止服务
pm2 stop werewolf-backend
```

## 数据库管理

后端使用SQLite自动存储数据：
- 数据库文件位置：`backend/werewolf.db`
- 自动初始化所需表
- 支持备份：`cp backend/werewolf.db backend/werewolf.db.backup`

## 测试

### 本地测试

```bash
# 打开浏览器访问
http://your-domain.com

# 或本地调试
http://localhost:5173  # 前端
http://localhost:3000  # 后端
```

### 多用户测试

1. 用不同浏览器或隐私模式打开
2. 分别注册不同账户
3. 其中一个创建房间
4. 其他账户加入房间
5. 测试座位交换、聊天等功能

### 邀请朋友测试

1. 分享你的域名：`http://your-domain.com`
2. 朋友使用手机或电脑访问
3. 注册账户、创建/加入房间
4. 测试实时通信功能

## 常见问题

### WebSocket连接失败
- 检查Nginx配置中的WebSocket转发
- 确保Socket.io端口没被防火墙阻止

### 前端连接不到后端
- 检查VITE_API_URL环境变量设置
- 确保后端运行在正确的端口
- 检查防火墙规则

### 数据库文件过大
- 定期清理历史数据
- 考虑迁移到MySQL以获得更好的性能

## 性能优化建议

1. **启用Gzip压缩**：在Nginx配置中添加
   ```nginx
   gzip on;
   gzip_types text/plain application/json application/javascript;
   ```

2. **配置CDN**：用CDN加速静态资源

3. **监控**：用PM2 Plus或其他工具监控应用健康状态

4. **日志管理**：使用logrotate定期轮转日志

## 安全建议

1. 用HTTPS（Let's Encrypt免费证书）
2. 配置防火墙：仅开放80和443端口
3. 定期更新依赖包：`npm audit fix`
4. 隐藏敏感信息到.env文件
5. 启用PM2的安全监控

