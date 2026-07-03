import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import qs from 'qs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
      'http://ngi-a1.easemob.com/1196260703193552/langrensha/token',
      {
        grant_type: 'client_credentials',
        client_id: EASEMOB_CONFIG.clientId,
        client_secret: EASEMOB_CONFIG.clientSecret
      }
    );

    const appToken = appTokenRes.data.access_token;
    console.log('✅ App token obtained');

    // 第2步: 创建用户
    console.log(`正在创建用户: ${username}...`);
    const createUserRes = await axios.post(
      `http://ngi-a1.easemob.com/1196260703193552/langrensha/users`,
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

    console.log('✅ User created successfully');

    // 第3步: 生成随机头像
    const avatars = ['🧙', '🐺', '🧪', '🏹', '🎭', '🌾', '👻', '🐉', '🦅', '🦊', '🐻', '🦁', '🐼', '🐨', '🐯', '🦓', '🦘', '🐘', '🦏', '🦝', '🦚', '🦜', '🦆', '🦉'];
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
    console.log(`生成随机头像: ${randomAvatar}`);

    // 设置用户属性到环信：使用metadata API
    try {
      console.log(`设置用户属性到环信...`);
      const attrData = qs.stringify({
        nickname: nickname,
        ext: JSON.stringify({ avatar: randomAvatar })
      });

      await axios.put(
        `http://ngi-a1.easemob.com/1196260703193552/langrensha/metadata/user/${username}`,
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
      'http://ngi-a1.easemob.com/1196260703193552/langrensha/token',
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
      `http://ngi-a1.easemob.com/1196260703193552/langrensha/users/${username}`,
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
        `http://ngi-a1.easemob.com/1196260703193552/langrensha/metadata/user/${username}`,
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
  const { playerName } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: '玩家名称不能为空' });
  }

  const roomId = uuidv4().substring(0, 8);
  const playerId = uuidv4();
  const chatGroupId = `room_${roomId}`;

  const room = {
    roomId,
    chatGroupId,
    createdAt: new Date(),
    players: [playerId],
    status: 'waiting', // waiting, gaming, ended
    maxPlayers: 12,
    gameState: {}
  };

  const player = {
    playerId,
    name: playerName,
    roomId,
    role: null,
    isAlive: true,
    joined_at: new Date()
  };

  rooms.set(roomId, room);
  players.set(playerId, player);

  res.json({
    roomId,
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
  const { playerName } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: '玩家名称不能为空' });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  if (room.players.length >= room.maxPlayers) {
    return res.status(400).json({ error: '房间已满' });
  }

  const playerId = uuidv4();
  const player = {
    playerId,
    name: playerName,
    roomId,
    role: null,
    isAlive: true,
    joined_at: new Date()
  };

  room.players.push(playerId);
  players.set(playerId, player);

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
  const roomList = Array.from(rooms.values()).map(room => ({
    roomId: room.roomId,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    status: room.status,
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
 * 返回预创建用户的凭证信息
 */
app.post('/api/easemob/token', async (req, res) => {
  const { playerId, playerName } = req.body;

  if (!playerId || !playerName) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  try {
    // 返回预创建的测试用户凭证
    // 前端使用这些凭证直接通过WebSocket连接环信
    console.log(`✅ Easemob credentials provided for ${playerName}`);

    res.json({
      username: 'test1',
      password: '123',
      appKey: EASEMOB_CONFIG.appKey,
      userId: 'test1',
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

// ===== 基础路由 =====

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎮 Werewolf Game Server running on http://localhost:${PORT}`);
  console.log(`📱 API ready for frontend connection`);
});
