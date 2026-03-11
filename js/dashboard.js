window.loadEnhancedDashboard = async function() {
    // 1. Fetch all expenses and group them
    const { data: expenses } = await supabaseClient.from('expenses').select('category, amount');
    const expList = document.getElementById('expense-breakdown-list');
    expList.innerHTML = '';

    const expTotals = {};
    expenses?.forEach(e => {
        expTotals[e.category] = (expTotals[e.category] || 0) + parseFloat(e.amount);
    });

    for (const [cat, total] of Object.entries(expTotals)) {
        expList.innerHTML += `
            <div class="data-list-item">
                <span>${cat}</span>
                <span class="label-pill">KES ${total.toLocaleString()}</span>
            </div>
        `;
    }

    // 2. Fetch all clients and group by destination
    const { data: clients } = await supabaseClient.from('clients').select('destination_country');
    const destList = document.getElementById('dest-breakdown-list');
    destList.innerHTML = '';

    const destCounts = {};
    clients?.forEach(c => {
        destCounts[c.destination_country] = (destCounts[c.destination_country] || 0) + 1;
    });

    // Sort by count descending
    const sortedDests = Object.entries(destCounts).sort((a, b) => b[1] - a[1]);

    for (const [dest, count] of sortedDests) {
        destList.innerHTML += `
            <div class="data-list-item">
                <span>${dest || 'Unspecified'}</span>
                <span class="label-pill">${count} Client${count > 1 ? 's' : ''}</span>
            </div>
        `;
    }
};
