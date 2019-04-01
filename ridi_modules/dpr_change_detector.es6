class DevicePixelRatioChangeDetector {
  constructor() {
    this._minDpr = 1.0;
    this._maxDpr = 4.0;
    this._currentDpr = -1.0;
    this._dprCheckInterval = 0.25;

    this._mediaQueryLists = [];
    this._mediaQueryListener = (e) => {
      if (this._currentDpr !== window.devicePixelRatio) {
        this._currentDpr = window.devicePixelRatio;
        for (let index = 0; index < this._dprChangeListeners.length; index++) {
          this._dprChangeListeners[index]();
        }
      }
    };
    this._dprChangeListeners = [];
  }

  activate(window) {
    this._currentDpr = window.devicePixelRatio;
    for (let dpr = this._minDpr; dpr <= this._maxDpr; dpr += this._dprCheckInterval) {
      const mediaQueryList = window.matchMedia(`all and (min-resolution: ${dpr}dppx)`);
      mediaQueryList.addListener(this._mediaQueryListener);
      this._mediaQueryLists.push(mediaQueryList);
    }
  }

  deactivate(window) {
    this._currentDpr = -1;
    for (let index = 0; index < this._mediaQueryLists.length; index++) {
      const mediaQueryList = this._mediaQueryLists[index];
      mediaQueryList.removeListener(this._mediaQueryListener);
    }
    this._mediaQueryLists = [];
  }

  addListener(listener) {
    this._dprChangeListeners.push(listener);
  }

  removeListener(listener) {
    this._dprChangeListeners = this._dprChangeListeners.filter((e) => {
      return e !== listener;
    });
  }
}

export {
  DevicePixelRatioChangeDetector,
};
