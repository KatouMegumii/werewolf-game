import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000
})

// 请求拦截器：自动添加userId
client.interceptors.request.use(config => {
  const userId = localStorage.getItem('userId')
  if (userId) {
    config.headers['x-user-id'] = userId
  }
  return config
})

export default client
