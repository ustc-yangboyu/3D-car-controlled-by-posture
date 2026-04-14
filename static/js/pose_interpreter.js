/**
 * 姿态解释器 - 在前端处理和显示姿态数据
 */

class PoseInterpreter {
    constructor() {
        // 状态显示元素
        this.displayElements = {
            leanAngle: null,
            armAngleLeft: null,
            armAngleRight: null,
            detectionStatus: null,
            steeringIndicator: null,
            throttleIndicator: null
        };

        // 姿态数据
        this.currentPose = null;
        this.isDetected = false;
        this.calibrationData = null;
        this.isCalibrated = false;

        // 可视化配置
        this.skeletonColor = '#00ff00';
        this.jointColor = '#ff6600';
        this.skeletonLineWidth = 3;
        this.jointRadius = 8;
    }

    /**
     * 初始化显示元素
     * @param {Object} elements - DOM元素
     */
    initDisplayElements(elements) {
        this.displayElements = { ...this.displayElements, ...elements };
    }

    /**
     * 处理收到的姿态数据
     * @param {Object} poseData - 姿态数据
     */
    handlePoseData(poseData) {
        this.currentPose = poseData;
        this.isDetected = poseData.detected || false;

        // 更新显示
        this.updateDisplay();

        // 绘制姿态
        if (poseData.landmarks && poseData.landmarks.length > 0) {
            this.drawSkeleton(poseData.landmarks);
        }
    }

    /**
     * 更新显示信息
     */
    updateDisplay() {
        const pose = this.currentPose;

        if (!pose) return;

        // 检测状态
        if (this.displayElements.detectionStatus) {
            this.displayElements.detectionStatus.textContent = this.isDetected ? '检测到人体' : '未检测到';
            this.displayElements.detectionStatus.className = this.isDetected ? 'status-on' : 'status-off';
        }

        // 倾斜角度
        if (this.displayElements.leanAngle) {
            const lean = pose.lean_angle || 0;
            let direction = '';
            if (lean > 5) direction = '右';
            else if (lean < -5) direction = '左';
            this.displayElements.leanAngle.textContent = `${direction}${Math.abs(lean.toFixed(1))}°`;
        }

        // 手臂角度
        if (this.displayElements.armAngleLeft) {
            this.displayElements.armAngleLeft.textContent = `${(pose.left_arm_angle || 0).toFixed(0)}°`;
        }
        if (this.displayElements.armAngleRight) {
            this.displayElements.armAngleRight.textContent = `${(pose.right_arm_angle || 0).toFixed(0)}°`;
        }

        // 方向盘指示器
        if (this.displayElements.steeringIndicator && pose.steering !== undefined) {
            const rotation = (pose.steering || 0) * 90; // 最大旋转90度
            this.displayElements.steeringIndicator.style.transform = `rotate(${rotation}deg)`;
        }

        // 油门指示器
        if (this.displayElements.throttleIndicator && pose.throttle !== undefined) {
            const height = (pose.throttle || 0) * 100;
            this.displayElements.throttleIndicator.style.height = `${height}%`;
        }
    }

    /**
     * 绘制姿态骨架
     * @param {Array} landmarks - 姿态关键点
     */
    drawSkeleton(landmarks) {
        const canvas = document.getElementById('skeleton-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // 清除画布
        ctx.clearRect(0, 0, width, height);

        // 定义骨架连接
        const connections = [
            // 躯干
            [11, 12], // 左肩-右肩
            [11, 23], // 左肩-左髋
            [12, 24], // 右肩-右髋
            [23, 24], // 左髋-右髋

            // 左臂
            [11, 13], // 左肩-左肘
            [13, 15], // 左肘-左手腕

            // 右臂
            [12, 14], // 右肩-右肘
            [14, 16], // 右肘-右手腕

            // 左腿
            [23, 25], // 左髋-左膝
            [25, 27], // 左膝-左脚踝

            // 右腿
            [24, 26], // 右髋-右膝
            [26, 28], // 右膝-右脚踝

            // 头部
            [0, 11],   // 鼻子-左肩
            [0, 12],   // 鼻子-右肩
        ];

        // 绘制连接线
        ctx.strokeStyle = this.skeletonColor;
        ctx.lineWidth = this.skeletonLineWidth;
        ctx.lineCap = 'round';

        connections.forEach(([startIdx, endIdx]) => {
            if (startIdx >= landmarks.length || endIdx >= landmarks.length) return;

            const start = landmarks[startIdx];
            const end = landmarks[endIdx];

            // 检查可见性
            if (start.visibility < 0.5 || end.visibility < 0.5) return;

            const x1 = start.x * width;
            const y1 = start.y * height;
            const x2 = end.x * width;
            const y2 = end.y * height;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });

        // 绘制关节
        ctx.fillStyle = this.jointColor;

        landmarks.forEach((landmark, index) => {
            if (landmark.visibility < 0.5) return;

            const x = landmark.x * width;
            const y = landmark.y * height;

            // 根据关节类型设置大小
            let radius = this.jointRadius;
            if ([11, 12, 23, 24].includes(index)) {
                // 肩膀和髋部
                radius = this.jointRadius * 1.2;
            } else if ([13, 14, 25, 26].includes(index)) {
                // 肘部和膝盖
                radius = this.jointRadius * 0.9;
            }

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    /**
     * 执行校准
     * @returns {Object} 校准数据
     */
    calibrate() {
        if (!this.currentPose || !this.isDetected) {
            console.warn('Cannot calibrate: no pose detected');
            return null;
        }

        this.calibrationData = {
            lean_angle: this.currentPose.lean_angle || 0,
            left_arm_height: this.currentPose.left_arm_height || 0,
            right_arm_height: this.currentPose.right_arm_height || 0
        };

        this.isCalibrated = true;
        console.log('Calibration data:', this.calibrationData);
        return this.calibrationData;
    }

    /**
     * 重置校准
     */
    resetCalibration() {
        this.calibrationData = null;
        this.isCalibrated = false;
    }

    /**
     * 获取当前控制状态
     * @returns {Object} 控制数据
     */
    getControls() {
        if (!this.currentPose) {
            return {
                steering: 0,
                throttle: 0,
                brake: 0,
                hand_up: false
            };
        }

        return {
            steering: this.currentPose.steering || 0,
            throttle: this.currentPose.throttle || 0,
            brake: this.currentPose.brake || 0,
            hand_up: this.currentPose.hand_up || false
        };
    }

    /**
     * 获取控制描述
     * @returns {string}
     */
    getControlDescription() {
        const controls = this.getControls();
        const parts = [];

        if (Math.abs(controls.steering) > 0.1) {
            parts.push(controls.steering < 0 ? '左转' : '右转');
        }

        if (controls.throttle > 0.1) {
            parts.push(`加速 ${Math.round(controls.throttle * 100)}%`);
        }

        if (controls.brake > 0.1) {
            parts.push(`刹车 ${Math.round(controls.brake * 100)}%`);
        }

        if (controls.hand_up) {
            parts.push('双手模式');
        }

        return parts.length > 0 ? parts.join(' | ') : '等待指令';
    }
}

// 导出全局
window.PoseInterpreter = PoseInterpreter;
