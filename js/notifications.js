window.checkPassportExpiries = async function() {
    const today = new Date();
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(today.getMonth() + 6);

    // 1. Fetch clients whose passports expire within 6 months
    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, passport_expiry')
        .lt('passport_expiry', sixMonthsFromNow.toISOString().split('T')[0]);

    if (error) return;

    window.notifications = (data || []).map(client => ({
        id: `passport_${client.id}`,
        title: `Passport Expiring Soon`,
        message: `<strong>${client.full_name}</strong>'s passport expires on ${client.passport_expiry}. Embassy might reject this.`,
        date: client.passport_expiry
    }));

    renderNotifications('unread');
};

window.renderNotifications = function(filter = 'unread') {
    const list = document.getElementById('notif-items');
    const badge = document.getElementById('notif-count');
    if (!list) return;

    list.innerHTML = '';
    
    // Get read IDs from localStorage
    const readAlerts = JSON.parse(localStorage.getItem('shallebs_read_alerts') || '[]');

    let unreadCount = 0;
    let html = '';

    (window.notifications || []).forEach(notif => {
        const isRead = readAlerts.includes(notif.id);
        if (!isRead) unreadCount++;

        // Apply filter
        if (filter === 'unread' && isRead) return;
        if (filter === 'read' && !isRead) return;

        html += `
            <div class="notif-item-card ${isRead ? 'read' : ''}">
                <div class="notif-content">
                    <strong>⚠️ ${notif.title}</strong>
                    <p>${notif.message}</p>
                </div>
                ${!isRead ? `<button class="btn-mark-read" title="Mark as Read" onclick="markAsRead('${notif.id}')"><i class="fas fa-check"></i></button>` : ''}
            </div>
        `;
    });

    if (html === '') {
        html = `<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 0.9rem;">No ${filter} notifications.</div>`;
    }

    list.innerHTML = html;

    // Update badge
    if (badge) {
        if (unreadCount > 0) {
            badge.innerText = unreadCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
};

window.markAsRead = function(id) {
    const readAlerts = JSON.parse(localStorage.getItem('shallebs_read_alerts') || '[]');
    if (!readAlerts.includes(id)) {
        readAlerts.push(id);
        localStorage.setItem('shallebs_read_alerts', JSON.stringify(readAlerts));
    }
    
    const activeFilterBtn = document.querySelector('.notif-filter-btn.active');
    const filter = activeFilterBtn ? activeFilterBtn.innerText.toLowerCase() : 'unread';
    renderNotifications(filter);
};

window.filterNotifications = function(filter, event) {
    if (event) {
        document.querySelectorAll('.notif-filter-btn').forEach(btn => btn.classList.remove('active'));
        event.currentTarget.classList.add('active');
        event.stopPropagation(); // keep dropdown open
    }
    renderNotifications(filter);
};

window.toggleNotifs = function(event) {
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
};

// Auto-run this when the app loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkPassportExpiries);
} else {
    checkPassportExpiries();
}
