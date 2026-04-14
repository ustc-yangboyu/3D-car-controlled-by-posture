/**
 * WebSocket 客户端 - 负责与后端通信
 * 策略：来不及就丢，保证实时性
 */

class PoseConnector {
    constructor() {
        this.ws = null;
        this.camera = null;
        this.canvas = null;
        this.ctx = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.url = '';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.frameInterval = 50; // 约20fps，平衡质量和实时性
        this.onPoseData = null;
        this.onStatusChange = null;
        this.onError = null;
        this._sending = false;  // 是否正在发送
        this._lastSendTime = 0;  // 上次发送时间
    }

    /**
     * 连接到WebSocket服务器
     * @param {string} url - WebSocket URL
     */
    connect(url) {
        if (this.isConnected || this.isConnecting) {
            console.warn('WebSocket already connected or connecting');
            return;
        }

        this.url = url;
        this.isConnecting = true;
        this.updateStatus('connecting');

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.updateStatus('connected');
                this.startPing();
                // 连接成功后自动初始化摄像头并开始发送
                this._autoStartCamera();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.isConnected = false;
                this._sending = false;
                this.updateStatus('disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnecting = false;
                this.updateStatus('error');
                if (this.onError) {
                    this.onError(error);
                }
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.isConnecting = false;
            this.updateStatus('error');
        }
    }

    /**
     * 连接成功后自动启动摄像头
     */
    async _autoStartCamera() {
        const success = await this.initCamera();
        if (success) {
            this.updateStatus('camera_ready');
            this.startSendingFrames();
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        this._sending = false;
        if (this.ws) {
            this.stopPing();
            this.stopCamera();
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
    }

    /**
     * 初始化摄像头
     * @returns {Promise<boolean>}
     */
    async initCamera() {
        try {
            this.camera = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });

            const video = document.createElement('video');
            video.srcObject = this.camera;
            video.playsInline = true;
            video.autoplay = true;
            video.muted = true;

            await new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    video.play().then(() => resolve()).catch(reject);
                };
                video.onerror = (e) => reject(e);
            });

            // 创建 canvas 用于捕获帧（保持原始分辨率）
            this.canvas = document.createElement('canvas');
            this.canvas.width = video.videoWidth || 640;
            this.canvas.height = video.videoHeight || 480;
            this.ctx = this.canvas.getContext('2d');
            this.video = video;

            console.log('Camera initialized:', this.canvas.width, 'x', this.canvas.height);
            return true;
        } catch (error) {
            console.error('Failed to initialize camera:', error);
            this.updateStatus('camera_error');
            if (this.onError) {
                this.onError(error);
            }
            return false;
        }
    }

    /**
     * 停止摄像头
     */
    stopCamera() {
        this._sending = false;
        if (this.camera) {
            this.camera.getTracks().forEach(track => track.stop());
            this.camera = null;
        }
        if (this.video) {
            this.video.srcObject = null;
            this.video = null;
        }
    }

    /**
     * 开始发送视频帧
     */
    startSendingFrames() {
        if (!this.isConnected || !this.camera || !this.video) {
            console.warn('Cannot start: not connected or no camera');
            return;
        }
        this._sending = true;
        this._lastSendTime = 0;
        this._sendLoop();
    }

    /**
     * 停止发送帧
     */
    stopSendingFrames() {
        this._sending = false;
    }

    /**
     * 发送循环 - 使用时间戳判断，不等待
     */
    _sendLoop() {
        if (!this._sending || !this.isConnected) {
            return;
        }

        const now = Date.now();

        // 检查是否到时间发送下一帧
        if (now - this._lastSendTime >= this.frameInterval) {
            this._sendFrameIfReady();
            this._lastSendTime = now;
        }

        // 继续循环
        requestAnimationFrame(() => this._sendLoop());
    }

    /**
     * 如果可以发送（不阻塞），立即发送一帧
     */
    _sendFrameIfReady() {
        if (!this.isConnected || !this.camera || !this.video) {
            return;
        }

        // 如果上一帧还没发送完（理论上不会阻塞，但安全检查）
        if (this._isSendingFrame) {
            return;  // 直接跳过我_frameskip = true;
        }

        // 检查视频状态
        if (this.video.paused || this.video.ended || this.video.readyState < 2) {
            return;
        }

        // 检查 WebSocket 状态
        if (this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            this._isSendingFrame = true;

            // 绘制当前帧
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

            // 转换为 base64（使用更低的质量）
            const dataUrl = this.canvas.toDataURL('image/jpeg', 0.2);  // 极低质量减少数据量
            const base64Data = dataUrl.split(',')[1];

            // 发送
            this.ws.send(JSON.stringify({
                type: 'frame',
                data: base64Data
            }));
        } catch (error) {
            console.error('Error sending frame:', error);
        } finally {
            this._isSendingFrame = false;
        }
    }

    /**
     * 处理收到的消息
     * @param {string} data - 消息数据
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'control':
                    if (this.onPoseData) {
                        this.onPoseData(message.data);
                    }
                    break;

                case 'calibration_result':
                    console.log('Calibration result:', message);
                    this.updateStatus('calibrated');
                    break;

                case 'pong':
                    break;

                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    /**
     * 请求校准
     * @param {Object} poseData - 初始姿态数据
     */
    sendCalibration(poseData) {
        if (!this.isConnected) {
            console.warn('Cannot calibrate: not connected');
            return;
        }

        try {
            this.ws.send(JSON.stringify({
                type: 'calibrate',
                data: poseData
            }));
        } catch (error) {
            console.error('Error sending calibration:', error);
        }
    }

    /**
     * 开始心跳
     */
    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                } catch (e) {
                    console.error('Ping error:', e);
                }
            }
        }, 10000);
    }

    /**
     * 停止心跳
     */
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * 尝试重连
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            this.updateStatus('reconnect_failed');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnecting ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

        setTimeout(() => {
            if (!this.isConnected) {
                this.connect(this.url);
            }
        }, this.reconnectDelay);
    }

    /**
     * 更新状态
     * @param {string} status - 状态
     */
    updateStatus(status) {
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    /**
     * 获取摄像头视频元素
     * @returns {HTMLVideoElement|null}
     */
    getVideoElement() {
        return this.video;
    }
}

// 导出全局
window.PoseConnector = PoseConnector;