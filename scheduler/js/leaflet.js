// ============================================
// 리플렛 PDF 생성 모듈
// ============================================

// 키비주얼 이미지 저장 (Firebase Storage 또는 Base64)
window.leafletConfig = {
    leftKeyVisual: null,   // 좌측 키비주얼 Base64
    rightKeyVisual: null,  // 우측 키비주얼 Base64
    selectedRooms: [],     // 선택된 룸 목록
    selectedDate: null     // 선택된 날짜
};

// ============================================
// 리플렛 모달 열기
// ============================================
function openLeafletModal() {
    const modal = document.getElementById('leafletModal');
    if (!modal) {
        console.error('리플렛 모달이 없습니다. HTML에 추가해주세요.');
        return;
    }
    
    modal.style.display = 'flex';
    
    // 날짜 선택 버튼 생성
    renderLeafletDateButtons();
    
    // 키비주얼 미리보기 업데이트
    updateKeyVisualPreviews();
    
    // 룸 체크박스 생성
    renderLeafletRoomCheckboxes();
}

function closeLeafletModal() {
    document.getElementById('leafletModal').style.display = 'none';
}

// ============================================
// 날짜 선택 버튼 렌더링
// ============================================
function renderLeafletDateButtons() {
    const container = document.getElementById('leafletDateButtons');
    if (!container) return;
    
    const eventDates = window.AppState?.eventDates || [];
    
    if (eventDates.length === 0) {
        container.innerHTML = '<p style="color:#999;">등록된 행사 날짜가 없습니다.</p>';
        return;
    }
    
    container.innerHTML = eventDates.map((dateInfo, index) => {
        const date = new Date(dateInfo.date);
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = dayNames[date.getDay()];
        const label = dateInfo.label || `${date.getMonth() + 1}/${date.getDate()}(${dayName})`;
        const isSelected = window.leafletConfig.selectedDate === dateInfo.date;
        
        return `
            <button class="btn btn-small ${isSelected ? 'btn-primary' : 'btn-secondary'}" 
                    onclick="selectLeafletDate('${dateInfo.date}')"
                    style="${isSelected ? '' : 'opacity: 0.7;'}">
                ${label}
            </button>
        `;
    }).join('');
    
    // 첫 날짜 자동 선택
    if (!window.leafletConfig.selectedDate && eventDates.length > 0) {
        selectLeafletDate(eventDates[0].date);
    }
}

function selectLeafletDate(date) {
    window.leafletConfig.selectedDate = date;
    renderLeafletDateButtons();
    renderLeafletRoomCheckboxes();
}

// ============================================
// 룸 체크박스 렌더링
// ============================================
function renderLeafletRoomCheckboxes() {
    const container = document.getElementById('leafletRoomCheckboxes');
    if (!container) return;
    
    const selectedDate = window.leafletConfig.selectedDate;
    if (!selectedDate) {
        container.innerHTML = '<p style="color:#999;">먼저 날짜를 선택하세요.</p>';
        return;
    }
    
    // 해당 날짜의 룸 목록 가져오기
    const dateConfig = window.AppState?.dateConfigs?.[selectedDate];
    const rooms = dateConfig?.rooms || [];
    
    if (rooms.length === 0) {
        container.innerHTML = '<p style="color:#999;">해당 날짜에 등록된 룸이 없습니다.</p>';
        return;
    }
    
    // 전체 선택/해제 버튼
    container.innerHTML = `
        <div style="margin-bottom: 0.5rem; display: flex; gap: 0.5rem;">
            <button class="btn btn-small btn-secondary" onclick="selectAllLeafletRooms()">전체 선택</button>
            <button class="btn btn-small btn-secondary" onclick="deselectAllLeafletRooms()">전체 해제</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem;">
            ${rooms.map((room, index) => {
                const isChecked = window.leafletConfig.selectedRooms.includes(room);
                return `
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: ${isChecked ? '#E3F2FD' : '#f5f5f5'}; border-radius: 6px; border: 1px solid ${isChecked ? '#2196F3' : '#ddd'};">
                        <input type="checkbox" 
                               ${isChecked ? 'checked' : ''} 
                               onchange="toggleLeafletRoom('${room}')"
                               style="width: 18px; height: 18px; accent-color: #2196F3;">
                        <span style="font-size: 0.85rem;">${room}</span>
                    </label>
                `;
            }).join('')}
        </div>
    `;
}

function toggleLeafletRoom(room) {
    const index = window.leafletConfig.selectedRooms.indexOf(room);
    if (index > -1) {
        window.leafletConfig.selectedRooms.splice(index, 1);
    } else {
        window.leafletConfig.selectedRooms.push(room);
    }
    renderLeafletRoomCheckboxes();
}

function selectAllLeafletRooms() {
    const selectedDate = window.leafletConfig.selectedDate;
    const dateConfig = window.AppState?.dateConfigs?.[selectedDate];
    const rooms = dateConfig?.rooms || [];
    window.leafletConfig.selectedRooms = [...rooms];
    renderLeafletRoomCheckboxes();
}

function deselectAllLeafletRooms() {
    window.leafletConfig.selectedRooms = [];
    renderLeafletRoomCheckboxes();
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
            
            // Firebase에 저장 (선택적)
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
            leftPreview.innerHTML = `<img src="${window.leafletConfig.leftKeyVisual}" style="max-width: 100%; max-height: 200px; border-radius: 8px;">`;
        } else {
            leftPreview.innerHTML = '<p style="color:#999; text-align: center;">이미지를 업로드하세요</p>';
        }
    }
    
    if (rightPreview) {
        if (window.leafletConfig.rightKeyVisual) {
            rightPreview.innerHTML = `<img src="${window.leafletConfig.rightKeyVisual}" style="max-width: 100%; max-height: 200px; border-radius: 8px;">`;
        } else {
            rightPreview.innerHTML = '<p style="color:#999; text-align: center;">이미지를 업로드하세요</p>';
        }
    }
}

function saveKeyVisualToFirebase(side, base64) {
    if (!window.db) return;
    
    const path = `config/leaflet/keyVisual_${side}`;
    window.db.ref(path).set(base64).catch(err => {
        console.error('키비주얼 저장 실패:', err);
    });
}

function loadKeyVisualsFromFirebase() {
    if (!window.db) return;
    
    window.db.ref('config/leaflet').once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) {
            window.leafletConfig.leftKeyVisual = data.keyVisual_left || null;
            window.leafletConfig.rightKeyVisual = data.keyVisual_right || null;
            updateKeyVisualPreviews();
        }
    }).catch(err => {
        console.error('키비주얼 로드 실패:', err);
    });
}

// ============================================
// 리플렛 PDF 생성
// ============================================
async function generateLeafletPDF() {
    const selectedDate = window.leafletConfig.selectedDate;
    const selectedRooms = window.leafletConfig.selectedRooms;
    
    if (!selectedDate) {
        alert('날짜를 선택해주세요.');
        return;
    }
    
    if (selectedRooms.length === 0) {
        alert('출력할 룸을 선택해주세요.');
        return;
    }
    
    // 로딩 표시
    const generateBtn = document.getElementById('generateLeafletBtn');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '⏳ 생성 중...';
    }
    
    try {
        // HTML 기반 리플렛 생성
        const leafletHTML = generateLeafletHTML(selectedDate, selectedRooms);
        
        // 새 창에서 열기 (인쇄용)
        const printWindow = window.open('', '_blank');
        printWindow.document.write(leafletHTML);
        printWindow.document.close();
        
        // 인쇄 다이얼로그 (PDF 저장 가능)
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
    } catch (error) {
        console.error('리플렛 생성 오류:', error);
        alert('리플렛 생성 중 오류가 발생했습니다.');
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '📄 리플렛 PDF 생성';
        }
    }
}

// ============================================
// 리플렛 HTML 생성 (PDF용)
// ============================================
function generateLeafletHTML(selectedDate, selectedRooms) {
    const dateConfig = window.AppState?.dateConfigs?.[selectedDate];
    const lectures = window.AppState?.lectures || [];
    const sessions = window.AppState?.sessions || [];
    const language = window.AppState?.language || 'ko';
    
    // 날짜 포맷
    const date = new Date(selectedDate);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[date.getDay()];
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}(${dayName})`;
    
    // 각 룸별 강의/세션 데이터 수집
    const roomData = selectedRooms.map(room => {
        return {
            room: room,
            sessions: getSessionsForRoom(selectedDate, room, sessions, lectures, language)
        };
    });
    
    // 컬럼 개수에 따른 너비 계산
    const columnCount = selectedRooms.length;
    const hasKeyVisuals = window.leafletConfig.leftKeyVisual || window.leafletConfig.rightKeyVisual;
    
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>학술대회 리플렛 - ${dateLabel}</title>
    <style>
        @page {
            size: A3 landscape;
            margin: 10mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
            font-size: 8pt;
            line-height: 1.3;
            background: white;
        }
        
        .leaflet-container {
            display: flex;
            width: 100%;
            min-height: 100vh;
        }
        
        .key-visual {
            width: 60px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #1a237e;
            padding: 10px 5px;
        }
        
        .key-visual img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        
        .key-visual.placeholder {
            background: linear-gradient(180deg, #1a237e 0%, #3949ab 100%);
            color: white;
            font-size: 14pt;
            font-weight: bold;
            writing-mode: vertical-rl;
            text-orientation: mixed;
        }
        
        .schedule-columns {
            flex: 1;
            display: flex;
            gap: 2px;
            padding: 5px;
            background: #f5f5f5;
        }
        
        .room-column {
            flex: 1;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .room-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 8px;
            text-align: center;
            font-weight: bold;
            font-size: 9pt;
        }
        
        .room-date {
            font-size: 7pt;
            opacity: 0.9;
        }
        
        .room-content {
            padding: 5px;
        }
        
        .session-block {
            margin-bottom: 8px;
            border-left: 3px solid #3498db;
            padding-left: 6px;
        }
        
        .session-header {
            background: #e3f2fd;
            padding: 4px 6px;
            margin-bottom: 4px;
            border-radius: 3px;
        }
        
        .session-title {
            font-weight: bold;
            font-size: 8pt;
            color: #1565c0;
        }
        
        .session-moderator {
            font-size: 7pt;
            color: #666;
            margin-top: 2px;
        }
        
        .lecture-item {
            display: flex;
            padding: 3px 0;
            border-bottom: 1px dotted #eee;
            font-size: 7pt;
        }
        
        .lecture-item:last-child {
            border-bottom: none;
        }
        
        .lecture-time {
            width: 70px;
            flex-shrink: 0;
            color: #333;
            font-weight: 500;
        }
        
        .lecture-info {
            flex: 1;
        }
        
        .lecture-title {
            color: #333;
            margin-bottom: 1px;
        }
        
        .lecture-speaker {
            color: #666;
            font-size: 6.5pt;
        }
        
        .lecture-affiliation {
            color: #999;
            font-size: 6pt;
        }
        
        .coffee-break, .lunch-break {
            background: #fff8e1;
            padding: 4px 8px;
            text-align: center;
            font-size: 7pt;
            color: #f57c00;
            margin: 4px 0;
            border-radius: 3px;
        }
        
        .lunch-break {
            background: #efebe9;
            color: #5d4037;
        }
        
        .panel-discussion {
            background: #f3e5f5;
            padding: 3px 6px;
            font-size: 6.5pt;
            color: #7b1fa2;
            border-radius: 2px;
            margin-top: 2px;
        }
        
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .leaflet-container { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="leaflet-container">
        ${window.leafletConfig.leftKeyVisual ? 
            `<div class="key-visual"><img src="${window.leafletConfig.leftKeyVisual}" alt="Key Visual"></div>` :
            `<div class="key-visual placeholder">ASLS KOREA</div>`
        }
        
        <div class="schedule-columns">
            ${roomData.map(data => generateRoomColumnHTML(data, dateLabel)).join('')}
        </div>
        
        ${window.leafletConfig.rightKeyVisual ? 
            `<div class="key-visual"><img src="${window.leafletConfig.rightKeyVisual}" alt="Key Visual"></div>` :
            `<div class="key-visual placeholder">ASLS KOREA</div>`
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
    
    return `
        <div class="room-column">
            <div class="room-header">
                <div class="room-date">${dateLabel}</div>
                <div>${room}</div>
            </div>
            <div class="room-content">
                ${sessions.map(session => generateSessionBlockHTML(session)).join('')}
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
    
    const lecturesHTML = session.lectures.map(lecture => `
        <div class="lecture-item">
            <div class="lecture-time">${lecture.startTime}~${lecture.endTime}</div>
            <div class="lecture-info">
                <div class="lecture-title">${lecture.title}</div>
                <div class="lecture-speaker">${lecture.speaker}</div>
                ${lecture.affiliation ? `<div class="lecture-affiliation">${lecture.affiliation}</div>` : ''}
            </div>
        </div>
    `).join('');
    
    // 패널 토의 (세션 끝에 연자들 이름만 나열)
    const panelHTML = session.panelDiscussion ? 
        `<div class="panel-discussion">📋 ${session.panelDiscussion}</div>` : '';
    
    return `
        <div class="session-block" style="border-left-color: ${session.color || '#3498db'};">
            <div class="session-header">
                <div class="session-title">${session.name}</div>
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
    
    // 해당 날짜/룸의 세션 필터링
    const roomSessions = allSessions.filter(s => s.date === date && s.room === room);
    
    // 해당 날짜/룸의 강의 필터링
    const roomLectures = allLectures.filter(l => l.date === date && l.room === room && l.startTime);
    
    // 시간순 정렬
    roomSessions.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    roomLectures.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    
    // 세션별로 그룹화
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
                `${language === 'en' ? (session.moderatorEn || session.moderator) : session.moderator} ${session.moderatorAffiliation || ''}` : null,
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
// 초기화
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Firebase에서 키비주얼 로드
    setTimeout(() => {
        loadKeyVisualsFromFirebase();
    }, 2000);
});

// 전역 함수 등록
window.openLeafletModal = openLeafletModal;
window.closeLeafletModal = closeLeafletModal;
window.uploadKeyVisual = uploadKeyVisual;
window.generateLeafletPDF = generateLeafletPDF;
window.selectLeafletDate = selectLeafletDate;
window.toggleLeafletRoom = toggleLeafletRoom;
window.selectAllLeafletRooms = selectAllLeafletRooms;
window.deselectAllLeafletRooms = deselectAllLeafletRooms;
