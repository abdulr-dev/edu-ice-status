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

// Cache for loaded data
const dataCache = {};

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
    
    if (!container) {
        console.error('Container not found for tab:', tabName);
        return;
    }
    
    // Check cache
    if (dataCache[tabName]) {
        console.log('Using cached data for:', tabName);
        displayTasks(tabName, dataCache[tabName]);
        return;
    }
    
    // Show loading
    if (loading) loading.style.display = 'block';
    container.innerHTML = '';
    
    try {
        // Fetch all pages
        const allTasks = await fetchAllPages(tabName);
        
        // Cache data
        dataCache[tabName] = allTasks;
        
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
    }
    
    return TURING_API_BASE + '?' + params.toString();
}

function displayTasks(tabName, tasks) {
    const container = document.getElementById('subjects-' + tabName);
    
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No tasks found</div></div>';
        return;
    }
    
    // For delivery tab, group by subject and deliveryBatch name
    if (tabName === 'delivery') {
        const grouped = groupTasksBySubjectAndDeliveryBatch(tasks);
        
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
    
    // Group by subject and formStage
    const grouped = groupTasksBySubjectAndFormStage(tasks);
    
    // Build HTML
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

console.log('=== DASHBOARD SCRIPT READY ===');
