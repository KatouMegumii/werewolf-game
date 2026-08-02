#!/bin/bash
# 狼人杀在线游戏 - 生产部署脚本(在云服务器上执行)
# 用法: cd werewolf-game && ./deploy.sh
set -e

cd "$(dirname "$0")"

echo "========================================"
echo "  狼人杀在线游戏 - 生产部署"
echo "========================================"

# 1. 拉取最新代码(网络不稳时可多试几次)
echo ""
echo "📦 拉取最新代码..."
git pull || { echo "⚠️ git pull 失败,重试一次..."; sleep 2; git pull; }

# 2. 后端:安装依赖 + 重启(无构建步骤)
echo ""
echo "🔧 更新后端..."
cd backend
npm install --silent
pm2 restart werewolf-backend || pm2 start server.js --name "werewolf-backend"
cd ..

# 3. 前端:安装依赖 + 构建(构建产物由 Nginx 服务,构建完即生效)
echo ""
echo "🎨 构建前端..."
cd frontend
npm install --silent
npm run build
cd ..

echo ""
echo "========================================"
echo "✅ 部署完成!"
echo "========================================"
echo "  后端: pm2(端口3000, 已重启)"
echo "  前端: Nginx 服务 dist(新构建已生效)"
echo ""
echo "  验证: curl http://localhost:3000/health"
echo "========================================"
