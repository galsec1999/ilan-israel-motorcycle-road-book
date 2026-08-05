/**
 * הגדרות מוצר גרסה 2
 * גרסת מסמך: 2.0.3
 */

window.ROAD_BOOK_CONFIG = Object.freeze({
  productVersion: '2.0',
  documentVersion: '2.0.3',
  buildStatus: 'מועמד לאישור מקומי — טרם פורסם',
  aiEndpoint: '',
  aiTimeoutMs: 25000,
  aiMaxQuestionLength: 500,
  mapPreviewMode: 'google-embed-lazy',
  allowCloudAi: true,
  disclaimerAcceptedKey: 'ilan-road-book-v2-disclaimer',
  favoritesKey: 'ilan-road-book-v2-favorites',
  themeKey: 'ilan-road-book-v2-theme',
});

window.ROAD_BOOK_TAXONOMY = Object.freeze({
  levels: ['מתחילים', 'קל', 'בינוני', 'מתקדם', 'מומחים'],
  roadCharacters: [
    'מפותל',
    'הררי ונופי',
    'מהיר ופתוח',
    'כפרי ושקט',
    'עירוני ותרבותי',
    'מדברי ופתוח',
    'אספלט ודרך כבושה',
    'משולב',
  ],
  verificationLevels: [
    'מאומת ממקורות',
    'מותנה/עונתי',
    'מבוסס קהילה',
    'טיוטת רכיבה',
    'מועמד באימות',
  ],
});
