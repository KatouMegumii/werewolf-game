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
  },
  // 断线检测更快（默认25s），配合30s重连缓冲使用
  pingTimeout: 10000
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

// ===== 环信 REST 封装（群组管理，供房间生命周期使用）=====

// App Token 缓存（有效期约7天，提前1分钟过期重新获取）
let appTokenCache = { token: null, expiresAt: 0 };

async function getAppToken() {
  if (appTokenCache.token && Date.now() < appTokenCache.expiresAt - 60_000) {
    return appTokenCache.token;
  }
  const res = await axios.post(
    `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
    {
      grant_type: 'client_credentials',
      client_id: EASEMOB_CONFIG.clientId,
      client_secret: EASEMOB_CONFIG.clientSecret
    }
  );
  appTokenCache = { token: res.data.access_token, expiresAt: Date.now() + res.data.expires_in * 1000 };
  console.log('✅ App Token refreshed');
  return appTokenCache.token;
}

// 创建私有群（群主=owner），返回真实 groupId
async function createEasemobGroup(owner, name, description) {
  const appToken = await getAppToken();
  const res = await axios.post(
    `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/chatgroups`,
    {
      groupname: name,
      desc: description || '',
      public: false,
      owner: owner,
      members: [],
      maxusers: 200
    },
    {
      headers: { 'Authorization': `Bearer ${appToken}`, 'Content-Type': 'application/json' }
    }
  );
  return res.data?.data?.groupid;
}

// 添加群成员（私有群只能被邀请/服务端添加，玩家随后用groupid在前端SDK加入）
async function addEasemobGroupMember(groupId, username) {
  const appToken = await getAppToken();
  await axios.post(
    `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/chatgroups/${groupId}/users`,
    { usernames: [username] },
    {
      headers: { 'Authorization': `Bearer ${appToken}`, 'Content-Type': 'application/json' }
    }
  );
}

// 移除群成员
async function removeEasemobGroupMember(groupId, username) {
  if (!groupId || !username) return;
  try {
    const appToken = await getAppToken();
    await axios.delete(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/chatgroups/${groupId}/users/${username}`,
      { headers: { 'Authorization': `Bearer ${appToken}` } }
    );
  } catch (err) {
    console.warn(`⚠️ 移除环信群成员 ${username} 失败:`, err.response?.status, err.response?.data?.error || err.message);
  }
}

// 解散群组
async function destroyEasemobGroup(groupId) {
  if (!groupId) return;
  try {
    const appToken = await getAppToken();
    await axios.delete(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/chatgroups/${groupId}`,
      { headers: { 'Authorization': `Bearer ${appToken}` } }
    );
    console.log(`🗑️ 环信群 ${groupId} 已解散`);
  } catch (err) {
    console.warn(`⚠️ 解散环信群 ${groupId} 失败:`, err.response?.status, err.response?.data?.error || err.message);
  }
}

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
app.post('/api/rooms', async (req, res) => {
  const { playerName, avatar, boardId, username } = req.body;

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
  const groupName = `room_${newRoomId}`;

  // 根据boardId确定房间人数（优先从数据库读板子的角色数，保证座位数与角色数一致）
  let maxPlayers = 12;
  let boardName = '默认配置';
  if (boardId) {
    try {
      const db = getDb();
      const boardRes = await db.query('SELECT name, roles FROM boards WHERE id = $1', [boardId]);
      if (boardRes.rows[0]) {
        boardName = boardRes.rows[0].name;
        const roles = JSON.parse(boardRes.rows[0].roles);
        if (Array.isArray(roles) && roles.length > 0) {
          maxPlayers = roles.length;
        }
      } else {
        // 数据库没有该板子，回退到内置配置
        const boardConfig = {
          1: { maxPlayers: 12, name: '12人经典配置' },
          2: { maxPlayers: 10, name: '10人精简配置' }
        };
        const fallback = boardConfig[boardId];
        if (fallback) {
          maxPlayers = fallback.maxPlayers;
          boardName = fallback.name;
        }
      }
    } catch (err) {
      console.warn('⚠️ 读取板子配置失败，使用默认人数:', err.message);
    }
  }

  // 创建环信私有群（群主=房主的环信用户名）；失败不阻塞建房，群聊降级为不可用
  let easemobGroupId = '';
  try {
    easemobGroupId = await createEasemobGroup(username || playerName, groupName, `狼人杀房间 ${newRoomId}`);
    console.log(`✅ 环信群创建成功: ${easemobGroupId}`);
  } catch (err) {
    console.warn('⚠️ 创建环信群失败（不影响建房）:', err.message);
  }

  const room = {
    roomId: newRoomId,
    chatGroupId: groupName,
    easemobGroupId,
    createdAt: new Date(),
    players: [playerId],
    status: 'waiting', // waiting, gaming, ended
    maxPlayers,
    boardId: boardId || 'default',
    boardName,
    hostPlayerId: playerId,
    settings: {},
    gameState: {}
  };

  const player = {
    playerId,
    name: playerName,
    easemobUser: username || playerName, // 环信用户名（群成员管理用）
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
    chatGroupId: easemobGroupId || '',
    message: '房间创建成功'
  });
});

/**
 * 加入房间
 */
app.post('/api/rooms/:roomId/join', async (req, res) => {
  const { roomId } = req.params;
  const { playerName, avatar, username } = req.body;

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
      easemobUser: username || playerName, // 环信用户名（群成员管理用）
      avatar: avatar || '🧙',
      roomId,
      role: null,
      isAlive: true,
      seatNumber: room.players.length + 1,  // 新玩家按加入顺序分配座位
      joined_at: new Date()
    };
    room.players.push(playerId);
    players.set(playerId, player);

    // 把新玩家拉进环信群（异步，失败不阻塞入房）
    if (room.easemobGroupId && player.easemobUser) {
      addEasemobGroupMember(room.easemobGroupId, player.easemobUser)
        .then(() => console.log(`✅ 玩家 ${playerName} 已加入环信群 ${room.easemobGroupId}`))
        .catch(err => console.warn(`⚠️ 添加群成员失败:`, err.message));
    }
  }

  res.json({
    playerId,
    chatGroupId: room.easemobGroupId || room.chatGroupId,
    currentPlayers: room.players.length,
    message: '加入房间成功'
  });
});

// ===== 房主管理 =====

// 判断请求者是否为房主
function isHost(room, playerId) {
  return !!room && room.hostPlayerId === playerId;
}

/**
 * 踢人（仅房主）
 */
app.post('/api/rooms/:roomId/kick', (req, res) => {
  const { roomId } = req.params;
  const { playerId, targetPlayerId } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (!isHost(room, playerId)) {
    return res.status(403).json({ error: '只有房主可以踢人' });
  }
  if (playerId === targetPlayerId) {
    return res.status(400).json({ error: '不能踢自己' });
  }

  const target = players.get(targetPlayerId);
  if (!target || target.roomId !== roomId) {
    return res.status(404).json({ error: '玩家不在房间中' });
  }

  // 先通知被踢者（含其自身），再移除
  io.to(roomId).emit('playerKicked', {
    playerId: targetPlayerId,
    playerName: target.name,
    reason: '你已被房主移出房间'
  });
  removePlayerFromRoom(roomId, targetPlayerId, target.name);

  res.json({ message: `玩家 ${target.name} 已移出房间` });
});

/**
 * 转让房主（仅房主）
 */
app.post('/api/rooms/:roomId/transfer', (req, res) => {
  const { roomId } = req.params;
  const { playerId, targetPlayerId } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (!isHost(room, playerId)) {
    return res.status(403).json({ error: '只有房主可以转让' });
  }
  if (playerId === targetPlayerId) {
    return res.status(400).json({ error: '不能转让给自己' });
  }

  const target = players.get(targetPlayerId);
  if (!target || target.roomId !== roomId) {
    return res.status(404).json({ error: '玩家不在房间中' });
  }

  room.hostPlayerId = targetPlayerId;
  io.to(roomId).emit('hostChanged', {
    hostPlayerId: targetPlayerId,
    hostName: target.name
  });

  res.json({ message: `房主已转让给 ${target.name}`, hostPlayerId: targetPlayerId });
});

/**
 * 解散房间（仅房主）
 */
app.post('/api/rooms/:roomId/dissolve', (req, res) => {
  const { roomId } = req.params;
  const { playerId } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (!isHost(room, playerId)) {
    return res.status(403).json({ error: '只有房主可以解散房间' });
  }

  // 通知所有成员（含房主自己）
  io.to(roomId).emit('roomDissolved', { reason: '房主解散了房间' });

  // 清理玩家与socket映射，删除房间
  room.players.forEach(pid => players.delete(pid));
  socketToPlayer.forEach((info, sid) => {
    if (info.roomId === roomId) {
      socketToPlayer.delete(sid);
    }
  });
  rooms.delete(roomId);
  destroyEasemobGroup(room.easemobGroupId);

  console.log(`💥 房主解散房间 ${roomId}`);
  res.json({ message: '房间已解散' });
});

/**
 * 更新房间设置（仅房主，本轮先存对象，供后续游戏使用）
 */
app.put('/api/rooms/:roomId/settings', (req, res) => {
  const { roomId } = req.params;
  const { playerId, settings } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (!isHost(room, playerId)) {
    return res.status(403).json({ error: '只有房主可以修改设置' });
  }
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: '设置无效' });
  }

  room.settings = { ...room.settings, ...settings };
  io.to(roomId).emit('roomSettingsUpdated', { settings: room.settings });

  res.json({ settings: room.settings });
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
    hostPlayerId: room.hostPlayerId,
    settings: room.settings,
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
 * 为玩家签发环信用户Token（免密）
 * 服务端用App Token调用环信REST获取用户Token，前端用 open({user, accessToken}) 登录
 * 密码不再下发到前端，前端也不再存储密码
 */
app.post('/api/easemob/token', async (req, res) => {
  const { playerId, playerName, username } = req.body;

  if (!username) {
    return res.status(400).json({ error: '缺少Easemob用户名' });
  }

  try {
    console.log(`✅ 为玩家 ${playerName} (${username}) 签发Easemob Token`);

    // 第1步: 获取App Token
    const appTokenRes = await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
      {
        grant_type: 'client_credentials',
        client_id: EASEMOB_CONFIG.clientId,
        client_secret: EASEMOB_CONFIG.clientSecret
      }
    );
    const appToken = appTokenRes.data.access_token;

    // 第2步: 获取用户Token（环信REST: GET /users/{username}/token）
    const userTokenRes = await axios.get(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/users/${username}/token`,
      {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const accessToken = userTokenRes.data.access_token;
    const expiresIn = userTokenRes.data.expires_in || 7 * 24 * 3600;

    res.json({
      username,
      accessToken,
      appKey: EASEMOB_CONFIG.appKey,
      expiresIn
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// ===== Socket.io 事件处理 =====

// 追踪 socket 连接到房间/玩家的映射
const socketToPlayer = new Map(); // socketId -> { playerId, roomId, playerName }

// 断线缓冲：playerId -> { timer, roomId, playerName }
// 玩家断连后先缓冲30s，期间重新进入则恢复，超时再真正移除（避免刷新/网络抖动丢房）
const pendingRemovals = new Map();

/**
 * 构建房间玩家列表（按座位号排序），过滤players中已不存在的孤儿条目
 */
function buildPlayerList(room) {
  return room.players
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
}

/**
 * 从房间移除玩家并通知其他人；房间空了则删除房间
 */
function removePlayerFromRoom(roomId, playerId, playerName) {
  const room = rooms.get(roomId);
  if (!room) return;

  const player = players.get(playerId);

  room.players = room.players.filter(pid => pid !== playerId);
  players.delete(playerId);
  socketToPlayer.forEach((info, socketId) => {
    if (info.playerId === playerId) socketToPlayer.delete(socketId);
  });

  const playerList = buildPlayerList(room);
  io.to(roomId).emit('playerLeft', {
    playerId,
    playerName,
    totalPlayers: room.players.length,
    playerList
  });

  console.log(`📢 房间 ${roomId} 当前玩家: ${room.players.length}`);

  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`🗑️ 空房间 ${roomId} 已删除`);
    // 房间解散，同步解散环信群（失败仅warn，不阻塞）
    destroyEasemobGroup(room.easemobGroupId);
  } else if (player?.easemobUser && room.easemobGroupId) {
    // 房间还有其他人，把离开的玩家移出群（非房主离开）
    removeEasemobGroupMember(room.easemobGroupId, player.easemobUser);
  }
}

/**
 * 断连缓冲：玩家断连后30s内重新进入则恢复，超时后真正移除
 */
function schedulePlayerRemoval(roomId, playerId, playerName) {
  if (pendingRemovals.has(playerId)) {
    clearTimeout(pendingRemovals.get(playerId).timer);
  }
  const timer = setTimeout(() => {
    pendingRemovals.delete(playerId);
    removePlayerFromRoom(roomId, playerId, playerName);
  }, 30_000);
  pendingRemovals.set(playerId, { timer, roomId, playerName });
}

/**
 * 取消断线移除（玩家在缓冲期内重新进入）
 */
function cancelPlayerRemoval(playerId) {
  const entry = pendingRemovals.get(playerId);
  if (entry) {
    clearTimeout(entry.timer);
    pendingRemovals.delete(playerId);
    console.log(`🔄 玩家 ${entry.playerName} 在缓冲期内重连，取消移除`);
  }
}

// 定时清扫：清理 rooms/players 中的数据不一致（防御，正常情况下不该触发）
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    const before = room.players.length;
    room.players = room.players.filter(pid => players.has(pid));
    if (room.players.length === 0 && before > 0) {
      rooms.delete(roomId);
      console.log(`🧹 清扫：孤儿房间 ${roomId} 已删除`);
    }
  }
}, 30_000);

io.on('connection', (socket) => {
  console.log(`✅ 客户端连接: ${socket.id}`);

  // 玩家加入房间（进入 Room.vue 时调用）
  socket.on('joinRoom', (data) => {
    const { roomId, playerId, playerName } = data;
    console.log(`👤 玩家 ${playerName} (${playerId}) 加入房间 ${roomId}`);

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('joinRoomFailed', { reason: '房间不存在' });
      return;
    }

    // 鉴权：玩家必须真实存在于房间玩家列表中（防止跳过HTTP入房成为"隐形玩家"）
    if (!playerId || !room.players.includes(playerId)) {
      console.warn(`🚫 玩家 ${playerName} 不在房间 ${roomId} 的玩家列表中，拒绝加入`);
      socket.emit('joinRoomFailed', { reason: '你不在这个房间中，请从大厅进入' });
      return;
    }

    // 断线缓冲期内重连：取消计划中的移除
    cancelPlayerRemoval(playerId);

    // 记录 socket 到玩家的映射
    socketToPlayer.set(socket.id, { playerId, roomId, playerName });

    // 加入 Socket.io 房间
    socket.join(roomId);
    console.log(`✅ Socket ${socket.id} 已加入房间 ${roomId}`);

    // 构建玩家列表数据 - 包含avatar信息和座位号，并按座位号排序
    const playerList = buildPlayerList(room);

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
      maxPlayers: room.maxPlayers,
      hostPlayerId: room.hostPlayerId
    });

    console.log(`📢 房间 ${roomId} 当前玩家: ${room.players.length}`);
    console.log(`👥 玩家列表:`, playerList.map(p => p.name).join(', '));
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

  // 玩家离开房间（主动离开，不缓冲，直接移除）
  socket.on('leaveRoom', (data, callback) => {
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

    // 主动离开：取消可能存在的断线缓冲，直接移除
    cancelPlayerRemoval(actualPlayerId);

    // 从socketToPlayer移除
    if (socketInfo) {
      socketToPlayer.delete(socket.id);
    }

    // 从Socket房间移除
    socket.leave(actualRoomId);

    removePlayerFromRoom(actualRoomId, actualPlayerId, actualPlayerName);

    // ack通知前端已处理完成（前端据此断开连接，避免emit后立即断开丢包）
    if (typeof callback === 'function') {
      callback({ ok: true });
    }
  });

  // 玩家断连处理（断线缓冲30s，期间重连则恢复）
  socket.on('disconnect', () => {
    const socketInfo = socketToPlayer.get(socket.id);
    if (socketInfo) {
      const { playerId, roomId, playerName } = socketInfo;
      console.log(`❌ 玩家 ${playerName} 断连 (socket: ${socket.id})`);

      socketToPlayer.delete(socket.id);

      // 30s缓冲期，玩家重新进入（刷新/网络抖动）则恢复，超时再移除
      schedulePlayerRemoval(roomId, playerId, playerName);
    }
  });
});

// ===== 板子API =====

/**
 * 获取用户的板子列表
 * 暂时返回mock数据，实际应该从数据库获取
 */
app.get('/api/boards', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'] || 'default';

    const result = await db.query(
      'SELECT * FROM boards WHERE userId = $1 ORDER BY isFavorite DESC, createdAt DESC',
      [userId]
    );

    res.json(result.rows || []);
  } catch (err) {
    console.error('获取板子列表失败:', err);
    res.status(500).json({ error: '获取板子列表失败' });
  }
});

// 保存或更新板子
app.post('/api/boards', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'] || 'default';
    const { name, roles, summary, isFavorite } = req.body;

    if (!name || !roles) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    await db.query(
      `INSERT INTO boards (userId, name, roles, summary, isFavorite)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(userId, name) DO UPDATE SET
       roles = $3, summary = $4, isFavorite = $5, updatedAt = CURRENT_TIMESTAMP`,
      [userId, name, JSON.stringify(roles), summary, isFavorite]
    );

    res.json({ message: '板子保存成功' });
  } catch (err) {
    console.error('保存板子失败:', err);
    res.status(500).json({ error: '保存板子失败' });
  }
});

// 删除板子
app.delete('/api/boards/:name', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'] || 'default';
    const boardName = decodeURIComponent(req.params.name);

    const result = await db.query(
      'DELETE FROM boards WHERE userId = $1 AND name = $2',
      [userId, boardName]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '板子不存在' });
    }

    res.json({ message: '板子删除成功' });
  } catch (err) {
    console.error('删除板子失败:', err);
    res.status(500).json({ error: '删除板子失败' });
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
