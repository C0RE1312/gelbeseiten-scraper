const startButton = document.getElementById('btn_start');
const stopButton = document.getElementById('btn_stop');
const resetButton = document.getElementById('btn_reset');
const counter = document.getElementById('counter');
const includeEmailsCheckbox = document.getElementById('include_emails');

startButton.addEventListener('click', start);
stopButton.addEventListener('click', stop);
resetButton.addEventListener('click', reset);

chrome.runtime.onMessage.addListener(request => {
    if (request.message === 'COUNTER_UPDATED') {
        counter.innerText = String(request.count);
    } else if (request.message === 'SCRAPER_STATE_UPDATED') {
        counter.innerText = String(request.itemCount);
        includeEmailsCheckbox.checked = request.active && request.includeEmails === true;
        setScraperState(request.active, request.itemCount);
    }
});

refreshStatus();

async function refreshStatus() {
    try {
        const status = await chrome.runtime.sendMessage({ message: 'get_status' });
        if (!status?.ok) throw new Error(status?.error || 'Could not read scraper status.');

        counter.innerText = String(status.itemCount);
        includeEmailsCheckbox.checked = status.active && status.includeEmails === true;
        setScraperState(status.active, status.itemCount);
    } catch (error) {
        console.error(error);
        setScraperState(false, Number(counter.innerText));
    }
}

async function start() {
    startButton.disabled = true;
    counter.innerText = '0';

    try {
        const response = await chrome.runtime.sendMessage({
            message: 'start_scraping',
            includeEmails: includeEmailsCheckbox.checked
        });
        if (!response?.ok) throw new Error(response?.error || 'Could not start scraping.');
        setScraperState(true, 0);
    } catch (error) {
        console.error(error);
        setScraperState(false, Number(counter.innerText));
    }
}

async function stop() {
    stopButton.disabled = true;
    const type = document.getElementById('json').checked ? 'json' : 'csv';

    try {
        const response = await chrome.runtime.sendMessage({
            message: 'stop_scraping',
            type
        });
        if (!response?.ok) throw new Error(response?.error || 'Could not export results.');

        counter.innerText = String(response.itemCount);
        includeEmailsCheckbox.checked = false;
        setScraperState(false, response.itemCount);
    } catch (error) {
        console.error(error);
        await refreshStatus();
    }
}

async function reset() {
    if (!window.confirm('Stop scraping and permanently delete all collected items?')) return;

    startButton.disabled = true;
    stopButton.disabled = true;
    resetButton.disabled = true;

    try {
        const response = await chrome.runtime.sendMessage({ message: 'reset_scraping' });
        if (!response?.ok) throw new Error(response?.error || 'Could not reset scraper data.');

        counter.innerText = '0';
        includeEmailsCheckbox.checked = false;
        setScraperState(false, 0);
    } catch (error) {
        console.error(error);
        await refreshStatus();
    }
}

function setScraperState(active, itemCount) {
    startButton.disabled = active;
    stopButton.disabled = !active && itemCount === 0;
    resetButton.disabled = !active && itemCount === 0;
    includeEmailsCheckbox.disabled = active;
    stopButton.innerText = active ? 'Stop & Export' : 'Export';
}
