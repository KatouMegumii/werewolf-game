<template>
  <AppLayout title="板子配置" :showToast="showToast" :toastMessage="toastMessage">
    <!-- 新增板子按钮 -->
    <div style="padding: 0 16px; margin: 12px 0; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
      <button class="btn btn-primary btn-full" @click="createNewBoard" style="flex: 1;">
        <span>＋</span><span>新增板子</span>
      </button>
      <button :class="['filter-icon-btn', { active: showFavoriteOnly }]" @click="showFavoriteOnly = !showFavoriteOnly" title="我收藏">
        <Heart :size="20" :fill="showFavoriteOnly ? 'currentColor' : 'none'" />
      </button>
    </div>

    <!-- 板子列表 -->
    <div style="padding: 0 16px; display: grid; gap: 12px; margin-bottom: 20px;">
      <section v-for="(board, index) in filteredBoards" :key="index" class="board-card">
        <div class="card-header">
          <div class="board-name">{{ board.name }}</div>
          <div class="card-actions">
            <button
              :class="['action-icon', { active: board.isFavorite }]"
              @click="toggleFavorite(index)"
              title="收藏"
            >
              <Heart :size="18" :fill="board.isFavorite ? 'currentColor' : 'none'" />
            </button>
            <button class="action-icon" @click="editBoard(index)" title="编辑">
              <Edit2 :size="18" />
            </button>
            <button
              class="action-icon delete"
              @click="deleteBoard(index)"
              :disabled="filteredBoards.length <= 1"
              title="删除"
            >
              <Trash2 :size="18" />
            </button>
          </div>
        </div>
        <div class="card-badges">
          <span class="badge">{{ board.gameConfig?.cardType || '单身份' }}</span>
          <span class="player-count">{{ getPlayerCount(board) }}人</span>
        </div>
        <div class="card-content">
          {{ board.summary }}
        </div>
      </section>
    </div>

    <!-- 编辑板子抽屉的overlay -->
    <div
      v-if="editingIndex !== null"
      class="drawer-overlay"
      @click="editingIndex = null"
    ></div>

    <!-- 编辑板子抽屉 -->
    <aside :class="['drawer', { open: editingIndex !== null }]">
      <template v-if="editingIndex !== null">
        <!-- 固定顶部：名称 -->
        <div class="drawer-header">
          <div class="name-input-group">
            <button class="back-btn" @click="editingIndex = null" title="返回">
              <ChevronLeft :size="20" />
            </button>
            <input
              v-model="boards[editingIndex].name"
              class="name-input"
              placeholder="输入板子名称"
            />
            <button class="info-btn" @click="showRoleInfo = true; activeCategory = '狼人阵营'" title="角色介绍">
              <Info :size="18" />
            </button>
          </div>
        </div>

        <!-- 上部分：已选角色（可滑动）-->
        <div class="drawer-top">
          <div class="selected-roles">
            <div class="section-label">已选角色</div>
            <div class="selected-grid">
              <div
                v-for="role in boards[editingIndex].roles"
                :key="role.key"
                class="selected-role-card"
              >
                <div class="role-header">
                  <span class="role-emoji">{{ role.emoji }}</span>
                  <span class="role-count">×{{ role.count }}</span>
                </div>
                <div class="role-name">{{ role.name }}</div>
                <div class="role-actions">
                  <button @click="decrementRole(editingIndex, role.key)">−</button>
                  <button @click="incrementRole(editingIndex, role.key)">＋</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 下部分：角色选择tab -->
        <div class="drawer-bottom">
          <div class="role-tabs">
            <button
              v-for="category in roleCategories"
              :key="category"
              :class="['tab', { active: activeCategory === category }]"
              @click="activeCategory = category"
            >
              {{ category }}
            </button>
          </div>

          <!-- 角色网格 -->
          <div v-if="activeCategory !== '规则'" class="roles-pool">
            <div
              v-for="role in getRolesByCategory(activeCategory)"
              :key="role.key"
              :class="['pool-role', { selected: isRoleSelected(editingIndex, role.key) }]"
              @click="toggleRole(editingIndex, role.key)"
            >
              <div class="emoji">{{ role.emoji }}</div>
              <div class="name">{{ role.name }}</div>
            </div>
          </div>

          <!-- 规则 -->
          <div v-else class="game-config-panel">
            <div class="config-item">
              <span class="config-label">发牌方式</span>
              <div class="config-options">
                <button
                  v-for="opt in ['单身份', '双身份']"
                  :key="opt"
                  :class="['config-btn', { active: (boards[editingIndex].gameConfig?.cardType || '单身份') === opt }]"
                  @click="boards[editingIndex].gameConfig = boards[editingIndex].gameConfig || {}; boards[editingIndex].gameConfig!.cardType = opt as '单身份' | '双身份'"
                >
                  {{ opt }}
                </button>
              </div>
            </div>

            <div class="config-item">
              <span class="config-label">狼人胜利条件</span>
              <div class="config-options">
                <button
                  v-for="opt in ['屠边', '屠城']"
                  :key="opt"
                  :class="['config-btn', { active: (boards[editingIndex].gameConfig?.wolfVictory || '屠边') === opt }]"
                  @click="boards[editingIndex].gameConfig = boards[editingIndex].gameConfig || {}; boards[editingIndex].gameConfig!.wolfVictory = opt as '屠边' | '屠城'"
                >
                  {{ opt }}
                </button>
              </div>
            </div>

            <div class="config-item">
              <span class="config-label">出局是否亮牌</span>
              <div class="config-options">
                <button
                  v-for="opt in ['亮牌', '暗牌']"
                  :key="opt"
                  :class="['config-btn', { active: (boards[editingIndex].gameConfig?.cardFlip || '亮牌') === opt }]"
                  @click="boards[editingIndex].gameConfig = boards[editingIndex].gameConfig || {}; boards[editingIndex].gameConfig!.cardFlip = opt as '亮牌' | '暗牌'"
                >
                  {{ opt }}
                </button>
              </div>
            </div>

            <div class="config-item">
              <span class="config-label">女巫首夜可自救</span>
              <div class="config-options">
                <button
                  v-for="opt in ['可', '不可']"
                  :key="opt"
                  :class="['config-btn', { active: (boards[editingIndex].gameConfig?.witchSelfHeal || '可') === opt }]"
                  @click="boards[editingIndex].gameConfig = boards[editingIndex].gameConfig || {}; boards[editingIndex].gameConfig!.witchSelfHeal = opt as '可' | '不可'"
                >
                  {{ opt }}
                </button>
              </div>
            </div>

            <div class="config-item">
              <span class="config-label">警长竞选</span>
              <div class="config-options">
                <button
                  v-for="opt in ['有', '无']"
                  :key="opt"
                  :class="['config-btn', { active: (boards[editingIndex].gameConfig?.chiefElection || '有') === opt }]"
                  @click="boards[editingIndex].gameConfig = boards[editingIndex].gameConfig || {}; boards[editingIndex].gameConfig!.chiefElection = opt as '有' | '无'"
                >
                  {{ opt }}
                </button>
              </div>
            </div>

            <div v-if="boards[editingIndex].gameConfig?.chiefElection === '有'" class="config-item">
              <span class="config-label">自爆吞警徽</span>
              <div class="config-options">
                <button
                  v-for="opt in ['单爆', '双爆']"
                  :key="opt"
                  :class="['config-btn', { active: (boards[editingIndex].gameConfig?.doubleExplode || '单爆') === opt }]"
                  @click="boards[editingIndex].gameConfig = boards[editingIndex].gameConfig || {}; boards[editingIndex].gameConfig!.doubleExplode = opt as '单爆' | '双爆'"
                >
                  {{ opt }}
                </button>
              </div>
            </div>

            <div class="config-item">
              <span class="config-label">自爆后首页可交流</span>
              <div class="config-options">
                <button
                  v-for="opt in ['是', '否']"
                  :key="opt"
                  :class="['config-btn', { active: (boards[editingIndex].gameConfig?.chatAfterExplode || '是') === opt }]"
                  @click="boards[editingIndex].gameConfig = boards[editingIndex].gameConfig || {}; boards[editingIndex].gameConfig!.chatAfterExplode = opt as '是' | '否'"
                >
                  {{ opt }}
                </button>
              </div>
            </div>
          </div>

          <div class="drawer-actions">
            <button class="btn btn-ghost" @click="resetRoles(editingIndex)">恢复默认</button>
            <button class="btn btn-primary" @click="saveRoles(editingIndex)">保存板子</button>
          </div>
        </div>
      </template>
    </aside>

    <!-- 角色介绍抽屉的overlay -->
    <div
      v-if="showRoleInfo"
      class="role-info-overlay"
      @click="showRoleInfo = false"
    ></div>

    <!-- 角色介绍抽屉 -->
    <aside :class="['role-info-drawer', { open: showRoleInfo }]">
      <div class="role-info-header">
        <h3>角色介绍</h3>
        <button class="close-btn" @click="showRoleInfo = false">
          <X :size="20" />
        </button>
      </div>

      <div class="role-info-tabs">
        <button
          v-for="category in ['狼人阵营', '好人阵营', '第三方']"
          :key="category"
          :class="['role-info-tab', { active: activeCategory === category }]"
          @click="activeCategory = category"
        >
          {{ category }}
        </button>
      </div>

      <div class="role-info-list">
        <div v-for="role in getRolesByCategory(activeCategory)" :key="role.key" class="role-info-item" @click="selectedRole = role">
          <div class="role-avatar">{{ role.emoji }}</div>
          <div class="role-details">
            <div class="role-info-name">{{ role.name }}</div>
            <div class="role-info-desc">{{ role.desc }}</div>
          </div>
        </div>
      </div>
    </aside>

    <!-- 角色详情抽屉的overlay -->
    <div
      v-if="selectedRole"
      class="role-detail-overlay"
      @click="selectedRole = null"
    ></div>

    <!-- 角色详情抽屉 -->
    <aside :class="['role-detail-drawer', { open: selectedRole !== null }]">
      <template v-if="selectedRole">
        <div class="role-detail-header">
          <h3>{{ selectedRole.name }}</h3>
          <button class="close-btn" @click="selectedRole = null">
            <X :size="20" />
          </button>
        </div>

        <div class="role-detail-content">
          <div class="detail-section">
            <h4>技能</h4>
            <p>{{ selectedRole.fullDesc }}</p>
          </div>

          <div v-if="selectedRole.supplement" class="detail-section">
            <h4>技能补充</h4>
            <div class="supplement-text">{{ selectedRole.supplement }}</div>
          </div>
        </div>
      </template>
    </aside>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Heart, Edit2, Trash2, Info, ChevronLeft, X } from 'lucide-vue-next'
import AppLayout from '../components/AppLayout.vue'
import api from '../api/client'

const showToast = ref(false)
const toastMessage = ref('')
const editingIndex = ref<number | null>(null)
const activeCategory = ref('狼人阵营')
const showFavoriteOnly = ref(false)
const showRoleInfo = ref(false)
const showAlert = ref(false)
const alertMessage = ref('')
const selectedRole = ref<Role | null>(null)

interface Role {
  key: string
  name: string
  emoji: string
  desc: string
  category: string
  count: number
  fullDesc?: string  // 完整技能描述
  supplement?: string  // 技能补充
}

interface Board {
  name: string
  summary: string
  roles: Role[]
  isFavorite?: boolean
  gameConfig?: GameConfig
}

interface GameConfig {
  wolfVictory: '屠边' | '屠城'
  cardFlip: '亮牌' | '暗牌'
  witchSelfHeal: '可' | '不可'
  chiefElection: '有' | '无'
  doubleExplode: '单爆' | '双爆'
  chatAfterExplode: '是' | '否'
  cardType: '单身份' | '双身份'
}

const roleCategories = ['狼人阵营', '好人阵营', '第三方', '规则']

const allRoles: Role[] = [
  // 狼人阵营
  { key: 'wolf', name: '狼人', emoji: '🐺', desc: '月黑风高狼刀夜', category: '狼人阵营', count: 0, fullDesc: '【刀人/投票或被投票】', supplement: '月黑风高狼刀夜' },
  { key: 'wolf_king', name: '狼王', emoji: '👑', desc: '出局后可用利爪袭击一名玩家至其出局', category: '狼人阵营', count: 0, fullDesc: '【爪袭】：出局后可用利爪袭击一名玩家至其出局', supplement: '1. 狼王被奶穿可以发动技能\n2. 狼王被梦、魅惑等出局不能发动技能\n3. 狼王可以自爆或自刀，自刀可发动技能，自爆后不能发动技能\n4. 狼王作为最后一个狼人出局不能发动技能' },
  { key: 'white_wolf_king', name: '白狼王', emoji: '⚪', desc: '白天自爆时，选择带走一名玩家', category: '狼人阵营', count: 0, fullDesc: '【超·自爆】：白狼王可以在白天自爆的时候（包括上警环节），选择带走一名玩家', supplement: '1. 白狼王可以自爆或自刀\n2. 白狼王非自爆出局不可发动技能' },
  { key: 'wolf_beauty', name: '狼美人', emoji: '💄', desc: '夜里魅惑一人，出局时被魅惑的玩家跟随出局', category: '狼人阵营', count: 0, fullDesc: '【魅惑】：狼美人在夜里可以魅惑一人，天亮后，如果狼美人被毒/梦/放逐出局或者被猎人等射杀出局，被魅惑的玩家跟随狼美人一起出局，且无技能', supplement: '1. 狼美人不可以自爆或自刀\n2. 被魅惑的玩家夜间并不知情，殉情出局的玩家不能发动技能\n3. 狼美人若被决斗魅惑技能失效' },
  { key: 'nightmare', name: '梦魇', emoji: '😈', desc: '每晚恐惧一名玩家，使其当夜无法行动', category: '狼人阵营', count: 0, fullDesc: '【恐惧】：每晚在其他所有人行动之前恐惧一名玩家，使其当夜无法行动。若对方为狼人，则整个狼人阵营也无法进行袭击。不能连续两晚恐惧同一名玩家，首夜进行恐惧时与其他狼人并不互知身份', supplement: '1. 梦魇可以自爆或自刀\n2. 梦魇不可以对自己使用技能\n3. 梦魇可以主动放弃使用技能\n4. 若梦魇当晚对猎人使用技能，猎人当晚被狼人袭击，则第二天白天无法开枪；如猎人被投票出局则可开枪\n5. 在双药都使用的情况下，女巫不可以知道自己被梦魇恐惧\n6. 梦魇除在首夜外，不可以恐惧狼队友' },
  { key: 'evil_knight', name: '恶灵骑士', emoji: '⚔️', desc: '若被预言家查验出局，次日预言家出局；若被女巫毒药出局，次日女巫出局', category: '狼人阵营', count: 0, fullDesc: '【反伤】：恶灵骑士拥有一次性的反伤技能：若被预言家查验，次日预言家出局；若被女巫使用毒药，次日女巫出局', supplement: '1. 恶灵骑士不可以自爆或自刀\n2. 恶灵骑士免疫夜间任何伤害\n3. 女巫不能救活中了恶灵骑士反伤技能的预言家' },
  { key: 'stone_gargoyle', name: '石像鬼', emoji: '🗿', desc: '每晚可以查验一名玩家的具体身份；被预言家查验始终显示为狼人', category: '狼人阵营', count: 0, fullDesc: '【探查】：每晚可以查验一名玩家的具体身份', supplement: '1. 石像鬼不可以自爆\n2. 夜间无法与狼人讨论、无法参与袭击、也无法与其他狼人互知身份\n3. 当其他所有狼人出局后，石像鬼可在夜间进行袭击\n4. 石像鬼被预言家查验始终显示为狼人\n5. 石像鬼不可以查验自己或重复查验某名玩家的身份' },
  { key: 'hidden_wolf', name: '隐狼', emoji: '👻', desc: '被预言家查验结果始终为好人；其他狼人出局后可带刀', category: '狼人阵营', count: 0, fullDesc: '【卧底】：被预言家查验结果始终为好人', supplement: '1. 隐狼不可以自爆\n2. 当其他所有狼人出局后，可在夜间进行袭击\n3. 隐狼可以看到狼人队友的身份，但不知道具体是什么狼人\n4. 狼人队友不能看到隐狼的身份' },
  { key: 'mechanical_wolf', name: '机械狼', emoji: '🤖', desc: '每晚可以选择学习场上一名玩家的身份及技能', category: '狼人阵营', count: 0, fullDesc: '【学习】：机械狼可在任意一夜开启【学习】状态，即选择学习场上一名玩家的身份及技能。学到"守卫"可抵挡狼刀、女巫毒药和猎人子弹；学到"女巫"可得毒药；学到"猎人"出局后可开枪；学到"通灵师"可查验身份；学到"狼人"可多一次刀；学到"村民"相当于"隐狼"', supplement: '' },
  { key: 'evil_merchant', name: '邪恶商人', emoji: '💼', desc: '持有猎枪和毒药，可交给狼人使用', category: '狼人阵营', count: 0, fullDesc: '【军火商】：邪恶商人手里有一把猎枪和一个毒药。每个夜晚可以把猎枪交给一名狼人，如果获得猎枪的狼人被出局，则该狼人可以开枪。如果获得猎枪的狼人没有被出局，则：若出局的是好人，邪恶商人按兵不动；若出局的是普通狼人，邪恶商人可以收回猎枪，把毒药交给最后一个存活的狼人', supplement: '1. 当邪恶商人的猎枪或毒药中任意一种发挥出作用时，邪恶商人的功能彻底失效\n2. 邪恶商人是狼人阵营的特殊功能牌，知道其他狼人身份\n3. 邪恶商人不可以自爆或自刀\n4. 邪恶商人在第一夜不能发动技能' },

  // 好人阵营
  { key: 'villager', name: '村民', emoji: '👨', desc: '无技能，只能参与投票', category: '好人阵营', count: 0, fullDesc: '村民没有特殊技能', supplement: '村民只能通过白天发言和投票来参与游戏' },
  { key: 'seer', name: '预言家', emoji: '🔮', desc: '每晚可以查验一个玩家的身份，获知其是好人还是狼人', category: '好人阵营', count: 0, fullDesc: '【查验】：每天晚上可以查验一个玩家的身份，可以获知玩家是好人还是狼人', supplement: '1. 预言家可以不发动技能\n2. 不可以重复查验已经验过的目标' },
  { key: 'witch', name: '女巫', emoji: '🧪', desc: '每晚可以用解药救活被狼刀的玩家，或使用毒药杀死一人', category: '好人阵营', count: 0, fullDesc: '【双药】：每晚可以选择用解药救活一名被狼人袭击的玩家，或使用毒药使一名玩家出局', supplement: '1. 女巫每晚只能选择解药和毒药两瓶药中的一瓶使用\n2. 部分板子允许女巫第一夜自救，部分不允许\n3. 女巫使用解药后将无法得知狼人夜间袭击信息' },
  { key: 'hunter', name: '猎人', emoji: '🏹', desc: '被狼人杀害或被投票放逐时，可以指定枪杀一名玩家', category: '好人阵营', count: 0, fullDesc: '【开枪】：当被狼人杀害或被投票放逐时，猎人可以指定枪杀一名玩家', supplement: '1. 猎人被奶穿可以开枪\n2. 猎人被梦魇、魅惑等出局不能开枪\n3. 猎人作为最后一个神职出局不能开枪' },
  { key: 'guard', name: '守卫', emoji: '🛡️', desc: '每晚可以守护一名玩家，使其免受狼刀；不能连续两晚守护同一人', category: '好人阵营', count: 0, fullDesc: '【守护】：每晚可以守护一名玩家，被守卫守护的玩家当晚不会被狼人杀害', supplement: '守卫不能连续两晚守护同一名玩家' },
  { key: 'psychic', name: '通灵师', emoji: '🔭', desc: '每晚可以通过冥想得知一名玩家的具体身份', category: '好人阵营', count: 0, fullDesc: '【冥想】：每晚可以通过冥想得知一名玩家的具体身份', supplement: '' },
  { key: 'magician', name: '魔术师', emoji: '🎩', desc: '每晚在其他人之前行动，交换两个玩家的号码牌；当夜对其施放的技能目标会互换', category: '好人阵营', count: 0, fullDesc: '【魔术】：每晚在其他所有人之前行动，交换场上存活的两个人的【号码牌】，仅在当晚有效', supplement: '1. 被交换号码牌的玩家，当夜所有对其施放的技能目标会被互换（包括查验和毒药等）\n2. 魔术可以对自己使用，但每个玩家每局游戏只能被换一次\n3. 若所有玩家都被换过号码牌或剩余可换玩家不足两人，则魔术师无法使用技能\n4. 女巫的救人信息不会被交换，只能看到原本遭遇狼人袭击的玩家' },
  { key: 'knight', name: '骑士', emoji: '🗡️', desc: '白天放逐投票前，可以决斗任意玩家；若是狼人则狼人死亡，若是好人则骑士死亡', category: '好人阵营', count: 0, fullDesc: '【决斗】：白天警长竞选结束后，放逐投票之前，骑士可以随时翻牌决斗场上除自己以外的任意一位玩家。如果被决斗的玩家是狼人，则该狼人死亡并立即进入黑夜；如果被决斗的玩家是好人，则骑士死亡并继续进行白天原本的发言流程', supplement: '若骑士决斗到狼美人，狼美人技能失效' },
  { key: 'fool', name: '白痴', emoji: '🎭', desc: '被放逐时翻牌公布身份，免除放逐效果；翻牌后不能投票但可发言', category: '好人阵营', count: 0, fullDesc: '【翻牌】：白痴被放逐时翻牌公布自己的身份，以免除这次放逐的效果', supplement: '1. 白痴翻牌后若有警徽需移交\n2. 本局剩余时间若存活可以发言，但不能参与放逐投票，不能被投票\n3. 白痴若夜间被狼队击杀不能翻牌，立即死亡' },
  { key: 'gravedigger', name: '守墓人', emoji: '⚰️', desc: '每晚可以得知上一个白天被放逐的玩家是好人或狼人', category: '好人阵营', count: 0, fullDesc: '【守墓】：守墓人每晚可以得知上一个白天被放逐的玩家是好人或狼人', supplement: '' },
  { key: 'miracle_merchant', name: '奇迹商人', emoji: '✨', desc: '可以选择一名玩家成为幸运儿，获得查验、毒药或守护中的一个技能；每局限一次', category: '好人阵营', count: 0, fullDesc: '【奇迹】：奇迹商人可选择一名其他玩家成为幸运儿，使其获得三个一次性技能中的一个：查验、毒药或守护，每局游戏限一次', supplement: '若幸运儿是狼人，则幸运儿不会获得技能，且次日奇迹商人出局' },
  { key: 'bear', name: '熊', emoji: '🐻', desc: '天亮后，如果熊存活且相邻玩家中有狼人，则"熊咆哮了"；没有狼人则不咆哮', category: '好人阵营', count: 0, fullDesc: '【咆哮】：天亮后，如果熊存活（划重点）的情况下，如熊相邻的玩家(存活状态)中有狼人，法官(或系统)会向场上所有玩家宣布"熊咆哮了"；如果相邻的玩家(存活状态)中没有狼人，则会宣布"熊没有咆哮"', supplement: '' },
  { key: 'dream_stealer', name: '摄梦人', emoji: '🌙', desc: '每晚必须选择一名玩家成为梦游者，梦游者免疫夜间伤害；连续两晚成为梦游者会出局', category: '好人阵营', count: 0, fullDesc: '【摄梦】：每晚必须选择一名玩家成为梦游者。梦游者不知道自己正在梦游，且免疫夜间伤害。若摄梦人在夜晚出局则梦游者一并出局；连续两晚成为梦游者也会出局', supplement: '1. 被摄梦死亡（包括连死）的猎人和狼王都不能发动技能\n2. 摄梦可以抵挡女巫的毒药' },

  // 第三方
  { key: 'cupid', name: '丘比特', emoji: '💘', desc: '游戏开始时连接两名玩家成为情侣；两人中任何一人出局，另一人也跟随出局', category: '第三方', count: 0, fullDesc: '丘比特在游戏开始时可以连接两名玩家成为情侣', supplement: '两人中任何一人出局，另一人会跟随出局' },
  { key: 'thief', name: '盗贼', emoji: '🦹', desc: '可以交换两名玩家的身份卡', category: '第三方', count: 0, fullDesc: '【身份交换】：盗贼可以交换两名玩家的身份卡', supplement: '盗贼交换身份后对游戏的影响需要根据具体版型规则确定' },
]

const defaultBoardRoles: Role[] = [
  { ...allRoles.find(r => r.key === 'wolf')!, count: 4 },        // 狼人×4
  { ...allRoles.find(r => r.key === 'seer')!, count: 1 },        // 预言家×1
  { ...allRoles.find(r => r.key === 'witch')!, count: 1 },       // 女巫×1
  { ...allRoles.find(r => r.key === 'hunter')!, count: 1 },      // 猎人×1
  { ...allRoles.find(r => r.key === 'fool')!, count: 1 },        // 白痴×1
  { ...allRoles.find(r => r.key === 'villager')!, count: 4 },    // 村民×4
]

const boards = ref<Board[]>([])

const filteredBoards = computed(() => {
  if (!showFavoriteOnly.value) return boards.value
  return boards.value.filter(b => b.isFavorite)
})

onMounted(() => {
  loadBoardsFromDatabase()
})

async function loadBoardsFromDatabase() {
  try {
    const res = await api.get('/api/boards')
    if (res.data && res.data.length > 0) {
      // 从数据库加载的板子
      boards.value = res.data.map((board: any) => ({
        name: board.name,
        summary: board.summary,
        roles: JSON.parse(board.roles),
        isFavorite: board.isFavorite,
        originalName: board.name,  // 记录原始名字
        gameConfig: {
          wolfVictory: '屠边',
          cardFlip: '亮牌',
          witchSelfHeal: '可',
          chiefElection: '有',
          doubleExplode: '单爆',
          chatAfterExplode: '是',
          cardType: '单身份'
        }
      }))
    } else {
      // 数据库没有板子，显示空
      boards.value = []
    }
  } catch (err) {
    console.error('加载板子失败:', err)
    // 加载失败也显示空
    boards.value = []
  }
}


function getRolesByCategory(category: string): Role[] {
  return allRoles.filter(r => r.category === category)
}

function isRoleSelected(boardIndex: number, roleKey: string): boolean {
  return boards.value[boardIndex].roles.some(r => r.key === roleKey)
}

function toggleRole(boardIndex: number, roleKey: string) {
  const board = boards.value[boardIndex]
  const existingRole = board.roles.find(r => r.key === roleKey)

  if (existingRole) {
    // 移除
    board.roles = board.roles.filter(r => r.key !== roleKey)
  } else {
    // 添加
    const roleTemplate = allRoles.find(r => r.key === roleKey)
    if (roleTemplate) {
      board.roles.push({ ...roleTemplate, count: 1 })
    }
  }

  updateBoardSummary(board)
}

function incrementRole(boardIndex: number, roleKey: string) {
  const role = boards.value[boardIndex].roles.find(r => r.key === roleKey)
  if (role) {
    role.count = Math.min(12, role.count + 1)
    updateBoardSummary(boards.value[boardIndex])
  }
}

function decrementRole(boardIndex: number, roleKey: string) {
  const board = boards.value[boardIndex]
  const role = board.roles.find(r => r.key === roleKey)
  if (role) {
    if (role.count > 1) {
      role.count = Math.max(0, role.count - 1)
    } else {
      board.roles = board.roles.filter(r => r.key !== roleKey)
    }
    updateBoardSummary(board)
  }
}

function getTotalPlayers(board: Board): number {
  return board.roles.reduce((sum, role) => sum + role.count, 0)
}

function getTotalWolves(board: Board): number {
  return board.roles.filter(r => r.category === '狼人').reduce((sum, role) => sum + role.count, 0)
}

function getTotalGood(board: Board): number {
  return getTotalPlayers(board) - getTotalWolves(board)
}

function updateBoardSummary(board: Board) {
  const roleNames = board.roles.map(r => `${r.name}×${r.count}`).join(' ')
  board.summary = roleNames || '未配置'
}

function getPlayerCount(board: Board): number {
  const total = board.roles.reduce((sum, role) => sum + role.count, 0)
  const hasThief = board.roles.some(r => r.key === 'thief')

  if (total === 0) return 0

  const baseCount = hasThief ? total - 2 : total
  const cardType = board.gameConfig?.cardType || '单身份'

  if (cardType === '双身份') {
    return Math.floor(baseCount / 2)
  }
  return baseCount
}

function createNewBoard() {
  const newBoard: Board = {
    name: `自定义板子${boards.value.length}`,
    summary: '0人 · 狼人0 · 好人0',
    roles: [],
    gameConfig: {
      wolfVictory: '屠边',
      cardFlip: '亮牌',
      witchSelfHeal: '可',
      chiefElection: '有',
      doubleExplode: '单爆',
      chatAfterExplode: '是',
      cardType: '单身份'
    }
  }
  boards.value.push(newBoard)
  editingIndex.value = boards.value.length - 1
  activeCategory.value = '狼人阵营'
  toast('已创建新板子，请配置角色')
}

function editBoard(index: number) {
  editingIndex.value = index
  activeCategory.value = '狼人阵营'
}

function deleteBoard(index: number) {
  const realIndex = boards.value.findIndex(b => b === filteredBoards.value[index])
  if (realIndex !== -1 && boards.value.length > 1) {
    const boardName = boards.value[realIndex].name
    boards.value.splice(realIndex, 1)
    editingIndex.value = null

    // 删除数据库中的板子
    deleteBoardFromDatabase(boardName)

    toast('板子已删除')
  }
}

async function deleteBoardFromDatabase(boardName: string) {
  try {
    await api.delete(`/api/boards/${encodeURIComponent(boardName)}`)
  } catch (err) {
    console.error('从数据库删除板子失败:', err)
  }
}


function toggleFavorite(index: number) {
  const board = filteredBoards.value[index]
  board.isFavorite = !board.isFavorite
}

function resetRoles(index: number) {
  const board = boards.value[index]
  board.roles = JSON.parse(JSON.stringify(defaultBoardRoles))
  updateBoardSummary(board)
  toast('已恢复默认板子')
}

function saveRoles(index: number) {
  const board = boards.value[index]
  if (board.roles.length === 0) {
    toast('请至少选择一个角色')
    return
  }

  // 验证双身份配置
  if (board.gameConfig?.cardType === '双身份') {
    const total = board.roles.reduce((sum, role) => sum + role.count, 0)
    const hasThief = board.roles.some(r => r.key === 'thief')
    const baseCount = hasThief ? total - 2 : total

    if (baseCount % 2 !== 0) {
      alertMessage.value = `双身份模式下，配置角色数必须为偶数。${hasThief ? `当前为 ${total} - 2（盗贼）= ${baseCount}（奇数）` : `当前为 ${baseCount}（奇数）`}`
      showAlert.value = true
      return
    }
  }

  const originalName = (board as any).originalName || board.name
  updateBoardSummary(board)

  // 保存到数据库（记录原始名字用于更新）
  saveBoardToDatabase(board, originalName)

  editingIndex.value = null
  activeCategory.value = '狼人阵营'
  toast(`板子"${board.name}"已保存`)
}

async function saveBoardToDatabase(board: Board, originalName?: string) {
  try {
    // 如果名字改了，先删旧的再插新的
    if (originalName && originalName !== board.name) {
      await api.delete(`/api/boards/${encodeURIComponent(originalName)}`)
    }

    // 新增或更新板子
    await api.post('/api/boards', {
      name: board.name,
      roles: board.roles,
      summary: board.summary,
      isFavorite: board.isFavorite || false
    })
  } catch (err) {
    console.error('保存板子到数据库失败:', err)
    toast('保存失败，请重试')
  }
}

function toast(message: string) {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 1600)
}
</script>

<style scoped>
.board-card {
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255,255,255,.03);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,.05);
}

.board-name {
  font-size: 15px;
  font-weight: 900;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.action-icon {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .2s ease;
}

.action-icon:active {
  transform: scale(.92);
}

.action-icon.active {
  color: #ef4444;
}

.action-icon.delete {
  color: #fca5a5;
}

.action-icon.delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.card-content {
  padding: 12px 16px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.card-badges {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(96,165,250,.15);
  border: 1px solid rgba(96,165,250,.25);
  color: #60a5fa;
  font-size: 11px;
  font-weight: 800;
}

.player-count {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.drawer {
  position: fixed;
  inset: auto 0 0 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  opacity: 0;
  pointer-events: none;
  transition: .3s ease;
  z-index: 110;
  background: rgba(15,23,42,.98);
  backdrop-filter: blur(20px);
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  box-sizing: border-box;
  max-height: none !important;
  overflow: hidden !important;
}

.drawer.open {
  opacity: 1;
  pointer-events: auto;
}

.drawer-header {
  flex: 0 0 auto;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  background: rgba(3,7,18,.5);
}

.drawer-top {
  flex: 0 0 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  max-height: 40vh;
}

.drawer-bottom {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  min-height: 0;
}

.name-input-group {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.back-btn {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 12px;
  background: rgba(255,255,255,.08);
  color: var(--text);
  cursor: pointer;
  transition: all .2s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-btn:active {
  transform: scale(.95);
}

.name-input {
  flex: 1;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(3,7,18,.48);
  color: var(--text);
  outline: 0;
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 16px;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
  font-family: inherit;
  min-width: 0;
}

.name-input::placeholder {
  color: rgba(169,180,196,.58);
}

.info-btn {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 12px;
  background: rgba(255,255,255,.08);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .2s ease;
  flex-shrink: 0;
}

.info-btn:active {
  transform: scale(.95);
}

.selected-roles {
  margin-top: 0;
}

.section-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.selected-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 8px;
}

.selected-role-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.07);
}

.role-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.role-emoji {
  font-size: 28px;
}

.role-count {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}

.role-name {
  font-size: 11px;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.role-actions {
  display: flex;
  gap: 3px;
  width: 100%;
}

.role-actions button {
  flex: 1;
  height: 20px;
  border: 0;
  border-radius: 5px;
  background: rgba(255,255,255,.08);
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  transition: all .2s ease;
}

.role-actions button:active {
  background: rgba(255,255,255,.12);
}

.role-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  background: rgba(3,7,18,.5);
  overflow: hidden;
  flex-shrink: 0;
}

.tab {
  padding: 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all .2s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab.active {
  background: rgba(96,165,250,.15);
  color: #60a5fa;
  border: 1px solid rgba(96,165,250,.25);
}

.roles-pool {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  min-height: 0;
  grid-auto-rows: max-content;
  align-content: start;
}

.pool-role {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.07);
  cursor: pointer;
  transition: all .2s ease;
}

.pool-role:active {
  transform: scale(.95);
}

.pool-role.selected {
  background: rgba(96,165,250,.15);
  border-color: rgba(96,165,250,.25);
}

.pool-role .emoji {
  font-size: 28px;
  line-height: 1;
}

.pool-role .name {
  font-size: 11px;
  font-weight: 800;
  text-align: center;
  word-break: break-word;
  line-height: 1.2;
}

.drawer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid rgba(255,255,255,.08);
  background: rgba(3,7,18,.5);
  overflow: hidden;
  flex-shrink: 0;
}

.btn {
  border: 0;
  outline: 0;
  min-height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  color: var(--text);
  background: rgba(255,255,255,.08);
  font-weight: 800;
  font-size: 15px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
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

.btn-secondary {
  background: rgba(96,165,250,.15);
  color: #60a5fa;
  border: 1px solid rgba(96,165,250,.25);
}

.btn-ghost {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
}

.btn-delete {
  background: rgba(239,68,68,.15);
  color: #fca5a5;
  border: 1px solid rgba(239,68,68,.25);
}

.btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-full {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  font-size: 14px;
}

.filter-icon-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .2s ease;
}

.filter-icon-btn:active {
  transform: scale(.92);
}

.filter-icon-btn.active {
  color: #ef4444;
}

.game-config-panel {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
}

.config-label {
  font-size: 13px;
  font-weight: 800;
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.config-options {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.config-btn {
  min-width: 56px;
  padding: 8px 12px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 8px;
  background: rgba(255,255,255,.04);
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all .2s ease;
}

.config-btn:active {
  transform: scale(.95);
}

.config-btn.active {
  background: rgba(96,165,250,.15);
  border-color: rgba(96,165,250,.25);
  color: #60a5fa;
}

.icon-btn-mini {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: rgba(255,255,255,.06);
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  transition: all .2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-btn-mini:active {
  transform: scale(.95);
}

.icon-btn-mini.active {
  color: #fde68a;
  background: rgba(247,200,115,.15);
}

.icon-btn-mini.delete {
  color: #fca5a5;
}

.icon-btn-mini.delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.alert-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 130;
  backdrop-filter: blur(4px);
}

.alert-box {
  background: rgba(15,23,42,.98);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 16px;
  padding: 24px;
  max-width: 320px;
  box-shadow: 0 24px 80px rgba(0,0,0,.45);
}

.alert-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 900;
}

.alert-message {
  margin: 0 0 20px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.alert-btn {
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #fde68a, #fb923c 56%, #ef4444);
  color: #1e1307;
  font-weight: 900;
  cursor: pointer;
  transition: all .2s ease;
}

.alert-btn:active {
  transform: scale(.95);
}

.role-info-drawer {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%) scale(.95);
  opacity: 0;
  pointer-events: none;
  transition: .3s ease;
  z-index: 112;
  width: 90%;
  max-width: 500px;
  height: 75dvh;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: rgba(15,23,42,.98);
  border: 1px solid rgba(255,255,255,.12);
  backdrop-filter: blur(20px);
  box-shadow: 0 24px 80px rgba(0,0,0,.45);
}

.role-info-drawer.open {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}

.role-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  flex-shrink: 0;
}

.role-info-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: rgba(255,255,255,.08);
  color: var(--muted);
  cursor: pointer;
  transition: all .2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:active {
  transform: scale(.95);
}

.role-info-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  background: rgba(3,7,18,.3);
  overflow-x: auto;
  flex-shrink: 0;
}

.role-info-tab {
  padding: 10px 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all .2s ease;
  white-space: nowrap;
}

.role-info-tab.active {
  background: rgba(96,165,250,.15);
  color: #60a5fa;
  border: 1px solid rgba(96,165,250,.25);
}

.role-info-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.role-info-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
}

.role-avatar {
  font-size: 32px;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(96,165,250,.1);
}

.role-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.role-info-name {
  font-size: 14px;
  font-weight: 900;
}

.role-info-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.role-info-item {
  cursor: pointer;
  transition: all .2s ease;
}

.role-info-item:active {
  transform: scale(.98);
}

.role-detail-drawer {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%) scale(.95);
  opacity: 0;
  pointer-events: none;
  transition: .3s ease;
  z-index: 114;
  width: 90%;
  max-width: 500px;
  height: 75dvh;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: rgba(15,23,42,.98);
  border: 1px solid rgba(255,255,255,.12);
  backdrop-filter: blur(20px);
  box-shadow: 0 24px 80px rgba(0,0,0,.45);
}

.role-detail-drawer.open {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}

.role-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  flex-shrink: 0;
}

.role-detail-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.role-detail-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px;
  min-height: 0;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 900;
  color: var(--text);
}

.detail-section p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
  word-break: break-word;
}

.supplement-text {
  font-size: 13px;
  line-height: 1.8;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-word;
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

.role-info-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 111;
  backdrop-filter: blur(4px);
  animation: fadeIn .3s ease;
}

.role-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 113;
  backdrop-filter: blur(4px);
  animation: fadeIn .3s ease;
}

.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  z-index: 109;
  backdrop-filter: blur(4px);
  animation: fadeIn .3s ease;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s ease;
}

.drawer-mask.show {
  opacity: 1;
  pointer-events: auto;
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
