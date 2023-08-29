chrome.runtime.onInstalled.addListener(() => {
    console.log('Gelbeseiten Scraper Loaded into Chrome!')
});


let items = []
let stop = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'start_scraping') {
        stop = false;
        items = []
        chrome.tabs.query({ active: true, url: 'https://www.gelbeseiten.de/*' }, function (tabs) {
            if (tabs.length > 0) {
                const currentTabId = tabs[0].id;
                console.log("Current tab Title:", currentTabId);
                chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    files: ["scraper-script.js"]
                });
            }
        });

        return true
    } else if (request.message === 'stop_scraping') {
        console.log('Removing script....')
        stop = true;
        export_items(request.type)
        return true
    } else if (request.message['type'] === 'ITEM') {
        add_item(request.message['obj'])
        
        if(!stop)
            sendResponse({ ok: true })

        console.log(request)

        chrome.runtime.sendMessage({
            message: "INC_COUNTER"
        }, response => {
            return true;
        });

        return true;
    }
    return true
});


function add_item(item) {
    items.push(item)
}

function export_items(type = 'json') {
    // Check if data is available
    console.log(type)
    if (items.length === 0) {
        console.log("No data available for export.");
        return;
    }

    if (type === 'json')
        export_json()
    else if (type === 'csv')
        export_csv()
}

function export_json() {
    // Convert the array to JSON
    var jsonData = JSON.stringify(items);

    // Create a filename for the exported file
    var filename = "exported_data.json";

    // Initiate the file download using the chrome.downloads API
    download(jsonData, filename, 'json');
}

function export_csv() {
    // Convert the array to CSV
    var csvData = jsonToCsv(items);

    // Create a filename for the exported file
    var filename = "exported_data.csv";

    // Initiate the file download using the chrome.downloads API
    download(csvData, filename, 'csv');
}

function jsonToCsv(jsonArray) {
    if (jsonArray.length === 0) return '';

    // Get the keys for the header row
    const headerKeys = Object.keys(jsonArray[0]);
    const headerRow = headerKeys.join(',');

    // Get the rows from the JSON array
    const rows = jsonArray.map(obj => {
        return headerKeys.map(key => {
            // If the value contains a comma, escape it by wrapping it in double quotes
            let value = obj[key] === null ? '' : obj[key];
            value = value.toString().includes(',') ? `"${value}"` : value;
            return value;
        }).join(',');
    });

    // Combine the header row and the object rows
    const csvString = [headerRow, ...rows].join('\n');

    return csvString;
}

function download(data, filename, type) {
    chrome.downloads.download({
        url: "data:application/" + type + ";charset=utf-8," + encodeURIComponent(data),
        filename: filename,
        saveAs: true
    }, function (downloadId) {
        if (downloadId) {
            console.log("File download initiated for: " + filename);
        } else {
            console.log("Failed to initiate file download.");
        }
    });
}
