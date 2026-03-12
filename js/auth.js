// Initialize Supabase
const supabaseUrl = 'https://snncykqrgpknfnbtpfgk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNubmN5a3FyZ3BrbmZuYnRwZmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzA5NjcsImV4cCI6MjA4ODc0Njk2N30.HH0tyZ9lvOxRqrkzGetJnbywybkDkLHMn7ZLkwVU-wE';

// Correct initialization (Supabase CDN exposes a global `supabase` function)
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
// optionally expose globally if other scripts need it
window.supabase = supabaseClient;

// Handle the client registration form submission
const clientForm = document.getElementById('client-form');
if (clientForm) {
    let isSubmitting = false; // Submission lock

    clientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (isSubmitting) return; // Prevent double submission
        
        const submitBtn = clientForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        
        try {
            isSubmitting = true;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
            
            console.log('Submitting new client...');

            const full_name = document.getElementById('full_name').value;
            const phone_number = document.getElementById('phone_number').value;
            const passport_number = document.getElementById('passport_number').value;
            const registration_date = document.getElementById('registration_date').value;
            const gender = document.getElementById('gender').value;
            const destination_country = document.getElementById('destination').value;

            // the clients table uses a column named destination_country (and has a status field)
            // Added .select() to ensure data is returned for activity logging
            const { data, error } = await supabaseClient
                .from('clients')
                .insert([{ full_name, phone_number, passport_number, registration_date, gender, destination_country, status: 'new' }])
                .select();

            if (error) {
                console.error('Error saving client:', error);
                
                // Handle common 409 Conflict / Unique Constraint Violation
                if (error.code === '23505') {
                    alert(`Conflict: A client with this Passport Number or Phone Number already exists in the database.`);
                } else {
                    alert(`Failed to save client: ${error.message || 'Unknown error'}`);
                }
                return;
            }

            alert('Client saved successfully!');
            
            // Log the activity
            if (data && data.length > 0) {
                const newClientId = data[0].id;
                logActivity(newClientId, 'Client Created', `New client ${full_name} registered`);
            }
            
            // clear form
            clientForm.reset();
            // optionally go to database view
            showSection('database-section');
            
        } catch (err) {
            console.error('Unexpected error during registration:', err);
            alert('An unexpected error occurred. Please check your connection and try again.');
        } finally {
            isSubmitting = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
}

// Navigation Function - Attached to 'window' so HTML can find it
window.showSection = function(sectionId) {
    console.log("Switching to section:", sectionId);

    // 1. Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });

    // 2. Show the targeted section
    const target = document.getElementById(sectionId);
    if (target) {
        target.style.display = 'block';
    }

    // 3. Update Sidebar Active Class
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.remove('active');
        const onclick = li.getAttribute('onclick');
        if (onclick) {
            // Highlight current section
            if (onclick.includes(sectionId)) {
                li.classList.add('active');
            }
            // Also highlight Finance if we are in Transactions
            if (sectionId === 'transactions-section' && onclick.includes('finance-section')) {
                li.classList.add('active');
            }
        }
    });

    // Load tasks when tasks-section is shown
    if (sectionId === 'tasks-section') {
        if (typeof window.loadAllTasks === 'function') {
            window.loadAllTasks();
        }
    } else if (sectionId === 'dashboard-section') {
        if (typeof window.loadDashboardStats === 'function') {
            window.loadDashboardStats();
        }
        if (typeof window.loadFinanceDashboard === 'function') {
            window.loadFinanceDashboard();
        }
    } else if (sectionId === 'expenses-section') {
        loadExpenseDashboard();
    } else if (sectionId === 'transactions-section') {
        if (typeof window.loadAllTransactions === 'function') {
            window.loadAllTransactions();
        }
    }
};

// 1. Handle Login Submission
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        errorMsg.innerText = error.message;
        errorMsg.style.display = 'block';
    } else {
        // Success! Redirect to dashboard
        window.location.href = 'index.html';
    }
});

// Password Visibility Toggle
document.getElementById('toggle-password')?.addEventListener('click', function() {
    const passwordInput = document.getElementById('login-password');
    const eyeIcon = document.getElementById('eye-icon');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    }
});

// 2. Security Check & Profile Load (Run this on index.html)
async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    const currentPath = window.location.pathname;
    const isDashboard = currentPath.includes('index.html') || currentPath === '/' || currentPath.endsWith('/shallebs-agency/');
    const isLoginPage = currentPath.includes('login.html');

    if (!user && isDashboard) {
        window.location.href = 'login.html';
    } else if (user && isLoginPage) {
        window.location.href = 'index.html';
    } else if (user && isDashboard) {
        // Load User Profile Data
        loadUserProfile(user);
        // Reveal the body now that auth is confirmed
        document.body.style.display = 'block';
    }
}

// --- Admin Profile Logic ---

function loadUserProfile(user) {
    const nameStr = user.user_metadata?.full_name || 'Admin';
    const avatarUrl = user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(nameStr)}&background=1a237e&color=fff&size=120`;

    // Update Header
    const headerName = document.getElementById('header-admin-name');
    const headerAvatar = document.getElementById('header-avatar');
    if (headerName) headerName.innerText = nameStr;
    if (headerAvatar) headerAvatar.src = avatarUrl;
    
    // Dynamic Time-based Greeting
    const hour = new Date().getHours();
    let greeting = 'Good Evening';
    let emoji = '🌙';
    if (hour < 12) {
        greeting = 'Good Morning';
        emoji = '🌅';
    } else if (hour < 18) {
        greeting = 'Good Afternoon';
        emoji = '☀️';
    }

    const firstName = nameStr.split(' ')[0];
    const greetingEl = document.getElementById('dashboard-greeting');
    if (greetingEl) {
        greetingEl.innerHTML = `${greeting}, ${firstName} <span style="font-size: 0.9em; margin-left: 6px;">${emoji}</span>`;
    }
    const subGreeting = document.getElementById('dashboard-sub-greeting');
    if (subGreeting) {
        subGreeting.innerText = `Welcome back! Here's your agency's financial overview for today.`;
    }

    const tasksGreeting = document.getElementById('tasks-greeting');
    if (tasksGreeting) {
        tasksGreeting.innerHTML = `${greeting}, ${firstName} <span style="font-size: 0.9em; margin-left: 6px;">${emoji}</span>`;
    }
    const tasksSub = document.getElementById('tasks-sub-greeting');
    if (tasksSub) {
        tasksSub.innerText = `Focus on your priorities! Here are your active follow-ups for today.`;
    }

    // Update Profile Card (Read-only labels)
    const viewName = document.getElementById('view-profile-name');
    const viewEmail = document.getElementById('view-profile-email');
    const labelPhone = document.getElementById('label-profile-phone');
    const labelPassport = document.getElementById('label-profile-passport');
    const labelId = document.getElementById('label-profile-id');
    const labelCreated = document.getElementById('label-profile-created');
    const profileAvatar = document.getElementById('profile-avatar');

    if (viewName) viewName.innerText = nameStr;
    if (viewEmail) viewEmail.innerText = user.email;
    if (profileAvatar) profileAvatar.src = avatarUrl;
    if (labelPhone) labelPhone.innerText = user.user_metadata?.phone || 'Not Set';
    if (labelPassport) labelPassport.innerText = user.user_metadata?.passport_no || 'Not Set';
    if (labelId) labelId.innerText = user.user_metadata?.id_no || 'Not Set';
    
    if (labelCreated && user.created_at) {
        const date = new Date(user.created_at);
        labelCreated.innerText = `Managing since ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    }

    // Pre-fill Edit Modal Inputs
    const profileNameInput = document.getElementById('profile-name');
    const profilePhoneInput = document.getElementById('profile-phone');
    const profilePassportInput = document.getElementById('profile-passport');
    const profileIdInput = document.getElementById('profile-id');
    
    if (profileNameInput) profileNameInput.value = nameStr;
    if (profilePhoneInput) profilePhoneInput.value = user.user_metadata?.phone || '';
    if (profilePassportInput) profilePassportInput.value = user.user_metadata?.passport_no || '';
    if (profileIdInput) profileIdInput.value = user.user_metadata?.id_no || '';
}

// --- Admin Profile Modal Controls ---
window.openAdminProfileModal = function() {
    const modal = document.getElementById('admin-profile-modal');
    if (modal) modal.style.display = 'flex';
}

window.closeAdminProfileModal = function() {
    const modal = document.getElementById('admin-profile-modal');
    if (modal) modal.style.display = 'none';
}


// Handle Profile Form Submission (Updates name, phone, passport, id)
document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('profile-name').value;
    const newPhone = document.getElementById('profile-phone').value;
    const newPassport = document.getElementById('profile-passport').value;
    const newId = document.getElementById('profile-id').value;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const { data: { user }, error } = await supabaseClient.auth.updateUser({
        data: { 
            full_name: newName,
            phone: newPhone,
            passport_no: newPassport,
            id_no: newId
        }
    });

    btn.innerHTML = originalText;
    btn.disabled = false;

    if (error) {
        alert('Error updating profile: ' + error.message);
    } else {
        alert('Profile updated successfully!');
        closeAdminProfileModal();
        if (user) loadUserProfile(user); // Refresh UI
    }
});

// Handle Avatar Upload
window.uploadAvatar = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // Show loading state
    const avatarImg = document.getElementById('profile-avatar');
    const headerAvatar = document.getElementById('header-avatar');
    const oldSrc = avatarImg.src;
    avatarImg.style.opacity = '0.5';

    try {
        // 1. Upload to Supabase Storage (bucket: 'avatars')
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}-${Math.random()}.${fileExt}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: publicUrlData } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);
            
        const avatarUrl = publicUrlData.publicUrl;

        // 3. Update Auth Metadata
        const { data: updateData, error: updateError } = await supabaseClient.auth.updateUser({
            data: { avatar_url: avatarUrl }
        });

        if (updateError) throw updateError;

        // 4. Update UI
        avatarImg.src = avatarUrl;
        headerAvatar.src = avatarUrl;
        alert('Profile picture updated successfully!');

    } catch (error) {
        console.error('Error uploading avatar:', error);
        alert('Failed to upload image. Make sure the "avatars" bucket exists and is public.');
        avatarImg.src = oldSrc; // Revert
    } finally {
        avatarImg.style.opacity = '1';
    }
};

// Run check on load globally
checkUser().then(() => {
    // Only pre-load dashboard data if we are actually on the dashboard
    const currentPath = window.location.pathname;
    const isDashboard = currentPath.includes('index.html') || currentPath === '/' || currentPath.endsWith('/shallebs-agency/');
    
    if (isDashboard) {
        // Default to Daily Tasks as requested
        window.showSection('tasks-section');
    }
});

// 3. Logout Function
window.logout = async function() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
};