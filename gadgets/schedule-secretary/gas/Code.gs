/**
 * Schedule Secretary — Google Apps Script WebApp backend.
 *
 * Deployed by EACH USER on their own Google account (BYOK model,
 * docs/architecture.md ADR-005): the platform never touches Google
 * permissions. The gadget calls this WebApp with a shared token and the
 * script operates the user's own Google Calendars via CalendarApp.
 *
 * 複数カレンダー対応: ユーザーが Google カレンダーを複数使い分けている場合
 * （個人・配偶者・夫婦共有・private など）、どのカレンダーを読み書きするかは
 * 呼び出し側（ガジェット）が calendarId で指定する。省略時はそのユーザーの
 * デフォルトカレンダーを使う（後方互換）。「どのカレンダーを自分の予定管理に
 * 数えるか」はユーザー個別の判断なので、この GAS 側は全カレンダーを機械的に
 * 読めるようにするところまでを担い、絞り込みはガジェット側（フロント）で行う。
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
      case 'listCalendars':
        return jsonResponse({ ok: true, result: listCalendars() });
      case 'list':
        return jsonResponse({ ok: true, result: listEvents(params) });
      case 'create':
        return jsonResponse({ ok: true, result: createEvent(params) });
      case 'move':
        return jsonResponse({ ok: true, result: moveEvent(params) });
      case 'moveToCalendar':
        return jsonResponse({ ok: true, result: moveEventToCalendar(params) });
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

/** ユーザーが持つ（購読含む）すべてのカレンダーの一覧。 */
function listCalendars() {
  var defaultId = CalendarApp.getDefaultCalendar().getId();
  return CalendarApp.getAllCalendars().map(function (calendar) {
    return {
      id: calendar.getId(),
      name: calendar.getName(),
      isDefault: calendar.getId() === defaultId,
    };
  });
}

/**
 * 指定した calendarIds（省略時は全カレンダー）の、指定した期間
 * （rangeStart/rangeEnd 省略時は今日から DAYS_TO_LIST 日間）の予定一覧。
 * 各予定に calendarId/calendarName を付与して返す（カレンダー横断の表示・
 * 移動・削除に使う）。
 */
function listEvents(params) {
  params = params || {};
  var start;
  var end;
  if (params.rangeStart && params.rangeEnd) {
    start = new Date(params.rangeStart);
    end = new Date(params.rangeEnd);
  } else {
    var now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(start.getTime() + DAYS_TO_LIST * 24 * 60 * 60 * 1000);
  }
  var calendars = resolveCalendars(params.calendarIds);
  var events = [];
  calendars.forEach(function (calendar) {
    calendar.getEvents(start, end).forEach(function (event) {
      events.push(eventToJson(event, calendar));
    });
  });
  events.sort(function (a, b) {
    return new Date(a.start) - new Date(b.start);
  });
  return events;
}

function createEvent(params) {
  var title = requireString(params, 'title');
  var start = requireDate(params, 'start');
  var end = requireDate(params, 'end');
  if (end.getTime() <= start.getTime()) {
    throw new Error('終了日時は開始日時より後にしてください');
  }
  var calendar = resolveCalendar(params.calendarId);
  var options = params.description ? { description: String(params.description) } : {};
  var event = calendar.createEvent(title, start, end, options);
  return eventToJson(event, calendar);
}

function moveEvent(params) {
  var calendar = resolveCalendar(params.calendarId);
  var eventId = requireString(params, 'eventId');
  var event = calendar.getEventById(eventId);
  if (!event) {
    throw new Error('予定が見つかりません（既に削除された可能性があります）');
  }
  var start = requireDate(params, 'start');
  var end = requireDate(params, 'end');
  if (end.getTime() <= start.getTime()) {
    throw new Error('終了日時は開始日時より後にしてください');
  }
  event.setTime(start, end);
  return eventToJson(event, calendar);
}

/**
 * カレンダーを横断した移動（「登録した予定はカレンダーを横断して変更できる」
 * 要件）。classic CalendarApp には「別カレンダーへ移す」直接APIが無いため、
 * 元の予定を複製して新しいカレンダーに作り直し、元を削除する。
 */
function moveEventToCalendar(params) {
  var fromCalendar = resolveCalendar(params.calendarId);
  var eventId = requireString(params, 'eventId');
  var event = fromCalendar.getEventById(eventId);
  if (!event) {
    throw new Error('予定が見つかりません（既に削除された可能性があります）');
  }
  var toCalendar = resolveCalendar(requireString(params, 'toCalendarId'));
  var start = event.getStartTime();
  var end = event.getEndTime();
  var options = event.getDescription() ? { description: event.getDescription() } : {};
  var created = toCalendar.createEvent(event.getTitle(), start, end, options);
  event.deleteEvent();
  return eventToJson(created, toCalendar);
}

function deleteEvent(params) {
  var calendar = resolveCalendar(params.calendarId);
  var eventId = requireString(params, 'eventId');
  var event = calendar.getEventById(eventId);
  if (!event) {
    throw new Error('予定が見つかりません（既に削除された可能性があります）');
  }
  event.deleteEvent();
  return { deleted: true };
}

/** calendarId を指定した Calendar を返す（省略時はデフォルトカレンダー）。 */
function resolveCalendar(calendarId) {
  if (!calendarId) return CalendarApp.getDefaultCalendar();
  var calendar = CalendarApp.getCalendarById(String(calendarId));
  if (!calendar) throw new Error('カレンダーが見つかりません: ' + calendarId);
  return calendar;
}

/** calendarIds（配列、省略時は全カレンダー）を Calendar のリストに変換。 */
function resolveCalendars(calendarIds) {
  if (!calendarIds || !calendarIds.length) return CalendarApp.getAllCalendars();
  return calendarIds.map(function (id) {
    var calendar = CalendarApp.getCalendarById(String(id));
    if (!calendar) throw new Error('カレンダーが見つかりません: ' + id);
    return calendar;
  });
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

function eventToJson(event, calendar) {
  return {
    id: event.getId(),
    calendarId: calendar.getId(),
    calendarName: calendar.getName(),
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
