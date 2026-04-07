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
    SPEAKER_TRANSFER_TIME: 10, // 연자 이동시간 (분)
    ROOM_TRANSFER_TIME: 10, // 룸 이동 시간 (분)

    // Undo 최대 횟수
    MAX_UNDO: 5,

    // 학회 날짜 — Firebase /settings/dates 에서 로드, 여기선 빈 배열
    CONFERENCE_DATES: [],

    // 날짜별 룸 설정 — Firebase /settings/roomsByDate 에서 로드
    ROOMS_BY_DATE: {},

    // 날짜별 기본 시간 설정 — Firebase /settings/timeSettings 에서 로드
    DEFAULT_TIME_SETTINGS: {},

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

    // 업체 목록 — Firebase /companies 에서 로드
    INITIAL_COMPANIES: [],
};

// Firebase 초기화
firebase.initializeApp(window.AppConfig.firebase);
window.auth = firebase.auth();
window.database = firebase.database();

console.log('✅ config.js 로드 완료');
