<template>
  <div class="room-screen">
    <header class="room-topbar">
      <button class="icon-btn" @click="goBack" aria-label="返回大厅">‹</button>
      <div class="room-title">
        <b>房间 {{ roomId }}</b>
        <span>12 人预女猎白 · 第 1 天白天</span>
      </div>
      <button class="icon-btn" @click="showRoomSettings" aria-label="房间设置">⚙</button>
    </header>

    <div class="room-stage">
      <!-- 左侧玩家座位 -->
      <div class="side-seats" aria-label="左侧玩家">
        <div v-for="i in 6" :key="`left-${i}`" class="seat" :class="{ host: i === 1, speaking: i === 1 }">
          <span class="badge" v-if="i === 1">★</span>
          <div class="seat-avatar">🧙</div>
          <div class="seat-name">{{ i }} 玩家{{ i }}</div>
          <div class="seat-tag">{{ i === 1 ? '发言中' : '在线' }}</div>
        </div>
      </div>

      <!-- 中间面板 -->
      <div class="center-panel">
        <!-- 状态卡片 -->
        <section class="status-card" aria-label="当前回合状态">
          <div class="phase-row">
            <div class="phase">☀ 白天发言</div>
            <div class="timer">{{ formatTime }}</div>
          </div>
          <div class="status-text">当前轮到 1 号玩家发言。可在底部切换「打字」或「发言」模式。</div>
        </section>

        <!-- 聊天面板 -->
        <section class="chat-panel" aria-label="房间聊天框信息">
          <div class="chat-head">
            <span>房间聊天</span>
            <span v-if="chatReady" style="color: #34d399;">● 已连接</span>
            <span v-else style="color: #a9b4c4;">● 连接中</span>
          </div>
          <div class="chat-list" ref="chatListRef">
            <div v-for="(msg, idx) in messages" :key="idx" :class="['msg', msg.type]">
              <b v-if="msg.type !== 'system'">{{ msg.from }}</b>
              <span>{{ msg.text }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- 右侧玩家座位 -->
      <div class="side-seats" aria-label="右侧玩家">
        <div v-for="i in 6" :key="`right-${i}`" class="seat">
          <div class="seat-avatar">🐺</div>
          <div class="seat-name">{{ i + 6 }} 玩家{{ i + 6 }}</div>
          <div class="seat-tag">在线</div>
        </div>
      </div>
    </div>

    <!-- 底部输入区 -->
    <footer class="room-input-area">
      <div class="mode-switch" role="tablist">
        <button
          :class="['active', inputMode === 'text']"
          @click="inputMode = 'text'"
          type="button"
        >
          ⌨ 打字模式
        </button>
        <button
          :class="{ active: inputMode === 'voice' }"
          @click="inputMode = 'voice'"
          type="button"
        >
          🎙 发言模式
        </button>
      </div>

      <!-- 打字模式 -->
      <div v-if="inputMode === 'text'" class="input-row">
        <button class="icon-btn" @click="toast('表情面板')">☺</button>
        <input
          v-model="messageText"
          class="chat-input"
          placeholder="输入聊天内容..."
          @keydown.enter="sendMessage"
        />
        <button class="send-btn" @click="sendMessage">发送</button>
      </div>

      <!-- 语音模式 -->
      <div v-if="inputMode === 'voice'" class="voice-row">
        <button class="icon-btn" @click="toast('静音切换')">🔇</button>
        <button
          class="voice-hold"
          @mousedown="voiceStart"
          @mouseup="voiceEnd"
          @touchstart="voiceStart"
          @touchend="voiceEnd"
        >
          按住发言
        </button>
        <button class="send-btn" @click="toast('申请发言')">举手</button>
      </div>
    </footer>

    <!-- Toast提示 -->
    <div :class="['toast', { show: showToast }]">{{ toastMessage }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/gameStore'

const router = useRouter()
const route = useRoute()
const gameStore = useGameStore()

const roomId = ref(route.params.roomId as string)
const inputMode = ref<'text' | 'voice'>('text')
const messageText = ref('')
const messages = ref<any[]>([])
const chatListRef = ref<HTMLElement>()
const showToast = ref(false)
const toastMessage = ref('')
const chatReady = ref(true)
const countdown = ref(59)

let WebIM: any = null
let conn: any = null

// 计时器格式化
const formatTime = computed(() => {
  return `00:${String(countdown.value).padStart(2, '0')}`
})

onMounted(() => {
  if (!gameStore.isLoggedIn) {
    router.push('/login')
    return
  }

  // 初始化计时器
  setInterval(() => {
    countdown.value = countdown.value <= 0 ? 59 : countdown.value - 1
  }, 1000)

  // 初始化环信
  initEasemob()

  // 添加系统消息
  messages.value.push({
    type: 'system',
    text: '系统：天亮了，昨晚 4 号玩家出局。',
    from: 'System'
  })
})

const initEasemob = async () => {
  try {
    const { default: EasemobIM } = await import('easemob-websdk')
    WebIM = EasemobIM

    console.log('✅ Easemob SDK loaded')

    conn = new WebIM.connection({
      appKey: gameStore.appKey
    })

    conn.listen({
      onOpened: async () => {
        console.log('✅ Connected to Easemob')
        chatReady.value = true

        try {
          await conn.updateUserInfo({
            nickname: gameStore.nickname
          })
          console.log('✅ User nickname updated in Easemob')
        } catch (err) {
          console.warn('⚠️ Failed to update user info:', err)
        }
      },
      onClosed: () => {
        console.log('❌ Disconnected from Easemob')
        chatReady.value = false
      },
      onTextMessage: (message: any) => {
        console.log('📨 Received message:', message)
        messages.value.push({
          type: 'other',
          from: message.from,
          text: message.data
        })
        scrollChatBottom()
      },
      onError: (err: any) => {
        console.error('❌ Easemob error:', err)
      }
    })

    console.log('Attempting to login with:', {
      user: gameStore.easemobUser,
      pwd: gameStore.easemobPassword
    })

    await conn.open({
      user: gameStore.easemobUser,
      pwd: gameStore.easemobPassword
    })

    console.log('✅ Logged in to Easemob')
  } catch (error) {
    console.error('❌ Failed to initialize Easemob:', error)
  }
}

const sendMessage = async () => {
  if (!messageText.value.trim()) return
  if (!chatReady.value) {
    toast('聊天连接未就绪')
    return
  }

  if (!conn || !WebIM) {
    console.error('WebIM or Connection not initialized')
    return
  }

  try {
    const msg = WebIM.message.create({
      chatType: 'singleChat',
      type: 'txt',
      to: gameStore.easemobUser,
      msg: messageText.value
    })

    await conn.send(msg)
    console.log('📤 Message sent:', messageText.value)

    messages.value.push({
      type: 'me',
      from: '我',
      text: messageText.value
    })

    messageText.value = ''
    scrollChatBottom()
  } catch (error) {
    console.error('❌ Failed to send message:', error)
    toast('发送消息失败')
  }
}

const voiceStart = () => {
  toast('正在录音，松开发送')
}

const voiceEnd = () => {
  messages.value.push({
    type: 'me',
    from: '我',
    text: '🎙 语音消息 04″'
  })
  scrollChatBottom()
  toast('语音已发送')
}

const scrollChatBottom = () => {
  nextTick(() => {
    if (chatListRef.value) {
      chatListRef.value.scrollTop = chatListRef.value.scrollHeight
    }
  })
}

const toast = (message: string) => {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 1600)
}

const goBack = () => {
  if (confirm('确认要返回大厅吗？')) {
    router.push('/')
  }
}

const showRoomSettings = () => {
  toast('房间设置')
}
</script>

<style scoped>
.room-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 18%, rgba(247,200,115,.13), transparent 28%),
    linear-gradient(180deg, rgba(15,23,42,.72), rgba(3,7,18,.88));
}

.room-topbar {
  height: calc(64px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 12px 0;
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  gap: 8px;
  align-items: center;
  background: rgba(3,7,18,.45);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255,255,255,.07);
  flex: 0 0 auto;
}

.room-title {
  text-align: center;
  min-width: 0;
}

.room-title b {
  display: block;
  font-size: 15px;
}

.room-title span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
}

.room-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 74px 1fr 74px;
  gap: 8px;
  padding: 10px 10px 0;
}

.side-seats {
  display: grid;
  grid-template-rows: repeat(6, 1fr);
  gap: 7px;
  min-height: 0;
}

.seat {
  position: relative;
  min-height: 70px;
  padding: 6px 4px 5px;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: rgba(255,255,255,.055);
  border: 1px solid rgba(255,255,255,.08);
  overflow: hidden;
}

.seat.host {
  border-color: rgba(247,200,115,.32);
  background: rgba(247,200,115,.08);
}

.seat.dead {
  opacity: .52;
  filter: grayscale(.5);
}

.seat.speaking {
  box-shadow: 0 0 0 1px rgba(52,211,153,.30), 0 0 22px rgba(52,211,153,.16);
}

.seat-avatar {
  width: 34px;
  height: 34px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #334155, #111827);
  border: 1px solid rgba(255,255,255,.12);
  font-size: 18px;
  flex: 0 0 auto;
}

.seat-name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 10px;
  font-weight: 800;
}

.seat-tag {
  display: inline-flex;
  height: 16px;
  padding: 0 5px;
  align-items: center;
  border-radius: 999px;
  color: var(--muted);
  background: rgba(255,255,255,.06);
  font-size: 9px;
}

.seat .badge {
  position: absolute;
  top: 5px;
  right: 5px;
  font-size: 10px;
  color: #fde68a;
}

.center-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-card {
  flex: 0 0 auto;
  min-height: 86px;
  padding: 12px;
  border-radius: var(--radius-lg);
  background:
    linear-gradient(135deg, rgba(247,200,115,.15), rgba(96,165,250,.08)),
    rgba(255,255,255,.055);
  border: 1px solid rgba(255,255,255,.09);
}

.phase-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.phase {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  color: #fde68a;
  background: rgba(247,200,115,.10);
  border: 1px solid rgba(247,200,115,.20);
  font-size: 12px;
  font-weight: 900;
}

.timer {
  font-variant-numeric: tabular-nums;
  font-size: 22px;
  font-weight: 950;
  color: #fef3c7;
}

.status-text {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.chat-panel {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: rgba(2,6,23,.44);
  border: 1px solid rgba(255,255,255,.08);
}

.chat-head {
  height: 40px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  color: var(--muted);
  font-size: 12px;
  background: rgba(255,255,255,.04);
  border-bottom: 1px solid rgba(255,255,255,.06);
}

.chat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: none;
}

.chat-list::-webkit-scrollbar {
  display: none;
}

.msg {
  max-width: 92%;
  padding: 9px 10px;
  border-radius: 14px;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.06);
  font-size: 12px;
  line-height: 1.45;
  color: #e5e7eb;
}

.msg.system {
  align-self: center;
  text-align: center;
  color: #fde68a;
  background: rgba(247,200,115,.09);
  border-color: rgba(247,200,115,.14);
}

.msg.me {
  align-self: flex-end;
  background: rgba(96,165,250,.13);
  border-color: rgba(96,165,250,.18);
}

.msg b {
  display: block;
  margin-bottom: 3px;
  color: #fff;
  font-size: 11px;
}

.room-input-area {
  flex: 0 0 auto;
  padding: 8px 10px calc(8px + var(--safe-bottom));
  background: rgba(3,7,18,.76);
  backdrop-filter: blur(18px);
  border-top: 1px solid rgba(255,255,255,.08);
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255,255,255,.055);
  border: 1px solid rgba(255,255,255,.08);
}

.mode-switch button {
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-weight: 900;
  font-size: 12px;
  cursor: pointer;
  transition: all .2s ease;
}

.mode-switch button.active {
  color: #1e1307;
  background: linear-gradient(135deg, #fde68a, #fb923c);
}

.input-row,
.voice-row {
  display: grid;
  grid-template-columns: 38px 1fr 48px;
  gap: 8px;
  align-items: center;
}

.chat-input {
  height: 42px;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  color: var(--text);
  padding: 0 14px;
  outline: 0;
  min-width: 0;
  font-family: inherit;
}

.chat-input::placeholder {
  color: rgba(169,180,196,.58);
}

.send-btn {
  height: 42px;
  border: 0;
  border-radius: 999px;
  color: #1e1307;
  font-weight: 950;
  background: linear-gradient(135deg, #fde68a, #fb923c);
  cursor: pointer;
  transition: all .2s ease;
}

.send-btn:active {
  transform: scale(.95);
}

.voice-hold {
  height: 42px;
  border: 1px solid rgba(52,211,153,.20);
  border-radius: 999px;
  background: rgba(52,211,153,.10);
  color: #d1fae5;
  font-weight: 950;
  cursor: pointer;
  transition: all .2s ease;
}

.voice-hold:active {
  transform: scale(.98);
}
</style>
