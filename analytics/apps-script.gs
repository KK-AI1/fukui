/**
 * フクイちゃんとまいごの大冒険 - 滞在ログ受信用 Google Apps Script
 *
 * index.html から送られてくる「スポット到着イベント」を受け取り、
 * 紐づけたGoogleスプレッドシートに1行ずつ記録する。
 * ユーザーの画面には一切表示されず、このスプレッドシートを見る人（運営者）だけが確認できる。
 *
 * ----- セットアップ手順 -----
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
 * 5. アプリ側でスタートボタンを押したり、スポットに到着したりするたびに、
 *    このスプレッドシートに自動で行が追加されるようになる。
 *
 * ----- 記録される列 -----
 * A: receivedAt   … サーバー（Google側）が受信した時刻
 * B: timestamp    … スマホ側で記録した時刻（ISO 8601形式）
 * C: event        … "start"（冒険開始） / "arrive"（スポット到着） / "goal"（ゴール到着）
 * D: spotId       … スポット番号（1〜6、ゴールは "goal"）
 * E: spotName     … スポット名
 * F: sessionId    … 端末ごとに割り振られる匿名ID（同じ人の行動を時系列で追うためのもの。個人情報は含まない）
 *
 * 滞在時間は、同じ sessionId の行を時系列に並べ、隣り合うtimestampの差を
 * 取ることで算出できる（例: ①到着11:30 → ②到着11:40 なら①での滞在は約10分）。
 */
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  let data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    data = {};
  }

  sheet.appendRow([
    new Date(),
    data.timestamp || "",
    data.event || "",
    data.spotId != null ? data.spotId : "",
    data.spotName || "",
    data.sessionId || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput("OK");
}
