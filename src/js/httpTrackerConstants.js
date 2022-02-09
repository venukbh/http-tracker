const httpTracker = {
  browser: window.browser || window.chrome,
  isFF: window.browser ? true : false,
  PAGE_PATH: "/src/html/http-tracker.html",
  STORAGE_KEY_EXCLUDE_PATTERN: "httpTrackerGlobalExcludePatterns",
  STORAGE_KEY_BLOCK_PATTERN: "httpTracker_GlobalBlockPatterns",
  STORAGE_KEY_MASK_PATTERN: "httpTracker_GlobalMaskPatterns",
  STORAGE_KEY_OPEN_ADDON_IN_TAB: "httpTracker_OpenAddonInTab"
};

const FORBIDDEN_HEADERS = ["Accept-Charset", "Accept-Encoding", "Access-Control-Request-Headers", "Access-Control-Request-Method", "Connection", "Content-Length", "Cookie", "Cookie2", "Date", "DNT", "Expect", "Feature-Policy", "Host", "Keep-Alive", "Origin", "Proxy-", "Sec-", "Referer", "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Via"];
const FORBIDDEN_HEADERS_PATTERN = ["Proxy-", "Sec-"];
const DELIMITER_AND = "&";
const DELIMITER_OR = "|";
const DELIMITER_REQUEST_COOKIE = "; ";
const DELIMITER_REQUEST_COOKIE_KEY_NAME = "Cookie";
const DELIMITER_RESPONSE_COOKIE = "\n";
const DELIMITER_RESPONSE_COOKIE_KEY_NAME = "set-cookie";
const STRING_ERROR = "ERR";
const STRING_SPACE = "&nbsp;";