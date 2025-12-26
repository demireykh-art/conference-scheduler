/**
 * utils.js - 유틸리티 함수들
 */

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

console.log('✅ utils.js 로드 완료');
