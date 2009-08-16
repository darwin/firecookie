/* See license.txt for terms of usage */

var FBTestFireCookie = FBTest.FireCookie = {};

// Performed in every test when this file is loaded.
Components.classes["@mozilla.org/cookiemanager;1"]
    .getService(Components.interfaces.nsICookieManager).removeAll();

(function() {

// ************************************************************************************************
// Constants

var winWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);

// ************************************************************************************************
// Firecookie testing APIs

this.enableCookiePanel = function(callback)
{
    FBTestFirebug.updateModelState(FW.Firebug.FireCookieModel, callback, true);
};

this.getCookieRowByName = function(panelNode, cookieName)
{
    var cookieRows = FW.FBL.getElementsByClass(panelNode, "cookieRow");
    for (var i=0; i<cookieRows.length; i++)
    {
        var row = cookieRows[i];
        var label = FW.FBL.getElementsByClass(row, "cookieNameLabel");
        if (label.length != 1)
            return null;

        if (label[0].textContent == cookieName)
            return row; 
    }
    return null;
};

this.getCookieByName = function(panelNode, cookieName)
{
    var row = this.getCookieRowByName(panelNode, cookieName);
    return row ? row.repObject : null;
};

/**
 * Remove specified cookie by name.
 * @param {String} Name of the cookie to be removed.
 */
this.removeCookie = function(host, name, path)
{
    FW.Firebug.FireCookieModel.removeCookie(host, name, path);
}

/**
 * Opens editCookie.xul dialog. Since the dialog is modal, the method returns
 * after its closed. Use callback to close the dialog.
 * 
 * @param {Object} cookie Cookie beeing edited
 * @param {Object} callback Callback for dialog manipulation.
 */
this.editCookie = function(cookie, callback)
{
    var watcherObserver =
    {
        observe: function(subject, topic, data)
        {
            if (topic == "domwindowopened")
            {
                winWatcher.unregisterNotification(watcherObserver);
                setTimeout(function()
                {
                    var dialog = subject.QueryInterface(Ci.nsIDOMWindow);
                    FBTest.compare("chrome://firecookie/content/editCookie.xul",
                        dialog.document.location.href, "The editCookie.xul is opened.");
                    FBTest.ok(dialog.EditCookie, "The EditCookie varible must exist");
                    callback(dialog);
                }, 300);
            }
        }
    };

    winWatcher.registerNotification(watcherObserver);
    return FW.Firebug.FireCookieModel.Templates.CookieRow.onEdit(cookie);
};

// ************************************************************************************************
}).apply(FBTest.FireCookie);
