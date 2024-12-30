# Gelbeseiten Scraper:
A web scraping chrome extension designed to extract data from gelbeseiten.de. It helps in collecting business leads including fields like title, industry, street address, postal code, city, phone number, website, Google Maps URL, distance, rating and gelbeSeiten URL.

> [!NOTE]
> **Looking for custom web scraping or browser automation? Reach out at [https://rapidcode.dev](https://rapidcode.dev)**

# Requirements:
- Google Chrome Browser
- Developer mode enabled for Chrome extensions

# Installation:
1. Download or clone the repository and extract it into a new folder.
2. Open Google Chrome and navigate to: chrome://extensions/.
3. Enable "Developer mode" located at the top-right corner.
4. Click on "Load unpacked" and navigate to the folder where you extracted the downloaded files.
5. The extension should now appear in the list of installed Chrome extensions.

# Usage:
1. Open your browser and visit gelbeseiten.de, then initiate a new search for businesses.
2. Locate and click on the installed extension in your Chrome toolbar, then press the "Start" button.
3. To stop the scraping process and export the collected data, click on the "Stop/Export" button and choose a destination for the output file.

**Important**: Reload the gelbeseiten.de webpage before starting a new scrape.

# Output Formats:
You can choose to export the data in either JSON or CSV format.

# JSON Output Sample:
```json
[
  {
    "title": "",
    "rating": "",
    "industry": "",
    "streetAddress": "",
    "distance": "",
    "postalCode": "",
    "city": "",
    "phoneNumber": "",
    "website": "",
    "googleMapsURL": "",
    "gelbeSeitenURL": ""
  }
]
```

# CSV Output Sample:

```csv
title,rating,industry,streetAddress,distance,postalCode,city,phoneNumber,website,googleMapsURL,gelbeSeitenURL
...
```
