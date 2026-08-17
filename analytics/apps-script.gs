/**
 * フクイちゃんとまいごの大冒険 - 滞在ログ＋アンケート受信用 Google Apps Script
 *
 * index.html から送られてくる「スポット到着イベント」と「アンケート回答」を
 * 受け取り、紐づけたGoogleスプレッドシートに記録する。
 * ユーザーの画面には一切表示されず、このスプレッドシートを見る人（運営者）だけが確認できる。
 *
 * ----- セットアップ手順（初回のみ） -----
 * 1. 新規Googleスプレッドシートを作成する（例: 「フクイちゃんマップ 滞在ログ」）。
 * 2. メニューの「拡張機能」→「Apps Script」を開き、既定の Code.gs の中身を
 *    このファイルの内容にすべて置き換えて保存する。
 * 3. 右上の「デプロイ」→「新しいデプロイ」を選択する。
 *    - 種類の選択: 「ウェブアプリ」
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 *    → 「デプロイ」を押し、表示されたウェブアプリのURLをコピーする。
 * 4. index.html 内の `const LOG_ENDPOINT = "";` の "" の部分に、
 *    コピーしたURLを貼り付ける（例: LOG_ENDPOINT = "https://script.google.com/macros/s/xxxx/exec"）。
 *
 * ----- 既にセットアップ済みで、このファイルを更新した場合 -----
 * 「デプロイ」→「デプロイを管理」→ 鉛筆アイコン(編集) →
 * バージョン「新バージョン」を選んで「デプロイ」を押せば、
 * URLはそのままでコードだけ更新できる（index.html側の変更は不要）。
 *
 * ----- 記録されるシート -----
 * 1枚目のシート（元からあるシート）: スポット到着ログ
 *   A: receivedAt … サーバーが受信した時刻
 *   B: timestamp  … 端末側で記録した時刻（ISO 8601）
 *   C: event      … "start"（冒険開始） / "arrive"（スポット到着） / "goal"（ゴール到着）
 *   D: spotId     … スポット番号（1〜6、ゴールは "goal"）
 *   E: spotName   … スポット名
 *   F: sessionId  … 端末ごとの匿名ID（個人情報は含まない）
 *
 *   滞在時間は、同じ sessionId の行を時系列に並べ、隣り合うtimestampの差を
 *   取ることで算出できる（例: ①到着11:30 → ②到着11:40 なら①での滞在は約10分）。
 *
 * "survey_pre" シート（自動作成）: アプリ使用前アンケート（①〜⑦）
 * "survey_post" シート（自動作成）: アプリ使用後アンケート（⑧〜⑱）
 *   どちらも1行目に見出し、2行目以降に回答が溜まっていく。
 */
function doPost(e) {
  let data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    data = {};
  }

  if (data.type === "survey_pre") {
    logSurvey("survey_pre", SURVEY_PRE_FIELDS, data);
  } else if (data.type === "survey_post") {
    logSurvey("survey_post", SURVEY_POST_FIELDS, data);
  } else {
    logVisitEvent(data);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput("OK");
}

/* ---------- スポット到着ログ（元からあるシートの1枚目に記録） ---------- */
function logVisitEvent(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.appendRow([
    new Date(),
    data.timestamp || "",
    data.event || "",
    data.spotId != null ? data.spotId : "",
    data.spotName || "",
    data.sessionId || "",
  ]);
}

/* ---------- アンケート（専用シートに記録、なければ自動作成） ---------- */
const SURVEY_PRE_FIELDS = [
  "age", "residence",
  "stationPurpose", "stationPurposeOther",
  "plannedDuration",
  "plannedSpots", "plannedSpotsOther",
  "walkIntent", "detourIntent",
];

const SURVEY_POST_FIELDS = [
  "unplannedVisit", "behaviorChange", "walkIntentAfter", "stayLonger",
  "experienceChange", "satisfaction", "revisitIntent", "futureUseIntent",
  "actualSpots", "actualSpotsOther",
  "actualDuration",
  "freeComment",
];

function logSurvey(sheetName, fields, data) {
  const header = ["receivedAt", "timestamp", "sessionId"].concat(fields);
  const sheet = getOrCreateSheet(sheetName, header);
  const answers = data.answers || {};
  const row = [new Date(), data.timestamp || "", data.sessionId || ""];
  fields.forEach(function (f) {
    const v = answers[f];
    row.push(Array.isArray(v) ? v.join(", ") : (v || ""));
  });
  sheet.appendRow(row);
}

function getOrCreateSheet(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
  }
  return sheet;
}
