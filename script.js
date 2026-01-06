// API Configuration - Uses CONFIG from config.js
// Make sure config.js is loaded before this script

// Check if config is loaded
if (typeof CONFIG === 'undefined') {
    console.error('CONFIG not found! Make sure config.js is loaded before script.js');
}

// Use values from config.js
const LOCAL_PROXY = CONFIG.LOCAL_PROXY;
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const isVercel = window.location.hostname.includes('vercel.app');
const API_BASE_URL = CONFIG.API_BASE_URL;
const AUTH_TOKEN = CONFIG.AUTH_TOKEN;

// Status mapping
const STATUS_MAP = {
    'pending': 'unclaimed',
    'labeling': 'inprogress',
    'validating': 'inprogress',
    'in_progress': 'inprogress',
    'pending_review': 'pending-review',
    'reviewed': 'reviewed',
    'rework': 'rework'
};

// Store all tasks
let allTasks = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    loadUnclaimedTasks();
});

// Setup tab switching
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Remove active class from all tabs and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            button.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');

            // Load data for the selected tab
            loadTabData(targetTab);
        });
    });
}

// Load unclaimed tasks (initial load)
async function loadUnclaimedTasks() {
    try {
        const data = await fetchUnclaimedTasks();
        allTasks = data.data || [];
        displayTasks('unclaimed', allTasks);
        updateCounts();
    } catch (error) {
        console.error('Error loading unclaimed tasks:', error);
        let errorMessage = 'Failed to load tasks. ';
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMessage += 'Please check your internet connection and try again.';
        } else {
            errorMessage += error.message || 'Please check your API connection.';
        }
        showError('unclaimed', errorMessage);
    }
}

// Fetch pending review tasks from API (all pages)
async function fetchPendingReviewTasks() {
    const baseParams = '';
    const joinParams = 'join[0]=project||id,name,status,projectType,supportsFunctionCalling,supportsWorkflows,supportsMultipleFilesPerTask,jibbleActivity,instructionsLink,readonly,averageHandleTimeMinutes&join[1]=batch||id,name,status,projectId,jibbleActivity,maxClaimGoldenTaskAllowed,averageHandleTimeMinutes&join[2]=currentUser||id,name,turingEmail,profilePicture,isBlocked&join[3]=currentUser.teamLead||id,name,turingEmail,profilePicture,isBlocked&join[4]=seed||metadata,turingMetadata&join[5]=labels||id,labelId&join[6]=labels.label&join[7]=latestManualReview&join[8]=latestManualReview.review||id,score,feedback,status,audit,conversationId,reviewerId,reviewType,followupRequired&join[9]=latestManualReview.review.reviewer||id,name,turingEmail,profilePicture,isBlocked&join[10]=latestManualReview.review.qualityDimensionValues||id,score,qualityDimensionId,weight,scoreText&join[11]=latestManualReview.review.qualityDimensionValues.qualityDimension||id,name&join[12]=latestAutoReview&join[13]=latestAutoReview.review||id,score,conversationId,status,reviewType,followupRequired&join[14]=latestAutoReview.review.qualityDimensionValues||id,score,qualityDimensionId,weight,scoreText&join[15]=latestAutoReview.review.qualityDimensionValues.qualityDimension||id,name&join[16]=difficultyLevel&join[17]=difficultyLevel.levelInfo||name&join[18]=latestLabelingWorkflow&join[19]=latestLabelingWorkflow.workflow||status,createdAt,currentWorkflowStatus&join[20]=latestLabelingWorkflow.workflow.currentCollaborator||id&join[21]=latestLabelingWorkflow.workflow.currentCollaborator.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[22]=latestLabelingWorkflow.workflow.collaborators||role&join[23]=latestLabelingWorkflow.workflow.collaborators.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[24]=latestLabelingWorkflow.workflow.collaborators.collaborator.teamLead||id,name,turingEmail,profilePicture,isBlocked&join[25]=latestDeliveryBatch&join[26]=latestDeliveryBatch.deliveryBatch||id,name,status&join[27]=reviews||id,status,audit,conversationId,reviewerId,reviewType,updatedAt&join[28]=reviews.reviewer||id,name,turingEmail,profilePicture,isBlocked&join[29]=currentUser.reviewer||id,name,turingEmail,profilePicture,isBlocked';
    // Note: The API uses batchId filter with specific batch IDs, but we'll use projectId filter instead for all batches
    const filterParams = 'filter[0]=status||$eq||completed&filter[1]=$needFollowup||$eq||true&filter[2]=project.status||$ne||archived&filter[3]=projectId||$eq||640&filter[4]=batch.status||$ne||draft&filter[5]=batch.status||$ne||archived';
    
    // Fetch first page to get total count
    const { apiUrl: firstPageUrl } = await fetchPage(baseParams, joinParams, filterParams, 1);
    const firstPageData = await makeApiRequest(firstPageUrl);
    
    const allTasks = [...(firstPageData.data || [])];
    const totalPages = firstPageData.pageCount || 1;
    
    console.log(`Pending Review tasks: Found ${firstPageData.total} total, ${totalPages} pages`);
    
    // Fetch remaining pages if any
    if (totalPages > 1) {
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
            const { apiUrl } = await fetchPage(baseParams, joinParams, filterParams, page);
            pagePromises.push(makeApiRequest(apiUrl));
        }
        
        const remainingPages = await Promise.all(pagePromises);
        remainingPages.forEach(pageData => {
            allTasks.push(...(pageData.data || []));
        });
        
        console.log(`Pending Review tasks: Fetched all ${allTasks.length} tasks from ${totalPages} pages`);
    }
    
    return {
        data: allTasks,
        total: allTasks.length,
        count: allTasks.length
    };
}

// Fetch reviewed tasks from API (all pages)
async function fetchReviewedTasks() {
    const baseParams = '';
    const joinParams = 'join[0]=project||id,name,status,projectType,supportsFunctionCalling,supportsWorkflows,supportsMultipleFilesPerTask,jibbleActivity,instructionsLink,readonly,averageHandleTimeMinutes&join[1]=batch||id,name,status,projectId,jibbleActivity,maxClaimGoldenTaskAllowed,averageHandleTimeMinutes&join[2]=currentUser||id,name,turingEmail,profilePicture,isBlocked&join[3]=currentUser.teamLead||id,name,turingEmail,profilePicture,isBlocked&join[4]=seed||metadata,turingMetadata&join[5]=labels||id,labelId&join[6]=labels.label&join[7]=difficultyLevel&join[8]=difficultyLevel.levelInfo||name&join[9]=latestManualReview&join[10]=latestManualReview.review||id,score,feedback,status,audit,conversationId,reviewerId,reviewType,followupRequired&join[11]=latestManualReview.review.reviewer||id,name,turingEmail,profilePicture,isBlocked&join[12]=latestLabelingWorkflow&join[13]=latestLabelingWorkflow.workflow||status,createdAt,currentWorkflowStatus&join[14]=latestLabelingWorkflow.workflow.currentCollaborator||id&join[15]=latestLabelingWorkflow.workflow.currentCollaborator.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[16]=latestLabelingWorkflow.workflow.collaborators||role&join[17]=latestLabelingWorkflow.workflow.collaborators.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[18]=latestLabelingWorkflow.workflow.collaborators.collaborator.teamLead||id,name,turingEmail,profilePicture,isBlocked&join[19]=latestAutoReview&join[20]=latestAutoReview.review||id,score,conversationId,status,reviewType,followupRequired&join[21]=reviews||id,submittedAt,feedback,status,audit,score,conversationId,reviewerId,conversationVersionId,reviewType&join[22]=reviews.qualityDimensionValues||id,score,qualityDimensionId,weight,scoreText&join[23]=reviews.reviewer||id,name,turingEmail,profilePicture,isBlocked&join[24]=latestDeliveryBatch&join[25]=latestDeliveryBatch.deliveryBatch||id,name,status';
    const filterParams = 'filter[0]=latestDeliveryBatch.deliveryBatch||$isnull&filter[1]=reviewRequired||$eq||false&filter[2]=status||$eq||completed&filter[3]=batch.status||$ne||draft&filter[4]=manualReview.followupRequired||$eq||false&filter[5]=project.status||$ne||archived&filter[6]=projectId||$eq||640&filter[7]=batch.status||$ne||draft&filter[8]=batch.status||$ne||archived';
    
    // Fetch first page to get total count
    const { apiUrl: firstPageUrl } = await fetchPage(baseParams, joinParams, filterParams, 1);
    const firstPageData = await makeApiRequest(firstPageUrl);
    
    const allTasks = [...(firstPageData.data || [])];
    const totalPages = firstPageData.pageCount || 1;
    
    console.log(`Reviewed tasks: Found ${firstPageData.total} total, ${totalPages} pages`);
    
    // Fetch remaining pages if any
    if (totalPages > 1) {
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
            const { apiUrl } = await fetchPage(baseParams, joinParams, filterParams, page);
            pagePromises.push(makeApiRequest(apiUrl));
        }
        
        const remainingPages = await Promise.all(pagePromises);
        remainingPages.forEach(pageData => {
            allTasks.push(...(pageData.data || []));
        });
        
        console.log(`Reviewed tasks: Fetched all ${allTasks.length} tasks from ${totalPages} pages`);
    }
    
    return {
        data: allTasks,
        total: allTasks.length,
        count: allTasks.length
    };
}

// Fetch rework tasks from API (all pages)
async function fetchReworkTasks() {
    const baseParams = 'sort[0]=updatedAt,DESC';
    const joinParams = 'join[0]=project||id,name,status,projectType,supportsFunctionCalling,supportsWorkflows,supportsMultipleFilesPerTask,jibbleActivity,instructionsLink,readonly,averageHandleTimeMinutes&join[1]=batch||id,name,status,projectId,jibbleActivity,maxClaimGoldenTaskAllowed,averageHandleTimeMinutes&join[2]=currentUser||id,name,turingEmail,profilePicture,isBlocked&join[3]=currentUser.teamLead||id,name,turingEmail,profilePicture,isBlocked&join[4]=seed||metadata,turingMetadata&join[5]=labels||id,labelId&join[6]=labels.label&join[7]=latestManualReview&join[8]=latestManualReview.review||id,score,feedback,status,audit,conversationId,reviewerId,reviewType,followupRequired&join[9]=latestManualReview.review.reviewer||id,name,turingEmail,profilePicture,isBlocked&join[10]=latestManualReview.review.qualityDimensionValues||id,score,qualityDimensionId,weight,scoreText&join[11]=latestManualReview.review.qualityDimensionValues.qualityDimension||id,name&join[12]=latestAutoReview&join[13]=latestAutoReview.review||id,score,conversationId,status,reviewType,followupRequired&join[14]=latestAutoReview.review.qualityDimensionValues||id,score,qualityDimensionId,weight,scoreText&join[15]=latestAutoReview.review.qualityDimensionValues.qualityDimension||id,name&join[16]=latestLabelingWorkflow&join[17]=latestLabelingWorkflow.workflow||status,createdAt,currentWorkflowStatus&join[18]=latestLabelingWorkflow.workflow.currentCollaborator||id&join[19]=latestLabelingWorkflow.workflow.currentCollaborator.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[20]=latestLabelingWorkflow.workflow.collaborators||role&join[21]=latestLabelingWorkflow.workflow.collaborators.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[22]=latestLabelingWorkflow.workflow.collaborators.collaborator.teamLead||id,name,turingEmail,profilePicture,isBlocked';
    const filterParams = 'filter[0]=status||$eq||rework&filter[1]=batch.status||$ne||draft&filter[2]=project.status||$ne||archived&filter[3]=projectId||$eq||640&filter[4]=batch.status||$ne||draft&filter[5]=batch.status||$ne||archived';
    
    // Fetch first page to get total count
    const { apiUrl: firstPageUrl } = await fetchPage(baseParams, joinParams, filterParams, 1);
    const firstPageData = await makeApiRequest(firstPageUrl);
    
    const allTasks = [...(firstPageData.data || [])];
    const totalPages = firstPageData.pageCount || 1;
    
    console.log(`Rework tasks: Found ${firstPageData.total} total, ${totalPages} pages`);
    
    // Fetch remaining pages if any
    if (totalPages > 1) {
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
            const { apiUrl } = await fetchPage(baseParams, joinParams, filterParams, page);
            pagePromises.push(makeApiRequest(apiUrl));
        }
        
        const remainingPages = await Promise.all(pagePromises);
        remainingPages.forEach(pageData => {
            allTasks.push(...(pageData.data || []));
        });
        
        console.log(`Rework tasks: Fetched all ${allTasks.length} tasks from ${totalPages} pages`);
    }
    
    return {
        data: allTasks,
        total: allTasks.length,
        count: allTasks.length
    };
}

// Fetch in-progress tasks from API (all pages)
async function fetchInProgressTasks() {
    const baseParams = '';
    const joinParams = 'join[0]=project||id,name,status,projectType,supportsFunctionCalling,supportsWorkflows,supportsMultipleFilesPerTask,jibbleActivity,instructionsLink,readonly,averageHandleTimeMinutes&join[1]=batch||id,name,status,projectId,jibbleActivity,maxClaimGoldenTaskAllowed,averageHandleTimeMinutes&join[2]=currentUser||id,name,turingEmail,profilePicture,isBlocked&join[3]=currentUser.teamLead||id,name,turingEmail,profilePicture,isBlocked&join[4]=seed||metadata,turingMetadata&join[5]=labels||id,labelId&join[6]=labels.label&join[7]=latestLabelingWorkflow&join[8]=latestLabelingWorkflow.workflow||status,createdAt,currentWorkflowStatus&join[9]=latestLabelingWorkflow.workflow.currentCollaborator||id&join[10]=latestLabelingWorkflow.workflow.currentCollaborator.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[11]=latestLabelingWorkflow.workflow.collaborators||role&join[12]=latestLabelingWorkflow.workflow.collaborators.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[13]=latestLabelingWorkflow.workflow.collaborators.collaborator.teamLead||id,name,turingEmail,profilePicture,isBlocked';
    const filterParams = 'filter[0]=status||$eq||labeling&filter[1]=status||$in||labeling,validating&filter[2]=batch.status||$ne||draft&filter[3]=project.status||$ne||archived&filter[4]=projectId||$eq||640&filter[5]=batch.status||$ne||draft&filter[6]=batch.status||$ne||archived';
    
    // Fetch first page to get total count
    const { apiUrl: firstPageUrl } = await fetchPage(baseParams, joinParams, filterParams, 1);
    const firstPageData = await makeApiRequest(firstPageUrl);
    
    const allTasks = [...(firstPageData.data || [])];
    const totalPages = firstPageData.pageCount || 1;
    
    console.log(`In Progress tasks: Found ${firstPageData.total} total, ${totalPages} pages`);
    
    // Fetch remaining pages if any
    if (totalPages > 1) {
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
            const { apiUrl } = await fetchPage(baseParams, joinParams, filterParams, page);
            pagePromises.push(makeApiRequest(apiUrl));
        }
        
        const remainingPages = await Promise.all(pagePromises);
        remainingPages.forEach(pageData => {
            allTasks.push(...(pageData.data || []));
        });
        
        console.log(`In Progress tasks: Fetched all ${allTasks.length} tasks from ${totalPages} pages`);
    }
    
    return {
        data: allTasks,
        total: allTasks.length,
        count: allTasks.length
    };
}

// Helper function to fetch a single page
async function fetchPage(baseParams, joinParams, filterParams, page = 1) {
    // Handle baseParams - if it includes sort, keep it, otherwise add limit
    let queryParams;
    if (baseParams && baseParams.includes('sort')) {
        // If baseParams has sort, combine it with limit and page
        queryParams = `${baseParams}&limit=1000&page=${page}&${joinParams}&${filterParams}`;
    } else {
        // Otherwise, just add limit and page
        queryParams = `${baseParams ? baseParams + '&' : ''}limit=1000&page=${page}&${joinParams}&${filterParams}`;
    }
    const apiUrl = `${API_BASE_URL}?${queryParams}`;
    
    return { apiUrl, queryParams };
}

// Helper function to make API request (handles proxy)
async function makeApiRequest(apiUrl) {
    // Try direct fetch first (works if API allows CORS)
    try {
        const directResponse = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'authorization': `Bearer ${AUTH_TOKEN}`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'DNT': '1',
                'x-app-version': '9c76935'
            }
        });

        if (directResponse.ok) {
            return await directResponse.json();
        }
    } catch (directError) {
        console.log('Direct fetch failed, trying CORS proxy...');
    }

    // Fallback: Try local proxy (for development)
    if (isLocal) {
        try {
            const apiPath = apiUrl.replace('https://labeling-g.turing.com', '');
            const localProxyUrl = `${LOCAL_PROXY}/api${apiPath}`;
            const response = await fetch(localProxyUrl, {
                method: 'GET'
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    return await response.json();
                } else {
                    const text = await response.text();
                    throw new Error(`Local proxy returned non-JSON response. First 200 chars: ${text.substring(0, 200)}`);
                }
            } else {
                const errorText = await response.text();
                throw new Error(`Local proxy returned status ${response.status}: ${errorText.substring(0, 200)}`);
            }
        } catch (localError) {
            throw new Error(`Local proxy error: ${localError.message}. Make sure python3 local-proxy.py is running.`);
        }
    }

    // Try Vercel serverless function (for production)
    if (isVercel) {
        const proxiedUrl = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
        const response = await fetch(proxiedUrl, {
            method: 'GET'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
        }

        return await response.json();
    }

    throw new Error('CORS proxy not available. For local development, run: python3 local-proxy.py');
}

// Fetch unclaimed tasks from API (all pages)
async function fetchUnclaimedTasks() {
    const baseParams = '';
    const joinParams = 'join[0]=project||id,name,status,projectType,supportsFunctionCalling,supportsWorkflows,supportsMultipleFilesPerTask,jibbleActivity,instructionsLink,readonly,averageHandleTimeMinutes&join[1]=batch||id,name,status,projectId,jibbleActivity,maxClaimGoldenTaskAllowed,averageHandleTimeMinutes&join[2]=currentUser||id,name,turingEmail,profilePicture,isBlocked&join[3]=currentUser.teamLead||id,name,turingEmail,profilePicture,isBlocked&join[4]=seed||metadata,turingMetadata&join[5]=labels||id,labelId&join[6]=labels.label&join[7]=latestLabelingWorkflow&join[8]=latestLabelingWorkflow.workflow||status,createdAt,currentWorkflowStatus&join[9]=latestLabelingWorkflow.workflow.currentCollaborator||id&join[10]=latestLabelingWorkflow.workflow.currentCollaborator.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[11]=latestLabelingWorkflow.workflow.collaborators||role&join[12]=latestLabelingWorkflow.workflow.collaborators.collaborator||id,name,turingEmail,profilePicture,isBlocked&join[13]=latestLabelingWorkflow.workflow.collaborators.collaborator.teamLead||id,name,turingEmail,profilePicture,isBlocked';
    const filterParams = 'filter[0]=$maxGoldenTaskClaimed||$eq||$me&filter[1]=$isClaimed||$eq||false&filter[2]=status||$eq||pending&filter[3]=project.status||$ne||archived&filter[4]=projectId||$eq||640&filter[5]=batch.status||$ne||draft&filter[6]=batch.status||$ne||archived';
    
    // Fetch first page to get total count
    const { apiUrl: firstPageUrl } = await fetchPage(baseParams, joinParams, filterParams, 1);
    const firstPageData = await makeApiRequest(firstPageUrl);
    
    const allTasks = [...(firstPageData.data || [])];
    const totalPages = firstPageData.pageCount || 1;
    
    console.log(`Unclaimed tasks: Found ${firstPageData.total} total, ${totalPages} pages`);
    
    // Fetch remaining pages if any
    if (totalPages > 1) {
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
            const { apiUrl } = await fetchPage(baseParams, joinParams, filterParams, page);
            pagePromises.push(makeApiRequest(apiUrl));
        }
        
        const remainingPages = await Promise.all(pagePromises);
        remainingPages.forEach(pageData => {
            allTasks.push(...(pageData.data || []));
        });
        
        console.log(`Unclaimed tasks: Fetched all ${allTasks.length} tasks from ${totalPages} pages`);
    }
    
    return {
        data: allTasks,
        total: allTasks.length,
        count: allTasks.length
    };
}
    try {
        const directResponse = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'authorization': `Bearer ${AUTH_TOKEN}`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'DNT': '1',
                'x-app-version': '9c76935'
            }
        });

        if (directResponse.ok) {
            return await directResponse.json();
        }
    } catch (directError) {
        console.log('Direct fetch failed, trying CORS proxy...');
    }

    // Fallback: Try local proxy (for development)
    if (isLocal) {
        try {
            // Construct the proxy URL correctly
            const apiPath = apiUrl.replace('https://labeling-g.turing.com', '');
            const localProxyUrl = `${LOCAL_PROXY}/api${apiPath}`;
            console.log('Original API URL:', apiUrl);
            console.log('API Path:', apiPath);
            console.log('Trying local proxy:', localProxyUrl);
            const response = await fetch(localProxyUrl, {
                method: 'GET'
            });

            console.log('Local proxy response status:', response.status);
            console.log('Local proxy response headers:', response.headers.get('content-type'));
            
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const data = await response.json();
                    console.log('Local proxy success, data received');
                    return data;
                } else {
                    // Response is not JSON, read as text to see what we got
                    const text = await response.text();
                    console.error('Local proxy returned non-JSON response:', text.substring(0, 200));
                    throw new Error(`Local proxy returned non-JSON response. First 200 chars: ${text.substring(0, 200)}`);
                }
            } else {
                const errorText = await response.text();
                console.error('Local proxy error response:', errorText.substring(0, 200));
                throw new Error(`Local proxy returned status ${response.status}: ${errorText.substring(0, 200)}`);
            }
        } catch (localError) {
            console.error('Local proxy error:', localError);
            // Don't continue to other options if we're local - the proxy should work
            throw new Error(`Local proxy error: ${localError.message}. Make sure python3 local-proxy.py is running.`);
        }
    }

    // Try Vercel serverless function (for production)
    if (isVercel) {
        const proxiedUrl = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;
        const response = await fetch(proxiedUrl, {
            method: 'GET'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
        }

        return await response.json();
    }

    // No proxy available - show helpful error
    throw new Error('CORS proxy not available. For local development, run: python3 local-proxy.py');
}

// Load data for a specific tab
async function loadTabData(tabName) {
    const container = document.getElementById(`subjects-${tabName}`);
    const loading = document.getElementById(`loading-${tabName}`);
    
    try {
        let tasks = [];
        
        if (tabName === 'unclaimed') {
            if (allTasks.length > 0) {
                // Use cached data if available
                displayTasks(tabName, allTasks);
                return;
            }
            const data = await fetchUnclaimedTasks();
            tasks = data.data || [];
            allTasks = tasks; // Cache for later
        } else if (tabName === 'inprogress') {
            const data = await fetchInProgressTasks();
            tasks = data.data || [];
        } else if (tabName === 'pending-review') {
            const data = await fetchPendingReviewTasks();
            tasks = data.data || [];
        } else if (tabName === 'reviewed') {
            const data = await fetchReviewedTasks();
            tasks = data.data || [];
        } else if (tabName === 'rework') {
            const data = await fetchReworkTasks();
            tasks = data.data || [];
        } else {
            // For other tabs, show empty state
            if (loading) loading.style.display = 'none';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">No tasks available for this status yet.</div>
                    <div style="margin-top: 10px; font-size: 0.9rem; color: #6c757d;">
                        API integration for this tab coming soon...
                    </div>
                </div>
            `;
            return;
        }
        
        if (loading) loading.style.display = 'none';
        displayTasks(tabName, tasks);
        updateCounts();
    } catch (error) {
        console.error(`Error loading ${tabName} tasks:`, error);
        if (loading) loading.style.display = 'none';
        let errorMessage = 'Failed to load tasks. ';
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMessage += 'Please check your internet connection and try again.';
        } else {
            errorMessage += error.message || 'Please check your API connection.';
        }
        showError(tabName, errorMessage);
    }
}

// Display tasks grouped by subject and formStage (count cards only)
function displayTasks(tabName, tasks) {
    const container = document.getElementById(`subjects-${tabName}`);
    const loading = document.getElementById(`loading-${tabName}`);
    
    if (loading) loading.style.display = 'none';

    // Store tasks by status for counting (store ALL tasks, not just those with formStage)
    const statusKey = tabName === 'pending-review' ? 'pending-review' : tabName;
    if (tasksByStatus.hasOwnProperty(statusKey)) {
        tasksByStatus[statusKey] = tasks;
    }

    // Group tasks by subject and formStage
    const tasksBySubjectAndFormStage = groupTasksBySubjectAndFormStage(tasks);

    if (Object.keys(tasksBySubjectAndFormStage).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-text">No tasks found</div>
            </div>
        `;
        // Still update counts even if no tasks to display
        updateCounts();
        return;
    }

    // Create HTML for each subject card with formStage breakdown
    let html = '';
    for (const [subject, formStages] of Object.entries(tasksBySubjectAndFormStage)) {
        html += createSubjectCard(subject, formStages);
    }

    container.innerHTML = html;
    updateCounts(); // Update counts after displaying
}

// Normalize subject name to standard format
function normalizeSubject(subject) {
    if (!subject) return 'Unknown';
    
    const normalized = subject.trim();
    // Case-insensitive matching for Data Science variations
    const normalizedLower = normalized.toLowerCase().replace(/\s+/g, '');
    
    const subjectMap = {
        'Math': 'Maths',
        'Mathematics': 'Maths',
        'Maths': 'Maths',
        'Physics': 'Physics',
        'Biology': 'Biology',
        'Chemistry': 'Chemistry',
        'Hardware': 'Hardware',
        'Data Science': 'Data Science',
        'DataScience': 'Data Science',
        'Data science': 'Data Science',
        'datascience': 'Data Science',
        'data science': 'Data Science',
        'DataScience': 'Data Science'
    };
    
    // Check exact match first
    if (subjectMap[normalized]) {
        return subjectMap[normalized];
    }
    
    // Check case-insensitive match for Data Science
    if (normalizedLower === 'datascience' || normalizedLower === 'datasci') {
        return 'Data Science';
    }
    
    return normalized;
}

// Normalize formStage name
function normalizeFormStage(formStage) {
    if (!formStage || formStage.trim() === '') return null;
    return formStage.trim();
}

// Group tasks by subject and formStage
function groupTasksBySubjectAndFormStage(tasks) {
    const grouped = {};

    tasks.forEach(task => {
        // Extract subject from seed metadata
        // Try multiple ways: Subject/subject key, first element in metadata, turingMetadata, or statement
        let rawSubject = null;
        
        const metadata = task.seed?.metadata;
        const turingMetadata = task.seed?.turingMetadata;
        
        // Try Subject key (capital S) first
        if (metadata?.Subject) {
            rawSubject = metadata.Subject;
        } else if (turingMetadata?.Subject) {
            rawSubject = turingMetadata.Subject;
        }
        // Try subject key (lowercase s)
        else if (metadata?.subject) {
            rawSubject = metadata.subject;
        } else if (turingMetadata?.subject) {
            rawSubject = turingMetadata.subject;
        }
        // Try first element in metadata if it's an object (but skip if it's "Task id" or similar)
        else if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
            const keys = Object.keys(metadata);
            // Look for subject-related keys first
            const subjectKey = keys.find(key => 
                key.toLowerCase().includes('subject') || 
                key.toLowerCase() === 'subject'
            );
            if (subjectKey && metadata[subjectKey]) {
                rawSubject = metadata[subjectKey];
            }
            // If no subject key found, try first key but only if it looks like a subject name
            else if (keys.length > 0) {
                const firstKey = keys[0];
                const firstValue = metadata[firstKey];
                // Only use first value if it's one of our known subjects (not "Task id" etc)
                const knownSubjects = ['Maths', 'Math', 'Mathematics', 'Physics', 'Biology', 'Chemistry', 'Hardware', 'Data Science'];
                if (knownSubjects.some(subj => firstValue && firstValue.toString().includes(subj))) {
                    rawSubject = firstValue;
                }
            }
        }
        // Try first element in turingMetadata (same logic)
        else if (turingMetadata && typeof turingMetadata === 'object' && !Array.isArray(turingMetadata)) {
            const keys = Object.keys(turingMetadata);
            const subjectKey = keys.find(key => 
                key.toLowerCase().includes('subject') || 
                key.toLowerCase() === 'subject'
            );
            if (subjectKey && turingMetadata[subjectKey]) {
                rawSubject = turingMetadata[subjectKey];
            }
            else if (keys.length > 0) {
                const firstKey = keys[0];
                const firstValue = turingMetadata[firstKey];
                const knownSubjects = ['Maths', 'Math', 'Mathematics', 'Physics', 'Biology', 'Chemistry', 'Hardware', 'Data Science'];
                if (knownSubjects.some(subj => firstValue && firstValue.toString().includes(subj))) {
                    rawSubject = firstValue;
                }
            }
        }
        // Fallback to statement parsing
        if (!rawSubject && task.statement) {
            // Try **Subject** - pattern
            let match = task.statement.match(/\*\*Subject\*\* - (.+)/);
            if (match && match[1]) {
                rawSubject = match[1].split('\n')[0].trim();
            }
            // Try **subject** - pattern (lowercase)
            else {
                match = task.statement.match(/\*\*subject\*\* - (.+)/);
                if (match && match[1]) {
                    rawSubject = match[1].split('\n')[0].trim();
                }
            }
        }
        
        // If still no subject, use Unknown
        if (!rawSubject) {
            rawSubject = 'Unknown';
        }
        
        // Normalize subject name
        const subject = normalizeSubject(rawSubject);
        
        // Extract formStage (use "No FormStage" if null)
        const formStage = normalizeFormStage(task.formStage) || 'No FormStage';

        if (!grouped[subject]) {
            grouped[subject] = {};
        }
        
        if (!grouped[subject][formStage]) {
            grouped[subject][formStage] = [];
        }
        
        grouped[subject][formStage].push(task);
    });

    // Sort subjects in a consistent order
    const subjectOrder = ['Maths', 'Physics', 'Biology', 'Chemistry', 'Hardware', 'Data Science'];
    const sorted = {};
    subjectOrder.forEach(subj => {
        if (grouped[subj]) {
            sorted[subj] = grouped[subj];
        }
    });
    // Add any other subjects that weren't in the list
    Object.keys(grouped).forEach(subj => {
        if (!sorted[subj]) {
            sorted[subj] = grouped[subj];
        }
    });

    return sorted;
}

// Create HTML for a subject card with formStage breakdown
function createSubjectCard(subject, formStages) {
    const subjectIcon = getSubjectIcon(subject);
    
    // Calculate total for this subject
    let total = 0;
    const formStageEntries = [];
    
    for (const [formStage, tasks] of Object.entries(formStages)) {
        total += tasks.length;
        formStageEntries.push({ formStage, count: tasks.length });
    }
    
    // Sort formStage entries by count (descending)
    formStageEntries.sort((a, b) => b.count - a.count);
    
    // Create formStage cards with color coding
    let formStageCards = '';
    const totalFormStages = formStageEntries.length;
    
    formStageEntries.forEach(({ formStage, count }, index) => {
        // Use full formStage name (CSS will handle truncation with ellipsis)
        const displayName = formStage;
        
        // Determine color class based on formStage
        let colorClass = '';
        const formStageLower = formStage.toLowerCase();
        if (formStageLower.includes('codability')) {
            colorClass = 'codability';
        } else if (formStageLower.includes('ground truth') || formStageLower.includes('ice')) {
            colorClass = 'ground-truth';
        } else if (formStageLower.includes('image rubrics') || formStageLower.includes('gemini')) {
            colorClass = 'image-rubrics';
        } else if (formStage === 'No FormStage') {
            colorClass = 'no-formstage';
        }
        
        // Add special class for 3-card layout
        let specialClass = '';
        if (totalFormStages === 3 && index === 2) {
            specialClass = 'third-card';
        }
        
        formStageCards += `
            <div class="formstage-card ${colorClass} ${specialClass}">
                <div class="formstage-name">${displayName}</div>
                <div class="formstage-count">${count}</div>
            </div>
        `;
    });

    return `
        <div class="subject-card">
            <div class="subject-header">
                <div class="subject-title">
                    ${subjectIcon} ${subject}
                </div>
                <span class="subject-total">${total}</span>
            </div>
            <div class="formstage-grid">
                ${formStageCards}
            </div>
        </div>
    `;
}

// Get icon for subject
function getSubjectIcon(subject) {
    const normalizedSubject = normalizeSubject(subject);
    const icons = {
        'Maths': '📐',
        'Physics': '⚛️',
        'Biology': '🧬',
        'Chemistry': '⚗️',
        'Hardware': '🔧',
        'Data Science': '💻'
    };
    return icons[normalizedSubject] || '📖';
}

// Store tasks by status
let tasksByStatus = {
    'unclaimed': [],
    'inprogress': [],
    'pending-review': [],
    'reviewed': [],
    'rework': []
};

// Update count badges
function updateCounts() {
    // Count tasks by status
    const counts = {
        'unclaimed': tasksByStatus['unclaimed'].length,
        'inprogress': tasksByStatus['inprogress'].length,
        'pending-review': tasksByStatus['pending-review'].length,
        'reviewed': tasksByStatus['reviewed'].length,
        'rework': tasksByStatus['rework'].length
    };

    // Update tab counts
    Object.keys(counts).forEach(status => {
        const countElement = document.getElementById(`count-${status}`);
        if (countElement) {
            countElement.textContent = counts[status];
        }
    });
}

// Show error message
function showError(tabName, message) {
    const container = document.getElementById(`subjects-${tabName}`);
    const loading = document.getElementById(`loading-${tabName}`);
    
    if (loading) loading.style.display = 'none';
    
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-text">${message}</div>
        </div>
    `;
}

