let scrapingIntervalId = 0;

const executeXPathQuery = (xpathQuery) => document.evaluate(xpathQuery, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

const decodeBase64 = (base64String) => decodeURIComponent(escape(window.atob(base64String)));

function extractAddressFromGoogleMapsURL(googleMapsURL) {
  try {
    const url = new URL(googleMapsURL);
    const placeParam = url.pathname.split('/').pop();
    const [_, street, postcode, city] = /(.+),\s+(\d+)\s+(.+)/.exec(decodeURIComponent(placeParam)) || [];
    
    return {
      street,
      postcode,
      city
    };
  } catch (error) {
    console.error("An error occurred while extracting the address:", error);
    return null;
  }
}

async function startScraping() {
    scrapingIntervalId = setInterval(async () => {
        const searchResultsContainer = document.getElementById("gs_treffer");
        for (let childElement of searchResultsContainer.children) {
            await handleSearchResultItem(childElement);
        }
        await navigateToNextPage();
    }, 250);
}

async function navigateToNextPage() {
    const nextButton = document.getElementById('mod-LoadMore--button');
    nextButton ? nextButton.click() : clearInterval(scrapingIntervalId);
}

async function handleSearchResultItem(searchResultElement) {
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
        
        if (scrapedData.gelbeSeitenURL) {
            const emailAddress = await fetchEmailFromDetailPage(scrapedData.gelbeSeitenURL);
            if (emailAddress) {
                scrapedData.emailAddress = emailAddress;
            }
        }
        
        await sendMessageWithData(scrapedData);
    } catch (error) {
        console.log(error);
    } finally {
        searchResultElement.remove();
    }
    await new Promise(resolve => setTimeout(resolve, 25));
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
    return { title: element.innerText.trim() , ...extractGelbeseitenURL(element)};
}

function extractGelbeseitenURL(element) {
    return { gelbeSeitenURL: element.parentElement.getAttribute('href') };
}

function extractAddressInfo(element) {
    const googleMapsURL = element.getAttribute('data-prg');
    const extractedAddress = googleMapsURL ? extractAddressFromGoogleMapsURL(decodeBase64(googleMapsURL)) : null;
    return extractedAddress ? {
        streetAddress: extractedAddress.street,
        postalCode: extractedAddress.postcode,
        city: extractedAddress.city,
        googleMapsURL: encodeURI(decodeBase64(googleMapsURL))
    } : {};
}

function extractDistance(element) {
    return { distance: element.innerText.trim()};
}

function extractRating(element) {
    return { rating: element.innerText.trim()};
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function fetchEmailFromDetailPage(detailPageUrl) {
    try {
        const response = await fetch(detailPageUrl);
        const html = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const emailButton = doc.querySelector('#email_versenden.button');
        
        if (emailButton) {
            const mailtoLink = emailButton.getAttribute('data-link');
            
            if (mailtoLink && mailtoLink.startsWith('mailto:')) {
                const emailAddress = mailtoLink.substring(7, mailtoLink.indexOf('?'));
                return emailAddress;
            }
        }
        
        return null;
    } catch (error) {
        console.error("Fehler beim Abrufen der E-Mail-Adresse:", error);
        return null;
    }
}

async function sendMessageWithData(scrapedData) {
    const initialMessage = {
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
        emailAddress: ''
    };

    Object.assign(initialMessage, scrapedData);

    if (initialMessage.title || initialMessage.streetAddress || initialMessage.website) {
        chrome.runtime.sendMessage({ message: { type: "ITEM", obj: initialMessage } }, function (response) {
            if (!response['ok']) {
                clearInterval(scrapingIntervalId);
            }
        });
    }
}

(async () => {
    await startScraping();
})();
