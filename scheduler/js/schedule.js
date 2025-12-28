/**
 * schedule.js - 시간표 렌더링 및 드래그앤드롭
 */

/**
 * 시간표 테이블 생성
 */
window.createScheduleTable = function() {
    const container = document.getElementById('scheduleTable');
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'schedule-table';
    table.style.tableLayout = 'fixed'; // 룸 폭 균등화

    // 헤더
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const timeHeader = document.createElement('th');
    timeHeader.textContent = '시간';
    timeHeader.style.width = '70px';
    timeHeader.style.minWidth = '70px';
    headerRow.appendChild(timeHeader);

    // 각 룸의 폭 계산 (균등)
    const roomWidth = 180; // 고정 폭

    AppState.rooms.forEach((room, roomIndex) => {
        const roomHeader = document.createElement('th');
        roomHeader.style.position = 'relative';
        roomHeader.style.width = roomWidth + 'px';
        roomHeader.style.minWidth = roomWidth + 'px';

        // 크게보기 버튼
        const expandBtn = document.createElement('button');
        expandBtn.textContent = '🔍';
        expandBtn.title = '이 룸 크게 보기';
        expandBtn.style.cssText = 'position:absolute;top:2px;left:2px;background:rgba(255,255,255,0.3);border:none;color:white;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:0.65rem;';
        expandBtn.onclick = (e) => {
            e.stopPropagation();
            openRoomScheduleModal(roomIndex);
        };
        roomHeader.appendChild(expandBtn);

        // 룸 이름 입력
        const roomInput = document.createElement('input');
        roomInput.type = 'text';
        roomInput.value = room;
        roomInput.title = '클릭하여 룸 이름 수정';
        roomInput.style.cssText = 'background:transparent;border:none;color:white;font-weight:700;text-align:center;width:100%;font-size:0.8rem;padding: 0 22px;';

        roomInput.addEventListener('change', function() {
            const oldName = AppState.rooms[roomIndex];
            const newName = this.value.trim();
            if (newName && newName !== oldName) {
                updateRoomNameInData(oldName, newName);
                AppState.rooms[roomIndex] = newName;
                saveRoomsToStorage();
                updateScheduleDisplay();
            } else {
                this.value = oldName;
            }
        });

        // 삭제 버튼
        if (AppState.rooms.length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(255,255,255,0.3);border:none;color:white;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:0.7rem;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`"${room}" 룸을 삭제하시겠습니까?\n해당 룸의 모든 강의와 세션이 삭제됩니다.`)) {
                    deleteRoom(roomIndex);
                }
            };
            roomHeader.appendChild(deleteBtn);
        }

        roomHeader.appendChild(roomInput);
        headerRow.appendChild(roomHeader);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 본문
    const tbody = document.createElement('tbody');

    AppState.timeSlots.forEach((time, timeIndex) => {
        const [hour, min] = time.split(':').map(Number);
        const row = document.createElement('tr');

        // 시간 셀
        const timeCell = document.createElement('td');
        let timeCellClass = '';
        let showTime = false;

        if (min === 0 || min === 30) {
            timeCellClass = 'hour-mark';
            showTime = true;
        } else if (min === 15 || min === 45) {
            timeCellClass = 'quarter-mark';
            showTime = true;
        } else {
            timeCellClass = 'five-min';
        }

        timeCell.className = timeCellClass;
        timeCell.innerHTML = `<span class="time-label">${showTime ? time : ''}</span>`;
        row.appendChild(timeCell);

        // 각 룸 셀
        AppState.rooms.forEach(room => {
            const cell = document.createElement('td');
            let cellClass = 'schedule-cell';

            if (min === 0 || min === 30) {
                cellClass += ' hour-mark';
            } else if (min === 15 || min === 45) {
                cellClass += ' quarter-mark';
            } else {
                cellClass += ' five-min';
            }

            cell.className = cellClass;
            cell.dataset.time = time;
            cell.dataset.room = room;
            cell.dataset.timeIndex = timeIndex;

            // 30분 단위에만 세션 추가 버튼
            if (min === 0 || min === 30) {
                const addSessionBtn = document.createElement('button');
                addSessionBtn.className = 'add-session-btn';
                addSessionBtn.textContent = '+ 세션';
                addSessionBtn.onclick = (e) => {
                    e.stopPropagation();
                    openCellSessionModal(time, room);
                };
                cell.appendChild(addSessionBtn);
            }

            cell.addEventListener('dragover', handleDragOver);
            cell.addEventListener('dragleave', handleDragLeave);
            cell.addEventListener('drop', handleDrop);

            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    updateScheduleDisplay();
};

/**
 * 시간표 디스플레이 업데이트
 */
window.updateScheduleDisplay = function() {
    // 기존 강의 블록들 제거
    document.querySelectorAll('.scheduled-lecture').forEach(el => el.remove());
    document.querySelectorAll('.session-header-cell').forEach(el => el.remove());

    // 각 셀 처리
    document.querySelectorAll('.schedule-cell').forEach(cell => {
        const time = cell.dataset.time;
        const room = cell.dataset.room;
        const [hour, min] = time.split(':').map(Number);

        // 세션 추가 버튼 처리
        let addSessionBtn = cell.querySelector('.add-session-btn');
        if (!addSessionBtn && (min === 0 || min === 30)) {
            addSessionBtn = document.createElement('button');
            addSessionBtn.className = 'add-session-btn';
            addSessionBtn.textContent = '+ 세션';
            addSessionBtn.onclick = (e) => {
                e.stopPropagation();
                openCellSessionModal(time, room);
            };
            cell.appendChild(addSessionBtn);
        }

        // 세션 헤더 표시
        const session = AppState.sessions.find(s => s.time === time && s.room === room);
        if (session) {
            cell.classList.add('has-session');
            if (addSessionBtn) addSessionBtn.style.display = 'none';

            const sessionName = AppState.currentLanguage === 'en' && session.nameEn ? session.nameEn : session.name;
            const moderatorLabel = AppState.currentLanguage === 'en' ? 'Chair: ' : '좌장: ';
            const moderatorName = AppState.currentLanguage === 'en' && session.moderatorEn ? session.moderatorEn : session.moderator;

            const sessionHeader = document.createElement('div');
            sessionHeader.className = 'session-header-cell';
            sessionHeader.draggable = true;
            sessionHeader.dataset.sessionId = session.id;
            sessionHeader.style.background = `linear-gradient(135deg, ${session.color} 0%, ${adjustColor(session.color, -20)} 100%)`;
            sessionHeader.innerHTML = `
                <span class="session-name" title="${sessionName}">${sessionName}</span>
                ${moderatorName ? `<span class="session-moderator">${moderatorLabel}${moderatorName}</span>` : ''}
                <button class="session-remove" onclick="event.stopPropagation(); removeSession('${time}', '${room}')">×</button>
            `;

            sessionHeader.addEventListener('dblclick', (e) => {
                if (!e.target.classList.contains('session-remove')) {
                    editCellSession(time, room);
                }
            });

            sessionHeader.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                AppState.draggedSession = session;
                sessionHeader.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            });

            sessionHeader.addEventListener('dragend', () => {
                sessionHeader.style.opacity = '1';
                AppState.draggedSession = null;
            });

            cell.appendChild(sessionHeader);
        } else {
            cell.classList.remove('has-session');
            if (addSessionBtn) addSessionBtn.style.display = '';
        }
    });

    // 강의들 표시
    Object.entries(AppState.schedule).forEach(([key, lecture]) => {
        const startTime = key.substring(0, 5);
        const room = key.substring(6);

        const startIndex = AppState.timeSlots.indexOf(startTime);
        if (startIndex === -1) return;

        const duration = lecture.duration || 15;
        const slotsSpan = Math.ceil(duration / AppConfig.TIME_UNIT);

        let startCell = null;
        document.querySelectorAll('.schedule-cell').forEach(cell => {
            if (cell.dataset.time === startTime && cell.dataset.room === room) {
                startCell = cell;
            }
        });

        if (!startCell) return;

        const color = AppConfig.categoryColors[lecture.category] || '#9B59B6';
        const lectureDiv = document.createElement('div');

        // 해당 강의가 속한 세션 찾기
        const belongingSession = findBelongingSession(startTime, room);
        const isInSession = lecture.sessionId || belongingSession;
        const isBreak = lecture.isBreak || (AppConfig.BREAK_TYPES || []).includes(lecture.category);
        const isLuncheon = lecture.isLuncheon;
        const isPanelDiscussion = lecture.category === 'Panel Discussion' || lecture.isPanelDiscussion;
        
        // 같은 시간에 세션이 시작하는지 확인
        const sessionAtSameTime = AppState.sessions.find(s => s.time === startTime && s.room === room);
        const sessionHeaderHeight = sessionAtSameTime ? 25 : 0; // 세션 헤더 높이
        
        lectureDiv.className = 'scheduled-lecture' + (isInSession ? ' in-session' : '') + (isBreak ? ' break-item' : '') + (isPanelDiscussion ? ' panel-discussion' : '') + (isLuncheon ? ' luncheon-lecture' : '');
        lectureDiv.draggable = true;
        lectureDiv.dataset.scheduleKey = key;
        lectureDiv.tabIndex = 0;
        
        // 스타일: 흰색 배경 + 좌측 컬러바 (강의목록과 동일)
        if (isPanelDiscussion) {
            lectureDiv.style.background = 'white';
            lectureDiv.style.borderLeft = `4px solid ${color}`;
        } else if (isLuncheon) {
            lectureDiv.style.background = 'white';
            lectureDiv.style.borderLeft = `4px solid #FFD700`;
        } else {
            lectureDiv.style.background = 'white';
            lectureDiv.style.borderLeft = `4px solid ${color}`;
        }

        const cellHeight = 20;
        const totalHeight = slotsSpan * cellHeight;
        // 세션 헤더가 있으면 강의를 아래로 내리고 높이 조정
        lectureDiv.style.height = `${totalHeight - sessionHeaderHeight}px`;
        lectureDiv.style.top = `${sessionHeaderHeight}px`;

        const title = AppState.currentLanguage === 'en' && lecture.titleEn ? lecture.titleEn : lecture.titleKo;
        const speaker = AppState.currentLanguage === 'en' && lecture.speakerEn ? lecture.speakerEn : lecture.speakerKo;

        // 호버 시 전체 제목 표시를 위한 data 속성
        const fullTooltip = `${title}\n👤 ${speaker || '미정'} | ⏱️ ${duration}분`;
        lectureDiv.dataset.fullTitle = fullTooltip;

        // 메타 정보 생성
        let metaDisplay = '';
        let titleDisplay = title;
        
        if (isPanelDiscussion) {
            // 해당 세션의 연자들과 좌장 가져오기
            const sessionInfo = getSessionPanelInfo(startTime, room, belongingSession);
            
            const panelistsStr = sessionInfo.speakers.length > 0 ? sessionInfo.speakers.join(', ') : '(없음)';
            const moderatorStr = sessionInfo.moderator || '(없음)';
            
            metaDisplay = `
                <span class="panel-info" style="font-size: 0.6rem; line-height: 1.2; color: #333;">
                    패널: ${panelistsStr.length > 25 ? panelistsStr.substring(0, 25) + '...' : panelistsStr}
                </span>
                <span class="moderator-info" style="font-size: 0.6rem; color: #333;">좌장: ${moderatorStr}</span>
            `;
        } else if (isLuncheon) {
            // 런천강의 - 별표 + 스폰서 표시
            titleDisplay = `⭐ ${title}`;
            const sponsorInfo = lecture.companyName ? ` (${lecture.companyName})` : '';
            metaDisplay = `<span class="speaker-name" style="color: #333;">${speaker || '미정'}${sponsorInfo}</span><span class="duration-badge">⏱️ ${duration}분</span>`;
        } else if (isBreak && !isPanelDiscussion) {
            metaDisplay = `<span class="duration-badge">⏱️ ${duration}분</span>`;
        } else {
            metaDisplay = `<span class="speaker-name" style="color: #333;">${speaker || '미정'}</span><span class="duration-badge">⏱️ ${duration}분</span>`;
        }

        lectureDiv.innerHTML = `
            <button class="remove-btn" onclick="event.stopPropagation(); removeLecture('${key}')">×</button>
            <div class="lecture-title-display" style="color: #333;">${titleDisplay}</div>
            <div class="lecture-meta-display">
                ${metaDisplay}
            </div>
        `;

        lectureDiv.addEventListener('dragstart', handleScheduleDragStart);
        lectureDiv.addEventListener('dragend', handleScheduleDragEnd);
        lectureDiv.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (isBreak) {
                openBreakDurationModal(key, lecture);
            } else {
                openEditModal(lecture.id);
            }
        });
        lectureDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                toggleSessionMembership(key, startTime, room);
            }
        });

        startCell.appendChild(lectureDiv);
    });
};

/**
 * 해당 시간과 룸에 속한 세션 찾기
 */
function findBelongingSession(time, room) {
    const timeIndex = AppState.timeSlots.indexOf(time);
    
    // 해당 시간 이전의 가장 가까운 세션 찾기
    for (let i = timeIndex; i >= 0; i--) {
        const checkTime = AppState.timeSlots[i];
        const session = AppState.sessions.find(s => s.time === checkTime && s.room === room);
        if (session) {
            // 세션 duration이 있으면 해당 범위 내인지 확인
            if (session.duration) {
                const sessionEndIndex = i + Math.ceil(session.duration / AppConfig.TIME_UNIT);
                if (timeIndex < sessionEndIndex) {
                    return session;
                }
            } else {
                // duration이 없으면 다음 세션이 나올 때까지 해당 세션으로 간주
                return session;
            }
        }
    }
    return null;
}

/**
 * 세션의 패널 정보 가져오기 (연자들 + 좌장)
 */
function getSessionPanelInfo(time, room, session) {
    let sessionModerator = '';
    let sessionSpeakers = [];
    
    if (session) {
        sessionModerator = session.moderator || '';
        
        const sessionTimeIndex = AppState.timeSlots.indexOf(session.time);
        const panelTimeIndex = AppState.timeSlots.indexOf(time);
        
        // 세션 시작부터 Panel Discussion 시작 전까지의 강의 연자 수집
        Object.entries(AppState.schedule).forEach(([key, lecture]) => {
            if (key.endsWith(`-${room}`) && !lecture.isBreak && lecture.category !== 'Panel Discussion') {
                const lectureTime = key.substring(0, 5);
                const lectureTimeIndex = AppState.timeSlots.indexOf(lectureTime);
                
                // 해당 세션 범위 내이고 Panel Discussion 이전인 강의
                if (lectureTimeIndex >= sessionTimeIndex && lectureTimeIndex < panelTimeIndex) {
                    if (lecture.speakerKo && lecture.speakerKo.trim() && lecture.speakerKo !== '미정') {
                        sessionSpeakers.push(lecture.speakerKo);
                    }
                }
            }
        });
    }
    
    // 중복 제거
    sessionSpeakers = [...new Set(sessionSpeakers)];
    
    return {
        moderator: sessionModerator,
        speakers: sessionSpeakers
    };
}

/**
 * 드래그 시작 (강의 목록에서)
 */
window.handleDragStart = function(e) {
    const lectureId = this.dataset.lectureId;
    const isBreak = this.dataset.isBreak === 'true';
    
    // Break 항목이면 DEFAULT_BREAK_ITEMS에서 찾기
    if (isBreak) {
        AppState.draggedLecture = DEFAULT_BREAK_ITEMS.find(l => l.id === lectureId);
        AppState.draggedIsBreak = true;
    } else {
        AppState.draggedLecture = AppState.lectures.find(l => l.id == lectureId);
        AppState.draggedIsBreak = false;
    }
    
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lectureId);

    document.querySelector('.schedule-grid').classList.add('dragging');

    const tooltip = document.getElementById('dragTooltip');
    if (tooltip && AppState.draggedLecture) {
        document.getElementById('tooltipTitle').textContent = AppState.draggedLecture.titleKo;
        document.getElementById('tooltipDuration').textContent = `⏱️ ${AppState.draggedLecture.duration || 15}분`;
    }
};

/**
 * 드래그 종료 (강의 목록에서)
 */
window.handleDragEnd = function(e) {
    this.classList.remove('dragging');
    document.querySelector('.schedule-grid').classList.remove('dragging');

    const tooltip = document.getElementById('dragTooltip');
    if (tooltip) {
        tooltip.classList.remove('active');
    }

    document.querySelectorAll('.schedule-cell').forEach(cell => {
        cell.classList.remove('drag-target');
        cell.classList.remove('drag-over');
    });
    
    AppState.draggedIsBreak = false;
};

/**
 * 시간표 내 드래그 시작
 */
window.handleScheduleDragStart = function(e) {
    AppState.draggedScheduleKey = this.dataset.scheduleKey;
    AppState.draggedLecture = AppState.schedule[AppState.draggedScheduleKey];
    this.style.opacity = '0.5';
    this.classList.add('is-dragging'); // 드래그 중인 요소 표시
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', AppState.draggedScheduleKey);

    document.querySelector('.schedule-grid').classList.add('dragging');

    const tooltip = document.getElementById('dragTooltip');
    if (tooltip && AppState.draggedLecture) {
        document.getElementById('tooltipTitle').textContent = AppState.draggedLecture.titleKo;
        document.getElementById('tooltipDuration').textContent = `⏱️ ${AppState.draggedLecture.duration || 15}분`;
    }
};

/**
 * 시간표 내 드래그 종료
 */
window.handleScheduleDragEnd = function(e) {
    this.style.opacity = '1';
    this.classList.remove('is-dragging'); // 드래그 종료 시 클래스 제거
    AppState.draggedScheduleKey = null;

    document.querySelector('.schedule-grid').classList.remove('dragging');

    const tooltip = document.getElementById('dragTooltip');
    if (tooltip) {
        tooltip.classList.remove('active');
    }

    document.querySelectorAll('.schedule-cell').forEach(cell => {
        cell.classList.remove('drag-target');
    });
};

/**
 * 드래그 오버
 */
window.handleDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // 자동 스크롤
    const scheduleContainer = document.querySelector('.schedule-table-wrapper');
    if (scheduleContainer) {
        const rect = scheduleContainer.getBoundingClientRect();
        const mouseY = e.clientY;
        const SCROLL_ZONE = 80;
        const SCROLL_SPEED = 10;

        if (mouseY < rect.top + SCROLL_ZONE) {
            scheduleContainer.scrollTop -= SCROLL_SPEED;
        } else if (mouseY > rect.bottom - SCROLL_ZONE) {
            scheduleContainer.scrollTop += SCROLL_SPEED;
        }
    }

    document.querySelectorAll('.schedule-cell').forEach(cell => {
        cell.classList.remove('drag-target');
    });
    this.classList.add('drag-target');

    // 툴팁 업데이트
    if (AppState.draggedLecture) {
        const time = this.dataset.time;
        const duration = AppState.draggedLecture.duration || 15;
        const endTime = addMinutesToTime(time, duration);

        const tooltip = document.getElementById('dragTooltip');
        if (tooltip) {
            document.getElementById('tooltipTime').textContent = `📍 ${time} → ${endTime}`;
            tooltip.classList.add('active');
            tooltip.style.left = (e.clientX + 20) + 'px';
            tooltip.style.top = (e.clientY + 20) + 'px';
        }
    }
};

/**
 * 드래그 리브
 */
window.handleDragLeave = function(e) {
    this.classList.remove('drag-target');
};

/**
 * 드롭
 */
window.handleDrop = function(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    this.classList.remove('drag-target');

    document.querySelector('.schedule-grid').classList.remove('dragging');

    const tooltip = document.getElementById('dragTooltip');
    if (tooltip) {
        tooltip.classList.remove('active');
    }

    document.querySelectorAll('.schedule-cell').forEach(cell => {
        cell.classList.remove('dragging-over');
        cell.classList.remove('drag-target');
    });

    if (!checkEditPermission()) {
        AppState.draggedLecture = null;
        AppState.draggedScheduleKey = null;
        AppState.draggedIsBreak = false;
        return;
    }

    if (AppState.draggedLecture) {
        const time = this.dataset.time;
        const room = this.dataset.room;
        const key = `${time}-${room}`;
        const isBreak = AppState.draggedIsBreak || AppState.draggedLecture.isBreak;

        // Break가 아닌 경우만 이미 배치된 강의인지 확인
        if (!isBreak && !AppState.draggedScheduleKey) {
            const existingPlacement = Object.entries(AppState.schedule).find(([k, v]) => v.id === AppState.draggedLecture.id);
            if (existingPlacement) {
                const [existingKey] = existingPlacement;
                const existingTime = existingKey.substring(0, 5);
                const existingRoom = existingKey.substring(6);

                showAlreadyPlacedDialog(existingKey, existingTime, existingRoom, key, time, room, AppState.draggedLecture);
                return;
            }
        }

        // 이미 강의가 있는 셀인지 확인
        if (AppState.schedule[key]) {
            if (!AppState.draggedScheduleKey || AppState.draggedScheduleKey !== key) {
                showSwapDialog(key, time, room, AppState.draggedLecture, AppState.draggedScheduleKey);
                return;
            }
        }

        // 시간 겹침 체크
        const overlapCheck = checkTimeOverlap(time, room, AppState.draggedLecture.duration || 15, AppState.draggedScheduleKey);
        if (overlapCheck.hasOverlap) {
            alert(`⚠️ 시간이 겹칩니다!\n\n배치하려는 강의: ${time} ~ ${overlapCheck.newEndTime} (${AppState.draggedLecture.duration || 15}분)\n\n겹치는 강의: "${overlapCheck.conflictLecture.titleKo}"\n시간: ${overlapCheck.conflictTime} ~ ${overlapCheck.conflictEndTime}\n\n다른 시간대를 선택해주세요.`);
            AppState.draggedScheduleKey = null;
            AppState.draggedLecture = null;
            AppState.draggedIsBreak = false;
            return;
        }

        // Break가 아닌 경우만 연자 중복 체크
        if (!isBreak) {
            const speakerConflict = checkSpeakerConflict(time, room, AppState.draggedLecture, AppState.draggedScheduleKey);
            if (speakerConflict.hasConflict) {
                let alertMessage;
                if (speakerConflict.isPanelConflict) {
                    // Panel Discussion 세션 충돌
                    alertMessage = `⚠️ Panel Discussion 세션 참여자 충돌!\n\n연자: ${speakerConflict.speakerName}\n\n이 연자는 "${speakerConflict.sessionName}" 세션의 패널리스트입니다.\n\n📋 세션 정보:\n룸: ${speakerConflict.conflictRoom}\n시간: ${speakerConflict.conflictTime} ~ ${speakerConflict.conflictEndTime}\n\n❌ 배치하려는 시간: ${time} ~ ${speakerConflict.targetEndTime}\n룸: ${room}\n\n💡 패널리스트는 해당 세션 전체 시간 동안 다른 룸에서 강의할 수 없습니다.\n\n다른 시간대를 선택해주세요.`;
                } else {
                    // 일반 연자 충돌
                    alertMessage = `⚠️ 연자 시간 충돌!\n\n연자: ${speakerConflict.speakerName}\n\n기존 강의: "${speakerConflict.conflictLecture.titleKo}"\n룸: ${speakerConflict.conflictRoom}\n시간: ${speakerConflict.conflictTime} ~ ${speakerConflict.conflictEndTime}\n\n배치하려는 시간: ${time} ~ ${speakerConflict.targetEndTime}\n룸: ${room}\n\n⏱️ 다른 룸 간 이동시간 최소 ${AppConfig.SPEAKER_TRANSFER_TIME}분 필요\n\n다른 시간대를 선택해주세요.`;
                }
                alert(alertMessage);
                AppState.draggedScheduleKey = null;
                AppState.draggedLecture = null;
                AppState.draggedIsBreak = false;
                return;
            }
        }

        saveStateForUndo();

        // 시간표 내 이동인 경우 기존 위치에서 삭제
        if (AppState.draggedScheduleKey && AppState.draggedScheduleKey !== key) {
            delete AppState.schedule[AppState.draggedScheduleKey];
        }

        // 강의 배치
        const newLecture = { ...AppState.draggedLecture };
        
        // Break 항목은 새 ID 생성 (중복 배치 가능)
        if (isBreak && !AppState.draggedScheduleKey) {
            newLecture.id = `break-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // 세션 자동 할당
        const sessionAtCell = AppState.sessions.find(s => s.time === time && s.room === room);
        if (sessionAtCell) {
            newLecture.sessionId = sessionAtCell.id;
        } else {
            const timeIndex = AppState.timeSlots.indexOf(time);
            for (let i = timeIndex - 1; i >= 0; i--) {
                const upperSession = AppState.sessions.find(s => s.time === AppState.timeSlots[i] && s.room === room);
                if (upperSession) {
                    newLecture.sessionId = upperSession.id;
                    break;
                }
            }
        }

        AppState.schedule[key] = newLecture;
        saveAndSync();
        updateScheduleDisplay();

        AppState.draggedScheduleKey = null;
        AppState.draggedLecture = null;
        AppState.draggedIsBreak = false;
    }

    // 세션 드롭 처리
    if (AppState.draggedSession) {
        const time = this.dataset.time;
        const room = this.dataset.room;

        if (AppState.draggedSession.time === time && AppState.draggedSession.room === room) {
            AppState.draggedSession = null;
            return;
        }

        const existingSession = AppState.sessions.find(s => s.time === time && s.room === room);
        if (existingSession) {
            alert('이 위치에 이미 세션이 있습니다.');
            AppState.draggedSession = null;
            return;
        }

        saveStateForUndo();
        AppState.draggedSession.time = time;
        AppState.draggedSession.room = room;

        saveAndSync();
        updateScheduleDisplay();
        AppState.draggedSession = null;
    }
};

/**
 * 시간 겹침 체크
 */
window.checkTimeOverlap = function(targetTime, targetRoom, targetDuration, excludeKey = null) {
    const targetStartIndex = AppState.timeSlots.indexOf(targetTime);
    if (targetStartIndex === -1) return { hasOverlap: false };

    const targetEndIndex = targetStartIndex + Math.ceil(targetDuration / 5);
    const targetEndTime = AppState.timeSlots[Math.min(targetEndIndex, AppState.timeSlots.length - 1)] || AppState.timeSlots[AppState.timeSlots.length - 1];

    for (const [scheduleKey, lecture] of Object.entries(AppState.schedule)) {
        if (excludeKey && scheduleKey === excludeKey) continue;

        const [existingTime, existingRoom] = [scheduleKey.substring(0, 5), scheduleKey.substring(6)];
        if (existingRoom !== targetRoom) continue;

        const existingStartIndex = AppState.timeSlots.indexOf(existingTime);
        if (existingStartIndex === -1) continue;

        const existingDuration = lecture.duration || 15;
        const existingEndIndex = existingStartIndex + Math.ceil(existingDuration / 5);
        const existingEndTime = AppState.timeSlots[Math.min(existingEndIndex, AppState.timeSlots.length - 1)] || AppState.timeSlots[AppState.timeSlots.length - 1];

        if (targetStartIndex < existingEndIndex && targetEndIndex > existingStartIndex) {
            return {
                hasOverlap: true,
                conflictLecture: lecture,
                conflictTime: existingTime,
                conflictEndTime: existingEndTime,
                newEndTime: targetEndTime
            };
        }
    }

    return { hasOverlap: false };
};

/**
 * 연자 충돌 체크
 */
window.checkSpeakerConflict = function(targetTime, targetRoom, lecture, excludeKey = null) {
    const speakerName = (lecture.speakerKo || '').trim();
    if (!speakerName || speakerName === '미정' || speakerName === '') {
        return { hasConflict: false };
    }

    const speakerAffiliation = (lecture.affiliation || '').trim();
    const targetDuration = lecture.duration || 15;

    const targetStartMin = timeToMinutes(targetTime);
    const targetEndMin = targetStartMin + targetDuration;

    // 1. 기존 강의와의 충돌 체크
    for (const [scheduleKey, existingLecture] of Object.entries(AppState.schedule)) {
        if (excludeKey && scheduleKey === excludeKey) continue;

        const existingSpeaker = (existingLecture.speakerKo || '').trim();
        const existingAffiliation = (existingLecture.affiliation || '').trim();

        if (!existingSpeaker || existingSpeaker === '미정' || existingSpeaker === '') continue;
        if (existingSpeaker !== speakerName) continue;
        if (existingAffiliation !== speakerAffiliation) continue;

        const [existingTime, existingRoom] = [scheduleKey.substring(0, 5), scheduleKey.substring(6)];
        const existingDuration = existingLecture.duration || 15;
        const existingStartMin = timeToMinutes(existingTime);
        const existingEndMin = existingStartMin + existingDuration;

        if (existingRoom === targetRoom) continue;

        const gapAfterExisting = targetStartMin - existingEndMin;
        const gapBeforeExisting = existingStartMin - targetEndMin;

        if (gapAfterExisting < AppConfig.SPEAKER_TRANSFER_TIME && gapBeforeExisting < AppConfig.SPEAKER_TRANSFER_TIME) {
            const existingEndTime = `${Math.floor(existingEndMin / 60).toString().padStart(2, '0')}:${(existingEndMin % 60).toString().padStart(2, '0')}`;
            const targetEndTime = `${Math.floor(targetEndMin / 60).toString().padStart(2, '0')}:${(targetEndMin % 60).toString().padStart(2, '0')}`;

            return {
                hasConflict: true,
                conflictLecture: existingLecture,
                conflictRoom: existingRoom,
                conflictTime: existingTime,
                conflictEndTime: existingEndTime,
                targetEndTime: targetEndTime,
                speakerName: speakerName,
                gap: Math.max(gapAfterExisting, gapBeforeExisting)
            };
        }
    }

    // 2. Panel Discussion 세션과의 충돌 체크
    const panelConflict = checkPanelSessionConflict(targetTime, targetRoom, targetDuration, speakerName, excludeKey);
    if (panelConflict.hasConflict) {
        return panelConflict;
    }

    return { hasConflict: false };
};

/**
 * Panel Discussion 세션과의 충돌 체크
 * 패널리스트는 세션 전체 시간 동안 다른 룸에서 강의 불가
 */
window.checkPanelSessionConflict = function(targetTime, targetRoom, targetDuration, speakerName, excludeKey = null) {
    const targetStartMin = timeToMinutes(targetTime);
    const targetEndMin = targetStartMin + targetDuration;
    
    // Panel Discussion이 배치된 모든 항목 찾기
    for (const [scheduleKey, existingLecture] of Object.entries(AppState.schedule)) {
        if (existingLecture.category !== 'Panel Discussion' && !existingLecture.isPanelDiscussion) continue;
        
        const [panelTime, panelRoom] = [scheduleKey.substring(0, 5), scheduleKey.substring(6)];
        
        // 같은 룸이면 체크 불필요
        if (panelRoom === targetRoom) continue;
        
        // 해당 Panel Discussion이 속한 세션 찾기
        const session = findBelongingSessionForConflict(panelTime, panelRoom);
        if (!session) continue;
        
        // 세션 시간 범위 계산
        const sessionStartMin = timeToMinutes(session.time);
        let sessionEndMin;
        
        if (session.duration) {
            sessionEndMin = sessionStartMin + session.duration;
        } else {
            // duration이 없으면 Panel Discussion 끝 시간까지
            sessionEndMin = timeToMinutes(panelTime) + (existingLecture.duration || 15);
        }
        
        // 세션의 패널리스트(연자들 + 좌장) 가져오기
        const panelInfo = getSessionPanelInfoForConflict(panelTime, panelRoom, session);
        const allPanelists = [...panelInfo.speakers];
        if (panelInfo.moderator) {
            allPanelists.push(panelInfo.moderator);
        }
        
        // 배치하려는 강의의 연자가 패널리스트인지 확인
        if (!allPanelists.includes(speakerName)) continue;
        
        // 시간 충돌 체크 (세션 전체 시간 동안)
        // 이동 시간 포함
        const gapAfterSession = targetStartMin - sessionEndMin;
        const gapBeforeSession = sessionStartMin - targetEndMin;
        
        if (gapAfterSession < AppConfig.SPEAKER_TRANSFER_TIME && gapBeforeSession < AppConfig.SPEAKER_TRANSFER_TIME) {
            const sessionEndTime = `${Math.floor(sessionEndMin / 60).toString().padStart(2, '0')}:${(sessionEndMin % 60).toString().padStart(2, '0')}`;
            const targetEndTime = `${Math.floor(targetEndMin / 60).toString().padStart(2, '0')}:${(targetEndMin % 60).toString().padStart(2, '0')}`;
            
            return {
                hasConflict: true,
                conflictLecture: { titleKo: `Panel Discussion (${session.name || '세션'})` },
                conflictRoom: panelRoom,
                conflictTime: session.time,
                conflictEndTime: sessionEndTime,
                targetEndTime: targetEndTime,
                speakerName: speakerName,
                isPanelConflict: true,
                sessionName: session.name || '세션'
            };
        }
    }
    
    return { hasConflict: false };
};

/**
 * 충돌 체크용 세션 찾기 (내부 함수와 중복 방지)
 */
function findBelongingSessionForConflict(time, room) {
    const timeIndex = AppState.timeSlots.indexOf(time);
    
    for (let i = timeIndex; i >= 0; i--) {
        const checkTime = AppState.timeSlots[i];
        const session = AppState.sessions.find(s => s.time === checkTime && s.room === room);
        if (session) {
            if (session.duration) {
                const sessionEndIndex = i + Math.ceil(session.duration / AppConfig.TIME_UNIT);
                if (timeIndex < sessionEndIndex) {
                    return session;
                }
            } else {
                return session;
            }
        }
    }
    return null;
}

/**
 * 충돌 체크용 패널 정보 가져오기
 */
function getSessionPanelInfoForConflict(panelTime, room, session) {
    let sessionModerator = '';
    let sessionSpeakers = [];
    
    if (session) {
        sessionModerator = session.moderator || '';
        
        const sessionTimeIndex = AppState.timeSlots.indexOf(session.time);
        const panelTimeIndex = AppState.timeSlots.indexOf(panelTime);
        
        // 세션 시작부터 Panel Discussion 시작 전까지의 강의 연자 수집
        Object.entries(AppState.schedule).forEach(([key, lecture]) => {
            if (key.endsWith(`-${room}`) && !lecture.isBreak && lecture.category !== 'Panel Discussion') {
                const lectureTime = key.substring(0, 5);
                const lectureTimeIndex = AppState.timeSlots.indexOf(lectureTime);
                
                if (lectureTimeIndex >= sessionTimeIndex && lectureTimeIndex < panelTimeIndex) {
                    if (lecture.speakerKo && lecture.speakerKo.trim() && lecture.speakerKo !== '미정') {
                        sessionSpeakers.push(lecture.speakerKo);
                    }
                }
            }
        });
    }
    
    sessionSpeakers = [...new Set(sessionSpeakers)];
    
    return {
        moderator: sessionModerator,
        speakers: sessionSpeakers
    };
}

// 다이얼로그 함수들은 modals.js에서 정의됨

console.log('✅ schedule.js 로드 완료');
