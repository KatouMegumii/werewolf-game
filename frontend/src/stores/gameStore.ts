import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api/client'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import * as EasemobService from '../api/easemob'

export const useGameStore = defineStore('game', () => {
  // 用户信息
  const userId = ref<string>(localStorage.getItem('userId') || '')
  const username = ref<string>(localStorage.getItem('username') || '')
  const nickname = ref<string>(localStorage.getItem('nickname') || '')
  const avatar = ref<string>(localStorage.getItem('avatar') || '🧙')
  const easemobUser = ref<string>(localStorage.getItem('easemobUser') || '')
  const easemobPassword = ref<string>(localStorage.getItem('easemobPassword') || '')
  const appKey = ref<string>(localStorage.getItem('appKey') || '')

  // Socket.io
  let socket: Socket | null = null

  // 房间信息
  const roomId = ref<string>('')
  const chatGroupId = ref<string>('')
  const currentRoom = ref<any>(null)
  const rooms = ref<any[]>([])
  const easemobToken = ref<any>(null)
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

  // 设置当前用户
  function setCurrentUser(user: any) {
    userId.value = user.userId
    username.value = user.username
    nickname.value = user.nickname
    avatar.value = user.avatar || '🧙'
    easemobUser.value = user.easemobUser
    easemobPassword.value = user.easemobPassword
    appKey.value = user.appKey

    localStorage.setItem('userId', user.userId)
    localStorage.setItem('username', user.username)
    localStorage.setItem('nickname', user.nickname)
    localStorage.setItem('avatar', user.avatar || '🧙')
    localStorage.setItem('easemobUser', user.easemobUser)
    localStorage.setItem('easemobPassword', user.easemobPassword)
    localStorage.setItem('appKey', user.appKey)
  }

  // 登出
  function logout() {
    userId.value = ''
    username.value = ''
    nickname.value = ''
    avatar.value = '🧙'
    easemobUser.value = ''
    easemobPassword.value = ''
    appKey.value = ''
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

    if (!easemobUser.value || !easemobPassword.value || !appKey.value) {
      console.error('❌ Missing Easemob credentials')
      throw new Error('Missing Easemob credentials')
    }

    try {
      // 初始化SDK
      EasemobService.initEasemobSDK(appKey.value)

      // 登录
      await EasemobService.loginEasemob(easemobUser.value, easemobPassword.value)

      isEasemobConnected.value = true
      console.log('✅ Easemob connected and logged in')
    } catch (error) {
      console.error('❌ Failed to connect Easemob:', error)
      isEasemobConnected.value = false
      throw error
    }
  }

  // 断开Easemob连接
  async function disconnectEasemob() {
    try {
      if (easemobGroupId.value) {
        await EasemobService.leaveGroup(easemobGroupId.value)
      }
      await EasemobService.logoutEasemob()
      isEasemobConnected.value = false
      easemobGroupId.value = ''
      console.log('✅ Easemob disconnected')
    } catch (error) {
      console.error('⚠️ Error disconnecting Easemob:', error)
    }
  }

  // 加入Easemob群组
  async function joinEasemobGroup(groupName: string) {
    if (!isEasemobConnected.value) {
      console.error('❌ Easemob not connected')
      return
    }

    try {
      const groupResult = await EasemobService.createOrJoinGroup(groupName, `Werewolf game room: ${roomId.value}`)
      easemobGroupId.value = groupResult.groupId || groupResult.id
      console.log('✅ Joined Easemob group:', easemobGroupId.value)

      // 监听群组消息
      EasemobService.onGroupMessage((message: any) => {
        messages.value.push({
          type: 'easemob',
          from: message.from,
          text: message.msg || message.content,
          timestamp: message.time || new Date()
        })
      })
    } catch (error) {
      console.error('❌ Failed to join Easemob group:', error)
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
        avatar: avatar.value
      })
      playerId.value = res.data.playerId
      playerName.value = name
      roomId.value = res.data.roomId
      chatGroupId.value = res.data.chatGroupId

      // 获取环信token
      await getEasemobToken()

      // 连接Easemob并加入群组
      try {
        await connectEasemob()
        await joinEasemobGroup(`room_${roomId.value}`)
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
        avatar: avatar.value
      })
      playerId.value = res.data.playerId
      playerName.value = name
      roomId.value = rid
      chatGroupId.value = res.data.chatGroupId

      // 获取环信token
      await getEasemobToken()

      // 连接Easemob并加入群组
      try {
        await connectEasemob()
        await joinEasemobGroup(`room_${roomId.value}`)
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

  // 获取环信token
  async function getEasemobToken() {
    try {
      const res = await api.post('/api/easemob/token', {
        playerId: playerId.value,
        playerName: playerName.value,
        username: easemobUser.value,
        password: easemobPassword.value
      })
      // 存储整个响应作为凭证信息
      easemobToken.value = res.data
      console.log('✅ Easemob token obtained:', res.data)
      return res.data
    } catch (error) {
      console.error('获取环信token失败:', error)
      throw error
    }
  }

  // 离开房间
  function leaveRoom() {
    // 发送离开事件（如果Socket存在）
    if (socket && roomId.value && playerId.value) {
      console.log(`📤 正在离开房间 ${roomId.value}...`);
      socket.emit('leaveRoom', {
        roomId: roomId.value,
        playerId: playerId.value,
        playerName: playerName.value
      })
    }

    // 断开Socket连接
    if (socket) {
      socket.disconnect()
      socket = null
      console.log('✅ Socket已断开')
    }

    // 异步断开Easemob（不阻塞）
    if (isEasemobConnected.value) {
      disconnectEasemob().catch(err => {
        console.warn('⚠️ Easemob disconnect warning:', err)
      })
    }

    // ✅ 只清理房间数据，保留用户数据（这样Lobby能正常显示）
    playerId.value = ''
    playerName.value = ''
    roomId.value = ''
    chatGroupId.value = ''
    easemobToken.value = ''
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
        roomId: data.roomId,
        playerCount: data.totalPlayers,
        maxPlayers: data.maxPlayers
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
  function sendMessage(message: string) {
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

  return {
    // 用户信息
    userId,
    username,
    nickname,
    avatar,
    easemobUser,
    easemobPassword,
    appKey,
    isLoggedIn,

    // 房间信息
    roomId,
    chatGroupId,
    currentRoom,
    rooms,
    easemobToken,
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
    swapSeat
  }
})
