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
    const roomWidth = 360; // 고정 폭 (25% 증가)

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

        // 의협제출 표시 아이콘 (상태 표시용)
        const kmaIndicator = document.createElement('span');
        kmaIndicator.className = 'kma-indicator';
        kmaIndicator.dataset.roomIndex = roomIndex;
        const isKma = isStarredRoom(room);
        kmaIndicator.textContent = isKma ? '🏥' : '';
        kmaIndicator.title = isKma ? '의협제출용 룸 (연자 2시간 제한)' : '';
        kmaIndicator.style.cssText = `position:absolute;top:2px;left:24px;font-size:0.8rem;cursor:help;${isKma ? '' : 'display:none;'}`;
        roomHeader.appendChild(kmaIndicator);

        // 왼쪽 이동 버튼
        if (roomIndex > 0) {
            const moveLeftBtn = document.createElement('button');
            moveLeftBtn.textContent = '◀';
            moveLeftBtn.title = '왼쪽으로 이동';
            moveLeftBtn.style.cssText = 'position:absolute;bottom:2px;left:2px;background:rgba(255,255,255,0.3);border:none;color:white;width:18px;height:16px;border-radius:3px;cursor:pointer;font-size:0.5rem;line-height:1;';
            moveLeftBtn.onclick = (e) => {
                e.stopPropagation();
                moveRoom(roomIndex, 'left');
            };
            roomHeader.appendChild(moveLeftBtn);
        }

        // 오른쪽 이동 버튼
        if (roomIndex < AppState.rooms.length - 1) {
            const moveRightBtn = document.createElement('button');
            moveRightBtn.textContent = '▶';
            moveRightBtn.title = '오른쪽으로 이동';
            moveRightBtn.style.cssText = 'position:absolute;bottom:2px;right:22px;background:rgba(255,255,255,0.3);border:none;color:white;width:18px;height:16px;border-radius:3px;cursor:pointer;font-size:0.5rem;line-height:1;';
            moveRightBtn.onclick = (e) => {
                e.stopPropagation();
                moveRoom(roomIndex, 'right');
            };
            roomHeader.appendChild(moveRightBtn);
        }

        // 룸 이름 표시 (별표 포함)
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
    
    // 담당자 행 추가
    const managerRow = document.createElement('tr');
    managerRow.className = 'room-manager-row';
    
    // 시간 열 빈 셀
    const emptyCell = document.createElement('th');
    emptyCell.style.cssText = 'background: #f5f5f5; height: 28px; font-size: 0.75rem; color: #666;';
    emptyCell.textContent = '담당';
    managerRow.appendChild(emptyCell);
    
    // 각 룸의 담당자 선택 + 의협제출 체크박스
    AppState.rooms.forEach((room, roomIndex) => {
        const managerCell = document.createElement('th');
        managerCell.style.cssText = 'background: #f5f5f5; padding: 2px 4px; height: 28px;';
        
        // 컨테이너 (담당자 + 의협제출)
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; align-items: center; gap: 4px; justify-content: space-between;';
        
        // 담당자 선택 드롭다운
        const managerSelect = document.createElement('select');
        managerSelect.id = `roomManager-${roomIndex}`;
        managerSelect.className = 'room-manager-select';
        managerSelect.dataset.room = room;
        managerSelect.style.cssText = 'flex: 1; min-width: 0; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.7rem; background: white; cursor: pointer; text-align: center;';
        
        // 현재 담당자 가져오기
        const currentManager = (AppState.roomManagers || {})[room] || '';
        
        // 옵션 생성
        managerSelect.innerHTML = `<option value="">-- 담당 선택 --</option>`;
        
        // 연자 목록에서 옵션 추가
        const speakers = AppState.speakers || [];
        speakers.forEach(speaker => {
            const name = speaker.name || speaker;
            const selected = name === currentManager ? 'selected' : '';
            managerSelect.innerHTML += `<option value="${name}" ${selected}>${name}</option>`;
        });
        
        // 담당자 변경 이벤트
        managerSelect.addEventListener('change', function() {
            const newManager = this.value;
            const oldManager = (AppState.roomManagers || {})[room] || '';
            
            if (newManager !== oldManager) {
                if (oldManager) {
                    // 기존 담당자가 있는 경우 - 변경 확인
                    if (!confirm(`"${room}" 룸의 담당자를\n"${oldManager}" → "${newManager || '없음'}"(으)로 변경하시겠습니까?`)) {
                        this.value = oldManager;
                        return;
                    }
                } else if (newManager) {
                    // 처음 지정하는 경우
                    if (!confirm(`"${room}" 룸의 담당자를\n"${newManager}"(으)로 지정하시겠습니까?`)) {
                        this.value = '';
                        return;
                    }
                }
                
                // 담당자 저장
                if (!AppState.roomManagers) AppState.roomManagers = {};
                AppState.roomManagers[room] = newManager;
                saveRoomManagers();
            }
        });
        
        container.appendChild(managerSelect);
        
        // 의협제출 체크박스
        const kmaLabel = document.createElement('label');
        kmaLabel.style.cssText = 'display: flex; align-items: center; gap: 2px; cursor: pointer; white-space: nowrap; font-size: 0.65rem; color: #666; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; background: white;';
        kmaLabel.title = '의협제출용 룸 (연자 2시간 제한 적용)';
        
        const kmaCheckbox = document.createElement('input');
        kmaCheckbox.type = 'checkbox';
        kmaCheckbox.className = 'kma-room-checkbox';
        kmaCheckbox.dataset.room = room;
        kmaCheckbox.style.cssText = 'margin: 0; cursor: pointer;';
        
        // 현재 의협제출 상태 확인
        const isKmaRoom = isStarredRoom(room) || (AppState.kmaRooms && AppState.kmaRooms[AppState.currentDate]?.includes(room));
        kmaCheckbox.checked = isKmaRoom;
        
        // 체크 상태에 따른 스타일
        if (isKmaRoom) {
            kmaLabel.style.background = '#FFF3E0';
            kmaLabel.style.borderColor = '#FF9800';
            kmaLabel.style.color = '#E65100';
        }
        
        // 의협제출 변경 이벤트
        kmaCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            
            // kmaRooms 초기화
            if (!AppState.kmaRooms) AppState.kmaRooms = {};
            if (!AppState.kmaRooms[AppState.currentDate]) AppState.kmaRooms[AppState.currentDate] = [];
            
            if (isChecked) {
                // 추가
                if (!AppState.kmaRooms[AppState.currentDate].includes(room)) {
                    AppState.kmaRooms[AppState.currentDate].push(room);
                }
                kmaLabel.style.background = '#FFF3E0';
                kmaLabel.style.borderColor = '#FF9800';
                kmaLabel.style.color = '#E65100';
            } else {
                // 제거
                AppState.kmaRooms[AppState.currentDate] = AppState.kmaRooms[AppState.currentDate].filter(r => r !== room);
                kmaLabel.style.background = 'white';
                kmaLabel.style.borderColor = '#ddd';
                kmaLabel.style.color = '#666';
            }
            
            // Firebase에 저장
            saveKmaRooms();
            console.log(`[의협제출] ${room}: ${isChecked ? '활성화' : '비활성화'}`);
        });
        
        kmaLabel.appendChild(kmaCheckbox);
        kmaLabel.appendChild(document.createTextNode('의협'));
        container.appendChild(kmaLabel);
        
        managerCell.appendChild(container);
        managerRow.appendChild(managerCell);
    });
    
    thead.appendChild(managerRow);
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
    
    // 테이블 생성 후 룸 담당자 로드 (드롭다운이 생성된 후에 값 설정)
    if (typeof loadRoomManagers === 'function') {
        loadRoomManagers();
    }
};

/**
 * 시간표 디스플레이 업데이트
 */
window.updateScheduleDisplay = function() {
    // 방 이름 정규화 함수 (별표, 공백 등 제거하여 비교)
    const normalizeRoomName = (name) => {
        if (!name) return '';
        return name.replace(/^[⭐★☆\s]+/, '').trim();
    };
    
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
        const normalizedCellRoom = normalizeRoomName(room);
        const session = AppState.sessions.find(s => s.time === time && normalizeRoomName(s.room) === normalizedCellRoom);
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
            sessionHeader.dataset.sessionTime = time;
            sessionHeader.dataset.sessionRoom = room;
            sessionHeader.style.background = `linear-gradient(135deg, ${session.color} 0%, ${adjustColor(session.color, -20)} 100%)`;
            sessionHeader.style.cursor = 'grab';
            
            // 좌장명 포맷
            const moderatorText = moderatorName ? ` | ${moderatorLabel}${moderatorName}` : '';
            
            sessionHeader.innerHTML = `
                <div class="session-content" style="display: flex; flex-direction: column; width: calc(100% - 25px); pointer-events: none;">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <span class="session-name" title="${sessionName}${moderatorText} (드래그: 이동 / 더블클릭: 수정)">${sessionName}</span>
                    </div>
                    ${moderatorName ? `<div style="font-size: 0.65rem; opacity: 0.9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${moderatorLabel}${moderatorName}</div>` : ''}
                </div>
                <button class="session-remove" onclick="event.stopPropagation(); removeSession('${time}', '${room}')" title="세션 삭제" style="position: absolute; right: 3px; top: 3px; background: rgba(255,255,255,0.3); border: none; color: white; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; font-size: 0.7rem; pointer-events: auto; line-height: 1;">×</button>
            `;

            // 드래그 시작
            sessionHeader.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                AppState.draggedSession = session;
                sessionHeader.style.opacity = '0.5';
                sessionHeader.style.cursor = 'grabbing';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'session-' + session.id);
            });

            // 드래그 종료
            sessionHeader.addEventListener('dragend', (e) => {
                e.stopPropagation();
                sessionHeader.style.opacity = '1';
                sessionHeader.style.cursor = 'grab';
                AppState.draggedSession = null;
            });

            // 더블클릭으로 수정
            sessionHeader.addEventListener('dblclick', (e) => {
                if (!e.target.classList.contains('session-remove')) {
                    e.preventDefault();
                    e.stopPropagation();
                    editCellSession(time, room);
                }
            });

            // 마우스 다운 시 커서 변경
            sessionHeader.addEventListener('mousedown', (e) => {
                if (!e.target.classList.contains('session-remove') && !e.target.classList.contains('session-edit-btn')) {
                    sessionHeader.style.cursor = 'grabbing';
                }
            });

            // 마우스 업 시 커서 복원
            sessionHeader.addEventListener('mouseup', () => {
                sessionHeader.style.cursor = 'grab';
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
        const normalizedScheduleRoom = normalizeRoomName(room);

        const startIndex = AppState.timeSlots.indexOf(startTime);
        if (startIndex === -1) return;

        const duration = lecture.duration || 15;
        const slotsSpan = Math.ceil(duration / AppConfig.TIME_UNIT);

        let startCell = null;
        document.querySelectorAll('.schedule-cell').forEach(cell => {
            const cellRoom = cell.dataset.room;
            const normalizedCellRoom = normalizeRoomName(cellRoom);
            if (cell.dataset.time === startTime && normalizedCellRoom === normalizedScheduleRoom) {
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
        const sessionAtSameTime = AppState.sessions.find(s => s.time === startTime && normalizeRoomName(s.room) === normalizedScheduleRoom);
        const sessionHeaderHeight = sessionAtSameTime ? 25 : 0; // 세션 헤더 높이
        
        // Lunch 카테고리인지 확인
        const isLunch = category === 'Lunch';
        
        lectureDiv.className = 'scheduled-lecture' + (isInSession ? ' in-session' : '') + (isBreak ? ' break-item' : '') + (isPanelDiscussion ? ' panel-discussion' : '') + (isLuncheon ? ' luncheon-lecture' : '') + (isLunch ? ' lunch-item' : '');
        lectureDiv.draggable = true;
        lectureDiv.dataset.scheduleKey = key;
        lectureDiv.tabIndex = 0;
        
        // z-index 설정: Lunch는 1, 일반 강의는 10 (강의가 Lunch 위에 표시됨)
        if (isLunch) {
            lectureDiv.style.zIndex = '1';
            lectureDiv.style.opacity = '0.7'; // Lunch를 약간 투명하게
        } else {
            lectureDiv.style.zIndex = '10';
        }
        
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

        const cellHeight = 34; // CSS height 33px + border-spacing 1px (25% 증가)
        const totalHeight = slotsSpan * cellHeight;
        // 세션 헤더가 있으면 강의를 아래로 내리고 높이 조정
        lectureDiv.style.height = `${totalHeight - sessionHeaderHeight - 2}px`; // 2px 여백
        lectureDiv.style.top = `${sessionHeaderHeight}px`;

        const title = AppState.currentLanguage === 'en' && lecture.titleEn ? lecture.titleEn : lecture.titleKo;
        const speaker = AppState.currentLanguage === 'en' && lecture.speakerEn ? lecture.speakerEn : lecture.speakerKo;

        // 종료 시간 계산
        const endTime = addMinutesToTime(startTime, duration);
        const timeRangeDisplay = `${startTime}~${endTime} ⏱️${duration}분`;

        // 파트너사/제품 정보 준비
        let sponsorText = '';
        if (lecture.companyName || lecture.productName) {
            const parts = [];
            if (lecture.companyName) parts.push(lecture.companyName);
            if (lecture.productName) parts.push(lecture.productName);
            sponsorText = parts.join(' - ');
        }

        // 호버 시 전체 제목 표시를 위한 data 속성
        // 순서: 제목 → 연자+소속+시간 → 파트너사
        let tooltipLine2 = `👤 ${speaker || '미정'}`;
        if (lecture.affiliation) {
            tooltipLine2 += `  🏥 ${lecture.affiliation}`;
        }
        tooltipLine2 += `  ⏱️ ${timeRangeDisplay}`;
        
        let fullTooltip = `📌 ${title}\n${tooltipLine2}`;
        if (sponsorText) {
            fullTooltip += `\n🏢 ${sponsorText}`;
        }
        lectureDiv.dataset.fullTitle = fullTooltip;
        lectureDiv.title = fullTooltip; // 기본 브라우저 툴팁

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
            // 런천강의 - 별표 + 파트너사 표시
            titleDisplay = `⭐ ${title}`;
            const sponsorInfo = lecture.companyName ? ` (${lecture.companyName})` : '';
            const affiliationInfo = lecture.affiliation ? ` (${lecture.affiliation})` : '';
            metaDisplay = `<span class="speaker-name" style="color: #333;">${speaker || '미정'}${affiliationInfo}${sponsorInfo}</span><span class="duration-badge">${timeRangeDisplay}</span>`;
        } else if (isBreak && !isPanelDiscussion) {
            metaDisplay = `<span class="duration-badge">${timeRangeDisplay}</span>`;
        } else {
            // 일반 강의 - 연자 (소속)
            const affiliationInfo = lecture.affiliation ? ` (${lecture.affiliation})` : '';
            metaDisplay = `<span class="speaker-name" style="color: #333;">${speaker || '미정'}${affiliationInfo}</span><span class="duration-badge">${timeRangeDisplay}</span>`;
        }
        
        // 파트너사/제품명 별도 줄로 표시
        let sponsorLine = '';
        if (sponsorText) {
            sponsorLine = `<div class="sponsor-line" style="font-size: 0.6rem; color: #888; margin-top: 2px;">🏢 ${sponsorText}</div>`;
        }

        lectureDiv.innerHTML = `
            <button class="remove-btn" onclick="event.stopPropagation(); removeLecture('${key}')">×</button>
            <div class="lecture-title-display" style="color: #333;">${titleDisplay}</div>
            <div class="lecture-meta-display">
                ${metaDisplay}
            </div>
            ${sponsorLine}
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
    const normalizedRoom = normalizeRoomName(room);
    
    // 해당 시간 이전의 가장 가까운 세션 찾기
    for (let i = timeIndex; i >= 0; i--) {
        const checkTime = AppState.timeSlots[i];
        const session = AppState.sessions.find(s => s.time === checkTime && normalizeRoomName(s.room) === normalizedRoom);
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
    const normalizedRoom = normalizeRoomName(room);
    
    if (session) {
        sessionModerator = session.moderator || '';
        
        const sessionTimeIndex = AppState.timeSlots.indexOf(session.time);
        const panelTimeIndex = AppState.timeSlots.indexOf(time);
        
        // 세션 시작부터 Panel Discussion 시작 전까지의 강의 연자 수집
        Object.entries(AppState.schedule).forEach(([key, lecture]) => {
            const keyRoom = key.substring(6);
            if (normalizeRoomName(keyRoom) === normalizedRoom && !lecture.isBreak && lecture.category !== 'Panel Discussion') {
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
        // 스케줄 키는 별표 없이 저장 (별표는 의협 제출용 표시일 뿐)
        const normalizedRoom = window.normalizeRoomName ? window.normalizeRoomName(room) : room.replace(/^[⭐★☆\s]+/, '').trim();
        const key = `${time}-${normalizedRoom}`;
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
        let isPlacingOnLunch = false;
        if (AppState.schedule[key]) {
            if (!AppState.draggedScheduleKey || AppState.draggedScheduleKey !== key) {
                // Lunch 위에 강의를 놓는 경우는 스왑 대신 중복 배치 허용
                const existingLecture = AppState.schedule[key];
                if (existingLecture.category === 'Lunch') {
                    // Lunch 위에는 강의 배치 허용 - 스왑 다이얼로그 건너뛰기
                    isPlacingOnLunch = true;
                    console.log('Lunch 위에 강의 배치 허용');
                } else {
                    showSwapDialog(key, time, room, AppState.draggedLecture, AppState.draggedScheduleKey);
                    return;
                }
            }
        }
        
        // Lunch 시간대인지 확인 (직접 Lunch 셀이 아니더라도 Lunch 시간대에 겹치는 경우)
        if (!isPlacingOnLunch) {
            for (const [scheduleKey, scheduledLecture] of Object.entries(AppState.schedule)) {
                if (scheduledLecture.category === 'Lunch') {
                    const [lunchTime, lunchRoom] = [scheduleKey.substring(0, 5), scheduleKey.substring(6)];
                    // 방 이름 정규화 비교
                    if (normalizeRoomName(lunchRoom) !== normalizedRoom) continue;
                    
                    const lunchStartMin = timeToMinutes(lunchTime);
                    const lunchEndMin = lunchStartMin + (scheduledLecture.duration || 60);
                    const targetStartMin = timeToMinutes(time);
                    const targetEndMin = targetStartMin + (AppState.draggedLecture.duration || 15);
                    
                    // 시간이 겹치면 Lunch 위에 배치하는 것으로 간주
                    if (targetStartMin < lunchEndMin && targetEndMin > lunchStartMin) {
                        isPlacingOnLunch = true;
                        break;
                    }
                }
            }
        }
        
        // Lunch 위에 배치하는데 런천강의가 아닌 경우 안내
        if (isPlacingOnLunch && !isBreak && !AppState.draggedLecture.isLuncheon) {
            alert(`⭐ 런천강의로 지정됩니다!\n\n"${AppState.draggedLecture.titleKo}" 강의가\nLunch 시간대에 배치되어 런천강의(Luncheon Lecture)로\n자동 지정됩니다.`);
            // 런천강의 태그 추가
            AppState.draggedLecture.isLuncheon = true;
            
            // 원본 강의 데이터도 업데이트
            const originalLecture = AppState.lectures.find(l => l.id === AppState.draggedLecture.id);
            if (originalLecture) {
                originalLecture.isLuncheon = true;
            }
        }

        // 시간 겹침 체크 (Lunch와 강의는 중복 허용)
        const overlapCheck = checkTimeOverlap(time, room, AppState.draggedLecture.duration || 15, AppState.draggedScheduleKey, AppState.draggedLecture);
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
                if (speakerConflict.conflictType === 'moderator') {
                    // 좌장 충돌
                    alertMessage = `⚠️ 좌장 시간 충돌!\n\n연자: ${speakerConflict.speakerName}\n\n이 연자는 "${speakerConflict.sessionName}" 세션의 좌장입니다.\n\n📋 세션 정보:\n룸: ${speakerConflict.conflictRoom}\n시간: ${speakerConflict.conflictTime} ~ ${speakerConflict.conflictEndTime}\n\n❌ 배치하려는 시간: ${time} ~ ${speakerConflict.targetEndTime}\n룸: ${room}\n\n💡 좌장은 해당 세션 시간 동안 다른 룸에서 강의할 수 없습니다.\n⏱️ 다른 룸 간 이동시간 최소 ${AppConfig.SPEAKER_TRANSFER_TIME}분 필요\n\n다른 시간대를 선택해주세요.`;
                } else if (speakerConflict.isPanelConflict) {
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
            
            // 연자 총 활동 시간 체크 (2시간 제한) - 별표 룸에서만 적용
            const speakerName = AppState.draggedLecture.speakerKo;
            if (speakerName) {
                const lectureDuration = AppState.draggedLecture.duration || 10;
                const timeCheck = checkSpeakerTimeLimit(speakerName, lectureDuration, AppState.draggedScheduleKey, null, room);
                
                if (timeCheck.isOverLimit && timeCheck.isStarredRoom) {
                    const detailsText = timeCheck.details.map(d => 
                        `  • ${d.type}: ${d.title} (${d.room}, ${d.time}, ${d.duration}분)`
                    ).join('\n');
                    
                    const confirmMsg = `⚠️ 연자 총 활동 시간 초과! (⭐별표 룸 기준)\n\n` +
                        `연자: ${speakerName}\n\n` +
                        `📊 현재 활동 시간 (별표 룸):\n` +
                        `  • 강의: ${formatMinutesToHM(timeCheck.lectureMinutes)}\n` +
                        `  • 좌장: ${formatMinutesToHM(timeCheck.moderatorMinutes)}\n` +
                        `  • 합계: ${formatMinutesToHM(timeCheck.currentMinutes)}\n\n` +
                        `➕ 배치하려는 강의: ${lectureDuration}분\n` +
                        `📈 새 합계: ${formatMinutesToHM(timeCheck.newTotalMinutes)}\n\n` +
                        `⏰ 최대 허용 시간: ${formatMinutesToHM(timeCheck.maxMinutes)}\n\n` +
                        (timeCheck.details.length > 0 ? `📋 현재 배치된 항목 (별표 룸):\n${detailsText}\n\n` : '') +
                        `그래도 배치하시겠습니까?`;
                    
                    if (!confirm(confirmMsg)) {
                        AppState.draggedScheduleKey = null;
                        AppState.draggedLecture = null;
                        AppState.draggedIsBreak = false;
                        return;
                    }
                }
            }
        }

        saveStateForUndo();

        // 시간표 내 이동인 경우 기존 위치에서 삭제
        if (AppState.draggedScheduleKey && AppState.draggedScheduleKey !== key) {
            delete AppState.schedule[AppState.draggedScheduleKey];
            // Firebase에서도 삭제
            if (typeof saveScheduleItem === 'function') {
                saveScheduleItem(AppState.draggedScheduleKey, null);
            }
        }

        // 강의 배치
        const newLecture = { ...AppState.draggedLecture };
        
        // Break 항목은 새 ID 생성 (중복 배치 가능)
        if (isBreak && !AppState.draggedScheduleKey) {
            newLecture.id = `break-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // 세션 자동 할당
        const normalizedRoomForSession = normalizeRoomName(room);
        const sessionAtCell = AppState.sessions.find(s => s.time === time && normalizeRoomName(s.room) === normalizedRoomForSession);
        if (sessionAtCell) {
            newLecture.sessionId = sessionAtCell.id;
        } else {
            const timeIndex = AppState.timeSlots.indexOf(time);
            for (let i = timeIndex - 1; i >= 0; i--) {
                const upperSession = AppState.sessions.find(s => s.time === AppState.timeSlots[i] && normalizeRoomName(s.room) === normalizedRoomForSession);
                if (upperSession) {
                    newLecture.sessionId = upperSession.id;
                    break;
                }
            }
        }

        AppState.schedule[key] = newLecture;
        
        // 개별 스케줄 항목 저장 (동시 작업 충돌 방지)
        if (typeof saveScheduleItem === 'function') {
            saveScheduleItem(key, newLecture);
        }
        
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

        const normalizedDropRoom = normalizeRoomName(room);
        if (AppState.draggedSession.time === time && normalizeRoomName(AppState.draggedSession.room) === normalizedDropRoom) {
            AppState.draggedSession = null;
            return;
        }

        const existingSession = AppState.sessions.find(s => s.time === time && normalizeRoomName(s.room) === normalizedDropRoom);
        if (existingSession) {
            alert('이 위치에 이미 세션이 있습니다.');
            AppState.draggedSession = null;
            return;
        }

        saveStateForUndo();
        AppState.draggedSession.time = time;
        // 세션 룸도 정규화된 이름으로 저장
        AppState.draggedSession.room = normalizedDropRoom;

        saveAndSync();
        updateScheduleDisplay();
        AppState.draggedSession = null;
    }
};

/**
 * 시간 겹침 체크
 */
window.checkTimeOverlap = function(targetTime, targetRoom, targetDuration, excludeKey = null, draggedLecture = null) {
    const targetStartIndex = AppState.timeSlots.indexOf(targetTime);
    if (targetStartIndex === -1) return { hasOverlap: false };

    const targetEndIndex = targetStartIndex + Math.ceil(targetDuration / 5);
    const targetEndTime = AppState.timeSlots[Math.min(targetEndIndex, AppState.timeSlots.length - 1)] || AppState.timeSlots[AppState.timeSlots.length - 1];

    // 배치하려는 강의가 런천강의인지 확인
    const isLuncheonLecture = draggedLecture && (draggedLecture.isLuncheon || draggedLecture.category === 'Luncheon');

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
            // Lunch와 런천강의(또는 일반 강의)는 중복 허용
            const isExistingLunch = lecture.category === 'Lunch';
            const isExistingLuncheon = lecture.isLuncheon || lecture.category === 'Luncheon';
            
            // 기존이 Lunch이고 새로 배치하는 것이 강의면 허용
            if (isExistingLunch) {
                continue; // 중복 허용, 다음 항목 확인
            }
            
            // 새로 배치하는 것이 Lunch이고 기존이 강의면 허용
            if (draggedLecture && draggedLecture.category === 'Lunch') {
                continue; // 중복 허용
            }
            
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

        // 방 이름 정규화 비교 (별표 무시)
        if (normalizeRoomName(existingRoom) === normalizeRoomName(targetRoom)) continue;

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

    // 2. 좌장 충돌 체크 (연자가 다른 세션의 좌장인 경우)
    const moderatorConflict = checkModeratorConflict(targetTime, targetRoom, { speakerKo: speakerName, duration: targetDuration }, excludeKey);
    if (moderatorConflict.hasConflict) {
        return moderatorConflict;
    }

    // 3. Panel Discussion 세션과의 충돌 체크
    const panelConflict = checkPanelSessionConflict(targetTime, targetRoom, targetDuration, speakerName, excludeKey);
    if (panelConflict.hasConflict) {
        return panelConflict;
    }

    return { hasConflict: false };
};

/**
 * 좌장 충돌 체크
 * 세션에 좌장으로 배정된 사람은 해당 세션 시간 동안 다른 룸에서 강의 불가 (이동시간 20분 포함)
 */
window.checkModeratorConflict = function(targetTime, targetRoom, lecture, excludeKey = null) {
    const speakerName = (lecture.speakerKo || '').trim();
    console.log('🔍 좌장 충돌 체크 시작:', { speakerName, targetTime, targetRoom });
    
    if (!speakerName || speakerName === '미정' || speakerName === '') {
        console.log('⏭️ 연자명 없음, 스킵');
        return { hasConflict: false };
    }

    const targetDuration = lecture.duration || 15;
    const targetStartMin = timeToMinutes(targetTime);
    const targetEndMin = targetStartMin + targetDuration;

    console.log('📋 현재 세션 목록:', AppState.sessions.length, '개');
    
    // 모든 세션 확인
    for (const session of AppState.sessions) {
        // 좌장이 없거나 다른 사람이면 스킵
        const moderatorName = (session.moderator || '').trim();
        console.log(`  세션 "${session.name}" 좌장: "${moderatorName}" vs 연자: "${speakerName}"`);
        if (!moderatorName || moderatorName !== speakerName) continue;
        
        console.log('⚠️ 좌장 매칭됨!', { sessionRoom: session.room, targetRoom });

        // 같은 룸이면 스킵 (같은 룸에서는 좌장이 강의 가능) - 방 이름 정규화 비교
        if (normalizeRoomName(session.room) === normalizeRoomName(targetRoom)) {
            console.log('⏭️ 같은 룸, 스킵');
            continue;
        }

        // 세션 시간 범위 계산
        const sessionStartMin = timeToMinutes(session.time);
        let sessionEndMin;

        if (session.duration && session.duration > 0) {
            sessionEndMin = sessionStartMin + session.duration;
        } else {
            // duration이 없으면 해당 룸에서 다음 세션이나 마지막 강의까지
            sessionEndMin = findSessionEndTime(session);
        }
        
        console.log('⏰ 세션 시간:', { 
            sessionStart: session.time, 
            sessionStartMin, 
            sessionEndMin,
            targetStartMin,
            targetEndMin 
        });

        // 이동 시간 포함 충돌 체크
        const gapAfterSession = targetStartMin - sessionEndMin;
        const gapBeforeSession = sessionStartMin - targetEndMin;
        
        console.log('📏 간격 계산:', { 
            gapAfterSession, 
            gapBeforeSession, 
            transferTime: AppConfig.SPEAKER_TRANSFER_TIME 
        });

        if (gapAfterSession < AppConfig.SPEAKER_TRANSFER_TIME && gapBeforeSession < AppConfig.SPEAKER_TRANSFER_TIME) {
            console.log('🚨 충돌 감지!');
            const sessionEndTime = `${Math.floor(sessionEndMin / 60).toString().padStart(2, '0')}:${(sessionEndMin % 60).toString().padStart(2, '0')}`;
            const targetEndTime = `${Math.floor(targetEndMin / 60).toString().padStart(2, '0')}:${(targetEndMin % 60).toString().padStart(2, '0')}`;

            return {
                hasConflict: true,
                conflictType: 'moderator',
                sessionName: session.name || '세션',
                conflictRoom: session.room,
                conflictTime: session.time,
                conflictEndTime: sessionEndTime,
                targetEndTime: targetEndTime,
                speakerName: speakerName,
                gap: Math.max(gapAfterSession, gapBeforeSession)
            };
        }
    }

    return { hasConflict: false };
};

/**
 * 세션 종료 시간 찾기 (duration이 없는 경우)
 */
function findSessionEndTime(session) {
    const sessionStartMin = timeToMinutes(session.time);
    const sessionTimeIndex = AppState.timeSlots.indexOf(session.time);
    let lastLectureEndMin = sessionStartMin + 60; // 기본 60분

    // 해당 세션의 룸에서 세션 시작 이후의 강의들 확인
    for (const [key, lecture] of Object.entries(AppState.schedule)) {
        const [lectureTime, lectureRoom] = [key.substring(0, 5), key.substring(6)];
        if (normalizeRoomName(lectureRoom) !== normalizeRoomName(session.room)) continue;

        const lectureTimeIndex = AppState.timeSlots.indexOf(lectureTime);
        if (lectureTimeIndex < sessionTimeIndex) continue;

        // 다음 세션이 있으면 그 전까지만
        const nextSession = AppState.sessions.find(s => 
            normalizeRoomName(s.room) === normalizeRoomName(session.room) && 
            s.id !== session.id && 
            AppState.timeSlots.indexOf(s.time) > sessionTimeIndex
        );

        if (nextSession) {
            const nextSessionTimeIndex = AppState.timeSlots.indexOf(nextSession.time);
            if (lectureTimeIndex >= nextSessionTimeIndex) continue;
        }

        const lectureStartMin = timeToMinutes(lectureTime);
        const lectureEndMin = lectureStartMin + (lecture.duration || 15);
        
        if (lectureEndMin > lastLectureEndMin) {
            lastLectureEndMin = lectureEndMin;
        }
    }

    return lastLectureEndMin;
}

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
    const normalizedRoom = normalizeRoomName(room);
    
    for (let i = timeIndex; i >= 0; i--) {
        const checkTime = AppState.timeSlots[i];
        const session = AppState.sessions.find(s => s.time === checkTime && normalizeRoomName(s.room) === normalizedRoom);
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

/**
 * 룸 순서 이동
 */
window.moveRoom = function(roomIndex, direction) {
    const targetIndex = direction === 'left' ? roomIndex - 1 : roomIndex + 1;
    
    // 범위 체크
    if (targetIndex < 0 || targetIndex >= AppState.rooms.length) {
        return;
    }
    
    saveStateForUndo();
    
    const currentRoom = AppState.rooms[roomIndex];
    const targetRoom = AppState.rooms[targetIndex];
    
    // 룸 배열에서 위치 교환
    AppState.rooms[roomIndex] = targetRoom;
    AppState.rooms[targetIndex] = currentRoom;
    
    // 저장 및 UI 업데이트
    saveRoomsToStorage();
    createScheduleTable();
    updateScheduleDisplay();
    
    console.log(`룸 이동: ${currentRoom} ↔ ${targetRoom}`);
};

/**
 * 룸 의협제출 토글 (새 방식 - kmaRooms 사용)
 * 기존 별표 방식은 호환성 유지
 */
window.toggleRoomStar = function(roomIndex) {
    const room = AppState.rooms[roomIndex];
    
    // 새 방식: kmaRooms로 관리
    if (!AppState.kmaRooms) AppState.kmaRooms = {};
    if (!AppState.kmaRooms[AppState.currentDate]) AppState.kmaRooms[AppState.currentDate] = [];
    
    const isCurrentlyKma = isStarredRoom(room);
    
    if (isCurrentlyKma) {
        // 제거
        AppState.kmaRooms[AppState.currentDate] = AppState.kmaRooms[AppState.currentDate].filter(r => normalizeRoomName(r) !== normalizeRoomName(room));
    } else {
        // 추가
        if (!AppState.kmaRooms[AppState.currentDate].some(r => normalizeRoomName(r) === normalizeRoomName(room))) {
            AppState.kmaRooms[AppState.currentDate].push(room);
        }
    }
    
    saveKmaRooms();
    updateKmaCheckboxes();
    
    console.log(`[의협제출] ${room}: ${!isCurrentlyKma ? '활성화' : '비활성화'}`);
};

/**
 * 룸 담당자 저장
 */
window.saveRoomManagers = function() {
    const currentDate = AppState.currentDate;
    database.ref(`/settings/roomManagers/${currentDate}`).set(AppState.roomManagers || {})
        .then(() => console.log('룸 담당자 저장 완료'))
        .catch(err => console.error('룸 담당자 저장 실패:', err));
};

/**
 * 룸 담당자 로드
 */
window.loadRoomManagers = function() {
    const currentDate = AppState.currentDate;
    database.ref(`/settings/roomManagers/${currentDate}`).once('value', (snapshot) => {
        if (snapshot.exists()) {
            AppState.roomManagers = snapshot.val();
            console.log('룸 담당자 로드 완료:', AppState.roomManagers);
        } else {
            AppState.roomManagers = {};
        }
        // 담당자 로드 후 드롭다운 업데이트
        updateRoomManagerDropdowns();
    });
};

/**
 * 룸 담당자 드롭다운 업데이트
 */
window.updateRoomManagerDropdowns = function() {
    AppState.rooms.forEach((room, index) => {
        const select = document.getElementById(`roomManager-${index}`);
        if (select) {
            const currentManager = (AppState.roomManagers || {})[room] || '';
            select.value = currentManager;
        }
    });
};

console.log('✅ schedule.js 로드 완료');
