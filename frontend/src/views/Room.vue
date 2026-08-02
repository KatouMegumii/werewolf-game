<template>
  <div class="room-screen">
    <header class="room-topbar">
      <button class="icon-btn" @click="goBack" aria-label="返回大厅">
        <ChevronLeft :size="20" />
      </button>
      <div class="room-title">
        <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
          <b>房间 {{ roomId }}</b>
          <button class="icon-copy-btn" @click="copyRoomId" title="复制房间号">
            <Copy :size="16" />
          </button>
        </div>
        <span>{{ playerList.length }}/{{ maxPlayers }} 人 · 等待中</span>
      </div>
      <button class="icon-btn" @click="showRoomSettings" aria-label="房间设置">
        <Settings :size="20" />
      </button>
    </header>

    <div class="room-stage">
      <!-- 左侧玩家座位 -->
      <div class="side-seats" aria-label="左侧玩家">
        <template v-for="seatIndex in Math.ceil(maxPlayers / 2)" :key="`left-seat-${seatIndex}-${renderTick}`">
          <div
            v-if="getPlayerBySeat(seatIndex)"
            class="seat"
            :class="{ host: getPlayerBySeat(seatIndex).playerId === gameStore.currentRoom?.hostPlayerId }"
          >
            <span class="badge" v-if="getPlayerBySeat(seatIndex).playerId === gameStore.currentRoom?.hostPlayerId">★</span>
            <div class="seat-avatar">{{ getPlayerBySeat(seatIndex).avatar }}</div>
            <div class="seat-name">{{ seatIndex }} {{ getPlayerBySeat(seatIndex).name }}</div>
            <div class="seat-tag">在线</div>
          </div>
          <div v-else class="seat empty" @click="swapSeat(seatIndex)" :title="`点击移至座位 ${seatIndex}`">
            <div class="seat-avatar">?</div>
            <div class="seat-name">{{ seatIndex }} 号</div>
          </div>
        </template>
      </div>

      <!-- 中间面板 -->
      <div class="center-panel">
        <!-- 状态卡片 -->
        <section class="status-card" aria-label="当前回合状态">
          <div class="phase-row">
            <div class="phase">⏳ 等待中</div>
            <div class="timer">{{ playerList.length }}/{{ maxPlayers }}</div>
          </div>
          <div class="status-text">房间已创建，等待玩家加入。点击左上角返回可以分享房间号给朋友。</div>
        </section>

        <!-- 聊天面板 -->
        <section class="chat-panel" aria-label="房间聊天框信息">
          <div class="chat-head">
            <span>房间聊天</span>
            <span :style="{ color: gameStore.isEasemobConnected ? '#34d399' : '#f59e0b' }">● {{ gameStore.isEasemobConnected ? '环信已连接' : '连接中…' }}</span>
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
        <template v-for="seatIndex in Math.floor(maxPlayers / 2)" :key="`right-seat-${seatIndex}-${renderTick}`">
          <div
            v-if="getPlayerBySeat(Math.ceil(maxPlayers / 2) + seatIndex)"
            class="seat"
          >
            <div class="seat-avatar">{{ getPlayerBySeat(Math.ceil(maxPlayers / 2) + seatIndex).avatar }}</div>
            <div class="seat-name">{{ Math.ceil(maxPlayers / 2) + seatIndex }} {{ getPlayerBySeat(Math.ceil(maxPlayers / 2) + seatIndex).name }}</div>
            <div class="seat-tag">在线</div>
          </div>
          <div v-else class="seat empty" @click="swapSeat(Math.ceil(maxPlayers / 2) + seatIndex)" :title="`点击移至座位 ${Math.ceil(maxPlayers / 2) + seatIndex}`">
            <div class="seat-avatar">?</div>
            <div class="seat-name">{{ Math.ceil(maxPlayers / 2) + seatIndex }} 号</div>
          </div>
        </template>
      </div>
    </div>

    <!-- 底部输入区 -->
    <footer class="room-input-area">
      <div class="mode-switch" role="tablist">
        <button
          :class="{ active: inputMode === 'text' }"
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

    <!-- 房间设置面板 -->
    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <div class="settings-head">
          <b>房间设置</b>
          <button class="icon-btn" @click="showSettings = false" aria-label="关闭">
            <X :size="18" />
          </button>
        </div>
        <div class="settings-body">
          <div class="settings-row">房主:<b> {{ hostName || '—' }}</b></div>
          <div v-for="p in playerList" :key="p.playerId" class="settings-player">
            <span>{{ p.seatNumber }} 号 {{ p.name }} {{ p.playerId === gameStore.currentRoom?.hostPlayerId ? '★' : '' }}</span>
            <div class="player-actions" v-if="gameStore.isHost && p.playerId !== gameStore.playerId">
              <button class="mini-btn" @click="handleTransfer(p.playerId)">转让</button>
              <button class="mini-btn danger" @click="handleKick(p.playerId)">踢出</button>
            </div>
          </div>
          <button v-if="gameStore.isHost" class="danger-btn" @click="handleDissolve">解散房间</button>
        </div>
      </div>
    </div>

    <!-- Toast提示 -->
    <div :class="['toast', { show: showToast }]">{{ toastMessage }}</div>

    <!-- 复制房间号弹窗 -->
    <div v-if="showCopyToast" :class="['copy-toast', { show: showCopyToast }]">
      {{ copyToastMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { ChevronLeft, Settings, Copy, X } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const gameStore = useGameStore()

const roomId = ref(route.params.roomId as string)
const inputMode = ref<'text' | 'voice'>('text')
const messageText = ref('')
const chatListRef = ref<HTMLElement>()
const showToast = ref(false)
const toastMessage = ref('')
const toastTitle = ref('')
const showCopyToast = ref(false)
const copyToastMessage = ref('已复制房间号')
const showSettings = ref(false)
// 座位区渲染计数器:playerList每次变化时+1,强制重建座位区DOM
// (兜底joinRoomSuccess数据已到但座位区偶发不渲染的问题)
const renderTick = ref(0)

// 从 gameStore 获取反应式数据
const playerList = computed(() => gameStore.playerList)
const messages = computed(() => gameStore.messages)
const maxPlayers = computed(() => gameStore.currentRoom?.maxPlayers || 12)

onMounted(async () => {
  if (!gameStore.isLoggedIn) {
    router.push('/login')
    return
  }

  // 刷新/直接进入时 playerId 为空，需先通过HTTP重新入房（否则后端没有该玩家记录，座位会消失）
  if (!gameStore.playerId) {
    try {
      await gameStore.joinRoom(roomId.value, gameStore.nickname)
    } catch (error: any) {
      console.error('自动入房失败:', error)
      const errorMsg = error?.response?.data?.error || error?.message || '进入房间失败'
      alert(errorMsg)
      router.push('/lobby')
      return
    }
  }

  // 初始化 Socket 并加入房间
  gameStore.initSocket()
  await nextTick()
  gameStore.joinRoomSocket(roomId.value)

  // 防御兜底:1.5s后若玩家列表仍无自己(joinRoomSuccess可能丢失/渲染异常),自动重新入房
  setTimeout(() => {
    const me = gameStore.playerList.find(p => p.playerId === gameStore.playerId)
    if (!me && gameStore.roomId) {
      console.warn('⚠️ 1.5s后仍未在玩家列表中，自动重新joinRoom')
      gameStore.joinRoomSocket(roomId.value)
      gameStore.fetchRoomInfo()
    }
  }, 1500)
})

// 监听消息变化，自动滚动到底
watch(messages, () => {
  scrollChatBottom()
}, { deep: true })

// 玩家列表每次更新(引用变化)时递增渲染计数器，强制重建座位区DOM
watch(() => gameStore.playerList, () => {
  renderTick.value++
}, { flush: 'post' })

onUnmounted(() => {
  // 离开房间时清理
  gameStore.leaveRoom()
})

const sendMessage = () => {
  if (!messageText.value.trim()) return
  gameStore.sendMessage(messageText.value)
  messageText.value = ''
}

const voiceStart = () => {
  toast('正在录音，松开发送')
}

const voiceEnd = () => {
  gameStore.sendMessage('🎙 语音消息 04″')
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

const goBack = async () => {
  if (confirm('确认要返回大厅吗？')) {
    await gameStore.leaveRoom()
    router.push('/lobby')
  }
}

const showRoomSettings = () => {
  showSettings.value = !showSettings.value
}

// 房主名（设置面板显示）
const hostName = computed(() => {
  const host = playerList.value.find(p => p.playerId === gameStore.currentRoom?.hostPlayerId)
  return host?.name || ''
})

// 房主操作（后端校验权限，前端仅房主可见入口）
async function handleKick(targetPlayerId: string) {
  if (!confirm('确认将该玩家移出房间？')) return
  try {
    await gameStore.kickPlayer(targetPlayerId)
    toast('已移出房间')
  } catch (err: any) {
    toast(err?.response?.data?.error || '踢人失败')
  }
}

async function handleTransfer(targetPlayerId: string) {
  if (!confirm('确认将房主转让给该玩家？')) return
  try {
    await gameStore.transferHost(targetPlayerId)
    toast('房主已转让')
  } catch (err: any) {
    toast(err?.response?.data?.error || '转让失败')
  }
}

async function handleDissolve() {
  if (!confirm('确认解散房间？所有玩家将被移出')) return
  try {
    await gameStore.dissolveRoom()
    // 服务端已广播 roomDissolved，这里主动清理并返回大厅
    gameStore.leaveRoom()
    router.push('/lobby')
  } catch (err: any) {
    toast(err?.response?.data?.error || '解散失败')
  }
}

const copyRoomId = async () => {
  try {
    await navigator.clipboard.writeText(roomId.value)
    showCopyToast.value = true
    setTimeout(() => {
      showCopyToast.value = false
    }, 1600)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// 根据座位号查找玩家
function getPlayerBySeat(seatNumber: number) {
  return gameStore.playerList.find(p => p.seatNumber === seatNumber)
}

// 座位交换功能
function swapSeat(targetSeatIndex: number) {
  const currentPlayer = gameStore.playerList.find(p => p.playerId === gameStore.playerId)
  if (!currentPlayer) return

  // 使用当前玩家的座位号
  const currentSeatIndex = currentPlayer.seatNumber || 1

  // 调用gameStore的swapSeat方法
  gameStore.swapSeat(currentSeatIndex, targetSeatIndex)
}
</script>

<style scoped>
.room-screen {
  height: 100dvh;
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

.seat.empty {
  opacity: .5;
  cursor: pointer;
  transition: all .2s ease;
}

.seat.empty:hover {
  opacity: .8;
  background: rgba(255,255,255,.06);
}

.seat.empty:active {
  transform: scale(.95);
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

.icon-btn {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: rgba(255,255,255,.055);
  color: var(--muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all .2s ease;
}

.icon-btn:hover {
  background: rgba(255,255,255,.08);
  color: #fff;
}

.icon-copy-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all .2s ease;
}

.icon-copy-btn:active {
  transform: scale(.95);
}

.copy-toast {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) translateY(20px);
  min-width: 200px;
  max-width: calc(100% - 40px);
  padding: 12px 20px;
  border-radius: 999px;
  text-align: center;
  color: #111827;
  background: #fde68a;
  font-size: 13px;
  font-weight: 900;
  opacity: 0;
  pointer-events: none;
  transition: .22s ease;
  z-index: 50;
  box-shadow: 0 16px 35px rgba(0,0,0,.28);
}

.copy-toast.show {
  opacity: 1;
  transform: translate(-50%, -50%) translateY(0);
}

.toast {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  padding: 12px 20px;
  border-radius: 999px;
  background: rgba(0,0,0,.88);
  color: #fff;
  font-size: 12px;
  opacity: 0;
  pointer-events: none;
  transition: all .3s ease;
  z-index: 111;
}

.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* 房间设置面板 */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.settings-panel {
  width: min(90vw, 360px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: #1e2330;
  border: 1px solid #333a4d;
  border-radius: 16px;
  overflow: hidden;
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #333a4d;
  font-size: 15px;
}

.settings-body {
  padding: 12px 16px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-row {
  font-size: 13px;
  color: #aab4c8;
}

.settings-player {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 10px;
  background: #262c3b;
  font-size: 13px;
}

.player-actions {
  display: flex;
  gap: 8px;
}

.mini-btn {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid #3b4a6b;
  background: transparent;
  color: #8fb3ff;
  font-size: 12px;
  cursor: pointer;
}

.mini-btn.danger {
  border-color: #6b3b3b;
  color: #ff8f8f;
}

.danger-btn {
  margin-top: 4px;
  padding: 10px;
  border-radius: 12px;
  border: none;
  background: #5a2d2d;
  color: #ffb3b3;
  font-size: 13px;
  cursor: pointer;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
