/**
 * app.js - 앱 초기화 및 Firebase 동기화
 */

// ============================================
// 기본 연자 데이터
// ============================================

const SPEAKERS_DATA = [
    { name: "Yesin Lae", nameEn: "Yesin Lae", affiliation: "인도네시아", affiliationEn: "Indonesia" },
    { name: "Ting Song Lim", nameEn: "Ting Song Lim", affiliation: "Malaysia", affiliationEn: "Malaysia" },
    { name: "황제완", nameEn: "Hwang Je-wan", affiliation: "메이린의원 더현대 대구", affiliationEn: "Mayline Clinic" },
    { name: "황용호", nameEn: "Hwang Yong-ho", affiliation: "웰스킨의원", affiliationEn: "Wellskin Clinic" },
    { name: "홍한빛", nameEn: "Hong Han-bit", affiliation: "룩스웰의원", affiliationEn: "Luxwell Clinic" },
    { name: "최호성", nameEn: "Choi Ho-seong", affiliation: "피어나의원", affiliationEn: "Pieona Clinic" },
    { name: "이상돈", nameEn: "Lee Sang-don", affiliation: "대미레 학술고문", affiliationEn: "Daemire Academic Advisor" },
    { name: "문형진", nameEn: "Moon Hyeong-jin", affiliation: "대미레 학술고문", affiliationEn: "Daemire Academic Advisor" },
    { name: "김희진", nameEn: "Kim Hee-jin", affiliation: "연세대학교 치과대학 교수", affiliationEn: "Yonsei University Dental Professor" }
    // 추가 연자는 실제 데이터에서 로드
];

// ============================================
// Firebase 실시간 리스너
// ============================================

window.startRealtimeListeners = function() {
    listenToOnlineUsers();
    loadTimeSettingsFromFirebase();

    database.ref('/data').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.dataByDate) {
                AppState.dataByDate = data.dataByDate;
            }
            if (data.speakers && data.speakers.length > 0) {
                AppState.speakers = data.speakers;
            }
            if (data.companies && data.companies.length > 0) {
                AppState.companies = data.companies;
            } else if (AppState.companies.length === 0) {
                AppState.companies = [...AppConfig.INITIAL_COMPANIES];
            }
            if (data.categories && data.categories.length > 0) {
                AppState.categories = data.categories;
            }

            loadDateData(AppState.currentDate);

            updateLectureList();
            updateScheduleDisplay();
            updateCategoryDropdowns();

            updateSyncStatus('synced', '동기화됨');
            console.log('실시간 데이터 수신');
        } else {
            console.log('Firebase에 데이터 없음 - 기본값 사용');
            if (AppState.companies.length === 0) {
                AppState.companies = [...AppConfig.INITIAL_COMPANIES];
            }
            updateSyncStatus('synced', '준비됨');
        }
    });
};

/**
 * Firebase에 데이터 저장
 */
window.saveToFirebase = function() {
    if (!canEdit()) {
        console.log('편집 권한 없음');
        return;
    }

    updateSyncStatus('syncing');

    AppState.dataByDate[AppState.currentDate] = {
        lectures: AppState.lectures,
        schedule: AppState.schedule,
        sessions: AppState.sessions
    };

    const dataToSave = {
        dataByDate: AppState.dataByDate,
        speakers: AppState.speakers,
        companies: AppState.companies,
        categories: AppState.categories,
        lastModified: firebase.database.ServerValue.TIMESTAMP,
        lastModifiedBy: AppState.currentUser ? AppState.currentUser.email : 'unknown'
    };

    database.ref('/data').set(dataToSave)
        .then(() => {
            updateSyncStatus('synced', '저장됨');
            console.log('Firebase 저장 완료');
        })
        .catch((error) => {
            updateSyncStatus('offline', '저장 실패');
            console.error('Firebase 저장 실패:', error);
        });
};

/**
 * 저장 및 동기화
 */
window.saveAndSync = function() {
    saveCurrentDateData();
    saveToFirebase();
    saveAllDataToStorage();
};

/**
 * 시간 설정 Firebase에 저장
 */
window.saveTimeSettingsToFirebase = function() {
    if (!AppState.currentUser) return;

    database.ref('/settings/timeSettings').set(AppState.timeSettingsByDate)
        .then(() => console.log('시간 설정 저장 완료'))
        .catch(err => console.error('시간 설정 저장 실패:', err));
};

/**
 * 시간 설정 Firebase에서 로드
 */
window.loadTimeSettingsFromFirebase = function() {
    database.ref('/settings/timeSettings').once('value', (snapshot) => {
        if (snapshot.exists()) {
            AppState.timeSettingsByDate = snapshot.val();
            generateTimeSlots();
            console.log('시간 설정 로드 완료:', AppState.timeSettingsByDate);
        }
    });
};

// ============================================
// 날짜 전환
// ============================================

window.switchDate = function(date) {
    saveToFirebase();

    AppState.currentDate = date;
    AppState.rooms = AppConfig.ROOMS_BY_DATE[date] || [];

    generateTimeSlots();
    loadDateData(date);

    document.querySelectorAll('.date-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.date === date);
    });

    createScheduleTable();
    updateLectureList();

    console.log(`날짜 변경: ${date}, 시간: ${AppState.timeSlots[0]} ~ ${AppState.timeSlots[AppState.timeSlots.length - 1]}`);
};

// ============================================
// 언어 전환
// ============================================

window.setLanguage = function(lang) {
    AppState.currentLanguage = lang;

    const koBtn = document.getElementById('langKoBtn');
    const enBtn = document.getElementById('langEnBtn');

    if (lang === 'ko') {
        koBtn.style.background = 'var(--accent)';
        koBtn.style.color = 'white';
        enBtn.style.background = 'rgba(255,255,255,0.2)';
        enBtn.style.color = 'white';
    } else {
        enBtn.style.background = 'var(--accent)';
        enBtn.style.color = 'white';
        koBtn.style.background = 'rgba(255,255,255,0.2)';
        koBtn.style.color = 'white';
    }

    updateScheduleDisplay();
    console.log(`언어 변경: ${lang === 'ko' ? '한글' : 'English'}`);
};

// ============================================
// 룸 관리
// ============================================

window.addRoom = function() {
    const newRoomName = prompt('새 룸 이름을 입력하세요:', `룸${AppState.rooms.length + 1}`);
    if (newRoomName && newRoomName.trim()) {
        AppState.rooms.push(newRoomName.trim());
        saveRoomsToStorage();
        createScheduleTable();
    }
};

window.deleteRoom = function(roomIndex) {
    const roomName = AppState.rooms[roomIndex];

    Object.keys(AppState.schedule).forEach(key => {
        if (key.includes(`-${roomName}`)) {
            delete AppState.schedule[key];
        }
    });
    AppState.sessions = AppState.sessions.filter(s => s.room !== roomName);

    AppState.rooms.splice(roomIndex, 1);
    saveRoomsToStorage();
    saveAndSync();
    createScheduleTable();
};

window.updateRoomNameInData = function(oldName, newName) {
    const newSchedule = {};
    Object.entries(AppState.schedule).forEach(([key, value]) => {
        const newKey = key.replace(`-${oldName}`, `-${newName}`);
        newSchedule[newKey] = value;
    });
    AppState.schedule = newSchedule;

    AppState.sessions.forEach(s => {
        if (s.room === oldName) {
            s.room = newName;
        }
    });

    saveAndSync();
};

window.saveRoomsToStorage = function() {
    localStorage.setItem('conference_rooms', JSON.stringify(AppState.rooms));
};

// ============================================
// 데이터 초기화
// ============================================

window.resetAllData = function() {
    if (AppState.currentUserRole !== 'admin') {
        alert('⛔ 초기화는 관리자만 수행할 수 있습니다.');
        return;
    }

    if (!confirm('⚠️ 정말로 모든 데이터를 초기화하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다!')) {
        return;
    }

    const confirmText = prompt('초기화를 진행하려면 "초기화"를 입력하세요:');
    if (confirmText !== '초기화') {
        alert('초기화가 취소되었습니다.');
        return;
    }

    localStorage.removeItem('conference_data_by_date');
    localStorage.removeItem('conference_current_date');
    localStorage.removeItem('conference_speakers');
    localStorage.removeItem('conference_categories');

    AppState.dataByDate = {
        '2026-04-11': { lectures: [], schedule: {}, sessions: [] },
        '2026-04-12': { lectures: [], schedule: {}, sessions: [] }
    };
    AppState.lectures = [];
    AppState.schedule = {};
    AppState.sessions = [];
    AppState.speakers = [...SPEAKERS_DATA];
    AppState.currentDate = '2026-04-11';
    AppState.rooms = AppConfig.ROOMS_BY_DATE[AppState.currentDate];

    saveToFirebase();
    saveAllDataToStorage();
    updateLectureList();
    createScheduleTable();

    alert('✅ 모든 데이터가 초기화되었습니다.');
    location.reload();
};

// ============================================
// 전체 시간표 보기
// ============================================

window.openFullScheduleModal = function() {
    const dateInfo = AppConfig.CONFERENCE_DATES.find(d => d.date === AppState.currentDate);
    document.getElementById('fullScheduleDateLabel').textContent = dateInfo ? dateInfo.label : AppState.currentDate;

    const content = document.getElementById('fullScheduleContent');
    content.innerHTML = generateFullScheduleHTML();

    document.getElementById('fullScheduleModal').classList.add('active');
    document.addEventListener('keydown', handleScheduleModalEsc);
};

window.closeFullScheduleModal = function() {
    document.getElementById('fullScheduleModal').classList.remove('active');
    document.removeEventListener('keydown', handleScheduleModalEsc);
};

// ESC 키로 모달 닫기
window.handleScheduleModalEsc = function(e) {
    if (e.key === 'Escape') {
        const fullModal = document.getElementById('fullScheduleModal');
        const roomModal = document.getElementById('roomScheduleModal');
        if (roomModal && roomModal.classList.contains('active')) {
            closeRoomScheduleModal();
        } else if (fullModal && fullModal.classList.contains('active')) {
            closeFullScheduleModal();
        }
    }
};

window.generateFullScheduleHTML = function() {
    const timeUnit = AppConfig.TIME_UNIT || 5;
    
    // 각 룸별로 어떤 시간대가 이미 강의로 차지되어 있는지 추적
    const occupiedCells = {}; // { roomIndex: { timeSlotIndex: true } }
    AppState.rooms.forEach((room, idx) => {
        occupiedCells[idx] = {};
    });
    
    // 강의 정보를 시간-룸 키로 빠르게 찾기 위한 맵
    const lectureMap = {};
    Object.entries(AppState.schedule).forEach(([key, lecture]) => {
        lectureMap[key] = lecture;
    });
    
    // 세션 정보를 시간-룸 키로 찾기 위한 맵
    const sessionMap = {};
    AppState.sessions.forEach(session => {
        const key = `${session.time}-${session.room}`;
        sessionMap[key] = session;
    });
    
    // 강의가 속한 세션 찾기 함수
    const findSessionForLecture = (startTime, room, duration) => {
        // 강의 시간대에 해당하는 세션 찾기
        const startIdx = AppState.timeSlots.indexOf(startTime);
        if (startIdx === -1) return null;
        
        // 강의 시작 시간 이전의 가장 가까운 세션 찾기
        for (let i = startIdx; i >= 0; i--) {
            const checkTime = AppState.timeSlots[i];
            const sessionKey = `${checkTime}-${room}`;
            if (sessionMap[sessionKey]) {
                return sessionMap[sessionKey];
            }
        }
        return null;
    };
    
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">';

    html += '<thead style="position: sticky; top: 0; background: var(--primary); color: white; z-index: 10;">';
    html += '<tr><th style="padding: 0.5rem; border: 1px solid #ddd; min-width: 60px;">시간</th>';
    AppState.rooms.forEach((room, idx) => {
        const shortName = room.length > 20 ? room.substring(0, 20) + '...' : room;
        html += `<th style="padding: 0.5rem; border: 1px solid #ddd; min-width: 150px;">
            ${shortName}
            <button onclick="openRoomScheduleModal(${idx})" style="margin-left: 0.25rem; padding: 0.1rem 0.3rem; font-size: 0.6rem; cursor: pointer; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); border-radius: 3px; color: white;">🔍</button>
        </th>`;
    });
    html += '</tr></thead>';

    html += '<tbody>';
    
    AppState.timeSlots.forEach((time, timeIdx) => {
        const isHourMark = time.endsWith(':00');
        html += `<tr style="background: ${isHourMark ? '#f5f5f5' : 'white'};">`;
        html += `<td style="padding: 0.4rem; border: 1px solid #ddd; font-weight: ${isHourMark ? 'bold' : 'normal'}; text-align: center;">${time}</td>`;

        AppState.rooms.forEach((room, roomIdx) => {
            // 이미 이전 강의로 차지된 셀이면 건너뛰기
            if (occupiedCells[roomIdx][timeIdx]) {
                return; // rowspan으로 이미 커버됨
            }
            
            const key = `${time}-${room}`;
            const lecture = lectureMap[key];
            const session = sessionMap[key];

            let cellContent = '';
            let cellStyle = 'padding: 0.3rem; border: 1px solid #ddd; vertical-align: top;';
            let rowspan = 1;

            // 세션 헤더 표시
            if (session) {
                cellStyle += `background: ${session.color || '#9B59B6'}20;`;
                cellContent += `<div style="font-size: 0.65rem; color: ${session.color || '#9B59B6'}; font-weight: bold;">📌 ${session.name}</div>`;
            }

            if (lecture) {
                const duration = lecture.duration || 15;
                const slotsNeeded = Math.ceil(duration / timeUnit);
                rowspan = slotsNeeded;
                
                // 이 강의가 차지하는 시간대 마킹
                for (let i = 1; i < slotsNeeded; i++) {
                    if (timeIdx + i < AppState.timeSlots.length) {
                        occupiedCells[roomIdx][timeIdx + i] = true;
                    }
                }
                
                // 강의가 속한 세션 찾기
                const belongsToSession = findSessionForLecture(time, room, duration);
                const sessionColor = belongsToSession ? belongsToSession.color : null;
                const categoryColor = AppConfig.categoryColors[lecture.category] || '#9B59B6';
                
                // 세션에 속한 강의는 세션 색상 배경 사용
                if (sessionColor) {
                    cellStyle = `padding: 0.3rem; border: 1px solid #ddd; vertical-align: top; background: ${sessionColor}30;`;
                }
                
                const endTime = calculateEndTime(time, duration);
                
                cellContent = `<div style="background: ${categoryColor}; color: white; padding: 0.3rem 0.4rem; border-radius: 4px; font-size: 0.7rem; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center;">
                    <strong style="display: block; line-height: 1.3; margin-bottom: 0.2rem;">${lecture.titleKo || lecture.titleEn || '제목 없음'}</strong>
                    <div style="font-size: 0.6rem; opacity: 0.9;">👤 ${lecture.speakerKo || '미정'}</div>
                    <div style="font-size: 0.55rem; opacity: 0.8;">⏱️ ${time}~${endTime} (${duration}분)</div>
                </div>`;
            }

            html += `<td style="${cellStyle}"${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}>${cellContent}</td>`;
        });

        html += '</tr>';
    });
    html += '</tbody></table>';

    return html;
};

// ============================================
// 룸별 시간표 보기
// ============================================

window.openRoomScheduleModal = function(roomIndex) {
    const room = AppState.rooms[roomIndex];
    document.getElementById('roomScheduleTitle').textContent = `🏠 ${room}`;

    const content = document.getElementById('roomScheduleContent');
    content.innerHTML = generateRoomScheduleHTML(room);

    document.getElementById('roomScheduleModal').classList.add('active');
    document.addEventListener('keydown', handleScheduleModalEsc);
};

window.closeRoomScheduleModal = function() {
    document.getElementById('roomScheduleModal').classList.remove('active');
};

window.generateRoomScheduleHTML = function(room) {
    const timeUnit = AppConfig.TIME_UNIT || 5;
    const occupiedSlots = {}; // { timeIdx: true }
    
    // 세션 맵
    const sessionMap = {};
    AppState.sessions.forEach(session => {
        if (session.room === room) {
            const key = `${session.time}-${room}`;
            sessionMap[session.time] = session;
        }
    });
    
    // 현재 활성 세션 추적
    let currentSession = null;
    
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">';

    html += '<thead style="background: var(--primary); color: white;">';
    html += '<tr><th style="padding: 0.75rem; border: 1px solid #ddd; width: 80px;">시간</th>';
    html += '<th style="padding: 0.75rem; border: 1px solid #ddd;">강의 정보</th></tr></thead>';

    html += '<tbody>';

    AppState.timeSlots.forEach((time, timeIdx) => {
        // 이미 이전 강의로 차지된 슬롯이면 건너뛰기
        if (occupiedSlots[timeIdx]) {
            return;
        }
        
        const key = `${time}-${room}`;
        const lecture = AppState.schedule[key];
        const session = sessionMap[time];
        const isHourMark = time.endsWith(':00');
        
        // 세션 시작점이면 현재 세션 업데이트
        if (session) {
            currentSession = session;
        }

        if (session) {
            html += `<tr style="background: ${session.color || '#9B59B6'}15;">
                <td colspan="2" style="padding: 0.5rem; border: 1px solid #ddd; font-weight: bold; color: ${session.color || '#9B59B6'};">
                    📌 ${session.name} ${session.moderator ? `(좌장: ${session.moderator})` : ''}
                </td>
            </tr>`;
        }

        if (lecture) {
            const categoryColor = AppConfig.categoryColors[lecture.category] || '#9B59B6';
            const duration = lecture.duration || 15;
            const endTime = calculateEndTime(time, duration);
            const slotsNeeded = Math.ceil(duration / timeUnit);
            
            // 이 강의가 차지하는 시간대 마킹
            for (let i = 1; i < slotsNeeded; i++) {
                if (timeIdx + i < AppState.timeSlots.length) {
                    occupiedSlots[timeIdx + i] = true;
                }
            }
            
            // 세션에 속한 강의는 세션 색상 배경
            const bgColor = currentSession ? `${currentSession.color || '#9B59B6'}15` : (isHourMark ? '#f9f9f9' : 'white');

            html += `<tr style="background: ${bgColor};">
                <td style="padding: 0.5rem; border: 1px solid #ddd; text-align: center; font-weight: ${isHourMark ? 'bold' : 'normal'}; vertical-align: top;" rowspan="${slotsNeeded}">
                    ${time}<br><span style="font-size: 0.7rem; color: #999;">~${endTime}</span>
                </td>
                <td style="padding: 0.5rem; border: 1px solid #ddd; vertical-align: top;" rowspan="${slotsNeeded}">
                    <div style="background: ${categoryColor}; color: white; padding: 0.5rem; border-radius: 6px; height: 100%; box-sizing: border-box;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <strong style="font-size: 0.95rem; display: block; margin-bottom: 0.3rem;">${lecture.titleKo || lecture.titleEn || '제목 없음'}</strong>
                                <div style="font-size: 0.8rem; opacity: 0.95; margin-top: 0.25rem;">
                                    👤 ${lecture.speakerKo || '미정'} ${lecture.affiliation ? `(${lecture.affiliation})` : ''}
                                </div>
                                <div style="font-size: 0.75rem; opacity: 0.85;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: rgba(255,255,255,0.25); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.65rem; white-space: nowrap; margin-left: 0.5rem;">${lecture.category}</span>
                        </div>
                    </div>
                </td>
            </tr>`;
        }
    });

    html += '</tbody></table>';

    const roomLectures = Object.entries(AppState.schedule)
        .filter(([key]) => key.endsWith(`-${room}`))
        .map(([, lecture]) => lecture);

    const totalMinutes = roomLectures.reduce((sum, l) => sum + (l.duration || 15), 0);

    html += `<div style="margin-top: 1rem; padding: 0.75rem; background: #f5f5f5; border-radius: 8px; font-size: 0.85rem;">
        📊 <strong>총 ${roomLectures.length}개 강의</strong> · 총 ${totalMinutes}분 (${Math.floor(totalMinutes / 60)}시간 ${totalMinutes % 60}분)
    </div>`;

    return html;
};

// ============================================
// 엑셀 내보내기 및 인쇄
// ============================================

window.exportToExcel = function() {
    let csv = '시간,' + AppState.rooms.join(',') + '\n';

    AppState.timeSlots.forEach(time => {
        let row = [time];
        AppState.rooms.forEach(room => {
            const key = `${time}-${room}`;
            const lecture = AppState.schedule[key];
            row.push(lecture ? `${lecture.titleKo} (${lecture.speakerKo})` : '');
        });
        csv += row.join(',') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `schedule_${AppState.currentDate}.csv`;
    link.click();
};

window.printSchedule = function() {
    window.print();
};

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('=== 초기화 시작 ===');

    // 기본 데이터 설정
    if (AppState.speakers.length === 0) {
        AppState.speakers = [...SPEAKERS_DATA];
    }

    if (AppState.categories.length === 0) {
        AppState.categories = Object.keys(AppConfig.categoryColors).sort();
    }

    if (AppState.companies.length === 0) {
        AppState.companies = [...AppConfig.INITIAL_COMPANIES];
    }

    // 로컬 스토리지에서 데이터 로드
    loadAllDataFromStorage();
    loadCardStates();

    // 현재 날짜 설정
    AppState.rooms = AppConfig.ROOMS_BY_DATE[AppState.currentDate] || [];
    generateTimeSlots();

    // UI 초기화
    updateCategoryDropdowns();
    createCategoryFilters();
    createScheduleTable();
    updateLectureList();

    // 자동완성 설정
    setupSpeakerAutocomplete();
    setupCompanyAutocomplete();

    // 날짜 버튼 상태 업데이트
    document.querySelectorAll('.date-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.date === AppState.currentDate);
    });

    console.log('=== 초기화 완료 ===');
    console.log('Speakers:', AppState.speakers.length);
    console.log('Categories:', AppState.categories.length);
    console.log('Companies:', AppState.companies.length);
});

console.log('✅ app.js 로드 완료');
