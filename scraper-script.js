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
            ...extractData('mod-TelefonnummerKompakt__phoneNumber', extractPhoneNumber, elementId, 'a'),
            ...extractData('besteBranche', extractIndustryInfo, elementId, 'p'),
            ...extractData('__address', extractAddressInfo, elementId),
            ...extractData('mod-Treffer__name', extractTitleInfo, elementId, 'h2')
        };
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

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function sendMessageWithData(scrapedData) {
    const initialMessage = {
        title: '',
        industry: '',
        streetAddress: '',
        postalCode: '',
        city: '',
        phoneNumber: '',
        website: '',
        googleMapsURL: '',
        gelbeSeitenURL: ''
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
