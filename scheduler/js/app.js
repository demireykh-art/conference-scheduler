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
};

window.closeFullScheduleModal = function() {
    document.getElementById('fullScheduleModal').classList.remove('active');
};

window.generateFullScheduleHTML = function() {
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">';

    html += '<thead style="position: sticky; top: 0; background: var(--primary); color: white;">';
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
    AppState.timeSlots.forEach(time => {
        const isHourMark = time.endsWith(':00');
        html += `<tr style="background: ${isHourMark ? '#f5f5f5' : 'white'};">`;
        html += `<td style="padding: 0.4rem; border: 1px solid #ddd; font-weight: ${isHourMark ? 'bold' : 'normal'}; text-align: center;">${time}</td>`;

        AppState.rooms.forEach(room => {
            const key = `${time}-${room}`;
            const lecture = AppState.schedule[key];
            const session = AppState.sessions.find(s => s.time === time && s.room === room);

            let cellContent = '';
            let cellStyle = 'padding: 0.3rem; border: 1px solid #ddd; vertical-align: top;';

            if (session) {
                cellStyle += `background: ${session.color || '#9B59B6'}20;`;
                cellContent += `<div style="font-size: 0.65rem; color: ${session.color || '#9B59B6'}; font-weight: bold;">📌 ${session.name}</div>`;
            }

            if (lecture) {
                const color = AppConfig.categoryColors[lecture.category] || '#9B59B6';
                cellContent += `<div style="background: ${color}; color: white; padding: 0.2rem 0.3rem; border-radius: 4px; font-size: 0.7rem; margin-top: ${session ? '0.2rem' : '0'};">
                    <strong>${(lecture.titleKo || '').substring(0, 30)}${(lecture.titleKo || '').length > 30 ? '...' : ''}</strong>
                    <div style="font-size: 0.6rem; opacity: 0.9;">${lecture.speakerKo || '미정'} · ${lecture.duration || 15}분</div>
                </div>`;
            }

            html += `<td style="${cellStyle}">${cellContent}</td>`;
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
};

window.closeRoomScheduleModal = function() {
    document.getElementById('roomScheduleModal').classList.remove('active');
};

window.generateRoomScheduleHTML = function(room) {
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">';

    html += '<thead style="background: var(--primary); color: white;">';
    html += '<tr><th style="padding: 0.75rem; border: 1px solid #ddd; width: 80px;">시간</th>';
    html += '<th style="padding: 0.75rem; border: 1px solid #ddd;">강의 정보</th></tr></thead>';

    html += '<tbody>';

    AppState.timeSlots.forEach(time => {
        const key = `${time}-${room}`;
        const lecture = AppState.schedule[key];
        const session = AppState.sessions.find(s => s.time === time && s.room === room);
        const isHourMark = time.endsWith(':00');

        if (session) {
            html += `<tr style="background: ${session.color || '#9B59B6'}15;">
                <td colspan="2" style="padding: 0.5rem; border: 1px solid #ddd; font-weight: bold; color: ${session.color || '#9B59B6'};">
                    📌 ${session.name} ${session.moderator ? `(좌장: ${session.moderator})` : ''}
                </td>
            </tr>`;
        }

        if (lecture) {
            const color = AppConfig.categoryColors[lecture.category] || '#9B59B6';
            const endTime = calculateEndTime(time, lecture.duration || 15);

            html += `<tr style="background: ${isHourMark ? '#f9f9f9' : 'white'};">
                <td style="padding: 0.5rem; border: 1px solid #ddd; text-align: center; font-weight: ${isHourMark ? 'bold' : 'normal'};">
                    ${time}<br><span style="font-size: 0.7rem; color: #999;">~${endTime}</span>
                </td>
                <td style="padding: 0.5rem; border: 1px solid #ddd;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <strong style="font-size: 0.95rem;">${lecture.titleKo || lecture.titleEn || '제목 없음'}</strong>
                            <div style="font-size: 0.8rem; color: #666; margin-top: 0.25rem;">
                                👤 ${lecture.speakerKo || '미정'} ${lecture.affiliation ? `(${lecture.affiliation})` : ''}
                            </div>
                            <div style="font-size: 0.75rem; color: #999;">⏱️ ${lecture.duration || 15}분</div>
                        </div>
                        <span style="background: ${color}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; margin-left: 0.5rem;">${lecture.category}</span>
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
