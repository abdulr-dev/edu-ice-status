// Simple but complete dashboard script

// ===== PASSWORD PROTECTION FOR TRAINER STATS =====
// Hash of the password (SHA-256) - password is NOT stored in plain text
// To change password: generate new hash at https://emn178.github.io/online-tools/sha256.html
const TRAINER_STATS_PASSWORD_HASH = 'b2294cbadf6f4da2e844eba86d816356723b559073f422547246c13f4a3c4d87';

// SHA-256 hash function
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Check if trainer stats is authenticated this session
function isTrainerStatsAuthenticated() {
    return sessionStorage.getItem('trainerStatsAuth') === 'true';
}

// Verify password and authenticate
async function verifyTrainerStatsPassword(password) {
    const hash = await sha256(password);
    if (hash === TRAINER_STATS_PASSWORD_HASH) {
        sessionStorage.setItem('trainerStatsAuth', 'true');
        return true;
    }
    return false;
}

// Show password overlay for trainer stats
function showTrainerStatsPasswordOverlay(container, summaryContainer) {
    if (summaryContainer) summaryContainer.innerHTML = '';
    
    container.innerHTML = `
        <div class="password-overlay">
            <div class="password-modal">
                <div class="password-icon">🔒</div>
                <h3>Trainer Stats - Restricted Access</h3>
                <p>This section is only accessible to team leads.</p>
                <div class="password-input-group">
                    <input type="password" id="trainer-stats-password" placeholder="Enter password" autocomplete="off">
                    <button onclick="submitTrainerStatsPassword()" class="password-submit-btn">Unlock</button>
                </div>
                <div id="password-error" class="password-error"></div>
                <p class="password-hint">Contact your lead if you need access.</p>
            </div>
        </div>
    `;
    
    // Add enter key listener
    setTimeout(() => {
        const input = document.getElementById('trainer-stats-password');
        if (input) {
            input.focus();
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    submitTrainerStatsPassword();
                }
            });
        }
    }, 100);
}

// Handle password submission
async function submitTrainerStatsPassword() {
    const input = document.getElementById('trainer-stats-password');
    const errorDiv = document.getElementById('password-error');
    
    if (!input || !input.value) {
        errorDiv.textContent = 'Please enter a password';
        return;
    }
    
    const isValid = await verifyTrainerStatsPassword(input.value);
    
    if (isValid) {
        // Reload trainer stats with actual data
        loadData('trainer-stats');
    } else {
        errorDiv.textContent = 'Incorrect password. Access denied.';
        input.value = '';
        input.focus();
    }
}

// Check if CONFIG is loaded from config.js
if (typeof CONFIG === 'undefined') {
    console.error('CONFIG not found! Make sure config.js is loaded before this script.');
    alert('Configuration error: config.js not loaded');
    throw new Error('CONFIG not defined');
}

// Use configuration from config.js
const AUTH_TOKEN = CONFIG.AUTH_TOKEN;
const PROJECT_ID = CONFIG.PROJECT_ID || 640;

// Detect environment
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// API base URL - different for local vs deployed
const LOCAL_API_BASE = (CONFIG.LOCAL_PROXY || 'http://localhost:3000') + '/api/conversations';
const TURING_API_BASE = CONFIG.API_BASE_URL || 'https://labeling-g.turing.com/api/conversations';

// Known subjects
const KNOWN_SUBJECTS = ['Maths', 'Physics', 'Biology', 'Chemistry', 'Hardware', 'Data Science'];

// Role assignment based on workflow
// Returns specific role: 'code-trainer', 'code-reviewer', 'stem-tasker', 'stem-reviewer'
function getResponsibleRole(formStage, tabName) {
    const stage = normalizeFormStage(formStage);
    
    // Based on the workflow sheet:
    // Form Stage | Status on LT | To be picked up by
    
    if (stage === 'Codability') {
        if (tabName === 'unclaimed') return 'code-trainer';      // Unclaimed → Code Trainer
        if (tabName === 'pending-review') return 'code-reviewer'; // Pending Review → Code Reviewer
        if (tabName === 'rework') return 'code-trainer';          // Rework → Code Trainer
        if (tabName === 'reviewed') return 'stem-tasker';         // Reviewed → STEM Tasker claims it
        if (tabName === 'inprogress') return 'code-trainer';      // In progress = being worked on
    }
    
    if (stage === 'Image Rubrics and Gemini') {
        if (tabName === 'pending-review') return 'stem-reviewer'; // Pending Review → STEM Reviewer
        if (tabName === 'rework') return 'stem-tasker';           // Rework → STEM Tasker
        if (tabName === 'reviewed') return 'code-trainer';        // Reviewed → Code Trainer claims Ground Truth
        if (tabName === 'inprogress') return 'stem-tasker';       // In progress = being worked on
    }
    
    if (stage === 'Ground Truth and ICE') {
        if (tabName === 'pending-review') return 'code-reviewer'; // Pending Review → Code Reviewer
        if (tabName === 'rework') return 'code-trainer';          // Rework → Code Trainer
        if (tabName === 'reviewed') return 'stem-reviewer';       // Reviewed → STEM Reviewer for audit
        if (tabName === 'inprogress') return 'code-trainer';      // In progress = being worked on
    }
    
    return 'unknown';
}

// Role display info with "waiting for" labels
const ROLE_INFO = {
    'code-trainer': { label: 'Code Trainer', waitingLabel: 'Waiting for Code Trainer', icon: '💻', color: '#3b82f6' },
    'code-reviewer': { label: 'Code Reviewer', waitingLabel: 'Waiting for Code Reviewer', icon: '🔍', color: '#8b5cf6' },
    'stem-tasker': { label: 'STEM Tasker', waitingLabel: 'Waiting for STEM Tasker', icon: '🔬', color: '#10b981' },
    'stem-reviewer': { label: 'STEM Reviewer', waitingLabel: 'Waiting for STEM Reviewer', icon: '📋', color: '#f59e0b' },
    'unknown': { label: 'Unknown', waitingLabel: 'Unknown', icon: '❓', color: '#6b7280' }
};

// Tabs that should NOT show the sidebar
const TABS_WITHOUT_SIDEBAR = ['unclaimed', 'inprogress', 'delivery', 'trainer-stats', 'improper'];

// Calculate detailed breakdown from tasks (with task links)
function calculateDetailedBreakdown(tasks, tabName) {
    const breakdown = {
        total: 0,
        bySubject: {},  // subject -> { total, byRole, byFormStage, tasks: [] }
        byRole: {},     // role -> { count, tasks: [] }
        byFormStage: {} // stage -> { total, byRole, tasks: [] }
    };
    
    tasks.forEach(task => {
        let formStage = task.formStage || 'No FormStage';
        formStage = normalizeFormStage(formStage);
        
        let subject = 'Unknown';
        if (task.seed) {
            const metadata = task.seed.metadata || {};
            const turingMetadata = task.seed.turingMetadata || {};
            subject = metadata.Subject || metadata.subject || 
                      turingMetadata.Subject || turingMetadata.subject || 'Unknown';
        }
        subject = normalizeSubject(subject);
        
        const role = getResponsibleRole(formStage, tabName);
        
        // Task info for links
        const taskInfo = {
            id: task.id,
            link: task.colabLink || `https://labeling-g.turing.com/conversations/${task.id}`,
            formStage: formStage
        };
        
        // Update totals
        breakdown.total++;
        
        // Update by role
        if (!breakdown.byRole[role]) {
            breakdown.byRole[role] = { count: 0, tasks: [] };
        }
        breakdown.byRole[role].count++;
        breakdown.byRole[role].tasks.push(taskInfo);
        
        // Update by formStage
        if (!breakdown.byFormStage[formStage]) {
            breakdown.byFormStage[formStage] = { total: 0, byRole: {}, tasks: [] };
        }
        breakdown.byFormStage[formStage].total++;
        breakdown.byFormStage[formStage].tasks.push(taskInfo);
        if (!breakdown.byFormStage[formStage].byRole[role]) {
            breakdown.byFormStage[formStage].byRole[role] = 0;
        }
        breakdown.byFormStage[formStage].byRole[role]++;
        
        // Update by subject
        if (!breakdown.bySubject[subject]) {
            breakdown.bySubject[subject] = { total: 0, byRole: {}, byFormStage: {}, tasks: [] };
        }
        breakdown.bySubject[subject].total++;
        breakdown.bySubject[subject].tasks.push(taskInfo);
        
        if (!breakdown.bySubject[subject].byRole[role]) {
            breakdown.bySubject[subject].byRole[role] = { count: 0, tasks: [] };
        }
        breakdown.bySubject[subject].byRole[role].count++;
        breakdown.bySubject[subject].byRole[role].tasks.push(taskInfo);
        
        // Update formStage within subject
        if (!breakdown.bySubject[subject].byFormStage[formStage]) {
            breakdown.bySubject[subject].byFormStage[formStage] = { total: 0, byRole: {}, tasks: [] };
        }
        breakdown.bySubject[subject].byFormStage[formStage].total++;
        breakdown.bySubject[subject].byFormStage[formStage].tasks.push(taskInfo);
        if (!breakdown.bySubject[subject].byFormStage[formStage].byRole[role]) {
            breakdown.bySubject[subject].byFormStage[formStage].byRole[role] = 0;
        }
        breakdown.bySubject[subject].byFormStage[formStage].byRole[role]++;
    });
    
    return breakdown;
}

// Store current breakdown for sidebar
window.currentBreakdown = null;
window.currentTabName = null;

// Update sidebar with breakdown data
function updateSidebar(breakdown, tabName) {
    window.currentBreakdown = breakdown;
    window.currentTabName = tabName;
    
    const sidebar = document.getElementById('breakdown-sidebar');
    const container = document.querySelector('.container');
    const toggleBtn = document.getElementById('sidebar-toggle');
    
    if (!sidebar) return;
    
    // Hide sidebar for certain tabs
    if (TABS_WITHOUT_SIDEBAR.includes(tabName)) {
        sidebar.classList.add('hidden');
        container.classList.remove('with-sidebar');
        container.classList.add('sidebar-collapsed');
        if (toggleBtn) toggleBtn.style.display = 'none';
        return;
    } else {
        sidebar.classList.remove('hidden');
        // Keep sidebar closed by default - user can open it with button
        // Ensure it stays collapsed unless user explicitly opens it
        if (!sidebar.classList.contains('open')) {
            sidebar.classList.add('collapsed');
        }
        container.classList.add('with-sidebar');
        container.classList.remove('sidebar-collapsed');
        if (toggleBtn) toggleBtn.style.display = 'flex';
    }
    
    const tabDisplayNames = {
        'unclaimed': 'Unclaimed',
        'inprogress': 'In Progress',
        'rework': 'Rework',
        'pending-review': 'Pending Review',
        'reviewed': 'Reviewed',
        'improper': 'Improper',
        'delivery': 'Delivery',
        'trainer-stats': 'Trainer Stats'
    };
    
    let html = `
        <div class="sidebar-header">
            <div class="sidebar-header-icon">📊</div>
            <div class="sidebar-header-content">
                <h3>${tabDisplayNames[tabName] || tabName}</h3>
                <div class="sidebar-total">${breakdown.total} tasks waiting</div>
            </div>
        </div>
    `;
    
    // Waiting for summary - show who needs to pick these tasks
    html += `<div class="sidebar-section waiting-section">
        <div class="sidebar-section-title">⏳ Waiting to be picked by</div>
        <div class="waiting-summary">`;
    
    const roles = ['code-trainer', 'code-reviewer', 'stem-tasker', 'stem-reviewer'];
    for (const role of roles) {
        const roleData = breakdown.byRole[role];
        const count = roleData ? roleData.count : 0;
        if (count > 0) {
            const info = ROLE_INFO[role];
            html += `<div class="waiting-card" style="--role-color: ${info.color}">
                <div class="waiting-card-header">
                    <span class="waiting-icon">${info.icon}</span>
                    <span class="waiting-role">${info.label}</span>
                </div>
                <div class="waiting-count">${count}</div>
                <div class="waiting-label">tasks waiting</div>
            </div>`;
        }
    }
    html += `</div></div>`;
    
    // By Subject breakdown with task links
    html += `<div class="sidebar-section subjects-section">
        <div class="sidebar-section-title">📚 By Subject</div>`;
    
    // Sort subjects by known order
    const sortedSubjects = KNOWN_SUBJECTS.filter(s => breakdown.bySubject[s])
        .concat(Object.keys(breakdown.bySubject).filter(s => !KNOWN_SUBJECTS.includes(s)));
    
    for (const subject of sortedSubjects) {
        const subjectData = breakdown.bySubject[subject];
        if (!subjectData) continue;
        
        // Get subject icon
        const subjectIcons = {
            'Maths': '🔢', 'Physics': '⚛️', 'Biology': '🧬', 
            'Chemistry': '🧪', 'Hardware': '🔧', 'Data Science': '📊', 'Unknown': '❓'
        };
        const subjectIcon = subjectIcons[subject] || '📘';
        
        html += `<div class="subject-breakdown">
            <div class="subject-breakdown-header" onclick="toggleSubjectBreakdown(this)">
                <span class="subject-icon">${subjectIcon}</span>
                <span class="subject-name">${subject}</span>
                <span class="subject-count">${subjectData.total}</span>
                <span class="expand-arrow">▶</span>
            </div>
            <div class="subject-breakdown-body" style="display: none;">`;
        
        // Show "waiting for" breakdown with expandable task links for each role
        for (const role of roles) {
            const roleData = subjectData.byRole[role];
            if (roleData && roleData.count > 0) {
                const info = ROLE_INFO[role];
                const roleId = `${subject.replace(/\s+/g, '-')}-${role}`;
                
                html += `<div class="role-section" style="--role-color: ${info.color}">
                    <div class="role-section-header" onclick="toggleRoleLinks(this)">
                        <div class="role-info">
                            <span class="role-icon-sm">${info.icon}</span>
                            <span class="role-name-sm">${info.waitingLabel}</span>
                        </div>
                        <span class="role-count-sm">${roleData.count}</span>
                        <span class="role-expand">▶</span>
                    </div>
                    <div class="role-links" style="display: none;">`;
                
                // Show task links for this role
                const tasksToShow = roleData.tasks.slice(0, 15);
                for (const task of tasksToShow) {
                    html += `<a href="${task.link}" target="_blank" class="task-link-sm">#${task.id}</a>`;
                }
                if (roleData.tasks.length > 15) {
                    html += `<span class="more-tasks-sm">+${roleData.tasks.length - 15} more</span>`;
                }
                
                html += `</div></div>`;
            }
        }
        
        html += `</div></div>`;
    }
    
    html += `</div>`;
    
    sidebar.innerHTML = html;
}

// Toggle subject breakdown
function toggleSubjectBreakdown(header) {
    const body = header.nextElementSibling;
    const arrow = header.querySelector('.expand-arrow');
    
    if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.textContent = '▼';
        header.classList.add('expanded');
    } else {
        body.style.display = 'none';
        arrow.textContent = '▶';
        header.classList.remove('expanded');
    }
}

// Toggle role links within subject
function toggleRoleLinks(header) {
    const links = header.nextElementSibling;
    const arrow = header.querySelector('.role-expand');
    
    if (links.style.display === 'none') {
        links.style.display = 'flex';
        arrow.textContent = '▼';
        header.classList.add('expanded');
    } else {
        links.style.display = 'none';
        arrow.textContent = '▶';
        header.classList.remove('expanded');
    }
}

// Hide sidebar completely
function hideSidebar() {
    const sidebar = document.getElementById('breakdown-sidebar');
    const container = document.querySelector('.container');
    const toggleBtn = document.getElementById('sidebar-toggle');
    
    if (sidebar) {
        sidebar.classList.add('hidden');
        sidebar.classList.remove('open');
    }
    if (container) {
        container.classList.remove('with-sidebar');
        container.classList.remove('sidebar-open');
        container.classList.add('sidebar-collapsed');
    }
    if (toggleBtn) {
        toggleBtn.style.display = 'none';
        toggleBtn.classList.remove('sidebar-open');
    }
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', function() {
    // Initialize with Status View
    initializeStatusView();
    
    // Setup view toggle buttons
    const statusViewBtn = document.getElementById('status-view-btn');
    const subjectsViewBtn = document.getElementById('subjects-view-btn');
    
    statusViewBtn.addEventListener('click', function() {
        statusViewBtn.classList.add('active');
        subjectsViewBtn.classList.remove('active');
        document.getElementById('dynamic-tabs').innerHTML = '';
        initializeStatusView();
    });
    
    subjectsViewBtn.addEventListener('click', function() {
        subjectsViewBtn.classList.add('active');
        statusViewBtn.classList.remove('active');
        document.getElementById('dynamic-tabs').innerHTML = '';
        initializeSubjectsView();
    });
    
    // Load initial data
    loadData('unclaimed');
});

// Initialize Status View with original tabs
function initializeStatusView() {
    const dynamicTabs = document.getElementById('dynamic-tabs');
    
    const statusViewHTML = `
        <div class="tabs">
            <button class="tab-btn active" data-tab="unclaimed">
                Unclaimed
                <span class="tab-count" id="count-unclaimed">0</span>
            </button>
            <button class="tab-btn" data-tab="inprogress">
                In Progress
                <span class="tab-count" id="count-inprogress">0</span>
            </button>
            <button class="tab-btn" data-tab="pending-review">
                Pending Review
                <span class="tab-count" id="count-pending-review">0</span>
            </button>
            <button class="tab-btn" data-tab="reviewed">
                Reviewed
                <span class="tab-count" id="count-reviewed">0</span>
            </button>
            <button class="tab-btn" data-tab="rework">
                Rework
                <span class="tab-count" id="count-rework">0</span>
            </button>
            <button class="tab-btn" data-tab="improper">
                Improper
                <span class="tab-count" id="count-improper">0</span>
            </button>
            <button class="tab-btn" data-tab="delivery">
                Delivery
                <span class="tab-count" id="count-delivery">0</span>
            </button>
            <button class="tab-btn" data-tab="trainer-stats">
                Trainer Stats
                <span class="tab-count" id="count-trainer-stats">0</span>
            </button>
        </div>

        <div class="tab-content active" id="tab-unclaimed">
            <div class="tab-summary" id="summary-unclaimed"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-unclaimed">Loading...</div>
                <div class="subjects-container" id="subjects-unclaimed"></div>
            </div>
        </div>

        <div class="tab-content" id="tab-inprogress">
            <div class="tab-summary" id="summary-inprogress"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-inprogress">Loading...</div>
                <div class="subjects-container" id="subjects-inprogress"></div>
            </div>
        </div>

        <div class="tab-content" id="tab-pending-review">
            <div class="tab-summary" id="summary-pending-review"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-pending-review">Loading...</div>
                <div class="subjects-container" id="subjects-pending-review"></div>
            </div>
        </div>

        <div class="tab-content" id="tab-reviewed">
            <div class="tab-summary" id="summary-reviewed"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-reviewed">Loading...</div>
                <div class="subjects-container" id="subjects-reviewed"></div>
            </div>
        </div>

        <div class="tab-content" id="tab-rework">
            <div class="tab-summary" id="summary-rework"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-rework">Loading...</div>
                <div class="subjects-container" id="subjects-rework"></div>
            </div>
        </div>

        <div class="tab-content" id="tab-improper">
            <div class="tab-summary" id="summary-improper"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-improper">Loading...</div>
                <div class="subjects-container" id="subjects-improper"></div>
            </div>
        </div>

        <div class="tab-content" id="tab-delivery">
            <div class="tab-summary" id="summary-delivery"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-delivery">Loading...</div>
                <div class="subjects-container" id="subjects-delivery"></div>
            </div>
        </div>

        <div class="tab-content" id="tab-trainer-stats">
            <div class="tab-summary" id="summary-trainer-stats"></div>
            <div class="subjects-wrapper">
                <div class="loading" id="loading-trainer-stats">Loading...</div>
                <div class="subjects-container" id="subjects-trainer-stats"></div>
            </div>
        </div>
    `;
    
    dynamicTabs.innerHTML = statusViewHTML;
    
    // Setup tab clicks for status view
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Remove active from all
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active to clicked
            this.classList.add('active');
            document.getElementById('tab-' + tabName).classList.add('active');
            
            // Load data
            loadData(tabName);
        });
    });
}

// Initialize Subjects View with subject tabs
function initializeSubjectsView() {
    const dynamicTabs = document.getElementById('dynamic-tabs');
    
    // Subject configuration with icons and colors
    const subjectConfig = [
        { name: 'Maths', icon: '🔢', color: '#3b82f6' },
        { name: 'Physics', icon: '⚡', color: '#8b5cf6' },
        { name: 'Biology', icon: '🧬', color: '#10b981' },
        { name: 'Chemistry', icon: '🧪', color: '#f59e0b' },
        { name: 'Hardware', icon: '🔧', color: '#6366f1' },
        { name: 'Data Science', icon: '📊', color: '#ec4899' }
    ];
    
    let subjectTabsHTML = '<div class="tabs subject-tabs">';
    subjectConfig.forEach((subject, index) => {
        const isActive = index === 0 ? 'active' : '';
        const tabId = subject.name.toLowerCase().replace(' ', '-');
        subjectTabsHTML += `
            <button class="tab-btn subject-tab ${isActive}" data-subject="${subject.name}" data-tab-id="${tabId}" style="--subject-color: ${subject.color}">
                <span class="subject-icon">${subject.icon}</span>
                <span class="subject-name">${subject.name}</span>
                <span class="tab-count subject-count" id="count-subject-${tabId}">0</span>
            </button>
        `;
    });
    subjectTabsHTML += '</div>';
    
    // Add status tabs container that will be populated when subject is selected
    subjectTabsHTML += '<div id="subject-status-tabs-container"></div>';
    
    // Add content container
    subjectTabsHTML += '<div id="subject-content-container"></div>';
    
    dynamicTabs.innerHTML = subjectTabsHTML;
    
    // Setup subject tab clicks
    const subjectTabs = document.querySelectorAll('[data-subject]');
    subjectTabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            const subject = this.getAttribute('data-subject');
            
            // Remove active from all subject tabs
            subjectTabs.forEach(t => t.classList.remove('active'));
            
            // Add active to clicked
            this.classList.add('active');
            
            // Load subject with all status tabs
            loadSubjectWithStatusTabs(subject);
        });
    });
    
    // Load initial subject
    loadSubjectWithStatusTabs('Maths');
}

// Load a subject and show all status sections at once (not tabbed)
async function loadSubjectWithStatusTabs(subject) {
    const statusTabsContainer = document.getElementById('subject-status-tabs-container');
    const contentContainer = document.getElementById('subject-content-container');
    
    // Get subject icon
    const subjectIcons = {
        'Maths': '🔢',
        'Physics': '⚡',
        'Biology': '🧬',
        'Chemistry': '🧪',
        'Hardware': '🔧',
        'Data Science': '📊'
    };
    const icon = subjectIcons[subject] || '📚';
    
    // Show loading state with subject-specific styling
    contentContainer.innerHTML = `
        <div class="subject-loading-state">
            <div class="subject-loading-icon">${icon}</div>
            <div class="subject-loading-spinner"></div>
            <div class="subject-loading-text">Loading ${subject} data...</div>
            <div class="subject-loading-subtext">Fetching from all status categories</div>
        </div>
    `;
    statusTabsContainer.innerHTML = '';
    
    try {
        // Fetch all tasks for this subject across all statuses
        const allStatuses = ['unclaimed', 'inprogress', 'pending-review', 'reviewed', 'rework', 'improper', 'delivery'];
        let allSubjectTasks = [];
        let totalCount = 0;
        
        for (const statusTab of allStatuses) {
            const tasks = await fetchAllPagesForStatus(statusTab);
            // Filter by subject
            const subjectTasks = tasks.filter(task => {
                let taskSubject = 'Unknown';
                if (task.seed) {
                    const metadata = task.seed.metadata || {};
                    const turingMetadata = task.seed.turingMetadata || {};
                    taskSubject = metadata.Subject || metadata.subject || 
                                turingMetadata.Subject || turingMetadata.subject || 'Unknown';
                }
                taskSubject = normalizeSubject(taskSubject);
                return taskSubject === subject;
            });
            allSubjectTasks.push({ status: statusTab, tasks: subjectTasks });
            totalCount += subjectTasks.length;
        }
        
        // Update subject tab count
        const tabId = subject.toLowerCase().replace(' ', '-');
        const countElement = document.getElementById('count-subject-' + tabId);
        if (countElement) {
            countElement.textContent = totalCount;
        }
        
        // Build all status sections visible at once (no tabs)
        const statusDisplayNames = {
            'unclaimed': { label: 'Unclaimed', icon: '📥' },
            'inprogress': { label: 'In Progress', icon: '⚙️' },
            'pending-review': { label: 'Pending Review', icon: '👀' },
            'reviewed': { label: 'Reviewed', icon: '✅' },
            'rework': { label: 'Rework', icon: '🔄' },
            'improper': { label: 'Improper', icon: '⚠️' },
            'delivery': { label: 'Delivery', icon: '📦' }
        };
        
        let contentHTML = `<div class="subject-header-banner">
            <span class="subject-banner-icon">${icon}</span>
            <span class="subject-banner-title">${subject}</span>
            <span class="subject-banner-count">${totalCount} total tasks</span>
        </div>`;
        
        // Start grid container for side-by-side layout
        contentHTML += '<div class="subject-sections-grid">';
        
        allSubjectTasks.forEach(statusData => {
            const statusInfo = statusDisplayNames[statusData.status] || { label: statusData.status, icon: '📋' };
            const count = statusData.tasks.length;
            const statusId = statusData.status.replace('-', '');
            
            // Only show sections with tasks (collapsible empty ones)
            const isEmpty = count === 0;
            const collapsedClass = isEmpty ? 'collapsed-section' : '';
            
            contentHTML += `
                <div class="subject-status-section ${collapsedClass}" id="subject-status-${statusId}">
                    <div class="status-section-header">
                        <h3><span class="status-icon">${statusInfo.icon}</span> ${statusInfo.label}</h3>
                        <span class="status-count">${count}</span>
                    </div>
                    ${!isEmpty ? `
                    <div class="subjects-wrapper">
                        <div class="subjects-container" id="subject-tasks-${statusId}"></div>
                    </div>
                    ` : `
                    <div class="empty-section-message">No tasks</div>
                    `}
                </div>
            `;
        });
        
        contentHTML += '</div>'; // Close grid container
        
        contentContainer.innerHTML = contentHTML;
        
        // Display tasks for each status
        allSubjectTasks.forEach(statusData => {
            const statusId = statusData.status.replace('-', '');
            displaySubjectStatusTasks(statusId, statusData.status, statusData.tasks);
        });
        
    } catch (error) {
        console.error('Error loading subject data:', error);
        contentContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error: ' + error.message + '</div></div>';
    }
}

// Display tasks for a specific status within a subject view
function displaySubjectStatusTasks(statusId, statusName, tasks) {
    const container = document.getElementById('subject-tasks-' + statusId);
    const summaryContainer = document.getElementById('subject-summary-' + statusId);
    
    if (!container) return;
    
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No tasks</div></div>';
        summaryContainer.innerHTML = '';
        return;
    }
    
    // Show total count in summary
    if (summaryContainer) {
        summaryContainer.innerHTML = '<div class="subject-task-count">Total: <strong>' + tasks.length + '</strong> task' + (tasks.length !== 1 ? 's' : '') + '</div>';
    }
    
    // For Improper and Delivery, show simple list of task links (no team/phase grouping)
    if (statusName === 'improper' || statusName === 'delivery') {
        let html = '<div class="simple-task-list">';
        tasks.forEach(function(task) {
            const taskId = String(task.id);
            const link = task.colabLink || '#';
            html += `<a href="${link}" target="_blank" title="Task ${taskId}" class="task-chip">${taskId}</a>`;
        });
        html += '</div>';
        container.innerHTML = html;
        return;
    }
    
    // Group tasks by formStage (phase)
    const tasksByPhase = {};
    
    tasks.forEach(function(task) {
        const formStage = normalizeFormStage(task.formStage || 'Unknown');
        if (!tasksByPhase[formStage]) {
            tasksByPhase[formStage] = [];
        }
        tasksByPhase[formStage].push(task);
    });
    
    // Display tasks grouped by phase, then by team
    let html = '';
    
    Object.keys(tasksByPhase).sort().forEach(function(phase) {
        const phaseTasks = tasksByPhase[phase];
        
        // Group tasks within phase by team responsibility
        const tasksByTeam = { 'CODE': [], 'STEM': [] };
        
        phaseTasks.forEach(function(task) {
            const role = getResponsibleRole(task.formStage, statusName);
            const team = role.startsWith('code') ? 'CODE' : 'STEM';
            tasksByTeam[team].push(task);
        });
        
        html += `
            <div class="phase-group">
                <div class="phase-header">
                    <h4>${phase}</h4>
                    <span class="phase-count">${phaseTasks.length}</span>
                </div>
                <div class="phase-tasks">
        `;
        
        // Display CODE team tasks - inline compact
        if (tasksByTeam['CODE'].length > 0) {
            html += `
                <div class="team-subsection">
                    <div class="team-label">💻 CODE (${tasksByTeam['CODE'].length})</div>
                    <div class="team-task-list">
            `;
            
            tasksByTeam['CODE'].forEach(function(task) {
                const taskId = String(task.id);
                const link = task.colabLink || '#';
                html += `<a href="${link}" target="_blank" title="Task ${taskId}" class="task-chip">${taskId}</a>`;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Display STEM team tasks - inline compact
        if (tasksByTeam['STEM'].length > 0) {
            html += `
                <div class="team-subsection">
                    <div class="team-label">🔬 STEM (${tasksByTeam['STEM'].length})</div>
                    <div class="team-task-list">
            `;
            
            tasksByTeam['STEM'].forEach(function(task) {
                const taskId = String(task.id);
                const link = task.colabLink || '#';
                html += `<a href="${link}" target="_blank" title="Task ${taskId}" class="task-chip">${taskId}</a>`;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}



// Fetch all pages for a specific status (used by Subject View)
async function fetchAllPagesForStatus(statusTab) {
    let allTasks = [];
    let page = 1;
    let totalPages = 1;
    
    do {
        const apiUrl = buildApiUrl(statusTab, page);
        
        let response;
        if (isLocal) {
            // Local: use local proxy directly
            const localUrl = apiUrl.replace(TURING_API_BASE, LOCAL_API_BASE);
            response = await fetch(localUrl);
        } else {
            // Vercel: use the proxy function
            const proxyUrl = '/api/proxy?url=' + encodeURIComponent(apiUrl);
            response = await fetch(proxyUrl, {
                headers: {
                    'Authorization': 'Bearer ' + AUTH_TOKEN
                }
            });
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('API returned ' + response.status + ': ' + errorText.substring(0, 100));
        }
        
        const data = await response.json();
        allTasks = allTasks.concat(data.data || []);
        totalPages = data.pageCount || 1;
        
        page++;
    } while (page <= totalPages);
    
    return allTasks;
}

// Add event listeners for the view toggle buttons

async function loadData(tabName) {
    const container = document.getElementById('subjects-' + tabName);
    const loading = document.getElementById('loading-' + tabName);
    const summaryContainer = document.getElementById('summary-' + tabName);
    
    if (!container) {
        console.error('Container not found for tab:', tabName);
        return;
    }
    
    // Always fetch fresh data (no caching)
    // Show loading and clear previous data
    if (loading) loading.style.display = 'block';
    container.innerHTML = '';
    if (summaryContainer) summaryContainer.innerHTML = '';
    
    try {
        // Fetch all pages
        const allTasks = await fetchAllPages(tabName);
        
        // Hide loading
        if (loading) loading.style.display = 'none';
        
        // Update count
        const countEl = document.getElementById('count-' + tabName);
        if (countEl) countEl.textContent = allTasks.length;
        
        // Display tasks
        displayTasks(tabName, allTasks);
        
    } catch (error) {
        console.error('Error loading data:', error);
        if (loading) loading.style.display = 'none';
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error: ' + error.message + '</div></div>';
    }
}

async function fetchAllPages(tabName) {
    let allTasks = [];
    let page = 1;
    let totalPages = 1;
    
    do {
        const apiUrl = buildApiUrl(tabName, page);
        
        let response;
        if (isLocal) {
            // Local: use local proxy directly
            const localUrl = apiUrl.replace(TURING_API_BASE, LOCAL_API_BASE);
            response = await fetch(localUrl);
        } else {
            // Vercel: use the proxy function
            const proxyUrl = '/api/proxy?url=' + encodeURIComponent(apiUrl);
            response = await fetch(proxyUrl, {
                headers: {
                    'Authorization': 'Bearer ' + AUTH_TOKEN
                }
            });
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('API returned ' + response.status + ': ' + errorText.substring(0, 100));
        }
        
        const data = await response.json();
        allTasks = allTasks.concat(data.data || []);
        totalPages = data.pageCount || 1;
        
        page++;
    } while (page <= totalPages);
    
    return allTasks;
}

function buildApiUrl(tabName, page) {
    const params = new URLSearchParams();
    params.append('limit', '100');
    params.append('page', page.toString());
    
    if (tabName === 'unclaimed') {
        // Basic joins for unclaimed
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('filter[0]', 'status||$eq||pending');
        params.append('filter[1]', 'projectId||$eq||' + PROJECT_ID + '');
        params.append('filter[2]', 'batch.status||$ne||draft');
        params.append('filter[3]', 'batch.status||$ne||archived');
        params.append('filter[4]', 'project.status||$ne||archived');
    } else if (tabName === 'inprogress') {
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('filter[0]', 'status||$in||labeling,validating');
        params.append('filter[1]', 'projectId||$eq||' + PROJECT_ID + '');
        params.append('filter[2]', 'batch.status||$ne||draft');
        params.append('filter[3]', 'batch.status||$ne||archived');
        params.append('filter[4]', 'project.status||$ne||archived');
    } else if (tabName === 'rework') {
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('filter[0]', 'status||$eq||rework');
        params.append('filter[1]', 'projectId||$eq||' + PROJECT_ID + '');
        params.append('filter[2]', 'batch.status||$ne||draft');
        params.append('filter[3]', 'batch.status||$ne||archived');
        params.append('filter[4]', 'project.status||$ne||archived');
    } else if (tabName === 'reviewed') {
        // Reviewed needs latestDeliveryBatch and latestManualReview joins
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('join[3]', 'latestDeliveryBatch');
        params.append('join[4]', 'latestDeliveryBatch.deliveryBatch');
        params.append('join[5]', 'latestManualReview');
        params.append('join[6]', 'latestManualReview.review');
        // Filters from original curl
        params.append('filter[0]', 'latestDeliveryBatch.deliveryBatch||$isnull');
        params.append('filter[1]', 'reviewRequired||$eq||false');
        params.append('filter[2]', 'status||$eq||completed');
        params.append('filter[3]', 'batch.status||$ne||draft');
        params.append('filter[4]', 'manualReview.followupRequired||$eq||false');
        params.append('filter[5]', 'project.status||$ne||archived');
        params.append('filter[6]', 'projectId||$eq||' + PROJECT_ID + '');
        params.append('filter[7]', 'batch.status||$ne||archived');
    } else if (tabName === 'pending-review') {
        // Pending review needs followup check
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('join[3]', 'latestManualReview');
        params.append('join[4]', 'latestManualReview.review');
        // Filters - completed tasks needing followup
        params.append('filter[0]', 'status||$eq||completed');
        params.append('filter[1]', '$needFollowup||$eq||true');
        params.append('filter[2]', 'project.status||$ne||archived');
        params.append('filter[3]', 'projectId||$eq||' + PROJECT_ID + '');
        params.append('filter[4]', 'batch.status||$ne||draft');
        params.append('filter[5]', 'batch.status||$ne||archived');
    } else if (tabName === 'improper') {
        // Improper status
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('filter[0]', 'status||$eq||improper');
        params.append('filter[1]', 'projectId||$eq||' + PROJECT_ID + '');
        params.append('filter[2]', 'batch.status||$ne||draft');
        params.append('filter[3]', 'batch.status||$ne||archived');
        params.append('filter[4]', 'project.status||$ne||archived');
    } else if (tabName === 'delivery') {
        // Delivery - grouped by deliveryBatch name
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('join[3]', 'latestDeliveryBatch');
        params.append('join[4]', 'latestDeliveryBatch.deliveryBatch||id,name,status');
        params.append('filter[0]', 'latestDeliveryBatch.deliveryBatch||$notnull');
        params.append('filter[1]', 'status||$eq||completed');
        params.append('filter[2]', 'batch.status||$ne||draft');
        params.append('filter[3]', 'batch.status||$ne||archived');
        params.append('filter[4]', 'project.status||$ne||archived');
        params.append('filter[5]', 'projectId||$eq||' + PROJECT_ID);
    } else if (tabName === 'trainer-stats') {
        // Trainer stats - only fully completed tasks (reviewed + delivery)
        // These are tasks with status=completed (covers both reviewed and in delivery batch)
        params.append('join[0]', 'seed||metadata,turingMetadata');
        params.append('join[1]', 'batch');
        params.append('join[2]', 'project');
        params.append('join[3]', 'currentUser||id,name,turingEmail,profilePicture');
        params.append('join[4]', 'latestDeliveryBatch');
        params.append('join[5]', 'latestDeliveryBatch.deliveryBatch||id,name,status');
        params.append('filter[0]', 'status||$eq||completed');
        params.append('filter[1]', 'currentUserId||$notnull');
        params.append('filter[2]', 'projectId||$eq||' + PROJECT_ID);
        params.append('filter[3]', 'batch.status||$ne||draft');
        params.append('filter[4]', 'batch.status||$ne||archived');
        params.append('filter[5]', 'project.status||$ne||archived');
    }
    
    return TURING_API_BASE + '?' + params.toString();
}



function displayTasks(tabName, tasks, summaryContainer, container) {
    // Allow overriding container and summaryContainer for subject view
    if (!container) {
        container = document.getElementById('subjects-' + tabName);
    }
    if (!summaryContainer) {
        summaryContainer = document.getElementById('summary-' + tabName);
    }
    
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No tasks found</div></div>';
        // Clear summary when no tasks
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="summary-pill summary-total-pill">
                    <span class="pill-label">Total</span>
                    <span class="pill-count">0</span>
                </div>`;
        }
        return;
    }
    
    // For delivery tab, group by subject and deliveryBatch name
    if (tabName === 'delivery') {
        // Hide sidebar for delivery tab
        hideSidebar();
        
        const grouped = groupTasksBySubjectAndDeliveryBatch(tasks);
        
        // Calculate overall totals per batch status
        let ongoingTotal = 0;
        let deliveredTotal = 0;
        let grandTotal = 0;
        for (const deliveryBatches of Object.values(grouped)) {
            for (const [batchKey, count] of Object.entries(deliveryBatches)) {
                const [, batchStatus] = batchKey.split('|||');
                if (batchStatus === 'ongoing') {
                    ongoingTotal += count;
                } else {
                    deliveredTotal += count;
                }
                grandTotal += count;
            }
        }
        
        // Update summary pills (outside the main card)
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="summary-pill summary-total-pill">
                    <span class="pill-label">Total</span>
                    <span class="pill-count">${grandTotal}</span>
                </div>
                <div class="summary-pill delivery-ongoing">
                    <span class="pill-label">Ongoing</span>
                    <span class="pill-count">${ongoingTotal}</span>
                </div>
                <div class="summary-pill delivery-delivered">
                    <span class="pill-label">Delivered</span>
                    <span class="pill-count">${deliveredTotal}</span>
                </div>`;
        }
        
        let html = '';
        
        for (const [subject, deliveryBatches] of Object.entries(grouped)) {
            const totalCount = Object.values(deliveryBatches).reduce((sum, count) => sum + count, 0);
            const batchEntries = Object.entries(deliveryBatches);
            
            html += `<div class="subject-card">
                <div class="subject-header">
                    <span class="subject-title">${subject}</span>
                    <span class="subject-total">${totalCount} tasks</span>
                </div>
                <div class="formstage-grid ${batchEntries.length === 3 ? 'three-cards' : batchEntries.length === 4 ? 'four-cards' : ''}">`;
            
            for (const [batchKey, count] of batchEntries) {
                // Parse batch name and status from the key
                const [batchName, batchStatus] = batchKey.split('|||');
                const isOngoing = batchStatus === 'ongoing';
                const statusClass = isOngoing ? 'delivery-ongoing' : 'delivery-delivered';
                const statusLabel = isOngoing ? 'Ongoing' : 'Delivered';
                
                html += `<div class="formstage-card delivery-batch ${statusClass}">
                    <div class="formstage-status-badge">${statusLabel}</div>
                    <div class="formstage-name">${batchName}</div>
                    <div class="formstage-count">${count}</div>
                </div>`;
            }
            
            html += `</div></div>`;
        }
        
        container.innerHTML = html;
        return;
    }
    
    // For trainer stats tab, show trainer-wise breakdown
    if (tabName === 'trainer-stats') {
        // Hide sidebar for trainer-stats tab
        hideSidebar();
        
        // Check if user is authenticated
        if (!isTrainerStatsAuthenticated()) {
            showTrainerStatsPasswordOverlay(container, summaryContainer);
            return;
        }
        
        const trainerStats = groupTasksByTrainer(tasks);
        
        // Calculate overall totals
        let totalTasks = 0;
        let totalMinutes = 0;
        let totalReviewed = 0;
        let totalInDelivery = 0;
        let totalDelivered = 0;
        const overallFormStages = {};
        
        for (const stats of Object.values(trainerStats)) {
            totalTasks += stats.taskCount;
            totalMinutes += stats.totalMinutes;
            totalReviewed += stats.reviewed;
            totalInDelivery += stats.inDelivery;
            totalDelivered += stats.delivered;
            
            // Aggregate formStage data
            for (const [formStage, fsData] of Object.entries(stats.formStages)) {
                if (!overallFormStages[formStage]) {
                    overallFormStages[formStage] = { count: 0, minutes: 0 };
                }
                overallFormStages[formStage].count += fsData.count;
                overallFormStages[formStage].minutes += fsData.minutes;
            }
        }
        
        const totalAHT = totalTasks > 0 ? Math.round(totalMinutes / totalTasks) : 0;
        
        // Build formStage AHT pills
        let formStageAhtHtml = '';
        const sortedOverallFormStages = Object.entries(overallFormStages).sort((a, b) => b[1].count - a[1].count);
        for (const [formStage, fsData] of sortedOverallFormStages) {
            const fsAht = fsData.count > 0 ? Math.round(fsData.minutes / fsData.count) : 0;
            const colorClass = getFormStageColorClass(formStage);
            formStageAhtHtml += `
                <div class="summary-pill formstage-aht-pill ${colorClass}" title="${formStage}: ${fsData.count} tasks, ${formatMinutes(fsData.minutes)} total">
                    <span class="pill-label">${formStage}</span>
                    <span class="pill-count">${fsData.count}</span>
                    <span class="pill-aht">${fsAht}m</span>
                </div>`;
        }
        
        // Update summary pills
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="summary-row summary-main">
                    <div class="summary-pill summary-total-pill">
                        <span class="pill-label">Submissions</span>
                        <span class="pill-count">${totalTasks}</span>
                    </div>
                    <div class="summary-pill trainer-reviewed">
                        <span class="pill-label">Reviewed</span>
                        <span class="pill-count">${totalReviewed}</span>
                    </div>
                    <div class="summary-pill trainer-indelivery">
                        <span class="pill-label">In Delivery</span>
                        <span class="pill-count">${totalInDelivery}</span>
                    </div>
                    <div class="summary-pill trainer-delivered">
                        <span class="pill-label">Delivered</span>
                        <span class="pill-count">${totalDelivered}</span>
                    </div>
                    <div class="summary-pill trainer-time">
                        <span class="pill-label">Total Time</span>
                        <span class="pill-count">${formatMinutes(totalMinutes)}</span>
                    </div>
                    <div class="summary-pill trainer-aht">
                        <span class="pill-label">Avg AHT</span>
                        <span class="pill-count">${totalAHT}m</span>
                    </div>
                </div>
                <div class="summary-row summary-formstages">
                    <span class="summary-row-label">AHT by Form Stage:</span>
                    ${formStageAhtHtml}
                </div>
                <div class="trainer-controls">
                    <div class="search-box">
                        <input type="text" id="trainer-search" placeholder="🔍 Search trainer by name..." oninput="filterTrainers()">
                    </div>
                    <div class="sort-controls">
                        <span class="sort-label">Sort by:</span>
                        <select id="trainer-sort" onchange="sortTrainers()">
                            <option value="tasks-desc">Tasks (High → Low)</option>
                            <option value="tasks-asc">Tasks (Low → High)</option>
                            <option value="aht-desc">AHT (High → Low)</option>
                            <option value="aht-asc">AHT (Low → High)</option>
                            <option value="time-desc">Time (High → Low)</option>
                            <option value="name-asc">Name (A → Z)</option>
                        </select>
                    </div>
                </div>`;
        }
        
        // Store trainer stats globally for filtering/sorting
        window.currentTrainerStats = trainerStats;
        
        // Sort trainers by task count (descending) - default
        const sortedTrainers = Object.entries(trainerStats).sort((a, b) => b[1].taskCount - a[1].taskCount);
        
        let html = '';
        
        for (const [trainerName, stats] of sortedTrainers) {
            const aht = stats.taskCount > 0 ? Math.round(stats.totalMinutes / stats.taskCount) : 0;
            
            html += `<div class="subject-card trainer-card">
                <div class="subject-header">
                    <div class="trainer-info">
                        ${stats.profilePicture ? `<img src="${stats.profilePicture}" class="trainer-avatar" alt="${trainerName}">` : '<div class="trainer-avatar-placeholder">👤</div>'}
                        <div class="trainer-name">${trainerName}</div>
                    </div>
                    <div class="subject-count">${stats.taskCount} submissions</div>
                </div>
                <div class="trainer-status-row">
                    <div class="status-badge status-reviewed" title="Reviewed: Completed tasks awaiting delivery">📋 ${stats.reviewed}</div>
                    <div class="status-badge status-indelivery" title="In Delivery: Tasks in ongoing delivery batch">📦 ${stats.inDelivery}</div>
                    <div class="status-badge status-delivered" title="Delivered: Tasks successfully delivered to client">✅ ${stats.delivered}</div>
                </div>
                <div class="trainer-stats-grid">
                    <div class="trainer-stat-card stat-time">
                        <div class="stat-label">Total Time</div>
                        <div class="stat-value">${formatMinutes(stats.totalMinutes)}</div>
                    </div>
                    <div class="trainer-stat-card stat-aht">
                        <div class="stat-label">Avg AHT</div>
                        <div class="stat-value">${aht}m</div>
                    </div>
                </div>
                <div class="trainer-breakdown">
                    <div class="trainer-section">
                        <div class="trainer-section-title">By Form Stage:</div>
                        <div class="trainer-formstage-grid">`;
            
            // Sort formStages by count
            const sortedFormStages = Object.entries(stats.formStages).sort((a, b) => b[1].count - a[1].count);
            
            for (const [formStage, fsStats] of sortedFormStages) {
                const fsAht = fsStats.count > 0 ? Math.round(fsStats.minutes / fsStats.count) : 0;
                const colorClass = getFormStageColorClass(formStage);
                html += `<div class="trainer-formstage-item ${colorClass}">
                    <span class="trainer-formstage-name">${formStage}</span>
                    <span class="trainer-formstage-count">${fsStats.count}</span>
                    <span class="trainer-formstage-time">${formatMinutes(fsStats.minutes)}</span>
                    <span class="trainer-formstage-aht">${fsAht}m</span>
                </div>`;
            }
            
            html += `</div></div>
                    <div class="trainer-section">
                        <div class="trainer-section-title">By Subject:</div>
                        <div class="trainer-subject-grid">`;
            
            // Sort subjects by count
            const sortedSubjects = Object.entries(stats.subjects).sort((a, b) => b[1].count - a[1].count);
            
            for (const [subject, subjectStats] of sortedSubjects) {
                const subjectAht = subjectStats.count > 0 ? Math.round(subjectStats.minutes / subjectStats.count) : 0;
                const deliveredBadge = subjectStats.delivered > 0 ? `<span class="delivered-indicator" title="${subjectStats.delivered} tasks delivered">✅${subjectStats.delivered}</span>` : '';
                html += `<div class="trainer-subject-item">
                    <span class="trainer-subject-name">${subject}</span>
                    <span class="trainer-subject-count">${subjectStats.count} ${deliveredBadge}</span>
                    <span class="trainer-subject-time">${formatMinutes(subjectStats.minutes)}</span>
                    <span class="trainer-subject-aht">${subjectAht}m</span>
                </div>`;
            }
            
            html += `</div></div></div></div>`;
        }
        
        container.innerHTML = html;
        return;
    }
    
    // Group by subject and formStage
    const grouped = groupTasksBySubjectAndFormStage(tasks);
    
    // Calculate detailed breakdown
    const breakdown = calculateDetailedBreakdown(tasks, tabName);
    
    // Update sidebar
    updateSidebar(breakdown, tabName);
    
    // Calculate overall totals per formStage
    const overallFormStageTotals = {};
    let grandTotal = 0;
    for (const formStages of Object.values(grouped)) {
        for (const [formStage, count] of Object.entries(formStages)) {
            overallFormStageTotals[formStage] = (overallFormStageTotals[formStage] || 0) + count;
            grandTotal += count;
        }
    }
    
    // Update summary pills (outside the main card)
    if (summaryContainer) {
        // Simple summary with total and formStage counts only (role info is in sidebar)
        let summaryHtml = `
            <div class="summary-row summary-main">
                <div class="summary-pill summary-total-pill">
                    <span class="pill-label">Total</span>
                    <span class="pill-count">${grandTotal}</span>
                </div>`;
        
        // FormStage pills
        for (const [formStage, count] of Object.entries(overallFormStageTotals)) {
            const colorClass = tabName === 'improper' ? 'improper' : getFormStageColorClass(formStage);
            summaryHtml += `<div class="summary-pill ${colorClass}">
                <span class="pill-label">${formStage}</span>
                <span class="pill-count">${count}</span>
            </div>`;
        }
        summaryHtml += `</div>`;
        
        summaryContainer.innerHTML = summaryHtml;
    }
    
    // Build subject cards
    let html = '';
    for (const [subject, formStages] of Object.entries(grouped)) {
        const totalCount = Object.values(formStages).reduce((sum, count) => sum + count, 0);
        const formStageEntries = Object.entries(formStages);
        
        html += `<div class="subject-card">
            <div class="subject-header">
                <span class="subject-title">${subject}</span>
                <span class="subject-total">${totalCount} tasks</span>
            </div>
            <div class="formstage-grid ${formStageEntries.length === 3 ? 'three-cards' : formStageEntries.length === 4 ? 'four-cards' : ''}">`;
        
        for (const [formStage, count] of formStageEntries) {
            // For improper tab, use 'improper' class for all cards
            const colorClass = tabName === 'improper' ? 'improper' : getFormStageColorClass(formStage);
            html += `<div class="formstage-card ${colorClass}">
                <div class="formstage-name">${formStage}</div>
                <div class="formstage-count">${count}</div>
            </div>`;
        }
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}

function groupTasksBySubjectAndFormStage(tasks) {
    const grouped = {};
    
    tasks.forEach(task => {
        // Extract subject - check multiple possible locations
        let subject = 'Unknown';
        if (task.seed) {
            const metadata = task.seed.metadata || {};
            const turingMetadata = task.seed.turingMetadata || {};
            
            // Try direct Subject/subject keys first
            subject = metadata.Subject || metadata.subject || 
                      turingMetadata.Subject || turingMetadata.subject || null;
            
            // If not found, search for a value that matches known subjects
            if (!subject) {
                const allValues = [...Object.values(metadata), ...Object.values(turingMetadata)];
                for (const val of allValues) {
                    if (typeof val === 'string') {
                        const normalized = normalizeSubject(val);
                        if (KNOWN_SUBJECTS.includes(normalized)) {
                            subject = val;
                            break;
                        }
                    }
                }
            }
            
            // If still not found, check if any key contains 'subject'
            if (!subject) {
                for (const [key, val] of Object.entries(metadata)) {
                    if (key.toLowerCase().includes('subject') && typeof val === 'string') {
                        subject = val;
                        break;
                    }
                }
            }
            
            subject = subject || 'Unknown';
        }
        
        // Normalize subject
        subject = normalizeSubject(subject);
        
        // Extract formStage
        let formStage = task.formStage || 'No FormStage';
        formStage = normalizeFormStage(formStage);
        
        // Group
        if (!grouped[subject]) {
            grouped[subject] = {};
        }
        if (!grouped[subject][formStage]) {
            grouped[subject][formStage] = 0;
        }
        grouped[subject][formStage]++;
    });
    
    // Sort subjects by known order
    const sortedGrouped = {};
    KNOWN_SUBJECTS.forEach(subj => {
        if (grouped[subj]) {
            sortedGrouped[subj] = grouped[subj];
        }
    });
    // Add any unknown subjects at the end
    Object.keys(grouped).forEach(subj => {
        if (!sortedGrouped[subj]) {
            sortedGrouped[subj] = grouped[subj];
        }
    });
    
    return sortedGrouped;
}

function groupTasksBySubjectAndDeliveryBatch(tasks) {
    const grouped = {};
    
    tasks.forEach(task => {
        // Extract subject - check multiple possible locations
        let subject = 'Unknown';
        if (task.seed) {
            const metadata = task.seed.metadata || {};
            const turingMetadata = task.seed.turingMetadata || {};
            
            subject = metadata.Subject || metadata.subject || 
                      turingMetadata.Subject || turingMetadata.subject || null;
            
            if (!subject) {
                const allValues = [...Object.values(metadata), ...Object.values(turingMetadata)];
                for (const val of allValues) {
                    if (typeof val === 'string') {
                        const normalized = normalizeSubject(val);
                        if (KNOWN_SUBJECTS.includes(normalized)) {
                            subject = val;
                            break;
                        }
                    }
                }
            }
            
            subject = subject || 'Unknown';
        }
        
        // Normalize subject
        subject = normalizeSubject(subject);
        
        // Extract delivery batch name and status
        let batchName = 'Unknown Batch';
        let batchStatus = 'unknown';
        if (task.latestDeliveryBatch && task.latestDeliveryBatch.deliveryBatch) {
            batchName = task.latestDeliveryBatch.deliveryBatch.name || 'Unknown Batch';
            batchStatus = task.latestDeliveryBatch.deliveryBatch.status || 'unknown';
        }
        
        // Create a unique key combining batch name and status
        const batchKey = `${batchName}|||${batchStatus}`;
        
        // Group
        if (!grouped[subject]) {
            grouped[subject] = {};
        }
        if (!grouped[subject][batchKey]) {
            grouped[subject][batchKey] = 0;
        }
        grouped[subject][batchKey]++;
    });
    
    // Sort subjects by known order
    const sortedGrouped = {};
    KNOWN_SUBJECTS.forEach(subj => {
        if (grouped[subj]) {
            sortedGrouped[subj] = grouped[subj];
        }
    });
    Object.keys(grouped).forEach(subj => {
        if (!sortedGrouped[subj]) {
            sortedGrouped[subj] = grouped[subj];
        }
    });
    
    return sortedGrouped;
}

function normalizeSubject(subject) {
    if (!subject || subject === 'Unknown') return 'Unknown';
    
    const subjectLower = subject.toLowerCase().trim();
    
    if (subjectLower === 'maths' || subjectLower === 'math' || subjectLower === 'mathematics') return 'Maths';
    if (subjectLower === 'physics') return 'Physics';
    if (subjectLower === 'biology') return 'Biology';
    if (subjectLower === 'chemistry') return 'Chemistry';
    if (subjectLower === 'hardware') return 'Hardware';
    if (subjectLower === 'data science' || subjectLower === 'datascience') return 'Data Science';
    
    // Return with proper capitalization
    return subject.charAt(0).toUpperCase() + subject.slice(1);
}

function normalizeFormStage(formStage) {
    if (!formStage || formStage.trim() === '') return 'No FormStage';
    
    const trimmed = formStage.trim();
    
    // Normalize common variations
    if (trimmed.toLowerCase().includes('codability')) return 'Codability';
    if (trimmed.toLowerCase().includes('ground truth')) return 'Ground Truth and ICE';
    if (trimmed.toLowerCase().includes('image rubrics') || trimmed.toLowerCase().includes('gemini')) return 'Image Rubrics and Gemini';
    
    return trimmed;
}

function getFormStageColorClass(formStage) {
    const lower = formStage.toLowerCase();
    if (lower.includes('codability')) return 'codability';
    if (lower.includes('ground truth')) return 'ground-truth';
    if (lower.includes('image rubrics') || lower.includes('gemini')) return 'image-rubrics';
    return 'no-formstage';
}

function formatMinutes(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return `${hours}h ${mins}m`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
}

function groupTasksByTrainer(tasks) {
    const trainers = {};
    
    tasks.forEach(task => {
        // Get trainer info
        const currentUser = task.currentUser;
        if (!currentUser) return;
        
        const trainerName = currentUser.name || 'Unknown Trainer';
        const trainerId = currentUser.id;
        const profilePicture = currentUser.profilePicture || null;
        
        // Get time spent (durationMinutes)
        const durationMinutes = task.durationMinutes || 0;
        
        // Check if task is in delivery batch
        const deliveryBatch = task.latestDeliveryBatch?.deliveryBatch;
        const isDelivered = deliveryBatch && deliveryBatch.status === 'delivered';
        const isInDelivery = deliveryBatch && deliveryBatch.status === 'ongoing';
        const isReviewed = !deliveryBatch; // Not in delivery batch = just reviewed
        
        // Extract subject
        let subject = 'Unknown';
        if (task.seed) {
            const metadata = task.seed.metadata || {};
            const turingMetadata = task.seed.turingMetadata || {};
            subject = metadata.Subject || metadata.subject || 
                      turingMetadata.Subject || turingMetadata.subject || 'Unknown';
        }
        subject = normalizeSubject(subject);
        
        // Get formStage
        let formStage = task.formStage || 'No FormStage';
        formStage = normalizeFormStage(formStage);
        
        // Initialize trainer entry
        if (!trainers[trainerName]) {
            trainers[trainerName] = {
                id: trainerId,
                profilePicture: profilePicture,
                taskCount: 0,
                totalMinutes: 0,
                reviewed: 0,      // Completed but not in delivery
                inDelivery: 0,    // In ongoing delivery batch
                delivered: 0,     // In delivered batch
                subjects: {},
                formStages: {}    // Track by form stage
            };
        }
        
        // Update counts
        trainers[trainerName].taskCount++;
        trainers[trainerName].totalMinutes += durationMinutes;
        
        // Track by delivery status
        if (isDelivered) {
            trainers[trainerName].delivered++;
        } else if (isInDelivery) {
            trainers[trainerName].inDelivery++;
        } else {
            trainers[trainerName].reviewed++;
        }
        
        // Track by formStage
        if (!trainers[trainerName].formStages[formStage]) {
            trainers[trainerName].formStages[formStage] = {
                count: 0,
                minutes: 0
            };
        }
        trainers[trainerName].formStages[formStage].count++;
        trainers[trainerName].formStages[formStage].minutes += durationMinutes;
        
        // Track by subject
        if (!trainers[trainerName].subjects[subject]) {
            trainers[trainerName].subjects[subject] = {
                count: 0,
                minutes: 0,
                reviewed: 0,
                inDelivery: 0,
                delivered: 0,
                formStages: {}   // Track formStages within subject
            };
        }
        trainers[trainerName].subjects[subject].count++;
        trainers[trainerName].subjects[subject].minutes += durationMinutes;
        if (isDelivered) {
            trainers[trainerName].subjects[subject].delivered++;
        } else if (isInDelivery) {
            trainers[trainerName].subjects[subject].inDelivery++;
        } else {
            trainers[trainerName].subjects[subject].reviewed++;
        }
        
        // Track formStage within subject
        if (!trainers[trainerName].subjects[subject].formStages[formStage]) {
            trainers[trainerName].subjects[subject].formStages[formStage] = {
                count: 0,
                minutes: 0
            };
        }
        trainers[trainerName].subjects[subject].formStages[formStage].count++;
        trainers[trainerName].subjects[subject].formStages[formStage].minutes += durationMinutes;
    });
    
    // Convert taskIds Sets to counts for cleaner data
    for (const trainer of Object.values(trainers)) {
        trainer.uniqueTaskCount = trainer.taskIds?.size || trainer.taskCount;
        delete trainer.taskIds;
    }
    
    return trainers;
}

// Filter trainers by search term
function filterTrainers() {
    const searchTerm = document.getElementById('trainer-search')?.value?.toLowerCase() || '';
    const sortValue = document.getElementById('trainer-sort')?.value || 'tasks-desc';
    
    if (!window.currentTrainerStats) return;
    
    // Filter
    let filtered = Object.entries(window.currentTrainerStats);
    if (searchTerm) {
        filtered = filtered.filter(([name]) => name.toLowerCase().includes(searchTerm));
    }
    
    // Sort
    filtered = applySorting(filtered, sortValue);
    
    // Render
    renderTrainerCards(filtered);
}

// Sort trainers
function sortTrainers() {
    filterTrainers(); // Re-filter with new sort
}

// Apply sorting to trainer entries
function applySorting(entries, sortValue) {
    switch (sortValue) {
        case 'tasks-desc':
            return entries.sort((a, b) => b[1].taskCount - a[1].taskCount);
        case 'tasks-asc':
            return entries.sort((a, b) => a[1].taskCount - b[1].taskCount);
        case 'aht-desc':
            return entries.sort((a, b) => {
                const ahtA = a[1].taskCount > 0 ? a[1].totalMinutes / a[1].taskCount : 0;
                const ahtB = b[1].taskCount > 0 ? b[1].totalMinutes / b[1].taskCount : 0;
                return ahtB - ahtA;
            });
        case 'aht-asc':
            return entries.sort((a, b) => {
                const ahtA = a[1].taskCount > 0 ? a[1].totalMinutes / a[1].taskCount : 0;
                const ahtB = b[1].taskCount > 0 ? b[1].totalMinutes / b[1].taskCount : 0;
                return ahtA - ahtB;
            });
        case 'time-desc':
            return entries.sort((a, b) => b[1].totalMinutes - a[1].totalMinutes);
        case 'name-asc':
            return entries.sort((a, b) => a[0].localeCompare(b[0]));
        default:
            return entries;
    }
}

// Render trainer cards
function renderTrainerCards(trainersArray) {
    const container = document.getElementById('subjects-trainer-stats');
    if (!container) return;
    
    if (trainersArray.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No trainers found</div></div>';
        return;
    }
    
    let html = '';
    
    for (const [trainerName, stats] of trainersArray) {
        const aht = stats.taskCount > 0 ? Math.round(stats.totalMinutes / stats.taskCount) : 0;
        
        html += `<div class="subject-card trainer-card">
            <div class="subject-header">
                <div class="trainer-info">
                    ${stats.profilePicture ? `<img src="${stats.profilePicture}" class="trainer-avatar" alt="${trainerName}">` : '<div class="trainer-avatar-placeholder">👤</div>'}
                    <div class="trainer-name">${trainerName}</div>
                </div>
                <div class="subject-count">${stats.taskCount} submissions</div>
            </div>
            <div class="trainer-status-row">
                <div class="status-badge status-reviewed" title="Reviewed: Completed tasks awaiting delivery">📋 ${stats.reviewed}</div>
                <div class="status-badge status-indelivery" title="In Delivery: Tasks in ongoing delivery batch">📦 ${stats.inDelivery}</div>
                <div class="status-badge status-delivered" title="Delivered: Tasks successfully delivered to client">✅ ${stats.delivered}</div>
            </div>
            <div class="trainer-stats-grid">
                <div class="trainer-stat-card stat-time">
                    <div class="stat-label">Total Time</div>
                    <div class="stat-value">${formatMinutes(stats.totalMinutes)}</div>
                </div>
                <div class="trainer-stat-card stat-aht">
                    <div class="stat-label">Avg AHT</div>
                    <div class="stat-value">${aht}m</div>
                </div>
            </div>
            <div class="trainer-breakdown">
                <div class="trainer-section">
                    <div class="trainer-section-title">By Form Stage:</div>
                    <div class="trainer-formstage-grid">`;
        
        // Sort formStages by count
        const sortedFormStages = Object.entries(stats.formStages).sort((a, b) => b[1].count - a[1].count);
        
        for (const [formStage, fsStats] of sortedFormStages) {
            const fsAht = fsStats.count > 0 ? Math.round(fsStats.minutes / fsStats.count) : 0;
            const colorClass = getFormStageColorClass(formStage);
            html += `<div class="trainer-formstage-item ${colorClass}">
                <span class="trainer-formstage-name">${formStage}</span>
                <span class="trainer-formstage-count">${fsStats.count}</span>
                <span class="trainer-formstage-time">${formatMinutes(fsStats.minutes)}</span>
                <span class="trainer-formstage-aht">${fsAht}m</span>
            </div>`;
        }
        
        html += `</div></div>
                <div class="trainer-section">
                    <div class="trainer-section-title">By Subject:</div>
                    <div class="trainer-subject-grid">`;
        
        // Sort subjects by count
        const sortedSubjects = Object.entries(stats.subjects).sort((a, b) => b[1].count - a[1].count);
        
        for (const [subject, subjectStats] of sortedSubjects) {
            const subjectAht = subjectStats.count > 0 ? Math.round(subjectStats.minutes / subjectStats.count) : 0;
            const deliveredBadge = subjectStats.delivered > 0 ? `<span class="delivered-indicator" title="${subjectStats.delivered} tasks delivered">✅${subjectStats.delivered}</span>` : '';
            html += `<div class="trainer-subject-item">
                <span class="trainer-subject-name">${subject}</span>
                <span class="trainer-subject-count">${subjectStats.count} ${deliveredBadge}</span>
                <span class="trainer-subject-time">${formatMinutes(subjectStats.minutes)}</span>
                <span class="trainer-subject-aht">${subjectAht}m</span>
            </div>`;
        }
        
        html += `</div></div></div></div>`;
    }
    
    container.innerHTML = html;
}

// Toggle sidebar visibility (right side)
function toggleSidebar() {
    const sidebar = document.getElementById('breakdown-sidebar');
    const container = document.querySelector('.container');
    const toggleBtn = document.getElementById('sidebar-toggle');
    
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
        sidebar.classList.remove('open');
        sidebar.classList.add('collapsed');
        container.classList.remove('sidebar-open');
        toggleBtn.classList.remove('sidebar-open');
    } else {
        sidebar.classList.add('open');
        sidebar.classList.remove('collapsed');
        container.classList.add('sidebar-open');
        toggleBtn.classList.add('sidebar-open');
    }
}