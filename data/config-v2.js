/**
 * הגדרות ספר הטיולים
 * גרסה: 3.0.0
 */

window.ROAD_BOOK_CONFIG = Object.freeze({
  version: '4.1.1',
  buildStatus: 'v4.1.1',
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

window.ROAD_BOOK_PLAYLISTS_CATALOG = [
  {
    "id": "pl_israel_rock",
    "name": "רוק ישראלי קלאסי לרכיבה",
    "genre": "רוק ישראלי",
    "artist": "שלום חנוך · כוורת · משינה · ברי סחרוף · אריק איינשטיין",
    "description": "קלאסיקות רוק ישראלי באנרגיה גבוהה (120-135 BPM) לרכיבה בכבישי הארץ הנופיים.",
    "tracks": [
      "כוורת – מדינה קטנה",
      "שלום חנוך – מחכים למשיח",
      "משינה – תחזור תחזור",
      "ברי סחרוף – עבדים",
      "אריק איינשטיין – סוס עץ"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=%D7%A8%D7%95%D7%A7+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99",
    "youtubeUrl": "https://music.youtube.com/search?q=%D7%A8%D7%95%D7%A7+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99",
    "spotifyUrl": "https://open.spotify.com/search/%D7%A8%D7%95%D7%A7%20%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99"
  },
  {
    "id": "pl_synthwave",
    "name": "80s Synthwave & Retrowave (Night Ride)",
    "genre": "Synthwave / Retrowave",
    "artist": "Kavinsky · The Midnight · Carpenter Brut · FM-84 · Lazerhawk",
    "description": "סאונד אייטיז עתידני עם בס מקפיץ ומקצבים אלקטרוניים, מושלם לרכיבות ערב ולילה בכבישים מהירים.",
    "tracks": [
      "Kavinsky – Nightcall",
      "The Midnight – Sunset",
      "FM-84 – Running in the Night",
      "Lazerhawk – Overdrive",
      "GUNSHIP – Tech Noir"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=synthwave+night+drive",
    "youtubeUrl": "https://music.youtube.com/search?q=synthwave+night+drive",
    "spotifyUrl": "https://open.spotify.com/search/synthwave%20night%20drive"
  },
  {
    "id": "pl_classic_rock",
    "name": "70s-80s Classic Rock Highway",
    "genre": "Classic Rock",
    "artist": "AC/DC · Steppenwolf · Pink Floyd · Guns N' Roses · Queen",
    "description": "המנוני הרוק הגדולים של שנות ה-70 וה-80, גיטרות חשמליות עוצמתיות וקצב כביש מהיר פתוח.",
    "tracks": [
      "Steppenwolf – Born to Be Wild",
      "AC/DC – Highway to Hell",
      "Guns N' Roses – Paradise City",
      "Pink Floyd – Comfortably Numb",
      "Queen – Don't Stop Me Now"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=classic+rock+highway",
    "youtubeUrl": "https://music.youtube.com/search?q=classic+rock+highway",
    "spotifyUrl": "https://open.spotify.com/search/classic%20rock%20highway"
  },
  {
    "id": "pl_hebrew_90s",
    "name": "רוק ופופ ישראלי שנות ה-90",
    "genre": "רוק 90s ישראלי",
    "artist": "איפה הילד · מוניקה סקס · דוקטור קספר · אביב גפן · זקני צפת",
    "description": "תור הזהב של הרוק הישראלי בשנות ה-90. גיטרות מחוספסות, אנרגיה צעירה ונוסטלגיה ישראלית.",
    "tracks": [
      "איפה הילד – נפלת חזק",
      "מוניקה סקס – פצעים ונשיקות",
      "דוקטור קספר – אחלום לנצח",
      "אביב גפן – עכשיו מעונן",
      "זקני צפת – שישי שבת"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=%D7%A8%D7%95%D7%A7+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99+90",
    "youtubeUrl": "https://music.youtube.com/search?q=%D7%A8%D7%95%D7%A7+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99+90",
    "spotifyUrl": "https://open.spotify.com/search/%D7%A8%D7%95%D7%A7%20%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99%2090"
  },
  {
    "id": "pl_metal_power",
    "name": "Heavy Metal & Power Riding",
    "genre": "Heavy Metal",
    "artist": "Iron Maiden · Metallica · Megadeth · Judas Priest · Motörhead",
    "description": "אדרנלין מטורף וקצב תופים מהיר לרכיבה ספורטיבית ומאתגרת בכבישים מפותלים.",
    "tracks": [
      "Iron Maiden – The Trooper",
      "Metallica – Master of Puppets",
      "Judas Priest – Painkiller",
      "Megadeth – Symphony of Destruction",
      "Motörhead – Ace of Spades"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=heavy+metal+motorcycle",
    "youtubeUrl": "https://music.youtube.com/search?q=heavy+metal+motorcycle",
    "spotifyUrl": "https://open.spotify.com/search/heavy%20metal%20motorcycle"
  },
  {
    "id": "pl_blues_road",
    "name": "Desert Blues & Road trip",
    "genre": "Blues Rock",
    "artist": "ZZ Top · Stevie Ray Vaughan · Gary Clark Jr. · Allman Brothers",
    "description": "בלוז-רוק נשמה דרומי, גיטרות סלייד קצביות ואווירת מרחבים לרכיבות מדבר ואזורים פתוחים.",
    "tracks": [
      "ZZ Top – La Grange",
      "Stevie Ray Vaughan – Pride and Joy",
      "The Allman Brothers – Ramblin' Man",
      "Gary Clark Jr. – Bright Lights",
      "Jimi Hendrix – Voodoo Child"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=roadtrip+blues+rock",
    "youtubeUrl": "https://music.youtube.com/search?q=roadtrip+blues+rock",
    "spotifyUrl": "https://open.spotify.com/search/roadtrip%20blues%20rock"
  },
  {
    "id": "pl_indie_breeze",
    "name": "אינדי ישראלי ורוק רך לבוקר",
    "genre": "אינדי ישראלי",
    "artist": "גבע אלון · עמיר לב · אסף אבידן · ג'יין בורדו · עלמה זהר",
    "description": "סאונד אקוסטי, מלטף וקליל לרכיבות בוקר מוקדמות, כבישי עמק וכרמים שקטים.",
    "tracks": [
      "גבע אלון – Modern Love",
      "אסף אבידן – One Day",
      "ג'יין בורדו – איך אפשר שלא",
      "עמיר לב – אריה ויונה",
      "עלמה זהר – שיר אהבה אינדיאני"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=%D7%90%D7%99%D7%A0%D7%93%D7%99+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99",
    "youtubeUrl": "https://music.youtube.com/search?q=%D7%90%D7%99%D7%A0%D7%93%D7%99+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99",
    "spotifyUrl": "https://open.spotify.com/search/%D7%90%D7%99%D7%A0%D7%93%D7%99%20%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99"
  },
  {
    "id": "pl_mediterranean",
    "name": "קצב ים-תיכוני ויווני לרכיבה נופית",
    "genre": "יווני וים-תיכוני",
    "artist": "יהודה פוליקר · סטלוס ואורן חן · שמעון בוסקילה · יורגוס דאלאראס",
    "description": "קצב יווני וים-תיכוני שמח, בוזוקי קצבי ואווירה יוונית לרכיבה לאורך חופי הים וההרים.",
    "tracks": [
      "יהודה פוליקר – עיניים שלי",
      "סטלוס ואורן חן – מחרוזת יוונית",
      "שמעון בוסקילה – את המחר שלי",
      "יהודה פוליקר – זינגואלה",
      "יורגוס דאלאראס – זיבקיקו"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=%D7%99%D7%95%D7%95%D7%A0%D7%99+%D7%9C%D7%A8%D7%9B%D7%99%D7%91%D7%94",
    "youtubeUrl": "https://music.youtube.com/search?q=%D7%99%D7%95%D7%95%D7%A0%D7%99+%D7%9C%D7%A8%D7%9B%D7%99%D7%91%D7%94",
    "spotifyUrl": "https://open.spotify.com/search/%D7%99%D7%95%D7%95%D7%A0%D7%99%20%D7%9C%D7%A8%D7%9B%D7%99%D7%91%D7%94"
  },
  {
    "id": "pl_electronic_trance",
    "name": "Progressive Trance & Electronic Drive",
    "genre": "Trance & Electronic",
    "artist": "Infected Mushroom · Astrix · Vini Vici · Astral Projection",
    "description": "טראנס פרוגרסיב ישראלי ובינלאומי, מקצב רציף וממגנט ששומר על פוקוס וזרימה מושלמת בכביש.",
    "tracks": [
      "Infected Mushroom – Becoming Insane",
      "Astrix – Deep Jungle Walk",
      "Vini Vici – Great Spirit",
      "Astral Projection – Mahadeva",
      "Shpongle – Divine Moments of Truth"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=progressive+trance+drive",
    "youtubeUrl": "https://music.youtube.com/search?q=progressive+trance+drive",
    "spotifyUrl": "https://open.spotify.com/search/progressive%20trance%20drive"
  },
  {
    "id": "pl_90s_grunge",
    "name": "90s Grunge & Alternative Rock",
    "genre": "90s Grunge",
    "artist": "Nirvana · Pearl Jam · Soundgarden · Alice in Chains",
    "description": "צלילי סיאטל והאלטרנטיב של שנות ה-90. דיסטורשן כבד, אנרגיה גראנג'ית ודרייב עוצמתי.",
    "tracks": [
      "Nirvana – Smells Like Teen Spirit",
      "Pearl Jam – Alive",
      "Soundgarden – Black Hole Sun",
      "Alice in Chains – Man in the Box",
      "Stone Temple Pilots – Plush"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=90s+grunge+rock",
    "youtubeUrl": "https://music.youtube.com/search?q=90s+grunge+rock",
    "spotifyUrl": "https://open.spotify.com/search/90s%20grunge%20rock"
  },
  {
    "id": "pl_hebrew_chanson",
    "name": "שירי דרך ומורשת ישראלית",
    "genre": "מורשת וישראלי",
    "artist": "אריק איינשטיין · נעמי שמר · יהורם גאון · להקת הנח\"ל · מאיר אריאל",
    "description": "נכסי צאן ברזל של המוזיקה העברית. שירי ארץ ישראל היפה, מורשת ונוסטלגיה עמוקה בדרכים.",
    "tracks": [
      "אריק איינשטיין – עטור מצחך",
      "נעמי שמר – ירושלים של זהב",
      "יהורם גאון – בלדה לחובש",
      "להקת הנח\"ל – שיר לשלום",
      "מאיר אריאל – נדר נדרתי"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=%D7%A9%D7%99%D7%A8%D7%99+%D7%93%D7%A8%D7%9A+%D7%99%D7%A9%D7%A8%D7%90%D7%9C",
    "youtubeUrl": "https://music.youtube.com/search?q=%D7%A9%D7%99%D7%A8%D7%99+%D7%93%D7%A8%D7%9A+%D7%99%D7%A9%D7%A8%D7%90%D7%9C",
    "spotifyUrl": "https://open.spotify.com/search/%D7%A9%D7%99%D7%A8%D7%99%20%D7%93%D7%A8%D7%9A%20%D7%99%D7%A9%D7%A8%D7%90%D7%9C"
  },
  {
    "id": "pl_funk_groove",
    "name": "Funk, Groove & Soul Highway",
    "genre": "Funk & Soul",
    "artist": "Earth Wind & Fire · Stevie Wonder · James Brown · Bruno Mars",
    "description": "מקצבי פאנק וסול מקפיצים שמכניסים אנרגיה וקצב זורם וחייכני לקסדה.",
    "tracks": [
      "Earth, Wind & Fire – September",
      "Stevie Wonder – Superstition",
      "James Brown – Get Up (Sex Machine)",
      "Bruno Mars – Uptown Funk",
      "Tower of Power – What Is Hip?"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=funk+groove+driving",
    "youtubeUrl": "https://music.youtube.com/search?q=funk+groove+driving",
    "spotifyUrl": "https://open.spotify.com/search/funk%20groove%20driving"
  },
  {
    "id": "pl_reggae_dub",
    "name": "Sunshine Reggae & Dub Chill",
    "genre": "Reggae & Dub",
    "artist": "Bob Marley · Damian Marley · UB40 · התקווה 6",
    "description": "רגאיי ודאב רגועים, קצב באס חם ואווירה חופשית ומשוחררת לרכיבות שבת שקטות.",
    "tracks": [
      "Bob Marley – Could You Be Loved",
      "Damian Marley – Welcome to Jamrock",
      "התקווה 6 – הכי ישראלי",
      "UB40 – Red Red Wine",
      "Jimmy Cliff – Reggae Night"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=sunshine+reggae+dub",
    "youtubeUrl": "https://music.youtube.com/search?q=sunshine+reggae+dub",
    "spotifyUrl": "https://open.spotify.com/search/sunshine%20reggae%20dub"
  },
  {
    "id": "pl_country_highway",
    "name": "Country Rock & Southern Highway",
    "genre": "Country Rock",
    "artist": "Lynyrd Skynyrd · Creedence Clearwater Revival · Johnny Cash · Eagles",
    "description": "קאנטרי-רוק אמריקאי קלאסי לרכיבה במרחבי הנגב והערבה, גיטרות אקוסטיות ומקצב כביש מהיר.",
    "tracks": [
      "Lynyrd Skynyrd – Sweet Home Alabama",
      "CCR – Fortunate Son",
      "Johnny Cash – I Walk the Line",
      "Eagles – Take It Easy",
      "Willie Nelson – On the Road Again"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=southern+country+rock",
    "youtubeUrl": "https://music.youtube.com/search?q=southern+country+rock",
    "spotifyUrl": "https://open.spotify.com/search/southern%20country%20rock"
  },
  {
    "id": "pl_acoustic_sunset",
    "name": "שקיעה אקוסטית — רכיבה רגועה",
    "genre": "אקוסטי ופולק",
    "artist": "Jack Johnson · Ben Howard · Passenger · אביתר בנאי",
    "description": "שירים אקוסטיים שקטים ומלטפים לרכיבת שקיעה חזרה הביתה אחרי יום רכיבה ארוך.",
    "tracks": [
      "Jack Johnson – Banana Pancakes",
      "Passenger – Let Her Go",
      "אביתר בנאי – יפה כל כך",
      "Ben Howard – Keep Your Head Up",
      "José González – Heartbeats"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=acoustic+sunset+drive",
    "youtubeUrl": "https://music.youtube.com/search?q=acoustic+sunset+drive",
    "spotifyUrl": "https://open.spotify.com/search/acoustic%20sunset%20drive"
  },
  {
    "id": "pl_punk_energy",
    "name": "Punk Rock & Adrenaline Rush",
    "genre": "Punk Rock",
    "artist": "Green Day · The Offspring · Blink-182 · Ramones",
    "description": "פרוק פאנק אנרגטי, מהיר וקצבי להעלאת הדופק והאדרנלין בקטעי רכיבה טכניים.",
    "tracks": [
      "The Offspring – The Kids Aren't Alright",
      "Green Day – Basket Case",
      "Blink-182 – All the Small Things",
      "Ramones – Blitzkrieg Bop",
      "Sum 41 – Fat Lip"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=punk+rock+adrenaline",
    "youtubeUrl": "https://music.youtube.com/search?q=punk+rock+adrenaline",
    "spotifyUrl": "https://open.spotify.com/search/punk%20rock%20adrenaline"
  },
  {
    "id": "pl_hiphop_flow",
    "name": "Hebrew Hip-Hop & Beats Drive",
    "genre": "היפ-הופ ישראלי",
    "artist": "הדג נחש · טונה · רביד פלוטניק · שוטי הנבואה · סאבלימינל",
    "description": "היפ-הופ ישראלי משובח, מילים חדות וביטים עוצמתיים שנעים יחד עם האופנוע.",
    "tracks": [
      "הדג נחש – שירת הסטיקר",
      "טונה – רוק 30",
      "רביד פלוטניק – כל הזמן הזה",
      "שוטי הנבואה – יפיהפיה",
      "סאבלימינל – התקווה"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=%D7%94%D7%99%D7%A4+%D7%94%D7%95%D7%A4+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99",
    "youtubeUrl": "https://music.youtube.com/search?q=%D7%94%D7%99%D7%A4+%D7%94%D7%95%D7%A4+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99",
    "spotifyUrl": "https://open.spotify.com/search/%D7%94%D7%99%D7%A4%20%D7%94%D7%95%D7%A4%20%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99"
  },
  {
    "id": "pl_latino_rhythm",
    "name": "קצב לטיני וקפואירה לרכיבה",
    "genre": "לטיני וברזילאי",
    "artist": "Santana · Gipsy Kings · Sergio Mendes · Sepultura Acoustic",
    "description": "מקצבים לטיניים חמים, גיטרות ספרדיות ותופים ברזילאיים שמוסיפים פלפל לכל עיקול.",
    "tracks": [
      "Santana – Oye Como Va",
      "Gipsy Kings – Volare",
      "Sergio Mendes – Mas Que Nada",
      "Santana – Smooth",
      "Gipsy Kings – Bamboleo"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=latino+rhythm+drive",
    "youtubeUrl": "https://music.youtube.com/search?q=latino+rhythm+drive",
    "spotifyUrl": "https://open.spotify.com/search/latino%20rhythm%20drive"
  },
  {
    "id": "pl_celtic_fiddle",
    "name": "Celtic Rock & Fiddle Highway",
    "genre": "Celtic Rock",
    "artist": "Dropkick Murphys · Flogging Molly · The Corrs · The Dubliners",
    "description": "סאונד קלטי-אירי סוער, כינורות קצביים וחמת חלילים באנרגיית רכיבה אינסופית.",
    "tracks": [
      "Dropkick Murphys – Shipping Up to Boston",
      "Flogging Molly – Devil's Dance Floor",
      "The Corrs – Toss the Feathers",
      "Gaelic Storm – Kiss Me I'm Irish",
      "The Dubliners – Whiskey in the Jar"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=celtic+rock+fiddle",
    "youtubeUrl": "https://music.youtube.com/search?q=celtic+rock+fiddle",
    "spotifyUrl": "https://open.spotify.com/search/celtic%20rock%20fiddle"
  },
  {
    "id": "pl_ambient_calm",
    "name": "Ambient & Cinematic Soundscapes",
    "genre": "Ambient & Cinematic",
    "artist": "Hans Zimmer · Tycho · Sigur Rós · Ennio Morricone",
    "description": "סאונד סרטים קולנועי ומרחבי, כינורות וסינתים עמוקים לרכיבה היפנוטית בנופים עוצרי נשימה.",
    "tracks": [
      "Hans Zimmer – Time (Inception)",
      "Tycho – A Walk",
      "Sigur Rós – Hoppípolla",
      "Ennio Morricone – The Ecstasy of Gold",
      "Ludovico Einaudi – Nuvole Bianche"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=cinematic+ambient+drive",
    "youtubeUrl": "https://music.youtube.com/search?q=cinematic+ambient+drive",
    "spotifyUrl": "https://open.spotify.com/search/cinematic%20ambient%20drive"
  },
  {
    "id": "pl_80s_pop_rock",
    "name": "80s Pop Rock Anthems",
    "genre": "80s Pop Rock",
    "artist": "A-ha · Tears for Fears · Duran Duran · Depeche Mode",
    "description": "היטי הפופ-רוק הגדולים ביותר של שנות ה-80. מקצב סוחף, שירים שכולם מכירים וכיף טהור.",
    "tracks": [
      "A-ha – Take On Me",
      "Tears for Fears – Everybody Wants to Rule the World",
      "Depeche Mode – Enjoy the Silence",
      "Duran Duran – Hungry Like the Wolf",
      "The Outfield – Your Love"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=80s+pop+rock+anthems",
    "youtubeUrl": "https://music.youtube.com/search?q=80s+pop+rock+anthems",
    "spotifyUrl": "https://open.spotify.com/search/80s%20pop%20rock%20anthems"
  },
  {
    "id": "pl_hard_rock_80s",
    "name": "Hard Rock & Hair Metal Greats",
    "genre": "Hard Rock",
    "artist": "Bon Jovi · Def Leppard · Whitesnake · Scorpions · Van Halen",
    "description": "סולואים מטורפים של גיטרות, שירה עוצמתית ואנרגיה קלאסית של הארד רוק 80s.",
    "tracks": [
      "Bon Jovi – Livin' on a Prayer",
      "Def Leppard – Pour Some Sugar on Me",
      "Whitesnake – Here I Go Again",
      "Scorpions – Rock You Like a Hurricane",
      "Van Halen – Jump"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=80s+hard+rock+greats",
    "youtubeUrl": "https://music.youtube.com/search?q=80s+hard+rock+greats",
    "spotifyUrl": "https://open.spotify.com/search/80s%20hard%20rock%20greats"
  },
  {
    "id": "pl_balkan_groove",
    "name": "קצב בלקני וצועני אנרגטי",
    "genre": "בלקני וצועני",
    "artist": "Goran Bregovic · Shantel · Balkan Beat Box · Emir Kusturica",
    "description": "חצוצרות, קלרינט וביטים בלקניים צצועניים משוגעים שמשחררים כל מתח ברכיבה.",
    "tracks": [
      "Balkan Beat Box – Hermetico",
      "Shantel – Disko Partizani",
      "Goran Bregovic – Kalashnikov",
      "Balkan Beat Box – Move Zungit",
      "Emir Kusturica – Unza Unza Time"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=balkan+beats+groove",
    "youtubeUrl": "https://music.youtube.com/search?q=balkan+beats+groove",
    "spotifyUrl": "https://open.spotify.com/search/balkan%20beats%20groove"
  },
  {
    "id": "pl_jazz_fusion",
    "name": "Smooth Jazz & Fusion Night Drive",
    "genre": "Jazz Fusion",
    "artist": "Miles Davis · Weather Report · Casiopea · Snarky Puppy",
    "description": "ג'אז פיוז'ן איכותי ומתוחכם לרכיבות לילה שקטות בכבישים מפותלים.",
    "tracks": [
      "Miles Davis – So What",
      "Weather Report – Birdland",
      "Casiopea – Mint Jams",
      "Snarky Puppy – Lingus",
      "Herbie Hancock – Chameleon"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=jazz+fusion+night+drive",
    "youtubeUrl": "https://music.youtube.com/search?q=jazz+fusion+night+drive",
    "spotifyUrl": "https://open.spotify.com/search/jazz%20fusion%20night%20drive"
  },
  {
    "id": "pl_israel_gold",
    "name": "זהב ישראלי — קלאסיקות לכל הזמנים",
    "genre": "זהב ישראלי",
    "artist": "כוורת · שלום חנוך · יהורם גאון · מאיר אריאל · שלומי שבת",
    "description": "השירים הישראליים היפים והאהובים ביותר שכל רוכב אוהב לשיר בקסדה.",
    "tracks": [
      "כוורת – יו יה",
      "שלומי שבת – בראשית עולם",
      "יהודה פוליקר – חלון לים התיכון",
      "מאיר אריאל – שלל רב",
      "אריק איינשטיין – אולז מנגנים"
    ],
    "appleUrl": "https://music.apple.com/il/search?term=%D7%A7%D7%9C%D7%90%D7%A1%D7%99%D7%A7%D7%95%D7%AA+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99%D7%95%D7%AA",
    "youtubeUrl": "https://music.youtube.com/search?q=%D7%A7%D7%9C%D7%90%D7%A1%D7%99%D7%A7%D7%95%D7%AA+%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99%D7%95%D7%AA",
    "spotifyUrl": "https://open.spotify.com/search/%D7%A7%D7%9C%D7%90%D7%A1%D7%99%D7%A7%D7%95%D7%AA%20%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99%D7%95%D7%AA"
  }
];
