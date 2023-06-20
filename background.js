chrome.runtime.onInstalled.addListener(() => {
    console.log('Gelbeseiten Scraper Loaded into Chrome!')
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && /^http/.test(tab.url)) {
        /*
        chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ["./foreground_styles.css"]
        })
            .then(() => {
                console.log("INJECTED THE FOREGROUND STYLES.");

                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["./foreground.js"]
                })
                    .then(() => {
                        console.log("INJECTED THE FOREGROUND SCRIPT.");
                    });
            })
            .catch(err => console.log(err));
        */
    }
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
        export_items()
        return true
    } else if (request.message['type'] === 'ITEM') {
        add_item(request.message['obj'])
        
        if(!stop)
            sendResponse({ok:true})
        else{
            sendResponse({ok:false})
            export_items()
            return true
        }
        
        console.log(request)

        chrome.runtime.sendMessage({ 
            message: "INC_COUNTER"
        }, response => {
        });
        
        return true;
    } else if (request.message['type'] === 'END'){
        export_items()
    }
});


function add_item(item){
    items.push(item)
}

function export_items() {
    // Check if data is available
    if (items.length === 0) {
      console.log("No data available for export.");
      return;
    }
  
    // Convert the array to JSON
    var jsonData = JSON.stringify(items);
  
    // Create a filename for the exported file
    var filename = "exported_data.json";
  
    // Initiate the file download using the chrome.downloads API
    chrome.downloads.download({
      url: "data:application/json;charset=utf-8," + encodeURIComponent(jsonData),
      filename: filename,
      saveAs: true
    }, function(downloadId) {
      if (downloadId) {
        console.log("File download initiated for: " + filename);
      } else {
        console.log("Failed to initiate file download.");
      }
    });
  }
  