document.getElementById("btn_start").addEventListener("click", start);
document.getElementById("btn_stop").addEventListener("click", stop);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'INC_COUNTER') {
        document.getElementById('counter').innerText = Number(document.getElementById('counter').innerText) + 1;
        sendResponse({ ok: true });
    }
});

function start() {
    document.getElementById("btn_start").setAttribute('disabled', 'disabled');
    document.getElementById("btn_stop").removeAttribute('disabled');
    document.getElementById('counter').innerText = '0';
    
    chrome.runtime.sendMessage({
        message: "start_scraping"
    }, response => {
        console.log(response);
    });
}

function stop() {
    document.getElementById("btn_stop").setAttribute('disabled', 'disabled');
    document.getElementById("btn_start").removeAttribute('disabled');
    
    let json = document.getElementById('json').checked;
    let csv = document.getElementById('csv').checked;

    chrome.runtime.sendMessage({
        message: "stop_scraping",
        type: json ? 'json' : 'csv'
    }, response => {
        console.log(response);
    });
}
