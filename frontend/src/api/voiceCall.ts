import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng'
import { getEasemobClient } from './easemob'
import api from './client'

// ===== 语音房间模式 RTC 服务层(仿 CallKit 的接入模式:getRTCToken → live 频道 → publish/subscribe)=====
// 语音房间:进房即在频道、全员 host 可发言、静音走 setEnabled;信令(uid映射/静音/进出)由 voiceStore 经 socket.io 广播

export interface RTCTokenInfo {
  appId: string
  token: string
  uid: number
  channel: string
  expiresIn: number
}

export interface VolumeInfo {
  uid: number
  level: number // 0~100
}

export interface VoiceEvents {
  onUserJoined?: (uid: number) => void
  onUserLeft?: (uid: number) => void
  onVolume?: (volumes: VolumeInfo[]) => void
  onTokenWillExpire?: () => void
  onError?: (err: any) => void
}

let client: IAgoraRTCClient | null = null
let localAudioTrack: IMicrophoneAudioTrack | null = null
let currentChannel = ''
let currentUid = 0

/**
 * 获取 Agora 频道凭证
 * 经后端代理(浏览器直连环信 REST 有 CORS 限制):POST /api/easemob/rtc-token,
 * 后端用 App Token 调 GET /users/{username}/token/rtc(服务端已验证可用)
 */
export async function fetchRTCToken(channel: string, username: string): Promise<RTCTokenInfo> {
  const res = await api.post('/api/easemob/rtc-token', {
    username,
    channelName: channel
  })
  return {
    appId: res.data.appId,
    token: res.data.token,
    uid: res.data.uid,
    channel: res.data.channel || channel,
    expiresIn: res.data.expiresIn || 0
  }
}

/**
 * 加入语音频道(幂等:已在频道则直接返回)
 * live 模式 + 全员 host:12 人房间超过 rtc 模式 7 人上限,且全员需可发言
 */
export async function joinVoiceChannel(opts: RTCTokenInfo, events: VoiceEvents = {}): Promise<void> {
  if (isInChannel()) return

  AgoraRTC.setLogLevel(4) // WARN 级,减少噪音
  client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' })
  client.setClientRole('host')

  client.on('user-published', async (user, mediaType) => {
    if (mediaType !== 'audio') return
    try {
      const remoteTrack = await client!.subscribe(user, 'audio')
      // 必须 play() 才会出声(Agora V4:订阅后不 play,只有音量指示会工作——"亮起来但听不到")
      remoteTrack.play()
      events.onUserJoined?.(user.uid as number)
    } catch (err) {
      console.warn('⚠️ 订阅远端音频失败:', err)
      events.onError?.(err)
    }
  })

  client.on('user-left', (user) => {
    events.onUserLeft?.(user.uid as number)
  })

  client.on('volume-indicator', (volumes) => {
    events.onVolume?.(volumes.map(v => ({ uid: v.uid as number, level: v.level })))
  })

  client.on('token-privilege-will-expire', () => {
    events.onTokenWillExpire?.()
  })

  try {
    currentUid = await client.join(opts.appId, opts.channel, opts.token, opts.uid)
    currentChannel = opts.channel
    await client.enableAudioVolumeIndicator()

    // 触发麦克风授权;失败时留在频道(只听)但把错误抛给上层降级
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack()
    await client.publish([localAudioTrack])
  } catch (err) {
    // join 失败清理半初始化状态
    if (client?.connectionState === 'CONNECTED') {
      client.leave().catch(() => {})
    }
    client = null
    localAudioTrack = null
    throw err
  }
}

/** 离开语音频道(幂等,清理顺序仿 CallKit hangup:unpublish → close → leave) */
export async function leaveVoiceChannel(): Promise<void> {
  if (!client) return

  try {
    if (localAudioTrack) {
      if (client.connectionState === 'CONNECTED') {
        await client.unpublish([localAudioTrack])
      }
      localAudioTrack.close()
    }
  } catch (err) {
    console.warn('⚠️ 取消发布音频失败:', err)
  }

  try {
    if (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING') {
      await client.leave()
    }
  } catch (err) {
    console.warn('⚠️ 离开语音频道失败:', err)
  }

  try {
    client.removeAllListeners()
  } catch {}

  client = null
  localAudioTrack = null
  currentChannel = ''
  currentUid = 0
}

/** 静音/取消静音(setEnabled 保持已发布状态,远端收音量 0,不触发 user-unpublished) */
export function setLocalMicEnabled(enabled: boolean): void {
  localAudioTrack?.setEnabled(enabled)
}

export function isMicEnabled(): boolean {
  return localAudioTrack?.enabled ?? false
}

export function isInChannel(): boolean {
  return !!client && client.connectionState === 'CONNECTED'
}

export function getCurrentChannel(): string {
  return currentChannel
}

/** token 即将过期时续期(重新 getRTCToken + renewToken) */
export async function renewToken(): Promise<void> {
  if (!client || !currentChannel) return
  const info = await fetchRTCToken(currentChannel)
  await client.renewToken(info.token)
  console.log('🔄 语音 token 已续期')
}

/** 切换频道(游戏阶段/角色分组用:leave 当前 → 重新取 token → join 新频道) */
export async function switchVoiceChannel(
  newChannel: string,
  events: VoiceEvents = {}
): Promise<void> {
  if (newChannel === currentChannel) return
  const wasJoined = isInChannel()
  if (wasJoined) {
    await leaveVoiceChannel()
  }
  const info = await fetchRTCToken(newChannel)
  await joinVoiceChannel(info, events)
  console.log(`🔄 已切换语音频道: ${newChannel}`)
}

/**
 * RTCUId → 环信用户名(兜底映射,覆盖"先收到 user-published 后收到 socket 广播"的竞态)
 * 返回环信用户名(小写),由调用方经 playerList.easemobUser 反查 playerId
 */
export async function resolveUidToUsername(uid: number): Promise<string | undefined> {
  try {
    const easemobClient = getEasemobClient()
    const res = await (easemobClient as any).getUserIdByRTCUIds([uid])
    if (res?.type === 'ok' && res.data?.[uid]) {
      return res.data[uid]
    }
  } catch (err) {
    console.warn('⚠️ uid 映射查询失败:', err)
  }
  return undefined
}
