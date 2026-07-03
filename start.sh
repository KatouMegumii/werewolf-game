#!/bin/bash

# 狼人杀游戏 - Linux/Mac 快速启动脚本

echo ""
echo "========================================"
echo "  狼人杀在线游戏 - 本地开发启动"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    echo "访问: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 已安装"

# 启动后端
echo ""
echo "📦 正在启动后端服务..."
cd backend
npm install --silent
npm run dev &
BACKEND_PID=$!

# 等待后端启动
sleep 3

# 启动前端
echo ""
echo "🎨 正在启动前端开发服务..."
cd ../frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "✅ 启动完成！"
echo "========================================"
echo ""
echo "📱 前端: http://localhost:5173"
echo "🔧 后端: http://localhost:3000"
echo ""
echo "在浏览器中打开: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待中断信号
trap "kill $BACKEND_PID $FRONTEND_PID" SIGINT
wait $BACKEND_PID $FRONTEND_PID
