// Global state
const APP_STATE = {
    routes: [],
    currentRoute: null,
    isAuthenticated: false,
    routesData: {},
    currentMarkerIndex: null,
    statusOptions: {
        PENDING: "pending",
        YES: "yes",
        NO: "no"
    }
};

// DOM Elements
const elements = {
    // Pages
    loginPage: document.getElementById('loginPage'),
    mainMenu: document.getElementById('mainMenu'),
    routeDetail: document.getElementById('routeDetail'),

    // Login
    passwordInput: document.getElementById('password'),
    loginButton: document.getElementById('loginButton'),
    passwordError: document.getElementById('passwordError'),

    // Main Menu
    routesContainer: document.getElementById('routesContainer'),
    logoutButton: document.getElementById('logoutButton'),

    // Route Detail
    backButton: document.getElementById('backButton'),
    routeTitle: document.getElementById('routeTitle'),
    totalMarkers: document.getElementById('totalMarkers'),
    deliveredCount: document.getElementById('deliveredCount'),
    notDeliveredCount: document.getElementById('notDeliveredCount'),
    pendingCount: document.getElementById('pendingCount'),
    markersTableBody: document.getElementById('markersTableBody'),

    // Delivery Modal
    deliveryModal: document.getElementById('deliveryModal'),
    deliveryPlaceName: document.getElementById('deliveryPlaceName'),
    commentsInput: document.getElementById('commentsInput'),
    noDeliveryHelp: document.getElementById('noDeliveryHelp'),
    commentError: document.getElementById('commentError'),
    saveDeliveryBtn: document.getElementById('saveDeliveryBtn'),
    modalCloseBtn: document.querySelector('.modal-close-btn'),

    // Loading
    loadingOverlay: document.getElementById('loadingOverlay')
};

// Constants
const PASSWORD = 'AEM';
const ROUTES_JSON_PATH = 'routes.json';
const STORAGE_KEY = 'routeDeliveryStatus';

// Helper Functions
function showPage(pageElement) {
    elements.loginPage.classList.add('hidden');
    elements.mainMenu.classList.add('hidden');
    elements.routeDetail.classList.add('hidden');

    pageElement.classList.remove('hidden');
}

function showLoading() {
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

function getAddress(position) {
    return `Lat: ${position.lat.toFixed(6)}, Lng: ${position.lng.toFixed(6)}`;
}

function getMapsUrl(position) {
    return `https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`;
}

async function getSavedData() {
    try {
        // Intentar cargar desde Firebase
        const { ref, get } = window.firebaseApp;
        const database = window.firebaseApp.database;
        const routesRef = ref(database, 'routesData');

        const snapshot = await get(routesRef);
        const data = snapshot.val();

        if (data) {
            return data;
        }
    } catch (error) {
        console.error('Error al cargar datos de Firebase:', error);
    }

    // Si falla Firebase, usar localStorage como respaldo
    const savedData = localStorage.getItem(STORAGE_KEY);
    return savedData ? JSON.parse(savedData) : {};
}

function saveData() {
    // Guardar en localStorage como respaldo
    localStorage.setItem(STORAGE_KEY, JSON.stringify(APP_STATE.routesData));

    try {
        // Guardar en Firebase
        const { ref, set } = window.firebaseApp;
        const database = window.firebaseApp.database;
        const routesRef = ref(database, 'routesData');

        set(routesRef, APP_STATE.routesData)
            .catch(error => {
                console.error('Error al guardar en Firebase:', error);
            });
    } catch (error) {
        console.error('Error al guardar en Firebase:', error);
    }
}

// Modal Functions
function showModal(modal) {
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function hideModal(modal) {
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function setupDeliveryModal(index, title) {
    APP_STATE.currentMarkerIndex = index;
    elements.deliveryPlaceName.textContent = title;
    showModal(elements.deliveryModal);
}

function setupReasonModal(index, title) {
    APP_STATE.currentMarkerIndex = index;
    elements.reasonPlaceName.textContent = title;

    // Get current reason if exists
    const routeId = APP_STATE.currentRoute.id;
    const reason = APP_STATE.routesData[routeId].markers[index].reason || '';
    elements.reasonInput.value = reason;

    showModal(elements.reasonModal);
}

function setupCommentsModal(index, title) {
    APP_STATE.currentMarkerIndex = index;
    elements.commentsPlaceName.textContent = title;

    // Get current comments if exists
    const routeId = APP_STATE.currentRoute.id;
    const comments = APP_STATE.routesData[routeId].markers[index].comments || '';
    elements.commentsInput.value = comments;

    showModal(elements.commentsModal);
}

// Setup realtime synchronization with Firebase
function setupRealtimeSync() {
    try {
        const { ref, onValue } = window.firebaseApp;
        const database = window.firebaseApp.database;
        const routesRef = ref(database, 'routesData');

        // Listen for changes in the data
        onValue(routesRef, (snapshot) => {
            const newData = snapshot.val();

            // Only update if we're in a route and have data
            if (newData && APP_STATE.currentRoute) {
                // Check if the data for the current route has changed
                const currentRouteId = APP_STATE.currentRoute.id;
                const currentRouteData = APP_STATE.routesData[currentRouteId];
                const newRouteData = newData[currentRouteId];

                // Only update if the data has actually changed
                if (JSON.stringify(currentRouteData) !== JSON.stringify(newRouteData)) {
                    console.log('Datos actualizados desde Firebase');

                    // Update local data
                    APP_STATE.routesData = newData;

                    // Update the UI
                    renderRouteDetail();

                    // Also save to localStorage as backup
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(APP_STATE.routesData));
                }
            }
        });
    } catch (error) {
        console.error('Error al configurar sincronización en tiempo real:', error);
    }
}

// Load Route Data
async function loadRouteData() {
    showLoading();

    try {
        const response = await fetch(ROUTES_JSON_PATH);
        if (!response.ok) {
            throw new Error('Failed to load routes');
        }

        const data = await response.json();
        APP_STATE.routes = data;

        // Initialize saved data from Firebase or localStorage
        const savedData = await getSavedData();
        APP_STATE.routesData = savedData;

        // Initialize data for new routes if not already saved
        APP_STATE.routes.forEach(route => {
            if (!APP_STATE.routesData[route.id]) {
                APP_STATE.routesData[route.id] = {
                    markers: {}
                };

                // Initialize marker data
                if (route.markerPositions) {
                    route.markerPositions.forEach((marker, index) => {
                        APP_STATE.routesData[route.id].markers[index] = {
                            status: APP_STATE.statusOptions.PENDING,
                            comments: ''
                        };
                    });
                }
            }
        });

        // Save the initialized data
        saveData();

        hideLoading();
        return true;
    } catch (error) {
        console.error('Error loading route data:', error);
        hideLoading();
        return false;
    }
}

// Render Functions
function renderRoutes() {
    elements.routesContainer.innerHTML = '';

    APP_STATE.routes.forEach(route => {
        // Skip routes with no markers or hidden routes
        if (!route.markerPositions || route.markerPositions.length === 0) {
            return;
        }

        // Get markers stats
        const routeData = APP_STATE.routesData[route.id];
        let deliveredCount = 0;
        let notDeliveredCount = 0;
        let pendingCount = 0;

        if (routeData && routeData.markers) {
            Object.values(routeData.markers).forEach(m => {
                if (m.status === APP_STATE.statusOptions.YES) {
                    deliveredCount++;
                } else if (m.status === APP_STATE.statusOptions.NO) {
                    notDeliveredCount++;
                } else if (m.status === APP_STATE.statusOptions.PENDING) {
                    pendingCount++;
                }
            });
        }

        const totalMarkers = route.markerPositions.length;

        // Create route card
        const routeCard = document.createElement('div');
        routeCard.className = 'route-card';
        routeCard.dataset.routeId = route.id;

        routeCard.innerHTML = `
            <div class="route-color" style="background-color: ${route.color}"></div>
            <div class="route-content">
                <div class="route-name">${route.name}</div>
                <div class="route-stats">
                    <span><i class="fas fa-map-marker-alt"></i> ${totalMarkers}</span>
                    <span><i class="fas fa-check-circle" style="color: var(--success)"></i> ${deliveredCount}</span>
                </div>
            </div>
        `;

        routeCard.addEventListener('click', () => openRouteDetail(route));
        elements.routesContainer.appendChild(routeCard);
    });
}

function openRouteDetail(route) {
    APP_STATE.currentRoute = route;
    elements.routeTitle.textContent = route.name;

    renderRouteDetail();
    showPage(elements.routeDetail);
}

function renderRouteDetail() {
    const route = APP_STATE.currentRoute;
    if (!route) return;

    const routeData = APP_STATE.routesData[route.id];

    // Count statistics
    let deliveredCount = 0;
    let notDeliveredCount = 0;

    const totalMarkers = route.markerPositions ? route.markerPositions.length : 0;

    // Contar solo los explícitamente marcados como Sí o No
    if (routeData && routeData.markers) {
        Object.entries(routeData.markers).forEach(([index, m]) => {
            if (m.status === APP_STATE.statusOptions.YES) {
                deliveredCount++;
            } else if (m.status === APP_STATE.statusOptions.NO) {
                notDeliveredCount++;
            }
        });
    }

    // Pendientes = Total - (Sí + No)
    const pendingCount = totalMarkers - (deliveredCount + notDeliveredCount);

    // Update status counts
    elements.totalMarkers.textContent = totalMarkers;
    elements.deliveredCount.textContent = deliveredCount;
    elements.notDeliveredCount.textContent = notDeliveredCount;
    elements.pendingCount.textContent = pendingCount;

    // Clear existing markers
    elements.markersTableBody.innerHTML = '';

    // Add markers to table
    if (route.markerPositions && route.markerPositions.length > 0) {
        route.markerPositions.forEach((marker, index) => {
            // Asegurarse de que exista un estado para cada marcador
            if (!routeData.markers[index]) {
                routeData.markers[index] = {
                    status: APP_STATE.statusOptions.PENDING,
                    comments: ''
                };
            }

            const markerData = routeData.markers[index];
            const mapsUrl = getMapsUrl(marker.position);

            // Create marker row
            const row = document.createElement('tr');
            row.className = 'marker-row';
            row.dataset.index = index;

            // Add CSS class based on status
            if (markerData.status === APP_STATE.statusOptions.YES) {
                row.classList.add('delivered');
            } else if (markerData.status === APP_STATE.statusOptions.NO) {
                row.classList.add('not-delivered');
            }

            // Set status icons
            let statusIcon, statusClass;
            if (markerData.status === APP_STATE.statusOptions.YES) {
                statusIcon = 'check';
                statusClass = 'status-yes';
            } else if (markerData.status === APP_STATE.statusOptions.NO) {
                statusIcon = 'times';
                statusClass = 'status-no';
            } else {
                statusIcon = 'clock';
                statusClass = 'status-pending';
            }

            // Create cells
            row.innerHTML = `
                <td>${marker.title}</td>
                <td class="status-cell">
                    <div class="status-indicator ${statusClass}">
                        <i class="fas fa-${statusIcon}"></i>
                    </div>
                </td>
                <td class="maps-cell">
                    <a href="${mapsUrl}" target="_blank" class="maps-link">
                        <i class="fas fa-map-marked-alt"></i>
                    </a>
                </td>
            `;

            elements.markersTableBody.appendChild(row);

            // Add click event to the entire row
            row.addEventListener('click', function(e) {
                // Check if click was on the maps icon, if so, don't open modal
                if (e.target.closest('.maps-link')) {
                    return;
                }

                openDeliveryModal(index, marker.title, markerData);
            });
        });
    } else {
        // No markers
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="3" style="text-align: center;">No hay lugares en esta ruta</td>
        `;
        elements.markersTableBody.appendChild(emptyRow);
    }
}

function openDeliveryModal(index, title, markerData) {
    APP_STATE.currentMarkerIndex = index;
    elements.deliveryPlaceName.textContent = title;

    // Reset error message
    elements.commentError.classList.add('hidden');

    // Set the current status in the modal
    document.querySelectorAll('input[name="deliveryStatus"]').forEach(radio => {
        radio.checked = radio.value === markerData.status;
    });

    // Fill in comments
    elements.commentsInput.value = markerData.comments || '';

    // Show/hide the "NO" help text based on status
    elements.noDeliveryHelp.classList.toggle('hidden', markerData.status !== APP_STATE.statusOptions.NO);

    // Add change listener to radio buttons
    document.querySelectorAll('input[name="deliveryStatus"]').forEach(radio => {
        radio.addEventListener('change', function() {
            // Show/hide the "NO" help text based on selection
            elements.noDeliveryHelp.classList.toggle('hidden', this.value !== APP_STATE.statusOptions.NO);
        });
    });

    // Show the modal
    showModal(elements.deliveryModal);
}

// Update Functions
function updateMarkerStatus(index, status) {
    const routeId = APP_STATE.currentRoute.id;
    if (!APP_STATE.routesData[routeId].markers[index]) {
        APP_STATE.routesData[routeId].markers[index] = {
            status: APP_STATE.statusOptions.PENDING,
            comments: ''
        };
    }

    APP_STATE.routesData[routeId].markers[index].status = status;

    // Guardar automáticamente al actualizar un estado
    saveData();
}

function updateMarkerComments(index, comments) {
    const routeId = APP_STATE.currentRoute.id;
    APP_STATE.routesData[routeId].markers[index].comments = comments;

    // Guardar automáticamente al actualizar comentarios
    saveData();
}

// Event Handlers
function setupEventListeners() {
    // Login
    elements.loginButton.addEventListener('click', handleLogin);
    elements.passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    // Main Menu
    elements.logoutButton.addEventListener('click', handleLogout);

    // Route Detail
    elements.backButton.addEventListener('click', function() {
        showPage(elements.mainMenu);
        APP_STATE.currentRoute = null;
    });

    // Delivery Modal
    elements.saveDeliveryBtn.addEventListener('click', function() {
        const index = APP_STATE.currentMarkerIndex;
        // Get selected status
        const selectedStatus = document.querySelector('input[name="deliveryStatus"]:checked').value;

        // Validate - comments are only required for "yes" and "no" status, not for "pending"
        if (selectedStatus !== APP_STATE.statusOptions.PENDING && !elements.commentsInput.value.trim()) {
            elements.commentError.classList.remove('hidden');
            return;
        }

        // Update marker data
        updateMarkerStatus(index, selectedStatus);
        updateMarkerComments(index, elements.commentsInput.value.trim());

        // Close modal and update UI
        hideModal(elements.deliveryModal);
        renderRouteDetail();
    });

    // Close modal button
    elements.modalCloseBtn.addEventListener('click', function() {
        hideModal(elements.deliveryModal);
    });

    // Close modal when clicking on overlay
    document.querySelector('.modal-overlay').addEventListener('click', function() {
        hideModal(elements.deliveryModal);
    });
}

function handleLogin() {
    const password = elements.passwordInput.value;

    if (password === PASSWORD) {
        APP_STATE.isAuthenticated = true;
        elements.passwordError.classList.add('hidden');
        elements.passwordInput.value = '';

        loadRouteData().then(success => {
            if (success) {
                renderRoutes();
                showPage(elements.mainMenu);
            } else {
                alert('Error al cargar los datos de rutas. Inténtelo de nuevo.');
            }
        });
    } else {
        elements.passwordError.classList.remove('hidden');
        elements.passwordInput.focus();
    }
}

function handleLogout() {
    APP_STATE.isAuthenticated = false;
    APP_STATE.currentRoute = null;
    elements.passwordInput.value = '';
    showPage(elements.loginPage);
}

// Check if user was previously authenticated
function checkAuthentication() {
    // For this app we don't persist authentication
    // We always start with the login page
    showPage(elements.loginPage);
}

// Initialization
function init() {
    setupEventListeners();
    checkAuthentication();
    // Setup Firebase realtime sync
    setupRealtimeSync();
}

// Start the app when the document is loaded
document.addEventListener('DOMContentLoaded', init);
