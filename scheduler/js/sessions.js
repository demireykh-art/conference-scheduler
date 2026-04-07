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

    const modalTitle = document.getElementById('cellSessionModalTitle');
    if (modalTitle) {
        modalTitle.textContent = existingSession ? '📋 세션/런치 수정' : '📋 세션/런치 추가';
    }

    const timeInput = document.getElementById('cellSessionTime');
    const roomInput = document.getElementById('cellSessionRoom');
    const idInput = document.getElementById('cellSessionId');
    const nameInput = document.getElementById('cellSessionName');
    const nameEnInput = document.getElementById('cellSessionNameEn');
    
    if (timeInput) timeInput.value = time;
    if (roomInput) roomInput.value = room;
    if (idInput) idInput.value = existingSession ? existingSession.id : '';
    if (nameInput) nameInput.value = existingSession ? existingSession.name : '';
    if (nameEnInput) nameEnInput.value = existingSession ? existingSession.nameEn : '';
    
    // 좌장 드롭다운 채우기 (가나다순 정렬)
    populateModeratorDropdown(existingSession ? existingSession.moderator : '');
    
    const moderatorEnInput = document.getElementById('cellSessionModeratorEn');
    if (moderatorEnInput) {
        moderatorEnInput.value = existingSession ? existingSession.moderatorEn : '';
    }
    
    // 세션 시간 초기화
    const durationSelect = document.getElementById('cellSessionDuration');
    if (durationSelect) {
        durationSelect.value = existingSession && existingSession.duration ? existingSession.duration : '0';
    }

    // 색상 선택
    const colors = ['#3498DB', '#E74C3C', '#2ECC71', '#9B59B6', '#F39C12', '#1ABC9C', '#E91E63', '#5D4037'];
    const defaultColor = existingSession ? existingSession.color : colors[AppState.sessions.length % colors.length];
    
    const colorInput = document.getElementById('cellSessionColor');
    if (colorInput) {
        colorInput.value = defaultColor;
    }

    // 색상 버튼 상태 업데이트
    document.querySelectorAll('#sessionColorPicker .color-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === defaultColor);
    });

    // 패널 토의 설정 초기화
    const hasPanelEl = document.getElementById('cellSessionHasPanel');
    const panelDurEl = document.getElementById('cellSessionPanelDuration');
    const panelRow = document.getElementById('cellSessionPanelRow');
    if (hasPanelEl) {
        hasPanelEl.checked = existingSession ? !!existingSession.hasPanelDiscussion : false;
        if (panelRow) panelRow.style.display = hasPanelEl.checked ? 'flex' : 'none';
    }
    if (panelDurEl) {
        panelDurEl.value = existingSession ? (existingSession.panelDuration || 20) : 20;
    }

    // 세션의 카테고리 태그 계산 및 표시
    const duration = existingSession?.duration || 60;
    let sessionTags = [];
    try {
        sessionTags = getSessionCategoryTags(time, room, duration);
        updateSessionTagsDisplay(sessionTags);
    } catch (e) {
        console.log('세션 태그 계산 실패:', e);
    }
    
    // 좌장 스마트 추천 초기화
    try {
        initModeratorSmartSearch(sessionTags);
    } catch (e) {
        console.log('좌장 추천 초기화 실패:', e);
    }

    const modal = document.getElementById('cellSessionModal');
    if (modal) {
        modal.classList.add('active');
    }
    
    if (nameInput) {
        nameInput.focus();
    }
};

/**
 * 좌장 드롭다운 채우기 (가나다순 정렬)
 */
window.populateModeratorDropdown = function(selectedValue = '') {
    const select = document.getElementById('cellSessionModerator');
    if (!select) return;
    
    // 가나다순 정렬
    const sortedSpeakers = [...AppState.speakers].sort((a, b) => 
        a.name.localeCompare(b.name, 'ko')
    );
    
    // 옵션 생성
    let options = '<option value="">-- 좌장 선택 --</option>';
    sortedSpeakers.forEach(speaker => {
        const isASLS = speaker.isASLSMember ? ' [ASLS]' : '';
        const selected = speaker.name === selectedValue ? 'selected' : '';
        options += `<option value="${speaker.name}" data-name-en="${speaker.nameEn || ''}" ${selected}>${speaker.name}${isASLS} (${speaker.affiliation})</option>`;
    });
    
    select.innerHTML = options;
    
    // 선택 변경 시 영문명 자동 채우기
    select.onchange = function() {
        const selectedOption = this.options[this.selectedIndex];
        const nameEn = selectedOption.dataset.nameEn || '';
        document.getElementById('cellSessionModeratorEn').value = nameEn;
    };
};

/**
 * 세션 카테고리 태그 표시
 */
window.updateSessionTagsDisplay = function(tags) {
    const container = document.getElementById('sessionTagsDisplay');
    if (!container) return;
    
    if (tags.length === 0) {
        container.innerHTML = '<span style="color: #999; font-size: 0.75rem;">배치된 강의가 없습니다</span>';
        return;
    }
    
    container.innerHTML = tags.map(tag => {
        const color = AppConfig.categoryColors[tag] || '#757575';
        return `<span style="background: ${color}; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; margin-right: 0.3rem;">${tag}</span>`;
    }).join('');
};

/**
 * 좌장 스마트 검색 초기화
 */
window.initModeratorSmartSearch = function(sessionTags) {
    const moderatorInput = document.getElementById('cellSessionModerator');
    const recommendContainer = document.getElementById('moderatorRecommendations');
    
    // null 체크 - 요소가 없으면 조용히 종료
    if (!recommendContainer) {
        console.log('moderatorRecommendations 요소를 찾을 수 없습니다.');
        return;
    }
    
    // 추천 목록 생성
    let recommendations = [];
    try {
        recommendations = getModeratorRecommendations(sessionTags || []);
    } catch (e) {
        console.log('좌장 추천 목록 생성 실패:', e);
        recommendations = [];
    }
    
    // 매칭되는 연자 (점수 > 0)
    const matched = recommendations.filter(r => r.matchScore > 0);
    // ASLS 멤버 (매칭되지 않은 것 중)
    const aslsOnly = recommendations.filter(r => r.matchScore === 0 && r.isASLS);
    
    let html = '';
    
    if (matched.length > 0) {
        html += `<div class="recommend-section">
            <div class="recommend-header" style="font-weight: bold; font-size: 0.75rem; color: #4CAF50; margin-bottom: 0.5rem;">
                ✅ 세션 분야 매칭 (${matched.length}명)
            </div>
            <div class="recommend-list" style="max-height: 150px; overflow-y: auto;">
                ${matched.slice(0, 10).map(r => createModeratorRecommendItem(r)).join('')}
            </div>
        </div>`;
    }
    
    if (aslsOnly.length > 0) {
        html += `<div class="recommend-section" style="margin-top: 0.75rem;">
            <div class="recommend-header" style="font-weight: bold; font-size: 0.75rem; color: #8E24AA; margin-bottom: 0.5rem;">
                🏅 ASLS 학회 멤버 (${aslsOnly.length}명)
            </div>
            <div class="recommend-list" style="max-height: 100px; overflow-y: auto;">
                ${aslsOnly.slice(0, 5).map(r => createModeratorRecommendItem(r)).join('')}
            </div>
        </div>`;
    }
    
    // 전체 목록 보기 버튼
    html += `<div style="margin-top: 0.75rem; text-align: center;">
        <button type="button" class="btn btn-secondary btn-small" onclick="showAllModerators()" style="font-size: 0.75rem;">
            📋 전체 연자 목록 보기 (${AppState.speakers.length}명)
        </button>
    </div>`;
    
    try {
        recommendContainer.innerHTML = html;
    } catch (e) {
        console.log('추천 목록 렌더링 실패:', e);
    }
};

/**
 * 좌장 추천 아이템 생성
 */
window.createModeratorRecommendItem = function(recommendation) {
    const { speaker, isASLS, matchedTags } = recommendation;
    const aslsBadge = isASLS ? '<span style="background:#8E24AA; color:white; padding:0.1rem 0.3rem; border-radius:3px; font-size:0.6rem; margin-left:0.3rem;">ASLS</span>' : '';
    
    const tagsHtml = matchedTags.length > 0 
        ? matchedTags.map(tag => {
            const color = AppConfig.categoryColors[tag] || '#757575';
            return `<span style="background:${color}22; color:${color}; padding:0.1rem 0.3rem; border-radius:3px; font-size:0.6rem; border:1px solid ${color}44;">${tag}</span>`;
        }).join(' ')
        : '';
    
    return `
        <div class="moderator-recommend-item" 
             onclick="selectModerator('${speaker.name}', '${speaker.nameEn || ''}')"
             style="padding: 0.5rem; border: 1px solid #eee; border-radius: 6px; margin-bottom: 0.4rem; cursor: pointer; background: #fafafa;"
             onmouseover="this.style.background='#e3f2fd'" 
             onmouseout="this.style.background='#fafafa'">
            <div style="font-weight: bold; font-size: 0.85rem;">
                ${speaker.name}${aslsBadge}
            </div>
            <div style="font-size: 0.7rem; color: #666;">${speaker.affiliation}</div>
            ${tagsHtml ? `<div style="margin-top: 0.3rem;">${tagsHtml}</div>` : ''}
        </div>
    `;
};

/**
 * 좌장 선택 (드롭다운 및 추천 목록에서 선택 시)
 */
window.selectModerator = function(name, nameEn) {
    const select = document.getElementById('cellSessionModerator');
    
    // 드롭다운에서 해당 값 선택
    if (select.tagName === 'SELECT') {
        select.value = name;
    } else {
        select.value = name;
    }
    
    document.getElementById('cellSessionModeratorEn').value = nameEn || '';
};

/**
 * 전체 연자 목록 모달 표시
 */
window.showAllModerators = function() {
    const container = document.getElementById('moderatorRecommendations');
    
    // 검색 입력 + 전체 목록
    let html = `
        <div style="margin-bottom: 0.75rem;">
            <input type="text" id="moderatorSearchInput" placeholder="🔍 연자 검색..." 
                   oninput="filterModeratorList(this.value)"
                   style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.85rem;">
        </div>
        <div id="moderatorFullList" style="max-height: 250px; overflow-y: auto;">
            ${AppState.speakers.map(s => {
                const isASLS = s.isASLSMember;
                const aslsBadge = isASLS ? '<span style="background:#8E24AA; color:white; padding:0.1rem 0.3rem; border-radius:3px; font-size:0.6rem; margin-left:0.3rem;">ASLS</span>' : '';
                return `
                    <div class="moderator-list-item" data-name="${s.name.toLowerCase()}" data-affiliation="${s.affiliation.toLowerCase()}"
                         onclick="selectModerator('${s.name}', '${s.nameEn || ''}')"
                         style="padding: 0.4rem 0.5rem; border-bottom: 1px solid #eee; cursor: pointer;"
                         onmouseover="this.style.background='#e3f2fd'" 
                         onmouseout="this.style.background='transparent'">
                        <span style="font-weight: bold;">${s.name}</span>${aslsBadge}
                        <span style="color: #666; font-size: 0.75rem; margin-left: 0.5rem;">${s.affiliation}</span>
                    </div>
                `;
            }).join('')}
        </div>
        <div style="margin-top: 0.75rem; text-align: center;">
            <button type="button" class="btn btn-secondary btn-small" onclick="initModeratorSmartSearch([])" style="font-size: 0.75rem;">
                ← 추천 목록으로 돌아가기
            </button>
        </div>
    `;
    
    container.innerHTML = html;
    document.getElementById('moderatorSearchInput').focus();
};

/**
 * 좌장 목록 필터링
 */
window.filterModeratorList = function(searchTerm) {
    const term = searchTerm.toLowerCase();
    document.querySelectorAll('#moderatorFullList .moderator-list-item').forEach(item => {
        const name = item.dataset.name;
        const affiliation = item.dataset.affiliation;
        const match = name.includes(term) || affiliation.includes(term);
        item.style.display = match ? '' : 'none';
    });
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
 * 세션 수정 모달 닫기 확인 (수정사항 유실 방지)
 */
window.confirmCloseCellSessionModal = function() {
    closeCellSessionModal();
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
        Toast.warning('세션명을 입력해주세요.');
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
        
        // 좌장 총 활동 시간 체크 (2시간 제한) - 별표 룸에서만 적용
        if (duration > 0) {
            // 수정 시 기존 세션 제외
            const excludeSessionId = sessionId || null;
            const timeCheck = checkSpeakerTimeLimit(moderator, duration, null, excludeSessionId, room);
            
            if (timeCheck.isOverLimit && timeCheck.isStarredRoom) {
                const detailsText = timeCheck.details.map(d => 
                    `  • ${d.type}: ${d.title} (${d.room}, ${d.time}, ${d.duration}분)`
                ).join('\n');
                
                const confirmMsg = `⚠️ 좌장 총 활동 시간 초과! (⭐별표 룸 기준)\n\n` +
                    `좌장: ${moderator}\n\n` +
                    `📊 현재 활동 시간 (별표 룸):\n` +
                    `  • 강의: ${formatMinutesToHM(timeCheck.lectureMinutes)}\n` +
                    `  • 좌장: ${formatMinutesToHM(timeCheck.moderatorMinutes)}\n` +
                    `  • 합계: ${formatMinutesToHM(timeCheck.currentMinutes)}\n\n` +
                    `➕ 지정하려는 세션 좌장: ${duration}분\n` +
                    `📈 새 합계: ${formatMinutesToHM(timeCheck.newTotalMinutes)}\n\n` +
                    `⏰ 최대 허용 시간: ${formatMinutesToHM(timeCheck.maxMinutes)}\n\n` +
                    (timeCheck.details.length > 0 ? `📋 현재 배치된 항목 (별표 룸):\n${detailsText}\n\n` : '') +
                    `그래도 이 좌장을 지정하시겠습니까?`;
                
                if (!confirm(confirmMsg)) {
                    document.getElementById('cellSessionModerator').focus();
                    return;
                }
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

    // 패널 토의 설정
    const hasPanelEl = document.getElementById('cellSessionHasPanel');
    const panelDurEl = document.getElementById('cellSessionPanelDuration');
    const hasPanelDiscussion = hasPanelEl ? hasPanelEl.checked : false;
    const panelDuration = panelDurEl ? parseInt(panelDurEl.value) || 20 : 20;

    if (existingSession) {
        existingSession.name = name;
        existingSession.nameEn = nameEn;
        existingSession.moderator = moderator;
        existingSession.moderatorEn = finalModeratorEn;
        existingSession.color = color;
        existingSession.duration = duration;
        existingSession.hasPanelDiscussion = hasPanelDiscussion;
        existingSession.panelDuration = panelDuration;
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
            duration: duration,
            hasPanelDiscussion: hasPanelDiscussion,
            panelDuration: panelDuration
        };
        AppState.sessions.push(newSession);
    }

    saveAndSync();
    updateScheduleDisplay();

    // ★ 패널 토의 자동 배치
    if (typeof autoPlacePanelDiscussions === 'function') {
        setTimeout(() => autoPlacePanelDiscussions(), 300);
    }

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
        Toast.warning('이 룸에 세션이 없습니다. 먼저 세션을 추가해주세요.');
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
