import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import qs from 'qs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initDb, getDb } from './db.js';

dotenv.config();

// 初始化数据库
initDb();

const app = express();
app.use(cors());
app.use(express.json());

// 创建 HTTP 服务器和 Socket.io 实例
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.VITE_ALLOWED_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// 环信配置
const EASEMOB_CONFIG = {
  appKey: '1196260703193552#langrensha',
  orgName: '1196260703193552',
  appName: 'langrensha',
  clientId: process.env.EASEMOB_CLIENT_ID,
  clientSecret: process.env.EASEMOB_CLIENT_SECRET
};

// 内存存储（生产环境应使用数据库）
const rooms = new Map();
const players = new Map();

// ===== 用户注册 =====

/**
 * 用户注册 - 通过REST API在环信创建新用户
 */
app.post('/api/auth/register', async (req, res) => {
  const { username, nickname, password } = req.body;

  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '用户名、昵称和密码不能为空' });
  }

  try {
    // 第1步: 获取管理员token (App Token)
    console.log('获取App Token...');
    const appTokenRes = await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
      {
        grant_type: 'client_credentials',
        client_id: EASEMOB_CONFIG.clientId,
        client_secret: EASEMOB_CONFIG.clientSecret
      }
    );

    const appToken = appTokenRes.data.access_token;
    console.log('✅ App token obtained');

    // 第2步: 创建用户 - 这是用户在Easemob中的独立账户
    console.log(`正在创建用户: ${username}...`);
    const createUserRes = await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/users`,
      {
        username: username,
        password: password
      },
      {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ User created successfully in Easemob');

    // 第3步: 生成随机头像
    const avatars = ['🧙', '🐺', '🧪', '🏹', '🎭', '🌾', '👻', '🐉', '🦅', '🦊', '🐻', '🦁', '🐼', '🐨', '🐯', '🦓', '🦘', '🐘', '🦏', '🦝', '🦚', '🦜', '🦆', '🦉'];
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
    console.log(`生成随机头像: ${randomAvatar}`);

    // 第4步: 设置用户属性到环信：使用metadata API
    try {
      console.log(`设置用户属性到环信...`);
      const attrData = qs.stringify({
        nickname: nickname,
        ext: JSON.stringify({ avatar: randomAvatar })
      });

      await axios.put(
        `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/metadata/user/${username}`,
        attrData,
        {
          headers: {
            'Authorization': `Bearer ${appToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log(`✅ 用户属性已设置到环信: nickname=${nickname}, avatar=${randomAvatar}`);
    } catch (err) {
      console.warn(`⚠️ 设置用户属性失败:`, err.response?.status, err.response?.data);
    }

    res.json({
      userId: username,
      username: username,
      nickname: nickname,
      avatar: randomAvatar,
      appKey: EASEMOB_CONFIG.appKey,
      easemobUser: username,
      easemobPassword: password,
      message: '用户创建成功'
    });

  } catch (error) {
    console.error('❌ Registration error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

/**
 * 用户登录 - 验证用户凭证并返回环信连接信息
 */
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  try {
    // 第1步: 获取管理员token (App Token)
    console.log('获取App Token...');
    const appTokenRes = await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
      {
        grant_type: 'client_credentials',
        client_id: EASEMOB_CONFIG.clientId,
        client_secret: EASEMOB_CONFIG.clientSecret
      }
    );

    const appToken = appTokenRes.data.access_token;
    console.log('✅ App token obtained');

    // 第2步: 验证用户凭证 - 通过获取用户信息来验证
    console.log(`验证用户: ${username}...`);
    const userRes = await axios.get(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/users/${username}`,
      {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ User verified');

    // 第3步: 获取用户属性（可选的，失败不影响登录）
    let userNickname = username;
    let userAvatar = '🧙';

    try {
      // 从环信获取用户属性（使用metadata API）
      const attrRes = await axios.get(
        `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/metadata/user/${username}`,
        {
          headers: {
            'Authorization': `Bearer ${appToken}`,
            'Accept': 'application/json'
          }
        }
      );

      console.log('User attributes response:', JSON.stringify(attrRes.data, null, 2));

      // 从响应的data字段获取属性
      if (attrRes.data?.data) {
        const userData = attrRes.data.data;

        if (userData.nickname) {
          userNickname = userData.nickname;
          console.log('✅ 昵称:', userNickname);
        }

        // 解析ext字段获取avatar
        if (userData.ext) {
          console.log('Raw ext:', userData.ext);
          try {
            let extData = typeof userData.ext === 'string' ? JSON.parse(userData.ext) : userData.ext;
            console.log('Parsed ext:', extData);
            if (extData?.avatar) {
              userAvatar = extData.avatar;
              console.log('✅ 头像从ext读取:', userAvatar);
            }
          } catch (e) {
            console.warn('⚠️ Failed to parse ext:', e.message);
          }
        }
      }

      console.log('✅ 用户属性完整:', { nickname: userNickname, avatar: userAvatar });
    } catch (err) {
      console.warn('⚠️ 获取用户属性失败（继续登录）:', err.response?.status, err.message);
      // 属性获取失败不影响登录，继续使用默认值
    }

    res.json({
      userId: username,
      username: username,
      nickname: userNickname,
      avatar: userAvatar,
      appKey: EASEMOB_CONFIG.appKey,
      easemobUser: username,
      easemobPassword: password,
      message: '登录成功'
    });

  } catch (error) {
    console.error('❌ Login error:', error.message);
    if (error.response?.status === 404) {
      res.status(401).json({ error: '用户不存在' });
    } else if (error.response?.data) {
      console.error('Response:', error.response.data);
      res.status(error.response?.status || 500).json({
        error: error.message,
        details: error.response?.data
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * 创建房间
 */
app.post('/api/rooms', (req, res) => {
  const { playerName, avatar, boardId, userId } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: '玩家名称不能为空' });
  }

  // 检查玩家是否已经在其他房间中
  for (const [roomId, room] of rooms.entries()) {
    const playerInRoom = room.players.find(pid => {
      const p = players.get(pid);
      return p && p.name === playerName;
    });
    if (playerInRoom) {
      return res.status(400).json({
        error: '玩家已在房间中',
        existingRoomId: roomId
      });
    }
  }

  const newRoomId = String(Math.floor(Math.random() * 900000) + 100000);
  const playerId = uuidv4();
  const chatGroupId = `room_${newRoomId}`;

  // 根据boardId确定房间人数
  const boardConfig = {
    1: { maxPlayers: 12, name: '12人经典配置' },
    2: { maxPlayers: 10, name: '10人精简配置' }
  };
  const board = boardConfig[boardId] || { maxPlayers: 12, name: '默认配置' };

  const room = {
    roomId: newRoomId,
    chatGroupId,
    createdAt: new Date(),
    players: [playerId],
    status: 'waiting', // waiting, gaming, ended
    maxPlayers: board.maxPlayers,
    boardId: boardId || 'default',
    boardName: board.name,
    gameState: {}
  };

  const player = {
    playerId,
    name: playerName,
    avatar: avatar || '🧙',
    roomId: newRoomId,
    role: null,
    isAlive: true,
    seatNumber: 1,  // 创建房间的人坐在第1个座位
    joined_at: new Date()
  };

  rooms.set(newRoomId, room);
  players.set(playerId, player);

  res.json({
    roomId: newRoomId,
    playerId,
    chatGroupId,
    message: '房间创建成功'
  });
});

/**
 * 加入房间
 */
app.post('/api/rooms/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const { playerName, avatar } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: '玩家名称不能为空' });
  }

  // 检查玩家是否已经在其他房间中
  for (const [rid, room] of rooms.entries()) {
    if (rid === roomId) continue; // 跳过目标房间，允许重新进入
    const playerInRoom = room.players.find(pid => {
      const p = players.get(pid);
      return p && p.name === playerName;
    });
    if (playerInRoom) {
      return res.status(400).json({
        error: '玩家已在其他房间中',
        existingRoomId: rid
      });
    }
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  if (room.players.length >= room.maxPlayers) {
    return res.status(400).json({ error: '房间已满' });
  }

  // 检查该玩家是否已在此房间
  const existingPlayer = room.players.find(pid => {
    const p = players.get(pid);
    return p && p.name === playerName;
  });

  let playerId;
  if (existingPlayer) {
    // 玩家重新进入房间，使用同一个playerId
    playerId = existingPlayer;
  } else {
    // 新玩家加入
    playerId = uuidv4();
    const player = {
      playerId,
      name: playerName,
      avatar: avatar || '🧙',
      roomId,
      role: null,
      isAlive: true,
      seatNumber: room.players.length + 1,  // 新玩家按加入顺序分配座位
      joined_at: new Date()
    };
    room.players.push(playerId);
    players.set(playerId, player);
  }

  res.json({
    playerId,
    chatGroupId: room.chatGroupId,
    currentPlayers: room.players.length,
    message: '加入房间成功'
  });
});

/**
 * 获取房间信息
 */
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const roomPlayers = room.players.map(pid => {
    const p = players.get(pid);
    return {
      playerId: p.playerId,
      name: p.name,
      role: p.role,
      isAlive: p.isAlive
    };
  });

  res.json({
    roomId: room.roomId,
    chatGroupId: room.chatGroupId,
    status: room.status,
    players: roomPlayers,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers
  });
});

/**
 * 获取所有房间
 */
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values())
    .filter(room => room.players.length > 0)
    .map(room => ({
      id: room.roomId,
      roomId: room.roomId,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      status: room.status,
      boardId: room.boardId || 'default',
      boardName: room.boardName || '自定义板子',
      createdAt: room.createdAt
    }));

  res.json(roomList);
});

/**
 * 更新用户属性
 */
app.put('/api/auth/user/:username', async (req, res) => {
  const { username } = req.params;
  const { nickname, avatar } = req.body;

  try {
    // 获取App Token
    const appTokenRes = await axios.post(
      'http://ngi-a1.easemob.com/1196260703193552/langrensha/token',
      {
        grant_type: 'client_credentials',
        client_id: EASEMOB_CONFIG.clientId,
        client_secret: EASEMOB_CONFIG.clientSecret
      }
    );

    const appToken = appTokenRes.data.access_token;
    console.log(`更新用户 ${username} 的属性...`);

    // 先获取当前用户属性以获取现有的ext
    let currentExt = {};
    try {
      const getRes = await axios.get(
        `http://ngi-a1.easemob.com/1196260703193552/langrensha/metadata/user/${username}`,
        {
          headers: {
            'Authorization': `Bearer ${appToken}`,
            'Accept': 'application/json'
          }
        }
      );

      console.log('Current user attributes:', JSON.stringify(getRes.data, null, 2));

      // 解析现有的ext字段
      if (getRes.data?.data?.ext) {
        try {
          currentExt = typeof getRes.data.data.ext === 'string' ? JSON.parse(getRes.data.data.ext) : getRes.data.data.ext;
        } catch (e) {
          console.warn('⚠️ Failed to parse current ext:', e.message);
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to get current user attributes:', err.message);
    }

    // 准备更新数据
    const updateData = {};
    if (nickname !== undefined) {
      updateData.nickname = nickname;
    }

    // 更新ext中的avatar
    if (avatar !== undefined) {
      currentExt.avatar = avatar;
      updateData.ext = JSON.stringify(currentExt);
    }

    if (Object.keys(updateData).length === 0) {
      return res.json({ message: '没有属性需要更新' });
    }

    console.log(`准备更新数据:`, updateData);

    // 更新用户属性到环信（使用metadata API）
    try {
      const attrData = qs.stringify(updateData);

      const updateRes = await axios.put(
        `http://ngi-a1.easemob.com/1196260703193552/langrensha/metadata/user/${username}`,
        attrData,
        {
          headers: {
            'Authorization': `Bearer ${appToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log(`✅ 用户属性已更新到环信:`, JSON.stringify(updateRes.data));
    } catch (err) {
      console.error(`❌ 更新属性失败:`, err.response?.status, err.response?.data);
      throw err;
    }

    res.json({
      message: '用户属性更新成功',
      nickname,
      avatar
    });
  } catch (error) {
    console.error('❌ Update user error:', error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data));
    }
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// ===== 环信集成 =====

/**
 * 为玩家生成环信连接信息
 * 返回用户的Easemob凭证（username + password）
 * 前端使用这些凭证直接通过WebSocket连接环信SDK
 */
app.post('/api/easemob/token', async (req, res) => {
  const { playerId, playerName, username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '缺少Easemob用户凭证' });
  }

  try {
    console.log(`✅ 为玩家 ${playerName} (${username}) 提供Easemob凭证`);

    // 返回用户的Easemob凭证
    // 前端将使用这些凭证通过Easemob SDK登录
    res.json({
      username: username,
      password: password,
      appKey: EASEMOB_CONFIG.appKey,
      userId: username,
      displayName: playerName,
      expiresIn: 7 * 24 * 3600
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      error: error.message
    });
  }
});

// ===== Socket.io 事件处理 =====

// 追踪 socket 连接到房间/玩家的映射
const socketToPlayer = new Map(); // socketId -> { playerId, roomId, playerName }

io.on('connection', (socket) => {
  console.log(`✅ 客户端连接: ${socket.id}`);

  // 玩家加入房间（进入 Room.vue 时调用）
  socket.on('joinRoom', (data) => {
    const { roomId, playerId, playerName } = data;
    console.log(`👤 玩家 ${playerName} (${playerId}) 加入房间 ${roomId}`);

    // 记录 socket 到玩家的映射
    socketToPlayer.set(socket.id, { playerId, roomId, playerName });

    // 加入 Socket.io 房间
    socket.join(roomId);
    console.log(`✅ Socket ${socket.id} 已加入房间 ${roomId}`);

    // 获取房间信息
    const room = rooms.get(roomId);
    if (room) {
      // 构建玩家列表数据 - 包含avatar信息和座位号，并按座位号排序
      const playerList = room.players
        .map(pid => {
          const p = players.get(pid);
          return {
            playerId: p.playerId,
            name: p.name,
            avatar: p.avatar || '🧙',
            role: p.role,
            isAlive: p.isAlive,
            seatNumber: p.seatNumber || 1
          };
        })
        .sort((a, b) => (a.seatNumber || 1) - (b.seatNumber || 1));

      // 通知房间内所有人有新玩家加入
      io.to(roomId).emit('playerJoined', {
        playerId,
        playerName,
        totalPlayers: room.players.length,
        playerList
      });

      // 回复加入者
      socket.emit('joinRoomSuccess', {
        roomId,
        playerId,
        playerList,
        totalPlayers: room.players.length,
        maxPlayers: room.maxPlayers
      });

      console.log(`📢 房间 ${roomId} 当前玩家: ${room.players.length}`);
      console.log(`👥 玩家列表:`, playerList.map(p => p.name).join(', '));
    }
  });

  // 玩家发送聊天消息
  socket.on('sendMessage', (data) => {
    const { roomId, playerName, message } = data;
    const socketInfo = socketToPlayer.get(socket.id);

    if (!socketInfo || socketInfo.roomId !== roomId) {
      console.warn('❌ 消息来自非房间玩家');
      return;
    }

    console.log(`💬 房间 ${roomId} - ${playerName}: ${message}`);

    // 广播消息到房间内所有人
    io.to(roomId).emit('receiveMessage', {
      playerName,
      message,
      timestamp: new Date(),
      type: 'player'
    });
  });

  // 玩家发送系统消息（如准备、状态变化等）
  socket.on('sendSystemMessage', (data) => {
    const { roomId, message } = data;
    const socketInfo = socketToPlayer.get(socket.id);

    if (!socketInfo || socketInfo.roomId !== roomId) {
      return;
    }

    console.log(`🔔 房间 ${roomId} 系统消息: ${message}`);

    io.to(roomId).emit('receiveMessage', {
      message,
      timestamp: new Date(),
      type: 'system'
    });
  });

  // 座位交换
  socket.on('swapSeat', (data) => {
    const { roomId, playerId, playerName, fromSeat, toSeat } = data;
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('swapSeatFailed', { reason: '房间不存在' });
      return;
    }

    // 检查座位范围
    if (toSeat < 1 || toSeat > room.maxPlayers) {
      socket.emit('swapSeatFailed', { reason: '座位无效' });
      return;
    }

    // 获取玩家对象
    const player = players.get(playerId);
    if (!player || player.roomId !== roomId) {
      socket.emit('swapSeatFailed', { reason: '玩家不在房间' });
      return;
    }

    // 检查目标座位是否被占用
    const targetOccupied = Array.from(players.values()).some(p =>
      p.roomId === roomId && p.seatNumber === toSeat && p.playerId !== playerId
    );

    if (targetOccupied) {
      socket.emit('swapSeatFailed', { reason: '座位已被占用' });
      return;
    }

    // 再次检查玩家当前座位（防止客户端发送错误的fromSeat）
    if (player.seatNumber !== fromSeat) {
      socket.emit('swapSeatFailed', { reason: '你已不在座位 ' + fromSeat });
      return;
    }

    // 更新玩家座位号
    player.seatNumber = toSeat;
    console.log(`✅ 玩家 ${playerName} 已从座位 ${fromSeat} 移至座位 ${toSeat}`);

    // 按座位号排序构建玩家列表
    const playerList = room.players
      .map(pid => {
        const p = players.get(pid);
        return {
          playerId: p.playerId,
          name: p.name,
          avatar: p.avatar || '🧙',
          role: p.role,
          isAlive: p.isAlive,
          seatNumber: p.seatNumber
        };
      })
      .sort((a, b) => a.seatNumber - b.seatNumber);

    // 广播给所有人
    io.to(roomId).emit('seatSwapped', {
      playerId,
      playerName,
      fromSeat,
      toSeat,
      playerList
    });
  });

  // 玩家离开房间
  socket.on('leaveRoom', (data) => {
    const { roomId, playerId, playerName } = data;
    const socketInfo = socketToPlayer.get(socket.id);

    // 如果socketInfo不存在但有完整的data，直接使用data处理
    if (!socketInfo && !roomId) {
      console.warn('⚠️ 尝试离开房间失败: 缺少必要信息');
      return;
    }

    // 使用socketInfo或data中的信息
    const actualRoomId = socketInfo?.roomId || roomId;
    const actualPlayerId = socketInfo?.playerId || playerId;
    const actualPlayerName = socketInfo?.playerName || playerName;

    console.log(`👋 玩家 ${actualPlayerName} (${actualPlayerId}) 离开房间 ${actualRoomId}`);

    // 从socketToPlayer移除
    if (socketInfo) {
      socketToPlayer.delete(socket.id);
    }

    // 从Socket房间移除
    socket.leave(actualRoomId);

    // 如果房间存在，更新房间数据
    const room = rooms.get(actualRoomId);
    if (room) {
      room.players = room.players.filter(pid => pid !== actualPlayerId);
      players.delete(actualPlayerId);

      const playerList = room.players
        .map(pid => {
          const p = players.get(pid);
          if (!p) return null;
          return {
            playerId: p.playerId,
            name: p.name,
            avatar: p.avatar || '🧙',
            role: p.role,
            isAlive: p.isAlive,
            seatNumber: p.seatNumber || 1
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a.seatNumber || 1) - (b.seatNumber || 1));

      // 通知房间内剩余玩家
      io.to(actualRoomId).emit('playerLeft', {
        playerId: actualPlayerId,
        playerName: actualPlayerName,
        totalPlayers: room.players.length,
        playerList
      });

      console.log(`📢 房间 ${actualRoomId} 当前玩家: ${room.players.length}`);

      // 如果房间空了，删除房间
      if (room.players.length === 0) {
        rooms.delete(actualRoomId);
        console.log(`🗑️ 空房间 ${actualRoomId} 已删除`);
      }
    }
  });

  // 玩家断连处理
  socket.on('disconnect', () => {
    const socketInfo = socketToPlayer.get(socket.id);
    if (socketInfo) {
      const { playerId, roomId, playerName } = socketInfo;
      console.log(`❌ 玩家 ${playerName} 断连 (socket: ${socket.id})`);

      // 自动从房间移除
      const room = rooms.get(roomId);
      if (room) {
        room.players = room.players.filter(pid => pid !== playerId);
        players.delete(playerId);

        const playerList = room.players
          .map(pid => {
            const p = players.get(pid);
            if (!p) return null;
            return {
              playerId: p.playerId,
              name: p.name,
              avatar: p.avatar || '🧙',
              role: p.role,
              isAlive: p.isAlive,
              seatNumber: p.seatNumber || 1
            };
          })
          .filter(Boolean)
          .sort((a, b) => (a.seatNumber || 1) - (b.seatNumber || 1));

        // 通知其他玩家
        io.to(roomId).emit('playerLeft', {
          playerId: playerId,
          playerName: playerName,
          totalPlayers: room.players.length,
          playerList
        });

        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`🗑️ 空房间 ${roomId} 已删除`);
        }
      }

      socketToPlayer.delete(socket.id);
    }
  });
});

// ===== 板子API =====

/**
 * 获取用户的板子列表
 * 暂时返回mock数据，实际应该从数据库获取
 */
app.get('/api/boards', (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'] || 'default';

    const boards = db.prepare('SELECT * FROM boards WHERE userId = ? ORDER BY isFavorite DESC, createdAt DESC')
      .all(userId);

    res.json(boards || []);
  } catch (err) {
    console.error('获取板子列表失败:', err);
    res.status(500).json({ error: '获取板子列表失败' });
  }
});

// 保存或更新板子
app.post('/api/boards', (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'] || 'default';
    const { name, roles, summary, isFavorite } = req.body;

    if (!name || !roles) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    const stmt = db.prepare(`
      INSERT INTO boards (userId, name, roles, summary, isFavorite)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId, name) DO UPDATE SET
        roles = ?, summary = ?, isFavorite = ?, updatedAt = CURRENT_TIMESTAMP
    `);

    stmt.run(userId, name, JSON.stringify(roles), summary, isFavorite ? 1 : 0, JSON.stringify(roles), summary, isFavorite ? 1 : 0);

    res.json({ message: '板子保存成功' });
  } catch (err) {
    console.error('保存板子失败:', err);
    res.status(500).json({ error: '保存板子失败' });
  }
});

// ===== 基础路由 =====

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🎮 Werewolf Game Server running on http://localhost:${PORT}`);
  console.log(`📱 API ready for frontend connection`);
  console.log(`🔌 WebSocket ready for real-time communication`);
});
