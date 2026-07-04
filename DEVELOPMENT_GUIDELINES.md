# 🎮 狼人杀游戏 - 开发规范

## Drawer（抽屉）规范

### 📋 基本原则

**Drawer必须阻止用户与底层页面交互，防止点击穿透。**

### ✅ 正确的Drawer实现

#### 1. 必须有Overlay

每个drawer都需要对应的overlay元素：

```vue
<!-- 抽屉的overlay -->
<div
  v-if="showDrawer"
  class="drawer-overlay"
  @click="closeDrawer()"
></div>

<!-- 抽屉内容 -->
<aside :class="['drawer', { open: showDrawer }]">
  <!-- 内容 -->
</aside>
```

#### 2. Overlay样式规范

```css
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 109;  /* 必须小于drawer的z-index */
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
```

#### 3. Drawer样式规范

```css
.drawer {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%) scale(0.9);
  max-height: 74dvh;
  width: calc(100% - 32px);
  max-width: 400px;
  opacity: 0;
  pointer-events: none;  /* 必须：关闭时阻止交互 */
  transition: all .3s ease;
  z-index: 110;  /* 必须大于overlay的z-index */
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
  pointer-events: auto;  /* 必须：打开时允许交互 */
}
```

### ❌ 常见错误

**错误1：使用伪元素作为overlay**
```css
/* ❌ 不要这样做 */
.drawer::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
}
```
**问题**：z-index为负时无法阻止点击穿透

**错误2：overlay的z-index高于drawer**
```css
/* ❌ 不要这样做 */
.drawer-overlay { z-index: 110; }  /* 高于drawer */
.drawer { z-index: 109; }          /* 低于overlay */
```
**问题**：用户点击不了drawer内的按钮

**错误3：drawer打开时没有设置pointer-events**
```css
/* ❌ 不要这样做 */
.drawer {
  pointer-events: none;  /* 永远关闭 */
}
```
**问题**：drawer内的按钮永远点不了

**错误4：没有overlay**
```vue
<!-- ❌ 不要这样做 -->
<aside :class="['drawer', { open: showDrawer }]">
  <!-- 用户可以点击下面的页面 -->
</aside>
```
**问题**：完全无法阻止点击穿透

### 📝 完整示例

**Template部分**：
```vue
<!-- Overlay元素 -->
<div
  v-if="showModal"
  class="drawer-overlay"
  @click="closeModal()"
></div>

<!-- Drawer元素 -->
<aside :class="['drawer', { open: showModal }]">
  <div class="drawer-title">
    标题
    <button @click="closeModal()">关闭</button>
  </div>
  <!-- 内容 -->
</aside>
```

**Script部分**：
```typescript
const showModal = ref(false)

function closeModal() {
  showModal.value = false
}
```

**Style部分**：
```css
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 109;
  backdrop-filter: blur(4px);
  animation: fadeIn .3s ease;
}

.drawer {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%) scale(0.9);
  opacity: 0;
  pointer-events: none;
  transition: all .3s ease;
  z-index: 110;
  /* ... 其他样式 */
}

.drawer.open {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
  pointer-events: auto;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### 🔍 检查清单

创建新的drawer时：

- [ ] 创建了对应的overlay元素 (`v-if="showXxx"`)
- [ ] overlay的z-index是109
- [ ] drawer的z-index是110
- [ ] drawer有`pointer-events: none`（关闭时）
- [ ] drawer.open有`pointer-events: auto`（打开时）
- [ ] overlay有`@click="closeDrawer()"`用于点击外部关闭
- [ ] drawer内有关闭按钮
- [ ] 测试了点击drawer外部是否能关闭
- [ ] 测试了点击drawer内的按钮是否有效

### 🧪 测试方法

1. 打开drawer
2. 尝试点击drawer外的按钮
   - ❌ 不应该触发任何操作
   - ✅ 应该看到不能点击的效果（鼠标样式改变）
3. 尝试点击drawer内的按钮
   - ✅ 应该正常工作
4. 点击drawer外的overlay区域
   - ✅ 应该关闭drawer
5. 点击drawer内的任何地方
   - ❌ 不应该关闭drawer

---

## 其他规范

### Modal（模态框）

Modal与Drawer相同的规范适用。overlay必须阻止底层交互。

### Toast（吐司提示）

Toast通常不需要overlay，但如果需要阻止用户交互，也要添加overlay。

---

## 已应用的地方

✅ **Lobby.vue**
- 头像选择drawer
- 创建房间drawer
- 加入房间drawer

✅ **Config.vue**
- 编辑板子drawer
- 角色信息drawer
- 角色详情drawer

✅ **Room.vue**
- 复制房间号弹窗

---

## 变更历史

**2026-07-04**
- 创建开发规范
- 修复所有drawer的点击穿透问题
- 标准化overlay实现
