/**
 * chairs.js - 좌장 및 연자 관리
 */

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
        
        // 연자별 일자별 강의 개수 계산
        let lectureStats = [];
        AppConfig.CONFERENCE_DATES.forEach(d => {
            const dateData = AppState.dataByDate?.[d.date];
            let totalCount = 0;
            let scheduledCount = 0;
            
            // 해당 날짜 강의 목록에서 카운트
            if (dateData?.lectures) {
                dateData.lectures.forEach(lecture => {
                    if ((lecture.speakerKo || '') === speaker.name) {
                        totalCount++;
                    }
                });
            }
            
            // 해당 날짜 스케줄에서 카운트
            if (dateData?.schedule) {
                Object.values(dateData.schedule).forEach(lecture => {
                    if ((lecture.speakerKo || '') === speaker.name) {
                        scheduledCount++;
                    }
                });
            }
            
            if (totalCount > 0) {
                const dayLabel = d.day === 'sat' ? '토' : '일';
                const unscheduledCount = totalCount - scheduledCount;
                
                let bgColor, textColor, statusText;
                if (unscheduledCount === 0) {
                    // 전부 배치
                    bgColor = '#4CAF50';
                    textColor = 'white';
                    statusText = `${dayLabel}✓${totalCount}`;
                } else if (scheduledCount === 0) {
                    // 하나도 배치 안됨
                    bgColor = '#f44336';
                    textColor = 'white';
                    statusText = `${dayLabel}✗${totalCount}`;
                } else {
                    // 일부만 배치됨
                    bgColor = '#ff9800';
                    textColor = 'white';
                    statusText = `${dayLabel}${scheduledCount}/${totalCount}`;
                }
                
                lectureStats.push(`<span style="background: ${bgColor}; color: ${textColor}; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; margin-left: 0.25rem;">${statusText}</span>`);
            }
        });
        
        const statsHtml = lectureStats.length > 0 
            ? `<span style="margin-left: 0.3rem;">${lectureStats.join('')}</span>` 
            : '';
        
        return `
            <div class="speaker-item">
                <div class="speaker-info">
                    <strong>${speaker.name}${speaker.nameEn ? ' / ' + speaker.nameEn : ''}${statsHtml}</strong>
                    <small>${speaker.affiliation}${speaker.affiliationEn ? ' / ' + speaker.affiliationEn : ''}</small>
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

    if (name && affiliation) {
        AppState.speakers.push({ name, nameEn, affiliation, affiliationEn });
        document.getElementById('newSpeakerName').value = '';
        document.getElementById('newSpeakerNameEn').value = '';
        document.getElementById('newSpeakerAffiliation').value = '';
        document.getElementById('newSpeakerAffiliationEn').value = '';
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

    document.getElementById('editSpeakerModal').classList.add('active');
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

    AppState.speakers[index] = {
        name: document.getElementById('editSpeakerNameField').value.trim(),
        nameEn: document.getElementById('editSpeakerNameEnField').value.trim(),
        affiliation: document.getElementById('editSpeakerAffiliationField').value.trim(),
        affiliationEn: document.getElementById('editSpeakerAffiliationEnField').value.trim()
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
