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
    loadLastBackupTime();

    // 스케줄 변경 실시간 감지 (개별 항목)
    const currentDate = AppState.currentDate;
    database.ref(`/data/dataByDate/${currentDate}/schedule`).on('child_added', handleScheduleChange);
    database.ref(`/data/dataByDate/${currentDate}/schedule`).on('child_changed', handleScheduleChange);
    database.ref(`/data/dataByDate/${currentDate}/schedule`).on('child_removed', handleScheduleRemoved);

    database.ref('/data').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.dataByDate) {
                // 현재 작업 중인 날짜의 스케줄은 병합 처리
                Object.keys(data.dataByDate).forEach(date => {
                    if (!AppState.dataByDate[date]) {
                        AppState.dataByDate[date] = data.dataByDate[date];
                    } else {
                        // 강의 목록과 세션은 서버 데이터로 업데이트
                        AppState.dataByDate[date].lectures = data.dataByDate[date].lectures || [];
                        AppState.dataByDate[date].sessions = data.dataByDate[date].sessions || [];
                        // 스케줄은 서버 데이터와 병합 (서버 우선)
                        AppState.dataByDate[date].schedule = {
                            ...AppState.dataByDate[date].schedule,
                            ...data.dataByDate[date].schedule
                        };
                    }
                });
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
 * 스케줄 변경 핸들러 (다른 사용자의 변경 실시간 반영)
 */
window.handleScheduleChange = function(snapshot) {
    const key = snapshot.key;
    const lecture = snapshot.val();
    
    if (lecture && JSON.stringify(AppState.schedule[key]) !== JSON.stringify(lecture)) {
        console.log(`[실시간] 스케줄 업데이트: ${key}`);
        AppState.schedule[key] = lecture;
        updateScheduleDisplay();
    }
};

/**
 * 스케줄 삭제 핸들러
 */
window.handleScheduleRemoved = function(snapshot) {
    const key = snapshot.key;
    
    if (AppState.schedule[key]) {
        console.log(`[실시간] 스케줄 삭제: ${key}`);
        delete AppState.schedule[key];
        updateScheduleDisplay();
        updateLectureList();
    }
};

/**
 * 마지막 백업 시간 로드
 */
window.loadLastBackupTime = function() {
    database.ref('/backups').orderByChild('timestamp').limitToLast(1).once('value', (snapshot) => {
        snapshot.forEach(child => {
            const backup = child.val();
            if (backup && backup.dateStr) {
                updateBackupStatus(backup.dateStr);
            }
        });
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

    // update()를 사용하여 특정 경로만 업데이트 (전체 덮어쓰기 방지)
    const updates = {};
    updates['/data/dataByDate'] = AppState.dataByDate;
    updates['/data/speakers'] = AppState.speakers;
    updates['/data/companies'] = AppState.companies;
    updates['/data/categories'] = AppState.categories;
    updates['/data/lastModified'] = firebase.database.ServerValue.TIMESTAMP;
    updates['/data/lastModifiedBy'] = AppState.currentUser ? AppState.currentUser.email : 'unknown';

    database.ref().update(updates)
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
 * 스케줄 항목 개별 저장 (동시 작업 시 충돌 방지)
 */
window.saveScheduleItem = function(scheduleKey, lectureData) {
    if (!canEdit()) return;
    
    const currentDate = AppState.currentDate;
    const path = `/data/dataByDate/${currentDate}/schedule/${scheduleKey}`;
    
    if (lectureData) {
        // 강의 배치
        database.ref(path).set(lectureData)
            .then(() => console.log(`스케줄 저장: ${scheduleKey}`))
            .catch(err => console.error('스케줄 저장 실패:', err));
    } else {
        // 강의 삭제
        database.ref(path).remove()
            .then(() => console.log(`스케줄 삭제: ${scheduleKey}`))
            .catch(err => console.error('스케줄 삭제 실패:', err));
    }
    
    // lastModified 업데이트
    database.ref('/data/lastModified').set(firebase.database.ServerValue.TIMESTAMP);
    database.ref('/data/lastModifiedBy').set(AppState.currentUser ? AppState.currentUser.email : 'unknown');
};

/**
 * 세션 항목 개별 저장
 */
window.saveSessionsToFirebase = function() {
    if (!canEdit()) return;
    
    const currentDate = AppState.currentDate;
    database.ref(`/data/dataByDate/${currentDate}/sessions`).set(AppState.sessions)
        .then(() => console.log('세션 저장 완료'))
        .catch(err => console.error('세션 저장 실패:', err));
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
            createScheduleTable();
            updateScheduleDisplay();
            console.log('시간 설정 로드 완료:', AppState.timeSettingsByDate);
        }
    });
};

// ============================================
// 날짜 전환
// ============================================

window.switchDate = function(date) {
    const previousDate = AppState.currentDate;
    saveToFirebase();

    // 이전 날짜의 스케줄 리스너 해제
    if (previousDate) {
        database.ref(`/data/dataByDate/${previousDate}/schedule`).off();
    }

    AppState.currentDate = date;
    AppState.rooms = AppConfig.ROOMS_BY_DATE[date] || [];

    generateTimeSlots();
    loadDateData(date);
    
    // 새 날짜의 스케줄 리스너 설정
    database.ref(`/data/dataByDate/${date}/schedule`).on('child_added', handleScheduleChange);
    database.ref(`/data/dataByDate/${date}/schedule`).on('child_changed', handleScheduleChange);
    database.ref(`/data/dataByDate/${date}/schedule`).on('child_removed', handleScheduleRemoved);
    
    // 룸 담당자 로드
    if (typeof loadRoomManagers === 'function') {
        loadRoomManagers();
    }

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

window.moveRoom = function(roomIndex, direction) {
    const newIndex = direction === 'left' ? roomIndex - 1 : roomIndex + 1;
    
    // 범위 체크
    if (newIndex < 0 || newIndex >= AppState.rooms.length) return;
    
    // 룸 순서 변경
    const temp = AppState.rooms[roomIndex];
    AppState.rooms[roomIndex] = AppState.rooms[newIndex];
    AppState.rooms[newIndex] = temp;
    
    // 저장 및 UI 업데이트
    saveRoomsToStorage();
    saveAndSync();
    createScheduleTable();
    updateScheduleDisplay();
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
    const roomCount = AppState.rooms.length;
    const roomWidth = Math.max(200, Math.floor(800 / Math.min(roomCount, 4))); // 룸 폭 균등
    
    // 세션 정보를 시간-룸 키로 찾기 위한 맵
    const sessionMap = {};
    AppState.sessions.forEach(session => {
        sessionMap[`${session.time}-${session.room}`] = session;
    });
    
    // 강의 정보를 시간-룸 키로 찾기 위한 맵
    const lectureMap = {};
    Object.entries(AppState.schedule).forEach(([key, lecture]) => {
        lectureMap[key] = lecture;
    });
    
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; table-layout: fixed;">`;

    // 헤더
    html += '<thead style="position: sticky; top: 0; background: var(--primary); color: white; z-index: 10;">';
    html += `<tr><th style="padding: 0.75rem; border: 1px solid #ddd; width: 80px; min-width: 80px;">시간</th>`;
    AppState.rooms.forEach((room, idx) => {
        const shortName = room.length > 25 ? room.substring(0, 25) + '...' : room;
        html += `<th style="padding: 0.75rem; border: 1px solid #ddd; width: ${roomWidth}px; min-width: ${roomWidth}px;">
            ${shortName}
            <button onclick="openRoomScheduleModal(${idx})" style="margin-left: 0.25rem; padding: 0.15rem 0.35rem; font-size: 0.65rem; cursor: pointer; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); border-radius: 3px; color: white;">🔍</button>
        </th>`;
    });
    html += '</tr></thead>';

    html += '<tbody>';
    
    AppState.timeSlots.forEach((time) => {
        const isHourMark = time.endsWith(':00');
        
        // 이 시간대에 세션이 있는지 확인
        let hasSession = false;
        AppState.rooms.forEach(room => {
            if (sessionMap[`${time}-${room}`]) hasSession = true;
        });
        
        // 세션 행 (세션이 있는 시간대만)
        if (hasSession) {
            html += '<tr style="background: #f8f4fc;">';
            html += `<td style="padding: 0.4rem; border: 1px solid #ddd; text-align: center; font-size: 0.75rem; color: #666;"></td>`;
            
            AppState.rooms.forEach(room => {
                const session = sessionMap[`${time}-${room}`];
                if (session) {
                    html += `<td style="padding: 0.5rem; border: 1px solid #ddd; background: ${session.color || '#9B59B6'}15;">
                        <div style="font-weight: bold; color: ${session.color || '#9B59B6'}; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            📌 ${session.name}
                        </div>
                        ${session.moderator ? `<div style="font-size: 0.7rem; color: #666;">좌장: ${session.moderator}</div>` : ''}
                    </td>`;
                } else {
                    html += `<td style="border: 1px solid #ddd;"></td>`;
                }
            });
            html += '</tr>';
        }
        
        // 강의 행
        html += `<tr style="background: ${isHourMark ? '#fafafa' : 'white'};">`;
        
        // 시간 셀
        const lecture0 = lectureMap[`${time}-${AppState.rooms[0]}`];
        let endTimeDisplay = '';
        
        // 해당 시간대의 강의들 중 하나라도 있으면 종료시간 표시
        for (const room of AppState.rooms) {
            const lec = lectureMap[`${time}-${room}`];
            if (lec) {
                endTimeDisplay = calculateEndTime(time, lec.duration || 15);
                break;
            }
        }
        
        html += `<td style="padding: 0.5rem; border: 1px solid #ddd; text-align: center; vertical-align: top; font-weight: ${isHourMark ? 'bold' : 'normal'};">
            <div>${time}</div>
            ${endTimeDisplay ? `<div style="font-size: 0.7rem; color: #999;">~${endTimeDisplay}</div>` : ''}
        </td>`;

        // 각 룸별 강의 셀
        AppState.rooms.forEach(room => {
            const key = `${time}-${room}`;
            const lecture = lectureMap[key];

            if (lecture) {
                const categoryColor = AppConfig.categoryColors[lecture.category] || '#9B59B6';
                const duration = lecture.duration || 15;
                const endTime = calculateEndTime(time, duration);
                let title = lecture.titleKo || lecture.titleEn || '제목 없음';
                const speaker = lecture.speakerKo || '미정';
                const affiliation = lecture.affiliation || '';
                
                const isLunchBreak = lecture.category === 'Lunch Break';
                const isLuncheonLecture = lecture.category === 'Luncheon Lecture';
                const isBreak = lecture.isBreak || ['Coffee Break', 'Lunch Break', 'Opening/Closing'].includes(lecture.category);
                
                // Luncheon Lecture는 별표 표시
                if (isLuncheonLecture) {
                    title = `⭐ ${title}`;
                }
                
                // Lunch Break는 세션 헤더 스타일
                if (isLunchBreak) {
                    html += `<td style="padding: 0.5rem; border: 1px solid #ddd; vertical-align: top; height: 80px; background: linear-gradient(135deg, ${categoryColor}20, ${categoryColor}10);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.3rem;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: bold; font-size: 0.9rem; color: ${categoryColor};">🍽️ ${title}</div>
                                <div style="font-size: 0.7rem; color: #888;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: ${categoryColor}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.65rem; white-space: nowrap; flex-shrink: 0;">${lecture.category}</span>
                        </div>
                    </td>`;
                } else if (isLuncheonLecture) {
                    // Luncheon Lecture - 별표 + 파트너사 표시
                    const sponsorInfo = lecture.companyName ? ` (파트너사: ${lecture.companyName})` : '';
                    html += `<td style="padding: 0.5rem; border: 1px solid #ddd; vertical-align: top; height: 80px; border-left: 4px solid #FFD700;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.3rem;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: bold; font-size: 0.85rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${title}</div>
                                <div style="font-size: 0.75rem; color: #555; margin-top: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    👤 ${speaker}${sponsorInfo}
                                </div>
                                <div style="font-size: 0.7rem; color: #888;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: ${categoryColor}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.65rem; white-space: nowrap; flex-shrink: 0;">${lecture.category}</span>
                        </div>
                    </td>`;
                } else if (isBreak) {
                    // 기타 Break (Coffee Break, Opening/Closing)
                    html += `<td style="padding: 0.5rem; border: 1px solid #ddd; vertical-align: top; height: 80px; background: ${categoryColor}10;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.3rem;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: bold; font-size: 0.85rem; color: ${categoryColor};">${title}</div>
                                <div style="font-size: 0.7rem; color: #888;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: ${categoryColor}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.65rem; white-space: nowrap; flex-shrink: 0;">${lecture.category}</span>
                        </div>
                    </td>`;
                } else {
                    // 일반 강의
                    html += `<td style="padding: 0.5rem; border: 1px solid #ddd; vertical-align: top; height: 80px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.3rem;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: bold; font-size: 0.85rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${title}</div>
                                <div style="font-size: 0.75rem; color: #555; margin-top: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    👤 ${speaker}${affiliation ? ` (${affiliation})` : ''}
                                </div>
                                <div style="font-size: 0.7rem; color: #888;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: ${categoryColor}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.65rem; white-space: nowrap; flex-shrink: 0;">${lecture.category || '기타'}</span>
                        </div>
                    </td>`;
                }
            } else {
                html += `<td style="padding: 0.5rem; border: 1px solid #ddd; height: 80px;"></td>`;
            }
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
    // 세션 맵
    const sessionMap = {};
    AppState.sessions.forEach(session => {
        if (session.room === room) {
            sessionMap[session.time] = session;
        }
    });
    
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">';

    html += '<thead style="background: var(--primary); color: white;">';
    html += '<tr><th style="padding: 0.75rem; border: 1px solid #ddd; width: 80px;">시간</th>';
    html += '<th style="padding: 0.75rem; border: 1px solid #ddd;">강의 정보</th></tr></thead>';

    html += '<tbody>';

    AppState.timeSlots.forEach((time) => {
        const key = `${time}-${room}`;
        const lecture = AppState.schedule[key];
        const session = sessionMap[time];
        const isHourMark = time.endsWith(':00');

        // 세션 헤더 표시
        if (session) {
            html += `<tr style="background: ${session.color || '#9B59B6'}15;">
                <td colspan="2" style="padding: 0.5rem; border: 1px solid #ddd; font-weight: bold; color: ${session.color || '#9B59B6'};">
                    📌 ${session.name} ${session.moderator ? `(좌장: ${session.moderator})` : ''}
                </td>
            </tr>`;
        }

        // 강의 표시
        if (lecture) {
            const categoryColor = AppConfig.categoryColors[lecture.category] || '#9B59B6';
            const duration = lecture.duration || 15;
            const endTime = calculateEndTime(time, duration);
            
            const isLunchBreak = lecture.category === 'Lunch Break';
            const isLuncheonLecture = lecture.category === 'Luncheon Lecture';
            const isBreak = lecture.isBreak || ['Coffee Break', 'Lunch Break', 'Opening/Closing'].includes(lecture.category);
            
            let title = lecture.titleKo || lecture.titleEn || '제목 없음';
            
            // Lunch Break - 세션 헤더 스타일
            if (isLunchBreak) {
                html += `<tr style="background: ${categoryColor}15;">
                    <td colspan="2" style="padding: 0.75rem; border: 1px solid #ddd; font-weight: bold; color: ${categoryColor};">
                        🍽️ ${title} <span style="font-weight: normal; font-size: 0.8rem;">(${duration}분)</span>
                    </td>
                </tr>`;
            } else if (isLuncheonLecture) {
                // Luncheon Lecture - 별표 + 파트너사 표시
                const sponsorInfo = lecture.companyName ? ` (파트너사: ${lecture.companyName})` : '';
                html += `<tr style="background: ${isHourMark ? '#f9f9f9' : 'white'}; border-left: 4px solid #FFD700;">
                    <td style="padding: 0.5rem; border: 1px solid #ddd; text-align: center; font-weight: ${isHourMark ? 'bold' : 'normal'};">
                        ${time}<br><span style="font-size: 0.7rem; color: #999;">~${endTime}</span>
                    </td>
                    <td style="padding: 0.5rem; border: 1px solid #ddd;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <strong style="font-size: 0.95rem;">⭐ ${title}</strong>
                                <div style="font-size: 0.8rem; color: #666; margin-top: 0.25rem;">
                                    👤 ${lecture.speakerKo || '미정'}${sponsorInfo}
                                </div>
                                <div style="font-size: 0.75rem; color: #999;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: ${categoryColor}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; margin-left: 0.5rem;">${lecture.category}</span>
                        </div>
                    </td>
                </tr>`;
            } else if (isBreak) {
                // 기타 Break
                html += `<tr style="background: ${categoryColor}10;">
                    <td style="padding: 0.5rem; border: 1px solid #ddd; text-align: center; font-weight: ${isHourMark ? 'bold' : 'normal'};">
                        ${time}<br><span style="font-size: 0.7rem; color: #999;">~${endTime}</span>
                    </td>
                    <td style="padding: 0.5rem; border: 1px solid #ddd;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <strong style="font-size: 0.95rem; color: ${categoryColor};">${title}</strong>
                                <div style="font-size: 0.75rem; color: #999;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: ${categoryColor}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; margin-left: 0.5rem;">${lecture.category}</span>
                        </div>
                    </td>
                </tr>`;
            } else {
                // 일반 강의
                html += `<tr style="background: ${isHourMark ? '#f9f9f9' : 'white'};">
                    <td style="padding: 0.5rem; border: 1px solid #ddd; text-align: center; font-weight: ${isHourMark ? 'bold' : 'normal'};">
                        ${time}<br><span style="font-size: 0.7rem; color: #999;">~${endTime}</span>
                    </td>
                    <td style="padding: 0.5rem; border: 1px solid #ddd;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <strong style="font-size: 0.95rem;">${title}</strong>
                                <div style="font-size: 0.8rem; color: #666; margin-top: 0.25rem;">
                                    👤 ${lecture.speakerKo || '미정'} ${lecture.affiliation ? `(${lecture.affiliation})` : ''}
                                </div>
                                <div style="font-size: 0.75rem; color: #999;">⏱️ ${duration}분</div>
                            </div>
                            <span style="background: ${categoryColor}; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; margin-left: 0.5rem;">${lecture.category}</span>
                        </div>
                    </td>
                </tr>`;
            }
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
// 인쇄 모달 관련
// ============================================

window.toggleExportDropdown = function() {
    const dropdown = document.getElementById('exportDropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    
    // 다른 곳 클릭하면 닫기
    setTimeout(() => {
        document.addEventListener('click', closeExportDropdown);
    }, 10);
};

function closeExportDropdown(e) {
    const dropdown = document.getElementById('exportDropdown');
    if (!e.target.closest('.dropdown')) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeExportDropdown);
    }
}

window.openPrintModal = function() {
    document.getElementById('exportDropdown').style.display = 'none';
    
    const container = document.getElementById('printRoomCheckboxes');
    container.innerHTML = '';
    
    // 전체 선택 체크박스
    const allLabel = document.createElement('label');
    allLabel.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #f5f5f5; border-radius: 6px; cursor: pointer;';
    allLabel.innerHTML = `
        <input type="checkbox" id="printAllRooms" checked onchange="toggleAllPrintRooms(this.checked)">
        <strong>전체 룸 선택</strong>
    `;
    container.appendChild(allLabel);
    
    // 각 룸별 체크박스
    AppState.rooms.forEach((room, index) => {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; cursor: pointer;';
        label.innerHTML = `
            <input type="checkbox" class="print-room-checkbox" value="${index}" checked>
            ${room}
        `;
        container.appendChild(label);
    });
    
    document.getElementById('printModal').classList.add('active');
};

window.closePrintModal = function() {
    document.getElementById('printModal').classList.remove('active');
};

window.toggleAllPrintRooms = function(checked) {
    document.querySelectorAll('.print-room-checkbox').forEach(cb => {
        cb.checked = checked;
    });
};

window.executePrint = function() {
    const selectedRooms = [];
    document.querySelectorAll('.print-room-checkbox:checked').forEach(cb => {
        selectedRooms.push(parseInt(cb.value));
    });
    
    if (selectedRooms.length === 0) {
        alert('출력할 룸을 선택해주세요.');
        return;
    }
    
    closePrintModal();
    
    // 선택된 룸들의 시간표를 생성하여 인쇄
    printSelectedRooms(selectedRooms);
};

window.printSelectedRooms = function(roomIndices) {
    // 룸별 상세 보기 포맷으로 인쇄용 HTML 생성
    let printContent = `
        <html>
        <head>
            <title>${AppState.currentDate} 시간표</title>
            <style>
                @page { margin: 1cm; }
                body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; }
                .room-section { page-break-after: always; margin-bottom: 2rem; }
                .room-section:last-child { page-break-after: avoid; }
                .room-title { font-size: 16pt; font-weight: bold; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
                th { background: #663399; color: white; }
                .session-row { background: #f0e6ff; font-weight: bold; }
                .session-row td { border-left: 4px solid #663399; }
                .time-cell { width: 80px; text-align: center; font-weight: 500; }
                .category-badge { display: inline-block; background: #9c27b0; color: white; padding: 2px 8px; border-radius: 12px; font-size: 9pt; float: right; }
                .lecture-title { font-weight: 600; margin-bottom: 4px; }
                .lecture-meta { font-size: 10pt; color: #666; }
                .coffee-break { background: #fff3e0; }
                .lunch-break { background: #ffebee; }
            </style>
        </head>
        <body>
    `;
    
    roomIndices.forEach((roomIndex, idx) => {
        const room = AppState.rooms[roomIndex];
        printContent += generateRoomPrintContent(room, roomIndex);
    });
    
    printContent += '</body></html>';
    
    // 새 창에서 인쇄
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
    }, 500);
};

function generateRoomPrintContent(room, roomIndex) {
    const dateLabel = AppState.currentDate === '2026-04-11' ? '토요일' : '일요일';
    
    let html = `
        <div class="room-section">
            <div class="room-title">🏠 (${dateLabel})${room}</div>
            <table>
                <thead>
                    <tr>
                        <th class="time-cell">시간</th>
                        <th>강의 정보</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // 해당 룸의 세션들
    const roomSessions = AppState.sessions
        .filter(s => s.room === room)
        .sort((a, b) => a.time.localeCompare(b.time));
    
    // 해당 룸의 강의들
    const roomLectures = Object.entries(AppState.schedule)
        .filter(([key, lecture]) => key.substring(6) === room)
        .map(([key, lecture]) => ({
            time: key.substring(0, 5),
            ...lecture
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    
    // 시간순 정렬하여 출력
    const allItems = [];
    
    roomSessions.forEach(session => {
        allItems.push({ type: 'session', time: session.time, data: session });
    });
    
    roomLectures.forEach(lecture => {
        allItems.push({ type: 'lecture', time: lecture.time, data: lecture });
    });
    
    allItems.sort((a, b) => a.time.localeCompare(b.time));
    
    allItems.forEach(item => {
        if (item.type === 'session') {
            const session = item.data;
            const sessionName = session.name || '';
            const moderator = session.moderator ? `좌장: ${session.moderator}` : '';
            html += `
                <tr class="session-row">
                    <td class="time-cell"></td>
                    <td>📌 ${sessionName} ${moderator ? `<span style="font-weight:normal; font-size:10pt;">(${moderator})</span>` : ''}</td>
                </tr>
            `;
        } else {
            const lecture = item.data;
            const duration = lecture.duration || 15;
            const endTime = addMinutesToTime(item.time, duration);
            const category = lecture.category || '';
            const title = lecture.titleKo || '';
            const speaker = lecture.speakerKo || '미정';
            const affiliation = lecture.affiliation || '';
            
            const isBreak = lecture.isBreak || (AppConfig.BREAK_TYPES || []).includes(category);
            const rowClass = category === 'Coffee Break' ? 'coffee-break' : (category === 'Lunch' ? 'lunch-break' : '');
            
            const categoryColor = AppConfig.categoryColors[category] || '#9c27b0';
            
            html += `
                <tr class="${rowClass}">
                    <td class="time-cell">${item.time}<br><span style="font-size:9pt;color:#999;">~${endTime}</span></td>
                    <td>
                        <span class="category-badge" style="background:${categoryColor};">${category}</span>
                        <div class="lecture-title">${title}</div>
                        <div class="lecture-meta">👤 ${speaker}${affiliation ? ` (${affiliation})` : ''} | ⏱️ ${duration}분</div>
                    </td>
                </tr>
            `;
        }
    });
    
    html += '</tbody></table></div>';
    return html;
}

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

    // 자동 백업 시작 (5분마다)
    startAutoBackup();

    console.log('=== 초기화 완료 ===');
    console.log('Speakers:', AppState.speakers.length);
    console.log('Categories:', AppState.categories.length);
    console.log('Companies:', AppState.companies.length);
});

// ============================================
// 자동 백업 시스템 (매일 저녁 1회)
// ============================================

let dailyBackupTimeout = null;
const MAX_BACKUPS = 10; // 최대 백업 개수
const BACKUP_ENCRYPTION_KEY = 'ASLS-Conference-2026-Secure'; // 암호화 키

/**
 * 매일 저녁 자동 백업 스케줄 시작
 */
window.startAutoBackup = function() {
    scheduleDailyBackup();
    console.log('⏰ 매일 저녁 자동 백업 스케줄 시작');
};

/**
 * 다음 백업 시간까지 타이머 설정 (저녁 9시)
 */
function scheduleDailyBackup() {
    if (dailyBackupTimeout) {
        clearTimeout(dailyBackupTimeout);
    }
    
    const now = new Date();
    const backupTime = new Date();
    backupTime.setHours(21, 0, 0, 0); // 저녁 9시
    
    // 이미 오늘 9시가 지났으면 내일로
    if (now > backupTime) {
        backupTime.setDate(backupTime.getDate() + 1);
    }
    
    const msUntilBackup = backupTime - now;
    
    dailyBackupTimeout = setTimeout(() => {
        if (canEdit()) {
            createAutoBackup();
        }
        // 다음 날 백업 스케줄
        scheduleDailyBackup();
    }, msUntilBackup);
    
    console.log(`📅 다음 자동 백업: ${backupTime.toLocaleString('ko-KR')}`);
}

/**
 * 자동 백업 생성
 */
window.createAutoBackup = function() {
    createBackup('auto');
};

/**
 * 수동 백업 생성
 */
window.createManualBackup = function() {
    createBackup('manual');
    alert('✅ 백업이 생성되었습니다.');
};

/**
 * 백업 생성
 */
window.createBackup = function(type = 'manual') {
    if (!canEdit()) {
        console.log('백업 권한 없음');
        return;
    }
    
    const timestamp = Date.now();
    const dateStr = new Date(timestamp).toLocaleString('ko-KR');
    
    const backupData = {
        timestamp: timestamp,
        dateStr: dateStr,
        type: type,
        createdBy: AppState.currentUser ? AppState.currentUser.email : 'unknown',
        data: {
            dataByDate: AppState.dataByDate,
            speakers: AppState.speakers,
            companies: AppState.companies,
            categories: AppState.categories,
            timeSettingsByDate: AppState.timeSettingsByDate,
            eventDates: AppState.eventDates || []
        }
    };
    
    // Firebase에 백업 저장
    database.ref(`/backups/${timestamp}`).set(backupData)
        .then(() => {
            console.log(`💾 백업 생성: ${dateStr} (${type})`);
            updateBackupStatus(dateStr);
            cleanupOldBackups();
        })
        .catch(err => console.error('백업 실패:', err));
};

/**
 * 오래된 백업 정리 (최대 10개 유지)
 */
window.cleanupOldBackups = function() {
    database.ref('/backups').orderByChild('timestamp').once('value', (snapshot) => {
        const backups = [];
        snapshot.forEach(child => {
            backups.push({ key: child.key, ...child.val() });
        });
        
        // 오래된 순으로 정렬
        backups.sort((a, b) => a.timestamp - b.timestamp);
        
        // MAX_BACKUPS(10개) 초과 시 오래된 것 삭제
        while (backups.length > MAX_BACKUPS) {
            const oldBackup = backups.shift();
            database.ref(`/backups/${oldBackup.key}`).remove();
            console.log(`🗑️ 오래된 백업 삭제: ${oldBackup.dateStr}`);
        }
    });
};

/**
 * 백업 파일 암호화 다운로드
 */
window.downloadEncryptedBackup = function(backupKey) {
    database.ref(`/backups/${backupKey}`).once('value', (snapshot) => {
        const backup = snapshot.val();
        if (!backup) {
            alert('백업 데이터를 찾을 수 없습니다.');
            return;
        }
        
        const jsonStr = JSON.stringify(backup.data);
        const encryptCheckbox = document.getElementById('encryptBackup');
        
        let downloadData;
        let filename;
        
        if (encryptCheckbox && encryptCheckbox.checked && typeof CryptoJS !== 'undefined') {
            // AES 암호화
            const encrypted = CryptoJS.AES.encrypt(jsonStr, BACKUP_ENCRYPTION_KEY).toString();
            downloadData = JSON.stringify({
                encrypted: true,
                data: encrypted,
                timestamp: backup.timestamp,
                dateStr: backup.dateStr
            });
            filename = `conference_backup_encrypted_${backup.timestamp}.json`;
            console.log('🔒 암호화된 백업 다운로드');
        } else {
            // 일반 다운로드
            downloadData = JSON.stringify(backup, null, 2);
            filename = `conference_backup_${backup.timestamp}.json`;
        }
        
        const blob = new Blob([downloadData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('✅ 백업 파일이 다운로드되었습니다.');
    });
};

/**
 * 암호화된 백업 파일 복원
 */
window.uploadAndRestoreBackup = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                let restoreData;
                
                if (data.encrypted && typeof CryptoJS !== 'undefined') {
                    // 암호화된 백업 복호화
                    const password = prompt('🔐 백업 파일이 암호화되어 있습니다.\n복호화 키를 입력하세요:');
                    if (!password) return;
                    
                    try {
                        const decrypted = CryptoJS.AES.decrypt(data.data, password);
                        const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
                        
                        if (!decryptedStr) {
                            alert('❌ 복호화 실패: 잘못된 키입니다.');
                            return;
                        }
                        
                        restoreData = JSON.parse(decryptedStr);
                    } catch (err) {
                        alert('❌ 복호화 실패: ' + err.message);
                        return;
                    }
                } else if (data.data) {
                    // 일반 백업 파일
                    restoreData = data.data;
                } else {
                    // 직접 데이터
                    restoreData = data;
                }
                
                if (!confirm('⚠️ 현재 데이터를 백업 파일로 덮어씁니다.\n계속하시겠습니까?')) {
                    return;
                }
                
                // 복원 전 현재 상태 백업
                createBackup('before-file-restore');
                
                // 데이터 복원
                if (restoreData.dataByDate) AppState.dataByDate = restoreData.dataByDate;
                if (restoreData.speakers) AppState.speakers = restoreData.speakers;
                if (restoreData.companies) AppState.companies = restoreData.companies;
                if (restoreData.categories) AppState.categories = restoreData.categories;
                if (restoreData.timeSettingsByDate) AppState.timeSettingsByDate = restoreData.timeSettingsByDate;
                if (restoreData.eventDates) AppState.eventDates = restoreData.eventDates;
                
                loadDateData(AppState.currentDate);
                generateTimeSlots();
                saveToFirebase();
                
                createScheduleTable();
                updateLectureList();
                updateCategoryDropdowns();
                
                closeBackupModal();
                alert('✅ 백업 파일에서 복원되었습니다.');
                
            } catch (err) {
                alert('❌ 파일 읽기 실패: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
};

/**
 * 백업 상태 UI 업데이트
 */
window.updateBackupStatus = function(dateStr) {
    const statusEl = document.getElementById('lastBackupTime');
    if (statusEl) {
        statusEl.textContent = dateStr;
    }
};

/**
 * 백업 목록 모달 열기
 */
window.openBackupModal = function() {
    const modal = document.getElementById('backupModal');
    const list = document.getElementById('backupList');
    
    list.innerHTML = '<p style="text-align: center; padding: 2rem;">백업 목록 로딩 중...</p>';
    modal.classList.add('active');
    
    // Firebase에서 백업 목록 로드
    database.ref('/backups').orderByChild('timestamp').once('value', (snapshot) => {
        const backups = [];
        snapshot.forEach(child => {
            backups.push({ key: child.key, ...child.val() });
        });
        
        // 최신순 정렬
        backups.sort((a, b) => b.timestamp - a.timestamp);
        
        if (backups.length === 0) {
            list.innerHTML = '<p style="text-align: center; padding: 2rem; color: #999;">백업이 없습니다.</p>';
            return;
        }
        
        let html = `
            <div style="padding: 0.5rem; background: #f0f0f0; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; color: #666;">총 ${backups.length}개 백업</span>
                <button class="btn btn-secondary btn-small" onclick="uploadAndRestoreBackup()">📁 파일에서 복원</button>
            </div>
        `;
        
        html += backups.map((backup, idx) => {
            const typeLabel = backup.type === 'auto' ? '🔄 자동' : '💾 수동';
            const isLatest = idx === 0;
            
            return `
                <div class="backup-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid #eee; ${isLatest ? 'background: #f0fff0;' : ''}">
                    <div>
                        <div style="font-weight: ${isLatest ? 'bold' : 'normal'};">
                            ${backup.dateStr} ${isLatest ? '(최신)' : ''}
                        </div>
                        <div style="font-size: 0.8rem; color: #666;">
                            ${typeLabel} · ${backup.createdBy || '알 수 없음'}
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.25rem;">
                        <button class="btn btn-secondary btn-small" onclick="downloadEncryptedBackup('${backup.key}')" title="다운로드">📥</button>
                        <button class="btn btn-secondary btn-small" onclick="previewBackup('${backup.key}')" title="미리보기">👁️</button>
                        <button class="btn btn-primary btn-small" onclick="restoreBackup('${backup.key}')" title="복원">복원</button>
                    </div>
                </div>
            `;
        }).join('');
        
        list.innerHTML = html;
    });
};

/**
 * 백업 모달 닫기
 */
window.closeBackupModal = function() {
    document.getElementById('backupModal').classList.remove('active');
};

/**
 * 백업 미리보기
 */
window.previewBackup = function(backupKey) {
    database.ref(`/backups/${backupKey}`).once('value', (snapshot) => {
        const backup = snapshot.val();
        if (!backup || !backup.data) {
            alert('백업 데이터를 불러올 수 없습니다.');
            return;
        }
        
        const data = backup.data;
        let summary = `📅 백업 시점: ${backup.dateStr}\n`;
        summary += `👤 생성자: ${backup.createdBy || '알 수 없음'}\n\n`;
        
        // 각 날짜별 데이터 요약
        if (data.dataByDate) {
            Object.keys(data.dataByDate).forEach(date => {
                const dateData = data.dataByDate[date];
                const lectureCount = dateData.lectures ? dateData.lectures.length : 0;
                const scheduleCount = dateData.schedule ? Object.keys(dateData.schedule).length : 0;
                const sessionCount = dateData.sessions ? dateData.sessions.length : 0;
                summary += `[${date}]\n`;
                summary += `  - 강의: ${lectureCount}개\n`;
                summary += `  - 배치됨: ${scheduleCount}개\n`;
                summary += `  - 세션: ${sessionCount}개\n`;
            });
        }
        
        summary += `\n연자: ${data.speakers ? data.speakers.length : 0}명`;
        summary += `\n카테고리: ${data.categories ? data.categories.length : 0}개`;
        
        alert(summary);
    });
};

/**
 * 백업 복원
 */
window.restoreBackup = function(backupKey) {
    if (!canEdit()) {
        alert('편집 권한이 없습니다.');
        return;
    }
    
    if (!confirm('⚠️ 현재 데이터가 백업 시점으로 덮어씌워집니다.\n복원 전 현재 상태를 수동 백업하시겠습니까?')) {
        return;
    }
    
    // 복원 전 현재 상태 백업
    createBackup('before-restore');
    
    database.ref(`/backups/${backupKey}`).once('value', (snapshot) => {
        const backup = snapshot.val();
        if (!backup || !backup.data) {
            alert('백업 데이터를 불러올 수 없습니다.');
            return;
        }
        
        const data = backup.data;
        
        // 데이터 복원
        if (data.dataByDate) AppState.dataByDate = data.dataByDate;
        if (data.speakers) AppState.speakers = data.speakers;
        if (data.companies) AppState.companies = data.companies;
        if (data.categories) AppState.categories = data.categories;
        if (data.timeSettingsByDate) AppState.timeSettingsByDate = data.timeSettingsByDate;
        
        // 현재 날짜 데이터 로드
        loadDateData(AppState.currentDate);
        generateTimeSlots();
        
        // Firebase에 복원된 데이터 저장
        saveToFirebase();
        if (data.timeSettingsByDate) {
            saveTimeSettingsToFirebase();
        }
        
        // UI 업데이트
        createScheduleTable();
        updateLectureList();
        updateCategoryDropdowns();
        createCategoryFilters();
        
        closeBackupModal();
        alert(`✅ ${backup.dateStr} 시점으로 복원되었습니다.`);
    });
};

// ============================================
// 사이드바 토글 기능 (요청사항 #10)
// ============================================

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const toggleIcon = document.getElementById('sidebarToggleIcon');
    
    sidebar.classList.toggle('collapsed');
    
    if (sidebar.classList.contains('collapsed')) {
        toggleIcon.textContent = '▶';
        toggleBtn.style.left = '10px';
        localStorage.setItem('sidebarCollapsed', 'true');
    } else {
        toggleIcon.textContent = '◀';
        toggleBtn.style.left = '395px';
        localStorage.setItem('sidebarCollapsed', 'false');
    }
};

// 사이드바 상태 복원
window.restoreSidebarState = function() {
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const toggleIcon = document.getElementById('sidebarToggleIcon');
    
    if (collapsed && sidebar) {
        sidebar.classList.add('collapsed');
        if (toggleIcon) toggleIcon.textContent = '▶';
        if (toggleBtn) toggleBtn.style.left = '10px';
    } else {
        if (toggleBtn) toggleBtn.style.left = '395px';
    }
};

// ============================================
// 행사 날짜 관리 (요청사항 #7)
// ============================================

// 기본 행사 날짜
if (!AppState.eventDates) {
    AppState.eventDates = [
        { date: '2026-04-11', label: 'ASLS춘계 토요일', day: 'sat' },
        { date: '2026-04-12', label: 'ASLS춘계 일요일', day: 'sun' }
    ];
}

/**
 * 행사 날짜 모달 열기
 */
window.openEventDateModal = function() {
    loadEventDatesFromFirebase();
    document.getElementById('eventDateModal').classList.add('active');
    renderEventDateList();
};

/**
 * 행사 날짜 모달 닫기
 */
window.closeEventDateModal = function() {
    document.getElementById('eventDateModal').classList.remove('active');
};

/**
 * 행사 날짜 목록 렌더링
 */
window.renderEventDateList = function() {
    const list = document.getElementById('eventDateList');
    
    if (!AppState.eventDates || AppState.eventDates.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #999; padding: 1rem;">등록된 행사 날짜가 없습니다.</p>';
        return;
    }
    
    list.innerHTML = AppState.eventDates.map((event, idx) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid #eee; ${idx % 2 === 0 ? 'background: #fafafa;' : ''}">
            <div>
                <strong>${event.label}</strong>
                <span style="color: #666; font-size: 0.85rem; margin-left: 0.5rem;">(${event.date})</span>
                ${event.featured ? '<span style="color: #FFD700; margin-left: 0.5rem;">⭐</span>' : ''}
            </div>
            <div style="display: flex; gap: 0.25rem;">
                <button class="btn btn-small btn-secondary" onclick="toggleEventDateStar('${event.date}')" title="별표 토글">⭐</button>
                <button class="btn btn-small btn-secondary" onclick="editEventDate('${event.date}')" title="수정">✏️</button>
                <button class="btn btn-small btn-secondary" onclick="deleteEventDate('${event.date}')" style="color: #e74c3c;" title="삭제">🗑️</button>
            </div>
        </div>
    `).join('');
    
    // 날짜 선택 버튼도 업데이트
    updateDateSelectorButtons();
};

/**
 * 행사 날짜 추가
 */
window.addEventDate = function() {
    const dateInput = document.getElementById('newEventDate');
    const labelInput = document.getElementById('newEventLabel');
    
    const date = dateInput.value;
    const label = labelInput.value.trim();
    
    if (!date) {
        alert('날짜를 선택해주세요.');
        return;
    }
    
    if (!label) {
        alert('행사명을 입력해주세요.');
        return;
    }
    
    // 중복 체크
    if (AppState.eventDates.some(e => e.date === date)) {
        alert('이미 등록된 날짜입니다.');
        return;
    }
    
    // 요일 계산
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayOfWeek = dayNames[new Date(date).getDay()];
    
    AppState.eventDates.push({ date, label, day: dayOfWeek });
    AppState.eventDates.sort((a, b) => a.date.localeCompare(b.date));
    
    // 새 날짜에 대한 데이터 구조 초기화
    if (!AppState.dataByDate[date]) {
        AppState.dataByDate[date] = { lectures: [], schedule: {}, sessions: [] };
    }
    
    // 새 날짜에 대한 시간 설정 초기화
    if (!AppState.timeSettingsByDate[date]) {
        AppState.timeSettingsByDate[date] = { startTime: '09:00', endTime: '18:00' };
    }
    
    // 새 날짜에 대한 룸 설정 초기화
    if (!AppConfig.ROOMS_BY_DATE[date]) {
        AppConfig.ROOMS_BY_DATE[date] = [`(${label})룸1`, `(${label})룸2`];
    }
    
    saveEventDatesToFirebase();
    saveAndSync();
    
    dateInput.value = '';
    labelInput.value = '';
    
    renderEventDateList();
    alert(`✅ "${label}" 행사 날짜가 추가되었습니다.`);
};

/**
 * 행사 날짜 삭제
 */
window.deleteEventDate = function(date) {
    const event = AppState.eventDates.find(e => e.date === date);
    if (!event) return;
    
    if (AppState.eventDates.length <= 1) {
        alert('최소 1개의 행사 날짜는 유지해야 합니다.');
        return;
    }
    
    if (!confirm(`⚠️ "${event.label}" (${date}) 행사를 삭제하시겠습니까?\n\n해당 날짜의 모든 강의, 세션, 시간표가 삭제됩니다.`)) {
        return;
    }
    
    AppState.eventDates = AppState.eventDates.filter(e => e.date !== date);
    delete AppState.dataByDate[date];
    delete AppState.timeSettingsByDate[date];
    delete AppConfig.ROOMS_BY_DATE[date];
    
    // 현재 선택된 날짜가 삭제된 경우 첫 번째 날짜로 변경
    if (AppState.currentDate === date) {
        AppState.currentDate = AppState.eventDates[0].date;
        switchDate(AppState.currentDate);
    }
    
    saveEventDatesToFirebase();
    saveAndSync();
    renderEventDateList();
};

/**
 * 행사 날짜 수정
 */
window.editEventDate = function(date) {
    const event = AppState.eventDates.find(e => e.date === date);
    if (!event) return;
    
    const newLabel = prompt('행사명 수정:', event.label);
    if (newLabel && newLabel.trim() !== event.label) {
        event.label = newLabel.trim();
        saveEventDatesToFirebase();
        renderEventDateList();
    }
};

/**
 * 행사 날짜 별표 토글
 */
window.toggleEventDateStar = function(date) {
    const event = AppState.eventDates.find(e => e.date === date);
    if (!event) return;
    
    event.featured = !event.featured;
    saveEventDatesToFirebase();
    renderEventDateList();
};

/**
 * 날짜 선택 버튼 업데이트
 */
window.updateDateSelectorButtons = function() {
    const container = document.getElementById('dateSelectorBtns');
    if (!container) return;
    
    container.innerHTML = AppState.eventDates.map(event => {
        const isActive = event.date === AppState.currentDate;
        return `
            <button class="date-btn ${isActive ? 'active' : ''}" data-date="${event.date}" onclick="switchDate('${event.date}')">
                ${event.featured ? '⭐ ' : '📅 '}${event.label}
            </button>
        `;
    }).join('');
};

/**
 * Firebase에서 행사 날짜 로드
 */
window.loadEventDatesFromFirebase = function() {
    database.ref('/settings/eventDates').once('value', (snapshot) => {
        if (snapshot.exists()) {
            AppState.eventDates = snapshot.val();
            updateDateSelectorButtons();
        }
    });
    
    database.ref('/settings/roomsByDate').once('value', (snapshot) => {
        if (snapshot.exists()) {
            AppConfig.ROOMS_BY_DATE = snapshot.val();
        }
    });
};

/**
 * Firebase에 행사 날짜 저장
 */
window.saveEventDatesToFirebase = function() {
    if (!canEdit()) return;
    
    database.ref('/settings/eventDates').set(AppState.eventDates);
    database.ref('/settings/roomsByDate').set(AppConfig.ROOMS_BY_DATE);
};

// ============================================
// 초기화 시 사이드바 상태 복원
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    restoreSidebarState();
    loadEventDatesFromFirebase();
    
    // 날짜 버튼 초기 렌더링
    setTimeout(() => {
        updateDateSelectorButtons();
    }, 500);
});

console.log('✅ app.js 로드 완료');
