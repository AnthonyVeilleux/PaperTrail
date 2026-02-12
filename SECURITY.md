#Security Policy





#Dependency Notices
`npm audit` may report vulnerabilities in development dependencies
(e.g., ESLint). These are dev-only tools and do not affect runtime
behavior of the Google Apps Script deployment.

As of February 11, 2026, `npm audit` reports two high-severity vulnerabilities in transitive development dependencies (`git` and `mime`).
These packages are used only in the ESLint development toolchain and are not part of the deployed Google Apps Script runtime.
No fixes are currently available upstream. Because these are dev-only dependencies and not exposed to user input in production, they do not impact the security of the deployed application.
We monitor dependency updates and will apply patches when fixes become available.