/**
 * sessions.js - 세션 CRUD 및 관리
 */

/**
 * 세션 관리 모달 열기
 */
window.openSessionModal = function() {
    updateSessionListInModal();
    document.getElementById('sessionModal').classList.add('active');
};

/**
 * 세션 관리 모달 닫기
 */
window.closeSessionModal = function() {
    document.getElementById('sessionModal').classList.remove('active');
};

/**
 * 셀 클릭시 세션 추가/수정 모달 열기
 */
window.openCellSessionModal = function(time, room) {
    const existingSession = AppState.sessions.find(s => s.time === time && s.room === room);

    document.getElementById('cellSessionModalTitle').textContent = existingSession ? '📋 세션/런치 수정' : '📋 세션/런치 추가';

    document.getElementById('cellSessionTime').value = time;
    document.getElementById('cellSessionRoom').value = room;
    document.getElementById('cellSessionId').value = existingSession ? existingSession.id : '';
    document.getElementById('cellSessionName').value = existingSession ? existingSession.name : '';
    document.getElementById('cellSessionNameEn').value = existingSession ? existingSession.nameEn : '';
    document.getElementById('cellSessionModerator').value = existingSession ? existingSession.moderator : '';
    document.getElementById('cellSessionModeratorEn').value = existingSession ? existingSession.moderatorEn : '';
    
    // 세션 시간 초기화
    const durationSelect = document.getElementById('cellSessionDuration');
    if (durationSelect) {
        durationSelect.value = existingSession && existingSession.duration ? existingSession.duration : '0';
    }

    // 색상 선택
    const colors = ['#3498DB', '#E74C3C', '#2ECC71', '#9B59B6', '#F39C12', '#1ABC9C', '#E91E63', '#5D4037'];
    const defaultColor = existingSession ? existingSession.color : colors[AppState.sessions.length % colors.length];
    document.getElementById('cellSessionColor').value = defaultColor;

    // 색상 버튼 상태 업데이트
    document.querySelectorAll('#sessionColorPicker .color-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === defaultColor);
    });

    // 좌장 추천 목록 채우기
    const datalist = document.getElementById('moderatorSuggestions');
    datalist.innerHTML = AppState.speakers.map(s => `<option value="${s.name}">`).join('');

    document.getElementById('cellSessionModal').classList.add('active');
    document.getElementById('cellSessionName').focus();
};

/**
 * 런치 세션 빠른 입력
 */
window.fillLunchSession = function() {
    document.getElementById('cellSessionName').value = 'Lunch';
    document.getElementById('cellSessionNameEn').value = 'Lunch';
    document.getElementById('cellSessionModerator').value = '';
    document.getElementById('cellSessionModeratorEn').value = '';
    document.getElementById('cellSessionColor').value = '#5D4037';
    
    // 세션 시간 60분으로 설정
    const durationSelect = document.getElementById('cellSessionDuration');
    if (durationSelect) {
        durationSelect.value = '60';
    }
    
    // 색상 버튼 상태 업데이트
    document.querySelectorAll('#sessionColorPicker .color-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === '#5D4037');
    });
};

/**
 * 세션 모달 닫기
 */
window.closeCellSessionModal = function() {
    document.getElementById('cellSessionModal').classList.remove('active');
};

/**
 * 세션 저장
 */
window.saveCellSession = function() {
    const time = document.getElementById('cellSessionTime').value;
    const room = document.getElementById('cellSessionRoom').value;
    const sessionId = document.getElementById('cellSessionId').value;
    const name = document.getElementById('cellSessionName').value.trim();
    const nameEn = document.getElementById('cellSessionNameEn').value.trim();
    const moderator = document.getElementById('cellSessionModerator').value.trim();
    const moderatorEn = document.getElementById('cellSessionModeratorEn').value.trim();
    const color = document.getElementById('cellSessionColor').value;
    const durationSelect = document.getElementById('cellSessionDuration');
    const duration = durationSelect ? parseInt(durationSelect.value) || 0 : 0;

    if (!name) {
        alert('세션명을 입력해주세요.');
        document.getElementById('cellSessionName').focus();
        return;
    }

    // 좌장 충돌 체크 - 좌장이 해당 시간에 다른 룸에서 강의가 있는지 확인
    if (moderator) {
        const moderatorConflict = checkModeratorHasLecture(moderator, time, room, duration);
        if (moderatorConflict.hasConflict) {
            const proceed = confirm(
                `⚠️ 좌장 시간 충돌!\n\n` +
                `좌장: ${moderator}\n\n` +
                `이 좌장은 다른 룸에서 강의가 배치되어 있습니다.\n\n` +
                `📋 강의 정보:\n` +
                `제목: "${moderatorConflict.lecture.titleKo}"\n` +
                `룸: ${moderatorConflict.room}\n` +
                `시간: ${moderatorConflict.time} ~ ${moderatorConflict.endTime}\n\n` +
                `⏱️ 다른 룸 간 이동시간 최소 ${AppConfig.SPEAKER_TRANSFER_TIME}분 필요\n\n` +
                `그래도 이 좌장을 지정하시겠습니까?`
            );
            if (!proceed) {
                document.getElementById('cellSessionModerator').focus();
                return;
            }
        }
    }

    // 좌장이 입력된 경우 연자 목록에서 영문명 찾기
    let finalModeratorEn = moderatorEn;
    if (moderator && !moderatorEn) {
        const foundSpeaker = AppState.speakers.find(s => s.name === moderator);
        if (foundSpeaker && foundSpeaker.nameEn) {
            finalModeratorEn = foundSpeaker.nameEn;
        }
    }

    saveStateForUndo();

    const existingSession = sessionId ? AppState.sessions.find(s => s.id == sessionId) : null;

    if (existingSession) {
        existingSession.name = name;
        existingSession.nameEn = nameEn;
        existingSession.moderator = moderator;
        existingSession.moderatorEn = finalModeratorEn;
        existingSession.color = color;
        existingSession.duration = duration;
    } else {
        const newSession = {
            id: Date.now(),
            name: name,
            nameEn: nameEn,
            moderator: moderator,
            moderatorEn: finalModeratorEn,
            time: time,
            room: room,
            color: color,
            duration: duration
        };
        AppState.sessions.push(newSession);
    }

    saveAndSync();
    updateScheduleDisplay();
    closeCellSessionModal();
};

/**
 * 좌장이 해당 시간에 다른 룸에서 강의가 있는지 체크
 */
window.checkModeratorHasLecture = function(moderatorName, sessionTime, sessionRoom, sessionDuration) {
    if (!moderatorName) return { hasConflict: false };
    
    const sessionStartMin = timeToMinutes(sessionTime);
    const sessionEndMin = sessionDuration > 0 ? sessionStartMin + sessionDuration : sessionStartMin + 60; // 기본 60분
    
    // 모든 배치된 강의 확인
    for (const [scheduleKey, lecture] of Object.entries(AppState.schedule)) {
        const speakerName = (lecture.speakerKo || '').trim();
        if (!speakerName || speakerName !== moderatorName) continue;
        
        const [lectureTime, lectureRoom] = [scheduleKey.substring(0, 5), scheduleKey.substring(6)];
        
        // 같은 룸이면 스킵 (같은 룸에서는 좌장이 강의 가능)
        if (lectureRoom === sessionRoom) continue;
        
        const lectureDuration = lecture.duration || 15;
        const lectureStartMin = timeToMinutes(lectureTime);
        const lectureEndMin = lectureStartMin + lectureDuration;
        
        // 이동 시간 포함 충돌 체크
        const gapAfterLecture = sessionStartMin - lectureEndMin;
        const gapBeforeLecture = lectureStartMin - sessionEndMin;
        
        if (gapAfterLecture < AppConfig.SPEAKER_TRANSFER_TIME && gapBeforeLecture < AppConfig.SPEAKER_TRANSFER_TIME) {
            const lectureEndTime = `${Math.floor(lectureEndMin / 60).toString().padStart(2, '0')}:${(lectureEndMin % 60).toString().padStart(2, '0')}`;
            
            return {
                hasConflict: true,
                lecture: lecture,
                room: lectureRoom,
                time: lectureTime,
                endTime: lectureEndTime
            };
        }
    }
    
    return { hasConflict: false };
};

/**
 * 세션 수정
 */
window.editCellSession = function(time, room) {
    openCellSessionModal(time, room);
};

/**
 * 세션 삭제
 */
window.removeSession = function(time, room) {
    if (!confirm('이 세션을 삭제하시겠습니까?')) return;

    saveStateForUndo();
    AppState.sessions = AppState.sessions.filter(s => !(s.time === time && s.room === room));
    saveAndSync();
    updateScheduleDisplay();
};

/**
 * 모달 내 세션 목록 업데이트
 */
window.updateSessionListInModal = function() {
    const list = document.getElementById('sessionList');

    if (AppState.sessions.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">세션이 없습니다. 시간표에서 "+ 세션" 버튼을 클릭하여 추가하세요.</p>';
        return;
    }

    // 룸별로 그룹화
    const sessionsByRoom = {};
    AppState.rooms.forEach(room => {
        sessionsByRoom[room] = AppState.sessions.filter(s => s.room === room);
    });

    let html = '';
    AppState.rooms.forEach(room => {
        const roomSessions = sessionsByRoom[room];
        if (roomSessions && roomSessions.length > 0) {
            html += `<div style="margin-bottom: 1rem;">
                <h4 style="color: var(--primary); margin-bottom: 0.5rem; padding-bottom: 0.25rem; border-bottom: 2px solid var(--border);">📍 ${room}</h4>`;

            roomSessions.forEach(session => {
                html += `
                    <div class="speaker-item" style="border-left: 4px solid ${session.color}; margin-bottom: 0.5rem;">
                        <div class="speaker-info">
                            <strong>${session.name}</strong>
                            <small>👤 좌장: ${session.moderator || '미정'} | 🕐 ${session.time}</small>
                        </div>
                        <div class="speaker-actions">
                            <button class="btn btn-secondary btn-small" onclick="editCellSession('${session.time}', '${session.room}'); updateSessionListInModal();">수정</button>
                            <button class="btn btn-secondary btn-small" onclick="removeSession('${session.time}', '${session.room}'); updateSessionListInModal();">삭제</button>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        }
    });

    list.innerHTML = html;
};

/**
 * 세션 소속 토글 (Tab 키)
 */
window.toggleSessionMembership = function(key, time, room) {
    const lecture = AppState.schedule[key];
    if (!lecture) return;

    const timeIndex = AppState.timeSlots.indexOf(time);
    let foundSession = null;

    for (let i = timeIndex; i >= 0; i--) {
        const sessionAtTime = AppState.sessions.find(s => s.time === AppState.timeSlots[i] && s.room === room);
        if (sessionAtTime) {
            foundSession = sessionAtTime;
            break;
        }
    }

    if (lecture.sessionId) {
        delete lecture.sessionId;
    } else if (foundSession) {
        lecture.sessionId = foundSession.id;
    } else {
        alert('이 룸에 세션이 없습니다. 먼저 세션을 추가해주세요.');
        return;
    }

    saveAndSync();
    updateScheduleDisplay();
};

// 색상 선택 이벤트 초기화
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('#sessionColorPicker .color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#sessionColorPicker .color-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            document.getElementById('cellSessionColor').value = this.dataset.color;
        });
    });

    // 좌장 입력 시 연자 목록에서 영문명 자동 채우기
    const moderatorInput = document.getElementById('cellSessionModerator');
    if (moderatorInput) {
        moderatorInput.addEventListener('change', function() {
            const moderator = this.value.trim();
            const foundSpeaker = AppState.speakers.find(s => s.name === moderator);
            if (foundSpeaker && foundSpeaker.nameEn) {
                document.getElementById('cellSessionModeratorEn').value = foundSpeaker.nameEn;
            }
        });
    }
});

console.log('✅ sessions.js 로드 완료');
