// this cannot be used in browser.js as that js itself is self implemented and does not take external script files
// But when ever this file is changed, make sure the same copy is updated there and vice-versa
if (window.browser) {
  httpTracker = {
    webEventConsumer: window.browser,
    browserName: "firefox",
    isFirefoxBrowser: true
  };
} else {
  httpTracker = {
    webEventConsumer: window.chrome,
    browserName: "chrome"
  };
}