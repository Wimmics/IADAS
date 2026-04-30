document.addEventListener('DOMContentLoaded', function() {
    const token = sessionStorage.getItem('adminToken');
    
    if (!token) {
        alert('Accès non autorisé. Redirection vers la page d\'accueil.');
        window.location.href = './index.html';
        return;
    }
});

window.addEventListener('beforeunload', function() {
    sessionStorage.removeItem('adminToken');
});