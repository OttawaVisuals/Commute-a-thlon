const SHEET_ID = "19XTy4p8RkuagLgrim-9rZWavuTVgIHexhoZ3YF6em9U";

// Sheets the read endpoint is allowed to expose. Whitelisted rather than
// opened by any name the caller passes in.
const READABLE_SHEETS = ["Submissions", "Activities", "ActivityRatings", "Participants"];

// Deployed and confirmed working (including cross-origin fetch() GET, no CORS issue).
// - No `sheet` param: unchanged health-check response (back-compat).
// - `?sheet=Participants` (etc.): returns that sheet's rows as JSON objects
//   keyed by its header row, e.g. { success:true, sheet:"Participants", rows:[{...}] }.
function doGet(e) {

  const sheetName = e && e.parameter && e.parameter.sheet;

  if (!sheetName) {
    return ContentService
      .createTextOutput(
        JSON.stringify({
          status: "online",
          service: "Commute-a-thlon API",
          timestamp: new Date()
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (READABLE_SHEETS.indexOf(sheetName) === -1) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: "Unknown sheet: " + sheetName }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];

    const rows = values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const v = row[i];
        obj[h] = (v instanceof Date) ? v.toISOString() : v;
      });
      return obj;
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, sheet: sheetName, rows }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);

  }

}

function doPost(e) {

  try {

    const data = JSON.parse(e.postData.contents);

    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const week = getISOWeek(now);

    const ss =
      SpreadsheetApp.openById(SHEET_ID);

    const submissions =
      ss.getSheetByName("Submissions");

    const activities =
      ss.getSheetByName("Activities");

    const submissionID =
      Utilities.getUuid();

    //------------------------------------------------
    // SUBMISSIONS
    //------------------------------------------------

    submissions.appendRow([

      submissionID,
      now,

      year,
      month,
      week,

      data.displayName || "",
      data.team || "",
      data.usualCommuteMode || "",

      data.targetDistanceKm || 0,
      data.targetFormat || "",

      data.targetSwimKm || 0,
      data.targetBikeKm || 0,
      data.targetRunKm || 0,

      data.drawnSwimKm || 0,
      data.drawnBikeKm || 0,
      data.drawnRunKm || 0,

      data.transitionMinutes || 0,

      data.totalDistanceKm || 0,
      data.totalActiveMinutes || 0,
      data.totalElapsedMinutes || 0,

      data.totalMETMinutes || 0,

      data.funScore || 0,
      data.originalityScore || 0,

      data.completionPercent || 0,

      data.activityCount || 0,

      data.notes || ""

    ]);

    //------------------------------------------------
    // ACTIVITIES
    //------------------------------------------------

    (data.activities || []).forEach(activity => {

      activities.appendRow([

        submissionID,

        activity.category || "",
        activity.activityId || "",
        activity.activityName || "",

        activity.distance || 0,
        activity.distanceUnit || "",

        activity.timeMinutes || 0,

        activity.met || 0,
        activity.metMinutes || 0,

        activity.funFactor || 0,
        activity.originalityFactor || 0,

        activity.calculatedSpeed || 0,

        activity.season || ""

      ]);

    });

    //------------------------------------------------
    // PARTICIPANTS TABLE (optional auto-update)
    //------------------------------------------------

    updateParticipantSummary(
      ss,
      data,
      submissionID,
      now
    );

    //------------------------------------------------
    // SUCCESS
    //------------------------------------------------

    return ContentService
      .createTextOutput(
        JSON.stringify({
          success: true,
          submissionID
        })
      )
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {

    return ContentService
      .createTextOutput(
        JSON.stringify({
          success: false,
          error: error.toString()
        })
      )
      .setMimeType(ContentService.MimeType.JSON);

  }

}

function updateParticipantSummary(
  ss,
  data,
  submissionID,
  now
) {

  const participants =
    ss.getSheetByName("Participants");

  if (!participants) return;

  const rows =
    participants.getDataRange().getValues();

  const displayName =
    data.displayName || "";

  const team =
    data.team || "";

  const totalDistance =
    data.totalDistanceKm || 0;

  const totalMET =
    data.totalMETMinutes || 0;

  const totalTime =
    data.totalElapsedMinutes || 0;

  let existingRow = -1;

  for (let i = 1; i < rows.length; i++) {

    if (rows[i][1] === displayName) {

      existingRow = i + 1;
      break;

    }

  }

  if (existingRow === -1) {

    participants.appendRow([

      Utilities.getUuid(),

      displayName,
      team,

      now,
      now,

      1,

      totalTime,
      totalMET,

      "",

      totalDistance

    ]);

  } else {

    const currentCount =
      Number(participants.getRange(existingRow, 6).getValue()) || 0;

    const bestTime =
      Number(participants.getRange(existingRow, 7).getValue()) || totalTime;

    const bestMET =
      Number(participants.getRange(existingRow, 8).getValue()) || totalMET;

    const totalKm =
      Number(participants.getRange(existingRow, 10).getValue()) || 0;

    participants.getRange(existingRow, 5).setValue(now);
    participants.getRange(existingRow, 6).setValue(currentCount + 1);
    participants.getRange(existingRow, 7).setValue(Math.min(bestTime, totalTime));
    participants.getRange(existingRow, 8).setValue(Math.max(bestMET, totalMET));
    participants.getRange(existingRow, 10).setValue(totalKm + totalDistance);

  }

}

function getISOWeek(date) {

  const d = new Date(date);

  d.setHours(0, 0, 0, 0);

  d.setDate(
    d.getDate() + 4 - (d.getDay() || 7)
  );

  const yearStart =
    new Date(d.getFullYear(), 0, 1);

  const weekNo =
    Math.ceil(
      (
        ((d - yearStart) / 86400000) + 1
      ) / 7
    );

  return `${d.getFullYear()}-W${weekNo}`;

}
