/**
 * Schedule Secretary — Google Apps Script WebApp backend.
 *
 * Deployed by EACH USER on their own Google account (BYOK model,
 * docs/architecture.md ADR-005): the platform never touches Google
 * permissions. The gadget calls this WebApp with a shared token and the
 * script operates the user's default Google Calendar via CalendarApp.
 *
 * Setup for non-engineers: see SETUP.md in this folder.
 */

var DAYS_TO_LIST = 30;

function doPost(e) {
  var request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: { code: 'bad_request', message: 'リクエストのJSONを解析できません' },
    });
  }

  // GAS WebApps cannot set real HTTP status codes, so this JSON body is the
  // 403 equivalent. The token lives in Script Properties, never in code.
  var expectedToken = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
  if (!expectedToken || request.token !== expectedToken) {
    return jsonResponse({
      ok: false,
      error: { code: 'forbidden', message: '認証トークンが一致しません（SETUP.md の手順3を確認してください）' },
    });
  }

  var params = request.params || {};
  try {
    switch (request.action) {
      case 'list':
        return jsonResponse({ ok: true, result: listEvents() });
      case 'create':
        return jsonResponse({ ok: true, result: createEvent(params) });
      case 'move':
        return jsonResponse({ ok: true, result: moveEvent(params) });
      case 'delete':
        return jsonResponse({ ok: true, result: deleteEvent(params) });
      default:
        return jsonResponse({
          ok: false,
          error: { code: 'unknown_action', message: '未対応のアクションです: ' + request.action },
        });
    }
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: { code: 'internal_error', message: String((error && error.message) || error) },
    });
  }
}

/** Events from today 00:00 through the next DAYS_TO_LIST days. */
function listEvents() {
  var calendar = CalendarApp.getDefaultCalendar();
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var end = new Date(start.getTime() + DAYS_TO_LIST * 24 * 60 * 60 * 1000);
  return calendar.getEvents(start, end).map(eventToJson);
}

function createEvent(params) {
  var title = requireString(params, 'title');
  var start = requireDate(params, 'start');
  var end = requireDate(params, 'end');
  if (end.getTime() <= start.getTime()) {
    throw new Error('終了日時は開始日時より後にしてください');
  }
  var options = params.description ? { description: String(params.description) } : {};
  var event = CalendarApp.getDefaultCalendar().createEvent(title, start, end, options);
  return eventToJson(event);
}

function moveEvent(params) {
  var event = requireEvent(params);
  var start = requireDate(params, 'start');
  var end = requireDate(params, 'end');
  if (end.getTime() <= start.getTime()) {
    throw new Error('終了日時は開始日時より後にしてください');
  }
  event.setTime(start, end);
  return eventToJson(event);
}

function deleteEvent(params) {
  requireEvent(params).deleteEvent();
  return { deleted: true };
}

function requireEvent(params) {
  var eventId = requireString(params, 'eventId');
  var event = CalendarApp.getDefaultCalendar().getEventById(eventId);
  if (!event) {
    throw new Error('予定が見つかりません（既に削除された可能性があります）');
  }
  return event;
}

function requireString(params, name) {
  var value = params[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(name + ' を指定してください');
  }
  return value.trim();
}

function requireDate(params, name) {
  var value = new Date(requireString(params, name));
  if (isNaN(value.getTime())) {
    throw new Error(name + ' の日時形式が不正です');
  }
  return value;
}

function eventToJson(event) {
  return {
    id: event.getId(),
    title: event.getTitle(),
    start: event.getStartTime().toISOString(),
    end: event.getEndTime().toISOString(),
    description: event.getDescription() || '',
    allDay: event.isAllDayEvent(),
  };
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
