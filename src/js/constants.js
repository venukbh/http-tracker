const browserInstance = (globalThis.browser ?? globalThis.chrome);
const isFirefox = Boolean(
  browserInstance?.runtime?.getURL?.('')?.startsWith('moz-extension://') ||
  typeof browserInstance?.runtime?.getBrowserInfo === 'function' ||
  navigator.userAgent?.includes('Firefox')
);

const httpTracker = {
  browser: browserInstance,
  isFF: isFirefox,
  PAGE_PATH: '/src/html/http-tracker.html',
  STORAGE_KEY_EXCLUDE_PATTERN: 'httpTrackerGlobalExcludePatterns',
  STORAGE_KEY_INCLUDE_PATTERN: 'httpTracker_GlobalIncludePatterns',
  STORAGE_KEY_BLOCK_PATTERN: 'httpTracker_GlobalBlockPatterns',
  STORAGE_KEY_MASK_PATTERN: 'httpTracker_GlobalMaskPatterns',
  STORAGE_KEY_OPEN_ADDON_IN_TAB: 'httpTracker_OpenAddonInTab',
};

const FORBIDDEN_HEADERS = ['Connection', 'Content-Length', 'Keep-Alive', 'TE', 'Trailer', 'Transfer-Encoding', 'Upgrade'];
const FORBIDDEN_HEADER_PREFIXES = ['Proxy-', 'Sec-'];
const FORBIDDEN_HEADERS_PATTERN = FORBIDDEN_HEADER_PREFIXES; // Backward compatibility alias
const DELIMITER_AND = '&';
const DELIMITER_OR = '|';
const DELIMITER_REQUEST_COOKIE = '; ';
const DELIMITER_RESPONSE_COOKIE = '\n';
const HEADER_NAME_COOKIE = 'Cookie';
const HEADER_NAME_SET_COOKIE = 'set-cookie';
const DELIMITER_REQUEST_COOKIE_KEY_NAME = HEADER_NAME_COOKIE; // Backward compatibility alias
const DELIMITER_RESPONSE_COOKIE_KEY_NAME = HEADER_NAME_SET_COOKIE; // Backward compatibility alias
const STRING_ERROR = 'ERR';
const RFC_HEADER_NAME_REGEX = /^[a-zA-Z0-9!#$%&'*+^_`|~.-]+$/;
const INPUT_BOX_DELAY = 500;
