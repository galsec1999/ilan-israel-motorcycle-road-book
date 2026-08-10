/**
 * הגדרות ספר הטיולים
 * גרסה: 2.6.0
 */

window.ROAD_BOOK_CONFIG = Object.freeze({
  version: '2.6.0',
  buildStatus: '180 מסלולים ו־21 מסעות רב־יומיים; כל יום במסע פועל כטיול מלא עם ייצוא נפרד או מרוכז',
  aiEndpoint: '',
  aiTimeoutMs: 25000,
  aiMaxQuestionLength: 500,
  mapPreviewMode: 'google-embed-lazy',
  allowCloudAi: false,
  disclaimerAcceptedKey: 'ilan-road-book-v2-disclaimer',
  favoritesKey: 'ilan-road-book-v2-favorites',
  personalRoutesKey: 'ilan-road-book-v2-personal-routes',
  recentRoutesKey: 'ilan-road-book-v2-recent-routes',
  recentRoutesLimit: 8,
  compareRoutesKey: 'ilan-road-book-v2-compare-routes',
  layoutKey: 'ilan-road-book-v2-layout',
  departureChecklistKey: 'ilan-road-book-v2-departure-checklist',
  freshnessRecentDays: 180,
  combinedKey: 'roadTripCombinedV02',
  // נשאר יציב כדי לא למחוק החלטות מפורשות שכבר נשמרו בגרסה 2.2.2.
  issueConsentsKey: 'ilan-road-book-v2-issue-consents-2.2.2',
  meetingsKeyPrefix: 'ilan-road-book-v2-meetings-',
  localVisitsKey: 'ilan-road-book-v2-local-visits',
  visitSessionKey: 'ilan-road-book-v2-visit-session',
  visitEndpoint: '',
  themeKey: 'ilan-road-book-v2-theme',
  approachAverageKmh: 70,
  ridingDayAverageKmh: 55,
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
