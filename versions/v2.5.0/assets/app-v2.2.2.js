/**
 * יישום ספר הטיולים
 * גרסה: 2.2.2
 */

(() => {
  'use strict';

  const config = window.ROAD_BOOK_CONFIG;
  const taxonomy = window.ROAD_BOOK_TAXONOMY;
  const legacy = window.ROAD_BOOK_LEGACY;
  const variantSpecs = window.ROAD_BOOK_V2_VARIANTS || [];
  const candidateSpecs = window.ROAD_BOOK_V2_CANDIDATES || [];
  const releaseAudit = window.ROAD_BOOK_RELEASE_AUDIT || {};
  const releaseResults = releaseAudit.route_results || {};
  const releaseReadyRouteIds = new Set(releaseAudit.release_ready_route_ids || []);
  const excludedSpecs = [
    ...(window.ROAD_BOOK_V2_EXCLUDED || []),
    ...(releaseAudit.catalogue_exclusions || []),
  ];
  const withheldLegacyRouteIds = new Set(releaseAudit.withheld_legacy_route_ids || []);
  const pointToPointCorrections = new Set(releaseAudit.point_to_point_corrections || []);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const collator = new Intl.Collator('he');

  let quickFilter = 'all';
  let favoritesOnly = false;
  let deferredInstallPrompt = null;
  let aiContext = null;
  let lastFocusedElement = null;
  let currentInviteRouteId = null;

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    })[char]);
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function normalizeLevel(value) {
    if (/מנוסים|מתקדמים אחראיים/.test(value)) return 'מומחים';
    if (/מתקדם/.test(value)) return 'מתקדם';
    if (value === 'בינוני') return 'בינוני';
    if (/מתחילים/.test(value) || /^קל/.test(value)) return value === 'מתחילים' ? 'מתחילים' : 'קל';
    return 'בינוני';
  }

  function normalizeRoad(value = '') {
    if (/דרך כבושה|דרך יער|gravel/i.test(value)) return 'אספלט ודרך כבושה';
    if (/מדברי|בודד/.test(value)) return 'מדברי ופתוח';
    if (/עירוני/.test(value)) return 'עירוני ותרבותי';
    if (/מהיר/.test(value)) return 'מהיר ופתוח';
    if (/הררי.*נופי|הררי ופתוח|נופי ותיירותי/.test(value)) return 'הררי ונופי';
    if (/מפותל|רכס צר/.test(value)) return 'מפותל';
    if (/כפרי|רגוע|מישורי|חופי|אזוריים|יער/.test(value)) return 'כפרי ושקט';
    return 'משולב';
  }

  function stopId(routeId, index) {
    return `${routeId}-s${String(index + 1).padStart(3, '0')}`;
  }

  function issueDisplayReason(value = '') {
    const reason = String(value).trim();
    if (!reason) return 'הבעיה שנמצאה: חסר פירוט מספק. אין להשתמש במסלול לפני בדיקה פרטנית.';
    const neutral = reason
      .replace(/^המסלול הוסר(?: זמנית)?(?: מן השחרור| מקטלוג הכביש| מן הקטלוג הפעיל)?\s*/, '')
      .replace(/^:\s*/, '')
      .replace(/^בגלל\s+/, '')
      .replace(/^מפני שהוא\s+/, 'המסלול ')
      .replace(/^מפני ש/, '')
      .replace(/^עד לקבלת אישור מ([^:]+):\s*/, 'טרם התקבל אישור מ$1: ')
      .replace(/^עד אימות אספלט:\s*/, 'האספלט טרם אומת: ');
    return `הבעיה שנמצאה: ${neutral}`;
  }

  function releaseRoute(route) {
    const override = releaseAudit.route_overrides?.[route.id] || {};
    const sourceOverride = releaseAudit.source_overrides?.[route.id];
    const navigationPoints = releaseAudit.navigation_points?.[route.id];
    const stopNavigation = releaseAudit.stop_navigation?.[route.id] || {};
    const stopExclusions = new Set(releaseAudit.stop_exclusions?.[route.id] || []);
    const correctedProfile = override.road_profile
      ? { ...(route.road_profile || {}), ...override.road_profile }
      : route.road_profile;
    return {
      ...route,
      ...override,
      route_shape: pointToPointCorrections.has(route.id) ? 'נקודה לנקודה' : (override.route_shape || route.route_shape),
      road_profile: correctedProfile,
      sources: sourceOverride || override.sources || route.sources,
      map_points: navigationPoints || override.map_points || route.map_points,
      stops: (route.stops || []).filter((stop) => !stopExclusions.has(stop.name)).map((stop) => ({
        ...stop,
        ...(Object.hasOwn(stopNavigation, stop.name) ? { navigation_name: stopNavigation[stop.name] } : {}),
      })),
    };
  }

  function normalizeSprings(route, stops) {
    const values = [];
    for (const spring of route.springs || []) {
      if (!spring) continue;
      if (spring.name) values.push(spring);
      else {
        const owner = stops.find((stop) => stop.spring
          && stop.spring.status === spring.status
          && stop.spring.note === spring.note);
        if (owner) values.push({ name: owner.name, ...spring });
      }
    }
    for (const stop of stops) {
      if (stop.spring) values.push({ name: stop.name, ...stop.spring });
    }
    const seen = new Set();
    return values.filter((spring) => {
      if (!spring?.name) return false;
      const key = `${spring.name}\u0000${spring.status || ''}\u0000${spring.note || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeRoute(route, index) {
    const released = releaseRoute(route);
    const releaseResult = releaseResults[released.id] || null;
    const stops = (released.stops || []).map((stop, stopIndex) => ({
      ...stop,
      stop_id: stop.stop_id || stopId(released.id, stopIndex),
      index: stopIndex + 1,
      story_long: stop.story_long || stop.story || '',
    }));
    const sources = [...new Set((released.sources || []).map(safeHttpsUrl).filter(Boolean))];
    const springs = normalizeSprings(released, stops);
    const level = normalizeLevel(released.level || '');
    const roadCharacter = normalizeRoad(released.road_character || released.style || '');
    const releaseIssueReason = releaseResult?.status === 'warning' ? issueDisplayReason(releaseResult.reason) : '';
    const searchable = [
      released.id, String(index + 1).padStart(3, '0'), released.title, released.region, released.area, released.duration, released.km, released.style,
      level, released.roads, released.story_big, released.summary, released.cautions, released.fuel,
      roadCharacter, released.verification_level, ...(released.trip_types || []),
      ...(released.themes || []),
      ...stops.flatMap((stop) => [stop.name, stop.kind, stop.story, stop.story_long, stop.era]),
      ...(released.food_options || []).flatMap((food) => [food.area, food.kind, food.query]),
      ...springs.flatMap((spring) => [spring.name, spring.status, spring.note]),
    ].filter(Boolean).join(' ').toLocaleLowerCase('he');

    return {
      ...released,
      index,
      level_original: released.level,
      level,
      road_character_original: released.road_character,
      road_character: roadCharacter,
      stops,
      sources,
      springs,
      search_text: searchable,
      release_audit_result: releaseResult,
      release_audit_status: releaseResult?.status === 'pass'
        ? 'עבר ביקורת שחרור טכנית'
        : releaseResult?.status === 'reviewing'
          ? 'ביקורת השחרור עדיין נמשכת'
          : releaseResult?.status === 'warning'
            ? 'מסלול עם הערה — נדרש שיקול דעת'
            : 'לא עבר את שער השחרור',
      release_has_issue: Boolean(releaseIssueReason),
      release_issue_reason: releaseIssueReason,
      release_audited_on: releaseAudit.audited_on || '',
      assistant_ready: sources.length > 0
        && Boolean(released.story_big || released.summary)
        && stops.some((stop) => stop.story_long),
      assistant_support: released.verification_level === 'מאומת ממקורות'
        ? 'route_scope'
        : released.verification_level === 'מועמד באימות'
          ? 'candidate_scope'
          : 'limited_route_scope',
      content_scope: 'מקורות ברמת המסלול; שיוך מדויק לכל טענה טרם הושלם',
    };
  }

  const allLegacyRoutes = (legacy.routes || []).map(normalizeRoute);
  const legacyRoutes = allLegacyRoutes
    .filter((route) => releaseReadyRouteIds.has(route.id) && !withheldLegacyRouteIds.has(route.id))
    .map((route, index) => ({ ...route, index }));
  const issueRoutes = allLegacyRoutes
    .filter((route) => withheldLegacyRouteIds.has(route.id))
    .map((route, index) => ({ ...route, issue_index: index }));
  const legacyById = new Map(allLegacyRoutes.map((route) => [route.id, route]));

  function makeVariant(spec, index) {
    const base = legacyById.get(spec.base);
    if (!base) return null;
    const take = Math.min(Math.max(2, spec.take || 3), base.stops.length);
    const stops = base.stops.slice(0, take).map((stop, stopIndex) => ({
      ...stop,
      stop_id: stopId(spec.id, stopIndex),
      index: stopIndex + 1,
    }));
    const route = {
      ...base,
      id: spec.id,
      title: `${spec.focus} — ${spec.label}`,
      summary: `חלופה ${spec.label} שנגזרה מסדר התחנות המתועד במסלול „${base.title}”. המרחק והזמן מחושבים במפה לפני כל יציאה.`,
      story_big: `החלופה משתמשת רק בתחנות ובסיפורי הדרך שכבר מופיעים במסלול המקור „${base.title}”. היא נועדה לאפשר בחירה קצרה או ממוקדת יותר, ללא המצאת מרחק או זמן.`,
      duration: 'קצר או ממוקד — לחישוב במפה',
      km: 'לחישוב ב-Google Maps',
      km_num: null,
      end: stops.at(-1)?.name || base.end,
      stops,
      variant_of: base.id,
      verification_level: 'טיוטת רכיבה',
      verification_note: 'נגזר ממסלול מקור מתועד, אך רצף הדרך המקוצר, המרחק והזמן מחייבים בדיקת מפה ורכיבת אימות.',
      quality_score: null,
      quality_status: 'ממתין לבדיקת מסלול מקוצר',
      trip_types: [...new Set([spec.label, ...(base.trip_types || [])])],
      index: legacyRoutes.length + index,
      assistant_ready: false,
    };
    return normalizeRoute(route, route.index);
  }

  const variantRoutes = variantSpecs.map(makeVariant).filter(Boolean);
  function makeCandidate(spec, index) {
    const points = (spec.points || []).filter(Boolean);
    const stopNames = points.slice(1, -1);
    const route = {
      id: `v2-${spec.id}`,
      title: spec.title,
      region: spec.region,
      area: spec.region,
      duration: 'לחישוב במפה',
      km: 'לחישוב ב-Google Maps',
      km_num: null,
      style: spec.road,
      level: spec.level,
      start: points[0],
      end: points.at(-1),
      roads: 'יתועד לאחר אימות מפה ונסיעת ביקורת',
      best: 'לפי מזג האוויר, מצב הדרך והנחיות עדכניות',
      summary: `ציר חדש שנבדק כמועמד לגרסה 2 על בסיס מוקדים ומקורות רשמיים. הוא אינו מסלול רכיבה מאושר עד השלמת מפת דרך, מרחק, זמן ונסיעת ביקורת.`,
      story_big: `המועמד מחבר את הנקודות: ${points.join(' ← ')}. אין לראות בסדר הנקודות אישור שהציר כולו פתוח או מתאים היום לאופנוע כביש.`,
      cautions: spec.note || 'מועמד באימות: יש לבדוק סלילה, חסימות, חניה, שעות פתיחה, מצב ביטחוני ומזג אוויר לפני שימוש.',
      fuel: 'טרם אומתה תכנית תדלוק; יש לבנות אותה במפה לפני היציאה.',
      stops: stopNames.map((name, stopIndex) => ({
        name,
        kind: 'נקודת מועמד לאימות',
        minutes: 0,
        story: 'הנקודה מופיעה בציר המחקר; תוכן מלא יתווסף רק לאחר אימות מקורות.',
        story_long: 'נקודת מועמד במסלול חדש. עוזר המסלול יציג רק את מעמד המועמד ואת המידע הקיים בספר.',
        era: 'טרם תועד',
        fuel: false,
        index: stopIndex + 1,
      })),
      sources: spec.sources || [],
      seasonal: true,
      community: false,
      themes: ['מסלול חדש', 'נדרש אימות'],
      trip_types: ['מועמד חדש', spec.road],
      road_profile: { fast: 0, twisty: 0, local: 0, urban: 0, note: 'פרופיל הכביש טרם נמדד.', roads: [] },
      food_options: [],
      springs: [],
      connections: [],
      checked_on: '05.08.2026 — בדיקת מקורות ראשונית בלבד',
      verification_level: 'מועמד באימות',
      verification_note: `דרגת מחקר ${spec.grade || 'B'}. לפני שדרוג נדרשים Place IDs, בדיקת כבישים סלולים, מפה מלאה, מרחק, זמן ונסיעת ביקורת.`,
      route_shape: points[0] === points.at(-1) ? 'מעגלי מוצע' : 'נקודה לנקודה מוצע',
      road_character: spec.road,
      quality_checks: [],
      quality_score: null,
      quality_status: 'ממתין לשער איכות',
      candidate_grade: spec.grade,
      index: legacyRoutes.length + variantRoutes.length + index,
      assistant_ready: false,
    };
    return normalizeRoute(route, route.index);
  }

  const candidateRoutes = candidateSpecs.map(makeCandidate).filter(Boolean);
  const routes = [
    ...legacyRoutes,
    ...variantRoutes,
    ...(releaseAudit.publish_candidates ? candidateRoutes : []),
  ];
  const actionRoutes = [...routes, ...(releaseAudit.publish_with_warnings ? issueRoutes : [])];
  const routeById = new Map(actionRoutes.map((route) => [route.id, route]));

  function orderedRoutePoints(values = []) {
    return values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((point, index, points) => index === 0 || point !== points[index - 1]);
  }

  function routeNavigationPoints(route) {
    if (Array.isArray(route.map_points) && route.map_points.length >= 2) {
      return orderedRoutePoints(route.map_points);
    }
    return orderedRoutePoints([
      route.start,
      ...route.stops.map((stop) => stop.navigation_name === null ? '' : (stop.navigation_name || stop.name)),
      route.end,
    ]);
  }

  function mapsUrl(route) {
    if (safeHttpsUrl(route.maps_url)) return safeHttpsUrl(route.maps_url);
    const points = routeNavigationPoints(route);
    const origin = points[0];
    const destination = points.at(-1);
    const waypoints = points.slice(1, -1).slice(0, 8);
    const params = new URLSearchParams({
      api: '1', origin: `${origin}, ישראל`, destination: `${destination}, ישראל`, travelmode: 'driving',
    });
    if (waypoints.length) params.set('waypoints', waypoints.map((point) => `${point}, ישראל`).join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function embedUrl(route) {
    const points = routeNavigationPoints(route);
    const origin = points[0];
    const destination = points.slice(1).map((point) => `${point}, ישראל`).join(' to: ');
    return `https://maps.google.com/maps?f=d&hl=he&dirflg=d&saddr=${encodeURIComponent(`${origin}, ישראל`)}&daddr=${encodeURIComponent(destination)}&output=embed`;
  }

  function wazeUrl(place) {
    return `https://www.waze.com/ul?q=${encodeURIComponent(`${place}, ישראל`)}&navigate=yes`;
  }

  function stopWazeUrl(stop) {
    if (stop.navigation_name === null) return '';
    return wazeUrl(stop.navigation_name || stop.name);
  }

  function pointsMapsUrl(points = []) {
    const ordered = orderedRoutePoints(points);
    if (ordered.length < 2) return 'https://www.google.com/maps';
    const params = new URLSearchParams({
      api: '1',
      origin: `${ordered[0]}, ישראל`,
      destination: `${ordered.at(-1)}, ישראל`,
      travelmode: 'driving',
    });
    const waypoints = ordered.slice(1, -1).slice(0, 8);
    if (waypoints.length) params.set('waypoints', waypoints.map((point) => `${point}, ישראל`).join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function googleSearchUrl(query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query}, ישראל`)}`;
  }

  function getJsonStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function setJsonStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  const MEETING_PRESETS = Object.freeze({
    northCoast: { primary: 'פז אשל, הרצליה', minutes: 90 },
    northEast: { primary: 'דלק היובל, חולון', minutes: 130 },
    jerusalem: { primary: 'דלק היובל, חולון', minutes: 50 },
    deadSea: { primary: 'דלק היובל, חולון', minutes: 100 },
    southCoast: { primary: 'פז הסיירים', minutes: 50 },
    beerSheva: { primary: 'פז הסיירים', minutes: 90 },
    mitzpeRamon: { primary: 'פז הסיירים', minutes: 150 },
    arava: { primary: 'פז הסיירים', minutes: 180 },
    eilat: { primary: 'פז הסיירים', minutes: 240 },
    arad: { primary: 'פז הסיירים', minutes: 115 },
    center: { primary: 'דלק היובל, חולון', minutes: 45 },
  });

  function meetingPreset(route) {
    const text = `${route.region || ''} ${route.area || ''} ${route.start || ''}`;
    if (/אילת/.test(text)) return MEETING_PRESETS.eilat;
    if (/ערבה|עין יהב|חצבה|פארן|יטבתה/.test(text)) return MEETING_PRESETS.arava;
    if (/מצפה רמון|שדה בוקר|הר הנגב/.test(text)) return MEETING_PRESETS.mitzpeRamon;
    if (/ערד|דרום ים המלח|נווה זוהר/.test(text)) return MEETING_PRESETS.arad;
    if (/יריחו|צפון ים המלח|קומראן/.test(text)) return MEETING_PRESETS.deadSea;
    if (/נגב|באר שבע|בית קמה|ירוחם|דימונה/.test(text)) return MEETING_PRESETS.beerSheva;
    if (/אשדוד|אשקלון|חוף דרומי/.test(text)) return MEETING_PRESETS.southCoast;
    if (/ירושלים|שפלה|הרי יהודה/.test(text)) return MEETING_PRESETS.jerusalem;
    if (/גולן|כנרת|עמק יזרעאל|עמק חרוד|עמק החולה|בית שאן|גליל עליון|צפת|קריית שמונה/.test(text)) return MEETING_PRESETS.northEast;
    if (/צפון|גליל|כרמל|חיפה|עכו|נהריה/.test(text)) return MEETING_PRESETS.northCoast;
    return MEETING_PRESETS.center;
  }

  function addMinutes(time, minutes) {
    const [hour, minute] = String(time || '07:00').split(':').map(Number);
    const total = ((hour * 60 + minute + minutes) % 1440 + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function defaultMeetings(route) {
    const preset = meetingPreset(route);
    const override = releaseAudit.meeting_overrides?.[route.id] || {};
    const estimatedMinutes = Number.isFinite(override.minutes) ? override.minutes : preset.minutes;
    const secondaryPlace = override.secondary || route.start || '';
    const primaryDepart = '07:00';
    const secondaryMeet = addMinutes(primaryDepart, estimatedMinutes);
    return {
      primaryPlace: override.primary || preset.primary,
      primaryMeet: addMinutes(primaryDepart, -20),
      primaryDepart,
      secondaryEnabled: Boolean(secondaryPlace),
      secondaryPlace,
      secondaryMeet,
      secondaryDepart: addMinutes(secondaryMeet, 15),
      estimatedMinutes,
    };
  }

  function meetingKey(routeId) {
    return `${config.meetingsKeyPrefix}${routeId}`;
  }

  function getMeetings(route) {
    const defaults = defaultMeetings(route);
    const stored = getJsonStorage(meetingKey(route.id), {});
    if (stored && Object.keys(stored).length) return { ...defaults, ...stored };
    const legacyKey = String(route.id).startsWith('grand-') ? 'roadTripGrandDeparturesV03' : 'roadTripDeparturesV03';
    const legacyId = String(route.id).replace(/^grand-/, '');
    const legacyDeparture = getJsonStorage(legacyKey, {})?.[legacyId];
    return legacyDeparture ? { ...defaults, primaryPlace: legacyDeparture } : defaults;
  }

  function saveMeetings(route, meetings) {
    return setJsonStorage(meetingKey(route.id), meetings);
  }

  function approachMapsUrl(route, meetings = getMeetings(route)) {
    const points = orderedRoutePoints([
      meetings.primaryPlace,
      meetings.secondaryEnabled ? meetings.secondaryPlace : '',
    ]);
    if (route.start && !points.includes(route.start)) points.push(route.start);
    return pointsMapsUrl(points);
  }

  function downloadHtml(filename, html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getCombined() {
    const selected = getJsonStorage(config.combinedKey, []);
    const consents = new Set(getJsonStorage(config.issueConsentsKey, []));
    return Array.isArray(selected)
      ? selected.filter((id) => routeById.has(id) && (!routeById.get(id).release_has_issue || consents.has(id)))
      : [];
  }

  function saveCombined(ids) {
    setJsonStorage(config.combinedKey, ids);
  }

  function saveIssueConsents(consents) {
    setJsonStorage(config.issueConsentsKey, [...consents]);
  }

  function toggleCombined(routeId) {
    const selected = getCombined();
    const route = routeById.get(routeId);
    if (!route) return;
    const consents = new Set(getJsonStorage(config.issueConsentsKey, []));
    const index = selected.indexOf(routeId);
    if (index >= 0) {
      selected.splice(index, 1);
      consents.delete(routeId);
    } else {
      if (route.release_has_issue) consents.add(routeId);
      selected.push(routeId);
    }
    saveIssueConsents(consents);
    saveCombined(selected);
    renderRoutes();
    renderIssueRoutes();
    renderFavorites();
    renderCombined();
  }

  function getFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem(config.favoritesKey) || '[]')); }
    catch { return new Set(); }
  }

  function saveFavorites(favorites) {
    localStorage.setItem(config.favoritesKey, JSON.stringify([...favorites]));
  }

  function migrateLegacyStorage() {
    if (localStorage.getItem(config.favoritesKey) !== null) return;
    try {
      const selected = JSON.parse(localStorage.getItem('roadTripCombinedV02') || '[]');
      const preserved = Array.isArray(selected) ? selected.filter((id) => routeById.has(id)) : [];
      if (preserved.length) saveFavorites(new Set(preserved));
    } catch (error) {
      console.warn('Legacy route selection could not be migrated', error);
    }
  }

  function toggleFavorite(routeId) {
    const favorites = getFavorites();
    favorites.has(routeId) ? favorites.delete(routeId) : favorites.add(routeId);
    saveFavorites(favorites);
    renderRoutes();
    renderIssueRoutes();
    renderFavorites();
  }

  function verificationClass(route) {
    return route.verification_level === 'מאומת ממקורות' ? 'verify-ok' : 'verify-warn';
  }

  function releaseBadge(route) {
    const passed = route.release_audit_result?.status === 'pass';
    if (route.release_has_issue) return `<span class="chip issue-chip">⚠ מסלול עם הערה</span>`;
    return `<span class="chip ${passed ? 'verify-ok' : 'verify-warn'}">ביקורת טכנית ${escapeHtml(config.version)} ${passed ? '✓' : 'בתהליך'}</span>`;
  }

  function routeCard(route) {
    const issue = route.release_has_issue;
    const favorite = getFavorites().has(route.id);
    const combined = getCombined().includes(route.id);
    const map = embedUrl(route);
    const shortSummary = route.summary || route.story_big || '';
    return `<article class="route-card${issue ? ' issue-route-card' : ''}" data-route-id="${escapeHtml(route.id)}" data-verification="${escapeHtml(route.verification_level)}" data-release-state="${issue ? 'warning' : 'pass'}">
      <div class="map-preview" data-map-src="${escapeHtml(map)}" aria-label="תצוגת מפה של ${escapeHtml(route.title)}">
        <div class="map-loading"><strong>מפת המסלול</strong><span>נטענת רק כשהכרטיס מופיע במסך</span></div>
      </div>
      <div class="route-card-main">
        <div class="route-card-top">
          <div><span class="route-number">${String(route.index + 1).padStart(3, '0')}</span><h3>${escapeHtml(route.title)}</h3></div>
          <button class="favorite-button" type="button" data-favorite="${escapeHtml(route.id)}" aria-pressed="${favorite}" aria-label="${favorite ? 'הסרת' : 'שמירת'} המסלול ${escapeHtml(route.title)}"></button>
        </div>
        ${issue ? `<div class="route-issue-warning" role="note"><strong>⚠ הבעיה שצריך להכיר לפני שמחליטים</strong><p>${escapeHtml(route.release_issue_reason)}</p><small>המסלול נשמר לעיון ולשיקול דעת. גם המפה או אחת מנקודות הניווט עשויות להיות חלק מן הבעיה.</small></div>` : ''}
        <p>${escapeHtml(shortSummary)}</p>
        <div class="chips">
          <span class="chip">${escapeHtml(route.region)}</span>
          <span class="chip">${escapeHtml(route.level)}</span>
          <span class="chip">${escapeHtml(route.road_character)}</span>
          <span class="chip">${escapeHtml(route.km)}</span>
          ${route.trip_types?.[0] ? `<span class="chip">${escapeHtml(route.trip_types[0])}</span>` : ''}
          ${releaseBadge(route)}
          <span class="chip ${verificationClass(route)}">${escapeHtml(route.verification_level)}</span>
          ${route.community ? '<span class="chip">מסלול קהילתי</span>' : ''}
          ${route.seasonal ? '<span class="chip verify-warn">נדרש אימות מיוחד</span>' : ''}
          ${route.variant_of ? `<span class="chip">נגזר מ-${escapeHtml(route.variant_of)}</span>` : ''}
        </div>
        <div class="route-actions">
          <button class="button primary" type="button" data-open-route="${escapeHtml(route.id)}">${issue ? 'פרטי הטיול וההערה' : 'פרטי הטיול'}</button>
          <a class="button light" href="${escapeHtml(mapsUrl(route))}" target="_blank" rel="noopener">${issue ? 'Google Maps — לבדיקה' : 'Google Maps'}</a>
          <button class="button ghost" type="button" data-add-combined="${escapeHtml(route.id)}">${combined ? 'נוסף לשילוב ✓' : issue ? 'הוספה לשילוב למרות ההערה' : 'הוספה לשילוב'}</button>
          <button class="button ghost" type="button" data-invite="${escapeHtml(route.id)}">יצירת הזמנה</button>
          ${issue ? '' : `<button class="button ghost" type="button" data-ai-route="${escapeHtml(route.id)}" title="עוזר המסלול מציג מידע מתוך תיק המסלול שבספר">עוזר המסלול</button>`}
        </div>
      </div>
      <details class="route-inline-details" data-card-details>
        <summary>הצגת תקציר מורחב וסדר התחנות</summary>
        <div class="route-inline-content">
          <p>${escapeHtml(route.story_big || shortSummary)}</p>
          <div class="route-strip">${route.stops.map((stop, index) => `<div class="route-node"><strong>${index + 1}. ${escapeHtml(stop.name)}</strong><small>${escapeHtml(stop.kind)} · ${Number(stop.minutes) || 0} דקות</small></div>`).join('')}</div>
          <div class="route-actions"><button class="button primary" type="button" data-open-route="${escapeHtml(route.id)}">פתיחת כל הפרטים</button><button class="button ghost" type="button" data-export-route="${escapeHtml(route.id)}">ייצוא ל־HTML${issue ? ' עם ההערה' : ''}</button></div>
        </div>
      </details>
    </article>`;
  }

  function filterRoutes() {
    const query = $('#searchInput').value.trim().toLocaleLowerCase('he');
    const region = $('#regionFilter').value;
    const type = $('#typeFilter').value;
    const duration = $('#durationFilter').value;
    const theme = $('#themeFilter').value;
    const level = $('#levelFilter').value;
    const road = $('#roadFilter').value;
    const verification = $('#verifyFilter').value;
    const favorites = getFavorites();
    let result = routes.filter((route) => {
      const matchesBase = (!query || route.search_text.includes(query))
        && (!region || route.region === region)
        && (!type || (route.trip_types || []).includes(type))
        && (!duration || route.duration === duration)
        && (!theme || (route.themes || []).includes(theme))
        && (!level || route.level === level)
        && (!road || route.road_character === road)
        && (!verification || route.verification_level === verification)
        && (!favoritesOnly || favorites.has(route.id));
      if (!matchesBase) return false;
      if (quickFilter === 'short') return Boolean(route.variant_of)
        || /קצר|ממוקד/.test(route.duration)
        || (route.trip_types || []).some((value) => /טיול קצר|קצר וממוקד/.test(value));
      if (quickFilter === 'twisty') return route.road_character === 'מפותל';
      if (quickFilter === 'beginner') return ['מתחילים', 'קל'].includes(route.level);
      if (quickFilter === 'water') return [...(route.themes || []), ...(route.trip_types || [])].some((value) => /מים|מעיינ|רחצה|טבע/.test(value));
      if (quickFilter === 'heritage') return [...(route.themes || []), ...(route.trip_types || [])].some((value) => /מורשת|היסטוריה|סיפור/.test(value));
      if (quickFilter === 'food') return [...(route.themes || []), ...(route.trip_types || [])].some((value) => /קפה|אוכל|קולינר/.test(value));
      if (quickFilter === 'photo') return [...(route.themes || []), ...(route.trip_types || [])].some((value) => /נוף|צילום/.test(value));
      if (quickFilter === 'full') return /יום מלא|יום ארוך/.test(route.duration) || [...(route.trip_types || [])].some((value) => /יום מלא|יום ארוך/.test(value));
      if (quickFilter === 'gravel') return /כבושה|יער|gravel/i.test(`${route.style || ''} ${route.road_character_original || ''} ${(route.trip_types || []).join(' ')}`);
      if (quickFilter === 'seasonal') return route.seasonal || /מותנה|עונתי/.test(route.verification_level);
      if (quickFilter === 'verified') return route.verification_level === 'מאומת ממקורות';
      return true;
    });

    const sort = $('#sortFilter').value;
    if (sort === 'title') result.sort((a, b) => collator.compare(a.title, b.title));
    if (sort === 'stops') result.sort((a, b) => b.stops.length - a.stops.length);
    if (sort === 'short') result.sort((a, b) => (a.km_num ?? Number.MAX_SAFE_INTEGER) - (b.km_num ?? Number.MAX_SAFE_INTEGER));
    if (sort === 'long') result.sort((a, b) => (b.km_num ?? -1) - (a.km_num ?? -1));
    if (sort === 'quality') result.sort((a, b) => (b.quality_score ?? -1) - (a.quality_score ?? -1));
    if (sort === 'stories') result.sort((a, b) => b.stops.length - a.stops.length);
    if (sort === 'book') result.sort((a, b) => a.index - b.index);
    return result;
  }

  function loadVisibleMaps() {
    const targets = $$('[data-map-src]:not([data-map-ready])');
    if (!('IntersectionObserver' in window)) {
      targets.slice(0, 6).forEach(loadMap);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        loadMap(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '350px' });
    targets.forEach((target) => observer.observe(target));
  }

  function loadMap(target) {
    if (target.dataset.mapReady) return;
    target.dataset.mapReady = 'true';
    const iframe = document.createElement('iframe');
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.title = target.getAttribute('aria-label') || 'מפת המסלול';
    iframe.src = target.dataset.mapSrc;
    iframe.addEventListener('load', () => $('.map-loading', target)?.remove(), { once: true });
    target.appendChild(iframe);
  }

  function renderRoutes() {
    const result = filterRoutes();
    $('#routeGrid').innerHTML = result.map(routeCard).join('');
    $('#emptyState').hidden = result.length !== 0;
    $('#resultSummary').textContent = `${result.length} מתוך ${routes.length} מסלולים מוצגים`;
    $('#showFavoritesOnly').setAttribute('aria-pressed', String(favoritesOnly));
    loadVisibleMaps();
  }

  function filterIssueRoutes() {
    const query = ($('#issueSearch')?.value || '').trim().toLocaleLowerCase('he');
    return issueRoutes
      .filter((route) => !query
        || route.search_text.includes(query)
        || route.release_issue_reason.toLocaleLowerCase('he').includes(query))
      .sort((a, b) => a.index - b.index);
  }

  function renderIssueRoutes() {
    if (!$('#issueRouteGrid')) return;
    const result = filterIssueRoutes();
    $('#issueRouteGrid').innerHTML = result.map(routeCard).join('');
    $('#issueEmptyState').hidden = result.length !== 0;
    $('#issueResultSummary').textContent = `${result.length} מתוך ${issueRoutes.length} מסלולים עם הערה מוצגים`;
    loadVisibleMaps();
  }

  function renderFavorites() {
    const favorites = getFavorites();
    const selected = actionRoutes.filter((route) => favorites.has(route.id));
    $('#favoritesGrid').innerHTML = selected.map(routeCard).join('');
    $('#favoritesEmpty').hidden = selected.length > 0;
    loadVisibleMaps();
  }

  function combinedPlanText() {
    const selected = getCombined();
    if (!selected.length) return 'עדיין לא נבחרו מסלולים.';
    return selected.map((id, index) => {
      const route = routeById.get(id);
      const meeting = getMeetings(route);
      const second = meeting.secondaryEnabled ? `\n   הצטרפות: ${meeting.secondaryPlace} — ${meeting.secondaryMeet}/${meeting.secondaryDepart}` : '';
      const issue = route.release_has_issue ? `\n   ⚠ הערת מסלול: ${route.release_issue_reason}` : '';
      return `${index + 1}. ${route.title}${issue}\n   מרכז: ${meeting.primaryPlace} — מפגש ${meeting.primaryMeet}, יציאה ${meeting.primaryDepart}${second}\n   מסלול: ${route.start} ← ${route.end} · ${route.km}\n   מפת גישה לנקודות המפגש: ${approachMapsUrl(route, meeting)}\n   מפת מסלול הטיול: ${mapsUrl(route)}`;
    }).join('\n\n');
  }

  function renderCombined() {
    const selected = getCombined();
    $('#combinedRoutes').innerHTML = selected.length ? selected.map((id, index) => {
      const route = routeById.get(id);
      return `<div class="combined-item${route.release_has_issue ? ' combined-item-warning' : ''}"><div><strong>${index + 1}. ${escapeHtml(route.title)}</strong>${route.release_has_issue ? `<span class="combined-warning-label">⚠ מסלול עם הערה</span>` : ''}<small>${escapeHtml(route.start)} ← ${escapeHtml(route.end)} · ${escapeHtml(route.km)}</small>${route.release_has_issue ? `<small>${escapeHtml(route.release_issue_reason)}</small>` : ''}</div><div class="combined-item-actions"><button class="button ghost" type="button" data-combined-up="${escapeHtml(id)}" aria-label="הזזה למעלה">↑</button><button class="button ghost" type="button" data-combined-down="${escapeHtml(id)}" aria-label="הזזה למטה">↓</button><button class="button ghost" type="button" data-combined-remove="${escapeHtml(id)}">הסרה</button></div></div>`;
    }).join('') : '<p>עדיין לא נבחרו מסלולים. לחצו על „הוספה לשילוב” בכרטיס מסלול.</p>';
    $('#combinedPreview').textContent = combinedPlanText();
  }

  function moveCombined(routeId, direction) {
    const selected = getCombined();
    const from = selected.indexOf(routeId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= selected.length) return;
    [selected[from], selected[to]] = [selected[to], selected[from]];
    saveCombined(selected);
    renderCombined();
  }

  function exportStyles() {
    return `body{margin:0;font-family:Arial,sans-serif;direction:rtl;background:#eef4f5;color:#142536;line-height:1.7}header{background:linear-gradient(120deg,#102f3a,#176979);color:#fff;padding:32px 22px}main{max-width:1080px;margin:auto;padding:22px}.card,article,section{background:#fff;border:1px solid #d4e0e2;border-radius:14px;padding:17px;margin:13px 0}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.grid>div{background:#f1f6f6;border-radius:9px;padding:10px}.button{display:inline-block;margin:4px;padding:9px 13px;border-radius:9px;background:#176979;color:#fff;text-decoration:none;font-weight:bold}.warn{border-right:6px solid #b33b35;background:#fff1f0}.meeting{border-right:6px solid #176979}.muted{color:#5d7075}.meters{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}.meters div{text-align:center;background:#f1f6f6;border-radius:9px;padding:10px}.meters b{display:block;font-size:24px}.map{width:100%;height:410px;border:0;border-radius:10px}@media(max-width:720px){.grid,.meters{grid-template-columns:1fr 1fr}.map{height:300px}}@media print{.no-print{display:none!important}body{background:#fff}}`;
  }

  function routeExportHtml(route) {
    const meetings = getMeetings(route);
    const secondary = meetings.secondaryEnabled ? `<p><strong>נקודת הצטרפות:</strong> ${escapeHtml(meetings.secondaryPlace)} — מפגש ${escapeHtml(meetings.secondaryMeet)}, יציאה ${escapeHtml(meetings.secondaryDepart)} <a class="button" href="${escapeHtml(wazeUrl(meetings.secondaryPlace))}">Waze</a></p>` : '';
    const stops = route.stops.map((stop, index) => {
      const navigation = stopWazeUrl(stop);
      return `<article><h3>${index + 1}. ${escapeHtml(stop.name)}</h3><p class="muted">${escapeHtml(stop.kind)} · ${Number(stop.minutes) || 0} דקות · ${escapeHtml(stop.era || '')}${stop.fuel ? ' · תדלוק/שירות' : ''}</p><p>${escapeHtml(stop.story_long).replace(/\n/g, '<br>')}</p>${stop.spring ? `<p><strong>מים:</strong> ${escapeHtml(stop.spring.status)} — ${escapeHtml(stop.spring.note)}</p>` : ''}${navigation ? `<a class="button" href="${escapeHtml(navigation)}">Waze לנקודה</a>` : '<p class="muted">לא צורף קישור ניווט לנקודה שאינה יעד חד־משמעי.</p>'}</article>`;
    }).join('');
    const food = (route.food_options || []).map((item) => `<li><strong>${escapeHtml(item.area)}</strong> — ${escapeHtml(item.kind)} · <a href="${escapeHtml(googleSearchUrl(item.query))}">חיפוש במפה</a></li>`).join('');
    const springs = (route.springs || []).map((item) => `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.status)}. ${escapeHtml(item.note)}</li>`).join('');
    const connections = (route.connections || []).map((id) => routeById.get(id)).filter(Boolean).map((item) => `<li>${escapeHtml(item.title)} — ${escapeHtml(item.start)} ← ${escapeHtml(item.end)}${item.release_has_issue ? `<br><strong>⚠ מסלול עם הערה:</strong> ${escapeHtml(item.release_issue_reason)}` : ''}</li>`).join('');
    const sources = route.sources.map((url, index) => `<a href="${escapeHtml(url)}">מקור ${index + 1}</a>`).join(' · ');
    const profile = route.road_profile || {};
    const gravelMeter = Number(profile.gravel) > 0 ? `<div><b>${Number(profile.gravel)}%</b>דרך כבושה</div>` : '';
    const issueBlock = route.release_has_issue ? `<section class="warn"><h2>⚠ מסלול עם הערה — נדרש שיקול דעת</h2><p>${escapeHtml(route.release_issue_reason)}</p><p><strong>המפה והניווט עשויים להיות חלק מן הבעיה. יש לבדוק ולתקן את התכנית לפני הפצה.</strong></p></section>` : '';
    return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>${escapeHtml(route.title)} — גרסה ${escapeHtml(config.version)}</title><style>${exportStyles()}</style></head><body><header><p>ספר הטיולים של אילן · גרסה ${escapeHtml(config.version)}</p><h1>${escapeHtml(route.title)}</h1><p>${escapeHtml(route.area)} · ${escapeHtml(route.km)} · ${escapeHtml(route.duration)}</p></header><main>${issueBlock}<div class="card no-print"><button onclick="window.print()">הדפסה / שמירה ל־PDF</button></div><section class="meeting"><h2>נקודות מפגש והצטרפות</h2><p><strong>נקודת מרכז:</strong> ${escapeHtml(meetings.primaryPlace)} — מפגש ${escapeHtml(meetings.primaryMeet)}, יציאה ${escapeHtml(meetings.primaryDepart)} <a class="button" href="${escapeHtml(wazeUrl(meetings.primaryPlace))}">Waze</a></p>${secondary}<p><strong>תחילת מסלול הטיול:</strong> ${escapeHtml(route.start)}</p><p class="muted">השעות וזמן הגישה משוערים. בודקים ב־Google Maps ומעדכנים לפני הפצה.</p><a class="button" href="${escapeHtml(approachMapsUrl(route, meetings))}">מפת גישה מהמרכז</a><a class="button" href="${escapeHtml(mapsUrl(route))}">מפת מסלול הטיול</a></section><div class="card grid"><div><b>התחלה</b><br>${escapeHtml(route.start)}</div><div><b>סיום</b><br>${escapeHtml(route.end)}</div><div><b>רמה</b><br>${escapeHtml(route.level)}</div><div><b>עונה</b><br>${escapeHtml(route.best)}</div><div><b>כבישים</b><br>${escapeHtml(route.roads)}</div><div><b>אופי</b><br>${escapeHtml(route.road_character)}</div><div><b>סוגי טיול</b><br>${escapeHtml((route.trip_types || []).join(' · '))}</div><div><b>אימות</b><br>${escapeHtml(route.verification_level)}</div></div><section><h2>סיפור הדרך</h2><p>${escapeHtml(route.story_big || route.summary).replace(/\n/g, '<br>')}</p></section><section><h2>מפת המסלול</h2><iframe class="map" loading="lazy" src="${escapeHtml(embedUrl(route))}"></iframe></section><section><h2>פרופיל כביש</h2><div class="meters"><div><b>${Number(profile.fast) || 0}%</b>מהיר</div><div><b>${Number(profile.twisty) || 0}%</b>מפותל</div><div><b>${Number(profile.local) || 0}%</b>אזורי</div><div><b>${Number(profile.urban) || 0}%</b>עירוני</div>${gravelMeter}</div><p>${escapeHtml(profile.note || 'טרם הושלם פרופיל כביש.')}</p></section><h2>התחנות וסיפורי הדרך</h2>${stops}${springs ? `<section><h2>מים ומעיינות</h2><ul>${springs}</ul></section>` : ''}${food ? `<section><h2>קפה ואוכל</h2><ul>${food}</ul></section>` : ''}<section><h2>תדלוק</h2><p>${escapeHtml(route.fuel)}</p></section><section class="warn"><h2>דגשים ובטיחות</h2><p>${escapeHtml(route.cautions)}</p></section>${connections ? `<section><h2>המשך טבעי למסלולים נוספים</h2><ul>${connections}</ul></section>` : ''}<section><h2>מקורות</h2><p>${sources || 'לא צורפו מקורות תקינים.'}</p></section><section class="warn"><h2>אחריות הרוכב</h2><p>זהו טיול חברים לא־מאורגן. כל רוכב רוכב באחריותו הבלעדית ואחראי לרישיון ולביטוח תקפים, למיגון, לתקינות האופנוע, לשירותי גרירה ולציות לחוק. בודקים את הדרך ואת המקורות הרשמיים ביום היציאה.</p></section></main></body></html>`;
  }

  function exportRoute(routeId) {
    const route = routeById.get(routeId);
    if (route) downloadHtml(`${route.title}-גרסה-${config.version}.html`, routeExportHtml(route));
  }

  function exportCombinedPlan() {
    const selected = getCombined().map((id) => routeById.get(id)).filter(Boolean);
    if (!selected.length) return;
    const rows = selected.map((route, index) => { const meetings = getMeetings(route); return `<section><h2>${index + 1}. ${escapeHtml(route.title)}</h2>${route.release_has_issue ? `<div class="warn"><strong>⚠ מסלול עם הערה</strong><p>${escapeHtml(route.release_issue_reason)}</p></div>` : ''}<p>${escapeHtml(route.start)} ← ${escapeHtml(route.end)} · ${escapeHtml(route.km)}</p><p>${escapeHtml(meetings.primaryPlace)} · יציאה ${escapeHtml(meetings.primaryDepart)}</p><a class="button" href="${escapeHtml(approachMapsUrl(route, meetings))}">מפת גישה למפגש</a><a class="button" href="${escapeHtml(mapsUrl(route))}">מפת מסלול הטיול</a></section>`; }).join('');
    const issueNotice = selected.some((route) => route.release_has_issue) ? '<section class="warn"><h2>⚠ התכנית כוללת מסלול עם הערה</h2><p>יש לקרוא את ההערה המודגשת בכל מקטע ולבדוק את המפה והמקורות לפני הפצה.</p></section>' : '';
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>טיול משולב — גרסה ${escapeHtml(config.version)}</title><style>${exportStyles()}</style></head><body><header><h1>תכנית טיול משולב</h1><p>ספר הטיולים של אילן · גרסה ${escapeHtml(config.version)}</p></header><main>${issueNotice}${rows}<section class="warn"><p>טיול חברים לא־מאורגן. כל רוכב רוכב באחריותו הבלעדית.</p></section></main></body></html>`;
    downloadHtml(`טיול-משולב-גרסה-${config.version}.html`, html);
  }

  function grandTarget(journey) {
    const points = (journey.days || []).flatMap((day) => day.points || []).filter(Boolean);
    return {
      id: `grand-${journey.id}`,
      title: journey.title,
      region: 'מסע רב־יומי',
      area: journey.best || '',
      start: journey.start || points[0] || '',
      end: journey.end || points.at(-1) || '',
      stops: points.slice(1, -1).map((name) => ({ name })),
    };
  }

  function grandExportHtml(journey) {
    const target = grandTarget(journey);
    const meetings = getMeetings(target);
    const second = meetings.secondaryEnabled ? `<p><strong>נקודת הצטרפות:</strong> ${escapeHtml(meetings.secondaryPlace)} — מפגש ${escapeHtml(meetings.secondaryMeet)}, יציאה ${escapeHtml(meetings.secondaryDepart)}</p>` : '';
    const days = (journey.days || []).map((day, index) => `<section><h2>${escapeHtml(day.title || `יום ${index + 1}`)}</h2><p><strong>${escapeHtml(day.km || '')}</strong> · ${escapeHtml(day.roads || '')}</p><p><strong>מסלול:</strong> ${escapeHtml((day.points || []).join(' ← '))}</p><p>${escapeHtml(day.story || '')}</p><p><strong>תדלוק:</strong> ${escapeHtml(day.fuel || '')}</p><p><strong>אוכל:</strong> ${escapeHtml(day.food || '')}</p><p class="warn"><strong>דגשים:</strong> ${escapeHtml(day.cautions || '')}</p><a class="button" href="${escapeHtml(pointsMapsUrl(day.points || []))}">Google Maps ליום</a></section>`).join('');
    const lodging = (journey.lodging || []).map((item) => `<li><strong>${escapeHtml(item.night || '')} — ${escapeHtml(item.name || '')}</strong> (${escapeHtml(item.type || '')}) — ${escapeHtml(item.note || '')}${safeHttpsUrl(item.url) ? ` · <a href="${escapeHtml(item.url)}">אתר רשמי</a>` : ''}</li>`).join('');
    return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>${escapeHtml(journey.title)} — גרסה ${escapeHtml(config.version)}</title><style>${exportStyles()}</style></head><body><header><p>ספר הטיולים של אילן · גרסה ${escapeHtml(config.version)}</p><h1>${escapeHtml(journey.title)}</h1><p>${escapeHtml(journey.km || '')} · ${Number(journey.days_count) || (journey.days || []).length} ימים</p></header><main><div class="card no-print"><button onclick="window.print()">הדפסה / שמירה ל־PDF</button></div><section class="meeting"><h2>נקודות מפגש</h2><p><strong>נקודת מרכז:</strong> ${escapeHtml(meetings.primaryPlace)} — מפגש ${escapeHtml(meetings.primaryMeet)}, יציאה ${escapeHtml(meetings.primaryDepart)}</p>${second}<a class="button" href="${escapeHtml(approachMapsUrl(target, meetings))}">מפת גישה מהמרכז</a><p class="muted">השעות משוערות ומחייבות בדיקה לפני הפצה.</p></section><section><p>${escapeHtml(journey.story || '')}</p></section>${days}${lodging ? `<section><h2>אפשרויות לינה</h2><ul>${lodging}</ul></section>` : ''}<section class="warn"><p>טיול חברים לא־מאורגן. כל רוכב רוכב באחריותו הבלעדית ואחראי לרישיון, לביטוח, למיגון, לתקינות האופנוע ולשירותי גרירה.</p></section></main></body></html>`;
  }

  function exportGrand(journeyId) {
    const journey = (legacy.grandTours || []).find((item) => item.id === journeyId);
    if (journey) downloadHtml(`${journey.title}-גרסה-${config.version}.html`, grandExportHtml(journey));
  }

  function multiDayCard(journey) {
    const routeRows = (journey.routes || []).map((item, index) => {
      const route = routeById.get(item.id);
      const mapHref = route ? mapsUrl(route) : pointsMapsUrl([item.start, item.end]);
      return `<div class="journey-day">
        <h5>יום ${index + 1}: ${escapeHtml(item.title)}</h5>
        <p>${escapeHtml(item.start)} ← ${escapeHtml(item.end)}</p>
        <div class="route-actions">
          ${route ? `<button class="button ghost" type="button" data-open-route="${escapeHtml(route.id)}">פרטי מסלול הבסיס</button>` : ''}
          <a class="button light" href="${escapeHtml(mapHref)}" target="_blank" rel="noopener">פתיחה במפה</a>
        </div>
      </div>`;
    }).join('');
    return `<article class="journey-card">
      <span class="eyebrow">מסע בן ${(journey.days || []).length || (journey.routes || []).length} ימים</span>
      <h4>${escapeHtml(journey.title)}</h4>
      <p>${escapeHtml(journey.note || '')}</p>
      <p class="journey-note"><strong>לינה מוצעת:</strong> ${escapeHtml(journey.sleep || 'לא צוינה')}</p>
      <a class="button light" href="${escapeHtml(googleSearchUrl(`לינה ${journey.sleep || journey.title}`))}" target="_blank" rel="noopener">חיפוש לינה במפה</a>
      <details><summary>הצגת תכנית הימים</summary><div class="journey-days">${routeRows}</div></details>
    </article>`;
  }

  function grandTourCard(journey) {
    const dayRows = (journey.days || []).map((day, index) => `<div class="journey-day">
      <h5>${escapeHtml(day.title || `יום ${index + 1}`)}</h5>
      <p><strong>${escapeHtml(day.km || '')}</strong> · ${escapeHtml(day.roads || '')}</p>
      <p>${escapeHtml(day.story || '')}</p>
      <p><strong>תדלוק:</strong> ${escapeHtml(day.fuel || 'לא צוין')}</p>
      <p><strong>אוכל:</strong> ${escapeHtml(day.food || 'לא צוין')}</p>
      <p><strong>זהירות:</strong> ${escapeHtml(day.cautions || 'לא צוינה')}</p>
      <div class="route-actions"><a class="button light" href="${escapeHtml(pointsMapsUrl(day.points || []))}" target="_blank" rel="noopener">מסלול היום ב־Google Maps</a>${day.points?.[0] ? `<a class="button ghost" href="${escapeHtml(wazeUrl(day.points[0]))}" target="_blank" rel="noopener">Waze לתחילת היום</a>` : ''}</div>
    </div>`).join('');
    const lodgingRows = (journey.lodging || []).map((lodging) => {
      const href = safeHttpsUrl(lodging.url);
      const label = `${lodging.night || ''}: ${lodging.name || ''}`;
      return `<li>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label)} — ${escapeHtml(lodging.type || '')}. ${escapeHtml(lodging.note || '')}</li>`;
    }).join('');
    return `<article class="journey-card">
      <span class="eyebrow">${Number(journey.days_count) || (journey.days || []).length} ימים · ${escapeHtml(journey.km || '')}</span>
      <h4>${escapeHtml(journey.title)}</h4>
      <p>${escapeHtml(journey.story || '')}</p>
      <div class="chips"><span class="chip">${escapeHtml(journey.level || '')}</span><span class="chip">${escapeHtml(journey.best || '')}</span></div>
      <p class="journey-note"><strong>התחלה:</strong> ${escapeHtml(journey.start || '')}<br><strong>סיום:</strong> ${escapeHtml(journey.end || '')}</p>
      <div class="meeting-summary"><strong>יציאה מוצעת מהמרכז:</strong> ${escapeHtml(getMeetings(grandTarget(journey)).primaryPlace)} · ${escapeHtml(getMeetings(grandTarget(journey)).primaryDepart)}<br><small>ניתן לערוך דרך יצירת ההזמנה למסע.</small></div>
      <div class="route-actions"><button class="button primary" type="button" data-invite-grand="${escapeHtml(journey.id)}">יצירת הזמנה ועריכת מפגשים</button><button class="button ghost" type="button" data-export-grand="${escapeHtml(journey.id)}">ייצוא המסע ל־HTML</button></div>
      <details><summary>הצגת כל הימים, התדלוק והאזהרות</summary><div class="journey-days">${dayRows}</div>${lodgingRows ? `<h5>אפשרויות לינה מן הספר</h5><ul class="lodging-list">${lodgingRows}</ul>` : ''}</details>
    </article>`;
  }

  function renderJourneys() {
    const multiday = legacy.multiday || [];
    const grandTours = legacy.grandTours || [];
    $('#multiDayCount').textContent = multiday.length;
    $('#grandTourCount').textContent = grandTours.length;
    $('#multiDayGrid').innerHTML = multiday.map(multiDayCard).join('');
    $('#grandTourGrid').innerHTML = grandTours.map(grandTourCard).join('');
  }

  function detailMeta(label, value) {
    return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || 'לא צוין')}</strong></div>`;
  }

  function openRoute(routeId) {
    const route = routeById.get(routeId);
    if (!route) return;
    lastFocusedElement = document.activeElement;
    const meetings = getMeetings(route);
    const sources = route.sources.map((source, index) => `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">מקור מסלול ${index + 1}</a>`).join(' · ');
    const profile = route.road_profile || {};
    const checkLabels = {
      data: 'שדות החובה ורצף התחנות',
      map_geography: 'גאוגרפיה וקישור Google Maps',
      map_render: 'תצוגת המפה בכרטיס ובפרטים',
      source_links: 'קישורי המקורות הפעילים',
      route_features: 'ייצוא, הזמנה ושילוב מסלולים',
      mobile_rtl: 'תצוגת מובייל RTL',
    };
    const qualityChecks = Object.entries(checkLabels).map(([key, name]) => {
      const passed = route.release_audit_result?.checks?.[key] === true;
      return `<div class="quality-check${passed ? '' : ' bad'}">${passed ? '✓' : '—'} ${escapeHtml(name)}</div>`;
    }).join('');
    const releasePassed = route.release_audit_result?.status === 'pass';
    const releaseIssue = route.release_has_issue;
    const springs = (route.springs || []).map((spring) => `<article class="info-card"><h4>💧 ${escapeHtml(spring.name)}</h4><strong>${escapeHtml(spring.status)}</strong><p>${escapeHtml(spring.note)}</p><a class="button ghost" href="${escapeHtml(googleSearchUrl(spring.name))}" target="_blank" rel="noopener">מפה ומידע</a></article>`).join('');
    const food = (route.food_options || []).map((item) => `<article class="info-card"><h4>☕ ${escapeHtml(item.area)}</h4><p>${escapeHtml(item.kind)}</p><a class="button ghost" href="${escapeHtml(googleSearchUrl(item.query))}" target="_blank" rel="noopener">חיפוש עדכני במפה</a></article>`).join('');
    const connections = (route.connections || []).map((id) => routeById.get(id)).filter(Boolean).map((item) => `<article class="info-card${item.release_has_issue ? ' connection-warning' : ''}"><h4>${escapeHtml(item.title)}</h4>${item.release_has_issue ? `<p class="connection-warning-text"><strong>⚠ מסלול עם הערה:</strong> ${escapeHtml(item.release_issue_reason)}</p>` : ''}<p>${escapeHtml(item.start)} ← ${escapeHtml(item.end)} · ${escapeHtml(item.km)}</p><div class="route-actions"><button class="button ghost" type="button" data-jump-route="${escapeHtml(item.id)}">פתיחת המסלול</button><button class="button ghost" type="button" data-add-combined="${escapeHtml(item.id)}">${item.release_has_issue ? 'הוספה לשילוב למרות ההערה' : 'הוספה לשילוב'}</button></div></article>`).join('');
    const fuelLinks = route.stops.filter((stop) => stop.fuel).map((stop) => `<a class="button ghost" href="${escapeHtml(googleSearchUrl(`תחנת דלק ליד ${stop.name}`))}" target="_blank" rel="noopener">תחנות ליד ${escapeHtml(stop.name)}</a>`).join('');
    const issueBlock = releaseIssue ? `<section class="route-issue-detail" role="alert"><strong>⚠ המסלול אינו ב־PASS — הבעיה שצריך להכיר</strong><p>${escapeHtml(route.release_issue_reason)}</p><p><strong>המפה או אחת מנקודות הניווט עשויות להיות חלק מן הבעיה. יש להחליט אם לתקן את הציר, לדלג על הנקודה או לא להשתמש במסלול.</strong></p></section>` : '';
    $('#routeDialogContent').innerHTML = `${issueBlock}<div class="route-detail-hero">
      <span class="eyebrow">${escapeHtml(route.region)} · ${escapeHtml(route.verification_level)}</span>
      <h2 id="routeDialogTitle">${escapeHtml(route.title)}</h2>
      <p>${escapeHtml(route.story_big || route.summary)}</p>
      <div class="chips"><span class="chip">${escapeHtml(route.level)}</span><span class="chip">${escapeHtml(route.road_character)}</span><span class="chip">${escapeHtml(route.km)}</span>${(route.trip_types || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}${(route.themes || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>
    </div>
    <div class="detail-grid">
      ${detailMeta('אזור', route.area)}${detailMeta('משך', route.duration)}${detailMeta('התחלה', route.start)}${detailMeta('סיום', route.end)}
      ${detailMeta('כבישים', route.roads)}${detailMeta('עונה', route.best)}${detailMeta('נבדק', route.checked_on)}${detailMeta('מבנה', route.route_shape)}
    </div>
    <div class="detail-map"><iframe title="מפת המסלול ${escapeHtml(route.title)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(embedUrl(route))}"></iframe></div>
    <div class="route-actions"><a class="button accent" href="${escapeHtml(mapsUrl(route))}" target="_blank" rel="noopener">${releaseIssue ? 'Google Maps — לבדיקה' : 'מסלול הטיול ב־Google Maps'}</a><a class="button ghost" href="${escapeHtml(wazeUrl(route.start))}" target="_blank" rel="noopener">Waze למפגש הרשמי</a><button class="button ghost" type="button" data-invite="${escapeHtml(route.id)}">יצירת הזמנה ונקודות מפגש</button><button class="button ghost" type="button" data-add-combined="${escapeHtml(route.id)}">${releaseIssue ? 'הוספה לטיול משולב למרות ההערה' : 'הוספה לטיול משולב'}</button><button class="button ghost" type="button" data-export-route="${escapeHtml(route.id)}">ייצוא ל־HTML${releaseIssue ? ' עם ההערה' : ''}</button><button class="button ghost" type="button" data-speak-route="${escapeHtml(route.id)}">השמעת תקציר</button>${releaseIssue ? '' : `<button class="button ghost" type="button" data-ai-route="${escapeHtml(route.id)}">עוזר המסלול</button>`}</div>
    <section class="detail-section meeting-summary"><h3>נקודות מפגש והצטרפות</h3><p><strong>מרכז:</strong> ${escapeHtml(meetings.primaryPlace)} — מפגש ${escapeHtml(meetings.primaryMeet)}, יציאה ${escapeHtml(meetings.primaryDepart)}</p>${meetings.secondaryEnabled ? `<p><strong>הצטרפות בדרך:</strong> ${escapeHtml(meetings.secondaryPlace)} — מפגש ${escapeHtml(meetings.secondaryMeet)}, יציאה ${escapeHtml(meetings.secondaryDepart)}</p>` : ''}<p><strong>תחילת מסלול הטיול:</strong> ${escapeHtml(route.start)}</p><p class="export-note">השעות מחושבות בקירוב ואינן כוללות עומסי תנועה חיים.</p><div class="route-actions"><a class="button primary" href="${escapeHtml(approachMapsUrl(route, meetings))}" target="_blank" rel="noopener">מפת גישה מהמרכז</a><button class="button ghost" type="button" data-invite="${escapeHtml(route.id)}">עריכת נקודות ושעות</button></div></section>
    <section class="detail-section quality-panel${releaseIssue ? ' quality-panel-warning' : ''}"><div class="quality-head"><div><h3>ביקורת שחרור טכנית</h3><strong>${escapeHtml(route.release_audit_status)}</strong></div><div class="quality-score">${releasePassed ? 'עבר' : releaseIssue ? 'הערה' : 'בתהליך'}</div></div><div class="quality-checks">${qualityChecks}</div><p><strong>מועד הביקורת:</strong> ${escapeHtml(route.release_audited_on)}. <strong>מעמד התוכן:</strong> ${escapeHtml(route.verification_level)}. ${escapeHtml(route.verification_note || '')}</p></section>
    <section class="detail-section"><h3>פרופיל הכבישים</h3><div class="road-profile"><div class="road-meter"><strong>${Number(profile.fast) || 0}%</strong>מהיר / בין־עירוני</div><div class="road-meter"><strong>${Number(profile.twisty) || 0}%</strong>מפותל</div><div class="road-meter"><strong>${Number(profile.local) || 0}%</strong>אזורי</div><div class="road-meter"><strong>${Number(profile.urban) || 0}%</strong>עירוני</div>${Number(profile.gravel) > 0 ? `<div class="road-meter"><strong>${Number(profile.gravel)}%</strong>דרך כבושה</div>` : ''}</div><p>${escapeHtml(profile.note || 'פרופיל הכביש טרם הושלם.')} האחוזים הם הערכת תכנון בלבד.</p></section>
    <section class="detail-section"><h3>סדר התחנות</h3><div class="route-strip">${route.stops.map((stop, index) => `<div class="route-node"><strong>${index + 1}. ${escapeHtml(stop.name)}</strong><small>${escapeHtml(stop.kind)} · ${Number(stop.minutes) || 0} דקות</small></div>`).join('')}</div></section>
    <section class="detail-section"><h3>סיפורי הדרך והתחנות</h3><div class="stops-list">${route.stops.map((stop, index) => { const navigation = stopWazeUrl(stop); return `<article class="stop-card"><h4>${index + 1}. ${escapeHtml(stop.name)}</h4><small>${escapeHtml(stop.kind)} · ${Number(stop.minutes) || 0} דקות · ${escapeHtml(stop.era || '')}${stop.fuel ? ' · תדלוק/שירות' : ''}</small><p>${escapeHtml(stop.story_long)}</p>${stop.spring ? `<div class="spring-note"><strong>💧 ${escapeHtml(stop.spring.status)}</strong><br>${escapeHtml(stop.spring.note)}</div>` : ''}<div class="stop-actions">${navigation ? `<a class="button light" href="${escapeHtml(navigation)}" target="_blank" rel="noopener">Waze</a>` : ''}<button class="button ghost" type="button" data-speak-stop="${escapeHtml(route.id)}" data-stop-index="${index}">השמעת הסבר</button>${releaseIssue ? '' : `<button class="button ghost" type="button" data-ai-route="${escapeHtml(route.id)}" data-ai-stop="${index}">עוזר המסלול</button>`}</div></article>`; }).join('')}</div></section>
    ${springs ? `<section class="detail-section"><h3>מים ומעיינות</h3><div class="info-grid">${springs}</div></section>` : ''}
    ${food ? `<section class="detail-section"><h3>קפה, בראנץ׳ ואוכל</h3><div class="info-grid">${food}</div></section>` : ''}
    <section class="detail-section fuel-panel"><h3>תכנית תדלוק</h3><p>${escapeHtml(route.fuel)}</p><div class="route-actions">${fuelLinks}</div></section>
    <section class="detail-section warning-panel"><h3>אזהרות ייחודיות</h3><p>${escapeHtml(route.cautions)}</p></section>
    <section class="detail-section"><h3>Waze לנקודות חד־משמעיות</h3><div class="waze-grid">${route.stops.map((stop, index) => { const navigation = stopWazeUrl(stop); return navigation ? `<a href="${escapeHtml(navigation)}" target="_blank" rel="noopener">${index + 1}. ${escapeHtml(stop.name)}</a>` : ''; }).join('')}</div></section>
    ${connections ? `<section class="detail-section"><h3>המשך טבעי למסלול הבא</h3><div class="connection-grid">${connections}</div></section>` : ''}
    <section class="detail-section"><h3>אמינות ומקורות</h3><p>${escapeHtml(route.content_scope)}</p><p>${sources || 'לא צורפו מקורות תקינים.'}</p></section>
    <section class="legal-disclaimer"><h3>אחריות הרוכב</h3><p>זהו טיול חברים קבוצתי ולא־מאורגן. כל רוכב רוכב באחריותו הבלעדית ואחראי לרישיון ולביטוח תקפים, למיגון, לתקינות האופנוע, לשירותי גרירה ולציות לחוק. בודקים היום חסימות, מזג אוויר, שעות פתיחה ומצב ביטחוני. אין להשתמש באתר בזמן רכיבה.</p></section>`;
    if (!$('#routeDialog').open) $('#routeDialog').showModal();
  }

  function resolveInviteTarget(targetId) {
    if (String(targetId).startsWith('grand:')) {
      const journey = (legacy.grandTours || []).find((item) => item.id === String(targetId).slice(6));
      return journey ? { route: grandTarget(journey), journey } : null;
    }
    const route = routeById.get(targetId);
    return route ? { route, journey: null } : null;
  }

  function ensureInviteOptions(extraTarget = null) {
    const select = $('#inviteRoute');
    select.innerHTML = `<optgroup label="מסלולים ב־PASS">${routes.map((route) => `<option value="${escapeHtml(route.id)}">${escapeHtml(route.title)}</option>`).join('')}</optgroup>${releaseAudit.publish_with_warnings ? `<optgroup label="מסלולים עם הערה — נדרש שיקול דעת">${issueRoutes.map((route) => `<option value="${escapeHtml(route.id)}">⚠ ${escapeHtml(route.title)}</option>`).join('')}</optgroup>` : ''}`;
    if (extraTarget?.journey) {
      const option = document.createElement('option');
      option.value = `grand:${extraTarget.journey.id}`;
      option.textContent = `מסע: ${extraTarget.journey.title}`;
      select.appendChild(option);
    }
  }

  function writeMeetingsToForm(meetings) {
    $('#meetingPrimaryPlace').value = meetings.primaryPlace;
    $('#meetingPrimaryMeet').value = meetings.primaryMeet;
    $('#meetingPrimaryDepart').value = meetings.primaryDepart;
    $('#meetingSecondaryEnabled').checked = meetings.secondaryEnabled;
    $('#meetingSecondaryPlace').value = meetings.secondaryPlace;
    $('#meetingSecondaryMeet').value = meetings.secondaryMeet;
    $('#meetingSecondaryDepart').value = meetings.secondaryDepart;
    $('#secondaryMeetingFields').hidden = !meetings.secondaryEnabled;
  }

  function readMeetingsFromForm(route) {
    const existing = getMeetings(route);
    return {
      ...existing,
      primaryPlace: $('#meetingPrimaryPlace').value.trim() || route.start,
      primaryMeet: $('#meetingPrimaryMeet').value || '06:40',
      primaryDepart: $('#meetingPrimaryDepart').value || '07:00',
      secondaryEnabled: $('#meetingSecondaryEnabled').checked,
      secondaryPlace: $('#meetingSecondaryPlace').value.trim() || route.start,
      secondaryMeet: $('#meetingSecondaryMeet').value || '08:00',
      secondaryDepart: $('#meetingSecondaryDepart').value || '08:15',
    };
  }

  function inviteTarget() {
    return resolveInviteTarget(currentInviteRouteId || $('#inviteRoute').value);
  }

  function updateInvitePreview() {
    const target = inviteTarget();
    if (!target) return;
    const { route, journey } = target;
    const meetings = readMeetingsFromForm(route);
    const date = $('#inviteDate').value
      ? new Date(`${$('#inviteDate').value}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })
      : 'ייקבע';
    const secondary = meetings.secondaryEnabled ? `\n\n📍 נקודת הצטרפות בדרך\n${meetings.secondaryPlace}\nמפגש משוער ${meetings.secondaryMeet} | יציאה ${meetings.secondaryDepart}` : '';
    const stops = journey
      ? (journey.days || []).slice(0, 6).map((day) => `• ${day.title}`).join('\n')
      : route.stops.slice(0, 6).map((stop) => `• ${stop.name} — ${stop.kind}`).join('\n');
    const coreMap = journey
      ? pointsMapsUrl((journey.days || []).flatMap((day) => day.points || []))
      : mapsUrl(route);
    const issue = route.release_has_issue ? `\n\n⚠️ מסלול עם הערה — נדרש שיקול דעת\n${route.release_issue_reason}\nהמפה או אחת מנקודות הניווט עשויות להיות חלק מן הבעיה.` : '';
    $('#invitePreview').value = `🏍️ ${journey ? 'מסע' : 'טיול כביש'}: ${route.title}${issue}\n\n📅 ${date}\n\n📍 יציאה מאזור המרכז\n${meetings.primaryPlace}\nמפגש ${meetings.primaryMeet} | יציאה ${meetings.primaryDepart}${secondary}\n\n🛣️ תחילת מסלול הטיול\n${route.start}\n\n🎚️ קצב: ${$('#invitePace').value}\n👥 עד ${$('#inviteLimit').value} משתתפים\n\n📖 מה מחכה בדרך:\n${journey ? journey.story || '' : route.summary || route.story_big || ''}\n\n📍 תחנות/ימים מרכזיים:\n${stops}\n\n🗺️ ניווט מהמרכז דרך נקודות המפגש:\n${approachMapsUrl(route, meetings)}\n\n🗺️ מסלול הטיול עצמו:\n${coreMap}\n\n⚠️ השעות וזמן הגישה הם אומדן בלבד. בודקים זמן נסיעה בפועל לפני ההפצה.\n\nזהו טיול חברים לא־מאורגן. כל רוכב רוכב באחריותו הבלעדית ואחראי לרישיון, לביטוח, למיגון, לתקינות האופנוע, לשירותי גרירה ולציות לחוק.`;
  }

  function loadInviteTarget(targetId) {
    const target = resolveInviteTarget(targetId);
    if (!target) return;
    currentInviteRouteId = targetId;
    $('#inviteRoute').value = targetId;
    writeMeetingsToForm(getMeetings(target.route));
    updateInvitePreview();
  }

  function openInvite(targetId, journey = null) {
    const target = journey ? { route: grandTarget(journey), journey } : resolveInviteTarget(targetId);
    if (!target) return;
    const key = journey ? `grand:${journey.id}` : targetId;
    ensureInviteOptions(target);
    loadInviteTarget(key);
    lastFocusedElement = document.activeElement;
    $('#inviteDialog').showModal();
  }

  function recalculateMeetings() {
    const target = inviteTarget();
    if (!target) return;
    const current = readMeetingsFromForm(target.route);
    const minutes = Number(current.estimatedMinutes) || meetingPreset(target.route).minutes;
    current.primaryMeet = addMinutes(current.primaryDepart, -20);
    current.secondaryMeet = addMinutes(current.primaryDepart, minutes);
    current.secondaryDepart = addMinutes(current.secondaryMeet, 15);
    writeMeetingsToForm(current);
    updateInvitePreview();
  }

  function persistInviteMeetings() {
    const target = inviteTarget();
    if (!target) return;
    const saved = saveMeetings(target.route, readMeetingsFromForm(target.route));
    $('#saveMeetings').textContent = saved ? 'נשמר ✓' : 'השמירה חסומה בדפדפן';
    setTimeout(() => { $('#saveMeetings').textContent = 'שמירת נקודות המפגש'; }, 1600);
    if (!target.journey && $('#routeDialog').open) openRoute(target.route.id);
    renderCombined();
  }

  function closeDialog(dialog) {
    dialog.close();
    lastFocusedElement?.focus?.();
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      alert('מנגנון ההקראה אינו זמין בדפדפן הזה.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 6000));
    utterance.lang = 'he-IL';
    utterance.rate = 0.94;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang?.toLowerCase().startsWith('he')) || null;
    window.speechSynthesis.speak(utterance);
    $('#stopSpeech').hidden = false;
  }

  function openAi(routeId, stopIndex = null) {
    const route = routeById.get(routeId);
    if (!route) return;
    const stop = Number.isInteger(stopIndex) ? route.stops[stopIndex] : null;
    aiContext = { route, stop };
    lastFocusedElement = document.activeElement;
    $('#aiContext').textContent = stop ? `${route.title} · ${stop.name}` : route.title;
    $('#aiQuestion').value = '';
    $('#aiStatus').textContent = route.assistant_support === 'route_scope'
      ? 'תיק המסלול מאומת ממקורות; העוזר מציג רק את חומר הספר.'
      : route.assistant_support === 'candidate_scope'
        ? 'זהו תיק מועמד מוגבל, לא מסלול רכיבה מאושר. העוזר יציג רק את הנקודות וההסתייגויות שתועדו.'
        : `תיק המסלול זמין במעמד „${route.verification_level}”. העוזר יציג את הכתוב בספר בלי לשנות את מעמד האימות.`;
    $('#aiAnswer').hidden = true;
    $('#speakAnswer').hidden = true;
    const questions = stop
      ? ['למה המקום הזה חשוב?', 'מה כדאי לראות כאן?', 'תן לי הסבר קצר לקבוצה']
      : ['מה מיוחד במסלול?', 'מהן האזהרות החשובות?', 'תן תדריך יציאה קצר'];
    $('#aiQuickQuestions').innerHTML = questions.map((question) => `<button type="button" data-ai-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('');
    $('#aiDialog').showModal();
  }

  function localGroundedAnswer(route, stop, question) {
    const sourceText = stop?.story_long || route.story_big || route.summary || '';
    const caution = route.cautions ? `\n\nאזהרת המסלול: ${route.cautions}` : '';
    const prefix = /אזהר|בטיח|יציאה/.test(question) ? 'תדריך מתוך הספר:' : 'מידע מתוך הספר:';
    return `${prefix}\n${sourceText}${caution}\n\nמעמד המסלול: ${route.verification_level}.\nעוזר המסלול פועל מקומית: זהו מידע שהוחזר ישירות מן הספר, לא תשובה של מודל AI.`;
  }

  async function askAi(question) {
    if (!aiContext) return;
    const { route, stop } = aiContext;
    const status = $('#aiStatus');
    const answerBox = $('#aiAnswer');
    status.textContent = 'מכין תשובה מתוך תיק המסלול…';
    answerBox.hidden = true;
    let answer = '';
    let sources = route.sources;

    if (config.allowCloudAi && config.aiEndpoint && navigator.onLine && route.assistant_ready) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
      try {
        const endpoint = config.aiEndpoint.endsWith('/ask')
          ? config.aiEndpoint
          : `${config.aiEndpoint.replace(/\/$/, '')}/api/v2/ask`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            route_id: route.id,
            stop_id: stop?.stop_id || null,
            question,
            locale: 'he-IL',
          }),
          signal: controller.signal,
          credentials: 'omit',
        });
        if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
        const data = await response.json();
        answer = data.answer_he || data.answer || '';
        sources = Array.isArray(data.sources) ? data.sources.map((item) => item.url || item).filter(safeHttpsUrl) : route.sources;
        const supportMessages = {
          route_scope: 'תשובה מתיק מסלול מאומת; המקורות משויכים למסלול כולו.',
          limited_route_scope: `תשובה מתיק מסלול במעמד „${route.verification_level}”.`,
          candidate_scope: 'תשובה מוגבלת מתיק מועמד; זה אינו מסלול רכיבה מאושר.',
          insufficient: 'המידע הקיים בספר אינו מספיק לתשובה.',
        };
        status.textContent = supportMessages[data.support] || 'התקבלה תשובה מתוך תיק המסלול.';
      } catch (error) {
        console.warn('AI fallback', error);
        answer = localGroundedAnswer(route, stop, question);
        status.textContent = 'שירות ה־AI בענן אינו זמין; עוזר המסלול מציג את המידע המקומי מן הספר.';
      } finally {
        clearTimeout(timer);
      }
    } else {
      answer = localGroundedAnswer(route, stop, question);
      status.textContent = navigator.onLine
        ? 'עוזר המסלול פועל מקומית מתוך הספר; שירות AI בענן אינו מחובר בגרסה זו.'
        : 'המכשיר במצב לא מקוון; עוזר המסלול מציג את תיק המסלול השמור במכשיר.';
    }

    answerBox.replaceChildren();
    const text = document.createElement('p');
    text.textContent = answer;
    answerBox.appendChild(text);
    if (sources.length) {
      const sourceWrap = document.createElement('div');
      sourceWrap.className = 'answer-sources';
      sourceWrap.append('מקורות המסלול: ');
      sources.map(safeHttpsUrl).filter(Boolean).forEach((url, index) => {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `מקור ${index + 1}`;
        sourceWrap.append(link, index < sources.length - 1 ? ' · ' : '');
      });
      answerBox.appendChild(sourceWrap);
    }
    answerBox.hidden = false;
    answerBox.dataset.answerText = answer;
    $('#speakAnswer').hidden = false;
  }

  function switchView(viewId) {
    if (!document.getElementById(viewId)) viewId = 'routesView';
    $$('.app-view').forEach((view) => { view.hidden = view.id !== viewId; });
    $$('[role="tab"]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === viewId)));
    $(`[role="tab"][data-view="${viewId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (viewId === 'issuesView') renderIssueRoutes();
    if (viewId === 'plannerView') renderFavorites();
    if (viewId === 'combinedView') renderCombined();
    if (location.hash !== `#${viewId}`) {
      try { history.replaceState(null, '', `#${viewId}`); }
      catch { location.hash = viewId; }
    }
    document.getElementById(viewId)?.scrollIntoView({ block: 'start' });
  }

  function clearFilters() {
    $('#filters').reset();
    quickFilter = 'all';
    favoritesOnly = false;
    $$('#quickFilters button').forEach((button) => button.classList.toggle('active', button.dataset.quick === 'all'));
    renderRoutes();
  }

  function fillSelect(select, values) {
    values.filter(Boolean).sort(collator.compare).forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function initFilters() {
    fillSelect($('#regionFilter'), [...new Set(routes.map((route) => route.region))]);
    fillSelect($('#typeFilter'), [...new Set(routes.flatMap((route) => route.trip_types || []))]);
    fillSelect($('#durationFilter'), [...new Set(routes.map((route) => route.duration))]);
    fillSelect($('#themeFilter'), [...new Set(routes.flatMap((route) => route.themes || []))]);
    fillSelect($('#levelFilter'), taxonomy.levels.filter((level) => routes.some((route) => route.level === level)));
    fillSelect($('#roadFilter'), taxonomy.roadCharacters.filter((road) => routes.some((route) => route.road_character === road)));
    fillSelect($('#verifyFilter'), [...new Set(routes.map((route) => route.verification_level))]);
  }

  function initTheme() {
    const stored = localStorage.getItem(config.themeKey);
    if (stored) document.documentElement.dataset.theme = stored;
    const dark = document.documentElement.dataset.theme === 'dark'
      || (!stored && matchMedia('(prefers-color-scheme: dark)').matches);
    $('#themeToggle').setAttribute('aria-pressed', String(dark));
    $('#themeToggle').textContent = dark ? 'מצב בהיר' : 'מצב כהה';
  }

  function toggleTheme() {
    const currentDark = $('#themeToggle').getAttribute('aria-pressed') === 'true';
    const next = currentDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(config.themeKey, next);
    $('#themeToggle').setAttribute('aria-pressed', String(!currentDark));
    $('#themeToggle').textContent = currentDark ? 'מצב כהה' : 'מצב בהיר';
  }

  function renderSources() {
    const urls = new Set(actionRoutes.flatMap((route) => route.sources));
    $('#sourceList').innerHTML = [...urls].map(safeHttpsUrl).filter(Boolean)
      .map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`).join('');
  }

  function renderExcluded() {
    const seen = new Set();
    $('#excludedList').innerHTML = excludedSpecs.filter((item) => {
      const key = `${item.route_id || ''}\u0000${item.name || ''}\u0000${item.source || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => {
      const source = safeHttpsUrl(item.source);
      const reason = item.route_id && withheldLegacyRouteIds.has(item.route_id)
        ? issueDisplayReason(item.reason)
        : item.reason;
      return `<article><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(reason)}</span>${source ? ` · <a href="${escapeHtml(source)}" target="_blank" rel="noopener">מקור רשמי</a>` : ''}</article>`;
    }).join('') || '<p>אין צירים ברשימת ההחרגות.</p>';
  }

  function bindEvents() {
    $('#filters').addEventListener('input', renderRoutes);
    $('#filters').addEventListener('change', renderRoutes);
    $('#clearFilters').addEventListener('click', clearFilters);
    $('[data-clear-filters]').addEventListener('click', clearFilters);
    $('#showFavoritesOnly').addEventListener('click', () => { favoritesOnly = !favoritesOnly; renderRoutes(); });
    $('#themeToggle').addEventListener('click', toggleTheme);
    $('#inviteGlobal').addEventListener('click', () => openInvite(routes[0]?.id));
    $('#openAll').addEventListener('click', () => $$('#routeGrid [data-card-details]').forEach((details) => { details.open = true; }));
    $('#closeAll').addEventListener('click', () => $$('#routeGrid [data-card-details]').forEach((details) => { details.open = false; }));
    $('#issueSearch').addEventListener('input', renderIssueRoutes);
    $('#clearIssueSearch').addEventListener('click', () => { $('#issueSearch').value = ''; renderIssueRoutes(); $('#issueSearch').focus(); });
    $('#openAllIssues').addEventListener('click', () => $$('#issueRouteGrid [data-card-details]').forEach((details) => { details.open = true; }));
    $('#closeAllIssues').addEventListener('click', () => $$('#issueRouteGrid [data-card-details]').forEach((details) => { details.open = false; }));

    $('#quickFilters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-quick]');
      if (!button) return;
      quickFilter = button.dataset.quick;
      $$('#quickFilters button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
      renderRoutes();
    });

    document.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) switchView(viewButton.dataset.view);
      const favorite = event.target.closest('[data-favorite]');
      if (favorite) toggleFavorite(favorite.dataset.favorite);
      const routeButton = event.target.closest('[data-open-route]');
      if (routeButton) openRoute(routeButton.dataset.openRoute);
      const jumpRoute = event.target.closest('[data-jump-route]');
      if (jumpRoute) openRoute(jumpRoute.dataset.jumpRoute);
      const addCombined = event.target.closest('[data-add-combined]');
      if (addCombined) toggleCombined(addCombined.dataset.addCombined);
      const exportRouteButton = event.target.closest('[data-export-route]');
      if (exportRouteButton) exportRoute(exportRouteButton.dataset.exportRoute);
      const inviteButton = event.target.closest('[data-invite]');
      if (inviteButton) {
        if ($('#routeDialog').open) $('#routeDialog').close();
        openInvite(inviteButton.dataset.invite);
      }
      const inviteGrand = event.target.closest('[data-invite-grand]');
      if (inviteGrand) {
        const journey = (legacy.grandTours || []).find((item) => item.id === inviteGrand.dataset.inviteGrand);
        if (journey) openInvite('', journey);
      }
      const exportGrandButton = event.target.closest('[data-export-grand]');
      if (exportGrandButton) exportGrand(exportGrandButton.dataset.exportGrand);
      const combinedUp = event.target.closest('[data-combined-up]');
      if (combinedUp) moveCombined(combinedUp.dataset.combinedUp, -1);
      const combinedDown = event.target.closest('[data-combined-down]');
      if (combinedDown) moveCombined(combinedDown.dataset.combinedDown, 1);
      const combinedRemove = event.target.closest('[data-combined-remove]');
      if (combinedRemove) toggleCombined(combinedRemove.dataset.combinedRemove);
      const aiButton = event.target.closest('[data-ai-route]');
      if (aiButton) openAi(aiButton.dataset.aiRoute, aiButton.dataset.aiStop === undefined ? null : Number(aiButton.dataset.aiStop));
      const speakRoute = event.target.closest('[data-speak-route]');
      if (speakRoute) {
        const route = routeById.get(speakRoute.dataset.speakRoute);
        speak(route?.story_big || route?.summary || '');
      }
      const speakStop = event.target.closest('[data-speak-stop]');
      if (speakStop) {
        const route = routeById.get(speakStop.dataset.speakStop);
        speak(route?.stops[Number(speakStop.dataset.stopIndex)]?.story_long || '');
      }
      const quick = event.target.closest('[data-ai-question]');
      if (quick) { $('#aiQuestion').value = quick.dataset.aiQuestion; $('#aiQuestion').focus(); }
    });

    $('[data-close-dialog]').addEventListener('click', () => closeDialog($('#routeDialog')));
    $('[data-close-ai]').addEventListener('click', () => closeDialog($('#aiDialog')));
    $('[data-close-invite]').addEventListener('click', () => closeDialog($('#inviteDialog')));
    $('#aiForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const question = $('#aiQuestion').value.trim();
      if (question) askAi(question.slice(0, config.aiMaxQuestionLength));
    });
    $('#speakAnswer').addEventListener('click', () => speak($('#aiAnswer').dataset.answerText || ''));
    $('#stopSpeech').addEventListener('click', () => { window.speechSynthesis?.cancel(); $('#stopSpeech').hidden = true; });

    $('#inviteRoute').addEventListener('change', (event) => loadInviteTarget(event.target.value));
    ['#inviteDate', '#invitePace', '#inviteLimit', '#meetingPrimaryPlace', '#meetingPrimaryMeet', '#meetingPrimaryDepart', '#meetingSecondaryPlace', '#meetingSecondaryMeet', '#meetingSecondaryDepart']
      .forEach((selector) => $(selector).addEventListener('input', updateInvitePreview));
    $('#meetingSecondaryEnabled').addEventListener('change', (event) => {
      $('#secondaryMeetingFields').hidden = !event.target.checked;
      updateInvitePreview();
    });
    $('#recalculateMeetings').addEventListener('click', recalculateMeetings);
    $('#saveMeetings').addEventListener('click', persistInviteMeetings);
    $('#copyInvite').addEventListener('click', async () => {
      await navigator.clipboard.writeText($('#invitePreview').value);
      $('#copyInvite').textContent = 'הועתק ✓';
      setTimeout(() => { $('#copyInvite').textContent = 'העתקת ההזמנה'; }, 1400);
    });
    $('#openWhatsapp').addEventListener('click', () => window.open(`https://wa.me/?text=${encodeURIComponent($('#invitePreview').value)}`, '_blank', 'noopener'));
    $('#exportInviteRoute').addEventListener('click', () => {
      const target = inviteTarget();
      if (!target) return;
      saveMeetings(target.route, readMeetingsFromForm(target.route));
      if (target.journey) exportGrand(target.journey.id);
      else exportRoute(target.route.id);
    });

    $('#openCombined').addEventListener('click', () => getCombined().forEach((id, index) => setTimeout(() => window.open(mapsUrl(routeById.get(id)), '_blank', 'noopener'), index * 350)));
    $('#copyCombined').addEventListener('click', async () => {
      await navigator.clipboard.writeText(combinedPlanText());
      $('#copyCombined').textContent = 'הועתק ✓';
      setTimeout(() => { $('#copyCombined').textContent = 'העתקת התכנית'; }, 1400);
    });
    $('#exportCombined').addEventListener('click', exportCombinedPlan);
    $('#clearCombined').addEventListener('click', () => { saveCombined([]); saveIssueConsents(new Set()); renderRoutes(); renderIssueRoutes(); renderFavorites(); renderCombined(); });

    $('#acceptDisclaimer').addEventListener('change', (event) => { $('#confirmDisclaimer').disabled = !event.target.checked; });
    $('#confirmDisclaimer').addEventListener('click', () => {
      localStorage.setItem(config.disclaimerAcceptedKey, config.version);
      $('#disclaimerDialog').close();
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $('#installButton').hidden = false;
    });
    $('#installButton').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('#installButton').hidden = true;
    });
    window.addEventListener('scroll', () => $('#backTop').classList.toggle('show', window.scrollY > 700), { passive: true });
    $('#backTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('hashchange', () => switchView(location.hash.slice(1) || 'routesView'));
  }

  async function initPwa() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      try { await navigator.serviceWorker.register('./sw.js', { scope: './' }); }
      catch (error) { console.warn('Service Worker registration failed', error); }
    }
  }

  async function initVisitCounter() {
    const countNode = $('#visitCount');
    const labelNode = $('#visitCountLabel');
    let eventId = '';
    try {
      eventId = sessionStorage.getItem(config.visitSessionKey) || crypto.randomUUID();
      if (!sessionStorage.getItem(config.visitSessionKey)) {
        sessionStorage.setItem(config.visitSessionKey, eventId);
        const previous = Number(localStorage.getItem(config.localVisitsKey) || 0);
        localStorage.setItem(config.localVisitsKey, String(previous + 1));
      }
      countNode.textContent = localStorage.getItem(config.localVisitsKey) || '1';
      labelNode.textContent = 'כניסות במכשיר זה';
    } catch {
      countNode.textContent = '—';
      labelNode.textContent = 'מונה מקומי לא זמין';
    }

    if (!safeHttpsUrl(config.visitEndpoint) || !eventId) return;
    try {
      const response = await fetch(config.visitEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (Number.isInteger(data.count) && data.count >= 0) {
        countNode.textContent = String(data.count);
        labelNode.textContent = 'כניסות לאתר';
      }
    } catch {
      // במצב לא מקוון נשאר המונה המקומי, בלי להציג מספר גלובלי מומצא.
    }
  }

  function init() {
    initTheme();
    migrateLegacyStorage();
    initFilters();
    bindEvents();
    renderRoutes();
    renderIssueRoutes();
    renderFavorites();
    renderCombined();
    renderJourneys();
    renderSources();
    renderExcluded();
    $('#statRoutes').textContent = routes.length;
    $('#statIssueRoutes').textContent = issueRoutes.length;
    $('#issueTabCount').textContent = issueRoutes.length;
    $('#statStops').textContent = routes.reduce((sum, route) => sum + route.stops.length, 0);
    $('#statVerified').textContent = routes.filter((route) => route.verification_level === 'מאומת ממקורות').length;
    $('#buildStatus').textContent = config.buildStatus;
    if (localStorage.getItem(config.disclaimerAcceptedKey) !== config.version) {
      $('#disclaimerDialog').showModal();
    }
    switchView(location.hash.slice(1) || 'routesView');
    initPwa();
    initVisitCounter();
  }

  init();
})();
