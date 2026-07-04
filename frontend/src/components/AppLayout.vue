<template>
  <div class="app-layout">
    <header class="topbar">
      <div class="topbar-title">
        <span>🐺</span>
        <span>{{ title }}</span>
      </div>
      <button class="logout-btn" @click="handleLogout" aria-label="退出登录">登出</button>
    </header>

    <div class="scroll">
      <slot></slot>
    </div>

    <nav class="bottom-nav">
      <button
        class="nav-item"
        :class="{ active: currentRoute === 'lobby' }"
        @click="goToLobby"
      >
        <i>🏠</i><span>大厅</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: currentRoute === 'config' }"
        @click="goToConfig"
      >
        <i>🎲</i><span>板子</span>
      </button>
    </nav>

    <!-- Toast提示 -->
    <div :class="['toast', { show: showToast }]">{{ toastMessage }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/gameStore'

const router = useRouter()
const route = useRoute()
const gameStore = useGameStore()

interface Props {
  title: string
  showToast?: boolean
  toastMessage?: string
}

withDefaults(defineProps<Props>(), {
  showToast: false,
  toastMessage: ''
})

const currentRoute = computed(() => {
  if (route.path === '/lobby') return 'lobby'
  if (route.path === '/config') return 'config'
  return ''
})

function goToLobby() {
  router.push('/lobby')
}

function goToConfig() {
  router.push('/config')
}

function handleLogout() {
  if (confirm('确认要退出登录吗？')) {
    gameStore.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.app-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: calc(58px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 14px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  border-bottom: 1px solid rgba(255,255,255,.06);
  background: rgba(3,7,18,.24);
  backdrop-filter: blur(16px);
}

.topbar-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
  letter-spacing: .04em;
  font-size: 18px;
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

.logout-btn {
  padding: 8px 16px;
  border: 0;
  border-radius: 10px;
  background: #ef4444;
  color: #fff;
  font-size: 18px;
  font-weight: 900;
  cursor: pointer;
  transition: all .2s ease;
}

.logout-btn:active {
  transform: scale(.95);
}

.logout-btn:hover {
  background: #dc2626;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px 16px calc(24px + var(--safe-bottom));
  scrollbar-width: none;
}

.scroll::-webkit-scrollbar {
  display: none;
}

.bottom-nav {
  height: calc(66px + var(--safe-bottom));
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px 14px calc(8px + var(--safe-bottom));
  background: rgba(3,7,18,.72);
  backdrop-filter: blur(18px);
  border-top: 1px solid rgba(255,255,255,.08);
}

.nav-item {
  border: 0;
  border-radius: 18px;
  color: var(--muted-2);
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: all .2s ease;
}

.nav-item.active {
  color: #fde68a;
  background: rgba(247,200,115,.10);
}

.nav-item i {
  font-style: normal;
  font-size: 18px;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(92px + var(--safe-bottom));
  transform: translateX(-50%) translateY(10px);
  min-width: 200px;
  max-width: calc(100% - 40px);
  padding: 11px 14px;
  border-radius: 999px;
  text-align: center;
  color: #111827;
  background: #fde68a;
  font-size: 13px;
  font-weight: 900;
  opacity: 0;
  pointer-events: none;
  transition: .22s ease;
  z-index: 111;
  box-shadow: 0 16px 35px rgba(0,0,0,.28);
}

.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
