/* globals QWebChannel, qt, PDFViewerApplication, PDFJS */

'use strict';

var RidiPdfViewer = function() {
  var self = this;
  new QWebChannel(qt.webChannelTransport, function(channel) {
    self.nativeViewer = channel.objects.nativeViewer;
    self.nativeViewer.jsViewerCreated();
  });
};

RidiPdfViewer.prototype.showPopup = function(title, text) {
  this.nativeViewer.showPopup(title ? title.toString() : '',
      text ? text.toString() : '');
};

RidiPdfViewer.prototype.showWarningPopup = function(title, text) {
  this.nativeViewer.showWarningPopup(title ? title.toString() : '',
      text ? text.toString() : '');
};

RidiPdfViewer.prototype.showErrorPopup = function(title, text, closeReaderWindow) {
  this.nativeViewer.showErrorPopup(title ? title.toString() : '',
      text ? text.toString() : '', closeReaderWindow);
};

RidiPdfViewer.prototype.onError = function(err) {
  console.trace();
  console.error(err);
  if (err instanceof Error) {
    this.nativeViewer.logWarning(err.stack.toString());
  } else {
    this.nativeViewer.logWarning(err ? err.toString() : 'Unknown error');
  }
};

RidiPdfViewer.prototype.onErrorWithPopup = function(err) {
  this.onError(err);
  this.showWarningPopup('', err);
};

RidiPdfViewer.prototype.optimizePageCacheForWindows = function() {
  var pdfViewer = PDFViewerApplication.pdfViewer;
  pdfViewer.defaultCacheSize = 35; 
  pdfViewer.defaultVerticalTolerance = 500;
  pdfViewer.defaultAdjacentPagesToDraw = 2;
};

RidiPdfViewer.prototype.setTocFromPdfOutline = function(outline) {
  if (!outline) {
    console.warn('Outline is null (the book may not have any toc item.)');
    return;
  }

  var pdfLinkService = PDFViewerApplication.pdfLinkService;
  if (!pdfLinkService) {
    this.onError('No PDFLinkService');
    return;
  }

  var self = this;
  var pagePromises = [];
  outline.forEach(function pageFinder(item) {
    var pagePromise = pdfLinkService.getDestinationPagePromise(item.dest, true)
      .then(function(pageNumber, dest) {
        if (pageNumber) {
          item.page = pageNumber;
        }
      }, self.onError);
    pagePromises.push(pagePromise);
    if (item.items instanceof Array) {
      item.items.forEach(pageFinder);
    }
  });

  Promise.all(pagePromises).then(function() {
    var tocLevel = 0;
    var tocArray = [];
    outline.forEach(function tocFinder(item) {
      if (item.page === undefined) {
        return;
      }

      var tocItem = {};
      tocItem.level = tocLevel;
      tocItem.label = item.title;
      tocItem.location = item.dest ?
        PDFViewerApplication.pdfLinkService.getDestinationHash(item.dest) : '';
      tocItem.page = item.page;
      tocArray.push(tocItem);
      tocLevel++;
      if (item.items instanceof Array) {
        item.items.forEach(tocFinder);
      }
      tocLevel--;
    });
    self.nativeViewer.jsTocArrayAvailable(JSON.stringify(tocArray));
  });
};

window.RidiPdfViewer = new RidiPdfViewer();

