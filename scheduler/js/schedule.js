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

    // 헤더
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const timeHeader = document.createElement('th');
    timeHeader.textContent = '시간';
    headerRow.appendChild(timeHeader);

    AppState.rooms.forEach((room, roomIndex) => {
        const roomHeader = document.createElement('th');
        roomHeader.style.position = 'relative';

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
        const lightColor = adjustColor(color, 40);
        const lectureDiv = document.createElement('div');

        const session = AppState.sessions.find(s => s.time === startTime && s.room === room);
        const isInSession = lecture.sessionId || session;
        lectureDiv.className = 'scheduled-lecture' + (isInSession ? ' in-session' : '');
        lectureDiv.draggable = true;
        lectureDiv.dataset.scheduleKey = key;
        lectureDiv.tabIndex = 0;
        lectureDiv.style.background = `linear-gradient(135deg, ${lightColor} 0%, ${color} 100%)`;

        const cellHeight = 20;
        const totalHeight = slotsSpan * cellHeight;
        lectureDiv.style.height = `${totalHeight}px`;
        lectureDiv.style.top = '0px';

        const title = AppState.currentLanguage === 'en' && lecture.titleEn ? lecture.titleEn : lecture.titleKo;
        const speaker = AppState.currentLanguage === 'en' && lecture.speakerEn ? lecture.speakerEn : lecture.speakerKo;

        lectureDiv.innerHTML = `
            <button class="remove-btn" onclick="event.stopPropagation(); removeLecture('${key}')">×</button>
            <div class="lecture-title-display">${title}</div>
            <div class="lecture-meta-display">
                <span class="speaker-name">${speaker || '미정'}</span>
                <span class="duration-badge">⏱️ ${duration}분</span>
            </div>
        `;

        lectureDiv.addEventListener('dragstart', handleScheduleDragStart);
        lectureDiv.addEventListener('dragend', handleScheduleDragEnd);
        lectureDiv.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openEditModal(lecture.id);
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
 * 드래그 시작 (강의 목록에서)
 */
window.handleDragStart = function(e) {
    AppState.draggedLecture = AppState.lectures.find(l => l.id == this.dataset.lectureId);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.lectureId);

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
};

/**
 * 시간표 내 드래그 시작
 */
window.handleScheduleDragStart = function(e) {
    AppState.draggedScheduleKey = this.dataset.scheduleKey;
    AppState.draggedLecture = AppState.schedule[AppState.draggedScheduleKey];
    this.style.opacity = '0.5';
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
        return;
    }

    if (AppState.draggedLecture) {
        const time = this.dataset.time;
        const room = this.dataset.room;
        const key = `${time}-${room}`;

        // 이미 배치된 강의인지 확인
        if (!AppState.draggedScheduleKey) {
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
            return;
        }

        // 연자 중복 체크
        const speakerConflict = checkSpeakerConflict(time, room, AppState.draggedLecture, AppState.draggedScheduleKey);
        if (speakerConflict.hasConflict) {
            alert(`⚠️ 연자 시간 충돌!\n\n연자: ${speakerConflict.speakerName}\n\n기존 강의: "${speakerConflict.conflictLecture.titleKo}"\n룸: ${speakerConflict.conflictRoom}\n시간: ${speakerConflict.conflictTime} ~ ${speakerConflict.conflictEndTime}\n\n배치하려는 시간: ${time} ~ ${speakerConflict.targetEndTime}\n룸: ${room}\n\n⏱️ 다른 룸 간 이동시간 최소 ${AppConfig.SPEAKER_TRANSFER_TIME}분 필요\n\n다른 시간대를 선택해주세요.`);
            AppState.draggedScheduleKey = null;
            AppState.draggedLecture = null;
            return;
        }

        saveStateForUndo();

        // 시간표 내 이동인 경우 기존 위치에서 삭제
        if (AppState.draggedScheduleKey && AppState.draggedScheduleKey !== key) {
            delete AppState.schedule[AppState.draggedScheduleKey];
        }

        // 강의 배치
        const newLecture = { ...AppState.draggedLecture };

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

    return { hasConflict: false };
};

// 다이얼로그 함수들은 modals.js에서 정의됨

console.log('✅ schedule.js 로드 완료');
