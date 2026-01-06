/**
 * chairs.js - 좌장 및 연자 관리
 */

/**
 * 전문 분야 태그 목록 가져오기 (분류 관리와 연동)
 * Break 타입 제외한 모든 카테고리 반환
 */
window.getExpertiseTags = function() {
    // Break 타입 (전문분야에서 제외)
    const excludeTypes = (AppConfig && AppConfig.BREAK_TYPES) ? AppConfig.BREAK_TYPES : ['Coffee Break', 'Lunch', 'Opening/Closing', 'Panel Discussion'];
    // 추가로 제외할 타입
    const additionalExclude = ['Luncheon', 'Others', 'Other Solutions'];
    const allExclude = [...excludeTypes, ...additionalExclude];
    
    // AppState.categories에서 Break 타입 제외
    if (AppState && AppState.categories && AppState.categories.length > 0) {
        return AppState.categories.filter(cat => !allExclude.includes(cat));
    }
    
    // fallback: AppConfig.categoryColors의 키에서 가져오기
    if (AppConfig && AppConfig.categoryColors) {
        return Object.keys(AppConfig.categoryColors).filter(cat => !allExclude.includes(cat));
    }
    
    return [];
};

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
            const validTags = getExpertiseTags();
            if (cat && validTags.includes(cat)) {
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
    const filterOvertime = document.getElementById('speakerFilterOvertime')?.checked || false;

    // 검색 필터링
    let filtered = AppState.speakers.filter(speaker => {
        if (!searchTerm) return true;

        const nameMatch = speaker.name.toLowerCase().includes(searchTerm);
        const nameEnMatch = (speaker.nameEn || '').toLowerCase().includes(searchTerm);
        const affiliationMatch = speaker.affiliation.toLowerCase().includes(searchTerm);
        const affiliationEnMatch = (speaker.affiliationEn || '').toLowerCase().includes(searchTerm);

        return nameMatch || nameEnMatch || affiliationMatch || affiliationEnMatch;
    });

    // 2시간 초과자만 필터링 - 별표 룸 기준
    let overtimeCount = 0;
    if (typeof calculateSpeakerTotalTime === 'function') {
        // 전체 초과자 수 계산 (별표 룸 기준)
        AppState.speakers.forEach(speaker => {
            const timeStats = calculateSpeakerTotalTime(speaker.name, null, null, true);
            if (timeStats.totalMinutes > 120) overtimeCount++;
        });
        
        // 초과자 수 표시
        const countEl = document.getElementById('speakerOvertimeCount');
        if (countEl) {
            countEl.textContent = overtimeCount > 0 ? `(${overtimeCount}명 초과 - ⭐룸 기준)` : '(초과자 없음)';
            countEl.style.color = overtimeCount > 0 ? '#E53935' : '#4CAF50';
        }
        
        // 필터 적용
        if (filterOvertime) {
            filtered = filtered.filter(speaker => {
                const timeStats = calculateSpeakerTotalTime(speaker.name, null, null, true);
                return timeStats.totalMinutes > 120;
            });
        }
    }

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
        case 'time-desc':
            // 활동시간 많은 순 (별표 룸 기준)
            if (typeof calculateSpeakerTotalTime === 'function') {
                sorted.sort((a, b) => {
                    const aTime = calculateSpeakerTotalTime(a.name, null, null, true).totalMinutes;
                    const bTime = calculateSpeakerTotalTime(b.name, null, null, true).totalMinutes;
                    return bTime - aTime;
                });
            }
            break;
        case 'time-asc':
            // 활동시간 적은 순 (별표 룸 기준)
            if (typeof calculateSpeakerTotalTime === 'function') {
                sorted.sort((a, b) => {
                    const aTime = calculateSpeakerTotalTime(a.name, null, null, true).totalMinutes;
                    const bTime = calculateSpeakerTotalTime(b.name, null, null, true).totalMinutes;
                    return aTime - bTime;
                });
            }
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
        
        // 연자별 전체 강의 수, 시간, 좌장 계산
        let totalLectures = 0;
        let satScheduled = 0, sunScheduled = 0;
        let satMinutes = 0, sunMinutes = 0;
        let satModerator = 0, sunModerator = 0;
        let satModeratorMinutes = 0, sunModeratorMinutes = 0;
        
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
            
            // 해당 날짜 스케줄에서 배치 및 시간 카운트
            if (dateData?.schedule) {
                Object.values(dateData.schedule).forEach(lecture => {
                    if ((lecture.speakerKo || '') === speaker.name) {
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
                    if (session.moderator === speaker.name) {
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
        
        let statsHtml = '';
        let detailHtml = '';
        
        if (totalLectures > 0 || satModerator > 0 || sunModerator > 0) {
            const totalScheduled = satScheduled + sunScheduled;
            const unscheduled = totalLectures - totalScheduled;
            
            // 통계 문자열 생성 - 첫 줄 (강의 개수)
            let statParts = [];
            if (totalLectures > 0) statParts.push(`총 ${totalLectures}개 강의`);
            if (satScheduled > 0) statParts.push(`토 ${satScheduled}`);
            if (sunScheduled > 0) statParts.push(`일 ${sunScheduled}`);
            if (unscheduled > 0) statParts.push(`미배치 ${unscheduled}`);
            
            // 배경색 결정
            let bgColor = '#4CAF50'; // 전부 배치
            if (unscheduled > 0 && totalScheduled > 0) bgColor = '#ff9800'; // 일부 배치
            else if (unscheduled > 0 && totalScheduled === 0) bgColor = '#f44336'; // 미배치
            else if (totalLectures === 0) bgColor = '#9E9E9E'; // 강의 없음 (좌장만)
            
            if (statParts.length > 0) {
                statsHtml = `<span style="background: ${bgColor}; color: white; padding: 0.1rem 0.5rem; border-radius: 3px; font-size: 0.7rem; margin-left: 0.5rem;">${statParts.join(' / ')}</span>`;
            }
            
            // 상세 정보 - 둘째 줄 (시간)
            let detailParts = [];
            if (satScheduled > 0 || satModerator > 0) {
                let satDetail = '';
                if (satScheduled > 0) satDetail += `토${satScheduled} ${satMinutes}분`;
                if (satModerator > 0) {
                    if (satDetail) satDetail += ', ';
                    satDetail += `좌장${satModerator} ${satModeratorMinutes}분`;
                }
                const satTotal = satMinutes + satModeratorMinutes;
                satDetail += ` - 총 ${satTotal}분`;
                detailParts.push(satDetail);
            }
            if (sunScheduled > 0 || sunModerator > 0) {
                let sunDetail = '';
                if (sunScheduled > 0) sunDetail += `일${sunScheduled} ${sunMinutes}분`;
                if (sunModerator > 0) {
                    if (sunDetail) sunDetail += ', ';
                    sunDetail += `좌장${sunModerator} ${sunModeratorMinutes}분`;
                }
                const sunTotal = sunMinutes + sunModeratorMinutes;
                sunDetail += ` - 총 ${sunTotal}분`;
                detailParts.push(sunDetail);
            }
            
            if (detailParts.length > 0) {
                detailHtml = `<div style="font-size: 0.7rem; color: #666; margin-top: 0.2rem; padding-left: 0.2rem;">${detailParts.join(' | ')}</div>`;
            }
        }
        
        // 총 활동 시간 (별표 룸 기준) - 기존 유지
        let timeStatsHtml = '';
        if (typeof calculateSpeakerTotalTime === 'function') {
            const timeStats = calculateSpeakerTotalTime(speaker.name, null, null, true); // starredOnly = true
            if (timeStats.totalMinutes > 0) {
                const isOverLimit = timeStats.totalMinutes > 120;
                const bgColor = isOverLimit ? '#E53935' : '#2196F3';
                const icon = isOverLimit ? '⚠️' : '⭐';
                
                let timeText = formatMinutesToHM(timeStats.totalMinutes);
                let detailText = '⭐별표 룸 기준\n';
                if (timeStats.lectureMinutes > 0) detailText += `강의 ${timeStats.lectureMinutes}분`;
                if (timeStats.moderatorMinutes > 0) {
                    if (timeStats.lectureMinutes > 0) detailText += ' + ';
                    detailText += `좌장 ${timeStats.moderatorMinutes}분`;
                }
                
                timeStatsHtml = `<span style="background: ${bgColor}; color: white; padding: 0.1rem 0.5rem; border-radius: 3px; font-size: 0.7rem; margin-left: 0.3rem;" title="${detailText}">${icon} ${timeText}</span>`;
            }
        }
        
        return `
            <div class="speaker-item">
                <div class="speaker-info">
                    <strong>${speaker.name}${speaker.nameEn ? ' / ' + speaker.nameEn : ''}${aslsBadge}${statsHtml}${timeStatsHtml}</strong>
                    <small>${speaker.affiliation}${speaker.affiliationEn ? ' / ' + speaker.affiliationEn : ''}</small>
                    ${detailHtml}
                    ${tagsHtml}
                </div>
                <div class="speaker-actions">
                    <button class="btn btn-secondary btn-small" onclick="openSpeakerDetailModal('${speaker.name.replace(/'/g, "\\'")}')" title="강의 목록 보기" style="background: #5C3D8E; color: white;">📋 상세</button>
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
    if (event) event.stopPropagation();
    
    const speaker = AppState.speakers[index];
    if (!speaker) {
        console.error('연자를 찾을 수 없습니다:', index);
        return;
    }

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
    try {
        const expertiseTags = speaker.expertiseTags || calculateSpeakerExpertise(speaker.name);
        updateExpertiseTagsDisplay(expertiseTags);
    } catch (e) {
        console.error('전문 분야 태그 로드 오류:', e);
        const container = document.getElementById('expertiseTagsContainer');
        if (container) container.innerHTML = '';
    }

    document.getElementById('editSpeakerModal').classList.add('active');
};

/**
 * 전문 분야 태그 표시 업데이트
 */
window.updateExpertiseTagsDisplay = function(selectedTags = []) {
    const container = document.getElementById('expertiseTagsContainer');
    if (!container) return;
    
    const tags = getExpertiseTags();
    
    if (!tags || tags.length === 0) {
        container.innerHTML = '<span style="color: #999; font-size: 0.75rem;">분류가 없습니다. 분류 관리에서 추가하세요.</span>';
        return;
    }
    
    container.innerHTML = tags.map(tag => {
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

// ============================================
// 연자 상세보기 기능
// ============================================

/**
 * 연자 상세보기 모달 열기
 */
window.openSpeakerDetailModal = function(speakerName) {
    const speaker = AppState.speakers.find(s => s.name === speakerName);
    if (!speaker) {
        alert('연자 정보를 찾을 수 없습니다.');
        return;
    }
    
    // 해당 연자의 모든 강의 찾기
    const speakerLectures = [];
    
    // 모든 날짜에서 강의 수집
    Object.entries(AppState.dataByDate || {}).forEach(([date, dateData]) => {
        const dateLectures = dateData.lectures || [];
        const dateSchedule = dateData.schedule || {};
        const dateSessions = dateData.sessions || [];
        
        // 강의 목록에서 찾기
        dateLectures.forEach(lecture => {
            if (lecture.speakerKo === speakerName) {
                // 배치 정보 확인
                let scheduleInfo = null;
                Object.entries(dateSchedule).forEach(([key, scheduledLecture]) => {
                    if (scheduledLecture.id === lecture.id) {
                        const [time, room] = key.split('_');
                        scheduleInfo = { time, room, key };
                    }
                });
                
                speakerLectures.push({
                    ...lecture,
                    date,
                    dateLabel: AppConfig.CONFERENCE_DATES.find(d => d.date === date)?.label || date,
                    scheduleInfo,
                    type: 'lecture'
                });
            }
        });
        
        // 세션에서 좌장 역할 확인
        dateSessions.forEach(session => {
            if (session.moderator === speakerName || session.moderator2 === speakerName) {
                speakerLectures.push({
                    titleKo: session.name,
                    date,
                    dateLabel: AppConfig.CONFERENCE_DATES.find(d => d.date === date)?.label || date,
                    scheduleInfo: { time: session.startTime, room: session.room },
                    duration: session.duration || 60,
                    type: 'moderator',
                    category: 'Session'
                });
            }
        });
    });
    
    // 날짜 및 시간순 정렬
    speakerLectures.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const timeA = a.scheduleInfo?.time || '99:99';
        const timeB = b.scheduleInfo?.time || '99:99';
        return timeA.localeCompare(timeB);
    });
    
    // 모달 HTML 생성
    const modalHtml = `
        <div class="modal active" id="speakerDetailModal">
            <div class="modal-content" style="max-width: 700px; max-height: 90vh;">
                <div class="modal-header">
                    <h2>👤 ${speaker.name} ${speaker.nameEn ? `/ ${speaker.nameEn}` : ''}</h2>
                    <button class="modal-close" onclick="closeSpeakerDetailModal()">×</button>
                </div>
                <div style="padding: 0.5rem 1rem; background: var(--bg); border-bottom: 1px solid var(--border);">
                    <p style="margin: 0; color: #666;">
                        🏥 ${speaker.affiliation || '(소속 미입력)'}
                        ${speaker.isASLS ? ' | <span style="color: #8E24AA; font-weight: bold;">ASLS 회원</span>' : ''}
                    </p>
                    <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem;">
                        📊 총 <strong>${speakerLectures.filter(l => l.type === 'lecture').length}</strong>개 강의, 
                        좌장 <strong>${speakerLectures.filter(l => l.type === 'moderator').length}</strong>회
                    </p>
                </div>
                <div style="padding: 1rem; overflow-y: auto; max-height: calc(90vh - 200px);" id="speakerDetailContent">
                    ${generateSpeakerDetailContent(speakerLectures, speaker)}
                </div>
                <div style="padding: 1rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem;">
                    <button class="btn btn-primary" onclick="exportSpeakerDetailPDF('${speakerName}')" style="flex: 1;">
                        📄 PDF 저장
                    </button>
                    <button class="btn btn-secondary" onclick="closeSpeakerDetailModal()">닫기</button>
                </div>
            </div>
        </div>
    `;
    
    // 기존 모달 제거 후 새로 추가
    const existingModal = document.getElementById('speakerDetailModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

/**
 * 연자 상세 내용 생성
 */
function generateSpeakerDetailContent(lectures, speaker) {
    if (lectures.length === 0) {
        return '<p style="text-align: center; color: #999;">등록된 강의가 없습니다.</p>';
    }
    
    let html = '';
    let currentDate = '';
    
    lectures.forEach((lecture, index) => {
        // 날짜 구분
        if (lecture.dateLabel !== currentDate) {
            if (currentDate !== '') html += '</div>';
            currentDate = lecture.dateLabel;
            html += `
                <div style="margin-top: ${index > 0 ? '1rem' : '0'};">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--primary); border-bottom: 2px solid var(--primary); padding-bottom: 0.25rem;">
                        📅 ${currentDate}
                    </h4>
            `;
        }
        
        const categoryColor = AppConfig.categoryColors[lecture.category] || '#757575';
        const isScheduled = lecture.scheduleInfo;
        const statusIcon = isScheduled ? '✅' : '⏳';
        const statusText = isScheduled ? `${lecture.scheduleInfo.time} | ${lecture.scheduleInfo.room}` : '미배치';
        
        if (lecture.type === 'moderator') {
            html += `
                <div style="padding: 0.75rem; margin-bottom: 0.5rem; background: #FFF3E0; border-left: 4px solid #FF9800; border-radius: 4px;">
                    <div style="font-weight: bold; color: #E65100;">🎤 좌장: ${lecture.titleKo}</div>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
                        ${statusText} | ⏱️ ${lecture.duration || 60}분
                    </div>
                </div>
            `;
        } else {
            html += `
                <div style="padding: 0.75rem; margin-bottom: 0.5rem; background: white; border: 1px solid var(--border); border-left: 4px solid ${categoryColor}; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <span style="background: ${categoryColor}; color: white; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; margin-right: 0.5rem;">${lecture.category}</span>
                            ${lecture.isLuncheon ? '<span style="color: #FF8F00;">⭐</span>' : ''}
                            ${lecture.isAcademicLecture || lecture.companyName === '학회강의' ? '<span style="color: #8E24AA;">🎓</span>' : ''}
                        </div>
                        <span style="font-size: 0.75rem; color: ${isScheduled ? '#4CAF50' : '#FF9800'};">${statusIcon} ${statusText}</span>
                    </div>
                    <div style="font-weight: 600; margin: 0.5rem 0 0.25rem 0; color: #333;">${lecture.titleKo}</div>
                    ${lecture.titleEn ? `<div style="font-size: 0.8rem; color: #666;">${lecture.titleEn}</div>` : ''}
                    <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
                        ⏱️ ${lecture.duration || 15}분
                        ${lecture.companyName && lecture.companyName !== '학회강의' ? ` | 🏢 ${lecture.companyName}` : ''}
                        ${lecture.productName ? ` - ${lecture.productName}` : ''}
                    </div>
                </div>
            `;
        }
    });
    
    html += '</div>';
    return html;
}

/**
 * 연자 상세보기 모달 닫기
 */
window.closeSpeakerDetailModal = function() {
    const modal = document.getElementById('speakerDetailModal');
    if (modal) modal.remove();
};

/**
 * 연자 상세 정보 PDF 저장
 */
window.exportSpeakerDetailPDF = function(speakerName) {
    const speaker = AppState.speakers.find(s => s.name === speakerName);
    if (!speaker) return;
    
    const content = document.getElementById('speakerDetailContent');
    if (!content) return;
    
    // PDF 생성을 위한 새 창 열기
    const printWindow = window.open('', '_blank');
    
    // 스타일과 함께 HTML 생성
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${speaker.name} - 강의 일정</title>
            <style>
                body {
                    font-family: 'Malgun Gothic', sans-serif;
                    padding: 20px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                h1 {
                    color: #5C3D8E;
                    border-bottom: 3px solid #5C3D8E;
                    padding-bottom: 10px;
                }
                .info {
                    background: #f5f5f5;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                h4 {
                    color: #5C3D8E;
                    border-bottom: 2px solid #5C3D8E;
                    padding-bottom: 5px;
                    margin-top: 20px;
                }
                .lecture-item {
                    padding: 12px;
                    margin-bottom: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    page-break-inside: avoid;
                }
                .moderator-item {
                    background: #FFF3E0;
                    border-left: 4px solid #FF9800;
                }
                .category-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 4px;
                    color: white;
                    font-size: 11px;
                }
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #999;
                    font-size: 12px;
                }
                @media print {
                    body { padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>👤 ${speaker.name} ${speaker.nameEn ? `/ ${speaker.nameEn}` : ''}</h1>
            <div class="info">
                <p><strong>🏥 소속:</strong> ${speaker.affiliation || '(미입력)'}</p>
                ${speaker.isASLS ? '<p><strong style="color: #8E24AA;">ASLS 회원</strong></p>' : ''}
            </div>
            ${content.innerHTML}
            <div class="footer">
                ASLS Conference Schedule System - ${new Date().toLocaleDateString('ko-KR')}
            </div>
            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};

console.log('✅ chairs.js 로드 완료');
