window.uploadDocument = async function() {
    const fileInput = document.getElementById('file-upload-input');
    const category = document.getElementById('doc-category-select').value;
    const labelInput = document.getElementById('doc-label-input');
    const customLabel = labelInput.value.trim();
    const file = fileInput.files[0];

    if (!file || !currentClientId) return alert("Please select a file first.");

    // 1. Create a unique path for the file (e.g., client_id/timestamp_filename)
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentClientId}/${Date.now()}.${fileExt}`;

    try {
        // 2. Upload the physical file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('client-docs')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 3. Get the Public URL of the uploaded file
        const { data: urlData } = supabase.storage
            .from('client-docs')
            .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        // 4. Save the file metadata to the 'client_documents' table
        const { error: dbError } = await supabase
            .from('client_documents')
            .insert([{
                client_id: currentClientId,
                doc_category: category,
                doc_type: customLabel || file.name,
                file_url: publicUrl
            }]);

        if (dbError) throw dbError;

        alert(`Successfully uploaded to ${category} category!`);
        logActivity(currentClientId, 'Document', 'Uploaded ' + file.name + ' to ' + category);
        fetchClientDocuments(currentClientId); // Refresh the list
        fileInput.value = ''; // Clear input
        labelInput.value = ''; // Clear label

    } catch (error) {
        console.error("Upload failed:", error.message);
        alert("Upload error: " + error.message);
    }
};

// Helper to get icon based on file extension
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'fa-file-image';
    if (ext === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
    if (['xls', 'xlsx'].includes(ext)) return 'fa-file-excel';
    return 'fa-file-alt';
}

// Function to list files in the modal
window.fetchClientDocuments = async function(clientId) {
    const { data: docs, error } = await supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId);

    if (error) {
        console.error("Error fetching documents:", error);
        return;
    }

    // 1. Reset all category lists to "Empty" first and reset counts
    const categories = ['Personal', 'Family', 'Financial'];
    const counts = { Personal: 0, Family: 0, Financial: 0 };

    categories.forEach(cat => {
        const listEl = document.getElementById(`list-${cat}`);
        if (listEl) {
            listEl.innerHTML = '<div class="empty-state"><i class="fas fa-file-alt"></i><p>No documents found</p></div>';
        }
        const countEl = document.getElementById(`count-${cat}`);
        if (countEl) countEl.innerText = '0 files';
    });

    // 2. Distribute files into their respective categories
    docs.forEach(doc => {
        const targetList = document.getElementById(`list-${doc.doc_category}`);
        if (!targetList) return;
        
        counts[doc.doc_category]++;

        // Clear the empty state if this is the first document for this category
        if (targetList.querySelector('.empty-state')) {
            targetList.innerHTML = '';
        }

        const fileIcon = getFileIcon(doc.doc_type);
        const docRow = `
            <div class="doc-card-mini">
                <div class="doc-main-info">
                    <div class="doc-icon-wrapper">
                        <i class="far ${fileIcon}"></i>
                    </div>
                    <div class="doc-text-details">
                        <span class="doc-filename" title="${doc.doc_type}">${doc.doc_type}</span>
                        <span class="doc-date">${doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not available'}</span>
                    </div>
                </div>
                <div class="doc-quick-actions">
                    <a href="${doc.file_url}" target="_blank" class="action-btn view" title="View Document">
                        <i class="fas fa-eye"></i>
                    </a>
                    <button onclick="deleteDocument('${doc.id}', '${doc.file_url}')" class="action-btn delete" title="Delete Document">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
        targetList.insertAdjacentHTML('beforeend', docRow);
    });

    // 3. Update the count displays
    categories.forEach(cat => {
        const countEl = document.getElementById(`count-${cat}`);
        if (countEl) {
            countEl.innerText = `${counts[cat]} ${counts[cat] === 1 ? 'file' : 'files'}`;
        }
    });
};

window.deleteDocument = async function(docId, fileUrl) {
    if (!confirm("Are you sure you want to delete this document? This cannot be undone.")) return;

    try {
        // Extract file path from URL (e.g., 'client_id/timestamp.pdf')
        const filePath = new URL(fileUrl).pathname.split('/client-docs/')[1];

        // 1. Delete from Storage
        const { error: storageError } = await supabaseClient.storage.from('client-docs').remove([filePath]);
        if (storageError) throw storageError;

        // 2. Delete from database
        const { error: dbError } = await supabaseClient.from('client_documents').delete().eq('id', docId);
        if (dbError) throw dbError;

        logActivity(currentClientId, 'Document', `Deleted: ${filePath.split('/').pop()}`);
        fetchClientDocuments(currentClientId); // Refresh the list
    } catch (error) {
        console.error("Error deleting document:", error.message);
        alert("Failed to delete document.");
    }
};