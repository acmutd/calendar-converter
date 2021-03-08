# calendar-converter
![](https://github.com/acmutd/calendar-converter/actions/workflows/refresh.yml/badge.svg)

A script to automatically convert ACM UTD's event spreadsheet to the [iCalendar](https://wikipedia.org/wiki/ICalendar) format, so it can be displayed as a calendar (like in someone's Google Calendar or on [acmutd.co/events](https://acmutd.co/events)).

## How it works
Using [GitHub Actions](./.github/workflows/refresh.yml), this [script](./src/index.ts) runs every 24 hours. The core of the script is given by the few lines at the end:
```ts
fetchSpreadsheet()
  .then(spreadsheetToEvents)
  .then(eventsToIcs)
  .then(console.log)
```
It is a pipeline that

1. Fetches the spreadsheet data using the [Google Sheets API](https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/get)
2. Converts the raw data (which is just `any[][]`) to a more structured schema (`Event[]`)
3. Produces a string in the iCalendar format from that array of `Event`s using the [ics package](https://www.npmjs.com/package/ics)
4. Sends that string to stdout

The output of the script is redirected to a file which is then committed and pushed to the [`ics` branch](https://github.com/acmutd/calendar-converter/tree/ics) of this repository. The calendar can then be accessed with the [raw link](https://raw.githubusercontent.com/acmutd/calendar-converter/ics/calendar.ics) to that file (which we have a vanity link for: `https://content.acmutd.co/events`).

The remaining details are explained in comments in the source code.

## Set up
For the script to run correctly, some set up is necessary in both Google Workspace (G Suite) and GitHub Actions.

### Google Workspace
The script fetches data using the Google Spreadsheet API. As such, it requires authorization to access the spreadsheet. This requires

1. A GCP project with the Google Sheets API [enabled](https://cloud.google.com/endpoints/docs/openapi/enable-api) (note for ACM officers: this is the "Calendar Converter" project)
2. A [service account](https://cloud.google.com/iam/docs/service-accounts) on that project
3. Sharing the spreadsheet with the service account (the service account has an email address which you can share to like normal)

### GitHub Actions
The script utilizes two [Environment secrets](https://docs.github.com/en/actions/reference/encrypted-secrets) which must be set before running: 

* `EVENT_SPREADSHEET_ID`: The ID of the event spreadsheet. This can be found in the URL to the sheet (`https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/`)
* `GCP_SA_KEY`: The service account [authentication key](https://cloud.google.com/iam/docs/creating-managing-service-account-keys#creating_service_account_keys). It should be the raw JSON string (i.e., not a file name). See [`setup-gcloud`](https://github.com/google-github-actions/setup-gcloud) for more info.

## Local Development
Clone the repo, run `npm install`, build with `npm run build`, run with `npm run start`. It might be more convenient to run the compiler in watch mode which can be done with `npm run build -- --watch`.

The same Google Workspace set up process described above is required. The `EVENT_SPREADSHEET_ID` environment variable is the same, but Google API authentication will work differently. Instead of the `GCP_SA_KEY` variable, export a `GOOGLE_APPLICATION_CREDENTIALS` variable which has that path to the service account key json file (as opposed to the `GCP_SA_KEY` variable, this _is_ a file path, not the raw JSON string).

##### Getting the Service Account JSON

 - Open GCP and navigate to the Calendar Converter project
 - Open up the IAM page and navigate to the Service Accounts tab
 - Select the calendar convert service key and open up the Keys tab
 - Click Add Key and set it to be JSON
 - It will automatically download a `.json` file which you can place in the root of the project
 - You can rename the file to bee `calendar-converter.json` which is included in the `.gitignore`


The environement variables can then be set as follows:

```
$ export EVENT_SPREADSHEET_ID=<INSERT ID HERE>
$ export GOOGLE_APPLICATION_CREDENTIALS=<INSERT PATH TO JSON FILE>
```