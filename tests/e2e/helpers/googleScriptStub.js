/**
 * Injects a configurable google.script.run stub into the page before load.
 * Call this in your test via: await injectGoogleScriptStub(page, mocks)
 *
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, unknown>} mocks  - map of Apps Script function name → return value
 * @param {Record<string, string>} [failures] - map of function name → error message to simulate failure
 */
async function injectGoogleScriptStub(page, mocks = {}, failures = {}) {
  await page.addInitScript(({ mocks, failures }) => {
    const makeRunner = () => {
      let successCb = null;
      let failureCb = null;

      const chain = {
        withSuccessHandler(fn) { successCb = fn; return proxy; },
        withFailureHandler(fn) { failureCb = fn; return proxy; },
      };

      const proxy = new Proxy(chain, {
        get(target, prop) {
          if (prop in target) return target[prop];
          // Any unrecognised property is treated as an Apps Script function call
          return function () {
                if (prop in failures) {
              failureCb && failureCb(failures[prop]);
            } else if (prop in mocks) {
              successCb && successCb(mocks[prop]);
            }
            // If neither defined, the call is silently ignored (no callback fired)
          };
        },
      });

      return proxy;
    };

    window.google = {
      script: {
        run: new Proxy({}, {
          get(_, prop) {
            const runner = makeRunner();
            if (prop in runner) return runner[prop];
            return runner[prop]; // forwards to proxy get
          },
        }),
        host: { close: () => {} },
      },
    };
  }, { mocks, failures });
}

module.exports = { injectGoogleScriptStub };
