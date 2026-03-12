// Stub search filter - will be implemented later
window.filterClients = function() {
    // this will eventually filter the table based on #clientSearch value
    console.log('filterClients called');
};

// Function to fetch and display clients
async function fetchClients() {
    console.log("Fetching filtered clients...");

    // 1. Get values from the filter UI
    const destFilter = document.getElementById('filter-destination')?.value || 'All';
    const statusFilter = document.getElementById('filter-status')?.value || 'All';
    const searchFilter = (document.getElementById('filter-search')?.value || '').toLowerCase();

    // 2. Start building the Supabase Query
    let query = supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

    // 3. Apply Filters if they aren't "All"
    if (destFilter !== 'All') {
        query = query.eq('destination_country', destFilter);
    }
    if (statusFilter !== 'All') {
        query = query.eq('status', statusFilter);
    }
    
    // 4. Run the query
    const { data, error } = await query;

    if (error) {
        console.error("Error fetching clients:", error.message);
        return;
    }

    // 5. Client-side search (for Name or Passport)
    const filteredData = data.filter(client => 
        client.full_name.toLowerCase().includes(searchFilter) || 
        (client.passport_number && client.passport_number.toLowerCase().includes(searchFilter))
    );

    const tableBody = document.getElementById('clientsTableBody');
    tableBody.innerHTML = '';

    filteredData.forEach(client => {
        const whatsappLink = `https://wa.me/${client.phone_number.replace(/\s+/g, '')}?text=Hello%20${encodeURIComponent(client.full_name)},%20this%20is%20Shallebs%20Agencies%20regarding%20your%20application.`;

        const row = `
            <tr>
                <td><strong>${client.full_name}</strong></td>
                <td>${client.passport_number}</td>
                <td>
                    <a href="${whatsappLink}" target="_blank" style="color: #25D366; text-decoration: none;">
                        <i class="fab fa-whatsapp"></i> ${client.phone_number}
                    </a>
                </td>
                <td>
                    <span style="background:#eef2ff; color:#1a237e; padding: 4px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">
                        <i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${client.destination_country || '—'}
                    </span>
                </td>
                <td>
                    <span style="color:#64748b; font-size:0.85rem;">
                        <i class="fas fa-calendar-alt" style="margin-right:4px; color:#94a3b8;"></i>
                        ${client.registration_date ? new Date(client.registration_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : (client.created_at ? new Date(client.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—')}
                    </span>
                </td>
                <td>
                    <span class="status-badge status-acceptance">${client.status}</span>
                    ${(() => {
                        if (!client.assigned_worker) return '';
                        
                        let displayHtml = `<div style="margin-top: 5px; font-size: 0.75rem; color: #3949ab; font-weight: 600;"><i class="fas fa-id-badge"></i> `;
                        
                        if (client.assigned_worker.includes(' (Team:')) {
                            const parts = client.assigned_worker.split(' (Team: ');
                            const lead = parts[0];
                            const members = parts[1].replace(')', '');
                            displayHtml += `${lead} <i class="fas fa-users" title="Team: ${members}" style="margin-left: 4px; cursor: help; color: #1a237e;"></i>`;
                        } else {
                            displayHtml += client.assigned_worker;
                        }
                        
                        displayHtml += `</div>`;
                        return displayHtml;
                    })()}
                </td>
                <td>
                    <button class="btn-view" onclick="viewClientDetails('${client.id}')">View Details</button>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// Ensure the table loads when we click "Client Database" in the sidebar
// wrap the existing showSection if it exists
const originalShowSection = typeof window.showSection === 'function' ? window.showSection : function() {};
window.showSection = function(sectionId) {
    originalShowSection(sectionId);
    if (sectionId === 'database-section') {
        fetchClients();
    }
};

let currentClientId = null; // Track which client we are looking at
let currentClientData = null; // Store full client data for use in tabs

window.viewClientDetails = async function(clientId) {
    currentClientId = clientId;
    
    // 1. Fetch full client details from Supabase
    const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

    if (error) return alert("Error loading details");

    // 2. Store client data globally for use in tabs
    currentClientData = client;

    // 3. Populate the Modal header
    document.getElementById('detail-name').innerText = client.full_name;

    // 4. Open the Modal
    document.getElementById('details-modal').style.display = 'flex';
    
    // 5. Load the Finance tab by default
    setTimeout(() => {
        const financeBtn = document.querySelector('.tab-btn.active');
        if (financeBtn) {
            switchTab('finance', { target: financeBtn });
        }
    }, 50);
};

window.closeModal = function() {
    document.getElementById('details-modal').style.display = 'none';
};

// Function to update status in Database
window.updateClientStatus = async function() {
    const newStatus = document.getElementById('status-update-dropdown').value;
    const clientName = document.getElementById('detail-name').innerText;
    
    const { error } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('id', currentClientId);

    if (!error) {
        alert("Status updated to: " + newStatus);
        logActivity(currentClientId, 'Status Change', `Changed status to ${newStatus}`);
        fetchClients(); // Refresh the main table
        fetchActivity(currentClientId); // Refresh the activity feed in the modal
    }
};

// Tab Switching Function
window.switchTab = function(tabName, event) {
    const workspace = document.getElementById('modal-workspace');
    
    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Activate clicked button
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    if (tabName === 'finance') {
        workspace.innerHTML = `
            <div class="finance-dashboard">
                <div class="vault-header">
                    <h3><i class="fas fa-chart-line"></i> Financial Dashboard</h3>
                    <p class="vault-subtitle">Overview of payments and balances</p>
                </div>
                
                <div class="finance-summary-grid">
                    <div class="f-card f-total">
                        <span class="f-label">Total Amount Due</span>
                        <span class="f-value" id="detail-total-due">KES 0</span>
                    </div>
                    <div class="f-card f-paid">
                        <span class="f-label">Total Amount Paid</span>
                        <span class="f-value" id="detail-paid">KES 0</span>
                    </div>
                    <div class="f-card f-balance">
                        <span class="f-label">Remaining Balance</span>
                        <span class="f-value" id="detail-balance">KES 0</span>
                    </div>
                </div>

                <div class="finance-actions">
                    <button class="btn-action-primary" onclick="addPayment()">
                        <i class="fas fa-plus"></i> Record New Installment
                    </button>
                </div>

                <div class="finance-settings">
                    <div class="settings-header">
                        <h4><i class="fas fa-cog"></i> Financial Setup & Accruals</h4>
                        <p>Configure the agreed total and add extra charges.</p>
                    </div>
                    
                    <div class="settings-grid">
                        <div class="setup-group">
                            <label>Initial Agreed Total (KES)</label>
                            <div class="input-with-btn">
                                <input type="number" id="setup-total-due" placeholder="Enter total amount">
                                <button onclick="updateAgreedTotal()" title="Save Total">Apply</button>
                            </div>
                        </div>

                        <div class="setup-group">
                            <label>Add Surcharge / Extra Fee (KES)</label>
                            <div class="input-with-btn">
                                <input type="number" id="surcharge-amount" placeholder="Amount">
                                <input type="text" id="surcharge-reason" placeholder="Reason (e.g. Courier)">
                                <button onclick="addSurcharge()" class="btn-surcharge" title="Add Charge">Add</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        fetchClientFinance(currentClientId);
        
    } else if (tabName === 'status') {
        const _allWorkers = window._allWorkers || [];
        
        let currentLead = currentClientData?.assigned_worker || '';
        if (currentLead.includes(' (Team:')) {
            currentLead = currentLead.split(' (Team:')[0];
        }

        const leadOptionsHtml = _allWorkers.map(w => {
            return `<option value="${w.full_name}" ${currentLead === w.full_name ? 'selected' : ''}>${w.full_name}</option>`;
        }).join('');

        let membersStr = '';
        if (currentClientData?.assigned_worker && currentClientData.assigned_worker.includes(' (Team:')) {
            membersStr = currentClientData.assigned_worker.split('(Team: ')[1].replace(')', '');
        }
        const membersArray = membersStr.split(', ').filter(Boolean);

        const memberOptionsHtml = _allWorkers.map(w => {
            return `<option value="${w.full_name}" ${membersArray.includes(w.full_name) ? 'selected' : ''}>${w.full_name}</option>`;
        }).join('');

        const status = currentClientData?.status || '';

        workspace.innerHTML = `
            <div class="status-manager">
                <div class="vault-header">
                    <h3><i class="fas fa-rocket"></i> Application Status</h3>
                    <p class="vault-subtitle">Track and update the client's progress</p>
                </div>

                <div class="status-control-card">
                    <label>Current Status</label>
                    <select id="status-update-dropdown" class="modern-select" onchange="updateClientStatus()">
                        <option value="Client Acceptance">Client Acceptance</option>
                        <option value="Documentation">Documentation</option>
                        <option value="Preview Submission">Preview Submission</option>
                        <option value="Visa Status">Visa Status</option>
                        <option value="Processing">Processing</option>
                        <option value="Completed">Completed</option>
                    </select>
                </div>

                <div class="status-control-card" style="margin-top: 15px;">
                    <label><i class="fas fa-id-badge" style="color: #3949ab; margin-right: 5px;"></i> Assigned Team</label>
                    
                    <div style="margin-top: 8px;">
                        <label style="font-size: 0.8rem; font-weight: bold; color: #64748b;">Team Lead</label>
                        <select id="worker-assignment-dropdown" class="modern-select" style="width: 100%; margin-bottom: 10px;">
                            <option value="">-- Unassigned --</option>
                            ${leadOptionsHtml}
                        </select>

                        <label style="font-size: 0.8rem; font-weight: bold; color: #64748b;">Team Members (Ctrl/Cmd+Click to select multiple)</label>
                        <select id="team-members-dropdown" class="modern-select" multiple style="width: 100%; height: 80px; margin-bottom: 15px;">
                            ${memberOptionsHtml}
                        </select>

                        <button class="btn-action-primary" onclick="assignWorkerToClient()" style="padding: 10px 20px; font-size: 0.9rem; width: 100%;">Save Team Assignment</button>
                    </div>
                </div>

                <div class="status-pipeline" style="margin-top: 25px; display: flex; flex-wrap: wrap; gap: 8px;">
                    <div class="pipeline-step ${status === 'Client Acceptance' ? 'active' : ''}">Acceptance</div>
                    <div class="pipeline-arrow"><i class="fas fa-chevron-right"></i></div>
                    <div class="pipeline-step ${status === 'Documentation' ? 'active' : ''}">Docs</div>
                    <div class="pipeline-arrow"><i class="fas fa-chevron-right"></i></div>
                    <div class="pipeline-step ${status === 'Preview Submission' ? 'active' : ''}">Preview</div>
                    <div class="pipeline-arrow"><i class="fas fa-chevron-right"></i></div>
                    <div class="pipeline-step ${status === 'Visa Status' ? 'active' : ''}">Visa</div>
                    <div class="pipeline-arrow"><i class="fas fa-chevron-right"></i></div>
                    <div class="pipeline-step ${status === 'Processing' ? 'active' : ''}">Processing</div>
                    <div class="pipeline-arrow"><i class="fas fa-chevron-right"></i></div>
                    <div class="pipeline-step ${status === 'Completed' ? 'active' : ''}">Completed</div>
                </div>
            </div>
        `;
        if (currentClientData) {
            document.getElementById('status-update-dropdown').value = currentClientData.status;
        }

    } else if (tabName === 'docs') {
        workspace.innerHTML = `
            <div class="doc-vault-container">
                <div class="vault-header">
                    <h3><i class="fas fa-folder-open"></i> Document Vault</h3>
                    <p class="vault-subtitle">Manage and categorize client documents</p>
                </div>

                <div class="upload-section">
                    <h4><i class="fas fa-cloud-upload-alt"></i> Upload New Document</h4>
                    <div class="upload-controls">
                        <div class="control-group">
                            <label for="doc-category-select">Category</label>
                            <select id="doc-category-select">
                                <option value="Personal">Personal Docs</option>
                                <option value="Family">Family Supportive</option>
                                <option value="Financial">Financial Support</option>
                            </select>
                        </div>
                        <div class="control-group">
                            <label for="doc-label-input">Document Label / Type</label>
                            <input type="text" id="doc-label-input" placeholder="e.g. Passport, National ID" list="doc-type-suggestions">
                            <datalist id="doc-type-suggestions">
                                <option value="Passport">
                                <option value="National ID">
                                <option value="Birth Certificate">
                                <option value="Academic Certificate">
                                <option value="Bank Statement">
                                <option value="Marriage Certificate">
                                <option value="Good Conduct">
                                <option value="Yellow Fever Card">
                            </datalist>
                        </div>
                        <div class="control-group">
                            <label for="file-upload-input">Select File</label>
                            <input type="file" id="file-upload-input">
                        </div>
                        <button class="btn-upload-enhanced" onclick="uploadDocument()">
                            <i class="fas fa-plus"></i> Upload & Categorize
                        </button>
                    </div>
                </div>

                <div class="doc-grid">
                    <div class="doc-category-card" id="card-Personal">
                        <div class="card-header">
                            <div class="icon-circle"><i class="fas fa-user"></i></div>
                            <div class="header-text">
                                <h5>Personal Documents</h5>
                                <span class="doc-count" id="count-Personal">0 files</span>
                            </div>
                        </div>
                        <div id="list-Personal" class="sub-list-enhanced"></div>
                    </div>

                    <div class="doc-category-card" id="card-Family">
                        <div class="card-header">
                            <div class="icon-circle"><i class="fas fa-users"></i></div>
                            <div class="header-text">
                                <h5>Family Supportive</h5>
                                <span class="doc-count" id="count-Family">0 files</span>
                            </div>
                        </div>
                        <div id="list-Family" class="sub-list-enhanced"></div>
                    </div>

                    <div class="doc-category-card" id="card-Financial">
                        <div class="card-header">
                            <div class="icon-circle"><i class="fas fa-wallet"></i></div>
                            <div class="header-text">
                                <h5>Financial Support</h5>
                                <span class="doc-count" id="count-Financial">0 files</span>
                            </div>
                        </div>
                        <div id="list-Financial" class="sub-list-enhanced"></div>
                    </div>
                </div>
            </div>
        `;
        fetchClientDocuments(currentClientId);
        
    } else if (tabName === 'tasks') {
        workspace.innerHTML = `
            <div class="task-manager">
                <div class="vault-header">
                    <h3><i class="fas fa-tasks"></i> Task Management</h3>
                    <p class="vault-subtitle">Add and track follow-up tasks for this client</p>
                </div>

                <div class="task-creation-card">
                    <h4>Add New Task</h4>
                    <div class="task-form-row">
                        <input type="text" id="task-desc" placeholder="What needs to be done?">
                        <input type="date" id="task-date">
                        <button class="btn-action-primary" onclick="saveTask()">
                            <i class="fas fa-check"></i> Add Task
                        </button>
                    </div>
                </div>

                <div class="task-list-section">
                    <h4>Pending Tasks</h4>
                    <div id="clientTasksList" class="modern-task-list"></div>
                </div>
            </div>
        `;
        loadClientTasks(currentClientId);
        
    } else if (tabName === 'activity') {
        workspace.innerHTML = `
            <div class="activity-viewer">
                <div class="vault-header">
                    <h3><i class="fas fa-history"></i> Activity Log</h3>
                    <p class="vault-subtitle">Audit trail of all changes for this client</p>
                </div>
                <div id="activity-list" class="activity-feed"></div>
            </div>
        `;
        fetchActivity(currentClientId);
    }
};

// Load tasks for a specific client
window.loadClientTasks = async function(clientId) {
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_completed', false);

    if (error) return;
    
    const taskList = document.getElementById('clientTasksList') || document.getElementById('modal-workspace');
    if (!taskList) return;
    
    if (tasks.length === 0) {
        taskList.innerHTML += '<p style="color: #999;">No pending tasks</p>';
        return;
    }
    
    let taskHtml = '<table style="width: 100%; border-collapse: collapse;">';
    tasks.forEach(task => {
        taskHtml += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px;">${task.task_description}</td>
                <td style="padding: 12px; color: #999;">${task.due_date}</td>
                <td style="padding: 12px;">
                    <button onclick="completeTask('${task.id}')" style="background: #1a237e; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">✓ Complete</button>
                </td>
            </tr>
        `;
    });
    taskHtml += '</table>';
    
    if (document.getElementById('clientTasksList')) {
        document.getElementById('clientTasksList').innerHTML = taskHtml;
    }
};

window.assignWorkerToClient = async function() {
    const leadName = document.getElementById('worker-assignment-dropdown').value;
    const membersSelect = document.getElementById('team-members-dropdown');
    
    // Get array of selected team members
    const selectedMembers = Array.from(membersSelect.selectedOptions).map(opt => opt.value);
    
    // Format the assignment string
    let assignmentString = leadName || null;
    if (leadName && selectedMembers.length > 0) {
        assignmentString = `${leadName} (Team: ${selectedMembers.join(', ')})`;
    } else if (!leadName && selectedMembers.length > 0) {
        alert("Please select a Team Lead if you are adding Team Members.");
        return;
    }

    if (!currentClientId) return;

    try {
        const { error } = await supabase
            .from('clients')
            .update({ assigned_worker: assignmentString })
            .eq('id', currentClientId);

        if (error) throw error;

        // Update local object so it persists if tab is switched
        currentClientData.assigned_worker = assignmentString;
        
        alert(assignmentString ? `Assigned to ${assignmentString}` : "Employee unassigned");
        logActivity(currentClientId, 'Employee Assignment', assignmentString ? `Assigned to ${assignmentString}` : "Employee unassigned");
        fetchClients(); // Refresh the main table to show the badge
    } catch (err) {
        console.error("Failed to assign worker", err);
        alert("Failed to assign employee. Please try again.");
    }
};