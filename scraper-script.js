(() => {
    if (globalThis.__gelbeSeitenScraperInstalled) return;
    globalThis.__gelbeSeitenScraperInstalled = true;

    let scrapingActive = false;
    let currentRunId = null;
    let includeEmails = false;
    let emailRequestController = null;
    let cancelNextPageWait = null;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'START_SCRAPING') {
            if (scrapingActive) {
                sendResponse({ ok: false, error: 'Scraping is already active.' });
                return;
            }

            currentRunId = request.runId;
            includeEmails = request.includeEmails === true;
            scrapingActive = true;
            sendResponse({ ok: true });
            startScraping(request.runId);
        } else if (request.type === 'STOP_SCRAPING') {
            scrapingActive = false;
            emailRequestController?.abort();
            cancelNextPageWait?.();
            sendResponse({ ok: true });
        }
    });

    const executeXPathQuery = xpathQuery => document.evaluate(
        xpathQuery,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    ).singleNodeValue;

    const decodeBase64 = base64String => decodeURIComponent(escape(window.atob(base64String)));

    async function startScraping(runId) {
        try {
            while (scrapingActive && currentRunId === runId) {
                const searchResultsContainer = document.getElementById('gs_treffer');
                if (!searchResultsContainer) {
                    throw new Error('Search results container was not found.');
                }

                const resultElements = [...searchResultsContainer.children];
                for (const childElement of resultElements) {
                    if (!scrapingActive || currentRunId !== runId) break;
                    await handleSearchResultItem(childElement, runId);
                }

                if (!scrapingActive || currentRunId !== runId) break;
                const hasNextPage = await loadNextPage(searchResultsContainer);
                if (!hasNextPage) break;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Scraping stopped because of an error:', error);
            }
        } finally {
            if (currentRunId === runId) {
                scrapingActive = false;
                emailRequestController = null;
                chrome.runtime.sendMessage({
                    message: { type: 'SCRAPING_FINISHED', runId }
                }).catch(() => {});
            }
        }
    }

    async function loadNextPage(searchResultsContainer) {
        const nextButton = document.getElementById('mod-LoadMore--button');
        if (!nextButton) return false;

        const existingChildren = new Set(searchResultsContainer.children);
        nextButton.click();

        return waitForNewResults(searchResultsContainer, existingChildren, 15000);
    }

    function waitForNewResults(container, existingChildren, timeoutMs) {
        return new Promise(resolve => {
            let settled = false;
            let cancelWait;
            const finish = value => {
                if (settled) return;
                settled = true;
                observer.disconnect();
                clearTimeout(timeoutId);
                if (cancelNextPageWait === cancelWait) cancelNextPageWait = null;
                resolve(value);
            };
            cancelWait = () => finish(false);
            cancelNextPageWait = cancelWait;
            const hasNewResults = () => [...container.children].some(child => !existingChildren.has(child));
            const observer = new MutationObserver(() => {
                if (!scrapingActive) {
                    finish(false);
                } else if (hasNewResults()) {
                    finish(true);
                }
            });
            const timeoutId = setTimeout(() => finish(hasNewResults()), timeoutMs);

            observer.observe(container, { childList: true });
            if (hasNewResults()) finish(true);
        });
    }

    async function handleSearchResultItem(searchResultElement, runId) {
        searchResultElement.scrollIntoView();

        try {
            const elementId = searchResultElement.id;
            const scrapedData = {
                ...extractData('mod-WebseiteKompakt__text', extractWebsiteInfo, elementId, 'span'),
                ...extractData('mod-Stars__text data-bewertungen', extractRating, elementId, 'span'),
                ...extractData('mod-TelefonnummerKompakt__phoneNumber', extractPhoneNumber, elementId, 'a'),
                ...extractData('besteBranche', extractIndustryInfo, elementId, 'p'),
                ...extractData('mod-AdresseKompakt__adress contains-icon-big-adresse', extractAddressInfo, elementId),
                ...extractData('mod-AdresseKompakt__entfernung', extractDistance, elementId, 'span'),
                ...extractData('mod-Treffer__name', extractTitleInfo, elementId, 'h2')
            };

            if (includeEmails && scrapedData.gelbeSeitenURL && scrapingActive) {
                const emailAddress = await fetchEmailFromDetailPage(scrapedData.gelbeSeitenURL);
                if (emailAddress) scrapedData.emailAddress = emailAddress;
            }

            if (scrapingActive && currentRunId === runId) {
                const response = await sendMessageWithData(scrapedData, runId);
                if (!response?.ok) scrapingActive = false;
            }
        } catch (error) {
            if (error.name !== 'AbortError') console.error(error);
        } finally {
            searchResultElement.remove();
        }
    }

    function extractAddressFromGoogleMapsURL(googleMapsURL) {
        try {
            const url = new URL(googleMapsURL);
            const placeParam = url.pathname.split('/').pop();
            const [, street, postcode, city] = /(.+),\s+(\d+)\s+(.+)/.exec(decodeURIComponent(placeParam)) || [];
            return { street, postcode, city };
        } catch (error) {
            console.error('An error occurred while extracting the address:', error);
            return null;
        }
    }

    function extractWebsiteInfo(element) {
        const encodedWebsiteURL = element.getAttribute('data-webseitelink');
        return encodedWebsiteURL ? { website: decodeBase64(encodedWebsiteURL) } : {};
    }

    function extractData(className, extractionFunction, elementId, tagName = 'div') {
        const targetedElement = executeXPathQuery(`//article[@id="${elementId}"]//${tagName}[contains(@class, "${className}")]`);
        return targetedElement ? extractionFunction(targetedElement) : {};
    }

    function extractPhoneNumber(element) {
        return { phoneNumber: element.innerText.trim() };
    }

    function extractIndustryInfo(element) {
        return { industry: capitalizeFirstLetter(element.innerText.trim().toLowerCase()) };
    }

    function extractTitleInfo(element) {
        return { title: element.innerText.trim(), ...extractGelbeseitenURL(element) };
    }

    function extractGelbeseitenURL(element) {
        return { gelbeSeitenURL: element.parentElement.getAttribute('href') };
    }

    function extractAddressInfo(element) {
        const googleMapsURL = element.getAttribute('data-prg');
        const decodedURL = googleMapsURL ? decodeBase64(googleMapsURL) : null;
        const extractedAddress = decodedURL ? extractAddressFromGoogleMapsURL(decodedURL) : null;
        return extractedAddress ? {
            streetAddress: extractedAddress.street,
            postalCode: extractedAddress.postcode,
            city: extractedAddress.city,
            googleMapsURL: encodeURI(decodedURL)
        } : {};
    }

    function extractDistance(element) {
        return { distance: element.innerText.trim() };
    }

    function extractRating(element) {
        return { rating: element.innerText.trim() };
    }

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    async function fetchEmailFromDetailPage(detailPageUrl) {
        emailRequestController = new AbortController();
        const timeoutId = setTimeout(() => emailRequestController?.abort(), 15000);

        try {
            const response = await fetch(detailPageUrl, { signal: emailRequestController.signal });
            if (!response.ok) return null;

            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const mailtoLink = doc.querySelector('#email_versenden.button')?.getAttribute('data-link');

            if (!mailtoLink?.startsWith('mailto:')) return null;
            const queryIndex = mailtoLink.indexOf('?');
            return mailtoLink.substring(7, queryIndex === -1 ? mailtoLink.length : queryIndex);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Fehler beim Abrufen der E-Mail-Adresse:', error);
            }
            return null;
        } finally {
            clearTimeout(timeoutId);
            emailRequestController = null;
        }
    }

    function sendMessageWithData(scrapedData, runId) {
        const item = {
            title: '',
            rating: '',
            industry: '',
            streetAddress: '',
            distance: '',
            postalCode: '',
            city: '',
            phoneNumber: '',
            website: '',
            googleMapsURL: '',
            gelbeSeitenURL: '',
            emailAddress: '',
            ...scrapedData
        };

        if (!item.title && !item.streetAddress && !item.website) {
            return Promise.resolve({ ok: true, skipped: true });
        }

        return chrome.runtime.sendMessage({
            message: { type: 'ITEM', obj: item, runId }
        });
    }
})();
