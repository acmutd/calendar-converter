import { LocalDate, LocalTime, ZonedDateTime, ZoneId, ZoneOffset } from "@js-joda/core";
import "@js-joda/timezone";
import { google } from "googleapis";
import { createEvents } from "ics";
import { arrayEquals, to24hour, toDateArray } from "./util";

const EXPECTED_COLUMNS = ["Date", "End Date", "Day of Week", "Start Time", "End Time", "Name", "Description", "Location", "Division", "Collaborator(s)", "Public"] as const;
type Column = typeof EXPECTED_COLUMNS[number];

interface Event {
  start: ZonedDateTime;
  end: ZonedDateTime;
  name: string;
  description: string;
  public: boolean;
}

// Fetch spreadsheet as any[][]
async function fetchSpreadsheet(): Promise<any[][]> {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    })
  });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.EVENT_SPREADSHEET_ID,
    range: 'Events'
  });

  return res.data.values ?? [];
}

// Convert a single row of the spreadsheet to our Event model
function rowToEvent(row: any[]): Event {
  function getValue(column: Column): any {
    return row[EXPECTED_COLUMNS.indexOf(column)];
  }

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

// Convert the whole spreadsheet to an array of Event
function spreadsheetToEvents(spreadsheet: any[][]): Event[] {
  if (!arrayEquals(spreadsheet[0], EXPECTED_COLUMNS)) {
    throw new Error("Unexpected header, aborting: " + spreadsheet[0])
  }

  spreadsheet.shift();
  return spreadsheet.map(rowToEvent);
}

// Convert array of Event to ics string
function toIcs(events: Event[], includePrivate: boolean = false): string {
  const includedEvents = includePrivate ? events : events.filter(e => e.public);
  const { error, value } = createEvents(includedEvents.map(e => {
    return {
      calName: "ACM Events",
      start: toDateArray(e.start),
      end: toDateArray(e.end),
      title: e.name,
      description: e.description,
      startInputType: 'utc',
      endInputType: 'utc',
      startOutputType: 'utc',
      endOutputType: 'utc'
    };
  }));

  if (!value) throw error;
  return value;
}

fetchSpreadsheet()
  .then(spreadsheetToEvents)
  .then(toIcs)
  .then(console.log)
  .catch(r => {
    console.error(`Error: ${r}`);
    process.exit(1);
  });
