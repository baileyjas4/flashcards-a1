// --- Minimal Data Model ---
const APP_STATE = {
    decks: [], // Array<{ id, name, createdAt }>
    cardsByDeckId: {}, // Record<string, Array<{ id, front, back, updatedAt }>>
    activeDeckId: null,
    studySession: {
        cards: [],
        currentIndex: 0,
        isFlipped: false,
    },
};

const STORAGE_KEY = 'flashcardsAppState_v1';

// --- Global UI Elements ---
const modalContainer = document.getElementById('modalContainer');
const deckListElement = document.getElementById('deckList');
const activeDeckTitleElement = document.getElementById('activeDeckTitle');
const cardAreaElement = document.getElementById('cardArea');
const noDecksMessage = document.getElementById('noDecksMessage');
const cardSearchInput = document.getElementById('cardSearch');

// --- Helper Functions ---
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
};

// --- LocalStorage (Part 5) ---
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            decks: APP_STATE.decks,
            cardsByDeckId: APP_STATE.cardsByDeckId,
            activeDeckId: APP_STATE.activeDeckId
        }));
    } catch (error) {
        console.error("Could not save state to LocalStorage:", error);
    }
}

function loadState() {
    try {
        const storedState = localStorage.getItem(STORAGE_KEY);
        if (storedState) {
            const parsed = JSON.parse(storedState);
            APP_STATE.decks = parsed.decks || [];
            APP_STATE.cardsByDeckId = parsed.cardsByDeckId || {};
            
            const deckExists = APP_STATE.decks.some(d => d.id === parsed.activeDeckId);
            APP_STATE.activeDeckId = deckExists ? parsed.activeDeckId : 
                                   (APP_STATE.decks.length > 0 ? APP_STATE.decks[0].id : null);
        }
    } catch (error) {
        console.error("Could not load state from LocalStorage. Corrupt data removed.", error);
        localStorage.removeItem(STORAGE_KEY);
    }
}

// --- Modal Handling (Part 2) ---
function openModal(contentHtml) {
    const modalContent = modalContainer.querySelector('.modal-content');
    modalContent.innerHTML = contentHtml;
    modalContainer.style.display = 'flex';
    
    const firstFocusable = modalContent.querySelector('input, textarea, button:not([class*="secondary"])');
    if (firstFocusable) firstFocusable.focus();
}

function closeModal() {
    modalContainer.style.display = 'none';
    modalContainer.querySelector('.modal-content').innerHTML = '';
}

// --- Deck CRUD Logic (Part 2) ---
function createDeck(name) {
    const newDeck = { id: generateId(), name: name, createdAt: Date.now() };
    APP_STATE.decks.push(newDeck);
    APP_STATE.cardsByDeckId[newDeck.id] = [];
    APP_STATE.activeDeckId = newDeck.id; 
    saveState();
    renderDeckList();
}

function updateDeckName(deckId, newName) {
    const deck = APP_STATE.decks.find(d => d.id === deckId);
    if (deck) {
        deck.name = newName;
        saveState();
        renderDeckList();
    }
}

function deleteDeck(deckId) {
    if (confirm("WARNING: This will permanently delete the deck and all its cards. Are you sure?")) {
        APP_STATE.decks = APP_STATE.decks.filter(d => d.id !== deckId);
        delete APP_STATE.cardsByDeckId[deckId];
        
        if (APP_STATE.activeDeckId === deckId) {
            APP_STATE.activeDeckId = APP_STATE.decks.length > 0 ? APP_STATE.decks[0].id : null;
        }
        
        saveState();
        renderDeckList();
    }
}

// --- Card CRUD Logic (Part 3) ---
function getCardsForActiveDeck() {
    return APP_STATE.cardsByDeckId[APP_STATE.activeDeckId] || [];
}

function getCardById(deckId, cardId) {
    const cards = APP_STATE.cardsByDeckId[deckId] || [];
    return cards.find(c => c.id === cardId);
}

function createCard(deckId, front, back) {
    if (!APP_STATE.cardsByDeckId[deckId]) {
        APP_STATE.cardsByDeckId[deckId] = [];
    }
    const newCard = { 
        id: generateId(), 
        front: front, 
        back: back, 
        updatedAt: Date.now() 
    };
    APP_STATE.cardsByDeckId[deckId].push(newCard);
    saveState();
    startStudyMode(deckId, cardSearchInput.value); 
}

function updateCard(deckId, cardId, newFront, newBack) {
    const cards = APP_STATE.cardsByDeckId[deckId];
    const index = cards.findIndex(c => c.id === cardId);
    if (index !== -1) {
        cards[index].front = newFront;
        cards[index].back = newBack;
        cards[index].updatedAt = Date.now();
        saveState();
        
        const currentCard = APP_STATE.studySession.cards.find(c => c.id === cardId);
        if (currentCard) {
            currentCard.front = newFront;
            currentCard.back = newBack;
        }
        renderStudyCard(); 
    }
}

function deleteCard(deckId, cardId) {
    if (confirm("Are you sure you want to delete this card?")) {
        APP_STATE.cardsByDeckId[deckId] = APP_STATE.cardsByDeckId[deckId].filter(c => c.id !== cardId);
        saveState();
        startStudyMode(deckId, cardSearchInput.value); 
        renderDeckList(); 
    }
}

// --- Rendering and Study Mode (Part 4 & 5) ---
function startStudyMode(deckId, searchKeyword = '') {
    const allCards = APP_STATE.cardsByDeckId[deckId] || [];
    let filteredCards = allCards;
    
    // Apply Search/Filter
    if (searchKeyword.trim()) {
        const keyword = searchKeyword.toLowerCase();
        filteredCards = allCards.filter(card => 
            card.front.toLowerCase().includes(keyword) || 
            card.back.toLowerCase().includes(keyword)
        );
    }
    
    let newIndex = APP_STATE.studySession.currentIndex;
    if (newIndex >= filteredCards.length) {
        newIndex = Math.max(0, filteredCards.length - 1);
    }
    
    APP_STATE.studySession = {
        cards: filteredCards,
        currentIndex: newIndex,
        isFlipped: false,
    };
    
    document.getElementById('searchCount').textContent = searchKeyword.trim() 
        ? `(${filteredCards.length} matching cards)` 
        : '';

    renderStudyCard();
}

function flipCard() {
    if (APP_STATE.studySession.cards.length === 0) return;
    APP_STATE.studySession.isFlipped = !APP_STATE.studySession.isFlipped;
    renderStudyCard();
}

function navigateCard(direction) {
    let newIndex = APP_STATE.studySession.currentIndex + direction;
    const cardsCount = APP_STATE.studySession.cards.length;

    if (newIndex >= 0 && newIndex < cardsCount) {
        APP_STATE.studySession.currentIndex = newIndex;
        APP_STATE.studySession.isFlipped = false; 
        renderStudyCard();
    }
}

function renderStudyCard() {
    const { cards, currentIndex, isFlipped } = APP_STATE.studySession;
    cardAreaElement.innerHTML = ''; 
    
    if (!APP_STATE.activeDeckId) {
        cardAreaElement.innerHTML = `<p class="empty-state" id="noCardsMessage">Select a deck or add cards.</p>`;
        return; 
    }
    
    const currentDeckCards = getCardsForActiveDeck();
    const isFiltered = cards.length < currentDeckCards.length;

    if (currentDeckCards.length === 0) {
        cardAreaElement.innerHTML = `<p class="empty-state" id="noCardsMessage">No cards in this deck. Add one!</p>`;
    } else if (cards.length === 0 && isFiltered) {
        cardAreaElement.innerHTML = `<p class="empty-state" id="noCardsMessage">No cards found matching search term.</p>`;
    } else {
        const card = cards[currentIndex];
        
        const cardElement = document.createElement('div');
        cardElement.className = `study-card ${isFlipped ? 'is-flipped' : ''}`;
        cardElement.dataset.cardId = card.id; 
        
        // --- CORRECTED CARD CONTENT RENDERING ---
        cardElement.innerHTML = `
            <div class="card-face card-face-front">
                <p>${card.front}</p>
                <div class="card-actions">
                    <button class="edit-card-btn" data-card-id="${card.id}" aria-label="Edit card">✏️</button>
                </div>
            </div>
            <div class="card-face card-face-back">
                <p>${card.back}</p>
                <div class="card-actions">
                    <button class="edit-card-btn" data-card-id="${card.id}" aria-label="Edit card">✏️</button>
                    <button class="delete-card-btn" data-card-id="${card.id}" aria-label="Delete card">🗑️</button>
                </div>
            </div>
        `;
        // --- END CORRECTED RENDERING ---

        cardAreaElement.appendChild(cardElement);
    }
    
    const cardsInSession = APP_STATE.studySession.cards.length;
    document.getElementById('prevCardButton').disabled = currentIndex === 0 || cardsInSession === 0;
    document.getElementById('flipCardButton').disabled = cardsInSession === 0;
    document.getElementById('nextCardButton').disabled = currentIndex >= cardsInSession - 1 || cardsInSession === 0;
    document.getElementById('shuffleButton').disabled = currentDeckCards.length === 0;
}

function renderDeckList() {
    deckListElement.innerHTML = '<h2>Decks</h2>';
    
    const deckControls = [document.getElementById('cardSearch'), document.getElementById('newCardButton'), document.getElementById('shuffleButton')];

    if (APP_STATE.decks.length === 0) {
        noDecksMessage.style.display = 'block';
        activeDeckTitleElement.textContent = "Select a Deck";
        deckControls.forEach(btn => btn.disabled = true);
        document.getElementById('searchCount').textContent = '';
        cardAreaElement.innerHTML = `<p class="empty-state">No decks yet. Create one!</p>`;
        return;
    }

    noDecksMessage.style.display = 'none';
    deckControls.forEach(btn => btn.disabled = false);

    APP_STATE.decks.forEach(deck => {
        const cardCount = APP_STATE.cardsByDeckId[deck.id]?.length || 0;

        const deckItem = document.createElement('div');
        deckItem.className = `deck-item ${deck.id === APP_STATE.activeDeckId ? 'active' : ''}`;
        deckItem.dataset.deckId = deck.id;
        
        deckItem.innerHTML = `
            <span>${deck.name} (${cardCount})</span>
            <div class="deck-actions">
                <button class="edit-deck" data-deck-id="${deck.id}" aria-label="Edit ${deck.name}">✏️</button>
                <button class="delete-deck" data-deck-id="${deck.id}" aria-label="Delete ${deck.name}">🗑️</button>
            </div>
        `;
        deckListElement.appendChild(deckItem);
    });
    
    if (APP_STATE.activeDeckId) {
        const activeDeck = APP_STATE.decks.find(d => d.id === APP_STATE.activeDeckId);
        activeDeckTitleElement.textContent = activeDeck ? activeDeck.name : "Select a Deck";
        startStudyMode(APP_STATE.activeDeckId, cardSearchInput.value); 
    } else {
         activeDeckTitleElement.textContent = "Select a Deck";
         cardAreaElement.innerHTML = `<p class="empty-state">Please select a deck to start studying.</p>`;
    }
}

// --- Event Listeners ---

// 1. New Deck Button (Opens Modal)
document.getElementById('newDeckButton').addEventListener('click', () => {
    const modalHtml = `
        <h3>Create New Deck</h3>
        <label for="deckNameInput">Deck Name:</label>
        <input type="text" id="deckNameInput" value="" required>
        <div style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
            <button id="closeModalBtn" type="button" class="secondary">Cancel</button>
            <button id="saveDeckBtn">Create</button>
        </div>
    `;
    openModal(modalHtml);

    document.getElementById('saveDeckBtn').addEventListener('click', () => {
        const name = document.getElementById('deckNameInput').value.trim();
        if (name) {
            createDeck(name);
            closeModal();
        } else {
            alert('Deck name cannot be empty.');
        }
    });

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
});

// 2. Deck List Delegation (Select, Edit, Delete)
deckListElement.addEventListener('click', (e) => {
    const deckId = e.target.closest('.deck-item')?.dataset.deckId;
    if (!deckId) return;

    // Handle Edit Deck (Modal)
    const editBtn = e.target.closest('.edit-deck');
    if (editBtn) {
        const deck = APP_STATE.decks.find(d => d.id === deckId);
        if (!deck) return;
        
        const modalHtml = `
            <h3>Edit Deck Name</h3>
            <label for="editDeckNameInput">New Name:</label>
            <input type="text" id="editDeckNameInput" value="${deck.name}" required>
            <div style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
                <button id="closeModalBtn" type="button" class="secondary">Cancel</button>
                <button id="saveDeckChangesBtn">Save Changes</button>
            </div>
        `;
        openModal(modalHtml);

        document.getElementById('saveDeckChangesBtn').addEventListener('click', () => {
            const newName = document.getElementById('editDeckNameInput').value.trim();
            if (newName) {
                updateDeckName(deckId, newName);
                closeModal();
            } else {
                alert('Deck name cannot be empty.');
            }
        });
        document.getElementById('closeModalBtn').addEventListener('click', closeModal);
        return;
    }

    // Handle Delete Deck
    const deleteBtn = e.target.closest('.delete-deck');
    if (deleteBtn) {
        deleteDeck(deckId);
        return;
    }

    // Handle SELECT Deck 
    if (!e.target.closest('.deck-actions')) {
        if (APP_STATE.activeDeckId !== deckId) {
            APP_STATE.activeDeckId = deckId;
            saveState();
            renderDeckList();
        }
    }
});


// 3. New Card Button (Opens Modal)
document.getElementById('newCardButton').addEventListener('click', () => {
    if (APP_STATE.activeDeckId) {
        const deckId = APP_STATE.activeDeckId;
        const modalHtml = `
            <h3>Add New Card</h3>
            <label for="modalCardFrontInput">Front:</label>
            <textarea id="modalCardFrontInput" rows="3" required></textarea>
            
            <label for="modalCardBackInput">Back:</label>
            <textarea id="modalCardBackInput" rows="3" required></textarea>
            
            <div style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
                <button id="closeModalBtn" type="button" class="secondary">Cancel</button>
                <button id="saveCardBtn">Create Card</button>
            </div>
        `;
        openModal(modalHtml);

        document.getElementById('saveCardBtn').addEventListener('click', () => {
            const front = document.getElementById('modalCardFrontInput').value.trim();
            const back = document.getElementById('modalCardBackInput').value.trim();

            if (front && back) {
                createCard(deckId, front, back);
                closeModal();
                renderDeckList(); // Refresh list to show updated card count
            } else {
                alert('Both fields must be filled.');
            }
        });

        document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    }
});

// 4. Card Area Delegation (Edit, Delete Card actions via Modal)
cardAreaElement.addEventListener('click', (e) => {
    const activeDeckId = APP_STATE.activeDeckId;
    if (!activeDeckId) return;

    // Delete Card
    const deleteBtn = e.target.closest('.delete-card-btn');
    if (deleteBtn) {
        const cardId = deleteBtn.dataset.cardId;
        deleteCard(activeDeckId, cardId);
        return;
    }

    // Edit Card (Modal)
    const editBtn = e.target.closest('.edit-card-btn');
    if (editBtn) {
        const cardId = editBtn.dataset.cardId;
        const card = getCardById(activeDeckId, cardId);
        if (card) {
            const modalHtml = `
                <h3>Edit Card</h3>
                <label for="modalCardFrontInput">Front:</label>
                <textarea id="modalCardFrontInput" rows="3" required>${card.front}</textarea>
                
                <label for="modalCardBackInput">Back:</label>
                <textarea id="modalCardBackInput" rows="3" required>${card.back}</textarea>
                
                <div style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button id="closeModalBtn" type="button" class="secondary">Cancel</button>
                    <button id="saveCardBtn" class="primary-button" data-card-id="${cardId}">Save Changes</button>
                </div>
            `;
            
            openModal(modalHtml);
            
            document.getElementById('saveCardBtn').addEventListener('click', () => {
                const newFront = document.getElementById('modalCardFrontInput').value.trim();
                const newBack = document.getElementById('modalCardBackInput').value.trim();
        
                if (newFront && newBack) {
                    updateCard(activeDeckId, cardId, newFront, newBack);
                    closeModal();
                } else {
                    alert('Both front and back fields must be filled.');
                }
            });
            document.getElementById('closeModalBtn').addEventListener('click', closeModal);
        }
        return;
    }
});


// 5. Study Controls
document.getElementById('flipCardButton').addEventListener('click', flipCard);
document.getElementById('prevCardButton').addEventListener('click', () => navigateCard(-1));
document.getElementById('nextCardButton').addEventListener('click', () => navigateCard(1));
document.getElementById('shuffleButton').addEventListener('click', () => { 
    const cards = APP_STATE.studySession.cards;
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]]; 
    }
    APP_STATE.studySession.currentIndex = 0;
    APP_STATE.studySession.isFlipped = false;
    renderStudyCard();
    alert('Deck shuffled!');
});

// 6. Search/Filter (Debounced)
const debouncedSearch = debounce((keyword) => {
    if (APP_STATE.activeDeckId) {
        startStudyMode(APP_STATE.activeDeckId, keyword);
    }
}, 300);

cardSearchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});


// 7. Keyboard Navigation 
window.addEventListener('keydown', (e) => {
    // Modal Interaction
    if (modalContainer.style.display !== 'none') {
        if (e.key === 'Escape') closeModal();
        return;
    }
    
    // Study Mode Interaction
    if (APP_STATE.activeDeckId && APP_STATE.studySession.cards.length > 0) {
        if (e.key === ' ') {
            e.preventDefault(); 
            flipCard();
        } else if (e.key === 'ArrowLeft') {
            navigateCard(-1);
        } else if (e.key === 'ArrowRight') {
            navigateCard(1);
        }
    }
});


// --- Initialization ---
loadState();
renderDeckList();