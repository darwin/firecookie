/* See license.txt for terms of usage */

with (FBL) { 

//-----------------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;

const cookieManager = CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");
const cookieService = CCSV("@mozilla.org/cookieService;1", "nsICookieService");
const ioService = CCSV("@mozilla.org/network/io-service;1", "nsIIOService");
const versionChecker = CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
const appInfo = CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");

var EditCookie = 
{
    cookie: null,
    
    onLoad: function()
    {
        // Use new <datepicker> and <timepicker> XUL elements (introduced in Firefox 3)
        if (versionChecker.compare(appInfo.version, "3.0*") >= 0)
            this.replaceDateTimeField();

        var params = window.arguments[0];
        this.params = params;
        this.cookie = params.cookie;

        this.nameNode = $("fcName");
        this.valueNode = $("fcValue");
        this.domainNode = $("fcDomain");
        this.pathNode = $("fcPath");
        this.expireNode = $("fcExpire");
        this.sessionNode = $("fcSession");
        this.secureNode = $("fcSecure");
        this.httpOnly = $("fcHttpOnly");
        
        this.nameNode.value = this.cookie.name;
        this.valueNode.value = this.cookie.value;
        this.domainNode.value = this.cookie.host;
        this.pathNode.value = this.cookie.path;
        this.secureNode.checked = this.cookie.isSecure;
        this.httpOnly.checked = this.cookie.isHttpOnly;

        if (this.cookie.expires)
        {
            var expires = new Date(this.cookie.expires * 1000);
            this.expireNode.value = expires.toGMTString();
        }
        else
        {
            this.sessionNode.checked = true;

            // Set default value for expire time if the cookie doesn't have it.
            if (!this.expireNode.value)
            {
                var expireTime = Firebug.FireCookieModel.getDefaultCookieExpireTime();
                var expires = new Date(expireTime * 1000);
                this.expireNode.value = expires.toGMTString();
            }
        }

        // Update expire date-time picker.
        this.onSession();
    },
    
    onOK: function()
    {
        var name = this.nameNode.value;
        var value = this.valueNode.value;
        var path = this.pathNode.value;
        var domain = this.domainNode.value;
        var isSecure = this.secureNode.checked;
        var isHttpOnly = this.httpOnly.checked;
        var isSession = this.sessionNode.checked;
        var isDomain = (domain.charAt(0) == ".");
        var expires = null;

        // xxxHonza: Notice that if the user sets the session flag, the cookie
        // will be immediately removed.
        if (!isSession)
        {
            // If it isn't a session cookie set the proper expire time.
            expires = new Date();
            expires.setTime(Date.parse(this.expireNode.value));          
            expires = Math.floor(expires.valueOf() / 1000);
        }

        if (!this.checkValues())
            return;
           
        // Create URI                    
        var httpProtocol = isSecure ? "https://" : "http://";
        var uri = ioService.newURI(httpProtocol + domain + path, null, null);
        		
        // Create/modify cookie.
        // Fix Issue #2 - contribution by arantius
        // cookieService.setCookieString(uri, null, cookieString, null);
        cookieManager.add(domain, path, name, value, isSecure, isHttpOnly, 
            isSession, expires);

        // Close dialog.                
        window.close();
    },
    
    checkValues: function()
    {
        var name = this.nameNode.value;
        if (!name)
        {
            // xxxHonza localization
            alert("Cookie name is not valid.");
            return false;
        }
        
        var path = this.pathNode.value;
        var domain = this.domainNode.value;
        if (!this.checkUrl(domain, path))
        {
            // xxxHonza localization
            alert("Host URI is not valid.");
            return false;
        }
        
        return true;
    },
    
    onCancel: function()
    {
        window.close();
    },
 
    onSession: function()
    {
        this.expireNode.disabled = this.sessionNode.checked;
    },
    
    checkUrl: function(host, path)
    {
	    try {
 		    var uri = "http://" + host + "/";
 		    var newUri = ioService.newURI(uri, null, null);
	    }
 		catch (err) {
            return false;
 		}

		try {
 		    var uri = "http://" + host + "/" + path;
 		    var newUri = ioService.newURI(uri, null, null);
		} 
		catch(err) {
            return false;
		}

        return true;    	
    },

    replaceDateTimeField: function()
    {
        // Remove the old text field.
        var expireBox = document.getElementById("fcExpireBox");
        while (expireBox.childNodes.length)
            expireBox.removeChild(expireBox.lastChild);

        // Create new element for date time picking.
        var dateTimePicker = document.createElement("dateTimePicker");
        dateTimePicker.id = "fcExpire";
        expireBox.appendChild(dateTimePicker);
    },

    getChromeWindow: function()
    {
        return window.QueryInterface(Ci.nsIInterfaceRequestor)
           .getInterface(Ci.nsIWebNavigation).QueryInterface(Ci.nsIDocShellTreeItem)
           .rootTreeItem.QueryInterface(Ci.nsIInterfaceRequestor)
           .getInterface(Ci.nsIDOMWindow); 
    }
}

//-----------------------------------------------------------------------------

const Firebug = EditCookie.getChromeWindow().Firebug;

//-----------------------------------------------------------------------------
}