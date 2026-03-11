window.logActivity = async function(clientId, type, desc) {
    // 1. Get the currently logged-in user's info
    const { data: { user } } = await supabaseClient.auth.getUser();
    const agentEmail = user ? user.email : "System/Unknown";

    // 2. Insert the log with the agent's email
    await supabase
        .from('activity_logs')
        .insert([{ 
            client_id: clientId, 
            event_type: type, 
            description: desc,
            agent_email: agentEmail // <--- This tracks WHO did it
        }]);
    
    // Refresh the view if the modal is open
    if (document.getElementById('activity-list')) {
        fetchActivity(clientId);
    }
};

window.fetchActivity = async function(clientId) {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

    const list = document.getElementById('activity-list');
    if (list) {
        list.innerHTML = '';
        if (!data) return;
        data.forEach(log => {
            const date = new Date(log.created_at).toLocaleString();
            list.innerHTML += `
                <div class="activity-item" style="padding: 8px; border-bottom: 1px solid #eee; font-size: 0.85rem;">
                    <p style="margin: 0;">
                        <span style="color: #1a237e; font-weight: bold;">[${date}]</span> 
                        <strong>${log.event_type}:</strong> ${log.description}
                    </p>
                    <small style="color: #666; font-style: italic;">Action by: ${log.agent_email}</small>
                </div>
            `;
        });
    }
};

window.renderGlobalActivityFeed = async function() {
    const feedContainer = document.getElementById('global-activity-feed');
    if (!feedContainer) return;

    const { data: logs, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

    if (error) {
        feedContainer.innerHTML = '<div class="error-state">Failed to load live feed.</div>';
        return;
    }

    feedContainer.innerHTML = logs.map(log => {
        let icon = 'fa-info-circle';
        let bg = '#eff6ff';
        let color = '#3b82f6';

        if (log.event_type.toLowerCase().includes('payment') || log.event_type.toLowerCase().includes('finance')) {
            icon = 'fa-money-bill-wave'; bg = '#f0fdf4'; color = '#22c55e';
        } else if (log.event_type.toLowerCase().includes('document')) {
            icon = 'fa-file-alt'; bg = '#fef7ee'; color = '#f97316';
        } else if (log.event_type.toLowerCase().includes('task')) {
            icon = 'fa-tasks'; bg = '#f5f3ff'; color = '#8b5cf6';
        }

        const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return `
            <div class="feed-item">
                <div class="feed-icon" style="background: ${bg}; color: ${color}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="feed-content">
                    <p><strong>${log.event_type}:</strong> ${log.description}</p>
                    <small>${time} • by ${(log.agent_email || 'System').split('@')[0]}</small>
                </div>
            </div>
        `;
    }).join('');
};
