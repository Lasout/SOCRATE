// Configuration et client Supabase
let supabaseClient = null;
let isConnected = false;
// Gestion des données
class RecipeManagerSupabase {
    constructor() {
        this.recipes = [];
        this.selectedRecipes = [];
        this.loadConfig();
    }
    // Configuration Supabase
    loadConfig() {
        const url = localStorage.getItem('supabase_url');
        const key = localStorage.getItem('supabase_key');
        
        if (url && key) {
            document.getElementById('supabase-url').value = url;
            document.getElementById('supabase-key').value = key;
            this.initSupabase(url, key);
        }
    }
    saveConfig(url, key) {
        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_key', key);
    }
    initSupabase(url, key) {
        try {
            supabaseClient = supabase.createClient(url, key);
            this.testConnection();
        } catch (error) {
            this.updateConnectionStatus(false, 'Erreur de configuration');
        }
    }
    async testConnection() {
        if (!supabaseClient) {
            this.updateConnectionStatus(false, 'Client non initialisé');
            return false;
        }
        try {
            const { data, error } = await supabaseClient
                .from('recipes')
                .select('count', { count: 'exact', head: true });
            if (error) {
                this.updateConnectionStatus(false, `Erreur DB: ${error.message}`);
                return false;
            }
            this.updateConnectionStatus(true, 'Connexion réussie');
            return true;
        } catch (error) {
            this.updateConnectionStatus(false, `Erreur réseau: ${error.message}`);
            return false;
        }
    }
    updateConnectionStatus(connected, message = '') {
        isConnected = connected;
        const statusEl = document.getElementById('connection-status');
        const resultEl = document.getElementById('connection-result');
        
        if (connected) {
            statusEl.className = 'connection-status status-online';
            statusEl.textContent = '🟢 Connecté';
            if (resultEl) {
                resultEl.innerHTML = '<div class="alert alert-info">✅ Connexion Supabase réussie !</div>';
            }
        } else {
            statusEl.className = 'connection-status status-offline';
            statusEl.textContent = '🔴 Déconnecté';
            if (resultEl) {
                resultEl.innerHTML = `<div class="alert alert-error">❌ ${message}</div>`;
            }
        }
    }
    // CRUD Recettes
    async loadRecipes() {
        if (!supabaseClient || !isConnected) {
            throw new Error('Supabase non configuré ou déconnecté');
        }
        const { data, error } = await supabaseClient
            .from('recipes')
            .select(`
                *,
                ingredients (*)
            `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        this.recipes = data || [];
        return this.recipes;
    }
    async addRecipe(recipe) {
        if (!supabaseClient || !isConnected) {
            throw new Error('Supabase non configuré');
        }
        // Insérer la recette
        const { data: recipeData, error: recipeError } = await supabaseClient
            .from('recipes')
            .insert([{
                name: recipe.name,
                portions: recipe.portions,
                type: recipe.type,
                link: recipe.link || null
            }])
            .select()
            .single();
        if (recipeError) throw recipeError;
        // Insérer les ingrédients
        const ingredients = recipe.ingredients.map(ing => ({
            recipe_id: recipeData.id,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit
        }));
        const { error: ingredientsError } = await supabaseClient
            .from('ingredients')
            .insert(ingredients);
        if (ingredientsError) throw ingredientsError;
        return recipeData;
    }
    async deleteRecipe(id) {
        if (!supabaseClient || !isConnected) {
            throw new Error('Supabase non configuré');
        }
        // Les ingrédients seront supprimés automatiquement (CASCADE)
        const { error } = await supabaseClient
            .from('recipes')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
    getRecipesByType(type) {
        return this.recipes.filter(recipe => recipe.type === type);
    }
    getRandomRecipes(count, types = ['plat']) {
        let availableRecipes;
        if (!types || types.includes('all')) {
            availableRecipes = this.recipes;
        } else {
            availableRecipes = this.recipes.filter(recipe => types.includes(recipe.type));
        }
        if (availableRecipes.length === 0) return [];
        const shuffled = [...availableRecipes].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, availableRecipes.length));
 }
    generateShoppingList() {
        const shoppingMap = new Map();
        this.selectedRecipes.forEach(selection => {
            const recipe = this.recipes.find(r => r.id === selection.recipeId);
            if (!recipe) return;
            const multiplier = selection.portions / recipe.portions;
            recipe.ingredients.forEach(ingredient => {
                const key = `${ingredient.name}_${ingredient.unit}`;
                const adjustedQuantity = ingredient.quantity * multiplier;
                if (shoppingMap.has(key)) {
                    shoppingMap.set(key, {
                        name: ingredient.name,
                        quantity: shoppingMap.get(key).quantity + adjustedQuantity,
                        unit: ingredient.unit
                    });
                } else {
                    shoppingMap.set(key, {
                        name: ingredient.name,
                        quantity: adjustedQuantity,
                        unit: ingredient.unit
                    });
                }
            });
        });
        return Array.from(shoppingMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    // Migration depuis localStorage
    getLocalStorageRecipes() {
        const stored = localStorage.getItem('recipes');
        return stored ? JSON.parse(stored) : [];
    }
    async migrateFromLocalStorage() {
        const localRecipes = this.getLocalStorageRecipes();
        if (localRecipes.length === 0) {
            throw new Error('Aucune recette trouvée dans localStorage');
        }
        const results = [];
        for (const recipe of localRecipes) {
            try {
                const migrated = await this.addRecipe(recipe);
                results.push({ success: true, name: recipe.name, id: migrated.id });
            } catch (error) {
                results.push({ success: false, name: recipe.name, error: error.message });
            }
        }
        return results;
    }
    clearLocalStorage() {
        localStorage.removeItem('recipes');
    }
}
// Instance globale
const recipeManager = new RecipeManagerSupabase();
// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    setupNavigation();
    setupConfiguration();
    setupMigration();
    setupRecipeManagement();
    setupRandomSelection();
    setupShoppingList();
});
// Gestion de la navigation
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section');
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetSection = this.dataset.section;
            
            navButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            sections.forEach(section => section.classList.remove('active'));
            document.getElementById(targetSection).classList.add('active');
            
            // Actions spécifiques selon la section
            if (targetSection === 'recipes') {
                displayRecipes();
            }
        });
    });
}
// Configuration Supabase
function setupConfiguration() {
    const testBtn = document.getElementById('test-connection');
    const saveBtn = document.getElementById('save-config');
    testBtn.addEventListener('click', async function() {
        const url = document.getElementById('supabase-url').value;
        const key = document.getElementById('supabase-key').value;
        if (!url || !key) {
            document.getElementById('connection-result').innerHTML =
                '<div class="alert alert-error">Veuillez remplir tous les champs</div>';
            return;
        }
        this.disabled = true;
        this.textContent = 'Test en cours...';
        recipeManager.initSupabase(url, key);
        
        // Attendre un peu pour le test
        setTimeout(() => {
            this.disabled = false;
            this.textContent = 'Tester la connexion';
        }, 2000);
    });
    saveBtn.addEventListener('click', function() {
        const url = document.getElementById('supabase-url').value;
        const key = document.getElementById('supabase-key').value;
        if (!url || !key) {
            alert('Veuillez remplir tous les champs');
            return;
        }
        recipeManager.saveConfig(url, key);
        alert('Configuration sauvegardée !');
    });
}
// Gestion de la migration
function setupMigration() {
    const checkBtn = document.getElementById('check-local-data');
    const migrateBtn = document.getElementById('migrate-data');
    const clearBtn = document.getElementById('clear-local-data');
    const statusEl = document.getElementById('migration-status');
    checkBtn.addEventListener('click', function() {
        const localRecipes = recipeManager.getLocalStorageRecipes();
        
        if (localRecipes.length === 0) {
            statusEl.innerHTML = '<div class="alert alert-info">Aucune recette trouvée dans localStorage</div>';
            migrateBtn.disabled = true;
            clearBtn.disabled = true;
        } else {
            statusEl.innerHTML = `
                <div class="alert alert-info">
                    <strong>${localRecipes.length} recette(s) trouvée(s) dans localStorage :</strong>
                    <ul style="margin-top: 10px;">
                        ${localRecipes.map(r => `<li>${r.name} (${r.ingredients?.length || 0} ingrédients)</li>`).join('')}
                    </ul>
                </div>
            `;
            migrateBtn.disabled = false;
            clearBtn.disabled = false;
        }
    });
    migrateBtn.addEventListener('click', async function() {
        if (!isConnected) {
            statusEl.innerHTML = '<div class="alert alert-error">Veuillez d\'abord configurer et tester Supabase</div>';
            return;
        }
        this.disabled = true;
        this.textContent = 'Migration en cours...';
        try {
            const results = await recipeManager.migrateFromLocalStorage();
            const successes = results.filter(r => r.success);
            const failures = results.filter(r => !r.success);
            let html = `<div class="alert alert-info">
                <strong>Migration terminée !</strong><br>
                ✅ ${successes.length} recette(s) migrée(s) avec succès
            `;
            if (failures.length > 0) {
                html += `<br>❌ ${failures.length} échec(s) :
                    <ul>${failures.map(f => `<li>${f.name}: ${f.error}</li>`).join('')}</ul>
                `;
            }
            html += '</div>';
            statusEl.innerHTML = html;
            if (successes.length > 0) {
                clearBtn.disabled = false;
            }
        } catch (error) {
            statusEl.innerHTML = `<div class="alert alert-error">Erreur: ${error.message}</div>`;
        } finally {
            this.disabled = false;
            this.textContent = 'Migrer vers Supabase';
        }
    });
    clearBtn.addEventListener('click', function() {
        if (confirm('Êtes-vous sûr de vouloir supprimer les données localStorage ? Cette action est irréversible.')) {
            recipeManager.clearLocalStorage();
            statusEl.innerHTML = '<div class="alert alert-info">Données localStorage supprimées</div>';
            this.disabled = true;
            migrateBtn.disabled = true;
        }
    });
}
// Gestion des recettes
function setupRecipeManagement() {
    // Bouton d'actualisation
    document.getElementById('refresh-recipes').addEventListener('click', displayRecipes);
    // Formulaire d'ajout de recette
    setupRecipeForm();
}
// Affichage des recettes
async function displayRecipes() {
    const container = document.getElementById('recipes-list');
    const noRecipesMsg = document.getElementById('no-recipes');
    const loadingMsg = document.getElementById('recipes-loading');
    if (!isConnected) {
        container.innerHTML = '<div class="alert alert-warning">Veuillez configurer Supabase pour voir vos recettes</div>';
        noRecipesMsg.style.display = 'none';
        return;
    }
    // Afficher le loading
    container.innerHTML = '';
    noRecipesMsg.style.display = 'none';
    loadingMsg.style.display = 'block';
    try {
        await recipeManager.loadRecipes();
        if (recipeManager.recipes.length === 0) {
            noRecipesMsg.style.display = 'block';
            container.innerHTML = '';
        } else {
            noRecipesMsg.style.display = 'none';
            container.innerHTML = recipeManager.recipes.map(recipe => `
                <div class="recipe-card">
                    <div class="recipe-title">${recipe.name}</div>
                    <div class="recipe-meta">
                        <span><strong>Type:</strong> ${recipe.type}</span>
                        <span><strong>Portions:</strong> ${recipe.portions}</span>
                        <span><strong>Ajouté:</strong> ${new Date(recipe.created_at).toLocaleDateString('fr-FR')}</span>
                        ${recipe.link ? `<span><a href="${recipe.link}" target="_blank">Voir la recette</a></span>` : ''}
                    </div>
                    <div class="ingredients-list">
                        <strong>Ingrédients:</strong>
                        ${recipe.ingredients.map(ing => `
                            <div class="ingredient-item">
                                <span>${ing.name}</span>
                                <span>${ing.quantity} ${ing.unit}</span>
                            </div>
                        `).join('')}
                    </div>
                    <button onclick="deleteRecipe(${recipe.id})" class="btn-danger">Supprimer</button>
                </div>
            `).join('');
        }
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">Erreur: ${error.message}</div>`;
        noRecipesMsg.style.display = 'none';
    } finally {
        loadingMsg.style.display = 'none';
    }
}
// Configuration du formulaire d'ajout de recette
function setupRecipeForm() {
    const form = document.getElementById('recipe-form');
    const addIngredientBtn = document.getElementById('add-ingredient');
    const container = document.getElementById('ingredients-container');
    addIngredientBtn.addEventListener('click', function() {
        addIngredientRow(container);
    });
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!isConnected) {
            alert('Veuillez configurer Supabase avant d\'ajouter une recette');
            return;
        }
        const saveBtn = document.getElementById('save-recipe');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement...';
        try {
            const recipe = {
                name: document.getElementById('recipe-name').value,
                portions: parseInt(document.getElementById('recipe-portions').value),
                type: document.getElementById('recipe-type').value,
                link: document.getElementById('recipe-link').value,
                ingredients: []
            };
            // Collecte des ingrédients
            const ingredientRows = container.querySelectorAll('.ingredient-row');
            ingredientRows.forEach(row => {
                const name = row.querySelector('.ingredient-name').value;
                const quantity = parseFloat(row.querySelector('.ingredient-quantity').value);
                const unit = row.querySelector('.ingredient-unit').value;
                if (name && quantity && unit) {
                    recipe.ingredients.push({ name, quantity, unit });
                }
            });
            if (recipe.ingredients.length === 0) {
                alert('Veuillez ajouter au moins un ingrédient.');
                return;
            }
            await recipeManager.addRecipe(recipe);
            
            // Réinitialiser le formulaire
            form.reset();
            resetIngredientsContainer();
            
            alert('Recette ajoutée avec succès !');
        } catch (error) {
            alert(`Erreur: ${error.message}`);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Enregistrer la recette';
        }
    });
}
function addIngredientRow(container) {
    const ingredientRow = document.createElement('div');
    ingredientRow.className = 'ingredient-row';
    ingredientRow.innerHTML = `
        <div class="form-group">
            <label>Ingrédient *</label>
            <input type="text" class="ingredient-name" required>
        </div>
        <div class="form-group">
            <label>Quantité *</label>
            <input type="number" class="ingredient-quantity" step="0.1" min="0" required>
        </div>
        <div class="form-group">
            <label>Unité *</label>
            <select class="ingredient-unit" required>
                <option value="">Sélectionnez</option>
                <option value="g">grammes</option>
                <option value="kg">kilogrammes</option>
                <option value="ml">millilitres</option>
                <option value="l">litres</option>
                <option value="pièce">pièce(s)</option>
                <option value="cuillère à soupe">cuillère(s) à soupe</option>
                <option value="cuillère à café">cuillère(s) à café</option>
                <option value="tasse">tasse(s)</option>
            </select>
        </div>
        <button type="button" onclick="this.parentElement.remove()" class="btn-danger">Supprimer</button>
    `;
    container.appendChild(ingredientRow);
}
function resetIngredientsContainer() {
    const container = document.getElementById('ingredients-container');
    container.innerHTML = `
        <div class="ingredient-row">
            <div class="form-group">
                <label>Ingrédient *</label>
                <input type="text" class="ingredient-name" required>
            </div>
            <div class="form-group">
                <label>Quantité *</label>
                <input type="number" class="ingredient-quantity" step="0.1" min="0" required>
            </div>
            <div class="form-group">
                <label>Unité *</label>
                <select class="ingredient-unit" required>
                    <option value="">Sélectionnez</option>
                    <option value="g">grammes</option>
                    <option value="kg">kilogrammes</option>
                    <option value="ml">millilitres</option>
                    <option value="l">litres</option>
                    <option value="pièce">pièce(s)</option>
                    <option value="cuillère à soupe">cuillère(s) à soupe</option>
                    <option value="cuillère à café">cuillère(s) à café</option>
                    <option value="tasse">tasse(s)</option>
                </select>
            </div>
        </div>
    `;
}
// Configuration de la sélection aléatoire
function setupRandomSelection() {
    const generateBtn = document.getElementById('generate-random');
    const container = document.getElementById('selected-recipes-container');
    generateBtn.addEventListener('click', function() {
        if (!isConnected || recipeManager.recipes.length === 0) {
            container.innerHTML = '<div class="alert alert-warning">Veuillez d\'abord charger vos recettes</div>';
            return;
        }
        const numRecipes = parseInt(document.getElementById('num-recipes').value);
        if (!numRecipes || numRecipes < 1) {
            alert('Veuillez entrer un nombre valide de recettes.');
            return;
        }
        const typeSelect = document.getElementById('recipe-types');
        const selectedTypes = Array.from(typeSelect.selectedOptions).map(opt => opt.value);
        const randomRecipes = recipeManager.getRandomRecipes(numRecipes, selectedTypes);
        if (randomRecipes.length === 0) {
            container.innerHTML = '<div class="alert alert-warning">Aucune recette trouvée pour le(s) type(s) sélectionné(s).</div>';
            return;
        }
        recipeManager.selectedRecipes = randomRecipes.map(recipe => ({
            recipeId: recipe.id,
            portions: recipe.portions
        }));
        container.innerHTML = `
            <h3>Recettes sélectionnées :</h3>
            ${randomRecipes.map(recipe => `
                <div class="selected-recipe">
                    <div>
                        <strong>${recipe.name}</strong>
                        <div style="font-size: 14px; color: #666;">
                            ${recipe.ingredients.length} ingrédients • ${recipe.type}
                        </div>
                    </div>
                    <div>
                        <label style="margin-right: 10px;">Portions:</label>
                        <input type="number" min="1" value="${recipe.portions}"
                            onchange="updateRecipePortions(${recipe.id}, this.value)"
                            style="width: 60px;">
                    </div>
                </div>
            `).join('')}
        `;
    });
}
// Configuration de la liste de courses
function setupShoppingList() {
    const generateBtn = document.getElementById('generate-shopping');
    const container = document.getElementById('shopping-list-container');
    generateBtn.addEventListener('click', function() {
        if (!isConnected) {
            container.innerHTML = '<div class="alert alert-warning">Veuillez configurer Supabase</div>';
            return;
        }
        if (recipeManager.selectedRecipes.length === 0) {
            container.innerHTML = '<div class="alert alert-warning">Veuillez d\'abord sélectionner des recettes dans la section "Sélection Aléatoire".</div>';
            return;
        }
        const shoppingList = recipeManager.generateShoppingList();
        
        // Générer le texte pour Google Keep
        const keepText = shoppingList.map(item => {
            const quantity = Math.round(item.quantity * 100) / 100;
            return `☐ ${item.name} (${quantity} ${item.unit})`;
        }).join('\n');
        // Générer aussi une version simple sans cases
        const simpleText = shoppingList.map(item => {
            const quantity = Math.round(item.quantity * 100) / 100;
            return `${item.name} - ${quantity} ${item.unit}`;
        }).join('\n');
        
        container.innerHTML = `
            <div class="shopping-list">
                <h3>🛒 Liste de Courses</h3>
                <p><small>Basée sur ${recipeManager.selectedRecipes.length} recette(s) sélectionnée(s)</small></p>
                
                <!-- Affichage visuel -->
                <div class="shopping-visual">
                    ${shoppingList.map(item => `
                        <div class="shopping-item">
                            <span>☐ ${item.name}</span>
                            <strong>${Math.round(item.quantity * 100) / 100} ${item.unit}</strong>
                        </div>
                    `).join('')}
                </div>
                <!-- Zone de copie pour Google Keep -->
                <div class="copy-section">
                    <h4>📋 Copier pour Google Keep</h4>
                    <p><small>Format avec cases à cocher - Copiez le texte ci-dessous et collez-le dans Google Keep</small></p>
                    
                    <div class="copy-container">
                        <textarea id="keep-text" readonly rows="10" style="width: 100%; padding: 10px; border-radius: 5px; border: 2px solid #ddd; font-family: monospace; font-size: 14px;">${keepText}</textarea>
                        <button onclick="copyToClipboard('keep-text')" class="btn-success" style="margin-top: 10px;">
                            📋 Copier pour Google Keep
                        </button>
                    </div>
                </div>
                <!-- Zone de copie version simple -->
                <div class="copy-section" style="margin-top: 20px;">
                    <h4>📝 Version Simple</h4>
                    <p><small>Sans cases à cocher - Pour autres applications</small></p>
                    
                    <div class="copy-container">
                        <textarea id="simple-text" readonly rows="8" style="width: 100%; padding: 10px; border-radius: 5px; border: 2px solid #ddd; font-family: monospace; font-size: 14px;">${simpleText}</textarea>
                        <button onclick="copyToClipboard('simple-text')" class="btn-success" style="margin-top: 10px;">
                            📋 Copier version simple
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}
// Fonction pour copier dans le presse-papiers
async function copyToClipboard(textareaId) {
    const textarea = document.getElementById(textareaId);
    const text = textarea.value;
    try {
        // Méthode moderne (préférée)
        await navigator.clipboard.writeText(text);
        
        // Feedback visuel
        const button = textarea.nextElementSibling;
        const originalText = button.textContent;
        button.textContent = '✅ Copié !';
        button.style.background = '#27ae60';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 2000);
    } catch (err) {
        // Fallback pour navigateurs plus anciens
        textarea.select();
        textarea.setSelectionRange(0, 99999); // Pour mobile
        
        try {
            document.execCommand('copy');
            alert('✅ Texte copié dans le presse-papiers !');
        } catch (fallbackErr) {
            alert('❌ Impossible de copier automatiquement. Veuillez sélectionner le texte et copier manuellement (Ctrl+C).');
        }
    }
}
// Fonctions utilitaires globales
async function deleteRecipe(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette recette ?')) {
        return;
    }
    try {
        await recipeManager.deleteRecipe(id);
        displayRecipes(); // Rafraîchir la liste
        alert('Recette supprimée avec succès');
    } catch (error) {
        alert(`Erreur: ${error.message}`);
    }
}
function updateRecipePortions(recipeId, newPortions) {
    const selection = recipeManager.selectedRecipes.find(s => s.recipeId === recipeId);
    if (selection) {
        selection.portions = parseInt(newPortions);
    }
}
