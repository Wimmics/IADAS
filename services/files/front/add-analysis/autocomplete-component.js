// Composant d'autocomplétion intelligent pour les formulaires IA-DAS
class AutocompleteComponent {
    constructor(inputElement, fieldName, options = {}) {
        this.input = inputElement;
        this.fieldName = fieldName;
        this.options = {
            minChars: 1,
            maxSuggestions: 10,
            delay: 300,
            placeholder: "Tapez pour rechercher ou saisir une nouvelle valeur...",
            allowFreeInput: true,
            ...options
        };
        
        this.suggestions = [];
        this.currentSuggestions = [];
        this.selectedIndex = -1;
        this.isOpen = false;
        this.searchTimeout = null;
        
        // Références aux éléments DOM
        this.container = null;
        this.dropdown = null;
        
        this.init();
    }
    
    init() {
        // Créer la structure HTML
        this.createStructure();
        
        // Attacher les événements
        this.attachEvents();
        
        // Mettre à jour le placeholder
        if (this.options.placeholder) {
            this.input.placeholder = this.options.placeholder;
        }
        
        // Précharger les suggestions si possible
        this.preloadSuggestions();
    }
    
    createStructure() {
        // Wrapper container
        this.container = document.createElement('div');
        this.container.className = 'autocomplete-container';
        
        // Insérer le container autour de l'input
        this.input.parentNode.insertBefore(this.container, this.input);
        this.container.appendChild(this.input);
        
        // Ajouter la classe à l'input
        this.input.classList.add('autocomplete-input');
        
        // Dropdown pour les suggestions
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'autocomplete-dropdown';
        this.container.appendChild(this.dropdown);
        
        // Indicateur de chargement
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.className = 'autocomplete-loading';
        this.loadingIndicator.innerHTML = '⏳ Chargement...';
        this.container.appendChild(this.loadingIndicator);
    }
    
    attachEvents() {
        // Input events
        this.input.addEventListener('input', this.handleInput.bind(this));
        this.input.addEventListener('focus', this.handleFocus.bind(this));
        this.input.addEventListener('blur', this.handleBlur.bind(this));
        this.input.addEventListener('keydown', this.handleKeydown.bind(this));
        
        // Dropdown events
        this.dropdown.addEventListener('mousedown', this.handleDropdownClick.bind(this));
        
        // Document events pour fermer le dropdown
        document.addEventListener('click', this.handleDocumentClick.bind(this));
    }
    
    async preloadSuggestions() {
        if (!window.ontologyAutocomplete) {
            console.warn('OntologyAutocompleteService non disponible');
            return;
        }
        
        try {
            this.suggestions = await window.ontologyAutocomplete.getSuggestions(this.fieldName);
            console.log(`📋 ${this.suggestions.length} suggestions préchargées pour ${this.fieldName}`);
        } catch (error) {
            console.error(`Erreur préchargement ${this.fieldName}:`, error);
            this.suggestions = [];
        }
    }
    
    handleInput(event) {
        const query = event.target.value.trim();
        
        // Debounce la recherche
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.search(query);
        }, this.options.delay);
    }
    
    handleFocus(event) {
        const query = event.target.value.trim();
        if (query.length >= this.options.minChars) {
            this.search(query);
        } else if (this.suggestions.length > 0) {
            // Afficher toutes les suggestions si on a du cache
            this.showSuggestions(this.suggestions.slice(0, this.options.maxSuggestions));
        }
    }
    
    handleBlur(event) {
        // Petite timeout pour permettre les clics sur dropdown
        setTimeout(() => {
            this.hideSuggestions();
        }, 150);
    }
    
    handleKeydown(event) {
        if (!this.isOpen) return;
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.selectNext();
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                this.selectPrevious();
                break;
                
            case 'Enter':
                event.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectSuggestion(this.currentSuggestions[this.selectedIndex]);
                }
                break;
                
            case 'Escape':
                event.preventDefault();
                this.hideSuggestions();
                break;
        }
    }
    
    handleDropdownClick(event) {
        const suggestionElement = event.target.closest('.autocomplete-suggestion');
        if (suggestionElement) {
            const suggestion = suggestionElement.textContent;
            this.selectSuggestion(suggestion);
        }
    }
    
    handleDocumentClick(event) {
        if (!this.container.contains(event.target)) {
            this.hideSuggestions();
        }
    }
    
    async search(query) {
        if (query.length < this.options.minChars) {
            this.hideSuggestions();
            return;
        }
        
        this.showLoading();
        
        try {
            let searchSuggestions = [];
            
            if (window.ontologyAutocomplete) {
                // Recherche via le service d'ontologie
                searchSuggestions = await window.ontologyAutocomplete.getSuggestions(this.fieldName, query);
            } else {
                // Fallback sur les suggestions préchargées
                const queryLower = query.toLowerCase();
                searchSuggestions = this.suggestions.filter(suggestion => 
                    suggestion.toLowerCase().includes(queryLower)
                );
            }
            
            // Limiter le nombre de résultats
            const limitedSuggestions = searchSuggestions.slice(0, this.options.maxSuggestions);
            
            this.showSuggestions(limitedSuggestions);
            
        } catch (error) {
            console.error(`Erreur recherche autocomplétion ${this.fieldName}:`, error);
            this.hideSuggestions();
        } finally {
            this.hideLoading();
        }
    }
    
    showSuggestions(suggestions) {
        this.currentSuggestions = suggestions;
        this.selectedIndex = -1;
        
        if (suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }
        
        // Créer les éléments de suggestions
        this.dropdown.innerHTML = '';
        
        suggestions.forEach((suggestion, index) => {
            const suggestionElement = document.createElement('div');
            suggestionElement.className = 'autocomplete-suggestion';
            suggestionElement.textContent = suggestion;
            suggestionElement.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this.updateSelectedSuggestion();
            });
            
            this.dropdown.appendChild(suggestionElement);
        });
        
        // Ajouter option "Saisie libre" si autorisée
        if (this.options.allowFreeInput && this.input.value.trim()) {
            const freeInputElement = document.createElement('div');
            freeInputElement.className = 'autocomplete-suggestion autocomplete-free-input';
            freeInputElement.innerHTML = `✏️ Saisir "${this.input.value.trim()}" comme nouvelle valeur`;
            freeInputElement.addEventListener('click', () => {
                this.hideSuggestions();
            });
            this.dropdown.appendChild(freeInputElement);
        }
        
        this.isOpen = true;
        this.dropdown.style.display = 'block';
        this.updateDropdownPosition();
    }
    
    hideSuggestions() {
        this.isOpen = false;
        this.dropdown.style.display = 'none';
        this.selectedIndex = -1;
    }
    
    showLoading() {
        this.loadingIndicator.style.display = 'block';
    }
    
    hideLoading() {
        this.loadingIndicator.style.display = 'none';
    }
    
    selectNext() {
        if (this.selectedIndex < this.currentSuggestions.length - 1) {
            this.selectedIndex++;
            this.updateSelectedSuggestion();
        }
    }
    
    selectPrevious() {
        if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.updateSelectedSuggestion();
        }
    }
    
    updateSelectedSuggestion() {
        const suggestions = this.dropdown.querySelectorAll('.autocomplete-suggestion:not(.autocomplete-free-input)');
        suggestions.forEach((element, index) => {
            element.classList.toggle('selected', index === this.selectedIndex);
        });
        
        // Scroll vers l'élément sélectionné si nécessaire
        if (this.selectedIndex >= 0 && suggestions[this.selectedIndex]) {
            suggestions[this.selectedIndex].scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }
    
    selectSuggestion(suggestion) {
        this.input.value = suggestion;
        this.hideSuggestions();
        
        // Déclencher l'événement input pour mettre à jour le formulaire
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    updateDropdownPosition() {
        const inputRect = this.input.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        
        // Calculer la position relative au container
        this.dropdown.style.top = (inputRect.bottom - containerRect.top) + 'px';
        this.dropdown.style.left = '0';
        this.dropdown.style.width = this.input.offsetWidth + 'px';
    }
    
    // Méthodes publiques
    updateSuggestions(newSuggestions) {
        this.suggestions = newSuggestions;
    }
    
    destroy() {
        // Nettoyer les événements et le DOM
        document.removeEventListener('click', this.handleDocumentClick);
        clearTimeout(this.searchTimeout);
        
        // Restaurer l'input original
        if (this.container && this.container.parentNode) {
            this.container.parentNode.insertBefore(this.input, this.container);
            this.container.remove();
        }
    }
}

// Manager pour gérer plusieurs composants d'autocomplétion
class AutocompleteManager {
    constructor() {
        this.components = new Map();
        this.initialized = false;
    }
    
    async init() {
        if (this.initialized) return;
        
        console.log('🎯 Initialisation du gestionnaire d\'autocomplétion...');
        
        // Attendre que le service d'ontologie soit prêt
        if (window.ontologyAutocomplete) {
            try {
                await window.ontologyAutocomplete.preloadAllData();
                console.log('✅ Données d\'ontologie préchargées');
            } catch (error) {
                console.error('❌ Erreur préchargement ontologie:', error);
            }
        }
        
        this.initialized = true;
        console.log('🎯 Gestionnaire d\'autocomplétion initialisé');
    }
    
    enableAutocomplete(inputElement, fieldName, options = {}) {
        if (this.components.has(inputElement)) {
            console.warn(`Autocomplétion déjà activée pour ${fieldName}`);
            return;
        }
        
        const component = new AutocompleteComponent(inputElement, fieldName, options);
        this.components.set(inputElement, component);
        
        console.log(`✅ Autocomplétion activée pour ${fieldName}`);
        return component;
    }
    
    disableAutocomplete(inputElement) {
        const component = this.components.get(inputElement);
        if (component) {
            component.destroy();
            this.components.delete(inputElement);
            console.log('❌ Autocomplétion désactivée');
        }
    }
    
    enableForForm(formElement, fieldConfigs = {}) {
        if (!this.initialized) {
            console.warn('Gestionnaire non initialisé, appeler init() d\'abord');
            return;
        }
        
        // Liste des champs supportés
        const supportedFields = window.ontologyAutocomplete ? 
            window.ontologyAutocomplete.getSupportedFields() : [];
        
        console.log(`🔍 Recherche de champs d'autocomplétion dans le formulaire...`);
        
        let enabledCount = 0;
        
        supportedFields.forEach(fieldName => {
            const input = formElement.querySelector(`#${fieldName}, input[name="${fieldName}"]`);
            if (input && input.type === 'text') {
                const config = fieldConfigs[fieldName] || {};
                this.enableAutocomplete(input, fieldName, config);
                enabledCount++;
            }
        });
        
        console.log(`✨ ${enabledCount} champs d'autocomplétion activés`);
    }
    
    getStats() {
        return {
            activeComponents: this.components.size,
            initialized: this.initialized,
            fields: Array.from(this.components.entries()).map(([input, component]) => ({
                fieldName: component.fieldName,
                inputId: input.id,
                suggestionsCount: component.suggestions.length
            }))
        };
    }
}

// Instance globale
window.AutocompleteComponent = AutocompleteComponent;
window.autocompleteManager = new AutocompleteManager();

// Fonctions utilitaires globales
window.initAutocomplete = async function() {
    await window.autocompleteManager.init();
    return window.autocompleteManager;
};

window.enableFormAutocomplete = function(formSelector = '#addAnalysisForm') {
    const form = document.querySelector(formSelector);
    if (form) {
        window.autocompleteManager.enableForForm(form);
        return true;
    } else {
        console.error(`Formulaire non trouvé: ${formSelector}`);
        return false;
    }
};

// Debug
window.debugAutocompleteManager = function() {
    console.log('=== STATS AUTOCOMPLÉTION ===');
    console.table(window.autocompleteManager.getStats().fields);
    return window.autocompleteManager.getStats();
};