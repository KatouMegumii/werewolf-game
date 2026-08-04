import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useGameStore } from './gameStore'
import * as VoiceCall from '../api/voiceCall'

// ===== 房间语音状态机(语音房间模式)=====
// 进房即进 Agora 频道(room_{roomId}),全员 host;信令(uid映射/静音/进出)走 socket.io 广播
// 依赖单向:voiceStore → gameStore(读房间信息/发 socket),gameStore 不 import 本 store(防循环)

const SPEAKING_THRESHOLD = 60

export const useVoiceStore = defineStore('voice', () => {
  // ---- 状态 ----
  const isVoiceJoined = ref(false) // 已进 Agora 频道
  const isJoining = ref(false)
  const isMuted = ref(false) // 自己麦克风静音
  const voiceError = ref('') // 非空 → UI 显示降级
  const volumes = ref<Record<string, number>>({}) // playerId -> 0~100
  const speakingIds = ref<Set<string>>(new Set()) // 正在说话(level>阈值且未静音且非自己)
  const memberMuteMap = ref<Record<string, boolean>>({}) // playerId -> 静音
  const uidToPlayer = ref<Map<number, string>>(new Map()) // rtcUid -> playerId

  // uidToPlayer 已包含自己(enterVoice 时 set 了自身 uid),不要再 +1
  const connectedCount = computed(() => (isVoiceJoined.value ? uidToPlayer.value.size : 0))

  // ---- 事件桥接(voiceCall 回调 → 响应式状态)----
  async function onUserJoined(uid: number) {
    if (uidToPlayer.value.has(uid)) return
    // 兜底:广播还没到,用 uid → 环信用户名 → playerList 反查(覆盖竞态)
    const uname = await VoiceCall.resolveUidToUsername(uid)
    const g = useGameStore()
    const p = uname ? g.playerList.find(x => x.easemobUser?.toLowerCase() === uname.toLowerCase()) : undefined
    if (p) {
      setUidForPlayer(uid, p.playerId)
      console.log(`🎙️ 语音成员接入: ${p.name} (uid=${uid})`)
    }
  }

  function onUserLeft(uid: number) {
    const pid = uidToPlayer.value.get(uid)
    uidToPlayer.value.delete(uid)
    if (pid) cleanupPlayer(pid)
  }

  function onVolume(vols: VoiceCall.VolumeInfo[]) {
    const next: Record<string, number> = {}
    const speaking = new Set<string>()
    for (const v of vols) {
      const pid = uidToPlayer.value.get(v.uid)
      if (!pid) continue
      next[pid] = v.level
      // 自己说话也点亮(用户要求看到自己的发言状态);静音时忽略音量
      if (v.level > SPEAKING_THRESHOLD && !memberMuteMap.value[pid]) {
        speaking.add(pid)
      }
    }
    volumes.value = next
    speakingIds.value = speaking
  }

  async function onTokenWillExpire() {
    try {
      await VoiceCall.renewToken()
    } catch (err) {
      console.warn('⚠️ 语音 token 续期失败:', err)
    }
  }

  function handleVoiceError(err: any) {
    console.warn('⚠️ 语音错误:', err?.message || err)
    voiceError.value = '语音不可用，已切换文字聊天'
  }

  function cleanupPlayer(playerId: string) {
    delete volumes.value[playerId]
    speakingIds.value.delete(playerId)
    delete memberMuteMap.value[playerId]
    for (const [uid, pid] of uidToPlayer.value) {
      if (pid === playerId) uidToPlayer.value.delete(uid)
    }
  }

  // 绑定 uid → playerId(先删该玩家的旧 uid,刷新/重连换 rtcUid 时避免残留导致人数虚高)
  function setUidForPlayer(uid: number, playerId: string) {
    for (const [u, pid] of uidToPlayer.value) {
      if (pid === playerId && u !== uid) uidToPlayer.value.delete(u)
    }
    uidToPlayer.value.set(uid, playerId)
  }

  // ---- 动作 ----
  async function enterVoice() {
    const g = useGameStore()
    if (isVoiceJoined.value || isJoining.value) return
    if (!g.roomId || !g.isEasemobConnected) return
    if (!g.playerList.some(p => p.playerId === g.playerId)) return

    isJoining.value = true
    try {
      const channel = `room_${g.roomId}`
      const token = await VoiceCall.fetchRTCToken(channel, g.easemobUser)
      await VoiceCall.joinVoiceChannel(token, {
        onUserJoined,
        onUserLeft,
        onVolume,
        onTokenWillExpire,
        onError: handleVoiceError
      })
      setUidForPlayer(token.uid, g.playerId)
      g.getSocket()?.emit('voiceState', {
        roomId: g.roomId,
        type: 'voice_joined',
        playerId: g.playerId,
        rtcUid: token.uid
      })
      isVoiceJoined.value = true
      // 默认静音(开麦需点击语音按钮);广播静音态让其他人看到 🔇
      isMuted.value = true
      VoiceCall.setLocalMicEnabled(false)
      g.getSocket()?.emit('voiceState', {
        roomId: g.roomId,
        type: 'voice_muted',
        playerId: g.playerId,
        muted: true
      })
      console.log(`🎙️ 已进入语音频道 ${channel}(默认静音)`)
    } catch (err) {
      handleVoiceError(err)
    } finally {
      isJoining.value = false
    }
  }

  async function leaveVoice() {
    const g = useGameStore()
    if (!isVoiceJoined.value && !isJoining.value) return
    const wasJoined = isVoiceJoined.value
    isVoiceJoined.value = false
    isJoining.value = false
    if (wasJoined && g.roomId && g.playerId) {
      g.getSocket()?.emit('voiceState', {
        roomId: g.roomId,
        type: 'voice_left',
        playerId: g.playerId
      })
    }
    await VoiceCall.leaveVoiceChannel()
    volumes.value = {}
    speakingIds.value = new Set()
    memberMuteMap.value = {}
    uidToPlayer.value = new Map()
    console.log('🎙️ 已离开语音频道')
  }

  async function toggleMute() {
    const g = useGameStore()
    const newState = !isMuted.value
    isMuted.value = newState
    VoiceCall.setLocalMicEnabled(!newState)
    g.getSocket()?.emit('voiceState', {
      roomId: g.roomId,
      type: newState ? 'voice_muted' : 'voice_unmuted',
      playerId: g.playerId,
      muted: newState
    })
    return newState
  }

  /** 按住说话:on=true 临时开麦(无视静音),on=false 恢复静音态 */
  function setPushToTalk(on: boolean) {
    VoiceCall.setLocalMicEnabled(on ? true : !isMuted.value)
  }

  // ---- 信令 ----
  let signalingOn = false

  function initSignaling() {
    const g = useGameStore()
    const socket = g.getSocket()
    if (!socket || signalingOn) return
    signalingOn = true

    const handlePlayerLeft = (data: any) => {
      if (data.playerId !== g.playerId) cleanupPlayer(data.playerId)
    }

    const handleSocketReconnect = () => {
      // socket 重连后:语音应在线但 Agora 断连 → 重进
      if (isVoiceJoined.value && !VoiceCall.isInChannel()) {
        enterVoice()
      }
    }

    socket.on('voiceState', handleVoiceState)
    socket.on('playerLeft', handlePlayerLeft)
    socket.on('connect', handleSocketReconnect)
  }

  function destroySignaling() {
    const g = useGameStore()
    const socket = g.getSocket()
    if (socket && signalingOn) {
      socket.off('voiceState', handleVoiceState)
      socket.off('playerLeft')
      socket.off('connect')
    }
    signalingOn = false
  }

  function handleVoiceState(data: any) {
    const g = useGameStore()
    if (data.playerId === g.playerId) return // 自己的广播(uid/静音已本地设置)

    switch (data.type) {
      case 'voice_joined':
        if (data.rtcUid) setUidForPlayer(data.rtcUid, data.playerId)
        break
      case 'voice_left':
        cleanupPlayer(data.playerId)
        break
      case 'voice_muted':
        memberMuteMap.value[data.playerId] = true
        break
      case 'voice_unmuted':
        memberMuteMap.value[data.playerId] = false
        break
    }
  }

  // ---- 查询 ----
  function isSpeaking(playerId: string) {
    return speakingIds.value.has(playerId)
  }

  function isPlayerMuted(playerId: string) {
    const g = useGameStore()
    // 自己的静音状态读本地(handleVoiceState 过滤了自己,memberMuteMap 里没有自己)
    if (playerId === g.playerId) return isMuted.value
    return !!memberMuteMap.value[playerId]
  }

  function getVolume(playerId: string) {
    return volumes.value[playerId] || 0
  }

  return {
    isVoiceJoined,
    isJoining,
    isMuted,
    voiceError,
    connectedCount,
    enterVoice,
    leaveVoice,
    toggleMute,
    setPushToTalk,
    initSignaling,
    destroySignaling,
    isSpeaking,
    isPlayerMuted,
    getVolume
  }
})
