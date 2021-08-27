import { LocalDate, LocalTime, ZonedDateTime, ZoneId, ZoneOffset } from "@js-joda/core";
import "@js-joda/timezone";
import { google } from "googleapis";
import { createEvents } from "ics";
import { arrayEquals, to24hour, toDateArray } from "./util";

/**
 * This is what we expect the first row of the spreadsheet to be. We use this as
 * a sanity check in `spreadsheetToEvents` to make sure that the spreadsheet
 * format hasn't changed before we try manipulating things.
 */
const EXPECTED_COLUMNS = ["Date", "End Date", "Day of Week", "Start Time", "End Time", "Name", "Description", "Location", "Division", "Collaborators", "Public"] as const;
/**
 * The union of all of the strings in EXPECTED_COLUMNS (i.e., "Date" | "End Date" | ...).
 * This allows us to ensure we don't accidentally use non-existant column name.
 */
type Column = typeof EXPECTED_COLUMNS[number];

/**
 * Our event schema. Each field corresponds to a column of the spreadsheet.
 * Note that not all columns are present, because only some are necessary for
 * generating the ics.
 */
interface Event {
  start: ZonedDateTime;
  end: ZonedDateTime;
  name: string;
  description: string;
  public: boolean;
}

/**
 * Fetches the spreadsheet using the Google Sheets API. This yields the
 * spreadsheet as a very unstructured `any[][]`.
 */
async function fetchSpreadsheet(): Promise<any[][]> {
  // Construct a sheets client with the appropriate scope for reading
  // spreadsheets. We don't pass any API key, because that is automatically
  // detected from the `GOOGLE_APPLICATIONS_CREDENTIALS` env var.
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    })
  });

  // Request the spreadsheet. Passing 'Events' for the range fetches the entire
  // sheet (which is called 'Events').
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.EVENT_SPREADSHEET_ID,
    range: 'Events'
  });

  // Return the values of the sheet, coercing null | undefined to []
  // (I don't actually know in what cases it would be null or undefined...).
  return res.data.values ?? [];
}

/**
 * Converts a single row of the spreadsheet to an `Event`.
 * @param row A row of the spreadsheet (an element of the result of `fetchSpreadsheet()`).
 */
function rowToEvent(row: any[]): Event {
  /**
   * Convenience function for getting a value from the row given a column name
   * (e.g., `getValue("Date")` would get the first element of `row`).
   * @param column The name of the column.
   */
  function getValue(column: Column): any {
    return row[EXPECTED_COLUMNS.indexOf(column)];
  }

  /**
   * Combines the (End) Date and (End/Start) Time columns to form a `ZonedDateTime`.
   * All times are parsed in the `America/Chicago` timezone and then converted
   * to UTC to ensure consistent behavior when running the script in different
   * timezones (See `eventsToIcs` for more info).
   * @param dateCol The column from which to get the date part.
   * @param timeCol The column from which to get the time part.
   */
  function parseDate(dateCol: Column, timeCol: Column): ZonedDateTime {
    const localDate = LocalDate.parse(getValue(dateCol));
    const localTime = LocalTime.parse(to24hour(getValue(timeCol)));
    const chicagoDateTime = ZonedDateTime.of(localDate, localTime, ZoneId.of("America/Chicago"));
    return chicagoDateTime.withZoneSameInstant(ZoneOffset.UTC);
  }

  return {
    start: parseDate("Date", "Start Time"),
    end: parseDate("End Date", "End Time"),
    name: getValue("Name"),
    description: getValue("Description"),
    public: getValue("Public") == 'TRUE'
  }
}

/**
 * Converts the raw spreadsheet data to an array of `Event`.
 * @param spreadsheet The raw spreadsheet data (probably from `fetchSpreadsheet()`).
 */
function spreadsheetToEvents(spreadsheet: any[][]): Event[] {
  // Sanity check that the header row is what we expect. See `EXPECTED_COLUMNS`.
  if (!arrayEquals(spreadsheet[0], EXPECTED_COLUMNS)) {
    throw new Error("Unexpected header, aborting: " + spreadsheet[0])
  }

  spreadsheet.shift(); // discard header row
  return spreadsheet.map(rowToEvent);
}

/**
 * Converts the array of `Event`s to an ics string
 * @param events The events to convert
 * @param includePrivate Whether to include events not marked as public
 */
function eventsToIcs(events: Event[], includePrivate: boolean = false): string {
  // If `includePrivate`, then take all the events, otherwise filter to only
  // public events
  const includedEvents = includePrivate ? events : events.filter(e => e.public);

  // Convert our Event schema to the ics package's `EventAttributes` schema
  // and pass them to `createEvents` to produce the final ics
  const { error, value } = createEvents(includedEvents.map(e => {
    return {
      calName: "ACM Events", // The name of the calendar. idk why this is in every EventAttributes
      start: toDateArray(e.start),
      end: toDateArray(e.end),
      title: e.name,
      description: e.description,
      // We do everything in utc to ensure consistent behvior regardless of the
      // machine timezone. If the inputs were 'local', the ics package would
      // always interpret it as being the local time of the machine, which isn't
      // necessarily the case. We know the timezone of our events is always
      // America/Chicago, so we did the conversion to UTC ourselves in `parseDate`.
      startInputType: 'utc',
      endInputType: 'utc',
      startOutputType: 'utc',
      endOutputType: 'utc'
    };
  }));

  // It does this weird `ReturnObject` thing instead of throwing an error, so we
  // just throw it if the value is null.
  if (!value) throw error;
  return value;
}

// Tie everything together and send the result to stdout (or log an error).
fetchSpreadsheet()
  .then(spreadsheetToEvents)
  .then(eventsToIcs)
  .then(console.log)
  .catch(r => {
    console.error(`Error: ${r}`);
    process.exit(1);
  });
