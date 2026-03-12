// Worker Management Logic

document.addEventListener('DOMContentLoaded', () => {
    fetchWorkers();
    
    const workerForm = document.getElementById('worker-form');
    if (workerForm) {
        workerForm.addEventListener('submit', addWorker);
    }
});

let currentWorkerForModal = null;

async function fetchWorkers() {
    const tbody = document.getElementById('workers-body');
    if (!tbody) return;

    try {
        // Fetch workers
        const { data: workers, error: workerErr } = await supabaseClient
            .from('workers')
            .select('*')
            .order('created_at', { ascending: false });

        if (workerErr) throw workerErr;

        // Fetch client assignments for counts
        const { data: clients, error: clientErr } = await supabaseClient
            .from('clients')
            .select('assigned_worker, status');
            
        if (clientErr) throw clientErr;

        window._allWorkers = workers;

        if (workers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No employees found. Add one above.</td></tr>';
            return;
        }

        tbody.innerHTML = workers.map(worker => {
            const dateStr = new Date(worker.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            
            // Calculate assigned metrics
            let totalAssigned = 0;
            let activeWorkload = 0;
            
            clients.forEach(c => {
                if (!c.assigned_worker) return;
                
                // Track if worker is Lead OR a Member
                const isLead = c.assigned_worker === worker.full_name || c.assigned_worker.startsWith(`${worker.full_name} (Team:`);
                const isMember = c.assigned_worker.includes(`(Team:`) && c.assigned_worker.includes(worker.full_name) && !isLead;

                if (isLead || isMember) {
                    totalAssigned++;
                    // Basic heuristic: if status is Completed, it's considered done
                    if (c.status !== 'Completed') activeWorkload++;
                }
            });

            return `
                <tr>
                    <td style="font-weight: 600; color: #1a237e;">
                        <i class="fas fa-user-tie" style="margin-right:8px; color:#94a3b8;"></i> 
                        ${worker.full_name}
                    </td>
                    <td>${dateStr}</td>
                    <td><span style="background: #e0f2f1; color: #00897b; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold;">${activeWorkload} Active</span></td>
                    <td>${totalAssigned} Total</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-view" style="background: #3949ab; padding: 6px 12px; font-size: 0.8rem;" onclick="openWorkloadModal('${worker.full_name}')">
                                <i class="fas fa-briefcase"></i> View Workload
                            </button>
                            <button class="btn-delete" style="padding: 6px 12px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600;" onclick="deleteWorker('${worker.id}', '${worker.full_name}')">
                                <i class="fas fa-trash-alt"></i> Remove
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("Failed to fetch workers:", err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: red;">Failed to load employees. Check console.</td></tr>';
    }
}

// Open Workload Modal
window.openWorkloadModal = async function(workerName) {
    currentWorkerForModal = workerName;
    document.getElementById('workload-worker-name').innerText = workerName;
    document.getElementById('worker-workload-modal').style.display = 'block';

    const tbody = document.getElementById('worker-assigned-clients-body');
    const assignSelect = document.getElementById('workload-assign-select');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading workload...</td></tr>';
    assignSelect.innerHTML = '<option value="">Loading unassigned clients...</option>';

    try {
        // Fetch all clients to split into assigned vs unassigned
        const { data: clients, error } = await supabaseClient
            .from('clients')
            .select('id, full_name, status, assigned_worker, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Populate table
        const assigned = clients.filter(c => {
            if (!c.assigned_worker) return false;
            const isLead = c.assigned_worker === workerName || c.assigned_worker.startsWith(`${workerName} (Team:`);
            const isMember = c.assigned_worker.includes(`(Team:`) && c.assigned_worker.includes(workerName) && !isLead;
            if (isLead || isMember) {
                c._isMemberOnly = isMember;
                return true;
            }
            return false;
        });
        if (assigned.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">No clients currently assigned.</td></tr>';
        } else {
            tbody.innerHTML = assigned.map(c => {
                const dateStr = new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                const isDone = c.status === 'Completed';
                return `
                    <tr style="${isDone ? 'opacity: 0.6; background: #f8fafc;' : ''}">
                        <td>
                            <strong>${c.full_name}</strong>
                            ${c._isMemberOnly ? '<span style="font-size: 0.75rem; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-left: 5px;"><i class="fas fa-users"></i> Member</span>' : ''}
                        </td>
                        <td><span class="status-badge" style="background: #e3f2fd; color: #1a237e;">${c.status}</span></td>
                        <td>${dateStr}</td>
                        <td>
                            ${!isDone ? `
                            <button class="btn-view" style="background: #27ae60; padding: 6px 12px; font-size: 0.8rem;" onclick="completeWorkerTask('${c.id}', '${c.status}')">
                                <i class="fas fa-check"></i> Complete
                            </button>
                            ` : '<span style="color: #27ae60; font-weight: bold;"><i class="fas fa-check-circle"></i> Done</span>'}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Populate Assign select
        const unassigned = clients.filter(c => !c.assigned_worker || c.assigned_worker !== workerName);
        if (unassigned.length === 0) {
            assignSelect.innerHTML = '<option value="">All clients are assigned.</option>';
        } else {
            assignSelect.innerHTML = '<option value="">Select a client to assign...</option>' + 
                unassigned.map(c => `<option value="${c.id}">${c.full_name} (${c.status})</option>`).join('');
        }

    } catch (err) {
        console.error("Failed to load workload data:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: red;">Error loading data.</td></tr>';
    }
};

window.assignClientFromModal = async function() {
    const select = document.getElementById('workload-assign-select');
    const clientId = select.value;

    if (!clientId) return alert('Please select a client to assign.');
    if (!currentWorkerForModal) return;

    try {
        const { error } = await supabaseClient
            .from('clients')
            .update({ assigned_worker: currentWorkerForModal })
            .eq('id', clientId);

        if (error) throw error;
        
        // Refresh modal and main worker table
        openWorkloadModal(currentWorkerForModal);
        fetchWorkers();
        
        // Note: Can't easily update global client database view without reloading, 
        // but if user navigates back to database via tabs, it fetches fresh anyway.
    } catch(err) {
        console.error("Failed to assign:", err);
        alert("Failed to assign client.");
    }
};

window.completeWorkerTask = async function(clientId, currentStatus) {
    if(!confirm("Mark this phase as completed by the employee and move status forward?")) return;

    // Determine next naive status (this can be made more robust later)
    let nextStatus = currentStatus;
    if (currentStatus === 'Client Acceptance') nextStatus = 'Documentation';
    else if (currentStatus === 'Documentation') nextStatus = 'Preview Submission';
    else if (currentStatus === 'Preview Submission') nextStatus = 'Visa Status';
    else if (currentStatus === 'Visa Status') nextStatus = 'Processing';
    else if (currentStatus === 'Processing') nextStatus = 'Completed';

    try {
        const { error } = await supabaseClient
            .from('clients')
            .update({ status: nextStatus })
            .eq('id', clientId);

        if (error) throw error;
        
        // Log activity wrapper
        if (window.logActivity) {
            await window.logActivity('Employee progress logged', `${currentWorkerForModal} completed task. Moved to ${nextStatus}.`);
        }
        
        openWorkloadModal(currentWorkerForModal);
        fetchWorkers();
    } catch(err) {
        console.error("Failed to mark complete:", err);
        alert("Failed to update status.");
    }
};

async function addWorker(e) {
    if (e) e.preventDefault();
    const nameInput = document.getElementById('worker_full_name');
    const name = nameInput.value.trim();
    if (!name) return;

    try {
        const { error } = await supabaseClient
            .from('workers')
            .insert([{ full_name: name }]);

        if (error) throw error;
        
        nameInput.value = '';
        fetchWorkers();
        alert('Employee added successfully!');
    } catch (err) {
        console.error("Failed to add worker:", err);
        alert('Failed to add employee. See console for details.');
    }
}

window.deleteWorker = async function(id, name) {
    if (!confirm(`Are you sure you want to remove employee: ${name}?`)) return;

    try {
        const { error } = await supabaseClient
            .from('workers')
            .delete()
            .eq('id', id);

        if (error) throw error;
        fetchWorkers();
    } catch (err) {
        console.error("Failed to delete worker:", err);
        alert('Failed to remove employee.');
    }
};
