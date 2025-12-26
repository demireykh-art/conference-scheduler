/**
 * modals.js - 모달 관리
 */

// ============================================
// 도움말 모달
// ============================================

window.openHelpModal = function() {
    document.getElementById('helpModal').classList.add('active');
};

window.closeHelpModal = function() {
    document.getElementById('helpModal').classList.remove('active');
};

// ============================================
// 분류 관리 모달
// ============================================

window.openCategoryModal = function() {
    updateCategoryList();
    document.getElementById('categoryModal').classList.add('active');
};

window.closeCategoryModal = function() {
    document.getElementById('categoryModal').classList.remove('active');
};

window.updateCategoryList = function() {
    const list = document.getElementById('categoryList');
    const sortedCategories = [...AppState.categories].sort();

    list.innerHTML = sortedCategories.map(cat => {
        const color = AppConfig.categoryColors[cat] || '#9B59B6';
        return `
            <div class="speaker-item">
                <div class="speaker-info" style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: ${color};"></div>
                    <strong>${cat}</strong>
                </div>
                <div class="speaker-actions">
                    <input type="color" value="${color}" onchange="updateCategoryColor('${cat}', this.value)" style="width: 40px; height: 32px; border: none; cursor: pointer;">
                    <button class="btn btn-secondary btn-small" onclick="deleteCategory('${cat}')">삭제</button>
                </div>
            </div>
        `;
    }).join('');
};

window.addCategory = function() {
    const name = document.getElementById('newCategoryName').value.trim();
    const color = document.getElementById('newCategoryColor').value;

    if (!name) {
        alert('분류명을 입력해주세요.');
        return;
    }

    if (AppState.categories.includes(name)) {
        alert('이미 존재하는 분류입니다.');
        return;
    }

    AppState.categories.push(name);
    AppState.categories.sort();
    AppConfig.categoryColors[name] = color;

    document.getElementById('newCategoryName').value = '';

    updateCategoryDropdowns();
    updateCategoryList();
    createCategoryFilters();
    saveAndSync();
};

window.updateCategoryColor = function(cat, color) {
    AppConfig.categoryColors[cat] = color;
    updateCategoryList();
    createCategoryFilters();
    updateLectureList();
    updateScheduleDisplay();
    saveAndSync();
};

window.deleteCategory = function(cat) {
    if (cat === 'Others') {
        alert('"Others" 분류는 삭제할 수 없습니다.');
        return;
    }

    if (!confirm(`"${cat}" 분류를 삭제하시겠습니까?\n\n해당 분류의 강의는 "Others"로 변경됩니다.`)) {
        return;
    }

    AppState.lectures.forEach(lecture => {
        if (lecture.category === cat) {
            lecture.category = 'Others';
        }
    });

    Object.keys(AppState.schedule).forEach(key => {
        if (AppState.schedule[key].category === cat) {
            AppState.schedule[key].category = 'Others';
        }
    });

    AppState.categories = AppState.categories.filter(c => c !== cat);
    delete AppConfig.categoryColors[cat];

    updateCategoryDropdowns();
    updateCategoryList();
    createCategoryFilters();
    updateLectureList();
    updateScheduleDisplay();
    saveAndSync();
};

// ============================================
// 업체 관리 모달
// ============================================

window.openCompanyModal = function() {
    updateCompanyList();
    document.getElementById('companyModal').classList.add('active');
};

window.closeCompanyModal = function() {
    document.getElementById('companyModal').classList.remove('active');
};

window.updateCompanyList = function(filterText = '') {
    const list = document.getElementById('companyList');
    const sortedCompanies = [...AppState.companies].sort((a, b) => a.localeCompare(b, 'ko'));

    const filtered = filterText
        ? sortedCompanies.filter(c => c.toLowerCase().includes(filterText.toLowerCase()))
        : sortedCompanies;

    document.getElementById('companyCount').textContent = AppState.companies.length;

    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #999; padding: 2rem;">검색 결과가 없습니다.</p>';
        return;
    }

    list.innerHTML = filtered.map(company => `
        <div class="speaker-item" style="padding: 0.5rem 0.75rem;">
            <div class="speaker-info">
                <strong style="font-size: 0.9rem;">${company}</strong>
            </div>
            <div class="speaker-actions">
                <button class="btn btn-secondary btn-small" onclick="editCompany('${company.replace(/'/g, "\\'")}')">수정</button>
                <button class="btn btn-secondary btn-small" onclick="deleteCompany('${company.replace(/'/g, "\\'")}')">삭제</button>
            </div>
        </div>
    `).join('');
};

window.filterCompanyList = function() {
    const filterText = document.getElementById('companySearchInput').value;
    updateCompanyList(filterText);
};

window.addCompany = function() {
    const name = document.getElementById('newCompanyName').value.trim();

    if (!name) {
        alert('업체명을 입력해주세요.');
        return;
    }

    if (AppState.companies.includes(name)) {
        alert('이미 존재하는 업체입니다.');
        return;
    }

    AppState.companies.push(name);
    AppState.companies.sort((a, b) => a.localeCompare(b, 'ko'));

    document.getElementById('newCompanyName').value = '';

    updateCompanyList();
    saveAndSync();

    alert(`✅ "${name}" 업체가 추가되었습니다.`);
};

window.editCompany = function(oldName) {
    const newName = prompt('업체명 수정:', oldName);

    if (!newName || newName.trim() === '') return;
    if (newName.trim() === oldName) return;

    if (AppState.companies.includes(newName.trim())) {
        alert('이미 존재하는 업체명입니다.');
        return;
    }

    const index = AppState.companies.indexOf(oldName);
    if (index > -1) {
        AppState.companies[index] = newName.trim();
        AppState.companies.sort((a, b) => a.localeCompare(b, 'ko'));
        updateCompanyList();
        saveAndSync();
    }
};

window.deleteCompany = function(name) {
    if (!confirm(`"${name}" 업체를 삭제하시겠습니까?`)) return;

    const index = AppState.companies.indexOf(name);
    if (index > -1) {
        AppState.companies.splice(index, 1);
        updateCompanyList();
        saveAndSync();
    }
};

// ============================================
// 업체 자동완성
// ============================================

window.setupCompanyAutocomplete = function() {
    const input = document.getElementById('companyName');
    const dropdown = document.getElementById('companyAutocomplete');

    if (!input || !dropdown) return;

    input.addEventListener('input', function() {
        const value = this.value.trim().toLowerCase();

        if (value.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        const matches = AppState.companies.filter(c =>
            c.toLowerCase().includes(value)
        ).slice(0, 10);

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = matches.map(company => `
            <div class="autocomplete-item" onmousedown="selectCompany('${company.replace(/'/g, "\\'")}')">
                ${company}
            </div>
        `).join('');
        dropdown.style.display = 'block';
    });

    input.addEventListener('blur', function() {
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 150);
    });

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });
};

window.selectCompany = function(name) {
    document.getElementById('companyName').value = name;
    document.getElementById('companyAutocomplete').style.display = 'none';
};

// ============================================
// 사용자 관리 모달
// ============================================

window.openUserManagementModal = function() {
    if (!isAdmin()) {
        alert('관리자만 접근할 수 있습니다.');
        return;
    }

    document.getElementById('userManagementModal').classList.add('active');
    loadUserList();
};

window.closeUserManagementModal = function() {
    document.getElementById('userManagementModal').classList.remove('active');
};

window.loadUserList = function() {
    const pendingList = document.getElementById('pendingUsersList');
    const approvedList = document.getElementById('approvedUsersList');

    pendingList.innerHTML = '<p style="color:#999; text-align:center;">로딩 중...</p>';
    approvedList.innerHTML = '<p style="color:#999; text-align:center;">로딩 중...</p>';

    database.ref('/users').once('value', (snapshot) => {
        const users = snapshot.val() || {};

        const pending = [];
        const approved = [];

        Object.entries(users).forEach(([uid, user]) => {
            user.uid = uid;
            if (user.role === 'pending') {
                pending.push(user);
            } else {
                approved.push(user);
            }
        });

        document.getElementById('pendingCount').textContent = pending.length + '명';
        document.getElementById('approvedCount').textContent = approved.length + '명';

        if (pending.length === 0) {
            pendingList.innerHTML = '<p style="color:#999; text-align:center; padding:1rem;">승인 대기 중인 사용자가 없습니다.</p>';
        } else {
            pendingList.innerHTML = pending.map(user => `
                <div class="user-item pending">
                    <img class="user-item-photo" src="${user.photoURL || 'https://via.placeholder.com/40'}" alt="">
                    <div class="user-item-info">
                        <div class="user-item-name">${user.displayName || '이름 없음'}</div>
                        <div class="user-item-email">${user.email}</div>
                        <div class="user-item-date">${formatDate(user.createdAt)} 가입</div>
                    </div>
                    <div class="user-item-actions">
                        <button class="approve-btn" onclick="approveUser('${user.uid}', 'editor')">✅ 승인</button>
                        <button class="reject-btn" onclick="rejectUser('${user.uid}')">❌ 거부</button>
                    </div>
                </div>
            `).join('');
        }

        if (approved.length === 0) {
            approvedList.innerHTML = '<p style="color:#999; text-align:center; padding:1rem;">승인된 사용자가 없습니다.</p>';
        } else {
            approvedList.innerHTML = approved.map(user => `
                <div class="user-item ${user.role}">
                    <img class="user-item-photo" src="${user.photoURL || 'https://via.placeholder.com/40'}" alt="">
                    <div class="user-item-info">
                        <div class="user-item-name">${user.displayName || '이름 없음'}</div>
                        <div class="user-item-email">${user.email}</div>
                        <div class="user-item-role ${user.role}">${user.role === 'admin' ? '👑 관리자' : '✏️ 편집자'}</div>
                    </div>
                    <div class="user-item-actions">
                        ${user.email !== AppConfig.SUPER_ADMIN_EMAIL ? `
                            <select onchange="changeUserRole('${user.uid}', this.value)" class="role-select">
                                <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>편집자</option>
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>관리자</option>
                            </select>
                            <button class="remove-btn" onclick="removeUser('${user.uid}', '${user.email}')">🗑️</button>
                        ` : '<span style="color:#999; font-size:0.75rem;">최초 관리자</span>'}
                    </div>
                </div>
            `).join('');
        }
    });
};

window.approveUser = function(uid, role) {
    database.ref(`/users/${uid}/role`).set(role)
        .then(() => {
            loadUserList();
            updatePendingBadge();
        })
        .catch(err => alert('승인 실패: ' + err.message));
};

window.rejectUser = function(uid) {
    if (!confirm('이 사용자의 접근을 거부하시겠습니까?')) return;

    database.ref(`/users/${uid}`).remove()
        .then(() => {
            loadUserList();
            updatePendingBadge();
        })
        .catch(err => alert('거부 실패: ' + err.message));
};

window.changeUserRole = function(uid, newRole) {
    database.ref(`/users/${uid}/role`).set(newRole)
        .then(() => loadUserList())
        .catch(err => alert('역할 변경 실패: ' + err.message));
};

window.removeUser = function(uid, email) {
    if (!confirm(`"${email}" 사용자를 삭제하시겠습니까?`)) return;

    database.ref(`/users/${uid}`).remove()
        .then(() => loadUserList())
        .catch(err => alert('삭제 실패: ' + err.message));
};

// ============================================
// 백업 관리 모달
// ============================================

window.openBackupModal = function() {
    if (!AppState.currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }
    document.getElementById('backupModal').classList.add('active');
    loadBackupList();
};

window.closeBackupModal = function() {
    document.getElementById('backupModal').classList.remove('active');
};

window.loadBackupList = function() {
    const list = document.getElementById('backupList');
    list.innerHTML = '<p style="text-align:center; color:#999;">로딩 중...</p>';

    database.ref('/backups').orderByChild('createdAt').limitToLast(20).once('value', (snapshot) => {
        const backups = [];
        snapshot.forEach((child) => {
            backups.push({ id: child.key, ...child.val() });
        });

        backups.reverse();

        if (backups.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:#999; padding:2rem;">저장된 백업이 없습니다.</p>';
            return;
        }

        list.innerHTML = backups.map(backup => `
            <div class="backup-item">
                <div class="backup-info">
                    <div class="backup-id">📁 ${backup.id}</div>
                    <div class="backup-meta">${backup.createdBy} · ${formatDateTime(backup.createdAt)}</div>
                </div>
                <div class="backup-actions">
                    <button class="btn btn-small btn-primary" onclick="restoreBackup('${backup.id}')">복원</button>
                    <button class="btn btn-small btn-secondary" onclick="deleteBackup('${backup.id}')">삭제</button>
                </div>
            </div>
        `).join('');
    });
};

window.createBackup = function() {
    if (!canEdit()) {
        alert('편집 권한이 필요합니다.');
        return;
    }

    const now = new Date();
    const backupId = now.toISOString().split('T')[0] + '_' + now.toTimeString().split(' ')[0].replace(/:/g, '-');

    saveCurrentDateData();

    const backupData = {
        dataByDate: AppState.dataByDate,
        speakers: AppState.speakers,
        companies: AppState.companies,
        categories: AppState.categories,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: AppState.currentUser.email
    };

    database.ref(`/backups/${backupId}`).set(backupData)
        .then(() => {
            alert(`✅ 백업이 생성되었습니다.\n\n백업 ID: ${backupId}`);
            loadBackupList();
        })
        .catch((error) => {
            alert('백업 생성 실패: ' + error.message);
        });
};

window.restoreBackup = function(backupId) {
    if (!canEdit()) {
        alert('편집 권한이 필요합니다.');
        return;
    }

    if (!confirm(`"${backupId}" 백업을 복원하시겠습니까?\n\n현재 데이터가 백업 데이터로 대체됩니다.`)) {
        return;
    }

    database.ref(`/backups/${backupId}`).once('value', (snapshot) => {
        const backup = snapshot.val();
        if (!backup) {
            alert('백업을 찾을 수 없습니다.');
            return;
        }

        // 복원 전 자동 백업
        const autoBackupId = 'auto_before_restore_' + new Date().toISOString().replace(/[:.]/g, '-');
        saveCurrentDateData();
        database.ref(`/backups/${autoBackupId}`).set({
            dataByDate: AppState.dataByDate,
            speakers: AppState.speakers,
            categories: AppState.categories,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: AppState.currentUser.email + ' (자동백업)'
        });

        // 데이터 복원
        const dataToRestore = {
            dataByDate: backup.dataByDate || {},
            speakers: backup.speakers || [],
            companies: backup.companies || [],
            categories: backup.categories || [],
            lastModified: firebase.database.ServerValue.TIMESTAMP,
            lastModifiedBy: AppState.currentUser.email + ' (복원)'
        };

        database.ref('/data').set(dataToRestore)
            .then(() => {
                alert('✅ 백업이 복원되었습니다.');
                closeBackupModal();
            })
            .catch(err => alert('복원 실패: ' + err.message));
    });
};

window.deleteBackup = function(backupId) {
    if (!isAdmin()) {
        alert('관리자만 백업을 삭제할 수 있습니다.');
        return;
    }

    if (!confirm(`"${backupId}" 백업을 삭제하시겠습니까?`)) return;

    database.ref(`/backups/${backupId}`).remove()
        .then(() => loadBackupList())
        .catch(err => alert('삭제 실패: ' + err.message));
};

// ============================================
// 시간 설정 모달
// ============================================

window.openTimeSettingsModal = function() {
    if (!canEdit()) {
        alert('편집 권한이 없습니다.');
        return;
    }

    const dateInfo = AppConfig.CONFERENCE_DATES.find(d => d.date === AppState.currentDate);
    document.getElementById('timeSettingsDateLabel').textContent = dateInfo ? dateInfo.label : AppState.currentDate;

    const startSelect = document.getElementById('startTimeSelect');
    const endSelect = document.getElementById('endTimeSelect');

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    ALL_TIME_OPTIONS.forEach(time => {
        startSelect.innerHTML += `<option value="${time}">${time}</option>`;
        endSelect.innerHTML += `<option value="${time}">${time}</option>`;
    });

    const settings = AppState.timeSettingsByDate[AppState.currentDate] || { startTime: '08:30', endTime: '17:00' };
    startSelect.value = settings.startTime;
    endSelect.value = settings.endTime;

    document.getElementById('timeSettingsModal').classList.add('active');
};

window.closeTimeSettingsModal = function() {
    document.getElementById('timeSettingsModal').classList.remove('active');
};

window.applyTimeSettings = function() {
    const startTime = document.getElementById('startTimeSelect').value;
    const endTime = document.getElementById('endTimeSelect').value;

    const startIndex = ALL_TIME_OPTIONS.indexOf(startTime);
    const endIndex = ALL_TIME_OPTIONS.indexOf(endTime);

    if (startIndex >= endIndex) {
        alert('종료 시간은 시작 시간보다 뒤여야 합니다.');
        return;
    }

    AppState.timeSettingsByDate[AppState.currentDate] = { startTime, endTime };
    generateTimeSlots();
    updateScheduleDisplay();
    createScheduleTable();
    saveTimeSettingsToFirebase();
    closeTimeSettingsModal();

    alert(`✅ 시간대가 ${startTime} ~ ${endTime}으로 설정되었습니다.`);
};

// ============================================
// 맞바꾸기 다이얼로그
// ============================================

window.showSwapDialog = function(targetKey, time, room, newLecture, sourceKey) {
    const existingLecture = AppState.schedule[targetKey];

    const dialog = document.createElement('div');
    dialog.className = 'swap-dialog-overlay';
    dialog.innerHTML = `
        <div class="swap-dialog">
            <h3>⚠️ 강의가 이미 있습니다</h3>
            <p><strong>기존:</strong> ${existingLecture.titleKo} (${existingLecture.speakerKo})</p>
            <p><strong>새로운:</strong> ${newLecture.titleKo} (${newLecture.speakerKo})</p>
            <div class="swap-options">
                <button class="swap-option" data-action="replace" autofocus>
                    <span class="option-key">1</span> 대체 (기존 강의 삭제)
                </button>
                <button class="swap-option" data-action="swap">
                    <span class="option-key">2</span> 맞바꾸기 (위치 교환)
                </button>
                <button class="swap-option cancel" data-action="cancel">
                    <span class="option-key">ESC</span> 취소
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const handleAction = (action) => {
        dialog.remove();
        document.removeEventListener('keydown', handleKeydown);

        if (action === 'cancel') {
            AppState.draggedScheduleKey = null;
            AppState.draggedLecture = null;
            return;
        }

        saveStateForUndo();

        if (action === 'replace') {
            if (sourceKey) {
                delete AppState.schedule[sourceKey];
            }
            AppState.schedule[targetKey] = { ...newLecture };
        } else if (action === 'swap') {
            if (sourceKey) {
                AppState.schedule[sourceKey] = { ...existingLecture };
                AppState.schedule[targetKey] = { ...newLecture };
            } else {
                AppState.schedule[targetKey] = { ...newLecture };
            }
        }

        saveAndSync();
        updateScheduleDisplay();
        AppState.draggedScheduleKey = null;
        AppState.draggedLecture = null;
    };

    dialog.querySelectorAll('.swap-option').forEach(btn => {
        btn.onclick = () => handleAction(btn.dataset.action);
    });

    const handleKeydown = (e) => {
        if (e.key === '1') handleAction('replace');
        else if (e.key === '2') handleAction('swap');
        else if (e.key === 'Escape') handleAction('cancel');
        else if (e.key === 'Enter') {
            const focused = dialog.querySelector('.swap-option:focus');
            if (focused) handleAction(focused.dataset.action);
        }
    };
    document.addEventListener('keydown', handleKeydown);

    dialog.querySelector('.swap-option[autofocus]').focus();
};

window.showAlreadyPlacedDialog = function(existingKey, existingTime, existingRoom, newKey, newTime, newRoom, lecture) {
    const dialog = document.createElement('div');
    dialog.className = 'swap-dialog-overlay';
    dialog.innerHTML = `
        <div class="swap-dialog">
            <h3>⚠️ 이미 배치된 강의입니다</h3>
            <p style="margin-bottom: 0.5rem;"><strong>강의:</strong> ${lecture.titleKo}</p>
            <p style="margin-bottom: 1rem; color: var(--accent);"><strong>현재 위치:</strong> ${existingRoom} ${existingTime}</p>
            <div class="swap-options">
                <button class="swap-option" data-action="move" autofocus>
                    <span class="option-key">1</span> 기존 배치 삭제 후 새 위치에 배치
                </button>
                <button class="swap-option cancel" data-action="cancel">
                    <span class="option-key">ESC</span> 취소
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const handleAction = (action) => {
        dialog.remove();
        document.removeEventListener('keydown', handleKeydown);

        if (action === 'cancel') {
            AppState.draggedScheduleKey = null;
            AppState.draggedLecture = null;
            return;
        }

        if (action === 'move') {
            saveStateForUndo();
            delete AppState.schedule[existingKey];

            if (AppState.schedule[newKey]) {
                const targetLecture = AppState.schedule[newKey];
                if (confirm(`새 위치(${newRoom} ${newTime})에 이미 "${targetLecture.titleKo}" 강의가 있습니다.\n대체하시겠습니까?`)) {
                    AppState.schedule[newKey] = { ...lecture };
                }
            } else {
                const newLecture = { ...lecture };
                const sessionAtCell = AppState.sessions.find(s => s.time === newTime && s.room === newRoom);
                if (sessionAtCell) {
                    newLecture.sessionId = sessionAtCell.id;
                }
                AppState.schedule[newKey] = newLecture;
            }

            saveAndSync();
            updateScheduleDisplay();
        }

        AppState.draggedScheduleKey = null;
        AppState.draggedLecture = null;
    };

    dialog.querySelectorAll('.swap-option').forEach(btn => {
        btn.onclick = () => handleAction(btn.dataset.action);
    });

    const handleKeydown = (e) => {
        if (e.key === '1') handleAction('move');
        else if (e.key === 'Escape') handleAction('cancel');
        else if (e.key === 'Enter') {
            const focused = dialog.querySelector('.swap-option:focus');
            if (focused) handleAction(focused.dataset.action);
        }
    };
    document.addEventListener('keydown', handleKeydown);

    dialog.querySelector('.swap-option[autofocus]').focus();
};

// 모달 외부 클릭 시 닫기
window.onclick = function(event) {
    if (event.target.className === 'modal active') {
        event.target.classList.remove('active');
    }
};

console.log('✅ modals.js 로드 완료');
