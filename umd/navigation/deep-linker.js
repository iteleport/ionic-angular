(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./nav-util", "../util/util", "./url-serializer", "./view-controller"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var nav_util_1 = require("./nav-util");
    var util_1 = require("../util/util");
    var url_serializer_1 = require("./url-serializer");
    var view_controller_1 = require("./view-controller");
    /**
     * @hidden
     */
    var DeepLinker = (function () {
        function DeepLinker(_app, _serializer, _location, _moduleLoader, _baseCfr) {
            this._app = _app;
            this._serializer = _serializer;
            this._location = _location;
            this._moduleLoader = _moduleLoader;
            this._baseCfr = _baseCfr;
            /** @internal */
            this._history = [];
        }
        /**
         * @internal
         */
        DeepLinker.prototype.init = function () {
            var _this = this;
            // scenario 1: Initial load of all navs from the initial browser URL
            var browserUrl = normalizeUrl(this._location.path());
            (void 0) /* console.debug */;
            // remember this URL in our internal history stack
            this._historyPush(browserUrl);
            // listen for browser URL changes
            this._location.subscribe(function (locationChg) {
                _this._urlChange(normalizeUrl(locationChg.url));
            });
        };
        /**
         * The browser's location has been updated somehow.
         * @internal
         */
        DeepLinker.prototype._urlChange = function (browserUrl) {
            var _this = this;
            // do nothing if this url is the same as the current one
            if (!this._isCurrentUrl(browserUrl)) {
                var isGoingBack = true;
                if (this._isBackUrl(browserUrl)) {
                    // scenario 2: user clicked the browser back button
                    // scenario 4: user changed the browser URL to what was the back url was
                    // scenario 5: user clicked a link href that was the back url
                    (void 0) /* console.debug */;
                    this._historyPop();
                }
                else {
                    // scenario 3: user click forward button
                    // scenario 4: user changed browser URL that wasn't the back url
                    // scenario 5: user clicked a link href that wasn't the back url
                    isGoingBack = false;
                    (void 0) /* console.debug */;
                    this._historyPush(browserUrl);
                }
                // get the app's root nav container
                var activeNavContainers_1 = this._app.getActiveNavContainers();
                if (activeNavContainers_1 && activeNavContainers_1.length) {
                    if (browserUrl === '/') {
                        // a url change to the index url
                        if (util_1.isPresent(this._indexAliasUrl)) {
                            // we already know the indexAliasUrl
                            // update the url to use the know alias
                            browserUrl = this._indexAliasUrl;
                        }
                        else {
                            // the url change is to the root but we don't
                            // already know the url used. So let's just
                            // reset the root nav to its root page
                            activeNavContainers_1.forEach(function (navContainer) {
                                navContainer.goToRoot({
                                    updateUrl: false,
                                    isNavRoot: true
                                });
                            });
                            return;
                        }
                    }
                    // normal url
                    var segments = this.getCurrentSegments(browserUrl);
                    segments
                        .map(function (segment) {
                        // find the matching nav container
                        for (var _i = 0, activeNavContainers_2 = activeNavContainers_1; _i < activeNavContainers_2.length; _i++) {
                            var navContainer = activeNavContainers_2[_i];
                            var nav = getNavFromTree(navContainer, segment.navId);
                            if (nav) {
                                return {
                                    segment: segment,
                                    navContainer: nav
                                };
                            }
                        }
                    })
                        .filter(function (pair) { return !!pair; })
                        .forEach(function (pair) {
                        _this._loadViewForSegment(pair.navContainer, pair.segment, function () { });
                    });
                }
            }
        };
        DeepLinker.prototype.getCurrentSegments = function (browserUrl) {
            if (!browserUrl) {
                browserUrl = normalizeUrl(this._location.path());
            }
            return this._serializer.parse(browserUrl);
        };
        /**
         * Update the deep linker using the NavController's current active view.
         * @internal
         */
        DeepLinker.prototype.navChange = function (direction) {
            if (direction) {
                var activeNavContainers = this._app.getActiveNavContainers();
                // the only time you'll ever get a TABS here is when loading directly from a URL
                // this method will be called again when the TAB is loaded
                // so just don't worry about the TABS for now
                // if you encounter a TABS, just return
                for (var _i = 0, activeNavContainers_3 = activeNavContainers; _i < activeNavContainers_3.length; _i++) {
                    var activeNavContainer = activeNavContainers_3[_i];
                    if (nav_util_1.isTabs(activeNavContainer) || activeNavContainer.isTransitioning()) {
                        return;
                    }
                }
                // okay, get the root navs and build the segments up
                var segments = [];
                var navContainers = this._app.getRootNavs();
                for (var _a = 0, navContainers_1 = navContainers; _a < navContainers_1.length; _a++) {
                    var navContainer = navContainers_1[_a];
                    var segmentsForNav = this.getSegmentsFromNav(navContainer);
                    segments = segments.concat(segmentsForNav);
                }
                segments = segments.filter(function (segment) { return !!segment; });
                if (segments.length) {
                    var browserUrl = this._serializer.serialize(segments);
                    this._updateLocation(browserUrl, direction);
                }
            }
        };
        DeepLinker.prototype.getSegmentsFromNav = function (nav) {
            var _this = this;
            var segments = [];
            if (nav_util_1.isNav(nav)) {
                segments.push(this.getSegmentFromNav(nav));
            }
            else if (nav_util_1.isTab(nav)) {
                segments.push(this.getSegmentFromTab(nav));
            }
            nav.getActiveChildNavs().forEach(function (child) {
                segments = segments.concat(_this.getSegmentsFromNav(child));
            });
            return segments;
        };
        DeepLinker.prototype.getSegmentFromNav = function (nav, component, data) {
            if (!component) {
                var viewController = nav.getActive(true);
                if (viewController) {
                    component = viewController.component;
                    data = viewController.data;
                }
            }
            return this._serializer.serializeComponent(nav, component, data);
        };
        DeepLinker.prototype.getSegmentFromTab = function (navContainer, component, data) {
            if (navContainer && navContainer.parent) {
                var tabsNavContainer = navContainer.parent;
                var activeChildNavs = tabsNavContainer.getActiveChildNavs();
                if (activeChildNavs && activeChildNavs.length) {
                    var activeChildNav = activeChildNavs[0];
                    var viewController = activeChildNav.getActive(true);
                    if (viewController) {
                        component = viewController.component;
                        data = viewController.data;
                    }
                    return this._serializer.serializeComponent(tabsNavContainer, component, data);
                }
            }
        };
        /**
         * @internal
         */
        DeepLinker.prototype._updateLocation = function (browserUrl, direction) {
            if (this._indexAliasUrl === browserUrl) {
                browserUrl = '/';
            }
            if (direction === nav_util_1.DIRECTION_BACK && this._isBackUrl(browserUrl)) {
                // this URL is exactly the same as the back URL
                // it's safe to use the browser's location.back()
                (void 0) /* console.debug */;
                this._historyPop();
                this._location.back();
            }
            else if (!this._isCurrentUrl(browserUrl)) {
                // probably navigating forward
                (void 0) /* console.debug */;
                this._historyPush(browserUrl);
                this._location.go(browserUrl);
            }
        };
        DeepLinker.prototype.getComponentFromName = function (componentName) {
            var link = this._serializer.getLinkFromName(componentName);
            if (link) {
                // cool, we found the right link for this component name
                return this.getNavLinkComponent(link);
            }
            // umm, idk
            return Promise.reject("invalid link: " + componentName);
        };
        DeepLinker.prototype.getNavLinkComponent = function (link) {
            if (link.component) {
                // sweet, we're already got a component loaded for this link
                return Promise.resolve(link.component);
            }
            if (link.loadChildren) {
                // awesome, looks like we'll lazy load this component
                // using loadChildren as the URL to request
                return this._moduleLoader.load(link.loadChildren).then(function (response) {
                    link.component = response.component;
                    return response.component;
                });
            }
            return Promise.reject("invalid link component: " + link.name);
        };
        /**
         * @internal
         */
        DeepLinker.prototype.resolveComponent = function (component) {
            var cfr = this._moduleLoader.getComponentFactoryResolver(component);
            if (!cfr) {
                cfr = this._baseCfr;
            }
            return cfr.resolveComponentFactory(component);
        };
        /**
         * @internal
         */
        DeepLinker.prototype.createUrl = function (navContainer, nameOrComponent, _data, prepareExternalUrl) {
            if (prepareExternalUrl === void 0) { prepareExternalUrl = true; }
            // create a segment out of just the passed in name
            var segment = this._serializer.createSegmentFromName(navContainer, nameOrComponent);
            var allSegments = this.getCurrentSegments();
            if (segment) {
                for (var i = 0; i < allSegments.length; i++) {
                    if (allSegments[i].navId === navContainer.name || allSegments[i].navId === navContainer.id) {
                        allSegments[i] = segment;
                        var url = this._serializer.serialize(allSegments);
                        return prepareExternalUrl ? this._location.prepareExternalUrl(url) : url;
                    }
                }
            }
            return '';
        };
        /**
         * Each NavController will call this method when it initializes for
         * the first time. This allows each NavController to figure out
         * where it lives in the path and load up the correct component.
         * @internal
         */
        DeepLinker.prototype.getSegmentByNavIdOrName = function (navId, name) {
            var browserUrl = normalizeUrl(this._location.path());
            var segments = this._serializer.parse(browserUrl);
            for (var _i = 0, segments_1 = segments; _i < segments_1.length; _i++) {
                var segment = segments_1[_i];
                if (segment.navId === navId || segment.navId === name) {
                    return segment;
                }
            }
            return null;
        };
        /**
         * @internal
         */
        DeepLinker.prototype.initViews = function (segment) {
            var _this = this;
            var link = this._serializer.getLinkFromName(segment.name);
            return this.getNavLinkComponent(link).then(function (component) {
                segment.component = component;
                var view = new view_controller_1.ViewController(component, segment.data);
                view.id = segment.id;
                if (util_1.isArray(segment.defaultHistory)) {
                    return nav_util_1.convertToViews(_this, segment.defaultHistory).then(function (views) {
                        views.push(view);
                        return views;
                    });
                }
                return [view];
            });
        };
        /**
         * @internal
         */
        DeepLinker.prototype._isBackUrl = function (browserUrl) {
            return (browserUrl === this._history[this._history.length - 2]);
        };
        /**
         * @internal
         */
        DeepLinker.prototype._isCurrentUrl = function (browserUrl) {
            return (browserUrl === this._history[this._history.length - 1]);
        };
        /**
         * @internal
         */
        DeepLinker.prototype._historyPush = function (browserUrl) {
            if (!this._isCurrentUrl(browserUrl)) {
                this._history.push(browserUrl);
                if (this._history.length > 30) {
                    this._history.shift();
                }
            }
        };
        /**
         * @internal
         */
        DeepLinker.prototype._historyPop = function () {
            this._history.pop();
            if (!this._history.length) {
                this._historyPush(this._location.path());
            }
        };
        /**
         * @internal
         */
        DeepLinker.prototype._getTabSelector = function (tab) {
            if (util_1.isPresent(tab.tabUrlPath)) {
                return tab.tabUrlPath;
            }
            if (util_1.isPresent(tab.tabTitle)) {
                return url_serializer_1.formatUrlPart(tab.tabTitle);
            }
            return "tab-" + tab.index;
        };
        /**
         * Using the known Path of Segments, walk down all descendents
         * from the root NavController and load each NavController according
         * to each Segment. This is usually called after a browser URL and
         * Path changes and needs to update all NavControllers to match
         * the new browser URL. Because the URL is already known, it will
         * not update the browser's URL when transitions have completed.
         *
         * @internal
         */
        DeepLinker.prototype._loadViewForSegment = function (navContainer, segment, done) {
            if (!segment) {
                return done(false, false);
            }
            if (nav_util_1.isTabs(navContainer) || (nav_util_1.isTab(navContainer) && navContainer.parent)) {
                var tabs = (nav_util_1.isTabs(navContainer) ? navContainer : navContainer.parent);
                var selectedIndex = tabs._getSelectedTabIndex(segment.secondaryId);
                var tab = tabs.getByIndex(selectedIndex);
                tab._segment = segment;
                tabs.select(tab, {
                    updateUrl: false,
                    animate: false
                }, true);
                return done(false, false);
            }
            var navController = navContainer;
            var numViews = navController.length() - 1;
            // walk backwards to see if the exact view we want to show here
            // is already in the stack that we can just pop back to
            for (var i = numViews; i >= 0; i--) {
                var viewController = navController.getByIndex(i);
                if (viewController && (viewController.id === segment.id || viewController.id === segment.name)) {
                    // hooray! we've already got a view loaded in the stack
                    // matching the view they wanted to show
                    if (i === numViews) {
                        // this is the last view in the stack and it's the same
                        // as the segment so there's no change needed
                        return done(false, false);
                    }
                    else {
                        // it's not the exact view as the end
                        // let's have this nav go back to this exact view
                        return navController.popTo(viewController, {
                            animate: false,
                            updateUrl: false,
                        }, done);
                    }
                }
            }
            // ok, so we don't know about a view that they're navigating to
            // so we might as well just call setRoot and make tthe view the first view
            // this seems like the least bad option
            return navController.setRoot(segment.component || segment.name, segment.data, {
                id: segment.id, animate: false, updateUrl: false
            }, done);
        };
        return DeepLinker;
    }());
    exports.DeepLinker = DeepLinker;
    function setupDeepLinker(app, serializer, location, moduleLoader, cfr) {
        var deepLinker = new DeepLinker(app, serializer, location, moduleLoader, cfr);
        deepLinker.init();
        return deepLinker;
    }
    exports.setupDeepLinker = setupDeepLinker;
    function normalizeUrl(browserUrl) {
        browserUrl = browserUrl.trim();
        if (browserUrl.charAt(0) !== '/') {
            // ensure first char is a /
            browserUrl = '/' + browserUrl;
        }
        if (browserUrl.length > 1 && browserUrl.charAt(browserUrl.length - 1) === '/') {
            // ensure last char is not a /
            browserUrl = browserUrl.substr(0, browserUrl.length - 1);
        }
        return browserUrl;
    }
    exports.normalizeUrl = normalizeUrl;
    function getNavFromTree(nav, id) {
        while (nav) {
            if (nav.id === id || nav.name === id) {
                return nav;
            }
            nav = nav.parent;
        }
        return null;
    }
    exports.getNavFromTree = getNavFromTree;
});
//# sourceMappingURL=deep-linker.js.map