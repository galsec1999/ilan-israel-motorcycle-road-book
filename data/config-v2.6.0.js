/**
 * הגדרות ספר הטיולים
 * גרסה: 3.0.0
 */

window.ROAD_BOOK_CONFIG = Object.freeze({
  version: '3.0.0',
  buildStatus: 'גרסת פיתוח מקומית (Local v3.0)',
  aiEndpoint: '',
  aiTimeoutMs: 25000,
  aiMaxQuestionLength: 500,
  mapPreviewMode: 'google-embed-lazy',
  allowCloudAi: false,
  disclaimerAcceptedKey: 'ilan-road-book-v2-disclaimer',
  favoritesKey: 'ilan-road-book-v2-favorites',
  combinedKey: 'roadTripCombinedV02',
  customPlaylistsKey: 'ilan-road-book-v3-custom-playlists',
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
