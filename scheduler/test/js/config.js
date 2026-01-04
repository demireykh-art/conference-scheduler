/**
 * config.js - Firebase 및 앱 설정
 * ⚠️ 테스트 버전 - 운영 데이터와 분리됨
 */

window.AppConfig = {
    // 테스트 모드 플래그
    isTestMode: true,
    testPrefix: '/test', // Firebase 경로 prefix
    
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
    SPEAKER_TRANSFER_TIME: 10, // 연자 이동시간 (분)
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
    // 카테고리 그룹 (3개씩 행 배열용)
    categoryGroups: [
        // 0행: Break/특수 (특수)
        ['Coffee Break', 'Opening/Closing', 'Luncheon'],
        // 1행: 주요 카테고리
        ['Injectables', 'Laser & EBDs', 'Bio-Stimulators'],
        // 2행: 디바이스
        ['Aesthetic Devices', 'Lifting Devices', 'Body Contouring'],
        // 3행: 재생/스킨
        ['Regeneratives', 'Threads', 'Dermatology'],
        // 4행: 특수 분야
        ['Hair', 'Stem Cell & Functional', 'Anatomy'],
        // 5행: 기타 의료
        ['Diagnostic Devices', 'Sedation & Analgesia Devices', 'Medical Supplies'],
        // 6행: 학술/교육
        ['International Faculty & Global Trends', 'ASLS', 'Management & Marketing'],
        // 7행: 디지털/비즈니스
        ['AI & CRM', 'Digital Solutions', 'Cosmeceuticals'],
        // 8행: 소모품/기타
        ['Consumables', 'Safety Equipment', 'Others'],
        // 9행: 기타
        ['Other Solutions']
    ],

    categoryColors: {
        'Coffee Break': '#795548',
        'Lunch': '#5D4037',
        'Opening/Closing': '#37474F',
        'Panel Discussion': '#424242',
        'Luncheon': '#FF8F00',
        'Injectables': '#E65100',
        'Laser & EBDs': '#1565C0',
        'Bio-Stimulators': '#EF6C00',
        'Aesthetic Devices': '#1976D2',
        'Lifting Devices': '#7B1FA2',
        'Body Contouring': '#00897B',
        'Regeneratives': '#F57C00',
        'Threads': '#6A1B9A',
        'Dermatology': '#C2185B',
        'Hair': '#00796B',
        'Stem Cell & Functional': '#D81B60',
        'Anatomy': '#AD1457',
        'Diagnostic Devices': '#0277BD',
        'Sedation & Analgesia Devices': '#558B2F',
        'Medical Supplies': '#9E9D24',
        'International Faculty & Global Trends': '#5E35B1',
        'ASLS': '#8E24AA',
        'Management & Marketing': '#455A64',
        'AI & CRM': '#546E7A',
        'Digital Solutions': '#607D8B',
        'Cosmeceuticals': '#F9A825',
        'Consumables': '#FBC02D',
        'Safety Equipment': '#AFB42B',
        'Others': '#757575',
        'Other Solutions': '#9E9E9E'
    },

    // Break 타입 정의 (중복 배치 가능)
    BREAK_TYPES: ['Coffee Break', 'Lunch', 'Opening/Closing', 'Panel Discussion'],

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

// 테스트 모드용 database.ref 래퍼
// 원본 ref 함수 저장
const originalRef = window.database.ref.bind(window.database);

// 테스트 모드면 경로에 prefix 추가
window.database.ref = function(path) {
    if (window.AppConfig.isTestMode && path && !path.startsWith('.info')) {
        const testPath = window.AppConfig.testPrefix + path;
        console.log(`[TEST DB] ${path} → ${testPath}`);
        return originalRef(testPath);
    }
    return originalRef(path);
};

console.log('✅ config.js 로드 완료 [🧪 테스트 모드]');
console.log('⚠️ 테스트 데이터베이스 사용 중: /test/* 경로');
