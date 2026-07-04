import { createRouter, createWebHistory } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import Login from '../views/Login.vue'
import Lobby from '../views/Lobby.vue'
import Config from '../views/Config.vue'
import Room from '../views/Room.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/lobby',
    name: 'Lobby',
    component: Lobby,
    meta: { requiresAuth: true }
  },
  {
    path: '/config',
    name: 'Config',
    component: Config,
    meta: { requiresAuth: true }
  },
  {
    path: '/room/:roomId',
    name: 'Room',
    component: Room,
    meta: { requiresAuth: true }
  },
  {
    path: '/',
    redirect: '/lobby'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由guards - 检查认证状态
router.beforeEach((to, from, next) => {
  const gameStore = useGameStore()

  if (to.meta.requiresAuth && !gameStore.isLoggedIn) {
    // 需要认证但未登录，跳转到登录页
    next('/login')
  } else if (to.path === '/login' && gameStore.isLoggedIn) {
    // 已登录但访问登录页，跳转到大厅
    next('/')
  } else {
    next()
  }
})

export default router
