<template>
  <AppLayout title="游戏大厅" :showToast="showToast" :toastMessage="toastMessage">
    <!-- 用户信息卡片 -->
    <section class="card profile-card">
      <div class="avatar">{{ gameStore.avatar || '🧙' }}</div>
      <div>
        <h2 class="name">{{ gameStore.nickname }}</h2>
        <div class="meta">
          <span class="pill gold">ID {{ gameStore.userId }}</span>
          <span class="pill">胜率 62%</span>
        </div>
      </div>
      <button class="icon-btn" @click="showProfileModal = true" aria-label="编辑资料">
        <Edit2 :size="18" />
      </button>
    </section>

    <!-- 房间入口 -->
    <div class="section-title">
      <h2>房间入口</h2>
      <span>支持创建 / 加入房间</span>
    </div>
    <section class="quick-actions">
      <button class="action-card primary" @click="openDrawer('createDrawer')">
        <div class="action-icon">🏰</div>
        <div class="action-title">新建房间</div>
        <div class="action-desc">选择人数、板子与规则，立即开局。</div>
      </button>
      <button class="action-card" @click="openDrawer('joinDrawer')">
        <div class="action-icon">🔑</div>
        <div class="action-title">加入房间</div>
        <div class="action-desc">输入房号，加入好友对局。</div>
      </button>
    </section>

    <!-- 最近房间 -->
    <div v-if="lastRoomId" class="room-code-box">
      <div>
        <div class="code-title">最近房间</div>
        <div class="code-num">{{ lastRoomId }}</div>
      </div>
      <button class="btn btn-blue" @click="goToRoom">进入房间</button>
    </div>

    <!-- 有效房间列表 -->
    <div v-if="validRooms.length > 0" style="margin-top: 20px;">
      <div class="section-title">
        <h2>有效房间</h2>
        <span>{{ validRooms.length }} 个房间</span>
      </div>
      <div class="rooms-list">
        <div
          v-for="room in validRooms"
          :key="room.id"
          class="room-card"
          @click="enterRoom(room.id)"
        >
          <div class="room-header">
            <div class="room-id">房间 {{ room.id }}</div>
            <div class="player-count">{{ room.playerCount }}/{{ room.maxPlayers || 12 }}</div>
          </div>
          <div class="room-info">{{ room.boardName || '自定义板子' }}</div>
        </div>
      </div>
    </div>

    <!-- 用户信息模态框 -->
    <div v-if="showProfileModal" class="modal-overlay" @click.self="showProfileModal = false">
      <div class="modal-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 18px;">用户信息设置</h2>
          <button class="close-mini" @click="showProfileModal = false">
            <X :size="18" />
          </button>
        </div>
        <div class="field">
          <div class="label-row"><span>昵称</span><span>房间内显示</span></div>
          <input v-model="profileNickname" class="input" />
        </div>
        <div class="field">
          <div class="label-row"><span>头像</span><span>点击选择</span></div>
          <button class="btn btn-avatar" @click="showAvatarDrawer = true">
            <span style="font-size: 32px;">{{ profileAvatar }}</span>
            <span style="color: var(--muted); font-size: 12px;">点击更换头像</span>
          </button>
        </div>
        <button class="btn btn-primary btn-full" style="margin-top: 14px" @click="saveProfile">保存设置</button>
      </div>
    </div>

    <!-- 头像选择抽屉的overlay -->
    <div
      v-if="showAvatarDrawer"
      class="drawer-overlay"
      @click="showAvatarDrawer = false"
    ></div>

    <!-- 头像选择抽屉 -->
    <aside :class="['drawer', { open: showAvatarDrawer }]">
      <div class="drawer-title">
        选择头像
        <button class="close-mini" @click="showAvatarDrawer = false">
          <X :size="18" />
        </button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
        <button
          v-for="avatar in avatarOptions"
          :key="avatar"
          @click="selectAvatar(avatar)"
          :class="['avatar-btn', { active: profileAvatar === avatar }]"
        >
          {{ avatar }}
        </button>
      </div>
    </aside>

    <!-- 创建房间抽屉的overlay -->
    <div
      v-if="activeDrawer === 'createDrawer'"
      class="drawer-overlay"
      @click="closeDrawers()"
    ></div>

    <!-- 抽屉菜单 - 创建房间 -->
    <aside :class="['drawer', { open: activeDrawer === 'createDrawer' }]">
      <div class="drawer-title">
        新建房间
        <button class="close-mini" @click="closeDrawers()">
          <X :size="18" />
        </button>
      </div>
      <div class="setting-grid">
        <div class="setting-card">
          <label>选择板子</label>
          <div class="board-select-list">
            <button
              v-for="(board, index) in userBoards"
              :key="index"
              :class="['board-option', { active: selectedBoardId === index }]"
              @click="selectedBoardId = index"
            >
              <div class="board-name">{{ board.name }}</div>
              <div class="board-info">{{ board.summary }}</div>
            </button>
          </div>
        </div>
      </div>
      <button class="btn btn-primary btn-full" style="margin-top: 14px" @click="createRoom" :disabled="creatingRoom">{{ creatingRoom ? '创建中...' : '创建并进入房间' }}</button>
    </aside>

    <!-- 加入房间抽屉的overlay -->
    <div
      v-if="activeDrawer === 'joinDrawer'"
      class="drawer-overlay"
      @click="closeDrawers()"
    ></div>

    <!-- 抽屉菜单 - 加入房间 -->
    <aside :class="['drawer', { open: activeDrawer === 'joinDrawer' }]">
      <div class="drawer-title">
        加入房间
        <button class="close-mini" @click="closeDrawers()">
          <X :size="18" />
        </button>
      </div>
      <div class="field">
        <div class="label-row"><span>房间号</span><span>6 位数字</span></div>
        <input v-model="joinRoomCode" class="input" inputmode="numeric" maxlength="6" placeholder="请输入房间号" />
      </div>
      <button class="btn btn-blue btn-full" @click="joinRoom">加入房间</button>
    </aside>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import AppLayout from '../components/AppLayout.vue'
import { Edit2, X } from 'lucide-vue-next'
import api from '../api/client'

const router = useRouter()
const gameStore = useGameStore()

const activeDrawer = ref('')
const profileNickname = ref(gameStore.nickname)
const profileAvatar = ref(gameStore.avatar || '🧙')
const joinRoomCode = ref('')
const lastRoomId = ref(localStorage.getItem('lastRoomId') || '')
const showToast = ref(false)
const toastMessage = ref('')
const showProfileModal = ref(false)
const showAvatarDrawer = ref(false)
const selectedBoardId = ref<number | null>(null)
const validRooms = ref<any[]>([])
const userBoards = ref<any[]>([])
const loading = ref(false)
const creatingRoom = ref(false)

const avatarOptions = ['🧙', '🐺', '🧪', '🏹', '🎭', '🌾', '👻', '🐉', '🦅', '🦊', '🐻', '🦁', '🐼', '🐨', '🐯', '🦓', '🦘', '🐘', '🦏', '🦝', '🦚', '🦜', '🦆', '🦉']

onMounted(async () => {
  // 检查最近房间是否还有效
  await checkLastRoom()
  // 加载用户的板子列表
  await loadUserBoards()
  // 加载有效房间列表
  await loadValidRooms()
})

async function checkLastRoom() {
  if (!lastRoomId.value) return
  try {
    const res = await api.get(`/api/rooms/${lastRoomId.value}`)
    // 房间不存在或没有人，清除
    if (!res.data || res.data.playerCount === 0) {
      lastRoomId.value = ''
      localStorage.removeItem('lastRoomId')
    }
  } catch (error) {
    // 房间不存在，清除
    lastRoomId.value = ''
    localStorage.removeItem('lastRoomId')
  }
}

async function loadUserBoards() {
  try {
    const res = await api.get('/api/boards')
    userBoards.value = res.data || []
  } catch (error) {
    console.error('加载板子列表失败:', error)
    userBoards.value = []
  }
}

async function loadValidRooms() {
  try {
    const res = await api.get('/api/rooms')
    // 过滤有效房间（有人的房间）
    validRooms.value = (res.data || []).filter((room: any) => room.playerCount > 0)
  } catch (error) {
    console.error('加载房间列表失败:', error)
    validRooms.value = []
  }
}

function openDrawer(id: string) {
  activeDrawer.value = id
}

function closeDrawers() {
  activeDrawer.value = ''
}

function toast(message: string) {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 1600)
}

function selectAvatar(avatar: string) {
  profileAvatar.value = avatar
  showAvatarDrawer.value = false
}

function saveProfile() {
  // 更新store和localStorage
  gameStore.nickname = profileNickname.value
  gameStore.avatar = profileAvatar.value
  localStorage.setItem('nickname', profileNickname.value)
  localStorage.setItem('avatar', profileAvatar.value)

  // 同步到环信用户属性
  api.put(`/api/auth/user/${gameStore.username}`, {
    nickname: profileNickname.value,
    avatar: profileAvatar.value
  }).then(res => {
    console.log('✅ 用户信息已同步到环信:', res.data)
    toast('用户信息已保存')
  }).catch(err => {
    console.error('❌ 同步到环信失败:', err)
    toast('保存失败，但本地已更新')
  })

  showProfileModal.value = false
}

async function createRoom() {
  if (selectedBoardId.value === null) {
    toast('请选择板子')
    return
  }
  if (creatingRoom.value) {
    return
  }

  creatingRoom.value = true
  try {
    const boardId = userBoards.value[selectedBoardId.value].id
    const res = await api.post('/api/rooms', {
      playerName: gameStore.nickname,
      avatar: gameStore.avatar,
      boardId: boardId
    })
    const roomId = res.data.roomId
    const playerId = res.data.playerId
    const chatGroupId = res.data.chatGroupId

    // 更新gameStore（使用ref的.value）
    ;(gameStore as any).roomId = roomId
    ;(gameStore as any).playerId = playerId
    ;(gameStore as any).playerName = gameStore.nickname
    ;(gameStore as any).chatGroupId = chatGroupId

    lastRoomId.value = roomId
    localStorage.setItem('lastRoomId', roomId)

    // 获取房间信息（包含maxPlayers）
    await gameStore.fetchRoomInfo()

    // 初始化Socket和Easemob连接
    try {
      await gameStore.getEasemobToken()
      await gameStore.connectEasemob()
      await gameStore.joinEasemobGroup(`room_${roomId}`)
    } catch (error) {
      console.warn('⚠️ Easemob连接可选，继续进入房间')
    }

    router.push(`/room/${roomId}`)
    closeDrawers()
  } catch (error: any) {
    console.error('创建房间错误:', error);
    const errorMsg = error?.response?.data?.error || error?.message || '创建房间失败'

    if (errorMsg.includes('玩家已在房间中')) {
      toast('您已在房间中，请先离开')
    } else if (error?.response?.data?.existingRoomId || errorMsg.includes('已在其他房间')) {
      toast('创建失败：您已在其他房间中')
    } else {
      toast(errorMsg)
    }
  } finally {
    creatingRoom.value = false
  }
}

async function joinRoom() {
  if (!joinRoomCode.value) {
    toast('请输入房间号')
    return
  }
  try {
    await gameStore.joinRoom(joinRoomCode.value, gameStore.nickname)
    lastRoomId.value = joinRoomCode.value
    localStorage.setItem('lastRoomId', joinRoomCode.value)
    toast(`成功加入房间 ${joinRoomCode.value}`)
    router.push(`/room/${joinRoomCode.value}`)
    closeDrawers()
  } catch (error: any) {
    console.error('加入房间错误:', error);
    const errorMsg = error?.response?.data?.error || error?.message || '加入房间失败'

    if (errorMsg.includes('玩家已在其他房间中')) {
      toast('您已在其他房间中，请先离开')
    } else if (errorMsg.includes('不存在')) {
      toast('房间不存在')
    } else if (errorMsg.includes('已满')) {
      toast('房间已满')
    } else {
      toast(errorMsg)
    }
  }
}

async function goToRoom() {
  if (!lastRoomId.value) {
    toast('没有最近的房间')
    return
  }
  router.push(`/room/${lastRoomId.value}`)
}

async function enterRoom(roomId: string) {
  try {
    await gameStore.joinRoom(roomId, gameStore.nickname)
    lastRoomId.value = roomId
    localStorage.setItem('lastRoomId', roomId)
    router.push(`/room/${roomId}`)
  } catch (error: any) {
    console.error('进入房间错误:', error);
    const errorMsg = error?.response?.data?.error || error?.message || '加入房间失败'

    if (errorMsg.includes('玩家已在其他房间中')) {
      toast('您已在其他房间中，请先离开')
    } else if (errorMsg.includes('不存在')) {
      toast('房间不存在或已关闭')
      // 刷新房间列表
      loadValidRooms()
    } else if (errorMsg.includes('已满')) {
      toast('房间已满')
    } else {
      toast(errorMsg)
    }
  }
}
</script>

<style scoped>
.profile-card {
  padding: 16px;
  display: grid;
  grid-template-columns: 66px 1fr auto;
  gap: 13px;
  align-items: center;
  margin-bottom: 20px;
}

.avatar {
  width: 66px;
  height: 66px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 38% 28%, rgba(255,255,255,.26), transparent 18%),
    linear-gradient(135deg, #334155, #0f172a);
  border: 1px solid rgba(247,200,115,.28);
  font-size: 34px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
}

.name {
  margin: 0 0 4px;
  font-size: 20px;
  line-height: 1.05;
}

.meta {
  color: var(--muted);
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.section-title {
  margin: 20px 0 10px;
  display: flex;
  justify-content: space-between;
  align-items: end;
}

.section-title h2 {
  margin: 0;
  font-size: 16px;
  letter-spacing: .03em;
}

.section-title span {
  color: var(--muted-2);
  font-size: 12px;
}

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.action-card {
  position: relative;
  min-height: 122px;
  overflow: hidden;
  padding: 16px;
  border-radius: var(--radius-xl);
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.20);
  box-shadow: 0 18px 42px rgba(0,0,0,.18);
  cursor: pointer;
  transition: all .2s ease;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  color: #f8fafc;
}

.action-card:active {
  transform: scale(.98);
}

.action-card::after {
  content: "";
  position: absolute;
  width: 98px;
  height: 98px;
  right: -32px;
  bottom: -36px;
  border-radius: 50%;
  background: rgba(255,255,255,.08);
}

.action-icon {
  font-size: 30px;
  margin-bottom: 12px;
}

.action-title {
  font-weight: 900;
  font-size: 17px;
  margin-bottom: 4px;
}

.action-desc {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.room-code-box {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 13px;
  margin-bottom: 12px;
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,.055);
  border: 1px dashed rgba(247,200,115,.25);
}

.code-title {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.code-num {
  font-size: 26px;
  font-weight: 950;
  letter-spacing: .18em;
  color: #fde68a;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  padding: 24px;
  max-width: 90%;
  width: 360px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.avatar-btn {
  width: 100%;
  aspect-ratio: 1;
  border: 2px solid rgba(255,255,255,.08);
  border-radius: 12px;
  background: rgba(255,255,255,.06);
  cursor: pointer;
  font-size: 32px;
  transition: all .2s ease;
}

.avatar-btn.active {
  border-color: rgba(247,200,115,.32);
  background: rgba(247,200,115,.15);
}

.avatar-btn:active {
  transform: scale(.95);
}

.field {
  margin-bottom: 12px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
}

.input {
  width: 100%;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(3,7,18,.48);
  color: var(--text);
  outline: 0;
  border-radius: 15px;
  padding: 14px 14px;
  font-size: 15px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
  font-family: inherit;
}

.input::placeholder {
  color: rgba(169,180,196,.58);
}

.close-mini {
  border: 0;
  width: 30px;
  height: 30px;
  border-radius: 11px;
  color: var(--muted);
  background: rgba(255,255,255,.08);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .2s ease;
}

.drawer {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%) scale(0.9);
  max-height: 74dvh;
  width: calc(100% - 32px);
  max-width: 400px;
  opacity: 0;
  pointer-events: none;
  transition: all .3s ease;
  z-index: 110;
  padding: 16px;
  border-radius: var(--radius-xl);
  background: rgba(15,23,42,.94);
  border: 1px solid rgba(255,255,255,.10);
  backdrop-filter: blur(20px);
  box-shadow: 0 22px 70px rgba(0,0,0,.45);
  overflow-y: auto;
}

.drawer.open {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
  pointer-events: auto;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 109;
  backdrop-filter: blur(4px);
  animation: fadeIn .3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.drawer-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 950;
}

.setting-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.setting-card {
  padding: 14px;
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,.055);
  border: 1px solid rgba(255,255,255,.08);
}

.setting-card label {
  display: block;
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 8px;
}

.setting-card .input {
  background: rgba(3,7,18,.36);
  min-height: 42px;
}

.board-select-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.board-option {
  padding: 12px;
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,.055);
  border: 2px solid rgba(255,255,255,.08);
  text-align: left;
  cursor: pointer;
  transition: all .2s ease;
  color: var(--text);
}

.board-option:active {
  transform: scale(.98);
}

.board-option.active {
  background: rgba(253,230,138,.12);
  border-color: #fde68a;
}

.board-name {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}

.board-info {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rooms-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.room-card {
  padding: 12px;
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.08);
  cursor: pointer;
  transition: all .2s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.room-card:active {
  transform: scale(.98);
  background: rgba(255,255,255,.08);
}

.room-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.room-id {
  font-weight: 700;
  font-size: 14px;
}

.room-info {
  font-size: 12px;
  color: var(--muted);
}

.player-count {
  font-size: 13px;
  color: var(--muted);
  min-width: 50px;
  text-align: right;
}

.btn {
  border: 0;
  outline: 0;
  min-height: 48px;
  padding: 0 16px;
  border-radius: 16px;
  color: var(--text);
  background: rgba(255,255,255,.08);
  font-weight: 800;
  font-size: 15px;
  letter-spacing: .02em;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all .2s ease;
}

.btn:active {
  transform: translateY(1px) scale(.995);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn:disabled:active {
  transform: none;
}

.btn-primary {
  color: #1e1307;
  background: linear-gradient(135deg, #fde68a, #fb923c 56%, #ef4444);
  box-shadow: 0 14px 30px rgba(239,68,68,.24);
}

.btn-primary:disabled {
  background: linear-gradient(135deg, rgba(253,230,138,.5), rgba(251,146,60,.5));
  box-shadow: none;
}

.btn-blue {
  color: #1e1307;
  background: linear-gradient(135deg, #fde68a, #fb923c 56%, #ef4444);
  box-shadow: 0 14px 30px rgba(239,68,68,.24);
}

.btn-blue {
  background: linear-gradient(135deg, #60a5fa, #7c3aed);
  box-shadow: 0 14px 28px rgba(96,165,250,.18);
}

.btn-full {
  width: 100%;
}

.btn-avatar {
  width: 100%;
  flex-direction: column;
  gap: 8px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.08);
  cursor: pointer;
  transition: all .2s ease;
}

.icon-btn:active {
  transform: scale(.95);
}
</style>
