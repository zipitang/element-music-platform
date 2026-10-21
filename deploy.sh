#!/bin/bash
set -e
DIR="$(dirname "$0")"
cd "$DIR"

echo "=== 元素音乐编曲平台 部署 ==="

# 安装依赖
npm install --omit=dev

# 启动
PORT="${PORT:-5653}"
echo "启动后端端口 $PORT..."
pm2 delete element-music 2>/dev/null || true
PORT=$PORT pm2 start server/index.ts --name element-music --node-args='--import tsx'

echo "=== 部署完成 ==="
echo "  访问: http://$(hostname -I | awk '{print $1}'):$PORT"
echo "  管理: admin / 000000"
