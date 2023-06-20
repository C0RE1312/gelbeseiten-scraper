let intervalId = 0

async function scrape() {
    intervalId = setInterval(async function () {
        const gs_treffer = document.getElementById("gs_treffer")
        for (let z of gs_treffer.children)
            await handleItem(z)

        await nextPage()
    }, 250)
}


async function nextPage() {
    const treffer_count = document.getElementById("gs_treffer").children.length
    const next_btn = document.getElementById('mod-LoadMore--button')

    if (next_btn)
        next_btn.click()
    else {
        clearInterval(intervalId)
        await send_end()
    }

}

async function handleItem(ele) {
    // get the informormations out
    // remove the node

    ele.scrollIntoView();

    try {
        let obj = {}
        Object.assign(obj, get_address(ele.id), get_branche(ele.id), get_title(ele.id), get_number(ele.id), get_website(ele.id))
        await send_Item(obj)
    } catch (err) {
        console.log(err)
    } finally {
        ele.remove()
    }
    await new Promise(r => setTimeout(r, 25));
}

function get_website(id) {
    const website = getElementByXpath('//article[@id="' + id + '"]//div[contains(@class, "webseiteLink")]')
    if (website) {
        try {
            const url_b64 = website.getAttribute('data-webseitelink')
            if (url_b64)
                return { url: decode_b64(url_b64) }
        } catch (err) { }
    }
    return {}
}

function get_number(id) {
    const num = getElementByXpath('//article[@id="' + id + '"]//a[contains(@class, "mod-TelefonnummerKompakt__phoneNumber")]')
    if (num) {
        try {
            return { number: num.innerText }
        } catch (err) { }
    }
    return {}
}

function get_branche(id) {
    const branche = getElementByXpath('//article[@id="' + id + '"]//p[contains(@class, "besteBranche")]')
    if (branche) {
        try {
            return { branche: branche.innerText }
        } catch (err) { }
    }
    return {}
}

function get_address(id) {
    const address = getElementByXpath('//article[@id="' + id + '"]//div[contains(@class, "__address")]')
    if (address) {
        try {
            const text = address.innerText
            const step = text.split(',')

            let googleM = {}
            let google = {}
            try{
                google = address.getAttribute('data-prg')
                if(google)
                    google = decode_b64(google)
                    if(google)
                        googleM = google

            }catch(err){}
            return { address: step[0], plz: step[1], googleMaps:googleM}
        } catch (e) { }

    }
    return {}

}

function get_title(id) {
    const title = getElementByXpath('//article[@id="' + id + '"]//h2[contains(@class, "mod-Treffer__name")]')
    if (title) {
        try {
            return { title: title.innerText }
        } catch (e) { }
    }
    return {}
}

function decode_b64(str) {
    return decodeURIComponent(escape(window.atob(str)))
}

async function send_Item(obj) {
    const msg = {
        title: '', branche: '', address: '', plz: '', number: '', url: '', googleMaps: ''
    }

    Object.assign(msg, obj)

    if(msg.title !== '' || msg.address !== '' || msg.url !== '') 
        chrome.runtime.sendMessage({ message: { type: "ITEM", obj: msg } }, function (response) {
            // Exit the script if the response was not ok = true
            console.log(response)
            
            if (!response['ok']) {
                console.log('Stop Called')
                clearInterval(intervalId)
            }

        });
}

function getElementByXpath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

async function send_end() {
    chrome.runtime.sendMessage({ message: { type: "END" } });
}

(async () => {
    await scrape();
})();