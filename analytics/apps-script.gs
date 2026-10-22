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
 *   どちらも1行目に日本語の見出し（質問文そのまま）、2行目以降に回答が溜まっていく。
 *   見出し行は毎回の受信時に最新の内容へ自動で上書きされるので、この
 *   ファイルを更新して「デプロイを管理→新バージョン」で再デプロイすれば、
 *   既存のシートの見出しも次の回答受信時に自動で直る（過去の回答データは
 *   そのまま残る）。
 *
 * "ar_telemetry" シート（自動作成）: AR機能の研究用ログ
 *   AR方式の判定結果、モデル読み込み失敗、撮影/保存の成否などを記録する。
 *   写真そのもの（画像データ）は一切含まれない。
 *   A: receivedAt / B: timestamp / C: sessionId / D: appVersion / E: device /
 *   F: event / G: arMode / H: modelPath / I: spotId / J: success /
 *   K: hasCameraBg / L: detail / M: ua
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
  } else if (data.type === "ar_telemetry") {
    logArTelemetry(data);
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

/* ---------- アンケート（専用シートに記録、なければ自動作成） ----------
 * key: index.html側の質問id（answersオブジェクトのキー）。変更しないこと。
 * label: スプレッドシートの見出しに表示する日本語の質問文。
 */
const SURVEY_PRE_FIELDS = [
  { key: "age", label: "①年齢" },
  { key: "residence", label: "②居住地" },
  { key: "stationPurpose", label: "③福井駅の利用目的" },
  { key: "stationPurposeOther", label: "③福井駅の利用目的（その他自由記述）" },
  { key: "plannedDuration", label: "④福井駅周辺での滞在予定時間" },
  { key: "plannedSpots", label: "⑤福井駅周辺で訪れる予定の場所" },
  { key: "plannedSpotsOther", label: "⑤福井駅周辺で訪れる予定の場所（その他自由記述）" },
  { key: "walkIntent", label: "⑥福井駅周辺を歩いて回る予定がある" },
  { key: "detourIntent", label: "⑦予定している場所以外にも立ち寄ってみたい" },
];

const SURVEY_POST_FIELDS = [
  { key: "unplannedVisit", label: "⑧予定していなかった場所に立ち寄った" },
  { key: "behaviorChange", label: "⑨普段なら行かなかった場所に行った" },
  { key: "walkIntentAfter", label: "⑩福井駅周辺をより歩いてみたいと思った" },
  { key: "stayLonger", label: "⑪滞在時間が伸びたと感じる" },
  { key: "experienceChange", label: "⑫福井駅周辺での過ごし方が変わった" },
  { key: "satisfaction", label: "⑬体験に満足している" },
  { key: "revisitIntent", label: "⑭福井駅周辺をまた訪れたいと思った" },
  { key: "futureUseIntent", label: "⑮今後、同じようなアプリがあれば利用したい" },
  { key: "actualSpots", label: "⑯実際に立ち寄った場所" },
  { key: "actualSpotsOther", label: "⑯実際に立ち寄った場所（その他自由記述）" },
  { key: "actualDuration", label: "⑰実際の滞在時間" },
  { key: "freeComment", label: "⑱アプリを使ってよかった点・改善してほしい点" },
];

function logSurvey(sheetName, fields, data) {
  const header = ["受信日時", "送信日時（端末）", "匿名セッションID"].concat(fields.map(function (f) { return f.label; }));
  const sheet = getOrCreateSheet(sheetName, header);
  const answers = data.answers || {};
  const row = [new Date(), data.timestamp || "", data.sessionId || ""];
  fields.forEach(function (f) {
    const v = answers[f.key];
    row.push(Array.isArray(v) ? v.join(", ") : (v || ""));
  });
  sheet.appendRow(row);
}

/* ---------- ARテレメトリ（専用シートに記録、なければ自動作成） ---------- */
const AR_TELEMETRY_HEADER = [
  "receivedAt", "timestamp", "sessionId", "appVersion", "device",
  "event", "arMode", "modelPath", "spotId", "success", "hasCameraBg", "detail", "ua",
];
function logArTelemetry(data) {
  const sheet = getOrCreateSheet("ar_telemetry", AR_TELEMETRY_HEADER);
  sheet.appendRow([
    new Date(),
    data.timestamp || "",
    data.sessionId || "",
    data.appVersion || "",
    data.device || "",
    data.event || "",
    data.arMode || "",
    data.modelPath || "",
    data.spotId != null ? data.spotId : "",
    data.success != null ? data.success : "",
    data.hasCameraBg != null ? data.hasCameraBg : "",
    data.detail || "",
    data.ua || "",
  ]);
}

function getOrCreateSheet(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
  } else {
    // 既にシートがある場合も、見出し行だけは常に最新の内容に合わせて上書きする。
    // （列の並び順・数は変えていないので、2行目以降の既存データには影響しない。
    //   例: 見出しを英語→日本語に変えた場合も、再デプロイ後の最初の書き込みで
    //   古いシートの見出しが自動的に日本語に直る。）
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sheet;
}
