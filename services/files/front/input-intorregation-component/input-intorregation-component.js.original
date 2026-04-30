class InputInterrogationComponent extends HTMLElement {
    constructor() {
        super();
        this.csvData = null;
        this.availableVD = [];
        this.availableVI = [];
        this.availableCategoriesVD = [];
        this.availableCategoriesVI = [];
        this.availableSports = [];
        this.sportsData = null;
        this.availableCategoriesSports = [];
        this.allSports = [];
        this.availableSportCategories = [];
        this.allSportCategories = [];
        this.isQueryMode = false;
    }

    connectedCallback() {
        this.initializeComponent();
    }

    async initializeComponent() {
        await this.loadTemplate();
        this.setupEventListeners();
        this.setupDeselectableRadios();
        this.loadCSVData();
    }

    setupEventListeners() {
        // Mode toggle
        // this.querySelector('#toggleMode').addEventListener('click', () => this.toggleMode());

        // SPARQL buttons
        this.querySelector('#loadExample').addEventListener('click', () => this.loadExampleQuery());
        this.querySelector('#clearQuery').addEventListener('click', () => this.clearSparqlQuery());
        this.querySelector('#executeSparql').addEventListener('click', () => this.executeSparqlQuery());
        this.querySelector('#sparqlQuery').addEventListener('input', () => this.validateSparqlQuery());

        this.querySelector('#categoryVD').addEventListener('change', () => this.handleCategoryChangeVD());
        this.querySelector('#categoryVI').addEventListener('change', () => this.handleCategoryChangeVI());
        
        // Event listener for sport category filtering
        this.querySelector('#sportCategory').addEventListener('change', () => this.handleSportCategoryChange());

        // Autocomplete for variables
        this.setupAutocomplete('variableVI', () => this.availableVI);
        this.setupAutocomplete('variableVD', () => this.availableVD);
        this.setupAutocomplete('sportType', () => this.availableSports);

        // Search button
        this.querySelector('#searchBtn').addEventListener('click', () => this.handleSearch());
        this.setupCustomFieldHandlers();


        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-container')) {
                this.hideAllDropdowns();
            }
        });
    }


    setupAutocomplete(inputId, getDataFn) {
        console.log(`🔧 Setup autocomplétion pour: ${inputId}`);
        const input = this.querySelector(`#${inputId}`);
        const dropdown = this.querySelector(`#${inputId}-dropdown`);
        
        console.log(`🏃 Input ${inputId} trouvé:`, !!input);
        console.log(`🏃 Dropdown ${inputId} trouvé:`, !!dropdown);
        
        if (!input || !dropdown) {
            console.error(`❌ Éléments manquants pour ${inputId}:`, { input: !!input, dropdown: !!dropdown });
            return;
        }
        
        let currentSelection = -1;

        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            console.log(`⌨️ Input event sur ${inputId}:`, query);
            const data = getDataFn();
            console.log(`📊 Données disponibles pour ${inputId}:`, data?.length || 0);
            this.showAutocompleteResults(inputId, query, data);
            currentSelection = -1;
        });

        input.addEventListener('focus', (e) => {
            const query = e.target.value.toLowerCase().trim();
            this.showAutocompleteResults(inputId, query, getDataFn());
        });

        input.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.autocomplete-item:not(.no-results)');

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    currentSelection = Math.min(currentSelection + 1, items.length - 1);
                    this.updateSelection(dropdown, currentSelection);
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    currentSelection = Math.max(currentSelection - 1, -1);
                    this.updateSelection(dropdown, currentSelection);
                    break;

                case 'Enter':
                    e.preventDefault();
                    if (currentSelection >= 0 && items[currentSelection]) {
                        this.selectItem(input, dropdown, items[currentSelection].textContent);
                        currentSelection = -1;
                    }
                    break;

                case 'Escape':
                    dropdown.classList.remove('show');
                    currentSelection = -1;
                    break;
            }
        });
    }

    showAutocompleteResults(inputId, query, data) {
        console.log(`🔍 showAutocompleteResults appelée pour ${inputId}, query: "${query}"`);
        const dropdown = this.querySelector(`#${inputId}-dropdown`);
        
        if (!dropdown) {
            console.error(`❌ Dropdown ${inputId}-dropdown non trouvé !`);
            return;
        }
        
        console.log(`📋 Dropdown trouvé pour ${inputId}`);

        // Hide other dropdowns
        this.hideAllDropdowns();

        let filteredData = data;

        if (query) {
            filteredData = data.filter(item => {
                // Vérification de sécurité : s'assurer que item est une chaîne
                if (!item || typeof item !== 'string') {
                    return false;
                }
                return item.toLowerCase().includes(query);
            }).sort((a, b) => {
                // Prioritize items that start with the query
                const aStarts = a.toLowerCase().startsWith(query);
                const bStarts = b.toLowerCase().startsWith(query);

                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;

                return a.localeCompare(b);
            });
            console.log(`🔍 Résultats filtrés pour "${query}":`, filteredData.length);
        } else {
            console.log(`📋 Affichage de tous les résultats:`, filteredData.length);
        }

        if (filteredData.length === 0) {
            dropdown.innerHTML = '<div class="no-results">Aucun résultat trouvé</div>';
            console.log(`❌ Aucun résultat pour ${inputId}`);
        } else {
            dropdown.innerHTML = filteredData
                // .slice(0, 10) // pas de limite je prefere
                .map(item => `<div class="autocomplete-item">${item}</div>`)
                .join('');
            console.log(`✅ Dropdown rempli pour ${inputId} avec ${filteredData.length} éléments`);
        }

        // Add click listeners to items
        dropdown.querySelectorAll('.autocomplete-item:not(.no-results)').forEach(item => {
            item.addEventListener('click', () => {
                const input = this.querySelector(`#${inputId}`);
                this.selectItem(input, dropdown, item.textContent);
            });
        });

        dropdown.classList.add('show');
        console.log(`👁️ Classe 'show' ajoutée au dropdown ${inputId}`);
        console.log(`🎨 Classes CSS finales:`, dropdown.className);
        
        // Vérifier après ajout de la classe
        setTimeout(() => {
            console.log(`👀 Dropdown visible après show?`, dropdown.offsetHeight > 0);
            console.log(`📐 Dimensions du dropdown:`, {
                offsetHeight: dropdown.offsetHeight,
                offsetWidth: dropdown.offsetWidth,
                display: getComputedStyle(dropdown).display,
                visibility: getComputedStyle(dropdown).visibility
            });
        }, 10);
    }

    resetCustomFields(fieldIds) {
        fieldIds.forEach(id => {
            const field = this.querySelector(`#${id}`);
            if (field) field.value = '';
        });
    }


    selectItem(input, dropdown, value) {
        input.value = value;
        dropdown.classList.remove('show');
        this.updateSelection();

        // Trigger change event
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    updateSelection(dropdown, selectedIndex) {
        if (!dropdown) return;

        const items = dropdown.querySelectorAll('.autocomplete-item:not(.no-results)');
        items.forEach((item, index) => {
            item.classList.toggle('highlighted', index === selectedIndex);
        });
    }

    hideAllDropdowns() {
        this.querySelectorAll('.autocomplete-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }

    setupDeselectableRadios() {
        const radioButtons = this.querySelectorAll('input[name="relationDirection"]');
        let lastChecked = null;

        radioButtons.forEach(radio => {
            radio.addEventListener('click', (e) => {
                // Si on clique sur le même bouton qui était déjà sélectionné
                if (radio === lastChecked) {
                    radio.checked = false;
                    lastChecked = null;
                    // Déclencher l'événement change pour que le formulaire se mette à jour
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    lastChecked = radio;
                }
            });

            // Suivre les changements pour mettre à jour lastChecked
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    lastChecked = radio;
                }
            });
        });
    }

    toggleMode() {
        this.isQueryMode = !this.isQueryMode;
        const toggleBtn = this.querySelector('#toggleMode');
        const formMode = this.querySelector('#formMode');
        const sparqlMode = this.querySelector('#sparqlMode');

        if (this.isQueryMode) {
            formMode.style.display = 'none';
            sparqlMode.style.display = 'block';
            toggleBtn.textContent = 'Mode Formulaire';
        } else {
            formMode.style.display = 'grid';
            sparqlMode.style.display = 'none';
            toggleBtn.textContent = 'Mode SPARQL';
        }
    }

    UniqueValues() {
        // Extraire toutes les variables (backup)
        this.allVD = [...new Set(
            this.csvData
                .map(row => row['sub-class_Final_VD'])
                .filter(val => val != null && val !== '' && val !== undefined)
        )].sort();

        this.allVI = [...new Set(
            this.csvData
                .map(row => row['sub-class_Final_VI'])
                .filter(val => val != null && val !== '' && val !== undefined)
        )].sort();

        // Extraire les catégories pour VD
        this.availableCategoriesVD = [...new Set(
            this.csvData
                .filter(row => row['sub-class_Final_VD'] != null && row['sub-class_Final_VD'] !== '')
                .map(row => row['CLASS'])
                .filter(val => val != null && val !== '' && val !== undefined)
        )].sort();

        // Extraire les catégories pour VI
        this.availableCategoriesVI = [...new Set(
            this.csvData
                .filter(row => row['sub-class_Final_VI'] != null && row['sub-class_Final_VI'] !== '')
                .map(row => row['CLASS'])
                .filter(val => val != null && val !== '' && val !== undefined)
        )].sort();

        // Initialiser avec toutes les variables
        this.availableVD = [...this.allVD];
        this.availableVI = [...this.allVI];

        // Peupler les sélecteurs de catégories
        this.populateCategorySelectors();
    }

    populateCategorySelectors() {
        this.populateCategorySelector('#categoryVD', this.availableCategoriesVD);
        this.populateCategorySelector('#categoryVI', this.availableCategoriesVI);
    }

    populateCategorySelector(selectId, categories) {
        const categorySelect = this.querySelector(selectId);

        // Vider les options existantes (garder la première)
        while (categorySelect.children.length > 1) {
            categorySelect.removeChild(categorySelect.lastChild);
        }

        // Ajouter les catégories
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
    }

    populateSportCategorySelector() {
        const sportCategorySelect = this.querySelector('#sportCategory');
        
        // Vider les options existantes (garder la première)
        while (sportCategorySelect.children.length > 1) {
            sportCategorySelect.removeChild(sportCategorySelect.lastChild);
        }

        // Ajouter les catégories sport
        this.allSportCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            sportCategorySelect.appendChild(option);
        });
    }

    async handleCategoryChangeVD() {
        const selectedCategory = this.querySelector('#categoryVD').value;

        if (selectedCategory === '') {
            this.availableVD = [...this.allVD];
            this.resetVariableInput('variableVD');
            this.updatePlaceholder('variableVD', this.availableVD.length, 'facteurs VD');
        } else {
            // Appel à l'ontologie pour récupérer les facteurs VD filtrés
            try {
                const response = await fetch(`http://localhost:8000/api/interface-data?categoryVD=${encodeURIComponent(selectedCategory)}`);
                const data = await response.json();
                
                if (data.success) {
                    this.availableVD = data.data.factorsVD.map(item => item.vd ? item.vd.value : item.value).sort();
                    this.resetVariableInput('variableVD');
                    this.updatePlaceholder('variableVD', this.availableVD.length, 'facteurs VD');
                }
            } catch (error) {
                console.error('Erreur filtrage VD:', error);
            }
        }
    }

    async handleCategoryChangeVI() {
        const selectedCategory = this.querySelector('#categoryVI').value;

        if (selectedCategory === '') {
            this.availableVI = [...this.allVI];
            this.resetVariableInput('variableVI');
            this.updatePlaceholder('variableVI', this.availableVI.length, 'facteurs VI');
        } else {
            // Appel à l'ontologie pour récupérer les facteurs VI filtrés
            try {
                const response = await fetch(`http://localhost:8000/api/interface-data?categoryVI=${encodeURIComponent(selectedCategory)}`);
                const data = await response.json();
                
                if (data.success) {
                    this.availableVI = data.data.factorsVI.map(item => item.vi ? item.vi.value : item.value).sort();
                    this.resetVariableInput('variableVI');
                    this.updatePlaceholder('variableVI', this.availableVI.length, 'facteurs VI');
                }
            } catch (error) {
                console.error('Erreur filtrage VI:', error);
            }
        }
    }
    resetVariableInput(inputId) {
        this.querySelector(`#${inputId}`).value = '';
        this.querySelector(`#${inputId}-dropdown`).classList.remove('show');
    }

    updatePlaceholder(inputId, count, type) {
        this.querySelector(`#${inputId}`).placeholder = `Rechercher parmi ${count} ${type}...`;
    }

    async handleSportCategoryChange() {
        const sportCategorySelect = this.querySelector('#sportCategory');
        const selectedCategory = sportCategorySelect.value;

        if (selectedCategory === '') {
            // Aucune catégorie sélectionnée, montrer tous les sports
            this.availableSports = [...this.allSports];
            this.resetSportInput();
            this.updatePlaceholder('sportType', this.availableSports.length, 'sports');
        } else {
            // Filtrer les sports selon la catégorie sélectionnée
            console.log('Filtrage sports par catégorie:', selectedCategory);
            await this.filterSportsByCategory(selectedCategory);
        }
    }

    resetSportInput() {
        this.querySelector('#sportType').value = '';
        this.querySelector('#sportType-dropdown').classList.remove('show');
    }

    async filterSportsByCategory(category) {
        // Filtrage des sports selon la catégorie sélectionnée via une requête à l'ontologie
        try {
            console.log('🔍 Filtrage sports pour catégorie:', category);
            
            // Faire appel à l'endpoint pour récupérer les sports de cette catégorie
            const response = await fetch(`http://localhost:8000/api/interface-data?sportCategory=${encodeURIComponent(category)}`);
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const data = await response.json();
            if (data.success && data.data.sports) {
                // Extraire les sports filtrés
                this.availableSports = data.data.sports.map(item => item.sport.value).sort();
                console.log(`✅ ${this.availableSports.length} sports trouvés pour la catégorie "${category}"`);
            } else {
                // Si pas de sports trouvés, garder la liste complète
                console.log(`❌ Aucun sport trouvé pour "${category}", utilisation de la liste complète`);
                this.availableSports = [...this.allSports];
            }
            
            this.resetSportInput();
            this.updatePlaceholder('sportType', this.availableSports.length, 'sports');
            
        } catch (error) {
            console.error('Erreur filtrage sports par catégorie:', error);
            // En cas d'erreur, garder la liste complète
            this.availableSports = [...this.allSports];
            this.resetSportInput();
            this.updatePlaceholder('sportType', this.availableSports.length, 'sports');
        }
    }

    async loadCSVData() {
        const statusDiv = this.querySelector('#loadingStatus');

        try {
            console.log('📡 Chargement des données depuis l\'ontologie...');
            
            const response = await fetch('http://localhost:8000/api/interface-data');
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Erreur inconnue');
            }

            console.log('✅ Données ontologie chargées:', data.data);
            
            this.ontologyData = data.data;
            this.extractValuesFromOntology();
            this.enableInputs();
            
        } catch (error) {
            console.error('Erreur lors du chargement depuis l\'ontologie:', error);
            statusDiv.innerHTML = `<p style="color: red;">❌ Erreur : ${error.message}</p>`;
        }
    }

    async loadPapaParse() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async loadTemplate() {
        try {
            const response = await fetch('../input-intorregation-component.html');
            if (!response.ok) {
                throw new Error(`Erreur lors du chargement du template: ${response.status}`);
            }
            const htmlContent = await response.text();
            this.innerHTML = htmlContent;
        } catch (error) {
            console.error('Erreur lors du chargement du template:', error);
            // Fallback vers l'ancien HTML en cas d'erreur
            this.innerHTML = `<!-- Votre ancien HTML ici en fallback -->`;
        }
    }

    setupCustomFieldHandlers() {
        // Gestion âge custom
        const ageCategory = this.querySelector('#ageCategory');
        if (ageCategory) {
            ageCategory.addEventListener('change', () => this.handleAgeCategoryChange());
        }

        // Gestion fréquence custom
        const exerciseFrequency = this.querySelector('#exerciseFrequency');
        if (exerciseFrequency) {
            exerciseFrequency.addEventListener('change', () => this.handleFrequencyCategoryChange());
        }

        // Gestion expérience custom
        const experienceCategory = this.querySelector('#experienceCategory');
        if (experienceCategory) {
            experienceCategory.addEventListener('change', () => this.handleExperienceCategoryChange());
        }
    }

    handleAgeCategoryChange() {
        const ageCategory = this.querySelector('#ageCategory');
        const ageCustom = this.querySelector('#ageCustom');

        if (!ageCategory || !ageCustom) return;

        if (ageCategory.value === 'custom') {
            ageCustom.classList.remove('hidden');
            const minAge = this.querySelector('#minAge');
            if (minAge) minAge.focus();
        } else {
            ageCustom.classList.add('hidden');
            // Reset avec les nouveaux IDs
            this.resetCustomFields(['minAge', 'maxAge', 'meanAge']);
        }
    }

    handleFrequencyCategoryChange() {
        const exerciseFrequency = this.querySelector('#exerciseFrequency');
        const frequencyCustom = this.querySelector('#frequencyCustom');

        if (!exerciseFrequency || !frequencyCustom) return;

        if (exerciseFrequency.value === 'custom') {
            frequencyCustom.classList.remove('hidden');
            const minExFR = this.querySelector('#minExFR');
            if (minExFR) minExFR.focus();
        } else {
            frequencyCustom.classList.add('hidden');
            // Reset avec les nouveaux IDs
            this.resetCustomFields(['minExFR', 'maxExFR', 'meanExFR']);
        }
    }

    handleExperienceCategoryChange() {
        const experienceCategory = this.querySelector('#experienceCategory');
        const experienceCustom = this.querySelector('#experienceCustom');

        if (!experienceCategory || !experienceCustom) return;

        if (experienceCategory.value === 'custom') {
            experienceCustom.classList.remove('hidden');
            const minYOE = this.querySelector('#minYOE');
            if (minYOE) minYOE.focus();
        } else {
            experienceCustom.classList.add('hidden');
            // Reset avec les nouveaux IDs
            this.resetCustomFields(['minYOE', 'maxYOE', 'meanYOE']);
        }
    }

    // 4. MÉTHODE UTILITAIRE pour reset les champs
    resetCustomFields(fieldIds) {
        fieldIds.forEach(id => {
            const field = this.querySelector(`#${id}`);
            if (field) field.value = '';
        });
    }

    extractValuesFromOntology() {
        console.log('🔄 Extraction des valeurs depuis les données ontologie...');

        // Extraire les facteurs VD depuis l'ontologie principale
        this.allVD = this.ontologyData.factorsVD.map(item => item.vd ? item.vd.value : item.value).sort();
        this.availableVD = [...this.allVD];

        // Extraire les facteurs VI depuis l'ontologie principale
        this.allVI = this.ontologyData.factorsVI.map(item => item.vi ? item.vi.value : item.value).sort();
        this.availableVI = [...this.allVI];

        // Extraire les catégories VD depuis l'ontologie principale
        this.availableCategoriesVD = this.ontologyData.categoriesVD.map(item => item.category ? item.category.value : item.value).sort();

        // Extraire les catégories VI depuis l'ontologie principale
        this.availableCategoriesVI = this.ontologyData.categoriesVI.map(item => item.category ? item.category.value : item.value).sort();

        console.log('📊 Facteurs VD extraits:', this.allVD.length);
        console.log('📊 Facteurs VI extraits:', this.allVI.length);
        console.log('📊 Catégories VD:', this.availableCategoriesVD);
        console.log('📊 Catégories VI:', this.availableCategoriesVI);

        // Extraire les sports depuis l'ontologie hiérarchique
        this.allSports = this.ontologyData.sports.map(item => item.sport.value).sort();
        this.availableSports = [...this.allSports];

        // Extraire les catégories sport depuis l'ontologie hiérarchique
        this.allSportCategories = this.ontologyData.sportCategories ? 
            this.ontologyData.sportCategories.map(item => item.category.value).sort() : [];
        this.availableSportCategories = [...this.allSportCategories];

        console.log('📊 Sports extraits:', this.allSports.length);
        console.log('📊 Catégories sport extraites:', this.allSportCategories.length);

        // Peupler les sélecteurs de catégories
        this.populateCategorySelectors();
        this.populateSportCategorySelector();
        
        // Mettre à jour les placeholders
        this.updatePlaceholder('variableVD', this.allVD.length, 'facteurs VD');
        this.updatePlaceholder('variableVI', this.allVI.length, 'facteurs VI'); 
        this.updatePlaceholder('sportType', this.allSports.length, 'sports');
    }

    // Ancienne méthode extractUniqueValues - désactivée, remplacée par extractValuesFromOntology
    extractUniqueValues() {
        console.log('⚠️ Méthode extractUniqueValues désactivée - utilise extractValuesFromOntology');
        return;
        
        // Ancien code commenté
        /*
        this.allSports = [...new Set(
            this.sportsData
                .map(row => {
        */
    }

    enableInputs() {
        console.log("🔧 Activation des inputs...");
        const variableVIInput = this.querySelector('#variableVI');
        const variableVDInput = this.querySelector('#variableVD');
        const searchBtn = this.querySelector('#searchBtn');
        const sportCategorySelect = this.querySelector('#sportCategory');
        const sportTypeInput = this.querySelector('#sportType');
        
        console.log("🏃 SportCategory select trouvé:", !!sportCategorySelect);
        console.log("🏃 SportType input trouvé:", !!sportTypeInput);
        console.log("🏃 Nombre de catégories sport disponibles:", this.availableSportCategories?.length || 0);
        console.log("🏃 Nombre de sports disponibles:", this.availableSports?.length || 0);
        
        sportTypeInput.placeholder = `Rechercher parmi ${this.availableSports.length} sports...`;
        sportTypeInput.disabled = false;

        // Update placeholders

        variableVIInput.placeholder = `Rechercher parmi ${this.availableVI.length} facteurs...`;
        variableVDInput.placeholder = `Rechercher parmi ${this.availableVD.length} ACAD...`;

        // Enable interface
        variableVIInput.disabled = false;
        variableVDInput.disabled = false;
        searchBtn.disabled = false;
    }

    async handleSearch() {
        try {
            if (window.loadingManager) {
                window.loadingManager.show("Recherche dans la base IA-DAS...");
            }

            // Récupérer les valeurs des champs existants avec vérifications
            const variableVI = this.querySelector('#variableVI');
            const variableVD = this.querySelector('#variableVD');
            const categoryVI = this.querySelector('#categoryVI');
            const categoryVD = this.querySelector('#categoryVD');
            const gender = this.querySelector('#gender');
            const relationDirection = this.querySelector('input[name="relationDirection"]:checked');
            const sportType = this.querySelector('#sportType');

            const searchData = {
                selectedVI: variableVI ? variableVI.value : '',
                selectedVD: variableVD ? variableVD.value : '',
                categoryVI: categoryVI ? categoryVI.value : '',
                categoryVD: categoryVD ? categoryVD.value : '',
                gender: gender ? gender.value : '',
                relationDirection: relationDirection ? relationDirection.value : '',
                sportType: sportType ? sportType.value : '',
                queryType: 'variable_relation'
            };

            // === GESTION ÂGE - VERSION CORRIGÉE AVEC BONNES CONDITIONS ===
            const ageCategory = this.querySelector('#ageCategory');
            if (ageCategory && ageCategory.value) {
                if (ageCategory.value === 'custom') {
                    const minAgeEl = this.querySelector('#minAge');
                    const maxAgeEl = this.querySelector('#maxAge');
                    const meanAgeEl = this.querySelector('#meanAge');

                    const minAge = minAgeEl ? minAgeEl.value : '';
                    const maxAge = maxAgeEl ? maxAgeEl.value : '';
                    const meanAge = meanAgeEl ? meanAgeEl.value : '';

                    // Envoyer directement les valeurs sans calculs
                    if (meanAge && meanAge.trim() !== '') {
                        searchData.meanAge = parseFloat(meanAge);
                    } else {
                        // Min/Max seulement si pas de moyenne
                        if (minAge && minAge.trim() !== '') searchData.minAge = parseInt(minAge);
                        if (maxAge && maxAge.trim() !== '') searchData.maxAge = parseInt(maxAge);
                    }
                } else {
                    // Conversion des valeurs prédéfinies - ajustées selon les données réelles
                    const ageRanges = {
                        'adolescent': { minAge: 15, maxAge: 19 },     // Ajusté car peu d'ados dans les données
                        'jeune-adulte': { minAge: 18, maxAge: 26 },   // Zone principale des données  
                        'adulte': { minAge: 26, maxAge: 35 },         // Zone populaire (28-30)
                        'adulte-mature': { minAge: 35, maxAge: 50 },  // Plus réaliste
                        'senior': { minAge: 50, maxAge: 80 }          // Plus réaliste
                    };
                    
                    const range = ageRanges[ageCategory.value];
                    if (range) {
                        // Envoyer à la fois min/max pour les plages qui chevauchent
                        // ET la plage pour capturer les moyennes qui tombent dedans
                        searchData.minAge = range.minAge;
                        searchData.maxAge = range.maxAge;
                        // Flag pour indiquer qu'on veut aussi les moyennes dans cette plage
                        searchData.includeMeanInRange = true;
                        // Vérifier si l'utilisateur veut les chevauchements
                        const includeOverlap = this.querySelector('#includeOverlap');
                        searchData.allowOverlap = includeOverlap ? includeOverlap.checked : true;
                    }
                }
            }

            // === GESTION FRÉQUENCE - VERSION CORRIGÉE AVEC BONNES CONDITIONS ===
            const exerciseFrequency = this.querySelector('#exerciseFrequency');
            if (exerciseFrequency && exerciseFrequency.value) {
                if (exerciseFrequency.value === 'custom') {
                    const minExFREl = this.querySelector('#minExFR');
                    const maxExFREl = this.querySelector('#maxExFR');
                    const meanExFREl = this.querySelector('#meanExFR');

                    const minExFR = minExFREl ? minExFREl.value : '';
                    const maxExFR = maxExFREl ? maxExFREl.value : '';
                    const meanExFR = meanExFREl ? meanExFREl.value : '';

                    // Envoyer directement les valeurs sans calculs
                    if (meanExFR && meanExFR.trim() !== '') {
                        searchData.meanExFR = parseFloat(meanExFR);
                    } else {
                        // Min/Max seulement si pas de moyenne
                        if (minExFR && minExFR.trim() !== '') searchData.minExFR = parseInt(minExFR);
                        if (maxExFR && maxExFR.trim() !== '') searchData.maxExFR = parseInt(maxExFR);
                    }
                } else {
                    // Conversion des valeurs prédéfinies en plages numériques
                    // Le système récupérera à la fois les plages qui chevauchent ET les moyennes dans la plage
                    const frequencyRanges = {
                        'faible': { minExFR: 0, maxExFR: 4.9 },
                        'moderee': { minExFR: 5, maxExFR: 10 },
                        'elevee': { minExFR: 10.1, maxExFR: 15 },
                        'intensive': { minExFR: 15.1, maxExFR: 50 }
                    };
                    
                    const range = frequencyRanges[exerciseFrequency.value];
                    if (range) {
                        searchData.minExFR = range.minExFR;
                        searchData.maxExFR = range.maxExFR;
                        // Flag pour indiquer qu'on veut aussi les moyennes dans cette plage
                        searchData.includeMeanFreqInRange = true;
                        // Vérifier si l'utilisateur veut les chevauchements
                        const includeOverlap = this.querySelector('#includeOverlap');
                        searchData.allowOverlap = includeOverlap ? includeOverlap.checked : true;
                    }
                }
            }

            // === GESTION EXPÉRIENCE - VERSION CORRIGÉE AVEC BONNES CONDITIONS ===
            const experienceCategory = this.querySelector('#experienceCategory');
            if (experienceCategory && experienceCategory.value) {
                if (experienceCategory.value === 'custom') {
                    const minYOEEl = this.querySelector('#minYOE');
                    const maxYOEEl = this.querySelector('#maxYOE');
                    const meanYOEEl = this.querySelector('#meanYOE');

                    const minYOE = minYOEEl ? minYOEEl.value : '';
                    const maxYOE = maxYOEEl ? maxYOEEl.value : '';
                    const meanYOE = meanYOEEl ? meanYOEEl.value : '';

                    // Envoyer directement les valeurs sans calculs
                    if (meanYOE && meanYOE.trim() !== '') {
                        searchData.meanYOE = parseFloat(meanYOE);
                    } else {
                        // Min/Max seulement si pas de moyenne
                        if (minYOE && minYOE.trim() !== '') searchData.minYOE = parseInt(minYOE);
                        if (maxYOE && maxYOE.trim() !== '') searchData.maxYOE = parseInt(maxYOE);
                    }
                } else {
                    // Conversion des valeurs prédéfinies en plages numériques
                    // Le système récupérera à la fois les plages qui chevauchent ET les moyennes dans la plage
                    const experienceRanges = {
                        'debutant': { minYOE: 0, maxYOE: 1.9 },
                        'intermediaire': { minYOE: 2, maxYOE: 7 },
                        'experimente': { minYOE: 7.1, maxYOE: 15 },
                        'expert': { minYOE: 15.1, maxYOE: 50 }
                    };
                    
                    const range = experienceRanges[experienceCategory.value];
                    if (range) {
                        searchData.minYOE = range.minYOE;
                        searchData.maxYOE = range.maxYOE;
                        // Flag pour indiquer qu'on veut aussi les moyennes dans cette plage
                        searchData.includeMeanExpInRange = true;
                        // Vérifier si l'utilisateur veut les chevauchements
                        const includeOverlap = this.querySelector('#includeOverlap');
                        searchData.allowOverlap = includeOverlap ? includeOverlap.checked : true;
                    }
                }
            }


            // Dispatcher l'événement
            this.dispatchEvent(new CustomEvent('search', {
                detail: searchData
            }));

        } catch (error) {
           
            if (window.loadingManager) {
                window.loadingManager.showError('Erreur de recherche', error.message);
            }
        }
    }

    // 6. OPTIONNEL : Méthode pour valider les champs custom
    validateCustomFields() {
        let isValid = true;
        const errors = [];

        // Validation âge custom
        const ageMin = this.querySelector('#ageMin');
        const ageMax = this.querySelector('#ageMax');
        if (ageMin && ageMax && ageMin.value && ageMax.value) {
            if (parseInt(ageMin.value) >= parseInt(ageMax.value)) {
                errors.push("L'âge minimum doit être inférieur à l'âge maximum");
                isValid = false;
            }
        }

        // Validation fréquence custom
        const frequencyMin = this.querySelector('#frequencyMin');
        const frequencyMax = this.querySelector('#frequencyMax');
        if (frequencyMin && frequencyMax && frequencyMin.value && frequencyMax.value) {
            if (parseInt(frequencyMin.value) >= parseInt(frequencyMax.value)) {
                errors.push("La fréquence minimum doit être inférieure à la fréquence maximum");
                isValid = false;
            }
        }

        // Validation expérience custom
        const experienceMin = this.querySelector('#experienceMin');
        const experienceMax = this.querySelector('#experienceMax');
        if (experienceMin && experienceMax && experienceMin.value && experienceMax.value) {
            if (parseInt(experienceMin.value) >= parseInt(experienceMax.value)) {
                errors.push("L'expérience minimum doit être inférieure à l'expérience maximum");
                isValid = false;
            }
        }

        // Afficher les erreurs si nécessaire
        if (!isValid) {
            console.warn("Erreurs de validation:", errors);
            // Tu peux afficher les erreurs à l'utilisateur ici
        }

        return { isValid, errors };
    }

    // SPARQL methods
    loadExampleQuery() {
        const exampleQuery = `PREFIX : <http://example.org/onto#>
PREFIX ex: <http://example.org/data#>

SELECT DISTINCT ?selectedVI ?selectedVD ?resultatRelation WHERE {
  ?analysis a :Analysis ;
            :hasRelation ?relation .
  ?relation :hasIndependentVariable ?variableVI ;
            :VD ?selectedVD ;
            :resultatRelation ?resultatRelation .
  ?variableVI :VI ?selectedVI .
}
ORDER BY ?resultatRelation
LIMIT 20`;

        this.querySelector('#sparqlQuery').value = exampleQuery;
        this.validateSparqlQuery();
    }

    clearSparqlQuery() {
        this.querySelector('#sparqlQuery').value = '';
        this.querySelector('#queryValidation').innerHTML = '';
    }

    validateSparqlQuery() {
        const query = this.querySelector('#sparqlQuery').value.trim();
        const validationDiv = this.querySelector('#queryValidation');

        if (!query) {
            validationDiv.innerHTML = '';
            return;
        }

        const hasPrefix = query.toLowerCase().includes('prefix');
        const hasSelect = query.toLowerCase().includes('select');
        const hasWhere = query.toLowerCase().includes('where');

        if (hasPrefix && hasSelect && hasWhere) {
            validationDiv.innerHTML = '<p style="color: green;"> Syntaxe de base valide</p>';
        } else {
            validationDiv.innerHTML = '<p style="color: orange;">Vérifiez la syntaxe (PREFIX, SELECT, WHERE)</p>';
        }
    }

    executeSparqlQuery() {
        const query = this.querySelector('#sparqlQuery').value.trim();

        if (!query) {
            alert('Veuillez saisir une requête SPARQL');
            return;
        }

        this.dispatchEvent(new CustomEvent('search', {
            detail: {
                queryType: 'raw_sparql',
                rawSparqlQuery: query
            }
        }));
    }
}



customElements.define('input-intorregation-component', InputInterrogationComponent);