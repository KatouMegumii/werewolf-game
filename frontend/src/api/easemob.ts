import WebIM from 'easemob-websdk'

// Easemob SDK实例
let client: any = null

/**
 * 初始化Easemob SDK
 */
export function initEasemobSDK(appKey: string) {
  if (client) {
    console.log('✅ Easemob SDK already initialized')
    return client
  }

  console.log(`🔌 初始化Easemob SDK...`)

  client = new WebIM.connection({
    appKey: appKey,
    enablePresence: true
  })

  // 监听连接事件
  client.addEventHandler('connectionHandler', {
    onConnected: () => {
      console.log('✅ Easemob SDK connected')
    },
    onDisconnected: (reason) => {
      console.log('❌ Easemob SDK disconnected:', reason)
    },
    onError: (error) => {
      console.error('❌ Easemob SDK error:', error)
    }
  })

  return client
}

/**
 * 获取或创建Easemob SDK实例
 */
export function getEasemobClient() {
  if (!client) {
    throw new Error('Easemob SDK not initialized. Call initEasemobSDK first.')
  }
  return client
}

/**
 * 使用用户Token登录Easemob（免密，推荐的安全登录方式）
 */
export async function loginEasemob(username: string, accessToken: string) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  try {
    console.log(`🔐 登录Easemob: ${username} (token)...`)

    const result = await client.open({
      user: username,
      accessToken
    })

    console.log('✅ Easemob login success:', result)
    // 诊断:打印sock真实状态(排查发送挂起问题——伪sock时send空转)
    setTimeout(() => {
      const c: any = client
      console.log('🔍 sock诊断:', {
        sockType: c.sock?.constructor?.name,
        readyState: c.sock?.readyState,
        hasSend: typeof c.sock?.send,
        getSockType: typeof c._getSock
      })
    }, 1000)
    return result
  } catch (error) {
    console.error('❌ Easemob login failed:', error)
    throw error
  }
}

/**
 * 退出Easemob
 */
export async function logoutEasemob() {
  if (!client) return

  try {
    console.log('📤 Logging out from Easemob...')
    await client.close()
    console.log('✅ Easemob logout success')
  } catch (error) {
    console.error('❌ Easemob logout failed:', error)
  }
}

/**
 * 发送文本消息到群组
 */
export async function sendGroupMessage(
  groupId: string,
  content: string,
  attributes?: Record<string, any>
) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  try {
    // SDK 4.24: 用 WebIM.message.create 创建消息(不再是 new WebIM.message)
    const message = WebIM.message.create({
      type: 'txt',
      msg: content,
      to: groupId,
      chatType: 'groupChat',
      ext: attributes || {}
    })

    const result = await client.send(message)
    console.log('✅ 群组消息已发送:', result)
    return result
  } catch (error) {
    console.error('❌ Send group message failed:', error)
    throw error
  }
}

/**
 * 监听群组消息（SDK 4.24: 回调名为 onTextMessage/onImageMessage，不再是 onTxtMsg/onImageMsg）
 */
export function onGroupMessage(callback: (message: any) => void) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  client.addEventHandler('messageHandler', {
    onTextMessage: (message: any) => {
      if (message.chatType === 'groupChat') {
        console.log('📨 Received group message:', message)
        callback(message)
      }
    },
    onImageMessage: (message: any) => {
      if (message.chatType === 'groupChat') {
        console.log('🖼️ Received group image:', message)
        callback(message)
      }
    }
  })
}

/**
 * 离开群组
 */
export async function leaveGroup(groupId: string) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  // SDK 4.24: 群API直接挂在connection上;SDK关闭后可能不存在,跳过(退出房间时SDK可能已close)
  if (typeof client.leaveGroup !== 'function') {
    console.warn('⚠️ SDK已关闭，跳过离开群组')
    return
  }

  try {
    console.log(`👋 离开群组: ${groupId}...`)

    const result = await client.leaveGroup({
      groupId: groupId
    })

    console.log('✅ 离开群组成功:', result)
    return result
  } catch (error) {
    console.error('❌ Leave group failed:', error)
    throw error
  }
}

/**
 * 销毁SDK实例
 */
export function destroyEasemobSDK() {
  if (client) {
    client = null
    console.log('🗑️ Easemob SDK destroyed')
  }
}
