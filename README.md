# gelbeseiten-scraper:
Scraper for gelbeseiten.de

# Installation: 
1. Download the files and save it in a new folder
2. Open Chrome and goto: chrome://extensions/
3. Activate developer mode (on the right)
4. Click on "Load unpacked" and select the new folder.
5. The extension should appear in the list :)


# Usage: 
1. Visit http://gelbeseiten.de and start a new search.
2. Click on the extension and press start.
3. When you want to export the files click on stop/export button and select a destination.

## Please reload the gelbeseiten Page before a new scrape!

# Output:
You can choose from json or csv output:
```json
[
  {
  "title":	"",
  "industry":	"",
  "streetAddress":	"",
  "postalCode":	"",
  "city": "",
  "phoneNumber":	"",
  "website":	"",
  "googleMapsURL":	"",
  "gelbeSeitenURL": ""
  }
]
```
```csv
title,industry,streetAddress,postalCode,city,phoneNumber,website,googleMapsURL,gelbeSeitenURL
...
```
