// Simple but complete dashboard script
console.log('=== DASHBOARD SCRIPT LOADED ===');

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
console.log('Environment:', isLocal ? 'Local' : 'Vercel/Production');

// API base URL - different for local vs deployed
const LOCAL_API_BASE = (CONFIG.LOCAL_PROXY || 'http://localhost:3000') + '/api/conversations';
const TURING_API_BASE = CONFIG.API_BASE_URL || 'https://labeling-g.turing.com/api/conversations';

// Known subjects
const KNOWN_SUBJECTS = ['Maths', 'Physics', 'Biology', 'Chemistry', 'Hardware', 'Data Science'];

// Wait for DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DOM READY ===');
    
    // Setup tab clicks
    const tabs = document.querySelectorAll('.tab-btn');
    console.log('Found tabs:', tabs.length);
    
    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            console.log('Tab clicked:', tabName);
            
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
    
    // Load initial data
    console.log('Loading initial data...');
    loadData('unclaimed');
});

async function loadData(tabName) {
    console.log('loadData called for:', tabName);
    
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
        console.log('Fetching page', page);
        
        let response;
        if (isLocal) {
            // Local: use local proxy directly
            const localUrl = apiUrl.replace(TURING_API_BASE, LOCAL_API_BASE);
            console.log('Local URL:', localUrl.substring(0, 80) + '...');
            response = await fetch(localUrl);
        } else {
            // Vercel: use the proxy function
            const proxyUrl = '/api/proxy?url=' + encodeURIComponent(apiUrl);
            console.log('Vercel proxy URL:', proxyUrl.substring(0, 80) + '...');
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
        
        console.log('Page', page, 'of', totalPages, '- Got', data.data?.length || 0, 'tasks');
        page++;
    } while (page <= totalPages);
    
    console.log('Total tasks fetched:', allTasks.length);
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

function displayTasks(tabName, tasks) {
    const container = document.getElementById('subjects-' + tabName);
    const summaryContainer = document.getElementById('summary-' + tabName);
    
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
        let summaryHtml = `
            <div class="summary-pill summary-total-pill">
                <span class="pill-label">Total</span>
                <span class="pill-count">${grandTotal}</span>
            </div>`;
        
        for (const [formStage, count] of Object.entries(overallFormStageTotals)) {
            const colorClass = tabName === 'improper' ? 'improper' : getFormStageColorClass(formStage);
            summaryHtml += `<div class="summary-pill ${colorClass}">
                <span class="pill-label">${formStage}</span>
                <span class="pill-count">${count}</span>
            </div>`;
        }
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

console.log('=== DASHBOARD SCRIPT READY ===');
