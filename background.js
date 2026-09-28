const DB_NAME = 'gelbeseiten-scraper';
const DB_VERSION = 1;
const ITEM_STORE = 'items';
const STATE_KEY = 'scraperState';

chrome.runtime.onInstalled.addListener(() => {
    console.log('Gelbeseiten Scraper Loaded into Chrome!');
});

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(ITEM_STORE)) {
                database.createObjectStore(ITEM_STORE, { autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function runTransaction(mode, operation) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ITEM_STORE, mode);
        const store = transaction.objectStore(ITEM_STORE);

        try {
            operation(store);
        } catch (error) {
            database.close();
            reject(error);
            return;
        }

        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error('IndexedDB transaction aborted'));
        };
    });
}

function clearItems() {
    return runTransaction('readwrite', store => store.clear());
}

async function addItemAndCount(item) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ITEM_STORE, 'readwrite');
        const store = transaction.objectStore(ITEM_STORE);
        let itemCount;
        const addRequest = store.add(item);

        addRequest.onsuccess = () => {
            const countRequest = store.count();
            countRequest.onsuccess = () => {
                itemCount = countRequest.result;
            };
        };
        transaction.oncomplete = () => {
            database.close();
            resolve(itemCount);
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error('IndexedDB transaction aborted'));
        };
    });
}

async function countItems() {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ITEM_STORE, 'readonly');
        const request = transaction.objectStore(ITEM_STORE).count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    });
}

async function getAllItems() {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ITEM_STORE, 'readonly');
        const request = transaction.objectStore(ITEM_STORE).getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    });
}

async function getState() {
    const result = await chrome.storage.local.get(STATE_KEY);
    return result[STATE_KEY] || {
        active: false,
        itemCount: 0,
        tabId: null,
        runId: null,
        includeEmails: false
    };
}

async function setState(changes) {
    const state = { ...await getState(), ...changes };
    await chrome.storage.local.set({ [STATE_KEY]: state });
    return state;
}

let messageQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const operation = messageQueue.then(() => handleMessage(request, sender));
    messageQueue = operation.catch(() => {});

    operation
        .then(result => sendResponse(result))
        .catch(error => {
            console.error(error);
            sendResponse({ ok: false, error: error.message });
        });

    return true;
});

async function handleMessage(request, sender) {
    if (request.message === 'start_scraping') return startScraping(request.includeEmails === true);
    if (request.message === 'stop_scraping') return stopAndExport(request.type);
    if (request.message === 'reset_scraping') return resetScraping();
    if (request.message === 'get_status') {
        const state = await getState();
        const itemCount = await countItems();
        if (state.itemCount !== itemCount) await setState({ itemCount });
        return { ok: true, ...state, itemCount };
    }

    if (request.message?.type === 'ITEM') {
        return persistItem(request.message, sender);
    }

    if (request.message?.type === 'SCRAPING_FINISHED') {
        const state = await getState();
        if (state.runId === request.message.runId) {
            const nextState = await setState({ active: false });
            notifyState(nextState);
        }
        return { ok: true };
    }

    return { ok: false, error: 'Unknown message' };
}

async function startScraping(includeEmails) {
    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
        url: 'https://www.gelbeseiten.de/*'
    });
    if (tabs.length === 0) {
        throw new Error('Open a Gelbe Seiten results page before starting.');
    }

    const tabId = tabs[0].id;
    const runId = crypto.randomUUID();
    const previousState = await getState();

    if (previousState.active && previousState.tabId) {
        await sendTabMessage(previousState.tabId, { type: 'STOP_SCRAPING' });
    }

    await clearItems();
    await setState({ active: true, itemCount: 0, tabId, runId, includeEmails });

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['scraper-script.js']
        });
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'START_SCRAPING',
            runId,
            includeEmails
        });
        if (!response?.ok) {
            throw new Error(response?.error || 'The page did not start the scraper.');
        }
    } catch (error) {
        await setState({ active: false });
        throw error;
    }

    return { ok: true, active: true, itemCount: 0 };
}

async function persistItem(message, sender) {
    const state = await getState();

    if (!state.active || state.runId !== message.runId || sender.tab?.id !== state.tabId) {
        return { ok: false, stopped: true, itemCount: state.itemCount };
    }

    const itemCount = await addItemAndCount(message.obj);
    const nextState = await setState({ itemCount });

    chrome.runtime.sendMessage({
        message: 'COUNTER_UPDATED',
        count: nextState.itemCount
    }).catch(() => {
        // The popup is normally closed while a scrape is running.
    });

    return { ok: true, itemCount: nextState.itemCount };
}

async function stopAndExport(type = 'json') {
    const state = await setState({ active: false });

    if (state.tabId) {
        await sendTabMessage(state.tabId, { type: 'STOP_SCRAPING' });
    }

    const items = await getAllItems();
    if (items.length === 0) {
        throw new Error('No persisted data is available for export.');
    }

    await exportItems(items, type);
    return { ok: true, active: false, itemCount: items.length };
}

async function resetScraping() {
    const state = await getState();

    await setState({ active: false });
    if (state.tabId) {
        await sendTabMessage(state.tabId, { type: 'STOP_SCRAPING' });
    }

    await clearItems();
    const nextState = await setState({
        active: false,
        itemCount: 0,
        tabId: null,
        runId: null,
        includeEmails: false
    });
    notifyState(nextState);

    return { ok: true, ...nextState };
}

function notifyState(state) {
    chrome.runtime.sendMessage({
        message: 'SCRAPER_STATE_UPDATED',
        active: state.active,
        itemCount: state.itemCount,
        includeEmails: state.includeEmails
    }).catch(() => {
        // The popup is normally closed while a scrape is running.
    });
}

async function sendTabMessage(tabId, message) {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        // The tab may have been closed or navigated. Persisted results remain exportable.
    }
}

async function exportItems(items, type) {
    if (type === 'csv') {
        await download(jsonToCsv(items), 'exported_data.csv', 'text/csv');
        return;
    }

    await download(JSON.stringify(items), 'exported_data.json', 'application/json');
}

function jsonToCsv(jsonArray) {
    if (jsonArray.length === 0) return '';

    const headerKeys = Object.keys(jsonArray[0]);
    const escapeCsvValue = value => {
        const stringValue = String(value ?? '');
        return /[",\r\n]/.test(stringValue)
            ? `"${stringValue.replace(/"/g, '""')}"`
            : stringValue;
    };
    const rows = jsonArray.map(item => headerKeys.map(key => escapeCsvValue(item[key])).join(','));

    return [headerKeys.join(','), ...rows].join('\n');
}

function download(data, filename, mimeType) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: `data:${mimeType};charset=utf-8,${encodeURIComponent(data)}`,
            filename,
            saveAs: true
        }, downloadId => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (!downloadId) {
                reject(new Error(`Failed to initiate download for ${filename}`));
            } else {
                resolve(downloadId);
            }
        });
    });
}
