/**
 * lectures.js - 강의 CRUD 및 관리
 * 수정사항:
 * 1. openEditModal에서 ID 타입 비교 문제 해결 (== 사용)
 * 2. 수정 모달에 연자 자동완성 기능 추가
 * 3. schedule에서 직접 강의를 찾는 로직 추가
 */

/**
 * 연자별 일자별 강의 통계 계산
 */
window.getSpeakerLectureStats = function(speakerName) {
    if (!speakerName) return null;
    
    const stats = {
        total: 0,
        scheduled: 0,
        byDate: {} // { '2026-04-11': { total: 0, scheduled: 0 }, ... }
    };
    
    // 날짜별 초기화
    AppConfig.CONFERENCE_DATES.forEach(d => {
        stats.byDate[d.date] = { total: 0, scheduled: 0, label: d.label };
    });
    
    // 전체 강의에서 해당 연자 강의 찾기
    AppState.lectures.forEach(lecture => {
        const lectureSpeaker = (lecture.speakerKo || '').toLowerCase();
        if (lectureSpeaker.includes(speakerName.toLowerCase())) {
            stats.total++;
        }
    });
    
    // 스케줄에서 일자별로 찾기
    Object.entries(AppState.dataByDate || {}).forEach(([date, dateData]) => {
        if (!dateData) return;
        
        // 해당 날짜의 강의 목록
        const dateLectures = dateData.lectures || [];
        dateLectures.forEach(lecture => {
            const lectureSpeaker = (lecture.speakerKo || '').toLowerCase();
            if (lectureSpeaker.includes(speakerName.toLowerCase())) {
                if (stats.byDate[date]) {
                    stats.byDate[date].total++;
                }
            }
        });
        
        // 해당 날짜의 스케줄 (배치된 강의)
        const dateSchedule = dateData.schedule || {};
        Object.values(dateSchedule).forEach(lecture => {
            const lectureSpeaker = (lecture.speakerKo || '').toLowerCase();
            if (lectureSpeaker.includes(speakerName.toLowerCase())) {
                stats.scheduled++;
                if (stats.byDate[date]) {
                    stats.byDate[date].scheduled++;
                }
            }
        });
    });
    
    return stats;
};

/**
 * 강의 목록 업데이트
 */
window.updateLectureList = function() {
    const list = document.getElementById('lectureList');
    list.innerHTML = '';

    // 시간표에 배치된 강의 ID 목록
    const scheduledLectureIds = Object.values(AppState.schedule).map(s => s.id);

    // Break 항목은 별도 처리 (항상 표시, 중복 가능)
    const breakTypes = AppConfig.BREAK_TYPES || [];
    
    // 일반 강의와 Break 항목 분리
    const regularLectures = AppState.lectures.filter(l => !l.isBreak);
    const breakItems = DEFAULT_BREAK_ITEMS || [];

    // 카테고리 필터 적용 (일반 강의만)
    let filteredLectures;
    if (AppState.activeFilter === 'all') {
        filteredLectures = regularLectures;
    } else if (AppState.activeFilter === 'Luncheon') {
        // 런천강의 필터: isLuncheon=true인 강의만
        filteredLectures = regularLectures.filter(l => l.isLuncheon);
    } else {
        filteredLectures = regularLectures.filter(l => l.category === AppState.activeFilter);
    }

    // 퀵필터 적용 (일반 강의만)
    if (AppState.quickFilter === 'unscheduled') {
        filteredLectures = filteredLectures.filter(l => !scheduledLectureIds.includes(l.id));
    } else if (AppState.quickFilter === 'noSpeaker') {
        filteredLectures = filteredLectures.filter(l => !l.speakerKo || l.speakerKo === '미정' || l.speakerKo.trim() === '');
    }

    // 검색어 필터 적용
    if (AppState.lectureSearchTerm) {
        filteredLectures = filteredLectures.filter(l => {
            const titleMatch = (l.titleKo || '').toLowerCase().includes(AppState.lectureSearchTerm) ||
                (l.titleEn || '').toLowerCase().includes(AppState.lectureSearchTerm);
            const speakerMatch = (l.speakerKo || '').toLowerCase().includes(AppState.lectureSearchTerm) ||
                (l.speakerEn || '').toLowerCase().includes(AppState.lectureSearchTerm);
            const affiliationMatch = (l.affiliation || '').toLowerCase().includes(AppState.lectureSearchTerm);
            const companyMatch = (l.companyName || '').toLowerCase().includes(AppState.lectureSearchTerm);
            const productMatch = (l.productName || '').toLowerCase().includes(AppState.lectureSearchTerm);
            return titleMatch || speakerMatch || affiliationMatch || companyMatch || productMatch;
        });
    }

    // Break 항목 필터 (카테고리 필터가 Break 타입이면 해당 Break만 표시)
    let filteredBreaks = [];
    if (AppState.activeFilter === 'all' || breakTypes.includes(AppState.activeFilter)) {
        if (AppState.activeFilter === 'all') {
            filteredBreaks = breakItems;
        } else {
            filteredBreaks = breakItems.filter(b => b.category === AppState.activeFilter);
        }
    }
    
    // 퀵필터가 있으면 Break 항목 숨김
    if (AppState.quickFilter) {
        filteredBreaks = [];
    }

    // Break 항목 먼저 렌더링 (검색어 없고, 퀵필터 없을 때만)
    if (!AppState.lectureSearchTerm && filteredBreaks.length > 0) {
        const breakSection = document.createElement('div');
        breakSection.className = 'break-section';
        breakSection.style.cssText = 'margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 2px dashed #ddd;';
        
        filteredBreaks.forEach(lecture => {
            const item = createLectureItem(lecture, -1, false, true);
            breakSection.appendChild(item);
        });
        
        list.appendChild(breakSection);
    }

    if (filteredLectures.length === 0 && filteredBreaks.length === 0) {
        let message = '강의가 없습니다';
        if (AppState.lectureSearchTerm) {
            message = `"${AppState.lectureSearchTerm}" 검색 결과가 없습니다`;
        } else if (AppState.quickFilter === 'unscheduled') {
            message = '미배치 강의가 없습니다 🎉';
        } else if (AppState.quickFilter === 'noSpeaker') {
            message = '연자 미정 강의가 없습니다 🎉';
        }
        list.innerHTML = `<p style="text-align: center; color: var(--text-light); padding: 2rem;">${message}</p>`;
        return;
    }

    // 검색어가 있을 때 연자별 일자별 통계 표시
    if (AppState.lectureSearchTerm) {
        // 검색 결과에서 연자 목록 추출 (중복 제거)
        const speakersInResults = [...new Set(
            filteredLectures
                .map(l => l.speakerKo)
                .filter(s => s && s !== '미정' && s.trim() !== '')
        )];
        
        if (speakersInResults.length > 0 && speakersInResults.length <= 5) {
            // 연자별 통계 계산
            let statsHtml = '<div class="search-stats" style="background: #f0f4ff; padding: 0.75rem; border-radius: 8px; margin-bottom: 0.75rem; font-size: 0.8rem;">';
            statsHtml += '<div style="font-weight: bold; margin-bottom: 0.5rem;">📊 연자별 강의 현황</div>';
            
            speakersInResults.forEach(speaker => {
                // 해당 연자의 전체 강의 수 (현재 강의목록에서)
                const speakerLectures = filteredLectures.filter(l => (l.speakerKo || '') === speaker);
                const totalLectures = speakerLectures.length;
                
                // 일자별 배치된 강의 수 및 시간
                let satScheduled = 0, sunScheduled = 0;
                let satMinutes = 0, sunMinutes = 0;
                let satModerator = 0, sunModerator = 0;
                let satModeratorMinutes = 0, sunModeratorMinutes = 0;
                
                AppConfig.CONFERENCE_DATES.forEach(d => {
                    const dateData = AppState.dataByDate?.[d.date];
                    
                    // 해당 날짜 스케줄에서 배치된 개수 및 시간 카운트
                    if (dateData?.schedule) {
                        Object.values(dateData.schedule).forEach(lecture => {
                            if ((lecture.speakerKo || '') === speaker) {
                                const duration = lecture.duration || 15;
                                if (d.day === 'sat') {
                                    satScheduled++;
                                    satMinutes += duration;
                                } else {
                                    sunScheduled++;
                                    sunMinutes += duration;
                                }
                            }
                        });
                    }
                    
                    // 좌장 횟수 및 시간 카운트
                    if (dateData?.sessions) {
                        dateData.sessions.forEach(session => {
                            if (session.moderator === speaker) {
                                const sessionDuration = session.duration || 60;
                                if (d.day === 'sat') {
                                    satModerator++;
                                    satModeratorMinutes += sessionDuration;
                                } else {
                                    sunModerator++;
                                    sunModeratorMinutes += sessionDuration;
                                }
                            }
                        });
                    }
                });
                
                const totalScheduled = satScheduled + sunScheduled;
                const unscheduled = totalLectures - totalScheduled;
                const totalModerator = satModerator + sunModerator;
                
                // 배경색 결정
                let bgColor = '#4CAF50'; // 전부 배치
                if (unscheduled > 0 && totalScheduled > 0) bgColor = '#ff9800'; // 일부 배치
                else if (unscheduled > 0 && totalScheduled === 0) bgColor = '#f44336'; // 미배치
                
                // 통계 문자열 생성 - 첫 줄
                let statParts = [`총 ${totalLectures}개 강의`];
                if (satScheduled > 0) statParts.push(`토 ${satScheduled}`);
                if (sunScheduled > 0) statParts.push(`일 ${sunScheduled}`);
                if (unscheduled > 0) statParts.push(`미배치 ${unscheduled}`);
                
                // 상세 정보 - 둘째 줄
                let detailParts = [];
                if (satScheduled > 0 || satModerator > 0) {
                    let satDetail = `토${satScheduled} ${satMinutes}분`;
                    if (satModerator > 0) satDetail += `, 좌장${satModerator} ${satModeratorMinutes}분`;
                    const satTotal = satMinutes + satModeratorMinutes;
                    satDetail += ` - 총 ${satTotal}분`;
                    detailParts.push(satDetail);
                }
                if (sunScheduled > 0 || sunModerator > 0) {
                    let sunDetail = `일${sunScheduled} ${sunMinutes}분`;
                    if (sunModerator > 0) sunDetail += `, 좌장${sunModerator} ${sunModeratorMinutes}분`;
                    const sunTotal = sunMinutes + sunModeratorMinutes;
                    sunDetail += ` - 총 ${sunTotal}분`;
                    detailParts.push(sunDetail);
                }
                
                statsHtml += `<div style="margin-bottom: 0.6rem; padding: 0.5rem; background: white; border-radius: 6px; border-left: 3px solid ${bgColor};">
                    <div style="display: flex; align-items: center; flex-wrap: wrap; margin-bottom: 0.3rem;">
                        <span style="min-width: 70px;">👤 <strong>${speaker}</strong></span>
                        <span style="background: ${bgColor}; color: white; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">
                            ${statParts.join(' / ')}
                        </span>
                    </div>
                    ${detailParts.length > 0 ? `<div style="font-size: 0.7rem; color: #666; margin-left: 70px;">
                        ${detailParts.join('<br>')}
                    </div>` : ''}
                </div>`;
            });
            
            statsHtml += '</div>';
            list.innerHTML = statsHtml;
        }
    }

    filteredLectures.forEach(lecture => {
        const isScheduled = scheduledLectureIds.includes(lecture.id);
        const item = createLectureItem(lecture, lecture.id, isScheduled, false);
        list.appendChild(item);
    });
};

/**
 * 강의 아이템 DOM 요소 생성
 */
function createLectureItem(lecture, lectureId, isScheduled, isBreak) {
    const color = AppConfig.categoryColors[lecture.category] || '#9B59B6';
    const item = document.createElement('div');
    item.className = 'lecture-item' + (isScheduled && !isBreak ? ' scheduled' : '');
    item.draggable = !isBreak; // Break 항목은 드래그 비활성 → 스크롤 허용
    item.dataset.lectureId = lecture.id;
    
    const isLuncheon = lecture.isLuncheon;
    const isPanelDiscussion = lecture.category === 'Panel Discussion';
    
    if (isBreak) {
        item.dataset.isBreak = 'true';
        item.style.touchAction = 'pan-y'; // 세로 스크롤 허용
        item.style.cursor = 'default';
        // Panel Discussion은 흰색 배경
        if (isPanelDiscussion) {
            item.style.background = 'white';
            item.style.border = '2px solid #424242';
        } else {
            item.style.background = `linear-gradient(135deg, ${color}15, ${color}05)`;
        }
    }
    
    // 런천강의는 금색 좌측 테두리
    if (isLuncheon) {
        item.style.borderLeft = `4px solid #FFD700`;
    } else {
        item.style.borderLeft = `4px solid ${color}`;
    }

    const duration = lecture.duration || 15;

    let titleDisplay = lecture.titleKo;
    let speakerDisplay = lecture.speakerKo || '';

    if (AppState.lectureSearchTerm && !isBreak) {
        titleDisplay = highlightSearchTerm(lecture.titleKo, AppState.lectureSearchTerm);
        speakerDisplay = highlightSearchTerm(lecture.speakerKo || '미정', AppState.lectureSearchTerm);
    }
    
    // 런천강의는 별표 표시
    if (isLuncheon) {
        titleDisplay = `⭐ ${titleDisplay}`;
    }

    // Break 항목은 연자 표시 안함
    const speakerTag = !isBreak && speakerDisplay ? 
        `<span class="tag tag-speaker">${speakerDisplay || '미정'}</span>` : '';
    
    // 런천강의 파트너사 표시
    const sponsorTag = isLuncheon && lecture.companyName ? 
        `<span class="tag" style="background: #FFF8E1; color: #FF8F00;">🏢 ${lecture.companyName}</span>` : '';
    
    // 런천강의 태그
    const luncheonTag = isLuncheon ? 
        '<span class="tag" style="background: #FF8F00; color: white;">런천</span>' : '';
    
    // Break 항목은 배치됨 표시 안함 (중복 가능하므로)
    const scheduledTag = isScheduled && !isBreak ? 
        '<span class="tag" style="background: #E8F5E9; color: #4CAF50;">배치됨</span>' : '';
    
    // Break 항목은 중복 가능 표시
    const breakTag = isBreak ? 
        '<span class="tag" style="background: #FFF3E0; color: #E65100;">중복가능</span>' : '';

    item.innerHTML = `
        <div class="lecture-item-body">
            <div class="lecture-item-info">
                <div class="lecture-title">
                    <span class="category-color" style="background: ${color}"></span>
                    ${titleDisplay}
                </div>
                <div class="lecture-meta">
                    ${speakerTag}
                    ${sponsorTag}
                    ${luncheonTag}
                    <span class="tag" style="background: #E3F2FD; color: #1976D2;">⏱️ ${duration}분</span>
                    ${scheduledTag}
                    ${breakTag}
                </div>
            </div>
            <div class="lecture-item-actions">
                ${isBreak
                    ? `<button class="li-btn li-btn-place" title="시간표에 배치">📌</button>`
                    : `<button class="li-btn li-btn-place" title="시간표에 배치">📌</button>
                       <button class="li-btn li-btn-edit"  title="수정">✏️</button>`
                }
            </div>
        </div>
    `;

    // 버튼 이벤트 (stopPropagation으로 셀 클릭과 분리)
    const placeBtn = item.querySelector('.li-btn-place');
    if (placeBtn) {
        placeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (typeof window.selectLectureForPlacement === 'function')
                window.selectLectureForPlacement(lecture, !!isBreak);
        });
    }
    const editBtn = item.querySelector('.li-btn-edit');
    if (editBtn) {
        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (typeof openEditModal === 'function') openEditModal(lecture.id);
        });
    }

    // 드래그 (PC)
    item.addEventListener('dragstart', function(e) {
        if (typeof window.handleDragStart === 'function') window.handleDragStart(e);
    });
    item.addEventListener('dragend', function(e) {
        if (typeof window.handleDragEnd === 'function') window.handleDragEnd(e);
    });

    return item;
}

/**
 * 강의 추가
 */
window.addLectureToList = function() {
    if (!checkEditPermission()) return;

    // 안전장치: 필수값 재확인 (탭 숨김 상태에서도 동작)
    const _cat = (document.getElementById('category') || {}).value;
    const _title = ((document.getElementById('titleKo') || {}).value || '').trim();
    if (!_cat) {
        if (typeof Toast !== 'undefined') Toast.warning('분류를 선택해주세요.');
        return;
    }
    if (!_title) {
        if (typeof Toast !== 'undefined') Toast.warning('제목(한글)을 입력해주세요.');
        return;
    }

    const category = document.getElementById('category').value;
    const speakerKo = document.getElementById('speakerKo').value.trim();
    const speakerEn = document.getElementById('speakerEn').value.trim();
    const affiliation = document.getElementById('affiliation').value.trim();
    const isLuncheonCheckbox = document.getElementById('isLuncheon');
    const isLuncheon = isLuncheonCheckbox ? isLuncheonCheckbox.checked : false;

    // 연자 목록에서 해당 연자 찾기
    const existingSpeaker = AppState.speakers.find(s => s.name === speakerKo);

    if (existingSpeaker) {
        const isEnChanged = speakerEn && existingSpeaker.nameEn !== speakerEn;
        const isAffChanged = affiliation && existingSpeaker.affiliation !== affiliation;

        if (isEnChanged || isAffChanged) {
            let changeDetails = [];
            if (isEnChanged) changeDetails.push(`영문명: ${existingSpeaker.nameEn || '(없음)'} → ${speakerEn}`);
            if (isAffChanged) changeDetails.push(`소속: ${existingSpeaker.affiliation || '(없음)'} → ${affiliation}`);

            const updateSpeaker = confirm(`연자 정보가 변경되었습니다.\n\n${changeDetails.join('\n')}\n\n연자 목록도 업데이트하시겠습니까?`);

            if (updateSpeaker) {
                if (isEnChanged) existingSpeaker.nameEn = speakerEn;
                if (isAffChanged) existingSpeaker.affiliation = affiliation;
            }
        }
    }

    // 학회강의 체크박스 처리
    const isAcademicCheckbox = document.getElementById('isAcademicLecture');
    const isAcademicLecture = isAcademicCheckbox ? isAcademicCheckbox.checked : false;
    
    // 학회강의 체크 시 회사명을 '학회강의'로 설정
    let companyNameValue = document.getElementById('companyName').value.trim();
    if (isAcademicLecture) {
        companyNameValue = '학회강의';
    }

    const lecture = {
        id: Date.now(),
        category: category,
        titleKo: document.getElementById('titleKo').value,
        titleEn: document.getElementById('titleEn').value,
        speakerKo: speakerKo,
        speakerEn: speakerEn,
        affiliation: affiliation,
        duration: parseInt(document.getElementById('lectureDuration').value) || 15,
        companyName: companyNameValue,
        productName: document.getElementById('productName').value.trim(),
        productDescription: document.getElementById('productDescription').value.trim(),
        isLuncheon: isLuncheon,
        isAcademicLecture: isAcademicLecture
    };
    
    // 회사명이 있고 목록에 없으면 자동 추가
    if (lecture.companyName && !AppState.companies.includes(lecture.companyName)) {
        AppState.companies.push(lecture.companyName);
        AppState.companies.sort((a, b) => a.localeCompare(b, 'ko'));
    }

    AppState.lectures.push(lecture);
    saveAndSync();
    updateLectureList();

    // 폼 초기화
    document.getElementById('category').value = '';
    document.getElementById('titleKo').value = '';
    document.getElementById('titleEn').value = '';
    document.getElementById('speakerKo').value = '';
    document.getElementById('speakerEn').value = '';
    document.getElementById('affiliation').value = '';
    document.getElementById('lectureDuration').value = '15';
    document.getElementById('companyName').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productDescription').value = '';
    if (isLuncheonCheckbox) isLuncheonCheckbox.checked = false;
    if (isAcademicCheckbox) isAcademicCheckbox.checked = false;

    const autocompleteList = document.getElementById('autocompleteList');
    autocompleteList.classList.remove('active');
    autocompleteList.innerHTML = '';

    console.log('강의가 추가되었습니다.');
};

/**
 * 강의 수정 모달 열기 - 수정됨
 * 1. ID 타입 비교 문제 해결 (== 사용)
 * 2. schedule에서도 강의 검색
 * 3. 연자 자동완성 기능 설정
 */
window.openEditModal = function(lectureId) {
    // 1. 먼저 lectures 배열에서 찾기 (== 로 타입 무관 비교)
    let lecture = AppState.lectures.find(l => l.id == lectureId);
    
    // 2. lectures에 없으면 schedule에서 찾기 (초기 데이터나 schedule에만 있는 강의)
    if (!lecture) {
        const scheduleEntry = Object.entries(AppState.schedule).find(([key, val]) => val.id == lectureId);
        if (scheduleEntry) {
            lecture = scheduleEntry[1];
            console.log('schedule에서 강의 찾음:', lecture.titleKo);
        }
    }
    
    if (!lecture) {
        console.error('강의를 찾을 수 없습니다. ID:', lectureId);
        Toast.error('강의 정보를 찾을 수 없습니다.');
        return;
    }

    document.getElementById('editLectureId').value = lecture.id;
    document.getElementById('editCategory').value = lecture.category || '';
    document.getElementById('editTitleKo').value = lecture.titleKo || '';
    document.getElementById('editTitleEn').value = lecture.titleEn || '';
    document.getElementById('editSpeakerKo').value = lecture.speakerKo || '';
    document.getElementById('editSpeakerEn').value = lecture.speakerEn || '';
    document.getElementById('editAffiliation').value = lecture.affiliation || '';
    document.getElementById('editDuration').value = lecture.duration || 15;

    // 런천강의 체크박스 처리
    const editIsLuncheonCheckbox = document.getElementById('editIsLuncheon');
    if (editIsLuncheonCheckbox) {
        editIsLuncheonCheckbox.checked = lecture.isLuncheon || false;
    }
    
    // 학회강의 체크박스 처리
    const editIsAcademicCheckbox = document.getElementById('editIsAcademicLecture');
    if (editIsAcademicCheckbox) {
        // 회사명이 '학회강의'이거나 isAcademicLecture가 true면 체크
        editIsAcademicCheckbox.checked = lecture.isAcademicLecture || lecture.companyName === '학회강의';
    }
    
    // 파트너사 정보 처리
    const editCompanyName = document.getElementById('editCompanyName');
    const editProductName = document.getElementById('editProductName');
    // 학회강의인 경우 회사명 필드는 비워둠
    if (editCompanyName) {
        editCompanyName.value = (lecture.companyName === '학회강의') ? '' : (lecture.companyName || '');
    }
    if (editProductName) editProductName.value = lecture.productName || '';

    // 연자 자동완성 설정
    setupEditSpeakerAutocomplete();

    document.getElementById('editModal').classList.add('active');
};

/**
 * 수정 모달 연자 자동완성 설정 - 새로 추가
 */
function setupEditSpeakerAutocomplete() {
    const speakerInput = document.getElementById('editSpeakerKo');
    const speakerEnInput = document.getElementById('editSpeakerEn');
    const affiliationInput = document.getElementById('editAffiliation');
    
    if (!speakerInput) return;
    
    // 기존 자동완성 리스트가 없으면 생성
    let autocompleteList = document.getElementById('editAutocompleteList');
    if (!autocompleteList) {
        autocompleteList = document.createElement('div');
        autocompleteList.id = 'editAutocompleteList';
        autocompleteList.className = 'autocomplete-list';
        autocompleteList.style.cssText = 'position: absolute; background: white; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; width: 100%; display: none; box-shadow: 0 2px 8px rgba(0,0,0,0.15);';
        speakerInput.parentElement.style.position = 'relative';
        speakerInput.parentElement.appendChild(autocompleteList);
    }
    
    // 이전 이벤트 리스너 제거 (중복 방지)
    const newInput = speakerInput.cloneNode(true);
    speakerInput.parentNode.replaceChild(newInput, speakerInput);
    
    // 새 이벤트 리스너 추가
    newInput.addEventListener('input', function() {
        const value = this.value.trim().toLowerCase();
        
        if (value.length < 1) {
            autocompleteList.style.display = 'none';
            return;
        }
        
        // 연자 목록에서 검색
        const matches = (AppState.speakers || []).filter(s => {
            const name = (s.name || '').toLowerCase();
            const nameEn = (s.nameEn || '').toLowerCase();
            return name.includes(value) || nameEn.includes(value);
        }).slice(0, 10); // 최대 10개
        
        if (matches.length === 0) {
            autocompleteList.style.display = 'none';
            return;
        }
        
        autocompleteList.innerHTML = matches.map(speaker => `
            <div class="autocomplete-item" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 0.85rem;" 
                 data-name="${speaker.name || ''}" 
                 data-name-en="${speaker.nameEn || ''}" 
                 data-affiliation="${speaker.affiliation || ''}">
                <div style="font-weight: 500;">${speaker.name || ''}</div>
                <div style="font-size: 0.75rem; color: #666;">
                    ${speaker.nameEn ? speaker.nameEn + ' | ' : ''}${speaker.affiliation || ''}
                </div>
            </div>
        `).join('');
        
        autocompleteList.style.display = 'block';
        
        // 클릭 이벤트
        autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', function() {
                const speakerKoInput = document.getElementById('editSpeakerKo');
                const speakerEnInput = document.getElementById('editSpeakerEn');
                const affiliationInput = document.getElementById('editAffiliation');
                
                if (speakerKoInput) speakerKoInput.value = this.dataset.name || '';
                if (speakerEnInput) speakerEnInput.value = this.dataset.nameEn || '';
                if (affiliationInput) affiliationInput.value = this.dataset.affiliation || '';
                
                autocompleteList.style.display = 'none';
            });
            
            item.addEventListener('mouseenter', function() {
                this.style.background = '#f5f5f5';
            });
            item.addEventListener('mouseleave', function() {
                this.style.background = 'white';
            });
        });
    });
    
    // 외부 클릭 시 닫기
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#editSpeakerKo') && !e.target.closest('#editAutocompleteList')) {
            autocompleteList.style.display = 'none';
        }
    });
}

/**
 * 강의 수정 모달 닫기
 */
window.closeEditModal = function() {
    document.getElementById('editModal').classList.remove('active');
    
    // 자동완성 리스트 숨기기
    const autocompleteList = document.getElementById('editAutocompleteList');
    if (autocompleteList) {
        autocompleteList.style.display = 'none';
    }
};

/**
 * 강의 수정 모달 닫기 확인 (수정사항 유실 방지)
 */
window.confirmCloseEditModal = function() {
    closeEditModal();
};

/**
 * 강의 삭제 (모달에서)
 */
window.deleteLectureFromModal = function() {
    const lectureId = document.getElementById('editLectureId').value;
    // == 로 타입 무관 비교
    const lecture = AppState.lectures.find(l => l.id == lectureId);

    // schedule에서도 찾기
    let lectureTitle = lecture ? lecture.titleKo : '';
    if (!lectureTitle) {
        const scheduleEntry = Object.entries(AppState.schedule).find(([key, val]) => val.id == lectureId);
        if (scheduleEntry) {
            lectureTitle = scheduleEntry[1].titleKo;
        }
    }

    if (confirm(`"${lectureTitle || '이 강의'}"를 삭제하시겠습니까?\n\n시간표에서도 삭제됩니다.`)) {
        // lectures 배열에서 삭제
        AppState.lectures = AppState.lectures.filter(l => l.id != lectureId);

        // schedule에서 삭제
        Object.keys(AppState.schedule).forEach(key => {
            if (AppState.schedule[key].id == lectureId) {
                delete AppState.schedule[key];
            }
        });

        saveAndSync();
        updateLectureList();
        updateScheduleDisplay();
        closeEditModal();
    }
};

/**
 * 강의 수정 저장 - 수정됨
 */
window.saveEditedLecture = function() {
    const lectureId = document.getElementById('editLectureId').value;
    const lectureIndex = AppState.lectures.findIndex(l => l.id == lectureId);
    const category = document.getElementById('editCategory').value;
    const editIsLuncheonCheckbox = document.getElementById('editIsLuncheon');
    const isLuncheon = editIsLuncheonCheckbox ? editIsLuncheonCheckbox.checked : false;
    
    // 학회강의 체크박스
    const editIsAcademicCheckbox = document.getElementById('editIsAcademicLecture');
    const isAcademicLecture = editIsAcademicCheckbox ? editIsAcademicCheckbox.checked : false;
    
    // 파트너사 정보
    let companyName = document.getElementById('editCompanyName')?.value || '';
    const productName = document.getElementById('editProductName')?.value || '';
    
    // 학회강의 체크 시 회사명을 '학회강의'로 설정
    if (isAcademicLecture) {
        companyName = '학회강의';
    }

    const updatedLecture = {
        id: lectureId.includes('-') ? lectureId : parseInt(lectureId) || lectureId, // ID 형식 유지
        category: category,
        titleKo: document.getElementById('editTitleKo').value,
        titleEn: document.getElementById('editTitleEn').value,
        speakerKo: document.getElementById('editSpeakerKo').value,
        speakerEn: document.getElementById('editSpeakerEn').value,
        affiliation: document.getElementById('editAffiliation').value,
        duration: parseInt(document.getElementById('editDuration').value) || 15,
        isLuncheon: isLuncheon,
        isAcademicLecture: isAcademicLecture,
        companyName: companyName.trim(),
        productName: productName.trim()
    };
    
    // 회사명이 있고 목록에 없으면 자동 추가
    if (updatedLecture.companyName && !AppState.companies.includes(updatedLecture.companyName)) {
        AppState.companies.push(updatedLecture.companyName);
        AppState.companies.sort((a, b) => a.localeCompare(b, 'ko'));
    }

    // lectures 배열에 있으면 업데이트
    if (lectureIndex !== -1) {
        AppState.lectures[lectureIndex] = updatedLecture;
    } else {
        // lectures에 없으면 추가 (schedule에만 있던 강의)
        AppState.lectures.push(updatedLecture);
        console.log('강의 목록에 추가됨:', updatedLecture.titleKo);
    }

    // 시간표의 강의도 업데이트
    Object.keys(AppState.schedule).forEach(key => {
        if (AppState.schedule[key].id == lectureId) {
            AppState.schedule[key] = { ...updatedLecture };
        }
    });

    saveAndSync();
    updateLectureList();
    updateScheduleDisplay();
    closeEditModal();
    
    console.log('강의 수정 완료:', updatedLecture.titleKo);
};

/**
 * 시간표에서 강의 제거
 */
window.removeLecture = function(key) {
    saveStateForUndo();
    delete AppState.schedule[key];
    
    // 개별 스케줄 항목 삭제 (동시 작업 충돌 방지)
    if (typeof saveScheduleItem === 'function') {
        saveScheduleItem(key, null);
    }
    
    saveAndSync();
    updateScheduleDisplay();
    updateLectureList();
};

/**
 * 퀵필터 토글
 */
window.toggleQuickFilter = function(filterType) {
    const unscheduledBtn = document.getElementById('filterUnscheduledBtn');
    const noSpeakerBtn = document.getElementById('filterNoSpeakerBtn');

    if (AppState.quickFilter === filterType) {
        AppState.quickFilter = '';
        unscheduledBtn.classList.remove('active');
        noSpeakerBtn.classList.remove('active');
    } else {
        AppState.quickFilter = filterType;
        unscheduledBtn.classList.toggle('active', filterType === 'unscheduled');
        noSpeakerBtn.classList.toggle('active', filterType === 'noSpeaker');
    }

    updateLectureList();
};

/**
 * 검색어로 강의 필터링
 */
window.filterLecturesBySearch = function() {
    const input = document.getElementById('lectureSearchInput');
    AppState.lectureSearchTerm = input.value.trim().toLowerCase();
    updateLectureList();
};

/**
 * 강의 검색 초기화
 */
window.clearLectureSearch = function() {
    document.getElementById('lectureSearchInput').value = '';
    AppState.lectureSearchTerm = '';
    updateLectureList();
};

/**
 * 카테고리별 강의 필터
 */
window.filterLectures = function(category) {
    AppState.activeFilter = category;

    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        const isAllBtn = btn.innerHTML.includes('전체');

        if (category === 'all' && isAllBtn) {
            btn.classList.add('active');
            btn.style.background = '#2E1A47';
            btn.style.color = '#FFFFFF';
        } else if (btn.dataset.category === category) {
            btn.classList.add('active');
            const color = AppConfig.categoryColors[category];
            btn.style.background = color;
            btn.style.color = '#FFFFFF';
        } else {
            btn.style.background = '#FFFFFF';
            const cat = btn.dataset.category;
            if (cat && AppConfig.categoryColors[cat]) {
                btn.style.color = AppConfig.categoryColors[cat];
            } else if (isAllBtn) {
                btn.style.color = '#2E1A47';
            }
        }
    });

    updateLectureList();
};

/**
 * 분류 필터 접기/펼치기
 */
window.toggleCategoryFilters = function() {
    const wrapper = document.getElementById('categoryFiltersWrapper');
    const btn = document.getElementById('toggleFiltersBtn');
    AppState.categoryFiltersCollapsed = !AppState.categoryFiltersCollapsed;

    if (AppState.categoryFiltersCollapsed) {
        wrapper.classList.add('collapsed');
        btn.textContent = '📂펼치기';
    } else {
        wrapper.classList.remove('collapsed');
        btn.textContent = '📂접기';
    }
};

/**
 * 카테고리 필터 버튼 생성
 */
window.createCategoryFilters = function() {
    const container = document.getElementById('categoryFilters');
    container.innerHTML = '';

    // 카테고리별 강의 개수 계산
    const categoryCounts = {};
    AppState.lectures.forEach(lecture => {
        const cat = lecture.category || 'Others';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const totalCount = AppState.lectures.length;

    // 전체 버튼
    const allBtn = document.createElement('button');
    allBtn.className = 'category-filter-btn active';
    allBtn.style.borderColor = '#2E1A47';
    allBtn.style.background = '#2E1A47';
    allBtn.style.color = '#FFFFFF';
    allBtn.innerHTML = `전체<span class="category-count">${totalCount}</span>`;
    allBtn.onclick = () => filterLectures('all');
    
    // 첫 번째 행에 전체 버튼
    const firstRow = document.createElement('div');
    firstRow.className = 'category-row';
    firstRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; justify-content: flex-start;';
    firstRow.appendChild(allBtn);
    container.appendChild(firstRow);

    // 그룹별로 카테고리 버튼 생성
    if (AppConfig.categoryGroups) {
        AppConfig.categoryGroups.forEach(group => {
            const row = document.createElement('div');
            row.className = 'category-row';
            row.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; justify-content: flex-start;';
            
            group.forEach(category => {
                // AppConfig.categoryColors 또는 AppState.categories에 있는 카테고리만 표시
                const color = AppConfig.categoryColors[category] || '#757575';
                
                const count = categoryCounts[category] || 0;
                const btn = document.createElement('button');
                btn.className = 'category-filter-btn';
                btn.style.borderColor = color;
                btn.style.color = color;
                btn.innerHTML = `${category}${count > 0 ? `<span class="category-count" style="background:${color};">${count}</span>` : ''}`;
                btn.onclick = () => filterLectures(category);
                btn.dataset.category = category;
                row.appendChild(btn);
            });
            
            if (row.children.length > 0) {
                container.appendChild(row);
            }
        });
        
        // AppState.categories에 있지만 categoryGroups에 없는 카테고리 추가 (분류 관리에서 추가된 것들)
        const groupedCategories = AppConfig.categoryGroups.flat();
        const ungroupedCategories = AppState.categories.filter(cat => !groupedCategories.includes(cat));
        
        if (ungroupedCategories.length > 0) {
            const extraRow = document.createElement('div');
            extraRow.className = 'category-row';
            extraRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; justify-content: flex-start;';
            
            ungroupedCategories.forEach(category => {
                const count = categoryCounts[category] || 0;
                const color = AppConfig.categoryColors[category] || '#757575';
                const btn = document.createElement('button');
                btn.className = 'category-filter-btn';
                btn.style.borderColor = color;
                btn.style.color = color;
                btn.innerHTML = `${category}${count > 0 ? `<span class="category-count" style="background:${color};">${count}</span>` : ''}`;
                btn.onclick = () => filterLectures(category);
                btn.dataset.category = category;
                extraRow.appendChild(btn);
            });
            
            if (extraRow.children.length > 0) {
                container.appendChild(extraRow);
            }
        }
    } else {
        // 그룹이 없으면 기존 방식
        Object.keys(AppConfig.categoryColors).forEach(category => {
            const count = categoryCounts[category] || 0;
            const btn = document.createElement('button');
            btn.className = 'category-filter-btn';
            const color = AppConfig.categoryColors[category];
            btn.style.borderColor = color;
            btn.style.color = color;
            btn.innerHTML = `${category}${count > 0 ? `<span class="category-count" style="background:${color};">${count}</span>` : ''}`;
            btn.onclick = () => filterLectures(category);
            btn.dataset.category = category;
            container.appendChild(btn);
        });
    }
};

/**
 * 카테고리 드롭다운 업데이트
 */
window.updateCategoryDropdowns = function() {
    const sortedCategories = [...AppState.categories].sort();

    const categorySelect = document.getElementById('category');
    const currentValue = categorySelect.value;
    categorySelect.innerHTML = '<option value="">선택하세요</option>' +
        sortedCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    if (currentValue && sortedCategories.includes(currentValue)) {
        categorySelect.value = currentValue;
    }

    const editCategorySelect = document.getElementById('editCategory');
    if (editCategorySelect) {
        const editCurrentValue = editCategorySelect.value;
        editCategorySelect.innerHTML = sortedCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        if (editCurrentValue && sortedCategories.includes(editCurrentValue)) {
            editCategorySelect.value = editCurrentValue;
        }
    }
};

// 강의 추가 버튼 이벤트
document.addEventListener('DOMContentLoaded', function() {
    const addBtn = document.getElementById('addLectureBtn');
    if (addBtn) {
        addBtn.addEventListener('click', async function() {
            // HTML form.checkValidity() 대신 직접 검증 (숨겨진 탭 패널 오작동 방지)
            const category = document.getElementById('category').value;
            const titleKo = document.getElementById('titleKo').value.trim();

            if (!category) {
                if (typeof Toast !== 'undefined') Toast.warning('분류를 선택해주세요.');
                else alert('분류를 선택해주세요.');
                return;
            }
            if (!titleKo) {
                if (typeof Toast !== 'undefined') Toast.warning('제목(한글)을 입력해주세요.');
                else alert('제목(한글)을 입력해주세요.');
                return;
            }

            const speakerKoValue = document.getElementById('speakerKo').value.trim();

            if (!speakerKoValue) {
                addLectureToList();
                return;
            }

            const speakerExists = AppState.speakers.find(s => s.name.toLowerCase() === speakerKoValue.toLowerCase());

            if (!speakerExists) {
                AppState.pendingSpeakerInfo = {
                    name: speakerKoValue,
                    nameEn: document.getElementById('speakerEn').value.trim() || '',
                    affiliation: document.getElementById('affiliation').value.trim() || '',
                    affiliationEn: ''
                };

                document.getElementById('confirmMessage').textContent =
                    `"${speakerKoValue}" 연자가 목록에 없습니다. 연자 목록에 추가하시겠습니까?`;
                document.getElementById('confirmAddSpeakerModal').classList.add('active');
                return;
            }

            addLectureToList();
        });
    }

    // 강의 수정 저장 버튼
    const saveEditBtn = document.getElementById('saveEditBtn');
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', saveEditedLecture);
    }
});

console.log('✅ lectures.js 로드 완료 (수정본 - ID 타입 문제 해결 + 연자 자동완성 추가 + 모바일 터치 UX 재설계)');


// _confirmDeleteLecture: 수정 모달 내 삭제로 대체됨 (하위 호환 유지)
window._confirmDeleteLecture = function(lectureId, title) {
    if (confirm(`"${title}" 강의를 삭제하시겠습니까?`)) {
        AppState.lectures = AppState.lectures.filter(l => l.id != lectureId);
        Object.keys(AppState.schedule || {}).forEach(key => {
            if (AppState.schedule[key].id == lectureId)
                delete AppState.schedule[key];
        });
        if (typeof saveAndSync === 'function') saveAndSync();
        if (typeof updateLectureList === 'function') updateLectureList();
        if (typeof updateScheduleDisplay === 'function') updateScheduleDisplay();
        Toast.success('삭제되었습니다.');
    }
};
