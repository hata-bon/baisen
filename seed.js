// Excel「焙煎記録_過去の記録.xlsx」の9回分（2025年9月〜2026年7月）。設定画面の「過去の記録を取り込む」で使う
const SEED_ROASTS = [
 {
  "no": 1,
  "date": "2025-09-27",
  "bean": "mandheling",
  "beanText": "インドネシア マンデリン バタックブルー",
  "inG": 214.7,
  "outG": 176.2,
  "noteLevel": "ミディアムロースト",
  "noteLoss": "17.9%",
  "preheat": false,
  "firstCrack": {
   "text": "約8分〜10分"
  },
  "memo": "倍率1.21と記載"
 },
 {
  "no": 2,
  "date": "2025-10-16",
  "bean": "mandheling",
  "beanText": "インドネシア マンデリン バタックブルー",
  "inG": 198.4,
  "outG": 176.2,
  "noteLevel": "ライト",
  "noteLoss": "11.2%",
  "preheat": false,
  "firstCrack": {
   "sec": 480,
   "text": "約8分"
  },
  "memo": "1ハゼ開始から2分で終了／倍率1.12"
 },
 {
  "no": 3,
  "date": "2025-11-03",
  "bean": "mandheling",
  "beanText": "インドネシア マンデリン バタックブルー",
  "inG": 203.4,
  "outG": 168.6,
  "noteLevel": "ミディアムロースト",
  "noteLoss": "17.1%",
  "preheat": false,
  "firstCrack": {
   "text": "約9分〜12分（終わり180℃）"
  },
  "secondCrack": {
   "sec": 780,
   "text": "約13分"
  },
  "memo": "倍率1.20と記載"
 },
 {
  "no": 4,
  "date": "2025-12-07",
  "bean": "myanmar",
  "beanText": "ミャンマー ミドゥウィン村 マイクロミル ウォッシュド",
  "inG": 238.8,
  "outG": 210.7,
  "noteLevel": "ハイロースト（浅煎り）",
  "noteLoss": "11.8%",
  "preheat": false,
  "firstCrack": {
   "sec": 480,
   "text": "約8分"
  },
  "drop": {
   "sec": 540,
   "text": "約9分"
  },
  "memo": "倍率1.13と記載"
 },
 {
  "no": 5,
  "date": "2025-12-22",
  "bean": "myanmar",
  "beanText": "ミャンマー ミドゥウィン村 マイクロミル ウォッシュド",
  "inG": 224.1,
  "outG": 171.5,
  "noteLevel": "フルシティ",
  "noteLoss": "23.4%",
  "preheat": false,
  "firstCrack": {
   "sec": 600,
   "text": "約10分"
  },
  "memo": "倍率1.3と記載"
 },
 {
  "no": 6,
  "date": "2026-04-02",
  "bean": "kenya",
  "beanText": "ケニアAA",
  "inG": 209.3,
  "outG": 176.1,
  "noteLevel": "シティ〜フルシティ",
  "noteLoss": "15.9%",
  "preheat": true,
  "chargeTemp": 190,
  "firstCrack": {
   "sec": 500
  },
  "secondCrack": {
   "sec": 735
  },
  "drop": {
   "sec": 750
  }
 },
 {
  "no": 7,
  "date": "2026-05-06",
  "bean": "myanmar",
  "beanText": "ミャンマー ミドゥウィン村 ウォッシュド",
  "inG": 327.9,
  "outG": 276,
  "noteLevel": "ハイ〜シティ",
  "noteLoss": "15.8%",
  "preheat": true,
  "chargeTemp": 170,
  "firstCrack": {
   "sec": 630
  },
  "drop": {
   "sec": 720,
   "temp": 194
  }
 },
 {
  "no": 8,
  "date": "2026-06-04",
  "bean": "kenya",
  "beanText": "ケニアAA",
  "inG": 374.8,
  "outG": 309.1,
  "noteLoss": "17.5%",
  "preheat": true,
  "chargeTemp": 180,
  "firstCrack": {
   "sec": 698,
   "temp": 170
  },
  "drop": {
   "sec": 850,
   "temp": 204
  },
  "memo": "14分00秒で200℃"
 },
 {
  "no": 9,
  "date": "2026-07-26",
  "bean": "ethiopia",
  "beanText": "エチオピア シダモG2",
  "inG": 209,
  "outG": 181,
  "noteLevel": "浅（ハイロースト）",
  "noteLoss": "13.4%",
  "preheat": true,
  "chargeTemp": 195,
  "firstCrack": {
   "sec": 480,
   "temp": 175
  },
  "drop": {
   "sec": 560,
   "temp": 190
  }
 }
];
