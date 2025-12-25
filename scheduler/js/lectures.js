/**
 * lectures.js - 강의 CRUD 및 관리
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

    // 카테고리 필터 적용
    let filteredLectures = AppState.activeFilter === 'all'
        ? AppState.lectures
        : AppState.lectures.filter(l => l.category === AppState.activeFilter);

    // 퀵필터 적용
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

    if (filteredLectures.length === 0) {
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
                const totalLectures = filteredLectures.filter(l => (l.speakerKo || '') === speaker).length;
                
                // 일자별 배치된 강의 수
                let satScheduled = 0;
                let sunScheduled = 0;
                
                AppConfig.CONFERENCE_DATES.forEach(d => {
                    const dateData = AppState.dataByDate?.[d.date];
                    
                    // 해당 날짜 스케줄에서 배치된 개수 카운트
                    if (dateData?.schedule) {
                        Object.values(dateData.schedule).forEach(lecture => {
                            if ((lecture.speakerKo || '') === speaker) {
                                if (d.day === 'sat') satScheduled++;
                                else sunScheduled++;
                            }
                        });
                    }
                });
                
                const totalScheduled = satScheduled + sunScheduled;
                const unscheduled = totalLectures - totalScheduled;
                
                // 통계 문자열 생성
                let statParts = [`총 ${totalLectures}개`];
                
                if (satScheduled > 0) statParts.push(`토 ${satScheduled}`);
                if (sunScheduled > 0) statParts.push(`일 ${sunScheduled}`);
                if (unscheduled > 0) statParts.push(`미배치 ${unscheduled}`);
                
                // 배경색 결정
                let bgColor = '#4CAF50'; // 전부 배치
                if (unscheduled > 0 && totalScheduled > 0) bgColor = '#ff9800'; // 일부 배치
                else if (unscheduled > 0 && totalScheduled === 0) bgColor = '#f44336'; // 미배치
                
                statsHtml += `<div style="margin-bottom: 0.4rem; display: flex; align-items: center; flex-wrap: wrap;">
                    <span style="min-width: 70px;">👤 <strong>${speaker}</strong></span>
                    <span style="background: ${bgColor}; color: white; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">
                        ${statParts.join(' / ')}
                    </span>
                </div>`;
            });
            
            statsHtml += '</div>';
            list.innerHTML = statsHtml;
        }
    }

    filteredLectures.forEach(lecture => {
        const color = AppConfig.categoryColors[lecture.category] || '#9B59B6';
        const isScheduled = scheduledLectureIds.includes(lecture.id);
        const item = document.createElement('div');
        item.className = 'lecture-item' + (isScheduled ? ' scheduled' : '');
        item.draggable = true;
        item.dataset.lectureId = lecture.id;
        item.style.borderLeft = `4px solid ${color}`;

        const duration = lecture.duration || 15;

        let titleDisplay = lecture.titleKo;
        let speakerDisplay = lecture.speakerKo || '미정';

        if (AppState.lectureSearchTerm) {
            titleDisplay = highlightSearchTerm(lecture.titleKo, AppState.lectureSearchTerm);
            speakerDisplay = highlightSearchTerm(lecture.speakerKo || '미정', AppState.lectureSearchTerm);
        }

        item.innerHTML = `
            <div class="lecture-title">
                <span class="category-color" style="background: ${color}"></span>
                ${titleDisplay}
            </div>
            <div class="lecture-meta">
                <span class="tag tag-speaker">${speakerDisplay}</span>
                <span class="tag" style="background: #E3F2FD; color: #1976D2;">⏱️ ${duration}분</span>
                ${isScheduled ? '<span class="tag" style="background: #E8F5E9; color: #4CAF50;">배치됨</span>' : ''}
            </div>
        `;

        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dblclick', () => openEditModal(lecture.id));

        list.appendChild(item);
    });
};

/**
 * 강의 추가
 */
window.addLectureToList = function() {
    if (!checkEditPermission()) return;

    const speakerKo = document.getElementById('speakerKo').value.trim();
    const speakerEn = document.getElementById('speakerEn').value.trim();
    const affiliation = document.getElementById('affiliation').value.trim();

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

    const lecture = {
        id: Date.now(),
        category: document.getElementById('category').value,
        titleKo: document.getElementById('titleKo').value,
        titleEn: document.getElementById('titleEn').value,
        speakerKo: speakerKo,
        speakerEn: speakerEn,
        affiliation: affiliation,
        duration: parseInt(document.getElementById('lectureDuration').value) || 15,
        companyName: document.getElementById('companyName').value.trim(),
        productName: document.getElementById('productName').value.trim(),
        productDescription: document.getElementById('productDescription').value.trim()
    };

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

    const autocompleteList = document.getElementById('autocompleteList');
    autocompleteList.classList.remove('active');
    autocompleteList.innerHTML = '';

    console.log('강의가 추가되었습니다.');
};

/**
 * 강의 수정 모달 열기
 */
window.openEditModal = function(lectureId) {
    const lecture = AppState.lectures.find(l => l.id === lectureId);
    if (!lecture) return;

    document.getElementById('editLectureId').value = lecture.id;
    document.getElementById('editCategory').value = lecture.category;
    document.getElementById('editTitleKo').value = lecture.titleKo;
    document.getElementById('editTitleEn').value = lecture.titleEn || '';
    document.getElementById('editSpeakerKo').value = lecture.speakerKo;
    document.getElementById('editSpeakerEn').value = lecture.speakerEn || '';
    document.getElementById('editAffiliation').value = lecture.affiliation || '';
    document.getElementById('editDuration').value = lecture.duration || 15;

    document.getElementById('editModal').classList.add('active');
};

/**
 * 강의 수정 모달 닫기
 */
window.closeEditModal = function() {
    document.getElementById('editModal').classList.remove('active');
};

/**
 * 강의 삭제 (모달에서)
 */
window.deleteLectureFromModal = function() {
    const lectureId = parseInt(document.getElementById('editLectureId').value);
    const lecture = AppState.lectures.find(l => l.id === lectureId);

    if (!lecture) return;

    if (confirm(`"${lecture.titleKo}" 강의를 삭제하시겠습니까?\n\n시간표에서도 삭제됩니다.`)) {
        AppState.lectures = AppState.lectures.filter(l => l.id !== lectureId);

        Object.keys(AppState.schedule).forEach(key => {
            if (AppState.schedule[key].id === lectureId) {
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
 * 강의 수정 저장
 */
window.saveEditedLecture = function() {
    const lectureId = parseInt(document.getElementById('editLectureId').value);
    const lectureIndex = AppState.lectures.findIndex(l => l.id === lectureId);

    if (lectureIndex !== -1) {
        const updatedLecture = {
            id: lectureId,
            category: document.getElementById('editCategory').value,
            titleKo: document.getElementById('editTitleKo').value,
            titleEn: document.getElementById('editTitleEn').value,
            speakerKo: document.getElementById('editSpeakerKo').value,
            speakerEn: document.getElementById('editSpeakerEn').value,
            affiliation: document.getElementById('editAffiliation').value,
            duration: parseInt(document.getElementById('editDuration').value) || 15
        };

        AppState.lectures[lectureIndex] = updatedLecture;

        // 시간표의 강의도 업데이트
        Object.keys(AppState.schedule).forEach(key => {
            if (AppState.schedule[key].id === lectureId) {
                AppState.schedule[key] = { ...updatedLecture };
            }
        });

        saveAndSync();
        updateLectureList();
        updateScheduleDisplay();
        closeEditModal();
    }
};

/**
 * 시간표에서 강의 제거
 */
window.removeLecture = function(key) {
    saveStateForUndo();
    delete AppState.schedule[key];
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
                if (!AppConfig.categoryColors[category]) return;
                
                const count = categoryCounts[category] || 0;
                const btn = document.createElement('button');
                btn.className = 'category-filter-btn';
                const color = AppConfig.categoryColors[category];
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
            const form = document.getElementById('lectureForm');

            if (!form.checkValidity()) {
                form.reportValidity();
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

console.log('✅ lectures.js 로드 완료');
