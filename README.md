# PDF.js

PDF.js is a Portable Document Format (PDF) viewer that is built with HTML5.

PDF.js is community-driven and supported by Mozilla Labs. Our goal is to
create a general-purpose, web standards-based platform for parsing and
rendering PDFs.

## Git remotes to add

- mozilla-origin : https://github.com/mozilla/pdf.js.git
- origin : git@github.com:ridibooks/pdf.js.git 

Please take care of differences between RIDI viewer and the original PDF.js viewer, such as
- Supporting two page display mode.
- Using larger PDFPageView cache.
- Using the presentation mode with **VERY** different behaviors.
- Please refer to the [wiki page](https://ridicorp.atlassian.net/wiki/pages/viewpage.action?pageId=77856777) for details.

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

+ https://mozilla.github.io/pdf.js/web/viewer.html

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
> $ npm install -g npm@latest

> $ npm install -g gulp-cli

> $ npm install
  
> $ npm update

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

## Using PDF.js in a web application

To use PDF.js in a web application you can choose to use a pre-built version of the library
or to build it from source. We supply pre-built versions for usage with NPM and Bower under
the `pdfjs-dist` name. For more information and examples please refer to the
[wiki page](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website) on this subject.

## Learning

You can play with the PDF.js API directly from your browser through the live
demos below:

+ [Interactive examples](http://mozilla.github.io/pdf.js/examples/index.html#interactive-examples)

The repo contains a hello world example that you can run locally:

+ [examples/helloworld/](https://github.com/mozilla/pdf.js/blob/master/examples/helloworld/)

For an introduction to the PDF.js code, check out the presentation by our
contributor Julian Viereck:

+ http://www.youtube.com/watch?v=Iv15UY-4Fg8

You can read more about PDF.js here:

+ http://andreasgal.com/2011/06/15/pdf-js/
+ http://blog.mozilla.com/cjones/2011/06/15/overview-of-pdf-js-guts/

Even more learning resources can be found at:

+ https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources

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
