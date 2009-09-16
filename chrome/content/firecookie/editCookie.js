/* See license.txt for terms of usage */

with (FBL) {

//-----------------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;

const ioService = CCSV("@mozilla.org/network/io-service;1", "nsIIOService");
const versionChecker = CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
const appInfo = CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
const windowMediator = CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");

//-----------------------------------------------------------------------------

var FBTrace = { sysout: function() {} };

/**
 * @dialog Edit cookie dialog implementation. This dialog is used to create a new cookie
 * and edit an existing cookies.
 */
var EditCookie = 
{
    cookie: null,

    onLoad: function()
    {
        this.initFBTrace();
        this.createDateTimeField();

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

        // Fix for issue 39: decode cookie name and value for usage in the dialog.
        // It'll be encoded again when OK is pressed.
        // Don't escape using encodeURIComponent sinc "+" would be changed, but 
        // it's valid replacement for space.
        // This is also necessary for issue 45.
        this.nameNode.value = unescape(this.cookie.name);
        this.valueNode.value = unescape(this.cookie.rawValue);

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

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.EditCookie.onLoad; default expire time: " +
                    this.expireNode.value);

            // Set default value for expire time (current time + some time, see prefs 
            // defaultInterval) so, the cookie doesn't disappear if the session box 
            // is just unchecked.

            // xxxHonza: the default time is always set to the current time.
            //if (!this.expireNode.value)
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
        if (!this.checkValues())
            return;

        var isSession = this.sessionNode.checked;
        var host = this.domainNode.value;

        // Fix for issue 39: Can't create cookies with ';' in the name
        // According to the spec cookie name and cookie value must be escaped.
        var cookieName = escape(this.nameNode.value);
        var cookieValue = escape(this.valueNode.value);

        // Create a helper cookie object from the provided data.
        var values = {
            name: cookieName,
            rawValue: cookieValue,
            path: this.pathNode.value,
            host: host,
            isSecure: this.secureNode.checked,
            isHttpOnly: this.httpOnly.checked,
            isDomain: (host.charAt(0) == "."),
            expires: null // is computed below
        };

        // will be immediately removed.
        if (!isSession)
        {
            // If it isn't a session cookie set the proper expire time.
            var expires = new Date();
            expires.setTime(Date.parse(this.expireNode.value));
            values.expires = Math.floor(expires.valueOf() / 1000);
        }

        // Create/modify cookie.
        var cookie = new Firebug.FireCookieModel.Cookie(values);
        Firebug.FireCookieModel.createCookie(cookie);

        // Close dialog.
        window.close();
    },

    /**
     * Verify values before the OK button is pressed.
     */
    checkValues: function()
    {
        var name = this.nameNode.value;
        if (!name)
        {
            alert(Firebug.FireCookieModel.$FC_STR("firecookie.edit.invalidname"));
            return false;
        }

        var domain = this.domainNode.value;
        if (!this.checkHost(domain))
        {
            alert(Firebug.FireCookieModel.$FC_STR("firecookie.edit.invalidhost"));
            return false;
        }

        var path = this.pathNode.value;
        if (!this.checkPath(domain, path))
        {
            alert(Firebug.FireCookieModel.$FC_STR("firecookie.edit.invalidpath"));
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

    checkHost: function(host)
    {
        if (!host)
            return false;

        try 
        {
            var uri = "http://" + host + "/";
            return ioService.newURI(uri, null, null) ? true : false;
        }
        catch (err) {
        }

        return false;
    },

    checkPath: function(host, path)
    {
        if (!path)
            return false;

        try {
            var uri = "http://" + host + "/" + path;
            return ioService.newURI(uri, null, null) ? true : false;
        } 
        catch(err) {
        }

        return false;
    },

    createDateTimeField: function()
    {
        // Get the box element where the dateTime field should be located.
        var expireBox = document.getElementById("fcExpireBox");

        var dateTimeField = null;
        if (versionChecker.compare(appInfo.version, "3.0*") >= 0)
        {
            // Use new <datepicker> and <timepicker> XUL elements (introduced in Firefox 3)
            dateTimeField = document.createElement("dateTimePicker");
        }
        else
        {
            // Use simple text field with GMT time format.
            dateTimeField = document.createElement("textbox");
            dateTimeField.setAttribute("cols", "12");
            dateTimeField.setAttribute("flex", "1");
        }

        // Append it into the UI.
        dateTimeField.id = "fcExpire";
        expireBox.appendChild(dateTimeField);
    },

    getChromeWindow: function()
    {
        return windowMediator.getMostRecentWindow("navigator:browser");
    },

    initFBTrace: function()
    {
        try
        {
            // Get tracing service from firebug. Notice that this service doesn't
            // have to necessarily exist. The wrapped object is used here to access
            // sysout method implemeted by the service. Firebug doesn't define new
            // IDL files and so methods are accessed through wrappedJSObject.
            FBTrace = Cc["@joehewitt.com/firebug-trace-service;1"]
                .getService(Ci.nsISupports)
                .wrappedJSObject.getTracer("extensions.firebug");
        }
        catch (err)
        {
        }
    }
}

//-----------------------------------------------------------------------------

// Some APIs from Firebug.FireCookieModel namespase are used here.
var Firebug = EditCookie.getChromeWindow().Firebug;

//-----------------------------------------------------------------------------
}
