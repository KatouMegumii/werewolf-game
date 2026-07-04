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
 * 使用用户名和密码登录Easemob
 */
export async function loginEasemob(username: string, password: string) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  try {
    console.log(`🔐 登录Easemob: ${username}...`)

    const result = await client.open({
      user: username,
      pwd: password
    })

    console.log('✅ Easemob login success:', result)
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
 * 创建或获取群组
 */
export async function createOrJoinGroup(groupName: string, description?: string) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  try {
    console.log(`📢 创建或加入群组: ${groupName}...`)

    // 创建群组 (如果不存在会失败，但这是正常的)
    const createResult = await client.Group.create({
      name: groupName,
      description: description || '',
      members: [client.user],
      public: false
    }).catch(() => null)

    if (createResult) {
      console.log('✅ 群组创建成功:', createResult)
      return createResult
    }

    // 如果创建失败，尝试获取群组列表中是否存在
    const groups = await client.Group.getGroupsFromServer()
    const existingGroup = groups?.data?.find((g: any) => g.name === groupName)

    if (existingGroup) {
      console.log('✅ 群组已存在:', existingGroup)
      return existingGroup
    }

    throw new Error(`Failed to create or find group: ${groupName}`)
  } catch (error) {
    console.error('❌ Create/join group failed:', error)
    throw error
  }
}

/**
 * 加入群组
 */
export async function joinGroup(groupId: string) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  try {
    console.log(`👋 加入群组: ${groupId}...`)

    const result = await client.Group.joinGroup({
      groupId: groupId,
      message: 'Request to join'
    })

    console.log('✅ 群组加入成功:', result)
    return result
  } catch (error) {
    console.error('❌ Join group failed:', error)
    throw error
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
    const message = new WebIM.message('txt', {
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
 * 监听群组消息
 */
export function onGroupMessage(callback: (message: any) => void) {
  if (!client) {
    throw new Error('Easemob SDK not initialized')
  }

  client.addEventHandler('messageHandler', {
    onTxtMsg: (message: any) => {
      if (message.chatType === 'groupChat') {
        console.log('📨 Received group message:', message)
        callback(message)
      }
    },
    onImageMsg: (message: any) => {
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

  try {
    console.log(`👋 离开群组: ${groupId}...`)

    const result = await client.Group.leaveGroup({
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
