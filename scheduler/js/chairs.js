/**
 * chairs.js - 좌장 및 연자 관리
 */

/**
 * 전문 분야 태그 목록 가져오기 (분류 관리와 연동)
 * Break 타입 제외한 모든 카테고리 반환
 */
window.getExpertiseTags = function() {
    // Break 타입 (전문분야에서 제외)
    const excludeTypes = AppConfig.BREAK_TYPES || ['Coffee Break', 'Lunch', 'Opening/Closing', 'Panel Discussion'];
    // 추가로 제외할 타입
    const additionalExclude = ['Luncheon', 'Others', 'Other Solutions'];
    const allExclude = [...excludeTypes, ...additionalExclude];
    
    // AppState.categories에서 Break 타입 제외
    if (AppState.categories && AppState.categories.length > 0) {
        return AppState.categories.filter(cat => !allExclude.includes(cat));
    }
    
    // fallback: AppConfig.categoryColors의 키에서 가져오기
    if (AppConfig.categoryColors) {
        return Object.keys(AppConfig.categoryColors).filter(cat => !allExclude.includes(cat));
    }
    
    return [];
};

// 하위 호환성을 위한 getter (기존 코드에서 EXPERTISE_TAGS 사용 시)
Object.defineProperty(window, 'EXPERTISE_TAGS', {
    get: function() {
        return getExpertiseTags();
    }
});

/**
 * 연자의 전문 분야 태그 자동 계산 (기존 강의 기반)
 */
window.calculateSpeakerExpertise = function(speakerName) {
    const tagCounts = {};
    const validTags = getExpertiseTags();
    
    // 모든 날짜의 강의에서 해당 연자의 카테고리 집계
    Object.values(AppState.dataByDate || {}).forEach(dateData => {
        (dateData.lectures || []).forEach(lecture => {
            if ((lecture.speakerKo || '') === speakerName && lecture.category) {
                const cat = lecture.category;
                if (validTags.includes(cat)) {
                    tagCounts[cat] = (tagCounts[cat] || 0) + 1;
                }
            }
        });
        
        Object.values(dateData.schedule || {}).forEach(lecture => {
            if ((lecture.speakerKo || '') === speakerName && lecture.category) {
                const cat = lecture.category;
                if (validTags.includes(cat)) {
                    tagCounts[cat] = (tagCounts[cat] || 0) + 1;
                }
            }
        });
    });
    });
    
    // 빈도순으로 정렬하여 반환
    return Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);
};

/**
 * 세션 내 강의들의 분류 태그 집계
 */
window.getSessionCategoryTags = function(sessionTime, sessionRoom, sessionDuration) {
    const tags = {};
    const sessionStartMin = timeToMinutes(sessionTime);
    const sessionEndMin = sessionDuration > 0 ? sessionStartMin + sessionDuration : sessionStartMin + 60;
    
    // 해당 세션 시간대 & 룸의 강의들 찾기
    Object.entries(AppState.schedule).forEach(([key, lecture]) => {
        const [time, room] = [key.substring(0, 5), key.substring(6)];
        if (room !== sessionRoom) return;
        
        const lectureStartMin = timeToMinutes(time);
        const lectureDuration = lecture.duration || 15;
        const lectureEndMin = lectureStartMin + lectureDuration;
        
        // 강의가 세션 시간대 내에 있는지 확인
        if (lectureStartMin >= sessionStartMin && lectureEndMin <= sessionEndMin) {
            const cat = lecture.category;
            if (cat && EXPERTISE_TAGS.includes(cat)) {
                tags[cat] = (tags[cat] || 0) + 1;
            }
        }
    });
    
    return Object.keys(tags);
};

/**
 * 좌장 추천 목록 생성 (세션 태그 매칭 + ASLS 우선)
 */
window.getModeratorRecommendations = function(sessionTags) {
    const recommendations = [];
    
    AppState.speakers.forEach(speaker => {
        const speakerTags = speaker.expertiseTags || calculateSpeakerExpertise(speaker.name);
        const isASLS = speaker.isASLSMember || false;
        
        // 태그 매칭 점수 계산
        let matchScore = 0;
        sessionTags.forEach(tag => {
            if (speakerTags.includes(tag)) {
                matchScore += 2;
            }
        });
        
        // ASLS 멤버 보너스
        if (isASLS) {
            matchScore += 1;
        }
        
        recommendations.push({
            speaker,
            matchScore,
            isASLS,
            matchedTags: speakerTags.filter(t => sessionTags.includes(t))
        });
    });
    
    // 점수 높은 순, ASLS 멤버 우선 정렬
    return recommendations.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (b.isASLS !== a.isASLS) return b.isASLS ? 1 : -1;
        return a.speaker.name.localeCompare(b.speaker.name, 'ko');
    });
};

/**
 * 연자 관리 모달 열기
 */
window.openSpeakerModal = function() {
    updateSpeakerList();
    document.getElementById('speakerModal').classList.add('active');
};

/**
 * 연자 관리 모달 닫기
 */
window.closeSpeakerModal = function() {
    document.getElementById('speakerModal').classList.remove('active');
    document.getElementById('speakerSearch').value = '';
};

/**
 * 연자 검색
 */
window.searchSpeakers = function() {
    updateSpeakerList();
};

/**
 * 정렬/필터링된 연자 목록 가져오기
 */
window.getSortedAndFilteredSpeakers = function() {
    const searchTerm = document.getElementById('speakerSearch').value.toLowerCase().trim();
    const sortType = document.getElementById('speakerSort').value;

    // 검색 필터링
    let filtered = AppState.speakers.filter(speaker => {
        if (!searchTerm) return true;

        const nameMatch = speaker.name.toLowerCase().includes(searchTerm);
        const nameEnMatch = (speaker.nameEn || '').toLowerCase().includes(searchTerm);
        const affiliationMatch = speaker.affiliation.toLowerCase().includes(searchTerm);
        const affiliationEnMatch = (speaker.affiliationEn || '').toLowerCase().includes(searchTerm);

        return nameMatch || nameEnMatch || affiliationMatch || affiliationEnMatch;
    });

    // 정렬
    const sorted = [...filtered];

    switch (sortType) {
        case 'name-ko':
            sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
            break;
        case 'name-en':
            sorted.sort((a, b) => {
                const aName = (a.nameEn || a.name).toLowerCase();
                const bName = (b.nameEn || b.name).toLowerCase();
                return aName.localeCompare(bName, 'en');
            });
            break;
        case 'affiliation':
            sorted.sort((a, b) => a.affiliation.localeCompare(b.affiliation, 'ko'));
            break;
        case 'recent':
            sorted.reverse();
            break;
    }

    return sorted;
};

/**
 * 연자 목록 업데이트
 */
window.updateSpeakerList = function() {
    const list = document.getElementById('speakerList');
    const displaySpeakers = getSortedAndFilteredSpeakers();

    if (displaySpeakers.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">검색 결과가 없습니다</p>';
        return;
    }

    list.innerHTML = displaySpeakers.map(speaker => {
        const originalIndex = AppState.speakers.indexOf(speaker);
        
        // ASLS 멤버 배지
        const aslsBadge = speaker.isASLSMember 
            ? '<span style="background: #8E24AA; color: white; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.65rem; margin-left: 0.3rem;">ASLS</span>' 
            : '';
        
        // 전문 분야 태그 (저장된 것 또는 자동 계산)
        const expertiseTags = speaker.expertiseTags || calculateSpeakerExpertise(speaker.name);
        let tagsHtml = '';
        if (expertiseTags.length > 0) {
            const displayTags = expertiseTags.slice(0, 3); // 최대 3개만 표시
            tagsHtml = '<div style="margin-top: 0.3rem;">' + 
                displayTags.map(tag => {
                    const color = AppConfig.categoryColors[tag] || '#757575';
                    return `<span style="background: ${color}22; color: ${color}; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.65rem; margin-right: 0.3rem; border: 1px solid ${color}44;">${tag}</span>`;
                }).join('') +
                (expertiseTags.length > 3 ? `<span style="color: #999; font-size: 0.65rem;">+${expertiseTags.length - 3}</span>` : '') +
                '</div>';
        }
        
        // 연자별 전체 강의 수 및 일자별 배치 개수 계산
        let totalLectures = 0;
        let satScheduled = 0;
        let sunScheduled = 0;
        
        AppConfig.CONFERENCE_DATES.forEach(d => {
            const dateData = AppState.dataByDate?.[d.date];
            
            // 해당 날짜 강의 목록에서 카운트
            if (dateData?.lectures) {
                dateData.lectures.forEach(lecture => {
                    if ((lecture.speakerKo || '') === speaker.name) {
                        totalLectures++;
                    }
                });
            }
            
            // 해당 날짜 스케줄에서 배치 카운트
            if (dateData?.schedule) {
                Object.values(dateData.schedule).forEach(lecture => {
                    if ((lecture.speakerKo || '') === speaker.name) {
                        if (d.day === 'sat') satScheduled++;
                        else sunScheduled++;
                    }
                });
            }
        });
        
        let statsHtml = '';
        if (totalLectures > 0) {
            const totalScheduled = satScheduled + sunScheduled;
            const unscheduled = totalLectures - totalScheduled;
            
            // 통계 문자열 생성
            let statParts = [`총${totalLectures}`];
            if (satScheduled > 0) statParts.push(`토${satScheduled}`);
            if (sunScheduled > 0) statParts.push(`일${sunScheduled}`);
            if (unscheduled > 0) statParts.push(`미배치${unscheduled}`);
            
            // 배경색 결정
            let bgColor = '#4CAF50'; // 전부 배치
            if (unscheduled > 0 && totalScheduled > 0) bgColor = '#ff9800'; // 일부 배치
            else if (unscheduled > 0 && totalScheduled === 0) bgColor = '#f44336'; // 미배치
            
            statsHtml = `<span style="background: ${bgColor}; color: white; padding: 0.1rem 0.5rem; border-radius: 3px; font-size: 0.7rem; margin-left: 0.5rem;">${statParts.join(' / ')}</span>`;
        }
        
        return `
            <div class="speaker-item">
                <div class="speaker-info">
                    <strong>${speaker.name}${speaker.nameEn ? ' / ' + speaker.nameEn : ''}${aslsBadge}${statsHtml}</strong>
                    <small>${speaker.affiliation}${speaker.affiliationEn ? ' / ' + speaker.affiliationEn : ''}</small>
                    ${tagsHtml}
                </div>
                <div class="speaker-actions">
                    <button class="btn btn-secondary btn-small" onclick="editSpeaker(event, ${originalIndex})">수정</button>
                    <button class="btn btn-secondary btn-small" onclick="deleteSpeaker(event, ${originalIndex})">삭제</button>
                </div>
            </div>
        `;
    }).join('');
};

/**
 * 연자 추가
 */
window.addSpeaker = function() {
    const name = document.getElementById('newSpeakerName').value.trim();
    const nameEn = document.getElementById('newSpeakerNameEn').value.trim();
    const affiliation = document.getElementById('newSpeakerAffiliation').value.trim();
    const affiliationEn = document.getElementById('newSpeakerAffiliationEn').value.trim();
    const isASLSMember = document.getElementById('newSpeakerASLS')?.checked || false;

    if (name && affiliation) {
        AppState.speakers.push({ 
            name, 
            nameEn, 
            affiliation, 
            affiliationEn,
            isASLSMember,
            expertiseTags: [] // 추후 자동 계산됨
        });
        document.getElementById('newSpeakerName').value = '';
        document.getElementById('newSpeakerNameEn').value = '';
        document.getElementById('newSpeakerAffiliation').value = '';
        document.getElementById('newSpeakerAffiliationEn').value = '';
        if (document.getElementById('newSpeakerASLS')) {
            document.getElementById('newSpeakerASLS').checked = false;
        }
        saveAndSync();
        updateSpeakerList();
    } else {
        alert('연자명(한글)과 소속(한글)은 필수 입력 항목입니다.');
    }
};

/**
 * 연자 삭제
 */
window.deleteSpeaker = function(event, index) {
    event.stopPropagation();
    if (confirm('이 연자를 삭제하시겠습니까?')) {
        AppState.speakers.splice(index, 1);
        saveAndSync();
        updateSpeakerList();
    }
};

/**
 * 연자 수정
 */
window.editSpeaker = function(event, index) {
    event.stopPropagation();
    const speaker = AppState.speakers[index];

    document.getElementById('editSpeakerIndex').value = index;
    document.getElementById('editSpeakerNameField').value = speaker.name;
    document.getElementById('editSpeakerNameEnField').value = speaker.nameEn || '';
    document.getElementById('editSpeakerAffiliationField').value = speaker.affiliation;
    document.getElementById('editSpeakerAffiliationEnField').value = speaker.affiliationEn || '';
    
    // ASLS 멤버 체크박스
    const aslsCheckbox = document.getElementById('editSpeakerASLS');
    if (aslsCheckbox) {
        aslsCheckbox.checked = speaker.isASLSMember || false;
    }
    
    // 전문 분야 태그 (자동 계산된 것 또는 저장된 것)
    const expertiseTags = speaker.expertiseTags || calculateSpeakerExpertise(speaker.name);
    updateExpertiseTagsDisplay(expertiseTags);

    document.getElementById('editSpeakerModal').classList.add('active');
};

/**
 * 전문 분야 태그 표시 업데이트
 */
window.updateExpertiseTagsDisplay = function(selectedTags = []) {
    const container = document.getElementById('expertiseTagsContainer');
    if (!container) return;
    
    container.innerHTML = EXPERTISE_TAGS.map(tag => {
        const isSelected = selectedTags.includes(tag);
        const color = AppConfig.categoryColors[tag] || '#757575';
        return `
            <label class="expertise-tag-label ${isSelected ? 'selected' : ''}" 
                   style="display: inline-flex; align-items: center; padding: 0.3rem 0.6rem; margin: 0.2rem; 
                          border-radius: 4px; cursor: pointer; font-size: 0.75rem;
                          background: ${isSelected ? color : '#f5f5f5'}; 
                          color: ${isSelected ? 'white' : color};
                          border: 1px solid ${color};">
                <input type="checkbox" value="${tag}" ${isSelected ? 'checked' : ''} 
                       style="display: none;" 
                       onchange="toggleExpertiseTag(this)">
                ${tag}
            </label>
        `;
    }).join('');
};

/**
 * 전문 분야 태그 토글
 */
window.toggleExpertiseTag = function(checkbox) {
    const label = checkbox.parentElement;
    const tag = checkbox.value;
    const color = AppConfig.categoryColors[tag] || '#757575';
    
    if (checkbox.checked) {
        label.classList.add('selected');
        label.style.background = color;
        label.style.color = 'white';
    } else {
        label.classList.remove('selected');
        label.style.background = '#f5f5f5';
        label.style.color = color;
    }
};

/**
 * 연자 수정 모달 닫기
 */
window.closeEditSpeakerModal = function() {
    document.getElementById('editSpeakerModal').classList.remove('active');
};

/**
 * 수정된 연자 저장
 */
window.saveEditedSpeaker = function() {
    const index = parseInt(document.getElementById('editSpeakerIndex').value);
    
    // 선택된 전문분야 태그 수집
    const expertiseTags = [];
    document.querySelectorAll('#expertiseTagsContainer input[type="checkbox"]:checked').forEach(cb => {
        expertiseTags.push(cb.value);
    });

    AppState.speakers[index] = {
        name: document.getElementById('editSpeakerNameField').value.trim(),
        nameEn: document.getElementById('editSpeakerNameEnField').value.trim(),
        affiliation: document.getElementById('editSpeakerAffiliationField').value.trim(),
        affiliationEn: document.getElementById('editSpeakerAffiliationEnField').value.trim(),
        isASLSMember: document.getElementById('editSpeakerASLS')?.checked || false,
        expertiseTags: expertiseTags
    };

    saveAndSync();
    updateSpeakerList();
    closeEditSpeakerModal();
};

/**
 * 연자 자동완성 설정
 */
window.setupSpeakerAutocomplete = function() {
    const speakerInput = document.getElementById('speakerKo');
    const autocompleteList = document.getElementById('autocompleteList');

    if (!speakerInput || !autocompleteList) return;

    function updateAutocomplete() {
        const value = speakerInput.value.trim();
        AppState.autocompleteIndex = -1;

        if (!value) {
            autocompleteList.classList.remove('active');
            autocompleteList.innerHTML = '';
            AppState.currentMatches = [];
            return;
        }

        AppState.currentMatches = AppState.speakers.filter(s => {
            const searchValue = value.toLowerCase();
            return s.name.toLowerCase().includes(searchValue) ||
                s.affiliation.toLowerCase().includes(searchValue);
        });

        if (AppState.currentMatches.length > 0) {
            renderAutocompleteList();
            autocompleteList.classList.add('active');
        } else {
            autocompleteList.classList.remove('active');
            autocompleteList.innerHTML = '';
        }
    }

    function renderAutocompleteList() {
        autocompleteList.innerHTML = AppState.currentMatches.map((s, idx) => {
            const isSelected = idx === AppState.autocompleteIndex;
            return `<div class="autocomplete-item ${isSelected ? 'selected' : ''}" 
                        onclick="selectSpeaker(${AppState.speakers.indexOf(s)})"
                        data-index="${idx}">
                <strong>${s.name}</strong>
                <small>${s.affiliation}</small>
            </div>`;
        }).join('');
    }

    function scrollToSelected() {
        const selectedItem = autocompleteList.querySelector('.autocomplete-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    speakerInput.addEventListener('input', updateAutocomplete);
    speakerInput.addEventListener('compositionend', updateAutocomplete);

    speakerInput.addEventListener('keydown', function(e) {
        if (!autocompleteList.classList.contains('active')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            AppState.autocompleteIndex = Math.min(AppState.autocompleteIndex + 1, AppState.currentMatches.length - 1);
            renderAutocompleteList();
            scrollToSelected();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            AppState.autocompleteIndex = Math.max(AppState.autocompleteIndex - 1, 0);
            renderAutocompleteList();
            scrollToSelected();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (AppState.autocompleteIndex >= 0 && AppState.autocompleteIndex < AppState.currentMatches.length) {
                const selectedSpeaker = AppState.currentMatches[AppState.autocompleteIndex];
                selectSpeaker(AppState.speakers.indexOf(selectedSpeaker));
            }
        } else if (e.key === 'Escape') {
            autocompleteList.classList.remove('active');
            autocompleteList.innerHTML = '';
            AppState.autocompleteIndex = -1;
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.autocomplete-container')) {
            autocompleteList.classList.remove('active');
            AppState.autocompleteIndex = -1;
        }
    });
};

/**
 * 연자 선택
 */
window.selectSpeaker = function(index) {
    const speaker = AppState.speakers[index];
    document.getElementById('speakerKo').value = speaker.name;
    document.getElementById('speakerEn').value = speaker.nameEn || '';
    document.getElementById('affiliation').value = speaker.affiliation;

    const autocompleteList = document.getElementById('autocompleteList');
    autocompleteList.classList.remove('active');
    autocompleteList.innerHTML = '';
    AppState.autocompleteIndex = -1;
    AppState.currentMatches = [];
};

/**
 * 새 연자 추가 확인 모달 닫기
 */
window.closeConfirmAddSpeaker = function() {
    document.getElementById('confirmAddSpeakerModal').classList.remove('active');
    if (AppState.pendingSpeakerInfo) {
        addLectureToList();
    }
    AppState.pendingSpeakerInfo = null;
};

/**
 * 새 연자 추가 확인
 */
window.confirmAddNewSpeaker = function() {
    if (AppState.pendingSpeakerInfo) {
        AppState.speakers.push(AppState.pendingSpeakerInfo);
        saveAndSync();
        updateSpeakerList();

        document.getElementById('speakerEn').value = AppState.pendingSpeakerInfo.nameEn;
        document.getElementById('confirmAddSpeakerModal').classList.remove('active');
        AppState.pendingSpeakerInfo = null;

        addLectureToList();
    }
};

console.log('✅ chairs.js 로드 완료');
