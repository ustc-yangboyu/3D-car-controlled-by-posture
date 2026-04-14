"""
FastAPI 游戏服务器 - 协调姿态检测和游戏前端
"""

import asyncio
import base64
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .pose_detection import PoseDetector
from .pose_mapping import PoseMapper, GameControls

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# 全局状态
pose_detector: Optional[PoseDetector] = None
pose_mapper: Optional[PoseMapper] = None
is_processing = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global pose_detector, pose_mapper

    logger.info("正在初始化姿态检测器...")
    pose_detector = PoseDetector(
        static_image_mode=False,
        model_complexity=1,  # 平衡精度和速度
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    pose_mapper = PoseMapper()
    logger.info("姿态检测器初始化完成")

    yield

    # 清理
    logger.info("正在关闭姿态检测器...")
    if pose_detector:
        pose_detector.release()
    logger.info("服务器已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="VR姿态驾驶游戏",
    description="通过摄像头检测人体姿态并映射到3D驾驶游戏控制",
    version="1.0.0",
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """返回游戏主页面"""
    return FileResponse("static/index.html")


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "pose_detector_ready": pose_detector is not None,
        "pose_mapper_ready": pose_mapper is not None
    }


@app.post("/calibrate")
async def calibrate(initial_pose: dict):
    """
    校准初始姿态

    Args:
        initial_pose: 初始姿态数据

    Returns:
        校准结果
    """
    global pose_mapper

    if not pose_mapper:
        raise HTTPException(status_code=500, detail="姿态映射器未初始化")

    pose_mapper.calibrate(initial_pose)

    return {
        "success": True,
        "message": "校准成功",
        "is_calibrated": pose_mapper.is_calibrated
    }


@app.get("/calibration-status")
async def calibration_status():
    """获取校准状态"""
    global pose_mapper

    if not pose_mapper:
        raise HTTPException(status_code=500, detail="姿态映射器未初始化")

    return {
        "is_calibrated": pose_mapper.is_calibrated
    }


@app.websocket("/ws/pose")
async def websocket_pose(websocket: WebSocket):
    """
    WebSocket 端点 - 处理视频帧并返回姿态数据

    协议:
        客户端发送 (JSON):
            {
                "type": "frame",
                "data": "base64编码的图像数据"
            }

        服务端返回 (JSON):
            {
                "type": "pose_data",
                "data": {
                    "detected": bool,
                    "lean_angle": float,
                    "vertical_lean": float,
                    "left_arm_angle": float,
                    "right_arm_angle": float,
                    "steering": float,
                    "throttle": float,
                    "brake": float,
                    "hand_up": bool
                }
            }

        服务端返回 (JSON):
            {
                "type": "control",
                "data": GameControls
            }
    """
    global pose_detector, pose_mapper, is_processing

    await websocket.accept()
    logger.info("WebSocket 连接已建立")

    last_process_time = time.time()
    frame_count = 0
    landmark_frame_count = 0  # 专门计数用于发送landmarks
    fps = 0
    last_fps_log_time = time.time()
    timing_log_counter = 0  # 每100帧输出一次时间统计

    # 累计时间统计
    total_times = {
        'receive': 0,
        'json_parse': 0,
        'base64_decode': 0,
        'cv2_decode': 0,
        'pose_detection': 0,
        'pose_mapping': 0,
        'build_response': 0,
        'send_json': 0,
    }

    try:
        while True:
            t0 = time.perf_counter()

            # 使用 asyncio.wait_for 添加超时，避免客户端卡住导致服务器阻塞
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=5.0  # 5秒超时
                )
            except asyncio.TimeoutError:
                logger.warning("WebSocket 接收超时")
                continue

            t1 = time.perf_counter()
            total_times['receive'] += t1 - t0

            try:
                t2 = time.perf_counter()
                message = json.loads(data)
                t3 = time.perf_counter()
                total_times['json_parse'] += t3 - t2
            except json.JSONDecodeError:
                logger.warning("收到无效的 JSON 数据")
                continue

            if message.get("type") == "frame":
                # 解码图像
                try:
                    t4 = time.perf_counter()
                    frame_data = base64.b64decode(message["data"])
                    t5 = time.perf_counter()
                    total_times['base64_decode'] += t5 - t4

                    t6 = time.perf_counter()
                    nparr = np.frombuffer(frame_data, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    t7 = time.perf_counter()
                    total_times['cv2_decode'] += t7 - t6
                except Exception as e:
                    logger.error(f"图像解码失败: {e}")
                    continue

                if frame is None:
                    logger.warning("无法解码图像")
                    continue

                # 计算 FPS
                frame_count += 1
                current_time = time.time()
                if current_time - last_fps_log_time >= 2.0:  # 每2秒更新一次FPS
                    fps = frame_count // 2
                    frame_count = 0
                    last_fps_log_time = current_time
                    logger.info(f"处理 FPS: {fps}")

                # 检测姿态
                try:
                    t8 = time.perf_counter()
                    pose_data = pose_detector.get_pose_data(frame)
                    t9 = time.perf_counter()
                    total_times['pose_detection'] += t9 - t8
                except Exception as e:
                    logger.error(f"姿态检测失败: {e}")
                    continue

                # 映射到游戏控制
                try:
                    t10 = time.perf_counter()
                    if pose_mapper and pose_data.get("detected"):
                        controls = pose_mapper.map_to_controls(pose_data)
                        control_data = controls.to_dict()
                    else:
                        control_data = {
                            "steering": 0,
                            "throttle": 0,
                            "brake": 0,
                            "hand_up": False
                        }
                    t11 = time.perf_counter()
                    total_times['pose_mapping'] += t11 - t10
                except Exception as e:
                    logger.error(f"姿态映射失败: {e}")
                    control_data = {
                        "steering": 0,
                        "throttle": 0,
                        "brake": 0,
                        "hand_up": False
                    }

                # 构建响应数据
                t12 = time.perf_counter()
                response_data = {
                    "detected": pose_data.get("detected", False),
                    "lean_angle": float(pose_data.get("lean_angle", 0.0) or 0),
                    "vertical_lean": float(pose_data.get("vertical_lean", 0.0) or 0),
                    "left_arm_angle": float(pose_data.get("left_arm_angle", 0.0) or 0),
                    "right_arm_angle": float(pose_data.get("right_arm_angle", 0.0) or 0),
                    "left_arm_height": float(pose_data.get("left_arm_height", 0.0) or 0),
                    "right_arm_height": float(pose_data.get("right_arm_height", 0.0) or 0),
                    **control_data,
                    "fps": fps
                }

                # 每隔10帧发送一次landmarks用于可视化（减少数据量）
                landmark_frame_count += 1
                if pose_data.get("detected") and landmark_frame_count >= 10:
                    response_data["landmarks"] = pose_data.get("landmarks", [])
                    landmark_frame_count = 0  # 重置计数器

                response = {
                    "type": "control",
                    "data": response_data
                }
                t13 = time.perf_counter()
                total_times['build_response'] += t13 - t12

                # 使用 asyncio.shield 保护发送不被取消
                try:
                    t14 = time.perf_counter()
                    await asyncio.wait_for(
                        websocket.send_json(response),
                        timeout=2.0
                    )
                    t15 = time.perf_counter()
                    total_times['send_json'] += t15 - t14
                except asyncio.TimeoutError:
                    logger.warning("WebSocket 发送超时")

                # 每100帧输出一次时间统计
                timing_log_counter += 1
                if timing_log_counter >= 100:
                    timing_log_counter = 0
                    total = sum(total_times.values())
                    logger.info("=" * 50)
                    logger.info("处理时间统计 (100帧平均):")
                    for stage, t in total_times.items():
                        avg_ms = (t / 100) * 1000
                        pct = (t / total) * 100 if total > 0 else 0
                        logger.info(f"  {stage:20s}: {avg_ms:6.2f}ms ({pct:5.1f}%)")
                    logger.info(f"  {'TOTAL':20s}: {total/100*1000:6.2f}ms")
                    logger.info("=" * 50)
                    # 重置计数器
                    for k in total_times:
                        total_times[k] = 0

            elif message.get("type") == "calibrate":
                # 处理校准请求
                if pose_mapper:
                    pose_mapper.calibrate(message.get("data", {}))
                    await websocket.send_json({
                        "type": "calibration_result",
                        "success": True
                    })

            elif message.get("type") == "ping":
                # 心跳检测
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket 连接已断开")
    except Exception as e:
        logger.error(f"WebSocket 错误: {e}")
    finally:
        logger.info("WebSocket 会话结束")


def start_server(host: str = "0.0.0.0", port: int = 8000):
    """启动服务器"""
    import uvicorn
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    start_server()
