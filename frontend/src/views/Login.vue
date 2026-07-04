<template>
  <div class="login-screen">
    <div class="brand-area">
      <div class="moon"></div>
      <div class="wolf-mark">🐺</div>
      <h1 class="title">嘉豪嘉欣狼人杀</h1>
    </div>

    <div class="auth-card">
      <div class="segmented" role="tablist">
        <button
          :class="{ active: mode === 'login' }"
          @click="mode = 'login'"
          type="button"
        >
          登录
        </button>
        <button
          :class="{ active: mode === 'register' }"
          @click="mode = 'register'"
          type="button"
        >
          注册
        </button>
      </div>

      <!-- 登录表单 -->
      <form v-if="mode === 'login'" class="form active" @submit.prevent="handleLoginUser">
        <div class="field">
          <div class="label-row">
            <span>账号</span>
            <span>忘记密码？</span>
          </div>
          <input
            v-model="loginUsername"
            class="input"
            placeholder="请输入账号"
            @keyup.enter="handleLoginUser"
          />
        </div>
        <div class="field">
          <div class="label-row"><span>密码</span></div>
          <input
            v-model="loginPassword"
            type="password"
            class="input"
            placeholder="请输入密码"
            @keyup.enter="handleLoginUser"
          />
        </div>
        <button class="btn btn-primary btn-full" type="submit" :disabled="loading">
          {{ loading ? '登录中...' : '进入大厅' }}
        </button>
        <p class="helper">登录后可创建房间、加入房间并配置角色板子</p>
        <div v-if="error" class="error-message">{{ error }}</div>
      </form>

      <!-- 注册表单 -->
      <form v-if="mode === 'register'" class="form active" @submit.prevent="handleRegister">
        <div class="field">
          <div class="label-row">
            <span>账号（英文+数字）</span>
            <span>作为登录凭证</span>
          </div>
          <input
            v-model="username"
            class="input"
            placeholder="例如：player001"
            @keyup.enter="handleRegister"
          />
        </div>
        <div class="field">
          <div class="label-row">
            <span>昵称</span>
            <span>房间内显示</span>
          </div>
          <input
            v-model="nickname"
            class="input"
            placeholder="例如：月下预言家"
            @keyup.enter="handleRegister"
          />
        </div>
        <div class="field">
          <div class="label-row"><span>密码</span><span>至少 6 位</span></div>
          <input
            v-model="password"
            type="password"
            class="input"
            placeholder="设置登录密码"
            @keyup.enter="handleRegister"
          />
        </div>
        <button class="btn btn-primary btn-full" type="submit" :disabled="loading">
          {{ loading ? '注册中...' : '创建账号' }}
        </button>
        <p class="helper">新用户自动注册，重复账号会注册失败</p>
        <div v-if="error" class="error-message">{{ error }}</div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import api from '../api/client'

const router = useRouter()
const gameStore = useGameStore()

const mode = ref<'login' | 'register'>('login')
const loginUsername = ref('')
const loginPassword = ref('')
const username = ref('')
const nickname = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const handleLoginUser = async () => {
  error.value = ''

  if (!loginUsername.value.trim()) {
    error.value = '请输入账号'
    return
  }

  if (!loginPassword.value) {
    error.value = '请输入密码'
    return
  }

  loading.value = true

  try {
    const res = await api.post('/api/auth/login', {
      username: loginUsername.value.trim(),
      password: loginPassword.value
    })

    const { userId, nickname: userNickname, avatar, appKey } = res.data

    gameStore.setCurrentUser({
      userId,
      username: loginUsername.value.trim(),
      nickname: userNickname,
      avatar: avatar || '🧙',
      easemobUser: userId,
      easemobPassword: loginPassword.value,
      appKey
    })

    router.push('/')
  } catch (err: any) {
    const errorMsg = err.response?.data?.details?.error_description ||
                     err.response?.data?.error ||
                     '登录失败，请检查账号和密码'
    error.value = errorMsg
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  error.value = ''

  if (!username.value.trim()) {
    error.value = '请输入账号'
    return
  }

  if (!nickname.value.trim()) {
    error.value = '请输入昵称'
    return
  }

  if (!/^[a-zA-Z0-9]+$/.test(username.value.trim())) {
    error.value = '账号只能包含英文和数字'
    return
  }

  if (!password.value || password.value.length < 6) {
    error.value = '密码至少6位'
    return
  }

  loading.value = true

  try {
    const res = await api.post('/api/auth/register', {
      username: username.value.trim(),
      nickname: nickname.value.trim(),
      password: password.value
    })

    const { userId, avatar, appKey } = res.data

    gameStore.setCurrentUser({
      userId,
      username: username.value.trim(),
      nickname: nickname.value.trim(),
      avatar: avatar || '🧙',
      easemobUser: userId,
      easemobPassword: password.value,
      appKey
    })

    router.push('/')
  } catch (err: any) {
    const errorMsg = err.response?.data?.details?.error_description ||
                     err.response?.data?.error ||
                     '注册失败，请重试'
    error.value = errorMsg
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.brand-area {
  position: relative;
  min-height: 260px;
  padding: 36px 24px 20px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.moon {
  position: absolute;
  width: 126px;
  height: 126px;
  border-radius: 50%;
  top: 34px;
  right: 28px;
  background:
    radial-gradient(circle at 35% 30%, #fff8d5 0 8%, transparent 9%),
    radial-gradient(circle at 72% 58%, rgba(140,110,66,.22) 0 10%, transparent 11%),
    radial-gradient(circle at 48% 62%, rgba(140,110,66,.16) 0 7%, transparent 8%),
    linear-gradient(135deg, #fff7cc, #e5b95f 80%);
  box-shadow: 0 0 42px rgba(247,200,115,.48);
  opacity: .96;
}

.wolf-mark {
  width: 82px;
  height: 82px;
  border-radius: 28px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, rgba(247,200,115,.22), rgba(239,68,68,.16));
  border: 1px solid rgba(247,200,115,.24);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 18px 42px rgba(0,0,0,.32);
  font-size: 42px;
  margin-bottom: 18px;
}

.title {
  font-size: 34px;
  line-height: 1;
  margin: 0;
  letter-spacing: .08em;
}

.subtitle {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14px;
}

.auth-card {
  margin: -4px 16px 0;
  padding: 16px;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.08);
  margin-bottom: 18px;
}

.segmented button {
  height: 42px;
  border: 0;
  color: var(--muted);
  background: transparent;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s ease;
}

.segmented button.active {
  color: #15100a;
  background: linear-gradient(135deg, #fde68a, #fb923c);
  box-shadow: 0 8px 18px rgba(249,115,22,.22);
}

.form {
  display: block;
}

.helper {
  margin: 12px 2px 0;
  color: var(--muted-2);
  font-size: 12px;
  text-align: center;
}

.error-message {
  margin-top: 12px;
  padding: 10px;
  background: rgba(239,68,68,.10);
  border: 1px solid rgba(239,68,68,.24);
  border-radius: 12px;
  color: #fecaca;
  font-size: 12px;
  text-align: center;
}
</style>
