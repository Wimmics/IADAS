function showAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('adminPassword').focus();
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('adminPassword').value = '';
    document.getElementById('authError').style.display = 'none';
}

document.getElementById('authForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('authError');
    
    try {
        console.log('Envoi de la requête auth avec mot de passe:', password);
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        
        console.log('Réponse reçue, status:', response.status);
        const result = await response.json();
        console.log('Résultat JSON complet:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('Authentification réussie, stockage du token...');
            sessionStorage.setItem('adminToken', result.token);
            console.log('Token stocké dans sessionStorage:', sessionStorage.getItem('adminToken'));
            console.log('Redirection vers update-page.html...');
            window.location.href = './update-page.html';
        } else {
            console.log('Authentification échouée:', result.message);
            errorDiv.textContent = result.message || 'Erreur d\'authentification';
            errorDiv.style.display = 'block';
            document.getElementById('adminPassword').value = '';
        }
    } catch (error) {
        console.error('Erreur lors de l\'authentification:', error);
        errorDiv.textContent = 'Erreur de connexion au serveur';
        errorDiv.style.display = 'block';
    }
});

window.onclick = function(event) {
    const modal = document.getElementById('authModal');
    if (event.target === modal) {
        closeAuthModal();
    }
}