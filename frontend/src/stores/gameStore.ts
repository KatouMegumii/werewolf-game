import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api/client'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import * as EasemobService from '../api/easemob'
import router from '../router'

export const useGameStore = defineStore('game', () => {
  // 用户信息
  const userId = ref<string>(localStorage.getItem('userId') || '')
  const username = ref<string>(localStorage.getItem('username') || '')
  const nickname = ref<string>(localStorage.getItem('nickname') || '')
  const avatar = ref<string>(localStorage.getItem('avatar') || '🧙')
  const easemobUser = ref<string>(localStorage.getItem('easemobUser') || '')
  const appKey = ref<string>(localStorage.getItem('appKey') || '')
  // 环信用户Token：只存内存 + sessionStorage（刷新免重输密码，关浏览器即失效），密码永不落盘
  const easemobAccessToken = ref<string>(sessionStorage.getItem('easemobAccessToken') || '')

  // Socket.io
  let socket: Socket | null = null

  // 房间信息
  const roomId = ref<string>('')
  const chatGroupId = ref<string>('')
  const currentRoom = ref<any>(null)
  const rooms = ref<any[]>([])
  const playerList = ref<any[]>([])
  const messages = ref<any[]>([])

  // Easemob状态
  const isEasemobConnected = ref(false)
  const easemobGroupId = ref<string>('')

  // 游戏信息
  const playerId = ref<string>('')
  const playerName = ref<string>('')

  const isLoggedIn = computed(() => !!userId.value && !!username.value)
  const isInRoom = computed(() => !!roomId.value)
  // 当前玩家是否为房主（基于后端 hostPlayerId，不再依赖座位号）
  const isHost = computed(() => !!currentRoom.value?.hostPlayerId && currentRoom.value.hostPlayerId === playerId.value)

  // 设置当前用户（密码不再进入前端存储；环信凭证由后端签发token）
  function setCurrentUser(user: any) {
    userId.value = user.userId
    username.value = user.username
    nickname.value = user.nickname
    avatar.value = user.avatar || '🧙'
    easemobUser.value = user.easemobUser || user.username
    appKey.value = user.appKey

    // 登录响应若带回token则直接使用（进入房间时也会经 /api/easemob/token 重新签发）
    if (user.accessToken) {
      easemobAccessToken.value = user.accessToken
      sessionStorage.setItem('easemobAccessToken', user.accessToken)
    }

    localStorage.setItem('userId', user.userId)
    localStorage.setItem('username', user.username)
    localStorage.setItem('nickname', user.nickname)
    localStorage.setItem('avatar', user.avatar || '🧙')
    localStorage.setItem('easemobUser', user.easemobUser || user.username)
    localStorage.setItem('appKey', user.appKey)
    // 迁移：清理历史遗留的明文密码
    localStorage.removeItem('easemobPassword')
  }

  // 登出
  function logout() {
    userId.value = ''
    username.value = ''
    nickname.value = ''
    avatar.value = '🧙'
    easemobUser.value = ''
    appKey.value = ''
    easemobAccessToken.value = ''
    sessionStorage.removeItem('easemobAccessToken')
    localStorage.removeItem('userId')
    localStorage.removeItem('username')
    localStorage.removeItem('nickname')
    localStorage.removeItem('avatar')
    localStorage.removeItem('easemobUser')
    localStorage.removeItem('easemobPassword')
    localStorage.removeItem('appKey')
    leaveRoom()
    // 断开Easemob连接
    disconnectEasemob()
  }

  // 初始化并连接Easemob
  async function connectEasemob() {
    if (isEasemobConnected.value) {
      console.log('✅ Easemob already connected')
      return
    }

    if (!easemobUser.value || !appKey.value) {
      console.error('❌ Missing Easemob credentials')
      throw new Error('Missing Easemob credentials')
    }

    try {
      // 初始化SDK
      EasemobService.initEasemobSDK(appKey.value)

      // 无可用token时先向服务端签发（免密）
      if (!easemobAccessToken.value) {
        await getEasemobToken()
      }

      // 用token登录（不再使用密码）
      await EasemobService.loginEasemob(easemobUser.value, easemobAccessToken.value)

      isEasemobConnected.value = true
      console.log('✅ Easemob connected and logged in')
    } catch (error) {
      console.error('❌ Failed to connect Easemob:', error)
      isEasemobConnected.value = false
      throw error
    }
  }

  // 断开Easemob连接（leaveGroup失败不阻断logout，避免SDK半死状态/重复登录208）
  async function disconnectEasemob() {
    try {
      if (easemobGroupId.value) {
        await EasemobService.leaveGroup(easemobGroupId.value).catch(err => {
          console.warn('⚠️ 离开群组失败(忽略):', err?.message)
        })
      }
      await EasemobService.logoutEasemob()
      isEasemobConnected.value = false
      easemobGroupId.value = ''
      console.log('✅ Easemob disconnected')
    } catch (error) {
      console.warn('⚠️ Error disconnecting Easemob:', error?.message || error)
      isEasemobConnected.value = false
      easemobGroupId.value = ''
    }
  }

  // 加入Easemob群组（groupId为服务端REST创建群后返回的真实群ID）
  async function joinEasemobGroup(groupId: string) {
    if (!isEasemobConnected.value) {
      console.error('❌ Easemob not connected')
      return
    }
    if (!groupId) {
      console.warn('⚠️ 无可用群ID，跳过加入环信群（群聊不可用，不影响游戏）')
      return
    }

    try {
      // 服务端REST已把玩家添加为群成员，SDK登录后自动同步群列表，
      // 不调用joinGroup（已是成员时join会403，且可能卡住后续send发送队列）
      easemobGroupId.value = groupId
      console.log('✅ Easemob group ready:', groupId)

      // 监听群组消息（自己发的消息已乐观显示，收到回推时跳过避免重复）
      EasemobService.onGroupMessage((message: any) => {
        if (message.from === easemobUser.value) return
        messages.value.push({
          type: 'easemob',
          from: message.from,
          text: message.msg || message.content,
          timestamp: message.time || new Date()
        })
      })
    } catch (error) {
      console.error('❌ Failed to prepare Easemob group:', error)
      throw error
    }
  }

  // 通过Easemob发送群组消息
  async function sendEasemobMessage(content: string) {
    if (!isEasemobConnected.value || !easemobGroupId.value) {
      console.error('❌ Easemob not connected to group')
      return
    }

    try {
      await EasemobService.sendGroupMessage(easemobGroupId.value, content, {
        playerName: playerName.value,
        playerId: playerId.value
      })
    } catch (error) {
      console.error('❌ Failed to send Easemob message:', error)
      throw error
    }
  }
  async function createRoom(name: string) {
    try {
      const res = await api.post('/api/rooms', {
        playerName: name,
        avatar: avatar.value,
        username: easemobUser.value
      })
      playerId.value = res.data.playerId
      playerName.value = name
      roomId.value = res.data.roomId
      chatGroupId.value = res.data.chatGroupId

      // 获取环信token
      await getEasemobToken()

      // 连接Easemob并加入群组（groupId为后端创建的真实群ID）
      try {
        await connectEasemob()
        await joinEasemobGroup(chatGroupId.value)
      } catch (error) {
        console.warn('⚠️ Easemob connection optional, continuing with Socket.io only')
      }

      await fetchRoomInfo()

      return res.data
    } catch (error) {
      console.error('创建房间失败:', error)
      throw error
    }
  }

  // 加入房间
  async function joinRoom(rid: string, name: string) {
    try {
      const res = await api.post(`/api/rooms/${rid}/join`, {
        playerName: name,
        avatar: avatar.value,
        username: easemobUser.value
      })
      playerId.value = res.data.playerId
      playerName.value = name
      roomId.value = rid
      chatGroupId.value = res.data.chatGroupId

      // 获取环信token
      await getEasemobToken()

      // 连接Easemob并加入群组（groupId为后端创建的真实群ID）
      try {
        await connectEasemob()
        await joinEasemobGroup(chatGroupId.value)
      } catch (error) {
        console.warn('⚠️ Easemob connection optional, continuing with Socket.io only')
      }

      await fetchRoomInfo()

      return res.data
    } catch (error) {
      console.error('加入房间失败:', error)
      throw error
    }
  }

  // 获取房间信息
  async function fetchRoomInfo() {
    if (!roomId.value) return
    try {
      const res = await api.get(`/api/rooms/${roomId.value}`)
      currentRoom.value = res.data
    } catch (error) {
      console.error('获取房间信息失败:', error)
    }
  }

  // 获取所有房间
  async function fetchRooms() {
    try {
      const res = await api.get('/api/rooms')
      rooms.value = res.data
    } catch (error) {
      console.error('获取房间列表失败:', error)
    }
  }

  // 获取环信用户Token（服务端用App Token签发，免密，密码不出前端）
  async function getEasemobToken() {
    try {
      const res = await api.post('/api/easemob/token', {
        playerId: playerId.value,
        playerName: playerName.value,
        username: easemobUser.value
      })
      easemobAccessToken.value = res.data.accessToken
      appKey.value = res.data.appKey
      // 会话级缓存：刷新免重输密码，关浏览器即失效
      sessionStorage.setItem('easemobAccessToken', easemobAccessToken.value)
      console.log('✅ Easemob user token obtained')
      return res.data
    } catch (error) {
      console.error('获取环信token失败:', error)
      throw error
    }
  }

  // 离开房间
  function leaveRoom() {
    const oldSocket = socket
    // 立即释放socket引用：退出后马上重进时，initSocket会新建连接，
    // 避免joinRoom发到即将断开的旧socket上（否则joinRoomSuccess丢失，看不到自己）
    socket = null

    // 发送离开事件（连接open时emit会立即走wire；旧连接延迟断开保证包发出）
    if (oldSocket && roomId.value && playerId.value) {
      console.log(`📤 正在离开房间 ${roomId.value}...`);
      oldSocket.emit('leaveRoom', {
        roomId: roomId.value,
        playerId: playerId.value,
        playerName: playerName.value
      })
    }

    // 延迟500ms断开旧socket（leaveRoom包留出发送时间；后端还有30s断线缓冲兜底）
    if (oldSocket) {
      setTimeout(() => {
        oldSocket.disconnect()
        console.log('✅ Socket已断开')
      }, 500)
    }

    // 异步断开Easemob（不阻塞）
    if (isEasemobConnected.value) {
      disconnectEasemob().catch(err => {
        console.warn('⚠️ Easemob disconnect warning:', err)
      })
    }

    // ✅ 只清理房间数据，保留用户数据（这样Lobby能正常显示）；easemobAccessToken是用户级凭证，保留
    playerId.value = ''
    playerName.value = ''
    roomId.value = ''
    chatGroupId.value = ''
    currentRoom.value = null
    playerList.value = []
    messages.value = []
    isEasemobConnected.value = false
    easemobGroupId.value = ''

    console.log('✅ 房间数据已清理')
  }

  // 初始化 Socket.io 连接
  function initSocket() {
    if (socket) {
      console.log('⚠️ Socket已存在，跳过初始化');
      return
    }

    console.log('🔌 正在初始化Socket...');
    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    })

    // Socket 连接成功
    socket.on('connect', () => {
      console.log('✅ Socket 已连接:', socket?.id)
    })

    // 玩家加入房间成功
    socket.on('joinRoomSuccess', (data: any) => {
      console.log('✅ 成功加入房间:', data)
      console.log('玩家列表:', data.playerList)
      playerList.value = data.playerList
      currentRoom.value = {
        ...currentRoom.value,
        roomId: data.roomId,
        playerCount: data.totalPlayers,
        maxPlayers: data.maxPlayers,
        hostPlayerId: data.hostPlayerId
      }
      console.log('✅ playerList已更新:', playerList.value.map((p: any) => p.name).join(', '))
    })

    // 其他玩家加入
    socket.on('playerJoined', (data: any) => {
      console.log('👤 新玩家加入:', data.playerName)
      console.log('更新后的玩家列表:', data.playerList)
      playerList.value = data.playerList
      messages.value.push({
        type: 'system',
        text: `${data.playerName} 加入了房间`
      })
      console.log('✅ playerList已更新:', playerList.value.map((p: any) => p.name).join(', '))
    })

    // 玩家离开
    socket.on('playerLeft', (data: any) => {
      console.log('👋 玩家离开:', data.playerName)
      console.log('更新后的玩家列表:', data.playerList)
      playerList.value = data.playerList
      messages.value.push({
        type: 'system',
        text: `${data.playerName} 离开了房间`
      })
      console.log('✅ playerList已更新:', playerList.value.map((p: any) => p.name).join(', '))
    })

    // 座位交换
    socket.on('seatSwapped', (data: any) => {
      playerList.value = data.playerList
      messages.value.push({
        type: 'system',
        text: `${data.playerName} 移至座位 ${data.toSeat}`
      })
    })

    // 座位交换失败
    socket.on('swapSeatFailed', (data: any) => {
      console.warn('❌ 座位交换失败:', data.reason)
      messages.value.push({
        type: 'system',
        text: `座位交换失败: ${data.reason}`
      })
    })

    // 接收消息
    socket.on('receiveMessage', (data: any) => {
      console.log('💬 接收消息:', data)
      messages.value.push({
        type: data.type || 'player',
        from: data.playerName,
        text: data.message,
        timestamp: data.timestamp
      })
    })

    // Socket 连接断开
    socket.on('disconnect', () => {
      console.log('❌ Socket 连接已断开')
    })

    // Socket 错误
    socket.on('error', (error: any) => {
      console.error('Socket 错误:', error)
    })

    // 加入房间被拒绝（不在房间玩家列表中，如跳过HTTP入房直接进入）
    socket.on('joinRoomFailed', (data: any) => {
      console.warn('❌ 加入房间被拒绝:', data.reason)
      messages.value.push({
        type: 'system',
        text: data.reason || '加入房间失败'
      })
      router.push('/lobby')
    })

    // 房主变更（转让）
    socket.on('hostChanged', (data: any) => {
      console.log('👑 房主变更为:', data.hostName)
      if (currentRoom.value) {
        currentRoom.value.hostPlayerId = data.hostPlayerId
      }
      messages.value.push({
        type: 'system',
        text: `👑 房主已转让给 ${data.hostName}`
      })
    })

    // 被房主移出房间
    socket.on('playerKicked', (data: any) => {
      console.warn('🚫 被移出房间:', data.reason)
      alert(data.reason || '你已被移出房间')
      leaveRoom()
      router.push('/lobby')
    })

    // 房间被房主解散
    socket.on('roomDissolved', (data: any) => {
      console.warn('💥 房间已解散:', data.reason)
      alert(data.reason || '房间已解散')
      leaveRoom()
      router.push('/lobby')
    })

    // 房间设置更新
    socket.on('roomSettingsUpdated', (data: any) => {
      console.log('⚙️ 房间设置更新:', data.settings)
      if (currentRoom.value) {
        currentRoom.value.settings = data.settings
      }
    })
  }

  // 加入房间（通过 Socket）
  function joinRoomSocket(rid: string) {
    if (!socket) {
      initSocket()
    }
    socket?.emit('joinRoom', {
      roomId: rid,
      playerId: playerId.value,
      playerName: playerName.value
    })
  }

  // 发送聊天消息
  // 发送聊天消息：环信群聊为主，未连接环信时降级到Socket（不丢消息）
  function sendMessage(message: string) {
    // 乐观显示自己的消息（环信SDK不回推发送者自己的消息，需本地显示）
    messages.value.push({
      type: 'player',
      from: playerName.value,
      text: message,
      timestamp: new Date()
    })

    if (isEasemobConnected.value && easemobGroupId.value) {
      sendEasemobMessage(message).catch((err) => {
        console.warn('⚠️ 环信发送失败，降级Socket:', err)
        sendSocketMessage(message)
      })
    } else {
      sendSocketMessage(message)
    }
  }

  // 通过Socket发送（游戏状态/降级通道）
  function sendSocketMessage(message: string) {
    if (!socket || !roomId.value) return
    socket.emit('sendMessage', {
      roomId: roomId.value,
      playerName: playerName.value,
      message
    })
  }

  // 发送系统消息
  function sendSystemMessage(message: string) {
    if (!socket || !roomId.value) return
    socket.emit('sendSystemMessage', {
      roomId: roomId.value,
      message
    })
  }

  // 交换座位
  function swapSeat(fromSeat: number, toSeat: number) {
    if (!socket || !roomId.value) return
    socket.emit('swapSeat', {
      roomId: roomId.value,
      playerId: playerId.value,
      playerName: playerName.value,
      fromSeat,
      toSeat
    })
  }

  // ===== 房主操作（仅房主可调，后端校验）=====

  // 踢人
  async function kickPlayer(targetPlayerId: string) {
    if (!roomId.value || !playerId.value) return
    const res = await api.post(`/api/rooms/${roomId.value}/kick`, {
      playerId: playerId.value,
      targetPlayerId
    })
    return res.data
  }

  // 转让房主
  async function transferHost(targetPlayerId: string) {
    if (!roomId.value || !playerId.value) return
    const res = await api.post(`/api/rooms/${roomId.value}/transfer`, {
      playerId: playerId.value,
      targetPlayerId
    })
    return res.data
  }

  // 解散房间
  async function dissolveRoom() {
    if (!roomId.value || !playerId.value) return
    const res = await api.post(`/api/rooms/${roomId.value}/dissolve`, {
      playerId: playerId.value
    })
    return res.data
  }

  return {
    // 用户信息
    userId,
    username,
    nickname,
    avatar,
    easemobUser,
    easemobAccessToken,
    appKey,
    isLoggedIn,
    isHost,

    // 房间信息
    roomId,
    chatGroupId,
    currentRoom,
    rooms,
    isInRoom,
    playerList,
    messages,

    // Easemob状态
    isEasemobConnected,
    easemobGroupId,

    // 游戏信息
    playerId,
    playerName,

    // 用户管理
    setCurrentUser,
    logout,

    // 房间管理
    createRoom,
    joinRoom,
    fetchRoomInfo,
    fetchRooms,
    getEasemobToken,
    leaveRoom,

    // Easemob管理
    connectEasemob,
    disconnectEasemob,
    joinEasemobGroup,
    sendEasemobMessage,

    // Socket.io
    initSocket,
    joinRoomSocket,
    sendMessage,
    sendSystemMessage,
    swapSeat,

    // 房主操作
    kickPlayer,
    transferHost,
    dissolveRoom
  }
})
