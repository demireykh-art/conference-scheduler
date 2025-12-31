/**
 * sponsor.js - 업체별 스폰서 강의 관리 모듈
 * 요청사항 #9: 업체별 스폰강의 디테일
 */

(function() {
    'use strict';

    // 강의 종류 기본값
    const DEFAULT_LECTURE_TYPES = [
        { id: 'regular-sat-20', name: '정규강의(토) 20분', duration: 20, day: 'sat' },
        { id: 'regular-sun-15', name: '정규강의(일) 15분', duration: 15, day: 'sun' },
        { id: 'open-lecture', name: '오픈렉처', duration: 15, day: 'all' },
        { id: 'general', name: '일반강의', duration: 15, day: 'all' },
        { id: 'luncheon', name: '런천강의', duration: 20, day: 'all' }
    ];

    // 상태
    let sponsorLectureTypes = [...DEFAULT_LECTURE_TYPES];
    let companyLectureAllocations = {}; // { companyName: { lectureTypeId: count } }

    /**
     * 스폰서 관리 모달 열기
     */
    window.openSponsorManagementModal = function() {
        loadSponsorData();
        document.getElementById('sponsorManagementModal').classList.add('active');
        switchSponsorTab('overview');
    };

    /**
     * 스폰서 관리 모달 닫기
     */
    window.closeSponsorManagementModal = function() {
        document.getElementById('sponsorManagementModal').classList.remove('active');
    };

    /**
     * 스폰서 데이터 Firebase에서 로드
     */
    function loadSponsorData() {
        database.ref('/settings/sponsorLectureTypes').once('value', (snapshot) => {
            if (snapshot.exists()) {
                sponsorLectureTypes = snapshot.val();
            }
        });

        database.ref('/settings/companyLectureAllocations').once('value', (snapshot) => {
            if (snapshot.exists()) {
                companyLectureAllocations = snapshot.val();
            }
        });
    }

    /**
     * 스폰서 데이터 Firebase에 저장
     */
    function saveSponsorData() {
        if (!canEdit()) return;

        database.ref('/settings/sponsorLectureTypes').set(sponsorLectureTypes);
        database.ref('/settings/companyLectureAllocations').set(companyLectureAllocations);
    }

    /**
     * 탭 전환
     */
    window.switchSponsorTab = function(tabName) {
        // 탭 버튼 활성화
        document.querySelectorAll('.sponsor-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const content = document.getElementById('sponsorTabContent');
        
        switch(tabName) {
            case 'overview':
                renderOverviewTab(content);
                break;
            case 'byCompany':
                renderByCompanyTab(content);
                break;
            case 'unscheduled':
                renderUnscheduledTab(content);
                break;
            case 'lectureTypes':
                renderLectureTypesTab(content);
                break;
        }
    };

    /**
     * 전체 현황 탭
     */
    function renderOverviewTab(container) {
        // 업체별 강의 수 집계
        const companyStats = {};
        
        // 모든 날짜의 강의 수집
        Object.keys(AppState.dataByDate).forEach(date => {
            const lectures = AppState.dataByDate[date].lectures || [];
            const schedule = AppState.dataByDate[date].schedule || {};
            
            lectures.forEach(lecture => {
                if (lecture.companyName) {
                    if (!companyStats[lecture.companyName]) {
                        companyStats[lecture.companyName] = { total: 0, scheduled: 0, unscheduled: 0 };
                    }
                    companyStats[lecture.companyName].total++;
                    
                    // 배치 여부 확인
                    const isScheduled = Object.values(schedule).some(s => s.id === lecture.id);
                    if (isScheduled) {
                        companyStats[lecture.companyName].scheduled++;
                    } else {
                        companyStats[lecture.companyName].unscheduled++;
                    }
                }
            });
        });

        const sortedCompanies = Object.entries(companyStats).sort((a, b) => b[1].total - a[1].total);

        let html = `
            <div style="background: #E8F4FD; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <h3 style="margin: 0 0 0.5rem 0;">📊 스폰서 강의 현황</h3>
                <p style="margin: 0; font-size: 0.9rem; color: #666;">
                    총 <strong>${sortedCompanies.length}</strong>개 업체, 
                    <strong>${sortedCompanies.reduce((sum, [_, s]) => sum + s.total, 0)}</strong>개 스폰서 강의
                </p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead style="background: var(--primary); color: white;">
                    <tr>
                        <th style="padding: 0.75rem; text-align: left;">업체명</th>
                        <th style="padding: 0.75rem; text-align: center; width: 80px;">전체</th>
                        <th style="padding: 0.75rem; text-align: center; width: 80px;">배치됨</th>
                        <th style="padding: 0.75rem; text-align: center; width: 80px;">미배치</th>
                        <th style="padding: 0.75rem; text-align: center; width: 100px;">진행률</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedCompanies.forEach(([company, stats]) => {
            const progress = stats.total > 0 ? Math.round((stats.scheduled / stats.total) * 100) : 0;
            const progressColor = progress === 100 ? '#27ae60' : progress >= 50 ? '#f39c12' : '#e74c3c';
            
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 0.75rem;">${company}</td>
                    <td style="padding: 0.75rem; text-align: center; font-weight: bold;">${stats.total}</td>
                    <td style="padding: 0.75rem; text-align: center; color: #27ae60;">${stats.scheduled}</td>
                    <td style="padding: 0.75rem; text-align: center; color: ${stats.unscheduled > 0 ? '#e74c3c' : '#999'};">${stats.unscheduled}</td>
                    <td style="padding: 0.75rem; text-align: center;">
                        <div style="background: #eee; border-radius: 10px; height: 8px; overflow: hidden;">
                            <div style="background: ${progressColor}; height: 100%; width: ${progress}%;"></div>
                        </div>
                        <small style="color: ${progressColor};">${progress}%</small>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';

        if (sortedCompanies.length === 0) {
            html = '<p style="text-align: center; color: #999; padding: 2rem;">스폰서 강의가 없습니다.</p>';
        }

        container.innerHTML = html;
    }

    /**
     * 업체별 보기 탭
     */
    function renderByCompanyTab(container) {
        const companies = [...new Set(
            Object.values(AppState.dataByDate)
                .flatMap(d => (d.lectures || []))
                .filter(l => l.companyName)
                .map(l => l.companyName)
        )].sort();

        let html = `
            <div style="margin-bottom: 1rem;">
                <select id="sponsorCompanySelect" onchange="renderCompanyDetail(this.value)" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem;">
                    <option value="">-- 업체 선택 --</option>
                    ${companies.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
            <div id="companyDetailContent">
                <p style="text-align: center; color: #999; padding: 2rem;">업체를 선택하세요.</p>
            </div>
        `;

        container.innerHTML = html;
    }

    /**
     * 선택한 업체의 상세 정보 렌더링
     */
    window.renderCompanyDetail = function(companyName) {
        const detailContainer = document.getElementById('companyDetailContent');
        
        if (!companyName) {
            detailContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 2rem;">업체를 선택하세요.</p>';
            return;
        }

        // 해당 업체의 모든 강의 수집
        const companyLectures = [];
        Object.keys(AppState.dataByDate).forEach(date => {
            const lectures = AppState.dataByDate[date].lectures || [];
            const schedule = AppState.dataByDate[date].schedule || {};
            
            lectures.forEach(lecture => {
                if (lecture.companyName === companyName) {
                    // 배치 정보 찾기
                    let scheduleInfo = null;
                    Object.entries(schedule).forEach(([key, val]) => {
                        if (val.id === lecture.id) {
                            const [time, room] = [key.substring(0, 5), key.substring(6)];
                            scheduleInfo = { time, room, date };
                        }
                    });
                    
                    companyLectures.push({
                        ...lecture,
                        date,
                        scheduleInfo
                    });
                }
            });
        });

        let html = `
            <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0;">🏢 ${companyName}</h4>
                <p style="margin: 0; font-size: 0.85rem; color: #666;">
                    총 ${companyLectures.length}개 강의 | 
                    배치됨: ${companyLectures.filter(l => l.scheduleInfo).length}개 | 
                    미배치: ${companyLectures.filter(l => !l.scheduleInfo).length}개
                </p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                <thead style="background: var(--primary); color: white;">
                    <tr>
                        <th style="padding: 0.5rem;">제목</th>
                        <th style="padding: 0.5rem;">연자</th>
                        <th style="padding: 0.5rem;">시간</th>
                        <th style="padding: 0.5rem;">상태</th>
                    </tr>
                </thead>
                <tbody>
        `;

        companyLectures.forEach(lecture => {
            const statusBadge = lecture.scheduleInfo 
                ? `<span style="background: #d4edda; color: #155724; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">
                     ${lecture.scheduleInfo.date} ${lecture.scheduleInfo.time}<br>${lecture.scheduleInfo.room}
                   </span>`
                : `<span style="background: #f8d7da; color: #721c24; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">미배치</span>`;

            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 0.5rem;">${lecture.titleKo || lecture.titleEn || '-'}</td>
                    <td style="padding: 0.5rem;">${lecture.speakerKo || '-'}</td>
                    <td style="padding: 0.5rem;">${lecture.duration || 15}분</td>
                    <td style="padding: 0.5rem;">${statusBadge}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        detailContainer.innerHTML = html;
    };

    /**
     * 미배치 강의 탭
     */
    function renderUnscheduledTab(container) {
        const unscheduledLectures = [];
        
        Object.keys(AppState.dataByDate).forEach(date => {
            const lectures = AppState.dataByDate[date].lectures || [];
            const schedule = AppState.dataByDate[date].schedule || {};
            const scheduledIds = new Set(Object.values(schedule).map(s => s.id));
            
            lectures.forEach(lecture => {
                if (lecture.companyName && !scheduledIds.has(lecture.id)) {
                    unscheduledLectures.push({ ...lecture, date });
                }
            });
        });

        // 업체별로 그룹화
        const byCompany = {};
        unscheduledLectures.forEach(lecture => {
            if (!byCompany[lecture.companyName]) {
                byCompany[lecture.companyName] = [];
            }
            byCompany[lecture.companyName].push(lecture);
        });

        let html = `
            <div style="background: #FFF3E0; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <h3 style="margin: 0 0 0.5rem 0;">📌 미배치 스폰서 강의</h3>
                <p style="margin: 0; font-size: 0.9rem; color: #E65100;">
                    총 <strong>${unscheduledLectures.length}</strong>개 강의가 시간표에 배치되지 않았습니다.
                </p>
            </div>
        `;

        if (unscheduledLectures.length === 0) {
            html += '<p style="text-align: center; color: #27ae60; padding: 2rem;">✅ 모든 스폰서 강의가 배치되었습니다!</p>';
        } else {
            Object.entries(byCompany).sort((a, b) => b[1].length - a[1].length).forEach(([company, lectures]) => {
                html += `
                    <div style="margin-bottom: 1rem; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                        <div style="background: #f5f5f5; padding: 0.75rem; font-weight: bold; border-bottom: 1px solid #ddd;">
                            🏢 ${company} <span style="color: #e74c3c;">(${lectures.length}개 미배치)</span>
                        </div>
                        <div style="padding: 0.5rem;">
                `;
                
                lectures.forEach(lecture => {
                    html += `
                        <div style="padding: 0.5rem; border-bottom: 1px solid #eee; font-size: 0.85rem;">
                            <strong>${lecture.titleKo || lecture.titleEn}</strong>
                            <span style="color: #666;"> - ${lecture.speakerKo || '연자 미정'} (${lecture.duration || 15}분)</span>
                            <span style="color: #999; font-size: 0.75rem;"> [${lecture.date}]</span>
                        </div>
                    `;
                });
                
                html += '</div></div>';
            });
        }

        container.innerHTML = html;
    }

    /**
     * 강의 종류 설정 탭
     */
    function renderLectureTypesTab(container) {
        let html = `
            <div style="background: #E3F2FD; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <p style="margin: 0; font-size: 0.9rem;">⚙️ 업체별로 할당할 수 있는 강의 종류를 관리합니다.</p>
            </div>
            
            <div style="margin-bottom: 1rem;">
                <h4 style="margin-bottom: 0.5rem;">새 강의 종류 추가</h4>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <input type="text" id="newLectureTypeName" placeholder="강의 종류명" style="flex: 2; min-width: 150px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 6px;">
                    <input type="number" id="newLectureTypeDuration" placeholder="시간(분)" value="15" min="5" max="120" style="width: 80px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 6px;">
                    <button class="btn btn-primary btn-small" onclick="addLectureType()">추가</button>
                </div>
            </div>
            
            <h4 style="margin-bottom: 0.5rem;">현재 강의 종류</h4>
            <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        `;

        sponsorLectureTypes.forEach((type, idx) => {
            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid #eee; ${idx % 2 === 0 ? 'background: #fafafa;' : ''}">
                    <div>
                        <strong>${type.name}</strong>
                        <span style="color: #666; font-size: 0.85rem;"> (${type.duration}분)</span>
                    </div>
                    <button class="btn btn-secondary btn-small" onclick="deleteLectureType('${type.id}')" style="color: #e74c3c;">삭제</button>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    /**
     * 강의 종류 추가
     */
    window.addLectureType = function() {
        const name = document.getElementById('newLectureTypeName').value.trim();
        const duration = parseInt(document.getElementById('newLectureTypeDuration').value) || 15;

        if (!name) {
            alert('강의 종류명을 입력해주세요.');
            return;
        }

        const id = 'custom-' + Date.now();
        sponsorLectureTypes.push({ id, name, duration, day: 'all' });
        saveSponsorData();
        
        document.getElementById('newLectureTypeName').value = '';
        switchSponsorTab('lectureTypes');
        
        alert(`✅ "${name}" 강의 종류가 추가되었습니다.`);
    };

    /**
     * 강의 종류 삭제
     */
    window.deleteLectureType = function(typeId) {
        if (!confirm('이 강의 종류를 삭제하시겠습니까?')) return;

        sponsorLectureTypes = sponsorLectureTypes.filter(t => t.id !== typeId);
        saveSponsorData();
        switchSponsorTab('lectureTypes');
    };

    console.log('✅ sponsor.js 로드 완료');
})();
