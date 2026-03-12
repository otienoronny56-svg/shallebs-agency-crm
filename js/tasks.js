// Automatically load tasks in the background to set the urgent notification badge on the sidebar
document.addEventListener('DOMContentLoaded', () => {
    // Wait slightly to ensure Supabase client is initialized
    setTimeout(() => {
        if (typeof loadAllTasks === 'function') {
            loadAllTasks();
        }
    }, 1000);

    const qtForm = document.getElementById('quick-task-form');
    if (qtForm) qtForm.addEventListener('submit', saveQuickTask);
});

// Function to Save a Task from the Client Modal
window.saveTask = async function() {
    const desc = document.getElementById('task-desc').value;
    const date = document.getElementById('task-date').value;

    if (!desc || !currentClientId) {
        return alert("Please enter what needs to be done.");
    }

    // Get current user for attribution
    const { data: { user } } = await supabase.auth.getUser();
    const creatorName = user?.user_metadata?.full_name || user?.email || 'Unknown';

    const { error } = await supabase
        .from('tasks')
        .insert([{ 
            client_id: currentClientId, 
            task_description: desc, 
            due_date: date || null,
            created_by: creatorName
        }]);

    if (!error) {
        alert("Task added successfully!");
        document.getElementById('task-desc').value = '';
        document.getElementById('task-date').value = '';
    } else {
        alert("Error saving task: " + error.message);
    }
};

// Function to Load All Pending Tasks
window.loadAllTasks = async function() {
    let data = [];
    let error = null;

    // Try primary query with attribution
    try {
        const res = await supabase
            .from('tasks')
            .select(`
                id,
                task_description,
                due_date,
                is_completed,
                created_by,
                clients ( id, full_name, destination_country )
            `)
            .order('due_date', { ascending: true });
        
        if (res.error) throw res.error;
        data = res.data;
    } catch (err) {
        console.warn("Primary task query failed, attempting legacy fallback:", err.message);
        // Fallback: exclude created_by if column doesn't exist yet
        const res = await supabase
            .from('tasks')
            .select(`
                id,
                task_description,
                due_date,
                is_completed,
                clients ( id, full_name, destination_country )
            `)
            .order('due_date', { ascending: true });
        
        if (res.error) {
            console.error("Critical Task Load Error:", res.error);
            const tbody = document.getElementById('tasksTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #d32f2f;">Failed to load tasks. Please check database connection.</td></tr>';
            return;
        }
        data = res.data;
    }

    // Populate the filter dropdown with unique creators
    const creatorFilter = document.getElementById('task-creator-filter');
    if (creatorFilter) {
        const currentSelection = creatorFilter.value;
        const creators = [...new Set(data.map(t => t.created_by || 'Unknown'))].sort();
        creatorFilter.innerHTML = '<option value="All">All Users</option>' + 
            creators.map(c => `<option value="${c}" ${c === currentSelection ? 'selected' : ''}>${c}</option>`).join('');
    }

    const selectedCreator = creatorFilter?.value || 'All';

    let totalTasks = data.length;
    let completedCount = 0;
    let activeTasks = [];

    data.forEach(t => {
        // Apply filter
        if (selectedCreator !== 'All' && (t.created_by || 'Unknown') !== selectedCreator) {
            if (!t.is_completed) totalTasks--; 
            return;
        }

        if (t.is_completed) completedCount++;
        else activeTasks.push(t);
    });

    let completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
    let overdueCount = 0;

    const tbody = document.getElementById('tasksTableBody');
    tbody.innerHTML = '';

    let urgentCount = 0;
    let dueTodayCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    activeTasks.forEach(task => {
        let dateColor = '';
        let dateWeight = 'normal';
        let displayDate = task.due_date || 'No Deadline';

        if (task.due_date) {
            const dueDate = new Date(task.due_date);
            dueDate.setHours(0, 0, 0, 0);
            const diffTime = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

            if (diffTime < 0) {
                // Overdue
                dateColor = '#d32f2f'; // Red
                dateWeight = 'bold';
                urgentCount++;
                overdueCount++;
            } else if (diffTime === 0) {
                // Due today
                dateColor = '#d32f2f'; // Red
                dateWeight = 'bold';
                urgentCount++;
                dueTodayCount++;
            } else if (diffTime === 1 || diffTime === 2) {
                // Due tomorrow or in 2 days
                dateColor = '#ed6c02'; // Orange
                dateWeight = 'bold';
            }
        }

        const destinationHtml = task.clients.destination_country ? 
            `<span style="background:#eef2ff; color:#1a237e; padding: 4px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${task.clients.destination_country}</span>` : 
            `<span style="color:#94a3b8; font-size: 0.85rem;">—</span>`;

        const row = `
            <tr>
                <td><strong>${task.clients.full_name}</strong></td>
                <td>${destinationHtml}</td>
                <td>${task.task_description}</td>
                 <td style="color: ${dateColor}; font-weight: ${dateWeight};">
                    ${displayDate}
                    <button onclick="editTaskDate('${task.id}', '${task.task_description}', '${task.due_date || ''}')" style="background: none; border: none; color: #3949ab; cursor: pointer; margin-left: 10px;" title="Edit Date">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
                <td style="font-size: 0.85rem; color: #64748b;">
                    <i class="fas fa-user-edit" style="margin-right: 5px; opacity: 0.7;"></i> ${task.created_by || 'Unknown'}
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-view" style="background: #3949ab; font-size: 0.8rem; padding: 6px 12px;" onclick="viewClientDetails('${task.clients.id}')" title="Open Client Modal">
                            <i class="fas fa-external-link-alt"></i> View
                        </button>
                        <button class="btn-view" style="background: #27ae60; font-size: 0.8rem; padding: 6px 12px;" onclick="completeTask('${task.id}')">
                            <i class="fas fa-check"></i> Done
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });

    // Update Stat Cards
    const statActive = document.getElementById('stat-active-tasks');
    const statActiveSub = document.getElementById('stat-active-subtitle');
    const statOverdue = document.getElementById('stat-overdue-tasks');
    const statCompletion = document.getElementById('stat-task-completion');
    
    if (statActive) statActive.innerText = activeTasks.length;
    if (statActiveSub) statActiveSub.innerText = `${activeTasks.length} pending · ${dueTodayCount} due today`;
    if (statOverdue) statOverdue.innerText = overdueCount;
    if (statCompletion) statCompletion.innerText = `${completionRate}%`;

    // Update the sidebar glow
    const taskNavBtn = document.querySelector('.nav-links li[onclick*="tasks-section"]');
    if (taskNavBtn) {
        if (urgentCount > 0) {
            taskNavBtn.classList.add('urgent-glow');
            const icon = taskNavBtn.querySelector('i');
            if (icon) icon.style.color = '#ff9800';
            taskNavBtn.innerHTML = `<i class="fas fa-tasks" style="color: #ff9800;"></i> <span>Daily Tasks <span style="background: red; color: white; padding: 2px 6px; border-radius: 50%; font-size: 0.7rem; margin-left: 5px;">${urgentCount}</span></span>`;
        } else {
            taskNavBtn.classList.remove('urgent-glow');
            taskNavBtn.innerHTML = `<i class="fas fa-tasks"></i> <span>Daily Tasks</span>`;
        }
    }
};

window.editTaskDate = async function(taskId, desc, oldDate) {
    const newDate = prompt(`Enter new Due Date for "${desc}"\nFormat: YYYY-MM-DD`, oldDate);
    if (newDate === null) return; // User cancelled
    
    // Optionally validate date format roughly
    if (newDate && isNaN(Date.parse(newDate))) {
        return alert("Invalid date format. Please use YYYY-MM-DD.");
    }

    const { error } = await supabase
        .from('tasks')
        .update({ due_date: newDate || null })
        .eq('id', taskId);

    if (!error) {
        loadAllTasks();
    } else {
        alert("Error updating date: " + error.message);
    }
};

// Mark Task as Done
window.completeTask = async function(taskId) {
    const { error } = await supabase
        .from('tasks')
        .update({ is_completed: true })
        .eq('id', taskId);

    if (!error) {
        loadAllTasks(); // Refresh the list
    }
};
// Open Quick Task Modal
window.openQuickTaskModal = async function() {
    const modal = document.getElementById('quick-task-modal');
    const select = document.getElementById('qt-client-select');
    modal.style.display = 'flex';
    select.innerHTML = '<option value="">Loading clients...</option>';

    try {
        const { data: clients, error } = await supabase
            .from('clients')
            .select('id, full_name')
            .order('full_name', { ascending: true });

        if (error) throw error;

        select.innerHTML = '<option value="">-- Select Client --</option>' +
            clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
    } catch (err) {
        console.error("Failed to load clients:", err);
        select.innerHTML = '<option value="">Error loading clients</option>';
    }
};

// Save Quick Task
async function saveQuickTask(e) {
    if (e) e.preventDefault();
    const clientId = document.getElementById('qt-client-select').value;
    const desc = document.getElementById('qt-desc').value;
    const date = document.getElementById('qt-date').value;

    if (!clientId || !desc) return alert("Please select a client and describe the task.");

    try {
        const { data: { user } } = await supabase.auth.getUser();
        const creatorName = user?.user_metadata?.full_name || user?.email || 'Unknown';

        const { error } = await supabase
            .from('tasks')
            .insert([{
                client_id: clientId,
                task_description: desc,
                due_date: date || null,
                created_by: creatorName
            }]);

        if (error) throw error;

        alert("Task created successfully!");
        document.getElementById('quick-task-modal').style.display = 'none';
        document.getElementById('quick-task-form').reset();
        loadAllTasks(); // Refresh the list
    } catch (err) {
        console.error("Failed to save quick task:", err);
        alert("Failed to save task.");
    }
}
