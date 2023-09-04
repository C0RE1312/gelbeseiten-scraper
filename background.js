chrome.runtime.onInstalled.addListener(() => {
    console.log('Gelbeseiten Scraper Loaded into Chrome!');
});

let items = [];
let stop = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'start_scraping') {
        stop = false;
        items = [];
        chrome.tabs.query({ active: true, url: 'https://www.gelbeseiten.de/*' }, function (tabs) {
            if (tabs.length > 0) {
                const currentTabId = tabs[0].id;
                chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    files: ["scraper-script.js"]
                });
            }
        });
        return true;
    } else if (request.message === 'stop_scraping') {
        stop = true;
        export_items(request.type);
        return true;
    } else if (request.message['type'] === 'ITEM') {
        add_item(request.message['obj']);
        
        if (!stop) {
            sendResponse({ ok: true });
        }

        chrome.runtime.sendMessage({
            message: "INC_COUNTER"
        });

        return true;
    }
    return true;
});

function add_item(item) {
    items.push(item);
}

function export_items(type = 'json') {
    if (items.length === 0) {
        console.log("No data available for export.");
        return;
    }

    if (type === 'json') {
        export_json();
    } else if (type === 'csv') {
        export_csv();
    }
}

function export_json() {
    const jsonData = JSON.stringify(items);
    const filename = "exported_data.json";
    download(jsonData, filename, 'json');
}

function export_csv() {
    const csvData = jsonToCsv(items);
    const filename = "exported_data.csv";
    download(csvData, filename, 'csv');
}

function jsonToCsv(jsonArray) {
    if (jsonArray.length === 0) return '';
    const headerKeys = Object.keys(jsonArray[0]);
    const headerRow = headerKeys.join(',');
    const rows = jsonArray.map(obj => headerKeys.map(key => {
        let value = obj[key] || '';
        return value.toString().includes(',') ? `"${value}"` : value;
    }).join(','));
    return [headerRow, ...rows].join('\n');
}

function download(data, filename, type) {
    chrome.downloads.download({
        url: `data:application/${type};charset=utf-8,${encodeURIComponent(data)}`,
        filename,
        saveAs: true
    }, function (downloadId) {
        if (downloadId) {
            console.log(`File download initiated for: ${filename}`);
        } else {
            console.log("Failed to initiate file download.");
        }
    });
}
