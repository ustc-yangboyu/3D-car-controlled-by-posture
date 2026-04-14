#!/bin/bash

# VR姿态驾驶游戏 - 服务器启动脚本

echo "========================================"
echo "  VR姿态驾驶游戏 - 服务器启动脚本"
echo "========================================"
echo ""

# 检查Python
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "[错误] 未找到Python，请先安装Python 3.8+"
        exit 1
    fi
    PYTHON_CMD="python"
else
    PYTHON_CMD="python3"
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# 检查依赖
echo "[1/3] 检查依赖..."
if ! $PYTHON_CMD -c "import fastapi" &> /dev/null; then
    echo "[提示] 正在安装Python依赖..."
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi

echo "[2/3] 依赖检查完成"

# 检查模型目录
if [ ! -d "model" ]; then
    mkdir model
    echo "[提示] 已创建 model 目录"
fi

# 启动服务器
echo "[3/3] 启动服务器..."
echo ""
echo "访问 http://localhost:8000 开始游戏"
echo "按 Ctrl+C 停止服务器"
echo ""

cd "$SCRIPT_DIR/.."
uvicorn src.game_server:app --host 0.0.0.0 --port 8000 --reload
