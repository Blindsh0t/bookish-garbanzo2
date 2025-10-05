// Global state
let allTabs = [];
let currentWindowId = null;

// Generic tab patterns to ignore
const genericTabPatterns = [
    /^chrome:\/\/newtab\/$/,
    /^chrome:\/\/settings/,
    /^chrome:\/\/extensions/,
    /^about:/,
    /^chrome-extension:/
];

// Initialize on popup load
document.addEventListener('DOMContentLoaded', async () => {
    await loadTabs();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    document.getElementById('quickSaveBtn').addEventListener('click', handleQuickSave);
    document.getElementById('saveExceptIncognitoBtn').addEventListener('click', handleSaveExceptIncognito);
    document.getElementById('selectAllBtn').addEventListener('click', handleSelectAll);
    document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
    document.getElementById('saveTabsBtn').addEventListener('click', handleSaveTabs);
}

// Load all tabs from all windows
async function loadTabs() {
    try {
        // Get current window
        const currentWindow = await chrome.windows.getCurrent();
        currentWindowId = currentWindow.id;

        // Get all windows
        const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });

        // Check if incognito access is allowed
        const isIncognitoAllowed = await chrome.extension.isAllowedIncognitoAccess();

        if (!isIncognitoAllowed) {
            document.getElementById('permissionNotice').style.display = 'block';
        }

        // Organize tabs by window
        const tabsByWindow = [];
        let hasIncognito = false;
        let hasMultipleWindows = windows.length > 1;

        windows.forEach(window => {
            const tabs = window.tabs.filter(tab => {
                const isGeneric = genericTabPatterns.some(pattern => pattern.test(tab.url));
                return !isGeneric;
            });

            if (tabs.length > 0) {
                tabsByWindow.push({
                    windowId: window.id,
                    isIncognito: window.incognito,
                    isCurrentWindow: window.id === currentWindowId,
                    tabs: tabs
                });

                if (window.incognito) {
                    hasIncognito = true;
                }
            }
        });

        allTabs = tabsByWindow;

        // Show/hide "Save Except Incognito" button
        if (hasMultipleWindows) {
            document.getElementById('saveExceptIncognitoBtn').style.display = 'inline-block';
        }

        displayTabs(tabsByWindow);
    } catch (error) {
        console.error("Error loading tabs:", error);
        showStatus("Error loading tabs. Please try again.", 'error');
    }
}

// Display tabs in the UI
function displayTabs(tabsByWindow) {
    const container = document.getElementById('tabsList');
    container.innerHTML = '';

    tabsByWindow.forEach((windowData, windowIndex) => {
        const section = document.createElement('div');
        section.className = 'window-section';

        const header = document.createElement('div');
        header.className = 'window-header';

        if (windowData.isIncognito) {
            header.textContent = 'Incognito Window';
        } else if (windowData.isCurrentWindow) {
            header.textContent = 'Current Window';
        } else {
            header.textContent = `Window ${windowIndex + 1}`;
        }

        section.appendChild(header);

        windowData.tabs.forEach(tab => {
            const tabItem = createTabItem(tab, windowData.windowId);
            section.appendChild(tabItem);
        });

        container.appendChild(section);
    });
}

// Create a single tab item
function createTabItem(tab, windowId) {
    const item = document.createElement('div');
    item.className = 'tab-item';
    item.title = tab.url;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `tab-${tab.id}`;
    checkbox.dataset.tabId = tab.id;
    checkbox.dataset.windowId = windowId;
    checkbox.addEventListener('change', updateSaveButtonVisibility);

    const label = document.createElement('label');
    label.htmlFor = `tab-${tab.id}`;
    label.textContent = tab.title || tab.url;

    item.appendChild(checkbox);
    item.appendChild(label);

    return item;
}

// Quick Save: Only current window, exclude incognito
async function handleQuickSave() {
    const checkboxes = document.querySelectorAll('#tabsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const windowId = parseInt(checkbox.dataset.windowId);
        const isCurrentWindow = windowId === currentWindowId;
        const windowData = allTabs.find(w => w.windowId === windowId);
        const isIncognito = windowData ? windowData.isIncognito : false;

        checkbox.checked = isCurrentWindow && !isIncognito;
    });

    updateSaveButtonVisibility();
    await handleSaveTabs();
}

// Save Except Incognito: All windows except incognito
function handleSaveExceptIncognito() {
    const checkboxes = document.querySelectorAll('#tabsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const windowId = parseInt(checkbox.dataset.windowId);
        const windowData = allTabs.find(w => w.windowId === windowId);
        const isIncognito = windowData ? windowData.isIncognito : false;

        checkbox.checked = !isIncognito;
    });

    updateSaveButtonVisibility();
}

// Select All
function handleSelectAll() {
    const checkboxes = document.querySelectorAll('#tabsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });

    updateSaveButtonVisibility();
}

// Clear All
function handleClearAll() {
    const checkboxes = document.querySelectorAll('#tabsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    updateSaveButtonVisibility();
}

// Update Save button visibility
function updateSaveButtonVisibility() {
    const checkboxes = document.querySelectorAll('#tabsList input[type="checkbox"]');
    const anyChecked = Array.from(checkboxes).some(cb => cb.checked);

    const saveBtn = document.getElementById('saveTabsBtn');
    if (anyChecked) {
        saveBtn.classList.add('show');
    } else {
        saveBtn.classList.remove('show');
    }
}

// Save selected tabs
async function handleSaveTabs() {
    const checkboxes = document.querySelectorAll('#tabsList input[type="checkbox"]:checked');

    if (checkboxes.length === 0) {
        showStatus("No tabs selected", 'error');
        return;
    }

    try {
        // Get today's date for folder name
        const today = new Date();
        const folderName = today.toISOString().split('T')[0];

        // Check if folder already exists
        const existingFolders = await chrome.bookmarks.search({ title: folderName });
        let mainFolder;

        if (existingFolders.length > 0) {
            // Use existing folder
            mainFolder = existingFolders[0];
        } else {
            // Create new folder
            mainFolder = await chrome.bookmarks.create({ title: folderName });
        }

        // Get existing bookmarks in the folder to avoid duplicates
        const existingBookmarks = await chrome.bookmarks.getChildren(mainFolder.id);
        const existingUrls = new Set();

        for (const bookmark of existingBookmarks) {
            if (bookmark.url) {
                existingUrls.add(bookmark.url);
            } else {
                // It's a subfolder, get its children
                const subfolderBookmarks = await chrome.bookmarks.getChildren(bookmark.id);
                subfolderBookmarks.forEach(b => {
                    if (b.url) existingUrls.add(b.url);
                });
            }
        }

        // Organize selected tabs by window
        const selectedTabs = Array.from(checkboxes).map(cb => {
            const tabId = parseInt(cb.dataset.tabId);
            const windowId = parseInt(cb.dataset.windowId);
            const windowData = allTabs.find(w => w.windowId === windowId);
            const tab = windowData.tabs.find(t => t.id === tabId);

            return {
                ...tab,
                windowId: windowId,
                isIncognito: windowData.isIncognito,
                isCurrentWindow: windowData.isCurrentWindow
            };
        });

        // Group by window
        const tabsByWindow = {};
        selectedTabs.forEach(tab => {
            const key = tab.isIncognito ? 'incognito' : `window-${tab.windowId}`;
            if (!tabsByWindow[key]) {
                tabsByWindow[key] = {
                    tabs: [],
                    isIncognito: tab.isIncognito,
                    windowId: tab.windowId,
                    isCurrentWindow: tab.isCurrentWindow
                };
            }
            tabsByWindow[key].tabs.push(tab);
        });

        const windowKeys = Object.keys(tabsByWindow);
        const hasMultipleNonIncognitoWindows = windowKeys.filter(k => k !== 'incognito').length > 1;

        let savedCount = 0;

        // Save tabs
        for (const [key, windowData] of Object.entries(tabsByWindow)) {
            let parentFolderId = mainFolder.id;

            // Create subfolder if multiple windows or incognito
            if (hasMultipleNonIncognitoWindows || windowData.isIncognito) {
                let subfolderName;

                if (windowData.isIncognito) {
                    subfolderName = '$Temp';
                } else if (windowData.isCurrentWindow) {
                    subfolderName = 'Window 1';
                } else {
                    // Count which window number this is
                    const nonIncognitoKeys = windowKeys.filter(k => k !== 'incognito').sort();
                    const windowNumber = nonIncognitoKeys.indexOf(key) + 1;
                    subfolderName = `Window ${windowNumber}`;
                }

                // Check if subfolder exists
                const existingSubfolders = existingBookmarks.filter(b => !b.url && b.title === subfolderName);
                let subfolder;

                if (existingSubfolders.length > 0) {
                    subfolder = existingSubfolders[0];
                } else {
                    subfolder = await chrome.bookmarks.create({
                        parentId: mainFolder.id,
                        title: subfolderName
                    });
                }

                parentFolderId = subfolder.id;
            }

            // Save tabs to the appropriate folder
            for (const tab of windowData.tabs) {
                // Skip if already exists
                if (!existingUrls.has(tab.url)) {
                    await chrome.bookmarks.create({
                        parentId: parentFolderId,
                        title: tab.title,
                        url: tab.url
                    });
                    savedCount++;
                }
            }
        }

        showStatus(`Successfully saved ${savedCount} tab(s) to "${folderName}"`, 'success');

        // Clear selections after successful save
        setTimeout(() => {
            handleClearAll();
        }, 1500);

    } catch (error) {
        console.error("Error saving tabs:", error);
        showStatus("Error saving tabs. Please try again.", 'error');
    }
}

// Show status message
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;

    if (type === 'success') {
        setTimeout(() => {
            statusEl.className = 'status-message';
        }, 3000);
    }
}