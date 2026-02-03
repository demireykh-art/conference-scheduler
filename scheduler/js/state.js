/**
 * state.js - 앱 전역 상태 관리
 * 수정: Setter 패턴 도입, Toast 알림 시스템
 */

// ============================================
// Toast 알림 시스템 (alert 대체)
// ============================================
window.Toast = {
    _container: null,
    _getContainer() {
        if (!this._container) {
            this._container = document.createElement('div');
            this._container.id = 'toast-container';
            this._container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(this._container);
        }
        return this._container;
    },
    show(message, type = 'info', duration = 3000) {
        const container = this._getContainer();
        const toast = document.createElement('div');
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        toast.style.cssText = `pointer-events:auto;background:#fff;border-left:4px solid ${colors[type]};padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:400px;font-size:0.9rem;display:flex;align-items:flex-start;gap:8px;opacity:0;transform:translateX(100%);transition:all 0.3s ease;`;
        toast.innerHTML = `<span style="flex-shrink:0">${icons[type]}</span><span style="flex:1;word-break:break-word">${message}</span><button onclick="this.parentElement.remove()" style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:1.1rem;color:#999;padding:0 0 0 8px;">×</button>`;
        container.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
        if (duration > 0) {
            setTimeout(() => {
                toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
        return toast;
    },
    success(msg, dur) { return this.show(msg, 'success', dur); },
    error(msg, dur) { return this.show(msg, 'error', dur || 5000); },
    warning(msg, dur) { return this.show(msg, 'warning', dur || 4000); },
    info(msg, dur) { return this.show(msg, 'info', dur); }
};

// ============================================
// 안전한 confirm/alert 래퍼 (중요한 경우만 기존 alert 유지)
// ============================================
window.showAlert = function(msg) { Toast.warning(msg); };
window.showSuccess = function(msg) { Toast.success(msg); };
window.showError = function(msg) { Toast.error(msg); };

// ============================================
// AppState 보호 래퍼 (speakers 덮어쓰기 방지)
// ============================================
window.AppStateSetter = {
    /**
     * speakers를 안전하게 설정 (20명 미만으로 줄어드는 것 방지)
     */
    setSpeakers(newSpeakers) {
        if (!Array.isArray(newSpeakers)) return false;
        // 기존보다 적은 수로 대체 시도하면 경고 후 차단
        if (AppState.speakers.length > 20 && newSpeakers.length < 20) {
            console.warn(`⚠️ speakers 덮어쓰기 차단: ${AppState.speakers.length}명 → ${newSpeakers.length}명`);
            return false;
        }
        AppState.speakers = newSpeakers;
        console.log(`✅ speakers 업데이트: ${newSpeakers.length}명`);
        return true;
    },
    /**
     * speakers에 새 연자 추가 (중복 제거)
     */
    addSpeaker(speaker) {
        if (!speaker || !speaker.name) return;
        if (!AppState.speakers.find(s => s.name === speaker.name)) {
            AppState.speakers.push(speaker);
        }
    }
};

// 기본 Break 항목 (항상 강의목록에 표시, 중복 배치 가능)
window.DEFAULT_BREAK_ITEMS = [
    {
        id: 'break-coffee',
        titleKo: '☕ Coffee Break',
        titleEn: 'Coffee Break',
        speakerKo: '',
        speakerEn: '',
        affiliation: '',
        category: 'Coffee Break',
        duration: 20,
        isBreak: true
    },
    {
        id: 'break-lunch',
        titleKo: '🍽️ Lunch',
        titleEn: 'Lunch',
        speakerKo: '',
        speakerEn: '',
        affiliation: '',
        category: 'Lunch',
        duration: 60,
        isBreak: true,
        isLunchSession: true
    },
    {
        id: 'break-opening',
        titleKo: '🎤 Opening / Closing',
        titleEn: 'Opening / Closing',
        speakerKo: '',
        speakerEn: '',
        affiliation: '',
        category: 'Opening/Closing',
        duration: 30,
        isBreak: true
    },
    {
        id: 'break-panel',
        titleKo: '📋 Panel Discussion',
        titleEn: 'Panel Discussion',
        speakerKo: '',
        speakerEn: '',
        affiliation: '',
        category: 'Panel Discussion',
        duration: 15,
        isBreak: true,
        isPanelDiscussion: true
    }
];

window.AppState = {
    // 인증 상태
    currentUser: null,
    currentUserRole: null, // 'admin', 'editor', 'pending', null
    isOnline: true,
    lastSyncTime: null,

    // 현재 날짜
    currentDate: '2026-04-11',

    // 현재 언어
    currentLanguage: 'ko',

    // 날짜별 데이터 저장소
    dataByDate: {
        '2026-04-11': { lectures: [], schedule: {}, sessions: [] },
        '2026-04-12': { lectures: [], schedule: {}, sessions: [] }
    },

    // 현재 날짜의 데이터 (참조)
    lectures: [],
    schedule: {},
    sessions: [],

    // 룸 목록 (현재 날짜 기준)
    rooms: [],
    
    // 룸별 담당자
    roomManagers: {},
    
    // 의협제출용 룸 (날짜별)
    kmaRooms: {},

    // 연자 데이터
    speakers: [],

    // 업체 목록
    companies: [],

    // 카테고리 목록
    categories: [],

    // 시간 슬롯
    timeSlots: [],

    // 날짜별 시간 설정
    timeSettingsByDate: {
        '2026-04-11': { startTime: '13:00', endTime: '18:30' },
        '2026-04-12': { startTime: '08:30', endTime: '17:00' }
    },

    // 필터 상태
    activeFilter: 'all',
    lectureSearchTerm: '',
    quickFilter: '', // 'unscheduled', 'noSpeaker', ''

    // 드래그 상태
    draggedLecture: null,
    draggedSession: null,
    draggedScheduleKey: null,
    draggedIsBreak: false,

    // Undo 히스토리
    undoHistory: [],

    // 자동완성 상태
    autocompleteIndex: -1,
    currentMatches: [],

    // 모달/폼 임시 데이터
    pendingSpeakerInfo: null,
    pendingUploadData: [],

    // UI 상태
    categoryFiltersCollapsed: false
};

// 가능한 모든 시간 옵션 생성 (06:00 ~ 22:00)
window.ALL_TIME_OPTIONS = [];
for (let hour = 6; hour <= 22; hour++) {
    for (let min = 0; min < 60; min += AppConfig.TIME_UNIT) {
        const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        window.ALL_TIME_OPTIONS.push(time);
    }
}

/**
 * 시간 슬롯 생성
 */
window.generateTimeSlots = function() {
    const settings = AppState.timeSettingsByDate[AppState.currentDate] || { startTime: '08:30', endTime: '17:00' };
    AppState.timeSlots = [];

    const startIndex = ALL_TIME_OPTIONS.indexOf(settings.startTime);
    const endIndex = ALL_TIME_OPTIONS.indexOf(settings.endTime);

    if (startIndex >= 0 && endIndex >= 0) {
        for (let i = startIndex; i <= endIndex; i++) {
            AppState.timeSlots.push(ALL_TIME_OPTIONS[i]);
        }
    }

    return AppState.timeSlots;
};

/**
 * 현재 날짜 데이터 로드
 */
window.loadDateData = function(date) {
    const dateData = AppState.dataByDate[date];
    if (dateData) {
        AppState.lectures = dateData.lectures || [];
        AppState.schedule = dateData.schedule || {};
        AppState.sessions = dateData.sessions || [];
    } else {
        AppState.lectures = [];
        AppState.schedule = {};
        AppState.sessions = [];
        AppState.dataByDate[date] = { lectures: [], schedule: {}, sessions: [] };
    }
    console.log(`📅 날짜 데이터 로드: ${date} - 강의 ${AppState.lectures.length}개, 세션 ${AppState.sessions.length}개`);
};

/**
 * 현재 날짜 데이터 저장
 */
window.saveCurrentDateData = function() {
    AppState.dataByDate[AppState.currentDate] = {
        lectures: [...AppState.lectures],
        schedule: { ...AppState.schedule },
        sessions: [...AppState.sessions]
    };
};

/**
 * Undo용 상태 저장
 */
window.saveStateForUndo = function() {
    const state = {
        schedule: JSON.parse(JSON.stringify(AppState.schedule)),
        sessions: JSON.parse(JSON.stringify(AppState.sessions)),
        lectures: JSON.parse(JSON.stringify(AppState.lectures))
    };
    AppState.undoHistory.push(state);
    if (AppState.undoHistory.length > AppConfig.MAX_UNDO) {
        AppState.undoHistory.shift();
    }
    updateUndoButton();
};

/**
 * Undo 실행
 */
window.performUndo = function() {
    if (AppState.undoHistory.length === 0) {
        Toast.info('되돌릴 작업이 없습니다.');
        return;
    }

    const previousState = AppState.undoHistory.pop();
    AppState.schedule = previousState.schedule;
    AppState.sessions = previousState.sessions;
    AppState.lectures = previousState.lectures;

    saveAndSync();
    createScheduleTable(); // 세션 변경 시 테이블 재생성 필요
    updateScheduleDisplay();
    updateLectureList();
    updateUndoButton();
};

/**
 * Undo 버튼 업데이트
 */
window.updateUndoButton = function() {
    const btn = document.getElementById('undoBtn');
    if (btn) {
        btn.textContent = `↩(${AppState.undoHistory.length})`;
        btn.disabled = AppState.undoHistory.length === 0;
    }
};

console.log('✅ state.js 로드 완료');
