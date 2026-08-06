/**
 * 座位数计算唯一实现(ESM,前后端共用,shared/package.json 声明 type: module):
 * - 后端 server.js 建房时算 maxPlayers(座位上限)
 * - 前端 Config.vue 板子列表"X人"显示
 * 规则:含盗贼 -2(盗贼另拿两张牌选一张,这两张牌不发给玩家);
 *      双身份 ÷2(每人两张身份牌,前端保存校验保证可整除)
 */
export function calcBoardPlayerCount(roles, cardType) {
  const list = roles || [];
  const totalCards = list.reduce((sum, role) => sum + (Number(role.count) || 1), 0);
  const hasThief = list.some(r => r.key === 'thief');
  const baseCount = hasThief ? totalCards - 2 : totalCards;
  return cardType === '双身份' ? Math.floor(baseCount / 2) : baseCount;
}
