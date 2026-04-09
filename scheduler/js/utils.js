/**
 * utils.js - 유틸리티 함수들
 */

/**
 * 방 이름 정규화 (별표, 앞쪽 공백 제거)
 * 별표는 의협 제출용 표시이므로 방 이름 비교 시 제거
 */
window.normalizeRoomName = function(name) {
    if (!name) return '';
    return name.replace(/^[⭐★☆\s]+/, '').trim();
};

/**
 * 시간을 분 단위로 변환
 */
window.timeToMinutes = function(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

/**
 * 시간에 분 추가
 */
window.addMinutesToTime = function(timeStr, minutes) {
    const [hour, min] = timeStr.split(':').map(Number);
    const totalMin = hour * 60 + min + minutes;
    const newHour = Math.floor(totalMin / 60);
    const newMin = totalMin % 60;
    return `${newHour.toString().padStart(2, '0')}:${newMin.toString().padStart(2, '0')}`;
};

/**
 * 종료 시간 계산
 */
window.calculateEndTime = function(startTime, duration) {
    return addMinutesToTime(startTime, duration);
};

/**
 * 색상 밝기 조절
 */
window.adjustColor = function(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255))
        .toString(16).slice(1);
};

/**
 * 날짜 포맷
 */
window.formatDate = function(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
};

/**
 * 날짜시간 포맷
 */
window.formatDateTime = function(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * 검색어 하이라이트
 */
window.highlightSearchTerm = function(text, term) {
    if (!text || !term) return text || '';
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background:#FFEB3B; padding:0 2px; border-radius:2px;">$1</mark>');
};

/**
 * 제목 정규화 (비교용)
 */
window.normalizeTitle = function(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[\n\r]/g, ' ')
        .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
        .trim();
};

/**
 * 문자열 유사도 계산
 */
window.calculateSimilarity = function(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));
    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return intersection / union;
};

/**
 * 로컬 스토리지 저장
 */
window.saveAllDataToStorage = function() {
    try {
        localStorage.setItem('conference_data_by_date', JSON.stringify(AppState.dataByDate));
        localStorage.setItem('conference_current_date', AppState.currentDate);
        localStorage.setItem('conference_speakers', JSON.stringify(AppState.speakers));
        localStorage.setItem('conference_categories', JSON.stringify(AppState.categories));
        localStorage.setItem('conference_companies', JSON.stringify(AppState.companies));
    } catch (error) {
        console.error('로컬 저장 오류:', error);
    }
};

/**
 * 로컬 스토리지에서 로드
 */
window.loadAllDataFromStorage = function() {
    try {
        const savedDataByDate = localStorage.getItem('conference_data_by_date');
        const savedCurrentDate = localStorage.getItem('conference_current_date');
        const savedSpeakers = localStorage.getItem('conference_speakers');
        const savedCategories = localStorage.getItem('conference_categories');
        const savedCompanies = localStorage.getItem('conference_companies');

        if (savedDataByDate) {
            AppState.dataByDate = JSON.parse(savedDataByDate);
        }

        if (savedCurrentDate && AppConfig.CONFERENCE_DATES.some(d => d.date === savedCurrentDate)) {
            AppState.currentDate = savedCurrentDate;
        }

        if (savedSpeakers) {
            const parsed = JSON.parse(savedSpeakers);
            if (parsed && parsed.length > 0) {
                AppState.speakers = parsed;
            }
        }

        if (savedCategories) {
            const parsed = JSON.parse(savedCategories);
            if (parsed && parsed.length > 0) {
                AppState.categories = parsed;
            }
        }

        if (savedCompanies) {
            const parsed = JSON.parse(savedCompanies);
            if (parsed && parsed.length > 0) {
                AppState.companies = parsed;
            }
        }

        // 현재 날짜 데이터 로드
        AppState.rooms = AppConfig.ROOMS_BY_DATE[AppState.currentDate] || [];
        loadDateData(AppState.currentDate);

        console.log('📂 로컬 스토리지 로드 완료');
    } catch (error) {
        console.error('데이터 불러오기 오류:', error);
    }
};

/**
 * 카드 접기/펼치기
 */
window.toggleCard = function(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
        card.classList.toggle('collapsed');
        const collapsed = card.classList.contains('collapsed');
        localStorage.setItem(`card_${cardId}_collapsed`, collapsed);
    }
};

/**
 * 카드 상태 로드
 */
window.loadCardStates = function() {
    ['addLectureCard', 'lectureListCard'].forEach(cardId => {
        const collapsed = localStorage.getItem(`card_${cardId}_collapsed`) === 'true';
        const card = document.getElementById(cardId);
        if (card && collapsed) {
            card.classList.add('collapsed');
        }
    });
};

/**
 * 한글 로마자 변환 (표준 로마자 표기법 기반)
 */
window.romanize = function(korean) {
    const initials = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
    const medials = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
    const finals = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

    let result = '';

    for (let i = 0; i < korean.length; i++) {
        const code = korean.charCodeAt(i) - 44032;

        if (code >= 0 && code <= 11171) {
            const initial = Math.floor(code / 588);
            const medial = Math.floor((code % 588) / 28);
            const final = code % 28;

            result += initials[initial] + medials[medial] + finals[final];
        } else {
            result += korean[i];
        }
    }

    return result.charAt(0).toUpperCase() + result.slice(1);
};

// Ctrl+Z 단축키
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        performUndo();
    }
});

// ============================================
// 연자 총 활동 시간 계산 (강의 + 좌장)
// ============================================

/**
 * 룸이 의협제출용 룸인지 확인 (별표 또는 kmaRooms 설정)
 */
window.isStarredRoom = function(roomName) {
    if (!roomName) return false;
    
    // 기존 별표 방식 체크 (호환성 유지)
    if (roomName.includes('⭐') || roomName.includes('★')) return true;
    
    // 새로운 kmaRooms 방식 체크
    const normalizedRoom = normalizeRoomName(roomName);
    const currentDate = AppState.currentDate;
    const kmaRooms = AppState.kmaRooms?.[currentDate] || [];
    
    return kmaRooms.some(r => normalizeRoomName(r) === normalizedRoom);
};

/**
 * 의협제출 룸 설정 저장
 */
window.saveKmaRooms = function() {
    if (typeof firebase === 'undefined' || !firebase.database) {
        console.log('Firebase 미연결 - kmaRooms 로컬 저장');
        return;
    }
    
    const database = firebase.database();
    database.ref('/settings/kmaRooms').set(AppState.kmaRooms || {})
        .then(() => console.log('✅ 의협제출 룸 설정 저장 완료'))
        .catch(err => console.error('❌ 의협제출 룸 설정 저장 실패:', err));
};

/**
 * 의협제출 룸 설정 로드
 */
window.loadKmaRooms = function() {
    if (typeof firebase === 'undefined' || !firebase.database) {
        console.log('Firebase 미연결 - kmaRooms 로드 스킵');
        return;
    }
    
    const database = firebase.database();
    database.ref('/settings/kmaRooms').on('value', (snapshot) => {
        if (snapshot.exists()) {
            AppState.kmaRooms = snapshot.val();
            console.log('[실시간] 의협제출 룸 설정 로드:', AppState.kmaRooms);
            // 체크박스 상태 업데이트
            updateKmaCheckboxes();
        } else {
            AppState.kmaRooms = {};
        }
    });
};

/**
 * 의협제출 체크박스 및 헤더 아이콘 상태 업데이트
 */
window.updateKmaCheckboxes = function() {
    // 체크박스 업데이트
    document.querySelectorAll('.kma-room-checkbox').forEach(checkbox => {
        const room = checkbox.dataset.room;
        const isKma = isStarredRoom(room);
        checkbox.checked = isKma;
        
        const label = checkbox.parentElement;
        if (label) {
            if (isKma) {
                label.style.background = '#FFF3E0';
                label.style.borderColor = '#FF9800';
                label.style.color = '#E65100';
            } else {
                label.style.background = 'white';
                label.style.borderColor = '#ddd';
                label.style.color = '#666';
            }
        }
    });
    
    // 헤더 아이콘 업데이트
    document.querySelectorAll('.kma-indicator').forEach(indicator => {
        const roomIndex = parseInt(indicator.dataset.roomIndex);
        const room = AppState.rooms[roomIndex];
        const isKma = isStarredRoom(room);
        indicator.textContent = isKma ? '🏥' : '';
        indicator.title = isKma ? '의협제출용 룸 (연자 2시간 제한)' : '';
        indicator.style.display = isKma ? '' : 'none';
    });
};

/**
 * 연자의 총 활동 시간 계산 (분 단위) - 별표 룸에서만 계산
 * @param {string} speakerName - 연자 이름
 * @param {string} excludeKey - 제외할 스케줄 키 (수정 시 현재 강의 제외)
 * @param {string} excludeSessionId - 제외할 세션 ID (수정 시 현재 세션 제외)
 * @param {boolean} starredOnly - 별표 룸에서만 계산할지 여부 (기본: true)
 * @returns {object} { totalMinutes, lectureMinutes, moderatorMinutes, details }
 */
window.calculateSpeakerTotalTime = function(speakerName, excludeKey = null, excludeSessionId = null, starredOnly = true) {
    if (!speakerName) return { totalMinutes: 0, lectureMinutes: 0, moderatorMinutes: 0, details: [] };
    
    const normalizedName = speakerName.trim().toLowerCase();
    let lectureMinutes = 0;
    let moderatorMinutes = 0;
    const details = [];
    
    // 1. 배치된 강의 시간 계산 (별표 룸에서만)
    Object.entries(AppState.schedule || {}).forEach(([key, lecture]) => {
        if (excludeKey && key === excludeKey) return; // 수정 중인 강의 제외
        
        const [time, room] = key.split('-');
        
        // 별표 룸 필터링
        if (starredOnly && !isStarredRoom(room)) return;
        
        const lectureSpeaker = (lecture.speakerKo || '').trim().toLowerCase();
        if (lectureSpeaker === normalizedName) {
            const duration = lecture.duration || 10;
            lectureMinutes += duration;
            
            details.push({
                type: '강의',
                title: lecture.titleKo || '제목 없음',
                room: room,
                time: time,
                duration: duration
            });
        }
    });
    
    // 2. 좌장 시간 계산 (별표 룸에서만)
    (AppState.sessions || []).forEach(session => {
        if (excludeSessionId && session.id === excludeSessionId) return; // 수정 중인 세션 제외
        
        // 별표 룸 필터링
        if (starredOnly && !isStarredRoom(session.room)) return;
        
        const moderatorName = (session.moderator || '').trim().toLowerCase();
        if (moderatorName === normalizedName) {
            const duration = session.duration || 60;
            moderatorMinutes += duration;
            
            details.push({
                type: '좌장',
                title: session.name || '세션',
                room: session.room,
                time: session.time,
                duration: duration
            });
        }
    });
    
    return {
        totalMinutes: lectureMinutes + moderatorMinutes,
        lectureMinutes,
        moderatorMinutes,
        details
    };
};

/**
 * 연자 활동 시간 초과 체크 (2시간 = 120분) - 별표 룸에서만 적용
 * @param {string} speakerName - 연자 이름
 * @param {number} additionalMinutes - 추가할 시간 (분)
 * @param {string} excludeKey - 제외할 스케줄 키
 * @param {string} excludeSessionId - 제외할 세션 ID
 * @param {string} targetRoom - 배치하려는 룸 이름
 * @returns {object} { isOverLimit, currentMinutes, newTotalMinutes, details, isStarredRoom }
 */
window.checkSpeakerTimeLimit = function(speakerName, additionalMinutes, excludeKey = null, excludeSessionId = null, targetRoom = null) {
    const MAX_MINUTES = 120; // 2시간
    
    // 배치하려는 룸이 별표 룸이 아니면 체크 안 함
    const targetIsStarred = targetRoom ? isStarredRoom(targetRoom) : true;
    if (!targetIsStarred) {
        return {
            isOverLimit: false,
            currentMinutes: 0,
            newTotalMinutes: 0,
            maxMinutes: MAX_MINUTES,
            lectureMinutes: 0,
            moderatorMinutes: 0,
            details: [],
            isStarredRoom: false
        };
    }
    
    const stats = calculateSpeakerTotalTime(speakerName, excludeKey, excludeSessionId, true);
    const newTotal = stats.totalMinutes + additionalMinutes;
    
    return {
        isOverLimit: newTotal > MAX_MINUTES,
        currentMinutes: stats.totalMinutes,
        newTotalMinutes: newTotal,
        maxMinutes: MAX_MINUTES,
        lectureMinutes: stats.lectureMinutes,
        moderatorMinutes: stats.moderatorMinutes,
        details: stats.details,
        isStarredRoom: true
    };
};

/**
 * 시간을 시:분 형식으로 포맷
 */
window.formatMinutesToHM = function(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) {
        return `${hours}시간 ${mins}분`;
    } else if (hours > 0) {
        return `${hours}시간`;
    } else {
        return `${mins}분`;
    }
};

// ============================================
// 온라인 / 오프라인 상태 표시
// ============================================
window.addEventListener('online', () => {
    Toast.success('🌐 온라인 연결됨');
});

window.addEventListener('offline', () => {
    Toast.warning('📵 오프라인 모드 - 변경사항은 연결 후 동기화됩니다');
});

console.log('✅ utils.js 로드 완료');
