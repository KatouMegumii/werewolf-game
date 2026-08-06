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
    // 未配置VITE_ALLOWED_ORIGIN时开发默认允许所有来源；
    // 生产可配置多个域名，逗号分隔，如 "https://a.com,https://b.com"
    origin: process.env.VITE_ALLOWED_ORIGIN
      ? process.env.VITE_ALLOWED_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
      : true,
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
// 防重入:401 强制刷新时避免并发循环
let appTokenRefreshing = false;

async function getAppToken() {
  if (appTokenCache.token && Date.now() < appTokenCache.expiresAt - 60_000) {
    return appTokenCache.token;
  }
  const refreshToken = async () => {
    const res = await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
      {
        grant_type: 'client_credentials',
        client_id: EASEMOB_CONFIG.clientId,
        client_secret: EASEMOB_CONFIG.clientSecret
      },
      { timeout: 15_000 }
    );
    appTokenCache = { token: res.data.access_token, expiresAt: Date.now() + res.data.expires_in * 1000 };
    console.log('✅ App Token refreshed');
    return appTokenCache.token;
  };
  try {
    return await refreshToken();
  } catch (err) {
    // 401:缓存 token 被吊销(如控制台重置凭证),清缓存强制重试一次,
    // 否则 7 天窗口内所有环信操作(含删群)持续 401,重试队列也全失败
    if (err.response?.status === 401 && !appTokenRefreshing) {
      appTokenRefreshing = true;
      appTokenCache = {};
      try {
        const token = await refreshToken();
        return token;
      } finally {
        appTokenRefreshing = false;
      }
    }
    throw err;
  }
}

// 环信真实用户名缓存: 输入大小写 -> 环信存储的真实名(小写)
const usernameAliasCache = new Map();

/**
 * 规范化环信用户名: users GET 大小写不敏感,但 metadata 存储/读取大小写敏感。
 * 历史上 localStorage 可能存有大写 username(旧版本登录/未重新登录的会话),
 * 必须统一换成环信真实小写名再读写,否则 metadata 会读写到大小写分裂的错误记录。
 * 查不到时原样返回(环信侧会 404,不会写错记录)。
 */
async function normalizeEasemobUsername(username) {
  if (!username) return username;
  if (usernameAliasCache.has(username)) return usernameAliasCache.get(username);
  try {
    const appToken = await getAppToken();
    const res = await axios.get(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/users/${username}`,
      { headers: { 'Authorization': `Bearer ${appToken}` }, timeout: 15_000 }
    );
    const real = res.data?.entities?.[0]?.username || username;
    usernameAliasCache.set(username, real);
    return real;
  } catch (err) {
    return username;
  }
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
      headers: { 'Authorization': `Bearer ${appToken}`, 'Content-Type': 'application/json' },
      timeout: 15_000
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
      headers: { 'Authorization': `Bearer ${appToken}`, 'Content-Type': 'application/json' },
      timeout: 15_000
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
      { headers: { 'Authorization': `Bearer ${appToken}` }, timeout: 15_000 }
    );
  } catch (err) {
    console.warn(`⚠️ 移除环信群成员 ${username} 失败:`, err.response?.status, JSON.stringify(err.response?.data) || err.message);
  }
}

// 解散失败的环信群ID集合：由30s清扫循环兜底重试，直到成功或群已不存在（网络抖动/App Token刷新失败等不再永久泄漏）
const pendingGroupDestroys = new Set();

// 解散群组（失败进入重试队列，不阻塞调用方）
async function destroyEasemobGroup(groupId) {
  if (!groupId) return;
  if (pendingGroupDestroys.has(groupId)) return; // 已在重试队列，避免并发重复删除
  try {
    const appToken = await getAppToken();
    // timeout 必须有:该集群已有无限挂起前科(SDK send),挂起的 DELETE 既不成功也不报错,
    // 不进重试队列 → 群永久残留。15s 超时后报错 → 进 pendingGroupDestroys → 30s 清扫重试
    await axios.delete(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/chatgroups/${groupId}`,
      { headers: { 'Authorization': `Bearer ${appToken}` }, timeout: 15_000 }
    );
    console.log(`🗑️ 环信群 ${groupId} 已解散`);
  } catch (err) {
    if (err.response?.status === 404) {
      // 群已不存在（可能此前已解散成功），视为完成，幂等
      console.log(`🗑️ 环信群 ${groupId} 不存在（已解散），跳过`);
      return;
    }
    console.warn(`⚠️ 解散环信群 ${groupId} 失败(将进入重试队列，30s清扫兜底):`,
      err.response?.status, err.response?.data?.error || err.code || err.message);
    pendingGroupDestroys.add(groupId);
  }
}

// ===== 用户注册 =====

/**
 * 用户注册 - 通过REST API在环信创建新用户
 */
app.post('/api/auth/register', async (req, res) => {
  // 用户名统一小写：环信 users 实体创建时强制小写、metadata 却大小写敏感，
  // 若注册时保留输入大小写，metadata 会被劈成大小写两条记录(登录读大写旧值、修改写小写 → 永远"保存后回退")。
  // 新用户一律小写，与环信真实用户名对齐
  const username = String(req.body.username || '').toLowerCase();
  const { nickname, password } = req.body;

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

    // 第2步: 验证用户密码(环信标准方式:grant_type=password 换用户token,密码错误返回 400/401)
    // 修复安全漏洞:此前只 GET /users 查存在性,任意密码都能登录
    console.log(`验证用户密码: ${username}...`);
    try {
      await axios.post(
        `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
        { grant_type: 'password', username, password }
      );
      console.log('✅ 密码验证通过');
    } catch (err) {
      console.warn('❌ 密码验证失败:', err.response?.status, err.response?.data?.error_description || err.message);
      return res.status(401).json({
        error: '密码错误或用户不存在',
        details: err.response?.data
      });
    }

    // 第3步: 获取环信真实用户名——users 实体创建时强制小写、GET 大小写不敏感,
    // 但 metadata 存储/读取是大小写敏感的(曾把 testplayer1 与 Testplayer1 劈成两条记录,
    // 导致换头像/昵称"保存成功但重新登录回退")。此后所有读写一律用真实用户名
    const userRes = await axios.get(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/users/${username}`,
      {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const realUsername = userRes.data?.entities?.[0]?.username || username;
    console.log('✅ 用户验证通过, 真实用户名:', realUsername);

    // 第4步: 获取用户属性（可选的，失败不影响登录）
    let userNickname = realUsername;
    let userAvatar = '🧙';

    try {
      // 从环信获取用户属性（使用metadata API）——用真实用户名读取，避免大小写分裂
      const attrRes = await axios.get(
        `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/metadata/user/${realUsername}`,
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
      userId: realUsername,
      username: realUsername,
      nickname: userNickname,
      avatar: userAvatar,
      appKey: EASEMOB_CONFIG.appKey,
      easemobUser: realUsername,
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
  let { playerName, avatar, boardId, username } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: '玩家名称不能为空' });
  }

  // 环信用户名规范化:群主/成员管理必须用真实小写名(metadata/users 大小写行为不一致)
  if (username) {
    username = await normalizeEasemobUsername(username);
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
  let boardGameConfig = {};
  if (boardId) {
    try {
      const db = getDb();
      const boardUserId = String(req.headers['x-user-id'] || 'default').toLowerCase();
      const boardRes = await db.query(
        'SELECT name, roles, gameConfig, userId FROM boards WHERE id = $1',
        [boardId]
      );
      const boardRow = boardRes.rows[0];
      if (boardRow) {
        // userId 鉴权:板子归属当前用户,防跨用户引用别人的板子
        if (String(boardRow.userId || '').toLowerCase() !== boardUserId) {
          return res.status(403).json({ error: '板子不存在或无权使用' });
        }
        boardName = boardRow.name;
        // 解析 gameConfig(7项游戏规则,老记录为 NULL → 空对象,后续玩法模块用)
        try {
          boardGameConfig = boardRow.gameConfig ? JSON.parse(boardRow.gameConfig) : {};
        } catch (e) {
          boardGameConfig = {};
        }
        const roles = JSON.parse(boardRow.roles);
        if (Array.isArray(roles) && roles.length > 0) {
          // 座位数 = 各角色count之和,且与前端 Config.vue getPlayerCount 保持一致:
          // 含盗贼 -2(盗贼拿两张牌选一张,两张牌不发给玩家),双身份再 ÷2(每人两张身份)
          const totalCards = roles.reduce((sum, role) => sum + (Number(role.count) || 1), 0);
          const hasThief = roles.some(r => r.key === 'thief');
          const baseCount = hasThief ? totalCards - 2 : totalCards;
          const playerCount = boardGameConfig?.cardType === '双身份' ? Math.floor(baseCount / 2) : baseCount;
          if (playerCount > 0) {
            maxPlayers = playerCount;
          }
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
    boardGameConfig, // 板子7项规则(内存,后续游戏玩法模块使用;暂不暴露给前端)
    hostPlayerId: playerId,
    hostEasemobUser: username || playerName, // 环信群主(群主天然在群里,进出不触发成员管理)
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
  let { playerName, avatar, username } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: '玩家名称不能为空' });
  }

  // 环信用户名规范化:群成员管理必须用真实小写名
  if (username) {
    username = await normalizeEasemobUsername(username);
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
      seatNumber: findAvailableSeat(room), // 分配第一个空闲座位(避免与已换座玩家撞号导致看不到自己)
      joined_at: new Date()
    };
    room.players.push(playerId);
    players.set(playerId, player);

    // 把新玩家拉进环信群（异步，失败不阻塞入房）；群主天然在群里，跳过
    if (room.easemobGroupId && player.easemobUser && player.easemobUser !== room.hostEasemobUser) {
      addEasemobGroupMember(room.easemobGroupId, player.easemobUser)
        .then(() => console.log(`✅ 玩家 ${playerName} 已加入环信群 ${room.easemobGroupId}`))
        .catch(err => console.warn(`⚠️ 添加群成员失败:`, err.response?.status, JSON.stringify(err.response?.data) || err.message));
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
 * 发送房间聊天消息
 * 走环信REST发群消息(SDK send在4.24+当前集群下等回执挂死),接收端用SDK onTextMessage收
 */
app.post('/api/rooms/:roomId/message', async (req, res) => {
  const { roomId } = req.params;
  const { playerId, playerName, message, localId } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少消息内容' });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (!room.easemobGroupId) {
    return res.status(400).json({ error: '环信群不可用' });
  }

  // 按 playerId 定位发送人(防同名玩家消息冒名);旧客户端无 playerId 时按昵称兜底
  const player = room.players
    .map(pid => players.get(pid))
    .find(p => p && (playerId ? p.playerId === playerId : p.name === playerName));
  if (!player) {
    return res.status(403).json({ error: '玩家不在房间中' });
  }

  try {
    const appToken = await getAppToken();
    await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/messages`,
      {
        target_type: 'chatgroups',
        target: [room.easemobGroupId],
        msg: { type: 'txt', msg: message },
        from: player.easemobUser,
        // ext 透传发送人身份与本地消息ID:接收端 onTextMessage 用 ext.localId 认领乐观消息去重
        ext: { playerId: player.playerId, playerName: player.name, localId: localId || '' }
      },
      {
        headers: { 'Authorization': `Bearer ${appToken}`, 'Content-Type': 'application/json' },
        timeout: 15_000
      }
    );
    console.log(`📤 REST群消息发送成功: ${player.name}: ${message}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('❌ REST发送群消息失败:', error.response?.status, error.response?.data?.error_description || error.message);
    res.status(500).json({ error: '消息发送失败' });
  }
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
  let { username } = req.params;
  const { nickname, avatar } = req.body;

  try {
    // 真实用户名规范化:前端可能传历史 localStorage 存的大写 username
    // (users GET 大小写不敏感、metadata 敏感——不规范化会读写到分裂的错误记录)
    username = await normalizeEasemobUsername(username);

    // 获取App Token
    const appTokenRes = await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
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
    // 409 = 乐观锁并发冲突（metadata文档：并发修改同一用户只有一个成功），等300ms重试一次全量写入
    let updateRes;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const attrData = qs.stringify(updateData);
        updateRes = await axios.put(
          `http://ngi-a1.easemob.com/1196260703193552/langrensha/metadata/user/${username}`,
          attrData,
          {
            headers: {
              'Authorization': `Bearer ${appToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        break; // 写入成功
      } catch (err) {
        const is409 = err.response?.status === 409;
        console.error(`❌ 更新属性失败(第${attempt}次):`, err.response?.status, err.response?.data?.desc || err.response?.data);
        if (!is409 || attempt === 2) throw err;
        console.warn('↻ 409 并发冲突，300ms后重试...');
        await new Promise(r => setTimeout(r, 300));
      }
    }
    console.log(`✅ 用户属性已更新到环信:`, JSON.stringify(updateRes.data));

    // 头像已同步 → 更新内存中该玩家的头像并广播给所在房间（同房间玩家即时看到新头像）
    if (avatar !== undefined) {
      const lowerUsername = username.toLowerCase();
      for (const [pid, p] of players.entries()) {
        if ((p.easemobUser || '').toLowerCase() !== lowerUsername && (p.name || '').toLowerCase() !== lowerUsername) continue;
        const changed = p.avatar !== avatar;
        p.avatar = avatar;
        if (changed && p.roomId && rooms.has(p.roomId)) {
          io.to(p.roomId).emit('playerAvatarUpdated', { playerId: pid, avatar });
          console.log(`🖼️ 头像更新已广播给房间 ${p.roomId}: ${p.name} -> ${avatar}`);
        }
      }
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
  let { playerId, playerName, username } = req.body;

  if (!username) {
    return res.status(400).json({ error: '缺少Easemob用户名' });
  }

  try {
    // 真实用户名规范化:兼容历史 localStorage 里存的大写 easemobUser
    username = await normalizeEasemobUsername(username);
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

    // 第2步: 获取用户Token（环信REST: POST /token + grant_type=inherit，App Token签发，免密）
    // 文档: https://docs-im.easemob.com/ccim/rest/usertoken
    const userTokenRes = await axios.post(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/token`,
      {
        grant_type: 'inherit',
        username,
        autoCreateUser: false,
        ttl: 7 * 24 * 3600
      },
      {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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

// 音视频 token 代理:浏览器直连环信 REST 会命中 CORS 限制,
// 统一走后端用 App Token 代理同一端点(getRTCToken 的服务端等价)
app.post('/api/easemob/rtc-token', async (req, res) => {
  let { username, channelName } = req.body;
  if (!username || !channelName) {
    return res.status(400).json({ error: '缺少参数' });
  }
  try {
    username = await normalizeEasemobUsername(username);
    const appToken = await getAppToken();
    const r = await axios.get(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/users/${username}/token/rtc?channelName=${encodeURIComponent(channelName)}`,
      { headers: { 'Authorization': `Bearer ${appToken}` } }
    );
    res.json({
      appId: r.data.app_id,
      token: r.data.rtc_token,
      uid: r.data.rtcUid,
      channel: r.data.channel_name,
      expiresIn: r.data.expires_in
    });
  } catch (err) {
    console.error('❌ 获取音视频 token 失败:', err.response?.status, err.response?.data?.error_description || err.message);
    res.status(500).json({ error: '获取语音凭证失败', details: err.response?.data });
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
        seatNumber: p.seatNumber || 1,
        easemobUser: p.easemobUser // 前端用于把环信用户名映射回昵称显示
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.seatNumber || 1) - (b.seatNumber || 1));
}

/**
 * 分配房间内第一个空闲座位（跳过已被占用的座位号，避免新玩家与已换座玩家撞号）
 */
function findAvailableSeat(room) {
  const occupied = new Set();
  for (const pid of room.players) {
    const p = players.get(pid);
    if (p?.seatNumber) occupied.add(p.seatNumber);
  }
  for (let seat = 1; seat <= room.maxPlayers; seat++) {
    if (!occupied.has(seat)) return seat;
  }
  return room.players.length + 1; // 兜底（座位全满时不应走到这里）
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
  } else if (playerId === room.hostPlayerId) {
    // 房主离开但房间还有人：自动转让房主给座位号最小的玩家（离1号位最近）
    const sorted = buildPlayerList(room);
    const newHost = sorted[0];
    room.hostPlayerId = newHost.playerId;
    io.to(roomId).emit('hostChanged', {
      hostPlayerId: newHost.playerId,
      hostName: newHost.name
    });
    console.log(`👑 房主 ${playerName} 已离开，房主自动转移给 ${newHost.name}（座位${newHost.seatNumber}）`);
  }

  // 房间还有其他人，把离开的玩家移出环信群（群主不移除——环信禁止移除群主，群主身份保留到群解散；
  // 房间已空时群已在上面解散，不要再对已删群做成员移除，避免404噪音）
  if (room.players.length > 0 && player?.easemobUser && room.easemobGroupId && player.easemobUser !== room.hostEasemobUser) {
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

// 定时清扫（30s）：清理 rooms/players 中的数据不一致（防御，正常情况下不该触发），
// 并兜底重试解散失败的环信群
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    room.players = room.players.filter(pid => players.has(pid));
    if (room.players.length === 0) {
      // 空房/孤儿房都清掉（不留 before>0 死角：已是空房的房间永远等不到清扫）
      rooms.delete(roomId);
      console.log(`🧹 清扫：孤儿房间 ${roomId} 已删除`);
      // 关键：删房必须同步解散环信群，否则群会在环信后台永久残留
      destroyEasemobGroup(room.easemobGroupId);
    }
  }
  // 重试解散失败的环信群（网络抖动/App Token刷新失败等补偿）
  if (pendingGroupDestroys.size > 0) {
    const retrying = [...pendingGroupDestroys];
    pendingGroupDestroys.clear();
    retrying.forEach(id => destroyEasemobGroup(id));
  }
}, 30_000);

// 快照清扫是否启用:生产(pm2环境)默认开,本地dev默认关,EASEMOB_STARTUP_SWEEP=0 强制关
const snapshotSweepEnabled = process.env.EASEMOB_STARTUP_SWEEP !== '0'
  && (process.env.PM2_HOME || process.env.NODE_APP_INSTANCE !== undefined);

// 周期快照清扫(5min,仅生产):直接对比环信后台群快照与当前 live 房间,
// 凡 room_xxxxxx 前缀且不在 live 里的群一律解散 —— 兜住删群挂起/groupid解析失败/进程重启等一切漏删路径。
// 不依赖任何删群路径是否成功;删除失败仍进 pendingGroupDestroys 由 30s 清扫重试
if (snapshotSweepEnabled) {
  setInterval(async () => {
    let groups;
    try {
      groups = await snapshotEasemobGroups();
    } catch (err) {
      console.warn('⚠️ 周期清扫:获取环信群列表失败(5分钟后再试):', err.message);
      return;
    }
    const liveGroupIds = new Set([...rooms.values()].map(r => r.easemobGroupId).filter(Boolean));
    const orphans = groups.filter(g => {
      if (!/^room_\d{6}$/.test(g.groupname || '')) return false;
      if (liveGroupIds.has(g.groupid)) return false;
      // 跳过刚创建的群:建群→房间入map有瞬态窗口(2分钟内),5分钟粒度下窗口极小
      if (g.created) {
        const createdMs = typeof g.created === 'number' && g.created < 1e12 ? g.created * 1000 : g.created;
        if (Date.now() - new Date(createdMs).getTime() < 2 * 60_000) return false;
      }
      return true;
    });
    if (!orphans.length) return;
    console.log(`🧹 周期清扫:发现 ${orphans.length} 个无主环信群,开始解散...`);
    orphans.forEach(g => destroyEasemobGroup(g.groupid));
  }, 5 * 60_000);
}

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
    const { roomId, message, localId } = data;
    const socketInfo = socketToPlayer.get(socket.id);

    if (!socketInfo || socketInfo.roomId !== roomId) {
      console.warn('❌ 消息来自非房间玩家');
      return;
    }

    console.log(`💬 房间 ${roomId} - ${socketInfo.playerName}: ${message}`);

    // 广播消息到房间内所有人(昵称用入房时鉴权记录的,不信客户端自报;带localId供接收端认领去重)
    io.to(roomId).emit('receiveMessage', {
      playerName: socketInfo.playerName,
      message,
      localId: localId || '',
      timestamp: new Date(),
      type: 'player'
    });
  });

  // 语音状态广播(uid映射/静音/进出语音频道)——鉴权与 sendMessage 相同
  socket.on('voiceState', (data) => {
    const { roomId, type, playerId, rtcUid, muted } = data;
    const socketInfo = socketToPlayer.get(socket.id);

    if (!socketInfo || socketInfo.roomId !== roomId) {
      console.warn('❌ 语音状态来自非房间玩家');
      return;
    }

    io.to(roomId).emit('voiceState', {
      type, // voice_joined | voice_left | voice_muted | voice_unmuted
      playerId,
      playerName: socketInfo.playerName,
      rtcUid,
      muted,
      timestamp: new Date()
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
    // userId 统一小写 + LOWER 兜底存量记录(旧版本存过大小写混合的 userId,PG 的 TEXT 比较大小写敏感)
    const userId = String(req.headers['x-user-id'] || 'default').toLowerCase();

    const result = await db.query(
      'SELECT * FROM boards WHERE LOWER(userId) = $1 ORDER BY isFavorite DESC, createdAt DESC',
      [userId]
    );

    res.json(result.rows || []);
  } catch (err) {
    console.error('获取板子列表失败:', err);
    res.status(500).json({ error: '获取板子列表失败' });
  }
});

// 创建板子(返回自增 id 供前端后续按 id 更新/删除;同名冲突走 upsert 兼容老前端)
app.post('/api/boards', async (req, res) => {
  try {
    const db = getDb();
    const userId = String(req.headers['x-user-id'] || 'default').toLowerCase();
    const { name, roles, summary, isFavorite, gameConfig } = req.body;

    if (!name || !roles) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    // 迁移:先把该用户存量大小写不一致的板子记录统一为小写 userId
    // (否则 LOWER 匹配会读到旧记录,同时小写 INSERT 又会新建一条 → 同名板子重复)
    await db.query(
      'UPDATE boards SET userId = $1 WHERE LOWER(userId) = $1',
      [userId]
    );

    const result = await db.query(
      `INSERT INTO boards (userId, name, roles, summary, isFavorite, gameConfig)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(userId, name) DO UPDATE SET
       roles = $3, summary = $4, isFavorite = $5, gameConfig = $6, updatedAt = CURRENT_TIMESTAMP
       RETURNING id, name`,
      [userId, name, JSON.stringify(roles), summary, isFavorite, gameConfig ? JSON.stringify(gameConfig) : null]
    );

    res.json({ message: '板子保存成功', id: result.rows[0]?.id, name: result.rows[0]?.name });
  } catch (err) {
    console.error('保存板子失败:', err);
    res.status(500).json({ error: '保存板子失败' });
  }
});

// 更新板子(按 id,userId 鉴权;改名原地生效,不再先删后插)
app.put('/api/boards/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = String(req.headers['x-user-id'] || 'default').toLowerCase();
    const boardId = Number(req.params.id);
    const { name, roles, summary, isFavorite, gameConfig } = req.body;

    if (!boardId || !name || !roles) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    const result = await db.query(
      `UPDATE boards SET
       name = $1, roles = $2, summary = $3, isFavorite = $4, gameConfig = $5, updatedAt = CURRENT_TIMESTAMP
       WHERE id = $6 AND LOWER(userId) = $7`,
      [name, JSON.stringify(roles), summary, isFavorite, gameConfig ? JSON.stringify(gameConfig) : null, boardId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '板子不存在' });
    }

    res.json({ message: '板子更新成功' });
  } catch (err) {
    // 改名撞 UNIQUE(userId,name) → 409
    if (err.code === '23505') {
      return res.status(409).json({ error: '已存在同名板子，请换一个名字' });
    }
    console.error('更新板子失败:', err);
    res.status(500).json({ error: '更新板子失败' });
  }
});

// 删除板子(按 id,userId 鉴权)
app.delete('/api/boards/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = String(req.headers['x-user-id'] || 'default').toLowerCase();
    const boardId = Number(req.params.id);

    const result = await db.query(
      'DELETE FROM boards WHERE id = $1 AND LOWER(userId) = $2',
      [boardId, userId]
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

/**
 * 启动清扫（修复重启泄漏）：房间数据全在内存，进程重启后所有房间消失，
 * 但环信群是持久化的——若不清扫，每次重启（deploy.sh / pm2 restart）都会在环信后台残留一批孤儿群。
 * 本应用创建的群名统一为 room_{6位房间号}，只解散这种前缀的群，避免误删共用appkey的其他群。
 * 仅在生产实例（pm2 环境）执行；本地 npm run dev 不触发（否则本地启动会误删线上群）。
 * 逃生开关：EASEMOB_STARTUP_SWEEP=0 可禁用。
 */
async function snapshotEasemobGroups() {
  const appToken = await getAppToken();
  const groups = [];
  let cursor = '';
  do {
    const params = cursor ? { limit: 100, cursor } : { limit: 100 };
    const res = await axios.get(
      `http://ngi-a1.easemob.com/${EASEMOB_CONFIG.orgName}/${EASEMOB_CONFIG.appName}/chatgroups`,
      { headers: { 'Authorization': `Bearer ${appToken}` }, params, timeout: 15_000 }
    );
    groups.push(...(res.data?.data || []));
    cursor = res.data?.cursor || '';
  } while (cursor && groups.length < 10000); // 防御上限，正常场景群数量远小于此
  return groups;
}

function sweepOrphanEasemobGroups(groups) {
  // 群列表接口返回 groupname 字段；只解散本应用创建的房间群
  const orphans = groups.filter(g => /^room_\d{6}$/.test(g.groupname || ''));
  if (!orphans.length) {
    console.log('🧹 启动清扫：无遗留环信群');
    return;
  }
  console.log(`🧹 启动清扫：发现 ${orphans.length} 个遗留环信群（共${groups.length}个），开始解散...`);
  orphans.forEach(g => destroyEasemobGroup(g.groupid));
}

async function bootstrap() {
  let orphanSnapshot = [];
  if (snapshotSweepEnabled) {
    try {
      // 先取群快照再监听：快照之后的房间是"活着"的新群，不能被启动清扫误删
      orphanSnapshot = await snapshotEasemobGroups();
    } catch (err) {
      console.warn('⚠️ 启动清扫：获取环信群列表失败，跳过（下次重启会重试）:', err.message);
    }
  }

  httpServer.listen(PORT, () => {
    console.log(`🎮 Werewolf Game Server running on http://localhost:${PORT}`);
    console.log(`📱 API ready for frontend connection`);
    console.log(`🔌 WebSocket ready for real-time communication`);
  });

  // 监听后异步解散遗留群（失败自动进重试队列，不阻塞启动）
  if (orphanSnapshot.length > 0) {
    sweepOrphanEasemobGroups(orphanSnapshot);
  }
}

const PORT = process.env.PORT || 3000;
bootstrap();
