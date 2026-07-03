import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api/client'

export const useGameStore = defineStore('game', () => {
  // 用户信息
  const userId = ref<string>(localStorage.getItem('userId') || '')
  const username = ref<string>(localStorage.getItem('username') || '')
  const nickname = ref<string>(localStorage.getItem('nickname') || '')
  const avatar = ref<string>(localStorage.getItem('avatar') || '🧙')
  const easemobUser = ref<string>(localStorage.getItem('easemobUser') || '')
  const easemobPassword = ref<string>(localStorage.getItem('easemobPassword') || '')
  const appKey = ref<string>(localStorage.getItem('appKey') || '')

  // 房间信息
  const roomId = ref<string>('')
  const chatGroupId = ref<string>('')
  const currentRoom = ref<any>(null)
  const rooms = ref<any[]>([])
  const easemobToken = ref<any>(null)

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
  }
  async function createRoom(name: string) {
    try {
      const res = await api.post('/api/rooms', { playerName: name })
      playerId.value = res.data.playerId
      playerName.value = name
      roomId.value = res.data.roomId
      chatGroupId.value = res.data.chatGroupId

      // 获取环信token
      await getEasemobToken()
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
      const res = await api.post(`/api/rooms/${rid}/join`, { playerName: name })
      playerId.value = res.data.playerId
      playerName.value = name
      roomId.value = rid
      chatGroupId.value = res.data.chatGroupId

      // 获取环信token
      await getEasemobToken()
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
        playerName: playerName.value
      })
      // 存储整个响应作为凭证信息
      easemobToken.value = res.data
      return res.data
    } catch (error) {
      console.error('获取环信token失败:', error)
      throw error
    }
  }

  // 离开房间
  function leaveRoom() {
    playerId.value = ''
    playerName.value = ''
    roomId.value = ''
    chatGroupId.value = ''
    easemobToken.value = ''
    currentRoom.value = null
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
    leaveRoom
  }
})
