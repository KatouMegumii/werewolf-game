<template>
  <AppLayout title="板子配置" :showToast="showToast" :toastMessage="toastMessage">
    <!-- 板子配置 -->
    <div class="section-title">
      <h2>{{ getTotalPlayers }} 人自定义局</h2>
    </div>
    <section class="card config-card">
      <div class="config-head">
        <div>
          <div class="config-name">12 人预女猎白</div>
          <div class="config-sub">4 狼 · 4 神 · 4 民，可手动调整角色数量</div>
        </div>
        <span class="pill blue">推荐</span>
      </div>

      <div class="role-list">
        <div v-for="role in roles" :key="role.key" class="role-row">
          <div class="role-icon">{{ role.emoji }}</div>
          <div>
            <div class="role-name">{{ role.name }}</div>
            <div class="role-tip">{{ role.desc }}</div>
          </div>
          <div class="counter">
            <button @click="role.count = Math.max(0, role.count - 1)">−</button>
            <b>{{ role.count }}</b>
            <button @click="role.count = Math.min(12, role.count + 1)">＋</button>
          </div>
        </div>
      </div>
    </section>

    <p style="color: var(--muted); line-height: 1.7; margin: 20px 0 12px; font-size: 13px; padding: 0 16px;">
      当前为 {{ getTotalPlayers }} 人自定义局。狼人阵营 {{ getTotalWolves }} 人，好人阵营 {{ getTotalGood }} 人。
    </p>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 16px; margin-bottom: 20px;">
      <button class="btn btn-ghost" @click="resetRoles">恢复默认</button>
      <button class="btn btn-primary" @click="saveRoles">保存板子</button>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import AppLayout from '../components/AppLayout.vue'

const showToast = ref(false)
const toastMessage = ref('')

const roles = ref([
  { key: 'wolf', name: '狼人', emoji: '🐺', desc: '夜晚睁眼，协作刀人', count: 4 },
  { key: 'seer', name: '预言家', emoji: '🔮', desc: '每晚查验一名玩家身份', count: 1 },
  { key: 'witch', name: '女巫', emoji: '🧪', desc: '拥有解药与毒药', count: 1 },
  { key: 'hunter', name: '猎人', emoji: '🏹', desc: '出局时可带走一人', count: 1 },
  { key: 'idiot', name: '白痴', emoji: '🎭', desc: '被投出后可翻牌免死', count: 1 },
  { key: 'villager', name: '平民', emoji: '🌾', desc: '依靠发言找狼', count: 4 }
])

const getTotalPlayers = computed(() => {
  return roles.value.reduce((sum, role) => sum + role.count, 0)
})

const getTotalWolves = computed(() => {
  return roles.value.find(r => r.key === 'wolf')?.count || 0
})

const getTotalGood = computed(() => {
  return getTotalPlayers.value - getTotalWolves.value
})

function toast(message: string) {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 1600)
}

function resetRoles() {
  roles.value.forEach(role => {
    if (role.key === 'wolf') role.count = 4
    else if (role.key === 'villager') role.count = 4
    else role.count = 1
  })
  toast('已恢复默认板子')
}

function saveRoles() {
  toast('板子已保存')
}
</script>

<style scoped>
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

.config-card {
  padding: 16px;
  margin-bottom: 20px;
}

.config-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  margin-bottom: 14px;
}

.config-name {
  font-size: 18px;
  font-weight: 900;
}

.config-sub {
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
}

.role-list {
  display: grid;
  gap: 10px;
}

.role-row {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 17px;
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.07);
}

.role-icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(255,255,255,.08);
  font-size: 18px;
  flex: 0 0 auto;
}

.role-name {
  font-weight: 800;
  font-size: 14px;
}

.role-tip {
  color: var(--muted-2);
  font-size: 11px;
  margin-top: 2px;
}

.counter {
  display: inline-grid;
  grid-template-columns: 30px 28px 30px;
  align-items: center;
  height: 32px;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(3,7,18,.34);
}

.counter button {
  border: 0;
  height: 32px;
  background: transparent;
  color: var(--muted);
  font-size: 16px;
  cursor: pointer;
}

.counter b {
  text-align: center;
  font-size: 13px;
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

.btn-ghost {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
}
</style>
