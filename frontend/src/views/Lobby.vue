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
      <button class="icon-btn" @click="showProfileModal = true" aria-label="编辑资料">✎</button>
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
    <div class="room-code-box">
      <div>
        <div class="code-title">最近房间</div>
        <div class="code-num">839201</div>
      </div>
      <button class="btn btn-blue" @click="goToRoom">进入房间</button>
    </div>

    <!-- 用户信息模态框 -->
    <div v-if="showProfileModal" class="modal-overlay" @click.self="showProfileModal = false">
      <div class="modal-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 18px;">用户信息设置</h2>
          <button class="close-mini" @click="showProfileModal = false">×</button>
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

    <!-- 头像选择抽屉 -->
    <aside :class="['drawer', { open: showAvatarDrawer }]">
      <div class="drawer-title">
        选择头像
        <button class="close-mini" @click="showAvatarDrawer = false">×</button>
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

    <!-- 抽屉菜单 - 创建房间 -->
    <aside :class="['drawer', { open: activeDrawer === 'createDrawer' }]">
      <div class="drawer-title">
        新建房间
        <button class="close-mini" @click="closeDrawers()">×</button>
      </div>
      <div class="setting-grid">
        <div class="setting-card">
          <label>人数</label>
          <select class="input" style="appearance: none;">
            <option>12 人</option>
            <option>10 人</option>
            <option>9 人</option>
            <option>8 人</option>
            <option>6 人</option>
          </select>
        </div>
        <div class="setting-card">
          <label>板子</label>
          <select class="input" style="appearance: none;">
            <option>预女猎白</option>
            <option>预女猎守</option>
            <option>狼王守卫</option>
          </select>
        </div>
        <div class="setting-card">
          <label>发言时长</label>
          <select class="input" style="appearance: none;">
            <option>60 秒</option>
            <option>90 秒</option>
            <option>120 秒</option>
          </select>
        </div>
        <div class="setting-card">
          <label>房间权限</label>
          <select class="input" style="appearance: none;">
            <option>好友可见</option>
            <option>公开</option>
            <option>私密</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-full" style="margin-top: 14px" @click="createRoom">创建并进入房间</button>
    </aside>

    <!-- 抽屉菜单 - 加入房间 -->
    <aside :class="['drawer', { open: activeDrawer === 'joinDrawer' }]">
      <div class="drawer-title">
        加入房间
        <button class="close-mini" @click="closeDrawers()">×</button>
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import AppLayout from '../components/AppLayout.vue'
import api from '../api/client'

const router = useRouter()
const gameStore = useGameStore()

const activeDrawer = ref('')
const profileNickname = ref(gameStore.nickname)
const profileAvatar = ref(gameStore.avatar || '🧙')
const joinRoomCode = ref('')
const showToast = ref(false)
const toastMessage = ref('')
const showProfileModal = ref(false)
const showAvatarDrawer = ref(false)

const avatarOptions = ['🧙', '🐺', '🧪', '🏹', '🎭', '🌾', '👻', '🐉', '🦅', '🦊', '🐻', '🦁', '🐼', '🐨', '🐯', '🦓', '🦘', '🐘', '🦏', '🦝', '🦚', '🦜', '🦆', '🦉']

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
  gameStore.avatar = avatar
  localStorage.setItem('avatar', avatar)

  // 立即同步到环信
  api.put(`/api/auth/user/${gameStore.username}`, {
    avatar: avatar
  }).then(res => {
    console.log('✅ 头像已同步到环信:', res.data)
    toast('头像已更新')
  }).catch(err => {
    console.error('❌ 同步到环信失败:', err)
    toast('同步失败，请重试')
  })

  showAvatarDrawer.value = false
}

function saveProfile() {
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

function createRoom() {
  router.push('/room/839201')
  closeDrawers()
}

function joinRoom() {
  if (!joinRoomCode.value) {
    toast('请输入房间号')
    return
  }
  router.push(`/room/${joinRoomCode.value}`)
  closeDrawers()
}

function goToRoom() {
  router.push('/room/839201')
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
  font-size: 18px;
}

.drawer {
  position: fixed;
  inset: auto 12px calc(82px + var(--safe-bottom)) 12px;
  max-height: 74dvh;
  transform: translateY(18px);
  opacity: 0;
  pointer-events: none;
  transition: .2s ease;
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
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
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

.btn-primary {
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
  display: grid;
  place-items: center;
  color: var(--text);
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.08);
  cursor: pointer;
  font-size: 18px;
  transition: all .2s ease;
}

.icon-btn:active {
  transform: scale(.95);
}
</style>
