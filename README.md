# PDF.js

PDF.js is a Portable Document Format (PDF) viewer that is built with HTML5.

PDF.js is community-driven and supported by Mozilla Labs. Our goal is to
create a general-purpose, web standards-based platform for parsing and
rendering PDFs.

## Git remotes to add

- mozilla-origin : https://github.com/mozilla/pdf.js.git
- origin : git@gitlab.ridi.io:viewer-app/pdf.js.git

Please take care of differences between RIDI viewer and the original PDF.js viewer, such as
- Supporting two page display mode.
- Using larger PDFPageView cache.
- Using the presentation mode with very different behaviors.

## Contributing

PDF.js is an open source project and always looking for more contributors. To
get involved checkout:

+ [Issue Reporting Guide](https://github.com/mozilla/pdf.js/blob/master/.github/CONTRIBUTING.md)
+ [Code Contribution Guide](https://github.com/mozilla/pdf.js/wiki/Contributing)
+ [Frequently Asked Questions](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
+ [Good Beginner Bugs](https://github.com/mozilla/pdf.js/issues?direction=desc&labels=5-good-beginner-bug&page=1&sort=created&state=open)
+ [Priorities](https://github.com/mozilla/pdf.js/milestones)
+ [Attend a Public Meeting](https://github.com/mozilla/pdf.js/wiki/Weekly-Public-Meetings)

For further questions or guidance feel free to stop by #pdfjs on
irc.mozilla.org.

### Online demo

+ http://mozilla.github.io/pdf.js/web/viewer.html

### Browser Extensions

#### Chrome

+ The official extension for Chrome can be installed from the [Chrome Web Store](https://chrome.google.com/webstore/detail/pdf-viewer/oemmndcbldboiebfnladdacbdfmadadm).
*This extension is maintained by [@Rob--W](https://github.com/Rob--W).*
+ Build Your Own - Get the code as explained below and issue `gulp chromium`. Then open
Chrome, go to `Tools > Extension` and load the (unpackaged) extension from the
directory `build/chromium`.

## Building PDF.js (or only PDF.js viewer)

First, install Node.js via the [official package](http://nodejs.org) or via [nvm](https://github.com/creationix/nvm).

Next,
> $ npm install -g gulp-cli

> $ npm install

> $ ./get_viewer.sh

The commands above will generate the generic viewer without building the entire library.
Note that files for RIDI viewer should be located at the ridi_modules directory. 

In order to bundle all `src/` files into two productions scripts and build the generic viewer, issue:

> $ ./get_viewer.sh -f

This will generate `pdf.js` and `pdf.worker.js` in the `build/generic/build/` directory.
Both scripts are needed but only `pdf.js` needs to be included since `pdf.worker.js` will
be loaded by `pdf.js`. If you want to support more browsers than Firefox you'll also need
to include `compatibility.js` from `build/generic/web/`. The PDF.js files are large and
should be minified for production.

## Questions

Check out our FAQs and get answers to common questions:

+ https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions

Talk to us on IRC:

+ #pdfjs on irc.mozilla.org

Join our mailing list:

+ dev-pdf-js@lists.mozilla.org

Subscribe either using lists.mozilla.org or Google Groups:

+ https://lists.mozilla.org/listinfo/dev-pdf-js
+ https://groups.google.com/group/mozilla.dev.pdf-js/topics

Follow us on twitter: @pdfjs

+ http://twitter.com/#!/pdfjs

Weekly Public Meetings

+ https://github.com/mozilla/pdf.js/wiki/Weekly-Public-Meetings
