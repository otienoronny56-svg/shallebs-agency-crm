window.fetchClientFinance = async function(clientId) {
    const { data: payments, error } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', clientId)
        .limit(1);

    const finance = payments && payments.length > 0 ? payments[0] : null;

    if (error && error.code !== 'PGRST116') return; // Ignore "no row found" error

    const total = finance ? finance.total_amount_due : 0;
    const paid = finance ? finance.amount_paid : 0;
    const balance = total - paid;
    
    const clientName = document.getElementById('detail-name').innerText;

    document.getElementById('detail-total-due').innerText = `KES ${total.toLocaleString()}`;
    document.getElementById('detail-paid').innerHTML = `
        KES ${paid.toLocaleString()} 
        <button onclick="generateReceipt('${clientName}', ${paid}, ${balance})" 
                style="margin-left: 10px; font-size: 12px; cursor: pointer; background: none; border: 1px solid green; color: green; padding: 3px 8px; border-radius: 3px;">
            📄 Receipt
        </button>
    `;
    document.getElementById('detail-balance').innerText = `KES ${balance.toLocaleString()}`;

    // Pre-fill setup input if it exists
    const setupInput = document.getElementById('setup-total-due');
    if (setupInput) setupInput.value = total;
};

// Function to set or update the initial agreed total
window.updateAgreedTotal = async function() {
    const amount = document.getElementById('setup-total-due').value;
    if (!amount || isNaN(amount)) return alert("Please enter a valid amount.");

    const { data: existing } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', currentClientId)
        .limit(1);

    const finance = existing && existing.length > 0 ? existing[0] : null;

    if (finance) {
        const { error } = await supabase
            .from('payments')
            .update({ total_amount_due: parseFloat(amount) })
            .eq('client_id', currentClientId);
        if (error) return alert("Update failed: " + error.message);
    } else {
        const { error } = await supabase
            .from('payments')
            .insert([{
                client_id: currentClientId,
                total_amount_due: parseFloat(amount),
                amount_paid: 0
            }]);
        if (error) return alert("Setup failed: " + error.message);
    }

    alert("Initial agreed total updated!");
    logActivity(currentClientId, 'Finance', 'Updated agreed total to KES ' + amount);
    fetchClientFinance(currentClientId);
};

// Function to add a surcharge (accrual)
window.addSurcharge = async function() {
    const amount = document.getElementById('surcharge-amount').value;
    const reason = document.getElementById('surcharge-reason').value || 'Extra Fee';
    if (!amount || isNaN(amount)) return alert("Please enter a valid amount.");

    const { data: existing } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', currentClientId)
        .limit(1);

    const finance = existing && existing.length > 0 ? existing[0] : null;

    if (!finance) return alert("Please set the initial agreed total first.");

    const newTotal = parseFloat(finance.total_amount_due) + parseFloat(amount);

    const { error } = await supabase
        .from('payments')
        .update({ total_amount_due: newTotal })
        .eq('client_id', currentClientId);

    if (!error) {
        alert(`Surcharge of KES ${amount} added for: ${reason}`);
        logActivity(currentClientId, 'Finance', `Added surcharge: KES ${amount} (${reason})`);
        document.getElementById('surcharge-amount').value = '';
        document.getElementById('surcharge-reason').value = '';
        fetchClientFinance(currentClientId);
    } else {
        alert("Error adding surcharge: " + error.message);
    }
};

window.addPayment = async function() {
    const amount = prompt("Enter installment amount (KES):");
    if (!amount || isNaN(amount)) return;

    // Check if a finance record already exists
    const { data: existing } = await supabaseClient
        .from('payments')
        .select('*')
        .eq('client_id', currentClientId)
        .single();

    if (existing) {
        // Update existing record
        const newPaid = parseFloat(existing.amount_paid) + parseFloat(amount);
        await supabaseClient.from('payments').update({ amount_paid: newPaid }).eq('client_id', currentClientId);
    } else {
        // Create first payment record (Assuming a default total for now, e.g., 50,000)
        await supabaseClient.from('payments').insert([{
            client_id: currentClientId,
            total_amount_due: 50000, 
            amount_paid: amount
        }]);
    }

    alert("Payment recorded!");
    logActivity(currentClientId, 'Payment', 'Installment of KES ' + amount + ' recorded.');
    fetchClientFinance(currentClientId);
};

// Redundant definition removed

// Redundant showSection wrapper removed. auth.js handles this logic.

function toggleLoader(containerId, show) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let loader = container.querySelector('.chart-loader');
    if (show) {
        if (!loader) {
            container.insertAdjacentHTML('beforeend', `
                <div class="chart-loader">
                    <div class="spinner"></div>
                    <small>Loading data...</small>
                </div>
            `);
        }
    } else {
        if (loader) loader.remove();
    }
}

// --- Command Center Logic ---
window.loadDashboardStats = async function() {
    toggleLoader('dashboard-section', true);
    
    // 1. Fetch all data IN PARALLEL (much faster than sequential awaits)
    const [paymentsRes, clientsRes] = await Promise.all([
        supabaseClient.from('payments').select('*'),
        supabaseClient.from('clients').select('*')
    ]);

    const payments = paymentsRes.data || [];
    const clients = clientsRes.data || [];

    // Build a lookup: client_id → created_at date for chart grouping
    const clientDateMap = {};
    clients.forEach(c => { if (c.id) clientDateMap[c.id] = c.created_at; });

    // Enrich payments with client's registration date (used for trend chart)
    const enrichedPayments = payments.map(p => ({
        ...p,
        created_at: p.created_at || clientDateMap[p.client_id] || null
    }));
    _cachedPayments = enrichedPayments; // Cache for filter re-renders

    // 2. Calculate Totals
    let totalRevenue = 0;
    let totalProjected = 0;
    payments?.forEach(p => {
        totalRevenue += parseFloat(p.amount_paid || 0);
        totalProjected += (parseFloat(p.total_amount_due || 0) - parseFloat(p.amount_paid || 0));
    });

    // 3. New Clients this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const newClientsMonth = clients?.filter(c => new Date(c.created_at) >= startOfMonth).length || 0;

    // 4. Visa Success Rate Calculation
    const completed = clients?.filter(c => c.status === 'Completed').length || 0;
    const processing = clients?.filter(c => c.status === 'Visa Processing').length || 0;
    const successRate = completed + processing > 0 
        ? Math.round((completed / (completed + (processing * 0.1))) * 100)
        : 98;
    const successEl = document.getElementById('stat-success-rate');
    if (successEl) successEl.innerText = `${successRate}%`;

    // 5. Average Charge & Collection Rate
    const totalDue = payments?.reduce((sum, p) => sum + parseFloat(p.total_amount_due || 0), 0) || 0;
    const uniqueClientIds = new Set(payments?.map(p => p.client_id).filter(Boolean));
    const avgCharge = uniqueClientIds.size > 0 ? Math.round(totalDue / uniqueClientIds.size) : 0;
    const collectionRate = totalDue > 0 ? Math.round((totalRevenue / totalDue) * 100) : 0;
    animateValue("stat-avg-charge", 0, avgCharge, 1200, "KES ");
    const collEl = document.getElementById('stat-collection-rate');
    if (collEl) collEl.innerText = `${collectionRate}%`;

    // 6. Update UI with Animations
    animateValue("stat-revenue", 0, totalRevenue, 1500, "KES ");
    animateValue("stat-projected", 0, totalProjected, 1500, "KES ");
    animateValue("stat-new-clients", 0, newClientsMonth, 1000);
    
    // 7. Render Charts (all at once)
    renderRevenueTrendChart('monthly'); // Default view
    renderFinanceCharts(payments || []);
    renderPipelineChart(clients || []);
    renderDestinationHeatmap(clients || []);
    
    // 8. Global Activity
    if (window.renderGlobalActivityFeed) renderGlobalActivityFeed();

    toggleLoader('dashboard-section', false);
};

function animateValue(id, start, end, duration, prefix = "") {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * (end - start) + start);
        obj.innerHTML = prefix + current.toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// --- Filterable Revenue Trend Chart ---
let _cachedPayments = [];

function groupPaymentsByPeriod(payments, period) {
    const grouped = {};
    payments.forEach(p => {
        if (!p.created_at || !p.amount_paid) return;
        const d = new Date(p.created_at);
        let key;
        if (period === 'monthly') {
            key = d.toLocaleString('en-US', { month: 'short', year: '2-digit' }); // e.g. "Jan 25"
        } else if (period === 'quarterly') {
            const q = Math.floor(d.getMonth() / 3) + 1;
            key = `Q${q} ${d.getFullYear()}`;
        } else { // yearly
            key = `${d.getFullYear()}`;
        }
        grouped[key] = (grouped[key] || 0) + parseFloat(p.amount_paid || 0);
    });
    // Sort chronologically
    // Sort chronologically based on the period format
    const entries = Object.entries(grouped).sort((a, b) => {
        if (period === 'yearly') {
            return parseInt(a[0]) - parseInt(b[0]);
        } else if (period === 'quarterly') {
            const [qA, yA] = a[0].split(' ');
            const [qB, yB] = b[0].split(' ');
            return yA !== yB ? parseInt(yA) - parseInt(yB) : parseInt(qA.replace('Q','')) - parseInt(qB.replace('Q',''));
        } else {
            return new Date(a[0]) - new Date(b[0]); // "Jan 26" is parseable by new Date() 
        }
    });

    return { labels: entries.map(e => e[0]), data: entries.map(e => e[1]) };
}

function renderRevenueTrendChart(period = 'monthly') {
    const { labels, data } = groupPaymentsByPeriod(_cachedPayments, period);
    const ctx = document.getElementById('revenueTrendChart')?.getContext('2d');
    if (!ctx) return;

    if (window.myRevenueTrendChart instanceof Chart) window.myRevenueTrendChart.destroy();
    window.myRevenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length ? labels : ['No data'],
            datasets: [{
                label: 'Revenue (KES)',
                data: data.length ? data : [0],
                borderColor: '#1a237e',
                backgroundColor: 'rgba(26, 35, 126, 0.08)',
                borderWidth: 2.5,
                pointBackgroundColor: '#1a237e',
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `KES ${ctx.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: v => 'KES ' + v.toLocaleString(),
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    },
                    grid: { color: '#f1f5f9' }
                },
                x: {
                    ticks: { font: { family: 'Plus Jakarta Sans', size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}

window.updateRevenueTrend = function(period, btn) {
    // Toggle active button
    document.querySelectorAll('.chart-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderRevenueTrendChart(period);
};

function renderPipelineChart(clients) {
    const ctx = document.getElementById('pipelineFunnelChart')?.getContext('2d');
    if (!ctx) return;

    // Count clients per status
    const stages = { 'new': 0, 'Documentation': 0, 'Processing': 0, 'Completed': 0 };
    clients.forEach(c => {
        if (c.status === 'Completed') stages['Completed']++;
        else if (c.status === 'Processing' || c.status === 'Visa Status') stages['Processing']++;
        else if (c.status === 'Documentation' || c.status === 'Preview Submission') stages['Documentation']++;
        else stages['new']++; 
    });

    if (window.myPipelineChart instanceof Chart) window.myPipelineChart.destroy();
    
    // Create a modern radar chart for the pipeline stages
    window.myPipelineChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['New Leads', 'Documentation', 'Processing', 'Completed'],
            datasets: [{
                label: 'Clients',
                data: [stages['new'], stages['Documentation'], stages['Processing'], stages['Completed']],
                backgroundColor: 'rgba(57, 73, 171, 0.2)',
                borderColor: '#3949ab',
                pointBackgroundColor: '#1a237e',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#1a237e',
                fill: true,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    angleLines: { color: '#f1f5f9' },
                    grid: { color: '#f1f5f9' },
                    pointLabels: {
                        font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
                        color: '#64748b'
                    },
                    ticks: { display: false }
                }
            }
        }
    });
}

function renderDestinationHeatmap(clients) {
    const ctx = document.getElementById('destinationHeatmapChart')?.getContext('2d');
    if (!ctx) return;

    const counts = {};
    clients.forEach(c => {
        const dest = c.destination_country || 'Unknown';
        counts[dest] = (counts[dest] || 0) + 1;
    });
    
    // Sort by count descending
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);

    if (window.myHeatmapChart instanceof Chart) window.myHeatmapChart.destroy();
    
    // Dynamic color generation (cycling through a premium palette)
    const basePalette = ['#1a237e', '#0288d1', '#2e7d32', '#f57c00', '#c62828', '#673ab7', '#009688', '#ffc107', '#ff5722', '#795548'];
    const backgroundColors = sorted.map((_, i) => basePalette[i % basePalette.length]);

    window.myHeatmapChart = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: sorted.map(s => s[0]),
            datasets: [{
                data: sorted.map(s => s[1]),
                backgroundColor: backgroundColors
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 10,
                        font: { size: 11, family: 'Plus Jakarta Sans' }
                    }
                } 
            }
        }
    });
}

function renderFinanceCharts(payments) {
    const ctx = document.getElementById('financeGrowthChart')?.getContext('2d');
    if (!ctx) return;

    const dataPoints = payments.slice(-12).map(p => parseFloat(p.amount_paid));
    const labels = dataPoints.map((_, i) => `Client ${i + 1}`);

    // Create a vertical gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(57, 73, 171, 0.35)');
    gradient.addColorStop(1, 'rgba(57, 73, 171, 0.01)');

    if (window.myFinanceChart instanceof Chart) window.myFinanceChart.destroy();
    window.myFinanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data: dataPoints,
                borderColor: '#3949ab',
                backgroundColor: gradient,
                fill: true,
                tension: 0.45,
                borderWidth: 2.5,
                pointRadius: 5,
                pointBackgroundColor: '#1a237e',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1200, easing: 'easeInOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` KES ${ctx.raw?.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9', borderDash: [4, 4] }, ticks: { callback: v => 'KES ' + v.toLocaleString(), font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } }
            }
        }
    });
}

// --- Expense Dashboard Logic ---
window.loadExpenseDashboard = async function() {
    toggleLoader('expenses-section', true);
    const { data: expenses, error } = await supabaseClient.from('expenses').select('*').order('created_at', { ascending: false });
    const { data: payments } = await supabaseClient.from('payments').select('amount_paid');

    if (error) return;

    let totalExpenses = 0;
    expenses.forEach(e => totalExpenses += parseFloat(e.amount));
    
    let totalRevenue = 0;
    payments?.forEach(p => totalRevenue += parseFloat(p.amount_paid));

    document.getElementById('stat-total-expenses').innerText = `KES ${totalExpenses.toLocaleString()}`;
    const netProfit = totalRevenue - totalExpenses;
    const profitEl = document.getElementById('stat-net-profit');
    profitEl.innerText = `KES ${netProfit.toLocaleString()}`;
    profitEl.style.color = netProfit >= 0 ? '#27ae60' : '#e74c3c';

    renderExpenseCharts(expenses, totalRevenue, totalExpenses);
    populateExpensesTable(expenses);
    toggleLoader('expenses-section', false);
};

function renderExpenseChartsToCanvas(targetCtx, expenses, totalRevenue, totalExpenses) {
    const netProfit = Math.max(0, totalRevenue - totalExpenses);
    const maxVal = Math.max(totalRevenue, totalExpenses, netProfit, 1);
    const makeRing = (value) => [value, maxVal - value];

    if (targetCtx.canvas.chartInstance instanceof Chart) targetCtx.canvas.chartInstance.destroy();
    targetCtx.canvas.chartInstance = new Chart(targetCtx, {
        type: 'doughnut',
        data: {
            labels: ['Income', 'Loss', 'Profit'],
            datasets: [
                {
                    label: 'Income',
                    data: makeRing(totalRevenue),
                    backgroundColor: ['#43a047', '#f0f0f0'],
                    borderWidth: 0,
                    hoverOffset: 6
                },
                {
                    label: 'Loss',
                    data: makeRing(totalExpenses),
                    backgroundColor: ['#e91e63', '#f0f0f0'],
                    borderWidth: 0,
                    hoverOffset: 6
                },
                {
                    label: 'Profit',
                    data: makeRing(netProfit),
                    backgroundColor: ['#03a9f4', '#f0f0f0'],
                    borderWidth: 0,
                    hoverOffset: 6
                }
            ]
        },
        options: {
            cutout: '30%',
            responsive: true,
            maintainAspectRatio: false,
            animation: { animateRotate: true, duration: 1200, easing: 'easeInOutExpo' },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 16,
                        font: { size: 11, weight: '600' },
                        generateLabels: (chart) => chart.data.datasets.map((ds, i) => ({
                            text: ds.label,
                            fillStyle: ds.backgroundColor[0],
                            strokeStyle: ds.backgroundColor[0],
                            pointStyle: 'circle',
                            datasetIndex: i
                        }))
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => items[0]?.dataset?.label || '',
                        label: (ctx) => ctx.dataIndex === 1 ? null : ` KES ${ctx.raw?.toLocaleString()}`
                    }
                }
            }
        }
    });
}

function renderExpenseCharts(expenses, totalRevenue = 0, totalExpenses = 0) {
    // 1. Multi-Ring Concentric Doughnut (Income / Expenses / Profit)
    const catCtx = document.getElementById('expenseCategoryChart')?.getContext('2d');
    if (catCtx) {
        renderExpenseChartsToCanvas(catCtx, expenses, totalRevenue, totalExpenses);
    }

    // 2. Sleek Horizontal Bar with Color-coded per category
    const trendCtx = document.getElementById('expenseTrendChart')?.getContext('2d');
    if (trendCtx) {
        const recent = expenses.slice(0, 7).reverse();
        const colors = ['#1a237e', '#3949ab', '#e53935', '#fbc02d', '#43a047', '#7b1fa2', '#0288d1'];
        if (window.myExpenseTrendChart instanceof Chart) window.myExpenseTrendChart.destroy();
        window.myExpenseTrendChart = new Chart(trendCtx, {
            type: 'bar',
            data: {
                labels: recent.map(e => e.category),
                datasets: [{
                    label: 'Amount (KES)',
                    data: recent.map(e => parseFloat(e.amount)),
                    backgroundColor: colors.slice(0, recent.length),
                    borderRadius: 8,
                    borderSkipped: false,
                    barThickness: 18
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 1000, easing: 'easeOutBounce' },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` KES ${ctx.raw?.toLocaleString()}` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { callback: v => 'KES ' + v.toLocaleString(), font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } }
                }
            }
        });
    }
}

function populateExpensesTable(expenses) {
    const tbody = document.getElementById('expensesTableBody');
    tbody.innerHTML = expenses.map(e => `
        <tr>
            <td><strong>${e.category}</strong></td>
            <td>${e.description}</td>
            <td style="color: #c62828; font-weight: bold;">KES ${parseFloat(e.amount).toLocaleString()}</td>
            <td>${new Date(e.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// Modal Handlers
window.showExpenseForm = () => document.getElementById('expense-modal').style.display = 'flex';
window.closeExpenseModal = () => document.getElementById('expense-modal').style.display = 'none';

// Submission Updated to use Modal
document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('exp-category').value;
    const amount = document.getElementById('exp-amount').value;
    const desc = document.getElementById('exp-desc').value;

    const { error } = await supabaseClient.from('expenses').insert([{ category, amount, description: desc }]);

    if (!error) {
        alert("Expense recorded!");
        closeExpenseModal();
        document.getElementById('expense-form').reset();
        loadExpenseDashboard();
    } else {
        alert("Error: " + error.message);
    }
});

// Generate Receipt for Payment
window.generateReceipt = function(clientName, amount, balance) {
    const receiptWindow = window.open('', '_blank');
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const receiptNo = 'REC-' + Math.floor(100000 + Math.random() * 900000);

    receiptWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Receipt ${receiptNo} - Shallebs Agency</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                :root {
                    --primary: #1a237e;
                    --secondary: #3949ab;
                    --text: #1e293b;
                    --text-light: #64748b;
                    --border: #e2e8f0;
                    --bg-light: #f8fafc;
                }

                * { box-sizing: border-box; margin: 0; padding: 0; }
                
                body {
                    font-family: 'Inter', sans-serif;
                    background-color: #f1f5f9;
                    color: var(--text);
                    line-height: 1.5;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                .a4-container {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 20mm;
                    margin: 20px auto;
                    background: white;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                    position: relative;
                }

                .header {
                    display: flex;
                    justify-content: flex-end;
                    border-bottom: 2px solid #add8e6;
                    padding-bottom: 15px;
                    margin-bottom: 30px;
                }



                .agency-info {
                    flex-grow: 1;
                    margin-left: 25px;
                }

                .agency-info h1 {
                    color: var(--primary);
                    font-size: 22px;
                    font-weight: 800;
                    margin-bottom: 4px;
                    letter-spacing: -0.5px;
                }

                .agency-details {
                    color: var(--text-light);
                    font-size: 12px;
                    line-height: 1.5;
                }

                .receipt-meta {
                    text-align: right;
                }

                .receipt-meta h2 {
                    font-size: 28px;
                    color: var(--text);
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    margin-bottom: 10px;
                }

                .meta-table {
                    margin-left: auto;
                    border-collapse: collapse;
                }

                .meta-table th {
                    text-align: right;
                    padding: 2px 10px 2px 0;
                    color: var(--text-light);
                    font-size: 13px;
                    font-weight: 500;
                }

                .meta-table td {
                    text-align: right;
                    font-size: 13px;
                    font-weight: 600;
                }

                .client-section {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    background: var(--bg-light);
                    padding: 25px;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                }

                .client-info h3 {
                    font-size: 12px;
                    color: var(--text-light);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 8px;
                }

                .client-info p {
                    font-size: 17px;
                    font-weight: 700;
                    color: var(--primary);
                }

                .table-container {
                    margin-bottom: 40px;
                }

                .invoice-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .invoice-table th {
                    background: var(--primary);
                    color: white;
                    padding: 14px;
                    text-align: left;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .invoice-table th:last-child {
                    text-align: right;
                }

                .invoice-table td {
                    padding: 18px 14px;
                    border-bottom: 1px solid var(--border);
                    font-size: 14px;
                }

                .invoice-table td:last-child {
                    text-align: right;
                    font-weight: 600;
                }

                .totals-section {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 50px;
                }

                .totals-table {
                    width: 320px;
                    border-collapse: collapse;
                }

                .totals-table td {
                    padding: 10px 14px;
                    font-size: 14px;
                }

                .totals-table td:nth-child(1) {
                    color: var(--text-light);
                    font-weight: 500;
                }

                .totals-table td:nth-child(2) {
                    text-align: right;
                    font-weight: 700;
                }

                .totals-table tr.total-row td {
                    border-top: 2px solid var(--primary);
                    font-size: 17px;
                    color: var(--primary);
                    padding-top: 18px;
                }

                .footer {
                    position: absolute;
                    bottom: 20mm;
                    left: 20mm;
                    right: 20mm;
                    border-top: 1px solid var(--border);
                    padding-top: 20px;
                    text-align: center;
                    font-size: 11px;
                    color: var(--text-light);
                }

                .footer p { margin-bottom: 4px; }
                .footer strong { color: var(--text); }

                .print-btn {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    background: var(--primary);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 50px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(26,35,126,0.3);
                    transition: transform 0.2s;
                    font-family: inherit;
                    z-index: 1000;
                }

                .print-btn:hover { transform: translateY(-2px); }

                @media print {
                    body { background: white; margin: 0; padding: 0; }
                    .a4-container { box-shadow: none; margin: 0; padding: 0; width: 100%; min-height: auto; }
                    .print-btn { display: none !important; }
                    .footer { position: fixed; bottom: 0; }
                    @page { size: A4; margin: 20mm; }
                }
            </style>
        </head>
        <body>
            <button class="print-btn" onclick="window.print()">🖨️ Print Receipt</button>
            
            <div class="a4-container">
                <div class="header">
                    <div class="agency-info">
                        <h1>
                            <span style="color: #add8e6;">SHALLEBS</span> 
                            <span style="color: #fb8c00; opacity: 0.6;">TRAVEL AGENCY</span>
                        </h1>
                        <div class="agency-details">
                            <p>HAZINA TOWERS 16<sup>TH</sup> FLOOR</p>
                            <p>TELL: 0722 418 493</p>
                            <p>info@shallebstravelagency.co.ke</p>
                        </div>
                    </div>
                    <div class="receipt-meta">
                        <h2>Receipt</h2>
                        <table class="meta-table">
                            <tr>
                                <th>No:</th>
                                <td>${receiptNo}</td>
                            </tr>
                            <tr>
                                <th>Date:</th>
                                <td>${today}</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div class="client-section">
                    <div class="client-info">
                        <h3>Received From</h3>
                        <p>${clientName}</p>
                    </div>
                    <div class="client-info" style="text-align: right;">
                        <h3>Payment Method</h3>
                        <p style="color: var(--text); font-size: 14px; font-weight: 500;">Cash / Bank Transfer</p>
                    </div>
                </div>

                <div class="table-container">
                    <table class="invoice-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <strong>Consultation & Agency Services</strong><br>
                                    <span style="color: var(--text-light); font-size: 12px; margin-top: 4px; display: inline-block;">Payment towards travel facilitation, visa processing, and agency handling fees.</span>
                                </td>
                                <td>KES ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="totals-section">
                    <table class="totals-table">
                        <tr>
                            <td>Amount Received:</td>
                            <td>KES ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr class="total-row">
                            <td>Outstanding Balance:</td>
                            <td>KES ${parseFloat(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    </table>
                </div>

                <div class="footer">
                    <p><strong>Thank you for choosing Shallebs Travel Agency!</strong></p>
                    <p>This is a computer-generated receipt and signature is not required.</p>
                    <p style="margin-top: 8px; font-size: 10px;">If you have any questions regarding this receipt, please contact us at info@shallebstravelagency.co.ke</p>
                </div>
            </div>
        </body>
        </html>
    `);
    receiptWindow.document.close();
};

// --- Premium Finance Dashboard Logic ---
window.loadFinanceDashboard = async function() {
    // 1. Fetch Data
    const [paymentsRes, expensesRes, clientsRes] = await Promise.all([
        supabaseClient.from('payments').select('*'),
        supabaseClient.from('expenses').select('*'),
        supabaseClient.from('clients').select('id, full_name, created_at')
    ]);

    const payments = paymentsRes.data || [];
    const expenses = expensesRes.data || [];
    const clients = clientsRes.data || [];

    // 2. Calculate Stat Cards
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalProjected = 0;

    payments.forEach(p => {
        totalRevenue += parseFloat(p.amount_paid || 0);
        totalProjected += parseFloat(p.total_amount_due || 0);
    });

    expenses.forEach(e => {
        totalExpenses += parseFloat(e.amount || 0);
    });

    const netProfit = totalRevenue - totalExpenses;
    const outstanding = totalProjected - totalRevenue;

    const elRev = document.getElementById('finance-page-revenue');
    if (elRev) elRev.innerText = `KES ${totalRevenue.toLocaleString()}`;
    const elExp = document.getElementById('finance-page-expenses');
    if (elExp) elExp.innerText = `KES ${totalExpenses.toLocaleString()}`;
    const elPro = document.getElementById('finance-page-profit');
    if (elPro) elPro.innerText = `KES ${netProfit.toLocaleString()}`;
    const elOut = document.getElementById('finance-page-outstanding');
    if (elOut) elOut.innerText = `KES ${outstanding.toLocaleString()}`;

    // 3. Render Cashflow Chart (Line Chart over months)
    renderCashflowChart(payments, expenses, clients);

    // 4. Render Expense Doughnut Chart using the updated multi-ring design
    const financeExpenseCtx = document.getElementById('financeExpenseDoughnut')?.getContext('2d');
    if (financeExpenseCtx) {
        // Redraw the multi-ring doughnut onto the Finance page canvas
        renderExpenseChartsToCanvas(financeExpenseCtx, expenses, totalRevenue, totalExpenses);
    }

    // 5. Populate Transactions Table
    populateRecentFinanceTransactions(payments, clients);
};

function renderCashflowChart(payments, expenses, clients) {
    const ctx = document.getElementById('financeCashflowChart')?.getContext('2d');
    if (!ctx) return;

    const months = [];
    const revenueData = [];
    const expenseData = [];

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toLocaleString('default', { month: 'short' }));
        revenueData.push(0);
        expenseData.push(0);
    }

    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c.created_at);

    payments.forEach(p => {
        const dateRaw = clientMap[p.client_id] || p.created_at;
        if (!dateRaw || !p.amount_paid) return;
        const d = new Date(dateRaw);
        
        const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        if (monthDiff >= 0 && monthDiff <= 5) {
            revenueData[5 - monthDiff] += parseFloat(p.amount_paid);
        }
    });

    expenses.forEach(e => {
        if (!e.created_at || !e.amount) return;
        const d = new Date(e.created_at);
        const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        if (monthDiff >= 0 && monthDiff <= 5) {
            expenseData[5 - monthDiff] += parseFloat(e.amount);
        }
    });

    if (window.cashflowChart instanceof Chart) window.cashflowChart.destroy();
    window.cashflowChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Income',
                    data: revenueData,
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Expense',
                    data: expenseData,
                    borderColor: '#f44336',
                    backgroundColor: 'rgba(244, 67, 54, 0.05)',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', align: 'end' } },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#f1f5f9' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderPremiumExpenseDoughnut(expenses) {
    const ctx = document.getElementById('financeExpenseDoughnut')?.getContext('2d');
    if (!ctx) return;

    const catData = {};
    expenses.forEach(e => {
        catData[e.category] = (catData[e.category] || 0) + parseFloat(e.amount);
    });

    if (window.premiumExpenseDoughnut instanceof Chart) window.premiumExpenseDoughnut.destroy();
    
    if (Object.keys(catData).length === 0) {
        window.premiumExpenseDoughnut = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['No Expenses'], datasets: [{ data: [1], backgroundColor: ['#f1f5f9'] }] },
            options: { cutout: '80%', plugins: { legend: { position: 'right' } } }
        });
        return;
    }

    const colors = ['#1a237e', '#4caf50', '#ff9800', '#f44336', '#03a9f4'];
    window.premiumExpenseDoughnut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catData),
            datasets: [{
                data: Object.values(catData),
                backgroundColor: colors.slice(0, Object.keys(catData).length),
                borderWidth: 0,
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '80%', 
            plugins: {
                legend: { position: 'right', labels: { usePointStyle: true, padding: 20 } }
            }
        }
    });
}

function populateRecentFinanceTransactions(payments, clients) {
    const tbody = document.getElementById('finance-recent-transactions');
    if (!tbody) return;

    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c.full_name);

    const validPayments = payments.filter(p => parseFloat(p.amount_paid) > 0);
    
    tbody.innerHTML = validPayments.slice(0, 5).map(p => {
        const clientName = clientMap[p.client_id] || 'Unknown Client';
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        return `
            <tr>
                <td><strong>${clientName}</strong></td>
                <td><small style="color:#94a3b8;"><i class="fas fa-calendar-alt"></i> ${dateStr}</small></td>
                <td style="color: #4caf50; font-weight: bold;">+ KES ${parseFloat(p.amount_paid).toLocaleString()}</td>
                <td><span style="background: #e8f5e9; color: #4caf50; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Completed</span></td>
            </tr>
        `;
    }).join('');
    
    if (validPayments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 30px;">No recent transactions found.</td></tr>`;
    }
}

// --- Global Transaction Logger Logic ---
window.loadAllTransactions = async function() {
    const [paymentsRes, clientsRes] = await Promise.all([
        supabaseClient.from('payments').select('*'),
        supabaseClient.from('clients').select('id, full_name, created_at')
    ]);

    const payments = paymentsRes.data || [];
    const clients = clientsRes.data || [];

    // Filter to only payments > 0
    const allTransactions = payments.filter(p => parseFloat(p.amount_paid) > 0);

    // Sort newest first
    allTransactions.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    window._allTransactions = allTransactions; // Cache for searching
    window._allClients = clients;

    populateAllTransactionsTable(allTransactions);
};

function populateAllTransactionsTable(transactions) {
    const tbody = document.getElementById('all-transactions-body');
    if (!tbody) return;

    const clients = window._allClients || [];
    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c.full_name);

    tbody.innerHTML = transactions.map(p => {
        const clientName = clientMap[p.client_id] || 'Unknown Client';
        const dateRaw = p.created_at || clientMap[p.client_id]?.created_at;
        const dateStr = dateRaw ? new Date(dateRaw).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown Date';
        const amount = parseFloat(p.amount_paid);
        const balance = Math.max(0, parseFloat(p.total_amount_due) - amount);
        
        return `
            <tr class="transaction-row">
                <td class="tx-client-name"><strong>${clientName}</strong></td>
                <td><small style="color:#94a3b8;"><i class="fas fa-calendar-alt"></i> ${dateStr}</small></td>
                <td style="color: #4caf50; font-weight: bold;">+ KES ${amount.toLocaleString()}</td>
                <td>
                    <span style="background: #e8f5e9; color: #4caf50; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; margin-right: 10px;">Logged</span>
                    <button onclick="generateReceipt('${clientName.replace(/'/g, "\\'")}', ${amount}, ${balance})" class="btn-text" style="font-size: 0.8rem;"><i class="fas fa-file-invoice"></i> Receipt</button>
                </td>
            </tr>
        `;
    }).join('');
    
    if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 40px;">No transactions found in the system.</td></tr>`;
    }
}

window.filterTransactions = function() {
    const query = document.getElementById('transactionSearch')?.value.toLowerCase() || '';
    const tableRows = document.querySelectorAll('.transaction-row');

    tableRows.forEach(row => {
        const nameCell = row.querySelector('.tx-client-name');
        if (!nameCell) return;

        const name = nameCell.innerText.toLowerCase();
        
        if (name.includes(query)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
};

// ========================================
//  EXPORT FUNCTIONS
// ========================================

// --- Finance Summary: PDF (print-to-PDF) ---
window.exportFinancePDF = function() {
    const revenue = document.getElementById('finance-page-revenue')?.innerText || 'N/A';
    const expenses = document.getElementById('finance-page-expenses')?.innerText || 'N/A';
    const profit = document.getElementById('finance-page-profit')?.innerText || 'N/A';
    const outstanding = document.getElementById('finance-page-outstanding')?.innerText || 'N/A';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const win = window.open('', '_blank');
    win.document.write(`
        <html>
        <head>
            <title>Finance Report – Shallebs Agency</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; }
                h1 { color: #1a237e; margin-bottom: 4px; }
                .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 30px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .card { background: #f8fafc; border-radius: 12px; padding: 20px 24px; border-left: 4px solid #1a237e; }
                .card.green { border-left-color: #4caf50; }
                .card.red { border-left-color: #f44336; }
                .card.orange { border-left-color: #ff9800; }
                .label { font-size: 0.85rem; color: #64748b; margin-bottom: 8px; }
                .value { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
                .footer { margin-top: 40px; font-size: 0.75rem; color: #94a3b8; text-align: center; }
                @media print { button { display: none; } }
            </style>
        </head>
        <body>
            <h1>Finance Overview Report</h1>
            <p class="meta">Shallebs Agency · Generated on ${today}</p>
            <div class="grid">
                <div class="card green"><div class="label">Total Revenue</div><div class="value">${revenue}</div></div>
                <div class="card red"><div class="label">Total Expenses</div><div class="value">${expenses}</div></div>
                <div class="card"><div class="label">Net Profit</div><div class="value">${profit}</div></div>
                <div class="card orange"><div class="label">Outstanding Balance</div><div class="value">${outstanding}</div></div>
            </div>
            <div class="footer">Shallebs Travel & Agency — Confidential Financial Summary</div>
            <br>
            <button onclick="window.print()" style="padding:10px 20px;background:#1a237e;color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">🖨️ Print / Save as PDF</button>
        </body>
        </html>
    `);
    win.document.close();
};

// --- Finance Summary: Excel (SheetJS) ---
window.exportFinanceExcel = function() {
    const revenue = document.getElementById('finance-page-revenue')?.innerText || '';
    const expenses = document.getElementById('finance-page-expenses')?.innerText || '';
    const profit = document.getElementById('finance-page-profit')?.innerText || '';
    const outstanding = document.getElementById('finance-page-outstanding')?.innerText || '';

    if (typeof XLSX === 'undefined') return alert('Export library not loaded yet. Please try again in a moment.');

    const wb = XLSX.utils.book_new();
    const wsData = [
        ['Metric', 'Value'],
        ['Total Revenue', revenue],
        ['Total Expenses', expenses],
        ['Net Profit', profit],
        ['Outstanding Balance', outstanding],
        [],
        ['Generated', new Date().toLocaleString()]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Finance Summary');
    XLSX.writeFile(wb, `Shallebs_Finance_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// --- Transactions: CSV ---
window.exportTransactionsCSV = function() {
    const transactions = window._allTransactions || [];
    const clients = window._allClients || [];
    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c.full_name);

    const rows = [['Client Name', 'Payment Date', 'Amount Paid (KES)']];
    transactions.forEach(p => {
        const name = clientMap[p.client_id] || 'Unknown';
        const date = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Unknown';
        const amount = parseFloat(p.amount_paid).toFixed(2);
        rows.push([name, date, amount]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Shallebs_Transactions_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// --- Transactions: Excel (SheetJS) ---
window.exportTransactionsExcel = function() {
    const transactions = window._allTransactions || [];
    const clients = window._allClients || [];
    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c.full_name);

    if (typeof XLSX === 'undefined') return alert('Export library not loaded yet. Please try again in a moment.');

    const rows = [['Client Name', 'Payment Date', 'Amount Paid (KES)']];
    transactions.forEach(p => {
        const name = clientMap[p.client_id] || 'Unknown';
        const date = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Unknown';
        const amount = parseFloat(p.amount_paid);
        rows.push([name, date, amount]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, `Shallebs_Transactions_${new Date().toISOString().slice(0,10)}.xlsx`);
};