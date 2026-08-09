/**
 * הגדרות ספר הטיולים
 * גרסה: 2.2.4
 */

window.ROAD_BOOK_CONFIG = Object.freeze({
  version: '2.2.4',
  buildStatus: '45 מסלולים ב־PASS; 45 מסלולים עם הערה: 6 תיקוני ניווט, 8 מותנים ו־31 בעיות מהותיות; העתקה מודרכת ל־AI בכל 475 התחנות',
  aiEndpoint: '',
  aiTimeoutMs: 25000,
  aiMaxQuestionLength: 500,
  mapPreviewMode: 'google-embed-lazy',
  allowCloudAi: false,
  disclaimerAcceptedKey: 'ilan-road-book-v2-disclaimer',
  favoritesKey: 'ilan-road-book-v2-favorites',
  combinedKey: 'roadTripCombinedV02',
  // נשאר יציב כדי לא למחוק החלטות מפורשות שכבר נשמרו בגרסה 2.2.2.
  issueConsentsKey: 'ilan-road-book-v2-issue-consents-2.2.2',
  meetingsKeyPrefix: 'ilan-road-book-v2-meetings-',
  localVisitsKey: 'ilan-road-book-v2-local-visits',
  visitSessionKey: 'ilan-road-book-v2-visit-session',
  visitEndpoint: '',
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
