# VR姿态驾驶游戏

通过笔记本摄像头检测人体姿态，映射到3D驾驶游戏的控制中。

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务器

Windows:
```bash
script\start_server.bat
```

Linux/Mac:
```bash
chmod +x script/start_server.sh
./script/start_server.sh
```

### 3. 打开游戏

在浏览器中访问: http://localhost:8000

## 操作说明

| 身体动作 | 游戏控制 |
|---------|---------|
| 身体左倾 | 汽车斜向左前方行驶 |
| 身体直立 | 汽车直向前行驶 |
| 身体右倾 | 汽车斜向右前方行驶 |
| 双手抬起 | 加速 |
| 身体前倾 | 刹车 |
| 双手平举 | 减速 |

### 控制原理

- **行驶方向**：身体倾斜角度直接映射为汽车行驶方向（-45°到+45°）
  - 左倾 → 汽车向左前方行驶
  - 直立 → 汽车直向前行驶
  - 右倾 → 汽车向右前方行驶

- **加速**：双手抬起越高，速度越快（需要超过阈值才启动）

- **刹车/减速**：身体前倾刹车，双手平举减速

## 使用流程

1. 打开浏览器访问 http://localhost:8000
2. 点击「连接服务器」（会自动启动摄像头）
3. 站在摄像头前，保持直立姿势
4. 点击「校准姿态」
5. 点击「开始游戏」
6. 通过身体动作控制车辆

## 技术架构

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   摄像头采集    │ ───────────────►  │   FastAPI后端   │
│   (浏览器)      │   Base64编码帧     │   + MediaPipe   │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ 姿态检测
                                                ▼
                                        ┌─────────────────┐
                                        │   姿态数据      │
                                        │ + 游戏控制指令  │
                                        └────────┬────────┘
                                                │
                                                │ 姿态+控制
                                                ▼
                                        ┌─────────────────┐
                                        │   控制指令      │
                                        └────────┬────────┘
                                                │
┌─────────────────┐     WebSocket              │
│   3D驾驶游戏    │ ◄───────────────           │
│   (Three.js)    │   实时控制                │
└─────────────────┘
```

## 项目结构

```
VRDesign/
├── model/                    # 姿态检测模型
├── src/                      # 后端服务
│   ├── pose_detection.py     # MediaPipe姿态检测
│   ├── pose_mapping.py       # 姿态映射为控制指令
│   └── game_server.py       # FastAPI + WebSocket服务
├── static/                   # 前端资源
│   ├── index.html           # 游戏页面
│   ├── css/style.css        # 样式
│   └── js/
│       ├── game.js          # Three.js 3D游戏
│       ├── pose_connector.js # WebSocket客户端
│       └── pose_interpreter.js # 姿态解释和显示
├── script/                   # 启动脚本
├── requirements.txt          # Python依赖
└── README.md
```

## 技术栈

- **姿态检测**: MediaPipe Pose (MediaPipe Tasks)
- **后端框架**: FastAPI + Uvicorn
- **通信**: WebSocket
- **3D渲染**: Three.js
- **前端**: 原生HTML/CSS/JavaScript

## 配置参数

姿态映射的关键参数在 `src/pose_mapping.py` 的 `_default_config()` 中：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| lean_threshold | 25° | 转向阈值 |
| lean_deadzone | 8° | 转向死区 |
| arm_up_threshold | 45° | 加速阈值 |
| steering_smoothing | 0.15 | 转向平滑系数 |
| throttle_smoothing | 0.1 | 油门平滑系数 |

## 注意事项

- 首次运行会自动下载MediaPipe模型
- 建议在光线充足的环境下使用
- 摄像头需要授权才能使用
- 确保网络连接正常（WebSocket通信）
