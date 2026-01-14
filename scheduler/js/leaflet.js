// ============================================
// 리플렛 PDF 생성 모듈 (통합 인쇄 모달 버전)
// ============================================

// 키비주얼 이미지 저장
window.leafletConfig = {
    leftKeyVisual: null,
    rightKeyVisual: null,
    printFormat: 'schedule',
    selectedPrintDate: null
};

// ============================================
// 기존 openPrintModal 함수 확장 (호출 후 초기화 추가)
// ============================================
const originalOpenPrintModal = window.openPrintModal;

window.openPrintModal = function() {
    // 모달 표시
    document.getElementById('printModal').style.display = 'flex';
    
    // 기존 openPrintModal 호출 (룸 체크박스 생성 등)
    if (typeof originalOpenPrintModal === 'function') {
        originalOpenPrintModal();
    }
    
    // 딜레이 후 추가 초기화 (AppState 로드 대기)
    setTimeout(() => {
        initPrintModalExtras();
    }, 300);
};

function initPrintModalExtras() {
    // 현재 날짜 가져오기 (시간표에서 선택된 날짜)
    const currentDate = window.AppState?.currentDate || window.AppState?.selectedDate;
    window.leafletConfig.selectedPrintDate = currentDate;
    
    console.log('초기화 - 현재 날짜:', currentDate);
    
    // 날짜 표시 (선택 없이 현재 날짜만 표시)
    displayCurrentDate(currentDate);
    
    // 키비주얼 로드
    loadKeyVisualsFromFirebase();
    
    // 기본 형식 선택 (시간표)
    window.leafletConfig.printFormat = 'schedule';
    selectPrintFormat('schedule');
}

// ============================================
// 현재 날짜 표시 (선택 기능 없음)
// ============================================
function displayCurrentDate(currentDate) {
    const dateLabelEl = document.getElementById('printDateLabel');
    if (!dateLabelEl) return;
    
    if (currentDate) {
        const date = new Date(currentDate);
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = dayNames[date.getDay()];
        const month = date.getMonth() + 1;
        const day = date.getDate();
        
        // 라벨 찾기 (eventDates에서)
        const eventInfo = window.AppState?.eventDates?.find(e => e.date === currentDate);
        const label = eventInfo?.label || `${month}/${day}(${dayName})`;
        
        dateLabelEl.innerHTML = `
            <span style="font-weight: bold;">📅 ${label}</span>
        `;
    } else {
        dateLabelEl.innerHTML = `<span style="font-weight: bold; color: #999;">📅 날짜를 선택해주세요</span>`;
    }
}

// selectPrintDate 함수 제거됨 - 날짜는 시간표에서 선택된 것 자동 사용

function updatePrintRoomCheckboxes(currentDate) {
    const container = document.getElementById('printRoomCheckboxes');
    if (!container) return;
    
    let rooms = getRoomsForCurrentDate(currentDate);
    
    console.log('룸 체크박스 업데이트 - 날짜:', currentDate, '룸:', rooms);
    
    if (rooms.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 1rem;">등록된 룸이 없습니다.</p>';
        return;
    }
    
    container.innerHTML = `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #E8F4FD; border-radius: 6px; cursor: pointer; font-weight: bold;">
            <input type="checkbox" id="selectAllRooms" onchange="toggleAllPrintRooms(this.checked)" checked style="width: 18px; height: 18px; accent-color: #667eea;">
            전체 룸 선택
        </label>
        ${rooms.map(room => `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #f5f5f5; border-radius: 6px; cursor: pointer;">
                <input type="checkbox" class="print-room-checkbox" value="${room}" checked style="width: 18px; height: 18px; accent-color: #667eea;">
                ${room}
            </label>
        `).join('')}
    `;
}

// ============================================
// 현재 날짜의 룸 목록 가져오기
// ============================================
function getRoomsForCurrentDate(currentDate) {
    let rooms = [];
    
    // 방법 1: dateConfigs에서 가져오기
    if (window.AppState?.dateConfigs?.[currentDate]?.rooms) {
        rooms = window.AppState.dateConfigs[currentDate].rooms;
    }
    // 방법 2: 전역 rooms 배열
    else if (window.AppState?.rooms?.length > 0) {
        rooms = window.AppState.rooms;
    }
    // 방법 3: 스케줄에서 추출
    else if (window.AppState?.schedules?.[currentDate]) {
        rooms = Object.keys(window.AppState.schedules[currentDate]);
    }
    // 방법 4: 강의에서 추출
    else {
        const lectures = window.AppState?.lectures || [];
        const roomSet = new Set();
        lectures.forEach(l => {
            if (l.date === currentDate && l.room) {
                roomSet.add(l.room);
            }
        });
        rooms = Array.from(roomSet);
    }
    
    return rooms;
}

// ============================================
// 출력 형식 선택
// ============================================
function selectPrintFormat(format) {
    window.leafletConfig.printFormat = format;
    
    // UI 업데이트
    const scheduleOption = document.getElementById('formatSchedule');
    const leafletOption = document.getElementById('formatLeaflet');
    const keyVisualSection = document.getElementById('keyVisualSection');
    const languageSection = document.getElementById('languageSection');
    
    if (format === 'schedule') {
        scheduleOption.style.border = '2px solid #667eea';
        scheduleOption.style.background = '#f0f4ff';
        leafletOption.style.border = '2px solid #ddd';
        leafletOption.style.background = '#f5f5f5';
        keyVisualSection.style.display = 'none';
        languageSection.style.display = 'none';
    } else {
        scheduleOption.style.border = '2px solid #ddd';
        scheduleOption.style.background = '#f5f5f5';
        leafletOption.style.border = '2px solid #667eea';
        leafletOption.style.background = '#f0f4ff';
        keyVisualSection.style.display = 'block';
        languageSection.style.display = 'block';
        updateKeyVisualPreviews();
    }
}

// ============================================
// 전체 룸 선택/해제
// ============================================
function toggleAllPrintRooms(checked) {
    // 여러 class 지원
    let checkboxes = document.querySelectorAll('#printRoomCheckboxes .print-room-checkbox');
    if (checkboxes.length === 0) {
        checkboxes = document.querySelectorAll('#printRoomCheckboxes input[type="checkbox"]:not(#selectAllRooms)');
    }
    checkboxes.forEach(cb => cb.checked = checked);
}

// ============================================
// 형식에 따른 인쇄 실행
// ============================================
function executePrintWithFormat() {
    const format = window.leafletConfig.printFormat;
    
    // 선택된 룸 가져오기 - 여러 class 지원
    const selectedRooms = [];
    
    // print-room-checkbox 또는 room-checkbox 모두 찾기
    let roomCheckboxes = document.querySelectorAll('#printRoomCheckboxes .print-room-checkbox:checked');
    if (roomCheckboxes.length === 0) {
        roomCheckboxes = document.querySelectorAll('#printRoomCheckboxes input[type="checkbox"]:checked:not(#selectAllRooms)');
    }
    
    console.log('체크박스 개수:', roomCheckboxes.length);
    
    roomCheckboxes.forEach(cb => {
        if (cb.value && cb.value !== 'on') {
            selectedRooms.push(cb.value);
        }
    });
    
    console.log('선택된 룸:', selectedRooms);
    
    if (selectedRooms.length === 0) {
        alert('출력할 룸을 선택해주세요.');
        return;
    }
    
    // 선택된 날짜 가져오기
    const selectedDate = window.leafletConfig.selectedPrintDate || window.AppState?.currentDate || window.AppState?.selectedDate;
    
    console.log('선택된 날짜:', selectedDate, '출력 형식:', format);
    
    if (format === 'leaflet') {
        // 리플렛 형식으로 출력
        const language = document.querySelector('input[name="printLanguage"]:checked')?.value || 'ko';
        generateLeafletPDFWithDate(selectedRooms, language, selectedDate);
    } else {
        // 기존 시간표 형식으로 출력
        executeSchedulePrint(selectedRooms);
    }
    
    closePrintModal();
}

// ============================================
// 리플렛 PDF 생성 (날짜 포함)
// ============================================
function generateLeafletPDFWithDate(selectedRooms, language, selectedDate) {
    if (!selectedDate) {
        alert('날짜를 선택해주세요.');
        return;
    }
    
    if (selectedRooms.length === 0) {
        alert('출력할 룸을 선택해주세요.');
        return;
    }
    
    try {
        // HTML 기반 리플렛 생성
        const leafletHTML = generateLeafletHTML(selectedDate, selectedRooms, language);
        
        // 새 창에서 열기 (인쇄용)
        const printWindow = window.open('', '_blank');
        printWindow.document.write(leafletHTML);
        printWindow.document.close();
        
        // 인쇄 다이얼로그
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
    } catch (error) {
        console.error('리플렛 생성 오류:', error);
        alert('리플렛 생성 중 오류가 발생했습니다.');
    }
}

// ============================================
// 기존 시간표 인쇄 (기존 executePrint 로직)
// ============================================
function executeSchedulePrint(selectedRooms) {
    // 기존 executePrint 함수 호출 또는 로직 실행
    if (typeof window.originalExecutePrint === 'function') {
        window.originalExecutePrint(selectedRooms);
    } else if (typeof executePrint === 'function') {
        // 선택된 룸으로 인쇄
        const checkboxes = document.querySelectorAll('#printRoomCheckboxes .print-room-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = selectedRooms.includes(cb.value);
        });
        executePrint();
    } else {
        // fallback: 직접 인쇄
        window.print();
    }
}

// ============================================
// 키비주얼 업로드
// ============================================
function uploadKeyVisual(side) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            
            if (side === 'left') {
                window.leafletConfig.leftKeyVisual = base64;
            } else {
                window.leafletConfig.rightKeyVisual = base64;
            }
            
            // Firebase에 저장
            saveKeyVisualToFirebase(side, base64);
            
            // 미리보기 업데이트
            updateKeyVisualPreviews();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function updateKeyVisualPreviews() {
    const leftPreview = document.getElementById('leftKeyVisualPreview');
    const rightPreview = document.getElementById('rightKeyVisualPreview');
    
    if (leftPreview) {
        if (window.leafletConfig.leftKeyVisual) {
            leftPreview.innerHTML = `<img src="${window.leafletConfig.leftKeyVisual}" style="max-width: 100%; max-height: 80px; border-radius: 4px;">`;
        } else {
            leftPreview.innerHTML = '<span style="color: #999; font-size: 0.75rem;">미등록</span>';
        }
    }
    
    if (rightPreview) {
        if (window.leafletConfig.rightKeyVisual) {
            rightPreview.innerHTML = `<img src="${window.leafletConfig.rightKeyVisual}" style="max-width: 100%; max-height: 80px; border-radius: 4px;">`;
        } else {
            rightPreview.innerHTML = '<span style="color: #999; font-size: 0.75rem;">미등록</span>';
        }
    }
}

function saveKeyVisualToFirebase(side, base64) {
    if (!window.db) {
        console.log('Firebase DB가 없어서 키비주얼을 저장할 수 없습니다.');
        return;
    }
    
    const path = `config/leaflet/keyVisual_${side}`;
    console.log('키비주얼 저장 중:', path);
    
    window.db.ref(path).set(base64).then(() => {
        console.log('키비주얼 저장 완료:', side);
    }).catch(err => {
        console.error('키비주얼 저장 실패:', err);
    });
}

function loadKeyVisualsFromFirebase() {
    if (!window.db) {
        console.log('Firebase DB가 없어서 키비주얼을 로드할 수 없습니다.');
        return;
    }
    
    console.log('키비주얼 로드 시도...');
    
    window.db.ref('config/leaflet').once('value').then(snapshot => {
        const data = snapshot.val();
        console.log('키비주얼 데이터:', data);
        
        if (data) {
            window.leafletConfig.leftKeyVisual = data.keyVisual_left || null;
            window.leafletConfig.rightKeyVisual = data.keyVisual_right || null;
            console.log('키비주얼 로드 완료 - left:', !!data.keyVisual_left, 'right:', !!data.keyVisual_right);
        } else {
            console.log('저장된 키비주얼 없음');
        }
        updateKeyVisualPreviews();
    }).catch(err => {
        console.error('키비주얼 로드 실패:', err);
    });
}

// ============================================
// 리플렛 PDF 생성
// ============================================
function generateLeafletPDF(selectedRooms, language) {
    const currentDate = window.AppState?.currentDate || window.AppState?.selectedDate;
    
    if (!currentDate) {
        alert('날짜를 선택해주세요.');
        return;
    }
    
    if (selectedRooms.length === 0) {
        alert('출력할 룸을 선택해주세요.');
        return;
    }
    
    try {
        // HTML 기반 리플렛 생성
        const leafletHTML = generateLeafletHTML(currentDate, selectedRooms, language);
        
        // 새 창에서 열기 (인쇄용)
        const printWindow = window.open('', '_blank');
        printWindow.document.write(leafletHTML);
        printWindow.document.close();
        
        // 인쇄 다이얼로그
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
    } catch (error) {
        console.error('리플렛 생성 오류:', error);
        alert('리플렛 생성 중 오류가 발생했습니다.');
    }
}

// ============================================
// 리플렛 HTML 생성 (PDF용)
// ============================================
function generateLeafletHTML(selectedDate, selectedRooms, language) {
    const lectures = window.AppState?.lectures || [];
    const sessions = window.AppState?.sessions || [];
    
    console.log('=== 리플렛 생성 시작 ===');
    console.log('선택된 날짜:', selectedDate);
    console.log('선택된 룸:', selectedRooms);
    console.log('전체 강의 수:', lectures.length);
    console.log('전체 세션 수:', sessions.length);
    
    // 날짜 포맷
    const date = new Date(selectedDate);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[date.getDay()];
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}(${dayName})`;
    
    // 각 룸별 강의/세션 데이터 수집
    const roomData = selectedRooms.map(room => {
        const roomSessions = getSessionsForRoom(selectedDate, room, sessions, lectures, language);
        console.log(`룸 "${room}" 세션 수:`, roomSessions.length);
        return {
            room: room,
            sessions: roomSessions
        };
    });
    
    console.log('=== 리플렛 생성 완료 ===');
    
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>학술대회 리플렛 - ${dateLabel}</title>
    <style>
        @page {
            size: A3 landscape;
            margin: 8mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
            font-size: 7pt;
            line-height: 1.25;
            background: white;
        }
        
        .leaflet-container {
            display: flex;
            width: 100%;
            min-height: 100vh;
        }
        
        .key-visual {
            width: 55px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(180deg, #1a237e 0%, #3949ab 50%, #5c6bc0 100%);
            padding: 8px 4px;
        }
        
        .key-visual img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        
        .key-visual.placeholder {
            color: white;
            font-size: 11pt;
            font-weight: bold;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            letter-spacing: 2px;
        }
        
        .schedule-columns {
            flex: 1;
            display: flex;
            gap: 2px;
            padding: 4px;
            background: #f0f0f0;
        }
        
        .room-column {
            flex: 1;
            background: white;
            border: 1px solid #ccc;
            border-radius: 3px;
            overflow: hidden;
            min-width: 0;
        }
        
        .room-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 6px 4px;
            text-align: center;
        }
        
        .room-header .room-date {
            font-size: 6pt;
            opacity: 0.9;
        }
        
        .room-header .room-name {
            font-weight: bold;
            font-size: 7pt;
            margin-top: 2px;
        }
        
        .room-content {
            padding: 4px;
        }
        
        .session-block {
            margin-bottom: 6px;
            border-left: 3px solid #3498db;
            padding-left: 4px;
            background: #fafafa;
            border-radius: 0 3px 3px 0;
        }
        
        .session-header {
            background: linear-gradient(90deg, #e3f2fd, transparent);
            padding: 3px 4px;
            margin-bottom: 2px;
            border-radius: 2px;
        }
        
        .session-title {
            font-weight: bold;
            font-size: 7pt;
            color: #1565c0;
        }
        
        .session-moderator {
            font-size: 5.5pt;
            color: #666;
            margin-top: 1px;
        }
        
        .lecture-item {
            display: flex;
            padding: 2px 0;
            border-bottom: 1px dotted #e0e0e0;
            font-size: 6pt;
        }
        
        .lecture-item:last-child {
            border-bottom: none;
        }
        
        .lecture-time {
            width: 55px;
            flex-shrink: 0;
            color: #333;
            font-weight: 500;
            font-size: 5.5pt;
        }
        
        .lecture-info {
            flex: 1;
            min-width: 0;
        }
        
        .lecture-title {
            color: #333;
            font-size: 6pt;
            line-height: 1.2;
            word-break: keep-all;
        }
        
        .lecture-speaker {
            color: #555;
            font-size: 5.5pt;
            font-weight: 500;
        }
        
        .lecture-affiliation {
            color: #888;
            font-size: 5pt;
        }
        
        .coffee-break, .lunch-break {
            background: #fff8e1;
            padding: 3px 6px;
            text-align: center;
            font-size: 6pt;
            color: #f57c00;
            margin: 3px 0;
            border-radius: 2px;
            font-weight: bold;
        }
        
        .lunch-break {
            background: #efebe9;
            color: #5d4037;
        }
        
        .panel-discussion {
            background: #f3e5f5;
            padding: 2px 4px;
            font-size: 5.5pt;
            color: #7b1fa2;
            border-radius: 2px;
            margin-top: 2px;
        }
        
        @media print {
            body { 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
            }
            .leaflet-container { 
                page-break-inside: avoid; 
            }
        }
    </style>
</head>
<body>
    <div class="leaflet-container">
        ${window.leafletConfig.leftKeyVisual ? 
            `<div class="key-visual"><img src="${window.leafletConfig.leftKeyVisual}" alt="Key Visual"></div>` :
            `<div class="key-visual placeholder">ASLS KOREA 2026</div>`
        }
        
        <div class="schedule-columns">
            ${roomData.map(data => generateRoomColumnHTML(data, dateLabel)).join('')}
        </div>
        
        ${window.leafletConfig.rightKeyVisual ? 
            `<div class="key-visual"><img src="${window.leafletConfig.rightKeyVisual}" alt="Key Visual"></div>` :
            `<div class="key-visual placeholder">ASLS KOREA 2026</div>`
        }
    </div>
</body>
</html>
    `;
}

// ============================================
// 룸 컬럼 HTML 생성
// ============================================
function generateRoomColumnHTML(data, dateLabel) {
    const { room, sessions } = data;
    
    // 룸 이름에서 (토) (일) 등 제거하여 간결하게
    const cleanRoomName = room.replace(/^\([토일월화수목금]\)/, '').trim();
    
    return `
        <div class="room-column">
            <div class="room-header">
                <div class="room-date">${dateLabel}</div>
                <div class="room-name">${cleanRoomName}</div>
            </div>
            <div class="room-content">
                ${sessions.length > 0 ? 
                    sessions.map(session => generateSessionBlockHTML(session)).join('') :
                    '<p style="text-align: center; color: #999; padding: 1rem; font-size: 6pt;">등록된 세션이 없습니다</p>'
                }
            </div>
        </div>
    `;
}

// ============================================
// 세션 블록 HTML 생성
// ============================================
function generateSessionBlockHTML(session) {
    if (session.type === 'coffee') {
        return `<div class="coffee-break">☕ Coffee Break</div>`;
    }
    
    if (session.type === 'lunch') {
        return `<div class="lunch-break">🍽️ Lunch</div>`;
    }
    
    const lecturesHTML = session.lectures && session.lectures.length > 0 ? 
        session.lectures.map(lecture => `
            <div class="lecture-item">
                <div class="lecture-time">${lecture.startTime}~${lecture.endTime}</div>
                <div class="lecture-info">
                    <div class="lecture-title">${lecture.title || ''}</div>
                    <div class="lecture-speaker">${lecture.speaker || ''}</div>
                    ${lecture.affiliation ? `<div class="lecture-affiliation">${lecture.affiliation}</div>` : ''}
                </div>
            </div>
        `).join('') : '';
    
    // 패널 토의
    const panelHTML = session.panelDiscussion ? 
        `<div class="panel-discussion">📋 ${session.panelDiscussion}</div>` : '';
    
    return `
        <div class="session-block" style="border-left-color: ${session.color || '#3498db'};">
            <div class="session-header">
                <div class="session-title">${session.name || '세션'}</div>
                ${session.moderator ? `<div class="session-moderator">Moderator: ${session.moderator}</div>` : ''}
            </div>
            ${lecturesHTML}
            ${panelHTML}
        </div>
    `;
}

// ============================================
// 룸별 세션/강의 데이터 수집
// ============================================
function getSessionsForRoom(date, room, allSessions, allLectures, language) {
    const result = [];
    
    // 룸 이름 정규화 (비교용)
    const normalizeRoom = (r) => (r || '').replace(/^\([토일월화수목금]\)/, '').trim();
    const targetRoom = normalizeRoom(room);
    
    // 해당 날짜/룸의 세션 필터링 (정규화된 이름으로 비교)
    const roomSessions = (allSessions || []).filter(s => {
        const sessionRoom = normalizeRoom(s.room);
        return s.date === date && (s.room === room || sessionRoom === targetRoom);
    });
    
    // 해당 날짜/룸의 강의 필터링 (정규화된 이름으로 비교)
    const roomLectures = (allLectures || []).filter(l => {
        const lectureRoom = normalizeRoom(l.room);
        return l.date === date && (l.room === room || lectureRoom === targetRoom) && l.startTime;
    });
    
    console.log(`[${room}] 세션 ${roomSessions.length}개, 강의 ${roomLectures.length}개 발견`);
    
    // 시간순 정렬
    roomSessions.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    roomLectures.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    
    // 세션이 있는 경우
    if (roomSessions.length > 0) {
        roomSessions.forEach(session => {
            const sessionStartTime = session.startTime;
            const sessionEndTime = session.endTime || calculateEndTime(sessionStartTime, session.duration || 60);
            
            // 런치/커피 브레이크 확인
            const sessionNameLower = (session.name || '').toLowerCase();
            if (sessionNameLower.includes('lunch') || sessionNameLower.includes('런치') || sessionNameLower.includes('점심')) {
                result.push({ type: 'lunch', startTime: sessionStartTime });
                return;
            }
            if (sessionNameLower.includes('coffee') || sessionNameLower.includes('휴식') || sessionNameLower.includes('break')) {
                result.push({ type: 'coffee', startTime: sessionStartTime });
                return;
            }
            
            // 세션 내 강의 수집
            const sessionLectures = roomLectures.filter(l => {
                const lectureTime = l.startTime;
                return lectureTime >= sessionStartTime && lectureTime < sessionEndTime;
            });
            
            // 패널 토의 (세션 끝부분에 연자들 이름 나열)
            let panelDiscussion = null;
            if (sessionLectures.length >= 2) {
                const speakers = sessionLectures.map(l => {
                    return language === 'en' ? (l.speakerEn || l.speaker) : l.speaker;
                }).filter(s => s && s !== '미정');
                if (speakers.length >= 2) {
                    panelDiscussion = speakers.join(', ');
                }
            }
            
            result.push({
                type: 'session',
                name: language === 'en' ? (session.nameEn || session.name) : session.name,
                moderator: session.moderator ? 
                    `${language === 'en' ? (session.moderatorEn || session.moderator) : session.moderator} ${session.moderatorAffiliation || ''}`.trim() : null,
                color: session.color || '#3498db',
                startTime: sessionStartTime,
                lectures: sessionLectures.map(l => ({
                    startTime: l.startTime,
                    endTime: calculateEndTime(l.startTime, l.duration || 15),
                    title: language === 'en' ? (l.titleEn || l.titleKo || l.title) : (l.titleKo || l.title),
                    speaker: language === 'en' ? (l.speakerEn || l.speaker) : l.speaker,
                    affiliation: l.affiliation || ''
                })),
                panelDiscussion: panelDiscussion
            });
        });
    } 
    // 세션이 없고 강의만 있는 경우
    else if (roomLectures.length > 0) {
        result.push({
            type: 'session',
            name: room,
            moderator: null,
            color: '#3498db',
            startTime: roomLectures[0].startTime,
            lectures: roomLectures.map(l => ({
                startTime: l.startTime,
                endTime: calculateEndTime(l.startTime, l.duration || 15),
                title: language === 'en' ? (l.titleEn || l.titleKo || l.title) : (l.titleKo || l.title),
                speaker: language === 'en' ? (l.speakerEn || l.speaker) : l.speaker,
                affiliation: l.affiliation || ''
            })),
            panelDiscussion: null
        });
    }
    
    // 시간순 정렬
    result.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    
    return result;
}

function calculateEndTime(startTime, durationMinutes) {
    if (!startTime) return '';
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

// ============================================
// 엑셀(XLSX) 출력 기능 - 룸별 시트 형식
// ============================================
function exportToExcel() {
    const currentDate = window.AppState?.currentDate || window.AppState?.selectedDate;
    const lectures = window.AppState?.lectures || [];
    const sessions = window.AppState?.sessions || [];
    const rooms = window.AppState?.rooms || getRoomsForCurrentDate(currentDate);
    
    if (lectures.length === 0) {
        alert('내보낼 강의 데이터가 없습니다.');
        return;
    }
    
    // 현재 날짜의 데이터만 필터링
    const filteredLectures = currentDate 
        ? lectures.filter(l => l.date === currentDate)
        : lectures;
    const filteredSessions = currentDate
        ? sessions.filter(s => s.date === currentDate)
        : sessions;
    
    // SheetJS 라이브러리 로드 확인
    if (typeof XLSX === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = () => createRoomBasedExcel(filteredLectures, filteredSessions, rooms, currentDate);
        script.onerror = () => {
            alert('엑셀 라이브러리를 로드할 수 없습니다.');
        };
        document.head.appendChild(script);
    } else {
        createRoomBasedExcel(filteredLectures, filteredSessions, rooms, currentDate);
    }
}

function createRoomBasedExcel(lectures, sessions, rooms, currentDate) {
    try {
        const wb = XLSX.utils.book_new();
        
        rooms.forEach((room, index) => {
            // 해당 룸의 강의와 세션 필터링
            const roomLectures = lectures.filter(l => l.room === room);
            const roomSessions = sessions.filter(s => s.room === room);
            
            // 시트 데이터 생성
            const sheetData = generateRoomSheetData(room, roomLectures, roomSessions);
            
            // 워크시트 생성
            const ws = XLSX.utils.aoa_to_sheet(sheetData.data);
            
            // 열 너비 설정
            ws['!cols'] = [
                { wch: 12 },  // 시간
                { wch: 60 },  // 강의 정보
                { wch: 15 },  // 카테고리
            ];
            
            // 행 병합 (세션 헤더용)
            if (sheetData.merges.length > 0) {
                ws['!merges'] = sheetData.merges;
            }
            
            // 시트 이름 (31자 제한, 특수문자 제거)
            let sheetName = room.replace(/[*?:/\\[\]]/g, '').substring(0, 31);
            if (sheetName.length === 0) sheetName = `룸${index + 1}`;
            
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        
        // 파일 다운로드
        const fileName = currentDate 
            ? `${currentDate}_시간표_룸별.xlsx`
            : `시간표_룸별_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
        console.log('엑셀 파일 생성 완료:', fileName);
        
    } catch (error) {
        console.error('엑셀 생성 오류:', error);
        alert('엑셀 파일 생성 중 오류가 발생했습니다: ' + error.message);
    }
}

function generateRoomSheetData(room, lectures, sessions) {
    const data = [];
    const merges = [];
    let rowIndex = 0;
    
    // 룸 제목
    data.push([`🏠 ${room}`]);
    merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 2 } });
    rowIndex++;
    
    // 빈 행
    data.push([]);
    rowIndex++;
    
    // 헤더
    data.push(['시간', '강의 정보', '카테고리']);
    rowIndex++;
    
    // 세션별로 강의 그룹화
    if (sessions.length > 0) {
        // 세션 시간순 정렬
        sessions.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        
        sessions.forEach(session => {
            // 세션 헤더
            const sessionName = session.name || '세션';
            const sessionNameEn = session.nameEn || '';
            const sessionHeader = sessionNameEn ? `📌 ${sessionName} ${sessionNameEn}` : `📌 ${sessionName}`;
            
            data.push([sessionHeader]);
            merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 2 } });
            rowIndex++;
            
            // 좌장 정보
            if (session.moderator) {
                data.push([`    좌장: ${session.moderator} ${session.moderatorAffiliation || ''}`]);
                merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 2 } });
                rowIndex++;
            }
            
            // 세션에 속한 강의 필터링
            const sessionStart = session.startTime || '00:00';
            const sessionEnd = session.endTime || '23:59';
            const sessionLectures = lectures.filter(l => {
                const lectureTime = l.startTime || '';
                return lectureTime >= sessionStart && lectureTime < sessionEnd;
            }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
            
            // 강의 추가
            sessionLectures.forEach(lecture => {
                const timeStr = `${lecture.startTime || ''}~${calculateEndTime(lecture.startTime, lecture.duration || 15)}`;
                const title = lecture.titleKo || lecture.title || '';
                const titleEn = lecture.titleEn || '';
                const speaker = lecture.speaker || '';
                const affiliation = lecture.affiliation || '';
                const category = lecture.category || '';
                
                // 강의 정보 조합
                let lectureInfo = title;
                if (titleEn && titleEn !== title) {
                    lectureInfo += `\n${titleEn}`;
                }
                lectureInfo += `\n👤 ${speaker}`;
                if (affiliation) {
                    lectureInfo += ` (${affiliation})`;
                }
                lectureInfo += `\n⏱️ ${lecture.duration || 15}분`;
                
                data.push([timeStr, lectureInfo, category]);
                rowIndex++;
            });
            
            // 세션 간 빈 행
            data.push([]);
            rowIndex++;
        });
    } else {
        // 세션이 없으면 강의만 시간순으로
        lectures.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        
        lectures.forEach(lecture => {
            const timeStr = `${lecture.startTime || ''}~${calculateEndTime(lecture.startTime, lecture.duration || 15)}`;
            const title = lecture.titleKo || lecture.title || '';
            const speaker = lecture.speaker || '';
            const affiliation = lecture.affiliation || '';
            const category = lecture.category || '';
            
            let lectureInfo = title;
            lectureInfo += `\n👤 ${speaker}`;
            if (affiliation) {
                lectureInfo += ` (${affiliation})`;
            }
            
            data.push([timeStr, lectureInfo, category]);
            rowIndex++;
        });
    }
    
    return { data, merges };
}

// ============================================
// 초기화
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Firebase에서 키비주얼 로드
    setTimeout(() => {
        loadKeyVisualsFromFirebase();
    }, 2000);
});

// 전역 함수 등록
window.uploadKeyVisual = uploadKeyVisual;
window.selectPrintFormat = selectPrintFormat;
window.toggleAllPrintRooms = toggleAllPrintRooms;
window.executePrintWithFormat = executePrintWithFormat;
window.generateLeafletPDF = generateLeafletPDF;
window.exportToExcel = exportToExcel;
