export type NewsPost = {
  id: string;
  title: string;
  lead: string;
  image: string;
  highlights: string[];
  video?: string;
};

export const newsPosts: NewsPost[] = [
  {
    id: '3944',
    title: '雞骨魚骨專用X光異物檢測機 Xavis',
    lead: '專為魚刺、魚骨及雞骨等低密度異物設計的 X 光檢測系統。結合高解析 X 光成像與 AI 辨識技術，提升檢測精度與食品安全。',
    image: '/reference/news-3944-highres.png',
    highlights: ['可偵測魚刺、魚骨、雞骨等低密度異物，適用雞胸肉、雞腿肉、魚排、魚片、鮭魚與鱈魚。', '高解析度感測器與 FSCAN AI 深度學習演算法，協助提高細小骨刺辨識率、降低漏檢與誤判。', 'IP69K 食品級衛生設計，可支援生鮮、冷藏、冷凍及熟食產品，並保存檢測影像與批次資料。'],
  },
  {
    id: '3943',
    title: 'M1 SF 皮帶稱重機和袋裝填充機 Manter',
    lead: '專為易受損蔬果打造的自動化包裝系統。結合溫和秤重與自動袋裝填充，兼顧產品品質與包裝效率。',
    image: '/reference/news-3943-highres.png',
    highlights: ['皮帶式秤重減少產品落差，適用蘋果、梨子、柑橘、洋蔥與馬鈴薯等易碰傷產品。', '精準控制每袋重量，降低超重填充與原料浪費，維持包裝的一致性。', '可串接供料、分級、光學選別、封口、裝箱及棧板系統，形成完整自動化包裝產線。'],
    video: 'https://www.youtube.com/embed/fp5eQ82bB3E',
  },
  {
    id: '3942',
    title: '多段式重量分級機 Xavis',
    lead: '專為提升水產加工效率而設計的自動化分級設備。兼顧分級精度、作業效率與產品規格一致性。',
    image: '/reference/news-3942-highres.png',
    highlights: ['產品置於托盤後即可自動秤重並依設定重量分級出料，降低人工分選時間。', '可設定 3～7 個分級等級，最小可達 10 克級距，並以電子秤重系統與防水型電磁閥提升準確度。', '快速拆裝射出成型托盤，配合下噴淋噴嘴與清潔刷，適合鮮魚、水產品與漁獲加工品。'],
  },
  {
    id: '3941',
    title: '番茄自動包裝線 Manter',
    lead: '專為番茄及易受損蔬果打造的自動化包裝系統。兼顧產品品質、包裝效率與產線彈性配置需求。',
    image: '/reference/news-3941-highres.png',
    highlights: ['採用多頭組合秤進行高精度自動計量，減少產品損耗與重量誤差。', '溫和輸送設計可降低碰撞、壓傷與果實破損，維持番茄與蔬果的新鮮外觀。', '可支援網袋、PE 袋、立袋、透明盒與紙箱包裝，並整合自動棧板堆疊。'],
    video: 'https://www.youtube.com/embed/tw9Dg7vM5Uk',
  },
];
