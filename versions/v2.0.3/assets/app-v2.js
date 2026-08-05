/**
 * יישום ספר הטיולים — גרסה 2
 * גרסת מסמך: 2.0.3
 */

(() => {
  'use strict';

  const config = window.ROAD_BOOK_CONFIG;
  const taxonomy = window.ROAD_BOOK_TAXONOMY;
  const legacy = window.ROAD_BOOK_LEGACY;
  const variantSpecs = window.ROAD_BOOK_V2_VARIANTS || [];
  const candidateSpecs = window.ROAD_BOOK_V2_CANDIDATES || [];
  const excludedSpecs = window.ROAD_BOOK_V2_EXCLUDED || [];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const collator = new Intl.Collator('he');

  let quickFilter = 'all';
  let favoritesOnly = false;
  let deferredInstallPrompt = null;
  let aiContext = null;
  let lastFocusedElement = null;

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

  function normalizeLevel(value, routeId) {
    if (routeId === 'r028' || value === 'ראשון לציון') return 'קל';
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

  function normalizeRoute(route, index) {
    const stops = (route.stops || []).map((stop, stopIndex) => ({
      ...stop,
      stop_id: stop.stop_id || stopId(route.id, stopIndex),
      index: stopIndex + 1,
      story_long: stop.story_long || stop.story || '',
    }));
    const sources = (route.sources || []).map(safeHttpsUrl).filter(Boolean);
    const springs = (route.springs || []).filter((spring) => spring && spring.name);
    const level = normalizeLevel(route.level || '', route.id);
    const roadCharacter = normalizeRoad(route.road_character || route.style || '');
    const searchable = [
      route.title, route.region, route.area, route.duration, route.km, route.style,
      level, route.roads, route.story_big, route.summary, route.cautions, route.fuel,
      roadCharacter, route.verification_level, ...(route.trip_types || []),
      ...(route.themes || []),
      ...stops.flatMap((stop) => [stop.name, stop.kind, stop.story, stop.story_long, stop.era]),
      ...(route.food_options || []).flatMap((food) => [food.area, food.kind, food.query]),
      ...springs.flatMap((spring) => [spring.name, spring.status, spring.note]),
    ].filter(Boolean).join(' ').toLocaleLowerCase('he');

    return {
      ...route,
      index,
      level_original: route.level,
      level,
      road_character_original: route.road_character,
      road_character: roadCharacter,
      stops,
      sources,
      springs,
      search_text: searchable,
      ai_ready: route.verification_level === 'מאומת ממקורות'
        && sources.length > 0
        && stops.some((stop) => stop.story_long),
      content_scope: 'מקורות ברמת המסלול; שיוך מדויק לכל טענה טרם הושלם',
    };
  }

  const legacyRoutes = (legacy.routes || []).map(normalizeRoute);
  const legacyById = new Map(legacyRoutes.map((route) => [route.id, route]));

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
      ai_ready: false,
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
        story_long: 'נקודת מועמד במסלול חדש. אין בספר עדיין מידע מאומת מספיק להסבר קולי או לתשובת AI על המקום.',
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
      ai_ready: false,
    };
    return normalizeRoute(route, route.index);
  }

  const candidateRoutes = candidateSpecs.map(makeCandidate).filter(Boolean);
  const routes = [...legacyRoutes, ...variantRoutes, ...candidateRoutes];
  const routeById = new Map(routes.map((route) => [route.id, route]));

  function orderedRoutePoints(values = []) {
    const raw = values.filter(Boolean);
    if (raw.length <= 2) return raw;
    const origin = raw[0];
    const destination = raw.at(-1);
    const seen = new Set([origin, destination]);
    const middle = raw.slice(1, -1).filter((point) => {
      if (seen.has(point)) return false;
      seen.add(point);
      return true;
    });
    return [origin, ...middle, destination];
  }

  function mapsUrl(route) {
    if (safeHttpsUrl(route.maps_url)) return safeHttpsUrl(route.maps_url);
    const points = orderedRoutePoints([route.start, ...route.stops.map((stop) => stop.name), route.end]);
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
    const points = orderedRoutePoints([route.start, ...route.stops.map((stop) => stop.name), route.end]);
    const origin = points[0];
    const destination = points.slice(1).map((point) => `${point}, ישראל`).join(' to: ');
    return `https://maps.google.com/maps?f=d&hl=he&dirflg=d&saddr=${encodeURIComponent(`${origin}, ישראל`)}&daddr=${encodeURIComponent(destination)}&output=embed`;
  }

  function wazeUrl(place) {
    return `https://www.waze.com/ul?q=${encodeURIComponent(`${place}, ישראל`)}&navigate=yes`;
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
    renderFavorites();
  }

  function verificationClass(route) {
    return route.verification_level === 'מאומת ממקורות' ? 'verify-ok' : 'verify-warn';
  }

  function routeCard(route) {
    const favorite = getFavorites().has(route.id);
    const map = embedUrl(route);
    const shortSummary = route.summary || route.story_big || '';
    return `<article class="route-card" data-route-id="${escapeHtml(route.id)}" data-verification="${escapeHtml(route.verification_level)}">
      <div class="map-preview" data-map-src="${escapeHtml(map)}" aria-label="תצוגת מפה של ${escapeHtml(route.title)}">
        <div class="map-loading"><strong>מפת המסלול</strong><span>נטענת רק כשהכרטיס מופיע במסך</span></div>
      </div>
      <div class="route-card-main">
        <div class="route-card-top">
          <div><span class="route-number">${String(route.index + 1).padStart(3, '0')}</span><h3>${escapeHtml(route.title)}</h3></div>
          <button class="favorite-button" type="button" data-favorite="${escapeHtml(route.id)}" aria-pressed="${favorite}" aria-label="${favorite ? 'הסרת' : 'שמירת'} המסלול ${escapeHtml(route.title)}"></button>
        </div>
        <p>${escapeHtml(shortSummary)}</p>
        <div class="chips">
          <span class="chip">${escapeHtml(route.region)}</span>
          <span class="chip">${escapeHtml(route.level)}</span>
          <span class="chip">${escapeHtml(route.road_character)}</span>
          <span class="chip">${escapeHtml(route.km)}</span>
          <span class="chip ${verificationClass(route)}">${escapeHtml(route.verification_level)}</span>
          ${route.variant_of ? `<span class="chip">נגזר מ-${escapeHtml(route.variant_of)}</span>` : ''}
        </div>
        <div class="route-actions">
          <button class="button primary" type="button" data-open-route="${escapeHtml(route.id)}">פרטי הטיול</button>
          <a class="button light" href="${escapeHtml(mapsUrl(route))}" target="_blank" rel="noopener">Google Maps</a>
          <button class="button ghost" type="button" data-ai-route="${escapeHtml(route.id)}" ${route.ai_ready ? '' : 'title="העוזר יפעל במצב מקומי עד להשלמת מקורות מדויקים"'}>שאל AI</button>
        </div>
      </div>
    </article>`;
  }

  function filterRoutes() {
    const query = $('#searchInput').value.trim().toLocaleLowerCase('he');
    const region = $('#regionFilter').value;
    const level = $('#levelFilter').value;
    const road = $('#roadFilter').value;
    const verification = $('#verifyFilter').value;
    const favorites = getFavorites();
    let result = routes.filter((route) => {
      const matchesBase = (!query || route.search_text.includes(query))
        && (!region || route.region === region)
        && (!level || route.level === level)
        && (!road || route.road_character === road)
        && (!verification || route.verification_level === verification)
        && (!favoritesOnly || favorites.has(route.id));
      if (!matchesBase) return false;
      if (quickFilter === 'short') return Boolean(route.variant_of) || /קצר|ממוקד/.test(route.duration);
      if (quickFilter === 'twisty') return route.road_character === 'מפותל';
      if (quickFilter === 'beginner') return ['מתחילים', 'קל'].includes(route.level);
      if (quickFilter === 'water') return [...(route.themes || []), ...(route.trip_types || [])].some((value) => /מים|מעיינ|רחצה|טבע/.test(value));
      if (quickFilter === 'heritage') return [...(route.themes || []), ...(route.trip_types || [])].some((value) => /מורשת|היסטוריה|סיפור/.test(value));
      if (quickFilter === 'verified') return route.verification_level === 'מאומת ממקורות';
      return true;
    });

    const sort = $('#sortFilter').value;
    if (sort === 'title') result.sort((a, b) => collator.compare(a.title, b.title));
    if (sort === 'stops') result.sort((a, b) => b.stops.length - a.stops.length);
    if (sort === 'short') result.sort((a, b) => (a.km_num ?? Number.MAX_SAFE_INTEGER) - (b.km_num ?? Number.MAX_SAFE_INTEGER));
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

  function renderFavorites() {
    const favorites = getFavorites();
    const selected = routes.filter((route) => favorites.has(route.id));
    $('#favoritesGrid').innerHTML = selected.map(routeCard).join('');
    $('#favoritesEmpty').hidden = selected.length > 0;
    loadVisibleMaps();
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
      <a class="button light" href="${escapeHtml(pointsMapsUrl(day.points || []))}" target="_blank" rel="noopener">מסלול היום ב־Google Maps</a>
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
    const sources = route.sources.map((source, index) => `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">מקור מסלול ${index + 1}</a>`).join(' · ');
    $('#routeDialogContent').innerHTML = `<div class="route-detail-hero">
      <span class="eyebrow">${escapeHtml(route.region)} · ${escapeHtml(route.verification_level)}</span>
      <h2 id="routeDialogTitle">${escapeHtml(route.title)}</h2>
      <p>${escapeHtml(route.story_big || route.summary)}</p>
      <div class="chips"><span class="chip">${escapeHtml(route.level)}</span><span class="chip">${escapeHtml(route.road_character)}</span><span class="chip">${escapeHtml(route.km)}</span></div>
    </div>
    <div class="detail-grid">
      ${detailMeta('אזור', route.area)}${detailMeta('משך', route.duration)}${detailMeta('התחלה', route.start)}${detailMeta('סיום', route.end)}
      ${detailMeta('כבישים', route.roads)}${detailMeta('עונה', route.best)}${detailMeta('נבדק', route.checked_on)}${detailMeta('מבנה', route.route_shape)}
    </div>
    <div class="detail-map"><iframe title="מפת המסלול ${escapeHtml(route.title)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(embedUrl(route))}"></iframe></div>
    <div class="route-actions"><a class="button accent" href="${escapeHtml(mapsUrl(route))}" target="_blank" rel="noopener">פתיחה מלאה ב-Google Maps</a><button class="button ghost" type="button" data-speak-route="${escapeHtml(route.id)}">השמעת תקציר</button><button class="button ghost" type="button" data-ai-route="${escapeHtml(route.id)}">שאל AI על המסלול</button></div>
    <section><h3>אזהרות ייחודיות</h3><p>${escapeHtml(route.cautions)}</p><p><strong>תדלוק:</strong> ${escapeHtml(route.fuel)}</p></section>
    <section><h3>התחנות</h3><div class="stops-list">${route.stops.map((stop, index) => `<article class="stop-card"><h4>${index + 1}. ${escapeHtml(stop.name)}</h4><small>${escapeHtml(stop.kind)} · ${Number(stop.minutes) || 0} דקות · ${escapeHtml(stop.era || '')}</small><p>${escapeHtml(stop.story_long)}</p><div class="stop-actions"><a class="button light" href="${escapeHtml(wazeUrl(stop.name))}" target="_blank" rel="noopener">Waze</a><button class="button ghost" type="button" data-speak-stop="${escapeHtml(route.id)}" data-stop-index="${index}">השמעת הסבר</button><button class="button ghost" type="button" data-ai-route="${escapeHtml(route.id)}" data-ai-stop="${index}">שאל AI</button></div></article>`).join('')}</div></section>
    <section><h3>אמינות ומקורות</h3><p>${escapeHtml(route.verification_note || '')}</p><p>${escapeHtml(route.content_scope)}</p><p>${sources || 'לא צורפו מקורות תקינים.'}</p></section>
    <section class="legal-disclaimer"><h3>לפני היציאה</h3><p>זהו כלי תכנון בלבד. בודקים היום חסימות, מזג אוויר, שעות פתיחה, מצב ביטחוני וכשירות הקבוצה. אין להשתמש באתר בזמן רכיבה.</p></section>`;
    $('#routeDialog').showModal();
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
    $('#aiStatus').textContent = route.ai_ready
      ? 'העוזר יענה רק מתוך חומר הספר ומקורות המסלול.'
      : 'עד להשלמת שיוך מקורות מדויק, התשובה תוצג במצב מקומי מתוך הטקסט הקיים.';
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
    return `${prefix}\n${sourceText}${caution}\n\nמצב מקומי: זו אינה תשובת מודל ענן. המידע הוחזר ישירות מהטקסט המתועד בספר.`;
  }

  async function askAi(question) {
    if (!aiContext) return;
    const { route, stop } = aiContext;
    const status = $('#aiStatus');
    const answerBox = $('#aiAnswer');
    status.textContent = 'בודק את החומר המאומת…';
    answerBox.hidden = true;
    let answer = '';
    let sources = route.sources;

    if (config.aiEndpoint && navigator.onLine && route.ai_ready) {
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
        status.textContent = data.support === 'supported' ? 'תשובה מעוגנת בחומר המאומת.' : 'המידע הקיים אינו מספיק לתשובה מלאה.';
      } catch (error) {
        console.warn('AI fallback', error);
        answer = localGroundedAnswer(route, stop, question);
        status.textContent = 'שירות ה-AI אינו זמין כרגע; מוצג הטקסט המקומי המאומת.';
      } finally {
        clearTimeout(timer);
      }
    } else {
      answer = localGroundedAnswer(route, stop, question);
      status.textContent = navigator.onLine
        ? 'שירות הענן טרם חובר; מוצג הטקסט המקומי.'
        : 'המכשיר במצב לא מקוון; מוצג הטקסט המקומי.';
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
    if (viewId === 'plannerView') renderFavorites();
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
    const urls = new Set([
      ...(legacy.sources || []).map((source) => source.url).filter(Boolean),
      ...routes.flatMap((route) => route.sources),
    ]);
    $('#sourceList').innerHTML = [...urls].map(safeHttpsUrl).filter(Boolean)
      .map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`).join('');
  }

  function renderExcluded() {
    $('#excludedList').innerHTML = excludedSpecs.map((item) => {
      const source = safeHttpsUrl(item.source);
      return `<article><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.reason)}</span>${source ? ` · <a href="${escapeHtml(source)}" target="_blank" rel="noopener">מקור רשמי</a>` : ''}</article>`;
    }).join('') || '<p>אין צירים ברשימת ההחרגות.</p>';
  }

  function bindEvents() {
    $('#filters').addEventListener('input', renderRoutes);
    $('#filters').addEventListener('change', renderRoutes);
    $('#clearFilters').addEventListener('click', clearFilters);
    $('[data-clear-filters]').addEventListener('click', clearFilters);
    $('#showFavoritesOnly').addEventListener('click', () => { favoritesOnly = !favoritesOnly; renderRoutes(); });
    $('#themeToggle').addEventListener('click', toggleTheme);

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
    $('#aiForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const question = $('#aiQuestion').value.trim();
      if (question) askAi(question.slice(0, config.aiMaxQuestionLength));
    });
    $('#speakAnswer').addEventListener('click', () => speak($('#aiAnswer').dataset.answerText || ''));
    $('#stopSpeech').addEventListener('click', () => { window.speechSynthesis?.cancel(); $('#stopSpeech').hidden = true; });

    $('#acceptDisclaimer').addEventListener('change', (event) => { $('#confirmDisclaimer').disabled = !event.target.checked; });
    $('#confirmDisclaimer').addEventListener('click', () => {
      localStorage.setItem(config.disclaimerAcceptedKey, config.documentVersion);
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
    window.addEventListener('hashchange', () => switchView(location.hash.slice(1) || 'routesView'));
  }

  async function initPwa() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      try { await navigator.serviceWorker.register('./sw.js', { scope: './' }); }
      catch (error) { console.warn('Service Worker registration failed', error); }
    }
  }

  function init() {
    initTheme();
    migrateLegacyStorage();
    initFilters();
    bindEvents();
    renderRoutes();
    renderFavorites();
    renderJourneys();
    renderSources();
    renderExcluded();
    $('#statRoutes').textContent = routes.length;
    $('#statStops').textContent = routes.reduce((sum, route) => sum + route.stops.length, 0);
    $('#statVerified').textContent = legacyRoutes.filter((route) => route.verification_level === 'מאומת ממקורות').length;
    $('#buildStatus').textContent = config.buildStatus;
    if (localStorage.getItem(config.disclaimerAcceptedKey) !== config.documentVersion) {
      $('#disclaimerDialog').showModal();
    }
    switchView(location.hash.slice(1) || 'routesView');
    initPwa();
  }

  init();
})();
