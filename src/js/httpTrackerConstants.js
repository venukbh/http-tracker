const;
const httpTracker = {
  browser: window.browser || window.chrome,
  isFF: window.browser ? true : false,
  PAGE_PATH: "/src/html/http-tracker.html",
  STORAGE_KEY_EXCLUDE_PATTERN: "httpTrackerGlobalExcludePatterns"
};


const FORBIDDEN_HEADERS = ["Accept-Charset", "Accept-Encoding", "Access-Control-Request-Headers", "Access-Control-Request-Method", "Connection", "Content-Length", "Cookie", "Cookie2", "Date", "DNT", "Expect", "Feature-Policy", "Host", "Keep-Alive", "Origin", "Proxy-", "Sec-", "Referer", "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Via"];
const FORBIDDEN_HEADERS_PATTERN = ["Proxy-", "Sec-"];
const DELIMITER_AND = "&";
const DELIMITER_OR = "|";