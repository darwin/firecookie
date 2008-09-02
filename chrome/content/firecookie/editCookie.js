/* See license.txt for terms of usage */

with (FBL) { 

//-----------------------------------------------------------------------------

const cookieManager = CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");
const cookieService = CCSV("@mozilla.org/cookieService;1", "nsICookieService");
const ioService = CCSV("@mozilla.org/network/io-service;1", "nsIIOService");

var EditCookie = 
{
    cookie: null,
    
    onLoad: function()
    {
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
            this.onSession();
        }
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
        
        if (!isSession)
        {
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
        
        if (!this.expireNode.disabled && !this.expireNode.value)
        {
            var now = new Date();
            now.setTime(now.getTime() + (2*60*60*1000));
            this.expireNode.value = now.toGMTString();      
        }
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
    }
}

//-----------------------------------------------------------------------------
}