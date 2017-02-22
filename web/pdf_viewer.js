/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/pdf_viewer', ['exports', 'pdfjs-web/ui_utils',
      'pdfjs-web/pdf_page_view', 'pdfjs-web/pdf_rendering_queue',
      'pdfjs-web/text_layer_builder', 'pdfjs-web/annotation_layer_builder',
      'pdfjs-web/pdf_link_service', 'pdfjs-web/dom_events', 'pdfjs-web/pdfjs'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'), require('./pdf_page_view.js'),
      require('./pdf_rendering_queue.js'), require('./text_layer_builder.js'),
      require('./annotation_layer_builder.js'),
      require('./pdf_link_service.js'), require('./dom_events.js'),
      require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebPDFViewer = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebPDFPageView, root.pdfjsWebPDFRenderingQueue,
      root.pdfjsWebTextLayerBuilder, root.pdfjsWebAnnotationLayerBuilder,
      root.pdfjsWebPDFLinkService, root.pdfjsWebDOMEvents, root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, pdfPageView, pdfRenderingQueue,
                  textLayerBuilder, annotationLayerBuilder, pdfLinkService,
                  domEvents, pdfjsLib) {

var UNKNOWN_SCALE = uiUtils.UNKNOWN_SCALE;
var SCROLLBAR_PADDING = uiUtils.SCROLLBAR_PADDING;
var VERTICAL_PADDING = uiUtils.VERTICAL_PADDING;
var CSS_UNITS = uiUtils.CSS_UNITS;
var DEFAULT_SCALE = uiUtils.DEFAULT_SCALE;
var DEFAULT_SCALE_VALUE = uiUtils.DEFAULT_SCALE_VALUE;
var RendererType = uiUtils.RendererType;
var scrollIntoView = uiUtils.scrollIntoView;
var watchScroll = uiUtils.watchScroll;
var getVisibleElements = uiUtils.getVisibleElements;
var PDFPageView = pdfPageView.PDFPageView;
var RenderingStates = pdfRenderingQueue.RenderingStates;
var PDFRenderingQueue = pdfRenderingQueue.PDFRenderingQueue;
var TextLayerBuilder = textLayerBuilder.TextLayerBuilder;
var AnnotationLayerBuilder = annotationLayerBuilder.AnnotationLayerBuilder;
var SimpleLinkService = pdfLinkService.SimpleLinkService;

var PresentationModeState = {
  UNKNOWN: 0,
  NORMAL: 1,
  CHANGING: 2,
  FULLSCREEN: 3,
};

/**
 * QtWebEngine (5.7.0) on Mac seems to leak memory during DOM operations, (sometimes uses 4GB+)
 * so it's better to have a very large cache (10 MB * 180 pages : approximately up to 1.8GB)
 * to avoid drawing tasks.
 *
 * This assumes that generally Mac PC has larger RAM than Windows PC.
 *
 * The values below are for Mac.
 */
var DEFAULT_CACHE_SIZE = 180;
var DEFAULT_VERTICAL_TOLERANCE = 500;
var DEFAULT_ADJACENT_PAGES_TO_DRAW = 7;

/**
 * @typedef {Object} PDFViewerOptions
 * @property {HTMLDivElement} container - The container for the viewer element.
 * @property {HTMLDivElement} viewer - (optional) The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {DownloadManager} downloadManager - (optional) The download
 *   manager component.
 * @property {PDFRenderingQueue} renderingQueue - (optional) The rendering
 *   queue object.
 * @property {boolean} removePageBorders - (optional) Removes the border shadow
 *   around the pages. The default is false.
 * @property {boolean} enhanceTextSelection - (optional) Enables the improved
 *   text selection behaviour. The default is `false`.
 * @property {boolean} renderInteractiveForms - (optional) Enables rendering of
 *   interactive form elements. The default is `false`.
 * @property {boolean} enablePrintAutoRotate - (optional) Enables automatic
 *   rotation of pages whose orientation differ from the first page upon
 *   printing. The default is `false`.
 * @property {string} renderer - 'canvas' or 'svg'. The default is 'canvas'.
 */

/**
 * Simple viewer control to display PDF content/pages.
 * @class
 * @implements {IRenderableView}
 */
var PDFViewer = (function pdfViewer() {
  function PDFPageViewBuffer(size) {
    var data = [];
    this.push = function cachePush(view) {
      var i = data.indexOf(view);
      if (i >= 0) {
        data.splice(i, 1);
      }
      data.push(view);
      if (data.length > size) {
        data.shift().destroy();
      }
    };
    this.resize = function (newSize) {
      size = newSize;
      while (data.length > size) {
        data.shift().destroy();
      }
    };
  }

  function isSameScale(oldScale, newScale) {
    if (newScale === oldScale) {
      return true;
    }
    if (Math.abs(newScale - oldScale) < 1e-15) {
      // Prevent unnecessary re-rendering of all pages when the scale
      // changes only because of limited numerical precision.
      return true;
    }
    return false;
  }

  function isPortraitOrientation(size) {
    return size.width <= size.height;
  }

  /**
   * @constructs PDFViewer
   * @param {PDFViewerOptions} options
   */
  function PDFViewer(options) {
    this.container = options.container;
    this.viewer = options.viewer || options.container.firstElementChild;
    this.eventBus = options.eventBus || domEvents.getGlobalEventBus();
    this.linkService = options.linkService || new SimpleLinkService();
    this.downloadManager = options.downloadManager || null;
    this.removePageBorders = options.removePageBorders || false;
    this.enhanceTextSelection = options.enhanceTextSelection || false;
    this.renderInteractiveForms = options.renderInteractiveForms || false;
    this.enablePrintAutoRotate = options.enablePrintAutoRotate || false;
    this.renderer = options.renderer || RendererType.CANVAS;

    this.defaultRenderingQueue = !options.renderingQueue;
    if (this.defaultRenderingQueue) {
      // Custom rendering queue is not specified, using default one
      this.renderingQueue = new PDFRenderingQueue();
      this.renderingQueue.setViewer(this);
    } else {
      this.renderingQueue = options.renderingQueue;
    }

    this.scroll = watchScroll(this.container, this._scrollUpdate.bind(this));
    this.presentationModeState = PresentationModeState.UNKNOWN;
    this._resetView();

    if (this.removePageBorders) {
      this.viewer.classList.add('removePageBorders');
    }

    this.eventBus.on('loadingIconVisibilityChanged', function(e) {
      if (this._getAdjustedPageNumber(e.pageNumber) === this.currentPageNumber) {
        this._updateLoadingIcons(e.visible);
      }
    }.bind(this));

    this.eventBus.on('resize', this._updateScaleClassList.bind(this));
  }

  PDFViewer.prototype = /** @lends PDFViewer.prototype */{
    /**
     * PageView cache options
     */
    get defaultCacheSize() {
      return this._defaultCacheSize || DEFAULT_CACHE_SIZE;
    },

    set defaultCacheSize(val) {
      this._defaultCacheSize = Math.max(val, 10);
    },

    get defaultVerticalTolerance() {
      return this._defaultVerticalTolerance || DEFAULT_VERTICAL_TOLERANCE;
    },

    set defaultVerticalTolerance(val) {
      this._defaultVerticalTolerance = Math.max(val, 0);
    },

    get defaultAdjacentPagesToDraw() {
      return this._defaultAdjacentPagesToDraw || DEFAULT_ADJACENT_PAGES_TO_DRAW;
    },

    set defaultAdjacentPagesToDraw(val) {
      this._defaultAdjacentPagesToDraw = Math.max(val, 0);
    },

    temporarilyDisablePreDrawing: function PDFViewer_temporarilyDisablePreDrawing(duration) {
      duration = duration || 10000;
      var defaultVerticalTolerance = this.defaultVerticalTolerance;
      var defaultAdjacentPagesToDraw = this.defaultAdjacentPagesToDraw;
      this.defaultVerticalTolerance = 0;
      this.defaultAdjacentPagesToDraw = 0;
      if (this._disablePreDrawingTimeout) {
        clearTimeout(this._disablePreDrawingTimeout);
      }
      this._disablePreDrawingTimeout = setTimeout(function() {
        this.defaultVerticalTolerance = defaultVerticalTolerance;
        this.defaultAdjacentPagesToDraw = defaultAdjacentPagesToDraw;
        this._disablePreDrawingTimeout = null;
      }.bind(this), duration);
    },

    get twoPageMode() {
      return this._twoPageMode;
    },

    set twoPageMode(val) {
      val = !!val;
      var currentPageNumber = this._currentPageNumber + (this.isLookingAtRightSidePage ? 1 : 0);
      var pageView;

      for (var i = 0; i < this._pages.length; i++) {
        pageView = this._pages[i];
        pageView.containerHasAnEmptyPageAfterCover = this._hasAnEmptyPageAfterCover;
        pageView.twoPageMode = val;
      }

      this._twoPageMode = val;
      if (!val) {
        // Restore the default state if exiting twoPageMode.
        this._hasAnEmptyPageAfterCover = false;
      }

      this.currentPageNumber = currentPageNumber;
      if (val && this.currentPageNumber !== currentPageNumber) {
        // When currentPageNumber becomes the right side pageNumber after changing the mode,
        // Try to restore the left corner.
        var rightPageLeft = this._pages[currentPageNumber - 1].div.getBoundingClientRect().left;
        this.container.scrollLeft += rightPageLeft;
      }

      this.update();
    },

    /**
     * Indicates two page display will begin after page 2. (2/3 Mode)
     * Actually no empty page is inserted though...
     */
    get hasAnEmptyPageAfterCover() {
      return this._hasAnEmptyPageAfterCover;
    },

    /**
     * Setting this property will always activate twoPageMode.
     */
    set hasAnEmptyPageAfterCover(val) {
      if (this._twoPageMode) {
        this.twoPageMode = false;
      }
      this._hasAnEmptyPageAfterCover = !!val;
      this.twoPageMode = true;
    },

    get pagesCount() {
      return this._pages.length;
    },

    getPageView: function (index) {
      return this._pages[index];
    },

    get currentPageView() {
      return this._pages[this._currentPageNumber - 1];
    },

    get currentRightSidePageView() {
      if (this._twoPageMode &&
          !(this._hasAnEmptyPageAfterCover && this._currentPageNumber === 1)) {
        return this._pages[this._currentPageNumber];
      }
      return null;
    },

    /**
     * Get one with the larger height, of the left / right side pageView.
     * Just returns currentPageView if twoPageMode is inactive.
     */
    get currentLargerHeightPageView() {
      var pageView = this.currentPageView;
      var rightSidePageView = this.currentRightSidePageView;
      if (rightSidePageView && rightSidePageView.div.clientHeight > pageView.div.clientHeight) {
        pageView = rightSidePageView;
      }
      return pageView;
    },

    /**
     * Adjusts the given page number to comply with the current page view mode.
     * May be useful to find page number of the currently visible page at the left side.
     *
     * If the pageNumber is out of bounds, it is bounded into valid range.
     */
    _getAdjustedPageNumber: function pdfViewer_getAdjustedPageNumber(pageNumber) {
      pageNumber = Math.min(Math.max(1, pageNumber), this.pagesCount);
      if (!this.twoPageMode) {
        return pageNumber;
      }

      if (!this.hasAnEmptyPageAfterCover) {
        // Page Number will proceed like : 1, 3, 5, 7, 9 ..
        // Even number pages will be displayed next to the odd number pages.
        return pageNumber - ((pageNumber % 2 === 0) ? 1 : 0);
      }
      // 1, 2, 4, 6, 8, 10 ..
      return (pageNumber === 1) ? 1 : (pageNumber - ((pageNumber % 2 === 0) ? 0 : 1));
    },

    get pageSwitchUnit() {
      return (this._twoPageMode ? 2 : 1);
    },

    /**
     * @returns {boolean} true if all {PDFPageView} objects are initialized.
     */
    get pageViewsReady() {
      return this._pageViewsReady;
    },

    /**
     * @returns {number}
     */
    get currentPageNumber() {
      return this._getAdjustedPageNumber(this._currentPageNumber);
    },

    /**
     * @param {number} val - The page number.
     */
    set currentPageNumber(val) {
      if ((val | 0) !== val) { // Ensure that `val` is an integer.
        throw new Error('Invalid page number.');
      }
      if (!this.pdfDocument) {
        this._currentPageNumber = val;
        return;
      }
      // The intent can be to just reset a scroll position and/or scale.
      this._setCurrentPageNumber(val, /* resetCurrentPageView = */ true);
    },

    /**
     * @private
     */
    _setCurrentPageNumber:
        function PDFViewer_setCurrentPageNumber(val, resetCurrentPageView) {
      val = this._getAdjustedPageNumber(val);
      var arg = {
        source: this,
        pageNumber: val,
        previousPageNumber: this._currentPageNumber,
        pageLabel: this._pageLabels && this._pageLabels[val - 1],
      };
      this._currentPageNumber = val;
      this.eventBus.dispatch('pagechanging', arg);
      this.eventBus.dispatch('pagechange', arg);

      if (resetCurrentPageView) {
        this._resetCurrentPageView();
      }
    },

    get isLookingAtRightSidePage() {
      var rightPage = this.currentRightSidePageView;
      if (!rightPage) {
        return false;
      }

      var rightPageViewRect = rightPage.div.getBoundingClientRect();
      var containerRect = this.container.getBoundingClientRect();
      var containerRectMiddle = (containerRect.left + containerRect.right) / 2;

      // L/R < 3/4
      return rightPageViewRect.left < containerRectMiddle - rightPageViewRect.width / 8;
    },

    get isLookingAtLeftSidePage() {
      var rightPage = this.currentRightSidePageView;
      if (!rightPage) {
        return !!this.currentPageView;
      }

      var rightPageViewRect = rightPage.div.getBoundingClientRect();
      var containerRect = this.container.getBoundingClientRect();
      var containerRectMiddle = (containerRect.left + containerRect.right) / 2;

      // L/R > 4/3
      return rightPageViewRect.left > containerRectMiddle + rightPageViewRect.width / 8;
    },

    /**
     * @returns {string|null} Returns the current page label,
     *                        or `null` if no page labels exist.
     */
    get currentPageLabel() {
      return this._pageLabels && this._pageLabels[this._currentPageNumber - 1];
    },

    /**
     * @param {string} val - The page label.
     */
    set currentPageLabel(val) {
      var pageNumber = val | 0; // Fallback page number.
      if (this._pageLabels) {
        var i = this._pageLabels.indexOf(val);
        if (i >= 0) {
          pageNumber = i + 1;
        }
      }
      this.currentPageNumber = pageNumber;
    },

    /**
     * @returns {number}
     */
    get currentScale() {
      return this._currentScale !== UNKNOWN_SCALE ? this._currentScale :
                                                    DEFAULT_SCALE;
    },

    /**
     * @param {number} val - Scale of the pages in percents.
     */
    set currentScale(val) {
      if (isNaN(val)) {
        throw new Error('Invalid numeric scale');
      }
      if (!this.pdfDocument) {
        this._currentScale = val;
        this._currentScaleValue = val !== UNKNOWN_SCALE ? val.toString() : null;
        return;
      }
      this._setScale(val, false);
    },

    /**
     * @returns {string}
     */
    get currentScaleValue() {
      return this._currentScaleValue;
    },

    /**
     * @param val - The scale of the pages (in percent or predefined value).
     */
    set currentScaleValue(val) {
      if (!this.pdfDocument) {
        this._currentScale = isNaN(val) ? UNKNOWN_SCALE : val;
        this._currentScaleValue = val.toString();
        return;
      }
      this._setScale(val, false);
    },

    /**
     * @returns {number} - The scale in page-width mode
     *                     for the current page on the current viewport.
     */
    get currentPageWidthScale() {
      var currentPage = this.currentPageView;
      if (!currentPage) {
        return DEFAULT_SCALE;
      }

      var hPadding = (this.isInPresentationMode || this.removePageBorders) ?
        0 : SCROLLBAR_PADDING;
      var pageScale = currentPage.scale;
      var pageWidth = currentPage.width;

      var secondPage = this.currentRightSidePageView;
      if (secondPage) {
        hPadding *= 2;
        pageScale = Math.min(pageScale, secondPage.scale);
        pageWidth += secondPage.width;
      }

      return pageScale * ((this.container.clientWidth - hPadding) / pageWidth);
    },

    /**
     * @returns {number} - The scale in page-height mode
     *                     for the current page on the current viewport
     */
    get currentPageHeightScale() {
      var currentPage = this.currentPageView;
      if (!currentPage) {
        return DEFAULT_SCALE;
      }

      var vPadding = (this.isInPresentationMode || this.removePageBorders) ?
        0 : VERTICAL_PADDING;
      var pageScale = currentPage.scale;
      var pageHeight = currentPage.height;

      var secondPage = this.currentRightSidePageView;
      if (secondPage) {
        vPadding *= 2;
        pageScale = Math.min(pageScale, secondPage.scale);
        pageHeight = Math.max(pageHeight, secondPage.height);
      }

      return pageScale * ((this.container.clientHeight - vPadding) / pageHeight);
    },

    /**
     * @returns {number} - The scale in page-fit mode
     *                     for the current page on the current viewport.
     */
    get currentPageFitScale() {
      return Math.min(this.currentPageWidthScale, this.currentPageHeightScale);
    },

    /**
     * @returns {number}
     */
    get pagesRotation() {
      return this._pagesRotation;
    },

    /**
     * @param {number} rotation - The rotation of the pages (0, 90, 180, 270).
     */
    set pagesRotation(rotation) {
      if (!(typeof rotation === 'number' && rotation % 90 === 0)) {
        throw new Error('Invalid pages rotation angle.');
      }
      this._pagesRotation = rotation;

      if (!this.pdfDocument) {
        return;
      }
      for (var i = 0, l = this._pages.length; i < l; i++) {
        var pageView = this._pages[i];
        pageView.update(pageView.scale, rotation);
      }

      this._setScale(this._currentScaleValue, true);

      if (this.defaultRenderingQueue) {
        this.update();
      }
    },

    /**
     * @param pdfDocument {PDFDocument}
     */
    setDocument: function (pdfDocument) {
      if (this.pdfDocument) {
        this._cancelRendering();
        this._resetView();
      }

      this.pdfDocument = pdfDocument;
      if (!pdfDocument) {
        return;
      }

      var pagesCount = pdfDocument.numPages;
      var self = this;

      var resolvePagesPromise;
      var pagesPromise = new Promise(function (resolve) {
        resolvePagesPromise = resolve;
      });
      this.pagesPromise = pagesPromise;
      pagesPromise.then(function () {
        self._pageViewsReady = true;
        self.eventBus.dispatch('pagesloaded', {
          source: self,
          pagesCount: pagesCount
        });
      });

      var isOnePageRenderedResolved = false;
      var resolveOnePageRendered = null;
      var onePageRendered = new Promise(function (resolve) {
        resolveOnePageRendered = resolve;
      });
      this.onePageRendered = onePageRendered;

      var bindOnAfterAndBeforeDraw = function (pageView) {
        pageView.onBeforeDraw = function pdfViewLoadOnBeforeDraw() {
          // Add the page to the buffer at the start of drawing. That way it can
          // be evicted from the buffer and destroyed even if we pause its
          // rendering.
          self._buffer.push(this);
        };
        pageView.onAfterDraw = function pdfViewLoadOnAfterDraw() {
          if (!isOnePageRenderedResolved) {
            isOnePageRenderedResolved = true;
            resolveOnePageRendered();
          }
        };
      };

      var firstPagePromise = pdfDocument.getPage(1);
      this.firstPagePromise = firstPagePromise;

      // Fetch a single page so we can get a viewport that will be the default
      // viewport for all pages
      return firstPagePromise.then(function(pdfPage) {
        var scale = this.currentScale;
        var viewport = pdfPage.getViewport(scale * CSS_UNITS);
        for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          var textLayerFactory = null;
          if (!pdfjsLib.PDFJS.disableTextLayer) {
            textLayerFactory = this;
          }
          var pageView = new PDFPageView({
            container: this.viewer,
            eventBus: this.eventBus,
            id: pageNum,
            twoPageMode: this._twoPageMode,
            containerHasAnEmptyPageAfterCover: this._hasAnEmptyPageAfterCover,
            scale: scale,
            defaultViewport: viewport.clone(),
            renderingQueue: this.renderingQueue,
            textLayerFactory: textLayerFactory,
            annotationLayerFactory: this,
            enhanceTextSelection: this.enhanceTextSelection,
            renderInteractiveForms: this.renderInteractiveForms,
            renderer: this.renderer,
          });
          bindOnAfterAndBeforeDraw(pageView);
          this._pages.push(pageView);
        }

        var linkService = this.linkService;

        // Fetch all the pages since the viewport is needed before printing
        // starts to create the correct size canvas. Wait until one page is
        // rendered so we don't tie up too many resources early on.
        onePageRendered.then(function () {
          if (!pdfjsLib.PDFJS.disableAutoFetch) {
            var getPagesLeft = pagesCount;
            for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
              pdfDocument.getPage(pageNum).then(function (pageNum, pdfPage) {
                var pageView = self._pages[pageNum - 1];
                if (!pageView.pdfPage) {
                  pageView.setPdfPage(pdfPage);
                }
                linkService.cachePageRef(pageNum, pdfPage.ref);
                getPagesLeft--;
                if (!getPagesLeft) {
                  resolvePagesPromise();
                }
              }.bind(null, pageNum));
            }
          } else {
            // XXX: Printing is semi-broken with auto fetch disabled.
            resolvePagesPromise();
          }
        });

        self.eventBus.dispatch('pagesinit', {source: self});

        if (this.defaultRenderingQueue) {
          this.update();
        }

        if (this.findController) {
          this.findController.resolveFirstPage();
        }
      }.bind(this));
    },

    /**
     * Note : if many pages are showing vertically, the currentPage (topmost page) may be rendered
     * but other visible (but not current) pages may be still being rendered.
     * Hiding both loadingIconOverlay and loadingIconDiv would be inappropriate in such situations.
     */
    get isCurrentPageRendering() {
      function isPageRendering(pageView) {
        return (pageView ? !!pageView.loadingIconDiv : false);
      }

      if (this.isLookingAtLeftSidePage) {
        return isPageRendering(this.currentPageView);
      } else if (this.isLookingAtRightSidePage) {
        return isPageRendering(this.currentRightSidePageView);
      }
      // When the user is looking at ambiguous location.
      return isPageRendering(this.currentPageView) ||
        isPageRendering(this.currentRightSidePageView);
    },

    _updateLoadingIcons: function pdfViewer_updateLoadingIcons(currentLoadingIconVisible) {
      var classListOperation =
        (currentLoadingIconVisible || this.isCurrentPageRendering) ? 'add' : 'remove';
      this.container.classList[classListOperation]('rendering');
    },

    /**
     * @param {Array|null} labels
     */
    setPageLabels: function PDFViewer_setPageLabels(labels) {
      if (!this.pdfDocument) {
        return;
      }
      if (!labels) {
        this._pageLabels = null;
      } else if (!(labels instanceof Array &&
                   this.pdfDocument.numPages === labels.length)) {
        this._pageLabels = null;
        console.error('PDFViewer_setPageLabels: Invalid page labels.');
      } else {
        this._pageLabels = labels;
      }
      // Update all the `PDFPageView` instances.
      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        var pageView = this._pages[i];
        var label = this._pageLabels && this._pageLabels[i];
        pageView.setPageLabel(label);
      }
    },

    _resetView: function () {
      this._twoPageMode = false;
      this._hasAnEmptyPageAfterCover = false;
      this._pages = [];
      this._currentPageNumber = 1;
      this._currentScale = UNKNOWN_SCALE;
      this._currentScaleValue = null;
      this._pageLabels = null;
      this._buffer = new PDFPageViewBuffer(this.defaultCacheSize);
      this._location = null;
      this._pagesRotation = 0;
      this._pagesRequests = [];
      this._pageViewsReady = false;

      // Remove the pages from the DOM.
      this.viewer.textContent = '';
    },

    _scrollUpdate: function PDFViewer_scrollUpdate() {
      if (this.pagesCount === 0) {
        return;
      }
      this.update();
      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        this._pages[i].updatePosition();
      }
      this._updateLoadingIcons();
    },

    _setScaleDispatchEvent: function pdfViewer_setScaleDispatchEvent(
        newScale, newValue, preset, previousPageNumber) {
      var arg = {
        source: this,
        scale: newScale,
        previousPageNumber: previousPageNumber,
        presetValue: preset ? newValue : undefined
      };
      this.eventBus.dispatch('scalechanging', arg);
      this.eventBus.dispatch('scalechange', arg);
    },

    _updateScaleClassList: function pdfViewer_updateScaleClassList() {
      var classListOperation =
        (this._currentScaleValue > this.currentPageFitScale + 0.005) ? 'add' : 'remove';
      this.container.classList[classListOperation]('scaleBiggerThanPageFit');
    },

    _setScaleUpdatePages: function pdfViewer_setScaleUpdatePages(
        newScale, newValue, noScroll, preset, respectCurrentPositionForPageFit) {
      this._currentScaleValue = newValue.toString();
      var previousPageNumber = this._currentPageNumber;
      this._updateScaleClassList();

      if (isSameScale(this._currentScale, newScale)) {
        if (preset) {
          this._setScaleDispatchEvent(newScale, newValue, true, previousPageNumber);
        }
        return;
      }

      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        this._pages[i].update(newScale);
      }
      this._currentScale = newScale;

      if (!noScroll) {
        var page = this._currentPageNumber, dest;

        if (newValue === 'page-fit' && !respectCurrentPositionForPageFit) {
          dest = [null, { name: 'FitB' }];
        } else if (this._location && !pdfjsLib.PDFJS.ignoreCurrentPositionOnZoom) {
          page = this._location.pageNumber;
          dest = [null, { name: 'XYZ' }, this._location.left,
                  this._location.top, null];
        }
        this.scrollPageIntoView({
          pageNumber: page,
          destArray: dest,
          allowNegativeOffset: true,
        });
      }

      this._setScaleDispatchEvent(newScale, newValue, preset, previousPageNumber);

      if (this.defaultRenderingQueue) {
        this.update();
      }
    },

    _setScale: function PDFViewer_setScale(value, noScroll) {
      var scale = parseFloat(value);

      if (scale > 0) {
        var pageFitScale = this.currentPageFitScale;
        var pageFitScaleDelta = (scale - pageFitScale);
        if (!this.isInPresentationMode) {
          // Approximate nearby scale to page-fit scale.
          pageFitScaleDelta = Math.abs(pageFitScaleDelta);
        }

        if (pageFitScaleDelta < 0.005) {
          scale = pageFitScale;
          value = 'page-fit';
        }

        this._setScaleUpdatePages(scale, value, noScroll, false, true);
      } else {
        var currentPage = this._pages[this._currentPageNumber - 1];
        if (!currentPage) {
          return;
        }

        switch (value) {
          case 'page-actual':
            scale = 1;
            break;
          case 'page-width':
            scale = this.currentPageWidthScale;
            break;
          case 'page-height':
            scale = this.currentPageHeightScale;
            break;
          case 'auto':
          case 'page-fit':
            scale = this.currentPageFitScale;
            break;
          default:
            console.error('PDFViewer_setScale: "' + value +
                          '" is an unknown zoom value.');
            return;
        }
        this._setScaleUpdatePages(scale, value, noScroll, true);
      }
    },

    /**
     * Refreshes page view: scrolls to the current page and updates the scale.
     * @private
     */
    _resetCurrentPageView: function () {
      if (this.isInPresentationMode) {
        // Fixes the case when PDF has different page sizes.
        this._setScale(this._currentScaleValue, true);
      }

      scrollIntoView(this.currentLargerHeightPageView.div);
    },

    /**
     * @typedef ScrollPageIntoViewParameters
     * @property {number} pageNumber - The page number.
     * @property {Array} destArray - (optional) The original PDF destination
     *   array, in the format: <page-ref> </XYZ|/FitXXX> <args..>
     * @property {boolean} allowNegativeOffset - (optional) Allow negative page
     *   offsets. The default value is `false`.
     */

    /**
     * Scrolls page into view.
     * @param {ScrollPageIntoViewParameters} params
     */
    scrollPageIntoView: function PDFViewer_scrollPageIntoView(params) {
      if (!this.pdfDocument) {
        return;
      }
      if ((typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) &&
          (arguments.length > 1 || typeof params === 'number')) {
        console.warn('Call of scrollPageIntoView() with obsolete signature.');
        var paramObj = {};
        if (typeof params === 'number') {
          paramObj.pageNumber = params; // pageNumber argument was found.
        }
        if (arguments[1] instanceof Array) {
          paramObj.destArray = arguments[1]; // destArray argument was found.
        }
        params = paramObj;
      }
      var pageNumber = params.pageNumber || 0;
      var dest = params.destArray || null;
      var allowNegativeOffset = params.allowNegativeOffset || false;

      if (!dest) {
        this._setCurrentPageNumber(pageNumber, /* resetCurrentPageView */ true);
        return;
      }

      var pageView = this._pages[pageNumber - 1];
      if (!pageView) {
        console.error('PDFViewer_scrollPageIntoView: ' +
                      'Invalid "pageNumber" parameter.');
        return;
      }
      var x = 0, y = 0;
      var width = 0, height = 0, widthScale, heightScale;
      var changeOrientation = (pageView.rotation % 180 === 0 ? false : true);
      var pageWidth = (changeOrientation ? pageView.height : pageView.width) /
        pageView.scale / CSS_UNITS;
      var pageHeight = (changeOrientation ? pageView.width : pageView.height) /
        pageView.scale / CSS_UNITS;
      var scale = 0;
      switch (dest[1].name) {
        case 'XYZ':
          x = dest[2];
          y = dest[3];
          scale = dest[4];
          // If x and/or y coordinates are not supplied, default to
          // _top_ left of the page (not the obvious bottom left,
          // since aligning the bottom of the intended page with the
          // top of the window is rarely helpful).
          x = x !== null ? x : 0;
          y = y !== null ? y : pageHeight;
          break;
        case 'Fit':
        case 'FitB':
          scale = 'page-fit';
          break;
        case 'FitH':
        case 'FitBH':
          y = dest[2];
          scale = 'page-width';
          // According to the PDF spec, section 12.3.2.2, a `null` value in the
          // parameter should maintain the position relative to the new page.
          if (y === null && this._location) {
            x = this._location.left;
            y = this._location.top;
          }
          break;
        case 'FitV':
        case 'FitBV':
          x = dest[2];
          width = pageWidth;
          height = pageHeight;
          scale = 'page-height';
          break;
        case 'FitR':
          x = dest[2];
          y = dest[3];
          width = dest[4] - x;
          height = dest[5] - y;
          var hPadding = this.removePageBorders ? 0 : SCROLLBAR_PADDING;
          var vPadding = this.removePageBorders ? 0 : VERTICAL_PADDING;

          widthScale = (this.container.clientWidth - hPadding) /
            width / CSS_UNITS;
          heightScale = (this.container.clientHeight - vPadding) /
            height / CSS_UNITS;
          scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
          break;
        default:
          console.error('PDFViewer_scrollPageIntoView: \'' + dest[1].name +
                        '\' is not a valid destination type.');
          return;
      }

      if (scale && scale !== this._currentScale) {
        this.currentScaleValue = scale;
      } else if (this._currentScale === UNKNOWN_SCALE) {
        this.currentScaleValue = DEFAULT_SCALE_VALUE;
      }

      if (scale === 'page-fit' && !dest[4]) {
        scrollIntoView(pageView.div);
        return;
      }

      var boundingRect = [
        pageView.viewport.convertToViewportPoint(x, y),
        pageView.viewport.convertToViewportPoint(x + width, y + height)
      ];
      var left = Math.min(boundingRect[0][0], boundingRect[1][0]);
      var top = Math.min(boundingRect[0][1], boundingRect[1][1]);

      if (!allowNegativeOffset) {
        // Some bad PDF generators will create destinations with e.g. top values
        // that exceeds the page height. Ensure that offsets are not negative,
        // to prevent a previous page from becoming visible (fixes bug 874482).
        left = Math.max(left, 0);
        top = Math.max(top, 0);
      }
      scrollIntoView(pageView.div, { left: left, top: top });
    },

    _updateLocation: function (firstPage) {
      var currentScale = this._currentScale;
      var currentScaleValue = this._currentScaleValue;
      var normalizedScaleValue =
        parseFloat(currentScaleValue) === currentScale ?
        Math.round(currentScale * 10000) / 100 : currentScaleValue;

      var pageNumber = firstPage.id;
      var pdfOpenParams = '#page=' + pageNumber;
      pdfOpenParams += '&zoom=' + normalizedScaleValue;
      var currentPageView = this._pages[pageNumber - 1];
      var container = this.container;
      var topLeft = currentPageView.getPagePoint(
        (container.scrollLeft - firstPage.x),
        (container.scrollTop - firstPage.y));
      var intLeft = Math.round(topLeft[0]);
      var intTop = Math.round(topLeft[1]);
      pdfOpenParams += ',' + intLeft + ',' + intTop;

      this._location = {
        pageNumber: pageNumber,
        scale: normalizedScaleValue,
        top: intTop,
        left: intLeft,
        pdfOpenParams: pdfOpenParams
      };
    },

    update: function PDFViewer_update() {
      var visible = this._getVisiblePages();
      var visiblePages = visible.views;
      if (visiblePages.length === 0) {
        return;
      }

      /**
       * Note : cache should be big enough!
       * Otherwise infinite rendering will occur (loops of pageView destroy - draw)
       */
      var suggestedCacheSize = Math.max(this.defaultCacheSize, 2 * visiblePages.length + 1);
      this._buffer.resize(suggestedCacheSize);

      this.renderingQueue.renderHighestPriority(visible);

      var currentId = this._getAdjustedPageNumber(visiblePages[0].id);
      this._setCurrentPageNumber(currentId);

      visiblePages.forEach(function (currentPage) {
        if (!this.isInPresentationMode ||
          currentId === this._getAdjustedPageNumber(currentPage.id)) {
          currentPage.view.div.classList.remove('transparent');
        } else {
          currentPage.view.div.classList.add('transparent');
        }
      }.bind(this));

      this._updateLocation(visiblePages[0]);

      this.eventBus.dispatch('updateviewarea', {
        source: this,
        location: this._location
      });
    },

    containsElement: function (element) {
      return this.container.contains(element);
    },

    focus: function () {
      this.container.focus();
    },

    get isInPresentationMode() {
      return this.presentationModeState === PresentationModeState.FULLSCREEN;
    },

    get isChangingPresentationMode() {
      return this.presentationModeState === PresentationModeState.CHANGING;
    },

    get isHorizontalScrollbarEnabled() {
      return false;
    },

    _getVisiblePages: function () {
      var bottomTolerance = this.defaultVerticalTolerance, horizontalTolerance = 10;
      if (this.currentPageView) {
        bottomTolerance = Math.max(this.currentPageView.height * this.defaultAdjacentPagesToDraw,
            bottomTolerance);
        horizontalTolerance = Math.max(this.currentPageView.width * 2, horizontalTolerance);
      }
      return getVisibleElements(this.container, this._pages, true,
          horizontalTolerance, 0, horizontalTolerance, bottomTolerance);
    },

    cleanup: function () {
      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        if (this._pages[i] &&
            this._pages[i].renderingState !== RenderingStates.FINISHED) {
          this._pages[i].reset();
        }
      }
    },

    /**
     * @private
     */
    _cancelRendering: function PDFViewer_cancelRendering() {
      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        if (this._pages[i]) {
          this._pages[i].cancelRendering();
        }
      }
    },

    /**
     * @param {PDFPageView} pageView
     * @returns {PDFPage}
     * @private
     */
    _ensurePdfPageLoaded: function (pageView) {
      if (pageView.pdfPage) {
        return Promise.resolve(pageView.pdfPage);
      }
      var pageNumber = pageView.id;
      if (this._pagesRequests[pageNumber]) {
        return this._pagesRequests[pageNumber];
      }
      var promise = this.pdfDocument.getPage(pageNumber).then(
          function (pdfPage) {
        pageView.setPdfPage(pdfPage);
        this._pagesRequests[pageNumber] = null;
        return pdfPage;
      }.bind(this));
      this._pagesRequests[pageNumber] = promise;
      return promise;
    },

    forceRendering: function (currentlyVisiblePages) {
      var visiblePages = currentlyVisiblePages || this._getVisiblePages();
      var pageView = this.renderingQueue.getHighestPriority(visiblePages,
                                                            this._pages,
                                                            this.scroll.down);
      if (pageView) {
        this._ensurePdfPageLoaded(pageView).then(function () {
          this.renderingQueue.renderView(pageView);
        }.bind(this));
        return true;
      }
      return false;
    },

    getPageTextContent: function (pageIndex) {
      return this.pdfDocument.getPage(pageIndex + 1).then(function (page) {
        return page.getTextContent({
          normalizeWhitespace: true,
        });
      });
    },

    /**
     * @param {HTMLDivElement} textLayerDiv
     * @param {number} pageIndex
     * @param {PageViewport} viewport
     * @returns {TextLayerBuilder}
     */
    createTextLayerBuilder: function (textLayerDiv, pageIndex, viewport,
                                      enhanceTextSelection) {
      return new TextLayerBuilder({
        textLayerDiv: textLayerDiv,
        eventBus: this.eventBus,
        pageIndex: pageIndex,
        viewport: viewport,
        findController: this.findController,
        enhanceTextSelection: enhanceTextSelection,
      });
    },

    /**
     * @param {HTMLDivElement} pageDiv
     * @param {PDFPage} pdfPage
     * @param {boolean} renderInteractiveForms
     * @returns {AnnotationLayerBuilder}
     */
    createAnnotationLayerBuilder: function (pageDiv, pdfPage,
                                            renderInteractiveForms) {
      return new AnnotationLayerBuilder({
        pageDiv: pageDiv,
        pdfPage: pdfPage,
        renderInteractiveForms: renderInteractiveForms,
        linkService: this.linkService,
        downloadManager: this.downloadManager
      });
    },

    setFindController: function (findController) {
      this.findController = findController;
    },

    /**
     * Returns sizes of the pages.
     * @returns {Array} Array of objects with width/height/rotation fields.
     */
    getPagesOverview: function () {
      var pagesOverview = this._pages.map(function (pageView) {
        var viewport = pageView.pdfPage.getViewport(1);
        return {
          width: viewport.width,
          height: viewport.height,
          rotation: viewport.rotation,
        };
      });
      if (!this.enablePrintAutoRotate) {
        return pagesOverview;
      }
      var isFirstPagePortrait = isPortraitOrientation(pagesOverview[0]);
      return pagesOverview.map(function (size) {
        if (isFirstPagePortrait === isPortraitOrientation(size)) {
          return size;
        }
        return {
          width: size.height,
          height: size.width,
          rotation: (size.rotation + 90) % 360,
        };
      });
    },
  };

  return PDFViewer;
})();

exports.PresentationModeState = PresentationModeState;
exports.PDFViewer = PDFViewer;
}));
