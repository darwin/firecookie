/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) { 

// Constants
//-----------------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;

// Interfaces
const nsISupportsWeakReference = Ci.nsISupportsWeakReference;
const nsISupports = Ci.nsISupports;
const nsICookieService = Ci.nsICookieService;
const nsICookie2 = Ci.nsICookie2;
const nsIObserver = Ci.nsIObserver;
const nsICookiePermission = Ci.nsICookiePermission;
const nsIURI = Ci.nsIURI;
const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIClipboard = Ci.nsIClipboard;
const nsISupportsString = Ci.nsISupportsString;
const nsIPermissionManager = Ci.nsIPermissionManager;
const nsIWebProgress = Ci.nsIWebProgress;
const nsIDOMWindow = Ci.nsIDOMWindow;
const nsIInterfaceRequestor = Ci.nsIInterfaceRequestor;
const nsIHttpChannel = Ci.nsIHttpChannel;
const nsIPermission = Ci.nsIPermission;
const nsIXULAppInfo = Ci.nsIXULAppInfo;
const nsIVersionComparator = Ci.nsIVersionComparator;

// Preferences
const networkPrefDomain = "network.cookie";
const cookieBehaviorPref = "cookieBehavior";
const cookieLifeTimePref = "lifetimePolicy";

// FirebugPrefDomain is not defined in 1.05.
const FirebugPrefDomain = "extensions.firebug";

const logEventsPref = "firecookie.logEvents";
const clearWhenDeny = "firecookie.clearWhenDeny";
const filterByPath = "firecookie.filterByPath";
const showRejectedCookies = "firecookie.showRejectedCookies";

// Services
const cookieManager = CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");
const cookieService = CCSV("@mozilla.org/cookieService;1", "nsICookieService");
const observerService = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
const extensionManager = CCSV("@mozilla.org/extensions/manager;1", "nsIExtensionManager");
const permissionManager = CCSV("@mozilla.org/permissionmanager;1", "nsIPermissionManager");
const clipboard = CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");
const appInfo = CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
const versionChecker = CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
const ioService = CCSV("@mozilla.org/network/io-service;1", "nsIIOService");
const dateFormat = CCSV("@mozilla.org/intl/scriptabledateformat;1", "nsIScriptableDateFormat");

// Preferences
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const nsIPrefService = Ci.nsIPrefService;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const prefService = PrefService.getService(nsIPrefService);
const prefs = PrefService.getService(nsIPrefBranch2);

// Cookie panel ID.
const panelName = "cookies";

// Cookie status & policy
var STATUS_UNKNOWN = nsICookie2.STATUS_UNKNOWN;
var STATUS_ACCEPTED = nsICookie2.STATUS_ACCEPTED;
var STATUS_DOWNGRADED = nsICookie2.STATUS_DOWNGRADED;
var STATUS_FLAGGED = nsICookie2.STATUS_FLAGGED;
var STATUS_REJECTED = nsICookie2.STATUS_REJECTED;

var POLICY_UNKNOWN = nsICookie2.POLICY_UNKNOWN;
var POLICY_NONE = nsICookie2.POLICY_NONE;
var POLICY_NO_CONSENT = nsICookie2.POLICY_NO_CONSENT;
var POLICY_IMPLICIT_CONSENT = nsICookie2.POLICY_IMPLICIT_CONSENT;
var POLICY_NO_II = nsICookie2.POLICY_NO_II;

const permOptions =
{
    "default-session": ["firecookie.default.session", false],
	"default-third-party-session": ["firecookie.default.thirdPartySession", false],
	"default-third-party": ["firecookie.default.thirdParty", false],
	"default-allow": ["firecookie.default.allow", false],
	"default-deny": ["firecookie.default.deny", false],
	"default-warn": ["firecookie.default.warn", false],
	"host-allow-session": ["firecookie.host.session", true],
	"host-allow": ["firecookie.host.accept", true],
	"host-deny": ["firecookie.host.reject", true]
};

// UI Elements
const tabBrowser = $("content");
const permTooltip = $("fcPermTooltip");

// Helper array for prematurely created contexts
var contexts = new Array();

// Helper for debug logs.
if (typeof FBTrace == "undefined")
    FBTrace = { sysout: function() {} };
    
// Module Implementation
//-----------------------------------------------------------------------------

Firebug.FireCookieModel = extend(Firebug.Module, 
{ 
    // Module life-cycle    
    initialize: function() 
    {    
        permTooltip.fcEnabled = true;
        
        observerService.addObserver(HttpObserver, "http-on-modify-request", false);            
        observerService.addObserver(HttpObserver, "http-on-examine-response", false);   
        observerService.addObserver(PermissionObserver, "perm-changed", false);
        registerCookieObserver(CookieObserver);        
        prefs.addObserver(networkPrefDomain, PrefObserver, false); 

        // Tracing in Firebug 1.3
        if (Firebug.TraceModule.addListener)
            Firebug.TraceModule.addListener(this.TraceListener);
    },

    shutdown: function() 
    {
        observerService.removeObserver(HttpObserver, "http-on-modify-request");
        observerService.removeObserver(HttpObserver, "http-on-examine-response");
        observerService.removeObserver(PermissionObserver, "perm-changed");
        unregisterCookieObserver(CookieObserver);
        prefs.removeObserver(networkPrefDomain, PrefObserver);

        // Tracing in Firebug 1.3
        if (Firebug.TraceModule.removeListener)
            Firebug.TraceModule.removeListener(this.TraceListener);
    },

    // Helper context
    initTempContext: function(tempContext)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> INIT temporary context for: " + tempContext.tabId + "\n");
    
        tempContext.cookieTempObserver = registerCookieObserver(new CookieTempObserver(tempContext));
        
        // Create sub-context for cookies.
        tempContext.cookies = {};
        tempContext.cookies.activeHosts = [];
    },

    destroyTempContext: function(tempContext, context)
    {
        if (!tempContext)
            return;
            
        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("---------> Copy " + tempContext.events.length + 
                " events to real-context." + "\n");
                
            FBTrace.sysout("---------> Copy active hosts to real-context: ");
            for (var host in tempContext.cookies.activeHosts)
                FBTrace.sysout("--------->" + host + ", ");
            FBTrace.sysout("---------> in the temp context.\n");
        }            

        // Copy all active hosts on the page. In case of redirects or embedded IFrames, there
        // can be more hosts (domains) involved on the page. Cookies must be displayed for
        // all of them.
        context.cookies.activeHosts = cloneMap(tempContext.cookies.activeHosts);

        // Clone all active (received) cookies on the page.
        // This is probably not necessary, as the first cookie is received
        // in http-on-examine-response and at that time the real context
        // is already created.
        context.cookies.activeCookies = cloneMap(tempContext.cookies.activeCookies);
        
        // Fire all lost cookie events (those from the temp context).
        var events = tempContext.events;
        for (var i=0; i<events.length; i++) {
            var e = events[i];
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("---------> Fire fake cookie event: " + e.topic + ", " + e.data + "\n");
            CookieObserver.observe(e.subject, e.topic, e.data);
        }
        
        delete tempContext.cookies.activeHosts;
        delete tempContext.cookies.activeCookies;
        delete tempContext.cookies;
        
        // Unregister temporary cookie observer.
        tempContext.cookieTempObserver = unregisterCookieObserver(tempContext.cookieTempObserver);
    },

    // Context life-cycle
    initContext: function(context)
    {
        var tabId = getTabIdForWindow(context.window);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> INIT real context for: " + tabId + ", " +
                context.window.location.href + "\n");
    
        // Create sub-context for cookies.
        context.cookies = {};
        context.cookies.activeHosts = [];

        // The temp context isn't created e.g. for empty tabs, chrome pages.
        var tempContext = contexts[tabId];
        if (tempContext)
        {
            this.destroyTempContext(tempContext, context);        
            delete contexts[tabId];
            
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("---------> DESTROY temporary context, tabId: " + tempContext.tabId + "\n");
        }   
    },

    reattachContext: function(browser, context) 
    {
        var chrome = context ? context.chrome : FirebugChrome;

        // The context isn't available if FB is disabled.
        if (!context)
            return;
            
        this.Perm.updatePermButton(context, chrome);

        // xxxHonza the panel is created here, it's overhead.
        // however the stylesheet must be appended here and the list of cookies
        // mus be refreshed otherwise, the event handlers doesn't work
        // not sure where exactly is the bug.
        var panel = context.getPanel(panelName);

        // Add styles into the panel HTML document.
        if (browser.detached) 
            this.addStyleSheet(panel);

        // From some reason, Firebug doesn't set the ownerPanel to the panel
        // node element. (it's properly set once the page is reloaded, but no the first time)
        // The Firebug.getElementPanel method doesn't work then. 
        // This is fixed in Firebug 1.2 (the ownerPanel is set in Initialize & reattach methods)
        panel.panelNode.ownerPanel = panel;
        
        // Refresh panel. From some reason, if FB UI is detached, all event 
        // listeners (e.g. onClick handlers registered in domplate template) 
        // are somwhos damaged and not called. 
        // Workaround - if the panel is refreshed event handlers work.
        //
        // See bug http://code.google.com/p/fbug/issues/detail?id=724, console
        // has the same problem. However it can't be simply refreshed.
        // OK, this bug should be fixed (R735) since FB 1.2b4
        //panel.refresh();
    },

    destroyContext: function(context) 
    {
        for (var p in context.cookies)
            delete context.cookies[p];
        
        delete context.cookies;
        
        if (FBTrace.DBG_COOKIES)
        {
            var tabId = getTabIdForWindow(context.window);
            FBTrace.sysout("---------> DESTROY context, tabId: " + tabId + 
                ", " + context.window.location.href + "\n");
        }
    },

    addStyleSheet: function(panel)
    {
        // Make sure the stylesheet isn't appended twice. 
        var doc = panel.document;
        if ($("fcStyles", doc))
            return;
        
        var styleSheet = createStyleSheet(doc, "chrome://firecookie/skin/firecookie.css");
        styleSheet.setAttribute("id", "fcStyles");
	    addStyleSheet(doc, styleSheet);
    },
    
    updateOption: function(name, value)
    {
        if (name == "firecookie.clearWhenDeny")
        {
        }
        else if (name == "firecookie.LogEvents")
        {
        }        
    },
    
    showPanel: function(browser, panel) 
    { 
        // Update panel's toolbar
        var isCookiePanel = panel && panel.name == panelName; 
        var cookieButtons = browser.chrome.$("fbCookieButtons"); 
        collapse(cookieButtons, !isCookiePanel); 
        
        // The console panel can be displayed sooner than the Cookies
        // panel, in such a case the Stylesheet must be ready as 
        // there are cookies logs in the console.
        if (panel && panel.name == "console")
            this.addStyleSheet(panel);       
    },

	watchWindow: function(context, win) 
	{
		context.window.addEventListener("beforeunload", this.onBeforeUnload, false);
	},

    onBeforeUnload: function(event) 
    {
        var view = event.target.defaultView;
        var context = TabWatcher.getContextByWindow(view);
        if (!context)
            return;
            
        var panel = context.getPanel(panelName, true);
        if (panel)
            panel.clear();
            
        if (FBTrace.DBG_COOKIES)                
        {
            var tabId = getTabIdForWindow(view);
            FBTrace.sysout("---------> On before unload tab:  " + tabId + "\n");
            
            if (contexts[tabId])
                FBTrace.sysout("---------> !!! There is a temp context leak!\n");
        }
    },

    onRemoveAllShowTooltip: function(tooltip, context) 
    {
        tooltip.label = $FC_STR("firecookie.removeall.tooltip");
        return true;
    },
    
    onRemoveAll: function(context) 
    {
        var parent = context.chrome.window;
        if (!parent.confirm($FC_STR("firecookie.confirm.removeall")))
            return;
    
        var panel = context.getPanel(panelName, true);
        if (!panel)
            return;

        var cookies = [];

        // Remove all cookies in the list. Notice that the list can be further 
        // filtered by the search-box (the right side of Firebug's tab bar)
        // So, make sure in case of searching-on, only visible (matched) 
        // cookies are removed.
        var searching = hasClass(panel.panelNode, "searching");
        var row = getElementByClass(panel.panelNode, "cookieRow");
        while (row) 
        {
            if (!searching || hasClass(row, "matched"))
            {
                var cookie = row.repObject;
                if (cookie)
                    cookies.push(cookie);
            }

            row = row.nextSibling;
        }        

        for (var i=0; i<cookies.length; i++)        
            Templates.CookieRow.onRemove(cookies[i]);
    },

    onCreateCookieShowTooltip: function(tooltip, context) 
    {
        var host = context.window.location.host;
        tooltip.label = $FC_STRF("firecookie.createcookie.tooltip", [host]);
        return true;
    },

    onCreateCookie: function(context)
    {
        var cookie = new Object();
        
        // Name and domain.
        cookie.name = this.getDefaultCookieName(context);
        cookie.host = context.window.location.host;
        cookie.value = $FC_STR("firecookie.createcookie.defaultvalue");

        // Default path
        var path = context.window.location.pathname || "/";
        cookie.path = path.substr(0, (path.lastIndexOf("/") || 1));
        
        // Set defaul expiration time.
        cookie.expires = this.getDefaultCookieExpireTime();
                
        var params = {
          cookie: cookie,
          action: "create",
          window: context.window
        };
        
        var parent = context.chrome.window;
        parent.openDialog("chrome://firecookie/content/editCookie.xul", 
            "_blank", "chrome,centerscreen,resizable=yes,modal=yes", 
            params);    
    },

    getDefaultCookieName: function(context, defaultName)
    {
        var counter = 0;
        var cookieDefaultName = defaultName || "Cookie";
        var cookieName = cookieDefaultName;
        var exists = false;       
        var panel = context.getPanel(panelName);
        
        do
        {
            exists = false;
            
            var row = getElementByClass(panel.panelNode, "cookieRow");
            while (row) 
            {
                var rep = row.repObject;
                
                // If the cookie is expanded, there is a row without the repObject
                if (rep && rep.cookie.name == cookieName)
                {
                    counter++;
                    exists = true;
                    cookieName = cookieDefaultName + "-" + counter;
                    break;
                }                        
                row = row.nextSibling;
            }
        } while (exists)
                
        return cookieName;
    },

    getDefaultCookieExpireTime: function()
    {
        // Current time plus two hours.
        // xxxHonza this should be in preferences.
        var now = new Date();
        now.setTime(now.getTime() + (2*60*60*1000));
        return (now.getTime() / 1000);
    },

    onFilter: function(context, pref)
    {
        var value = getPref(FirebugPrefDomain, pref);
        setPref(FirebugPrefDomain, pref, !value);

        TabWatcher.iterateContexts(function(context) {
            var panel = context.getPanel(panelName, true);
            if (panel)
                panel.refresh();
        });
    },

    onFilterPopupShowing: function(menu)
    {
        var items = menu.getElementsByTagName("menuitem");        
	    for (var i=0; i<items.length; i++)
	    {
	        var item = items[i];
            var prefValue = getPref(FirebugPrefDomain, item.value);
            if (prefValue)
                item.setAttribute("checked", "true");
            else
                item.removeAttribute("checked");
        }

        return true;
    },
    
    onHelp: function(context) 
    {
        openNewTab("http://www.janodvarko.cz/firecookie");
    },

    onAbout: function(context) 
    {
        var parent = context.chrome.window;
        parent.openDialog("chrome://mozapps/content/extensions/about.xul", "",
            "chrome,centerscreen,modal", "urn:mozilla:item:firecookie@janodvarko.cz", 
            extensionManager.datasource);
    },
    
    onViewAll: function(context) 
    {
	    var brandName = $FC_STR_BRAND("brandShortName");
        var parent = context.chrome.window;
        
	    if (brandName == "SeaMonkey" || brandName == "Mozilla") 
	    {
		    viewCookies();
	    } 
	    else if (brandName == "Netscape") 
	    {
		    parent.openDialog("chrome://browser/content/cookieviewer/CookieViewer.xul",
			    "_blank", "chrome,resizable=yes", "cookieManager");
	    } 
	    else 
	    {
		    parent.openDialog("chrome://browser/content/preferences/cookies.xul",
			    "_blank", "chrome,resizable=yes", null);
	    }
    },
    
    onViewExceptions: function(context) 
    {
		var brandName = $FC_STR_BRAND("brandShortName");
        var parent = context.chrome.window;

		if (brandName == "SeaMonkey" || brandName == "Mozilla") 
		{
            viewCookies();
		} 
		else if (brandName == "Netscape") 
		{
			var params = { 
			    blockVisible    : true,
                sessionVisible : true,
                allowVisible   : true,
                prefilledHost  : "",
                permissionType : "cookie" 
            };

    		parent.openDialog("chrome://browser/content/cookieviewer/CookieExceptions.xul",
    			"_blank", "chrome,resizable=yes", params);
		} 
		else 
		{
		    var params = {  
			    blockVisible   : true, 
				sessionVisible : true, 
				allowVisible   : true, 
				prefilledHost  : "", 
				permissionType : "cookie",
				windowTitle    : $FC_STR("firecookie.ExceptionsTitle"),
				introText      : $FC_STR("firecookie.Intro") 
		    };

  			parent.openDialog("chrome://browser/content/preferences/permissions.xul",
  			    "_blank","chrome,resizable=yes", params);
		}
    },    
}); 

// Localization
//-----------------------------------------------------------------------------

function $FC_STR(name)
{
    try
    {
        return document.getElementById("strings_firecookie").getString(name);
    }
    catch (err)
    {
        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("---------> Missing translation for: " + name + "\n");
            FBTrace.dumpProperties("---------> getString FAILS ", err);
        }
    }

    return name;
}

function $FC_STRF(name, args)
{
    try
    {
        return document.getElementById("strings_firecookie").getFormattedString(name, args);
    }
    catch (err)
    {
        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("---------> Missing translation for: " + name + "\n");
            FBTrace.dumpProperties("---------> getString FAILS ", err);
        }
    }

    return name;
}

function $FC_STR_BRAND(name)
{
    return document.getElementById("bundle_brand").getString(name);
}

// Panel Implementation
//-----------------------------------------------------------------------------

function FireCookiePanel() {} 

FireCookiePanel.prototype = extend(Firebug.Panel, 
{ 
    name: panelName, 
    title: $FC_STR("firecookie.Panel"),
    searchable: true,
    editable: false,

    initialize: function(context, doc) 
    {
        // xxxHonza 
        // This initialization is made as soon as the Cookies panel
        // is opened the first time. 
        // This means that columns are *not* resizeable within the console
        // (rejected cookies) till this activation isn't executed.
        
        // Initialize event listeners before the ancestor is called.
        var hcr = HeaderColumnResizer;
        this.onMouseClick = bind(hcr.onMouseClick, hcr);
        this.onMouseDown = bind(hcr.onMouseDown, hcr);
        this.onMouseMove = bind(hcr.onMouseMove, hcr);
        this.onMouseUp = bind(hcr.onMouseUp, hcr);
        this.onMouseOut = bind(hcr.onMouseOut, hcr);
    
        Firebug.Panel.initialize.apply(this, arguments);

        // Just after the initialization, so the this.document member is set.                
        Firebug.FireCookieModel.addStyleSheet(this);

        this.refresh();        
    },
    
    refresh: function()
    {
        // Create cookie list table.        
        this.table = Templates.CookieTable.createTable(this.panelNode);

        // Cookies are displayed only for web pages.        
        var location = this.context.window.location;
        var protocol = location.protocol;
        if (protocol.indexOf("http") != 0)
            return;

        // Get list of cookies for the current page.
        var cookies = [];
        var iter = cookieManager.enumerator;
        while (iter.hasMoreElements())
        {
            var cookie = iter.getNext();  		      
            if (!cookie)
                break;
                
            cookie = cookie.QueryInterface(nsICookie2);
            if (!CookieObserver.isCookieFromContext(this.context, cookie))
                continue;
            
            var cookieWrapper = new Cookie(makeCookieObject(cookie));
            cookies.push(cookieWrapper);
	    }

        // If the filter allow it, display all rejected cookies as well.
        if (getPref(FirebugPrefDomain, showRejectedCookies))
        {
            // xxxHonza the this.context.cookies is sometimes null, but 
            // this must be because FB isn't correctly initialized.
            if (!this.context.cookies)
            {
                if (FBTrace.DBG_COOKIES) 
                {
                    FBTrace.dumpProperties(
                        "---------> Cookie context isn't properly initialized - ERROR.\n",
                        this.context);
                }
                return;
            }

            var activeHosts = this.context.cookies.activeHosts;
            for (var hostName in activeHosts)
            {
                var host = activeHosts[hostName];
                if (!host.rejected)
                    continue;
                    
                var receivedCookies = host.receivedCookies;
                if (receivedCookies)
                    cookies = extendArray(cookies, receivedCookies);
            }
        }
         
        // Generate HTML list of cookies using domplate.
        if (cookies.length)
        {
            var header = getElementByClass(this.table, "cookieHeaderRow");
            var tag = Templates.CookieRow.cookieTag;
            var row = tag.insertRows({cookies: cookies}, header)[0];
            for (var i = 0; i < cookies.length; ++i)
            {
                var cookie = cookies[i];
                cookie.row = row;
                row.repObject = cookie;
                row = row.nextSibling;
            }
        }
        
        if (FBTrace.DBG_COOKIES)
            FBTrace.dumpProperties("---------> Cookie list refreshed.\n", cookies);
        
        // xxxHonza the last sorted column should be remembered in preferences.
    },
    
    initializeNode: function(oldPanelNode)
    {
        // xxxHonza 
        // This method isn't called when FB UI is detached. So, the columns
        // are *not* resizable when FB is open in external window.
    
        // Register event handlers for table column resizing.
        this.document.addEventListener("click", this.onMouseClick, true);
        this.document.addEventListener("mousedown", this.onMouseDown, true);
        this.document.addEventListener("mousemove", this.onMouseMove, true);
        this.document.addEventListener("mouseup", this.onMouseUp, true);
        this.document.addEventListener("mouseout", this.onMouseOut, true);
    },
    
    destroyNode: function()
    {
        this.document.removeEventListener("mouseclick", this.onMouseClick, true);
        this.document.removeEventListener("mousedown", this.onMouseDown, true);
        this.document.removeEventListener("mousemove", this.onMouseMove, true);
        this.document.removeEventListener("mouseup", this.onMouseUp, true);
        this.document.removeEventListener("mouseout", this.onMouseOut, true);
    },

    detach: function(oldChrome, newChrome)
    {
        Firebug.Panel.detach.apply(this, arguments);
    },

    reattach: function(doc)
    {
        Firebug.Panel.reattach.apply(this, arguments);
    },
            
    clear: function()
    {
        if (this.panelNode)
            clearNode(this.panelNode);
            
        this.table = null;
    },
    
    show: function(state)
    {
        // Updatee permission button in the toolbar.
        Firebug.FireCookieModel.Perm.updatePermButton(this.context);        
    },
    
    hide: function()
    {
    },
    
    // Options menu
    getOptionsMenuItems: function(context)
    {
        return [
            MenuUtils.optionAllowGlobally(context, "firecookie.AllowGlobally", 
                networkPrefDomain, cookieBehaviorPref),
            "-",            
            /*MenuUtils.optionMenu(context, "firecookie.clearWhenDeny", 
                FirebugPrefDomain, clearWhenDeny),*/
            MenuUtils.optionMenu(context, "firecookie.LogEvents", 
                FirebugPrefDomain, logEventsPref)
        ];
    },

    search: function(text)
    {
        if (!text)
            return;

        // Make previously visible nodes invisible again
        if (this.matchSet)
        {
            for (var i in this.matchSet)
                removeClass(this.matchSet[i], "matched");
        }

        this.matchSet = [];

        function findRow(node) { return getAncestorByClass(node, "cookieRow"); }
        var search = new TextSearch(this.panelNode, findRow);

        var cookieRow = search.find(text);
        if (!cookieRow)
            return false;

        for (; cookieRow; cookieRow = search.findNext())
        {
            setClass(cookieRow, "matched");
            this.matchSet.push(cookieRow);
        }

        return true;
    },
       
    getPopupObject: function(target)
    {
        var header = getAncestorByClass(target, "cookieHeaderRow");
        if (header)
            return Templates.CookieTable;
            
        return Firebug.Panel.getPopupObject.apply(this, arguments);
    },       
    
    findRepObject: function(cookie)
    {
        var strippedHost = makeStrippedHost(cookie.host);
    
        var row = getElementByClass(this.panelNode, "cookieRow");
        while (row) 
        {
            var rep = row.repObject;
            if (rep)
            {
                if (rep.rawHost == strippedHost &&
                    rep.cookie.name == cookie.name &&
                    rep.cookie.path == cookie.path) 
                {
                    return rep;
                }
            }
                                            
            row = row.nextSibling;
        }
        
        return null;
    },
    
    supportsObject: function(object)
    {
        return object instanceof Cookie;
    },
    
    updateSelection: function(cookie)
    {
        var repCookie = this.findRepObject(cookie.cookie);
        if (!repCookie)
            return;
            
        Templates.CookieRow.toggleRow(repCookie.row, true);
        scrollIntoCenterView(repCookie.row);
    }
}); 

// Menu utility
//-----------------------------------------------------------------------------

var MenuUtils = 
{
    optionMenu: function(context, label, domain, option) 
    {
        var value = getPref(domain, option);
        return { label: $FC_STR(label), nol10n: true, type: "checkbox", checked: value, 
            command: bindFixed(MenuUtils.setPref, this, domain, option, !value) };
    },

    optionAllowGlobally: function(context, label, domain, option)
    {
  		var value = getPref(domain, option) == 0;
	    return { label: $FC_STR(label), nol10n: true, type: "checkbox", 
    	    checked: value, 
	        command: bindFixed(this.onAllowCookie, this, domain, option)}
    },
    
    // Command handlers
    onAllowCookie: function(domain, option)
    {
        var value = getPref(domain, option);
        switch (value)
        {
  	        case 0: // accept all cookies by default
            setPref(domain, option, 2);
  	        return;
          	
  	        case 1: // only accept from the originating site (block third party cookies)
  	        case 2: // block all cookies by default;
  	        case 3: // use p3p settings
            setPref(domain, option, 0);
  	        return;
        } 
    },
    
    onBlockCurrent: function()
    {
    },
    
    setPref: function(prefDomain, name, value)
    {
        setPref(prefDomain, name, value);
    }
};

// Cookie Permissions
//-----------------------------------------------------------------------------

Firebug.FireCookieModel.Perm = extend(Object, 
{
    onCommand: function(event, context)
    {
        var menu = event.target;
        this.setPermission(context, menu.value);
    },    
    
    onTooltipShowing: function(tooltip, context)
    {
        if (tooltip.fcEnabled)
        {
            var host = context.window.location.host;
            tooltip.label = $FC_STRF("firecookie.perm.manage.tooltip", [host]);
        }
            
        return tooltip.fcEnabled;
    },
    
    onPopupShowing: function(menu, context)
    {
        permTooltip.fcEnabled = false;
        
        var items = menu.getElementsByTagName("menuitem");        
	    var location = context.browser.currentURI;
	    var value = this.getPermission(location);	    
	    var defaultValue = (value.indexOf("default") == 0) ? value : this.getDefaultPref();
	    
	    items[0].value = defaultValue;

	    for (var i=0; i<items.length; i++)
	    {
		    var option = items[i].value;
		    if (option == value) 
		        items[i].setAttribute("checked", "true");
		        
		    items[i].label = this.getLabel(option, location);
	    }
	    
	    return true;
    },
    
    onPopupHiding: function(menu, context)
    {
        permTooltip.fcEnabled = true;
        return true;
    },
    
    getPermission: function(location)
    {
	    switch (permissionManager.testPermission(location, "cookie"))
	    {
	        case nsIPermissionManager.ALLOW_ACTION: 
	            return "host-allow";	            
	        case nsIPermissionManager.DENY_ACTION:  
	            return "host-deny";	            
	        case nsICookiePermission.ACCESS_SESSION:
	            return "host-allow-session";	            
	        default:
	            return this.getDefaultPref();
	    }
    },

    setPermission: function(context, option)
    {
	    var location = context.browser.currentURI;
	    permissionManager.remove(location.host, "cookie");
	    switch(option)
	    {
	        case "host-allow-session": 
	            permissionManager.add(location, "cookie", nsICookiePermission.ACCESS_SESSION);
	            break;
	        case "host-allow":
                permissionManager.add(location, "cookie", permissionManager.ALLOW_ACTION); 
                break;
	        case "host-deny":
		        permissionManager.add(location, "cookie", permissionManager.DENY_ACTION);

	        case "default-deny":
                if (getPref(FirebugPrefDomain, clearWhenDeny))
                    Firebug.FireCookieModel.onRemoveAll(context);
		        break;
	    }
	    
	    this.updatePermButton(context);
    },
    
    updatePermButton: function(context, chrome)
    {
        if (!chrome)
            chrome = context.chrome;
            
        // This is called through TabWatcher.iterateContexts and 
        // "this" isn't passed along
        var oThis = Firebug.FireCookieModel.Perm;        
        var location = context.browser.currentURI;
	    var value = oThis.getPermission(location);
	    
	    var button = chrome.$("fcPerm");
	    button.label = oThis.getLabel(value, location);
	    button.removeAttribute("disabled");
	    button.setAttribute("value", value);
    },
    
    getLabel: function (option, location)
    {
        var optionInfo = permOptions[option];
        if (!optionInfo)
            return null;
            
        if (optionInfo[1])
            return $FC_STRF(optionInfo[0], [location.host]);
            
        return $FC_STR(optionInfo[0]);
    },
    
    getDefaultPref: function()
    {
	    var behavior = getPref(networkPrefDomain, cookieBehaviorPref);
	    if (typeof(behavior) == "undefined")
	        behavior = 0;

	    if (behavior == 2) 
	        return "default-deny";

	    switch (getPref(networkPrefDomain, cookieLifeTimePref))
	    {
	        case 1: 
	            return "default-warn";
	        case 2: 
	            return (behavior == 0) ? "default-third-party-session" : 
	                "default-session";
	    }
    	
	    switch (behavior)
	    {
	        case 0: 
	            return "default-third-party";
	        case 1: 
	            return "default-allow";
	    }
	    
	    return null;
    }    
});

// Templates Helpers
//-----------------------------------------------------------------------------

// Object with all rep templates.
var Templates = Firebug.FireCookieModel.Templates = {};

Templates.Rep = domplate(Firebug.Rep,
{
    getContextMenuItems: function(cookie, target, context)
    {
        // xxxHonza not sure how to do this better if the "copy"
        // command shouldn't be there.
        var popup = $("fbContextMenu");
        FBL.eraseNode(popup);
    }
});

// Cookie Template (domplate)
//-----------------------------------------------------------------------------

Templates.CookieRow = domplate(Templates.Rep,
{
    inspectable: false,

    cookieTag:
        FOR("cookie", "$cookies",
            TR({class: "cookieRow", _repObject: "$cookie", onclick: "$onClickRow", 
                $sessionCookie: "$cookie|isSessionCookie",
                $rejectedCookie: "$cookie|isRejected"},
                TD({class: "cookieNameCol cookieCol"},
                    DIV({class: "cookieNameLabel cookieLabel"}, "$cookie|getName")
                ),
                TD({class: "cookieValueCol cookieCol"},
                    DIV({class: "cookieValueLabel cookieLabel"}, 
                        SPAN("$cookie|getValue"))
                ),
                TD({class: "cookieDomainCol cookieCol"},
                    SPAN({class: "cookieDomainLabel cookieLabel", onclick: "$onClickDomain"}, 
                        "$cookie|getDomain")
                ),
                TD({class: "cookieSizeCol cookieCol"},
                    DIV({class: "cookieSizeLabel cookieLabel"}, "$cookie|getSize")
                ),
                TD({class: "cookiePathCol cookieCol"},
                    DIV({class: "cookiePathLabel cookieLabel"}, "$cookie|getPath")
                ),
                TD({class: "cookieExpiresCol cookieCol"},
                    DIV({class: "cookieExpiresLabel cookieLabel"}, "$cookie|getExpires")
                ),
                TD({class: "cookieHttpOnlyCol cookieCol"},
                    DIV({class: "cookieHttpOnlyLabel cookieLabel"}, "$cookie|isHttpOnly")
                ),
                TD({class: "cookieSecurityCol cookieCol"},
                    DIV({class: "cookieLabel"}, "$cookie|isSecure")
                ),
                TD({class: "cookieStatusCol cookieCol"},
                    DIV({class: "cookieLabel"}, "$cookie|getStatus")
                )
            )
        ),
    
    bodyRow:
        TR({class: "cookieInfoRow"},
            TD({class: "cookieInfoCol", colspan: 9})
        ),
    
    bodyTag:
        DIV({class: "cookieInfoBody", _repObject: "$cookie"},
            DIV({class: "cookieInfoTabs"},
                A({class: "cookieInfoValueTab cookieInfoTab", onclick: "$onClickTab",
                    view: $FC_STR("firecookie.info.valuetab.label")},
                    "Value"
                )
            ),
            DIV({class: "cookieInfoValueText cookieInfoText"},
                TABLE({class: "cookieInfoValueTable", cellpadding: 0, cellspacing: 0},
                    TBODY()
                )
            ),
            DIV({class: "cookieInfoEditorText cookieInfoText"},
                TABLE({class: "cookieInfoEditorTable", cellpadding: 0, cellspacing: 0},
                    TBODY()
                )
            )
        ),
        
    getAction: function(cookie) {
        return cookie.action;
    },
        
    getName: function(cookie) {
        return cookie.cookie.name;
    },

    getValue: function(cookie) {
        var limit = 200;
        var value = cookie.cookie.value;
        if (value.length > limit)
            return escapeNewLines(value.substr(0, limit) + "...");
        else
            return escapeNewLines(value);
    },
    
    getDomain: function(cookie) {
        return cookie.cookie.host;
    },

    getExpires: function(cookie) {
    
        // The first character is space so, if the table is sorted accoroding 
        // to this column, all "Session" cookies are displayed at the begining.        
        if (cookie.cookie.expires == 0)
            return " " + $FC_STR("firecookie.Session");
            
        try {
            // Format the expires date using the current locale.
            var date = new Date(cookie.cookie.expires * 1000);
            return dateFormat.FormatDateTime("", dateFormat.dateFormatLong,
                dateFormat.timeFormatSeconds,
                date.getFullYear(),
                date.getMonth() + 1,
                date.getDate(),
                date.getHours(),
                date.getMinutes(),
                date.getSeconds());
        }
        catch (err) {
            ERROR(err);
        }

        return "";
    },
    
    isHttpOnly: function(cookie) {
        return cookie.cookie.isHttpOnly ? "HttpOnly" : "";
    },

    isSessionCookie: function(cookie) {
        return !cookie.cookie.expires;
    },

    isRejected: function(cookie) {
        return !!cookie.cookie.rejected;
    },
    
    getSize: function(cookie) {
        var size = cookie.cookie.name.length + cookie.cookie.value.length;
        return this.formatSize(size);
    },
    
    formatSize: function(bytes)
    {
        if (bytes == -1 || bytes == undefined)
            return "?";
        else if (bytes < 1024)
            return bytes + " B";
        else if (bytes < 1024*1024)
            return Math.ceil(bytes/1024) + " KB";
        else
            return (Math.ceil(bytes/1024)/1024) + " MB";    // OK, this is probable not necessary ;-)
    },
    
    getPath: function(cookie) {
        return cookie.cookie.path;
    },
    
    isDomainCookie: function(cookie) {
        return cookie.cookie.isDomain ? $FC_STR("firecookie.domain.label") : "";
    },

    isSecure: function(cookie) {
        return cookie.cookie.isSecure ? $FC_STR("firecookie.secure.label") : "";
    },
    
    getStatus: function(cookie) 
    {    
        if (!cookie.cookie.status)
            return "";
            
        switch (cookie.cookie.status)
        {
            case STATUS_UNKNOWN:
                return "";
            case STATUS_ACCEPTED:
                return $FC_STR("firecookie.status.accepted");
            case STATUS_DOWNGRADED:
                return $FC_STR("firecookie.status.downgraded");
            case STATUS_FLAGGED:
                return $FC_STR("firecookie.status.flagged");
            case STATUS_REJECTED:
                return $FC_STR("firecookie.status.rejected");
        }
        
        return "";
    },

    getPolicy: function(cookie) {
        switch (cookie.cookie.policy)
        {
            //xxxHonza localization
            case POLICY_UNKNOWN:
                return "POLICY_UNKNOWN";
            case POLICY_NONE:
                return "POLICY_NONE";
            case POLICY_NO_CONSENT:
                return "POLICY_NO_CONSENT";
            case POLICY_IMPLICIT_CONSENT:
                return "POLICY_IMPLICIT_CONSENT";
            case POLICY_NO_II:
                return "POLICY_NO_II";
        }
        
        return "";
    },
    
    // Firebug rep support
    supportsObject: function(cookie)
    {
        return cookie instanceof Cookie;
    },

    browseObject: function(cookie, context)
    {
        return false;
    },

    getRealObject: function(cookie, context)
    {
        return cookie.cookie;
    },
    
    getContextMenuItems: function(cookie, target, context)
    {
        Templates.Rep.getContextMenuItems.apply(this, arguments);
        
        var popup = $("fbContextMenu");
        FBL.eraseNode(popup);
        
        var items = [];
        var rejected = cookie.cookie.rejected;
        
        if (!rejected)
        {
            items.push({ 
              label: $FC_STR("firecookie.Cut"), 
              nol10n: true, 
              command: bindFixed(this.onCut, this, cookie) 
            });
        }
        
        items.push({ 
          label: $FC_STR("firecookie.Copy"), 
          nol10n: true, 
          command: bindFixed(this.onCopy, this, cookie) 
        });
        
        if (!rejected)
        {
            items.push({ 
              label: $FC_STR("firecookie.Paste"), 
              nol10n: true, 
              disabled: CookieClipboard.isCookieAvailable() ? false : true,
              command: bindFixed(this.onPaste, this, cookie) 
            });

            items.push("-");

            items.push({ 
              label: $FC_STR("firecookie.Delete"), 
              nol10n: true, 
              command: bindFixed(this.onRemove, this, cookie) 
            });
            
            items.push("-");

            items.push({ 
              label: $FC_STR("firecookie.Edit"), 
              nol10n: true, 
              command: bindFixed(this.onEdit, this, cookie) 
            });
        }
        
        return items;
    },
    
    // Context menu commands
    onCut: function(cookie)
    {
        this.onCopy(cookie);
        this.onRemove(cookie);
    },
    
    onCopy: function(cookie)
    {
        CookieClipboard.copyTo(cookie);
    },

    onPaste: function(cookie)
    {
        var context = FirebugContext;
        var values = CookieClipboard.getFrom();
        if (!values || !context)
            return;

        // Change name so it's unique and use the current host.
        values.name = Firebug.FireCookieModel.getDefaultCookieName(context, values.name);
        values.host = context.browser.currentURI.host;

        // Unescape cookie value (it's escaped in toJSON method).
        values.value = unescape(values.value);

        // If the expire time isn't set use the default value. Some time must be set as 
        // the session flag is alwas set to false (see add method below); otherwise the 
        // cookie wouldn't be created.
        if (!values.expire)
            values.expires = Firebug.FireCookieModel.getDefaultCookieExpireTime();

        // Create a new cookie.
        cookieManager.add(values.host, values.path, values.name, values.value, 
            values.isSecure, values.isHttpOnly, false, values.expires);
        
        if (FBTrace.DBG_COOKIES)
            checkList(context.getPanel(panelName, true));
    },

    onRemove: function(cookie)
    {
        // Get the real XPCOM cookie object and remove it.
        var realCookie = cookie.cookie;        
        if (!cookie.cookie.rejected)
            cookieManager.remove(realCookie.host, realCookie.name, realCookie.path, false);
    },

    onEdit: function(cookie)
    {
        var params = {
          cookie: cookie.cookie,
          action: "edit",
          window: null
        };
        
        var parent = FirebugContext.chrome.window;
        parent.openDialog("chrome://firecookie/content/editCookie.xul", 
            "_blank", "chrome,centerscreen,resizable=yes,modal=yes", 
            params);
    },
    
    // Event handlers
    onClickDomain: function(event) 
    {
        if (isLeftClick(event))
        {
            var domain = event.target.innerHTML;
            if (domain)
            {
                cancelEvent(event);
                event.cancelBubble = true;
                //xxxHonza www.google.com (more windows are opened)
                // openNewTab(domain);
            }
        }
    },
    
    onClickRow: function(event)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> Click on cookie row.\n");
    
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "cookieRow");
            if (row)
            {
                this.toggleRow(row);
                cancelEvent(event);
            }
        }
    },
    
    toggleRow: function(row, forceOpen)
    {
        var opened = hasClass(row, "opened");
        if (opened && forceOpen)
            return;
    
        toggleClass(row, "opened");

        if (hasClass(row, "opened"))
        {
            var bodyRow = this.bodyRow.insertRows({}, row)[0];
            var cookieInfo = this.bodyTag.replace({cookie: row.repObject}, bodyRow.firstChild);
            this.selectTabByName(cookieInfo, "Value");
        }
        else
        {
            row.parentNode.removeChild(row.nextSibling);
        }
    },
    
    selectTabByName: function(cookieInfoBody, tabName)
    {
        var tab = getChildByClass(cookieInfoBody, "cookieInfoTabs", "cookieInfo" + tabName + "Tab");
        if (tab)
            this.selectTab(tab);
    },

    onClickTab: function(event)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> onClickTab\n");

        this.selectTab(event.currentTarget);
    },

    selectTab: function(tab)
    {
        var cookieInfoBody = tab.parentNode.parentNode;

        var view = tab.getAttribute("view");
        if (cookieInfoBody.selectedTab)
        {
            cookieInfoBody.selectedTab.removeAttribute("selected");
            cookieInfoBody.selectedText.removeAttribute("selected");
        }

        var textBodyName = "cookieInfo" + view + "Text";

        cookieInfoBody.selectedTab = tab;
        cookieInfoBody.selectedText = getChildByClass(cookieInfoBody, textBodyName);

        cookieInfoBody.selectedTab.setAttribute("selected", "true");
        cookieInfoBody.selectedText.setAttribute("selected", "true");

        var cookie = Firebug.getRepObject(cookieInfoBody);
        
        var context = Firebug.getElementPanel(cookieInfoBody).context;
        this.updateInfo(cookieInfoBody, cookie, context);
    },

    updateRow: function(cookie, context)
    {
        var panel = context.getPanel(panelName, true);
        if (!panel)
            return;

        var parent = cookie.row.parentNode;
        var nextSibling = cookie.row.nextSibling;
        parent.removeChild(cookie.row);
        
        var row = Templates.CookieRow.cookieTag.insertRows({cookies: [cookie]}, 
            panel.table.lastChild.lastChild)[0];

        var opened = hasClass(cookie.row, "opened");
        
        cookie.row = row;
        row.repObject = cookie;

        if (nextSibling && row.nextSibling != nextSibling)
        {   
            parent.removeChild(cookie.row);            
            parent.insertBefore(row, nextSibling);
        }
        
        if (opened)
            setClass(row, "opened");        
    },

    updateInfo: function(cookieInfoBody, cookie, context)
    {
        var tab = cookieInfoBody.selectedTab;
        if (hasClass(tab, "cookieInfoValueTab"))
        {
            var valueBox = getChildByClass(cookieInfoBody, "cookieInfoValueText");
            if (!cookieInfoBody.valuePresented)
            {
                cookieInfoBody.valuePresented = true;

                var text = cookie.cookie.value;
                if (text != undefined)
                    insertWrappedText(text, valueBox);
            }
        }
    }
});

// Console Event Templates (domplate)
//-----------------------------------------------------------------------------

/**
 * This UI template is used for displaying cookie-changed events 
 * (except of "clear") in the Console tab.
 */
Templates.CookieChanged = domplate(Templates.Rep,
{
    inspectable: false,

    // Console
    tag:
        DIV({class: "cookieEvent", _repObject: "$object"},
            TABLE({cellpadding: 0, cellspacing: 0},
                TBODY(
                    TR(
                        TD({width: "100%"},
                            SPAN($FC_STR("firecookie.console.cookie"), " "),
                            SPAN({class: "cookieNameLabel", onclick: "$onClick"}, 
                                "$object|getName", 
                                " "),
                            SPAN({class: "cookieActionLabel"}, 
                                "$object|getAction", 
                                ".&nbsp;&nbsp;"),
                            SPAN({class: "cookieValueLabel"}, 
                                "$object|getValue")
                        ),
                        TD(
                            SPAN({class: "cookieDomainLabel", onclick: "$onClickDomain",
                                title: "$object|getOriginalURI"}, "$object|getDomain"),
                            SPAN("&nbsp;") 
                        )
                    )
                )
            )
        ),

    // Event handlers
    onClick: function(event)
    {
        if (!isLeftClick(event))
            return;
            
        var target = event.target;
        
        // Get associated nsICookie object.
        var cookieEvent = Firebug.getRepObject(target);
        if (!cookieEvent)
            return;

        var cookieWrapper = new Cookie(makeCookieObject(cookieEvent.cookie));
        var context = Firebug.getElementPanel(target).context;
        context.chrome.select(cookieWrapper, panelName);
    },

    onClickDomain: function(event) 
    {
    },

    getOriginalURI: function(cookieEvent)
    {
        var context = cookieEvent.context;
        var strippedHost = cookieEvent.rawHost;

        if (!context.cookies.activeCookies)
            return strippedHost;

        var name = cookieEvent.cookie.name;
        var path = cookieEvent.cookie.path;

        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.dumpProperties("---------> activeHosts:", 
                context.cookies.activeCookies);

            FBTrace.dumpProperties("---------> getOriginalURI: " + 
                strippedHost + ", " + name + ", " + path +
                "\n", cookieEvent);
        }

        var activeCookies = context.cookies.activeCookies[strippedHost];
        if (!activeCookies)
            return strippedHost;

        // Iterate list of received cookies for this context and look for the match. 
        // There is an info about the originalURI where the cookie came from.
        for (var i=0; i<activeCookies.length; i++) 
        {
            var cookie = activeCookies[i].cookie;
            if (makeStrippedHost(cookie.host) == strippedHost &&
                cookie.name == name &&
                cookie.path == path) 
            {
                return cookie.originalURI.spec;
            }
        }

        return cookieEvent.rawHost;
    },

    getAction: function(cookieEvent) {
        return cookieEvent.action;
    },
        
    getName: function(cookieEvent) {
        return cookieEvent.cookie.name;
    },

    getValue: function(cookieEvent) {
        return cropString(cookieEvent.cookie.value, 75);
    },

    getDomain: function(cookieEvent) {
        return cookieEvent.cookie.host;
    },
    
    // Firebug rep support
    supportsObject: function(cookieEvent)
    {
        return cookieEvent instanceof CookieChangedEvent;
    },

    browseObject: function(cookieEvent, context)
    {
        return false;
    },

    getRealObject: function(cookieEvent, context)
    {
        return cookieEvent;
    },

    // Context menu    
    getContextMenuItems: function(cookieEvent, target, context)
    {
        Templates.Rep.getContextMenuItems.apply(this, arguments);
    }
});

//-----------------------------------------------------------------------------

Templates.CookieRejected = domplate(Templates.Rep,
{
    inspectable: false,

    tag:
        DIV({class: "cookieEvent", _repObject: "$object"},
            TABLE({cellpadding: 0, cellspacing: 0},
                TBODY(
                    TR(
                        TD({width: "100%"},
                            SPAN({class: "cookieRejectedLabel"},
                                $FC_STR("firecookie.console.cookiesrejected")),
                            " ",
                            SPAN({class: "cookieRejectedList"},
                                "$object|getCookieList")
                        ),
                        TD(
                            SPAN({class: "cookieDomainLabel", onclick: "$onClickDomain"}, 
                                "$object|getDomain"),
                            SPAN("&nbsp;") 
                        )
                    )
                )
            )
        ),
    
    supportsObject: function(object)
    {
        return object instanceof CookieRejectedEvent;
    },

    getDomain: function(cookieEvent)
    {
        return cookieEvent.uri.host;
    },
        
    getCookieList: function(cookieEvent)
    {
        var context = cookieEvent.context;
        var activeHost = context.cookies.activeHosts[cookieEvent.uri.host];        
        var cookies = activeHost.receivedCookies;
        if (!cookies)
            return $FC_STR("firecookie.console.nocookiesreceived");
            
        var label = "";
        for (var i=0; i<cookies.length; i++)    
            label += cookies[i].cookie.name + ((i<cookies.length-1) ? ", " : "");

        return cropString(label, 75);
    },
    
    onClickDomain: function(event)
    {
    },
    
    // Context menu    
    getContextMenuItems: function(cookie, target, context)
    {
        Templates.Rep.getContextMenuItems.apply(this, arguments);
    }    
});

//-----------------------------------------------------------------------------

Templates.CookieCleared = domplate(Templates.Rep,
{
    inspectable: false,

    tag:
        DIV({_repObject: "$object"},
            DIV("$object|getLabel")
        ),
        
    supportsObject: function(object)
    {
        return object instanceof CookieClearedEvent;
    },
    
    getLabel: function()
    {
        return $FC_STR("firecookie.console.cookiescleared");
    },
    
    // Context menu    
    getContextMenuItems: function(cookie, target, context)
    {
        Templates.Rep.getContextMenuItems.apply(this, arguments);
    }    
});

// Header Template (domplate)
//-----------------------------------------------------------------------------

Templates.CookieTable = domplate(Templates.Rep,
{
    inspectable: false,

    tableTag:
        TABLE({class: "cookieTable", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({class: "cookieHeaderRow", onclick: "$onClickHeader"},
                    TD({id: "colName", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.name.tooltip")}, 
                        $FC_STR("firecookie.header.name"))
                    ),
                    TD({id: "colValue", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.value.tooltip")}, 
                        $FC_STR("firecookie.header.value"))
                    ),
                    TD({id: "colDomain", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.domain.tooltip")}, 
                        $FC_STR("firecookie.header.domain"))
                    ),
                    TD({id: "colSize", class: "cookieHeaderCell"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.size.tooltip")}, 
                        $FC_STR("firecookie.header.size"))
                    ),
                    TD({id: "colPath", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.path.tooltip")}, 
                        $FC_STR("firecookie.header.path"))
                    ),
                    TD({id: "colExpires", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.expires.tooltip")}, 
                        $FC_STR("firecookie.header.expires"))
                    ),
                    TD({id: "colHttpOnly", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.httponly.tooltip")}, 
                        $FC_STR("firecookie.header.httpOnly"))
                    ),
                    TD({id: "colSecurity", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.security.tooltip")}, 
                        $FC_STR("firecookie.header.security"))
                    ),
                    TD({id: "colStatus", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FC_STR("firecookie.header.status.tooltip")}, 
                        $FC_STR("firecookie.header.status"))
                    )
                )
            )
        ),

    onClickHeader: function(event)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> onClickHeader\n");

        if (!isLeftClick(event))
            return;
        
        var table = getAncestorByClass(event.target, "cookieTable");
        var cell = getAncestorByClass(event.target, "cookieHeaderCell");
        if (!cell)
            return;

        var numerical = !hasClass(cell, "alphaValue");

        var colIndex = 0;
        for (cell = cell.previousSibling; cell; cell = cell.previousSibling)
            ++colIndex;

        this.sort(table, colIndex, numerical);        
    },
    
    sort: function(table, colIndex, numerical)
    {
        var tbody = table.lastChild;

        var values = [];
        for (var row = tbody.childNodes[1]; row; row = row.nextSibling)
        {
            var cell = row.childNodes[colIndex];
            var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
            
            if (hasClass(row, "opened"))
            {
                var cookieInfoRow = row.nextSibling;
                values.push({row: row, value: value, info: cookieInfoRow});
                row = cookieInfoRow;
            }
            else
            {
                values.push({row: row, value: value});
            }            
        }

        values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });

        var headerRow = tbody.firstChild;
        var headerSorted = getChildByClass(headerRow, "cookieHeaderSorted");
        removeClass(headerSorted, "cookieHeaderSorted");

        var header = headerRow.childNodes[colIndex];
        setClass(header, "cookieHeaderSorted");

        if (!header.sorted || header.sorted == 1)
        {
            removeClass(header, "sortedDescending");
            setClass(header, "sortedAscending");

            header.sorted = -1;

            for (var i = 0; i < values.length; ++i)
            {
                tbody.appendChild(values[i].row);
                if (values[i].info)
                    tbody.appendChild(values[i].info);
            }
        }
        else
        {
            removeClass(header, "sortedAscending");
            setClass(header, "sortedDescending");

            header.sorted = 1;

            for (var i = values.length-1; i >= 0; --i)
            {
                tbody.appendChild(values[i].row);
                if (values[i].info)
                    tbody.appendChild(values[i].info);
            }
        }
    },

    supportsObject: function(object)
    {
        return (object == this) ? this : null;
    },
    
    // Context menu    
    getContextMenuItems: function(object, target, context)
    {
        Templates.Rep.getContextMenuItems.apply(this, arguments);
    
        var popup = $("fbContextMenu");
        FBL.eraseNode(popup);
        
        var items = [
            { 
              label: $FC_STR("firecookie.header.ResetColumns"), 
              nol10n: true, 
              command: bindFixed(this.onResetColumns, this, context) 
            }
        ];

        return items;
    },
    
    onResetColumns: function(context)
    {
        var panel = context.getPanel(panelName, true);
        var header = getElementByClass(panel.panelNode, "cookieHeaderRow");

        var columns = header.childNodes;
        for (var i=0; i<columns.length; i++)
        {
            var col = columns[i];
            if (col.style)
                col.style.width = "";
        }
    },
    
    createTable: function(parentNode)
    {
        // Create cookie table UI.
        var table = this.tableTag.replace({}, parentNode, this);
        
        // Update columns width according to the preferences.
        var header = getElementByClass(table, "cookieHeaderRow");
        var columns = header.getElementsByTagName("td");
        for (var i=0; i<columns.length; i++)
        {
            var col = columns[i];
            var colId = col.getAttribute("id");
            if (!colId || !col.style)
                continue;
                
            var width = getPref(FirebugPrefDomain, "firecookie." + colId + ".width");
            if (width)
                col.style.width = width + "px";
        }
        
        return table;
    }    
});

// Resizable column helper (helper for Templates.CookieTable)
//-----------------------------------------------------------------------------

var HeaderColumnResizer = 
{
    resizing: false,
    currColumn: null,
    startX: 0,
    startWidth: 0,
    lastMouseUp: 0,

    onMouseClick: function(event)
    {
        if (!isLeftClick(event))
            return;

        // Avoid click event for sorting, if the resizing has been just finished.
        var rightNow = now();
        if ((rightNow - this.lastMouseUp) < 1000)
            cancelEvent(event);        
    },
        
    onMouseDown: function(event)
    {
        if (!isLeftClick(event))
            return;
        
        var target = event.target;
        if (!hasClass(target, "cookieHeaderCellBox"))
            return;
            
        var header = getAncestorByClass(target, "cookieHeaderRow");
        if (!header)
            return;
            
        this.onStartResizing(event);

        cancelEvent(event);        
    },
    
    onMouseMove: function(event)
    {
        if (this.resizing)
        {
            if (hasClass(target, "cookieHeaderCellBox"))
                target.style.cursor = "e-resize";
                
            this.onResizing(event);
            return;
        }
        
        var target = event.target;
        if (!hasClass(target, "cookieHeaderCellBox"))
            return;

        if (target)
            target.style.cursor = "";

        if (!this.isBetweenColumns(event))
            return;

        // Update cursor if the mouse is located between two columns.
        target.style.cursor = "e-resize";
    },
    
    onMouseUp: function(event)
    {
        if (!this.resizing)
            return;

        this.lastMouseUp = now();
        
        this.onEndResizing(event);
        cancelEvent(event);        
    },

    onMouseOut: function(event)
    {
        if (!this.resizing)
            return;
    
        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("---------> Mouse out, target: " + event.target.localName + 
                ", " + event.target.className + "\n");
            FBTrace.sysout("      explicitOriginalTarget: " + event.explicitOriginalTarget.localName + 
                ", " + event.explicitOriginalTarget.className + "\n");
        }
    
        var target = event.target;
        if (target == event.explicitOriginalTarget)
            this.onEndResizing(event);
            
        cancelEvent(event);        
    },
    
    isBetweenColumns: function(event)
    {
        var target = event.target;
        var x = event.clientX;
        var y = event.clientY;

        var column = getAncestorByClass(target, "cookieHeaderCell");
        var offset = getClientOffset(column);
        var size = getOffsetSize(column);
        
        if (column.previousSibling)
        {
            if (x < offset.x + 4)
                return 1;   // Mouse is close to the left side of the column (target).
        }
        
        if (column.nextSibling)
        {
            if (x > offset.x + size.width - 6)
                return 2;  // Mouse is close to the right side.
        }
        
        return 0;
    },
    
    onStartResizing: function(event)
    {
        var location = this.isBetweenColumns(event);
        if (!location)
            return;
        
        var target = event.target;
    
        this.resizing = true;
        this.startX = event.clientX;

        // Currently resizing column.
        var column = getAncestorByClass(target, "cookieHeaderCell");
        this.currColumn = (location == 1) ? column.previousSibling : column;

        // Last column width.
        var size = getOffsetSize(this.currColumn);
        this.startWidth = size.width;
        
        if (FBTrace.DBG_COOKIES)
        {
            var colId = this.currColumn.getAttribute("id");
            FBTrace.sysout("---------> Start resizing column (id): " + colId + 
                ", start width: " + this.startWidth + "\n");
        }
    },
    
    onResizing: function(event)
    {
        if (!this.resizing)
            return;

        var newWidth = this.startWidth + (event.clientX - this.startX);
        this.currColumn.style.width = newWidth + "px";
        
        if (FBTrace.DBG_COOKIES)
        {
            var colId = this.currColumn.getAttribute("id");
            FBTrace.sysout("---------> Resizing column (id): " + colId + 
                ", new width: " + newWidth + "\n");
        }
    },
    
    onEndResizing: function(event)
    {
        if (!this.resizing)
            return;

        this.resizing = false;
        
        var newWidth = this.startWidth + (event.clientX - this.startX);
        this.currColumn.style.width = newWidth + "px";
        
        // Store width into the preferences.
        var colId = this.currColumn.getAttribute("id");
        if (colId)
        {
            var prefName = FirebugPrefDomain + ".firecookie." + colId + ".width";
            
            // Use directly nsIPrefBranch interface as the pref 
            // doesn't have to exist yet.            
            prefs.setIntPref(prefName, newWidth);
        }
                
        if (FBTrace.DBG_COOKIES)
        {
            var colId = this.currColumn.getAttribute("id");
            FBTrace.sysout("---------> End resizing column (id): " + colId + 
                ", new width: " + maxWidth + "\n");
        }
    }
};

// Clipboard helper
//-----------------------------------------------------------------------------

var CookieClipboard = extend(Object,
{
    cookieFlavour: "text/firecookie-cookie",
    unicodeFlavour: "text/unicode",
    
    copyTo: function(cookie)
    {
        try
        {
            var trans = this.createTransferData(cookie);
            if (trans && clipboard)
                clipboard.setData(trans, null, nsIClipboard.kGlobalClipboard);
        }
        catch (err)
        {
            ERROR(err);
        }
    },
    
    getFrom: function()
    {
        try
        {
            var str = this.getTransferData();
            return parseFromJSON(str);
        }
        catch (err)
        {
            ERROR(err);
        }
        
        return null;
    },
    
    isCookieAvailable: function()
    {
        try
        {
            if (!clipboard)
                return false;
            
            // nsIClipboard interface has been changed in FF3.                       
            if (versionChecker.compare(appInfo.version, "3.0*") >= 0)
            {
                // FF3
                return clipboard.hasDataMatchingFlavors([this.cookieFlavour], 1, 
                    nsIClipboard.kGlobalClipboard);
            }
            else
            {
                // FF2
                var array = CCIN("@mozilla.org/supports-array;1", "nsISupportsArray");
                var element = CCIN("@mozilla.org/supports-cstring;1", "nsISupportsCString");
                element.data = this.cookieFlavour;
                array.AppendElement(element);     
                return clipboard.hasDataMatchingFlavors(array, nsIClipboard.kGlobalClipboard);
            }
        }
        catch (err)
        {
            ERROR(err);
        }
        
        return false;
    },
    
    createTransferData: function(cookie)
    {
        var trans = CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");
        
        var json = cookie.toJSON();
        var wrapper1 = CCIN("@mozilla.org/supports-string;1", "nsISupportsString");
        wrapper1.data = json;
        trans.addDataFlavor(this.cookieFlavour);
        trans.setTransferData(this.cookieFlavour, wrapper1, json.length * 2);

        var str = cookie.toString();
        var wrapper2 = CCIN("@mozilla.org/supports-string;1", "nsISupportsString");
        wrapper2.data = str;
        trans.addDataFlavor(this.unicodeFlavour);
        trans.setTransferData(this.unicodeFlavour, wrapper2, str.length * 2);
        
        return trans;
    },

    getTransferData: function()
    {
        var trans = CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");
        trans.addDataFlavor(this.cookieFlavour);
        
        clipboard.getData(trans, nsIClipboard.kGlobalClipboard);

        var str = new Object();
        var strLength = new Object();

        trans.getTransferData(this.cookieFlavour, str, strLength);                    
        
        if (!str.value) 
            return null;
            
        str = str.value.QueryInterface(nsISupportsString);
        return str.data.substring(0, strLength.value / 2);
    }
});

//-----------------------------------------------------------------------------

function insertWrappedText(text, textBox)
{
    var reNonAlphaNumeric = /[^A-Za-z_$0-9'"-]/;

    var html = [];
    var wrapWidth = Firebug.textWrapWidth;

    var lines = splitLines(text);
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];
        while (line.length > wrapWidth)
        {
            var m = reNonAlphaNumeric.exec(line.substr(wrapWidth, 100));
            var wrapIndex = wrapWidth + (m ? m.index : 0);
            var subLine = line.substr(0, wrapIndex);
            line = line.substr(wrapIndex);

            html.push("<pre>");
            html.push(escapeHTML(subLine));
            html.push("</pre>");
        }

        html.push("<pre>");
        html.push(escapeHTML(line));
        html.push("</pre>");
    }

    textBox.innerHTML = html.join("");
}

// Cookie object
//-----------------------------------------------------------------------------

/**
 * This object represents a Cookie (repObject).
 */
function Cookie(cookie, action)
{
    this.cookie = cookie;
    this.action = action; 
    this.rawHost = makeStrippedHost(cookie.host);
}

Cookie.prototype = 
{
    cookie: null,
    action: null,
    
    toString: function()
    {
        var expires = this.cookie.expires ? new Date(this.cookie.expires * 1000) : null;
        return this.cookie.name + "=" + this.cookie.value +
            ((expires) ? "; expires=" + expires.toGMTString() : "") +
            ((this.cookie.path) ? "; path=" + this.cookie.path : "; path=/") +
            ((this.cookie.host) ? "; domain=" + this.cookie.host : "") +
            ((this.cookie.secure) ? "; secure" : "") + 
            ((this.cookie.isHttpOnly) ? "; HttpOnly" : "");
    },

    toJSON: function()
    {        
        return "({name: '" + this.cookie.name + "'," +
            "value: '" + escape(this.cookie.value) + "'," +
            "expires: '" + this.cookie.expires + "'," +
            "path: '" + (this.cookie.path ? this.cookie.path : "/") + "'," +
            "host: '" + this.cookie.host + "'," +
            "isHttpOnly: " + (this.cookie.isHttpOnly ? "true" : "false") + "," +
            "isSecure: " + (this.cookie.secure ? "true" : "false") + "})";
    }    
};

// Cookie Helpers
//-----------------------------------------------------------------------------

function makeStrippedHost(aHost)
{
    var formattedHost = aHost.charAt(0) == "." ? aHost.substring(1, aHost.length) : aHost;
    return formattedHost.substring(0, 4) == "www." ? formattedHost.substring(4, formattedHost.length) : formattedHost;
}

function makeCookieObject(cookie)
{
    var c = { 
        name        : cookie.name,
        value       : cookie.value,
        isDomain    : cookie.isDomain,
        host        : cookie.host,
        path        : cookie.path,
        isSecure    : cookie.isSecure,
        expires     : cookie.expires,
        isHttpOnly  : cookie.isHttpOnly
    };
    
    return c;
}

function parseFromJSON(json)
{
    return eval(json);
}

function parseFromString(string)
{
    var cookie = new Object();
    var pairs = string.split("; ");
    
    for (var i=0; i<pairs.length; i++)
    {
        var option = pairs[i].split("=");
        if (i == 0)
        {
            cookie.name = option[0];
            cookie.value = option[1];
        } 
        else
        {
            var name = option[0].toLowerCase();
            name = (name == "domain") ? "host" : name;
            if (name == "httponly")
            {
                cookie.isHttpOnly = true;
            }
            else if (name == "expires")
            {
                var value = option[1];
                value = value.replace(/-/g, " ");
                cookie[name] = Date.parse(value) / 1000;

                // Log error if the date isn't correctly parsed.
                if (FBTrace.DBG_COOKIES)
                {
                    var tempDate = new Date(cookie[name] * 1000);
                    if (value != tempDate.toGMTString())
                    {
                        FBTrace.sysout("---------> parseFromString: ERROR, " + 
                            "from: " + value + 
                            ", to: " + tempDate.toGMTString() + 
                            ", cookie: " + string + 
                            "\n");
                    }
                }
            }
            else
            {
                cookie[name] = option[1];
            }
        }
    }
    
    return cookie;
}

// Cookie Event objects
//-----------------------------------------------------------------------------

/**
 * This object represents a "cookie-changed" event (repObject). 
 * There are three types of cookie modify events: 
 * "changed", "added" and "deleted".
 * Appropriate type is specified by action parameter.
 */
function CookieChangedEvent(context, cookie, action)
{
    this.context = context;
    this.cookie = cookie;
    this.action = action;     
    this.rawHost = makeStrippedHost(cookie.host);
}

/**
 * This object represents "cleared" event, which is raised when the user
 * deletes all cookies (e.g. in the system cookies dialog).
 */
function CookieClearedEvent()
{
}

/**
 * This object represents "cookie-rejected" event, which is fired if cookies
 * from specific domain are rejected.
 */
function CookieRejectedEvent(context, uri)
{
    this.context = context;
    this.uri = uri;
}

// Base observer
//-----------------------------------------------------------------------------

var BaseObserver = 
{
	QueryInterface : function (aIID) 
	{
		if (aIID.equals(nsIObserver) ||
			aIID.equals(nsISupportsWeakReference) ||
			aIID.equals(nsISupports))
	    {
		    return this;
	    }
	    
		throw Components.results.NS_NOINTERFACE;
	}
};

// Cookie observer
//-----------------------------------------------------------------------------

var CookieObserver = extend(BaseObserver,
{
    // nsIObserver
    observe: function(aSubject, aTopic, aData) 
    {
        try {            
            if (aTopic == "cookie-changed") {
                aSubject = aSubject ? aSubject.QueryInterface(nsICookie2) : null;
                this.iterateContexts(this.onCookieChanged, aSubject, aData);
            }
            else if (aTopic == "cookie-rejected") {
                aSubject = aSubject.QueryInterface(nsIURI);
                this.iterateContexts(this.onCookieRejected, aSubject, aData);
            }
        }
        catch (err) {
            ERROR(err);
        }
    },

    iterateContexts: function(fn)
    {
        var oThis = this;
        var args = FBL.cloneArray(arguments);
        TabWatcher.iterateContexts(function(context) {
            args[0] = context;
            fn.apply(oThis, args);                
        });
    },

    /**
     * activeUri:  this object represents currently active host. Notice that there
     *             can be more active hosts (activeHosts map) on one page in case 
     *             of embedded iframes or/and previous redirects.
     *             Properties:
     *             host: www.example.com
     *             path: /subdir/
     *
     * host, path: these parameters represents a host/path of an cookie for which
     *             we are checking if it should be displayed for the active URI.
     *
     * If the method returns true the host/path belongs to the activeUri.
     */
    isHostFromURI: function(activeUri, host, path)
    {
        var pathFilter = getPref(FirebugPrefDomain, filterByPath);
        
        // Get directory path (without the file name)
        var activePath = activeUri.path.substr(0, (activeUri.path.lastIndexOf("/") || 1));        
        
        // Append slash at the end of the active path, so it mach the cookie's path
        // in the case that it has slash at the end.
        var lastChar = activePath.charAt(activePath.length - 1);
        if (lastChar != "/")
            activePath += "/";
            
        // If the path filter is on, only cookies that match given path should be displayed.
        if (pathFilter && (activePath.indexOf(path) != 0))
            return false;
        
        // The cookie must belong to given URI from this context,
        // otherwise it won't be displayed in this tab.
        var uri = makeStrippedHost(activeUri.host);
        if (uri == host)
            return true;
        
        if (uri.length < host.length)
	        return false;
		    
        var h = "." + host;
        var u = "." + uri;
        if (u.substr(u.length - h.length) == h)
            return true;
            
        return false;
    },
    
    isHostFromContext: function(context, host, path)
    {
        var location = context.window.location;
        if (location.protocol.indexOf("http") != 0)
            return false;

        var rawHost = makeStrippedHost(host);

        // Test the current main URI first.
        // The location isn't nsIURI, so make a fake object (aka nsIURI). 
        var fakeUri = {host: location.host, path: location.pathname};
        if (this.isHostFromURI(fakeUri, rawHost, path))
            return true;        

        // xxxHonza
        // If the context.cookies is not initialized, it's bad. It means that
        // neither temporary context no real context has been initialized
        // One reason is that Sript model issues panel.show in onModuleActivate
        // which consequently requests a file (double load prblem), which
        // consequently rises this cookie event.
        if (!context.cookies)
            return false;

        // Now test if the cookie doesn't belong to some of the
        // activeHosts (redirects, frames).    
        var activeHosts = context.cookies.activeHosts;
        for (var activeHost in activeHosts)
        {
            if (this.isHostFromURI(activeHosts[activeHost], rawHost, path))
                return true;
        }
        
        return false;
    },

    isCookieFromContext: function(context, cookie)
    {
        return this.isHostFromContext(context, cookie.host, cookie.path);
    },

    onCookieChanged: function(context, cookie, action)
    {
        // If the action == "cleared" the cookie is *not* set. This action is triggered
        // when all cookies are removed (cookieManager.removeAll)
        // In such a case let's displaye the event in all contexts.
        if (cookie && !this.isCookieFromContext(context, cookie))
            return;
            
        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.dumpProperties("---------> onCookieChanged: " + 
                (cookie ? cookie.name : "null") + 
                ", " + action + "\n", cookie);
        }
        
        switch(action)
        {
          case "deleted":
            this.onRemoveCookie(context, cookie);
            break;
          case "added":
            this.onAddCookie(context, cookie);
            break;
          case "changed":
            this.onUpdateCookie(context, cookie);
            break;
          case "cleared":
            this.onClear(context);
            return;
        }
    
        // If log into the Console tab is on, print "deleted", "added" and "changed" events.
        if (logEvents())
            this.logEvent(new CookieChangedEvent(context, cookie, action), context, "cookie");
    },
   
    onClear: function(context)
    {
        var panel = context.getPanel(panelName);
        panel.clear();
        
        if (logEvents())
            this.logEvent(new CookieClearedEvent(), context, "cookiesCleared");
    },
    
    onCookieRejected: function(context, uri) 
    {
        var path = uri.path.substr(0, (uri.path.lastIndexOf("/") || 1));
        if (!this.isHostFromContext(context, uri.host, path))
            return;
    
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> onCookieRejected: " + uri.spec + "\n");

        // Mark host and all its cookies as rejected.
        // xxxHonza there was an exception "context.cookies is undefined".
        var activeHost = context.cookies.activeHosts[uri.host];
        if (activeHost)
            activeHost.rejected = true;

        var receivedCookies = activeHost ? activeHost.receivedCookies : null;
        for (var i=0; receivedCookies && i<receivedCookies.length; i++)
            receivedCookies[i].cookie.rejected = true;

        // Refresh the panel asynchronously.
        context.invalidatePanels(panelName);

        // Bail out if events are not logged into the Console.    
        if (!logEvents())
            return;
            
        // The "cookies-rejected" event is send even if no cookies 
        // from the blocked site have been actually received.
        // So, the receivedCookies array can be null.
        // Don't display anything in the console in that case,
        // there could be a lot of "Cookie Rejected" events.
        // There would be actually one for each embedded request.
        if (!receivedCookies)
            return;
            
        // Create group log for list of rejected cookies.
        var groupRow = Firebug.Console.openGroup(
            [new CookieRejectedEvent(context, uri)], 
            context, "cookiesRejected", null, true, null, true);
        
        // The console can be disabled (since FB 1.2). 
        if (!groupRow)
            return;

        // It's closed by default.
        removeClass(groupRow, "opened");
        Firebug.Console.closeGroup(context, true);

        if (!receivedCookies)
        {
            // Never called due to the condition above.
            // Remove the twisty button.
            removeClass(groupRow, "logGroup");
        }
        else
        {
            // Create embedded table.
            var groupBody = groupRow.lastChild;
            var table = Templates.CookieTable.createTable(groupBody);

            // Insert all rejected cookies.
            var header = getElementByClass(table, "cookieHeaderRow");
            var tag = Templates.CookieRow.cookieTag;
            context.throttle(tag.insertRows, tag, [{cookies: receivedCookies}, header]);
        }
    },
    
    onAddCookie: function(context, cookie)
    {
        var panel = context.getPanel(panelName, true);
        var repCookie = panel ? panel.findRepObject(cookie) : null;
        if (repCookie)
        {
            this.onUpdateCookie(context, cookie);
            return;
        }
        
        if (!panel || !panel.table)
            return;
    
        var repCookie = panel ? panel.findRepObject(cookie) : null;

        cookie = new Cookie(makeCookieObject(cookie));
    
        var tbody = panel.table.lastChild;
        var parent = tbody.lastChild ? tbody.lastChild : tbody;
        var row = Templates.CookieRow.cookieTag.insertRows({cookies: [cookie]}, parent)[0];
    
        cookie.row = row;
        row.repObject = cookie;
        
        if (FBTrace.DBG_COOKIES)
            checkList(panel);
            
        //xxxHonza the new cookie should respect current sorting.
    },    
    
    onUpdateCookie: function(context, cookie)
    {
        var panel = context.getPanel(panelName, true);

        // The table doesn't have to be initialized yet.
        if (!panel || !panel.table)
            return;
            
        var repCookie = panel ? panel.findRepObject(cookie) : null;
        if (!repCookie)
        {
            this.onAddCookie(context, cookie);
            return;
        }

        repCookie.cookie = makeCookieObject(cookie);
        repCookie.rawHost = makeStrippedHost(cookie.host);
            
        var row = repCookie.row;
        var rowTemplate = Templates.CookieRow;
        
        if (hasClass(row, "opened"))
        {
            var cookieInfoBody = getElementByClass(row.nextSibling, "cookieInfoBody");
            cookieInfoBody.valuePresented = false;
            rowTemplate.updateInfo(cookieInfoBody, repCookie, context);
        }

        rowTemplate.updateRow(repCookie, context);
        
        if (FBTrace.DBG_COOKIES)
            checkList(panel);
    },
    
    onRemoveCookie: function(context, cookie)
    {
        var panel = context.getPanel(panelName, true);
        var repCookie = panel ? panel.findRepObject(cookie) : null;
        if (!repCookie)
            return;

        // Remove cookie from UI.
        var row = repCookie.row;        
        var parent = repCookie.row.parentNode;

        if (hasClass(repCookie.row, "opened"))
            parent.removeChild(row.nextSibling);
        
        if (!parent)
            return;
                       
        parent.removeChild(repCookie.row);
        
        if (FBTrace.DBG_COOKIES)
            checkList(panel);
    },
    
    logEvent: function(eventObject, context, className)
    {
        Firebug.Console.log(eventObject, context, className, null, true);
    }
});

// Preference observer 
// Used till the real context isn't available (in initContext), bug if Firebug)
//-----------------------------------------------------------------------------

function CookieTempObserver(tempContext) {
    this.tempContext = tempContext;
}

CookieTempObserver.prototype = extend(BaseObserver, {
    observe: function(subject, topic, data) {
        this.tempContext.appendCookieEvent(subject, topic, data);
    }
});

//-----------------------------------------------------------------------------

function TempContext(tabId)
{
    this.tabId = tabId;
    this.events = [];   
}

TempContext.prototype.appendCookieEvent = function(subject, topic, data)
{
    this.events.push({subject:subject, topic:topic, data:data});
}

// Preference observer
//-----------------------------------------------------------------------------

var PrefObserver = extend(BaseObserver,
{
    observe: function(aSubject, aTopic, aData) 
    {
        if (aTopic != "nsPref:changed")
            return;
            
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> observe: " + aTopic + ", " + aData + "\n");
            
        if (aData == networkPrefDomain + "." + cookieBehaviorPref || 
            aData == networkPrefDomain + "." + cookieLifeTimePref) {
            var fn = Firebug.FireCookieModel.Perm.updatePermButton;
            TabWatcher.iterateContexts(fn);
        }
    }
});

// Permission observer
//-----------------------------------------------------------------------------

var PermissionObserver = extend(BaseObserver,
{
    observe: function(aSubject, aTopic, aData) 
    {
        if (aTopic != "perm-changed")
            return;
        
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> observe: " + aTopic + ", " + aData + "\n");
        
        var fn = Firebug.FireCookieModel.Perm.updatePermButton;
        TabWatcher.iterateContexts(fn);
    }
});

// HTTP observer
//-----------------------------------------------------------------------------

var HttpObserver = extend(BaseObserver,
{
    // nsIObserver
    observe: function(aSubject, aTopic, aData) 
    {
        try  {
            aSubject = aSubject.QueryInterface(nsIHttpChannel);
            if (aTopic == "http-on-modify-request") {
                this.onModifyRequest(aSubject);
            } else if (aTopic == "http-on-examine-response") {
                this.onExamineResponse(aSubject);
            }
        }
        catch (err) {
            ERROR(err);
        }
    },
  
    onModifyRequest: function(request) 
    {
        var name = request.URI.spec;
        var origName = request.originalURI.spec;
        var tabId = getTabIdForRequest(request);
        var win = getWindowForRequest(request);
    
        // Firebus's natures is to display information for a tab. So, if there 
        // is no tab associated then end.
        if (!tabId)
            return;

        // Dump debug information to the console.
        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("---------> onModifyRequest: " + request.name + "\n"); 
            FBTrace.sysout("---------> Cookies sent: " + 
                cookieService.getCookieString(request.URI, request) + "\n"); 
        }

        // At this moment (specified by all the conditions) FB context doesn't exists yet.
        // But the page already started loading and there are things to monitor.
        // This is why the temporary context is created. It's used as a place where to 
        // store information (cookie events and hosts). All this info will be copied into
        // the real FB context when it's created (see initContext).
        if ((request.loadFlags & nsIHttpChannel.LOAD_DOCUMENT_URI) &&
            (request.loadGroup && request.loadGroup.groupObserver) &&
            (name == origName) && (win == win.parent))
        {
            if (FBTrace.DBG_COOKIES && contexts[tabId])
                FBTrace.sysout("---------> !!! Temporary context exists for: " + tabId + "\n");             

            // Create temporary context
            if (!contexts[tabId]) 
            {
                var tempContext = new TempContext(tabId);
                contexts[tabId] = tempContext;
                Firebug.FireCookieModel.initTempContext(tempContext);
            }
        }        

        // Use the temporary context first, if it exists. There could be an old
        // context (associated with this tab) for the previous URL.
        var context = contexts[tabId];
        context = context ? context : TabWatcher.getContextByWindow(win);
        
        // Collect all the host (redirects, iframes) as cookies for all of them 
        // will be displayed.
        var activeHosts = context.cookies.activeHosts;
        var host = request.URI.host;
        if (!activeHosts[host])
        {
            activeHosts[host] = {host: host, path: request.URI.path};
        
            if (FBTrace.DBG_COOKIES) 
            {
                FBTrace.sysout("---------> New host (on-modify-request): " + 
                    request.URI.host + ", tabId: " + tabId + "\n");

                var hostList = "";
                for (var host in activeHosts)
                    hostList += host + ", ";
                FBTrace.dumpProperties("---------> Active host list: " + hostList + "\n",
                    activeHosts);
            }

            // Refresh the panel asynchronously.
            if (context instanceof Firebug.TabContext)
                context.invalidatePanels(panelName);
        }
    },

    onExamineResponse: function(request) 
    {
        var tabId = getTabIdForRequest(request);
        if (!tabId)
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("---------> onExamineResponse: " + request.name + "\n"); 
            
        if (!logEvents()) 
            return;
            
        // If logging to console is on, remember the set-cookie string, so
        // these cookies can be displayed together e.g. with rejected message.
        var setCookie;            
        request.visitResponseHeaders({
            visitHeader: function(header, value) {
                if (header == "Set-Cookie")
                    setCookie = value;
            }
        });

        // Bail out if no cookies is received.
        if (!setCookie)
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.dumpProperties("---------> Set-Cookie: " + setCookie + "\n", request);

        // Try to get the context from the contexts array first. The TabWatacher
        // could return context for the previous page in this tab.
        var context = contexts[tabId];
        var win = getWindowForRequest(request);
        context = context ? context : TabWatcher.getContextByWindow(win);
            
        // Associate the setCookie string with proper active host (active
        // host can be the page itself or an embedded iframe or a XHR).
        // Also remember originalURI so, the info where the cookies comes
        // from can be displayed to the user.
        var activeHosts = context.cookies.activeHosts;
        var host = request.URI.host;
        var activeHost = activeHosts[host];
        
        // Map of all received cookies. The key is cookie-host the value is 
        // an array with all cookies with the same host.
        if (!context.cookies.activeCookies)
            context.cookies.activeCookies = [];

        var activeCookies = context.cookies.activeCookies;

        // xxxHonza 
        // 1)the activeHost.receivedCookies array shouldn't be recreated 
        // if it's already there.
        // 2) There can be more responses from the same domain (XHRs) and so,
        // more received cookies within the page life.
        // 3) The list should make sure that received cookies aren't duplicated.
        // (the same cookie can be received multiple time).
        // 4) Also, rejected cookies, are displayed in the cookie-list too and
        // these shouldn't be duplicated.
        // 5) This should be a map (key == the original host)
        //if (!activeHost.receivedCookies)
            activeHost.receivedCookies = [];

        // Parse all received cookies and store them into activeHost info.
        var cookies = setCookie.split("\n");
        for (var i=0; i<cookies.length; i++)
        {
            var cookie = parseFromString(cookies[i]);
            cookie.originalURI = request.originalURI;
            if (!cookie.host)
                cookie.host = host;

            // Push into activeHosts
            var cookieWrapper = new Cookie(cookie);
            activeHost.receivedCookies.push(cookieWrapper);
            
            // Push into activeCookies
            if (!activeCookies[cookie.host])
                activeCookies[cookie.host] = [];
            activeCookies[cookie.host].push(cookieWrapper);

            if (FBTrace.DBG_COOKIES) 
            {
                FBTrace.dumpProperties("---------> Cookie received: " + 
                    cookie.host + ", cookie: " + cookie.name + "\n", cookie);
            }
        }
    }
});

// Debug helpers
//-----------------------------------------------------------------------------

function checkList(panel)
{
    if (!FBTrace.DBG_COOKIES) 
        return;
        
    if (!panel || !this.panelNode)
        return; 
        
    var row = getElementByClass(this.panelNode, "cookieRow");
    while (row) 
    {
        var rep = row.repObject;
        if ((rep.cookie.name != row.firstChild.firstChild.innerHTML) ||
            (rep.cookie.path != row.childNodes[3].firstChild.innerHTML))
        {
            FBTrace("---> Check failed!\n");
            FBTrace("--->" + rep.rawHost + ", " + rep.cookie.name + ", " + 
                rep.cookie.path + "\n");
            FBTrace("    " + row.firstChild.firstChild.innerHTML + ", " + 
                row.childNodes[3].firstChild.innerHTML + "\n");
        }
                                                    
        row = row.nextSibling;
    }

    return null;
}

// Window helpers
//-----------------------------------------------------------------------------

function getWindowForRequest(request) 
{
    var webProgress = getRequestWebProgress(request);
    return webProgress ? safeGetWindow(webProgress) : null;
}

function getTabIdForRequest(request) 
{
    try {
        if (request.notificationCallbacks) 
        {
            var interfaceRequestor = request.notificationCallbacks.QueryInterface(
                nsIInterfaceRequestor);

            try {
                var win = interfaceRequestor.getInterface(nsIDOMWindow);
                var tabId = getTabIdForWindow(win);
                if (tabId)  
                    return tabId;
            } 
            catch (err) { }
        }

        var progress = getRequestWebProgress(request);
        var win = safeGetWindow(progress);
        return getTabIdForWindow(win);
    }
    catch (err) {
        ERROR(err);
    }

    return null;
}

function getTabIdForWindow(aWindow)
{
    aWindow = getRootWindow(aWindow);

    if (!aWindow || !tabBrowser.getBrowserIndexForDocument)
        return null;

    try {
        var targetDoc = aWindow.document;

        var tab = null;
        var targetBrowserIndex = tabBrowser.getBrowserIndexForDocument(targetDoc);

        if (targetBrowserIndex != -1)
        {
            tab = tabBrowser.tabContainer.childNodes[targetBrowserIndex];
            return tab.linkedPanel;
        }
    } catch (ex) {}

    return null;
}

function getRequestWebProgress(request) 
{
    try
    {
        if (request.notificationCallbacks)
            return request.notificationCallbacks.getInterface(nsIWebProgress);
    } catch (exc) {}

    try
    {
        if (request.loadGroup && request.loadGroup.groupObserver)
            return QI(request.loadGroup.groupObserver, nsIWebProgress);
    } catch (exc) {}

    return null;
}

function safeGetWindow(webProgress) 
{
    try {
        return webProgress.DOMWindow;
    }
    catch (ex) {
        return null;
    }
}

// Time Helpers
//-----------------------------------------------------------------------------

function now()
{
    return (new Date()).getTime();
}

// Array Helpers
//-----------------------------------------------------------------------------

function cloneMap(map)
{
    var newMap = [];
    for (var item in map)
        newMap[item] = map[item];
        
    return newMap;
}

// Preference Helpers
//-----------------------------------------------------------------------------

// This functions are different in 1.05 and 1.2
// So, this is a stable version.
function getPref(prefDomain, name)
{
    var prefName = prefDomain + "." + name;

    var type = prefs.getPrefType(prefName);
    if (type == nsIPrefBranch.PREF_STRING)
        return prefs.getCharPref(prefName);
    else if (type == nsIPrefBranch.PREF_INT)
        return prefs.getIntPref(prefName);
    else if (type == nsIPrefBranch.PREF_BOOL)
        return prefs.getBoolPref(prefName);
}

function setPref(prefDomain, name, value)
{
    var prefName = prefDomain + "." + name;

    var type = prefs.getPrefType(prefName);
    if (type == nsIPrefBranch.PREF_STRING)
        prefs.setCharPref(prefName, value);
    else if (type == nsIPrefBranch.PREF_INT)
        prefs.setIntPref(prefName, value);
    else if (type == nsIPrefBranch.PREF_BOOL)
        prefs.setBoolPref(prefName, value);
}

function logEvents()
{
    return getPref(FirebugPrefDomain, "firecookie.logEvents");
}

// Registration Helpers
//-----------------------------------------------------------------------------

function registerCookieObserver(observer) {
    observerService.addObserver(observer, "cookie-changed", false);
    observerService.addObserver(observer, "cookie-rejected", false);    
    return observer;
}

function unregisterCookieObserver(observer) {
    observerService.removeObserver(observer, "cookie-changed");
    observerService.removeObserver(observer, "cookie-rejected");
}

// Support for FBTraceConsole in Firebug 1.3
//-----------------------------------------------------------------------------

Firebug.FireCookieModel.TraceListener = 
{
    onLoadConsole: function(win, rootNode)
    {
        var doc = rootNode.ownerDocument;
        var styleSheet = createStyleSheet(doc, 
            "chrome://firecookie/skin/firecookieTrace.css");
        styleSheet.setAttribute("id", "fcCookieLogs");
	    addStyleSheet(doc, styleSheet);
    },

    onDump: function(message)
    {
        var index = message.text.indexOf("--------->");
        if (index == 0)
        {
            message.text = message.text.substr("--------->".length);
            message.text = trimLeft(message.text);
            message.type = "DBG_COOKIES";
        }
    }
};

// Firebug Registration
//-----------------------------------------------------------------------------

Firebug.registerPanel(FireCookiePanel);
Firebug.registerModule(Firebug.FireCookieModel);

Firebug.registerRep(
    Templates.CookieTable,          // Cookie table with list of cookies
    Templates.CookieRow,            // Entry in the cookie table
    Templates.CookieChanged,        // Console: "cookie-changed" event
    Templates.CookieRejected,       // Console: "cookie-rejected" event
    Templates.CookieCleared         // Console: cookies "cleared" event
);

//-----------------------------------------------------------------------------

FBTrace.DBG_COOKIES = getPref(FirebugPrefDomain, "DBG_COOKIES");

//-----------------------------------------------------------------------------
}})
