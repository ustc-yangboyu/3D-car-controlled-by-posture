/**
 * Three.js 3D驾驶游戏
 */

// 游戏状态
const gameState = {
    speed: 0,
    maxSpeed: 100,
    acceleration: 0.5,
    deceleration: 0.3,
    steering: 0,
    maxSteering: 1.5,
    steeringSpeed: 0.03,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    score: 0,
    isPlaying: false,
    isPaused: false,
    gameOver: false,
    distance: 0
};

// Three.js 变量
let scene, camera, renderer;
let car, road, obstacles = [];
let roadSegments = [];
const ROAD_WIDTH = 12;
const ROAD_SEGMENT_LENGTH = 50;
const VISIBLE_SEGMENTS = 10;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;

// 初始化游戏
function initGame() {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // 天空蓝
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

    // 创建相机（第三人称视角）
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 8, 15);
    camera.lookAt(0, 0, 0);

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // 添加灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);

    // 创建道路
    createRoad();

    // 创建车辆
    createCar();

    // 添加窗口大小变化监听
    window.addEventListener('resize', onWindowResize);

    // 开始渲染循环
    animate();
}

// 创建道路
function createRoad() {
    // 创建道路段
    for (let i = 0; i < VISIBLE_SEGMENTS; i++) {
        const segment = createRoadSegment();
        segment.position.z = -i * ROAD_SEGMENT_LENGTH;
        roadSegments.push(segment);
        scene.add(segment);
    }
}

// 创建单段道路
function createRoadSegment() {
    const group = new THREE.Group();

    // 道路平面
    const roadGeometry = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SEGMENT_LENGTH);
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8
    });
    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    // 道路边线
    const lineGeometry = new THREE.PlaneGeometry(0.3, ROAD_SEGMENT_LENGTH);
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const leftLine = new THREE.Mesh(lineGeometry, lineMaterial);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.position.set(-ROAD_WIDTH / 2 + 0.5, 0.01, 0);
    group.add(leftLine);

    const rightLine = new THREE.Mesh(lineGeometry, lineMaterial);
    rightLine.rotation.x = -Math.PI / 2;
    rightLine.position.set(ROAD_WIDTH / 2 - 0.5, 0.01, 0);
    group.add(rightLine);

    // 中心虚线
    const dashCount = 5;
    const dashLength = ROAD_SEGMENT_LENGTH / dashCount / 2;
    for (let i = 0; i < dashCount; i++) {
        const dashGeometry = new THREE.PlaneGeometry(0.2, dashLength);
        const dashMesh = new THREE.Mesh(dashGeometry, lineMaterial);
        dashMesh.rotation.x = -Math.PI / 2;
        dashMesh.position.set(0, 0.01, -ROAD_SEGMENT_LENGTH / 2 + i * (dashLength * 2) + dashLength / 2);
        group.add(dashMesh);
    }

    // 草地
    const grassGeometry = new THREE.PlaneGeometry(100, ROAD_SEGMENT_LENGTH);
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 1 });

    const leftGrass = new THREE.Mesh(grassGeometry, grassMaterial);
    leftGrass.rotation.x = -Math.PI / 2;
    leftGrass.position.set(-ROAD_WIDTH / 2 - 25, -0.01, 0);
    leftGrass.receiveShadow = true;
    group.add(leftGrass);

    const rightGrass = new THREE.Mesh(grassGeometry, grassMaterial);
    rightGrass.rotation.x = -Math.PI / 2;
    rightGrass.position.set(ROAD_WIDTH / 2 + 25, -0.01, 0);
    rightGrass.receiveShadow = true;
    group.add(rightGrass);

    return group;
}

// 创建车辆
function createCar() {
    car = new THREE.Group();

    // 车身
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        metalness: 0.6,
        roughness: 0.4
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    car.add(body);

    // 车顶
    const roofGeometry = new THREE.BoxGeometry(1.6, 0.6, 2);
    const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
    roof.position.y = 1.2;
    roof.position.z = -0.3;
    roof.castShadow = true;
    car.add(roof);

    // 挡风玻璃
    const glassGeometry = new THREE.BoxGeometry(1.5, 0.5, 0.1);
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
    });
    const windshield = new THREE.Mesh(glassGeometry, glassMaterial);
    windshield.position.set(0, 1.2, 0.7);
    windshield.rotation.x = Math.PI / 6;
    car.add(windshield);

    // 车轮
    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.9
    });

    const wheelPositions = [
        { x: -1, z: 1.2 },
        { x: 1, z: 1.2 },
        { x: -1, z: -1.2 },
        { x: 1, z: -1.2 }
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, 0.35, pos.z);
        wheel.castShadow = true;
        car.add(wheel);
    });

    // 前灯
    const lightGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffcc });

    const leftLight = new THREE.Mesh(lightGeometry, lightMaterial);
    leftLight.position.set(-0.6, 0.5, 2);
    car.add(leftLight);

    const rightLight = new THREE.Mesh(lightGeometry, lightMaterial);
    rightLight.position.set(0.6, 0.5, 2);
    car.add(rightLight);

    // 尾灯
    const tailLightMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const leftTail = new THREE.Mesh(lightGeometry, tailLightMaterial);
    leftTail.position.set(-0.6, 0.5, -2);
    car.add(leftTail);

    const rightTail = new THREE.Mesh(lightGeometry, tailLightMaterial);
    rightTail.position.set(0.6, 0.5, -2);
    car.add(rightTail);

    car.position.y = 0;
    scene.add(car);
}

// 创建障碍物
function createObstacle() {
    const obstacleType = Math.floor(Math.random() * 3);
    let obstacle;

    if (obstacleType === 0) {
        // 锥形桶
        const coneGeometry = new THREE.ConeGeometry(0.4, 1, 8);
        const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
        obstacle = new THREE.Mesh(coneGeometry, coneMaterial);
        obstacle.position.y = 0.5;
    } else if (obstacleType === 1) {
        // 障碍箱
        const boxGeometry = new THREE.BoxGeometry(1.5, 1, 1.5);
        const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        obstacle = new THREE.Mesh(boxGeometry, boxMaterial);
        obstacle.position.y = 0.5;
    } else {
        // 其它车辆
        const vehicleGeometry = new THREE.BoxGeometry(2, 1, 3.5);
        const vehicleMaterial = new THREE.MeshStandardMaterial({
            color: Math.random() > 0.5 ? 0x0000ff : 0x00ff00
        });
        obstacle = new THREE.Mesh(vehicleGeometry, vehicleMaterial);
        obstacle.position.y = 0.5;
    }

    obstacle.castShadow = true;
    obstacle.receiveShadow = true;

    // 随机放置在某条车道
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const laneX = (lane - 1) * LANE_WIDTH + LANE_WIDTH / 2;

    obstacle.position.x = laneX;
    obstacle.position.z = -VISIBLE_SEGMENTS * ROAD_SEGMENT_LENGTH - 50;

    return obstacle;
}

// 更新游戏逻辑
function updateGame(deltaTime) {
    if (!gameState.isPlaying || gameState.isPaused || gameState.gameOver) {
        return;
    }

    // 更新速度
    if (gameState.throttle > 0) {
        gameState.speed = Math.min(
            gameState.maxSpeed,
            gameState.speed + gameState.acceleration * gameState.throttle * deltaTime * 60
        );
    } else if (gameState.brake > 0) {
        gameState.speed = Math.max(
            0,
            gameState.speed - gameState.deceleration * 2 * deltaTime * 60
        );
    } else {
        // 自然减速
        gameState.speed = Math.max(
            0,
            gameState.speed - gameState.deceleration * deltaTime * 30
        );
    }

    // 直接将身体倾斜角度映射为汽车行驶方向（-45°到+45°）
    // lean_angle 范围是 -45 到 +45 度
    // 转换为弧度并限制在 ±45° 范围内
    const targetRotation = (gameState.steering * Math.PI / 4); // steering已经是-1到1，乘以PI/4得到±45度
    gameState.rotation = targetRotation;

    // 更新车辆位置（基于新的旋转方向）
    const moveX = Math.sin(gameState.rotation) * gameState.speed * deltaTime * 0.1;
    const moveZ = -Math.cos(gameState.rotation) * gameState.speed * deltaTime * 0.1;

    gameState.position.x += moveX;
    gameState.position.z += moveZ;

    // 限制车辆在道路范围内
    const maxX = ROAD_WIDTH / 2 - 1;
    gameState.position.x = Math.max(-maxX, Math.min(maxX, gameState.position.x));

    // 更新距离和分数
    gameState.distance += Math.abs(moveZ);
    gameState.score = Math.floor(gameState.distance / 10);

    // 更新道路段
    roadSegments.forEach(segment => {
        segment.position.z += gameState.speed * deltaTime * 0.1;
        if (segment.position.z > ROAD_SEGMENT_LENGTH) {
            segment.position.z -= VISIBLE_SEGMENTS * ROAD_SEGMENT_LENGTH;
        }
    });

    // 更新障碍物
    obstacles.forEach((obstacle, index) => {
        obstacle.position.z += gameState.speed * deltaTime * 0.1;

        // 检测碰撞
        if (checkCollision(obstacle)) {
            gameOver();
            return;
        }

        // 移除超出范围的障碍物
        if (obstacle.position.z > 20) {
            scene.remove(obstacle);
            obstacles.splice(index, 1);
        }
    });

    // 生成新障碍物
    if (Math.random() < 0.02 * (1 + gameState.speed / gameState.maxSpeed)) {
        const newObstacle = createObstacle();
        obstacles.push(newObstacle);
        scene.add(newObstacle);
    }

    // 更新车辆状态
    if (car) {
        car.position.x = gameState.position.x;
        car.rotation.y = -gameState.rotation * 0.5;
        car.position.z = gameState.position.z;

        // 倾斜效果
        car.rotation.z = gameState.rotation * 0.3;
    }

    // 更新相机
    if (camera) {
        camera.position.x = gameState.position.x * 0.3;
        camera.position.z = gameState.position.z + 15;
        camera.lookAt(
            gameState.position.x,
            2,
            gameState.position.z - 10
        );
    }

    // 更新UI
    updateUI();
}

// 碰撞检测
function checkCollision(obstacle) {
    const dx = Math.abs(gameState.position.x - obstacle.position.x);
    const dz = Math.abs(gameState.position.z - obstacle.position.z);

    // 简单矩形碰撞检测
    return dx < 1.5 && dz < 2.5;
}

// 游戏结束
function gameOver() {
    gameState.gameOver = true;
    gameState.isPlaying = false;

    const overlay = document.getElementById('game-overlay');
    const message = document.getElementById('overlay-message');
    const scoreDisplay = document.getElementById('final-score');

    message.textContent = '游戏结束!';
    scoreDisplay.textContent = `最终得分: ${gameState.score}`;
    overlay.style.display = 'flex';
}

// 重置游戏
function resetGame() {
    gameState.speed = 0;
    gameState.steering = 0;
    gameState.position = { x: 0, y: 0, z: 0 };
    gameState.rotation = 0;
    gameState.score = 0;
    gameState.isPlaying = false;
    gameState.isPaused = false;
    gameState.gameOver = false;
    gameState.distance = 0;

    // 清除障碍物
    obstacles.forEach(obstacle => scene.remove(obstacle));
    obstacles = [];

    // 重置道路
    roadSegments.forEach((segment, i) => {
        segment.position.z = -i * ROAD_SEGMENT_LENGTH;
    });

    // 重置车辆
    if (car) {
        car.position.set(0, 0, 0);
        car.rotation.set(0, 0, 0);
    }

    // 隐藏结束界面
    document.getElementById('game-overlay').style.display = 'none';

    updateUI();
}

// 开始游戏
function startGame() {
    if (gameState.gameOver) {
        resetGame();
    }

    gameState.isPlaying = true;
    gameState.isPaused = false;
    document.getElementById('game-overlay').style.display = 'none';
}

// 暂停游戏
function pauseGame() {
    gameState.isPaused = true;
    document.getElementById('game-overlay').style.display = 'flex';
    document.getElementById('overlay-message').textContent = '暂停';
    document.getElementById('final-score').textContent = `当前得分: ${gameState.score}`;
}

// 更新UI显示
function updateUI() {
    const speedDisplay = document.getElementById('speed-display');
    const scoreDisplay = document.getElementById('score-display');
    const steeringDisplay = document.getElementById('steering-display');
    const statusDisplay = document.getElementById('status-display');

    if (speedDisplay) {
        speedDisplay.textContent = `${Math.floor(gameState.speed)} km/h`;
    }

    if (scoreDisplay) {
        scoreDisplay.textContent = `分数: ${gameState.score}`;
    }

    if (steeringDisplay) {
        const steeringPercent = Math.abs(gameState.steering) * 100;
        let direction = '';
        if (gameState.steering < -0.1) direction = '左';
        else if (gameState.steering > 0.1) direction = '右';
        steeringDisplay.textContent = `${direction}${Math.floor(steeringPercent)}%`;
    }

    if (statusDisplay) {
        if (gameState.isPlaying && !gameState.isPaused) {
            statusDisplay.textContent = gameState.handUp ? '双手模式' : '行驶中';
        } else if (gameState.isPaused) {
            statusDisplay.textContent = '已暂停';
        } else {
            statusDisplay.textContent = '等待开始';
        }
    }
}

// 窗口大小变化处理
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 渲染循环
let lastTime = 0;
function animate(currentTime) {
    requestAnimationFrame(animate);

    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    updateGame(deltaTime);
    renderer.render(scene, camera);
}

// 应用姿态控制
function applyControls(controls) {
    if (controls) {
        gameState.steering = controls.steering || 0;
        gameState.throttle = controls.throttle || 0;
        gameState.brake = controls.brake || 0;
        gameState.handUp = controls.hand_up || false;
    }
}

// 导出函数供外部调用
window.Game = {
    init: initGame,
    start: startGame,
    pause: pauseGame,
    reset: resetGame,
    applyControls: applyControls,
    updateUI: updateUI,
    getState: () => gameState
};
