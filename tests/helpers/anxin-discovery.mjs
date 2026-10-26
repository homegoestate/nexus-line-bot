// Fixed review fixture, independent of the production builder. Historical tests
// remove only this exact approved addition; any changed/foreign URI remains.
export const expectedPanel = {
  type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
  paddingAll: '12px', backgroundColor: '#F0F9FB', cornerRadius: '8px',
  contents: [
    { type: 'text', text: '安心城｜從你的選擇開始', size: 'sm', weight: 'bold', color: '#124F7A', wrap: true },
    { type: 'text', text: '首購、換屋、賣屋、傳承，先做選擇，再看差別', size: 'sm', color: '#203C51', wrap: true },
    { type: 'button', style: 'primary', color: '#087F78', height: 'sm',
      action: { type: 'uri', label: '房產選擇先試試', uri: 'https://homegoestate.github.io/anxin-city/' } },
  ],
};
export const priorWelcomeParagraph = '🧭【服務導覽】\n點選下方第一張卡片「開啟服務導覽」，查看交易流程、貸款收入證明與官方六項服務；左右滑動仍可選買賣、傳承、土地與新屋主登錄。';
export const expectedWelcomeParagraph = '🏡【房產選擇先試試】\n點選下方第一張卡片的同名按鈕，進入安心城。首購、換屋、賣屋、傳承，先做選擇，再看差別。\n🧭 也可點選「開啟服務導覽」查看交易流程、貸款收入證明與官方六項服務；左右滑動可選其他需求。';

export function stripAnxinDiscovery(value) {
  const copy = structuredClone(value);
  if (!['home', 'native:home', 'welcome'].includes(copy?.route)) return copy;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.contents)) node.contents = node.contents.filter(child => JSON.stringify(child) !== JSON.stringify(expectedPanel));
    Object.values(node).forEach(visit);
  }
  visit(copy);
  if (copy.route === 'welcome') copy.messages[0].text = copy.messages[0].text.replace(expectedWelcomeParagraph, priorWelcomeParagraph);
  return copy;
}
