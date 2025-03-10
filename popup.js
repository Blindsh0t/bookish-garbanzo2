document.getElementById('saveTabs').addEventListener('click', async () => {
    // Get today's date for the folder name
    const today = new Date();
    const folderName = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Define generic tab patterns to ignore
    const genericTabPatterns = [
        /^chrome:\/\/newtab\/$/,
        /^chrome:\/\/settings/,
        /^chrome:\/\/extensions/,
        /^about:/
    ];

    try {
        // Get non-incognito tabs in the current window
        const tabs = await chrome.tabs.query({ currentWindow: true, windowType: "normal" });
        const tabsToSave = tabs.filter(tab => {
            const isGeneric = genericTabPatterns.some(pattern => pattern.test(tab.url));
            return !isGeneric && !tab.incognito;
        });

        // Get all incognito tabs
        const allTabs = await chrome.tabs.query({ windowType: "normal" });
        const incognitoTabsToSave = allTabs.filter(tab => tab.incognito);
        const allTabsToSave = [...tabsToSave, ...incognitoTabsToSave];
        // Display checklist in the popup
        displayChecklist(allTabsToSave, folderName);
    } catch (error) {
        console.error("Error querying tabs:", error);
        alert("An error occurred while preparing the tabs. Please check the console for more information.");
    }
});

// Function to display the checklist in the popup
function displayChecklist(tabs, folderName) {
    const checklistContainer = document.getElementById('checklist');
    checklistContainer.innerHTML = ''; // Clear any existing list

    tabs.forEach(tab => {
        const listItem = createChecklistItem(tab);
        checklistContainer.appendChild(listItem);
    });

    // Create a save button
    const saveButton = document.createElement('button');
    saveButton.textContent = "Save Checked Tabs";
    saveButton.id = "finalSave";
    checklistContainer.appendChild(saveButton);

    // Listener for the new Save button
    document.getElementById('finalSave').addEventListener('click', () => {
        const checkedTabs = tabs.filter(tab => document.getElementById(tab.id).checked);
        saveSelectedTabs(checkedTabs, folderName);
    });
}

// Function to create a single checklist item
function createChecklistItem(tab) {
    const listItem = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = tab.id;
    checkbox.checked = true; // Default: checked
    const label = document.createElement('label');
    label.htmlFor = tab.id;
    label.textContent = tab.title + " - " + tab.url;

    listItem.appendChild(checkbox);
    listItem.appendChild(label);
    return listItem;
}

async function saveSelectedTabs(tabs, folderName) {
    try {
        // Create the main folder
        const mainFolder = await chrome.bookmarks.create({ title: folderName });

        const incognitoTabsToSave = tabs.filter(tab => tab.incognito);
        const nonIncognitoTabsToSave = tabs.filter(tab => !tab.incognito);

        // Save non-incognito tabs from the current window
        await Promise.all(nonIncognitoTabsToSave.map(async tab => {
            await chrome.bookmarks.create({
                parentId: mainFolder.id,
                title: tab.title,
                url: tab.url
            });
        }));

        if (incognitoTabsToSave.length > 0) {
            // Create a subfolder named "$Temp" for incognito tabs
            const incognitoFolder = await chrome.bookmarks.create({
                parentId: mainFolder.id,
                title: "$Temp"
            });

            await Promise.all(incognitoTabsToSave.map(async tab => {
                await chrome.bookmarks.create({
                    parentId: incognitoFolder.id,
                    title: tab.title,
                    url: tab.url
                });
            }));
        }
        // Notify the user
        alert(`Successfully saved ${tabs.length} tabs in folder "${folderName}".`);
    } catch (error) {
        console.error("Error saving bookmarks:", error);
        alert("An error occurred while saving the bookmarks. Please check the console for more information.");
    }
}
