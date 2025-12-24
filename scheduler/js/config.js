/**
 * config.js - Firebase 및 앱 설정
 */

window.AppConfig = {
    // Firebase 설정
    firebase: {
        apiKey: "AIzaSyBzV50mjOaEnUS86sS8zOhBH0i9OePnDhM",
        authDomain: "conference-scheduler-a5656.firebaseapp.com",
        databaseURL: "https://conference-scheduler-a5656-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "conference-scheduler-a5656",
        storageBucket: "conference-scheduler-a5656.firebasestorage.app",
        messagingSenderId: "592497469624",
        appId: "1:592497469624:web:66012149580a0e144eec4d"
    },

    // 최초 관리자 이메일
    SUPER_ADMIN_EMAIL: 'demire.ykh@gmail.com',

    // 세션 타임아웃 (2시간)
    SESSION_TIMEOUT: 2 * 60 * 60 * 1000,

    // 시간 설정
    TIME_UNIT: 5, // 5분 단위
    SPEAKER_TRANSFER_TIME: 20, // 연자 이동시간 (분)
    ROOM_TRANSFER_TIME: 10, // 룸 이동 시간 (분)

    // Undo 최대 횟수
    MAX_UNDO: 5,

    // 학회 날짜
    CONFERENCE_DATES: [
        { date: '2026-04-11', label: '토요일 (4/11)', day: 'sat' },
        { date: '2026-04-12', label: '일요일 (4/12)', day: 'sun' }
    ],

    // 날짜별 룸 설정
    ROOMS_BY_DATE: {
        '2026-04-11': [
            '(토)1층 전시장A Combination Lab',
            '(토)1층 전시장B Regional Blueprint',
            '(토)4층 NextWave Insight',
            '(토)4층 Scientific Forum',
            '(토)4층 International Session - Indonesia',
            '(토)4층 International Session - Philippines',
            '(토)3층 Injectables Studio(LIVE)',
            '(토)3층 개원방'
        ],
        '2026-04-12': [
            '(일)1층 전시장A Combination Lab',
            '(일)1층 전시장B Regional Blueprint',
            '(일)4층 LASER Suite',
            '(일)4층 Injectables Forum',
            '(일)4층 Regeneration Matrix',
            '(일)4층 Contour Mapping',
            '(일)4층 Body Metabolic Lab',
            '(일)4층 Surgical Theater',
            '(일)3층 LASER Studio(LIVE)',
            '(일)Openlecture1',
            '(일)Openlecture2'
        ]
    },

    // 날짜별 기본 시간 설정
    DEFAULT_TIME_SETTINGS: {
        '2026-04-11': { startTime: '13:00', endTime: '18:30' },
        '2026-04-12': { startTime: '08:30', endTime: '17:00' }
    },

    // 카테고리 색상
    categoryColors: {
        'Laser & EBDs': '#3B82F6',
        'Aesthetic Devices': '#60A5FA',
        'Diagnostic Devices': '#93C5FD',
        'Injectables': '#F97316',
        'Bio-Stimulators': '#FB923C',
        'Regeneratives': '#FDBA74',
        'Threads': '#8B5CF6',
        'Lifting Devices': '#A78BFA',
        'Body Contouring': '#10B981',
        'Hair': '#34D399',
        'Dermatology': '#EC4899',
        'Stem Cell & Functional': '#F472B6',
        'International Faculty & Global Trends': '#F9A8D4',
        'Anatomy': '#FBCFE8',
        'ASLS': '#FCE7F3',
        'Management & Marketing': '#6B7280',
        'AI & CRM': '#9CA3AF',
        'Digital Solutions': '#D1D5DB',
        'Cosmeceuticals': '#EAB308',
        'Consumables': '#FACC15',
        'Medical Supplies': '#FDE047',
        'Safety Equipment': '#FEF08A',
        'Sedation & Analgesia Devices': '#FEF9C3',
        'Others': '#D4D4D4',
        'Other Solutions': '#E5E5E5'
    },

    // 초기 업체 목록
    INITIAL_COMPANIES: [
        "AMSC", "BODA MEDI", "DMS득진", "DSE INC", "JSDR", "LABINCUBE", "LG화학",
        "갈더마코리아", "강남언니", "굿피플메디", "그린코스코", "글로벌텍스프리", "나스메디", "네오팜",
        "노무법인 율암", "노보노디스크제약", "녹십자웰빙", "뉴퐁", "다나음", "닥터팔레트", "대웅제약",
        "대화제약", "더데이랩스", "더마라인", "더마로직", "더블유에스메디칼", "더에쓰씨", "데카코리아",
        "덱스레보", "동국제약", "동방메디컬", "디에이컴퍼니", "디엔컴퍼니", "디티에스엠지", "라온메디칼",
        "라이텍", "라플레", "레겐보겐", "레보메드", "레이저옵텍", "루메니스 코리아", "리메드", "리본메디칼",
        "멀츠에스테틱스", "메디버스", "메디솔브AI", "메디어트코리아", "메디얼라이언스", "메디온셀",
        "메디위즈", "메디코", "메디트렌드", "메디팔", "메디팹", "메딕콘", "메타바이오메드", "메타약품"
        // ... 나머지 업체들
    ]
};

// Firebase 초기화
firebase.initializeApp(window.AppConfig.firebase);
window.auth = firebase.auth();
window.database = firebase.database();

console.log('✅ config.js 로드 완료');
