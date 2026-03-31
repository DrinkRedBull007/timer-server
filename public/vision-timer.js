/**
 * 视觉识别计时器
 * 通过摄像头检测物体通过起跑线和终点线
 */

class VisionTimer {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.stream = null;
    this.isRunning = false;
    this.isDetecting = false;
    
    // 检测区域
    this.startLine = null;  // 起跑线区域 {x, y, width, height}
    this.endLine = null;    // 终点线区域 {x, y, width, height}
    this.isSettingStart = false;
    this.isSettingEnd = false;
    this.tempRect = null;   // 临时绘制区域
    
    // 检测参数
    this.sensitivity = 30;  // 敏感度 (0-100)
    this.minObjectSize = 100; // 最小检测物体面积
    this.cooldown = 1000;   // 检测冷却时间 (ms)
    this.lastTriggerTime = 0;
    
    // 帧差法缓存
    this.prevFrame = null;
    this.frameInterval = 100; // 检测间隔 (ms)
    this.lastFrameTime = 0;
    
    // 回调函数
    this.onStartDetected = null;
    this.onEndDetected = null;
    this.onError = null;
  }

  /**
   * 初始化摄像头
   */
  async init(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    try {
      // 请求摄像头权限
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // 优先使用后置摄像头
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      this.video.srcObject = this.stream;
      
      return new Promise((resolve, reject) => {
        this.video.onloadedmetadata = () => {
          // 设置 canvas 尺寸与视频一致
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
          this.video.play();
          this.isRunning = true;
          this.startDetectionLoop();
          resolve(true);
        };
        
        this.video.onerror = (err) => {
          reject(new Error('视频加载失败: ' + err.message));
        };
      });
      
    } catch (err) {
      console.error('摄像头初始化失败:', err);
      if (this.onError) this.onError('无法访问摄像头，请确保已授予权限');
      throw err;
    }
  }

  /**
   * 停止摄像头
   */
  stop() {
    this.isRunning = false;
    this.isDetecting = false;
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  /**
   * 开始检测循环
   */
  startDetectionLoop() {
    const loop = (timestamp) => {
      if (!this.isRunning) return;
      
      // 绘制视频帧
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      
      // 绘制检测区域
      this.drawDetectionAreas();
      
      // 执行物体检测
      if (this.isDetecting && timestamp - this.lastFrameTime > this.frameInterval) {
        this.detectMotion();
        this.lastFrameTime = timestamp;
      }
      
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }

  /**
   * 绘制检测区域
   */
  drawDetectionAreas() {
    // 绘制起跑线区域
    if (this.startLine) {
      this.drawRect(this.startLine, '#00ff00', '起跑线');
    }
    
    // 绘制终点线区域
    if (this.endLine) {
      this.drawRect(this.endLine, '#ff0000', '终点线');
    }
    
    // 绘制临时区域（设置中）
    if (this.tempRect) {
      const color = this.isSettingStart ? '#00ff00' : '#ff0000';
      this.drawRect(this.tempRect, color, this.isSettingStart ? '设置起跑线' : '设置终点线', true);
    }
  }

  /**
   * 绘制矩形区域
   */
  drawRect(rect, color, label, isDashed = false) {
    this.ctx.save();
    
    // 绘制矩形边框
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    if (isDashed) {
      this.ctx.setLineDash([5, 5]);
    }
    this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    
    // 填充半透明背景
    this.ctx.fillStyle = color + '20'; // 20 = 12% 透明度
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    
    // 绘制标签
    this.ctx.fillStyle = color;
    this.ctx.font = 'bold 16px Arial';
    this.ctx.fillText(label, rect.x + 5, rect.y - 5);
    
    this.ctx.restore();
  }

  /**
   * 开始设置检测区域
   */
  startSettingArea(type) {
    if (type === 'start') {
      this.isSettingStart = true;
      this.isSettingEnd = false;
    } else {
      this.isSettingStart = false;
      this.isSettingEnd = true;
    }
    this.tempRect = null;
    
    // 添加鼠标/触摸事件监听
    this.setupDrawingEvents();
  }

  /**
   * 设置绘制事件
   */
  setupDrawingEvents() {
    let isDrawing = false;
    let startX, startY;
    
    const onStart = (e) => {
      isDrawing = true;
      const pos = this.getPointerPosition(e);
      startX = pos.x;
      startY = pos.y;
      this.tempRect = { x: startX, y: startY, width: 0, height: 0 };
    };
    
    const onMove = (e) => {
      if (!isDrawing || !this.tempRect) return;
      const pos = this.getPointerPosition(e);
      this.tempRect.width = pos.x - startX;
      this.tempRect.height = pos.y - startY;
    };
    
    const onEnd = () => {
      if (!isDrawing || !this.tempRect) return;
      isDrawing = false;
      
      // 标准化矩形（确保 width/height 为正）
      const rect = this.normalizeRect(this.tempRect);
      
      // 保存区域
      if (this.isSettingStart) {
        this.startLine = rect;
        this.isSettingStart = false;
        console.log('起跑线设置完成:', rect);
      } else if (this.isSettingEnd) {
        this.endLine = rect;
        this.isSettingEnd = false;
        console.log('终点线设置完成:', rect);
      }
      
      this.tempRect = null;
      this.removeDrawingEvents();
    };
    
    this.canvas.addEventListener('mousedown', onStart);
    this.canvas.addEventListener('mousemove', onMove);
    this.canvas.addEventListener('mouseup', onEnd);
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e.touches[0]); });
    this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e.touches[0]); });
    this.canvas.addEventListener('touchend', onEnd);
    
    this._drawingEvents = { onStart, onMove, onEnd };
  }

  /**
   * 移除绘制事件
   */
  removeDrawingEvents() {
    if (!this._drawingEvents) return;
    const { onStart, onMove, onEnd } = this._drawingEvents;
    this.canvas.removeEventListener('mousedown', onStart);
    this.canvas.removeEventListener('mousemove', onMove);
    this.canvas.removeEventListener('mouseup', onEnd);
    this._drawingEvents = null;
  }

  /**
   * 获取指针位置
   */
  getPointerPosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  /**
   * 标准化矩形
   */
  normalizeRect(rect) {
    let { x, y, width, height } = rect;
    
    if (width < 0) {
      x += width;
      width = -width;
    }
    if (height < 0) {
      y += height;
      height = -height;
    }
    
    return { x, y, width, height };
  }

  /**
   * 开始检测
   */
  startDetection() {
    if (!this.startLine) {
      if (this.onError) this.onError('请先设置起跑线区域');
      return false;
    }
    if (!this.endLine) {
      if (this.onError) this.onError('请先设置终点线区域');
      return false;
    }
    
    this.isDetecting = true;
    this.prevFrame = null;
    this.lastTriggerTime = 0;
    console.log('视觉检测已启动');
    return true;
  }

  /**
   * 停止检测
   */
  stopDetection() {
    this.isDetecting = false;
    this.prevFrame = null;
  }

  /**
   * 运动检测（帧差法）
   */
  detectMotion() {
    const now = Date.now();
    if (now - this.lastTriggerTime < this.cooldown) return;
    
    // 获取当前帧
    const frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    
    if (!this.prevFrame) {
      this.prevFrame = frame;
      return;
    }
    
    // 检测起跑线区域
    const startDetected = this.checkAreaMotion(frame, this.prevFrame, this.startLine);
    if (startDetected && this.onStartDetected) {
      this.onStartDetected();
      this.lastTriggerTime = now;
    }
    
    // 检测终点线区域
    const endDetected = this.checkAreaMotion(frame, this.prevFrame, this.endLine);
    if (endDetected && this.onEndDetected) {
      this.onEndDetected();
      this.lastTriggerTime = now;
    }
    
    this.prevFrame = frame;
  }

  /**
   * 检查特定区域的移动
   */
  checkAreaMotion(currentFrame, prevFrame, area) {
    const { x, y, width, height } = area;
    const current = currentFrame.data;
    const previous = prevFrame.data;
    
    let diffPixels = 0;
    const threshold = (100 - this.sensitivity) * 2.55; // 转换为 0-255
    const sampleStep = 4; // 采样步长，提高性能
    
    for (let row = Math.floor(y); row < Math.min(y + height, this.canvas.height); row += sampleStep) {
      for (let col = Math.floor(x); col < Math.min(x + width, this.canvas.width); col += sampleStep) {
        const idx = (row * this.canvas.width + col) * 4;
        
        // 计算灰度差
        const currentGray = (current[idx] + current[idx + 1] + current[idx + 2]) / 3;
        const prevGray = (previous[idx] + previous[idx + 1] + previous[idx + 2]) / 3;
        const diff = Math.abs(currentGray - prevGray);
        
        if (diff > threshold) {
          diffPixels++;
        }
      }
    }
    
    // 计算变化面积比例
    const totalSamples = (width / sampleStep) * (height / sampleStep);
    const changeRatio = diffPixels / totalSamples;
    
    return changeRatio > 0.1; // 10% 像素变化触发
  }

  /**
   * 获取视频截图（用于调试）
   */
  captureSnapshot() {
    return this.canvas.toDataURL('image/png');
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisionTimer;
}
