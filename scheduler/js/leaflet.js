// ============================================
// 리플렛 PDF 생성 모듈 (통합 인쇄 모달 버전)
// ============================================

// 키비주얼 이미지 저장
window.leafletConfig = {
    leftKeyVisual: null,
    rightKeyVisual: null,
    printFormat: 'schedule',  // 'schedule' 또는 'leaflet'
    includeSpeakerPhoto: false  // 연자 사진 포함 여부
};

// ============================================
// 기존 openPrintModal 함수 확장 (호출 후 초기화 추가)
// ============================================
const originalOpenPrintModal = window._baseOpenPrintModal || window.openPrintModal;

window.openPrintModal = function() {
    // 기존 openPrintModal 호출 (있으면)
    if (typeof originalOpenPrintModal === 'function') {
        originalOpenPrintModal();
    } else {
        document.getElementById('printModal').style.display = 'flex';
    }
    
    // 추가 초기화
    initPrintModalExtras();
};

function initPrintModalExtras() {
    // 현재 날짜 가져오기
    const currentDate = window.AppState?.currentDate || window.AppState?.selectedDate;
    
    // 날짜 선택 버튼 렌더링
    renderPrintDateButtons(currentDate);
    
    // 룸 체크박스 업데이트
    updatePrintRoomCheckboxes(currentDate);
    
    // 키비주얼 로드
    loadKeyVisualsFromFirebase();
    
    // 기본 형식 선택 (시간표)
    window.leafletConfig.printFormat = 'schedule';
    selectPrintFormat('schedule');
    
    // 연자 사진 체크박스 초기화
    const photoCheckbox = document.getElementById('includeSpeakerPhoto');
    if (photoCheckbox) {
        photoCheckbox.checked = window.leafletConfig.includeSpeakerPhoto;
        photoCheckbox.onchange = function() {
            window.leafletConfig.includeSpeakerPhoto = this.checked;
        };
    }
}

// ============================================
// 날짜 선택 버튼 렌더링
// ============================================
function renderPrintDateButtons(currentDate) {
    const dateLabelEl = document.getElementById('printDateLabel');
    if (!dateLabelEl) return;
    
    const eventDates = window.AppState?.eventDates || [];
    
    if (eventDates.length === 0) {
        dateLabelEl.innerHTML = `<span style="font-weight: bold;">📅 날짜 미등록</span>`;
        return;
    }
    
    // 날짜 버튼들 생성
    dateLabelEl.innerHTML = `
        <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            ${eventDates.map(dateInfo => {
                const isSelected = dateInfo.date === currentDate;
                const label = dateInfo.label || dateInfo.date;
                return `
                    <button class="btn btn-small ${isSelected ? 'btn-primary' : 'btn-secondary'}" 
                            onclick="selectPrintDate('${dateInfo.date}')"
                            style="padding: 0.5rem 1rem; ${isSelected ? '' : 'opacity: 0.7;'}">
                        📅 ${label}
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================
// 날짜 선택 시 처리
// ============================================
function selectPrintDate(date) {
    // 선택된 날짜 저장
    window.leafletConfig.selectedPrintDate = date;
    
    // 날짜 버튼 UI 업데이트
    renderPrintDateButtons(date);
    
    // 룸 체크박스 업데이트
    updatePrintRoomCheckboxes(date);
}

function updatePrintRoomCheckboxes(currentDate) {
    const container = document.getElementById('printRoomCheckboxes');
    if (!container) return;
    
    let rooms = getRoomsForCurrentDate(currentDate);
    
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
                <input type="checkbox" class="room-checkbox" value="${room}" checked style="width: 18px; height: 18px; accent-color: #667eea;">
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
        if (document.getElementById('speakerPhotoSection')) {
            document.getElementById('speakerPhotoSection').style.display = 'none';
        }
    } else {
        scheduleOption.style.border = '2px solid #ddd';
        scheduleOption.style.background = '#f5f5f5';
        leafletOption.style.border = '2px solid #667eea';
        leafletOption.style.background = '#f0f4ff';
        keyVisualSection.style.display = 'block';
        languageSection.style.display = 'block';
        if (document.getElementById('speakerPhotoSection')) {
            document.getElementById('speakerPhotoSection').style.display = 'block';
        }
        updateKeyVisualPreviews();
    }
}

// ============================================
// 전체 룸 선택/해제
// ============================================
function toggleAllPrintRooms(checked) {
    const checkboxes = document.querySelectorAll('.room-checkbox');
    checkboxes.forEach(cb => cb.checked = checked);
}

// ============================================
// 형식에 따른 인쇄 실행
// ============================================
function executePrintWithFormat() {
    const format = window.leafletConfig.printFormat;
    
    // 선택된 룸 가져오기 - printRoomCheckboxes 내의 체크박스만 확인
    const selectedRooms = [];
    const roomCheckboxes = document.querySelectorAll('#printRoomCheckboxes .room-checkbox:checked');
    roomCheckboxes.forEach(cb => {
        if (cb.value) {
            selectedRooms.push(cb.value);
        }
    });
    
    console.log('선택된 룸:', selectedRooms); // 디버깅용
    
    if (selectedRooms.length === 0) {
        Toast.warning('출력할 룸을 선택해주세요.');
        return;
    }
    
    // 선택된 날짜 가져오기
    const selectedDate = window.leafletConfig.selectedPrintDate || window.AppState?.currentDate || window.AppState?.selectedDate;
    
    if (format === 'leaflet') {
        // 리플렛 형식 → 미리보기 창 먼저 표시
        const language = document.querySelector('input[name="printLanguage"]:checked')?.value || 'ko';
        closePrintModal();
        openLeafletPreview(selectedRooms, language, selectedDate);
    } else {
        // 기존 시간표 형식으로 출력
        executeSchedulePrint(selectedRooms);
        closePrintModal();
    }
}

// ============================================
// 리플렛 미리보기 모달 열기 (인쇄 전 브라우저 내 확인)
// ============================================
function openLeafletPreview(selectedRooms, language, selectedDate) {
    if (!selectedDate) {
        Toast.warning('날짜를 선택해주세요.');
        return;
    }
    if (selectedRooms.length === 0) {
        Toast.warning('출력할 룸을 선택해주세요.');
        return;
    }

    try {
        const leafletHTML = generateLeafletHTML(selectedDate, selectedRooms, language);

        // 미리보기 오버레이 생성
        const overlay = document.createElement('div');
        overlay.id = 'leafletPreviewOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.75);
            display: flex; flex-direction: column;
            align-items: center;
            overflow-y: auto;
            padding: 20px;
        `;

        // 툴바
        overlay.innerHTML = `
            <div style="
                width: 100%; max-width: 860px;
                display: flex; justify-content: space-between; align-items: center;
                background: #1e293b; color: white;
                border-radius: 10px 10px 0 0;
                padding: 10px 20px;
                flex-shrink: 0;
            ">
                <span style="font-size: 14px; font-weight: bold;">📄 리플렛 미리보기 (A4 기준)</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: #94a3b8;">
                        <input type="checkbox" id="previewPhotoToggle"
                            ${window.leafletConfig.includeSpeakerPhoto ? 'checked' : ''}
                            style="width:15px; height:15px; accent-color:#667eea;"
                            onchange="togglePreviewSpeakerPhoto(this.checked)">
                        연자 사진 포함
                    </label>
                    <button onclick="printLeafletPreview()" style="
                        background: #667eea; color: white; border: none;
                        padding: 7px 18px; border-radius: 6px;
                        font-size: 13px; cursor: pointer; font-weight: bold;
                    ">🖨️ 인쇄 / PDF 저장</button>
                    <button onclick="closeLeafletPreview()" style="
                        background: #64748b; color: white; border: none;
                        padding: 7px 14px; border-radius: 6px;
                        font-size: 13px; cursor: pointer;
                    ">✕ 닫기</button>
                </div>
            </div>
            <div id="leafletPreviewPages" style="
                width: 100%; max-width: 860px;
                background: #f1f5f9;
                padding: 20px;
                border-radius: 0 0 10px 10px;
            "></div>
        `;

        document.body.appendChild(overlay);

        // 현재 설정 저장 (재렌더링용)
        window._leafletPreviewParams = { selectedRooms, language, selectedDate };

        // A4 페이지 렌더링
        renderPreviewPages(leafletHTML);

    } catch (error) {
        console.error('미리보기 생성 오류:', error);
        Toast.error('미리보기 생성 중 오류가 발생했습니다.');
    }
}

// ============================================
// A4 페이지 분할 미리보기 렌더링
// ============================================
function renderPreviewPages(leafletHTML) {
    const container = document.getElementById('leafletPreviewPages');
    if (!container) return;

    // A4 비율: 297mm x 210mm (landscape) → 화면에서는 820px x 580px 기준
    const A4_W = 820, A4_H = 580;

    // iframe으로 렌더 후 높이를 기준으로 페이지 분할 표시
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position: relative;`;

    // iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'leafletPreviewIframe';
    iframe.style.cssText = `
        width: ${A4_W}px;
        border: none;
        display: block;
        background: white;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        border-radius: 4px;
    `;
    iframe.srcdoc = leafletHTML;

    // 높이 자동 조절 + 페이지 구분선 표시
    iframe.onload = function() {
        try {
            const bodyH = iframe.contentDocument?.body?.scrollHeight || A4_H;
            iframe.style.height = bodyH + 'px';

            // 페이지 구분선 (A4 높이마다)
            const pageOverlay = wrapper.querySelector('.page-dividers');
            if (pageOverlay) pageOverlay.remove();

            const dividerContainer = document.createElement('div');
            dividerContainer.className = 'page-dividers';
            dividerContainer.style.cssText = `
                position: absolute; top: 0; left: 0;
                width: ${A4_W}px; height: ${bodyH}px;
                pointer-events: none;
            `;

            let pageNum = 1;
            for (let y = A4_H; y < bodyH; y += A4_H) {
                const line = document.createElement('div');
                line.style.cssText = `
                    position: absolute; left: 0; top: ${y}px;
                    width: 100%; height: 2px;
                    background: repeating-linear-gradient(90deg, #e53e3e 0 8px, transparent 8px 16px);
                `;
                const label = document.createElement('div');
                label.style.cssText = `
                    position: absolute; right: 4px; top: ${y - 18}px;
                    font-size: 10px; color: #e53e3e; background: white;
                    padding: 1px 5px; border-radius: 3px; border: 1px solid #e53e3e;
                `;
                label.textContent = `${pageNum}페이지 끝`;
                pageNum++;
                dividerContainer.appendChild(line);
                dividerContainer.appendChild(label);
            }

            wrapper.appendChild(dividerContainer);

            // 페이지 수 안내
            const totalPages = Math.ceil(bodyH / A4_H);
            const info = document.getElementById('previewPageInfo');
            if (info) info.textContent = `총 ${totalPages}페이지`;
        } catch (e) {
            console.warn('미리보기 높이 계산 오류:', e);
        }
    };

    wrapper.appendChild(iframe);
    container.innerHTML = `
        <div style="text-align:center; color:#64748b; font-size:12px; margin-bottom:10px;">
            <span id="previewPageInfo">페이지 계산 중...</span>
            &nbsp;·&nbsp; 빨간 점선 = A4 페이지 구분선 &nbsp;·&nbsp; 실제 인쇄 시 자동 분할됩니다
        </div>
    `;
    container.appendChild(wrapper);
}

// ============================================
// 미리보기에서 연자 사진 토글 (재렌더링)
// ============================================
function togglePreviewSpeakerPhoto(checked) {
    window.leafletConfig.includeSpeakerPhoto = checked;
    // 모달 체크박스도 동기화
    const modalCb = document.getElementById('includeSpeakerPhoto');
    if (modalCb) modalCb.checked = checked;

    const p = window._leafletPreviewParams;
    if (!p) return;
    const newHTML = generateLeafletHTML(p.selectedDate, p.selectedRooms, p.language);
    renderPreviewPages(newHTML);
}

// ============================================
// 미리보기 창에서 인쇄 실행
// ============================================
function printLeafletPreview() {
    const iframe = document.getElementById('leafletPreviewIframe');
    if (iframe?.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    } else {
        // fallback
        const p = window._leafletPreviewParams;
        if (p) generateLeafletPDFWithDate(p.selectedRooms, p.language, p.selectedDate);
    }
}

// ============================================
// 미리보기 모달 닫기
// ============================================
function closeLeafletPreview() {
    const overlay = document.getElementById('leafletPreviewOverlay');
    if (overlay) overlay.remove();
    window._leafletPreviewParams = null;
}

// ============================================
// 리플렛 PDF 생성 (날짜 포함)
// ============================================
function generateLeafletPDFWithDate(selectedRooms, language, selectedDate) {
    if (!selectedDate) {
        Toast.warning('날짜를 선택해주세요.');
        return;
    }
    
    if (selectedRooms.length === 0) {
        Toast.warning('출력할 룸을 선택해주세요.');
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
        Toast.error('리플렛 생성 중 오류가 발생했습니다.');
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
        const checkboxes = document.querySelectorAll('#printRoomCheckboxes input[type="checkbox"]:not(#selectAllRooms)');
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
function generateLeafletPDF(selectedRooms, language) {
    const currentDate = window.AppState?.currentDate || window.AppState?.selectedDate;
    
    if (!currentDate) {
        Toast.warning('날짜를 선택해주세요.');
        return;
    }
    
    if (selectedRooms.length === 0) {
        Toast.warning('출력할 룸을 선택해주세요.');
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
        Toast.error('리플렛 생성 중 오류가 발생했습니다.');
    }
}

// ============================================
// 리플렛 HTML 생성 (PDF용)
// ============================================
function generateLeafletHTML(selectedDate, selectedRooms, language) {
    const lectures = window.AppState?.lectures || [];
    const sessions = window.AppState?.sessions || [];
    
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
                ${window.leafletConfig.includeSpeakerPhoto && lecture.speakerPhotoUrl ? `
                <div class="lecture-photo">
                    <img src="${lecture.speakerPhotoUrl}" alt="${lecture.speaker || ''}" 
                         style="width:28px; height:28px; border-radius:50%; object-fit:cover; flex-shrink:0; margin-right:3px; border:1px solid #ddd;">
                </div>` : ''}
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
    
    // 해당 날짜/룸의 세션 필터링
    const roomSessions = (allSessions || []).filter(s => s.date === date && s.room === room);
    
    // 해당 날짜/룸의 강의 필터링
    const roomLectures = (allLectures || []).filter(l => l.date === date && l.room === room && l.startTime);
    
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
                    affiliation: l.affiliation || '',
                    speakerPhotoUrl: l.speakerPhotoUrl || l.photoUrl || null
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
                affiliation: l.affiliation || '',
                speakerPhotoUrl: l.speakerPhotoUrl || l.photoUrl || null
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
window.selectPrintDate = selectPrintDate;
window.openLeafletPreview = openLeafletPreview;
window.closeLeafletPreview = closeLeafletPreview;
window.printLeafletPreview = printLeafletPreview;
window.togglePreviewSpeakerPhoto = togglePreviewSpeakerPhoto;
