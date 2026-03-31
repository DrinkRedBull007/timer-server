require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS 配置
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

console.log('[CORS] 允许的域名:', corsOrigins);

// Express CORS
app.use(cors({
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  credentials: true
}));

// Socket.IO CORS
const io = new Server(server, {
  cors: {
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'] // 支持 WebSocket 和轮询
});

// 日志级别
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const debug = LOG_LEVEL === 'debug' ? console.log : () => {};

// ==================== 存储层 ====================
let storage;

if (process.env.USE_REDIS === 'true') {
  // Redis 存储（生产环境多服务器）
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  
  storage = {
    async getRoom(roomId) {
      const data = await redis.get(`room:${roomId}`);
      return data ? JSON.parse(data) : null;
    },
    async setRoom(roomId, room) {
      await redis.setex(`room:${roomId}`, 3600, JSON.stringify(room)); // 1小时过期
    },
    async deleteRoom(roomId) {
      await redis.del(`room:${roomId}`);
    },
    async getAllRooms() {
      const keys = await redis.keys('room:*');
      if (keys.length === 0) return [];
      const values = await redis.mget(keys);
      return values.map(v => JSON.parse(v));
    }
  };
  
  console.log('[存储] Redis 模式');
} else {
  // 内存存储（单机开发）
  const rooms = new Map();
  storage = {
    getRoom: (roomId) => rooms.get(roomId),
    setRoom: (roomId, room) => rooms.set(roomId, room),
    deleteRoom: (roomId) => rooms.delete(roomId),
    getAllRooms: () => Array.from(rooms.values())
  };
  console.log('[存储] 内存模式');
}

// 计时器状态
const TimerState = {
  IDLE: 'idle',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished'
};

// 生成6位房间号
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 获取服务器精确时间
function getServerTime() {
  return Date.now();
}

// 清理空房间（内存模式）
function cleanupEmptyRooms() {
  if (process.env.USE_REDIS === 'true') return;
  
  for (const [roomId, room] of storage.getAllRooms().entries()) {
    if (room.clients && room.clients.size === 0) {
      storage.deleteRoom(roomId);
      console.log(`[清理] 房间 ${roomId} 已删除`);
    }
  }
}

if (process.env.USE_REDIS !== 'true') {
  setInterval(cleanupEmptyRooms, 30000);
}

// ==================== Socket.IO ====================

// 房间 socket 映射：roomId -> Set(socketId)
const roomSockets = new Map();

io.on('connection', (socket) => {
  console.log(`[连接] 客户端已连接: ${socket.id} (${socket.handshake.headers.origin})`);
  let currentRoomId = null;

  // ========== 时间同步协议 ==========
  socket.on('time-sync-request', (clientTime) => {
    const serverTime = getServerTime();
    socket.emit('time-sync-response', {
      clientTime,
      serverTime,
      serverSendTime: getServerTime()
    });
  });

  // ========== 房间管理 ==========
  
  socket.on('create-room', async ({ userName }, callback) => {
    try {
      if (currentRoomId) {
        await leaveRoom(socket, currentRoomId);
      }

      const roomId = generateRoomId();
      const room = {
        id: roomId,
        clients: new Map(),
        timerState: TimerState.IDLE,
        startTime: null,
        endTime: null,
        elapsedTime: 0,
        createdAt: getServerTime(),
        createdBy: socket.id
      };
      
      room.clients.set(socket.id, {
        id: socket.id,
        name: userName || '房主',
        isCreator: true,
        joinedAt: getServerTime()
      });
      
      await storage.setRoom(roomId, room);
      
      socket.join(roomId);
      currentRoomId = roomId;
      
      // 跟踪 socket
      if (!roomSockets.has(roomId)) {
        roomSockets.set(roomId, new Set());
      }
      roomSockets.get(roomId).add(socket.id);
      
      console.log(`[房间] ${userName || '房主'} 创建了房间 ${roomId}`);
      
      callback({
        success: true,
        roomId,
        room: getRoomPublicData(room)
      });
      
      broadcastRoomUpdate(roomId);
    } catch (error) {
      console.error('[错误] 创建房间:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('join-room', async ({ roomId, userName }, callback) => {
    try {
      const room = await storage.getRoom(roomId.toUpperCase());
      
      if (!room) {
        callback({ success: false, error: '房间不存在' });
        return;
      }

      if (currentRoomId && currentRoomId !== roomId) {
        await leaveRoom(socket, currentRoomId);
      }

      const existingClient = room.clients.get(socket.id);
      if (existingClient) {
        existingClient.name = userName || existingClient.name;
      } else {
        room.clients.set(socket.id, {
          id: socket.id,
          name: userName || '访客' + (room.clients.size + 1),
          isCreator: false,
          joinedAt: getServerTime()
        });
      }
      
      await storage.setRoom(roomId, room);
      
      socket.join(roomId);
      currentRoomId = roomId;
      
      if (!roomSockets.has(roomId)) {
        roomSockets.set(roomId, new Set());
      }
      roomSockets.get(roomId).add(socket.id);
      
      console.log(`[房间] ${userName || '访客'} 加入了房间 ${roomId}`);
      
      callback({
        success: true,
        room: getRoomPublicData(room),
        yourId: socket.id
      });
      
      socket.to(roomId).emit('user-joined', {
        user: room.clients.get(socket.id),
        userCount: room.clients.size
      });
      
      broadcastRoomUpdate(roomId);
      
      // 如果计时器正在运行，发送同步信息
      if (room.timerState === TimerState.RUNNING) {
        socket.emit('timer-sync', {
          state: room.timerState,
          serverStartTime: room.startTime,
          serverCurrentTime: getServerTime(),
          elapsedTime: room.elapsedTime
        });
      }
    } catch (error) {
      console.error('[错误] 加入房间:', error);
      callback({ success: false, error: error.message });
    }
  });

  // ========== 计时器控制 ==========
  
  socket.on('timer-prepare-start', async ({ delay = 3000 }, callback) => {
    try {
      const room = await storage.getRoom(currentRoomId);
      if (!room) {
        callback({ success: false, error: '不在房间中' });
        return;
      }

      const client = room.clients.get(socket.id);
      if (!client || !client.isCreator) {
        callback({ success: false, error: '只有房主可以控制计时器' });
        return;
      }

      if (room.timerState !== TimerState.IDLE && room.timerState !== TimerState.FINISHED) {
        callback({ success: false, error: '计时器状态不正确' });
        return;
      }

      const serverNow = getServerTime();
      const plannedStartTime = serverNow + delay;

      room.timerState = TimerState.READY;
      room.startTime = plannedStartTime;
      room.elapsedTime = 0;
      room.endTime = null;

      await storage.setRoom(currentRoomId, room);

      console.log(`[计时] 房间 ${currentRoomId} 准备开始: ${plannedStartTime}`);

      io.to(currentRoomId).emit('timer-ready', {
        state: TimerState.READY,
        serverPlannedStartTime: plannedStartTime,
        serverCurrentTime: serverNow,
        delay: delay
      });

      setTimeout(async () => {
        const currentRoom = await storage.getRoom(currentRoomId);
        if (currentRoom && currentRoom.timerState === TimerState.READY) {
          currentRoom.timerState = TimerState.RUNNING;
          await storage.setRoom(currentRoomId, currentRoom);
          
          io.to(currentRoomId).emit('timer-started', {
            state: TimerState.RUNNING,
            serverStartTime: currentRoom.startTime,
            serverCurrentTime: getServerTime()
          });
          console.log(`[计时] 房间 ${currentRoomId} 计时开始`);
        }
      }, delay);

      callback({ success: true });
    } catch (error) {
      console.error('[错误] 准备开始:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('timer-stop', async (callback) => {
    try {
      const room = await storage.getRoom(currentRoomId);
      if (!room) {
        callback({ success: false, error: '不在房间中' });
        return;
      }

      if (room.timerState !== TimerState.RUNNING) {
        callback({ success: false, error: '计时器未在运行' });
        return;
      }

      const serverNow = getServerTime();
      room.timerState = TimerState.FINISHED;
      room.endTime = serverNow;
      room.elapsedTime = serverNow - room.startTime;

      await storage.setRoom(currentRoomId, room);

      console.log(`[计时] 房间 ${currentRoomId} 结束: ${room.elapsedTime}ms`);

      io.to(currentRoomId).emit('timer-stopped', {
        state: TimerState.FINISHED,
        serverEndTime: room.endTime,
        serverStartTime: room.startTime,
        elapsedTime: room.elapsedTime
      });

      callback({ success: true });
    } catch (error) {
      console.error('[错误] 停止计时:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('timer-reset', async (callback) => {
    try {
      const room = await storage.getRoom(currentRoomId);
      if (!room) {
        callback({ success: false, error: '不在房间中' });
        return;
      }

      const client = room.clients.get(socket.id);
      if (!client || !client.isCreator) {
        callback({ success: false, error: '只有房主可以重置' });
        return;
      }

      room.timerState = TimerState.IDLE;
      room.startTime = null;
      room.endTime = null;
      room.elapsedTime = 0;

      await storage.setRoom(currentRoomId, room);

      console.log(`[计时] 房间 ${currentRoomId} 重置`);

      io.to(currentRoomId).emit('timer-reset', { state: TimerState.IDLE });

      callback({ success: true });
    } catch (error) {
      console.error('[错误] 重置:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('leave-room', async () => {
    if (currentRoomId) {
      await leaveRoom(socket, currentRoomId);
      currentRoomId = null;
    }
  });

  socket.on('disconnect', async () => {
    console.log(`[断开] ${socket.id}`);
    if (currentRoomId) {
      await leaveRoom(socket, currentRoomId);
    }
  });

  // 辅助函数
  async function leaveRoom(socket, roomId) {
    const room = await storage.getRoom(roomId);
    if (room) {
      const client = room.clients.get(socket.id);
      room.clients.delete(socket.id);
      
      if (roomSockets.has(roomId)) {
        roomSockets.get(roomId).delete(socket.id);
      }
      
      socket.leave(roomId);
      await storage.setRoom(roomId, room);
      
      console.log(`[房间] ${client?.name || socket.id} 离开 ${roomId}`);
      
      socket.to(roomId).emit('user-left', {
        userId: socket.id,
        userName: client?.name,
        userCount: room.clients.size
      });
      
      broadcastRoomUpdate(roomId);
    }
  }

  function broadcastRoomUpdate(roomId) {
    storage.getRoom(roomId).then(room => {
      if (room) {
        io.to(roomId).emit('room-updated', getRoomPublicData(room));
      }
    });
  }
});

// 获取房间公开数据
function getRoomPublicData(room) {
  return {
    id: room.id,
    clients: Array.from(room.clients.values()).map(c => ({
      id: c.id,
      name: c.name,
      isCreator: c.isCreator
    })),
    timerState: room.timerState,
    startTime: room.startTime,
    endTime: room.endTime,
    elapsedTime: room.elapsedTime,
    createdAt: room.createdAt
  };
}

// ==================== HTTP API ====================

// 根路径 - API 信息页
app.get('/', (req, res) => {
  res.json({
    name: 'Timer Sync Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      rooms: '/api/rooms',
      client: 'https://drinkredbull007.github.io/timer-client'
    },
    time: getServerTime()
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: getServerTime(),
    env: process.env.NODE_ENV || 'development',
    storage: process.env.USE_REDIS === 'true' ? 'redis' : 'memory'
  });
});

// 获取房间列表（管理用）
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await storage.getAllRooms();
    res.json(rooms.map(getRoomPublicData));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 静态文件服务
const clientPath = path.join(__dirname, '../timer-client');
app.use(express.static(clientPath));

// 如果访问根路径且存在 index.html，则返回它
app.get('/', (req, res) => {
  const indexPath = path.join(clientPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      name: 'Timer Sync Server',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        rooms: '/api/rooms',
        client: 'https://drinkredbull007.github.io/timer-client'
      },
      time: getServerTime()
    });
  }
});

// ==================== 启动 ====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
========================================
🚀 计时服务器已启动
📡 端口: ${PORT}
🌍 环境: ${process.env.NODE_ENV || 'development'}
💾 存储: ${process.env.USE_REDIS === 'true' ? 'Redis' : '内存'}
${process.env.USE_REDIS === 'true' ? `🔗 Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}` : ''}
========================================
`);
});
